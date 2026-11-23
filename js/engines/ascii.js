// Text Mode: the island as characters on a grid. A per-cell classifier (sky, cloud, sea, lagoon, reef, rock, veg,
// lava, steam, tephra...) feeds eight renderings: green and amber phosphor terminals, braille dots, a teletext
// page, a status dashboard, a typewriter page, half-block colour and emoji. Glyphs are cached in atlases.
import { clamp, lerp, smooth, fract, hash, noise2, fbm2, buffer, puff, sky, mixHex } from '../util.js';
import { makeIsland, plumeAt, lazeAt, lavaAt, vegAt } from './_sideview.js';

const MONO = '"Menlo","SF Mono","Consolas","DejaVu Sans Mono",monospace';
const TYPE = '"Courier New","Courier","American Typewriter",monospace';
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const TT = ['#000000', '#ff0000', '#00ff00', '#ffff00', '#0000ff', '#ff00ff', '#00ffff', '#ffffff'];

export default {
  id: 'ascii',
  name: 'Text Mode',
  kind: '2d',
  sky: true,
  params: [
    { id: 'x1', label: 'Glow', value: 0.5, tip: 'Phosphor bloom / ink weight' },
    { id: 'x2', label: 'Scanlines', value: 0.5, tip: 'CRT scanlines, jitter and paper grain' },
    { id: 'x3', label: 'Contrast', value: 0.5, tip: 'How hard the character ramp is driven' },
    { id: 'x4', label: 'Chrome', value: 0.7, tip: 'Headers, status bars and captions' },
  ],
  create(ctx, opts) {
    const st = { mode: opts.mode || 'green', atlas: new Map(), bufs: {} };
    return { render(f) { render(f, st); } };
  },
};

// ---------------------------------------------------------------- cell classifier
function classifier(f, m) {
  const { sea, cx, L, h, W, WR, SK } = m, t = f.t, p = f.p;
  const night = 1 - smooth(0, 0.25, p.light), day = smooth(0, 0.5, p.light);
  const sunX = m.w * (0.78 - p.light * 0.25), sunY = p.light < 0.15 ? sea : lerp(sea - 0.02 * h, h * 0.1, smooth(0.15, 0.85, p.light));
  const moonX = m.w * 0.2, moonY = h * 0.18;
  const elevCache = new Map();
  const elev = x => { const k = Math.round(x); let e = elevCache.get(k); if (e === undefined) { e = m.elev(k); elevCache.set(k, e); } return e; };
  return (x, y) => {
    if (y < sea) {
      const e = elev(x);
      if (sea - y < e) {
        const ee = sea - y, d = (x - cx) / W;
        const lava = lavaAt(m, x, ee, t); if (lava > 0.4) return { k: 'lava', v: 0.7 + 0.3 * noise2(x / h * 40, t * 2) };
        const vg = vegAt(m, x, ee); if (vg > 0.5) return { k: 'veg', v: vg };
        if (L.erosion > 0.3 && ee < 0.012 * h) return { k: 'sand', v: 1 };
        if (L.caldera > 0.3 && Math.abs(d) < 0.08 && ee > e - 0.01 * h) return { k: 'crater', v: 0.5 };
        return { k: 'rock', v: clamp(0.55 - d * 0.3 + 0.3 * noise2(x / h * 20, y / h * 20) - 0.2 * smooth(0.17, 0.3, m.s)) };
      }
      const pl = plumeAt(m, x, y, t);
      if (pl.tephra > 0.35) return { k: 'tephra', v: pl.tephra, side: x > cx ? 1 : -1 };
      if (pl.fountain > 0.3) return { k: 'fountain', v: pl.fountain };
      const stm = Math.max(pl.steam, lazeAt(m, x, y, t)); if (stm > 0.25) return { k: 'steam', v: stm };
      if (pl.ash > 0.25) return { k: 'ash', v: pl.ash };
      if (night < 0.5) { const dd = Math.hypot(x - sunX, (y - sunY) * 1.1); if (dd < h * 0.05) return { k: 'sun', v: 1 }; }
      else { const dd = Math.hypot(x - moonX, y - moonY); if (dd < h * 0.035 && Math.hypot(x - moonX + h * 0.012, y - moonY - h * 0.008) > h * 0.03) return { k: 'moon', v: 1 }; }
      const cl = smooth(0.6, 0.8, fbm2(x / h * 2.2 + t * 0.012 + m.seed * 3, y / h * 5, 3)) * (f.combo ? 0 : 1);
      if (cl > 0.08) return { k: 'cloud', v: cl };
      if (night > 0.3 && hash(Math.round(x / h * 40), Math.round(y / h * 40)) > 0.975) return { k: 'star', v: night * (0.5 + 0.5 * Math.sin(f.clock * 3 + x)) };
      return { k: 'sky', v: day };
    }
    const e = elev(x);
    if (L.submarine > 0.05 && y > sea + h * 0.02 && y < m.floor && sea - y < e) return { k: 'subrock', v: L.submarine * (0.4 + 0.3 * noise2(x / h * 15, y / h * 15)) };
    if (L.submarine > 0.2 && Math.abs(x - cx) < W * 0.5 && hash(Math.round(x / h * 30), Math.round(y / h * 30 + t * 0.6)) > 0.93 && y < m.ventY) return { k: 'bubble', v: L.submarine };
    const px = x - cx, pz = (y - sea) * 3.2, rr = Math.hypot(px, pz);
    if (L.reef > 0.1) {
      const ring = Math.abs(rr - WR) < 0.05 * WR;
      if (ring && smooth(0.86, 0.96, m.s) > 0 && noise2(Math.atan2(px, pz) * 4 + m.seed * 9, 1) > 0.6) return { k: 'motu', v: 1 };
      if (ring) return { k: 'surf', v: L.reef * (0.6 + 0.4 * noise2(px / h * 40, pz / h * 40 - t)) };
      if (rr < WR * 0.95) return { k: 'lagoon', v: (0.35 + 0.55 * L.lagoon) * L.reef };
    }
    return { k: 'sea', v: noise2(x / h * 14 - t * 0.4, y / h * 40 + t * 0.2) };
  };
}

