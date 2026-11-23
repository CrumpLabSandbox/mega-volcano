// Pixel Art: retro side-view island scenes rasterised by hand into a small palette-locked buffer (Bayer dithering,
// animated pixel waves on parallax bands, lava-bomb sprites, dithered steam and ash) and blown up with
// nearest-neighbour scaling. One scene is an isometric pixel map. The island profile follows the life cycle.
import { clamp, lerp, smooth, fract, hash, noise2, fbm2, buffer, windX, eruptAmount } from '../util.js';

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const hex = s => { const n = parseInt(s.slice(1), 16); return ((255 << 24) | ((n & 255) << 16) | ((n >> 8 & 255) << 8) | (n >> 16)) >>> 0; };

// Each style: a palette and role ramps (dark → light) as palette indices
const STYLES = {
  nes: { pal: ['#000000', '#7c7c7c', '#bcbcbc', '#fcfcfc', '#5c94fc', '#0000a8', '#00a800', '#58d854', '#f83800', '#fca044', '#f8d878', '#a81000', '#503000', '#3cbcfc', '#a4e4fc', '#00e8d8', '#0058f8', '#881400'],
    skyDay: [4, 4, 13, 14], skyNight: [0, 0, 5, 5], sun: 10, moon: 3, sea: [5, 16, 4], wave: 14, deep: 0,
    rock: [0, 12, 1, 2], tuff: [0, 17, 12], grass: [6, 6, 7], sand: [10], lava: [11, 8, 9, 10, 3], steam: [1, 2, 3], ash: [0, 1, 2], reef: [15], black: 0, trunk: 12, leaf: 6, outline: 0 },
  gb: { pal: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
    skyDay: [3, 3, 3, 2], skyNight: [0, 0, 0, 1], sun: 3, moon: 3, sea: [1, 1, 2], wave: 3, deep: 0,
    rock: [0, 0, 1], tuff: [0, 1], grass: [1, 1, 2], sand: [3], lava: [1, 2, 3, 3, 3], steam: [2, 3, 3], ash: [0, 1, 1], reef: [3], black: 0, trunk: 0, leaf: 1, outline: 0, lcd: true },
  c64: { pal: ['#000000', '#ffffff', '#880000', '#aaffee', '#cc44cc', '#00cc55', '#0000aa', '#eeee77', '#dd8855', '#664400', '#ff7777', '#333333', '#777777', '#aaff66', '#0088ff', '#bbbbbb'],
    skyDay: [6, 14, 14, 3], skyNight: [0, 0, 6, 6], sun: 7, moon: 15, sea: [6, 6, 14], wave: 3, deep: 0,
    rock: [0, 11, 12], tuff: [9, 9, 11], grass: [5, 5, 13], sand: [7], lava: [2, 8, 10, 7, 1], steam: [12, 15, 1], ash: [11, 12, 15], reef: [3], black: 0, trunk: 9, leaf: 5, outline: 0 },
  pico: { pal: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
    skyDay: [12, 12, 12, 6], skyNight: [0, 1, 1, 13], sun: 10, moon: 7, sea: [1, 1, 12], wave: 7, deep: 0,
    rock: [0, 5, 5, 6], tuff: [4, 4, 5], grass: [3, 3, 11], sand: [15], lava: [8, 9, 10, 10, 7], steam: [6, 7, 7], ash: [5, 13, 6], reef: [11], black: 0, trunk: 4, leaf: 3, outline: 1 },
  cga: { pal: ['#000000', '#55ffff', '#ff55ff', '#ffffff'],
    skyDay: [1, 1, 1, 3], skyNight: [0, 0, 0, 0], sun: 3, moon: 3, sea: [0, 1, 1], wave: 3, deep: 0,
    rock: [0, 0, 2], tuff: [0, 2], grass: [2, 2, 1], sand: [3], lava: [2, 2, 3, 3, 3], steam: [3, 3, 3], ash: [2, 2, 3], reef: [1], black: 0, trunk: 2, leaf: 2, outline: 0 },
  snes: { pal: ['#1a0b2e', '#3b1f5c', '#6b2d7a', '#a83c7c', '#e0556b', '#ff8a50', '#ffc65a', '#ffe9a8', '#0e1a3a', '#1c2f66', '#2c4a8c', '#4a78b8', '#2d1b3d', '#4a2d4f', '#1a3a2a', '#2f5e3a', '#ff3b1f', '#ffffff', '#5fd6c8', '#d9c8a0'],
    skyDay: [1, 2, 3, 4, 5, 6, 7], skyNight: [0, 0, 1, 1, 2], sun: 7, moon: 17, sea: [8, 9, 10, 11], wave: 7, deep: 0,
    rock: [12, 13, 13, 2], tuff: [12, 13], grass: [14, 14, 15], sand: [19], lava: [16, 5, 6, 7, 17], steam: [3, 6, 7], ash: [12, 13, 3], reef: [18], black: 0, trunk: 12, leaf: 14, outline: null, parallax: true },
  mac: { pal: ['#000000', '#ffffff'],
    skyDay: [1, 1], skyNight: [0, 0], sun: 1, moon: 1, sea: [0, 1], wave: 1, deep: 0,
    rock: [0, 0], tuff: [0, 0], grass: [0, 1], sand: [1], lava: [0, 1, 1, 1, 1], steam: [0, 1, 1], ash: [0, 0, 1], reef: [1], black: 0, trunk: 0, leaf: 0, outline: 0, mono: true },
};

