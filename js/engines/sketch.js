// Sketch & Notebook: the island's cross-section drawn by hand. A pencil field notebook with annotations, a blueprint,
// a chalkboard lecture, a ballpoint doodle, charcoal, technical-pen stippling and a flip-book strip. Lines boil
// gently like hand-drawn animation. Shared geometry comes from _sideview.js.
import { clamp, lerp, smooth, hash, noise2, rng, buffer, puff, sky } from '../util.js';
import { life } from '../life.js';
import { makeIsland, plumeAt, lazeAt, lavaAt, vegAt } from './_sideview.js';

const HAND = '"Bradley Hand","Chalkboard","Segoe Print","Comic Sans MS",cursive';
const TECH = '"Menlo","Consolas","DejaVu Sans Mono",monospace';
const CHALKF = '"Chalkboard","Chalkduster","Comic Sans MS",cursive';

const STYLES = {
  notebook:  { paper: '#f3eedf', ink: '#33333a', soft: 'rgba(60,60,70,.55)', accent: '#9a3b2b', green: '#4f6b3a', blue: '#4b6a8a', font: HAND, ruled: true, pencil: true },
  blueprint: { paper: '#1d4592', ink: '#eef4ff', soft: 'rgba(230,240,255,.5)', accent: '#ffe9a0', green: '#cfe8ff', blue: '#cfe8ff', font: TECH, grid: true, dims: true, tech: true },
  chalk:     { paper: '#2f4b3e', ink: '#f2efe6', soft: 'rgba(240,236,225,.5)', accent: '#f7d36b', green: '#9fd08a', blue: '#9fd0ec', font: CHALKF, chalk: true },
  ballpoint: { paper: '#fbfaf4', ink: '#213c8f', soft: 'rgba(33,60,143,.5)', accent: '#c0392b', green: '#213c8f', blue: '#213c8f', font: HAND, ruled: true, biro: true },
  charcoal:  { paper: '#b9b5ab', ink: '#17150f', soft: 'rgba(23,21,15,.45)', accent: '#6b2a1a', green: '#2a2a20', blue: '#3a3a3a', font: HAND, charcoal: true },
  stipple:   { paper: '#fdfcf7', ink: '#141414', soft: 'rgba(20,20,20,.5)', accent: '#141414', green: '#141414', blue: '#141414', font: TECH, stipple: true, tech: true },
  flipbook:  { paper: '#f6f1e3', ink: '#2b2b38', soft: 'rgba(43,43,56,.5)', accent: '#b3402e', green: '#4f6b3a', blue: '#4b6a8a', font: HAND, pencil: true, strip: true },
};

const NOTES = {
  seamount: [['pillow lava', 'flank'], ['seamount, still ~1 km down', 'summit'], ['sea floor', 'floor'], ['hyaloclastite (quenched glass)', 'flank2']],
  breach:   [['tephra jet — "cock’s tail"', 'jet'], ['steam!', 'steam'], ['tuff cone (loose, waves eat it)', 'summit'], ['base surge', 'shore']],
  shield:   [['lava fountain', 'vent'], ['pāhoehoe flow', 'flank'], ['laze: steam + HCl', 'shore'], ['shield: flow on flow', 'flank2']],
  caldera:  [['caldera (roof fell in)', 'summit'], ['cinder cone', 'cone'], ['post-shield lava cap', 'flank'], ['first ferns on old flows', 'flank2']],
  erosion:  [['amphitheatre valley', 'flank'], ['sea cliff', 'shore'], ['fringing reef', 'reef'], ['forest — seeds came by bird', 'summit']],
  sinking:  [['barrier reef', 'reef'], ['lagoon', 'lagoon'], ['sinking ~2 mm / yr', 'summit'], ['reef grows up to keep pace', 'reef2']],
  atoll:    [['atoll', 'reef'], ['motu (sandy islet)', 'reef2'], ['lagoon', 'lagoon'], ['the old volcano, drowned', 'floor']],
};

export default {
  id: 'sketch',
  name: 'Sketch & Notebook',
  kind: '2d',
  sky: true,
  params: [
    { id: 'x1', label: 'Line weight', value: 0.45, tip: 'Thickness of the pen or pencil' },
    { id: 'x2', label: 'Hatching', value: 0.5, tip: 'How densely the shading is hatched or stippled' },
    { id: 'x3', label: 'Notes', value: 0.75, tip: 'How many annotations and arrows' },
    { id: 'x4', label: 'Boil', value: 0.4, tip: 'How much the lines wobble like hand-drawn animation' },
  ],
  create(ctx, opts) {
    const S = STYLES[opts.style] || STYLES.notebook;
    const st = { S, paperTex: null };
    return { render(f) { render(f, st); } };
  },
};

// ---------------------------------------------------------------- paper
function paperTexture(st, w, h, S) {
  const key = `${w}x${h}`;
  if (st.paperTex && st.paperKey === key) return st.paperTex;
  const b = buffer(w, h), g = b.ctx, r = rng(99);
  g.fillStyle = S.paper; g.fillRect(0, 0, w, h);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  const dark = S.chalk || S.blueprint, amp = S.charcoal ? 14 : S.chalk ? 10 : 7;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amp + (r() - 0.5) * amp * 0.5;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  if (S.chalk) { // old chalk dust and smears
    for (let i = 0; i < 14; i++) {
      g.globalAlpha = 0.05 + r() * 0.07;
      g.drawImage(puff('235,232,220', 128, 0.1), r() * w - h * 0.25, r() * h - h * 0.25, h * (0.3 + r() * 0.6), h * (0.12 + r() * 0.2));
    }
    g.globalAlpha = 1;
  }
  st.paperTex = b.canvas; st.paperKey = key;
  return b.canvas;
}

