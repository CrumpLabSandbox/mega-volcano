// Cross-Section: animated geological cutaways of a volcanic island, textbook style. A mantle plume feeds a magma
// chamber, a conduit and dikes; lava flows pile up into a layered shield; the summit collapses into a caldera as the
// chamber empties; the reef grows upward while the island sinks (Darwin). Modes swap the tectonic setting
// (hotspot, island arc / subduction, mid-ocean ridge) or zoom on a part of the system.
import { clamp, lerp, smooth, fract, rng, hash, noise2, fbm2, hsl, mixHex, sky, lavaCss, eruptAmount, daylight, windX, life, STAGES } from '../util.js';
import { lifeHeight } from '../life.js';

const TAU = Math.PI * 2;
const FONT = '"Avenir Next","Helvetica Neue",Helvetica,Arial,system-ui,sans-serif';

// -------- island profile (frame-fraction units: u across, v down) --------
// The edifice at `s` for a given view. Returns summit v and base half-width.
export function dims(view, s, size, exag) {
  const h = lifeHeight(s);
  const peak = view.peak * lerp(0.6, 1.6, size) * lerp(0.6, 1.5, exag);
  const ys = h < 0 ? view.floor + (view.sea - view.floor) * (h + 1) : view.sea - h * peak;
  const grown = smooth(-1, 1, lifeHeight(Math.min(s, 0.5)));
  const Rb = view.halfW * lerp(0.6, 1.6, size) * (0.42 + 0.58 * grown);
  return { ys, Rb, E: view.floor - ys, h };
}
// Surface v at u for stage s. seedN: shape noise. mode: 'shield' | 'strato' | 'ridge'
export function surfaceAt(view, s, u, D, L, seed, mode) {
  const d = (u - view.cx) / D.Rb, r = Math.abs(d);
  if (r >= 1.08) return view.floor;
  let shape;
  if (mode === 'strato') shape = Math.pow(Math.max(0, 1 - r), 1.5) * (1 + 0.15 * r);
  else if (mode === 'ridge') shape = Math.pow(Math.max(0, 1 - r * r), 0.6) * (1 - 0.35 * Math.exp(-d * d * 60));
  else shape = Math.pow(Math.max(0, 1 - r * r), 1.15) * (1 - 0.12 * r);
  shape *= 1 + 0.06 * (noise2(d * 6 + seed * 10, seed) - 0.5);
  let v = view.floor - D.E * Math.max(0, shape);
  // Surtseyan tuff cone: a steep little cone on the summit while it breaches
  const tuff = smooth(0.11, 0.19, s) * (1 - smooth(0.24, 0.4, s));
  if (tuff > 0) v -= tuff * view.peak * 0.55 * Math.max(0, 1 - Math.abs(d) * D.Rb / (view.halfW * 0.22)) * (0.85 + 0.15 * Math.sin(d * 40 + seed));
  // caldera: the summit roof drops over the emptying chamber
  if (L.caldera > 0 && mode !== 'ridge') {
    const cw = mode === 'strato' ? 0.1 : 0.2;
    v += L.caldera * D.E * 0.14 * (1 - smooth(cw * 0.65, cw * 1.15, r)) * (0.92 + 0.08 * noise2(d * 20, seed + 3));
    // cinder cones on the upper flanks
    for (let i = 0; i < 4; i++) {
      const cp = (0.25 + 0.4 * hash(i + 1, seed)) * (i % 2 ? 1 : -1), cr = 0.07;
      v -= smooth(0.5, 0.62, s) * D.E * 0.035 * Math.max(0, 1 - Math.abs(d - cp) / cr);
    }
  }
  if (mode === 'ridge') for (let i = 0; i < 5; i++) {   // crater row along the fissure
    const cp = (i - 2) * 0.1;
    v -= smooth(0.2, 0.4, s) * D.E * 0.08 * Math.max(0, 1 - Math.abs(d - cp) / 0.035) * (1 - 0.6 * (Math.abs(d - cp) < 0.008));
  }
  // erosion: amphitheatre valleys cut into the part above the sea
  if (L.erosion > 0) {
    const depth = view.floor - view.sea, above = Math.max(0, view.sea - v) / depth;
    let cut = 0;
    for (let i = 0; i < 5; i++) { const vp = (hash(i + 11, seed) - 0.5) * 1.5, vw = 0.1 + 0.1 * hash(i + 21, seed); cut += Math.max(0, 1 - Math.abs(d - vp) / vw) ** 1.5; }
    v += L.erosion * Math.min(1, cut) * above * depth * 0.3;
    // sea cliffs: steepen the coast
    v += L.erosion * 0.2 * above * depth * smooth(0.55, 0.95, r);
  }
  return Math.min(view.floor, v);
}

function edificePath(ctx, P, view, s, D, L, seed, mode, n = 90) {
  const u0 = view.cx - D.Rb * 1.1, u1 = view.cx + D.Rb * 1.1;
  const [x0, y0] = P(u0, view.floor + 0.002);
  ctx.moveTo(x0, y0);
  for (let i = 0; i <= n; i++) { const u = lerp(u0, u1, i / n); const [x, y] = P(u, surfaceAt(view, s, u, D, L, seed, mode)); ctx.lineTo(x, y); }
  const [x1, y1] = P(u1, view.floor + 0.002);
  ctx.lineTo(x1, y1); ctx.closePath();
}

// where the surface crosses sea level (u of the right-hand shore), or null
function shoreline(view, s, D, L, seed, mode, side = 1) {
  if (D.ys >= view.sea) return null;
  let lo = view.cx, hi = view.cx + side * D.Rb * 1.1;
  for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (surfaceAt(view, s, m, D, L, seed, mode) < view.sea) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// -------- drawing helpers --------
function roundLabel(ctx, x, y, text, size, align, fg, bg) {
  ctx.font = `500 ${size}px ${FONT}`;
  const w = ctx.measureText(text).width, pad = size * 0.45, hh = size * 1.35;
  const x0 = align === 'right' ? x - w - pad * 2 : align === 'center' ? x - w / 2 - pad : x;
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x0, y - hh / 2, w + pad * 2, hh, size * 0.3); ctx.fill();
  ctx.fillStyle = fg; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + pad, y + size * 0.04);
  return { x0, x1: x0 + w + pad * 2 };
}
function leader(ctx, ax, ay, lx, ly, text, size, col, bg, fg, alpha, align, W) {
  if (alpha <= 0.01) return;
  ctx.font = `500 ${size}px ${FONT}`;
  const tw = ctx.measureText(text).width + size * 0.9, m = size * 0.4;
  if (align === 'left' && lx + tw > W - m) { if (lx - tw > m) align = 'right'; else lx = W - m - tw; }
  if (align === 'right' && lx - tw < m) { if (lx + tw < W - m) align = 'left'; else lx = m + tw; }
  if (align === 'left' && lx < m) lx = m;
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, size * 0.08); ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(ax, ay);
  const ex = align === 'right' ? lx + size * 0.2 : align === 'left' ? lx - size * 0.2 : lx;
  ctx.lineTo(ex, ly); ctx.stroke();
  ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ax, ay, size * 0.18, 0, TAU); ctx.fill();
  roundLabel(ctx, lx, ly, text, size, align, fg, bg);
  ctx.restore();
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

