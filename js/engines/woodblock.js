// Woodblock & ink: ukiyo-e print, sumi-e wash, shan shui hanging scroll, linocut, Victorian engraving,
// blue-and-white porcelain and a night print. Flat colour blocks with keylines, paper grain and a red seal.
import { clamp, lerp, smooth, fract, hash, rng, buffer, sky, mixHex } from '../util.js';
import { TAU, island, eruption, surfacePath, capPath, climbPath, puffs, jets, fountain, flows, reefPoints, motus, birds, boat, nightAmt, goldAmt } from './_shared2d.js';

const STYLES = {
  ukiyoe:    { paper: '#efe3c6', ink: '#23324f', blue: '#1b3a6b', blue2: '#4e78a8', sea: '#2e5f93', foam: '#f4ecd8', rock: '#5a4a44', rock2: '#3a2f33', green: '#5f7f52', green2: '#3f5e3c', sand: '#e8d7a6', lava: '#c8422b', smoke: '#e9e1cf', lw: 1, claws: 1, seal: 1 },
  sumie:     { paper: '#f1ead9', ink: '#1c1a19', blue: '#3a3a3a', blue2: '#8a8a86', sea: '#cfc8b6', foam: '#f1ead9', rock: '#3a3632', rock2: '#1c1a19', green: '#6c6a5c', green2: '#4a4842', sand: '#e2dac4', lava: '#b8352a', smoke: '#9a958c', lw: 0.8, claws: 0, seal: 1, mono: 1 },
  shanshui:  { paper: '#ece4cf', ink: '#2b3630', blue: '#4f7a7a', blue2: '#8fb0a4', sea: '#9fbdb2', foam: '#ece4cf', rock: '#6f8a7c', rock2: '#3f5a50', green: '#5e8a6a', green2: '#3b6350', sand: '#dccfa8', lava: '#c0472f', smoke: '#d8d4c3', lw: 0.7, claws: 0, seal: 1, scroll: 1 },
  linocut:   { paper: '#f0e6d0', ink: '#141414', blue: '#141414', blue2: '#141414', sea: '#141414', foam: '#f0e6d0', rock: '#141414', rock2: '#141414', green: '#141414', green2: '#141414', sand: '#f0e6d0', lava: '#d7452b', smoke: '#f0e6d0', lw: 1.6, claws: 0, seal: 0, lino: 1 },
  engraving: { paper: '#f3ecd9', ink: '#2a2420', blue: '#2a2420', blue2: '#6a625a', sea: '#f3ecd9', foam: '#f3ecd9', rock: '#f3ecd9', rock2: '#2a2420', green: '#f3ecd9', green2: '#2a2420', sand: '#f3ecd9', lava: '#2a2420', smoke: '#f3ecd9', lw: 0.5, claws: 0, seal: 0, hatch: 1 },
  porcelain: { paper: '#f5f6f1', ink: '#1d3f8f', blue: '#1d3f8f', blue2: '#6f8fcc', sea: '#3b63b8', foam: '#f5f6f1', rock: '#5f80c6', rock2: '#1d3f8f', green: '#9db6e0', green2: '#3b63b8', sand: '#f5f6f1', lava: '#1d3f8f', smoke: '#f5f6f1', lw: 0.9, claws: 1, seal: 0, blue1: 1 },
  nightprint:{ paper: '#1a2238', ink: '#0b0f1c', blue: '#0f1a36', blue2: '#2b3d6e', sea: '#172a52', foam: '#c9d2e8', rock: '#2a2f45', rock2: '#151a2c', green: '#2b4a44', green2: '#1b332f', sand: '#8f8a78', lava: '#ff6a2a', smoke: '#5c6690', lw: 1, claws: 1, seal: 1, night: 1 },
};

function grainTex(w, h, dark = true) {
  const b = buffer(w, h), g = b.ctx, R = rng(7), n = Math.round(w * h / 9);
  for (let i = 0; i < n; i++) { const a = R(); g.fillStyle = dark ? `rgba(60,40,20,${a * 0.22})` : `rgba(255,255,255,${a * 0.2})`; g.fillRect(R() * w, R() * h, 1 + R() * 1.5, 1); }
  // paper fibres
  g.strokeStyle = 'rgba(80,60,30,0.08)'; g.lineWidth = 1;
  for (let i = 0; i < w / 6; i++) { const x = R() * w, y = R() * h, l = 4 + R() * 14, a = (R() - 0.5) * 0.6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  return b.canvas;
}
function hatchTex(cell, angle, lw, col, cross = false) {
  const b = buffer(cell, cell), g = b.ctx;
  g.strokeStyle = col; g.lineWidth = lw; g.translate(cell / 2, cell / 2); g.rotate(angle);
  const d = cell * 2; g.beginPath(); for (let y = -d; y <= d; y += cell / 2) { g.moveTo(-d, y); g.lineTo(d, y); } g.stroke();
  if (cross) { g.rotate(Math.PI / 2); g.beginPath(); for (let y = -d; y <= d; y += cell / 2) { g.moveTo(-d, y); g.lineTo(d, y); } g.stroke(); }
  return b.canvas;
}

// Hokusai claw wave: a curling crest with foam fingers. s = size, dir = 1 curls to the right.
function clawWave(g, x, y, s, dir, fill, foam, ink, lw) {
  g.save(); g.translate(x, y); g.scale(dir, 1);
  g.beginPath(); g.moveTo(-s * 1.2, 0);
  g.bezierCurveTo(-s * 0.9, -s * 0.2, -s * 0.5, -s * 0.9, s * 0.1, -s * 0.95);
  g.bezierCurveTo(s * 0.55, -s * 1.0, s * 0.75, -s * 0.7, s * 0.55, -s * 0.5);
  g.bezierCurveTo(s * 0.45, -s * 0.45, s * 0.3, -s * 0.55, s * 0.35, -s * 0.68);
  g.bezierCurveTo(s * 0.2, -s * 0.6, s * 0.15, -s * 0.35, s * 0.45, -s * 0.2);
  g.lineTo(s * 1.2, 0); g.closePath();
  g.fillStyle = fill; g.fill(); if (lw > 0) { g.strokeStyle = ink; g.lineWidth = lw; g.lineJoin = 'round'; g.stroke(); }
  // foam fingers along the crest
  g.fillStyle = foam;
  for (let i = 0; i < 9; i++) {
    const q = i / 8, px = lerp(-s * 0.7, s * 0.7, q), py = -s * (0.5 + 0.5 * Math.sin(q * Math.PI)) - s * 0.02;
    const r = s * (0.05 + 0.07 * Math.sin(q * Math.PI));
    g.beginPath(); g.moveTo(px - r, py); g.quadraticCurveTo(px, py - r * 2.2, px + r * 0.4, py + r * 1.6); g.quadraticCurveTo(px, py + r * 0.6, px - r, py); g.fill();
    if (lw > 0) { g.lineWidth = lw * 0.6; g.stroke(); }
  }
  g.restore();
}

function pine(g, x, y, s, ink, green) {
  g.strokeStyle = ink; g.lineWidth = s * 0.12; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + s * 0.2, y - s * 0.5, x - s * 0.1, y - s); g.stroke();
  g.fillStyle = green;
  for (const [dx, dy, r] of [[-0.1, -1.05, 0.32], [0.3, -0.8, 0.22], [-0.35, -0.75, 0.2]]) { g.beginPath(); g.ellipse(x + dx * s, y + dy * s, r * s, r * s * 0.5, 0, 0, TAU); g.fill(); g.lineWidth = s * 0.05; g.stroke(); }
}

