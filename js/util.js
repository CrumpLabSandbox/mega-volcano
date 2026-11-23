// Shared helpers for canvas-2D engines: seeded randomness, value noise, colour, puff sprites, sky and lava colour.

export const clamp = (v, lo = 0, hi = 1) => v < lo ? lo : v > hi ? hi : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
export const fract = x => x - Math.floor(x);
export const wrap = (x, lo, hi) => { const r = hi - lo; return ((((x - lo) % r) + r) % r) + lo; };

// mulberry32: deterministic random stream from an integer seed
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export const hash = (x, y = 0, z = 0) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

export function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy), b = hash(ix + 1, iy), c = hash(ix, iy + 1), d = hash(ix + 1, iy + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}
export function noise3(x, y, z) {
  const iz = Math.floor(z), fz = z - iz, u = fz * fz * (3 - 2 * fz);
  return lerp(noise2(x + iz * 17.13, y + iz * 31.7), noise2(x + (iz + 1) * 17.13, y + (iz + 1) * 31.7), u);
}
export function fbm2(x, y, oct = 4) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x, y); n += a; x = x * 2.03 + 17.1; y = y * 2.03 + 9.7; a *= 0.5; }
  return s / n;
}
export function fbm3(x, y, z, oct = 4) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x, y, z); n += a; x = x * 2.03 + 17.1; y = y * 2.03 + 9.7; z *= 2.03; a *= 0.5; }
  return s / n;
}

export function hsl(h, s, l, a = 1) { return `hsla(${(h % 360 + 360) % 360},${s}%,${l}%,${a})`; }
export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = lerp(pa >> 16, pb >> 16, t), g = lerp(pa >> 8 & 255, pb >> 8 & 255, t), bl = lerp(pa & 255, pb & 255, t);
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
}

// A soft round puff, pre-rendered once per colour and size, for particle clouds. Cached.
const puffCache = new Map();
export function puff(color = '255,255,255', size = 128, hardness = 0.35) {
  const key = color + '|' + size + '|' + hardness;
  if (puffCache.has(key)) return puffCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), r = size / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, `rgba(${color},1)`); grd.addColorStop(hardness, `rgba(${color},0.8)`);
  grd.addColorStop(0.75, `rgba(${color},0.25)`); grd.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  puffCache.set(key, c);
  return c;
}

// Off-screen canvas helper (low-res buffers for pixel art, masks, etc.)
export function buffer(w, h) {
  const c = document.createElement('canvas'); c.width = Math.max(1, w | 0); c.height = Math.max(1, h | 0);
  return { canvas: c, ctx: c.getContext('2d') };
}

// Wind control → direction vector (0.5 = blowing right; full turn across the range)
export const windDir = w => { const a = (w - 0.5) * Math.PI * 2; return [Math.cos(a), Math.sin(a)]; };
// Horizontal drift sign from the wind control: left half blows left, right half blows right.
export const windX = w => Math.cos((w - 0.5) * Math.PI * 2);

// Sky gradient helper for 2D engines: light 0 = night, 0.25 = dawn/dusk, 1 = noon.
export function skyGradient(ctx, w, h, light, top, bottom) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  if (top && bottom) { g.addColorStop(0, top); g.addColorStop(1, bottom); }
  else {
    const day = clamp(light);
    const dusk = Math.max(0, 1 - Math.abs(day - 0.3) / 0.2);
    const tl = lerp(6, 55, day), bl = lerp(10, 82, day);
    g.addColorStop(0, hsl(lerp(230, 210, day), lerp(50, 70, day), tl));
    g.addColorStop(0.7, hsl(lerp(220, 200, day) - dusk * 180, lerp(40, 60, day) + dusk * 30, lerp(tl, bl, 0.7) + dusk * 10));
    g.addColorStop(1, hsl(lerp(210, 195, day) - dusk * 175, lerp(40, 50, day) + dusk * 40, bl + dusk * 5));
  }
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

// ---- volcano helpers

export { life, STAGES } from './life.js';

// The sky behind a side-on scene. In a cloud combo (f.combo) the sky must be left transparent so the Mega-Clouds
// layer shows through: this clears instead of painting. Pass your own painter, or get the default gradient.
export function sky(f, paint) {
  const { ctx, w, h } = f;
  if (f.combo) { ctx.clearRect(0, 0, w, h); return false; }
  if (paint) paint(ctx, w, h); else skyGradient(ctx, w, h, f.p.light);
  return true;
}

// Glowing lava colour from a temperature 0..1 (0 = black crust, ~0.35 dull red, 0.7 orange, 1 yellow-white).
export function lavaRGB(t) {
  t = clamp(t);
  const r = clamp(t * 2.4) * 255, g = clamp((t - 0.32) * 1.9) * 235, b = clamp((t - 0.78) * 4) * 210;
  return [r + 18 * (1 - t), g + 12 * (1 - t), b + 12 * (1 - t)];
}
export const lavaCss = (t, a = 1) => { const [r, g, b] = lavaRGB(t); return `rgba(${r | 0},${g | 0},${b | 0},${a})`; };

// Sea and sun from the Light control: 0 night, ~0.3 golden hour, 1 noon.
export function daylight(light) {
  const day = clamp(light), dusk = Math.max(0, 1 - Math.abs(day - 0.3) / 0.2), night = 1 - smooth(0, 0.25, day);
  return { day, dusk, night };
}

// Eruption strength: the island's life cycle times the Activity control (0.5 = natural, 1 = double).
export const eruptAmount = f => clamp(f.life.erupt * f.p.activity * 2, 0, 2);
