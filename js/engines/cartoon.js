// Cartoon volcano islands: thick outlines, bouncy squash-and-stretch lava blobs, puffy smoke, faces and KA-BOOMs.
// One side-on composition (sea cutaway, so the seamount and the sinking atoll read) styled eight ways by opts.mode.
import { clamp, lerp, smooth, fract, hash, buffer, sky, lavaCss, mixHex } from '../util.js';
import { TAU, island, eruption, surfacePath, capPath, climbPath, puffs, jets, fountain, flows, reefPoints, motus, birds, boat, sunPos, nightAmt, goldAmt } from './_shared2d.js';

const STYLES = {
  picturebook: { top: '#a7d8f5', bot: '#eaf7ff', sea: '#4fa8de', deep: '#2b6fb0', rock: '#8a5a48', rock2: '#6a4236', green: '#8ccf72', green2: '#5fa84f', sand: '#f6e3a8', ink: '#3b2a28', ow: 1, smoke: '#f4f4f4', smokeInk: '#7a7a8a', cloud: '#ffffff', sun: '#ffd45c' },
  saturday:    { top: '#2d8ce6', bot: '#9fd9ff', sea: '#1f6fd0', deep: '#174a9c', rock: '#6b4a3a', rock2: '#4b3027', green: '#56c04a', green2: '#2f8f36', sand: '#ffe49a', ink: '#101010', ow: 1.3, smoke: '#ffffff', smokeInk: '#555', cloud: '#ffffff', sun: '#ffe23a' },
  face:        { top: '#53b3f3', bot: '#c6ecff', sea: '#2f86dc', deep: '#1c5aa8', rock: '#7d5a4b', rock2: '#5d3f34', green: '#74c86a', green2: '#44994a', sand: '#f8e4a2', ink: '#1c1a1a', ow: 1.2, smoke: '#ffffff', smokeInk: '#666', cloud: '#ffffff', sun: '#ffd93b' },
  comic:       { top: '#ffd43b', bot: '#ff9e3d', sea: '#2a63c9', deep: '#163d8a', rock: '#7a4a3c', rock2: '#4e2c25', green: '#4fb94f', green2: '#2b7f33', sand: '#ffe8a3', ink: '#000000', ow: 1.5, smoke: '#f3f3f3', smokeInk: '#222', cloud: '#ffffff', sun: '#ffffff' },
  sticker:     { top: '#f6d8e8', bot: '#dff1ff', sea: '#62bfe8', deep: '#3c93c4', rock: '#9b6b58', rock2: '#7d5244', green: '#95d67f', green2: '#67b45e', sand: '#fff0b8', ink: '#ffffff', ow: 2.2, smoke: '#ffffff', smokeInk: '#ffffff', cloud: '#ffffff', sun: '#ffd77a' },
  clay:        { top: '#8fc5ea', bot: '#d9eefb', sea: '#4d9fd6', deep: '#2f74ad', rock: '#9c6a52', rock2: '#6c4536', green: '#86c66f', green2: '#5b9b4f', sand: '#f2dca2', ink: 'rgba(40,25,20,0.35)', ow: 0.5, smoke: '#f1eee9', smokeInk: 'rgba(60,50,50,0.3)', cloud: '#f7f3ee', sun: '#f5c95a' },
  tiki:        { top: '#f2a23a', bot: '#f7d58a', sea: '#1f8f8a', deep: '#126b68', rock: '#7a3e2a', rock2: '#55281b', green: '#5e8a3a', green2: '#3d6128', sand: '#f3d79a', ink: '#3b1d12', ow: 0.9, smoke: '#efe1c2', smokeInk: '#7a4a2a', cloud: '#fbe6b8', sun: '#e8542c' },
  night:       { top: '#0b1540', bot: '#263a7a', sea: '#1a3a74', deep: '#0d2048', rock: '#4a3a4a', rock2: '#2d2232', green: '#3f7a52', green2: '#2b5a3c', sand: '#cbbd97', ink: '#141226', ow: 1, smoke: '#8f94c4', smokeInk: '#4a4f80', cloud: '#5a62a8', sun: '#f4f0d0' },
};

// Puff clouds drawn as a union: all outlines first, then all fills, so overlapping puffs merge into one cartoon cloud.
function drawPuffs(g, list, fill, ink, ow, fillFn = null) {
  if (ow > 0.3) { g.lineWidth = ow * 1.6; g.strokeStyle = ink; for (const q of list) { if (q.a > 0.8) continue; g.beginPath(); g.ellipse(q.x, q.y, q.r, q.r * 0.9, 0, 0, TAU); g.stroke(); } }
  for (const q of list) { g.globalAlpha = q.a > 0.65 ? 1 - (q.a - 0.65) / 0.35 : 1; g.fillStyle = fillFn ? fillFn(q) : fill; g.beginPath(); g.ellipse(q.x, q.y, q.r, q.r * 0.9, 0, 0, TAU); g.fill(); }
  g.globalAlpha = 1;
}

function roundBlob(g, x, y, rx, ry) { g.beginPath(); g.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, TAU); }

function cartoonCloud(g, x, y, r, fill, ink, ow) {
  g.beginPath();
  for (const [dx, dy, k] of [[-0.9, 0.1, 0.55], [-0.3, -0.25, 0.75], [0.35, -0.2, 0.7], [0.9, 0.15, 0.5], [0, 0.25, 0.6]]) { g.moveTo(x + dx * r + k * r, y + dy * r); g.arc(x + dx * r, y + dy * r, k * r, 0, TAU); }
  if (ow > 0) { g.lineWidth = ow * 2; g.strokeStyle = ink; g.lineJoin = 'round'; g.stroke(); }
  g.fillStyle = fill; g.fill();
}

