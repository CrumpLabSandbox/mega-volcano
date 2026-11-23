// Shared side-on island model for the 2D engines (sketch, ascii): the same profile the shader engines draw,
// in pixels. makeIsland(f) → geometry for this frame; plumeAt(m, x, y) → plume densities at a pixel.
import { clamp, lerp, smooth, hash, noise2, fbm2, windX, eruptAmount } from '../util.js';

const sgnpow = (v, k) => Math.sign(v) * Math.pow(Math.abs(v), k);

// seaY: the sea line as a fraction of f.h (default 0.6). All returned lengths are pixels, y down.
export function makeIsland(f, seaY = 0.6) {
  const { w, h, p } = f, L = f.life, s = f.stage;
  const seed = ((f.epoch * 0.618 + 0.37) % 1);
  // fit: the full-grown shield plus its reef must stay inside the frame width
  const SK = lerp(0.55, 1.4, p.scale) * Math.min(1, 0.44 * w / (1.02 * lerp(0.55, 1.4, p.scale) * h));
  const sea = seaY * h;
  const FL = 0.3 * h;                                 // sea floor below the sea line
  let HP = sgnpow(L.height, 0.7) * 0.3 * SK * h;      // summit above sea (negative = still submerged)
  HP = Math.max(HP, 0.05 * SK * h * L.steam * (1 - L.submarine));
  const HC = HP + FL;                                 // cone height above the sea floor
  const cx = w / 2 + (seed - 0.5) * 0.25 * w;
  const W = Math.max(0.03 * h, (0.12 + 0.9 * smooth(0.1, 0.5, s)) * (1 - 0.55 * smooth(0.78, 0.96, s)) * SK * h);
  const WFULL = 1.02 * SK * h;
  const WR = Math.max(W * 1.08, WFULL * 0.95 * L.reef);
  const PP = lerp(1.15, 1.9, smooth(0.15, 0.45, s));
  const cones = [];
  for (let i = 0; i < 3; i++) cones.push(cx + (hash(seed * 7 + i * 3.3, f.epoch) - 0.5) * W * 1.1 * (i === 0 ? 0.4 : 1));
  const elevS = x => { const d = Math.min(Math.abs(x - cx) / W, 1); return -FL + HC * (1 - Math.pow(d, PP)); };
  const elev = x => {
    const d = Math.abs(x - cx) / W;
    let e = elevS(x);
    const inl = smooth(1, 0.7, d);
    const n = fbm2(x / h * 9 + seed * 40, f.epoch * 3.1, 3) - 0.5;
    e += HC * (0.04 + 0.14 * L.erosion) * n * inl;
    e -= L.erosion * HC * 0.2 * Math.pow(0.5 + 0.5 * Math.sin(x / h * 22 / SK + seed * 30), 3) * smooth(0, 0.25, d) * (1 - Math.min(d, 1));
    e -= L.caldera * HC * 0.16 * smooth(0.22, 0.04, d);
    e += L.caldera * HC * 0.035 * smooth(0.34, 0.22, d) * smooth(0.1, 0.2, d);
    for (const c of cones) { const dd = (x - c) / (0.035 * SK * h); if (elevS(c) > 0.02 * h) e += 0.03 * SK * h * L.caldera * (1 - 0.6 * L.erosion) * Math.exp(-dd * dd); }
    return e;
  };
  const ventY = sea - Math.max(elev(cx), 0);
  return {
    w, h, sea, floor: sea + FL, cx, W, WR, HP, HC, SK, seed, L, s, PP, cones, elev, elevS, ventY,
    erupt: eruptAmount(f), wind: windX(p.wind),
    // screen points along the whole profile from the sea floor on the left to the right: [x, y] pairs
    profile(n = 96, pad = 1.08) {
      const pts = [];
      for (let i = 0; i <= n; i++) { const x = cx + (i / n - 0.5) * 2 * W * pad; pts.push([x, sea - elev(x)]); }
      return pts;
    },
    // the above-water polygon (empty when submerged)
    land(n = 96) {
      const pts = [];
      for (let i = 0; i <= n; i++) { const x = cx + (i / n - 0.5) * 2 * W; const e = elev(x); if (e > 0) pts.push([x, sea - e]); }
      return pts;
    },
  };
}