// ---------------------------------------------------------------- glyph atlas and helpers
// One atlas sheet holds every glyph+colour+size drawn so far; cells are drawn from it with drawImage.
// (One canvas per glyph would exhaust the browser's canvas budget and blank the page.)
function glyph(st, ch, color, px, font) {
  const key = ch + '|' + color + '|' + px + '|' + font;
  let g = st.atlas.get(key);
  if (!g) {
    const s = Math.ceil(px * 1.4);
    let sh = st.sheet;
    if (!sh || sh.cell !== s || sh.n >= sh.cap) {
      const b = buffer(2048, 2048), per = Math.floor(2048 / s);
      sh = st.sheet = { canvas: b.canvas, ctx: b.ctx, cell: s, per, n: 0, cap: per * per };
      st.atlas.clear();
    }
    const i = sh.n++;
    const x = (i % sh.per) * s, y = Math.floor(i / sh.per) * s;
    sh.ctx.font = `${px}px ${font}`; sh.ctx.textAlign = 'center'; sh.ctx.textBaseline = 'middle'; sh.ctx.fillStyle = color;
    sh.ctx.fillText(ch, x + s / 2, y + s / 2 + px * 0.05);
    g = { c: sh.canvas, x, y, s }; st.atlas.set(key, g);
  }
  return g;
}
// draw a glyph centred on (x, y)
function putGlyph(ctx, g, x, y) { ctx.drawImage(g.c, g.x, g.y, g.s, g.s, x - g.s / 2, y - g.s / 2, g.s, g.s); }
function ensure(st, key, w, h) {
  const b = st.bufs[key];
  if (!b || b.canvas.width !== (w | 0) || b.canvas.height !== (h | 0)) st.bufs[key] = buffer(w, h);
  return st.bufs[key];
}
function bloom(ctx, st, src, w, h, amt) {
  if (amt <= 0.01) return;
  const b = ensure(st, 'bloom', w / 6, h / 6);
  b.ctx.clearRect(0, 0, b.canvas.width, b.canvas.height);
  b.ctx.filter = 'blur(3px)'; b.ctx.drawImage(src, 0, 0, b.canvas.width, b.canvas.height); b.ctx.filter = 'none';
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = amt; ctx.drawImage(b.canvas, 0, 0, w, h); ctx.drawImage(b.canvas, 0, 0, w, h); ctx.restore();
}
function scanlines(ctx, st, w, h, amt, clock) {
  if (amt <= 0.01) return;
  const per = Math.max(2, Math.round(h / 220));
  if (!st.scan || st.scanPer !== per) { const c = buffer(4, per * 2); c.ctx.fillStyle = '#000'; c.ctx.fillRect(0, per, 4, per); st.scan = ctx.createPattern(c.canvas, 'repeat'); st.scanPer = per; }
  ctx.save(); ctx.globalAlpha = amt * 0.5; ctx.fillStyle = st.scan; ctx.fillRect(0, 0, w, h);
  const y = fract(clock * 0.1) * h * 1.4 - h * 0.2, g = ctx.createLinearGradient(0, y - h * 0.1, 0, y + h * 0.1);
  g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${0.06 * amt})`); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, y - h * 0.1, w, h * 0.2);
  ctx.restore();
}
// an opaque screen background; in a cloud combo only the sea part is painted and the sky stays clear
function screenBg(f, m) { const { ctx, w, h } = f; if (f.combo) { ctx.clearRect(0, 0, w, h); ctx.fillRect(0, m.sea, w, h - m.sea); } else ctx.fillRect(0, 0, w, h); }
function grid(f, rows, aspect = 0.6) { const ch = f.h / rows, cw = ch * aspect; return { ch, cw, cols: Math.ceil(f.w / cw), rows }; }
const rampChar = (ramp, v) => ramp[Math.min(ramp.length - 1, Math.max(0, Math.round(v * (ramp.length - 1))))];

// monochrome character + brightness for a cell, shared by the terminal and typewriter modes
function monoCell(c, i, j, f, gain) {
  const v = clamp(c.v * gain);
  switch (c.k) {
    case 'sky': return [' ', 0];
    case 'star': return ['.', 0.5 * c.v];
    case 'sun': return ['@', 1];
    case 'moon': return [')', 0.9];
    case 'cloud': return [rampChar(' .:-=+*', v), 0.3 + 0.6 * v];
    case 'sea': return [(i + j) & 1 ? '~' : (v > 0.6 ? '-' : ' '), 0.35 + 0.3 * v];
    case 'lagoon': return [(i & 1) ? '=' : '~', 0.55 + 0.3 * c.v];
    case 'surf': return ['^', 0.9];
    case 'motu': return ['Y', 1];
    case 'subrock': return [(i + j) & 1 ? ':' : '.', 0.5 * c.v + 0.35];
    case 'bubble': return ['o', 0.6];
    case 'rock': return [rampChar('%#&@', v), 0.55 + 0.45 * v];
    case 'crater': return ['_', 0.6];
    case 'veg': return [rampChar('"vYw', fract(hash(i, j) + 0.5)), 0.7 + 0.3 * v];
    case 'sand': return ['.', 0.8];
    case 'lava': return [hash(i, j, Math.floor(f.clock * 4)) > 0.5 ? '*' : '#', 1];
    case 'steam': return [rampChar(' .oO0', v), 0.4 + 0.6 * v];
    case 'tephra': return [c.side > 0 ? '\\' : '/', 1];
    case 'fountain': return [hash(i, Math.floor(f.clock * 8)) > 0.5 ? '|' : '!', 1];
    case 'ash': return [rampChar(' ,;:', v), 0.4 + 0.5 * v];
  }
  return [' ', 0];
}

// ---------------------------------------------------------------- modes
function terminal(f, st, m, amber) {
  const { ctx, w, h, p } = f;
  const g = grid(f, Math.round(lerp(28, 58, p.detail)));
  const L = ensure(st, 'layer', w, h), lc = L.ctx;
  lc.clearRect(0, 0, w, h);
  const fg = amber ? '255,176,40' : '90,255,130', px = Math.round(g.ch * 0.95);
  const cls = classifier(f, m), gain = lerp(0.7, 1.5, p.x3);
  const top = p.x4 > 0.1 ? 1 : 0, bottom = g.rows - (p.x4 > 0.1 ? 1 : 0);
  for (let j = top; j < bottom; j++) for (let i = 0; i < g.cols; i++) {
    const c = cls((i + 0.5) * g.cw, (j + 0.5) * g.ch);
    const [ch, b] = monoCell(c, i, j, f, gain);
    if (ch === ' ' || b <= 0.02) continue;
    const lvl = Math.round(clamp(b) * 6) / 6;
    putGlyph(lc, glyph(st, ch, `rgba(${fg},${0.25 + 0.75 * lvl})`, px, MONO), i * g.cw + g.cw / 2, j * g.ch + g.ch / 2);
  }
  if (p.x4 > 0.1) { // status bar and prompt
    const clockStr = new Date(2026, 0, 1, 0, 0, Math.floor(f.t)).toTimeString().slice(0, 8);
    lc.fillStyle = `rgba(${fg},1)`; lc.fillRect(0, 0, w, g.ch * 1.05);
    lc.font = `${px}px ${MONO}`; lc.textBaseline = 'middle'; lc.textAlign = 'left';
    lc.fillStyle = amber ? '#1a0e00' : '#021a08';
    lc.fillText(` ${amber ? 'HVO TELETYPE' : 'VOLCANO WATCH v2.1'}   ${m.L.name.toUpperCase()}   SUMMIT ${Math.round(m.L.height * 4200)} m   OUTPUT ${(m.erupt * 50) | 0}%   ${clockStr}`, 0, g.ch * 0.55);
    lc.fillStyle = `rgba(${fg},1)`;
    const cursor = fract(f.clock * 1.1) < 0.55 ? '█' : ' ';
    lc.fillText(amber ? `>> ${m.L.text.slice(0, Math.floor(f.t * 12) % (m.L.text.length + 40))}${cursor}` : `hvo:~$ watch --island --stage ${m.s.toFixed(2)} ${cursor}`, g.cw, (g.rows - 0.5) * g.ch);
  }
  ctx.fillStyle = amber ? `rgb(${24 + p.light * 8 | 0},${12 + p.light * 5 | 0},2)` : `rgb(2,${10 + p.light * 8 | 0},6)`;
  screenBg(f, m);
  const rg = ctx.createRadialGradient(w / 2, h / 2, h * 0.1, w / 2, h / 2, w * 0.7);
  rg.addColorStop(0, amber ? 'rgba(255,140,20,0.07)' : 'rgba(60,255,120,0.05)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
  bloom(ctx, st, L.canvas, w, h, lerp(0, 1.1, p.x1));
  const jit = (hash(Math.floor(f.clock * 24)) - 0.5) * p.x2 * g.ch * 0.04;
  ctx.drawImage(L.canvas, jit, 0);
  scanlines(ctx, st, w, h, p.x2, f.clock);
}

function braille(f, st, m) {
  const { ctx, w, h, p } = f;
  const g = grid(f, Math.round(lerp(26, 50, p.detail)), 0.5);
  const cls = classifier(f, m);
  const dark = p.light < 0.3;
  ctx.fillStyle = dark ? '#06070c' : '#0d1220'; screenBg(f, m);
  const px = Math.round(g.ch * 1.05);
  const COL = { sky: '#56608a', cloud: '#c9cfe6', star: '#ffffff', sun: '#ffd27a', moon: '#e8e8ff', sea: '#3b7fd6', lagoon: '#3fd6c8', surf: '#ffffff', motu: '#f0dc9a', subrock: '#6b5a4a', bubble: '#9ad0ff',
    rock: '#a79a8c', crater: '#7a6a5a', veg: '#6fcf5a', sand: '#f0dc9a', lava: '#ff8a2a', steam: '#f2f2f2', tephra: '#9a8a86', fountain: '#ffd04a', ash: '#9a9aa6' };
  // dot density 0..1 per kind (ordered dither picks which of the 8 dots light up)
  const dens = c => { switch (c.k) {
    case 'sky': return 0; case 'star': return 0.12; case 'sun': return 1; case 'moon': return 0.9; case 'cloud': return 0.2 + 0.7 * c.v; case 'sea': return 0.12 + 0.25 * c.v;
    case 'lagoon': return 0.3 + 0.3 * c.v; case 'surf': return 0.8; case 'motu': return 1; case 'subrock': return 0.3 * c.v; case 'bubble': return 0.3; case 'rock': return 0.5 + 0.5 * c.v;
    case 'crater': return 0.3; case 'veg': return 0.9; case 'sand': return 0.6; case 'lava': return 1; case 'steam': return 0.3 + 0.6 * c.v; case 'tephra': return 0.95; case 'fountain': return 1; case 'ash': return 0.2 + 0.6 * c.v; } return 0; };
  const bay = [0, 4, 2, 6, 1, 5, 3, 7];  // 2×4 ordered pattern
  const gain = lerp(0.7, 1.4, p.x3);
  for (let j = 0; j < g.rows; j++) for (let i = 0; i < g.cols; i++) {
    const x0 = i * g.cw, y0 = j * g.ch;
    // classify the cell once; dots are refined on the land edge and dithered elsewhere
    const c = cls(x0 + g.cw / 2, y0 + g.ch / 2);
    const d = dens(c) * gain;
    if (d <= 0.02) continue;
    let bits = 0;
    const landish = c.k === 'rock' || c.k === 'veg' || c.k === 'sand' || c.k === 'lava' || c.k === 'crater';
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 2; dx++) {
      const sx = x0 + (dx + 0.5) * g.cw / 2, sy = y0 + (dy + 0.5) * g.ch / 4;
      let on;
      if (landish) { const cc = cls(sx, sy); on = cc.k === c.k || (cc.k !== 'sky' && cc.k !== 'cloud' && cc.k !== 'sea' && cc.k !== 'lagoon'); if (on && d < 1) on = (bay[dy * 2 + dx] + 0.5) / 8 < d; }
      else on = (bay[dy * 2 + dx] + 0.5) / 8 < d + (hash(i, j, dy * 2 + dx) - 0.5) * 0.15;
      if (on) bits |= dx === 0 ? [1, 2, 4, 64][dy] : [8, 16, 32, 128][dy];
    }
    if (!bits) continue;
    const ch = String.fromCharCode(0x2800 + bits);
    putGlyph(ctx, glyph(st, ch, COL[c.k] || '#fff', px, MONO), x0 + g.cw / 2, y0 + g.ch / 2);
  }
  if (p.x4 > 0.1) {
    ctx.font = `${Math.round(g.ch * 0.9)}px ${MONO}`; ctx.fillStyle = '#c9cfe6'; ctx.textBaseline = 'middle';
    ctx.fillText(`⣿ ${m.L.name}  ·  h ${Math.round(m.L.height * 4200)} m  ·  reef ${(m.L.reef * 100) | 0}%`, g.cw, h - g.ch * 0.6);
  }
  bloom(ctx, st, ctx.canvas, w, h, lerp(0, 0.6, p.x1) * 0.5);
}

function teletext(f, st, m) {
  const { ctx, w, h, p } = f;
  const cols = 40, rows = 25, cw = w / cols, ch = h / rows;
  const cls = classifier(f, m);
  ctx.fillStyle = '#000'; screenBg(f, m);
  const nightish = p.light < 0.3;
  const colFor = c => { switch (c.k) {
    case 'sky': return nightish ? 0 : 4; case 'star': return 7; case 'sun': return 3; case 'moon': return 7; case 'cloud': return c.v > 0.5 ? 7 : 6;
    case 'sea': return c.v > 0.85 ? 6 : 4; case 'lagoon': return 6; case 'surf': return 7; case 'motu': return 3; case 'subrock': return c.v > 0.5 ? 1 : 5; case 'bubble': return 7;
    case 'rock': return c.v > 0.6 ? 1 : 5; case 'crater': return 0; case 'veg': return 2; case 'sand': return 3; case 'lava': return 3; case 'steam': return 7; case 'tephra': return 0; case 'fountain': return 3; case 'ash': return 5; } return 0; };
  // mosaic graphics: 2×3 sixels per cell, rows 3..21
  const top = 3, bottom = rows - 3;
  for (let j = top; j < bottom; j++) for (let i = 0; i < cols; i++) {
    for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 2; sx++) {
      const x = (i + (sx + 0.5) / 2) * cw, y = (j + (sy + 0.5) / 3) * ch;
      const c = cls(x, y);
      let k = colFor(c);
      // at night the sky is black with white stars; the sea keeps a dim blue
      ctx.fillStyle = TT[k];
      if (k === 0 && c.k !== 'sky' && c.k !== 'tephra' && c.k !== 'crater') continue;
      if (f.combo && (c.k === 'sky' || c.k === 'star')) continue;
      ctx.fillRect(Math.floor(i * cw + sx * cw / 2), Math.floor(j * ch + sy * ch / 3), Math.ceil(cw / 2), Math.ceil(ch / 3));
    }
  }
  // header and text rows
  const px = Math.round(ch * 0.9);
  ctx.font = `bold ${px}px ${MONO}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
  const clk = new Date(2026, 0, 1, 0, 0, Math.floor(f.t)).toTimeString().slice(0, 8);
  const write = (txt, col, row, color, bg) => { if (bg) { ctx.fillStyle = bg; ctx.fillRect(col * cw, row * ch, txt.length * cw, ch); } ctx.fillStyle = color; for (let i = 0; i < txt.length; i++) ctx.fillText(txt[i], (col + i) * cw + cw * 0.12, (row + 0.5) * ch); };
  const dbl = (txt, col, row, color) => { ctx.save(); ctx.translate(col * cw, row * ch); ctx.scale(1, 2); ctx.font = `bold ${px}px ${MONO}`; ctx.fillStyle = color; for (let i = 0; i < txt.length; i++) ctx.fillText(txt[i], i * cw + cw * 0.12, ch * 0.5); ctx.restore(); };
  write(`P888 VOLCANO WATCH  ${clk.slice(0, 5)}`.padEnd(cols, ' '), 0, 0, TT[7], '#000');
  write(' CEEFAX 888 ', 28, 0, TT[0], TT[3]);
  dbl(` ${m.L.name.toUpperCase()}`.slice(0, 40), 0, 1, TT[3]);
  const lines = wrap(m.L.text, cols - 2);
  for (let i = 0; i < 2; i++) if (lines[i]) write(lines[i], 1, rows - 3 + i, i === 0 ? TT[6] : TT[7]);
  const ticker = `SUMMIT ${Math.round(m.L.height * 4200)} m   OUTPUT ${(m.erupt * 50) | 0}%   REEF ${(m.L.reef * 100) | 0}%   AGE ${(m.s * 5).toFixed(2)} Myr   `;
  const off = Math.floor(f.t * 6) % ticker.length;
  write((ticker + ticker).slice(off, off + cols), 0, rows - 1, TT[2], '#000');
  if (fract(f.clock) < 0.6 && m.L.explosive > 0.3) write(' ALERT ', 33, 2, TT[7], TT[1]);
  if (p.x2 > 0.05) scanlines(ctx, st, w, h, p.x2 * 0.6, f.clock);
}
function wrap(text, n) {
  const words = text.split(' '), out = []; let line = '';
  for (const wd of words) { if ((line + ' ' + wd).trim().length > n) { out.push(line.trim()); line = wd; } else line += ' ' + wd; }
  if (line.trim()) out.push(line.trim());
  return out;
}