function seal(g, x, y, s, rot = 0) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = '#c0392b'; g.fillRect(-s / 2, -s / 2, s, s);
  g.strokeStyle = '#f2e6c9'; g.lineWidth = s * 0.09; g.lineCap = 'square';
  g.beginPath();
  for (const [a, b, c, d] of [[-0.3, -0.3, 0.3, -0.3], [0, -0.3, 0, 0.3], [-0.3, 0.05, 0.3, 0.05], [-0.3, 0.3, -0.05, 0.3], [0.12, 0.18, 0.3, 0.3], [-0.3, -0.1, -0.1, -0.1]]) { g.moveTo(a * s, b * s); g.lineTo(c * s, d * s); }
  g.stroke(); g.restore();
}
// A vertical cartouche of brush marks that stands in for a title (no CJK fonts needed)
function cartouche(g, x, y, w, h, paper, ink, seedN, bars = 7) {
  g.fillStyle = paper; g.fillRect(x, y, w, h); g.strokeStyle = ink; g.lineWidth = w * 0.06; g.strokeRect(x, y, w, h);
  g.lineCap = 'round';
  for (let i = 0; i < bars; i++) {
    const cy = y + h * (0.1 + 0.8 * i / (bars - 1)), k = hash(i, seedN);
    g.lineWidth = w * (0.08 + 0.1 * k); g.beginPath(); g.moveTo(x + w * (0.2 + 0.15 * k), cy); g.lineTo(x + w * (0.6 + 0.25 * hash(i, seedN + 1)), cy + w * (hash(i, seedN + 2) - 0.5) * 0.3); g.stroke();
    if (k > 0.5) { g.beginPath(); g.moveTo(x + w * 0.5, cy - w * 0.1); g.lineTo(x + w * 0.45, cy + w * 0.2); g.stroke(); }
  }
}

