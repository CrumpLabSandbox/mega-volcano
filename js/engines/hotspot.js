// Hotspot Chain: the plate conveyor. A plume stays put while the plate slides over it, so islands are born over the
// hotspot, carried away, eroded and sunk into atolls and guyots in a line that gets older with distance, Hawaiian–
// Emperor style, bend included. f.stage is the youngest island's stage; each older island is a step further on.
import { clamp, lerp, smooth, fract, hash, noise2, fbm2, mixHex, sky, lavaCss, eruptAmount, daylight, windX, life } from '../util.js';
import { lifeHeight } from '../life.js';

const TAU = Math.PI * 2;
const FONT = '"Avenir Next","Helvetica Neue",Helvetica,Arial,system-ui,sans-serif';
const MONO = 'Menlo,Consolas,"DejaVu Sans Mono",monospace';
const N = 8;
// colour mixing on hex or rgb() strings (mixHex only parses hex)
function toRGB(c) { if (c[0] === '#') { const v = parseInt(c.slice(1), 16); return [v >> 16, v >> 8 & 255, v & 255]; } return c.match(/[\d.]+/g).slice(0, 3).map(Number); }
function mix(a, b, t) { const A = toRGB(a), B = toRGB(b); return `rgb(${lerp(A[0], B[0], t) | 0},${lerp(A[1], B[1], t) | 0},${lerp(A[2], B[2], t) | 0})`; }

// model stage → age in million years (the life cycle is fast while the volcano is active, slow once it is dead)
function ageMa(a) {
  if (a < 0.5) return a / 0.5 * 1.0;
  if (a < 0.8) return 1 + (a - 0.5) / 0.3 * 4;
  if (a < 1) return 5 + (a - 0.8) / 0.2 * 23;
  return 28 + (a - 1) / 0.3 * 47;
}
// The chain: island i has model age a_i = stage + i*gap, wrapped over the period so a new one is born as the oldest
// drops off the far end. x = fraction of the way along the chain. seed identifies that island's shape.
function chain(f, gap) {
  const period = N * gap, out = [];
  for (let i = 0; i < N; i++) {
    const raw = f.stage + i * gap, cycle = Math.floor(raw / period), a = raw - cycle * period;
    out.push({ i, a, x: a / period, L: life(Math.min(a, 1)), seed: hash(i * 7.3 + 1, cycle * 13.1 + f.epoch * 3.7 + 0.5), guyot: smooth(1.02, 1.2, a) });
  }
  out.sort((p, q) => q.a - p.a);   // oldest first (drawn at the back)
  return out;
}
// height above sea level (-1..1) for an island, sinking on past the atoll into a guyot
function heightOf(isl) { return isl.a <= 1 ? lifeHeight(isl.a) : lifeHeight(1) - (isl.a - 1) * 0.5; }
function baseOf(isl) { return 0.42 + 0.58 * smooth(-1, 1, lifeHeight(Math.min(isl.a, 0.5))); }

// side profile relative height (0..1) at normalised distance d (-1..1) — flat-topped once it is a guyot
function profile(d, isl) {
  const r = Math.abs(d);
  if (r >= 1) return 0;
  let v = Math.pow(1 - r * r, 1.15) * (1 - 0.12 * r) * (1 + 0.05 * (noise2(d * 5 + isl.seed * 30, isl.seed) - 0.5));
  if (isl.L.caldera > 0) v -= isl.L.caldera * 0.12 * (1 - smooth(0.12, 0.24, r));
  if (isl.L.erosion > 0) { let cut = 0; for (let k = 0; k < 4; k++) { const vp = (hash(k + 3, isl.seed) - 0.5) * 1.4, vw = 0.12 + 0.1 * hash(k + 9, isl.seed); cut += Math.max(0, 1 - Math.abs(d - vp) / vw) ** 1.5; } v -= isl.L.erosion * Math.min(1, cut) * 0.25 * v; }
  if (isl.guyot > 0) v = Math.min(v, 1 - 0.35 * isl.guyot);
  return Math.max(0, v);
}

function roundLabel(ctx, x, y, text, size, align, fg, bg, weight = 500) {
  ctx.font = `${weight} ${size}px ${FONT}`;
  const w = ctx.measureText(text).width, pad = size * 0.45, hh = size * 1.35;
  const x0 = align === 'right' ? x - w - pad * 2 : align === 'center' ? x - w / 2 - pad : x;
  if (bg) { ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x0, y - hh / 2, w + pad * 2, hh, size * 0.3); ctx.fill(); }
  ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + pad, y + size * 0.04);
}
function arrow(ctx, x0, y0, x1, y1, w, col) {
  const a = Math.atan2(y1 - y0, x1 - x0), hl = w * 2.6;
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - Math.cos(a) * hl * 0.6, y1 - Math.sin(a) * hl * 0.6); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - Math.cos(a - 0.5) * hl, y1 - Math.sin(a - 0.5) * hl); ctx.lineTo(x1 - Math.cos(a + 0.5) * hl, y1 - Math.sin(a + 0.5) * hl); ctx.closePath(); ctx.fill();
}
function softBlob(ctx, x, y, r, inner, outer) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, inner); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
const ageText = isl => { const m = ageMa(isl.a); return m < 1 ? `${Math.round(m * 10) / 10} Ma` : m < 10 ? `${m.toFixed(1)} Ma` : `${Math.round(m)} Ma`; };