export const VIEWS = {
  hotspot: { cx: 0.5, sea: 0.40, floor: 0.63, halfW: 0.19, peak: 0.19, zoom: 1, fx: 0.5, fy: 0.5 },
  surtsey: { cx: 0.5, sea: 0.47, floor: 0.64, halfW: 0.2, peak: 0.15, zoom: 1.2, fx: 0.5, fy: 0.5 },
  shield:  { cx: 0.5, sea: 0.44, floor: 0.68, halfW: 0.23, peak: 0.2, zoom: 1, fx: 0.5, fy: 0.5 },
  caldera: { cx: 0.5, sea: 0.44, floor: 0.7, halfW: 0.21, peak: 0.2, zoom: 1.1, fx: 0.5, fy: 0.47 },
  darwin:  { cx: 0.5, sea: 0.42, floor: 0.68, halfW: 0.18, peak: 0.17, zoom: 1.1, fx: 0.5, fy: 0.5 },
  arc:     { cx: 0.42, sea: 0.40, floor: 0.6, halfW: 0.12, peak: 0.22, zoom: 1, fx: 0.5, fy: 0.5 },
  ridge:   { cx: 0.5, sea: 0.42, floor: 0.6, halfW: 0.3, peak: 0.14, zoom: 1, fx: 0.5, fy: 0.5 },
  chamber: { cx: 0.5, sea: 0.40, floor: 0.63, halfW: 0.2, peak: 0.19, zoom: 2.3, fx: 0.5, fy: 0.74 },
};