function dashboard(f, st, m) {
  const { ctx, w, h, p } = f;
  const g = grid(f, Math.round(lerp(30, 44, p.detail)), 0.6);
  const px = Math.round(g.ch * 0.92);
  const fg = '140,235,255', dim = `rgba(${fg},0.45)`, bright = `rgba(${fg},1)`, warn = '#ffb347', red = '#ff5a5a';
  const L = ensure(st, 'layer', w, h), lc = L.ctx;
  lc.clearRect(0, 0, w, h);
  lc.font = `${px}px ${MONO}`; lc.textBaseline = 'middle';
  const put = (s, col, row, color = bright) => { lc.fillStyle = color; lc.fillText(s, col * g.cw, (row + 0.5) * g.ch); };
  const box = (c0, r0, c1, r1, title) => {
    const wdt = c1 - c0, hgt = r1 - r0;
    put('┌' + '─'.repeat(wdt - 2) + '┐', c0, r0, dim);
    for (let r = r0 + 1; r < r1; r++) { put('│', c0, r, dim); put('│', c1 - 1, r, dim); }
    put('└' + '─'.repeat(wdt - 2) + '┘', c0, r1, dim);
    put(' ' + title + ' ', c0 + 2, r0, bright);
    return { c: c0 + 2, r: r0 + 1, w: wdt - 4, h: hgt - 1 };
  };
  const cols = g.cols, rows = g.rows;
  // left: the island in characters
  const viewC = Math.floor(cols * 0.6);
  const v = box(0, 1, viewC, rows - 9, 'ISLAND  ' + m.L.name.toUpperCase());
  const vw = v.w * g.cw, vh = v.h * g.ch;
  const mm = makeIsland({ ...f, w: vw, h: vh }, 0.62);
  const cls = classifier({ ...f, w: vw, h: vh }, mm), gain = lerp(0.7, 1.5, p.x3);
  for (let r = 0; r < v.h; r++) for (let c = 0; c < v.w; c++) {
    const cc = cls((c + 0.5) * g.cw, (r + 0.5) * g.ch);
    const [ch, b] = monoCell(cc, c, r, f, gain);
    if (ch === ' ') continue;
    const color = cc.k === 'lava' || cc.k === 'fountain' ? warn : cc.k === 'tephra' ? red : cc.k === 'veg' || cc.k === 'motu' ? '#7ee07e' : cc.k === 'lagoon' || cc.k === 'surf' ? '#7ef0e0' : `rgba(${fg},${0.3 + 0.7 * Math.round(clamp(b) * 5) / 5})`;
    putGlyph(lc, glyph(st, ch, color, px, MONO), (v.c + c) * g.cw + g.cw / 2, (v.r + r) * g.ch + g.ch / 2);
  }
  // right: status
  const s = box(viewC + 1, 1, cols, rows - 9, 'STATUS');
  const bar = (label, val, row, color = bright) => { const n = Math.max(0, Math.min(s.w - 12, Math.round(clamp(val) * (s.w - 12)))); put(label.padEnd(8), s.c, row, dim); put('█'.repeat(n) + '░'.repeat(Math.max(0, s.w - 12 - n)), s.c + 8, row, color); };
  put(`STAGE   ${m.L.index + 1}/7 ${m.s.toFixed(3)}`, s.c, s.r, bright);
  put(`SUMMIT  ${String(Math.round(m.L.height * 4200)).padStart(5)} m`, s.c, s.r + 1, m.L.height < 0 ? dim : bright);
  put(`EPOCH   ${f.epoch}    AGE ${(m.s * 5).toFixed(2)} Myr`, s.c, s.r + 2, dim);
  bar('OUTPUT', m.erupt / 2, s.r + 4, warn);
  bar('STEAM', m.L.steam, s.r + 5);
  bar('EXPLOS', m.L.explosive, s.r + 6, red);
  bar('SO2', m.erupt * (1 - m.L.submarine) * 0.8, s.r + 7, warn);
  bar('VEG', m.L.veg, s.r + 8, '#7ee07e');
  bar('REEF', m.L.reef, s.r + 9, '#7ef0e0');
  bar('SINK', m.L.lagoon, s.r + 10);
  const alert = m.L.steam > 0.3 ? 'SURTSEYAN ACTIVITY' : m.L.explosive > 0.3 ? 'EXPLOSIVE BURSTS' : m.erupt > 0.6 && m.L.submarine < 0.5 ? 'LAVA FOUNTAINING' : m.L.submarine > 0.5 ? 'SUBMARINE ERUPTION' : m.L.reef > 0.5 ? 'REEF GROWING' : 'QUIET';
  if (fract(f.clock * 0.8) < 0.7 || alert === 'QUIET') put(`** ${alert} **`, s.c, s.r + 12, alert === 'QUIET' ? '#7ee07e' : red);
  // bottom: seismograph
  const sb = box(0, rows - 8, cols, rows - 1, 'SEISMOGRAPH  HVO-1  ' + new Date(2026, 0, 1, 0, 0, Math.floor(f.t)).toTimeString().slice(0, 8));
  const mid = sb.r + Math.floor(sb.h / 2);
  const amp = (0.3 + 1.5 * m.erupt + 2 * m.L.explosive) * (sb.h / 2 - 0.5);
  for (let c = 0; c < sb.w; c++) {
    const tt = f.t * 8 - (sb.w - c);
    const tremor = (noise2(tt * 0.7, 1) - 0.5) * 2 + (noise2(tt * 3, 7) - 0.5) * 0.8 * m.L.explosive;
    const burst = Math.pow(Math.max(0, Math.sin(tt * 0.12 + m.seed * 9)), 20) * 2 * (noise2(tt * 5, 3) - 0.5) * (m.erupt + m.L.explosive);
    const y = Math.round(clamp(tremor * amp * 0.5 + burst * amp, -sb.h / 2 + 0.5, sb.h / 2 - 0.5));
    const col = sb.c + c;
    const top = Math.min(0, y), bot = Math.max(0, y);
    const tc = c > sb.w - 3 ? bright : `rgba(${fg},${0.5 + 0.5 * Math.round(c / sb.w * 4) / 4})`;
    for (let r = top; r <= bot; r++) put(r === y ? (y > 0 ? '▁' : '▔') : '│', col, mid - r, tc);
    if (y === 0) put('─', col, mid, tc);
  }
  put(`█`, sb.c + sb.w - 1, mid, fract(f.clock * 2) < 0.5 ? bright : dim);
  if (p.x4 > 0.1) put(' MEGA-VOLCANO OBSERVATORY │ NET: ONLINE │ F1 HELP ', 1, 0, '#061a22');
  ctx.fillStyle = `rgb(3,${10 + p.light * 6 | 0},16)`; if (f.combo) ctx.clearRect(0, 0, w, h); else ctx.fillRect(0, 0, w, h);
  if (p.x4 > 0.1) { ctx.fillStyle = bright; ctx.fillRect(0, 0, w, g.ch); }
  bloom(ctx, st, L.canvas, w, h, lerp(0, 0.9, p.x1));
  ctx.drawImage(L.canvas, 0, 0);
  scanlines(ctx, st, w, h, p.x2, f.clock);
}