// Plume densities at a pixel: steam (white), tephra (black jets), fountain (lava), ash (grey). All 0..1.
export function plumeAt(m, x, y, t) {
  const { L, SK, h, cx, ventY, wind } = m;
  const dx = (x - cx) / h, dy = (ventY - y) / h;        // h-units, y up
  const r = { steam: 0, tephra: 0, fountain: 0, ash: 0 };
  if (dy < -0.02 * SK) return r;
  const ea = m.erupt;
  const st = L.steam * Math.min(ea * 1.3, 1.5);
  if (st > 0.01) {
    const hh = dy / SK, cxp = (wind * hh * hh * 1.1 + 0.3 * wind * hh) * SK, rad = (0.05 + 0.5 * hh) * SK;
    const n = noise2(x / h * 7 / SK, y / h * 7 / SK + t * 0.5);
    r.steam = clamp(smooth(1, 0.35, Math.abs(dx - cxp) / rad + (n - 0.5) * 1.2) * smooth(1.3 * st, 0.1, hh) * st * 1.4);
    const rr = Math.hypot(dx, dy), ang = Math.atan2(dx, dy);
    let jets = 0;
    for (let i = 0; i < 6; i++) {
      const ph = t * 0.9 + i * 1.7;
      const len = SK * (0.12 + 0.22 * st) * (0.6 + 0.4 * Math.sin(ph)) * (0.7 + 0.3 * hash(i + 2));
      const a0 = (i / 5 - 0.5) * 1.9 + 0.2 * Math.sin(ph * 0.7 + i) + 0.25 * wind;
      const aj = a0 + Math.sign(a0) * rr / SK * 1.1, wj = 0.035 + 0.3 * rr / SK;
      const j = smooth(wj, wj * 0.3, Math.abs(ang - aj)) * smooth(len, len * 0.55, rr) * smooth(0, 0.03 * SK, rr);
      jets = Math.max(jets, j);
    }
    r.tephra = clamp(jets * st);
  }
  const ef = ea * (1 - L.submarine) * (1 - smooth(0.48, 0.6, m.s)) * (1 - L.steam);
  if (ef > 0.01) {
    const hF = SK * (0.05 + 0.14 * ef);
    const wob = (noise2(dy * 30 / SK - t * 6, m.seed) - 0.5) * 0.02 * SK;
    r.fountain = clamp(smooth(0.014 * SK * (1 + dy / hF), 0, Math.abs(dx - wob - wind * dy * 0.15)) * smooth(hF, hF * 0.3, dy) * 1.3);
    const hh = dy / SK, cxp = (wind * hh * hh * 0.9 + 0.2 * wind * hh) * SK;
    const n = noise2(x / h * 6 / SK, y / h * 6 / SK + t * 0.3);
    r.ash = clamp(smooth(1, 0.3, Math.abs(dx - cxp) / ((0.03 + 0.3 * hh) * SK) + (n - 0.5) * 1.4) * smooth(1.1 * ef, hF / SK * 0.5, hh) * smooth(hF / SK * 0.3, hF / SK, hh) * ef * 0.6);
  }
  const ex = L.explosive * (1 - L.steam) * m.erupt * 2;
  if (ex > 0.01) {
    const pulse = smooth(0.2, 0.9, Math.sin(t * 0.35 + m.seed * 6) * 0.5 + 0.5);
    const hh = dy / SK, cxp = (wind * hh * hh * 0.8 + 0.25 * wind * hh) * SK;
    const n = noise2(x / h * 5 / SK, y / h * 5 / SK + t * 0.4);
    r.ash = Math.max(r.ash, clamp(smooth(1, 0.35, Math.abs(dx - cxp) / ((0.05 + 0.45 * hh) * SK) + (n - 0.5) * 1.3) * smooth(0.9 * ex * pulse + 0.05, 0, hh) * ex * pulse * 0.8));
  }
  return r;
}

// Steam where lava enters the sea: 0..1 at a pixel
export function lazeAt(m, x, y, t) {
  const { L, SK, h, cx, W, sea, wind } = m;
  const ef = m.erupt * (1 - L.submarine) * (1 - smooth(0.45, 0.6, m.s)) * (1 - L.steam) * smooth(0.2, 0.26, m.s);
  if (ef < 0.01) return 0;
  let a = 0;
  for (let i = 0; i < 2; i++) {
    const sx = cx + (i * 2 - 1) * W * (0.98 + 0.04 * Math.sin(t * 0.2 + i));
    const dx = (x - sx) / h, hh = (sea - y) / h / SK;
    if (hh < 0) continue;
    const n = noise2(x / h * 9 / SK, y / h * 9 / SK + t * 0.4);
    a = Math.max(a, smooth(1, 0.3, Math.abs(dx - wind * hh * hh * SK * 1.5 - wind * hh * 0.2 * SK) / ((0.025 + 0.35 * hh) * SK) + (n - 0.5) * 1.3) * smooth(0.45 * ef, 0, hh) * ef * 0.8);
  }
  return a;
}

// Lava channel strength 0..1 at a land pixel (x, elevation e above sea)
export function lavaAt(m, x, e, t) {
  const { L, SK, h, cx, W } = m;
  const flow = m.erupt * (1 - L.submarine) * (1 - smooth(0.5, 0.62, m.s));
  if (flow < 0.01 || e <= 0) return 0;
  const d = Math.abs(x - cx) / W;
  const ch = fbm2((x - cx) / h * 9 / SK + m.seed * 50, e / h * 3.5 / SK + m.seed, 2);
  return smooth(0.028, 0.004, Math.abs(ch - 0.5)) * smooth(0.03, 0.1, d) * smooth(1, 0.9, d) * Math.min(flow, 1);
}

// Vegetation 0..1 at a land pixel
export function vegAt(m, x, e) {
  const { L, HC, h } = m;
  const n = noise2(x / h * 30, e / h * 30);
  return clamp(L.veg * smooth(HC * 0.9, HC * 0.15, e) * (0.55 + 0.45 * n) * 1.6);
}