// ---------------- side conveyor ----------------
function renderConveyor(f, o, st) {
  const { ctx, w, h, t } = f, p = f.p, gap = lerp(0.1, 0.2, p.x1), islands = chain(f, gap);
  const dl = daylight(p.light), day = dl.day, night = dl.night, blue = o.style === 'blueprint';
  const fs = Math.max(9, h * 0.025), exag = lerp(0.6, 1.5, p.x4), size = lerp(0.6, 1.4, p.scale);
  const seaV = 0.4, hotU = 0.84, chainLen = 1.15;
  const floorAt = u => seaV + 0.2 + 0.06 * Math.sqrt(clamp((hotU - u) / chainLen)) - 0.03 * Math.exp(-(((u - hotU) / 0.18) ** 2));
  const ink = blue ? '#e9f2ff' : night > 0.5 ? '#e8e4dc' : '#1b1b1b', labBg = blue ? 'rgba(10,40,90,0.75)' : night > 0.5 ? 'rgba(20,22,30,0.82)' : 'rgba(255,255,255,0.86)';
  sky(f, blue ? (c, W, H) => { c.fillStyle = '#123a7a'; c.fillRect(0, 0, W, H); } : undefined);
  const seaY = seaV * h;
  // earth: crust (thickening with age), lithosphere, asthenosphere, plume
  if (blue) { ctx.fillStyle = '#0f3270'; ctx.fillRect(0, seaY, w, h - seaY); }
  else {
    const g = ctx.createLinearGradient(0, seaY, 0, h); g.addColorStop(0, mixHex('#d1772f', '#4a2410', night * 0.5)); g.addColorStop(1, mixHex('#c2602a', '#3a1c0c', night * 0.5));
    ctx.fillStyle = g; ctx.fillRect(0, seaY, w, h - seaY);
  }
  // lithosphere polygon
  ctx.beginPath(); ctx.moveTo(0, floorAt(0) * h);
  for (let x = 0; x <= w; x += 8) ctx.lineTo(x, floorAt(x / w) * h);
  for (let x = w; x >= 0; x -= 8) { const u = x / w; ctx.lineTo(x, (floorAt(u) + 0.1 + 0.16 * Math.sqrt(clamp((hotU - u) / chainLen))) * h); }
  ctx.closePath();
  ctx.fillStyle = blue ? '#17417f' : mixHex('#8a7a5e', '#3a3328', night * 0.6); ctx.fill();
  if (blue) { ctx.strokeStyle = 'rgba(233,242,255,0.8)'; ctx.lineWidth = 1; ctx.stroke(); }
  // crust band + moving tick marks (the plate slides left)
  ctx.save(); ctx.beginPath(); ctx.moveTo(0, floorAt(0) * h); for (let x = 0; x <= w; x += 8) ctx.lineTo(x, floorAt(x / w) * h); for (let x = w; x >= 0; x -= 8) ctx.lineTo(x, floorAt(x / w) * h + h * 0.05); ctx.closePath(); ctx.clip();
  ctx.fillStyle = blue ? '#1b4c92' : mixHex('#4a4440', '#201d1b', night * 0.6); ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = blue ? 'rgba(233,242,255,0.5)' : 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
  const shift = (f.stage / (N * gap)) * chainLen * w;
  for (let k = -2; k < 40; k++) { const x = w - fract(k * 0.05 + 0.5) * 0 + ((k * 0.05 * w - shift) % (w * 1.1) + w * 1.1) % (w * 1.1) - w * 0.05; const y = floorAt(x / w) * h; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h * 0.05); ctx.stroke(); }
  ctx.restore();
  // plume
  const px = hotU * w;
  if (!blue) {
    const glow = lerp(0.6, 1.4, p.x2);
    ctx.beginPath();
    const n = 16, stemW = h * 0.04 * lerp(0.7, 1.5, p.x2);
    const pts = []; for (let i = 0; i <= n; i++) { const q = i / n, y = lerp(h + 6, floorAt(hotU) * h + h * 0.1, q); pts.push([px + (noise2(q * 3, t * 0.1) - 0.5) * stemW * 0.5, y, stemW * (1 + 2.2 * Math.pow(smooth(0.5, 1, q), 1.4))]); }
    pts.forEach(([x, y, r], i) => i ? ctx.lineTo(x + r, y) : ctx.moveTo(x + r, y)); for (let i = n; i >= 0; i--) ctx.lineTo(pts[i][0] - pts[i][2], pts[i][1]); ctx.closePath();
    const gp = ctx.createLinearGradient(0, h, 0, seaY); gp.addColorStop(0, `rgba(255,150,40,${0.8 * glow})`); gp.addColorStop(1, `rgba(255,220,100,${0.9 * glow})`);
    ctx.fillStyle = gp; ctx.fill();
    for (let i = 0; i < 7; i++) { const q = fract(t * 0.04 + i * 0.14); softBlob(ctx, px + (hash(i, 2) - 0.5) * stemW * (1 + 2 * q), lerp(h, floorAt(hotU) * h + h * 0.12, q), stemW * (0.3 + 0.4 * q), `rgba(255,245,190,${0.5 * (1 - q * 0.5)})`, 'rgba(255,230,120,0)'); }
  } else {
    ctx.strokeStyle = '#ffd37a'; ctx.lineWidth = Math.max(1, h * 0.003); ctx.setLineDash([h * 0.012, h * 0.008]);
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(px + k * h * 0.025, h); ctx.quadraticCurveTo(px + k * h * 0.08, floorAt(hotU) * h + h * 0.25, px + k * h * 0.06, floorAt(hotU) * h + h * 0.1); ctx.stroke(); }
    ctx.setLineDash([]);
  }
  // deep water
  const g2 = ctx.createLinearGradient(0, seaY, 0, h * 0.7); g2.addColorStop(0, blue ? '#17437f' : `rgb(${50 * day + 8 | 0},${130 * day + 16 | 0},${190 * day + 40 | 0})`); g2.addColorStop(1, blue ? '#123a72' : `rgb(${8 * day | 0},${34 * day + 5 | 0},${80 * day + 18 | 0})`);
  ctx.beginPath(); ctx.moveTo(0, seaY); ctx.lineTo(w, seaY); for (let x = w; x >= 0; x -= 8) ctx.lineTo(x, floorAt(x / w) * h); ctx.closePath(); ctx.fillStyle = g2; ctx.fill();
  // islands, oldest (left) first
  const erupt = eruptAmount(f);
  for (const isl of islands) {
    const u = hotU - isl.x * chainLen, cx = u * w, floor = floorAt(u) * h, hgt = heightOf(isl);
    const Rb = h * 0.1 * size * baseOf(isl), summit = hgt < 0 ? floor + (seaY - floor) * (hgt + 1) : seaY - hgt * h * 0.08 * exag * size;
    const E = floor - summit;
    ctx.beginPath(); ctx.moveTo(cx - Rb, floor + 1);
    for (let k = 0; k <= 60; k++) { const d = k / 30 - 1; ctx.lineTo(cx + d * Rb, floor - E * profile(d, isl)); }
    ctx.lineTo(cx + Rb, floor + 1); ctx.closePath();
    if (blue) { ctx.fillStyle = '#17417f'; ctx.fill(); ctx.strokeStyle = '#e9f2ff'; ctx.lineWidth = Math.max(1, h * 0.0025); ctx.stroke(); }
    else {
      ctx.fillStyle = mixHex('#3e3a36', '#1a1a1c', night * 0.7); ctx.fill();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1;
      for (let k = 1; k < 5; k++) { const q = k / 5; ctx.beginPath(); for (let j = 0; j <= 40; j++) { const d = j / 20 - 1; ctx.lineTo(cx + d * Rb * (0.5 + 0.5 * q), floor - E * q * profile(d / (0.5 + 0.5 * q) * 0.999, isl)); } ctx.stroke(); }
      if (isl.L.veg > 0.02 && summit < seaY) { ctx.lineWidth = Math.max(1.5, h * 0.004); ctx.strokeStyle = `rgba(70,${130 + 40 * day | 0},50,${isl.L.veg * 0.8 * (1 - isl.guyot)})`; ctx.beginPath(); for (let k = 0; k <= 60; k++) { const d = k / 30 - 1, y = floor - E * profile(d, isl); if (y < seaY - 1) ctx.lineTo(cx + d * Rb, y + 1); else { ctx.stroke(); ctx.beginPath(); } } ctx.stroke(); }
      ctx.restore();
    }
    // reef cap on the drowned flanks: grows up to sea level, thickens as the island sinks
    if (isl.L.reef > 0.01 && isl.guyot < 1 && !blue) {
      const s0 = life(0.6), isl0 = { ...isl, L: s0, a: 0.6, guyot: 0 }, E0 = floor - (seaY - lifeHeight(0.6) * h * 0.08 * exag * size);
      for (const side of [-1, 1]) {
        let lo = 0, hi = 1; for (let k = 0; k < 14; k++) { const m = (lo + hi) / 2; if (floor - E0 * profile(side * m, isl0) < seaY) lo = m; else hi = m; }
        const d0 = side * (lo + hi) / 2, rw = 0.12 + 0.06 * isl.L.lagoon;
        ctx.beginPath();
        for (let k = 0; k <= 8; k++) { const d = d0 + side * lerp(-rw * 0.5, rw * 0.6, k / 8); const ys = floor - E * profile(d, isl); ctx.lineTo(cx + d * Rb, k === 0 || k === 8 ? ys : Math.min(ys, Math.max(seaY + h * 0.05, lerp(ys, seaY - 1, isl.L.reef)))); }
        for (let k = 8; k >= 0; k--) { const d = d0 + side * lerp(-rw * 0.5, rw * 0.6, k / 8); ctx.lineTo(cx + d * Rb, Math.min(seaY + h * 0.09, floor - E * profile(d, isl) + 1)); }
        ctx.closePath(); ctx.fillStyle = mixHex('#f1e3d0', '#6a6058', night * 0.6); ctx.globalAlpha = 1 - isl.guyot; ctx.fill(); ctx.globalAlpha = 1;
      }
    }
    // activity on the youngest
    if (isl.i === 0 && !blue) {
      const vx = cx, vy = Math.min(summit, seaY), wx = windX(p.wind);
      if (isl.L.steam > 0.02) for (let k = 0; k < 14; k++) { const q = fract(t * 0.2 + hash(k, 5)); softBlob(ctx, vx + (hash(k, 6) - 0.5) * h * 0.04 + wx * q * h * 0.08, vy - q * h * 0.16 * isl.L.steam, h * (0.008 + 0.02 * q), `rgba(250,250,255,${0.6 * (1 - q)})`, 'rgba(255,255,255,0)'); }
      if (erupt > 0.05 && isl.L.submarine < 0.5 && isl.L.steam < 0.5) {
        for (let k = 0; k < 16; k++) { const q = fract(t * 0.9 + hash(k, 7)), ang = -Math.PI / 2 + (hash(k, 8) - 0.5) * 0.6, v0 = h * 0.06 * clamp(erupt, 0, 1.5); const x = vx + Math.cos(ang) * v0 * q * 2, y = vy + Math.sin(ang) * v0 * q * 2 + h * 0.08 * q * q; if (y < vy) { ctx.fillStyle = lavaCss(1 - q * 0.6); ctx.beginPath(); ctx.arc(x, y, h * 0.003, 0, TAU); ctx.fill(); } }
        if (night > 0.2) softBlob(ctx, vx, vy, h * 0.06, `rgba(255,120,30,${0.4 * night})`, 'rgba(255,120,30,0)');
      }
    }
    // age label
    if (p.x3 > 0.05 && (p.x3 > 0.5 || isl.i % 2 === 0)) roundLabel(ctx, cx, seaY - h * 0.03 - Math.max(0, seaY - summit) - fs, ageText(isl), fs * 0.85, 'center', ink, labBg);
  }
  // water wash over the submerged parts
  ctx.fillStyle = blue ? 'rgba(40,110,200,0.25)' : `rgba(${60 * day + 8 | 0},${140 * day + 18 | 0},${200 * day + 45 | 0},0.3)`;
  ctx.beginPath(); ctx.moveTo(0, seaY); ctx.lineTo(w, seaY); for (let x = w; x >= 0; x -= 8) ctx.lineTo(x, floorAt(x / w) * h); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = blue ? 'rgba(233,242,255,0.9)' : `rgba(255,255,255,${0.35 + 0.3 * day})`; ctx.lineWidth = Math.max(1, h * 0.003);
  ctx.beginPath(); for (let x = 0; x <= w; x += 6) ctx.lineTo(x, seaY + Math.sin(x * 0.03 + t * 1.5) * h * 0.003); ctx.stroke();
  // annotations
  if (p.x3 > 0.3) {
    const col = blue ? 'rgba(233,242,255,0.9)' : night > 0.5 ? 'rgba(240,235,225,0.9)' : 'rgba(20,20,20,0.85)';
    const ay = h * 0.84;
    arrow(ctx, w * 0.64, ay, w * 0.4, ay, Math.max(1.5, h * 0.005), col);
    roundLabel(ctx, w * 0.52, ay - fs * 1.3, `plate moves this way: ${(lerp(5, 11, p.x1)).toFixed(0)} cm/yr`, fs, 'center', ink, labBg);
    roundLabel(ctx, px, h * 0.95, 'fixed mantle plume (hotspot)', fs, 'center', ink, labBg);
    roundLabel(ctx, w * 0.03, seaY - fs * 6.2, 'older, lower, more eroded', fs, 'left', ink, labBg);
    arrow(ctx, w * 0.03 + fs * 11, seaY - fs * 5, w * 0.03, seaY - fs * 5, Math.max(1.5, h * 0.004), col);
    roundLabel(ctx, w * 0.97, seaY - fs * 6.2, 'youngest, still growing', fs, 'right', ink, labBg);
    roundLabel(ctx, w * 0.03, h * 0.75, 'the plate cools, thickens and sinks with age', fs * 0.9, 'left', ink, labBg);
  }
  if (o.ruler) {
    // distance scale: distance = speed × age, drawn as a ruler under the sea surface
    const kmPerMa = lerp(50, 110, p.x1), y0 = seaY + h * 0.09;
    ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 1; ctx.font = `500 ${fs * 0.8}px ${MONO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.beginPath(); ctx.moveTo(px, y0); ctx.lineTo(px - chainLen * w, y0); ctx.stroke();
    for (let k = 0; k <= 5; k++) { const x = px - k / 6 * chainLen * w; ctx.beginPath(); ctx.moveTo(x, y0 - 4); ctx.lineTo(x, y0 + 4); ctx.stroke(); ctx.fillText(`${Math.round(ageMa(k / 6 * N * gap) * kmPerMa)} km`, x, y0 + 6); }
    roundLabel(ctx, w * 0.5, h * 0.95, `${(kmPerMa / 10).toFixed(1)} cm/yr × 1 Myr = ${kmPerMa} km`, fs, 'center', ink, labBg);
  }
  roundLabel(ctx, fs * 0.6, fs * 1.3, o.ruler ? 'Plate speed' : 'The hotspot conveyor', fs * 1.05, 'left', ink, labBg, 600);
}

// ---------------- oblique 3D-ish strip ----------------
function renderOblique(f, o) {
  const { ctx, w, h, t } = f, p = f.p, gap = lerp(0.1, 0.2, p.x1), isl = chain(f, gap);
  const dl = daylight(p.light), day = dl.day, night = dl.night, fs = Math.max(9, h * 0.025), size = lerp(0.6, 1.4, p.scale), exag = lerp(0.6, 1.5, p.x4);
  sky(f);
  const hor = h * 0.42;
  const gs = ctx.createLinearGradient(0, hor, 0, h); gs.addColorStop(0, `rgb(${70 * day + 10 | 0},${120 * day + 18 | 0},${170 * day + 40 | 0})`); gs.addColorStop(1, `rgb(${15 * day + 3 | 0},${60 * day + 8 | 0},${120 * day + 25 | 0})`);
  ctx.fillStyle = gs; ctx.fillRect(0, hor, w, h - hor);
  // sun glitter
  ctx.fillStyle = `rgba(255,255,255,${0.12 * day})`; for (let k = 0; k < 120; k++) { const q = hash(k, 1), z = 0.05 + q * q * 0.95; const y = hor + (h - hor) * z; const x = w * hash(k, 2); if (noise2(x * 0.05, y * 0.05 + t) > 0.55) ctx.fillRect(x, y, 2 + 4 * z, 1 + z); }
  const erupt = eruptAmount(f), sunX = lerp(-1, 1, p.wind), wx = windX(p.wind);
  const ink = night > 0.5 ? '#e8e4dc' : '#1b1b1b', labBg = night > 0.5 ? 'rgba(20,22,30,0.82)' : 'rgba(255,255,255,0.86)';
  for (const q of isl) {
    const z = 0.62 + q.x * 2.2;                           // depth; the youngest is nearest
    const sc = 1 / z, cx = w * (0.74 - q.x * 0.8) + w * 0.03 * Math.sin(q.seed * 7), cy = hor + h * 0.3 * sc * 0.62;
    const hgt = heightOf(q), R = h * 0.34 * size * baseOf(q) * sc, H = Math.max(0, hgt) * h * 0.16 * exag * size * sc;
    const alpha = 1 - 0.4 * smooth(0.6, 1, q.x) * day;    // haze with distance
    ctx.globalAlpha = alpha;
    // reef ring + lagoon footprint
    if (q.L.reef > 0.02 && q.guyot < 1) {
      const rr = R * (0.72 + 0.06 * q.L.lagoon), ry = rr * 0.32;
      ctx.fillStyle = `rgba(${90 + 60 * day | 0},${200 * day + 25 | 0},${210 * day + 40 | 0},${0.7 * q.L.reef * (1 - q.guyot)})`; ctx.beginPath(); ctx.ellipse(cx, cy, rr, ry, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * q.L.reef * (1 - q.guyot)})`; ctx.lineWidth = Math.max(1, R * 0.03); ctx.beginPath(); ctx.ellipse(cx, cy, rr, ry, 0, 0, TAU); ctx.stroke();
      if (q.L.lagoon > 0.5) { ctx.fillStyle = mixHex('#f1e3c4', '#5c5444', night * 0.6); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + q.seed; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * rr, cy + Math.sin(a) * ry, R * 0.1, R * 0.03, 0, 0, TAU); ctx.fill(); } }
    }
    if (hgt > 0 && H > 0.5) {
      // the island: a shaded dome with a sunlit and a shadow side, greener with age
      const grn = q.L.veg * (1 - q.guyot), base = mix(mix('#4a4440', '#3f7030', grn), '#15161a', night * 0.7), lit = mix(mix('#948878', '#8cbf5a', grn), '#2a2b30', night * 0.7);
      const rx = R * 0.7, ry = R * 0.22;
      const pts = [];
      for (let k = 0; k <= 48; k++) { const d = k / 24 - 1; pts.push([cx + d * rx, cy - H * profile(d, q)]); }
      ctx.beginPath(); ctx.moveTo(cx - rx, cy); for (const [x, y] of pts) ctx.lineTo(x, y); ctx.lineTo(cx + rx, cy); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI, false); ctx.closePath();
      const g = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0); g.addColorStop(0, sunX < 0 ? lit : base); g.addColorStop(0.5, mixHex(base, lit, 0.5)); g.addColorStop(1, sunX < 0 ? base : lit);
      ctx.fillStyle = g; ctx.fill();
      // valleys as darker streaks once eroded
      if (q.L.erosion > 0.05) { ctx.strokeStyle = `rgba(0,0,0,${0.35 * q.L.erosion})`; ctx.lineWidth = Math.max(1, R * 0.02); for (let k = 0; k < 6; k++) { const d = (hash(k, q.seed) - 0.5) * 1.4; const top = cy - H * profile(d, q) * 0.8; ctx.beginPath(); ctx.moveTo(cx + d * rx * 0.3, top); ctx.lineTo(cx + d * rx, cy); ctx.stroke(); } }
      // black fresh lava on the youngest
      if (q.i === 0 && q.L.erupt > 0.4 && q.L.submarine < 0.5) { ctx.fillStyle = 'rgba(10,8,8,0.7)'; for (let k = 0; k < 3; k++) { const d = (hash(k, 3) - 0.5) * 0.8; ctx.beginPath(); ctx.moveTo(cx, cy - H * 0.9); ctx.lineTo(cx + d * rx * 1.1, cy + ry * 0.3); ctx.lineTo(cx + d * rx * 0.7, cy + ry * 0.5); ctx.closePath(); ctx.fill(); } }
      // surf
      ctx.strokeStyle = `rgba(255,255,255,${0.5})`; ctx.lineWidth = Math.max(1, R * 0.02); ctx.beginPath(); ctx.ellipse(cx, cy + 1, rx * 1.01, ry * 1.01, 0, 0.1, Math.PI - 0.1); ctx.stroke();
    } else if (q.i === 0 && q.L.submarine > 0.3) {
      // discoloured water over the seamount
      softBlob(ctx, cx, cy, R * 0.4, `rgba(200,230,210,${0.35 * q.L.submarine})`, 'rgba(200,230,210,0)');
    }
    // plume on the youngest
    if (q.i === 0) {
      const vx = cx, vy = cy - H;
      if (q.L.steam > 0.02) for (let k = 0; k < 18; k++) { const u = fract(t * 0.2 + hash(k, 5)); softBlob(ctx, vx + (hash(k, 6) - 0.5) * R * 0.2 + wx * u * h * 0.1, vy - u * h * 0.2 * q.L.steam, h * (0.01 + 0.03 * u), `rgba(250,250,255,${0.6 * (1 - u)})`, 'rgba(255,255,255,0)'); }
      if (erupt > 0.05 && q.L.submarine < 0.5 && q.L.steam < 0.5 && hgt > 0) {
        for (let k = 0; k < 20; k++) { const u = fract(t * 0.9 + hash(k, 7)), ang = -Math.PI / 2 + (hash(k, 8) - 0.5) * 0.6, v0 = h * 0.07 * clamp(erupt, 0, 1.5) * sc; const x = vx + Math.cos(ang) * v0 * u * 2, y = vy + Math.sin(ang) * v0 * u * 2 + h * 0.1 * u * u; if (y < vy) { ctx.fillStyle = lavaCss(1 - u * 0.6); ctx.beginPath(); ctx.arc(x, y, h * 0.003 * sc, 0, TAU); ctx.fill(); } }
        for (let k = 0; k < 14; k++) { const u = fract(t * 0.12 + hash(k, 9)); softBlob(ctx, vx + wx * u * h * 0.2 + (hash(k, 10) - 0.5) * h * 0.04, vy - u * h * 0.22 * (0.5 + 0.5 * clamp(erupt)), h * (0.012 + 0.04 * u), `rgba(${200 + 40 * day | 0},${195 + 40 * day | 0},${190 + 40 * day | 0},${0.5 * (1 - u) * clamp(erupt)})`, 'rgba(200,200,200,0)'); }
        if (night > 0.2) softBlob(ctx, vx, vy, h * 0.08 * sc, `rgba(255,120,30,${0.5 * night})`, 'rgba(255,120,30,0)');
      }
    }
    ctx.globalAlpha = 1;
    if (p.x3 > 0.05 && (p.x3 > 0.5 || q.i % 2 === 0)) roundLabel(ctx, cx, cy - H - fs * (1.2 + 0.5 * sc), ageText(q), fs * (0.75 + 0.2 * sc), 'center', ink, labBg);
  }
  if (p.x3 > 0.3) {
    const col = night > 0.5 ? 'rgba(240,235,225,0.9)' : 'rgba(20,20,20,0.85)';
    arrow(ctx, w * 0.6, h * 0.93, w * 0.36, h * 0.86, Math.max(1.5, h * 0.005), col);
    roundLabel(ctx, w * 0.48, h * 0.96, 'plate motion: older islands carried away', fs, 'center', ink, labBg);
    roundLabel(ctx, w * 0.78, h * 0.9, 'hotspot under the youngest', fs * 0.9, 'center', ink, labBg);
  }
  roundLabel(ctx, fs * 0.6, fs * 1.3, 'Island chain', fs * 1.05, 'left', ink, labBg, 600);
}

