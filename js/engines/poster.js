// Posters: animated graphic posters of the island's life. WPA screenprint, 1930s art deco, Bauhaus primitives,
// Swiss grid with big type, Memphis pattern, risograph two-colour misregistration, constructivist diagonal and a
// minimalist circle-and-triangle. Titles name the stage ("SURTSEY 1963" at the breach, "ATOLL" at the end).
import { clamp, lerp, smooth, fract, hash, rng, buffer, sky, mixHex } from '../util.js';
import { TAU, island, eruption, surfacePath, capPath, climbPath, puffs, jets, fountain, flows, reefPoints, motus, birds, boat, nightAmt, goldAmt, mixc } from './_shared2d.js';

const TITLES = {
  seamount: ['SEAMOUNT', 'A VOLCANO IS BORN ON THE SEA FLOOR'],
  breach:   ['SURTSEY 1963', 'A NEW ISLAND RISES FROM THE SEA'],
  shield:   ['SHIELD VOLCANO', 'RIVERS OF FIRE BUILD NEW LAND'],
  caldera:  ['THE CALDERA', 'THE SUMMIT FALLS IN · CINDER CONES'],
  erosion:  ['GREEN VALLEYS', 'RAIN, WAVES AND THE FIRST FOREST'],
  sinking:  ['BARRIER REEF', 'THE ISLAND SINKS · THE REEF KEEPS PACE'],
  atoll:    ['ATOLL', 'ONLY THE RING OF CORAL REMAINS · DARWIN 1842'],
};
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif', DECO = 'Futura, "Avenir Next", "Gill Sans", "Century Gothic", sans-serif', BLACK = '"Arial Black", Impact, sans-serif';

const PAL = {
  wpa:      { paper: '#efe3c3', ink: '#1f2a2a', a: '#1c6b6a', b: '#e07b2a', c: '#d9b23f', d: '#6b3b2a', sea: '#2a6a7a', sea2: '#1c4f5e', island: '#6b3b2a', island2: '#3f2a22', veg: '#3f7a4a', veg2: '#2a5a38', lava: '#e8502a', smoke: '#efe3c3', tephra: '#1f2a2a' },
  deco:     { paper: '#f2e6c8', ink: '#1b2440', a: '#c9a24a', b: '#1b2440', c: '#b3402c', d: '#5d6f8a', sea: '#1b2440', sea2: '#2d3b63', island: '#2d3b63', island2: '#1b2440', veg: '#3c6b5a', veg2: '#2b4f43', lava: '#c9a24a', smoke: '#e4d4ad', tephra: '#1b2440' },
  bauhaus:  { paper: '#f1ede4', ink: '#141414', a: '#d8232a', b: '#f2c400', c: '#1f4fb5', d: '#141414', sea: '#1f4fb5', sea2: '#1f4fb5', island: '#141414', island2: '#141414', veg: '#141414', veg2: '#141414', lava: '#d8232a', smoke: '#f1ede4', tephra: '#141414' },
  swiss:    { paper: '#ffffff', ink: '#111111', a: '#e2001a', b: '#111111', c: '#111111', d: '#888888', sea: '#111111', sea2: '#111111', island: '#111111', island2: '#111111', veg: '#111111', veg2: '#111111', lava: '#e2001a', smoke: '#bbbbbb', tephra: '#111111' },
  memphis:  { paper: '#fdf5e6', ink: '#111111', a: '#ff6fa5', b: '#2ad1c9', c: '#ffd93b', d: '#7d5bd6', sea: '#2ad1c9', sea2: '#1aa7a0', island: '#ff6fa5', island2: '#e04f86', veg: '#8fe36a', veg2: '#4fbf5a', lava: '#ff3d2e', smoke: '#ffffff', tephra: '#111111' },
  riso:     { paper: '#f5efe2', ink: '#1d3fa8', a: '#ff48a5', b: '#1d3fa8', c: '#ff48a5', d: '#1d3fa8', sea: '#1d3fa8', sea2: '#1d3fa8', island: '#ff48a5', island2: '#ff48a5', veg: '#1d3fa8', veg2: '#1d3fa8', lava: '#ff48a5', smoke: '#1d3fa8', tephra: '#1d3fa8' },
  constr:   { paper: '#e9dfc7', ink: '#141414', a: '#c81e1e', b: '#141414', c: '#e9dfc7', d: '#6b6b6b', sea: '#e9dfc7', sea2: '#141414', island: '#141414', island2: '#141414', veg: '#141414', veg2: '#141414', lava: '#c81e1e', smoke: '#e9dfc7', tephra: '#141414' },
  minimal:  { paper: '#f4f1ea', ink: '#1a1a1a', a: '#f0a030', b: '#1a1a1a', c: '#2a4a6a', d: '#999999', sea: '#2a4a6a', sea2: '#2a4a6a', island: '#1a1a1a', island2: '#1a1a1a', veg: '#2f6b4f', veg2: '#2f6b4f', lava: '#f0652a', smoke: '#cfcac0', tephra: '#1a1a1a' },
};

// letter-spaced text (canvas letterSpacing isn't everywhere)
function spaced(g, str, x, y, size, font, color, { align = 'left', spacing = 0.08, weight = 700, style = '' } = {}) {
  g.font = `${style} ${weight} ${size}px ${font}`; g.fillStyle = color; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  const sp = size * spacing; let total = 0; const ws = [];
  for (const ch of str) { const w = g.measureText(ch).width; ws.push(w); total += w + sp; } total -= sp;
  let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
  let i = 0; for (const ch of str) { g.fillText(ch, cx, y); cx += ws[i++] + sp; }
  return total;
}
function fitSize(g, str, maxW, font, weight = 700) { g.font = `${weight} 100px ${font}`; const w = g.measureText(str).width; return Math.min(1e9, 100 * maxW / Math.max(1, w)); }

