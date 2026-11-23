// Paper & craft: a layered cut-paper diorama, origami facets, felt with stitching, stained glass with leading,
// mosaic tiles, paper quilling coils and a kirigami shadow-box lit from behind. Every scene is the same set of
// paper pieces (sky, island layers, wave strips, plume) drawn with a different craft treatment.
import { clamp, lerp, smooth, fract, hash, rng, buffer, sky, mixHex } from '../util.js';
import { TAU, island, eruption, surfacePath, capPath, climbPath, puffs, jets, fountain, flows, reefPoints, motus, birds, boat, nightAmt, goldAmt, mixc } from './_shared2d.js';

const STYLES = {
  diorama:  { top: '#bfe0f2', bot: '#eaf5fb', sun: '#ffd166', cloud: '#ffffff', sea: ['#2f7fb8', '#3f94cc', '#5aaede', '#7cc4ea'], rock: '#8c6a5a', rock2: '#6b4e42', far: '#b9a39a', green: '#7cc270', green2: '#4f9a50', sand: '#f3e2b0', smoke: '#f6f3ee', ash: '#5a5560', lava: '#ff7a3d', lava2: '#ffb347', tephra: '#2e2a33', shadow: 'rgba(30,20,40,0.28)' },
  origami:  { top: '#f4f1ea', bot: '#f9f7f2', sun: '#f7b733', cloud: '#ffffff', sea: ['#2b6cb0', '#3b82c4', '#5aa0d8', '#8cc0e8'], rock: '#9c7363', rock2: '#7a5547', far: '#c8b7ad', green: '#79b865', green2: '#55944a', sand: '#efe0b4', smoke: '#f2f0ec', ash: '#6b6670', lava: '#f26b3a', lava2: '#ffb347', tephra: '#2f2c33', shadow: 'rgba(0,0,0,0.18)', facets: 1 },
  felt:     { top: '#9fd3ee', bot: '#d2ecf8', sun: '#ffd23f', cloud: '#fdfdfd', sea: ['#2a6fb5', '#3a86c9', '#5ea3d8', '#86bde3'], rock: '#8d5f4b', rock2: '#6f4436', far: '#b59a90', green: '#6cbf5c', green2: '#43933f', sand: '#f6e3a6', smoke: '#f5f2ee', ash: '#5d5962', lava: '#ff6a3d', lava2: '#ffc04d', tephra: '#2c2830', shadow: 'rgba(40,30,30,0.25)', felt: 1, thread: '#fff5d6' },
  stained:  { top: '#3a6fd8', bot: '#8fd0f2', sun: '#ffd84a', cloud: '#eef6ff', sea: ['#1b4ea3', '#2667c2', '#3b86d8', '#62a9e6'], rock: '#9c5a3c', rock2: '#6e3a28', far: '#b48a74', green: '#4fa83c', green2: '#2f7d2a', sand: '#f6d47c', smoke: '#f4f4f8', ash: '#55505c', lava: '#ff4e1f', lava2: '#ffb020', tephra: '#2a2328', shadow: 'rgba(0,0,0,0)', lead: '#15110f', glass: 1 },
  mosaic:   { top: '#8fc1e8', bot: '#dcefff', sun: '#f5c242', cloud: '#ffffff', sea: ['#1f5fa8', '#2c78c0', '#4a95d2', '#73b3e0'], rock: '#8a6150', rock2: '#5f3e33', far: '#b09688', green: '#6ab85a', green2: '#3f8f3c', sand: '#efdca2', smoke: '#f1ede6', ash: '#5a5660', lava: '#ff6f3a', lava2: '#ffb347', tephra: '#2c282f', shadow: 'rgba(0,0,0,0)', tiles: 1 },
  quilling: { top: '#f3ebdd', bot: '#f8f3ea', sun: '#f7b733', cloud: '#ffffff', sea: ['#2e6fb3', '#3f86c6', '#62a4d8', '#8ec0e6'], rock: '#9a6a56', rock2: '#74493b', far: '#c4ad9f', green: '#78bb64', green2: '#4e9449', sand: '#efdfae', smoke: '#f4f0e8', ash: '#6a6570', lava: '#f5713c', lava2: '#ffb347', tephra: '#332d33', shadow: 'rgba(0,0,0,0)', coils: 1 },
  kirigami: { top: '#0d1230', bot: '#2a1f52', sun: '#fff1c4', cloud: '#2a3366', sea: ['#141a3c', '#1b2450', '#242e62', '#2f3a74'], rock: '#1a1430', rock2: '#120e22', far: '#2d2650', green: '#1c1a3a', green2: '#17142e', sand: '#4a4060', smoke: '#5a5a8c', ash: '#2b2744', lava: '#ff8a3a', lava2: '#ffd36a', tephra: '#0d0a18', shadow: 'rgba(0,0,0,0.5)', night: 1 },
};

// Quantised colour cache for sprite tiles
const spriteCache = new Map();
function coilSprite(r, g, b, size) {
  const key = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4) + ',' + size;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const bf = buffer(size, size), c = bf.ctx, cx = size / 2;
  c.fillStyle = `rgb(${r},${g},${b})`; c.beginPath(); c.arc(cx, cx, cx - 0.5, 0, TAU); c.fill();
  c.strokeStyle = `rgba(0,0,0,0.28)`; c.lineWidth = Math.max(0.8, size * 0.07); c.beginPath();
  for (let a = 0; a < TAU * 3.2; a += 0.25) { const rr = (cx - 1) * a / (TAU * 3.2); c.lineTo(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr); } c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = Math.max(0.6, size * 0.05); c.beginPath(); c.arc(cx, cx, cx - 1, Math.PI * 1.1, Math.PI * 1.6); c.stroke();
  spriteCache.set(key, bf.canvas); return bf.canvas;
}

