// Shared side-on island geometry for the illustrative 2D engines (cartoon, woodblock, papercut, poster).
// Not an engine. Everything here is a pure function of the frame, so first frames and slider jumps are clean.
import { clamp, lerp, smooth, rng, noise2, hash, fract, windX, eruptAmount, life } from '../util.js';

export const TAU = Math.PI * 2;

// Per-epoch personality of the island (asymmetry, cinder cones, valley pattern, motu placement).
const seedCache = new Map();
export function islandSeed(epoch) {
  if (seedCache.has(epoch)) return seedCache.get(epoch);
  const R = rng(Math.imul(epoch + 1, 2654435761) ^ 0x9e3779b9);
  const cones = [];
  for (let i = 0; i < 3; i++) cones.push({ u: (0.14 + R() * 0.3) * (i === 1 ? -1 : 1) * (i === 2 && R() < 0.5 ? -1 : 1), w: 0.05 + R() * 0.04, h: 0.05 + R() * 0.05 });
  const motu = [];
  for (let i = 0; i < 5; i++) motu.push({ side: i % 2 ? -1 : 1, off: (R() - 0.5) * 0.08, w: 0.03 + R() * 0.05, palms: 1 + (R() * 3 | 0) });
  const S = { asym: (R() - 0.5) * 0.4, phase: R() * 100, cones, motu, rift: R() < 0.5 ? -1 : 1, vfreq: 5 + R() * 3, tilt: (R() - 0.5) * 0.1 };
  seedCache.set(epoch, S);
  return S;
}

// Height of the edifice surface (units: 0 = sea level, 1 = tallest shield, -1 = sea floor) at u (half-widths from centre).
export function heightFn(L, S) {
  const s = L.stage;
  const E = L.height + 1;
  const Wu = lerp(0.3, 1, smooth(0, 0.45, s));
  const k = lerp(1.15, 0.6, smooth(0.14, 0.45, s));
  const cald = L.caldera * 0.16;
  const cone = smooth(0.5, 0.56, s) * (1 - 0.7 * smooth(0.62, 0.95, s));
  const tuff = smooth(0.13, 0.19, s) * (1 - smooth(0.26, 0.42, s)) * 0.1;
  const ero = L.erosion;
  return u => {
    const v = u / Wu * (1 + S.asym * u);
    const a = Math.max(0, 1 - Math.abs(v));
    let y = -1 + E * Math.pow(a, k);
    if (tuff > 0) y += tuff * Math.pow(Math.max(0, 1 - Math.abs(v) / 0.14), 1.3);
    if (cald > 0) y -= cald * smooth(0.17, 0.07, Math.abs(v));
    if (cone > 0) for (const c of S.cones) { const d = Math.abs(v - c.u) / c.w; if (d < 1) y += cone * c.h * Math.pow(1 - d * d, 1.5); }
    if (ero > 0 && y > 0) { const n = noise2(v * S.vfreq + S.phase, 0.3); y -= ero * 0.55 * y * n * n * n * 2; }
    return y;
  };
}

function crossings(H, lo, hi, n = 160) {
  let uL = null, uR = null, prev = H(lo);
  for (let i = 1; i <= n; i++) {
    const u = lo + (hi - lo) * i / n, y = H(u);
    if (uL === null && prev <= 0 && y > 0) uL = u; if (prev > 0 && y <= 0) uR = u;
    prev = y;
  }
  return uL !== null && uR !== null ? [uL, uR] : null;
}

// Screen geometry for the frame. o.horizon = sea-level y as a fraction of h; o.aspect = half-width per height unit.
export function island(f, o = {}) {
  const { w, h, p } = f, L = f.life, S = islandSeed(f.epoch);
  const sea = h * (o.horizon ?? 0.6);
  const unit = h * lerp(0.24, 0.5, p.scale) * (o.unit ?? 1);
  const hw = unit * (o.aspect ?? 2.1);
  const cx = w * (o.cx ?? 0.5);
  const H = heightFn(L, S);
  const X = u => cx + u * hw, Y = u => sea - H(u) * unit;
  const shore = L.height > 0 ? crossings(H, -1.3, 1.3) : null;
  const reefU = crossings(heightFn(life(Math.min(L.stage, 0.68)), S), -1.3, 1.3) || [-0.6, 0.6];
  return { w, h, sea, floor: sea + unit, unit, hw, cx, H, X, Y, shore, reefU, L, S, A: eruptAmount(f), summit: { x: X(0), y: Y(0) }, wind: windX(p.wind) };
}