export default {
  id: 'woodblock',
  name: 'Woodblock & Ink',
  kind: '2d',
  params: [
    { id: 'x1', label: 'Line weight', value: 0.5, tip: 'Thickness of the keyline' },
    { id: 'x2', label: 'Waves', value: 0.5, tip: 'Size of the foreground waves' },
    { id: 'x3', label: 'Grain', value: 0.5, tip: 'Paper texture and ink bleed' },
    { id: 'x4', label: 'Ornament', value: 0.5, tip: 'Seals, cartouches, borders and captions' },
  ],
  create(ctx, opts) {
    const mode = opts.mode || 'ukiyoe', st = STYLES[mode] || STYLES.ukiyoe;
    let tex = {}, texKey = '';
    const textures = (w, h) => {
      const key = w + 'x' + h; if (texKey === key) return tex;
      tex = { grain: grainTex(w, h, !st.night) };
      if (st.hatch) {
        const c = Math.max(5, Math.round(h / 32)), lw = Math.max(1, h / 400);
        tex.h1 = ctx.createPattern(hatchTex(c, 0.75, lw, 'rgba(42,36,32,1)'), 'repeat');
        tex.h2 = ctx.createPattern(hatchTex(c, 0.75, lw, 'rgba(42,36,32,1)', true), 'repeat');
        tex.h3 = ctx.createPattern(hatchTex(c, -0.6, lw, 'rgba(42,36,32,0.8)'), 'repeat');
        tex.h0 = ctx.createPattern(hatchTex(c, 0, lw * 0.8, 'rgba(42,36,32,0.8)'), 'repeat');
      }
      if (st.lino) { const c = Math.max(4, Math.round(h / 60)); tex.carve = ctx.createPattern(hatchTex(c, 0.9, Math.max(1, c * 0.25), st.paper), 'repeat'); tex.carve2 = ctx.createPattern(hatchTex(c * 1.3, 0.2, Math.max(1, c * 0.2), st.paper), 'repeat'); }
      if (st.blue1) { const c = Math.max(4, Math.round(h / 55)); tex.bh = ctx.createPattern(hatchTex(c, 0.8, 1, 'rgba(29,63,143,0.7)'), 'repeat'); }
      texKey = key; return tex;
    };

    function paintScene(f, T) {
      const { ctx: g, w, h, t, p } = f, L = f.life;
      const isl = island(f, st.scroll ? { horizon: 0.72, unit: 1.5, aspect: 1.15 } : { horizon: mode === 'sumie' ? 0.66 : 0.62 });
      const E = eruption(f, isl);
      const night = st.night ? Math.max(0.8, nightAmt(f)) : nightAmt(f), gold = goldAmt(f);
      const lw = h * (0.0015 + p.x1 * 0.006) * st.lw;
      const ink = st.ink, X = isl.X, Y = isl.Y, mono = !!st.mono, bleed = mono ? h * 0.02 * p.x3 : 0;
      const dark = (c, k) => mixHex(c, '#0a0d18', night * k);
      g.lineJoin = 'round'; g.lineCap = 'round';

      // ---- sky: paper with bokashi bands
      sky(f, (c, w, h) => {
        c.fillStyle = st.night ? st.paper : dark(st.paper, 0.85); c.fillRect(0, 0, w, h);
        if (!st.hatch && !st.lino) {
          const top = c.createLinearGradient(0, 0, 0, h * 0.4);
          const bc = st.night ? '#070b1c' : mono ? 'rgba(40,40,40,0.35)' : st.blue1 ? 'rgba(29,63,143,0.55)' : gold > 0 ? mixHex('#1b3a6b', '#b04a3a', gold * 0.7) : dark(st.blue, 0.6);
          top.addColorStop(0, bc); top.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = top; c.fillRect(0, 0, w, h * 0.4);
          if (!mono && !st.scroll) { const hz = c.createLinearGradient(0, isl.sea - h * 0.2, 0, isl.sea); hz.addColorStop(0, 'rgba(0,0,0,0)'); hz.addColorStop(1, st.night ? 'rgba(90,70,120,0.35)' : gold > 0 ? `rgba(220,120,60,${0.45 * gold + 0.1})` : 'rgba(210,120,80,0.22)'); c.fillStyle = hz; c.fillRect(0, isl.sea - h * 0.2, w, h * 0.2); }
        }
        if (st.hatch) { c.save(); c.fillStyle = T.h0; c.globalAlpha = 0.5; c.fillRect(0, isl.sea - h * 0.16, w, h * 0.16); c.restore(); }
        if (st.lino) { c.strokeStyle = ink; c.lineWidth = lw * 1.2; const sx = w * 0.78, sy = h * 0.12; for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; c.beginPath(); c.moveTo(sx + Math.cos(a) * h * 0.11, sy + Math.sin(a) * h * 0.11); c.lineTo(sx + Math.cos(a) * h * (0.16 + 0.1 * (i % 2)), sy + Math.sin(a) * h * (0.16 + 0.1 * (i % 2))); c.stroke(); } c.fillStyle = ink; c.beginPath(); c.arc(sx, sy, h * 0.08, 0, TAU); c.fill(); c.fillStyle = st.lava; c.beginPath(); c.arc(sx, sy, h * 0.06, 0, TAU); c.fill(); }
        // sun disc (red in a print) or moon
        if (!st.hatch && !st.lino) {
          if (night < 0.85) { c.save(); c.globalAlpha = 1 - night; c.fillStyle = mono ? 'rgba(180,60,50,0.75)' : st.blue1 ? st.blue : '#c8452c'; c.beginPath(); c.arc(w * (isl.wind < 0 ? 0.24 : 0.76), h * (0.14 + (1 - p.light) * 0.3), h * 0.06, 0, TAU); c.fill(); c.restore(); }
          if (night > 0.2) { c.save(); c.globalAlpha = night; c.fillStyle = st.night ? '#e8e2c8' : mono ? '#e9e3d2' : '#efe6c9'; c.beginPath(); c.arc(w * 0.78, h * 0.14, h * 0.055, 0, TAU); c.fill(); if (st.night) { c.fillStyle = '#e8e2c8'; for (let i = 0; i < 60; i++) { c.globalAlpha = night * (0.4 + 0.6 * hash(i, 13)); c.beginPath(); c.arc(hash(i, 11) * w, hash(i, 12) * isl.sea * 0.9, h * 0.002, 0, TAU); c.fill(); } } c.restore(); }
        }
        if (st.scroll) { // layered distant peaks in mist
          for (let k = 3; k >= 1; k--) {
            c.fillStyle = mixHex(st.blue2, st.paper, 0.25 + k * 0.18); c.globalAlpha = 0.9; c.beginPath(); c.moveTo(0, isl.sea);
            for (let i = 0; i <= 40; i++) { const x = i / 40 * w; const n = 0.5 + 0.5 * Math.sin(i * 0.33 * (1 + k * 0.3) + k * 7) * Math.cos(i * 0.11 + k); const yy = isl.sea - h * (0.1 + 0.12 * k) * n * n - h * 0.06 * k; c.lineTo(x, yy); }
            c.lineTo(w, isl.sea); c.closePath(); c.fill(); c.globalAlpha = 1;
          }
        }
        if (mono) { c.strokeStyle = 'rgba(30,30,30,0.5)'; c.lineWidth = lw * 1.5; for (const b of birds(f, 3, 9)) { c.beginPath(); c.moveTo(b.x - b.s * 1.4, b.y + b.flap * b.s * 0.5); c.quadraticCurveTo(b.x, b.y - b.s * 0.4, b.x + b.s * 1.4, b.y + b.flap * b.s * 0.5); c.stroke(); } }
      });

      // ---- sea block
      const seaCol = st.night ? st.sea : dark(st.sea, 0.6);
      if (st.hatch) { g.fillStyle = st.paper; g.fillRect(0, isl.sea, w, h - isl.sea); g.save(); g.globalAlpha = 0.6; g.fillStyle = T.h0; g.fillRect(0, isl.sea, w, h - isl.sea); g.restore(); }
      else { g.fillStyle = seaCol; g.fillRect(0, isl.sea, w, h - isl.sea); }
      if (!mono && !st.hatch) { const gr = g.createLinearGradient(0, isl.sea, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(1, st.lino ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,0.25)'); g.fillStyle = gr; g.fillRect(0, isl.sea, w, h - isl.sea); }
      // ghost of the submerged edifice (a lighter wash) so the seamount and the drowning island read
      if (!st.lino) { g.save(); g.beginPath(); g.rect(0, isl.sea + 1, w, h); g.clip(); g.globalAlpha = st.hatch ? 0.35 : 0.12; g.fillStyle = st.hatch ? T.h3 : st.night ? '#000' : mixHex(st.ink, st.foam, 0.45); g.beginPath(); surfacePath(g, isl, -1.3, 1.3, h + 10, 60); g.fill(); g.restore(); }

      // ---- island body (above sea level), with bleed in wet styles
      const draw = (fillStyle, blur = 0, alpha = 1) => {
        g.save(); if (blur) { g.filter = `blur(${blur}px)`; } g.globalAlpha = alpha; g.fillStyle = fillStyle;
        g.beginPath(); surfacePath(g, isl, -1.3, 1.3, isl.sea + h * 0.004, 90); g.fill(); g.restore();
      };
      if (L.height > -0.02) {
        g.save(); g.beginPath(); g.rect(0, 0, w, isl.sea + h * 0.004); g.clip();
        if (bleed) draw(ink, bleed, 0.35);
        if (st.hatch) { draw(st.paper); g.save(); g.beginPath(); surfacePath(g, isl, -1.3, 1.3, isl.sea + h * 0.004, 90); g.clip(); g.fillStyle = T.h1; g.fillRect(0, 0, w, h); g.fillStyle = T.h2; g.globalAlpha = 0.9; g.beginPath(); g.moveTo(isl.cx, -h); g.lineTo(w + h, -h); g.lineTo(w + h, h); g.lineTo(isl.cx + h * 0.05, h); g.closePath(); g.fill(); g.restore(); }
        else if (st.lino) { draw(ink); g.save(); g.beginPath(); surfacePath(g, isl, -1.3, 1.3, isl.sea + h * 0.004, 90); g.clip(); g.fillStyle = T.carve; g.globalAlpha = 0.9; g.beginPath(); g.moveTo(-w, -h); g.lineTo(isl.cx, -h); g.lineTo(isl.cx - h * 0.02, h); g.lineTo(-w, h); g.closePath(); g.fill(); g.globalAlpha = 1; g.restore(); }
        else {
          const gr = g.createLinearGradient(isl.cx - isl.hw * 0.5, 0, isl.cx + isl.hw * 0.6, 0);
          gr.addColorStop(0, dark(mono ? '#6a6660' : st.rock, 0.5)); gr.addColorStop(1, dark(mono ? '#262422' : st.rock2, 0.5)); draw(gr);
          // bokashi: paler towards the summit (mist) in prints
          if (st.blue1) { g.save(); g.beginPath(); surfacePath(g, isl, -1.3, 1.3, isl.sea + h * 0.004, 90); g.clip(); g.fillStyle = T.bh; g.beginPath(); g.moveTo(isl.cx, -h); g.lineTo(w + h, -h); g.lineTo(w + h, h); g.lineTo(isl.cx + h * 0.03, h); g.closePath(); g.fill(); g.restore(); }
          if (!mono) { g.save(); g.beginPath(); surfacePath(g, isl, -1.3, 1.3, isl.sea + h * 0.004, 90); g.clip(); const bk = g.createLinearGradient(0, isl.summit.y, 0, isl.sea); bk.addColorStop(0, st.night ? 'rgba(80,90,130,0.35)' : 'rgba(240,230,210,0.35)'); bk.addColorStop(0.6, 'rgba(0,0,0,0)'); g.fillStyle = bk; g.fillRect(0, 0, w, h); g.restore(); }
        }
        g.save(); g.beginPath(); surfacePath(g, isl, -1.3, 1.3, isl.sea + h * 0.004, 90); g.clip();
        // fresh tephra / lava cap near the summit while building
        const fresh = (1 - smooth(0.5, 0.66, L.stage)) * (1 - L.submarine) * 0.8 + L.steam * 0.7;
        if (fresh > 0.02 && !st.hatch) { g.globalAlpha = fresh * 0.9; g.fillStyle = st.lino ? ink : st.blue1 ? st.blue : mono ? '#1c1a19' : dark('#2a2326', 0.3); g.beginPath(); capPath(g, isl, 0.55, isl.unit * 0.4 + h * 0.03); g.fill(); g.globalAlpha = 1; }
        // vegetation climbs from the coast
        if (L.veg > 0.02) {
          const climb = isl.sea - clamp(L.veg * 1.3) * (isl.sea - isl.summit.y + h * 0.05);
          g.save(); g.beginPath(); climbPath(g, w, h, climb, h * 0.015, f.epoch); g.clip();
          if (st.hatch) { g.fillStyle = T.h3; g.globalAlpha = 0.8 * L.veg; g.beginPath(); surfacePath(g, isl, -1.3, 1.3, isl.sea, 60); g.fill(); }
          else if (st.lino) { g.fillStyle = T.carve2; g.globalAlpha = 0.9 * L.veg; g.beginPath(); surfacePath(g, isl, -1.3, 1.3, isl.sea, 60); g.fill(); }
          else { g.globalAlpha = clamp(L.veg * 1.2) * (mono ? 0.5 : 0.85); g.fillStyle = dark(st.green, 0.5); g.beginPath(); surfacePath(g, isl, -1.3, 1.3, isl.sea, 60); g.fill();
            g.fillStyle = dark(st.green2, 0.5); g.globalAlpha *= 0.9; const nb = 12 + Math.round(p.detail * 16);
            for (let i = 0; i <= nb; i++) { const u = (i / nb - 0.5) * 2.2; const y = Y(u); if (y < isl.sea - h * 0.03) { const r = h * (0.012 + 0.012 * hash(i, 51)); g.beginPath(); g.ellipse(X(u), y + r, r * 1.6, r * 0.8, 0, 0, TAU); g.fill(); } }
          }
          g.restore(); g.globalAlpha = 1;
        }
        // valleys and cliffs as keylines
        if (L.erosion > 0.05) { g.strokeStyle = st.lino ? st.paper : ink; g.globalAlpha = L.erosion; g.lineWidth = lw * 1.2; for (let i = 0; i < 7; i++) { const u = (i / 6 - 0.5) * 1.3; const y0 = Y(u); if (y0 < isl.sea - h * 0.03) { g.beginPath(); g.moveTo(X(u), y0 + h * 0.015); g.quadraticCurveTo(X(u * 1.08), (y0 + isl.sea) / 2, X(u * 1.2), isl.sea); g.stroke(); } } g.globalAlpha = 1; }
        // lava flows down the facing flank
        const flowList = flows(f, isl, E.flows, 3);
        for (const fl of flowList) {
          g.lineWidth = h * (0.006 + 0.01 * E.flows) + lw; g.strokeStyle = st.lino ? st.paper : ink; g.beginPath(); fl.pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); if (!mono) g.stroke();
          g.lineWidth = Math.max(1, g.lineWidth - lw * 2); g.strokeStyle = st.hatch ? ink : st.lava; g.stroke();
          if (st.night) { g.save(); g.filter = `blur(${h * 0.01}px)`; g.globalAlpha = 0.6; g.lineWidth *= 2.5; g.stroke(); g.restore(); }
        }
        // caldera rim
        if (L.caldera > 0.1) { g.fillStyle = E.glow > 0.2 ? st.lava : ink; g.globalAlpha = 0.9; g.beginPath(); g.ellipse(isl.summit.x, Y(0) + h * 0.004, isl.hw * 0.1 * L.caldera, h * 0.005, 0, 0, TAU); g.fill(); g.globalAlpha = 1; }
        g.restore();
        // keyline
        g.strokeStyle = st.lino ? ink : ink; g.lineWidth = lw * 2;
        g.beginPath(); for (let i = 0; i <= 90; i++) { const u = -1.3 + 2.6 * i / 90; const y = Y(u); if (y < isl.sea) { i ? g.lineTo(X(u), y) : g.moveTo(X(u), y); } else g.moveTo(X(u), isl.sea); } if (!mono || p.x1 > 0.5) g.stroke();
        g.restore();
        return { isl, E, flowList, lw, ink, night };
      }
      return { isl, E, flowList: [], lw, ink, night };
    }

    function paintWater(f, T, R) {
      const { ctx: g, w, h, t, p } = f, L = f.life, { isl, E, lw, ink, night } = R;
      const X = isl.X, Y = isl.Y, mono = !!st.mono;
      // reef, lagoon, motu
      if (L.reef > 0.02) {
        const rp = reefPoints(isl), lag = L.lagoon;
        if (!st.hatch && !st.lino) { g.fillStyle = st.blue1 ? 'rgba(255,255,255,0.35)' : mono ? 'rgba(255,255,255,0.25)' : `rgba(150,230,220,${0.4 * (0.3 + 0.7 * lag)})`; g.globalAlpha = L.reef; g.beginPath(); g.ellipse((rp[0].x + rp[1].x) / 2, isl.sea + h * 0.004, (rp[1].x - rp[0].x) / 2, h * 0.02 + isl.unit * 0.03 * lag, 0, 0, TAU); g.fill(); g.globalAlpha = 1; }
        for (const r of rp) { g.fillStyle = st.foam; g.strokeStyle = ink; g.lineWidth = lw; g.globalAlpha = L.reef; for (let k = -2; k <= 2; k++) { g.beginPath(); g.arc(r.x + k * h * 0.012, isl.sea + Math.sin(t * 3 + k) * h * 0.002, h * 0.006, Math.PI, 0); g.fill(); g.stroke(); } g.globalAlpha = 1; }
      }
      for (const m of motus(isl)) {
        g.globalAlpha = m.vis; g.fillStyle = st.sand; g.strokeStyle = ink; g.lineWidth = lw * 1.5;
        g.beginPath(); g.ellipse(m.x, m.y, m.w, m.h * 1.3, 0, Math.PI, TAU); g.closePath(); g.fill(); g.stroke();
        for (let k = 0; k < m.palms; k++) pine(g, m.x + (k / Math.max(1, m.palms - 1) - 0.5) * m.w * 1.1, m.y - m.h * 0.5, h * 0.04, ink, st.lino ? ink : st.green2);
        g.globalAlpha = 1;
      }
      // bubbling / discoloured sea while the vent is under water
      if (E.bubbles > 0.02) {
        const k = E.bubbles * (0.35 + 0.65 * smooth(-0.75, -0.2, L.height)); g.save(); g.globalAlpha = k;
        g.fillStyle = st.hatch ? st.paper : mono ? 'rgba(255,255,255,0.5)' : mixHex(st.foam, '#9fd8b8', 0.4); g.beginPath(); g.ellipse(isl.summit.x, isl.sea + h * 0.006, isl.hw * 0.22, h * 0.018, 0, 0, TAU); g.fill();
        g.strokeStyle = ink; g.lineWidth = lw; for (let i = 0; i < 12; i++) { const a = fract(t * 0.35 + hash(i, 31)); g.beginPath(); g.arc(isl.summit.x + (hash(i, 32) - 0.5) * isl.hw * 0.3, isl.sea + h * 0.012 - a * h * 0.03 + h * 0.03, h * 0.003 + a * h * 0.004, 0, TAU); g.stroke(); }
        for (const q of puffs(f, 8, isl.summit.x, isl.sea, { rate: 0.3, rise: 0.08, drift: 0.1, spread: 0.1, r0: 0.015, seed: 40 })) { g.globalAlpha = k * (1 - q.a) * 0.7; g.fillStyle = st.foam; g.beginPath(); g.ellipse(q.x, q.y, q.r, q.r * 0.7, 0, 0, TAU); g.fill(); }
        g.restore();
      }
      // wave crest lines and foreground claws
      const ws = h * (0.04 + p.x2 * 0.14);
      if (st.hatch) { g.strokeStyle = ink; g.lineWidth = lw * 1.4; for (let i = 0; i < 14; i++) { const y = isl.sea + h * 0.02 + i * h * 0.03, x0 = fract(hash(i, 23) + t * 0.03 * (i % 2 ? 1 : -1)) * w; g.beginPath(); for (let k = 0; k <= 8; k++) { const x = x0 - h * 0.1 + k * h * 0.025; g.lineTo(x, y + Math.sin(k * 1.2 + t) * h * 0.006); } g.stroke(); } }
      else if (st.lino) { g.strokeStyle = st.paper; g.lineWidth = lw * 1.6; for (let i = 0; i < 10; i++) { const y = isl.sea + h * 0.03 + i * h * 0.04; g.beginPath(); for (let x = -h * 0.2; x <= w + h * 0.2; x += 6) { const yy = y + Math.sin(x / h * 10 + t * 1.5 + i * 2) * h * 0.012 * (1 + i * 0.1); x < 0 ? g.moveTo(x, yy) : g.lineTo(x, yy); } g.stroke(); } }
      else if (mono) { g.strokeStyle = 'rgba(40,40,40,0.55)'; g.lineWidth = lw * 2; for (let i = 0; i < 6; i++) { const y = isl.sea + h * 0.04 + i * h * 0.05, x0 = fract(hash(i, 23) + t * 0.02 * (i % 2 ? 1 : -1)) * w; g.beginPath(); g.moveTo(x0 - h * 0.2, y); g.quadraticCurveTo(x0, y - h * 0.02, x0 + h * 0.2, y); g.stroke(); } }
      else {
        g.strokeStyle = st.blue1 ? st.foam : mixHex(st.foam, st.sea, 0.3); g.lineWidth = lw * 1.5;
        for (let i = 0; i < 10; i++) { const y = isl.sea + h * 0.025 + i * h * 0.035, x0 = fract(hash(i, 23) + t * 0.03 * (i % 2 ? 1 : -1)) * w; g.beginPath(); for (let k = 0; k <= 6; k++) { const x = x0 - h * 0.09 + k * h * 0.03; g.lineTo(x, y + Math.sin(k * 1.5 + t * 2) * h * 0.005); } g.stroke(); }
        if (st.claws && p.x2 > 0.05) {
          const n = 2 + Math.round(p.x2 * 2);
          for (let i = 0; i < n; i++) {
            const x = fract(hash(i, 61) + t * 0.015 * (i % 2 ? 1 : -1)) * (w + ws * 3) - ws * 1.5, y = h * (0.86 + 0.1 * hash(i, 62)) + Math.sin(t * 1.2 + i) * h * 0.01;
            clawWave(g, x, y, ws * (0.7 + 0.5 * hash(i, 63)), i % 2 ? -1 : 1, st.night ? st.sea : st.blue1 ? st.blue : mixHex(st.sea, st.blue, 0.5), st.foam, ink, lw * 1.5);
          }
        }
      }
      // boats
      if (p.x4 > 0.2 && !st.scroll) {
        const bo = boat(f, isl); g.save(); g.translate(bo.x, bo.y); g.rotate(bo.rock); const s = h * 0.05;
        g.fillStyle = st.lino ? ink : st.blue1 ? st.foam : mono ? '#2a2826' : '#6b4a2f'; g.strokeStyle = ink; g.lineWidth = lw * 1.5;
        g.beginPath(); g.moveTo(-s * 1.2, -s * 0.25); g.quadraticCurveTo(-s * 0.9, s * 0.35, -s * 0.4, s * 0.3); g.lineTo(s * 0.7, s * 0.3); g.quadraticCurveTo(s * 1.1, s * 0.2, s * 1.3, -s * 0.4); g.lineTo(-s * 1.2, -s * 0.25); g.closePath(); g.fill(); g.stroke();
        for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(-s * 0.6 + k * s * 0.5, -s * 0.5, s * 0.16, 0, TAU); g.fillStyle = ink; g.fill(); g.strokeStyle = ink; g.lineWidth = lw * 1.2; g.beginPath(); g.moveTo(-s * 0.6 + k * s * 0.5, -s * 0.35); g.lineTo(-s * 0.6 + k * s * 0.5 + Math.sin(t * 3 + k) * s * 0.4, s * 0.45); g.stroke(); }
        if (st.night) { g.fillStyle = '#ffb347'; g.beginPath(); g.arc(s * 0.9, -s * 0.7, s * 0.14, 0, TAU); g.fill(); }
        g.restore();
      }
    }

    function paintEruption(f, T, R) {
      const { ctx: g, w, h, t, p } = f, L = f.life, { isl, E, flowList, lw, ink, night } = R;
      const mono = !!st.mono, sx = isl.summit.x, sy = Math.min(isl.summit.y, isl.sea);
      const smokeN = Math.round(8 + p.detail * 16);
      const puffFill = st.hatch ? st.paper : st.lino ? st.paper : st.smoke;
      const drawPuff = (q, fill, alpha) => { g.globalAlpha = alpha; g.fillStyle = fill; g.beginPath(); g.ellipse(q.x, q.y, q.r, q.r * 0.8, 0, 0, TAU); g.fill(); if (!mono) { g.strokeStyle = ink; g.lineWidth = lw * 1.3; g.stroke(); } };
      const bleedPuffs = (list, fill) => {
        if (mono) { g.save(); g.filter = `blur(${h * 0.012 * (0.3 + p.x3)}px)`; for (const q of list) { g.globalAlpha = (1 - q.a) * 0.5; g.fillStyle = fill; g.beginPath(); g.ellipse(q.x, q.y, q.r * 1.2, q.r, 0, 0, TAU); g.fill(); } g.restore(); }
        for (const q of list) drawPuff(q, fill, mono || st.scroll ? (1 - q.a) * 0.55 : q.a > 0.7 ? (1 - q.a) / 0.3 : 1);
        g.globalAlpha = 1;
      };
      if (E.jets > 0.02) {
        for (const j of jets(f, sx, isl.sea - h * 0.004, E.jets, 8)) {
          g.lineWidth = j.w * 2.2; g.strokeStyle = ink; g.beginPath(); j.pts.forEach(([x, y], k) => k ? g.lineTo(x, y) : g.moveTo(x, y)); g.stroke();
          g.fillStyle = ink; for (let k = 3; k < j.pts.length; k += 2) { const [x, y] = j.pts[k]; g.beginPath(); g.arc(x + (hash(k, 1.1) - 0.5) * h * 0.02, y + (hash(k, 2.2) - 0.5) * h * 0.02, j.w * (1 + hash(k, j.ang) * 1.4), 0, TAU); g.fill(); }
        }
        bleedPuffs(puffs(f, smokeN, sx, isl.sea - h * 0.02, { rate: 0.4, rise: 0.24, drift: 0.22, spread: 0.1, r0: 0.028, seed: 3 }), st.hatch ? st.paper : mixHex(puffFill, '#ffffff', 0.3));
      }
      if (E.fountain > 0.02) {
        g.fillStyle = st.hatch ? ink : st.lava;
        for (const b of fountain(f, sx, sy, E.fountain, 16 + Math.round(p.detail * 12))) { g.beginPath(); g.ellipse(b.x, b.y, b.r * 1.3, b.r * 2, 0, 0, TAU); g.fill(); }
        if (st.night) { g.save(); g.filter = `blur(${h * 0.015}px)`; g.globalAlpha = 0.5; g.fillStyle = st.lava; g.beginPath(); g.ellipse(sx, sy - h * 0.05, h * 0.05, h * 0.1 * E.fountain, 0, 0, TAU); g.fill(); g.restore(); }
        bleedPuffs(puffs(f, Math.round(smokeN * 0.8), sx, sy - h * 0.04, { rate: 0.28, rise: 0.32 + 0.1 * E.fountain, drift: 0.3, spread: 0.08, r0: 0.03, seed: 7 }), mono ? '#6a6660' : st.hatch ? st.paper : mixHex(puffFill, ink, 0.25));
      }
      if (E.burst > 0.02) bleedPuffs(puffs(f, smokeN, sx, sy, { rate: 0.3, rise: 0.38, drift: 0.3, spread: 0.12, r0: 0.034, seed: 11 }), mono ? '#555' : st.hatch ? st.paper : mixHex(puffFill, ink, 0.35));
      if (E.entry > 0.02) for (const fl of flowList) if (fl.ends) bleedPuffs(puffs(f, Math.round(smokeN * 0.5), fl.x, isl.sea, { rate: 0.5, rise: 0.13, drift: 0.1, spread: 0.05, r0: 0.016, seed: 20 + fl.i }), st.foam);
      if (E.quiet > 0.3 && L.height > 0.1) { // mist band on a quiet mountain
        g.save(); g.globalAlpha = 0.5 * E.quiet; g.fillStyle = st.hatch ? st.paper : st.lino ? st.paper : mixHex(st.paper, '#ffffff', 0.3);
        if (!st.lino) { g.filter = `blur(${h * 0.015}px)`; const y = (isl.summit.y + isl.sea) / 2; g.beginPath(); g.ellipse(isl.cx + Math.sin(t * 0.2) * h * 0.1, y, isl.hw * 0.7, h * 0.025, 0, 0, TAU); g.fill(); }
        g.restore();
      }
      if (st.night && E.glow > 0.05) { const gr = g.createRadialGradient(sx, sy, 0, sx, sy, h * 0.2 * E.glow); gr.addColorStop(0, 'rgba(255,110,40,0.45)'); gr.addColorStop(1, 'rgba(255,80,20,0)'); g.fillStyle = gr; g.fillRect(sx - h * 0.25, sy - h * 0.25, h * 0.5, h * 0.5); }
    }

    function ornaments(f, T, R) {
      const { ctx: g, w, h, p } = f, L = f.life, { lw, ink } = R;
      // paper grain on everything painted (source-atop keeps a combo sky transparent)
      if (p.x3 > 0.02) { g.save(); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = p.x3 * (st.night ? 0.5 : 1); g.drawImage(T.grain, 0, 0); g.restore(); }
      if (p.x4 < 0.05) return;
      if (st.hatch) {
        g.strokeStyle = ink; g.lineWidth = lw * 2; g.strokeRect(h * 0.03, h * 0.03, w - h * 0.06, h - h * 0.06); g.lineWidth = lw; g.strokeRect(h * 0.045, h * 0.045, w - h * 0.09, h - h * 0.09);
        g.fillStyle = st.paper; g.fillRect(0, h - h * 0.1, w, h * 0.1); g.strokeStyle = ink; g.lineWidth = lw * 2; g.beginPath(); g.moveTo(h * 0.03, h - h * 0.1); g.lineTo(w - h * 0.03, h - h * 0.1); g.stroke();
        g.fillStyle = ink; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = `italic ${h * 0.028}px Georgia, "Times New Roman", serif`; g.fillText(`PLATE ${['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'][L.index]}. — ${L.name.toUpperCase()}.`, w / 2, h - h * 0.062);
        g.font = `${h * 0.018}px Georgia, serif`; g.fillText('Sketched from the deck of H.M.S. Beagle, by the expedition artist', w / 2, h - h * 0.032);
        g.font = `${h * 0.02}px Georgia, serif`; g.textAlign = 'left'; g.fillText('Fig. 1.', h * 0.07, h * 0.08);
        return;
      }
      if (st.blue1) { // porcelain rim
        const b = h * 0.05; g.fillStyle = st.paper; g.fillRect(0, 0, w, b); g.fillRect(0, h - b, w, b); g.fillRect(0, 0, b, h); g.fillRect(w - b, 0, b, h);
        g.strokeStyle = st.blue; g.lineWidth = lw * 2; g.strokeRect(b * 0.5, b * 0.5, w - b, h - b); g.strokeRect(b, b, w - 2 * b, h - 2 * b);
        g.lineWidth = lw * 1.5; const n = Math.round(w / (b * 0.8));
        for (let i = 0; i < n; i++) { const x = b * 0.5 + i * (w - b) / n; for (const y of [b * 0.75, h - b * 0.25]) { g.beginPath(); g.arc(x + b * 0.2, y, b * 0.14, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + b * 0.4, y); g.stroke(); } }
        return;
      }
      if (st.lino) { g.strokeStyle = ink; g.lineWidth = h * 0.02; g.strokeRect(0, 0, w, h); return; }
      const s = h * 0.07 * (0.6 + p.x4 * 0.6);
      if (st.seal) seal(g, w - s * 1.1, h - s * 1.1, s, 0.03);
      if (!st.mono) cartouche(g, h * 0.05, h * 0.06, s * 0.55, s * 2.4, st.night ? '#2a3250' : '#f1e6c9', ink, L.index * 3 + 1, 5 + L.index);
      if (st.mono || st.scroll) cartouche(g, w - s * 1.1 - s * 0.6, h * 0.08, s * 0.45, s * 2.2, 'rgba(0,0,0,0)', ink, L.index * 3 + 2, 6);
    }

    return {
      render(f) {
        const { ctx: g, w, h } = f;
        const T = textures(w, h);
        if (st.scroll) {
          // hanging scroll: a tall panel on a silk mount
          const pw = Math.min(w * 0.6, h * 0.62), px = (w - pw) / 2;
          g.fillStyle = '#4a3b2a'; g.fillRect(0, 0, w, h);
          g.strokeStyle = '#6a5438'; g.lineWidth = 1; g.globalAlpha = 0.6; const cell = h * 0.06; g.beginPath();
          for (let x = -h; x < w + h; x += cell) { g.moveTo(x, 0); g.lineTo(x + h, h); g.moveTo(x, 0); g.lineTo(x - h, h); } g.stroke();
          g.fillStyle = '#8a6d45'; for (let x = cell / 2; x < w; x += cell) for (let y = cell / 2; y < h; y += cell) { g.beginPath(); g.arc(x, y, cell * 0.08, 0, TAU); g.fill(); } g.globalAlpha = 1;
          g.fillStyle = '#a8894f'; g.fillRect(px - h * 0.04, 0, h * 0.04, h); g.fillRect(px + pw, 0, h * 0.04, h);
          g.save(); g.beginPath(); g.rect(px, 0, pw, h); g.clip(); g.translate(px, 0);
          const f2 = { ...f, w: pw };
          const R = paintScene(f2, T); paintWater(f2, T, R); paintEruption(f2, T, R); ornaments(f2, T, R);
          g.restore();
          return;
        }
        const R = paintScene(f, T); paintWater(f, T, R); paintEruption(f, T, R); ornaments(f, T, R);
      },
    };
  },
};

