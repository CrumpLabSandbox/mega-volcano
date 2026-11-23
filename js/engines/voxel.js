// Voxel: an isometric voxel island, built block by block from a heightmap that is a pure function of the life
// stage and the epoch seed. Rock, sand, grass and coral columns, water voxels with depth colour, glowing lava
// voxels running down the flanks, fountain cubes and steam cubes above the vent, trees later, a reef ring and
// motu at the end. The camera orbits slowly (drag to turn). One scene is a cutaway showing the conduit and chamber.
import { clamp, lerp, smooth, fract, hash, fbm2, noise2, sky, lavaCss, eruptAmount, windX, daylight } from '../util.js';

const C30 = Math.cos(Math.PI / 6);
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const PALETTES = {
  classic: { rock: [78, 72, 70], tuff: [60, 48, 40], grass: [86, 160, 70], forest: [40, 110, 50], sand: [232, 214, 160], seabed: [60, 70, 80], coral: [240, 120, 110], lava: 1, water: [40, 120, 200], shallow: [90, 210, 200], steam: [245, 245, 250], trunk: [96, 66, 40] },
  pastel:  { rock: [160, 150, 170], tuff: [150, 130, 140], grass: [160, 225, 170], forest: [120, 190, 150], sand: [255, 240, 200], seabed: [150, 160, 190], coral: [255, 170, 180], lava: 1, water: [150, 200, 240], shallow: [180, 240, 230], steam: [255, 255, 255], trunk: [200, 160, 140] },
  mono:    { rock: [120, 120, 120], tuff: [90, 90, 90], grass: [160, 160, 160], forest: [110, 110, 110], sand: [220, 220, 220], seabed: [70, 70, 70], coral: [200, 200, 200], lava: 1, water: [55, 55, 60], shallow: [140, 140, 145], steam: [240, 240, 240], trunk: [80, 80, 80] },
};