// What the volcano is doing right now, 0..~2 each (Activity folded in).
export function eruption(f, isl) {
  const L = f.life, s = L.stage, A = isl.A, above = 1 - L.submarine;
  const flows = above * smooth(0.21, 0.28, s) * (1 - smooth(0.5, 0.58, s)) * A;
  return {
    A, above,
    bubbles: L.submarine * A,
    jets: L.steam * A,
    steam: L.steam * A,
    fountain: above * (1 - L.steam) * smooth(0.19, 0.26, s) * (1 - smooth(0.5, 0.62, s)) * A,
    flows,
    entry: flows * (isl.shore ? 1 : 0),
    burst: smooth(0.5, 0.53, s) * (1 - smooth(0.58, 0.63, s)) * A,
    glow: above * (1 - L.steam) * (1 - smooth(0.58, 0.66, s)) * A,
    quiet: smooth(0.6, 0.68, s),
  };
}

// Trace the surface as a path from u0 to u1 and close it down to yClose.
export function surfacePath(ctx, isl, u0, u1, yClose, n = 90) {
  ctx.moveTo(isl.X(u0), yClose);
  for (let i = 0; i <= n; i++) { const u = u0 + (u1 - u0) * i / n; ctx.lineTo(isl.X(u), isl.Y(u)); }
  ctx.lineTo(isl.X(u1), yClose);
  ctx.closePath();
}

// A band that follows the surface: from the surface between u0..u1, back along the surface pushed down by `depth` px.
export function contourPath(ctx, isl, u0, u1, depth, n = 40) {
  for (let i = 0; i <= n; i++) { const u = u0 + (u1 - u0) * i / n; i ? ctx.lineTo(isl.X(u), isl.Y(u)) : ctx.moveTo(isl.X(u), isl.Y(u)); }
  for (let i = n; i >= 0; i--) { const u = u0 + (u1 - u0) * i / n; ctx.lineTo(isl.X(u), isl.Y(u) + depth); }
  ctx.closePath();
}

// A tapered cap over the summit (fresh tephra, snow, forest crown): follows the surface over |u| < uR and fades to
// nothing at the ends.
export function capPath(ctx, isl, uR, depth, n = 40) {
  for (let i = 0; i <= n; i++) { const u = -uR + 2 * uR * i / n; i ? ctx.lineTo(isl.X(u), isl.Y(u)) : ctx.moveTo(isl.X(u), isl.Y(u)); }
  for (let i = n; i >= 0; i--) { const u = -uR + 2 * uR * i / n, k = 1 - (u / uR) * (u / uR); ctx.lineTo(isl.X(u), isl.Y(u) + depth * k * k); }
  ctx.closePath();
}

// Clip region for vegetation climbing up from the coast: everything below a wobbly line at yTop.
export function climbPath(ctx, w, h, yTop, amp, phase = 0) {
  ctx.moveTo(-w, h * 3);
  ctx.lineTo(-w, yTop);
  for (let i = 0; i <= 32; i++) { const x = i / 32 * w; ctx.lineTo(x, yTop + Math.sin(i * 1.1 + phase) * amp + Math.sin(i * 2.7 + phase * 1.3) * amp * 0.5); }
  ctx.lineTo(w * 2, yTop); ctx.lineTo(w * 2, h * 3); ctx.closePath();
}