export default {
  id: 'papercut',
  name: 'Paper & Craft',
  kind: '2d',
  params: [
    { id: 'x1', label: 'Layers', value: 0.5, tip: 'Depth of the layered paper: shadow offset and parallax' },
    { id: 'x2', label: 'Sway', value: 0.5, tip: 'How much the layers rock, as if the diorama were nudged' },
    { id: 'x3', label: 'Texture', value: 0.5, tip: 'Paper grain, felt fuzz, tile size, glass sparkle' },
    { id: 'x4', label: 'Props', value: 0.5, tip: 'Clouds, birds, boats and palms' },
  ],
  create(ctx, opts) {
    const mode = opts.mode || 'diorama', st = STYLES[mode] || STYLES.diorama;
    let tex = null, texKey = '', low = null;
    const textures = (w, h) => {
      const key = w + 'x' + h; if (texKey === key) return tex;
      const b = buffer(w, h), g = b.ctx, R = rng(5), n = Math.round(w * h / 14);
      for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,255,255' : '40,30,30'},${R() * 0.18})`; g.fillRect(R() * w, R() * h, 1, 1); }
      const fz = buffer(16, 16), fg = fz.ctx; for (let i = 0; i < 90; i++) { fg.fillStyle = `rgba(255,255,255,${0.15 + R() * 0.3})`; fg.fillRect(R() * 16, R() * 16, 1, 1); }
      tex = { grain: b.canvas, fuzz: ctx.createPattern(fz.canvas, 'repeat') }; texKey = key; return tex;
    };

    // One paper piece. build(g) adds a closed path. depth 0 (back) .. 1 (front) sets the drop shadow and parallax.
    function piece(f, g, build, fill, depth, o = {}) {
      const { h, t, p } = f;
      const sway = (o.sway ?? 1) * Math.sin(t * 0.7 + depth * 2) * h * 0.012 * p.x2 * (0.3 + depth);
      g.save(); g.translate(sway, 0);
      if (st.shadow !== 'rgba(0,0,0,0)' && !o.noShadow) {
        const off = h * (0.004 + 0.016 * p.x1) * (0.4 + depth);
        g.save(); g.translate(off * 0.6, off); g.beginPath(); build(g); g.fillStyle = st.shadow; g.fill(); g.restore();
      }
      g.beginPath(); build(g); g.fillStyle = fill; g.fill();
      if (st.facets && o.facets) { // origami: light and dark triangular facets fanned from the apex
        g.save(); g.clip(); const [ax, ay] = o.facets, n = 7;
        for (let i = 0; i < n; i++) { const x0 = ax - h * 1.2 + i / n * h * 2.4, x1 = x0 + h * 2.4 / n; g.beginPath(); g.moveTo(ax, ay); g.lineTo(x0, ay + h); g.lineTo(x1, ay + h); g.closePath(); g.fillStyle = i % 2 ? 'rgba(255,255,255,0.16)' : 'rgba(0,0,0,0.14)'; g.fill(); }
        g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1; g.beginPath(); for (let i = 0; i <= n; i++) { g.moveTo(ax, ay); g.lineTo(ax - h * 1.2 + i / n * h * 2.4, ay + h); } g.stroke();
        g.restore();
      }
      if (st.felt) { // fuzzy edge and a running stitch inside the edge
        if (o.stitch !== false) { g.save(); g.clip(); g.fillStyle = tex.fuzz; g.globalAlpha = 0.4 * p.x3; g.beginPath(); build(g); g.fill(); g.globalAlpha = 1; g.restore(); }
        g.beginPath(); build(g); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = h * 0.012 * p.x3 + 1; g.lineJoin = 'round'; g.stroke();
        if (o.stitch !== false) { g.setLineDash([h * 0.012, h * 0.008]); g.lineDashOffset = -t * h * 0.01; g.strokeStyle = o.thread || st.thread; g.lineWidth = Math.max(1, h * 0.004); g.stroke(); g.setLineDash([]); }
      }
      if (st.glass) { // stained glass: inner light gradient and black leading
        g.save(); g.clip(); const gr = g.createLinearGradient(0, 0, f.w, h); gr.addColorStop(0, 'rgba(255,255,255,0.22)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.18)'); g.fillStyle = gr; g.fillRect(0, 0, f.w, h);
        if (o.leads) { g.strokeStyle = st.lead; g.lineWidth = h * 0.005; g.beginPath(); for (const [x0, y0, x1, y1] of o.leads) { g.moveTo(x0, y0); g.lineTo(x1, y1); } g.stroke(); }
        g.restore();
        g.beginPath(); build(g); g.strokeStyle = st.lead; g.lineWidth = h * (0.006 + 0.006 * p.x1); g.lineJoin = 'round'; g.stroke();
      }
      if (st.night && o.lit !== false) { g.beginPath(); build(g); g.strokeStyle = `rgba(255,200,140,${0.1 + depth * 0.25})`; g.lineWidth = Math.max(1, h * 0.003); g.stroke(); }
      if (mode === 'diorama' && p.x3 > 0.1) { g.beginPath(); build(g); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1; g.stroke(); }
      g.restore();
    }

    function drawPuffPiece(f, g, q, fill, depth) {
      piece(f, g, c => { c.moveTo(q.x + q.r, q.y); c.arc(q.x, q.y, q.r, 0, TAU); c.moveTo(q.x - q.r * 0.6 + q.r * 0.7, q.y + q.r * 0.2); c.arc(q.x - q.r * 0.6, q.y + q.r * 0.2, q.r * 0.7, 0, TAU); c.moveTo(q.x + q.r * 0.6 + q.r * 0.65, q.y + q.r * 0.25); c.arc(q.x + q.r * 0.6, q.y + q.r * 0.25, q.r * 0.65, 0, TAU); }, fill, depth, { stitch: false, sway: 0.3 });
    }

    // The whole picture in paper pieces. flat = true draws without craft treatments (used for tile sampling).
    function paint(f, flat) {
      const { ctx: g, w, h, t, p } = f, L = f.life;
      const isl = island(f, { horizon: 0.64 });
      const E = eruption(f, isl);
      const night = st.night ? Math.max(0.8, nightAmt(f)) : nightAmt(f), gold = goldAmt(f);
      const X = isl.X, Y = isl.Y, dk = (c, k = 0.6) => st.night ? c : mixc(c, '#101428', night * k);
      const P = flat ? (ff, gg, build, fill) => { gg.beginPath(); build(gg); gg.fillStyle = fill; gg.fill(); } : piece;
      g.lineJoin = 'round';

      // ---- sky
      sky(f, (c, w, h) => {
        let top = st.top, bot = st.bot;
        if (!st.night) { top = mixHex(top, '#0e1230', night * 0.8); bot = mixHex(bot, '#262a52', night * 0.8); if (gold > 0) { top = mixHex(top, '#b07bb8', gold * 0.5); bot = mixHex(bot, '#ffc48a', gold * 0.8); } }
        const gr = c.createLinearGradient(0, 0, 0, isl.sea); gr.addColorStop(0, top); gr.addColorStop(1, bot); c.fillStyle = gr; c.fillRect(0, 0, w, h);
        if (st.night) { // backlight glow behind the mountain and pin-hole stars
          const glow = c.createRadialGradient(isl.cx, isl.sea, 0, isl.cx, isl.sea, h * 0.7); glow.addColorStop(0, `rgba(255,170,90,${0.55 + 0.25 * E.glow})`); glow.addColorStop(0.5, 'rgba(180,90,120,0.25)'); glow.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = glow; c.fillRect(0, 0, w, h);
          c.fillStyle = '#fff6dc'; for (let i = 0; i < 70; i++) { c.globalAlpha = 0.5 + 0.5 * Math.sin(f.clock * 1.5 + i); c.beginPath(); c.arc(hash(i, 11) * w, hash(i, 12) * isl.sea * 0.9, h * 0.0025, 0, TAU); c.fill(); } c.globalAlpha = 1;
        } else if (night > 0.1) { c.fillStyle = `rgba(255,255,230,${night})`; for (let i = 0; i < 60; i++) { c.beginPath(); c.arc(hash(i, 11) * w, hash(i, 12) * isl.sea * 0.9, h * 0.002, 0, TAU); c.fill(); } }
        if (st.glass && !flat) { // tinted sky panels and the leading between them
          const tints = ['rgba(255,255,255,0.14)', 'rgba(120,60,200,0.16)', 'rgba(255,200,80,0.14)', 'rgba(40,120,255,0.18)'];
          const ys = [0, isl.sea * 0.3, isl.sea * 0.58, isl.sea * 0.82, isl.sea], xs = [0, w * 0.22, w * 0.47, w * 0.7, w];
          for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) { c.fillStyle = tints[(i * 3 + j * 5) % 4]; c.beginPath(); c.moveTo(xs[i] + h * 0.05 * Math.sin(j), ys[j]); c.lineTo(xs[i + 1] + h * 0.05 * Math.sin(j), ys[j]); c.lineTo(xs[i + 1] + h * 0.05 * Math.sin(j + 1), ys[j + 1]); c.lineTo(xs[i] + h * 0.05 * Math.sin(j + 1), ys[j + 1]); c.closePath(); c.fill(); }
          c.strokeStyle = st.lead; c.lineWidth = h * 0.007; c.beginPath();
          for (let j = 1; j < 4; j++) { c.moveTo(0, ys[j]); for (let k = 1; k <= 8; k++) c.lineTo(k / 8 * w, ys[j] + Math.sin(k * 1.3 + j) * h * 0.02); }
          for (let i = 1; i < 4; i++) { c.moveTo(xs[i], 0); for (let j = 1; j <= 4; j++) c.lineTo(xs[i] + h * 0.05 * Math.sin(j), ys[j]); } c.stroke();
        }
        // sun or moon piece
        const sx = w * (isl.wind < 0 ? 0.22 : 0.78), sy = h * (0.13 + (1 - p.light) * 0.3);
        if (night < 0.85 && !st.night) P(f, c, cc => { cc.moveTo(sx + h * 0.075, sy); cc.arc(sx, sy, h * 0.075, 0, TAU); }, st.sun, 0.05, { stitch: true, thread: '#ffffff', sway: 0.2 });
        if (night > 0.2) { c.save(); c.globalAlpha = Math.min(1, night); P(f, c, cc => { cc.moveTo(w * 0.8 + h * 0.06, h * 0.15); cc.arc(w * 0.8, h * 0.15, h * 0.06, 0, TAU); }, st.night ? '#fff1c4' : '#f4efd8', 0.05, { sway: 0.2 }); c.restore(); }
        if (st.felt && !st.night && night < 0.85) { c.fillStyle = 'rgba(0,0,0,0.25)'; for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { c.beginPath(); c.arc(sx + dx * h * 0.02, sy + dy * h * 0.02, h * 0.006, 0, TAU); c.fill(); } }
        // cloud pieces
        if (p.x4 > 0.1) for (let i = 0; i < 1 + Math.round(p.x4 * 3); i++) {
          const cx = fract(t * 0.008 * (1 + hash(i, 3)) * (isl.wind || 1) + hash(i, 4)) * w * 1.3 - w * 0.15, cy = h * (0.08 + hash(i, 5) * 0.28), r = h * (0.03 + hash(i, 6) * 0.03);
          P(f, c, cc => { for (const [dx, dy, k] of [[-0.9, 0.1, 0.55], [-0.3, -0.25, 0.75], [0.35, -0.2, 0.7], [0.9, 0.15, 0.5], [0, 0.25, 0.6]]) { cc.moveTo(cx + dx * r + k * r, cy + dy * r); cc.arc(cx + dx * r, cy + dy * r, k * r, 0, TAU); } }, dk(st.cloud, 0.7), 0.1 + i * 0.05, { stitch: false, sway: 0.5 });
        }
      });

      // ---- far ridge (a lighter, wider silhouette behind the island, like a second sheet)
      const farK = smooth(0.14, 0.3, L.stage) * (1 - smooth(0.9, 0.97, L.stage));
      if (farK > 0.02) P(f, g, c => { c.moveTo(isl.cx - isl.hw * 1.6, isl.sea + 2); for (let i = 0; i <= 40; i++) { const u = -1.3 + 2.6 * i / 40; c.lineTo(isl.cx + u * isl.hw * 1.35 + isl.hw * 0.5, isl.sea - Math.max(0, isl.H(u)) * isl.unit * 0.62 * farK - h * 0.004); } c.lineTo(isl.cx + isl.hw * 2.3, isl.sea + 2); c.closePath(); }, dk(mixc(st.far, st.top, 0.35)), 0.15, { facets: [isl.cx + isl.hw * 0.5, isl.summit.y + (isl.sea - isl.summit.y) * 0.38], lit: false });

      // ---- the island body and its layers
      if (L.height > -0.02) {
        g.save(); g.beginPath(); g.rect(0, 0, w, isl.sea + h * 0.004); g.clip();
        const body = c => surfacePath(c, isl, -1.3, 1.3, isl.sea + h * 0.004, 70);
        P(f, g, body, dk(st.rock), 0.4, { facets: [isl.summit.x, isl.summit.y], leads: [[isl.summit.x, isl.summit.y, isl.cx - isl.hw * 0.5, isl.sea], [isl.summit.x, isl.summit.y, isl.cx + isl.hw * 0.55, isl.sea]] });
        // lee side darker sheet
        P(f, g, c => { c.moveTo(isl.cx + h * 0.01, isl.summit.y); for (let i = 0; i <= 40; i++) { const u = 0.02 + 1.28 * i / 40; c.lineTo(X(u), Math.min(isl.sea + 2, Y(u))); } c.lineTo(isl.cx + isl.hw * 1.3, isl.sea + 2); c.lineTo(isl.cx + h * 0.01, isl.sea + 2); c.closePath(); }, dk(st.rock2), 0.45, { noShadow: true, stitch: false, lit: false });
        // fresh tephra cap
        const fresh = (1 - smooth(0.5, 0.66, L.stage)) * (1 - L.submarine) * 0.85 + L.steam * 0.7;
        if (fresh > 0.05) { g.save(); g.globalAlpha = clamp(fresh); P(f, g, c => capPath(c, isl, 0.55, isl.unit * 0.4 + h * 0.03), st.tephra, 0.5, { stitch: false, lit: false }); g.restore(); }
        // vegetation sheet climbing from the coast
        if (L.veg > 0.03) {
          const climb = isl.sea - clamp(L.veg * 1.3) * (isl.sea - isl.summit.y + h * 0.05);
          g.save(); g.beginPath(); climbPath(g, w, h, climb, h * 0.015, f.epoch); g.clip();
          P(f, g, body, dk(st.green), 0.5, { facets: [isl.summit.x, isl.summit.y], stitch: false });
          const nb = 8 + Math.round(p.detail * 10);
          if (!st.night) P(f, g, c => { for (let i = 0; i <= nb; i++) { const u = (i / nb - 0.5) * 2.2; const y = Y(u); if (y < isl.sea - h * 0.03) { const r = h * (0.014 + 0.012 * hash(i, 51)); c.moveTo(X(u) + r * 1.5, y + r); c.ellipse(X(u), y + r, r * 1.5, r * 0.8, 0, 0, TAU); } } }, dk(st.green2), 0.55, { noShadow: true, stitch: false, lit: false });
          g.restore();
          if (L.erosion > 0.05 && !flat) { g.strokeStyle = st.night ? 'rgba(255,190,120,0.35)' : `rgba(20,40,20,${0.5 * L.erosion})`; g.lineWidth = Math.max(1, h * 0.004); for (let i = 0; i < 6; i++) { const u = (i / 5 - 0.5) * 1.2 + 0.05; const y0 = Y(u); if (y0 < isl.sea - h * 0.03) { g.beginPath(); g.moveTo(X(u), y0 + h * 0.015); g.quadraticCurveTo(X(u * 1.08), (y0 + isl.sea) / 2, X(u * 1.2), isl.sea); g.stroke(); } } }
          P(f, g, c => { c.rect(isl.cx - isl.hw * 1.3, isl.sea - h * 0.012, isl.hw * 2.6, h * 0.02); }, st.sand, 0.6, { noShadow: true, stitch: false, lit: false, sway: 0 });
        }
        // lava flows: orange strips with a bright core
        const flowList = flows(f, isl, E.flows, 3);
        for (const fl of flowList) {
          const wdt = h * (0.008 + 0.012 * E.flows);
          g.lineCap = 'round'; g.lineJoin = 'round';
          if (st.glass) { g.strokeStyle = st.lead; g.lineWidth = wdt + h * 0.008; g.beginPath(); fl.pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); }
          else if (!flat && st.shadow !== 'rgba(0,0,0,0)') { g.strokeStyle = st.shadow; g.lineWidth = wdt; g.beginPath(); fl.pts.forEach(([x, y], k) => k ? g.lineTo(x + h * 0.006, y + h * 0.01) : g.moveTo(x + h * 0.006, y + h * 0.01)); g.stroke(); }
          g.strokeStyle = st.lava; g.lineWidth = wdt; g.beginPath(); fl.pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
          g.strokeStyle = st.lava2; g.lineWidth = wdt * 0.4; g.beginPath(); fl.pts.forEach(([x, y], k) => k ? g.lineTo(x, y + Math.sin(k + t * 3) * h * 0.003) : g.moveTo(x, y)); g.stroke();
          if (st.night && !flat) { g.save(); g.globalAlpha = 0.5; g.strokeStyle = st.lava; g.lineWidth = wdt * 3; g.filter = `blur(${h * 0.01}px)`; g.beginPath(); fl.pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke(); g.restore(); }
        }
        // caldera pit
        if (L.caldera > 0.1) P(f, g, c => { c.moveTo(isl.summit.x + isl.hw * 0.1 * L.caldera, Y(0) + h * 0.006); c.ellipse(isl.summit.x, Y(0) + h * 0.006, isl.hw * 0.1 * L.caldera, h * 0.007, 0, 0, TAU); }, E.glow > 0.2 ? st.lava : st.tephra, 0.5, { noShadow: true, stitch: false, lit: false });
        g.restore();
        isl.flowList = flowList;
      } else isl.flowList = [];
      return { isl, E, night };
    }

    function paintSea(f, R, flat) {
      const { ctx: g, w, h, t, p } = f, L = f.life, { isl, E } = R, night = R.night;
      const dk = (c, k = 0.6) => st.night ? c : mixc(c, '#0a1030', night * k);
      const P = flat ? (ff, gg, build, fill) => { gg.beginPath(); build(gg); gg.fillStyle = fill; gg.fill(); } : piece;
      // reef foam and lagoon on the back strip
      const strips = 4;
      for (let i = 0; i < strips; i++) {
        const y0 = isl.sea + (i === 0 ? 0 : h * (0.03 + 0.1 * (i - 1) + 0.06 * (i - 1) * (i - 1))), amp = h * (0.006 + 0.008 * i), freq = 9 - i * 1.5, drift = t * (0.15 + 0.1 * i) * (i % 2 ? 1 : -1);
          P(f, g, c => { c.moveTo(-w, h * 2); c.lineTo(-w, y0); for (let k = 0; k <= 48; k++) { const x = -w * 0.1 + k / 48 * w * 1.2; const xx = x / h; c.lineTo(x, y0 + Math.abs(Math.sin(xx * freq + drift)) * amp * -1 + Math.sin(xx * freq * 0.5 - drift) * amp * 0.3); } c.lineTo(w * 2, y0); c.lineTo(w * 2, h * 2); c.closePath(); }, dk(st.sea[i]), 0.6 + i * 0.12, { stitch: i < 3, thread: 'rgba(255,255,255,0.55)', sway: 0.6 });
        if (i === 0) {
          // submerged edifice seen through the top strip, bubbling patch, lagoon and reef foam
          g.save(); g.beginPath(); g.rect(0, isl.sea, w, h); g.clip();
          g.globalAlpha = st.night ? 0.35 : 0.14; g.fillStyle = st.night ? '#000' : '#0b1a3a'; g.beginPath(); surfacePath(g, isl, -1.3, 1.3, h + 10, 60); g.fill(); g.globalAlpha = 1;
          if (E.bubbles > 0.02) {
            const k = clamp(E.bubbles * (0.6 + 0.6 * smooth(-0.75, -0.2, L.height))); g.globalAlpha = k;
            P(f, g, c => { c.moveTo(isl.summit.x + isl.hw * 0.22, isl.sea + h * 0.012); c.ellipse(isl.summit.x, isl.sea + h * 0.012, isl.hw * 0.22, h * 0.016, 0, 0, TAU); }, st.night ? '#4a6a7a' : '#d8f0e4', 0.62, { noShadow: true, stitch: false });
            for (const q of puffs(f, 6, isl.summit.x, isl.sea, { rate: 0.3, rise: 0.07, drift: 0.08, spread: 0.08, r0: 0.014, seed: 40 })) { if (q.a > 0.85) continue; g.globalAlpha = k * (1 - q.a); g.fillStyle = st.smoke; g.beginPath(); g.arc(q.x, q.y, q.r, 0, TAU); g.fill(); }
            g.fillStyle = 'rgba(255,255,255,0.8)'; for (let i = 0; i < 10; i++) { const a = fract(t * 0.4 + hash(i, 31)); g.beginPath(); g.arc(isl.summit.x + (hash(i, 32) - 0.5) * isl.hw * 0.3, isl.sea + h * 0.04 - a * h * 0.03, h * 0.003 + a * h * 0.004, 0, TAU); g.fill(); }
            g.globalAlpha = 1;
          }
          if (L.reef > 0.02) {
            const rp = reefPoints(isl), lag = L.lagoon;
            g.globalAlpha = L.reef * (0.5 + 0.5 * lag);
            P(f, g, c => { c.moveTo(rp[1].x, isl.sea + h * 0.006); c.ellipse((rp[0].x + rp[1].x) / 2, isl.sea + h * 0.006, (rp[1].x - rp[0].x) / 2, h * 0.02 + isl.unit * 0.02 * lag, 0, 0, TAU); }, st.night ? '#2c4a6a' : '#8fe2dc', 0.62, { noShadow: true, stitch: false });
            g.globalAlpha = L.reef;
            for (const r of rp) P(f, g, c => { for (let k = -2; k <= 2; k++) { c.moveTo(r.x + k * h * 0.013 + h * 0.007, isl.sea + h * 0.002); c.arc(r.x + k * h * 0.013, isl.sea + h * 0.002, h * 0.007, Math.PI, 0); } c.closePath(); }, st.night ? '#8fa0c0' : '#ffffff', 0.63, { noShadow: true, stitch: false });
            g.globalAlpha = 1;
          }
          g.restore();
          for (const m of motus(isl)) {
            g.globalAlpha = m.vis;
            P(f, g, c => { c.moveTo(m.x + m.w, m.y); c.ellipse(m.x, m.y, m.w, m.h * 1.4, 0, Math.PI, TAU); c.closePath(); }, st.sand, 0.64, { stitch: false });
            for (let k = 0; k < m.palms; k++) { const px = m.x + (k / Math.max(1, m.palms - 1) - 0.5) * m.w * 1.1, s = h * 0.04, lean = m.side * 0.4;
              P(f, g, c => { c.moveTo(px, m.y); c.lineTo(px + lean * s * 0.9, m.y - s); c.lineTo(px + lean * s * 0.9 + s * 0.08, m.y - s); c.lineTo(px + s * 0.08, m.y); c.closePath(); }, st.night ? '#1a1430' : '#7a4a2a', 0.65, { noShadow: true, stitch: false });
              P(f, g, c => { const tx = px + lean * s * 0.9, ty = m.y - s; for (let j = 0; j < 5; j++) { const a = -Math.PI / 2 + (j / 4 - 0.5) * 2.6; c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(a) * s * 0.6, ty + Math.sin(a) * s * 0.6 - s * 0.15, tx + Math.cos(a) * s * 0.7, ty + Math.sin(a) * s * 0.7 + s * 0.2); c.quadraticCurveTo(tx + Math.cos(a + 0.3) * s * 0.4, ty + Math.sin(a + 0.3) * s * 0.4, tx, ty); } }, st.night ? '#1a1430' : st.green2, 0.66, { noShadow: true, stitch: false });
            }
            g.globalAlpha = 1;
          }
        }
        if (i === 1 && p.x4 > 0.3 && !st.night) { // boat between the strips
          const bo = boat(f, isl), s = h * 0.045;
          P(f, g, c => { c.moveTo(bo.x - s, bo.y - s * 0.2); c.lineTo(bo.x + s, bo.y - s * 0.2); c.lineTo(bo.x + s * 0.7, bo.y + s * 0.25); c.lineTo(bo.x - s * 0.7, bo.y + s * 0.25); c.closePath(); }, '#d64545', 0.7, { stitch: false });
          P(f, g, c => { c.moveTo(bo.x, bo.y - s * 0.2); c.lineTo(bo.x, bo.y - s * 1.3); c.lineTo(bo.x + s * 0.8, bo.y - s * 0.3); c.closePath(); }, '#ffffff', 0.7, { stitch: false });
        }
      }
    }

    function paintEruption(f, R, flat) {
      const { ctx: g, w, h, t, p } = f, L = f.life, { isl, E } = R;
      const sx = isl.summit.x, sy = Math.min(isl.summit.y, isl.sea);
      const n = Math.round(5 + p.detail * 7);
      const P = flat ? (ff, gg, build, fill) => { gg.beginPath(); build(gg); gg.fillStyle = fill; gg.fill(); } : piece;
      const puffDraw = flat ? (q, fill) => { g.fillStyle = fill; g.beginPath(); g.arc(q.x, q.y, q.r, 0, TAU); g.fill(); } : (q, fill, d) => drawPuffPiece(f, g, q, fill, d);
      if (E.jets > 0.02) {
        for (const j of jets(f, sx, isl.sea - h * 0.004, E.jets, 7)) {
          P(f, g, c => { const pts = j.pts; c.moveTo(pts[0][0] - j.w * 1.5, pts[0][1]); for (let k = 1; k < pts.length; k++) { const q = k / (pts.length - 1); c.lineTo(pts[k][0] - j.w * 1.5 * (1 - q * 0.7), pts[k][1]); } for (let k = pts.length - 1; k >= 0; k--) { const q = k / (pts.length - 1); c.lineTo(pts[k][0] + j.w * 1.5 * (1 - q * 0.7), pts[k][1]); } c.closePath(); const tip = pts[pts.length - 1]; c.moveTo(tip[0] + j.w * 2.2, tip[1]); c.arc(tip[0], tip[1], j.w * 2.2, 0, TAU); }, st.tephra, 0.5, { stitch: false, sway: 0.3, lit: false });
        }
        for (const q of puffs(f, n, sx, isl.sea - h * 0.03, { rate: 0.4, rise: 0.24, drift: 0.22, spread: 0.1, r0: 0.028, seed: 3 })) { if (q.a > 0.85) continue; puffDraw(q, st.smoke, 0.55); }
      }
      if (E.fountain > 0.02) {
        for (const b of fountain(f, sx, sy, E.fountain, 10 + Math.round(p.detail * 10))) P(f, g, c => { c.moveTo(b.x, b.y - b.r * 3); c.quadraticCurveTo(b.x + b.r * 2, b.y, b.x, b.y + b.r * 1.6); c.quadraticCurveTo(b.x - b.r * 2, b.y, b.x, b.y - b.r * 3); }, b.a < 0.5 ? st.lava2 : st.lava, 0.5, { noShadow: true, stitch: false, sway: 0.2, lit: false });
        for (const q of puffs(f, n, sx, sy - h * 0.04, { rate: 0.28, rise: 0.32 + 0.1 * E.fountain, drift: 0.3, spread: 0.08, r0: 0.03, seed: 7 })) { if (q.a > 0.85) continue; puffDraw(q, mixHex(st.ash, st.smoke, q.a * 0.7), 0.55); }
      }
      if (E.burst > 0.02) for (const q of puffs(f, n, sx, sy, { rate: 0.3, rise: 0.38, drift: 0.3, spread: 0.12, r0: 0.034, seed: 11 })) { if (q.a > 0.85) continue; puffDraw(q, mixHex(st.ash, st.smoke, q.a * 0.5), 0.55); }
      if (E.entry > 0.02) for (const fl of isl.flowList) if (fl.ends) for (const q of puffs(f, Math.round(n * 0.6), fl.x, isl.sea, { rate: 0.5, rise: 0.13, drift: 0.1, spread: 0.05, r0: 0.016, seed: 20 + fl.i })) { if (q.a > 0.85) continue; puffDraw(q, st.smoke, 0.65); }
      if (E.quiet > 0.3 && L.height > 0.1 && p.x4 > 0.2) for (const q of puffs(f, 3, sx, sy - h * 0.02, { rate: 0.1, rise: 0.06, drift: 0.12, spread: 0.03, r0: 0.02, seed: 30 })) { if (q.a > 0.85) continue; g.globalAlpha = E.quiet; puffDraw(q, st.smoke, 0.5); g.globalAlpha = 1; }
      if (st.night && E.glow > 0.05 && !flat) { const gr = g.createRadialGradient(sx, sy, 0, sx, sy, h * 0.22 * E.glow); gr.addColorStop(0, 'rgba(255,140,60,0.5)'); gr.addColorStop(1, 'rgba(255,100,30,0)'); g.fillStyle = gr; g.fillRect(sx - h * 0.3, sy - h * 0.3, h * 0.6, h * 0.6); }
      if (p.x4 > 0.4 && !flat) { g.strokeStyle = st.night ? '#0a0818' : '#333'; g.lineWidth = Math.max(1, h * 0.004); for (const b of birds(f, 3, 7)) { g.beginPath(); g.moveTo(b.x - b.s * 1.3, b.y + b.flap * b.s * 0.5); g.quadraticCurveTo(b.x, b.y - b.s * 0.3, b.x + b.s * 1.3, b.y + b.flap * b.s * 0.5); g.stroke(); } }
    }

    return {
      render(f) {
        const { ctx: g, w, h, p } = f;
        const T = textures(w, h);
        if (st.tiles || st.coils) {
          // draw the flat picture small, then rebuild it from tiles or coils
          const tile = Math.max(3, Math.round(h / (60 - 30 * p.x3) * (st.coils ? 1.15 : 1)));
          const bw = Math.ceil(w / tile), bh = Math.ceil(h / tile), ss = 3;
          if (!low || low.canvas.width !== bw * ss || low.canvas.height !== bh * ss) { const c = document.createElement('canvas'); c.width = bw * ss; c.height = bh * ss; low = { canvas: c, ctx: c.getContext('2d', { willReadFrequently: true }) }; }
          const f2 = { ...f, ctx: low.ctx, w: bw * ss, h: bh * ss, combo: f.combo || !!st.coils };
          low.ctx.setTransform(1, 0, 0, 1, 0, 0); low.ctx.clearRect(0, 0, f2.w, f2.h);
          const R = paint(f2, true); paintSea(f2, R, true); paintEruption(f2, R, true);
          const img = low.ctx.getImageData(0, 0, f2.w, f2.h).data;
          g.clearRect(0, 0, w, h);
          if (!f.combo) { g.fillStyle = st.coils ? st.top : '#d9d2c5'; g.fillRect(0, 0, w, h); }
          else if (st.tiles) { g.fillStyle = 'rgba(70,65,60,0.35)'; g.fillRect(0, R.isl.sea, w, h - R.isl.sea); }
          for (let j = 0; j < bh; j++) for (let i = 0; i < bw; i++) {
            const px = i * ss + 1, py = j * ss + 1, k = (py * f2.w + px) * 4;
            const a = img[k + 3]; if (a < 100) continue;
            const jit = (hash(i, j) - 0.5) * 30, r = clamp(img[k] + jit, 0, 255) | 0, gg = clamp(img[k + 1] + jit, 0, 255) | 0, b = clamp(img[k + 2] + jit, 0, 255) | 0;
            if (st.tiles) {
              const gap = Math.max(1, tile * 0.12), rot = (hash(i + 7, j) - 0.5) * 0.25;
              g.save(); g.translate(i * tile + tile / 2, j * tile + tile / 2); g.rotate(rot * p.x3);
              g.fillStyle = `rgb(${r},${gg},${b})`; g.fillRect(-tile / 2 + gap / 2, -tile / 2 + gap / 2, tile - gap, tile - gap);
              g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(-tile / 2 + gap / 2, -tile / 2 + gap / 2, tile - gap, Math.max(1, tile * 0.12));
              g.restore();
            } else {
              const off = (j % 2) * tile * 0.5, sz = Math.round(tile * 1.05);
              g.drawImage(coilSprite(r, gg, b, Math.max(4, Math.min(64, sz))), i * tile + off - tile * 0.02, j * tile - tile * 0.02, sz, sz);
            }
          }
          return;
        }
        const R = paint(f, false); paintSea(f, R, false); paintEruption(f, R, false);
        if (p.x3 > 0.05 && (mode === 'diorama' || mode === 'origami')) { g.save(); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = p.x3 * 0.9; g.drawImage(T.grain, 0, 0); g.restore(); }
        if (st.night) { // shadow-box frame
          g.strokeStyle = '#120d1e'; g.lineWidth = h * 0.05; g.strokeRect(0, 0, w, h); g.strokeStyle = '#2a2140'; g.lineWidth = h * 0.012; g.strokeRect(h * 0.03, h * 0.03, w - h * 0.06, h - h * 0.06);
        }
        if (st.glass) { g.strokeStyle = st.lead; g.lineWidth = h * 0.03; g.strokeRect(0, 0, w, h); }
      },
    };
  },
};