// ---------------- top-down chain map ----------------
function renderMap(f, o) {
  const { ctx, w, h, t } = f, p = f.p, gap = lerp(0.1, 0.2, p.x1), isl = chain(f, gap);
  const dl = daylight(p.light), day = dl.day, night = dl.night, fs = Math.max(9, h * 0.024), size = lerp(0.6, 1.4, p.scale);
  const bend = !!o.bend;
  const ink = night > 0.5 ? '#e8e4dc' : '#1b1b1b', labBg = night > 0.5 ? 'rgba(20,22,30,0.82)' : 'rgba(255,255,255,0.86)';
  // path of the chain: from the hotspot (lower right) WNW, bending north past the bend
  const path = x => {
    const xb = 0.86, hot = [0.84, 0.72];
    if (!bend) return [hot[0] - x * 0.74, hot[1] - x * 0.38];
    const dir1 = [-0.62, -0.3], dir2 = [-0.12, -0.55];
    if (x < xb) return [hot[0] + dir1[0] * x, hot[1] + dir1[1] * x];
    return [hot[0] + dir1[0] * xb + dir2[0] * (x - xb) * 1.4, hot[1] + dir1[1] * xb + dir2[1] * (x - xb) * 1.4];
  };
  // ocean with the hotspot swell (shallower, lighter near the chain)
  const g = ctx.createLinearGradient(0, 0, w, h); g.addColorStop(0, `rgb(${10 * day + 3 | 0},${45 * day + 8 | 0},${100 * day + 22 | 0})`); g.addColorStop(1, `rgb(${18 * day + 4 | 0},${60 * day + 10 | 0},${120 * day + 26 | 0})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (let k = 3; k >= 1; k--) {
    ctx.strokeStyle = `rgba(${60 * day + 10 | 0},${120 * day + 20 | 0},${170 * day + 40 | 0},${0.1})`; ctx.lineWidth = h * 0.11 * k;
    ctx.beginPath(); for (let i = 0; i <= 40; i++) { const [x, y] = path(i / 40 * 1.05 - 0.03); i ? ctx.lineTo(x * w, y * h) : ctx.moveTo(x * w, y * h); } ctx.stroke();
  }
  // graticule
  ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1;
  for (let k = 1; k < 8; k++) { ctx.beginPath(); ctx.moveTo(w * k / 8, 0); ctx.lineTo(w * k / 8, h); ctx.stroke(); }
  for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(0, h * k / 5); ctx.lineTo(w, h * k / 5); ctx.stroke(); }
  // hotspot marker
  const [hx, hy] = path(0);
  softBlob(ctx, hx * w, hy * h, h * 0.12 * lerp(0.6, 1.4, p.x2), `rgba(255,140,40,${0.35 + 0.1 * Math.sin(t)})`, 'rgba(255,120,30,0)');
  ctx.strokeStyle = 'rgba(255,170,60,0.9)'; ctx.setLineDash([h * 0.012, h * 0.008]); ctx.lineWidth = Math.max(1, h * 0.003);
  ctx.beginPath(); ctx.arc(hx * w, hy * h, h * 0.085 * lerp(0.6, 1.4, p.x2), 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  // islands
  const erupt = eruptAmount(f), wx = windX(p.wind);
  for (const q of isl) {
    const [ux, uy] = path(q.x), cx = ux * w, cy = uy * h, hgt = heightOf(q);
    const R = h * 0.09 * size * baseOf(q);
    const rad = a => R * (1 + 0.28 * (fbm2(Math.cos(a) * 1.5 + q.seed * 40, Math.sin(a) * 1.5 + 7, 3) - 0.5) * 2) * (1 + 0.3 * Math.max(0, Math.cos(2 * (a - q.seed * 6))));   // rift-zone lobes
    const outline = (k, n = 48) => { ctx.beginPath(); for (let i = 0; i <= n; i++) { const a = i / n * TAU, r = rad(a) * k; i ? ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } ctx.closePath(); };
    // the submerged edifice: a pale shelf
    outline(1.15); ctx.fillStyle = `rgba(${90 * day + 15 | 0},${150 * day + 25 | 0},${190 * day + 40 | 0},${0.25 + 0.2 * (hgt < 0 ? 1 : 0)})`; ctx.fill();
    // reef ring around where the shore was
    if (q.L.reef > 0.02 && q.guyot < 1) {
      const kr = 0.9 + 0.1 * q.L.lagoon;
      outline(kr * 1.08); ctx.fillStyle = `rgba(${90 + 60 * day | 0},${200 * day + 25 | 0},${210 * day + 40 | 0},${0.85 * q.L.reef * (1 - q.guyot)})`; ctx.fill();
      outline(kr * 0.9); ctx.fillStyle = `rgba(${60 + 50 * day | 0},${160 * day + 20 | 0},${190 * day + 35 | 0},${0.9 * q.L.lagoon * (1 - q.guyot)})`; ctx.fill();
      ctx.strokeStyle = `rgba(255,255,255,${0.9 * q.L.reef * (1 - q.guyot)})`; ctx.lineWidth = Math.max(1, R * 0.06); outline(kr * 1.08); ctx.stroke();
      if (q.L.lagoon > 0.5) { ctx.fillStyle = mixHex('#f1e3c4', '#5c5444', night * 0.6); for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + q.seed; const r = rad(a) * kr * 1.02; ctx.beginPath(); ctx.ellipse(cx + Math.cos(a) * r, cy + Math.sin(a) * r, R * 0.1, R * 0.06, a, 0, TAU); ctx.fill(); } }
    }
    if (hgt > 0) {
      const kland = Math.min(1, 0.25 + 0.75 * hgt);
      const grn = q.L.veg * (1 - q.guyot);
      outline(kland); ctx.fillStyle = mix(mix('#5a5450', '#4d8a35', grn), '#17181c', night * 0.7); ctx.fill();
      // relief: lighter sunlit side, caldera dot, valleys
      ctx.save(); ctx.clip();
      const gl = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, 0, cx, cy, R * kland * 1.2); gl.addColorStop(0, 'rgba(255,255,255,0.3)'); gl.addColorStop(1, 'rgba(0,0,0,0.25)'); ctx.fillStyle = gl; ctx.fillRect(cx - 2 * R, cy - 2 * R, 4 * R, 4 * R);
      if (q.L.erosion > 0.05) { ctx.strokeStyle = `rgba(0,0,0,${0.5 * q.L.erosion})`; ctx.lineWidth = Math.max(1, R * 0.05); for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + q.seed * 3; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.2, cy + Math.sin(a) * R * 0.2); ctx.lineTo(cx + Math.cos(a) * R * 1.3, cy + Math.sin(a) * R * 1.3); ctx.stroke(); } }
      if (q.L.caldera > 0.1) { ctx.fillStyle = `rgba(0,0,0,${0.5 * q.L.caldera})`; ctx.beginPath(); ctx.ellipse(cx, cy, R * 0.14, R * 0.1, q.seed, 0, TAU); ctx.fill(); }
      if (q.i === 0 && q.L.erupt > 0.4 && q.L.submarine < 0.5) { ctx.strokeStyle = 'rgba(5,5,5,0.85)'; ctx.lineWidth = Math.max(1.5, R * 0.08); for (let k = 0; k < 3; k++) { const a = hash(k, 3) * TAU; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.quadraticCurveTo(cx + Math.cos(a + 0.3) * R * 0.6, cy + Math.sin(a + 0.3) * R * 0.6, cx + Math.cos(a) * R * 1.1, cy + Math.sin(a) * R * 1.1); ctx.stroke(); } if (night > 0.2) softBlob(ctx, cx, cy, R * 0.8, `rgba(255,120,30,${0.6 * night})`, 'rgba(255,120,30,0)'); }
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1, R * 0.03); outline(kland * 1.02); ctx.stroke();
    } else if (q.i === 0 && q.L.submarine > 0.3) softBlob(ctx, cx, cy, R * 0.9, `rgba(200,230,210,${0.4 * q.L.submarine})`, 'rgba(200,230,210,0)');
    if (q.i === 0 && (q.L.steam > 0.02 || (erupt > 0.05 && q.L.submarine < 0.5 && hgt > 0))) for (let k = 0; k < 12; k++) { const u = fract(t * 0.15 + hash(k, 5)); const [dx, dy] = [wx, -0.3]; softBlob(ctx, cx + dx * u * h * 0.2 + (hash(k, 6) - 0.5) * R * 0.3, cy + dy * u * h * 0.1, h * (0.01 + 0.03 * u), `rgba(240,240,245,${0.5 * (1 - u) * (q.L.steam > 0.02 ? 1 : clamp(erupt))})`, 'rgba(240,240,245,0)'); }
    if (p.x3 > 0.05 && (p.x3 > 0.5 || q.i % 2 === 0)) roundLabel(ctx, cx, cy - R * 1.3 - fs * 0.9, ageText(q), fs * 0.85, 'center', ink, labBg);
  }
  if (p.x3 > 0.3) {
    const col = night > 0.5 ? 'rgba(240,235,225,0.9)' : 'rgba(20,20,20,0.85)';
    const [ax, ay] = path(0.02), [bx, by] = path(0.2);
    arrow(ctx, ax * w, ay * h + h * 0.19, bx * w, by * h + h * 0.19, Math.max(1.5, h * 0.005), col);
    roundLabel(ctx, (ax + bx) / 2 * w, (ay + by) / 2 * h + h * 0.26, 'plate motion ~9 cm/yr', fs, 'center', ink, labBg);
    roundLabel(ctx, hx * w, hy * h + h * 0.12, 'hotspot', fs, 'center', ink, labBg);
    const refs = bend ? [[0, 'Hawaiʻi <1 Ma'], [0.27, 'Kauaʻi ~5 Ma'], [0.6, 'Midway ~28 Ma'], [0.86, 'bend ~47 Ma'], [1.1, 'Emperor seamounts']] : [[0, 'Hawaiʻi <1 Ma'], [0.3, 'Kauaʻi ~5 Ma'], [0.75, 'Midway ~28 Ma']];
    for (const [x, name] of refs) { const [rx, ry] = path(x); roundLabel(ctx, rx * w, ry * h + h * (x === 0 ? -0.2 : 0.17), name, fs * 0.85, 'center', ink, labBg); }
  }
  // compass and scale
  ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = Math.max(1, h * 0.003);
  const nx = w * 0.95, ny = h * 0.16; arrow(ctx, nx, ny + h * 0.08, nx, ny, Math.max(1.5, h * 0.004), ink);
  ctx.font = `600 ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('N', nx, ny - 2);
  const sx = w * 0.04, sy = h * 0.93, sw = w * 0.2; ctx.fillRect(sx, sy, sw, h * 0.008); ctx.fillStyle = labBg; ctx.fillRect(sx + sw / 2, sy, sw / 2, h * 0.008); ctx.fillStyle = ink;
  ctx.font = `500 ${fs * 0.8}px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(bend ? '0            1000 km' : '0          500 km', sx, sy - 2);
  roundLabel(ctx, fs * 0.6, fs * 1.3, bend ? 'Hawaiian–Emperor chain' : 'Hawaiian chain', fs * 1.05, 'left', ink, labBg, 600);
}

// ---------------- age vs distance chart ----------------
const REF = [['Kīlauea', 0, 0.1], ['Haleakalā', 190, 1.1], ['Oʻahu', 340, 2.6], ['Kauaʻi', 520, 5.1], ['Nihoa', 780, 7.2], ['Necker', 1060, 10.3], ['Laysan', 1800, 20], ['Midway', 2430, 27.7], ['Daikakuji (bend)', 3520, 46.7], ['Koko', 3760, 48.1], ['Suiko', 4860, 64.7], ['Detroit', 5700, 76]];
function renderChart(f, o) {
  const { ctx, w, h, t } = f, p = f.p, gap = lerp(0.1, 0.2, p.x1), isl = chain(f, gap);
  const dl = daylight(p.light), night = dl.night, fs = Math.max(9, h * 0.024);
  const paper = night > 0.5 ? '#141720' : '#f7f4ec', ink = night > 0.5 ? '#e8e4dc' : '#1b1b1b', grid = night > 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.1)';
  ctx.fillStyle = paper; ctx.fillRect(0, 0, w, h);
  const x0 = w * 0.1, x1 = w * 0.95, y0 = h * 0.86, y1 = h * 0.14, kmMax = 6500, maMax = 85;
  const X = km => x0 + km / kmMax * (x1 - x0), Y = ma => y0 - ma / maMax * (y0 - y1);
  ctx.strokeStyle = grid; ctx.lineWidth = 1; ctx.font = `500 ${fs * 0.8}px ${MONO}`; ctx.fillStyle = ink;
  for (let km = 0; km <= kmMax; km += 1000) { ctx.beginPath(); ctx.moveTo(X(km), y0); ctx.lineTo(X(km), y1); ctx.stroke(); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(km, X(km), y0 + 4); }
  for (let ma = 0; ma <= maMax; ma += 10) { ctx.beginPath(); ctx.moveTo(x0, Y(ma)); ctx.lineTo(x1, Y(ma)); ctx.stroke(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(ma, x0 - 6, Y(ma)); }
  ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1, h * 0.003); ctx.beginPath(); ctx.moveTo(x0, y1); ctx.lineTo(x0, y0); ctx.lineTo(x1, y0); ctx.stroke();
  ctx.font = `600 ${fs}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText('distance from Kīlauea along the chain (km)', (x0 + x1) / 2, h * 0.98);
  ctx.save(); ctx.translate(fs * 1.1, (y0 + y1) / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'top'; ctx.fillText('age of the volcano (million years)', 0, 0); ctx.restore();
  // the fitted line: plate speed
  const kmPerMa = lerp(60, 110, p.x1);
  ctx.strokeStyle = night > 0.5 ? 'rgba(255,170,60,0.9)' : 'rgba(210,80,30,0.9)'; ctx.lineWidth = Math.max(1.5, h * 0.004); ctx.setLineDash([h * 0.015, h * 0.01]);
  ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(Math.min(kmMax, maMax * kmPerMa)), Y(Math.min(maMax, kmMax / kmPerMa))); ctx.stroke(); ctx.setLineDash([]);
  roundLabel(ctx, X(2600), Y(2600 / kmPerMa) - fs * 1.6, `slope ≈ ${kmPerMa} km/Myr = ${(kmPerMa / 10).toFixed(1)} cm/yr`, fs * 0.9, 'center', ink, night > 0.5 ? 'rgba(20,22,30,0.85)' : 'rgba(255,255,255,0.9)');
  // reference volcanoes (hollow) with names
  ctx.font = `500 ${fs * 0.78}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  REF.forEach(([name, km, ma], i) => {
    const x = X(km), y = Y(ma), emperor = km > 3400;
    ctx.strokeStyle = emperor ? (night > 0.5 ? '#9fb6ff' : '#2e4a9e') : ink; ctx.lineWidth = Math.max(1, h * 0.0025);
    ctx.beginPath(); ctx.arc(x, y, h * 0.008, 0, TAU); ctx.stroke();
    if (p.x3 > 0.3 && (p.x3 > 0.6 || i % 2 === 0)) { ctx.fillStyle = ink; ctx.fillText(name, x + h * 0.014, y - (i % 2 ? h * 0.012 : -h * 0.012)); }
  });
  // the model islands (filled), sliding along as the plate moves
  for (const q of isl) {
    const ma = ageMa(q.a), x = X(ma * kmPerMa), y = Y(ma);
    if (x > x1 || y < y1) continue;
    const rgb = q.L.erupt > 0.5 && q.i === 0 ? '255,120,30' : q.L.lagoon > 0.5 ? (night > 0.5 ? '127,217,208' : '26,163,160') : q.L.veg > 0.3 ? '77,138,53' : '107,101,96';
    softBlob(ctx, x, y, h * 0.03, `rgba(${rgb},0.35)`, 'rgba(0,0,0,0)');
    ctx.fillStyle = `rgb(${rgb})`; ctx.beginPath(); ctx.arc(x, y, h * 0.011, 0, TAU); ctx.fill();
    ctx.strokeStyle = paper; ctx.lineWidth = 1.5; ctx.stroke();
  }
  // legend
  roundLabel(ctx, fs * 0.6, fs * 1.3, 'Age vs distance: the plate speed', fs * 1.05, 'left', ink, null, 600);
  ctx.font = `500 ${fs * 0.85}px ${FONT}`; ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const ly = fs * 3.1; ctx.strokeStyle = ink; ctx.beginPath(); ctx.arc(fs * 1.2, ly, h * 0.008, 0, TAU); ctx.stroke(); ctx.fillText('dated Hawaiian–Emperor volcanoes', fs * 2, ly);
  ctx.fillStyle = '#4d8a35'; ctx.beginPath(); ctx.arc(fs * 1.2, ly + fs * 1.3, h * 0.01, 0, TAU); ctx.fill(); ctx.fillStyle = ink; ctx.fillText('the simulated chain (moves with Stage)', fs * 2, ly + fs * 1.3);
  const bx = X(3520); ctx.strokeStyle = grid; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(bx, y0); ctx.lineTo(bx, y1); ctx.stroke(); ctx.setLineDash([]);
  ctx.fillStyle = ink; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.font = `500 ${fs * 0.8}px ${FONT}`; ctx.fillText('← Hawaiian ridge   |   Emperor seamounts →', bx, y1 - 3);
}

export default {
  id: 'hotspot',
  name: 'Hotspot Chain',
  kind: '2d',
  sky: true,
  params: [
    { id: 'x1', label: 'Plate speed', value: 0.5, tip: 'How fast the plate slides over the plume: spacing of the chain' },
    { id: 'x2', label: 'Plume size', value: 0.5, tip: 'Size of the hotspot plume' },
    { id: 'x3', label: 'Labels', value: 0.8, tip: 'Ages and annotations' },
    { id: 'x4', label: 'Exaggeration', value: 0.5, tip: 'Vertical exaggeration of the islands' },
  ],
  create(ctx, opts) {
    const o = opts || {};
    const fn = o.view === 'oblique' ? renderOblique : o.view === 'map' ? renderMap : o.view === 'chart' ? renderChart : renderConveyor;
    return { render(f) { fn(f, o); } };
  },
};

export const scenes = [
  { id: 'hotspot-conveyor', name: 'Plate Conveyor', tags: ['diagram', 'science', '2d', 'hawaii'],
    desc: 'A plume stays fixed while the plate slides over it, so each island is born over the hotspot and carried away to erode and sink.',
    opts: { view: 'conveyor' }, params: { stage: 0.3, grow: 0.6, activity: 0.5, scale: 0.5, light: 0.85, x1: 0.5, x2: 0.5, x3: 0.8, x4: 0.5 } },
  { id: 'hotspot-oblique', name: 'Chain from the Air', tags: ['3d', 'diagram', '2d', 'hawaii', 'calm'],
    desc: 'An oblique view down the chain: the erupting youngest island in front, greener and lower islands behind, atolls on the horizon.',
    opts: { view: 'oblique' }, params: { stage: 0.35, grow: 0.5, activity: 0.5, scale: 0.5, light: 0.8, x1: 0.5, x2: 0.5, x3: 0.7, x4: 0.6 } },
  { id: 'hotspot-map', name: 'Chain Map', tags: ['map', 'diagram', '2d', 'hawaii'],
    desc: 'Top-down chart of the chain with ages: under 1 Ma over the hotspot, about 5 Ma at Kauaʻi, 28 Ma at Midway.',
    opts: { view: 'map' }, params: { stage: 0.3, grow: 0.6, activity: 0.5, scale: 0.5, light: 0.9, x1: 0.5, x2: 0.5, x3: 0.9, x4: 0.5 } },
  { id: 'hotspot-bend', name: 'The Bend', tags: ['map', 'diagram', '2d', 'hawaii'],
    desc: 'The whole Hawaiian–Emperor chain: past Midway the line of drowned seamounts turns north at the 47-million-year bend, a change in plate motion.',
    opts: { view: 'map', bend: true }, params: { stage: 0.4, grow: 0.6, activity: 0.5, scale: 0.4, light: 0.85, x1: 0.6, x2: 0.5, x3: 0.9, x4: 0.5 } },
  { id: 'hotspot-chart', name: 'Age vs Distance', tags: ['diagram', 'science', 'text', '2d'],
    desc: 'Dated volcanoes plot on a line: distance grows with age at the plate speed, about 86 km per million years, and the simulated islands slide along it.',
    opts: { view: 'chart' }, params: { stage: 0.25, grow: 0.6, activity: 0.5, scale: 0.5, light: 0.9, x1: 0.52, x2: 0.5, x3: 0.8, x4: 0.5 } },
  { id: 'hotspot-speed', name: 'Plate Speed', tags: ['diagram', 'science', '2d', 'sim'],
    desc: 'The conveyor with a ruler: watch the plate carry the islands off the plume at a few centimetres a year, which adds up to hundreds of kilometres in a million years.',
    opts: { view: 'conveyor', ruler: true }, params: { stage: 0.2, grow: 0.8, activity: 0.5, scale: 0.45, light: 0.85, x1: 0.6, x2: 0.5, x3: 0.9, x4: 0.5 } },
  { id: 'hotspot-night', name: 'Chain at Night', tags: ['3d', 'night', '2d', 'lava', 'hawaii'],
    desc: 'The chain after dark: only the youngest island glows, the old ones are dark shapes on the sea.',
    opts: { view: 'oblique' }, params: { stage: 0.4, grow: 0.5, activity: 0.7, scale: 0.55, light: 0.06, x1: 0.5, x2: 0.5, x3: 0.4, x4: 0.6 } },
  { id: 'hotspot-blueprint', name: 'Conveyor Blueprint', tags: ['diagram', 'poster', 'ink', '2d'],
    desc: 'The conveyor as a white-on-blue drafting diagram: plate, plume, islands and the ages of each.',
    opts: { view: 'conveyor', style: 'blueprint' }, params: { stage: 0.35, grow: 0.6, activity: 0.5, scale: 0.5, light: 0.9, x1: 0.5, x2: 0.5, x3: 0.9, x4: 0.6 } },
];