// Puff positions for a plume: n puffs that are reborn at (x0,y0) and drift with the wind. Pure in t.
// opt: rate (puffs/sec), rise, drift, spread (fractions of h), r0 (radius fraction of h), seed
export function puffs(f, n, x0, y0, opt) {
  const { h, t } = f, wx = isl0Wind(f), out = [];
  const rate = opt.rate ?? 0.25, rise = opt.rise ?? 0.3, drift = opt.drift ?? 0.25, spread = opt.spread ?? 0.08, r0 = opt.r0 ?? 0.04, sd = opt.seed ?? 0;
  for (let i = 0; i < n; i++) {
    const ph = hash(i * 7.31 + sd, 1.7), a = fract(t * rate + ph);
    const j = hash(i * 3.17 + sd, 9.1) - 0.5, j2 = hash(i * 5.3 + sd, 4.4) - 0.5;
    const e = 1 - (1 - a) * (1 - a);
    out.push({ x: x0 + wx * e * drift * h + j * spread * h * (0.3 + a) + Math.sin(t * 0.7 + i) * h * 0.006,
      y: y0 - e * rise * h + j2 * spread * h * a * 0.6, r: r0 * h * (0.35 + a * (opt.growth ?? 1)), a, i });
  }
  return out;
}
const isl0Wind = f => windX(f.p.wind);

// Surtseyan "cock's tail" jets: a fan of tapered arcs from the vent, each pulsing on its own period.
// Returns [{pts:[[x,y],...], w, phase}] with pts from the vent to the tip; phase 0..1 is how far it has grown.
export function jets(f, x0, y0, strength, count = 7) {
  const { h, t } = f, wx = windX(f.p.wind), out = [];
  if (strength <= 0.01) return out;
  for (let j = 0; j < count; j++) {
    const ph = fract(t / (1.4 + hash(j, 2.2)) + hash(j, 5.5));
    const ang = (j / (count - 1) - 0.5) * 1.5 + (hash(j, 3.3) - 0.5) * 0.3 + wx * 0.15;
    const len = h * (0.16 + 0.22 * Math.min(1.5, strength)) * (0.6 + 0.4 * hash(j, 8.8));
    const vx = Math.sin(ang) * len, vy = -Math.cos(ang) * len * (1.1 - 0.3 * Math.abs(ang));
    const reach = Math.min(1, ph * 1.6), pts = [];
    for (let k = 0; k <= 10; k++) {
      const q = k / 10 * reach;
      pts.push([x0 + vx * q * 1.2 + wx * q * q * h * 0.06, y0 + vy * q * (1.25 - 0.75 * q)]);
    }
    out.push({ pts, w: h * 0.005 * (1 + strength * 0.5) * (1 - ph * 0.4), phase: ph, ang });
  }
  return out;
}

// Lava fountain particles above a vent. Returns [{x,y,r,a (age 0..1)}].
export function fountain(f, x0, y0, strength, n = 24) {
  const { h, t } = f, wx = windX(f.p.wind), out = [];
  if (strength <= 0.01) return out;
  const H = h * (0.06 + 0.16 * strength);
  for (let i = 0; i < n; i++) {
    const a = fract(t * (0.7 + hash(i, 1.3) * 0.6) + hash(i, 7.7));
    const sx = (hash(i, 2.9) - 0.5) * 0.9, up = 4 * a * (1 - a);
    out.push({ x: x0 + sx * H * 0.7 * a + wx * a * a * H * 0.2, y: y0 - up * H * (0.6 + 0.4 * hash(i, 4.1)), r: h * 0.006 * (1 + strength) * (1.2 - a), a });
  }
  return out;
}