export const scenes = [
  { id: 'papercut-diorama', name: 'Paper Diorama', tags: ['paper', 'art', '2d', 'lava', 'hawaii'], desc: 'Layered cut-paper diorama with drop shadows and a gentle parallax sway, lava strips and paper steam.',
    opts: { mode: 'diorama' }, params: { stage: 0.36, grow: 0.5, activity: 0.6, scale: 0.55, light: 0.85, x1: 0.6, x2: 0.5, x3: 0.5, x4: 0.6 } },
  { id: 'papercut-origami', name: 'Origami Island', tags: ['paper', 'art', '2d', 'abstract'], desc: 'Folded-paper facets: the island is a fan of creased triangles, the waves are zigzag pleats.',
    opts: { mode: 'origami' }, params: { stage: 0.46, grow: 0.5, activity: 0.5, scale: 0.6, light: 0.9, x1: 0.4, x2: 0.3, x3: 0.4, x4: 0.4 } },
  { id: 'papercut-felt', name: 'Felt and Stitches', tags: ['paper', 'art', '2d', 'calm', 'eruption'], desc: 'Fuzzy felt shapes sewn together with running stitches and a button sun.',
    opts: { mode: 'felt' }, params: { stage: 0.3, grow: 0.55, activity: 0.6, scale: 0.55, light: 0.85, x1: 0.5, x2: 0.4, x3: 0.6, x4: 0.6 } },
  { id: 'papercut-stained', name: 'Stained Glass', tags: ['art', '2d', 'surtseyan', 'eruption'], desc: 'Saturated glass panels held in black leading, lit from behind; the Surtseyan breach in glass.',
    opts: { mode: 'stained' }, params: { stage: 0.17, grow: 0.55, activity: 0.7, scale: 0.5, light: 0.9, x1: 0.5, x2: 0.2, x3: 0.6, x4: 0.5 } },
  { id: 'papercut-mosaic', name: 'Mosaic Tiles', tags: ['art', '2d', 'atoll', 'calm'], desc: 'The picture rebuilt from little glazed tiles with grout between, like a bath-house floor.',
    opts: { mode: 'mosaic' }, params: { stage: 0.7, grow: 0.5, activity: 0.5, scale: 0.55, light: 0.9, x1: 0.5, x2: 0.3, x3: 0.5, x4: 0.5 } },
  { id: 'papercut-quilling', name: 'Paper Quilling', tags: ['paper', 'art', '2d', 'calm'], desc: 'Rolled paper coils packed into the shapes of sea, island and smoke.',
    opts: { mode: 'quilling' }, params: { stage: 0.4, grow: 0.5, activity: 0.5, scale: 0.6, light: 0.9, x1: 0.5, x2: 0.3, x3: 0.45, x4: 0.4 } },
  { id: 'papercut-kirigami', name: 'Kirigami Shadow Box', tags: ['paper', 'art', '2d', 'night', 'lava'], desc: 'Night shadow-box: layered black silhouettes with a warm backlight, lava glowing through the cuts.',
    opts: { mode: 'kirigami' }, params: { stage: 0.44, grow: 0.4, activity: 0.7, scale: 0.6, light: 0.05, x1: 0.7, x2: 0.4, x3: 0.5, x4: 0.5 } },
];