function typewriter(f, st, m) {
  const { ctx, w, h, p } = f;
  const g = grid(f, Math.round(lerp(26, 46, p.detail)), 0.6);
  const px = Math.round(g.ch * 0.95);
  const paper = ensure(st, 'paper', w, h);
  if (!st.paperDone || st.paperW !== w) { // cream paper with fibres
    const pc = paper.ctx; pc.fillStyle = '#f2ecdc'; pc.fillRect(0, 0, w, h);
    for (let i = 0; i < 1200; i++) { pc.fillStyle = `rgba(120,100,70,${0.03 + hash(i) * 0.06})`; pc.fillRect(hash(i, 1) * w, hash(i, 2) * h, 1 + hash(i, 3) * 2, 1); }
    st.paperDone = true; st.paperW = w;
  }
  const painted = sky(f, (c) => c.drawImage(paper.canvas, 0, 0));
  if (!painted) ctx.drawImage(paper.canvas, 0, m.sea, w, h - m.sea, 0, m.sea, w, h - m.sea);
  const cls = classifier(f, m), gain = lerp(0.7, 1.5, p.x3);
  const ink = lerp(0.55, 1, p.x1);
  const ramp = { rock: 'MW#8', veg: 'YVvw', lava: '*X', steam: 'oO0@', ash: ':;', tephra: '\\/', sea: '~~-', lagoon: '=~', cloud: '.:-=o' };
  const top = 3, bottom = g.rows - 2;
  for (let j = top; j < bottom; j++) for (let i = 0; i < g.cols; i++) {
    const c = cls((i + 0.5) * g.cw, (j + 0.5) * g.ch);
    let [ch, b] = monoCell(c, i, j, f, gain);
    if (c.k === 'rock') ch = rampChar(ramp.rock, clamp(c.v * gain));
    if (c.k === 'sky' || ch === ' ' || b < 0.05) continue;
    const strike = c.k === 'rock' || c.k === 'lava' || c.k === 'tephra' ? 2 : 1;  // overstrike the darks
    const jx = (hash(i, j, 1) - 0.5) * g.cw * 0.25 * p.x2, jy = (hash(i, j, 2) - 0.5) * g.ch * 0.2 * p.x2;
    const alpha = clamp(b * ink * 1.5 * (0.75 + 0.25 * hash(i, j, 3)));
    const col = `rgba(30,26,40,${Math.round(alpha * 5) / 5})`;
    const gl = glyph(st, ch, col, px, TYPE);
    for (let k = 0; k < strike; k++) putGlyph(ctx, gl, i * g.cw + g.cw / 2 + jx + k * 0.6, j * g.ch + g.ch / 2 + jy);
  }
  if (p.x4 > 0.1) {
    ctx.font = `${px}px ${TYPE}`; ctx.fillStyle = 'rgba(30,26,40,.85)'; ctx.textBaseline = 'middle';
    const typed = (s, col, row) => { for (let i = 0; i < s.length; i++) ctx.fillText(s[i], (col + i) * g.cw + (hash(i, row) - 0.5) * 0.6, (row + 0.5) * g.ch + (hash(row, i) - 0.5) * 0.8); };
    typed(`VOLCANO WATCH -- REPORT No. ${1 + Math.floor(m.s * 48) + f.epoch * 48}`, 2, 1);
    const cap = `${m.L.name}.  ${m.s < 0.22 ? 'Day ' + Math.floor(m.s / 0.22 * 1300) : '+' + (m.s * 5).toFixed(2) + ' Myr'}.  Summit ${Math.round(m.L.height * 4200)} m.`;
    const n = Math.min(cap.length, Math.floor(f.t * 10) % (cap.length + 30));
    typed(cap.slice(0, n) + (fract(f.clock * 1.5) < 0.5 ? '_' : ''), 2, g.rows - 1.5);
  }
}