// Lava flow tongues down the facing flank: from the summit toward the viewer and out to the shore (x inside the
// silhouette, so they read as rivers on the slope). Returns [{pts:[[x,y]...], side, ends, i}]; ends = reaches the sea.
export function flows(f, isl, strength, count = 3) {
  const out = [];
  if (strength <= 0.01) return out;
  const S = isl.S, Wu = lerp(0.3, 1, smooth(0, 0.45, isl.L.stage));
  for (let i = 0; i < count; i++) {
    const side = i === 0 ? S.rift : (i === 1 ? -S.rift : (hash(i + f.epoch, 3) < 0.5 ? 1 : -1));
    const prog = 0.75 + 0.25 * smooth(0, 1, fract(f.t * 0.05 + hash(i, 6.1)));
    const uEnd = side * (0.12 + 0.22 * hash(i, 9.3) + 0.08 * i) * Wu * 0.9;
    const shoreU = isl.shore ? isl.shore[side > 0 ? 1 : 0] : uEnd;
    const uE = Math.abs(uEnd) < Math.abs(shoreU) ? uEnd : shoreU * 0.95;
    const pts = []; let ends = false;
    const n = 24;
    for (let k = 0; k <= n; k++) {
      const q = k / n * prog, u = uE * q, ys = isl.Y(u);
      const y = ys + (isl.sea - ys) * smooth(0, 1, q) + isl.h * 0.01;
      if (y >= isl.sea) { pts.push([isl.X(u) + Math.sin(k * 1.7 + i) * isl.h * 0.006, isl.sea]); ends = true; break; }
      pts.push([isl.X(u) + Math.sin(k * 1.7 + i) * isl.h * 0.006, y]);
    }
    if (pts.length > 2) out.push({ pts, side, ends, i, x: pts[pts.length - 1][0] });
  }
  return out;
}

// Points along the reef ring (only the two side-on ends are visible): [{x, y, side, strength}]
export function reefPoints(isl) {
  return isl.reefU.map((u, i) => ({ u, x: isl.X(u), y: isl.sea, side: i ? 1 : -1 }));
}

// Motu (sandy islets) on the atoll ring; alpha grows as the island sinks.
export function motus(isl) {
  const L = isl.L, vis = smooth(0.84, 0.93, L.stage) * (1 - smooth(0.975, 1, L.stage));
  if (vis <= 0) return [];
  return isl.S.motu.map(m => {
    const u = isl.reefU[m.side > 0 ? 1 : 0] + m.off;
    return { x: isl.X(u), y: isl.sea, w: m.w * isl.hw, h: isl.unit * 0.02 + isl.h * 0.008, palms: m.palms, vis, side: m.side };
  });
}

// Background birds and a boat, pure in t.
export function birds(f, n, seed = 0) {
  const { w, h, t } = f, out = [];
  for (let i = 0; i < n; i++) {
    const sp = 0.03 + hash(i, seed + 1) * 0.03, y = h * (0.12 + hash(i, seed + 2) * 0.3);
    const x = fract(t * sp + hash(i, seed + 3)) * (w * 1.3) - w * 0.15;
    out.push({ x, y: y + Math.sin(t * 2 + i) * h * 0.01, flap: Math.sin(t * 9 + i * 1.7), s: h * (0.01 + hash(i, seed + 4) * 0.01) });
  }
  return out;
}
export function boat(f, isl, seed = 0) {
  const { w, t } = f;
  const x = fract(t * 0.012 + hash(seed, 1.1)) * (w * 1.4) - w * 0.2;
  return { x, y: isl.sea + isl.h * 0.02 + Math.sin(t * 1.3) * isl.h * 0.004, rock: Math.sin(t * 1.1) * 0.05 };
}

// Colour mix that accepts hex or rgb() strings (util.mixHex only takes hex).
export function toHex(c) { if (c[0] === '#') return c; const m = c.match(/\d+/g); return '#' + m.slice(0, 3).map(v => (+v | 0).toString(16).padStart(2, '0')).join(''); }
export function mixc(a, b, t) {
  const pa = parseInt(toHex(a).slice(1), 16), pb = parseInt(toHex(b).slice(1), 16);
  const r = lerp(pa >> 16, pb >> 16, t), g = lerp(pa >> 8 & 255, pb >> 8 & 255, t), bl = lerp(pa & 255, pb & 255, t);
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
}

// Day/night helpers
export const sunPos = (f, right = true) => ({ x: f.w * (right ? 0.78 : 0.22), y: f.h * (0.12 + (1 - clamp(f.p.light)) * 0.35) });
export const nightAmt = f => 1 - smooth(0.05, 0.3, f.p.light);
export const goldAmt = f => Math.max(0, 1 - Math.abs(f.p.light - 0.3) / 0.2);