export const scenes = [
  { id: 'woodblock-ukiyoe', name: 'Ukiyo-e Print', tags: ['art', 'ink', 'paper', '2d', 'eruption', 'lava'], desc: 'A Hokusai-style colour woodblock: Prussian-blue claw waves, bokashi sky, keylines and a red seal.',
    opts: { mode: 'ukiyoe' }, params: { stage: 0.34, grow: 0.5, activity: 0.6, scale: 0.55, light: 0.75, x1: 0.5, x2: 0.6, x3: 0.5, x4: 0.7 } },
  { id: 'woodblock-surtsey', name: 'The Sea Boils', tags: ['art', 'ink', 'paper', '2d', 'surtseyan', 'eruption'], desc: 'Surtseyan breach as a woodblock: black tephra jets and white steam over a boiling blue sea.',
    opts: { mode: 'ukiyoe' }, params: { stage: 0.16, grow: 0.55, activity: 0.7, scale: 0.5, light: 0.3, x1: 0.55, x2: 0.5, x3: 0.5, x4: 0.6 } },
  { id: 'woodblock-sumie', name: 'Sumi-e Wash', tags: ['art', 'ink', 'paper', '2d', 'calm'], desc: 'Monochrome ink on rice paper with wet bleed, a vermilion touch of lava and three brush-stroke birds.',
    opts: { mode: 'sumie' }, params: { stage: 0.45, grow: 0.4, activity: 0.5, scale: 0.6, light: 0.8, x1: 0.4, x2: 0.3, x3: 0.7, x4: 0.6 } },
  { id: 'woodblock-shanshui', name: 'Hanging Scroll', tags: ['art', 'ink', 'paper', '2d', 'calm'], desc: 'A vertical shan shui scroll on a silk mount: tall misted peaks in blue-green washes, growing then fading.',
    opts: { mode: 'shanshui' }, params: { stage: 0.4, grow: 0.5, activity: 0.5, scale: 0.55, light: 0.8, x1: 0.4, x2: 0.3, x3: 0.6, x4: 0.6 } },
  { id: 'woodblock-linocut', name: 'Linocut', tags: ['art', 'ink', 'paper', '2d', 'poster', 'lava'], desc: 'Bold carved marks in black and cream with one red-orange ink for the lava and sun.',
    opts: { mode: 'linocut' }, params: { stage: 0.3, grow: 0.6, activity: 0.7, scale: 0.6, light: 0.9, x1: 0.6, x2: 0.5, x3: 0.4, x4: 0.6 } },
  { id: 'woodblock-engraving', name: 'Expedition Plate', tags: ['art', 'ink', 'paper', '2d', 'science', 'text'], desc: 'A Victorian steel engraving with cross-hatching, titled as a plate from a 19th-century voyage report.',
    opts: { mode: 'engraving' }, params: { stage: 0.2, grow: 0.5, activity: 0.6, scale: 0.55, light: 0.85, x1: 0.4, x2: 0.4, x3: 0.3, x4: 0.8 } },
  { id: 'woodblock-porcelain', name: 'Blue and White', tags: ['art', 'ink', '2d', 'atoll', 'calm'], desc: 'Cobalt on white porcelain: a stylised island, scrolling waves and a patterned rim, sinking into an atoll.',
    opts: { mode: 'porcelain' }, params: { stage: 0.76, grow: 0.5, activity: 0.4, scale: 0.5, light: 0.9, x1: 0.5, x2: 0.6, x3: 0.2, x4: 0.8 } },
  { id: 'woodblock-night', name: 'Night Print', tags: ['art', 'ink', 'paper', '2d', 'night', 'lava'], desc: 'A night woodblock in deep indigo: moon, lantern boat and lava glowing on the mountain.',
    opts: { mode: 'nightprint' }, params: { stage: 0.42, grow: 0.4, activity: 0.7, scale: 0.55, light: 0.05, x1: 0.5, x2: 0.5, x3: 0.5, x4: 0.6 } },
];
