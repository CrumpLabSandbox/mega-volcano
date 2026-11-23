// Maps: the island from above, as cartography. One heightmap (shield with rift-zone lobes, caldera, cinder cones,
// erosion valleys, a reef ring that keeps the shoreline of the volcano's prime, a lagoon, islets) rendered at a modest
// grid and upscaled, in eight styles: contour, nautical chart, hillshade, satellite, thermal, geologic, vintage, radar.
import { clamp, lerp, smooth, fract, hash, noise2, fbm2, buffer, eruptAmount, daylight, life } from '../util.js';
import { lifeHeight } from '../life.js';

const TAU = Math.PI * 2;
const FONT = '"Avenir Next","Helvetica Neue",Helvetica,Arial,system-ui,sans-serif';
const SERIF = '"Iowan Old Style","Palatino Linotype",Palatino,Georgia,serif';
const MONO = 'Menlo,Consolas,"DejaVu Sans Mono",monospace';

// static fields for one island shape (recomputed when the seed, size or grid changes)
function fields(GW, GH, seed, size, rift) {
  const n = GW * GH, asp = GW / GH;
  const F = { lobe: new Float32Array(n), valley: new Float32Array(n), tex: new Float32Array(n), patch: new Float32Array(n), warp: new Float32Array(n), cone: new Float32Array(n), d: new Float32Array(n), z60: new Float32Array(n) };
  const thr = seed * TAU, thr2 = seed * 9.1;
  const cones = []; for (let k = 0; k < 5; k++) cones.push([0.3 + 0.45 * hash(k + 1, seed), hash(k + 11, seed) * TAU]);
  const R = 0.3 * lerp(0.5, 1.5, size);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const i = y * GW + x, u = (x / GW - 0.5) * asp, v = y / GH - 0.5;
    const th = Math.atan2(v, u), d = Math.hypot(u, v);
    F.d[i] = d;
    F.lobe[i] = Math.pow(Math.max(0, Math.cos(2 * (th - thr))), 3) + 0.6 * Math.pow(Math.max(0, Math.cos(th - thr2)), 6);
    const rv = 0.5 + 0.5 * Math.sin(th * 9 + 4 * fbm2(u * 3 + seed * 20, v * 3, 3));
    F.valley[i] = Math.pow(smooth(0.5, 1, rv), 1.5);
    F.tex[i] = fbm2(x * 0.12 + seed * 50, y * 0.12, 4);
    F.patch[i] = fbm2(u * 6 + seed * 70, v * 6 + 3, 3);
    F.warp[i] = (fbm2(u * 2.2 + seed * 30, v * 2.2 + 9, 3) - 0.5) * 2;
    let c = 0; for (const [cr, ca] of cones) { const cx = Math.cos(ca) * cr * R, cy = Math.sin(ca) * cr * R; c += Math.exp(-((u - cx) ** 2 + (v - cy) ** 2) / (2 * (0.045 * R) ** 2)); }
    F.cone[i] = Math.min(1, c);
  }
  // the island in its prime (stage 0.6): where its shore was, the reef will sit
  const L60 = life(0.6), H60 = lifeHeight(0.6), Rg = growRadius(R, 0.6);
  for (let i = 0; i < n; i++) F.z60[i] = heightAt(F, i, Rg, H60, L60, rift, 0.6, 0);
  F.R = R;
  return F;
}
function growRadius(R, s) { return R * (0.45 + 0.55 * smooth(-1, 1, lifeHeight(Math.min(s, 0.5)))); }
// terrain height at cell i: -1 deep sea floor, 0 sea level, ~1 summit (before the reef is added)
function heightAt(F, i, Rg, H, L, rift, s, z60) {
  const r = F.d[i] * (1 + 0.12 * F.warp[i]) / (1 + rift * F.lobe[i]) / Rg;
  let shape = r < 1 ? Math.pow(1 - r * r, 1.25) : 0;
  shape *= 1 + 0.08 * (F.tex[i] - 0.5);
  let z = -0.97 + (H + 0.97) * shape + 0.006 * (F.tex[i] - 0.5);
  if (L.caldera > 0) z -= L.caldera * 0.22 * (1 - smooth(0.1, 0.2, r)) * (shape > 0 ? 1 : 0);
  const post = smooth(0.5, 0.62, s);
  if (post > 0) z += post * 0.08 * F.cone[i] * (shape > 0.2 ? 1 : 0);
  if (L.erosion > 0) z -= L.erosion * F.valley[i] * Math.max(0, z + 0.06) * 0.6;
  return z;
}