export default {
  id: 'poster',
  name: 'Posters',
  kind: '2d',
  params: [
    { id: 'x1', label: 'Title size', value: 0.5, tip: 'How big the lettering is' },
    { id: 'x2', label: 'Grain', value: 0.5, tip: 'Print grain and misregistration' },
    { id: 'x3', label: 'Palette', value: 0.5, tip: 'Shifts the poster colours around the hue wheel' },
    { id: 'x4', label: 'Shapes', value: 0.5, tip: 'Amount of decorative geometry' },
  ],
  create(ctx, opts) {
    const mode = opts.mode || 'wpa', base = PAL[mode] || PAL.wpa;
    let grain = null, grainKey = '', layA = null, layB = null;
    const grainTex = (w, h) => {
      const key = w + 'x' + h; if (grainKey === key) return grain;
      const b = buffer(w, h), g = b.ctx, R = rng(3), n = Math.round(w * h / 6);
      for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${R() < 0.6 ? '30,20,20' : '255,255,255'},${R() * 0.3})`; g.fillRect(R() * w, R() * h, 1, 1); }
      grain = b.canvas; grainKey = key; return grain;
    };
    // hue-shifted palette
    let palKey = -1, pal = base;
    const palette = x3 => {
      if (palKey === x3) return pal;
      const shift = (x3 - 0.5) * 2; palKey = x3; pal = {};
      for (const k in base) {
        if (k === 'paper' || k === 'ink' || Math.abs(shift) < 0.02) { pal[k] = base[k]; continue; }
        const v = parseInt(base[k].slice(1), 16), r = v >> 16, g = v >> 8 & 255, b = v & 255;
        // rotate hue by mixing channels (cheap, no HSL round-trip)
        const t = Math.abs(shift), rr = shift > 0 ? lerp(r, g, t) : lerp(r, b, t), gg = shift > 0 ? lerp(g, b, t) : lerp(g, r, t), bb = shift > 0 ? lerp(b, r, t) : lerp(b, g, t);
        pal[k] = `rgb(${rr | 0},${gg | 0},${bb | 0})`;
      }
      return pal;
    };

    // The island picture in flat shapes. C maps a role to a colour (riso layers use this to split inks).
    function picture(f, isl, E, C, o = {}) {
      const { ctx: g, w, h, t, p } = f, L = f.life, X = isl.X, Y = isl.Y;
      const none = c => c === 'none';
      // sea
      if (!none(C('sea'))) {
        g.fillStyle = C('sea'); g.fillRect(0, isl.sea, w, h - isl.sea);
        if (!none(C('sea2')) && o.bands !== false) { g.fillStyle = C('sea2'); for (let i = 0; i < 5; i++) { const y = isl.sea + h * (0.05 + i * 0.07); g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += w / 24) g.lineTo(x, y + Math.sin(x / h * 8 + t * 1.5 + i) * h * 0.008); g.lineTo(w, y + h * 0.02); g.lineTo(0, y + h * 0.02); g.closePath(); g.fill(); } }
        if (E.bubbles > 0.02 && !none(C('smoke'))) { g.fillStyle = C('smoke'); g.globalAlpha = 0.7 * E.bubbles; g.beginPath(); g.ellipse(isl.summit.x, isl.sea + h * 0.012, isl.hw * 0.22, h * 0.014, 0, 0, TAU); g.fill(); for (let i = 0; i < 8; i++) { const a = fract(t * 0.4 + hash(i, 31)); g.beginPath(); g.arc(isl.summit.x + (hash(i, 32) - 0.5) * isl.hw * 0.3, isl.sea + h * 0.05 - a * h * 0.04, h * 0.003 + a * h * 0.004, 0, TAU); g.fill(); } g.globalAlpha = 1; }
        if (L.reef > 0.02) { const rp = reefPoints(isl); if (!none(C('smoke'))) { g.fillStyle = C('smoke'); g.globalAlpha = 0.35 * L.reef * (0.4 + 0.6 * L.lagoon); g.beginPath(); g.ellipse((rp[0].x + rp[1].x) / 2, isl.sea + h * 0.006, (rp[1].x - rp[0].x) / 2, h * 0.02 + isl.unit * 0.02 * L.lagoon, 0, 0, TAU); g.fill(); g.globalAlpha = L.reef; for (const r of rp) for (let k = -2; k <= 2; k++) { g.beginPath(); g.arc(r.x + k * h * 0.012, isl.sea + h * 0.002, h * 0.006, Math.PI, 0); g.fill(); } g.globalAlpha = 1; } }
      }
      // island
      if (L.height > -0.02 && !none(C('island'))) {
        g.save(); g.beginPath(); g.rect(0, 0, w, isl.sea + h * 0.004); g.clip();
        g.fillStyle = C('island'); g.beginPath(); surfacePath(g, isl, -1.3, 1.3, isl.sea + h * 0.004, 70); g.fill();
        g.save(); g.beginPath(); surfacePath(g, isl, -1.3, 1.3, isl.sea + h * 0.004, 70); g.clip();
        if (!none(C('island2'))) { g.fillStyle = C('island2'); g.beginPath(); g.moveTo(isl.cx, -h); g.lineTo(w + h, -h); g.lineTo(w + h, h * 2); g.lineTo(isl.cx + h * 0.02, h * 2); g.closePath(); g.fill(); }
        const fresh = (1 - smooth(0.5, 0.66, L.stage)) * (1 - L.submarine) * 0.85 + L.steam * 0.7;
        if (fresh > 0.05 && !none(C('tephra'))) { g.globalAlpha = clamp(fresh); g.fillStyle = C('tephra'); g.beginPath(); capPath(g, isl, 0.55, isl.unit * 0.4 + h * 0.03); g.fill(); g.globalAlpha = 1; }
        if (L.veg > 0.03 && !none(C('veg'))) {
          const climb = isl.sea - clamp(L.veg * 1.3) * (isl.sea - isl.summit.y + h * 0.05);
          g.save(); g.beginPath(); climbPath(g, w, h, climb, h * 0.015, f.epoch); g.clip();
          g.fillStyle = C('veg'); g.beginPath(); surfacePath(g, isl, -1.3, 1.3, isl.sea, 60); g.fill();
          if (!none(C('veg2'))) { g.fillStyle = C('veg2'); g.beginPath(); g.moveTo(isl.cx, -h); g.lineTo(w + h, -h); g.lineTo(w + h, h * 2); g.lineTo(isl.cx + h * 0.02, h * 2); g.closePath(); g.fill(); }
          g.restore();
          if (L.erosion > 0.05) { g.strokeStyle = C('island2') === 'none' ? C('island') : C('island2'); g.globalAlpha = L.erosion * 0.8; g.lineWidth = Math.max(1, h * 0.004); for (let i = 0; i < 6; i++) { const u = (i / 5 - 0.5) * 1.2 + 0.05; const y0 = Y(u); if (y0 < isl.sea - h * 0.03) { g.beginPath(); g.moveTo(X(u), y0 + h * 0.015); g.quadraticCurveTo(X(u * 1.08), (y0 + isl.sea) / 2, X(u * 1.2), isl.sea); g.stroke(); } } g.globalAlpha = 1; }
        }
        if (!none(C('lava'))) for (const fl of flows(f, isl, E.flows, 3)) { g.strokeStyle = C('lava'); g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = h * (0.008 + 0.012 * E.flows); g.beginPath(); fl.pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }
        if (L.caldera > 0.1 && !none(C('tephra'))) { g.fillStyle = E.glow > 0.2 && !none(C('lava')) ? C('lava') : C('tephra'); g.beginPath(); g.ellipse(isl.summit.x, Y(0) + h * 0.006, isl.hw * 0.1 * L.caldera, h * 0.007, 0, 0, TAU); g.fill(); }
        g.restore(); g.restore();
      }
      // motu
      if (!none(C('island'))) for (const m of motus(isl)) { g.globalAlpha = m.vis; g.fillStyle = C('island'); g.beginPath(); g.ellipse(m.x, m.y, m.w, m.h * 1.4, 0, Math.PI, TAU); g.fill(); for (let k = 0; k < m.palms; k++) { const px = m.x + (k / Math.max(1, m.palms - 1) - 0.5) * m.w, s = h * 0.035; g.strokeStyle = C('island'); g.lineWidth = Math.max(1, h * 0.004); g.beginPath(); g.moveTo(px, m.y); g.lineTo(px + m.side * s * 0.3, m.y - s); g.stroke(); g.fillStyle = none(C('veg')) ? C('island') : C('veg'); g.beginPath(); g.ellipse(px + m.side * s * 0.3, m.y - s, s * 0.45, s * 0.22, 0, 0, TAU); g.fill(); } g.globalAlpha = 1; }
      // eruption
      const sx = isl.summit.x, sy = Math.min(isl.summit.y, isl.sea), n = Math.round(6 + p.detail * 8);
      if (E.jets > 0.02 && !none(C('tephra'))) { g.strokeStyle = C('tephra'); g.fillStyle = C('tephra'); g.lineCap = 'round'; for (const j of jets(f, sx, isl.sea - h * 0.004, E.jets, 7)) { g.lineWidth = j.w * 2.2; g.beginPath(); j.pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); const tip = j.pts[j.pts.length - 1]; g.beginPath(); g.arc(tip[0], tip[1], j.w * 2.2, 0, TAU); g.fill(); } }
      if (E.jets > 0.02 && !none(C('smoke'))) { g.fillStyle = C('smoke'); for (const q of puffs(f, n, sx, isl.sea - h * 0.03, { rate: 0.4, rise: 0.24, drift: 0.22, spread: 0.1, r0: 0.028, seed: 3 })) { if (q.a > 0.85) continue; g.beginPath(); g.arc(q.x, q.y, q.r, 0, TAU); g.fill(); } }
      if (E.fountain > 0.02 && !none(C('lava'))) { g.fillStyle = C('lava'); for (const b of fountain(f, sx, sy, E.fountain, 10 + Math.round(p.detail * 10))) { g.beginPath(); g.ellipse(b.x, b.y, b.r * 1.4, b.r * 2.4, 0, 0, TAU); g.fill(); } }
      if ((E.fountain > 0.02 || E.burst > 0.02) && !none(C('smoke'))) { g.fillStyle = C('smoke'); for (const q of puffs(f, n, sx, sy - h * 0.04, { rate: 0.28, rise: 0.34, drift: 0.3, spread: 0.1, r0: 0.032, seed: 7 })) { if (q.a > 0.85) continue; g.globalAlpha = o.smokeAlpha ?? 1; g.beginPath(); g.arc(q.x, q.y, q.r, 0, TAU); g.fill(); } g.globalAlpha = 1; }
      if (E.entry > 0.02 && !none(C('smoke'))) { g.fillStyle = C('smoke'); for (const fl of flows(f, isl, E.flows, 3)) if (fl.ends) for (const q of puffs(f, Math.round(n * 0.5), fl.x, isl.sea, { rate: 0.5, rise: 0.13, drift: 0.1, spread: 0.05, r0: 0.016, seed: 20 + fl.i })) { if (q.a > 0.85) continue; g.beginPath(); g.arc(q.x, q.y, q.r, 0, TAU); g.fill(); } }
      if (E.quiet > 0.3 && L.height > 0.1 && !none(C('smoke'))) { g.fillStyle = C('smoke'); g.globalAlpha = 0.8 * E.quiet; for (const q of puffs(f, 3, sx, sy - h * 0.02, { rate: 0.1, rise: 0.06, drift: 0.12, spread: 0.03, r0: 0.02, seed: 30 })) { if (q.a > 0.85) continue; g.beginPath(); g.arc(q.x, q.y, q.r, 0, TAU); g.fill(); } g.globalAlpha = 1; }
    }

    const sunAt = (f, isl) => ({ x: f.w * (isl.wind < 0 ? 0.25 : 0.72), y: f.h * (0.16 + (1 - f.p.light) * 0.25) });

    return {
      render(f) {
        const { ctx: g, w, h, t, p } = f, L = f.life;
        const P = palette(p.x3), night = nightAmt(f);
        const [title, sub] = TITLES[L.id];
        const isl = island(f, { horizon: mode === 'swiss' ? 0.72 : mode === 'minimal' ? 0.66 : 0.62, cx: mode === 'swiss' || mode === 'constr' ? 0.62 : 0.5 });
        const E = eruption(f, isl);
        const sun = sunAt(f, isl), TS = 0.5 + p.x1;
        const paperCol = mode === 'minimal' ? mixc(P.paper, '#1d2233', night) : P.paper;
        const C = role => P[role];
        g.lineJoin = 'round';

        // ---- background (paper) and sky decoration
        sky(f, (c, w, h) => {
          c.fillStyle = paperCol; c.fillRect(0, 0, w, h);
          if (mode === 'wpa') { const gr = c.createLinearGradient(0, 0, 0, isl.sea); gr.addColorStop(0, mixc(P.a, P.paper, 0.15 + night * 0.1)); gr.addColorStop(1, mixc(P.c, P.paper, 0.4)); c.fillStyle = gr; c.fillRect(0, 0, w, isl.sea);
            for (let i = 4; i >= 0; i--) { c.fillStyle = mixc(P.c, P.paper, 0.2 + i * 0.16); c.beginPath(); c.arc(sun.x, sun.y, h * (0.07 + i * 0.045), 0, TAU); c.fill(); }
            for (let i = 0; i < 3; i++) { const cx = fract(t * 0.008 * (i + 1) + hash(i, 4)) * w * 1.3 - w * 0.15, cy = h * (0.1 + hash(i, 5) * 0.25), r = h * 0.035; c.fillStyle = mixc(P.paper, '#ffffff', 0.5); c.beginPath(); c.ellipse(cx, cy, r * 2.6, r * 0.9, 0, 0, TAU); c.ellipse(cx - r, cy - r * 0.5, r * 1.2, r, 0, 0, TAU); c.ellipse(cx + r * 0.6, cy - r * 0.6, r * 1.5, r * 1.1, 0, 0, TAU); c.fill(); }
          }
          if (mode === 'deco') { // sunburst rays from behind the mountain, in gold on navy sky band
            const gr = c.createLinearGradient(0, 0, 0, isl.sea); gr.addColorStop(0, mixc(P.b, P.paper, 0.15)); gr.addColorStop(1, mixc(P.b, P.paper, 0.6)); c.fillStyle = gr; c.fillRect(0, 0, w, isl.sea);
            c.fillStyle = P.a; c.globalAlpha = 0.75; const n = 10 + Math.round(p.x4 * 14); for (let i = 0; i < n; i++) { const a0 = Math.PI + i / n * Math.PI + t * 0.02, a1 = a0 + Math.PI / n * 0.5; c.beginPath(); c.moveTo(isl.cx, isl.sea); c.lineTo(isl.cx + Math.cos(a0) * h * 3, isl.sea + Math.sin(a0) * h * 3); c.lineTo(isl.cx + Math.cos(a1) * h * 3, isl.sea + Math.sin(a1) * h * 3); c.closePath(); c.fill(); } c.globalAlpha = 1;
            c.fillStyle = P.a; c.beginPath(); c.arc(isl.cx, isl.sea - isl.unit * 0.9, h * 0.11, 0, TAU); c.fill(); c.fillStyle = mixc(P.b, P.paper, 0.4); c.beginPath(); c.arc(isl.cx, isl.sea - isl.unit * 0.9, h * 0.085, 0, TAU); c.fill();
          }
          if (mode === 'bauhaus') { c.fillStyle = P.b; c.beginPath(); c.arc(sun.x, sun.y, h * 0.12, 0, TAU); c.fill(); c.strokeStyle = P.ink; c.lineWidth = h * 0.004; c.beginPath(); for (let i = 1; i < 6; i++) { c.moveTo(w * i / 6, 0); c.lineTo(w * i / 6, h); } for (let i = 1; i < 4; i++) { c.moveTo(0, h * i / 4); c.lineTo(w, h * i / 4); } c.globalAlpha = 0.25 + p.x4 * 0.4; c.stroke(); c.globalAlpha = 1; }
          if (mode === 'memphis') { // confetti, squiggles and a striped band
            const R = rng(11); c.lineWidth = h * 0.006; c.lineCap = 'round';
            const n = Math.round(10 + p.x4 * 30);
            for (let i = 0; i < n; i++) { const x = R() * w, y = R() * isl.sea, k = R(), col = [P.a, P.b, P.c, P.d, P.ink][i % 5]; c.fillStyle = col; c.strokeStyle = col;
              if (k < 0.35) { c.beginPath(); c.arc(x, y, h * 0.012, 0, TAU); c.fill(); }
              else if (k < 0.7) { c.save(); c.translate(x, y); c.rotate(R() * 3 + t * 0.2); c.beginPath(); c.moveTo(-h * 0.03, 0); for (let j = 0; j <= 6; j++) c.lineTo(-h * 0.03 + j * h * 0.01, (j % 2 ? -1 : 1) * h * 0.008); c.stroke(); c.restore(); }
              else { c.save(); c.translate(x, y); c.rotate(R() * 3); c.beginPath(); c.moveTo(-h * 0.015, h * 0.015); c.lineTo(h * 0.015, -h * 0.015); c.lineTo(h * 0.015, h * 0.015); c.closePath(); c.fill(); c.restore(); } }
            c.fillStyle = P.ink; for (let i = 0; i < 9; i++) c.fillRect(w * 0.05 + i * h * 0.03, h * 0.05, h * 0.012, h * 0.2);
            c.fillStyle = P.c; c.beginPath(); c.arc(sun.x, sun.y, h * 0.08, 0, TAU); c.fill(); c.strokeStyle = P.ink; c.lineWidth = h * 0.006; c.stroke();
          }
          if (mode === 'constr') { // the red diagonal wedge
            c.fillStyle = P.a; c.beginPath(); c.moveTo(0, h); c.lineTo(w * 0.55, 0); c.lineTo(w, 0); c.lineTo(w, h * 0.25); c.closePath(); c.fill();
            c.fillStyle = P.ink; c.beginPath(); c.arc(w * 0.78, h * 0.25, h * 0.12, 0, TAU); c.fill(); c.fillStyle = P.paper; c.beginPath(); c.arc(w * 0.78, h * 0.25, h * 0.1, 0, TAU); c.fill(); c.fillStyle = P.a; c.beginPath(); c.arc(w * 0.78, h * 0.25, h * 0.06, 0, TAU); c.fill();
          }
          if (mode === 'minimal') { c.fillStyle = night > 0.5 ? '#f4efd8' : P.a; c.beginPath(); c.arc(sun.x, sun.y, h * 0.1, 0, TAU); c.fill(); }
          if (mode === 'swiss') { c.fillStyle = P.a; c.fillRect(0, 0, w, h * 0.012); }
        });

        // ---- the picture
        if (mode === 'riso') {
          // two inks printed separately and slightly out of register, with multiply
          const off = h * (0.002 + 0.01 * p.x2);
          if (!layA || layA.canvas.width !== w || layA.canvas.height !== h) { layA = buffer(w, h); layB = buffer(w, h); }
          for (const [lay, inkA] of [[layA, true], [layB, false]]) {
            const c = lay.ctx; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
            const f2 = { ...f, ctx: c };
            const Cl = role => inkA ? (['sea', 'sea2', 'veg', 'veg2', 'smoke'].includes(role) ? P.b : 'none') : (['island', 'island2', 'lava', 'tephra'].includes(role) ? P.a : 'none');
            picture(f2, isl, E, Cl, { bands: false });
            if (inkA) { c.fillStyle = P.b; c.beginPath(); c.arc(sun.x, sun.y, h * 0.09, 0, TAU); c.fill(); c.globalAlpha = 0.35; for (let i = 0; i < 8; i++) { const y = isl.sea + h * (0.04 + i * 0.045); c.fillRect(0, y, w, h * 0.012); } c.globalAlpha = 1; }
            // grain within the ink
            c.save(); c.globalCompositeOperation = 'destination-out'; c.globalAlpha = 0.5 * p.x2; c.drawImage(grainTex(w, h), 0, 0); c.restore();
          }
          g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.9;
          g.drawImage(layA.canvas, -off * 0.7, off * 0.4); g.drawImage(layB.canvas, off, -off * 0.6);
          g.restore();
          // a few halftone-ish dots in the sea as a third texture
        } else if (mode === 'bauhaus' || mode === 'constr') {
          // primitives: a triangle for the mountain, a bar for the sea, circles for the plume
          const hgt = Math.max(0, L.height) * isl.unit * (mode === 'constr' ? 1.7 : 1.3), half = isl.hw * lerp(0.35, 1, smooth(0, 0.45, L.stage)) * 0.9;
          g.fillStyle = P.sea; g.fillRect(0, isl.sea, w, h - isl.sea);
          if (mode === 'constr') { g.fillStyle = P.ink; for (let i = 0; i < 7; i++) g.fillRect(0, isl.sea + h * (0.03 + i * 0.05) + Math.sin(t + i) * h * 0.004, w, h * 0.008 + i * h * 0.002); }
          if (mode === 'bauhaus') { g.fillStyle = P.b; g.globalAlpha = 0.5 + 0.5 * L.reef; g.fillRect(0, isl.sea, w, h * 0.012); g.globalAlpha = 1; }
          if (L.height > 0.01) {
            g.fillStyle = P.island; g.beginPath(); g.moveTo(isl.cx - half, isl.sea); g.lineTo(isl.cx + half, isl.sea);
            if (L.caldera > 0.1) { g.lineTo(isl.cx + half * 0.12, isl.sea - hgt); g.lineTo(isl.cx - half * 0.12, isl.sea - hgt); } else g.lineTo(isl.cx, isl.sea - hgt);
            g.closePath(); g.fill();
            if (L.veg > 0.05) { g.fillStyle = mode === 'bauhaus' ? P.c : P.a; g.globalAlpha = L.veg; g.beginPath(); g.moveTo(isl.cx - half, isl.sea); g.lineTo(isl.cx + half, isl.sea); g.lineTo(isl.cx, isl.sea - hgt * 0.5); g.closePath(); g.fill(); g.globalAlpha = 1; }
            const flowsOn = E.flows > 0.05; if (flowsOn) { g.fillStyle = P.lava; const fw = half * 0.08 * (1 + E.flows); g.beginPath(); g.moveTo(isl.cx - fw, isl.sea - hgt * 0.95); g.lineTo(isl.cx + fw, isl.sea - hgt * 0.95); g.lineTo(isl.cx + half * 0.45 + fw, isl.sea); g.lineTo(isl.cx + half * 0.45 - fw * 2, isl.sea); g.closePath(); g.fill(); }
          } else if (E.bubbles > 0.02) { g.fillStyle = P.paper; g.globalAlpha = 0.6; g.beginPath(); g.arc(isl.cx, isl.sea, h * 0.03 * E.bubbles, Math.PI, 0); g.fill(); g.globalAlpha = 1; }
          const sy = isl.sea - hgt, n = Math.round(4 + p.detail * 5), plume = E.jets + E.fountain + E.burst;
          if (plume > 0.05) { for (const q of puffs(f, n, isl.cx, sy, { rate: 0.3, rise: 0.3, drift: 0.3, spread: 0.06, r0: 0.03, seed: 7 })) { if (q.a > 0.85) continue; g.fillStyle = E.jets > 0.1 ? P.ink : (q.i % 2 ? P.smoke : (mode === 'bauhaus' ? P.a : P.a)); g.beginPath(); g.arc(q.x, q.y, q.r, 0, TAU); g.fill(); if (mode === 'bauhaus') { g.strokeStyle = P.ink; g.lineWidth = h * 0.004; g.stroke(); } } }
          if (E.fountain > 0.05) { g.fillStyle = P.lava; g.beginPath(); g.moveTo(isl.cx - h * 0.015, sy); g.lineTo(isl.cx + h * 0.015, sy); g.lineTo(isl.cx, sy - h * (0.1 + 0.15 * E.fountain) * (0.8 + 0.2 * Math.sin(t * 5))); g.closePath(); g.fill(); }
          if (E.jets > 0.05) { g.strokeStyle = P.ink; g.lineWidth = h * 0.012; g.lineCap = 'round'; for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.35, len = h * (0.1 + 0.15 * E.jets) * (0.6 + 0.4 * fract(t * 0.7 + i * 0.3)); g.beginPath(); g.moveTo(isl.cx, isl.sea); g.lineTo(isl.cx + Math.cos(a) * len, isl.sea + Math.sin(a) * len); g.stroke(); } }
          for (const m of motus(isl)) { g.globalAlpha = m.vis; g.fillStyle = P.island; g.fillRect(m.x - m.w, m.y - m.h * 1.5, m.w * 2, m.h * 1.5); g.globalAlpha = 1; }
          if (L.reef > 0.1 && mode === 'bauhaus') { const rp = reefPoints(isl); g.strokeStyle = P.c; g.lineWidth = h * 0.01; g.globalAlpha = L.reef; g.beginPath(); g.moveTo(rp[0].x, isl.sea + h * 0.02); g.lineTo(rp[1].x, isl.sea + h * 0.02); g.stroke(); g.globalAlpha = 1; }
        } else {
          picture(f, isl, E, C, { smokeAlpha: mode === 'swiss' ? 0.9 : 1 });
          if (mode === 'deco') { // stylised repeating waves over the sea
            g.strokeStyle = P.a; g.lineWidth = h * 0.006; const r = h * 0.05;
            for (let row = 0; row < 4; row++) { const y = isl.sea + h * 0.06 + row * h * 0.08, xo = (row % 2) * r + (t * h * 0.02 * (row % 2 ? 1 : -1)) % (2 * r); for (let x = -2 * r + xo; x < w + 2 * r; x += 2 * r) { g.beginPath(); g.arc(x, y, r, Math.PI, 0); g.stroke(); } }
          }
          if (mode === 'minimal') { g.strokeStyle = P.ink; g.lineWidth = h * 0.004; g.beginPath(); g.moveTo(0, isl.sea); g.lineTo(w, isl.sea); g.stroke(); }
          if (mode === 'memphis') { // zig-zag sea stripes and outlines
            g.strokeStyle = P.ink; g.lineWidth = h * 0.006; for (let i = 0; i < 5; i++) { const y = isl.sea + h * (0.06 + i * 0.07); g.beginPath(); for (let x = 0; x <= w; x += h * 0.03) g.lineTo(x, y + ((x / (h * 0.03) + i + Math.floor(t * 2)) % 2 ? -1 : 1) * h * 0.012); g.stroke(); }
            if (L.height > 0) { g.strokeStyle = P.ink; g.lineWidth = h * 0.008; g.beginPath(); for (let i = 0; i <= 70; i++) { const u = -1.3 + 2.6 * i / 70; const y = isl.Y(u); if (y < isl.sea) i ? g.lineTo(isl.X(u), y) : g.moveTo(isl.X(u), y); else g.moveTo(isl.X(u), isl.sea); } g.stroke(); }
          }
        }

        // ---- print grain (only on painted pixels, so a combo sky stays clear)
        if (p.x2 > 0.03 && mode !== 'swiss' && mode !== 'minimal') { g.save(); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = p.x2 * (mode === 'riso' ? 0.5 : 0.8); g.drawImage(grainTex(w, h), 0, 0); g.restore(); }

        // ---- typography and frame
        const m = h * 0.04;
        if (mode === 'wpa') {
          const band = h * 0.2 * TS; g.fillStyle = P.ink; g.fillRect(0, h - band, w, band); g.fillStyle = P.c; g.fillRect(0, h - band, w, h * 0.008);
          const size = Math.min(fitSize(g, title, w * 0.85, SANS, 800), band * 0.5);
          spaced(g, title, w / 2, h - band * 0.42, size, SANS, P.paper, { align: 'center', spacing: 0.06, weight: 800 });
          spaced(g, sub, w / 2, h - band * 0.16, Math.min(size * 0.3, band * 0.18), SANS, P.c, { align: 'center', spacing: 0.15, weight: 600 });
          g.strokeStyle = P.ink; g.lineWidth = h * 0.012; g.strokeRect(0, 0, w, h);
        }
        if (mode === 'deco') {
          g.fillStyle = P.b; g.fillRect(0, 0, w, h * 0.028 * TS); g.fillStyle = P.a; g.fillRect(0, h * 0.028 * TS, w, h * 0.006);
          const size = Math.min(fitSize(g, title, w * 0.7, DECO, 700), h * 0.13 * TS);
          g.fillStyle = P.b; g.fillRect(0, h - h * 0.24 * TS, w, h * 0.24 * TS); g.fillStyle = P.a; g.fillRect(0, h - h * 0.24 * TS, w, h * 0.006);
          spaced(g, title, w / 2, h - h * 0.11 * TS, size, DECO, P.a, { align: 'center', spacing: 0.3, weight: 700 });
          spaced(g, sub, w / 2, h - h * 0.045 * TS, Math.min(size * 0.26, h * 0.03), DECO, P.paper, { align: 'center', spacing: 0.25, weight: 500 });
        }
        if (mode === 'bauhaus') {
          const size = Math.min(h * 0.11 * TS, fitSize(g, title, h * 0.9, SANS, 800));
          g.save(); g.translate(w * 0.06, h * 0.95); g.rotate(-Math.PI / 2); spaced(g, title.toLowerCase(), 0, 0, size, SANS, P.ink, { spacing: -0.02, weight: 800 }); g.restore();
          g.fillStyle = P.a; g.fillRect(w * 0.08, h * 0.06, h * 0.02, h * 0.3);
          spaced(g, sub.toLowerCase(), w * 0.12, h * 0.1, h * 0.022, SANS, P.ink, { spacing: 0.02, weight: 500 });
        }
        if (mode === 'swiss') {
          const size = Math.min(h * 0.26 * TS, fitSize(g, title, w * 0.92, SANS, 700));
          g.font = `700 ${size}px ${SANS}`; g.fillStyle = P.ink; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(title, w * 0.04, h * 0.12 + size * 0.8);
          g.fillStyle = P.a; g.fillRect(w * 0.04, h * 0.12 + size * 0.95, w * 0.12, h * 0.006);
          g.font = `400 ${h * 0.026}px ${SANS}`; g.fillStyle = P.ink;
          const y0 = h * 0.12 + size * 1.05 + h * 0.04, words = sub.split(' · ');
          words.forEach((s, i) => g.fillText(s, w * 0.04, y0 + i * h * 0.04));
          g.fillText(`${(L.stage * 100).toFixed(0).padStart(2, '0')} / 100`, w * 0.04, h * 0.95); g.fillStyle = P.d; g.fillText('MEGA-VOLCANO · ISLAND LIFE CYCLE', w * 0.3, h * 0.95);
        }
        if (mode === 'memphis') {
          const size = Math.min(h * 0.14 * TS, fitSize(g, title, w * 0.6, BLACK, 900));
          g.save(); g.translate(w * 0.05, h * 0.4); g.rotate(-0.08);
          spaced(g, title, h * 0.012, h * 0.012, size, BLACK, P.d, { spacing: 0.02, weight: 900 }); spaced(g, title, 0, 0, size, BLACK, P.c, { spacing: 0.02, weight: 900 });
          g.restore();
          spaced(g, sub, w * 0.05, h * 0.47, h * 0.028, BLACK, P.ink, { spacing: 0.05, weight: 900 });
          g.strokeStyle = P.ink; g.lineWidth = h * 0.012; g.beginPath(); for (let x = 0; x <= w; x += h * 0.04) g.lineTo(x, h - h * 0.02 + ((x / (h * 0.04)) % 2 ? -1 : 1) * h * 0.012); g.stroke();
        }
        if (mode === 'riso') {
          const size = Math.min(h * 0.12 * TS, fitSize(g, title, w * 0.9, BLACK, 900));
          g.save(); g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.9;
          spaced(g, title, w * 0.05 + h * 0.006, h * 0.17 - h * 0.004, size, BLACK, P.a, { spacing: 0.04, weight: 900 }); spaced(g, title, w * 0.05, h * 0.17, size, BLACK, P.b, { spacing: 0.04, weight: 900 });
          spaced(g, sub, w * 0.05, h * 0.17 + h * 0.045, h * 0.026, SANS, P.b, { spacing: 0.1, weight: 700 });
          g.restore();
        }
        if (mode === 'constr') {
          const size = Math.min(h * 0.15 * TS, fitSize(g, title, w * 0.7, BLACK, 900));
          g.save(); g.translate(w * 0.08, h * 0.6); g.rotate(-0.42);
          spaced(g, title, h * 0.012, h * 0.012, size, BLACK, P.paper, { spacing: 0.02, weight: 900 });
          spaced(g, title, 0, 0, size, BLACK, P.ink, { spacing: 0.02, weight: 900 });
          g.fillStyle = P.ink; g.fillRect(0, h * 0.02, w * 0.45, h * 0.012);
          spaced(g, sub, 0, h * 0.075, h * 0.026, SANS, P.ink, { spacing: 0.08, weight: 700 }); g.restore();
        }
        if (mode === 'minimal') {
          const size = h * 0.03 * TS;
          spaced(g, title, m, h - m, size, SANS, night > 0.5 ? '#eee' : P.ink, { spacing: 0.3, weight: 500 });
          spaced(g, sub.split(' · ')[0], w - m, h - m, size * 0.6, SANS, P.d, { align: 'right', spacing: 0.2, weight: 400 });
        }
      },
    };
  },
};

export const scenes = [
  { id: 'poster-wpa', name: 'National Park Print', tags: ['poster', 'art', '2d', 'text', 'retro', 'hawaii'], desc: 'A WPA-style screenprint with a flat limited palette, ringed sun and bold park-poster lettering naming the stage.',
    opts: { mode: 'wpa' }, params: { stage: 0.4, grow: 0.5, activity: 0.6, scale: 0.55, light: 0.75, x1: 0.5, x2: 0.5, x3: 0.5, x4: 0.5 } },
  { id: 'poster-deco', name: 'Art Deco Voyage', tags: ['poster', 'art', '2d', 'text', 'retro'], desc: '1930s travel poster: gold sunburst behind the peak, geometric waves and wide-spaced Futura capitals.',
    opts: { mode: 'deco' }, params: { stage: 0.47, grow: 0.5, activity: 0.5, scale: 0.6, light: 0.6, x1: 0.5, x2: 0.4, x3: 0.5, x4: 0.6 } },
  { id: 'poster-bauhaus', name: 'Bauhaus Primitives', tags: ['poster', 'abstract', '2d', 'text'], desc: 'Triangle, circle and bar in red, yellow and blue on a grid, with vertical type; the Surtseyan breach as geometry.',
    opts: { mode: 'bauhaus' }, params: { stage: 0.17, grow: 0.6, activity: 0.7, scale: 0.55, light: 0.9, x1: 0.5, x2: 0.3, x3: 0.5, x4: 0.5 } },
  { id: 'poster-swiss', name: 'Swiss Grid', tags: ['poster', '2d', 'text', 'atoll'], desc: 'International-style poster: huge Helvetica, a red rule, the island as a black silhouette, ending at ATOLL.',
    opts: { mode: 'swiss' }, params: { stage: 0.9, grow: 0.5, activity: 0.5, scale: 0.5, light: 0.9, x1: 0.5, x2: 0.2, x3: 0.5, x4: 0.3 } },
  { id: 'poster-memphis', name: 'Memphis Pattern', tags: ['poster', 'art', '2d', 'text', 'retro', 'eruption'], desc: 'Eighties Memphis: squiggles, confetti, striped bands and a pink island with a hard black outline.',
    opts: { mode: 'memphis' }, params: { stage: 0.33, grow: 0.6, activity: 0.7, scale: 0.55, light: 0.9, x1: 0.5, x2: 0.3, x3: 0.5, x4: 0.6 } },
  { id: 'poster-riso', name: 'Risograph', tags: ['poster', 'art', '2d', 'text', 'paper', 'lava'], desc: 'Two-colour riso print in fluorescent pink and blue, out of register, with heavy grain.',
    opts: { mode: 'riso' }, params: { stage: 0.38, grow: 0.5, activity: 0.6, scale: 0.55, light: 0.9, x1: 0.5, x2: 0.7, x3: 0.5, x4: 0.5 } },
  { id: 'poster-constr', name: 'Constructivist', tags: ['poster', 'abstract', '2d', 'text', 'eruption'], desc: 'Red diagonal wedge, black geometry and slanted heavy type; the mountain reduced to a triangle.',
    opts: { mode: 'constr' }, params: { stage: 0.42, grow: 0.6, activity: 0.8, scale: 0.6, light: 0.9, x1: 0.5, x2: 0.4, x3: 0.5, x4: 0.5 } },
  { id: 'poster-minimal', name: 'Circle and Triangle', tags: ['poster', 'abstract', '2d', 'calm', 'text'], desc: 'Minimalist: a sun disc, a mountain triangle and a horizon line on warm paper, with a tiny caption.',
    opts: { mode: 'minimal' }, params: { stage: 0.55, grow: 0.4, activity: 0.5, scale: 0.6, light: 0.35, x1: 0.5, x2: 0, x3: 0.5, x4: 0.3 } },
];