function blocks(f, st, m) {
  const { ctx, w, h, p } = f;
  const g = grid(f, Math.round(lerp(30, 60, p.detail)), 0.6);
  const cls = classifier(f, m);
  const night = 1 - smooth(0, 0.25, p.light), day = smooth(0, 0.5, p.light);
  const painted = sky(f, (c, ww, hh) => { c.fillStyle = mixHex('#0a0f2a', '#4a8fe0', day); c.fillRect(0, 0, ww, hh); });
  const colOf = c => { switch (c.k) {
    case 'sky': return null; case 'star': return '#ffffff'; case 'sun': return '#fff2a0'; case 'moon': return '#f0f0ff'; case 'cloud': return mixHex(mixHex('#2a3050', '#8aa0c0', day), mixHex('#404860', '#ffffff', day), c.v);
    case 'sea': return mixHex(mixHex('#061430', '#1f5fb0', day), mixHex('#0c2250', '#4b90e0', day), c.v); case 'lagoon': return mixHex('#1a4a60', '#3fd6c8', c.v * day + 0.2); case 'surf': return '#f0f8ff'; case 'motu': return '#f0dc9a';
    case 'subrock': return '#2a2a30'; case 'bubble': return '#8ad0ff'; case 'rock': return mixHex('#15110f', '#5a4a3a', c.v * (0.4 + 0.6 * day)); case 'crater': return '#0c0a08'; case 'veg': return mixHex('#153a10', '#4fa030', c.v * (0.4 + 0.6 * day));
    case 'sand': return '#e8d8a0'; case 'lava': return mixHex('#ff4a10', '#ffd040', c.v); case 'steam': return mixHex('#9aa0a8', '#ffffff', c.v * (0.5 + 0.5 * day)); case 'tephra': return '#0a0908'; case 'fountain': return '#ffe060'; case 'ash': return mixHex('#2a2a2a', '#8a8a90', c.v); } return null; };
  const px = Math.round(g.ch * 1.1);
  for (let j = 0; j < g.rows; j++) for (let i = 0; i < g.cols; i++) {
    const x = i * g.cw, y = j * g.ch;
    const ct = cls(x + g.cw / 2, y + g.ch * 0.25), cb = cls(x + g.cw / 2, y + g.ch * 0.75);
    const a = colOf(ct), b = colOf(cb);
    if (a) { ctx.fillStyle = a; ctx.fillRect(x, y, g.cw + 0.5, g.ch / 2 + 0.5); }
    if (b) { ctx.fillStyle = b; ctx.fillRect(x, y + g.ch / 2, g.cw + 0.5, g.ch / 2 + 0.5); }
    // shade characters for texture over the sea and plumes
    const sh = ct.k === 'steam' || ct.k === 'ash' ? '░▒▓'[Math.min(2, Math.floor(ct.v * 3))] : ct.k === 'sea' && ct.v > 0.5 ? '░' : ct.k === 'rock' && ct.v > 0.6 ? '▒' : null;
    if (sh && !painted && ct.k !== 'steam') continue;
    if (sh) putGlyph(ctx, glyph(st, sh, ct.k === 'rock' ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.22)', px, MONO), x + g.cw / 2, y + g.ch / 2);
  }
  if (p.x4 > 0.1) {
    ctx.font = `bold ${Math.round(g.ch * 0.95)}px ${MONO}`; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, g.ch); ctx.fillStyle = '#ffd040';
    ctx.fillText(` ▀▄ MEGA-VOLCANO.ANS  │ ${m.L.name.toUpperCase()}  │ ${Math.round(m.L.height * 4200)} m  │ ${(m.s * 5).toFixed(2)} Myr`, 0, g.ch / 2);
  }
  scanlines(ctx, st, w, h, p.x2 * 0.5, f.clock);
  bloom(ctx, st, ctx.canvas, w, h, lerp(0, 0.4, p.x1) * (0.3 + night));
}