const STYLE_DEFAULTS = { contour: {}, nautical: {}, relief: {}, satellite: {}, thermal: {}, geologic: {}, vintage: {}, radar: {} };

export default {
  id: 'map',
  name: 'Maps',
  kind: '2d',
  sky: false,
  params: [
    { id: 'x1', label: 'Contour spacing', value: 0.5, tip: 'Interval between contour lines' },
    { id: 'x2', label: 'Labels', value: 0.8, tip: 'Place names, legend and marginalia' },
    { id: 'x3', label: 'Rift zones', value: 0.5, tip: 'How strongly rift zones stretch the island into lobes' },
    { id: 'x4', label: 'Sea level', value: 0.5, tip: 'Raise or lower the sea: drown the island or expose the reef flat' },
  ],
  create(ctx, opts) {
    const style = opts.style || 'contour';
    let GW = 0, GH = 0, F = null, key = '', img = null, buf = null, z = null, age = null;
    return {
      render(f) {
        const { ctx, w, h, t } = f, p = f.p, L = f.life, s = f.stage;
        const dl = daylight(p.light), day = dl.day, night = dl.night;
        const gw = Math.round(lerp(150, 330, p.detail)), gh = Math.round(gw * h / w);
        const seed = fract(0.37 + f.epoch * 0.618), rift = lerp(0, 1.3, p.x3);
        const k = `${gw}|${gh}|${seed.toFixed(4)}|${(Math.round(p.scale * 20) / 20)}|${(Math.round(rift * 10) / 10)}`;
        if (k !== key) {
          key = k; GW = gw; GH = gh;
          F = fields(GW, GH, seed, Math.round(p.scale * 20) / 20, Math.round(rift * 10) / 10);
          buf = buffer(GW, GH); img = buf.ctx.createImageData(GW, GH); z = new Float32Array(GW * GH); age = new Float32Array(GW * GH);
        }
        const n = GW * GH, H = lifeHeight(s), Rg = growRadius(F.R, s), seaLv = lerp(-0.12, 0.12, p.x4);
        const erupt = eruptAmount(f);
        // ---- heights (relative to the current sea level) and surface age
        for (let i = 0; i < n; i++) {
          let zz = heightAt(F, i, Rg, H, L, rift, s, 0);
          // reef: coral on the old shoreline grows up to just below sea level; lagoon fills; islets on the ring
          const z60 = F.z60[i], ring = Math.exp(-(((z60 + 0.05) / 0.07) ** 2));
          if (L.reef > 0.01) {
            const top = -0.012 + 0.05 * L.lagoon * smooth(0.55, 0.8, F.tex[i]);
            zz = Math.max(zz, lerp(zz, top, L.reef * ring));
            if (z60 > -0.04 && zz < -0.1) zz = lerp(zz, -0.1 - 0.05 * F.tex[i], L.lagoon * 0.9);
          }
          z[i] = zz - seaLv;
          // surface age: how long ago this patch of lava was emplaced (model stage units)
          const r = F.d[i] / Rg, shape = r < 1 ? 1 - r * r : 0;
          const emplaced = 0.2 + 0.32 * (0.4 * (1 - shape) + 0.6 * F.patch[i]) * (1 - 0.7 * F.lobe[i] * rift * 0.4);
          const a = s - emplaced;
          age[i] = a >= 0 ? a : s - 0.2;
        }
        // ---- colour pass
        const D = img.data, levels = lerp(28, 8, p.x1);
        const lx = -0.6, ly = -0.8, lz = 0.6;   // light from the north-west
        const glow = erupt * (1 - L.submarine) * (0.6 + 0.4 * night), hotR = 0.012 + 0.03 * clamp(erupt);
        const fs = Math.max(9, h * 0.024);
        const sweep = fract(t * 0.25);
        for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
          const i = y * GW + x, zz = z[i];
          const xr = x + 1 < GW ? z[i + 1] : zz, yd = y + 1 < GH ? z[i + GW] : zz;
          const dx = (xr - zz) * GW * 0.08, dy = (yd - zz) * GH * 0.08;
          const nl = 1 / Math.sqrt(dx * dx + dy * dy + 1);
          const shade = clamp((-dx * lx - dy * ly + lz) * nl / Math.sqrt(lx * lx + ly * ly + lz * lz) * 1.3, 0, 1);
          const land = zz > 0, lv = Math.floor(zz * levels), contour = land ? (Math.floor(xr * levels) !== lv || Math.floor(yd * levels) !== lv) : zz > -0.75 && (Math.floor(xr * levels * 0.5) !== Math.floor(zz * levels * 0.5) || Math.floor(yd * levels * 0.5) !== Math.floor(zz * levels * 0.5));
          const coast = (xr > 0) !== land || (yd > 0) !== land;
          const a = age[i], onLand = zz > -0.01 ? 1 : 0, fresh = smooth(0.05, 0, a) * onLand, hot = smooth(0.012, 0, a) * glow * onLand, veg = L.veg * smooth(0.04, 0.3, a) * (zz > 0 ? 1 : 0) * (1 - smooth(0.55, 0.8, zz));
          const reefy = zz < 0 && zz > -0.06 && F.z60[i] < 0.02 && L.reef > 0.1 ? L.reef : 0, sand = L.reef > 0.3 && F.z60[i] < 0.02 && zz > 0 && zz < 0.05;
          const shallow = smooth(-0.35, 0, zz);
          let R, G, B;
          if (style === 'contour') {
            if (land) { const e = clamp(zz / 1.1); const c = e < 0.35 ? [lerp(120, 200, e / 0.35), lerp(170, 205, e / 0.35), lerp(80, 110, e / 0.35)] : e < 0.7 ? [lerp(200, 160, (e - 0.35) / 0.35), lerp(205, 110, (e - 0.35) / 0.35), lerp(110, 70, (e - 0.35) / 0.35)] : [lerp(160, 245, (e - 0.7) / 0.3), lerp(110, 245, (e - 0.7) / 0.3), lerp(70, 245, (e - 0.7) / 0.3)]; const sh = 0.75 + 0.5 * shade; R = c[0] * sh; G = c[1] * sh; B = c[2] * sh; if (contour) { R *= 0.6; G *= 0.6; B *= 0.6; } }
            else { const dp = clamp(-zz); R = lerp(190, 40, dp ** 0.6); G = lerp(225, 90, dp ** 0.6); B = lerp(240, 160, dp ** 0.6); if (reefy) { R = 150; G = 230; B = 215; } if (contour) { R *= 0.85; G *= 0.9; B *= 0.95; } }
            if (coast) { R = 20; G = 40; B = 80; }
          } else if (style === 'nautical') {
            if (land) { R = 236; G = 214; B = 150; const sh = 0.85 + 0.3 * shade; R *= sh; G *= sh; B *= sh; if (contour) { R *= 0.8; G *= 0.78; B *= 0.7; } }
            else { const sh1 = smooth(-0.1, 0, zz), sh2 = smooth(-0.3, -0.1, zz); R = lerp(248, lerp(205, 160, sh1), 0.25 + 0.75 * sh2); G = lerp(246, lerp(228, 205, sh1), 0.25 + 0.75 * sh2); B = lerp(238, lerp(240, 230, sh1), 0.25 + 0.75 * sh2); if (reefy) { const hatch = ((x + y) & 3) === 0; R = hatch ? 120 : 175; G = hatch ? 170 : 215; B = hatch ? 150 : 195; } if (contour) { R = 110; G = 150; B = 200; } }
            if (coast) { R = 40; G = 40; B = 50; }
          } else if (style === 'relief') {
            if (land) { const g = 60 + 180 * shade; R = g * 1.02; G = g; B = g * 0.95; if (hot > 0.01) { R = lerp(R, 255, hot); G = lerp(G, 140, hot); B = lerp(B, 40, hot); } }
            else { const g = 50 + 60 * shallow + 40 * shade * shallow; R = g * 0.9; G = g * 0.95; B = g * 1.1 + 10; if (reefy) { R = 120; G = 170; B = 170; } }
            if (coast) { R = 250; G = 250; B = 250; }
          } else if (style === 'satellite') {
            if (land) {
              const rockT = smooth(0.01, 0.2, a);
              R = lerp(14, 118, rockT); G = lerp(12, 100, rockT); B = lerp(12, 82, rockT);   // black fresh basalt → brown-grey
              R = lerp(R, 52, veg); G = lerp(G, 125, veg); B = lerp(B, 42, veg);
              const vy = F.valley[i] * L.erosion; R = lerp(R, 25, vy * 0.6); G = lerp(G, 75, vy * 0.6); B = lerp(B, 30, vy * 0.6);
              const high = smooth(0.6, 0.95, zz); R = lerp(R, 130, high); G = lerp(G, 110, high); B = lerp(B, 90, high);
              const sh = 0.55 + 0.7 * shade; R *= sh; G *= sh; B *= sh;
              if (hot > 0.01) { R = lerp(R, 255, hot); G = lerp(G, 120, hot); B = lerp(B, 30, hot); }
              if (L.caldera > 0.1 && F.d[i] < Rg * 0.16) { const cz = 0.5 + 0.5 * F.tex[i]; R *= cz; G *= cz; B *= cz; }
            } else {
              R = lerp(8, 60, shallow); G = lerp(30, 150, shallow); B = lerp(70, 170, shallow);
              if (reefy) { R = lerp(R, 170, reefy * 0.9); G = lerp(G, 235, reefy * 0.9); B = lerp(B, 225, reefy * 0.9); }
              if (zz > -0.06 && F.tex[i] > 0.6) { R += 25; G += 25; B += 20; }
              if (L.submarine > 0.3 && F.d[i] < Rg * 0.25 && s < 0.2) { const k2 = L.submarine * 0.5; R = lerp(R, 150, k2); G = lerp(G, 200, k2); B = lerp(B, 190, k2); }
            }
            if (coast && land === false && zz > -0.03) { R = lerp(R, 240, 0.8); G = lerp(G, 245, 0.8); B = lerp(B, 250, 0.8); }
            const dk = 0.35 + 0.65 * day; R *= dk; G *= dk; B *= dk;
            if (hot > 0.01 && night > 0.3) { R = lerp(R, 255, hot * night); G = lerp(G, 120, hot * night); B = lerp(B, 30, hot * night); }
          } else if (style === 'thermal') {
            // land warms in the sun (by light), cools with height; fresh lava is hot; sea is cold and even
            let temp = land ? 0.35 + 0.25 * day * shade - 0.2 * clamp(zz) : 0.18 + 0.05 * shallow;
            temp += fresh * 0.25 + hot * 0.6;
            if (reefy) temp += 0.05;
            const c = ironbow(clamp(temp)); R = c[0]; G = c[1]; B = c[2];
            if (contour && land) { R *= 0.92; G *= 0.92; B *= 0.92; }
          } else if (style === 'geologic') {
            if (land) {
              const band = Math.min(5, Math.floor(clamp(a / 0.5) * 6));
              const c = [[40, 40, 40], [200, 60, 50], [240, 140, 50], [240, 210, 80], [150, 190, 90], [130, 170, 200]][band];
              R = c[0]; G = c[1]; B = c[2];
              if (F.cone[i] > 0.3 && smooth(0.5, 0.62, s) > 0.5) { R = 160; G = 80; B = 150; }
              if (L.caldera > 0.1 && F.d[i] < Rg * 0.16) { R = 110; G = 90; B = 100; }
              if (contour) { R *= 0.85; G *= 0.85; B *= 0.85; }
              if (hot > 0.01) { R = lerp(R, 255, hot); G = lerp(G, 80, hot); B = lerp(B, 30, hot); }
            } else { R = 235; G = 240; B = 246; if (reefy) { R = 245; G = 190; B = 200; } if (contour) { R = 190; G = 205; B = 225; } }
            if (coast) { R = 30; G = 30; B = 30; }
          } else if (style === 'vintage') {
            const hatch = (x * 3 + y * 5 + ((F.tex[i] * 7) | 0)) % 7 === 0;
            if (land) { const inkk = (1 - shade) * 0.9 * (hatch ? 1 : 0.35); R = lerp(232, 70, inkk); G = lerp(215, 45, inkk); B = lerp(170, 25, inkk); if (contour && (lv % 2 === 0)) { R *= 0.8; G *= 0.78; B *= 0.7; } }
            else { const near = smooth(-0.25, 0, zz); const lines = ((Math.floor(zz * 60) & 1) === 0) && near > 0.2; R = lerp(228, 170, lines ? 0.5 * near : 0); G = lerp(214, 150, lines ? 0.5 * near : 0); B = lerp(180, 120, lines ? 0.5 * near : 0); if (reefy) { R = 215; G = 200; B = 150; } }
            if (coast) { R = 60; G = 40; B = 20; }
            const vig = 1 - 0.25 * ((x / GW - 0.5) ** 2 + (y / GH - 0.5) ** 2) * 2; R *= vig; G *= vig; B *= vig;
          } else {
            // radar: a green scope. Slopes facing the antenna (centre-left) return brightly; the sea is noise
            const bx = x / GW - 0.08, by = y / GH - 0.5, an = Math.atan2(by, bx) / TAU + 0.5;
            const dirx = bx, diry = by, len = Math.hypot(dirx, diry) + 1e-4, facing = clamp(-(dx * dirx + dy * diry) / len * 2 + 0.3);
            let g = land ? 0.35 + 0.65 * facing : 0.06 + 0.1 * F.tex[i] * shallow;
            if (reefy) g += 0.2;
            if (contour && land) g *= 0.8;
            const ring = Math.abs(fract(len * 4) - 0.5) < 0.02 ? 0.15 : 0;
            const sw = fract(an - sweep), trail = Math.exp(-sw * 8) * 0.6;
            g = g * (0.6 + 0.6 * trail) + ring + (sw < 0.004 ? 0.5 : 0);
            if (hot > 0.01) g += hot;
            R = 20 * g; G = 60 + 190 * clamp(g); B = 30 + 40 * clamp(g); R += 10;
          }
          if (sand && style !== 'radar' && style !== 'thermal') { R = 238; G = 226; B = 190; if (style === 'satellite') { const dk = 0.35 + 0.65 * day; R *= dk; G *= dk; B *= dk; } }
          const o = i * 4; D[o] = R; D[o + 1] = G; D[o + 2] = B; D[o + 3] = 255;
        }
        buf.ctx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = style !== 'radar';
        ctx.drawImage(buf.canvas, 0, 0, GW, GH, 0, 0, w, h);
        // ---- marginalia and labels
        const ink = style === 'radar' ? '#9fffb0' : style === 'relief' || (style === 'satellite' && night > 0.5) ? '#f0f0f0' : style === 'thermal' ? '#ffffff' : style === 'vintage' ? '#3a2a14' : '#1b1b1b';
        const bg = style === 'radar' ? 'rgba(0,20,10,0.7)' : style === 'relief' || style === 'thermal' || (style === 'satellite' && night > 0.5) ? 'rgba(0,0,0,0.55)' : style === 'vintage' ? 'rgba(236,222,180,0.85)' : 'rgba(255,255,255,0.85)';
        const font = style === 'vintage' || style === 'nautical' ? SERIF : style === 'radar' ? MONO : FONT;
        const label = (x, y, text, size, align = 'left', weight = 500, italic = false) => {
          ctx.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`;
          const tw = ctx.measureText(text).width, pad = size * 0.4;
          const x0 = align === 'right' ? x - tw - pad * 2 : align === 'center' ? x - tw / 2 - pad : x;
          ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x0, y - size * 0.7, tw + pad * 2, size * 1.4, size * 0.25); ctx.fill();
          ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, x0 + pad, y);
        };
        const titles = { contour: 'Topographic map', nautical: 'Nautical chart', relief: 'Shaded relief', satellite: 'Satellite, true colour', thermal: 'Thermal infrared', geologic: 'Geologic map: lava flows by age', vintage: 'Chart of a volcanic isle', radar: 'Radar scope' };
        label(fs * 0.6, fs * 1.3, titles[style], fs * 1.05, 'left', 600);
        label(fs * 0.6, fs * 2.9, `${L.index + 1}. ${L.name}`, fs * 0.85, 'left', 500);
        if (p.x2 > 0.15) {
          // feature labels at the summit, reef and lagoon
          const cx = w / 2, cy = h / 2, Rpx = Rg * h;
          const summitM = Math.round(Math.max(0, H - seaLv) * 4200 / 10) * 10;
          if (H - seaLv > 0.02) label(cx + fs * 0.8, cy - fs * 0.2, L.caldera > 0.3 ? `caldera · ${summitM} m` : `summit · ${summitM} m`, fs * 0.85, 'left', 500, style === 'vintage');
          else if (s < 0.2) label(cx + fs * 0.8, cy, `seamount · ${Math.round(-(H - seaLv) * 4200 / 10) * 10} m below`, fs * 0.85, 'left');
          if (L.reef > 0.3) label(cx + Rpx * 1.05, cy - Rpx * 0.6, L.lagoon > 0.85 ? 'atoll: reef and islets' : L.lagoon > 0.25 ? 'barrier reef' : 'fringing reef', fs * 0.85, 'left', 500, style === 'vintage');
          if (L.lagoon > 0.3 && H - seaLv < 0.3) label(cx - Rpx * 0.4, cy + Rpx * 0.45, 'lagoon', fs * 0.85, 'center', 500, true);
          if (L.erupt > 0.5 && L.submarine < 0.5 && s < 0.5) label(cx - fs * 0.8, cy + fs * 1.4, 'active vent and fresh flows', fs * 0.85, 'right');
          if (rift > 0.3 && s > 0.25 && s < 0.6) label(cx + Math.cos(seed * TAU) * Rpx * 0.75, cy + Math.sin(seed * TAU) * Rpx * 0.75, 'rift zone', fs * 0.8, 'center', 500, true);
          if (p.x2 > 0.5) {
            // scale bar, north arrow
            const sx = w * 0.04, sy = h * 0.93, sw = w * 0.15;
            ctx.fillStyle = ink; ctx.fillRect(sx, sy, sw, h * 0.008); ctx.fillStyle = bg; ctx.fillRect(sx + sw / 2, sy, sw / 2, h * 0.008); ctx.strokeStyle = ink; ctx.lineWidth = 1; ctx.strokeRect(sx, sy, sw, h * 0.008);
            ctx.fillStyle = ink; ctx.font = `500 ${fs * 0.75}px ${MONO}`; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText('0        20 km', sx, sy - 2);
            const nx = w * 0.95, ny = h * 0.12; ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = Math.max(1, h * 0.003);
            ctx.beginPath(); ctx.moveTo(nx, ny + h * 0.07); ctx.lineTo(nx, ny); ctx.stroke(); ctx.beginPath(); ctx.moveTo(nx, ny - h * 0.015); ctx.lineTo(nx - h * 0.012, ny + h * 0.012); ctx.lineTo(nx + h * 0.012, ny + h * 0.012); ctx.fill();
            ctx.font = `600 ${fs}px ${font}`; ctx.textAlign = 'center'; ctx.fillText('N', nx, ny - h * 0.02);
          }
          if (style === 'nautical') {
            // soundings in metres on a loose grid, only over water
            ctx.font = `italic 500 ${fs * 0.7}px ${SERIF}`; ctx.fillStyle = '#2a3a6a'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            for (let gy = 1; gy < 9; gy++) for (let gx = 1; gx < 16; gx++) {
              if (hash(gx, gy) > 0.5) continue;
              const px = (gx + 0.3 * hash(gx, gy + 7)) / 16, py = (gy + 0.3 * hash(gx + 3, gy)) / 9;
              const zi = z[Math.min(GH - 1, (py * GH) | 0) * GW + Math.min(GW - 1, (px * GW) | 0)];
              if (zi < 0) ctx.fillText(Math.round(-zi * 4200 / (zi > -0.1 ? 1 : 10)) * (zi > -0.1 ? 1 : 10), px * w, py * h);
            }
            ctx.font = `500 ${fs * 0.75}px ${SERIF}`; ctx.fillStyle = ink; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
            ctx.fillText('SOUNDINGS IN METRES · DEPTHS AT LOWEST ASTRONOMICAL TIDE', w * 0.98, h * 0.98);
          }
          if (style === 'geologic' && p.x2 > 0.4) {
            const items = [['#282828', 'fresh flows'], ['#c83c32', 'young flows'], ['#f08c32', ''], ['#f0d250', 'older flows'], ['#96be5a', ''], ['#82aac8', 'oldest shield'], ['#a05096', 'cinder cones'], ['#f5bec8', 'reef limestone']];
            const lx0 = w * 0.78, ly0 = h * 0.58; ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(lx0 - fs * 0.5, ly0 - fs * 0.8, w * 0.21, items.length * fs * 1.15 + fs * 0.8, fs * 0.3); ctx.fill();
            ctx.font = `500 ${fs * 0.75}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            items.forEach(([c, nm], i) => { const yy = ly0 + i * fs * 1.15; ctx.fillStyle = c; ctx.fillRect(lx0, yy - fs * 0.35, fs * 1.4, fs * 0.7); ctx.fillStyle = ink; ctx.fillText(nm, lx0 + fs * 1.9, yy); });
          }
          if (style === 'vintage') {
            // compass rose and a cartouche
            const rx = w * 0.88, ry = h * 0.78, rr = h * 0.09;
            ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.lineWidth = 1;
            for (let k2 = 0; k2 < 16; k2++) { const a1 = k2 / 16 * TAU, len = k2 % 4 === 0 ? rr : k2 % 2 === 0 ? rr * 0.65 : rr * 0.4; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + Math.cos(a1) * len, ry + Math.sin(a1) * len); ctx.stroke(); }
            ctx.beginPath(); ctx.arc(rx, ry, rr * 0.3, 0, TAU); ctx.stroke();
            ctx.font = `italic 600 ${fs * 1.3}px ${SERIF}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('A New and Accurate Chart', w * 0.5, h * 0.1);
            ctx.font = `italic 500 ${fs * 0.85}px ${SERIF}`; ctx.fillText(L.lagoon > 0.5 ? 'of a Coral Atoll, with its Lagoon and Reefs' : L.erupt > 0.5 ? 'of a Burning Isle lately risen from the Sea' : 'of a Volcanick Isle, with its Soundings', w * 0.5, h * 0.155);
          }
          if (style === 'radar') {
            ctx.font = `500 ${fs * 0.8}px ${MONO}`; ctx.fillStyle = ink; ctx.textAlign = 'right'; ctx.textBaseline = 'top';
            ctx.fillText(`RNG 40 NM   BRG ${((sweep * 360) | 0).toString().padStart(3, '0')}°`, w * 0.98, h * 0.03);
            ctx.fillText(`19°${(28 + s * 3) | 0}'N 155°${(35 - s * 5) | 0}'W`, w * 0.98, h * 0.03 + fs * 1.2);
          }
          if (style === 'thermal') {
            const bx = w * 0.84, by0 = h * 0.3, bh = h * 0.45, bw = w * 0.025;
            for (let k2 = 0; k2 < 40; k2++) { const c = ironbow(1 - k2 / 39); ctx.fillStyle = `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; ctx.fillRect(bx, by0 + k2 / 40 * bh, bw, bh / 40 + 1); }
            ctx.font = `500 ${fs * 0.75}px ${MONO}`; ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText('> 500 °C', bx + bw + 4, by0); ctx.fillText('30 °C', bx + bw + 4, by0 + bh * 0.6); ctx.fillText('20 °C', bx + bw + 4, by0 + bh);
          }
        }
      },
    };
  },
};