export default {
  id: 'voxel',
  name: 'Voxel',
  kind: '2d',
  sky: true,
  params: [
    { id: 'x1', label: 'Tilt', value: 0.5, tip: 'Camera elevation: flatter to steeper' },
    { id: 'x2', label: 'Edges', value: 0.4, tip: 'Dark seams between voxels' },
    { id: 'x3', label: 'Trees', value: 0.5, tip: 'How thickly the forest grows' },
    { id: 'x4', label: 'Water clarity', value: 0.5, tip: 'How much of the sea floor and reef shows through the water' },
  ],
  create(ctx, opts) {
    const P = PALETTES[opts.palette || 'classic'];
    const baseN = opts.n || 40, cut = !!opts.cutaway;
    let N = 0, D = 6, H = null, M = null, key = '', order = null, ox = null, oz = null, keys = null;

    // ---- heightmap + material, rebuilt when stage/epoch/size change
    function build(f) {
      const L = f.life, p = f.p;
      const n = Math.max(12, Math.round(baseN * (0.75 + 0.5 * p.detail)));
      const k = `${n}|${f.stage.toFixed(3)}|${f.epoch}|${p.scale.toFixed(2)}|${p.activity.toFixed(2)}`;
      if (k === key) return; key = k;
      if (n !== N) { N = n; H = new Float32Array(N * N); M = new Uint8Array(N * N); order = new Int32Array(N * N); ox = new Float32Array(N * N); oz = new Float32Array(N * N); keys = new Float32Array(N * N); }
      D = Math.max(3, Math.round(N * 0.12));
      const Hmax = N * 0.38 * (0.6 + 0.8 * p.scale), R = N * 0.5 * (0.55 + 0.35 * p.scale);
      const seed = f.epoch * 7.3 + (opts.seed || 0), hgt = L.height;
      const domeW = 0.78 * clamp(0.3 + 0.7 * Math.sqrt(Math.max(0, hgt)));
      const E = eruptAmount(f);
      const cx = (N - 1) / 2, cz = (N - 1) / 2;
      for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
        const dx = (x - cx) / R, dz = (z - cz) / R, r = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
        const rn = r * (1 + 0.12 * (noise2(dx * 2.5 + seed, dz * 2.5 + seed) - 0.5));
        // submarine pedestal
        let ped = smooth(1, 0.55, rn) * clamp(1 + hgt);
        ped += Math.max(0, 1 - rn / 0.3) * 0.45 * L.submarine * clamp(1 + hgt);
        let h = -D + D * Math.min(1, ped) - 1 - 2 * L.lagoon;
        if (rn < 1 && L.lagoon > 0) h = Math.min(h, -1 - 2.2 * L.lagoon);
        if (hgt > 0) {
          const q = Math.max(0, 1 - rn / domeW);
          const shield = Math.max(0, 1 - Math.pow(rn / domeW, 1.7)), peaky = Math.pow(q, 1.4);
          let s = lerp(shield, peaky, 0.75 * L.erosion + 0.4 * L.steam);
          s *= 1 - 0.1 * noise2(dx * 3 + seed, dz * 3 + 2.1);
          s -= L.caldera * 0.22 * smooth(0.16, 0.03, rn) * q;
          s += L.caldera * 0.07 * (Math.max(0, 1 - Math.hypot(dx - 0.3, dz + 0.1) * 8) + Math.max(0, 1 - Math.hypot(dx + 0.25, dz - 0.3) * 9));
          // erosion: radial valleys
          const valley = Math.pow(0.5 + 0.5 * Math.sin(a * 5 + seed + 2 * noise2(rn * 3, a)), 6);
          s -= L.erosion * 0.3 * valley * Math.min(1, rn * 2.5) * q;
          if (s > 0) h = Math.max(h, Hmax * s);
        }
        // Surtseyan tuff cone
        h += Hmax * 0.18 * L.steam * Math.max(0, 1 - rn / 0.14) * (1 - L.submarine);
        // reef ring on the pedestal edge
        let mat = 0;  // 0 rock, 1 grass, 2 sand, 3 coral, 4 seabed, 5 lava, 6 tuff, 7 forest, 8 motu sand
        if (L.reef > 0.02 && h < 0) {
          const ring = smooth(0.3, 0.45, L.lagoon);
          const r0 = lerp(domeW + 0.02, 0.72, ring), r1 = r0 + 0.08 + 0.06 * L.lagoon;
          if (rn > r0 && rn < r1 && hash(x, z) < L.reef) { h = Math.max(h, -1); mat = 3; }
          if (rn > r0 && rn < r1 && ring > 0.5 && Math.sin(a * 3 + seed) > 0.55 && hash(x + 7, z) < 0.8) { h = 1 + (noise2(x * 0.4, z * 0.4) > 0.6 ? 1 : 0); mat = 8; }
        }
        h = Math.max(-D, Math.round(h));
        if (mat === 0) {
          if (h < 0) mat = 4;
          else if (L.steam > 0.3 && hgt < 0.15) mat = 6;
          else {
            const veg = L.veg * (0.55 + 0.9 * p.x3) * (1 - 0.4 * h / Math.max(1, Hmax)) - 0.35 * fract(hash(x * 3.1, z * 1.7) + 0.2) * (1 - L.veg);
            mat = veg > 0.25 ? (hash(x + 11, z + 3) < L.veg * 0.55 ? 7 : 1) : 0;
            if (h <= 1 && L.erosion > 0.3 && hash(x, z + 9) < L.erosion) mat = 2;
          }
        }
        H[z * N + x] = h; M[z * N + x] = mat;
      }
      // lava flows: a few paths of steepest descent from the vent, as long as the eruption is strong
      const flows = Math.round(E * 3.5 * (1 - L.submarine) * (1 - smooth(0.5, 0.64, f.stage)) + (L.caldera > 0.3 ? 1 : 0) * (1 - smooth(0.58, 0.66, f.stage)) * E);
      let vx = cx | 0, vz = cz | 0; let best = -1e9;
      for (let z = (cz - 3) | 0; z <= cz + 3; z++) for (let x = (cx - 3) | 0; x <= cx + 3; x++) if (H[z * N + x] > best) { best = H[z * N + x]; vx = x; vz = z; }
      for (let j = 0; j < flows; j++) {
        let x = vx, z = vz; const len = Math.round(N * (0.25 + 0.35 * hash(j, seed + 1)) * Math.min(1.3, E));
        let dirx = Math.cos(j * 2.4 + seed), dirz = Math.sin(j * 2.4 + seed);
        for (let s = 0; s < len; s++) {
          if (H[z * N + x] <= 0) break;
          M[z * N + x] = 5;
          let bx = x, bz = z, bh = 1e9;
          for (const [ex, ez] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + ex, nz = z + ez; if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
            const hh = H[nz * N + nx] - 0.6 * (ex * dirx + ez * dirz) + hash(nx, nz + j) * 0.4;
            if (hh < bh) { bh = hh; bx = nx; bz = nz; }
          }
          if (bx === x && bz === z) break; x = bx; z = bz;
        }
      }
      vent.x = vx; vent.z = vz; vent.h = best;
      for (let i = 0; i < N * N; i++) order[i] = i;
    }
    const vent = { x: 0, z: 0, h: 0 };

    // ---- projection
    let ex, ez, ey, cos, sin, S, OX, OY;
    function camera(f) {
      const { w: W, h: Hh, t, p } = f;
      const ang = (opts.angle ?? 0.7) + t * 0.06 * (opts.orbit ?? 1) + f.pointer.dragX * 3;
      cos = Math.cos(ang); sin = Math.sin(ang);
      const tilt = lerp(0.32, 0.72, p.x1);
      S = Math.min(W / (N * 2.1), Hh / (N * 1.1 + N * 0.5 * tilt)) * 1.15;
      // rotated grid axes projected: screen = (rx - rz)*C30, (rx + rz)*tilt*0.5... with rotation first
      const ax = [cos, sin], az = [-sin, cos];
      ex = [(ax[0] - ax[1]) * C30 * S, (ax[0] + ax[1]) * 0.5 * tilt * S];
      ez = [(az[0] - az[1]) * C30 * S, (az[0] + az[1]) * 0.5 * tilt * S];
      ey = [0, -S * lerp(0.9, 0.55, p.x1) * (0.8 + 0.4 * tilt)];
      OX = W * 0.5; OY = Hh * (0.55 + 0.1 * tilt) + ey[1] * (N * 0.35 * (0.6 + 0.8 * p.scale)) * 0.35;
    }
    const proj = (x, y, z) => [OX + (x - N / 2) * ex[0] + (z - N / 2) * ez[0], OY + (x - N / 2) * ex[1] + (z - N / 2) * ez[1] + y * ey[1]];

    // ---- face drawing
    function quad(ctx, a, b, c, d) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill(); if (edgeOn) ctx.stroke(); }
    let edgeOn = false;
    function top(ctx, x, y, z) { const p0 = proj(x, y, z); quad(ctx, p0, [p0[0] + ex[0], p0[1] + ex[1]], [p0[0] + ex[0] + ez[0], p0[1] + ex[1] + ez[1]], [p0[0] + ez[0], p0[1] + ez[1]]); }
    // the side face at the +x (or -x) edge of column (x,z) for voxel y
    function sideX(ctx, x, y, z, sgn) {
      const p0 = proj(sgn > 0 ? x + 1 : x, y, z); const q = [p0[0] + ez[0], p0[1] + ez[1]];
      quad(ctx, p0, q, [q[0], q[1] - ey[1]], [p0[0], p0[1] - ey[1]]);
    }
    function sideZ(ctx, x, y, z, sgn) {
      const p0 = proj(x, y, sgn > 0 ? z + 1 : z); const q = [p0[0] + ex[0], p0[1] + ex[1]];
      quad(ctx, p0, q, [q[0], q[1] - ey[1]], [p0[0], p0[1] - ey[1]]);
    }

    function matColor(m, h, f, L, night) {
      switch (m) {
        case 1: return mix3(P.grass, P.forest, 0.3 * clamp(h / (N * 0.3)));
        case 2: case 8: return P.sand;
        case 3: return mix3(P.coral, [255, 200, 120], hash(h, m) * 0.3);
        case 4: return P.seabed;
        case 6: return P.tuff;
        case 7: return P.forest;
        default: return mix3(P.rock, P.tuff, L.steam * 0.5);
      }
    }

    function render(f) {
      const { ctx, w: W, h: Hh, t, p } = f, L = f.life;
      build(f); camera(f);
      const { day, night } = daylight(p.light);
      const dk = 0.26 + 0.74 * smooth(0, 0.5, day);                     // daylight factor
      const E = eruptAmount(f);
      edgeOn = p.x2 > 0.05;
      ctx.lineWidth = Math.max(0.5, S * 0.06 * p.x2); ctx.strokeStyle = `rgba(0,0,0,${0.15 + 0.6 * p.x2})`; ctx.lineJoin = 'round';

      // sky
      sky(f, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, 0, h);
        const tp = mix3([6, 8, 24], opts.palette === 'pastel' ? [200, 225, 250] : [70, 130, 215], dk), bt = mix3([20, 24, 48], opts.palette === 'pastel' ? [255, 235, 230] : [185, 215, 240], dk);
        g.addColorStop(0, css(tp)); g.addColorStop(1, css(bt)); c.fillStyle = g; c.fillRect(0, 0, w, h);
        if (night > 0.1) { c.fillStyle = `rgba(255,255,255,${0.8 * night})`; for (let i = 0; i < 60; i++) c.fillRect(hash(i, 1) * w, hash(i, 2) * h * 0.7, S * 0.12 + 0.5, S * 0.12 + 0.5); }
      });

      // painter's order: sort columns by rotated depth (far first)
      const sgnX = ex[1] > 0 ? 1 : -1, sgnZ = ez[1] > 0 ? 1 : -1;   // which side faces face the camera
      for (let i = 0, z = 0; z < N; z++) for (let x = 0; x < N; x++, i++) keys[i] = (x - N / 2) * ex[1] + (z - N / 2) * ez[1];
      order.sort((a, b) => keys[a] - keys[b]);

      // shading per face
      const sunX = p.light > 0.05 ? (cos > 0 ? 1 : 0.75) : 0.8;
      const shTop = 1.0, shX = sgnX > 0 ? 0.78 * sunX + 0.1 : 0.72, shZ = sgnZ > 0 ? 0.6 : 0.66;
      const water = mix3(P.water, [10, 14, 40], night * 0.85), shallow = mix3(P.shallow, [20, 40, 60], night * 0.85);
      const clarity = 0.35 + 0.5 * p.x4;
      const lavaT = 0.75 + 0.2 * Math.sin(t * 2);
      const cutX = cut ? Math.floor(N / 2) + 1 : N + 1;
      const half = N / 2;
      const chamberY = -D - 1, chamberR = N * 0.14 * (0.5 + 0.5 * E) * (1 - L.erosion * 0.8);

      for (let oi = 0; oi < N * N; oi++) {
        const i = order[oi], x = i % N, z = (i - x) / N;
        if (x >= cutX) continue;
        const h = H[i], m = M[i];
        const nxI = clamp(x + sgnX, 0, N - 1) + z * N, nzI = x + clamp(z + sgnZ, 0, N - 1) * N;
        let hx = x + sgnX < 0 || x + sgnX >= N ? -D - 1 : H[nxI], hz = z + sgnZ < 0 || z + sgnZ >= N ? -D - 1 : H[nzI];
        if (cut && x + sgnX >= cutX) hx = -D - 1;
        const base = matColor(m, h, f, L, night);
        const under = h < 0;
        // underwater columns are tinted by depth (what you see through the water)
        let col = base;
        if (under) { const d = clamp(-h / (D + 2)); col = mix3(mix3(base, shallow, 0.5), water, lerp(0.1, 0.8, d) * (1 - clarity * 0.6)); }
        const lit = c => [c[0] * dk, c[1] * dk, c[2] * dk];
        const isLava = m === 5;
        const lavaCol = () => lavaCss(lavaT * (0.5 + 0.5 * Math.min(1, E)) + 0.1 * hash(x, z));
        // top face
        ctx.fillStyle = isLava ? lavaCol() : css(lit(col));
        if (isLava) ctx.fillStyle = lavaCol(); // glows regardless of daylight
        top(ctx, x, h, z);
        // sides, voxel by voxel down to the neighbour's height
        const sideCol = (sh, y) => {
          if (cut && x === cutX - 1) { // the cut face shows the inside: flow layers, the conduit and the chamber
            const conduit = Math.abs(z - vent.z) < 1.5 && y <= vent.h && y > chamberY && (E > 0.2 || L.submarine > 0);
            const inCh = Math.hypot((z - half) / chamberR, (y - chamberY) / (chamberR * 0.6)) < 1 && L.erosion < 0.9;
            if (conduit || inCh) return lavaCss(0.65 + 0.25 * Math.sin(t * 2 + y));
            if (y < 0) return css(lit(mix3([70, 60, 55], [40, 36, 40], hash(y, 3) * 0.5)));
            const layer = fract(y * 0.33 + hash(Math.floor(y / 3), 1) * 0.3) < 0.5 ? [90, 60, 50] : [60, 52, 50];
            return css(lit(mix3(layer, [110, 90, 70], 0.2 * Math.sin(y + z * 0.2))));
          }
          const c = under && y < 0 ? col : (y < 0 ? mix3(base, water, 0.6) : (m === 7 || m === 1 ? mix3(P.rock, base, 0.4) : base));
          const cc = isLava && y === h ? null : lit([c[0] * sh, c[1] * sh, c[2] * sh]);
          return cc ? css(cc) : lavaCss(0.5);
        };
        for (let y = h; y > hx; y--) { ctx.fillStyle = sideCol(shX, y); sideX(ctx, x, y, z, sgnX); }
        for (let y = h; y > hz; y--) { ctx.fillStyle = sideCol(shZ, y); sideZ(ctx, x, y, z, sgnZ); }
        // trees: trunk + canopy on forest columns
        if (m === 7 && !isLava && hash(x + 1, z + 5) < 0.6 * (0.3 + p.x3)) {
          const tc = mix3(P.forest, [20, 60, 30], 0.3 + 0.4 * hash(x, z + 1)), tr = P.trunk;
          ctx.fillStyle = css(lit([tr[0] * shX, tr[1] * shX, tr[2] * shX])); sideX(ctx, x, h + 1, z, sgnX); ctx.fillStyle = css(lit([tr[0] * shZ, tr[1] * shZ, tr[2] * shZ])); sideZ(ctx, x, h + 1, z, sgnZ);
          ctx.fillStyle = css(lit([tc[0] * shX, tc[1] * shX, tc[2] * shX])); sideX(ctx, x, h + 2, z, sgnX); ctx.fillStyle = css(lit([tc[0] * shZ, tc[1] * shZ, tc[2] * shZ])); sideZ(ctx, x, h + 2, z, sgnZ);
          ctx.fillStyle = css(lit(tc)); top(ctx, x, h + 2, z);
        }
        // palms on motu
        if (m === 8 && hash(x + 2, z + 8) < 0.4) {
          ctx.fillStyle = css(lit(P.trunk)); sideX(ctx, x, h + 1, z, sgnX); sideZ(ctx, x, h + 1, z, sgnZ); sideX(ctx, x, h + 2, z, sgnX); sideZ(ctx, x, h + 2, z, sgnZ);
          ctx.fillStyle = css(lit(P.grass)); top(ctx, x, h + 3, z); sideX(ctx, x, h + 3, z, sgnX); sideZ(ctx, x, h + 3, z, sgnZ);
        }
        // water surface over submerged columns: one translucent voxel top at sea level, plus the slab sides at the edges
        if (under) {
          const wc = mix3(water, shallow, smooth(-4, -1, h) * 0.5);
          ctx.fillStyle = css(wc, 0.4 + 0.4 * (1 - clarity));
          const edgeSave = edgeOn; edgeOn = false;
          top(ctx, x, 0, z);
          if (x + sgnX < 0 || x + sgnX >= N || (cut && x + sgnX >= cutX)) { ctx.fillStyle = css(mix3(wc, [0, 0, 0], 0.25), 0.9); for (let y = 0; y > -D - 1; y--) sideX(ctx, x, y, z, sgnX); }
          if (z + sgnZ < 0 || z + sgnZ >= N) { ctx.fillStyle = css(mix3(wc, [0, 0, 0], 0.35), 0.9); for (let y = 0; y > -D - 1; y--) sideZ(ctx, x, y, z, sgnZ); }
          edgeOn = edgeSave;
          // sparkle
          if (hash(x, z + 2) < 0.08 && night < 0.6) { const q = proj(x + 0.5, 0, z + 0.5); ctx.fillStyle = `rgba(255,255,255,${0.5 * (0.5 + 0.5 * Math.sin(t * 3 + x + z)) * dk})`; ctx.fillRect(q[0], q[1], S * 0.15, S * 0.1); }
        }
      }

      // ---- eruption above the vent: fountain cubes, Surtseyan jets, steam cubes
      const above = 1 - L.submarine, vx = vent.x + 0.5, vz = vent.z + 0.5, vh = Math.max(0, vent.h) + 1;
      const steamAmt = L.steam * E;
      const fountainAmt = above * smooth(0.2, 0.28, f.stage) * (1 - smooth(0.5, 0.62, f.stage)) * E + L.caldera * (1 - smooth(0.56, 0.66, f.stage)) * E * 0.4;
      edgeOn = false;
      const cube = (x, y, z, s, fill) => { // a small cube at fractional position
        ctx.fillStyle = fill;
        const p0 = proj(x, y, z);
        const a = [p0[0], p0[1]], b = [p0[0] + ex[0] * s, p0[1] + ex[1] * s], c = [b[0] + ez[0] * s, b[1] + ez[1] * s], d = [p0[0] + ez[0] * s, p0[1] + ez[1] * s];
        quad(ctx, a, b, c, d);
        quad(ctx, [b[0], b[1]], [c[0], c[1]], [c[0], c[1] - ey[1] * s], [b[0], b[1] - ey[1] * s]);
        quad(ctx, [d[0], d[1]], [c[0], c[1]], [c[0], c[1] - ey[1] * s], [d[0], d[1] - ey[1] * s]);
      };
      if (L.submarine > 0.02 && E > 0) { // glow and bubbles over the seamount
        const q = proj(vx, 0, vz);
        const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], S * N * 0.12);
        g.addColorStop(0, lavaCss(0.7, 0.35 * L.submarine * Math.min(1, E))); g.addColorStop(1, lavaCss(0.4, 0));
        ctx.fillStyle = g; ctx.fillRect(q[0] - S * N * 0.12, q[1] - S * N * 0.12, S * N * 0.24, S * N * 0.24);
        for (let i = 0; i < 14; i++) { const ph = fract(t * 0.4 + hash(i, 3)); cube(vx + (hash(i, 1) - 0.5) * 3, ph * 2 - 1.5, vz + (hash(i, 2) - 0.5) * 3, 0.3, `rgba(255,255,255,${0.7 * (1 - ph) * L.submarine})`); }
      }
      if (fountainAmt > 0.02) {
        const n = Math.round(40 * fountainAmt);
        for (let i = 0; i < n; i++) {
          const life = 1.6, ph = t / life + hash(i, 7), k = Math.floor(ph), age = (ph - k) * life, r1 = hash(i, k + 1), r2 = hash(i, k + 2), r3 = hash(i, k + 3);
          const vy = (N * 0.12 + N * 0.1 * r1) * (0.6 + fountainAmt * 0.4), g = N * 0.12;
          const y = vh + vy * age - 0.5 * g * age * age * 1.2;
          if (y < vh - 1) continue;
          const x = vx + (r2 - 0.5) * 3 * age + windX(p.wind) * age * 0.6, z = vz + (r3 - 0.5) * 3 * age;
          cube(x, y, z, 0.3 + 0.3 * r1, lavaCss(1 - age / life * 0.6));
        }
        if (night > 0.1) { const q = proj(vx, vh, vz); const g = ctx.createRadialGradient(q[0], q[1], 0, q[0], q[1], S * 8); g.addColorStop(0, lavaCss(0.8, 0.45 * night * Math.min(1, fountainAmt))); g.addColorStop(1, lavaCss(0.4, 0)); ctx.fillStyle = g; ctx.fillRect(q[0] - S * 8, q[1] - S * 8, S * 16, S * 16); }
      }
      if (steamAmt > 0.02) { // Surtseyan: black tephra cubes in jets + white steam cubes billowing up
        for (let i = 0; i < 30 * Math.min(1.5, steamAmt); i++) {
          const life = 1.4, ph = t / life + hash(i, 9), k = Math.floor(ph), age = (ph - k) * life, r1 = hash(i, k + 4), r2 = hash(i, k + 5);
          const ang = (r1 - 0.5) * 1.6, sp = N * 0.18 * (0.7 + 0.5 * r2), g = N * 0.16;
          const y = vh + Math.cos(ang) * sp * age - 0.5 * g * age * age, dx = Math.sin(ang) * sp * age * 0.5;
          if (y < 0) continue;
          cube(vx + dx * Math.cos(i), y, vz + dx * Math.sin(i), 0.35, `rgba(20,16,16,${0.9 * (1 - age / life)})`);
        }
        for (let i = 0; i < 26 * Math.min(1.5, steamAmt); i++) {
          const life = 4, ph = t / life + hash(i, 11), k = Math.floor(ph), age = (ph - k) * life, a = age / life, r1 = hash(i, k + 6), r2 = hash(i, k + 7);
          const y = vh + 0.5 + age * N * 0.07, sz = 0.8 + 2.2 * a;
          cube(vx + (r1 - 0.5) * (2 + 6 * a) + windX(p.wind) * age * 0.8, y, vz + (r2 - 0.5) * (2 + 6 * a), sz, css(mix3(P.steam, [120, 125, 140], night), 0.75 * Math.sin(Math.PI * a)));
        }
      }
      // ocean-entry steam where a lava flow meets the sea
      if (fountainAmt > 0.05) {
        let n = 0;
        for (let z = 1; z < N - 1 && n < 3; z++) for (let x = 1; x < N - 1 && n < 3; x++) {
          const i = z * N + x; if (M[i] !== 5 || H[i] > 1) continue;
          if (H[i + 1] < 0 || H[i - 1] < 0 || H[i + N] < 0 || H[i - N] < 0) {
            n++;
            for (let j = 0; j < 8; j++) { const life = 3, ph = t / life + hash(j, x + z), k = Math.floor(ph), age = (ph - k) * life, a = age / life; cube(x + 0.5 + (hash(j, k) - 0.5) * 2 * a, 1 + age * N * 0.05, z + 0.5 + (hash(j, k + 1) - 0.5) * 2 * a, 0.5 + 1.2 * a, css(P.steam, 0.7 * Math.sin(Math.PI * a))); }
          }
        }
      }
      ctx.globalAlpha = 1;
    }
    return { render };
  }
};