function starburst(g, x, y, r1, r2, n, rot) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = rot + i / (n * 2) * TAU, r = i % 2 ? r1 : r2; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  g.closePath();
}

function palm(g, x, y, s, lean, ink, ow, leaf = '#3f9a4a', trunk = '#8a5a3a') {
  g.save(); g.translate(x, y);
  g.lineCap = 'round'; g.lineWidth = s * 0.16 + ow; g.strokeStyle = ink;
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(lean * s * 0.5, -s * 0.6, lean * s * 0.8, -s); g.stroke();
  g.lineWidth = s * 0.16; g.strokeStyle = trunk; g.stroke();
  const tx = lean * s * 0.8, ty = -s;
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 4 - 0.5) * 2.4;
    g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(tx + Math.cos(a) * s * 0.5, ty + Math.sin(a) * s * 0.5 - s * 0.1, tx + Math.cos(a) * s * 0.7, ty + Math.sin(a) * s * 0.7 + s * 0.25);
    g.lineWidth = s * 0.2 + ow * 1.5; g.strokeStyle = ink; g.stroke(); g.lineWidth = s * 0.2; g.strokeStyle = leaf; g.stroke();
  }
  g.restore();
}

export default {
  id: 'cartoon',
  name: 'Cartoon',
  kind: '2d',
  params: [
    { id: 'x1', label: 'Outline', value: 0.5, tip: 'Thickness of the ink lines' },
    { id: 'x2', label: 'Bounce', value: 0.5, tip: 'Squash and stretch of the island and lava blobs' },
    { id: 'x3', label: 'Smoke', value: 0.5, tip: 'How much smoke and steam the volcano puffs' },
    { id: 'x4', label: 'Extras', value: 0.5, tip: 'Boats, birds, fish and other props' },
  ],
  create(ctx, opts) {
    const mode = opts.mode || 'picturebook', st = STYLES[mode] || STYLES.picturebook;
    let tex = null, texKey = '';
    const halftone = (w, h) => {
      const key = w + 'x' + h; if (texKey === key) return tex;
      const cell = Math.max(3, Math.round(h / 60)), b = buffer(cell, cell);
      b.ctx.fillStyle = 'rgba(0,0,0,1)'; b.ctx.beginPath(); b.ctx.arc(cell / 2, cell / 2, cell * 0.28, 0, TAU); b.ctx.fill();
      tex = ctx.createPattern(b.canvas, 'repeat'); texKey = key; return tex;
    };
    return {
      render(f) {
        const { ctx: g, w, h, t, p } = f, L = f.life;
        const isl = island(f, { horizon: mode === 'comic' ? 0.62 : 0.6 });
        const E = eruption(f, isl);
        const night = mode === 'night' ? Math.max(0.75, nightAmt(f)) : nightAmt(f), gold = goldAmt(f);
        const ow = h * (0.002 + p.x1 * 0.012) * st.ow;
        const ink = st.ink, X = isl.X, Y = isl.Y;
        const awake = clamp((E.jets + E.fountain + E.burst + E.bubbles * 0.6) * 1.4);
        const rumble = awake * p.x2 * h * 0.004;
        const shakeX = Math.sin(t * 31) * rumble, shakeY = Math.cos(t * 27) * rumble * 0.6;
        g.lineJoin = 'round'; g.lineCap = 'round';

        // ---- sky (transparent in a cloud combo)
        sky(f, (c, w, h) => {
          let top = st.top, bot = st.bot;
          if (mode !== 'night') { top = mixHex(top, '#0a1030', night); bot = mixHex(bot, '#1e2a5a', night); if (gold > 0) { top = mixHex(top, '#9a6fc0', gold * 0.6); bot = mixHex(bot, '#ffb36b', gold * 0.8); } }
          const gr = c.createLinearGradient(0, 0, 0, isl.sea); gr.addColorStop(0, top); gr.addColorStop(1, bot);
          c.fillStyle = gr; c.fillRect(0, 0, w, h);
          if (mode === 'comic') { // speed lines
            c.save(); c.globalAlpha = 0.25 + awake * 0.4; c.strokeStyle = '#7a3b00'; c.lineWidth = h * 0.004;
            for (let i = 0; i < 36; i++) { const a = i / 36 * TAU; c.beginPath(); c.moveTo(isl.summit.x + Math.cos(a) * h * 0.25, isl.summit.y + Math.sin(a) * h * 0.25); c.lineTo(isl.summit.x + Math.cos(a) * h * 1.6, isl.summit.y + Math.sin(a) * h * 1.6); c.stroke(); }
            c.restore();
          }
          if (night > 0.05) { c.fillStyle = `rgba(255,255,230,${night})`; for (let i = 0; i < 80; i++) { const sx = hash(i, 11) * w, sy = hash(i, 12) * isl.sea * 0.95, tw = 0.6 + 0.4 * Math.sin(f.clock * 2 + i); c.beginPath(); c.arc(sx, sy, h * 0.0025 * tw, 0, TAU); c.fill(); } }
          const sun = sunPos(f, isl.wind < 0);
          if (night < 0.9) {
            c.save(); c.globalAlpha = 1 - night;
            if (mode === 'tiki') { c.fillStyle = st.sun; starburst(c, sun.x, sun.y, h * 0.09, h * 0.16, 16, t * 0.1); c.fill(); c.fillStyle = '#f7b23a'; c.beginPath(); c.arc(sun.x, sun.y, h * 0.075, 0, TAU); c.fill(); }
            else {
              c.strokeStyle = ink; c.lineWidth = ow;
              if (mode !== 'clay' && mode !== 'sticker') { for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + t * 0.2; c.beginPath(); c.moveTo(sun.x + Math.cos(a) * h * 0.09, sun.y + Math.sin(a) * h * 0.09); c.lineTo(sun.x + Math.cos(a) * h * 0.125, sun.y + Math.sin(a) * h * 0.125); c.stroke(); } }
              c.fillStyle = st.sun; c.beginPath(); c.arc(sun.x, sun.y, h * 0.07, 0, TAU); c.fill(); if (ow > 0.3 && mode !== 'clay') c.stroke();
              if (mode === 'picturebook' || mode === 'face') { c.fillStyle = ink; c.beginPath(); c.arc(sun.x - h * 0.02, sun.y - h * 0.01, h * 0.006, 0, TAU); c.arc(sun.x + h * 0.02, sun.y - h * 0.01, h * 0.006, 0, TAU); c.fill(); c.beginPath(); c.arc(sun.x, sun.y + h * 0.005, h * 0.03, 0.3, Math.PI - 0.3); c.stroke(); }
            }
            c.restore();
          }
          if (night > 0.1) { c.save(); c.globalAlpha = night; const mx = w * 0.8, my = h * 0.16; c.fillStyle = st.sun; c.beginPath(); c.arc(mx, my, h * 0.07, 0, TAU); c.fill(); c.fillStyle = top; c.beginPath(); c.arc(mx + h * 0.035, my - h * 0.02, h * 0.06, 0, TAU); c.fill(); c.restore(); }
          // background clouds
          for (let i = 0; i < 4; i++) { const cx = fract(t * 0.01 * (1 + hash(i, 3)) * (isl.wind || 1) + hash(i, 4)) * w * 1.3 - w * 0.15, cy = h * (0.08 + hash(i, 5) * 0.3); cartoonCloud(c, cx, cy, h * (0.035 + hash(i, 6) * 0.03), mode === 'night' ? st.cloud : mixHex(st.cloud, '#2a2f55', night * 0.8), ink, mode === 'clay' || mode === 'sticker' ? 0 : ow * 0.8); }
        });

        // ---- sea base (opaque) and the island body (down to the sea floor, seen through the water)
        g.fillStyle = mixHex(st.deep, '#06102a', night * 0.6); g.fillRect(0, isl.sea, w, h - isl.sea);
        g.save(); g.translate(shakeX, shakeY);
        const sq = 1 + Math.sin(t * 6) * 0.03 * awake * p.x2;
        g.translate(isl.cx, isl.sea); g.scale(1 / sq, sq); g.translate(-isl.cx, -isl.sea);
        g.beginPath(); surfacePath(g, isl, -1.3, 1.3, Math.min(h + ow * 2, isl.floor + ow * 2));
        if (mode === 'sticker') { g.lineWidth = ow * 2.5; g.strokeStyle = '#fff'; g.stroke(); }
        else if (ow > 0.3) { g.lineWidth = ow * 2; g.strokeStyle = ink; g.stroke(); }
        if (mode === 'clay') { const gr = g.createLinearGradient(isl.cx - isl.hw * 0.4, isl.summit.y, isl.cx + isl.hw * 0.6, isl.sea); gr.addColorStop(0, mixHex(st.rock, '#ffffff', 0.25)); gr.addColorStop(1, st.rock2); g.fillStyle = gr; }
        else g.fillStyle = mixHex(st.rock, '#1a1420', night * 0.5);
        g.fill();
        g.save(); g.clip();
        // flank shading on the lee side
        g.fillStyle = mixHex(st.rock2, '#0d0a12', night * 0.5); g.globalAlpha = 0.55;
        g.beginPath(); g.moveTo(isl.cx, isl.summit.y - h); g.lineTo(isl.cx + h * 0.04, isl.summit.y - h); g.lineTo(isl.cx + isl.hw * 1.3 + h * 0.1, h); g.lineTo(isl.cx + isl.hw * 1.3, h); g.closePath(); g.fill();
        g.globalAlpha = 1;
        // fresh black lava and tephra near the summit while building
        const fresh = (1 - smooth(0.5, 0.66, L.stage)) * (1 - L.submarine) * 0.8 + L.steam * 0.6;
        if (fresh > 0.02) { g.fillStyle = `rgba(30,22,26,${fresh * 0.85})`; g.beginPath(); capPath(g, isl, 0.5, isl.unit * 0.35 + h * 0.03); g.fill(); }
        // vegetation: green over everything above the sea, canopy bumps along the slopes, a beach
        if (L.veg > 0.02) {
          g.fillStyle = mixHex(st.green, '#13351e', night * 0.6); g.globalAlpha = clamp(L.veg * 1.4);
          const climb = isl.sea - clamp(L.veg * 1.3) * (isl.sea - isl.summit.y + h * 0.05);
          g.save(); g.beginPath(); climbPath(g, w, h, climb, h * 0.015, f.epoch); g.clip();
          g.beginPath(); surfacePath(g, isl, -1.3, 1.3, isl.sea - h * 0.008, 60); g.fill();
          g.fillStyle = mixHex(st.green2, '#0d2a15', night * 0.6); g.globalAlpha = clamp(L.veg * 1.3) * 0.9;
          const nb = 10 + Math.round(p.detail * 14);
          g.beginPath();
          for (let i = 0; i <= nb; i++) { const u = (i / nb - 0.5) * 2.4 * 0.9; const y = Y(u); if (y < isl.sea - h * 0.03) { const r = h * (0.014 + 0.01 * hash(i, 51)); g.moveTo(X(u) + r, y + r * 0.9); g.arc(X(u), y + r * 0.9, r, 0, TAU); } }
          g.fill(); g.restore();
          g.globalAlpha = 1;
          if (L.erosion > 0.05) { g.strokeStyle = `rgba(20,30,20,${0.6 * L.erosion})`; g.lineWidth = ow * 1.5; for (let i = 0; i < 6; i++) { const u = (i / 5 - 0.5) * 1.1 + 0.05; const y0 = Y(u); if (y0 < isl.sea - h * 0.02) { g.beginPath(); g.moveTo(X(u), y0 + h * 0.02); g.quadraticCurveTo(X(u * 1.1), (y0 + isl.sea) / 2, X(u * 1.25), isl.sea); g.stroke(); } } }
          g.fillStyle = st.sand; g.globalAlpha = L.veg * 0.9; g.fillRect(-w, isl.sea - h * 0.012, 3 * w, h * 0.012 + 2); g.globalAlpha = 1;
        }
        // caldera floor glow / dark pit
        if (L.caldera > 0.1) { g.fillStyle = E.glow > 0.2 ? lavaCss(0.5 + 0.3 * E.glow * (0.5 + 0.5 * Math.sin(t * 3))) : '#2a1f22'; g.beginPath(); g.ellipse(isl.summit.x, Y(0) + h * 0.005, isl.hw * 0.1 * L.caldera, h * 0.006, 0, 0, TAU); g.fill(); }
        // lava flows
        const flowList = flows(f, isl, E.flows, 3);
        for (const fl of flowList) {
          const pts = fl.pts, wig = h * 0.003;
          g.lineWidth = h * (0.008 + 0.014 * E.flows) * (fl.i === 0 ? 1.3 : 0.9) + ow * 0.6; g.strokeStyle = ink; g.lineCap = 'round';
          g.beginPath(); pts.forEach(([x, y], k) => k ? g.lineTo(x, y + Math.sin(k + t * 2) * wig) : g.moveTo(x, y)); if (ow > 0.3) g.stroke();
          g.lineWidth = Math.max(1, g.lineWidth - ow * 1.2); g.strokeStyle = lavaCss(0.55 + 0.25 * Math.sin(t * 2.5 + fl.i)); g.stroke();
          g.lineWidth = Math.max(0.5, g.lineWidth * 0.4); g.strokeStyle = lavaCss(0.95); g.beginPath(); pts.forEach(([x, y], k) => k ? g.lineTo(x, y + Math.sin(k * 2 + t * 4) * wig) : g.moveTo(x, y)); g.stroke();
        }
        g.restore(); // clip
        g.restore(); // squash

        // ---- reef wall, lagoon and motu (below and at the surface)
        const reef = L.reef;
        if (reef > 0.02) {
          const rp = reefPoints(isl), lag = L.lagoon;
          g.save(); g.beginPath(); g.rect(0, isl.sea, w, h); g.clip();
          // lagoon water between the reef ends
          g.fillStyle = mixHex('#7fe3e0', '#1f5f7a', night * 0.7); g.globalAlpha = 0.35 * reef * (0.3 + 0.7 * lag);
          g.beginPath(); g.ellipse((rp[0].x + rp[1].x) / 2, isl.sea + h * 0.004, (rp[1].x - rp[0].x) / 2, isl.unit * 0.05 + h * 0.02, 0, 0, TAU); g.fill();
          g.globalAlpha = 1;
          for (const r of rp) { // reef wall standing on the flank
            const wallH = isl.unit * (0.06 + 0.2 * lag) * reef;
            g.fillStyle = mixHex('#e9a6a0', '#4a2a35', night * 0.6); g.beginPath(); g.moveTo(r.x - h * 0.012, isl.sea); g.lineTo(r.x + h * 0.012, isl.sea); g.lineTo(r.x + h * 0.03 * r.side + h * 0.02, isl.sea + wallH); g.lineTo(r.x - h * 0.02 + h * 0.03 * r.side, isl.sea + wallH); g.closePath(); g.fill();
            if (ow > 0.3 && mode !== 'sticker') { g.lineWidth = ow; g.strokeStyle = ink; g.stroke(); }
          }
          g.restore();
        }

        // ---- water overlay (translucent so the body shows through) with scalloped waves
        const wavA = h * 0.008, seaCol = mixHex(st.sea, '#0a1a3c', night * 0.6);
        g.fillStyle = seaCol; g.globalAlpha = 0.72;
        g.beginPath(); g.moveTo(0, h);
        for (let x = 0; x <= w + 8; x += 8) g.lineTo(x, isl.sea + Math.sin(x / h * 14 + t * 2.4) * wavA + Math.sin(x / h * 31 - t * 3.1) * wavA * 0.4);
        g.lineTo(w, h); g.closePath(); g.fill(); g.globalAlpha = 1;
        if (ow > 0.3) { g.lineWidth = ow * 1.6; g.strokeStyle = mode === 'sticker' ? '#fff' : ink; g.beginPath(); for (let x = 0; x <= w + 8; x += 8) { const y = isl.sea + Math.sin(x / h * 14 + t * 2.4) * wavA + Math.sin(x / h * 31 - t * 3.1) * wavA * 0.4; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
        // wave strokes
        g.strokeStyle = mode === 'night' ? 'rgba(200,210,255,0.35)' : 'rgba(255,255,255,0.55)'; g.lineWidth = Math.max(1, ow * 0.8);
        for (let i = 0; i < 9; i++) { const y = isl.sea + h * (0.04 + i * 0.045), x0 = fract(hash(i, 21) + t * 0.05 * (i % 2 ? 1 : -1)) * w; g.beginPath(); g.moveTo(x0 - h * 0.05, y); g.quadraticCurveTo(x0, y - h * 0.012, x0 + h * 0.05, y); g.stroke(); }
        // discoloured, bubbling sea over the seamount
        if (E.bubbles > 0.02) {
          const strength = E.bubbles * smooth(-0.6, -0.1, L.height);
          const gr = g.createRadialGradient(isl.summit.x, isl.summit.y, 0, isl.summit.x, isl.summit.y, h * 0.06 * E.bubbles); gr.addColorStop(0, 'rgba(255,90,30,0.8)'); gr.addColorStop(1, 'rgba(255,60,20,0)'); g.fillStyle = gr; g.fillRect(isl.summit.x - h * 0.1, isl.summit.y - h * 0.1, h * 0.2, h * 0.2);
          for (let i = 0; i < 5; i++) { const px = isl.summit.x + (i - 2) * h * 0.016, py = isl.summit.y + h * 0.004 - Math.abs(i - 2) * h * 0.004; g.fillStyle = lavaCss(0.2 + 0.15 * Math.sin(t * 2 + i)); g.beginPath(); g.ellipse(px, py, h * 0.009, h * 0.006, 0, 0, TAU); g.fill(); }
          g.fillStyle = `rgba(190,230,160,${0.35 * strength})`; g.beginPath(); g.ellipse(isl.summit.x, isl.sea + h * 0.01, isl.hw * 0.25, h * 0.025, 0, 0, TAU); g.fill();
          for (let i = 0; i < 14; i++) { const a = fract(t * 0.5 + hash(i, 31)); const by = isl.summit.y - a * (isl.summit.y - isl.sea); g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = Math.max(1, ow * 0.6); g.beginPath(); g.arc(isl.summit.x + (hash(i, 32) - 0.5) * isl.hw * 0.3 + Math.sin(t * 3 + i) * h * 0.01, by, h * 0.004 + a * h * 0.006, 0, TAU); g.stroke(); }
        }
        // reef foam and motu
        if (reef > 0.02) for (const r of reefPoints(isl)) { g.fillStyle = '#fff'; g.globalAlpha = reef; for (let k = -2; k <= 2; k++) { g.beginPath(); g.arc(r.x + k * h * 0.012, isl.sea - h * 0.004 + Math.sin(t * 4 + k) * h * 0.003, h * 0.006, 0, TAU); g.fill(); } g.globalAlpha = 1; }
        for (const m of motus(isl)) {
          g.globalAlpha = m.vis; g.fillStyle = st.sand; g.strokeStyle = mode === 'sticker' ? '#fff' : ink; g.lineWidth = ow * 1.5;
          g.beginPath(); g.ellipse(m.x, m.y, m.w, m.h, 0, Math.PI, TAU); g.closePath(); if (ow > 0.3) g.stroke(); g.fill();
          for (let k = 0; k < m.palms; k++) palm(g, m.x + (k / Math.max(1, m.palms - 1) - 0.5) * m.w * 1.2, m.y - m.h * 0.6, h * 0.035, m.side * 0.4 + Math.sin(t + k) * 0.1, ink, ow * 0.6);
          g.globalAlpha = 1;
        }

        // ---- eruption
        const sx = isl.summit.x + shakeX, sy = Math.min(isl.summit.y, isl.sea + h * 0.01) + shakeY;
        const smokeN = Math.round((6 + p.detail * 14) * (0.5 + p.x3));
        // Surtseyan: black cock's tail jets + white steam
        if (E.jets > 0.02) {
          for (const j of jets(f, sx, isl.sea - h * 0.005, E.jets, 7)) {
            g.lineCap = 'round'; g.lineWidth = j.w * 2 + ow * 0.5; g.strokeStyle = '#2b2630'; g.beginPath(); j.pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
            g.fillStyle = '#2b2630'; for (let k = 2; k < j.pts.length; k += 2) { const [x, y] = j.pts[k]; const r = j.w * (1.2 + hash(k, j.ang) * 1.5) * (0.5 + k / j.pts.length); g.beginPath(); g.arc(x + (hash(k, 1.1) - 0.5) * h * 0.02, y + (hash(k, 2.2) - 0.5) * h * 0.02, r, 0, TAU); g.fill(); }
          }
          drawPuffs(g, puffs(f, smokeN, sx, isl.sea - h * 0.02, { rate: 0.45, rise: 0.22 + 0.1 * E.steam, drift: 0.2, spread: 0.1, r0: 0.03 * (0.6 + p.x3), seed: 3 }), st.smoke, st.smokeInk, ow);
        }
        // lava fountain: bouncy blobs
        if (E.fountain > 0.02) {
          for (const b of fountain(f, sx, sy, E.fountain, 14 + Math.round(p.detail * 14))) {
            const stretch = 1 + p.x2 * 1.2 * Math.abs(0.5 - b.a) * 2;
            roundBlob(g, b.x, b.y, b.r * 1.6 / Math.sqrt(stretch), b.r * 1.6 * Math.sqrt(stretch));
            if (ow > 0.3) { g.lineWidth = ow; g.strokeStyle = ink; g.stroke(); }
            g.fillStyle = lavaCss(0.95 - b.a * 0.5); g.fill();
          }
          drawPuffs(g, puffs(f, Math.round(smokeN * 0.7), sx, sy - h * 0.04, { rate: 0.3, rise: 0.3 + 0.12 * E.fountain, drift: 0.3, spread: 0.08, r0: 0.03 * (0.6 + p.x3), seed: 7 }), null, st.smokeInk, ow, q => mixHex(mode === 'night' ? '#6a6f9a' : '#b8b4be', st.smoke, q.a * 0.6));
        }
        // explosive bursts from the caldera / cinder cones
        if (E.burst > 0.02) {
          const pulse = Math.pow(Math.max(0, Math.sin(t * 1.3)), 6) * E.burst;
          drawPuffs(g, puffs(f, smokeN, sx, sy, { rate: 0.35, rise: 0.36, drift: 0.3, spread: 0.12, r0: 0.035 * (0.6 + p.x3), seed: 11 }), null, st.smokeInk, ow, q => mixHex('#55505a', st.smoke, q.a * 0.5));
          if (pulse > 0.3) { g.fillStyle = lavaCss(0.9); starburst(g, sx, sy - h * 0.02, h * 0.02 * pulse, h * 0.05 * pulse, 8, t); if (ow > 0.3) { g.lineWidth = ow; g.strokeStyle = ink; g.stroke(); } g.fill(); }
        }
        // ocean-entry steam
        if (E.entry > 0.02) for (const fl of flowList) {
          if (!fl.ends) continue;
          drawPuffs(g, puffs(f, Math.round(smokeN * 0.5), fl.x, isl.sea, { rate: 0.5, rise: 0.14, drift: 0.12, spread: 0.05, r0: 0.018 * (0.6 + p.x3), seed: 20 + fl.i }), '#fff', st.smokeInk, ow);
        }
        // quiet island: gentle little cloud at the summit
        if (E.quiet > 0.3 && L.height > 0.1 && p.x3 > 0.1) {
          for (const q of puffs(f, 4, sx, sy - h * 0.02, { rate: 0.12, rise: 0.08, drift: 0.1, spread: 0.04, r0: 0.02 * p.x3, seed: 30 })) { g.globalAlpha = (1 - q.a) * 0.6 * E.quiet; roundBlob(g, q.x, q.y, q.r, q.r * 0.8); g.fillStyle = '#fff'; g.fill(); }
          g.globalAlpha = 1;
        }
        // night glow
        if (night > 0.2 && E.glow > 0.05) { const gr = g.createRadialGradient(sx, sy, 0, sx, sy, h * 0.25 * E.glow); gr.addColorStop(0, `rgba(255,120,40,${0.5 * night})`); gr.addColorStop(1, 'rgba(255,80,20,0)'); g.fillStyle = gr; g.fillRect(sx - h * 0.3, sy - h * 0.3, h * 0.6, h * 0.6); }

        // ---- face
        if (mode === 'face' || mode === 'night') {
          const fy = (isl.sea + Math.max(isl.summit.y, isl.sea - isl.unit * 1.1)) / 2 + h * 0.01, fx = isl.cx + shakeX;
          const open = mode === 'night' ? awake * 0.6 : awake, eyeR = h * 0.022, dx = isl.hw * 0.17;
          const under = L.height < 0.08 ? 0.6 : 1;
          g.save(); g.globalAlpha = under;
          if (isl.sea - fy > h * 0.03 || under < 1) {
            for (const s of [-1, 1]) {
              const ex = fx + s * dx, ey = fy - h * 0.02;
              if (open < 0.35) { g.strokeStyle = ink; g.lineWidth = ow * 1.6 + 1; g.beginPath(); g.arc(ex, ey - eyeR * 0.3, eyeR, 0.2, Math.PI - 0.2); g.stroke(); }
              else {
                g.fillStyle = '#fff'; g.strokeStyle = ink; g.lineWidth = ow * 1.4; g.beginPath(); g.ellipse(ex, ey, eyeR * 1.1, eyeR * (0.4 + open * 0.9), 0, 0, TAU); g.fill(); g.stroke();
                g.fillStyle = ink; g.beginPath(); g.arc(ex + s * eyeR * 0.1, ey + eyeR * 0.2, eyeR * 0.45, 0, TAU); g.fill();
                g.lineWidth = ow * 2 + 1; g.beginPath(); g.moveTo(ex - s * eyeR * 1.3, ey - eyeR * 1.2 - s * 0 + eyeR * 0.3 * open); g.lineTo(ex + s * eyeR * 1.1, ey - eyeR * 1.6); g.stroke();
              }
            }
            g.strokeStyle = ink; g.lineWidth = ow * 1.6 + 1; g.fillStyle = '#3a1a22';
            if (open < 0.35) { g.beginPath(); g.arc(fx, fy + h * 0.02, h * 0.015, 0.1, Math.PI - 0.1); g.stroke(); }
            else { g.beginPath(); g.ellipse(fx, fy + h * 0.03, h * 0.02, h * 0.015 + h * 0.025 * open, 0, 0, TAU); g.fill(); g.stroke(); }
            g.fillStyle = 'rgba(255,120,150,0.4)'; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(fx + s * dx * 1.6, fy + h * 0.01, h * 0.02, h * 0.012, 0, 0, TAU); g.fill(); }
            if (open < 0.35 && p.speed > 0.01 | 1) { // zzz
              g.fillStyle = ink; g.font = `bold ${h * 0.05}px "Comic Sans MS", "Chalkboard SE", sans-serif`; g.textAlign = 'center';
              for (let k = 0; k < 3; k++) { const a = fract(t * 0.3 + k / 3); g.globalAlpha = under * (1 - a) * (1 - open); g.fillText('z', fx + dx * 1.6 + a * h * 0.12 + Math.sin(a * 6) * h * 0.02, fy - h * 0.02 - a * h * 0.2); }
            }
          }
          g.restore(); g.globalAlpha = 1;
        }

        // ---- extras: birds, boat, fish, outrigger
        if (p.x4 > 0.05) {
          const n = Math.round(p.x4 * 6);
          g.strokeStyle = ink; g.lineWidth = ow * 1.2 + 0.5;
          for (const b of birds(f, n, mode.length)) { g.beginPath(); g.moveTo(b.x - b.s, b.y + b.flap * b.s * 0.6); g.quadraticCurveTo(b.x, b.y - b.s * 0.3, b.x + b.s, b.y + b.flap * b.s * 0.6); g.stroke(); }
          if (p.x4 > 0.3 && !(mode === 'face' && L.height < 0)) {
            const bo = boat(f, isl); g.save(); g.translate(bo.x, bo.y); g.rotate(bo.rock); const s = h * 0.045;
            g.fillStyle = mode === 'tiki' ? '#8a4a2a' : '#c0392b'; g.strokeStyle = ink; g.lineWidth = ow * 1.3;
            g.beginPath(); g.moveTo(-s, -s * 0.2); g.lineTo(s, -s * 0.2); g.lineTo(s * 0.7, s * 0.25); g.lineTo(-s * 0.7, s * 0.25); g.closePath(); g.fill(); if (ow > 0.3) g.stroke();
            g.fillStyle = mode === 'tiki' ? '#f3d79a' : '#fff'; g.beginPath(); g.moveTo(0, -s * 0.2); g.lineTo(0, -s * 1.3); g.lineTo(s * 0.8, -s * 0.3); g.closePath(); g.fill(); if (ow > 0.3) g.stroke();
            g.restore();
          }
          if (p.x4 > 0.5) for (let i = 0; i < 3; i++) { // fish seen through the water
            const fx = fract(t * 0.03 * (i % 2 ? 1 : -1) + hash(i, 41)) * w, fy = isl.sea + h * (0.1 + hash(i, 42) * 0.2), s = h * 0.012;
            g.fillStyle = ['#ffb347', '#ff6b6b', '#7bd3f7'][i]; g.strokeStyle = ink; g.lineWidth = ow * 0.8; g.globalAlpha = 0.8;
            g.beginPath(); g.ellipse(fx, fy, s * 1.6, s, 0, 0, TAU); g.moveTo(fx + s * 1.5, fy); g.lineTo(fx + s * 2.6, fy - s * 0.8); g.lineTo(fx + s * 2.6, fy + s * 0.8); g.closePath(); g.fill(); if (ow > 0.3) g.stroke(); g.globalAlpha = 1;
          }
        }
        if (mode === 'tiki') { // foreground palms and torches
          for (const [px, lean] of [[w * 0.06, 0.5], [w * 0.95, -0.5]]) palm(g, px, h, h * 0.42, lean + Math.sin(t * 0.8) * 0.03, ink, ow, '#2f4f2a', '#4a2a1b');
          for (const tx of [w * 0.15, w * 0.86]) { g.fillStyle = '#4a2a1b'; g.fillRect(tx - h * 0.006, h * 0.7, h * 0.012, h * 0.3); const fl = 1 + 0.3 * Math.sin(f.clock * 12 + tx); g.fillStyle = '#ff9a2a'; g.beginPath(); g.ellipse(tx, h * 0.68, h * 0.012, h * 0.03 * fl, 0, 0, TAU); g.fill(); g.fillStyle = '#ffe36a'; g.beginPath(); g.ellipse(tx, h * 0.69, h * 0.006, h * 0.015 * fl, 0, 0, TAU); g.fill(); }
        }

        // ---- comic book: halftone dots, panel border, KA-BOOM
        if (mode === 'comic') {
          g.save(); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.16; g.fillStyle = halftone(w, h); g.fillRect(0, 0, w, h); g.restore();
          g.lineWidth = h * 0.02; g.strokeStyle = '#fff'; g.strokeRect(0, 0, w, h); g.lineWidth = h * 0.006; g.strokeStyle = '#000'; g.strokeRect(h * 0.012, h * 0.012, w - h * 0.024, h - h * 0.024);
          const bang = clamp((E.jets + E.fountain * 0.8 + E.burst * 1.5) * 1.2);
          const word = E.jets > 0.1 ? 'KA-BOOM!' : E.burst > 0.1 ? 'BLAM!' : E.fountain > 0.1 ? 'WHOOSH!' : L.height > 0 ? (L.stage > 0.8 ? 'splash…' : 'zzz…') : 'blub blub';
          const bx = w * 0.26, by = h * 0.3, k = 1 + 0.08 * Math.sin(t * 8) * bang * p.x2;
          g.save(); g.translate(bx, by); g.rotate(-0.12); g.scale(k, k);
          if (bang > 0.1) { g.fillStyle = '#ffeb3b'; g.strokeStyle = '#000'; g.lineWidth = h * 0.006; starburst(g, 0, 0, h * 0.11, h * 0.16, 12, t * 0.5); g.fill(); g.stroke(); }
          else { g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = h * 0.005; g.beginPath(); g.ellipse(0, 0, h * 0.14, h * 0.065, 0, 0, TAU); g.fill(); g.stroke(); g.beginPath(); g.moveTo(h * 0.04, h * 0.05); g.lineTo(h * 0.1, h * 0.12); g.lineTo(h * 0.09, h * 0.05); g.fill(); g.stroke(); }
          g.font = `900 ${h * (bang > 0.1 ? 0.07 : 0.045)}px Impact, "Arial Black", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.lineWidth = h * 0.012; g.strokeStyle = '#000'; g.lineJoin = 'round'; g.strokeText(word, 0, 0); g.fillStyle = bang > 0.1 ? '#ff3b1f' : '#000'; g.fillText(word, 0, 0);
          g.restore();
          g.fillStyle = '#fff'; g.fillRect(h * 0.03, h * 0.03, h * 0.5, h * 0.07); g.strokeStyle = '#000'; g.lineWidth = h * 0.005; g.strokeRect(h * 0.03, h * 0.03, h * 0.5, h * 0.07);
          g.fillStyle = '#000'; g.font = `700 ${h * 0.034}px Impact, "Arial Black", sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText(L.name.toUpperCase(), h * 0.05, h * 0.066);
        }
        if (mode === 'sticker') { // sticker sheet backdrop dots are part of the sky; add a peel-corner highlight
          g.save(); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.08; g.fillStyle = '#fff'; g.fillRect(0, 0, w, isl.sea * 0.5); g.restore();
        }
      },
    };
  },
};