// the classic thermal-camera palette: black → purple → red → orange → yellow → white
function ironbow(t) {
  const stops = [[0, 0, 0], [40, 0, 90], [140, 0, 140], [220, 50, 60], [255, 140, 20], [255, 220, 60], [255, 255, 240]];
  const x = clamp(t) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), u = x - i;
  return [lerp(stops[i][0], stops[i + 1][0], u), lerp(stops[i][1], stops[i + 1][1], u), lerp(stops[i][2], stops[i + 1][2], u)];
}

export const scenes = [
  { id: 'map-contour', name: 'Contour Map', tags: ['map', 'diagram', '2d', 'science'],
    desc: 'Hypsometric tints and contour lines: the island grows from a sounding on the sea floor into a shield with rift lobes, then shrinks inside its reef.',
    opts: { style: 'contour' }, params: { stage: 0.42, grow: 0.5, activity: 0.5, scale: 0.5, detail: 0.6, light: 0.9, x1: 0.5, x2: 0.8, x3: 0.5, x4: 0.5 } },
  { id: 'map-nautical', name: 'Nautical Chart', tags: ['map', 'paper', '2d', 'text'],
    desc: 'A sea chart with soundings in metres, depth contours and reef hatching; the shallow shelf around the island shows where the coral will grow.',
    opts: { style: 'nautical' }, params: { stage: 0.7, grow: 0.5, activity: 0.5, scale: 0.5, detail: 0.6, light: 0.9, x1: 0.4, x2: 0.9, x3: 0.5, x4: 0.5 } },
  { id: 'map-relief', name: 'Shaded Relief', tags: ['map', '2d', 'science'],
    desc: 'Hillshade from the north-west: rift ridges, the caldera, radial valleys and sea cliffs stand out as the shield erodes.',
    opts: { style: 'relief' }, params: { stage: 0.66, grow: 0.5, activity: 0.5, scale: 0.55, detail: 0.7, light: 0.8, x1: 0.5, x2: 0.5, x3: 0.6, x4: 0.5 } },
  { id: 'map-satellite', name: 'Satellite View', tags: ['map', 'realistic', '2d', 'hawaii'],
    desc: 'True colour from orbit: black new lava on the rift zones, green valleys, white surf on the coast and turquoise reef over the shallows.',
    opts: { style: 'satellite' }, params: { stage: 0.45, grow: 0.5, activity: 0.6, scale: 0.5, detail: 0.7, light: 0.9, x1: 0.5, x2: 0.4, x3: 0.6, x4: 0.5 } },
  { id: 'map-thermal', name: 'Thermal Infrared', tags: ['map', 'science', '2d', 'lava', 'eruption'],
    desc: 'A thermal camera from above: the sea is cold and even, sunlit slopes are warm, and active flows blaze white along the rift.',
    opts: { style: 'thermal' }, params: { stage: 0.36, grow: 0.5, activity: 0.7, scale: 0.5, detail: 0.6, light: 0.8, x1: 0.5, x2: 0.7, x3: 0.6, x4: 0.5 } },
  { id: 'map-geologic', name: 'Geologic Map', tags: ['map', 'science', 'diagram', '2d'],
    desc: 'Lava flows coloured by age, youngest black, oldest blue, with cinder cones, the caldera and reef limestone as separate units.',
    opts: { style: 'geologic' }, params: { stage: 0.58, grow: 0.5, activity: 0.5, scale: 0.5, detail: 0.6, light: 0.9, x1: 0.45, x2: 0.9, x3: 0.5, x4: 0.5 } },
  { id: 'map-vintage', name: "Explorer's Chart", tags: ['map', 'paper', 'art', 'text', '2d'],
    desc: 'A hand-drawn chart of a volcanic isle in sepia ink, with hachured hills, coastal shading lines and a compass rose.',
    opts: { style: 'vintage' }, params: { stage: 0.68, grow: 0.5, activity: 0.5, scale: 0.5, detail: 0.6, light: 0.9, x1: 0.5, x2: 0.9, x3: 0.5, x4: 0.5 } },
  { id: 'map-radar', name: 'Radar Scope', tags: ['map', 'retro', 'neon', 'night', '2d'],
    desc: 'A ship\'s radar: slopes facing the beam return bright green, a sweep trails round the scope, and fresh lava flares.',
    opts: { style: 'radar' }, params: { stage: 0.4, grow: 0.5, activity: 0.6, scale: 0.5, detail: 0.6, light: 0.3, x1: 0.5, x2: 0.7, x3: 0.5, x4: 0.5 } },
];