export default {
  id: 'section',
  name: 'Cross-Section',
  kind: '2d',
  sky: true,
  params: [
    { id: 'x1', label: 'Zoom', value: 0.4, tip: 'Camera zoom on the cutaway' },
    { id: 'x2', label: 'Labels', value: 0.8, tip: 'How many labels and leader lines to show' },
    { id: 'x3', label: 'Magma glow', value: 0.6, tip: 'Brightness of the plume, chamber and conduit' },
    { id: 'x4', label: 'Exaggeration', value: 0.5, tip: 'Vertical exaggeration of the edifice' },
  ],
  create(ctx, opts) {
    const mode = opts.mode || 'hotspot';
    const view = VIEWS[mode] || VIEWS.hotspot;
    const prof = mode === 'arc' ? 'strato' : mode === 'ridge' ? 'ridge' : 'shield';
    const layersK = opts.layers || 8;
    let steamSeeds = []; for (let i = 0; i < 40; i++) steamSeeds.push(hash(i * 3.1, 7.7));

    return {
      render(f) {
        const { ctx, w, h, t } = f, p = f.p, L = f.life, s = f.stage;
        const seed = 3.7 + f.epoch * 1.37;
        const dl = daylight(p.light), day = dl.day, night = dl.night;
        const zoom = view.zoom * lerp(0.7, 1.7, p.x1);
        const glow = lerp(0.4, 1.4, p.x3);
        const D = dims(view, s, p.scale, p.x4);
        const P = (u, v) => [w / 2 + (u - view.fx) * zoom * w, h / 2 + (v - view.fy) * zoom * h];
        const S = v => (v) * zoom * h;                     // vertical length in px
        const fs = Math.max(9, h * 0.026);                 // label font size
        const labels = [];                                  // {u,v,text,lu,lv,align,a}
        const lab = (u, v, text, lu, lv, align = 'left', a = 1) => labels.push({ u, v, text, lu, lv, align, a });
        const ink = night > 0.5 ? '#e8e4dc' : '#1b1b1b';
        const labBg = night > 0.5 ? 'rgba(20,22,30,0.82)' : 'rgba(255,255,255,0.86)';
        const erupt = eruptAmount(f);

        // ---- sky (transparent in a combo)
        sky(f);
        const [, seaY] = P(0, view.sea), [, floorY] = P(0, view.floor);

        // ---- deep earth: crust, lithospheric mantle, asthenosphere
        const crustT = S(0.07), lithT = S(0.18);
        const gm = ctx.createLinearGradient(0, floorY, 0, h);
        gm.addColorStop(0, mixHex('#8a7a5e', '#3a3328', night * 0.6)); gm.addColorStop(1, mixHex('#6d5a3f', '#2a2219', night * 0.6));
        ctx.fillStyle = gm; ctx.fillRect(0, floorY, w, h - floorY);
        // asthenosphere: hot, convecting
        const asY = floorY + crustT + lithT;
        const ga = ctx.createLinearGradient(0, asY, 0, h);
        ga.addColorStop(0, mixHex('#b4602c', '#4a2410', night * 0.5)); ga.addColorStop(1, mixHex('#d9772f', '#5c2c10', night * 0.5));
        ctx.fillStyle = ga; ctx.fillRect(0, asY, w, h - asY);
        // lithosphere texture lines
        ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 1;
        for (let k = 0; k < 4; k++) { const y = floorY + crustT + lithT * (k + 1) / 5; ctx.beginPath(); for (let x = 0; x <= w; x += 12) ctx.lineTo(x, y + Math.sin(x * 0.02 + k) * 2); ctx.stroke(); }
        // oceanic crust: basalt + sediment stripes
        ctx.fillStyle = mixHex('#4a4440', '#201d1b', night * 0.6); ctx.fillRect(0, floorY, w, crustT);
        ctx.fillStyle = mixHex('#c9b58a', '#55503f', night * 0.6); ctx.fillRect(0, floorY, w, crustT * 0.22);
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        for (let k = 1; k < 4; k++) { const y = floorY + crustT * (0.22 + 0.78 * k / 4); ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

        // slab for the island arc: an oceanic plate dives under the volcano from the right
        if (mode === 'arc') {
          // the slab: a parallelogram from the trench diving down-left under the arc
          const yTop = view.floor - 0.04, tb = 0.09, du = -0.42, dv = 0.8, len = 1.2, thick = 0.12;
          const B = [0.78, yTop], C = [B[0] + du * len, B[1] + dv * len], C2 = [C[0] + thick, C[1]];
          const q = (C2[1] - (yTop + tb)) / dv, Q = [C2[0] - du * q, yTop + tb];
          ctx.save(); ctx.beginPath();
          for (const [u, v] of [[1.2, yTop], B, C, C2, Q, [1.2, yTop + tb]]) { const [x, y] = P(u, v); ctx.lineTo(x, y); }
          ctx.closePath();
          ctx.fillStyle = mixHex('#55605a', '#232826', night * 0.6); ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
          // water released from the slab (blue) melts the wedge above it: melt blobs (orange) rise to the chamber
          for (let i = 0; i < 10; i++) {
            const q2 = fract(t * 0.05 + i * 0.137), along = 0.3 + 0.2 * hash(i, 2);
            const [bx, by] = P(B[0] + du * along + thick * 0.5, B[1] + dv * along);
            const rise = q2 * S(0.28);
            ctx.globalAlpha = 0.7 * (1 - q2);
            softBlob(ctx, bx + (hash(i, 5) - 0.5) * w * 0.05, by - rise, h * 0.012, q2 < 0.45 ? 'rgba(140,200,255,0.9)' : 'rgba(255,170,60,0.9)', 'rgba(255,170,60,0)');
          }
          ctx.globalAlpha = 1;
          // plate motion arrows
          const [ax0, ay0] = P(0.95, yTop + tb * 0.5);
          arrow(ctx, ax0, ay0, ax0 - w * 0.07, ay0, Math.max(1.5, h * 0.004), 'rgba(255,255,255,0.75)');
          lab(0.9, yTop + tb * 0.5, 'oceanic plate sinks at the trench', 0.8, view.floor + 0.2, 'left');
          lab(0.78, yTop, 'trench', 0.84, view.floor - 0.1, 'left');
          lab(B[0] + du * 0.42 + thick * 0.5, B[1] + dv * 0.42 - 0.06, 'water from the slab melts the mantle: sticky andesite', 0.6, view.floor + 0.42, 'left');
        }

        // ---- mantle plume (hotspot) or ridge upwelling
        const [cxp] = P(view.cx, 0);
        const plumeTop = floorY + crustT * 0.5;
        if (mode !== 'arc') {
          ctx.save();
          const stemW = S(mode === 'ridge' ? 0.08 : 0.055) * lerp(0.7, 1.3, p.scale);
          const pts = [];
          const n = 18;
          for (let i = 0; i <= n; i++) {
            const q = i / n, y = lerp(h + 10, asY - lithT * 0.5, q);
            const wob = (noise2(q * 3 + seed, t * 0.12) - 0.5) * stemW * 0.6;
            const head = mode === 'ridge' ? 1 + 1.6 * smooth(0.55, 1, q) : 1 + 2.6 * Math.pow(smooth(0.55, 1, q), 1.4);
            pts.push([cxp + wob, y, stemW * head * (0.9 + 0.1 * noise2(q * 5, t * 0.2 + 9))]);
          }
          ctx.beginPath();
          pts.forEach(([x, y, r], i) => i ? ctx.lineTo(x + r, y) : ctx.moveTo(x + r, y));
          for (let i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0] - pts[i][2], pts[i][1]);
          ctx.closePath();
          const gp = ctx.createLinearGradient(0, h, 0, asY - lithT * 0.5);
          gp.addColorStop(0, `rgba(255,150,40,${0.75 * glow})`); gp.addColorStop(1, `rgba(255,210,90,${0.95 * glow})`);
          ctx.fillStyle = gp; ctx.fill();
          // rising blobs inside the plume
          for (let i = 0; i < 9; i++) {
            const q = fract(t * 0.045 + i * 0.113 + hash(i, 1) * 0.3), y = lerp(h, asY - lithT * 0.4, q);
            const x = cxp + (hash(i, 3) - 0.5) * stemW * 1.2 * (1 + 1.5 * q * q);
            softBlob(ctx, x, y, stemW * (0.35 + 0.4 * q), `rgba(255,245,180,${0.55 * glow * (1 - q * 0.5)})`, 'rgba(255,220,120,0)');
          }
          // partial melt: ponded under the plate, a thin bright lens
          ctx.restore();
          // melt lens + conduit root through the lithosphere
          const rootY = floorY + crustT + lithT;
          const g2 = ctx.createRadialGradient(cxp, rootY, 0, cxp, rootY, stemW * 2.6);
          g2.addColorStop(0, `rgba(255,220,100,${0.8 * glow})`); g2.addColorStop(1, 'rgba(255,200,80,0)');
          ctx.fillStyle = g2; ctx.beginPath(); ctx.ellipse(cxp, rootY, stemW * 2.6, stemW * 0.9, 0, 0, TAU); ctx.fill();
        }

        // ---- deep water behind the edifice
        {
          const gw0 = ctx.createLinearGradient(0, seaY, 0, floorY);
          gw0.addColorStop(0, `rgb(${50 * day + 8 | 0},${130 * day + 16 | 0},${190 * day + 40 | 0})`); gw0.addColorStop(1, `rgb(${8 * day | 0},${34 * day + 5 | 0},${80 * day + 18 | 0})`);
          ctx.fillStyle = gw0; ctx.fillRect(0, seaY, w, floorY - seaY);
        }
        // ---- the edifice: layered flows (older profiles nested inside), clipped to the current surface
        ctx.save();
        ctx.beginPath(); edificePath(ctx, P, view, s, D, L, seed, prof); ctx.clip();
        const basalt = mixHex('#3e3a36', '#1a1a1c', night * 0.7), basalt2 = mixHex('#4e4842', '#242426', night * 0.7);
        ctx.fillStyle = basalt; ctx.fillRect(0, 0, w, h);
        const sMax = Math.min(s, 0.62);
        for (let k = layersK - 1; k >= 1; k--) {
          const sk = lerp(0.03, sMax, k / layersK);
          const Dk = dims(view, sk, p.scale, p.x4), Lk = life(sk);
          ctx.beginPath(); edificePath(ctx, P, view, sk, Dk, Lk, seed, prof, 60);
          ctx.fillStyle = k % 2 ? basalt2 : basalt; ctx.fill();
          ctx.strokeStyle = sk > 0.5 ? 'rgba(200,90,60,0.5)' : 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
        }
        // hyaloclastite/pillow pile texture on the submerged base: little rounded lobes
        if (mode !== 'ridge') {
          ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
          for (let i = 0; i < 26; i++) {
            const u = view.cx + (hash(i, 9) - 0.5) * 2 * D.Rb * 0.98, v = surfaceAt(view, s, u, D, L, seed, prof);
            if (v < view.sea + 0.01) continue;                 // pillows only form under water
            const [x, y] = P(u, v), r = S(0.008 + 0.006 * hash(i, 13));
            ctx.beginPath(); ctx.arc(x, y + r * 0.5, r, Math.PI, TAU); ctx.fill(); ctx.stroke();
          }
        }
        // vegetation and soil on the dry surface once the volcano is quiet
        if (L.veg > 0.02 && D.ys < view.sea) {
          ctx.lineWidth = Math.max(1.5, S(0.0045)); ctx.strokeStyle = `rgba(70,${130 + 40 * day | 0},50,${L.veg * 0.8})`;
          ctx.beginPath();
          for (let i = 0; i <= 80; i++) { const u = view.cx + (i / 80 - 0.5) * 2 * D.Rb; const v = surfaceAt(view, s, u, D, L, seed, prof); if (v < view.sea - 0.004) { const [x, y] = P(u, v); ctx.lineTo(x, y + ctx.lineWidth * 0.3); } else { ctx.stroke(); ctx.beginPath(); } }
          ctx.stroke();
        }
        // fresh flows on the flank while building: thin glowing lines following the surface
        if (erupt > 0.05 && L.submarine < 0.9 && D.ys < view.sea && mode !== 'chamber') {
          const nflow = 3;
          for (let k = 0; k < nflow; k++) {
            const side = k % 2 ? -1 : 1, ph = fract(t * 0.08 + k * 0.37), len = 0.1 + 0.9 * ph;
            const shore = shoreline(view, s, D, L, seed, prof, side) ?? view.cx + side * D.Rb;
            ctx.strokeStyle = lavaCss(0.95 - ph * 0.5, 0.9 * Math.min(1, erupt) * (1 - L.caldera * 0.7)); ctx.lineWidth = Math.max(1.2, S(0.004));
            ctx.beginPath();
            for (let i = 0; i <= 30; i++) { const u = lerp(view.cx, shore, i / 30 * len); const [x, y] = P(u, surfaceAt(view, s, u, D, L, seed, prof)); ctx.lineTo(x, y - 1); }
            ctx.stroke();
          }
        }
        ctx.restore();

        // ---- magma chamber, conduit and dikes (over the edifice, under the water tint)
        const [cx0] = P(view.cx, 0);
        const chY = floorY + crustT * 0.95 + S(0.03), chR = S(mode === 'chamber' ? 0.085 : 0.06) * lerp(0.7, 1.3, p.scale) * (0.5 + 0.5 * L.erupt) * (1 - 0.35 * L.caldera) * (1 - 0.6 * smooth(0.62, 0.9, s));
        const [, summitY] = P(0, D.ys);
        if (chR > 1 && mode !== 'ridge') {
          const hot = clamp(0.3 + L.erupt) * glow;
          const gch = ctx.createRadialGradient(cx0, chY, 0, cx0, chY, chR * 1.5);
          gch.addColorStop(0, `rgba(255,230,120,${0.95 * hot})`); gch.addColorStop(0.6, `rgba(255,140,40,${0.85 * hot})`); gch.addColorStop(1, 'rgba(200,60,20,0)');
          ctx.fillStyle = gch; ctx.beginPath(); ctx.ellipse(cx0, chY, chR * 1.5, chR, 0, 0, TAU); ctx.fill();
          // convecting melt and crystal mush at the base
          for (let i = 0; i < 14; i++) {
            const a = t * 0.3 * (i % 2 ? 1 : -1) + i * 0.45, rr = chR * (0.3 + 0.5 * hash(i, 4));
            const x = cx0 + Math.cos(a) * rr * 1.4, y = chY + Math.sin(a) * rr * 0.8;
            ctx.fillStyle = i % 3 ? `rgba(255,250,200,${0.35 * hot})` : `rgba(90,60,40,${0.5})`; ctx.beginPath(); ctx.arc(x, y, chR * (i % 3 ? 0.12 : 0.07), 0, TAU); ctx.fill();
          }
          // conduit: brighter when erupting; dikes branch out of it
          const cw = Math.max(1.5, S(0.008) * (0.6 + erupt * 0.6));
          ctx.strokeStyle = lavaCss(0.6 + 0.4 * clamp(erupt), 0.95 * (0.4 + 0.6 * clamp(erupt))); ctx.lineWidth = cw; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(cx0, chY - chR * 0.5); ctx.lineTo(cx0, Math.min(summitY + S(0.003), floorY)); ctx.stroke();
          const r2 = rng(Math.imul(7 + f.epoch, 2654435761));
          const nd = 4 + layersK / 2 | 0;
          for (let i = 0; i < nd; i++) {
            const side = i % 2 ? 1 : -1, y0 = lerp(chY - chR * 0.3, Math.max(summitY, floorY - S(0.06)), r2()), len = S(0.05 + 0.1 * r2()) * (0.5 + 0.5 * smooth(0, 0.3, s)), ang = -0.3 - r2() * 0.8;
            ctx.lineWidth = Math.max(1, cw * 0.35); ctx.strokeStyle = lavaCss(0.35 + 0.3 * clamp(erupt) * (i < 3 ? 1 : 0.2), 0.8);
            ctx.beginPath(); ctx.moveTo(cx0, y0); ctx.lineTo(cx0 + side * Math.cos(ang) * len, y0 + Math.sin(ang) * len * 1.5); ctx.stroke();
          }
          if (mode === 'chamber') {
            lab(view.cx + 0.03, view.floor + 0.09, 'melt: convecting, degassing', view.cx + 0.1, view.floor + 0.02, 'left');
            lab(view.cx - 0.02, view.floor + 0.115, 'crystal mush settles at the base', view.cx - 0.1, view.floor + 0.16, 'right');
            lab(view.cx, view.floor + 0.005, 'conduit to the vent', view.cx + 0.06, view.floor - 0.055, 'left');
            lab(view.cx - 0.045, view.floor - 0.015, 'dike: a sheet of magma in a crack', view.cx - 0.1, view.floor - 0.09, 'right');
            lab(view.cx + 0.09, view.floor + 0.07, 'roof: sags into a caldera when the chamber drains', view.cx + 0.12, view.floor + 0.125, 'left', smooth(0.44, 0.52, s));
            lab(view.cx, view.floor + 0.2, 'melt from the plume feeds the chamber', view.cx + 0.06, view.floor + 0.24, 'left');
          }
        }
        if (mode === 'ridge') {
          // dike swarm up the axis, fissure vents
          const cw = Math.max(1.5, S(0.006));
          for (let i = -4; i <= 4; i++) {
            const [x] = P(view.cx + i * 0.025, 0); const hotn = Math.abs(i) < 2 ? 1 : 0.4;
            ctx.strokeStyle = lavaCss(0.3 + 0.6 * hotn * clamp(erupt), 0.85); ctx.lineWidth = cw * (Math.abs(i) < 2 ? 1 : 0.6);
            ctx.beginPath(); ctx.moveTo(x + (hash(i, 7) - 0.5) * 6, asY); ctx.lineTo(x, Math.min(summitY + S(0.01), floorY - S(0.01) * Math.abs(i))); ctx.stroke();
          }
          // spreading arrows in the crust
          for (const side of [-1, 1]) { const [ax, ay] = P(view.cx + side * 0.08, view.floor + 0.035); arrow(ctx, ax, ay, ax + side * w * 0.07, ay, Math.max(1.5, h * 0.004), 'rgba(255,255,255,0.8)'); }
          lab(view.cx + 0.12, view.floor + 0.035, 'plates pull apart ~2 cm/yr', view.cx + 0.2, view.floor + 0.1, 'left');
          lab(view.cx - 0.075, view.floor - 0.012, 'dike swarm', view.cx - 0.2, view.floor + 0.06, 'right');
          lab(view.cx, view.floor + 0.22, 'upwelling mantle melts as it rises', view.cx + 0.1, view.floor + 0.27, 'left');
          lab(view.cx + 0.1 * D.Rb / view.halfW, D.ys + 0.02, 'crater row along the fissure', view.cx + 0.14, D.ys - 0.07, 'left', smooth(0.22, 0.35, s));
        }

        // ---- water: deep blue behind, tinted wash over the submerged edifice
        const waterTop = `rgba(${60 * day + 8 | 0},${140 * day + 18 | 0},${200 * day + 45 | 0},0.3)`, waterDeep = `rgba(${10 * day | 0},${40 * day + 6 | 0},${90 * day + 20 | 0},0.45)`;
        const gw = ctx.createLinearGradient(0, seaY, 0, floorY); gw.addColorStop(0, waterTop); gw.addColorStop(1, waterDeep);
        ctx.fillStyle = gw; ctx.fillRect(0, seaY, w, floorY - seaY);
        // waves at the surface
        ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.3 * day})`; ctx.lineWidth = Math.max(1, S(0.003));
        ctx.beginPath(); for (let x = 0; x <= w; x += 6) ctx.lineTo(x, seaY + Math.sin(x * 0.03 + t * 1.5) * S(0.003) + Math.sin(x * 0.07 - t * 2.3) * S(0.0015)); ctx.stroke();

        // ---- the reef: a coral cap that keeps up with sea level as the island sinks (Darwin)
        if (L.reef > 0.01 && mode !== 'ridge') {
          const s0 = 0.6, D0 = dims(view, s0, p.scale, p.x4), L0 = life(s0);
          for (const side of [-1, 1]) {
            const u0 = shoreline(view, s0, D0, L0, seed, prof, side); if (u0 == null) continue;
            const rw = D.Rb * (0.09 + 0.06 * L.lagoon), uOut = u0 + side * rw * 0.8, uIn = u0 - side * rw * 0.5;
            ctx.beginPath();
            const n = 14; const topV = view.sea - 0.003 * L.reef;
            for (let i = 0; i <= n; i++) { const u = lerp(uIn, uOut, i / n); const vs = surfaceAt(view, s, u, D, L, seed, prof); const cap = Math.min(vs, lerp(vs, topV, L.reef * (1 - 0.6 * Math.pow(Math.abs(i / n - 0.6) * 2, 2)))); const [x, y] = P(u, i === 0 || i === n ? vs : cap); ctx.lineTo(x, y); }
            for (let i = n; i >= 0; i--) { const u = lerp(uIn, uOut, i / n); const [x, y] = P(u, surfaceAt(view, s, u, D, L, seed, prof) + 0.002); ctx.lineTo(x, y); }
            ctx.closePath();
            const gr = ctx.createLinearGradient(0, seaY - 2, 0, floorY); gr.addColorStop(0, mixHex('#f3e6d2', '#6a6058', night * 0.6)); gr.addColorStop(1, mixHex('#d7b9a6', '#5a4a44', night * 0.6));
            ctx.fillStyle = gr; ctx.fill();
            ctx.strokeStyle = 'rgba(120,70,60,0.5)'; ctx.lineWidth = 1; ctx.stroke();
            // coral texture: tiny arcs
            ctx.strokeStyle = 'rgba(200,100,110,0.45)';
            for (let i = 0; i < 10; i++) { const u = lerp(uIn, uOut, hash(i, side + 20)); const vs = surfaceAt(view, s, u, D, L, seed, prof); const v = lerp(view.sea, vs, hash(i, side + 30) * L.reef); if (v < view.sea) continue; const [x, y] = P(u, v); ctx.beginPath(); ctx.arc(x, y, S(0.004), Math.PI, TAU); ctx.stroke(); }
            // islets (motu) on the reef flat in the atoll stage
            if (L.lagoon > 0.5) { const [x, y] = P(u0 + side * rw * 0.1, view.sea); ctx.fillStyle = mixHex('#f1e3c4', '#5c5444', night * 0.6); ctx.beginPath(); ctx.ellipse(x, y, rw * zoom * w * 0.3, S(0.006) * (L.lagoon - 0.5) * 2, 0, Math.PI, TAU); ctx.fill(); }
          }
          // lagoon: a lighter turquoise pane between reef and shore
          if (L.lagoon > 0.02) {
            for (const side of [-1, 1]) {
              const u0 = shoreline(view, s0, D0, L0, seed, prof, side); if (u0 == null) continue;
              const ush = shoreline(view, s, D, L, seed, prof, side) ?? view.cx;
              const [xa] = P(ush, 0), [xb] = P(u0 - side * D.Rb * 0.04, 0);
              ctx.fillStyle = `rgba(${90 + 60 * day | 0},${200 * day + 20 | 0},${210 * day + 30 | 0},${0.45 * L.lagoon})`;
              ctx.fillRect(Math.min(xa, xb), seaY, Math.abs(xb - xa), S(0.03));
            }
          }
          const u0 = shoreline(view, s0, D0, L0, seed, prof, 1);
          if (u0 != null) {
            const name = L.lagoon > 0.85 ? 'atoll: only the reef remains' : L.lagoon > 0.2 ? 'barrier reef, lagoon behind it' : 'fringing reef against the shore';
            lab(u0 + 0.01, view.sea + 0.012, name, u0 + 0.05, view.sea - 0.1, 'left', L.reef);
            if (mode === 'darwin') {
              lab(u0 + 0.005, view.sea + 0.035, 'coral cap thickens on basalt as the island sinks', u0 + 0.06, view.sea + 0.12, 'left', smooth(0.78, 0.9, s));
              lab(view.cx, Math.max(D.ys + 0.01, view.sea + 0.03), L.lagoon > 0.85 ? 'the volcano has sunk out of sight' : 'the island sinks ~2–3 mm/yr', view.cx - 0.02, view.floor + 0.09, 'right', smooth(0.8, 0.86, s));
            }
          }
        }

        // ---- surface activity
        const vent = P(view.cx, Math.min(D.ys, view.sea));
        const wx = windX(p.wind);
        if (L.submarine > 0.1 && s < 0.2) {
          // discoloured, bubbling water above the submarine vent
          const [vx, vy] = P(view.cx, D.ys);
          const g = ctx.createLinearGradient(0, vy, 0, seaY); g.addColorStop(0, `rgba(200,230,210,${0.35 * L.submarine * (0.3 + L.erupt)})`); g.addColorStop(1, 'rgba(200,230,210,0.02)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(vx - S(0.02), vy); ctx.lineTo(vx + S(0.02), vy); ctx.lineTo(vx + S(0.08) + wx * S(0.03), seaY); ctx.lineTo(vx - S(0.08) + wx * S(0.03), seaY); ctx.fill();
          for (let i = 0; i < 10; i++) { const q = fract(t * 0.25 + hash(i, 44)); const y = lerp(vy, seaY, q); ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - q) * L.submarine})`; ctx.beginPath(); ctx.arc(vx + (hash(i, 45) - 0.5) * S(0.05) * q + wx * q * S(0.03), y, S(0.0025 + 0.002 * q), 0, TAU); ctx.fill(); }
          // glowing pillow lobes being extruded
          ctx.fillStyle = lavaCss(0.8, 0.9 * clamp(erupt)); for (let i = 0; i < 3; i++) { const [x, y] = P(view.cx + (i - 1) * 0.012, D.ys + 0.004); ctx.beginPath(); ctx.arc(x, y, S(0.006), Math.PI, TAU); ctx.fill(); }
        }
        if (L.steam > 0.02) {
          // Surtseyan: black cypressoid tephra jets and white steam
          const [vx, vy] = vent; const k = L.steam * clamp(erupt, 0.3, 1.6);
          ctx.lineCap = 'round';
          for (let j = 0; j < 7; j++) {
            const ph = fract(t * 0.5 + j * 0.143), ang = -Math.PI / 2 + (j - 3) * 0.19 + wx * 0.1, v0 = S(0.26) * k * (0.8 + 0.4 * hash(j, 1));
            ctx.strokeStyle = `rgba(25,22,22,${0.9 * (1 - ph * 0.6)})`; ctx.lineWidth = Math.max(1.5, S(0.005) * (1 - ph * 0.5));
            ctx.beginPath();
            for (let i = 0; i <= 12; i++) { const tt = ph * i / 12 * 1.2; ctx.lineTo(vx + Math.cos(ang) * v0 * tt + wx * S(0.02) * tt * tt, vy + Math.sin(ang) * v0 * tt + S(0.5) * tt * tt); }
            ctx.stroke();
          }
          for (let i = 0; i < 22; i++) {
            const q = fract(t * 0.18 + steamSeeds[i]), r = S(0.015 + 0.05 * q) * k, x = vx + (steamSeeds[(i + 7) % 40] - 0.5) * S(0.1) * (0.3 + q) + wx * q * S(0.18), y = vy - q * S(0.32) * k;
            softBlob(ctx, x, y, r, `rgba(${235 + 20 * day | 0},${235 + 20 * day | 0},${240 + 15 * day | 0},${0.55 * (1 - q)})`, 'rgba(255,255,255,0)');
          }
        }
        if (erupt > 0.05 && L.submarine < 0.5 && L.steam < 0.5) {
          const [vx, vy] = P(view.cx, D.ys);
          if (mode === 'arc') {
            // explosive ash column (sticky andesite)
            for (let i = 0; i < 26; i++) {
              const q = fract(t * 0.12 + hash(i, 61)), r = S(0.012 + 0.05 * q) * clamp(erupt, 0.3, 1.5), x = vx + (hash(i, 62) - 0.5) * S(0.06) * (0.2 + q) + wx * q * q * S(0.3), y = vy - q * S(0.38) * clamp(erupt, 0.3, 1.5);
              softBlob(ctx, x, y, r, `rgba(${110 + 90 * day | 0},${100 + 85 * day | 0},${95 + 80 * day | 0},${0.7 * (1 - q * 0.8)})`, 'rgba(120,110,100,0)');
            }
            // pyroclastic flow hugging the flank
            if (L.explosive > 0.2 || L.erupt > 0.7) for (let i = 0; i < 10; i++) { const q = fract(t * 0.3 + hash(i, 63)); const u = view.cx + q * D.Rb * 0.9 * (i % 2 ? 1 : -1); const [x, y] = P(u, surfaceAt(view, s, u, D, L, seed, prof)); softBlob(ctx, x, y - S(0.006), S(0.012) * (0.5 + q), `rgba(150,140,130,${0.5 * (1 - q)})`, 'rgba(150,140,130,0)'); }
          } else {
            // lava fountain
            const k = clamp(erupt, 0, 1.6) * (1 - L.caldera * 0.6);
            for (let i = 0; i < 24; i++) {
              const q = fract(t * 0.9 + hash(i, 71)), ang = -Math.PI / 2 + (hash(i, 72) - 0.5) * 0.7, v0 = S(0.11) * k * (0.6 + 0.6 * hash(i, 73));
              const x = vx + Math.cos(ang) * v0 * q * 2 + wx * S(0.01) * q, y = vy + Math.sin(ang) * v0 * q * 2 + S(0.14) * q * q;
              if (y > vy + S(0.005)) continue;
              ctx.fillStyle = lavaCss(1 - q * 0.6, 0.95); ctx.beginPath(); ctx.arc(x, y, S(0.0035) * (1 - q * 0.4), 0, TAU); ctx.fill();
            }
            if (night > 0.2) softBlob(ctx, vx, vy, S(0.08) * k, `rgba(255,120,30,${0.45 * night * k})`, 'rgba(255,120,30,0)');
          }
          // caldera-stage explosive puffs
          if (L.explosive > 0.05 && mode !== 'arc') for (let i = 0; i < 12; i++) { const q = fract(t * 0.15 + hash(i, 81)); softBlob(ctx, vx + wx * q * S(0.12) + (hash(i, 82) - 0.5) * S(0.04), vy - q * S(0.2), S(0.01 + 0.03 * q), `rgba(${120 + 80 * day | 0},${115 + 75 * day | 0},${110 + 70 * day | 0},${0.6 * L.explosive * (1 - q)})`, 'rgba(120,110,100,0)'); }
          // laze where lava enters the sea
          if (D.ys < view.sea && L.erupt > 0.45 && mode !== 'arc') for (const side of [-1, 1]) {
            const ush = shoreline(view, s, D, L, seed, prof, side); if (ush == null) continue;
            const [sx] = P(ush, 0);
            for (let i = 0; i < 8; i++) { const q = fract(t * 0.3 + hash(i, side + 90)); softBlob(ctx, sx + wx * q * S(0.06) + side * S(0.01), seaY - q * S(0.09), S(0.008 + 0.02 * q), `rgba(255,255,255,${0.55 * (1 - q) * clamp(erupt)})`, 'rgba(255,255,255,0)'); }
          }
        }

        // ---- labels (built per mode and stage), timeline
        const shoreR = shoreline(view, s, D, L, seed, prof, 1);
        if (mode === 'hotspot' || mode === 'shield' || mode === 'caldera' || mode === 'darwin' || mode === 'surtsey') {
          lab(view.cx, view.floor + 0.3, mode === 'surtsey' ? 'rising basalt magma' : 'mantle plume: hot rock rising, partly melting', view.cx + 0.08, view.floor + 0.33, 'left');
          lab(view.cx + 0.045, view.floor + 0.075, 'magma chamber', view.cx + 0.14, view.floor + 0.11, 'left', mode === 'surtsey' ? 0 : 1);
          lab(view.cx + 0.003, view.floor - 0.01, 'conduit', view.cx + 0.12, view.floor + 0.03, 'left', mode === 'darwin' ? 0.6 : 1);
          lab(0.14, view.floor + 0.035, 'oceanic crust', 0.08, view.floor + 0.1, 'left');
          lab(0.14, view.floor + 0.2, 'lithosphere (rigid plate)', 0.08, view.floor + 0.24, 'left');
          lab(0.14, view.floor + 0.3, 'asthenosphere', 0.08, view.floor + 0.33, 'left', mode === 'hotspot' ? 1 : 0.5);
          lab(0.86, view.sea, 'sea level', 0.86, view.sea - 0.05, 'left');
          lab(view.cx - 0.6 * D.Rb, surfaceAt(view, s, view.cx - 0.6 * D.Rb, D, L, seed, prof), 'pillow lava and hyaloclastite', view.cx - 0.6 * D.Rb - 0.05, view.sea + 0.1 + (view.floor - view.sea) * 0.5, 'right', (1 - smooth(0.18, 0.3, s)) * (D.ys > view.floor - 0.03 ? 0 : 1));
          lab(view.cx, D.ys, 'Surtseyan jets: steam shreds magma into ash', view.cx + 0.08, D.ys - 0.17, 'left', L.steam);
          lab(view.cx + 0.3 * D.Rb, surfaceAt(view, s, view.cx + 0.3 * D.Rb, D, L, seed, prof), 'shield: flow on flow of runny basalt', view.cx + 0.3 * D.Rb + 0.08, D.ys - 0.1, 'left', smooth(0.24, 0.34, s) * (1 - smooth(0.5, 0.56, s)));
          lab(view.cx, D.ys + 0.005, 'caldera: the roof falls into the emptying chamber', view.cx + 0.1, D.ys - 0.12, 'left', L.caldera * (1 - smooth(0.62, 0.72, s)));
          lab(view.cx + 0.45 * D.Rb, surfaceAt(view, s, view.cx + 0.45 * D.Rb, D, L, seed, prof), 'rain carves valleys; forest takes the slopes', view.cx + 0.45 * D.Rb + 0.08, D.ys - 0.09, 'left', smooth(0.62, 0.7, s) * (1 - smooth(0.8, 0.86, s)) * (D.ys < view.sea ? 1 : 0));
          if (shoreR != null && L.erupt > 0.45 && L.steam < 0.3 && s < 0.5) lab(shoreR, view.sea, 'lava meets the sea: new land, laze plume', shoreR + 0.06, view.sea + 0.07, 'left', smooth(0.24, 0.3, s));
          if (mode === 'surtsey') {
            lab(0.86, view.floor, 'sea floor 130 m down (Surtsey, 1963)', 0.86, view.floor + 0.07, 'left');
            lab(view.cx, D.ys + 0.004, 'tuff cone of loose ash: waves erase it unless lava armours it', view.cx + 0.1, view.sea + 0.03, 'left', smooth(0.14, 0.17, s) * (1 - smooth(0.26, 0.34, s)));
          }
          if (mode === 'shield') {
            lab(view.cx + 0.75 * D.Rb, surfaceAt(view, s, view.cx + 0.75 * D.Rb, D, L, seed, prof) - 0.005, 'lava tube carries lava to the coast', view.cx + 0.75 * D.Rb + 0.05, view.sea - 0.14, 'left', smooth(0.26, 0.34, s) * (1 - smooth(0.5, 0.56, s)));
            lab(view.cx - 0.45 * D.Rb, surfaceAt(view, s, view.cx - 0.45 * D.Rb, D, L, seed, prof) + 0.03, 'older flows below, younger above', view.cx - 0.45 * D.Rb - 0.06, view.sea - 0.12, 'right', smooth(0.26, 0.34, s));
            lab(view.cx - 0.7 * D.Rb, view.floor - 0.004, 'the plate bows down under the weight', view.cx - 0.6 * D.Rb, view.floor + 0.15, 'right', smooth(0.3, 0.45, s));
          }
          if (mode === 'caldera') {
            lab(view.cx + 0.06, view.floor + 0.08, L.caldera > 0.3 ? 'chamber drains: supply fades off the hotspot' : 'full chamber', view.cx + 0.15, view.floor + 0.14, 'left');
            lab(view.cx + 0.3 * D.Rb, surfaceAt(view, s, view.cx + 0.3 * D.Rb, D, L, seed, prof), 'cinder cones of gassy, alkalic lava', view.cx + 0.3 * D.Rb + 0.08, D.ys - 0.07, 'left', smooth(0.52, 0.6, s) * (1 - smooth(0.7, 0.8, s)));
          }
        }
        if (mode === 'arc') {
          lab(view.cx + 0.4 * D.Rb, surfaceAt(view, s, view.cx + 0.4 * D.Rb, D, L, seed, prof), 'stratovolcano: steep layers of ash and sticky lava', view.cx + 0.4 * D.Rb + 0.06, D.ys - 0.1, 'left', smooth(0.24, 0.34, s));
            lab(view.cx, D.ys - 0.2, 'explosive eruption, ash column', view.cx + 0.1, D.ys - 0.26, 'left', smooth(0.24, 0.3, s) * clamp(erupt) * (1 - smooth(0.6, 0.7, s)));
          lab(view.cx, view.floor + 0.09, 'magma chamber', view.cx - 0.12, view.floor + 0.14, 'right');
          lab(0.86, view.sea, 'sea level', 0.86, view.sea - 0.06, 'left');
          lab(0.12, view.floor + 0.03, 'overriding plate', 0.06, view.floor + 0.1, 'left');
        }
        if (mode === 'ridge') {
          lab(0.86, view.sea, 'sea level', 0.86, view.sea - 0.06, 'left');
          lab(0.12, view.floor + 0.03, 'new oceanic crust, older with distance', 0.06, view.floor + 0.1, 'left');
          lab(view.cx, D.ys, 'Iceland: a ridge over a hotspot rises above the sea', view.cx + 0.1, D.ys - 0.12, 'left', smooth(0.2, 0.3, s));
        }
        // draw labels
        const labelAmt = p.x2;
        if (labelAmt > 0.02) {
          const col = night > 0.5 ? 'rgba(240,235,225,0.9)' : 'rgba(20,20,20,0.85)';
          const shown = labels.filter((_, i) => (i % 7) / 7 < labelAmt + 0.01);
          for (const l of shown) {
            const [ax, ay] = P(l.u, l.v), [lx, ly] = P(l.lu, l.lv);
            if (ly < fs || ly > h - fs * 2.6) continue;
            leader(ctx, ax, ay, lx, ly, l.text, fs, col, labBg, ink, l.a * Math.min(1, labelAmt * 3), l.align, w);
          }
        }
        // timeline
        const tlY = h - fs * 1.5, tlX0 = w * 0.06, tlW = w * 0.88;
        ctx.fillStyle = night > 0.5 ? 'rgba(10,12,18,0.7)' : 'rgba(255,255,255,0.75)';
        ctx.beginPath(); ctx.roundRect(tlX0 - fs, tlY - fs * 1.1, tlW + fs * 2, fs * 2.2, fs * 0.4); ctx.fill();
        ctx.font = `500 ${fs * 0.72}px ${FONT}`; ctx.textBaseline = 'middle';
        for (let i = 0; i < STAGES.length; i++) {
          const a = STAGES[i].at, b = i + 1 < STAGES.length ? STAGES[i + 1].at : 1, x0 = tlX0 + a * tlW, x1 = tlX0 + b * tlW;
          const on = L.index === i;
          ctx.fillStyle = on ? (night > 0.5 ? '#ffb347' : '#d9531e') : (night > 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)');
          ctx.fillRect(x0 + 1, tlY - fs * 0.22, x1 - x0 - 2, fs * 0.44);
          ctx.fillStyle = on ? (night > 0.5 ? '#fff' : '#1b1b1b') : (night > 0.5 ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)');
          ctx.textAlign = 'center';
          const short = ['seamount', 'breach', 'shield', 'caldera', 'erosion', 'sinking', 'atoll'][i];
          if (x1 - x0 > ctx.measureText(short).width + 4) ctx.fillText(short, (x0 + x1) / 2, tlY + fs * 0.65);
        }
        ctx.fillStyle = night > 0.5 ? '#fff' : '#1b1b1b'; ctx.beginPath(); ctx.moveTo(tlX0 + s * tlW, tlY - fs * 0.6); ctx.lineTo(tlX0 + s * tlW - fs * 0.3, tlY - fs * 1.0); ctx.lineTo(tlX0 + s * tlW + fs * 0.3, tlY - fs * 1.0); ctx.fill();
        // title
        ctx.font = `600 ${fs * 1.05}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
        const title = `${L.index + 1}. ${L.name}`;
        roundLabel(ctx, fs * 0.6, fs * 1.2, title, fs * 1.05, 'left', ink, labBg);
      },
    };
  },
};

export const scenes = [
  { id: 'section-hotspot', name: 'Hotspot Anatomy', tags: ['diagram', 'science', '2d', 'hawaii'],
    desc: 'A mantle plume melts under the plate and feeds a magma chamber, conduit and dikes that build a layered shield on the sea floor.',
    opts: { mode: 'hotspot' }, params: { stage: 0.38, grow: 0.5, activity: 0.5, scale: 0.5, light: 0.85, x1: 0.4, x2: 0.8, x3: 0.6, x4: 0.5 } },
  { id: 'section-surtsey', name: 'Surtsey Is Born', tags: ['diagram', 'science', '2d', 'surtseyan', 'eruption'],
    desc: 'A vent in shallow water: sea water flashing to steam shreds the magma into ash jets and piles up a tuff cone, as at Surtsey in 1963.',
    opts: { mode: 'surtsey' }, params: { stage: 0.16, grow: 0.3, activity: 0.6, scale: 0.45, light: 0.7, x1: 0.45, x2: 0.9, x3: 0.5, x4: 0.6 } },
  { id: 'section-shield', name: 'Shield Layers', tags: ['diagram', 'science', '2d', 'lava', 'hawaii'],
    desc: 'Flow after flow of runny basalt stacks into a broad shield; lava tubes feed deltas where lava meets the sea.',
    opts: { mode: 'shield', layers: 12 }, params: { stage: 0.42, grow: 0.5, activity: 0.6, scale: 0.6, light: 0.9, x1: 0.35, x2: 0.8, x3: 0.6, x4: 0.6 } },
  { id: 'section-caldera', name: 'Caldera Collapse', tags: ['diagram', 'science', '2d', 'eruption'],
    desc: 'Carried off the hotspot, the chamber drains and the summit roof drops into it; the last gassy lava builds cinder cones.',
    opts: { mode: 'caldera' }, params: { stage: 0.56, grow: 0.4, activity: 0.5, scale: 0.55, light: 0.8, x1: 0.45, x2: 0.8, x3: 0.7, x4: 0.6 } },
  { id: 'section-darwin', name: "Darwin's Reef", tags: ['diagram', 'science', '2d', 'atoll', 'calm'],
    desc: 'Coral keeps pace with sea level as the dead volcano sinks: fringing reef, then barrier reef and lagoon, then an atoll on a coral cap over basalt, as drilling at Enewetak showed.',
    opts: { mode: 'darwin' }, params: { stage: 0.84, grow: 0.5, activity: 0.3, scale: 0.55, light: 0.9, x1: 0.45, x2: 0.9, x3: 0.3, x4: 0.6 } },
  { id: 'section-arc', name: 'Island Arc', tags: ['diagram', 'science', '2d', 'eruption'],
    desc: 'Subduction: water wrung from a sinking plate melts the mantle into sticky andesite that builds a steep, explosive stratovolcano behind the trench.',
    opts: { mode: 'arc' }, params: { stage: 0.4, grow: 0.5, activity: 0.6, scale: 0.5, light: 0.8, x1: 0.4, x2: 0.8, x3: 0.6, x4: 0.5 } },
  { id: 'section-ridge', name: 'Iceland Fissure', tags: ['diagram', 'science', '2d', 'lava'],
    desc: 'A mid-ocean ridge on a hotspot: plates pull apart, a dike swarm feeds a row of craters along the fissure, and the ridge stands above the sea.',
    opts: { mode: 'ridge' }, params: { stage: 0.36, grow: 0.5, activity: 0.6, scale: 0.6, light: 0.75, x1: 0.4, x2: 0.8, x3: 0.6, x4: 0.6 } },
  { id: 'section-chamber', name: 'Magma Chamber', tags: ['diagram', 'science', '2d', 'lava'],
    desc: 'Close up on the chamber: convecting melt over settling crystal mush, dikes cracking out of its walls and the conduit up to the vent.',
    opts: { mode: 'chamber', layers: 10 }, params: { stage: 0.45, grow: 0.3, activity: 0.6, scale: 0.6, light: 0.8, x1: 0.5, x2: 0.9, x3: 0.8, x4: 0.5 } },
  { id: 'section-night', name: 'Night Section', tags: ['diagram', 'science', '2d', 'night', 'lava'],
    desc: 'The same hotspot cutaway after dark: the plume, chamber and fountain glow while the labels go light on dark.',
    opts: { mode: 'hotspot' }, params: { stage: 0.4, grow: 0.5, activity: 0.7, scale: 0.5, light: 0.05, x1: 0.4, x2: 0.6, x3: 0.9, x4: 0.5 } },
];