export const scenes = [
  { id: 'cartoon-picturebook', name: 'Picture Book Island', tags: ['cartoon', '2d', 'calm'], desc: 'A soft kids-book island with a smiling sun, puffy steam and a little red boat.',
    opts: { mode: 'picturebook' }, params: { stage: 0.36, grow: 0.5, activity: 0.5, scale: 0.5, light: 0.85, x1: 0.45, x2: 0.4, x3: 0.6, x4: 0.7 } },
  { id: 'cartoon-saturday', name: 'Saturday Morning', tags: ['cartoon', '2d', 'eruption', 'lava'], desc: 'Cel-animation volcano with thick black lines and bouncing lava blobs, racing through its life.',
    opts: { mode: 'saturday' }, params: { stage: 0.3, grow: 0.7, activity: 0.7, scale: 0.55, light: 0.9, x1: 0.7, x2: 0.8, x3: 0.6, x4: 0.5 } },
  { id: 'cartoon-face', name: 'Grumpy Volcano', tags: ['cartoon', '2d', 'eruption'], desc: 'A sleepy island that snores through the quiet ages and wakes up grumpy when it erupts.',
    opts: { mode: 'face' }, params: { stage: 0.4, grow: 0.6, activity: 0.6, scale: 0.6, light: 0.8, x1: 0.55, x2: 0.7, x3: 0.5, x4: 0.5 } },
  { id: 'cartoon-comic', name: 'KA-BOOM Comic', tags: ['cartoon', '2d', 'text', 'surtseyan', 'eruption'], desc: 'Comic-book panel with halftone dots, speed lines and a KA-BOOM at the Surtseyan breach.',
    opts: { mode: 'comic' }, params: { stage: 0.17, grow: 0.55, activity: 0.7, scale: 0.5, light: 0.9, x1: 0.7, x2: 0.6, x3: 0.6, x4: 0.4 } },
  { id: 'cartoon-sticker', name: 'Sticker Sheet', tags: ['cartoon', '2d', 'atoll', 'calm'], desc: 'Flat vector island with a white sticker border on a pastel sheet, from reef to atoll.',
    opts: { mode: 'sticker' }, params: { stage: 0.78, grow: 0.5, activity: 0.4, scale: 0.5, light: 0.95, x1: 0.5, x2: 0.3, x3: 0.4, x4: 0.6 } },
  { id: 'cartoon-clay', name: 'Claymation', tags: ['cartoon', '2d', 'hawaii', 'lava'], desc: 'Soft-shaded clay island with ropy lava and thumb-print steam, no hard outlines.',
    opts: { mode: 'clay' }, params: { stage: 0.42, grow: 0.5, activity: 0.6, scale: 0.6, light: 0.7, x1: 0.3, x2: 0.5, x3: 0.5, x4: 0.4 } },
  { id: 'cartoon-tiki', name: 'Tiki Lounge', tags: ['cartoon', '2d', 'retro', 'hawaii'], desc: 'Mid-century tiki print: spiky orange sun, teal sea, palms and torches framing a smoking peak.',
    opts: { mode: 'tiki' }, params: { stage: 0.55, grow: 0.4, activity: 0.5, scale: 0.5, light: 0.32, x1: 0.5, x2: 0.3, x3: 0.5, x4: 0.6 } },
  { id: 'cartoon-night', name: 'Goodnight Volcano', tags: ['cartoon', '2d', 'night', 'calm', 'lava'], desc: 'A cute night scene: stars, a crescent moon, a sleepy island face and a soft lava glow.',
    opts: { mode: 'night' }, params: { stage: 0.47, grow: 0.3, activity: 0.5, scale: 0.55, light: 0.05, x1: 0.4, x2: 0.4, x3: 0.5, x4: 0.5 } },
];