export const scenes = [
  { id: 'voxel-classic', name: 'Blocky Island', tags: ['3d', 'retro', 'pixel', 'cartoon', 'sim'],
    desc: 'A classic blocky voxel island: grey basalt, green blocks of forest, orange lava cubes running to a blue-cube sea.',
    opts: { palette: 'classic', n: 40, angle: 0.6 }, params: { stage: 0.4, activity: 0.55, scale: 0.5, light: 0.85, x1: 0.5, x2: 0.4, x3: 0.5, x4: 0.5 } },
  { id: 'voxel-night', name: 'Night Glow', tags: ['3d', 'retro', 'night', 'lava', 'cartoon'],
    desc: 'The same blocks after dark: lava voxels glow down the flanks and light the fountain cubes above the vent.',
    opts: { palette: 'classic', n: 40, angle: 2.2 }, params: { stage: 0.38, activity: 0.7, scale: 0.5, light: 0.03, x1: 0.55, x2: 0.3, x3: 0.4, x4: 0.4 } },
  { id: 'voxel-pastel', name: 'Pastel Toy', tags: ['3d', 'cartoon', 'retro', 'calm'],
    desc: 'A toy-box island in sugared pastels, drifting through its whole life on a mint-green sea.',
    opts: { palette: 'pastel', n: 36, angle: 1.3 }, params: { stage: 0.66, activity: 0.4, scale: 0.5, light: 0.95, x1: 0.6, x2: 0.15, x3: 0.7, x4: 0.6 } },
  { id: 'voxel-mono', name: 'Monochrome', tags: ['3d', 'abstract', 'retro', 'ink'],
    desc: 'Greyscale blocks with only the lava in colour, like a sculpted model of the island on a slate sea.',
    opts: { palette: 'mono', n: 44, angle: 0.3 }, params: { stage: 0.45, activity: 0.6, scale: 0.5, light: 0.7, x1: 0.45, x2: 0.7, x3: 0.3, x4: 0.3 } },
  { id: 'voxel-chunky', name: 'Chunky Blocks', tags: ['3d', 'retro', 'cartoon', 'pixel'],
    desc: 'Big fat voxels: a twenty-block island where every cube counts.',
    opts: { palette: 'classic', n: 20, angle: 0.9 }, params: { stage: 0.3, activity: 0.6, scale: 0.6, light: 0.8, x1: 0.5, x2: 0.6, x3: 0.5, x4: 0.5 } },
  { id: 'voxel-tiny', name: 'Tiny Voxels', tags: ['3d', 'retro', 'pixel', 'realistic'],
    desc: 'Thousands of small voxels resolve valleys, cinder cones, the reef and single trees.',
    opts: { palette: 'classic', n: 56, angle: 1.8 }, params: { stage: 0.58, activity: 0.5, scale: 0.55, detail: 0.6, light: 0.85, x1: 0.5, x2: 0.2, x3: 0.6, x4: 0.5 } },
  { id: 'voxel-cutaway', name: 'Cutaway', tags: ['3d', 'diagram', 'science', 'retro'],
    desc: 'Half the island is cut away to show the stacked lava flows inside, the conduit, and the magma chamber beneath the sea floor.',
    opts: { palette: 'classic', n: 40, angle: 0.5, cutaway: true, orbit: 0 }, params: { stage: 0.42, activity: 0.6, scale: 0.5, light: 0.8, x1: 0.55, x2: 0.4, x3: 0.5, x4: 0.6 } },
];