export default {
  id: 'pixel',
  name: 'Pixel Art',
  kind: '2d',
  nearest: true,
  sky: true,
  params: [
    { id: 'x1', label: 'Pixel size', value: 0.45, tip: 'Coarser pixels' },
    { id: 'x2', label: 'Dither', value: 0.7, tip: 'How much ordered dithering blends the bands' },
    { id: 'x3', label: 'Sprites', value: 0.6, tip: 'How many bombs, puffs and sparks' },
    { id: 'x4', label: 'Parallax', value: 0.5, tip: 'Depth of the sea and background parallax' },
  ],
  create(ctx, opts) {
    const S = STYLES[opts.style || 'nes'], PAL = Uint32Array.from(S.pal.map(hex));
    const iso = opts.mode === 'iso';
    let buf = null, img = null, u32 = null, bw = 0, bh = 0;
    function alloc(W, H) { bw = W; bh = H; buf = buffer(W, H); img = buf.ctx.createImageData(W, H); u32 = new Uint32Array(img.data.buffer); }
    const px = (x, y, c) => { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < bw && y < bh) u32[y * bw + x] = c; };
    let DITH = 0.7;
    const pick = (ramp, v, x, y) => { // dithered pick from a ramp
      const n = ramp.length; if (n === 1) return PAL[ramp[0]];
      const fv = clamp(v) * (n - 1), i0 = Math.floor(fv), fr = fv - i0;
      const s = clamp((fr - 0.5) * (1 + 3 * (1 - DITH)) + 0.5);
      const i = BAYER[(y & 3) * 4 + (x & 3)] < s ? i0 + 1 : i0;
      return PAL[ramp[Math.min(n - 1, i)]];
    };
    const dith = (x, y, a) => BAYER[(y & 3) * 4 + (x & 3)] < a;     // dithered alpha test
    function disc(cx, cy, r, c, a = 1) { for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) { const dx = x + 0.5 - cx, dy = y + 0.5 - cy; if (dx * dx + dy * dy <= r * r && (a >= 1 || dith(x, y, a))) px(x, y, c); } }
    function puffs(cx, cy, r, ramp, a, seed) { // a dithered cauliflower puff from a few discs
      for (let k = 0; k < 4; k++) { const ox = (hash(seed, k) - 0.5) * r * 1.4, oy = (hash(seed, k + 9) - 0.5) * r; const rr = r * (0.5 + 0.5 * hash(seed, k + 3));
        disc(cx + ox, cy + oy, rr, PAL[ramp[Math.min(ramp.length - 1, 1 + (k & 1))]], a); }
      disc(cx - r * 0.25, cy - r * 0.25, r * 0.45, PAL[ramp[ramp.length - 1]], a * 0.8);
    }

    // ---- the island profile in buffer pixels (same life model as the other side views)
    function island(f) {
      const L = f.life, p = f.p, hy = Math.round(bh * 0.6), cx = bw * 0.5;
      const Sz = 0.45 + 0.9 * p.scale, halfW = bw * 0.3 * Sz, floor = hy + bh * 0.3, peakH = bh * 0.28 * Sz;
      const seed = f.epoch * 13.7 + (opts.seed || 0), hgt = L.height;
      const above = Math.max(0, hgt) * peakH, pedH = (floor - hy) * clamp(1 + hgt) - (1 + 2 * L.lagoon);
      const domeW = 0.74 * clamp(0.3 + 0.7 * Math.sqrt(Math.max(0, hgt)));
      const ys = new Float32Array(bw);
      for (let x = 0; x < bw; x++) {
        const u = (x - cx) / halfW, au = Math.abs(u);
        let ped = smooth(1, 0.55, au) + Math.max(0, 1 - au / 0.25) * 0.35 * L.submarine;
        let y = floor - pedH * Math.min(1, ped);
        if (above > 0 && au < domeW) {
          const q = 1 - au / domeW, shield = 1 - Math.pow(au / domeW, 1.7), peaky = Math.pow(q, 1.4);
          let s = lerp(shield, peaky, 0.75 * L.erosion + 0.4 * L.steam) * (1 - 0.07 * noise2(u * 3 + seed, 2.1));
          s -= L.caldera * 0.2 * smooth(0.12, 0.02, Math.abs(u + 0.03)) * q;
          s += L.caldera * 0.06 * (Math.max(0, 1 - Math.abs(u - 0.3) * 14) + Math.max(0, 1 - Math.abs(u + 0.46) * 16));
          s -= L.erosion * 0.2 * Math.pow(fbm2(u * 7 + seed * 3, 5.3, 3), 2) * Math.min(1, au * 3) * q;
          y = Math.min(y, hy - above * Math.max(0, s));
        }
        y -= bh * 0.08 * Sz * L.steam * Math.max(0, 1 - au / 0.12) * (1 - L.submarine);
        ys[x] = y;
      }
      let shoreL = cx, shoreR = cx;
      for (let x = cx | 0; x < bw; x++) if (ys[x] < hy - 0.5) shoreR = x;
      for (let x = cx | 0; x >= 0; x--) if (ys[x] < hy - 0.5) shoreL = x;
      let ventX = Math.round(cx - 0.03 * halfW), peak = hy; for (let x = 0; x < bw; x++) if (ys[x] < peak) { peak = ys[x]; }
      return { hy, cx, halfW, ys, shoreL, shoreR, ventX, ventY: Math.min(hy, ys[ventX]) | 0, peak, seed, Sz, floor };
    }

    function features(f) {
      const L = f.life, E = eruptAmount(f), st = f.stage, above = 1 - L.submarine;
      const shield = smooth(0.2, 0.26, st) * (1 - smooth(0.5, 0.58, st));
      return { E, above, tephra: L.steam * E, steam: L.steam * E, fountain: shield * E, flows: shield * Math.min(1, E),
        bombs: (L.explosive * (1 - L.steam) * 0.8 + shield * 0.3) * E * above, ash: L.explosive * (1 - L.steam) * E * above, sub: L.submarine * E };
    }

    // ---- side view
    function renderSide(f) {
      const { t, p } = f, L = f.life, F = features(f), I = island(f), hy = I.hy, wx = windX(p.wind);
      const night = p.light < 0.28, dusk = p.light < 0.5;
      const skyRamp = night ? S.skyNight : S.skyDay;
      const spr = 0.3 + 1.2 * p.x3, par = p.x4;
      // sky (transparent in a combo)
      if (f.combo) u32.fill(0, 0, bw * hy);
      else for (let y = 0; y < hy; y++) { const v = y / hy; const o = y * bw; for (let x = 0; x < bw; x++) u32[o + x] = pick(skyRamp, S.mono ? 0 : v, x, y); }
      if (!f.combo) {
        if (night) { for (let i = 0; i < 40; i++) if (hash(i, 1) < 0.9) px(hash(i, 2) * bw, hash(i, 3) * hy * 0.9, (Math.sin(f.clock * 2 + i) > 0.3 || S.mono) ? PAL[S.moon] : PAL[skyRamp[skyRamp.length - 1]]); disc(bw * 0.8, hy * 0.2, bh * 0.03, PAL[S.moon]); }
        else { const sy = lerp(hy * 0.9, hy * 0.15, smooth(0.15, 0.9, p.light)); disc(bw * 0.3, sy, bh * (0.03 + 0.02 * (dusk ? 1 : 0)), PAL[S.sun]); }
        // background parallax: distant islands / hills (SNES-style layers)
        if (S.parallax && par > 0.1) {
          for (let l = 0; l < 2; l++) {
            const c = PAL[skyRamp[Math.min(skyRamp.length - 1, 1 + l)]], off = t * (0.4 + l * 0.6) * wx * par;
            for (let x = 0; x < bw; x++) { const h = (fbm2((x + off) * 0.015 + l * 7, l, 3) - 0.45) * bh * (0.18 - l * 0.06) * par; for (let y = Math.round(hy - h); y < hy; y++) px(x, y, c); }
          }
        }
      }
      // sea: parallax bands of waves; deeper and faster toward the bottom
      for (let y = hy; y < bh; y++) {
        const v = (y - hy) / (bh - hy), o = y * bw, band = Math.floor(v * 4), spd = (0.6 + band * 0.8) * (0.4 + par * 1.2);
        const waveRow = hash(y, 5) < 0.3 + 0.3 * v, phase = hash(y, 6) * 200 + t * spd * 4 * wx, k = 0.22 - band * 0.03;
        for (let x = 0; x < bw; x++) {
          let c = pick(S.sea, S.mono ? 0 : (night ? 0.15 : 1 - v * 0.9), x, y);
          if (S.mono) c = dith(x, y, 0.2 + v * 0.4) ? PAL[0] : PAL[1];
          if (waveRow && Math.sin((x + phase) * k) > 0.88) c = PAL[S.wave];
          u32[o + x] = c;
        }
      }
      // submerged shape faintly through the water (seamount, drowned pedestal)
      if (L.submarine > 0.05 || L.height < 0.1) for (let x = 0; x < bw; x++) { const y0 = Math.max(hy + 1, I.ys[x] | 0); for (let y = y0; y < Math.min(bh, I.floor); y++) if (dith(x, y, 0.22 - (y - hy) / (bh - hy) * 0.2)) px(x, y, pick(S.sea, 0.5, x, y)); }
      if (F.sub > 0.02) { // glow + bubbles over the seamount
        const gy = I.ys[I.ventX]; for (let i = 0; i < 20 * spr; i++) { const ph = fract(t * 0.5 + hash(i, 3)); px(I.ventX + (hash(i, 1) - 0.5) * I.halfW * 0.5, gy - ph * (gy - hy - 1), PAL[S.steam[2]]); }
        for (let i = 0; i < 12; i++) px(I.ventX + (hash(i, 5) - 0.5) * I.halfW * 0.3, gy - 1 - hash(i, 6) * 2, Math.sin(f.clock * 4 + i) > 0 ? PAL[S.lava[3]] : PAL[S.lava[1]]);
      }
      // reef, lagoon, motu
      if (L.reef > 0.02) {
        const out = Math.round(I.halfW * (0.04 + 0.5 * L.lagoon)), sl = L.height > -0.02 ? I.shoreL : I.cx | 0, sr = L.height > -0.02 ? I.shoreR : I.cx | 0;
        for (let x = sl - out - 3; x <= sr + out + 3; x++) { if (hash(x, 1) < L.lagoon) px(x, hy, PAL[S.reef[0]]); if (hash(x, 2) < L.lagoon * 0.5) px(x, hy + 1, PAL[S.sea[S.sea.length - 1]]); }
        for (let x = sl - out - 4; x < sl - out; x++) { px(x, hy, PAL[S.reef[0]]); if (Math.sin(t * 3 + x) > 0.2) px(x, hy - 1, PAL[S.wave]); }
        for (let x = sr + out; x < sr + out + 4; x++) { px(x, hy, PAL[S.reef[0]]); if (Math.sin(t * 3 + x) > 0.2) px(x, hy - 1, PAL[S.wave]); }
        const motu = smooth(0.4, 0.9, L.lagoon);
        if (motu > 0) for (const sgn of [-1, 1]) {
          const mx = (sgn < 0 ? sl - out : sr + out) + sgn * 2, w = Math.round(I.halfW * 0.12 * motu);
          for (let x = mx - w; x <= mx + w; x++) { px(x, hy - 1, PAL[S.sand[0]]); if (Math.abs(x - mx) < w * 0.6) px(x, hy - 2, PAL[S.leaf]); }
          palm(mx, hy - 2, Math.round(bh * 0.03 * motu)); palm(mx + sgn * w * 0.5, hy - 2, Math.round(bh * 0.024 * motu));
        }
      }
      // island columns: rock ramp by height, grass by veg, sand at the shore, lava flows
      const above = hy - I.peak, fresh = 1 - L.veg;
      const flowCols = new Uint8Array(bw);
      if (F.flows > 0.02) {
        const k = 2 + Math.round(2 * F.flows);
        for (let j = 0; j < k; j++) { const sgn = j % 2 ? 1 : -1, len = (0.4 + 0.6 * hash(j, I.seed + 9)) * Math.min(1, F.flows + 0.3); const x1 = clamp(I.cx + sgn * I.halfW * len, I.shoreL, I.shoreR); for (let x = Math.min(I.ventX, x1) | 0; x <= Math.max(I.ventX, x1); x++) flowCols[x] = 1 + j; }
      }
      for (let x = 0; x < bw; x++) {
        const y0 = Math.ceil(I.ys[x]); if (y0 >= hy) continue;
        const slopeL = I.ys[Math.max(0, x - 1)] - I.ys[x];
        for (let y = y0; y < hy; y++) {
          const d = y - y0, hh = 1 - (y - I.peak) / Math.max(1, above);
          let c;
          const veg = L.veg * (1 - hh * 0.7) - 0.3 * hash(x, y) * fresh;
          if (d < 1 + (hash(x, 7) < 0.5 ? 1 : 0) && veg > 0.25 && !flowCols[x]) c = pick(S.grass, 0.6 + 0.4 * hash(x, 3), x, y);
          else if (veg > 0.35 && d < 4 + hash(x, y) * 6) c = pick(S.grass, 0.25 + 0.3 * hash(x, y + 1) + 0.4 * (slopeL < 0 ? 0 : 1), x, y);
          else { const ramp = L.steam > 0.3 && L.height < 0.15 ? S.tuff : S.rock; c = pick(ramp, (slopeL > 0 ? 0.65 : 0.3) + 0.35 * (1 - d / Math.max(2, above)) * (p.light > 0.06 ? 1 : 0.3), x, y); }
          if (L.erosion > 0.3 && y >= hy - 2 && hash(x, 4) < L.erosion) c = PAL[S.sand[0]];
          const onFlow = flowCols[x] && d < 2 + Math.round(2 * F.flows);
          if (onFlow) { const tt = 0.55 + 0.4 * Math.sin(t * 3 + x * 0.5 + flowCols[x]); c = pick(S.lava, 0.35 + 0.5 * tt, x, y); }
          else if (night && !S.mono && d > 1) c = pick(S.rock, 0.1, x, y);
          px(x, y, c);
        }
        if (S.outline !== null) px(x, y0 - 1, PAL[S.outline]);
        // trees on vegetated slopes
        if (L.veg > 0.5 && hash(x, 11) < L.veg * 0.25 * spr && Math.abs(x - I.ventX) > I.halfW * 0.08 && !flowCols[x]) { px(x, y0 - 1, PAL[S.trunk]); px(x, y0 - 2, PAL[S.leaf]); px(x - 1, y0 - 2, PAL[S.leaf]); px(x + 1, y0 - 2, PAL[S.leaf]); px(x, y0 - 3, PAL[S.leaf]); }
        // ocean-entry steam where a flow reaches the shore
        if (flowCols[x] && (x === I.shoreL || x === I.shoreR) && F.flows > 0.2) for (let i = 0; i < 6 * spr; i++) { const ph = fract(t * 0.35 + hash(i, x)); puffs(x + (hash(i, 2) - 0.5) * 4 * ph + wx * ph * 8, hy - 2 - ph * bh * 0.12, 1.5 + 3 * ph, S.steam, 0.8 * (1 - ph), i + x); }
      }
      // vent glow at night
      if (night && F.E > 0.3 && F.above > 0.5) for (let i = 0; i < 24; i++) { const a = hash(i, 1) * Math.PI * 2, r = hash(i, 2) * bh * 0.05; const x = I.ventX + Math.cos(a) * r, y = I.ventY + Math.sin(a) * r * 0.5; if (dith(x, y, 0.5 * (1 - r / (bh * 0.05)))) px(x, y, PAL[S.lava[2]]); }
      // ---- sprites: particles as pure functions of time
      const v = { x: I.ventX, y: I.ventY };
      if (F.tephra > 0.02) { // cock's-tail jets: black pixel streaks; steam puffs
        for (let i = 0; i < 60 * spr * Math.min(1.5, F.tephra); i++) {
          const life = 1.3, ph = t / life + hash(i, 17), k = Math.floor(ph), age = (ph - k) * life, j = i % 5;
          const ja = (hash(j, k * 0.37 + 1.3) - 0.5) * 1.5, a = ja + (hash(i, k) - 0.5) * 0.15, s = bh * (0.3 + 0.2 * hash(i, k + 1)), g = bh * 0.9;
          const x = v.x + Math.sin(a) * s * age + wx * age * age * bh * 0.02, y = v.y - Math.cos(a) * s * age + 0.5 * g * age * age;
          if (y > hy) continue;
          px(x, y, PAL[S.black]); px(x - Math.sin(a), y + Math.cos(a), PAL[S.black]);
        }
      }
      if (F.steam > 0.02 || F.ash > 0.02) { // dithered puffs rising and drifting downwind; ash darker and bent into an umbrella
        const ramp = F.ash > F.steam ? S.ash : S.steam, n = Math.round(26 * spr * Math.min(1.5, Math.max(F.steam, F.ash)));
        for (let i = 0; i < n; i++) {
          const life = 6, ph = t / life + hash(i, 29), k = Math.floor(ph), a = ph - k;
          const rise = bh * 0.3 * Math.sin(a * Math.PI * 0.5), x = v.x + (hash(i, k) - 0.5) * bh * 0.08 * (1 + a * 3) + wx * a * a * bh * 0.25, y = v.y - rise - 2;
          puffs(x, y, bh * 0.02 * (0.6 + 2 * a), ramp, (0.9 - a * 0.7) * (0.6 + 0.4 * p.x2), i + k);
        }
      }
      if (F.fountain > 0.02) { // lava fountain pixels
        for (let i = 0; i < 50 * spr * Math.min(1.5, F.fountain); i++) {
          const life = 1.1, ph = t / life + hash(i, 7), k = Math.floor(ph), age = (ph - k) * life;
          const a = (hash(i, k) - 0.5) * 0.4, s = bh * (0.45 + 0.3 * hash(i, k + 1)) * Math.sqrt(Math.min(1.5, F.fountain)), g = bh * 1.1;
          const x = v.x + Math.sin(a) * s * age, y = v.y - Math.cos(a) * s * age + 0.5 * g * age * age;
          if (y > v.y + 2) continue;
          px(x, y, pick(S.lava, 0.9 - age * 0.5, x, y)); if (age < 0.3) px(x, y + 1, PAL[S.lava[2]]);
        }
      }
      if (F.bombs > 0.02) { // lava bombs: 2–3 px sprites on long arcs with a short trail
        for (let i = 0; i < 14 * spr * Math.min(2, F.bombs); i++) {
          const life = 2.4, ph = t / life + hash(i, 31), k = Math.floor(ph), age = (ph - k) * life;
          if (hash(i, k + 5) > Math.min(1, F.bombs) * 0.8 + 0.2) continue;
          const a = (hash(i, k) - 0.5) * 1.3, s = bh * (0.35 + 0.35 * hash(i, k + 1)), g = bh * 0.8;
          const pos = tt => [v.x + Math.sin(a) * s * tt + wx * tt * bh * 0.02, v.y - Math.cos(a) * s * tt + 0.5 * g * tt * tt];
          const [x, y] = pos(age); if (y > hy + 2) continue;
          for (let q = 1; q < 4; q++) { const [tx, ty] = pos(Math.max(0, age - q * 0.05)); if (dith(tx, ty, 0.6 / q)) px(tx, ty, PAL[S.lava[1]]); }
          const big = hash(i, 9) > 0.5; px(x, y, PAL[S.lava[3]]); px(x + 1, y, PAL[S.lava[2]]); px(x, y + 1, PAL[S.lava[2]]); if (big) { px(x + 1, y + 1, PAL[S.lava[1]]); px(x - 1, y, PAL[S.lava[2]]); }
          if (S.outline !== null) { px(x - 1, y - 1, PAL[S.outline]); px(x + (big ? 2 : 1), y - 1, PAL[S.outline]); }
        }
      }
      // click bursts
      for (const b of bursts) { const age = t - b.t0; for (let i = 0; i < 40; i++) { const a = (hash(i, 8) - 0.5) * 1.8, s = bh * (0.3 + 0.4 * hash(i, 9)), tt = Math.min(age, 0.1 + hash(i, 1) * 2); const x = v.x + Math.sin(a) * s * tt, y = v.y - Math.cos(a) * s * tt + 0.5 * bh * 0.9 * tt * tt; if (y < hy) px(x, y, PAL[S.lava[2 + (i & 1)]]); } }
    }
    function palm(x, y, h) { for (let k = 0; k < h; k++) px(x + (k > h * 0.6 ? 1 : 0), y - k, PAL[S.trunk]); const tx = x + 1, ty = y - h; for (const [dx, dy] of [[-2, 0], [-1, -1], [0, -1], [1, -1], [2, 0], [-2, 1], [2, 1], [0, 0]]) px(tx + dx, ty + dy, PAL[S.leaf]); }

    // ---- isometric pixel map
    function renderIso(f) {
      const { t, p } = f, L = f.life, F = features(f), night = p.light < 0.28;
      const n = 28 + Math.round(12 * p.detail), tw = Math.max(2, Math.round(bw / (n * 1.1))), th = Math.max(1, tw >> 1), vh = Math.max(1, Math.round(th * 0.9));
      const skyRamp = night ? S.skyNight : S.skyDay;
      if (f.combo) u32.fill(0); else { for (let y = 0; y < bh; y++) { const o = y * bw; for (let x = 0; x < bw; x++) u32[o + x] = pick(skyRamp, y / bh * 0.6, x, y); } }
      const ox = bw * 0.5, oy = bh * 0.5 - n * th * 0.5 + vh * 2;
      const seed = f.epoch * 7.3, hgt = L.height, R = n * 0.5 * (0.55 + 0.35 * p.scale), Hmax = n * 0.35 * (0.6 + 0.8 * p.scale), D = 4;
      const domeW = 0.78 * clamp(0.3 + 0.7 * Math.sqrt(Math.max(0, hgt)));
      const E = F.E, ang = t * 0.1;
      const cs = Math.cos(ang), sn = Math.sin(ang), cx = (n - 1) / 2;
      const H = new Float32Array(n * n), M = new Uint8Array(n * n);
      let vx = 0, vz = 0, best = -1e9;
      for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
        const rx = (x - cx) * cs - (z - cx) * sn, rz = (x - cx) * sn + (z - cx) * cs;
        const dx = rx / R, dz = rz / R, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
        const rn = r * (1 + 0.12 * (noise2(dx * 2.5 + seed, dz * 2.5 + seed) - 0.5));
        let ped = smooth(1, 0.55, rn) * clamp(1 + hgt) + Math.max(0, 1 - rn / 0.3) * 0.45 * L.submarine * clamp(1 + hgt);
        let h = -D + D * Math.min(1, ped) - 1 - 2 * L.lagoon, m = 4;
        if (hgt > 0 && rn < domeW) {
          const q = 1 - rn / domeW, shield = 1 - Math.pow(rn / domeW, 1.7), peaky = Math.pow(q, 1.4);
          let s = lerp(shield, peaky, 0.75 * L.erosion + 0.4 * L.steam) * (1 - 0.1 * noise2(dx * 3 + seed, dz * 3));
          s -= L.caldera * 0.22 * smooth(0.16, 0.03, rn) * q;
          s -= L.erosion * 0.3 * Math.pow(0.5 + 0.5 * Math.sin(a * 5 + seed), 6) * Math.min(1, rn * 2.5) * q;
          if (s > 0) h = Math.max(h, Hmax * s);
        }
        h += Hmax * 0.2 * L.steam * Math.max(0, 1 - rn / 0.14) * (1 - L.submarine);
        if (L.reef > 0.02 && h < 0) { const ring = smooth(0.3, 0.45, L.lagoon), r0 = lerp(domeW + 0.02, 0.72, ring), r1 = r0 + 0.1; if (rn > r0 && rn < r1 && hash(x, z) < L.reef) { h = Math.max(h, -1); m = 3; } if (rn > r0 && rn < r1 && ring > 0.5 && Math.sin(a * 3 + seed) > 0.55) { h = 1; m = 2; } }
        h = Math.max(-D, Math.round(h));
        if (m === 4 && h >= 0) { const veg = L.veg * (1 - 0.4 * h / Math.max(1, Hmax)) - 0.3 * hash(x, z) * (1 - L.veg); m = veg > 0.25 ? 1 : (L.steam > 0.3 && hgt < 0.15 ? 6 : 0); if (h <= 1 && L.erosion > 0.3 && hash(x, z + 9) < L.erosion) m = 2; }
        H[z * n + x] = h; M[z * n + x] = m; if (h > best && Math.hypot(dx, dz) < 0.2) { best = h; vx = x; vz = z; }
      }
      // lava flows from the vent
      const flows = Math.round(F.flows * 3 + (L.caldera > 0.3 ? 1 : 0) * (1 - smooth(0.58, 0.66, f.stage)) * E);
      for (let j = 0; j < flows; j++) { let x = vx, z = vz; for (let s = 0; s < n * 0.5; s++) { if (H[z * n + x] <= 0) break; M[z * n + x] = 5; let bx = x, bz = z, bhh = 1e9; for (const [ex, ez] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + ex, nz = z + ez; if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue; const hh = H[nz * n + nx] + hash(nx, nz + j) * 0.8; if (hh < bhh) { bhh = hh; bx = nx; bz = nz; } } if (bx === x && bz === z) break; x = bx; z = bz; } }
      const ramps = { 0: S.rock, 1: S.grass, 2: S.sand, 3: S.reef, 4: S.sea, 5: S.lava, 6: S.tuff };
      const proj = (x, y, z) => [ox + (x - z) * tw * 0.5, oy + (x + z) * th * 0.5 - y * vh];
      for (let z = 0; z < n; z++) for (let x = 0; x < n; x++) {
        const i = z * n + x, h = H[i], m = M[i], y = Math.max(h, 0), under = h < 0;
        const [sx, sy] = proj(x, y, z);
        const ramp = ramps[m], shade = m === 5 ? 0.5 + 0.4 * Math.sin(t * 3 + x + z) : (under ? 0.3 + 0.7 * clamp(1 + h / D) * (m === 3 ? 1 : 0.6) : 0.55 + 0.45 * hash(x, z));
        const hx = x + 1 < n ? Math.max(H[i + 1], 0) : -D, hz = z + 1 < n ? Math.max(H[i + n], 0) : -D;
        // the top diamond
        for (let yy = 0; yy < th; yy++) { const half = (yy < th / 2 ? yy + 1 : th - yy) * (tw / th); for (let xx = -half; xx < half; xx++) { const X = sx + xx, Y = sy + yy; let c = under ? (m === 3 ? pick(S.reef, 0, X, Y) : (dith(X, Y, 0.5 + 0.4 * (1 + h / D)) ? pick(S.sea, 0.6, X, Y) : pick(S.sea, 0.95 + 0.05 * Math.sin(t * 2 + x), X, Y))) : pick(ramp, shade, X, Y); if (under && Math.sin((x + z) * 1.3 + t * 2.5) > 0.9 && (X + Y) % 3 === 0 && m !== 3) c = PAL[S.wave]; px(X, Y, c); } }
        if (!under) { // the two visible walls, voxel by voxel
          for (let k = 0; k < Math.max(0, y - Math.min(hx, hz)) * vh; k++) for (let xx = 0; xx < tw; xx++) { const X = sx - tw / 2 + xx, Y = sy + th / 2 + k + (xx < tw / 2 ? (tw / 2 - xx) : (xx - tw / 2)) * (th / tw); const left = xx < tw / 2; const dark = left ? 0.25 : 0.45; if ((left ? y - hz : y - hx) * vh > k) px(X, Y, pick(ramp === S.lava ? S.rock : ramp, dark * (p.light > 0.06 ? 1 : 0.3), X, Y)); }
          if (m === 1 && hash(x + 1, z + 5) < L.veg * 0.3 * (0.3 + p.x3)) { px(sx, sy - 1, PAL[S.trunk]); px(sx, sy - 2, PAL[S.leaf]); px(sx - 1, sy - 2, PAL[S.leaf]); px(sx + 1, sy - 2, PAL[S.leaf]); px(sx, sy - 3, PAL[S.leaf]); }
          if (m === 2 && L.lagoon > 0.6 && hash(x + 2, z + 8) < 0.3) palm(sx, sy, 4);
        }
      }
      // eruption sprites above the vent
      const [ex0, ey0] = proj(vx, Math.max(0, best) + 1, vz);
      if (F.fountain > 0.02) for (let i = 0; i < 30 * F.fountain * (0.3 + 1.2 * p.x3); i++) { const life = 1.2, ph = t / life + hash(i, 7), k = Math.floor(ph), age = (ph - k) * life; const a = (hash(i, k) - 0.5) * 0.5, s = bh * 0.3, g = bh * 0.7; const X = ex0 + Math.sin(a) * s * age, Y = ey0 - Math.cos(a) * s * age + 0.5 * g * age * age; if (Y < ey0 + 2) px(X, Y, pick(S.lava, 0.9 - age * 0.5, X, Y)); }
      if (F.steam > 0.02 || F.ash > 0.02) { const ramp = F.ash > F.steam ? S.ash : S.steam; for (let i = 0; i < 16; i++) { const life = 5, ph = t / life + hash(i, 29), k = Math.floor(ph), a = ph - k; puffs(ex0 + (hash(i, k) - 0.5) * 6 * (1 + a * 3) + windX(p.wind) * a * a * bh * 0.2, ey0 - a * bh * 0.3, bh * 0.015 * (0.6 + 2 * a), ramp, 0.9 - a * 0.7, i + k); } }
      if (F.tephra > 0.02) for (let i = 0; i < 30; i++) { const life = 1.2, ph = t / life + hash(i, 17), k = Math.floor(ph), age = (ph - k) * life; const a = (hash(i, k) - 0.5) * 1.4, s = bh * 0.25, g = bh * 0.7; px(ex0 + Math.sin(a) * s * age, ey0 - Math.cos(a) * s * age + 0.5 * g * age * age, PAL[S.black]); }
      if (F.sub > 0.02) for (let i = 0; i < 16; i++) { const ph = fract(t * 0.5 + hash(i, 3)); px(ex0 + (hash(i, 1) - 0.5) * 8, ey0 - ph * bh * 0.1, PAL[S.steam[2]]); }
    }

    const bursts = [];
    function render(f) {
      const { ctx, w: W, h: Hh, t, p } = f;
      const bwant = Math.round(lerp(300, 96, p.x1)), bhant = Math.round(bwant * Hh / W);
      if (bwant !== bw || bhant !== bh) alloc(bwant, bhant);
      DITH = p.x2;
      for (const c of f.pointer.clicks) bursts.push({ t0: t });
      while (bursts.length && t - bursts[0].t0 > 2) bursts.shift();
      if (iso) renderIso(f); else renderSide(f);
      buf.ctx.putImageData(img, 0, 0);
      ctx.clearRect(0, 0, W, Hh);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(buf.canvas, 0, 0, W, Hh);
    }
    return { render };
  }
};