function emoji(f, st, m) {
  const { ctx, w, h, p } = f;
  const g = grid(f, Math.round(lerp(14, 26, p.detail)), 1);
  const cls = classifier(f, m);
  const day = smooth(0, 0.5, p.light);
  const painted = sky(f, (c, ww, hh) => { c.fillStyle = mixHex('#0b1030', '#7cc4ff', day); c.fillRect(0, 0, ww, hh); });
  const px = Math.round(g.ch * 0.85);
  for (let j = 0; j < g.rows; j++) for (let i = 0; i < g.cols; i++) {
    const x = i * g.cw, y = j * g.ch;
    const c = cls(x + g.cw / 2, y + g.ch / 2);
    let e = null, bg = null;
    switch (c.k) {
      case 'star': e = hash(i, j) > 0.5 ? '✨' : '⭐'; break;
      case 'sun': e = '☀️'; break; case 'moon': e = '🌙'; break;
      case 'cloud': e = c.v > 0.4 ? '☁️' : null; break;
      case 'sea': bg = mixHex('#0a2a60', '#2f7fd8', day); e = c.v > 0.72 ? '🌊' : null; break;
      case 'lagoon': bg = '#3fd6c8'; e = hash(i, j) > 0.9 ? '🐠' : hash(i, j, 2) > 0.95 ? '🐬' : null; break;
      case 'surf': bg = '#3fd6c8'; e = hash(i, j) > 0.4 ? '🪸' : '🌊'; break;
      case 'motu': bg = '#3fd6c8'; e = '🏝️'; break;
      case 'subrock': bg = mixHex('#0a2a60', '#2f7fd8', day); e = hash(i, j) > 0.6 ? '🪨' : null; break;
      case 'bubble': bg = mixHex('#0a2a60', '#2f7fd8', day); e = '🫧'; break;
      case 'rock': bg = '#3a3028'; e = hash(i, j) > 0.55 ? '🪨' : (hash(i, j, 3) > 0.9 ? '⛰️' : null); break;
      case 'crater': bg = '#201c18'; e = '🕳️'; break;
      case 'veg': bg = '#2f7a2a'; e = ['🌴', '🌿', '🌳', '🌺'][Math.floor(hash(i, j) * 4)]; break;
      case 'sand': bg = '#e8d8a0'; e = hash(i, j) > 0.8 ? '🐢' : null; break;
      case 'lava': bg = '#5a1a08'; e = '🔥'; break;
      case 'steam': e = c.v > 0.5 ? '☁️' : '💨'; break;
      case 'ash': e = '🌫️'; break;
      case 'tephra': e = '💥'; break;
      case 'fountain': e = '🔥'; break;
    }
    if (bg) { ctx.fillStyle = bg; ctx.fillRect(x, y, g.cw + 0.5, g.ch + 0.5); }
    if (e) putGlyph(ctx, glyph(st, e, '#000', px, EMOJI), x + g.cw / 2, y + g.ch / 2);
  }
  // the vent itself
  if (m.HP > 0) putGlyph(ctx, glyph(st, '🌋', '#000', px * 1.3, EMOJI), m.cx, m.ventY);
  // birds
  if (m.L.veg > 0.3) for (let i = 0; i < 3; i++) putGlyph(ctx, glyph(st, '🐦', '#000', px, EMOJI), ((hash(i, 51) + f.t * 0.02 * (1 + hash(i))) % 1) * w, h * (0.1 + 0.15 * hash(i, 52)));
  if (p.x4 > 0.1) {
    ctx.font = `${Math.round(g.ch * 0.8)}px ${EMOJI}`; ctx.textBaseline = 'middle'; ctx.fillStyle = painted ? 'rgba(0,0,0,.6)' : '#fff';
    const icons = ['🌊', '💥', '🌋', '🕳️', '🌴', '🪸', '🏝️'];
    ctx.fillText(`${icons[m.L.index]} ${m.L.name}`, g.cw * 0.5, h - g.ch * 0.5);
  }
}