// ---------------------------------------------------------------- hand-drawn primitives
function makePen(ctx, f, S, boilAmp) {
  const b = Math.floor(f.clock * 7) * 3.7;
  const u = f.h / 270;
  const wob = (x, y, k = 1) => [
    x + (noise2(x * 0.03 / u + b, y * 0.03 / u) - 0.5) * boilAmp * k,
    y + (noise2(x * 0.03 / u + 11, y * 0.03 / u + b) - 0.5) * boilAmp * k];
  return {
    u, b, wob,
    // a wobbly polyline; passes = 2 gives the doubled pencil line
    line(pts, { width = 1, alpha = 1, color = S.ink, dash = null, passes = 1, closed = false } = {}) {
      if (pts.length < 2) return;
      ctx.lineWidth = width; ctx.strokeStyle = color; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.setLineDash(dash || []);
      for (let p = 0; p < passes; p++) {
        ctx.globalAlpha = alpha * (p ? 0.45 : 1);
        ctx.beginPath();
        const off = p * boilAmp * 0.7;
        for (let i = 0; i < pts.length; i++) { const [x, y] = wob(pts[i][0] + off, pts[i][1] - off); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        if (closed) ctx.closePath();
        ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.setLineDash([]);
    },
    // parallel hatching inside a polygon
    hatch(poly, { angle = -0.7, spacing = 6, width = 1, alpha = 0.6, color = S.ink, jitter = 0.3, zig = false } = {}) {
      if (poly.length < 3) return;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const [x, y] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      ctx.save();
      ctx.beginPath(); for (let i = 0; i < poly.length; i++) i ? ctx.lineTo(poly[i][0], poly[i][1]) : ctx.moveTo(poly[i][0], poly[i][1]); ctx.closePath(); ctx.clip();
      ctx.lineWidth = width; ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineCap = 'round';
      const c = Math.cos(angle), s = Math.sin(angle);
      const cxm = (x0 + x1) / 2, cym = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + spacing;
      ctx.beginPath();
      for (let d = -R; d <= R; d += spacing) {
        const j = (hash(d, 3) - 0.5) * spacing * jitter;
        const px = cxm + (-s) * (d + j), py = cym + c * (d + j);
        const ax = px - c * R, ay = py - s * R, bx = px + c * R, by = py + s * R;
        if (!zig) { const [wx, wy] = wob(ax, ay, 0.6), [vx, vy] = wob(bx, by, 0.6); ctx.moveTo(wx, wy); ctx.lineTo(vx, vy); }
        else { // biro zigzag: a little sawtooth along the stroke
          const n = 14; ctx.moveTo(ax, ay);
          for (let i = 1; i <= n; i++) { const t = i / n, zz = (i & 1 ? 1 : -1) * spacing * 0.3; ctx.lineTo(ax + (bx - ax) * t - s * zz, ay + (by - ay) * t + c * zz); }
        }
      }
      ctx.stroke();
      ctx.restore();
    },
    text(str, x, y, { size = 11, color = S.ink, align = 'left', font = S.font, alpha = 1, angle = 0 } = {}) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
      ctx.font = `${(size * u).toFixed(1)}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.globalAlpha = alpha;
      ctx.fillText(str, 0, 0); ctx.restore();
    },
    arrow(x0, y0, x1, y1, opt = {}) {
      const mx = (x0 + x1) / 2 + (y1 - y0) * 0.08, my = (y0 + y1) / 2 - (x1 - x0) * 0.08;
      const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8, a = (1 - t) * (1 - t), bq = 2 * (1 - t) * t, cq = t * t; pts.push([a * x0 + bq * mx + cq * x1, a * y0 + bq * my + cq * y1]); }
      this.line(pts, opt);
      const ang = Math.atan2(y1 - my, x1 - mx), L = 5 * u;
      this.line([[x1 - Math.cos(ang - 0.5) * L, y1 - Math.sin(ang - 0.5) * L], [x1, y1], [x1 - Math.cos(ang + 0.5) * L, y1 - Math.sin(ang + 0.5) * L]], opt);
    },
    // a scribbled puff: a few overlapping loops
    puffLoops(x, y, r, opt = {}) {
      const n = 7, pts = [];
      for (let i = 0; i <= n * 4; i++) { const a = i / (n * 4) * Math.PI * 2 * 1.08 - 1; const rr = r * (0.85 + 0.3 * noise2(i * 0.7 + x * 0.01, y * 0.01 + this.b)); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7]); }
      this.line(pts, opt);
    },
  };
}

// ---------------------------------------------------------------- the drawing (local coordinates: w×h of the model)
function drawIsland(ctx, f, m, S, pen, lvl) {
  const { w, h, sea, cx, W, WR, L, s } = m, u = pen.u;
  const lw = lerp(0.5, 2.6, f.p.x1) * u;
  const hatchSp = lerp(11, 3.5, f.p.x2) * u;
  const T = f.t;
  const tone = S.charcoal;

  // ---- the sea: a wobbly surface line and wave strokes
  const seaPts = []; for (let i = 0; i <= 40; i++) { const x = i / 40 * w; seaPts.push([x, sea + Math.sin(x / h * 30 + T * 1.5) * 1.5 * u]); }
  if (S.charcoal) {
    ctx.fillStyle = 'rgba(30,28,22,.35)'; ctx.fillRect(0, sea, w, h - sea);
    for (let i = 0; i < 24; i++) { const y = sea + (i + 0.5) / 24 * (h - sea); ctx.fillStyle = `rgba(190,186,176,${0.12 + 0.25 * hash(i, 4)})`; ctx.fillRect(hash(i, 1) * w * 0.6, y, w * (0.2 + hash(i, 2) * 0.5), 1.5 * u); }
  }
  pen.line(seaPts, { width: lw * 1.2, color: S.blue, passes: S.pencil ? 2 : 1 });
  const waves = Math.round(lerp(5, 14, f.p.x2));
  for (let i = 0; i < waves; i++) {
    const y = sea + (i + 1) / (waves + 1) * (h - sea) * 0.9, x0 = hash(i, 7) * w * 0.8, len = (0.08 + 0.18 * hash(i, 9)) * w;
    const pts = []; for (let k = 0; k <= 10; k++) { const x = x0 + k / 10 * len + T * 6 * u * (i % 2 ? 1 : -1); pts.push([x, y + Math.sin(k * 1.8 + T * 2 + i) * 1.6 * u]); }
    pen.line(pts, { width: lw * 0.7, alpha: 0.5, color: S.blue });
  }
  // ---- sea floor (dashed) and the submerged part of the cone
  const floorY = m.floor;
  pen.line([[0, floorY], [w, floorY]], { width: lw * 0.8, dash: [6 * u, 5 * u], alpha: 0.7 });
  const prof = m.profile(110);
  const sub = prof.filter(p => p[1] >= sea);
  if (sub.length > 2) {
    // the underwater flank: dotted, with pillow-lava bumps while it is still growing on the sea floor
    const left = sub.filter(p => p[0] < cx), right = sub.filter(p => p[0] >= cx);
    for (const half of [left, right]) pen.line(half, { width: lw * 0.8, dash: [3 * u, 4 * u], alpha: 0.6 });
    if (L.submarine > 0.2) {
      for (let i = 0; i < 18; i++) {
        const t = i / 17, x = cx + (t - 0.5) * 2 * W * 0.8, e = m.elev(x), y = sea - e;
        if (y < sea + 3 * u) continue;
        const r = (3 + 3 * hash(i, 5)) * u * m.SK;
        pen.line([[x - r, y + r * 0.6], [x - r * 0.9, y - r * 0.3], [x, y - r * 0.8], [x + r * 0.9, y - r * 0.3], [x + r, y + r * 0.6]], { width: lw * 0.7, alpha: 0.5 * L.submarine });
      }
      // bubbles
      for (let i = 0; i < 8; i++) { const yy = sea + ((hash(i, 3) + T * 0.1 * (1 + hash(i))) % 1) * (m.ventY - sea); const r = (1.2 + hash(i, 2) * 1.6) * u; pen.puffLoops(cx + (hash(i, 8) - 0.5) * 20 * u, Math.max(sea + 4 * u, yy), r, { width: lw * 0.5, alpha: 0.45 * L.submarine }); }
    }
  }
  // ---- the land
  const land = m.land(130);
  if (land.length > 3) {
    const poly = [[land[0][0], sea], ...land, [land[land.length - 1][0], sea]];
    if (tone) { ctx.save(); ctx.beginPath(); for (let i = 0; i < poly.length; i++) i ? ctx.lineTo(poly[i][0], poly[i][1]) : ctx.moveTo(poly[i][0], poly[i][1]); ctx.closePath(); ctx.fillStyle = `rgba(23,21,15,${lerp(0.5, 0.8, 1 - L.veg * 0.3)})`; ctx.fill(); ctx.restore(); }
    if (S.stipple) stippleLand(ctx, f, m, S, pen, poly, land);
    else {
      // shaded side (left of the summit) hatched denser, lit side lighter; vegetation as scribbles instead
      const rockA = lerp(0.35, 0.7, 1 - L.veg * 0.6);
      pen.hatch(poly, { angle: -0.9, spacing: hatchSp, width: lw * 0.6, alpha: tone ? 0.25 : rockA, color: tone ? '#cfcbc0' : S.ink, zig: S.biro });
      const shade = poly.filter(p => p[0] <= cx + W * 0.05); shade.push([cx + W * 0.05, sea]);
      pen.hatch(shade, { angle: 0.6, spacing: hatchSp * 1.3, width: lw * 0.6, alpha: tone ? 0.1 : rockA * 0.8, color: tone ? '#cfcbc0' : S.ink, zig: S.biro });
    }
    // outline
    pen.line(land, { width: lw, passes: S.pencil ? 2 : 1 });
    // vegetation scribbles
    if (L.veg > 0.05) {
      const n = Math.round(lerp(10, 40, f.p.x2) * L.veg);
      for (let i = 0; i < n; i++) {
        const x = cx + (hash(i, 21) - 0.5) * 2 * W * 0.92, e = m.elev(x); if (e <= 0) continue;
        const v = vegAt(m, x, e); if (hash(i, 22) > v) continue;
        const y = sea - e * (0.1 + 0.9 * hash(i, 23)), r = (2 + 3 * hash(i, 24)) * u;
        pen.line([[x - r, y], [x - r * 0.5, y - r], [x, y - r * 0.3], [x + r * 0.5, y - r * 1.1], [x + r, y]], { width: lw * 0.7, color: S.green, alpha: 0.8 });
      }
    }
    // lava channels: dashed accent lines running down the flanks
    const flow = m.erupt * (1 - L.submarine) * (1 - smooth(0.5, 0.62, s));
    if (flow > 0.02) {
      for (let i = 0; i < 7; i++) {
        const side = i % 2 ? 1 : -1, x0 = cx + side * W * (0.05 + 0.1 * hash(i, 31)), len = (0.3 + 0.6 * hash(i, 32)) * W;
        const pts = []; for (let k = 0; k <= 12; k++) { const x = x0 + side * k / 12 * len, e = m.elev(x); if (e <= 0) break; pts.push([x + (noise2(k * 0.5 + i, T * 0.3) - 0.5) * 6 * u, sea - e + 2 * u]); }
        pen.line(pts, { width: lw * 1.1, color: S.accent, alpha: 0.9 * Math.min(1, flow), dash: [5 * u, 3 * u] });
      }
    }
    // the sea cliff and beach marks once eroded
    if (L.erosion > 0.3) for (const side of [-1, 1]) {
      const x = cx + side * W * 0.98; const e = m.elev(x - side * 2 * u);
      pen.line([[x, sea], [x, sea - e]], { width: lw * 0.9, alpha: 0.6 * L.erosion });
    }
  }
  // ---- the reef, lagoon and atoll
  if (L.reef > 0.05) {
    for (const side of [-1, 1]) {
      const x = cx + side * WR;
      // surf marks on the reef crest
      for (let i = 0; i < 3; i++) pen.line([[x - 4 * u, sea - 1 * u + i * 2.5 * u], [x, sea - 4 * u + i * 2.5 * u], [x + 4 * u, sea - 1 * u + i * 2.5 * u]], { width: lw * 0.6, alpha: 0.7 * L.reef, color: S.blue });
      // coral: little branching marks hanging below the sea line
      const depth = 10 * u * L.reef;
      pen.line([[x, sea], [x, sea + depth], [x - 3 * u, sea + depth * 0.6]], { width: lw * 0.6, alpha: 0.7 * L.reef, color: S.accent });
      pen.line([[x, sea + depth * 0.5], [x + 3 * u, sea + depth * 0.9]], { width: lw * 0.6, alpha: 0.7 * L.reef, color: S.accent });
    }
    if (L.lagoon > 0.05) {
      // lagoon: calm ripples between reef and shore
      for (let i = 0; i < 6; i++) {
        const y = sea + (2 + i * 3) * u; const x0 = cx - WR * 0.9, x1 = cx + WR * 0.9;
        const pts = []; for (let k = 0; k <= 24; k++) { const x = x0 + (x1 - x0) * k / 24; pts.push([x, y + Math.sin(k + T + i) * 0.8 * u]); }
        pen.line(pts, { width: lw * 0.5, alpha: 0.35 * L.lagoon, color: S.blue, dash: [8 * u, 6 * u] });
      }
    }
    const atoll = smooth(0.86, 0.96, s);
    if (atoll > 0) for (let i = 0; i < 5; i++) {
      // motu: low sandy islets along the ring with a palm or two
      const side = i < 3 ? -1 : 1, x = cx + side * WR * (0.7 + 0.3 * hash(i, 41)) * (i === 2 ? 1 : 1), ww = (10 + 8 * hash(i, 42)) * u, hh = 3 * u;
      pen.line([[x - ww, sea], [x - ww * 0.5, sea - hh], [x + ww * 0.4, sea - hh * 0.8], [x + ww, sea]], { width: lw, alpha: atoll });
      const px = x + (hash(i, 43) - 0.5) * ww, ph = (8 + 4 * hash(i, 44)) * u;
      pen.line([[px, sea - hh * 0.5], [px + 1.5 * u, sea - hh - ph]], { width: lw * 0.8, alpha: atoll, color: S.green });
      for (let k = 0; k < 4; k++) { const a = -0.3 - k * 0.7; pen.line([[px + 1.5 * u, sea - hh - ph], [px + 1.5 * u + Math.cos(a) * 5 * u, sea - hh - ph + Math.sin(a) * 5 * u + 3 * u]], { width: lw * 0.6, alpha: atoll, color: S.green }); }
    }
  }
  // ---- plumes
  drawPlumes(ctx, f, m, S, pen, lw);
  // birds once there is life
  if (L.veg > 0.3) for (let i = 0; i < 4; i++) {
    const x = ((hash(i, 51) + T * 0.015 * (1 + hash(i))) % 1) * w, y = (0.12 + 0.2 * hash(i, 52)) * h, r = 3 * u, fl = Math.sin(T * 4 + i) * 1.5 * u;
    pen.line([[x - r, y - fl], [x, y + r * 0.4], [x + r, y - fl]], { width: lw * 0.6, alpha: 0.7 });
  }
  return lvl;
}

function drawPlumes(ctx, f, m, S, pen, lw) {
  const { cx, ventY, SK, L, h, sea, W, wind } = m, u = pen.u, T = f.t;
  const ea = m.erupt;
  const st = L.steam * Math.min(ea * 1.3, 1.5);
  if (st > 0.02) {
    // steam: scribbled loops stacked along a bending column
    const n = 14;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n, hh = t * 1.2 * st * SK, y = ventY - hh * h, x = cx + (wind * hh * hh * 1.1 + 0.3 * wind * hh) * SK * h + (noise2(i * 0.9, T * 0.4) - 0.5) * 20 * u;
      const r = (0.05 + 0.45 * hh) * SK * h * 0.5 * (0.8 + 0.4 * noise2(i, T * 0.5));
      if (S.charcoal) { ctx.globalAlpha = 0.35; ctx.drawImage(puff('235,232,226', 128, 0.2), x - r, y - r * 0.8, r * 2, r * 1.6); ctx.globalAlpha = 1; }
      pen.puffLoops(x, y, r, { width: lw * 0.7, alpha: 0.75 * st, passes: 1 });
    }
    // tephra jets: thick dark arcs with a spray of dots
    for (let i = 0; i < 6; i++) {
      const ph = T * 0.9 + i * 1.7;
      const len = SK * (0.12 + 0.22 * st) * (0.6 + 0.4 * Math.sin(ph)) * (0.7 + 0.3 * hash(i + 2)) * h;
      const a0 = (i / 5 - 0.5) * 1.9 + 0.2 * Math.sin(ph * 0.7 + i) + 0.25 * wind;
      const pts = []; for (let k = 0; k <= 10; k++) { const r = k / 10 * len, a = a0 + Math.sign(a0) * r / h / SK * 1.1; pts.push([cx + Math.sin(a) * r, ventY - Math.cos(a) * r]); }
      pen.line(pts, { width: lw * 2.2 * (1 - 0.5 * Math.sin(ph) * 0.3), alpha: 0.9 * st });
      const end = pts[10];
      ctx.fillStyle = S.ink; ctx.globalAlpha = 0.8 * st;
      for (let k = 0; k < 5; k++) { const r = (1 + hash(i, k) * 1.5) * u; ctx.beginPath(); ctx.arc(end[0] + (hash(k, i + 9) - 0.5) * 14 * u, end[1] + (hash(k, i + 19) - 0.3) * 14 * u, r, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  }
  const ef = ea * (1 - L.submarine) * (1 - smooth(0.48, 0.6, m.s)) * (1 - L.steam);
  if (ef > 0.02) {
    // lava fountain: radiating strokes from the vent, falling outward
    const hF = SK * (0.05 + 0.14 * ef) * h;
    for (let i = 0; i < 9; i++) {
      const a = (i / 8 - 0.5) * 0.9 + (noise2(i, T * 2) - 0.5) * 0.4, len = hF * (0.5 + 0.5 * hash(i, 61)) * (0.8 + 0.2 * Math.sin(T * 7 + i));
      const pts = []; for (let k = 0; k <= 6; k++) { const t = k / 6; pts.push([cx + Math.sin(a) * len * t + wind * t * t * 8 * u, ventY - Math.cos(a) * len * t + t * t * len * 0.5]); }
      pen.line(pts, { width: lw * 0.9, color: S.accent, alpha: 0.9 });
    }
    // thin gas plume
    for (let i = 0; i < 6; i++) {
      const t = (i + 0.5) / 6, hh = hF / h + t * 0.9 * ef * SK, y = ventY - hh * h, x = cx + (wind * hh * hh * 0.9 + 0.2 * wind * hh) * SK * h;
      pen.puffLoops(x, y, (0.03 + 0.25 * hh) * SK * h * 0.5, { width: lw * 0.5, alpha: 0.35 * ef });
    }
    // laze at the shore
    const lz = ef * smooth(0.2, 0.26, m.s);
    if (lz > 0.02) for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
      const t = (i + 0.5) / 5, hh = t * 0.4 * lz * SK, x = cx + side * W + (wind * hh * hh * 1.5 + wind * hh * 0.2) * SK * h, y = sea - hh * h;
      pen.puffLoops(x, y, (0.025 + 0.3 * hh) * SK * h * 0.5, { width: lw * 0.5, alpha: 0.5 * lz });
    }
  }
  const ex = L.explosive * (1 - L.steam) * ea * 2;
  if (ex > 0.02) {
    const pulse = smooth(0.2, 0.9, Math.sin(T * 0.35 + m.seed * 6) * 0.5 + 0.5);
    for (let i = 0; i < 8; i++) {
      const t = (i + 0.5) / 8, hh = t * 0.9 * ex * pulse * SK + 0.02, y = ventY - hh * h, x = cx + (wind * hh * hh * 0.8 + 0.25 * wind * hh) * SK * h;
      pen.puffLoops(x, y, (0.05 + 0.4 * hh) * SK * h * 0.5, { width: lw * 0.6, alpha: 0.6 * ex * pulse });
    }
  }
}

function stippleLand(ctx, f, m, S, pen, poly, land) {
  const { sea, cx, W, L, h } = m, u = pen.u;
  const step = lerp(5, 2.2, f.p.x2) * u;
  ctx.save();
  ctx.beginPath(); for (let i = 0; i < poly.length; i++) i ? ctx.lineTo(poly[i][0], poly[i][1]) : ctx.moveTo(poly[i][0], poly[i][1]); ctx.closePath(); ctx.clip();
  ctx.fillStyle = S.ink;
  const x0 = land[0][0], x1 = land[land.length - 1][0];
  ctx.beginPath();
  for (let x = x0; x <= x1; x += step) {
    const e = m.elev(x); if (e <= 0) continue;
    const d = (x - cx) / W, shade = 0.75 - d * 0.35;           // darker on the left
    for (let y = sea - e; y < sea; y += step) {
      const ee = sea - y;
      const v = vegAt(m, x, ee), lava = lavaAt(m, x, ee, f.t);
      let dark = shade * (0.5 + 0.5 * (ee / Math.max(e, 1))) * (1 - 0.4 * L.veg) + v * 0.6 * noise2(x * 0.2 / u, y * 0.2 / u) + lava * 0.9;
      const hx = hash(Math.round(x / step), Math.round(y / step) + Math.floor(f.clock * 2));
      if (hx < dark) { const r = (0.5 + dark * 0.9) * u; ctx.moveTo(x + r, y); ctx.arc(x + (hx - 0.5) * step * 0.6, y + (hash(y, x) - 0.5) * step * 0.6, r, 0, 7); }
    }
  }
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- annotations and page furniture
function anchors(m) {
  const { cx, W, WR, sea, ventY, h, L } = m;
  const el = x => sea - Math.max(m.elev(x), 0);
  return {
    summit: [cx, Math.min(ventY, sea - 2) ], vent: [cx, ventY], flank: [cx + W * 0.55, el(cx + W * 0.55)], flank2: [cx - W * 0.6, el(cx - W * 0.6)],
    shore: [cx + W * 0.98, sea], floor: [cx + W * 0.5, m.floor - 6], reef: [cx + WR, sea - 3], reef2: [cx - WR, sea - 3],
    lagoon: [cx + (W + WR) / 2, sea + 8], jet: [cx + 0.14 * h * m.SK, ventY - 0.1 * h * m.SK], steam: [cx + m.wind * 0.1 * h, ventY - 0.35 * h * m.SK],
    cone: [m.cones[1], el(m.cones[1])],
  };
}
function drawNotes(ctx, f, m, S, pen, count) {
  const list = NOTES[m.L.id] || [], A = anchors(m), { w, h } = m, u = pen.u;
  const lw = lerp(0.5, 2.6, f.p.x1) * u;
  const used = { left: 0, right: 0 };
  for (let i = 0; i < Math.min(count, list.length); i++) {
    const [text, key] = list[i], a = A[key] || A.summit;
    // the label sits on the anchor's side of the summit, stacked down the margin, near the anchor's height
    const right = a[0] > m.cx;
    const slot = right ? used.right++ : used.left++;
    ctx.font = `${(11 * u).toFixed(1)}px ${S.font}`;
    const tw = ctx.measureText(text).width;
    const lx = right ? Math.min(w * 0.97 - tw, a[0] + w * 0.12) : Math.max(w * 0.03, a[0] - w * 0.12 - tw);
    const ly = key === 'lagoon' || key === 'floor' ? h * (0.72 + 0.1 * slot) : h * (0.22 + 0.11 * slot);
    pen.text(text, lx, ly, { size: 11, color: S.ink, align: 'left' });
    pen.arrow(right ? lx - 3 * u : lx + tw + 3 * u, ly, a[0], a[1], { width: lw * 0.6, alpha: 0.8 });
  }
}
function header(ctx, f, m, S, pen) {
  const { w, h, L, s } = m, u = pen.u;
  const day = Math.floor(s / 0.22 * 1300), myr = (s * 5).toFixed(2);
  const when = s < 0.22 ? `day ${day}` : `+${myr} Myr`;
  if (S.tech && S.grid) {
    // blueprint title block
    const bw = w * 0.34, bh = h * 0.13, x = w - bw - 8 * u, y = h - bh - 8 * u;
    ctx.strokeStyle = S.ink; ctx.lineWidth = 1 * u; ctx.strokeRect(x, y, bw, bh); ctx.strokeRect(x, y, bw, bh * 0.45);
    pen.text('MEGA-VOLCANO  ·  SECTION A–A', x + 5 * u, y + bh * 0.22, { size: 8, font: TECH });
    pen.text(`${L.name.toUpperCase()}   ${when}`, x + 5 * u, y + bh * 0.62, { size: 8, font: TECH });
    pen.text(`SCALE 1:${Math.round(lerp(60, 20, f.p.scale))}000   SHEET ${1 + (f.epoch % 9)}`, x + 5 * u, y + bh * 0.85, { size: 7, font: TECH, alpha: 0.8 });
    return;
  }
  if (S.stipple) {
    pen.text(`Fig. ${1 + Math.floor(s * 7)}.  ${L.name}.  ${when}.`, w * 0.5, h * 0.95, { size: 9, font: TECH, align: 'center' });
    return;
  }
  if (S.chalk) {
    pen.text('How an island is born', w * 0.5, h * 0.08, { size: 17, align: 'center', color: S.accent });
    pen.text(`${L.index + 1}. ${L.name}`, w * 0.5, h * 0.17, { size: 13, align: 'center' });
    pen.text(when, w * 0.95, h * 0.95, { size: 10, align: 'right', alpha: 0.8 });
    return;
  }
  pen.text(`${L.name}`, w * 0.05, h * 0.08, { size: 15, color: S.ink });
  pen.text(S.biro ? `${when}  —  on deck, calm sea` : `Field notebook  ·  ${when}  ·  p. ${Math.floor(s * 48) + 1 + f.epoch * 48}`, w * 0.05, h * 0.145, { size: 9, color: S.ink, alpha: 0.75 });
}
function rulings(ctx, f, S, w, h, u) {
  if (S.ruled) {
    ctx.strokeStyle = S.biro ? 'rgba(120,150,200,.45)' : 'rgba(110,140,190,.3)'; ctx.lineWidth = 1 * u;
    ctx.beginPath(); for (let y = h * 0.1; y < h; y += 14 * u) { ctx.moveTo(0, y); ctx.lineTo(w, y); } ctx.stroke();
    if (S.biro) { ctx.strokeStyle = 'rgba(220,90,90,.5)'; ctx.beginPath(); ctx.moveTo(w * 0.035, 0); ctx.lineTo(w * 0.035, h); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.08)'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(w * 0.015, h * (0.2 + i * 0.3), 4 * u, 0, 7); ctx.fill(); } }
  }
  if (S.grid) {
    ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 0.6 * u;
    ctx.beginPath(); const g = 12 * u; for (let x = 0; x < w; x += g) { ctx.moveTo(x, 0); ctx.lineTo(x, h); } for (let y = 0; y < h; y += g) { ctx.moveTo(0, y); ctx.lineTo(w, y); } ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = 1 * u; ctx.strokeRect(6 * u, 6 * u, w - 12 * u, h - 12 * u);
  }
}
function dimensions(ctx, f, m, S, pen) {
  const { cx, W, sea, ventY, h, L } = m, u = pen.u;
  if (m.HP <= 0) return;
  const x = Math.max(16 * u, cx - W * 1.15 - 20 * u), top = ventY;
  pen.line([[x, top], [x, sea]], { width: 0.8 * u, color: S.ink, alpha: 0.8 });
  pen.line([[x - 5 * u, top], [x + 5 * u, top]], { width: 0.8 * u, color: S.ink }); pen.line([[x - 5 * u, sea], [x + 5 * u, sea]], { width: 0.8 * u, color: S.ink });
  pen.text(`${Math.round(Math.max(L.height, 0.02) * 4200)} m`, x + 7 * u, (top + sea) / 2, { size: 8, font: TECH });
  const y = sea + 16 * u;
  pen.line([[cx - W, y], [cx + W, y]], { width: 0.8 * u, color: S.ink, alpha: 0.8 });
  pen.text(`${(W / h * lerp(30, 95, f.p.scale) * 0.6).toFixed(1)} km`, cx, y + 8 * u, { size: 8, font: TECH, align: 'center' });
}

// ---------------------------------------------------------------- flip-book strip
function flipStrip(ctx, f, S, w, h, u, pen) {
  const n = 8, fw = w / n, fh = h * 0.26, y0 = h - fh;
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,.04)'; ctx.fillRect(0, y0, w, fh);
  for (let i = 0; i < n; i++) {
    const st = 0.03 + i / (n - 1) * 0.94;
    const fx = i * fw;
    ctx.save(); ctx.translate(fx, y0); ctx.beginPath(); ctx.rect(0, 0, fw, fh); ctx.clip();
    const ff = { ...f, w: fw, h: fh, stage: st, life: life(st), p: { ...f.p, x1: f.p.x1 * 0.6, x2: f.p.x2 * 0.6 } };
    const mm = makeIsland(ff, 0.62);
    const pp = makePen(ctx, ff, S, lerp(0, 2, f.p.x4) * fh / 270);
    drawIsland(ctx, ff, mm, S, pp, 0);
    pp.text(String(i + 1), fw - 6 * u, fh - 7 * u, { size: 8, align: 'right', alpha: 0.6 });
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1 * u; ctx.strokeRect(fx + 0.5, y0 + 0.5, fw, fh);
  }
  // the current frame, circled in red
  const cur = Math.round((f.stage - 0.03) / 0.94 * (n - 1));
  pen.line([[cur * fw + 2 * u, y0 + 2 * u], [cur * fw + fw - 2 * u, y0 + 2 * u], [cur * fw + fw - 2 * u, h - 2 * u], [cur * fw + 2 * u, h - 2 * u]], { width: 2 * u, color: S.accent, closed: true });
  ctx.restore();
}

// ---------------------------------------------------------------- frame
function render(f, st) {
  const { ctx, w, h, p } = f, S = st.S;
  const u = h / 270;
  const seaY = S.strip ? 0.5 : 0.6;
  const tex = paperTexture(st, w, h, S);
  const painted = sky(f, (c, ww, hh) => c.drawImage(tex, 0, 0, ww, hh));
  if (!painted) { // in a cloud combo the sky is clear glass; the sea keeps its paper
    ctx.drawImage(tex, 0, seaY * h, w, h * (1 - seaY), 0, seaY * h, w, h * (1 - seaY));
  }
  rulings(ctx, f, S, w, h, u);
  const pen = makePen(ctx, f, S, lerp(0, 3.5, p.x4) * u);
  if (S.strip) {
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h * 0.74); ctx.clip();
    const ff = { ...f, h: h * 0.74 };
    const m = makeIsland(ff, 0.62);
    drawIsland(ctx, ff, m, S, pen, 0);
    drawNotes(ctx, ff, m, S, pen, Math.round(p.x3 * 3));
    header(ctx, ff, m, S, pen);
    ctx.restore();
    flipStrip(ctx, f, S, w, h, u, pen);
    pen.text('flip →', w * 0.92, h * 0.71, { size: 9, alpha: 0.6, color: S.accent });
    return;
  }
  const m = makeIsland(f, seaY);
  if (S.charcoal) { // a toned ground: darker sky wash and a smudged horizon
    ctx.fillStyle = 'rgba(60,56,48,.12)'; ctx.fillRect(0, 0, w, m.sea);
    ctx.globalAlpha = 0.25; ctx.drawImage(puff('30,28,22', 128, 0.1), m.cx - h * 0.6, m.sea - h * 0.12, h * 1.2, h * 0.24); ctx.globalAlpha = 1;
  }
  drawIsland(ctx, f, m, S, pen, 0);
  if (S.dims) dimensions(ctx, f, m, S, pen);
  drawNotes(ctx, f, m, S, pen, Math.round(p.x3 * 4));
  header(ctx, f, m, S, pen);
  if (S.chalk) { // the lecturer's hand just wiped a corner
    ctx.globalAlpha = 0.08; ctx.drawImage(puff('240,236,225', 128, 0.1), w * 0.6 + Math.sin(f.t * 0.2) * 20 * u, h * 0.3, h * 0.6, h * 0.3); ctx.globalAlpha = 1;
  }
  if (S.biro) { // margin doodles
    pen.text('!!', m.cx + 0.2 * h * m.SK, m.ventY - 0.12 * h * m.SK, { size: 14, color: S.ink, alpha: 0.6 * Math.min(1, m.erupt + m.L.steam) * (1 - m.L.submarine) });
    const sx = w * 0.9, sy = h * 0.14, r = 7 * u;
    pen.line(Array.from({ length: 13 }, (_, i) => [sx + Math.cos(i / 12 * 6.3) * r, sy + Math.sin(i / 12 * 6.3) * r]), { width: 1 * u, alpha: 0.7 });
    for (let i = 0; i < 8; i++) { const a = i / 8 * 6.3; pen.line([[sx + Math.cos(a) * r * 1.3, sy + Math.sin(a) * r * 1.3], [sx + Math.cos(a) * r * 1.9, sy + Math.sin(a) * r * 1.9]], { width: 1 * u, alpha: 0.7 }); }
  }
}

export const scenes = [
  { id: 'sketch-notebook', name: 'Field Notebook', tags: ['ink', 'paper', 'science', 'diagram', 'surtseyan', 'eruption'],
    desc: 'A naturalist’s pencil notebook: the new island breaking the surface, hatched in graphite and annotated with arrows and notes.',
    opts: { style: 'notebook' }, params: { stage: 0.18, grow: 0.35, activity: 0.6, scale: 0.5, light: 0.8, x1: 0.45, x2: 0.5, x3: 0.9, x4: 0.4 } },
  { id: 'sketch-blueprint', name: 'Blueprint Section', tags: ['diagram', 'science', 'paper', 'hawaii'],
    desc: 'White lines on blueprint paper: a dimensioned cross-section of the shield as it builds, with a title block.',
    opts: { style: 'blueprint' }, params: { stage: 0.4, grow: 0.3, activity: 0.5, scale: 0.5, light: 0.8, x1: 0.35, x2: 0.45, x3: 0.75, x4: 0.15 } },
  { id: 'sketch-chalkboard', name: 'Chalkboard Lecture', tags: ['diagram', 'science', 'text', 'calm'],
    desc: 'A geology lecture in chalk: the eroding island, its fringing reef and the lecturer’s labels, with smudges and dust.',
    opts: { style: 'chalk' }, params: { stage: 0.7, grow: 0.4, activity: 0.5, scale: 0.5, light: 0.8, x1: 0.55, x2: 0.4, x3: 1, x4: 0.35 } },
  { id: 'sketch-ballpoint', name: 'Ballpoint Doodle', tags: ['ink', 'paper', 'cartoon', 'lava'],
    desc: 'Blue biro scribbles on a lined pad: a fountaining shield volcano, zigzag hatching and margin doodles.',
    opts: { style: 'ballpoint' }, params: { stage: 0.33, grow: 0.3, activity: 0.7, scale: 0.55, light: 0.8, x1: 0.4, x2: 0.65, x3: 0.5, x4: 0.6 } },
  { id: 'sketch-charcoal', name: 'Charcoal Study', tags: ['art', 'paper', 'eruption', 'surtseyan'],
    desc: 'Smudged charcoal on toned paper: a dark Surtseyan eruption with soft steam, tonal sea and a heavy horizon.',
    opts: { style: 'charcoal' }, params: { stage: 0.2, grow: 0.5, activity: 0.7, scale: 0.6, light: 0.8, x1: 0.7, x2: 0.4, x3: 0.25, x4: 0.5 } },
  { id: 'sketch-stipple', name: 'Technical Pen Stipple', tags: ['ink', 'science', 'diagram', 'paper', 'atoll'],
    desc: 'Thousands of pen dots shade the sinking island inside its barrier reef, captioned like a textbook figure.',
    opts: { style: 'stipple' }, params: { stage: 0.84, grow: 0.3, activity: 0.5, scale: 0.55, light: 0.8, x1: 0.3, x2: 0.7, x3: 0.75, x4: 0.1 } },
  { id: 'sketch-flipbook', name: 'Margin Flip-Book', tags: ['paper', 'cartoon', 'diagram', 'eruption'],
    desc: 'A flip-book strip along the bottom of the page runs the whole life of the island, while the current frame is drawn large above.',
    opts: { style: 'flipbook' }, params: { stage: 0.3, grow: 0.7, activity: 0.6, scale: 0.5, light: 0.8, x1: 0.45, x2: 0.5, x3: 0.5, x4: 0.5 } },
];