export const scenes = [
  { id: 'pixel-nes', name: 'NES Island', tags: ['pixel', 'retro', '2d', 'eruption'],
    desc: 'An 8-bit side-scroller island on a flat blue sky: sprite lava bombs, dithered steam and a two-frame sea.',
    opts: { style: 'nes', seed: 1 }, params: { stage: 0.38, activity: 0.6, scale: 0.5, light: 0.85, x1: 0.5, x2: 0.5, x3: 0.6, x4: 0.4 } },
  { id: 'pixel-gb', name: 'Game Boy', tags: ['pixel', 'retro', '2d', 'surtseyan'],
    desc: 'Four shades of green on a handheld LCD: the Surtseyan birth of an island in 160 pixels or so.',
    opts: { style: 'gb', seed: 2 }, params: { stage: 0.17, activity: 0.6, scale: 0.5, light: 0.8, x1: 0.55, x2: 0.8, x3: 0.6, x4: 0.3 } },
  { id: 'pixel-c64', name: 'Commodore 64', tags: ['pixel', 'retro', '2d', 'eruption', 'night'],
    desc: 'The C64 palette at dusk: a cinder-cone eruption lobbing bombs over a deep blue sea.',
    opts: { style: 'c64', seed: 3 }, params: { stage: 0.55, activity: 0.7, scale: 0.5, light: 0.2, x1: 0.6, x2: 0.5, x3: 0.7, x4: 0.4 } },
  { id: 'pixel-pico', name: 'PICO-8', tags: ['pixel', 'retro', '2d', 'cartoon', 'lava'],
    desc: 'A fantasy-console island in the 16 PICO-8 colours, with outlined sprites and a sunny sea.',
    opts: { style: 'pico', seed: 4 }, params: { stage: 0.42, activity: 0.6, scale: 0.55, light: 0.9, x1: 0.5, x2: 0.6, x3: 0.7, x4: 0.5 } },
  { id: 'pixel-cga', name: 'CGA Four-Colour', tags: ['pixel', 'retro', '2d', 'abstract'],
    desc: 'Cyan, magenta, white and black: the 1981 CGA palette does its best with a volcano.',
    opts: { style: 'cga', seed: 5 }, params: { stage: 0.35, activity: 0.6, scale: 0.5, light: 0.85, x1: 0.6, x2: 0.9, x3: 0.5, x4: 0.4 } },
  { id: 'pixel-snes', name: '16-bit Sunset', tags: ['pixel', 'retro', '2d', 'calm', 'eruption'],
    desc: 'Layered parallax: distant islands, a banded sunset sky and a slow sea in a 16-bit console palette.',
    opts: { style: 'snes', seed: 6 }, params: { stage: 0.45, activity: 0.55, scale: 0.5, light: 0.3, x1: 0.35, x2: 0.7, x3: 0.5, x4: 0.8 } },
  { id: 'pixel-mac', name: '1-bit Mac', tags: ['pixel', 'retro', '2d', 'ink', 'abstract'],
    desc: 'Pure black and white, every tone a dither pattern, like a 1984 desktop volcano.',
    opts: { style: 'mac', seed: 7 }, params: { stage: 0.4, activity: 0.6, scale: 0.5, light: 0.9, x1: 0.4, x2: 1, x3: 0.6, x4: 0.3 } },
  { id: 'pixel-iso', name: 'Isometric Pixel Island', tags: ['pixel', 'retro', '3d', 'map', 'sim'],
    desc: 'A slowly turning isometric tile map: diamond tiles of rock, grass, lava and animated water in the PICO-8 palette.',
    opts: { style: 'pico', mode: 'iso', seed: 8 }, params: { stage: 0.4, activity: 0.6, scale: 0.5, light: 0.85, x1: 0.45, x2: 0.5, x3: 0.6, x4: 0.5 } },
];