// ---------------------------------------------------------------- frame
function render(f, st) {
  const m = makeIsland(f, 0.62);
  switch (st.mode) {
    case 'amber': return terminal(f, st, m, true);
    case 'braille': return braille(f, st, m);
    case 'teletext': return teletext(f, st, m);
    case 'dashboard': return dashboard(f, st, m);
    case 'typewriter': return typewriter(f, st, m);
    case 'blocks': return blocks(f, st, m);
    case 'emoji': return emoji(f, st, m);
    default: return terminal(f, st, m, false);
  }
}

export const scenes = [
  { id: 'ascii-green', name: 'Green Phosphor', tags: ['text', 'retro', 'night', 'lava', 'eruption'],
    desc: 'A green-phosphor terminal watches the shield fountain lava, with a status bar and a blinking prompt.',
    opts: { mode: 'green' }, params: { stage: 0.36, grow: 0.3, activity: 0.6, scale: 0.5, light: 0.8, x1: 0.55, x2: 0.5, x3: 0.5, x4: 0.8 } },
  { id: 'ascii-amber', name: 'Amber Teletype', tags: ['text', 'retro', 'surtseyan', 'eruption'],
    desc: 'Amber phosphor and a teletype feed typing the field report while the new island blasts tephra and steam.',
    opts: { mode: 'amber' }, params: { stage: 0.17, grow: 0.4, activity: 0.6, scale: 0.5, light: 0.8, x1: 0.6, x2: 0.6, x3: 0.55, x4: 0.8 } },
  { id: 'ascii-braille', name: 'Braille Dots', tags: ['text', 'retro', 'calm', 'hawaii'],
    desc: 'Braille cells give a high-resolution dot rendering in a few colours: green island, cyan reef, orange lava.',
    opts: { mode: 'braille' }, params: { stage: 0.66, grow: 0.3, activity: 0.5, scale: 0.55, light: 0.85, x1: 0.4, x2: 0.3, x3: 0.5, x4: 0.6 } },
  { id: 'ascii-teletext', name: 'Ceefax P888', tags: ['text', 'retro', 'pixel', 'eruption'],
    desc: 'Teletext page 888, VOLCANO WATCH: a mosaic-graphics island in eight colours with a scrolling ticker of numbers.',
    opts: { mode: 'teletext' }, params: { stage: 0.3, grow: 0.45, activity: 0.6, scale: 0.5, light: 0.8, x1: 0.3, x2: 0.3, x3: 0.5, x4: 1 } },
  { id: 'ascii-dashboard', name: 'Observatory Dashboard', tags: ['text', 'science', 'diagram', 'retro', 'eruption'],
    desc: 'A text-mode observatory console: the island in characters, status bars, alerts and a live seismograph trace.',
    opts: { mode: 'dashboard' }, params: { stage: 0.55, grow: 0.4, activity: 0.7, scale: 0.5, light: 0.8, x1: 0.5, x2: 0.4, x3: 0.5, x4: 0.9 } },
  { id: 'ascii-typewriter', name: 'Typewriter Page', tags: ['text', 'paper', 'retro', 'calm'],
    desc: 'Typewriter art on cream paper: overstruck capitals build the eroding island, with a typed report heading.',
    opts: { mode: 'typewriter' }, params: { stage: 0.74, grow: 0.3, activity: 0.5, scale: 0.55, light: 0.85, x1: 0.7, x2: 0.5, x3: 0.5, x4: 0.8 } },
  { id: 'ascii-blocks', name: 'ANSI Blocks', tags: ['text', 'retro', 'pixel', 'night', 'lava'],
    desc: 'Half-block and shade characters in full colour, BBS-style: a night eruption glowing over a checkered sea.',
    opts: { mode: 'blocks' }, params: { stage: 0.4, grow: 0.3, activity: 0.6, scale: 0.5, light: 0.1, x1: 0.5, x2: 0.4, x3: 0.5, x4: 0.8 } },
  { id: 'ascii-emoji', name: 'Emoji Island', tags: ['text', 'cartoon', 'atoll', 'calm'],
    desc: 'The island told in emoji: rocks, palms, fish, coral and a volcano, running the whole life quickly.',
    opts: { mode: 'emoji' }, params: { stage: 0.78, grow: 0.65, activity: 0.5, scale: 0.5, light: 0.85, x1: 0.3, x2: 0.2, x3: 0.5, x4: 0.8 } },
];
