// Lava Flow Sim: a real cellular-automaton lava simulation on a heightmap grid. The base terrain (sea floor + the
// island the life model says should exist at this Stage) follows the Stage slider instantly; on top of it the sim
// erupts lava at the summit vent and rift fissures at a rate from eruptAmount(f), lets it run downhill by height
// difference, cools it (viscosity rising as it cools, crust forming, then solidifying into new rock that raises the
// terrain), quenches it in the sea with steam, and lets erosion and subsidence from life() wear the deposits down.
import { clamp, lerp, smooth, fract, hash, fbm2, buffer, eruptAmount, daylight, lavaRGB, windX } from '../util.js';
import { lifeHeight } from '../life.js';

const TAU = Math.PI * 2;
const FONT = '"Avenir Next","Helvetica Neue",Helvetica,Arial,system-ui,sans-serif';
const MONO = 'Menlo,Consolas,"DejaVu Sans Mono",monospace';

function ironbow(t) {
  const st = [[0, 0, 0], [40, 0, 90], [140, 0, 140], [220, 50, 60], [255, 140, 20], [255, 220, 60], [255, 255, 240]];
  const x = clamp(t) * 6, i = Math.min(5, Math.floor(x)), u = x - i;
  return [lerp(st[i][0], st[i + 1][0], u), lerp(st[i][1], st[i + 1][1], u), lerp(st[i][2], st[i + 1][2], u)];
}

export default {
  id: 'lavaflow',
  name: 'Lava Flow Sim',
  kind: '2d',
  sky: false,
  params: [
    { id: 'x1', label: 'Eruption rate', value: 0.5, tip: 'How much lava the vents put out' },
    { id: 'x2', label: 'Viscosity', value: 0.4, tip: 'Runny pāhoehoe sheets at the bottom, thick ʻaʻā lobes at the top' },
    { id: 'x3', label: 'Cooling', value: 0.5, tip: 'How fast flows crust over and freeze' },
    { id: 'x4', label: 'Vents', value: 0.4, tip: 'How many rift-zone vents open besides the summit' },
  ],
  create(ctx, opts) {
    const style = opts.style || 'natural', speedMul = opts.speed || 1, fissure = !!opts.fissure;
    let GW = 0, GH = 0, n = 0, key = '';
    let F = null;                   // static fields: distance, angle lobes, texture, valleys, z60
    let Tb, Ta, Lv, Hq, Age, dL, dH, S;   // base rock, added rock, lava, heat, surface age, scratch
    let img = null, buf = null, builtStage = -1, builtEpoch = -1, simT = 0, clicks = [];
    const steam = [];
    let seedCache = -1, cx = 0, cy = 0, thr = 0, R = 0;

    function setup(f) {
      const gw = Math.round(lerp(120, 250, f.p.detail)), gh = Math.max(16, Math.round(gw * f.h / f.w));
      const seed = fract(0.37 + f.epoch * 0.618), size = Math.round(f.p.scale * 20) / 20;
      const k = `${gw}|${gh}|${seed.toFixed(4)}|${size}`;
      if (k === key) return false;
      key = k; GW = gw; GH = gh; n = GW * GH;
      Tb = new Float32Array(n); Ta = new Float32Array(n); Lv = new Float32Array(n); Hq = new Float32Array(n); Age = new Float32Array(n); dL = new Float32Array(n); dH = new Float32Array(n); S = new Float32Array(n);
      F = { d: new Float32Array(n), lobe: new Float32Array(n), tex: new Float32Array(n), valley: new Float32Array(n), warp: new Float32Array(n), z60: new Float32Array(n) };
      const asp = GW / GH; thr = seed * TAU; R = 0.4 * lerp(0.5, 1.5, size); cx = GW / 2; cy = GH / 2;
      for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
        const i = y * GW + x, u = (x / GW - 0.5) * asp, v = y / GH - 0.5, th = Math.atan2(v, u);
        F.d[i] = Math.hypot(u, v);
        F.lobe[i] = Math.pow(Math.max(0, Math.cos(2 * (th - thr))), 3) + 0.5 * Math.pow(Math.max(0, Math.cos(th - seed * 9.1)), 6);
        F.tex[i] = fbm2(x * 0.15 + seed * 50, y * 0.15, 3);
        F.valley[i] = Math.pow(smooth(0.5, 1, 0.5 + 0.5 * Math.sin(th * 9 + 4 * fbm2(u * 3 + seed * 20, v * 3, 3))), 1.5);
        F.warp[i] = (fbm2(u * 2.2 + seed * 30, v * 2.2 + 9, 3) - 0.5) * 2;
      }
      for (let i = 0; i < n; i++) F.z60[i] = baseAt(i, 0.6, lifeHeight(0.6), { caldera: 0, erosion: 0, reef: 0, lagoon: 0 }, true);
      buf = buffer(GW, GH); img = buf.ctx.createImageData(GW, GH);
      builtStage = -1;
      return true;
    }
    // the island the life model prescribes at stage s (no reef when raw)
    function baseAt(i, s, H, L, raw) {
      const Rg = R * (0.45 + 0.55 * smooth(-1, 1, lifeHeight(Math.min(s, 0.5))));
      const r = F.d[i] * (1 + 0.12 * F.warp[i]) / (1 + 0.8 * F.lobe[i]) / Rg;
      let shape = r < 1 ? Math.pow(1 - r * r, 1.25) : 0;
      shape *= 1 + 0.08 * (F.tex[i] - 0.5);
      let z = -0.97 + (H + 0.97) * shape + 0.004 * (F.tex[i] - 0.5);
      if (L.caldera > 0) z -= L.caldera * 0.2 * (1 - smooth(0.1, 0.2, r)) * (shape > 0 ? 1 : 0);
      if (L.erosion > 0) z -= L.erosion * F.valley[i] * Math.max(0, z + 0.06) * 0.6;
      if (!raw && L.reef > 0.01) {
        const ring = Math.exp(-(((F.z60[i] + 0.05) / 0.09) ** 2));
        z = Math.max(z, lerp(z, -0.012 + 0.04 * L.lagoon * smooth(0.6, 0.85, F.tex[i]), L.reef * ring));
        if (F.z60[i] > -0.04 && z < -0.1) z = lerp(z, -0.1 - 0.05 * F.tex[i], L.lagoon * 0.9);
      }
      return z;
    }
    function rebuild(f) {
      Ta.fill(0); Lv.fill(0); Hq.fill(0); Age.fill(1000); steam.length = 0;
      builtStage = f.stage; builtEpoch = f.epoch;
      // warm up so the first frame already has flows on the slopes
      for (let k = 0; k < 90; k++) step(f, 0.12, k * 0.12, true);
    }
    function vents(f, tSim) {
      const L = f.life, p = f.p, out = [];
      const Rg = R * (0.45 + 0.55 * smooth(-1, 1, lifeHeight(Math.min(f.stage, 0.5)))) * GH;
      out.push([cx, cy, 1]);
      const nv = fissure ? 7 : Math.round(lerp(0, 5, p.x4));
      const act = Math.floor(tSim / 14);
      for (let k = 0; k < nv; k++) {
        const a = thr + (k % 2 ? Math.PI : 0), rr = fissure ? (k - 3) * 0.12 * Rg : (0.25 + 0.5 * hash(k + 1, builtEpoch)) * Rg;
        const on = fissure ? 1 : (hash(k + 3, act) < 0.5 ? 1 : 0.15);
        out.push([cx + Math.cos(fissure ? thr : a) * rr, cy + Math.sin(fissure ? thr : a) * rr, on * (fissure ? 0.5 : 0.7)]);
      }
      for (const c of clicks) if (c.until > tSim) out.push([c.x, c.y, 1.2]);
      return out;
    }
    function step(f, dt, tSim, warm) {
      const p = f.p, L = f.life;
      const rate = eruptAmount(f) * lerp(0.25, 2.5, p.x1) * 0.1 * speedMul;
      const visc = lerp(0.0005, 0.012, p.x2), kflow = lerp(0.4, 0.12, p.x2), cool = lerp(0.2, 1.2, p.x3) * (warm ? 1.3 : 1);
      // surface
      for (let i = 0; i < n; i++) S[i] = Tb[i] + Ta[i] + Lv[i];
      // erupt
      if (rate > 0) for (const [vx, vy, k] of vents(f, tSim)) {
        const sub = S[(vy | 0) * GW + (vx | 0)] < 0 ? 0.6 : 1;       // under water the vent still oozes pillow lava
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const x = (vx | 0) + ox, y = (vy | 0) + oy; if (x < 1 || y < 1 || x >= GW - 1 || y >= GH - 1) continue;
          const i = y * GW + x, add = rate * k * sub * dt * (ox === 0 && oy === 0 ? 0.4 : 0.075);
          Lv[i] += add; Hq[i] += add;
        }
      }
      // flow: height-difference outflow to the 4 neighbours, limited by what can move
      dL.fill(0); dH.fill(0);
      for (let y = 1; y < GH - 1; y++) for (let x = 1; x < GW - 1; x++) {
        const i = y * GW + x, l = Lv[i]; if (l < 1e-4) continue;
        const q = Hq[i] / l, fluid = q * q * (0.2 + 0.8 * q);
        const mobile = Math.max(0, l - visc * (1.2 - q));
        if (mobile <= 0) continue;
        const s0 = S[i];
        const d0 = s0 - S[i - 1], d1 = s0 - S[i + 1], d2 = s0 - S[i - GW], d3 = s0 - S[i + GW];
        const sum = (d0 > 0 ? d0 : 0) + (d1 > 0 ? d1 : 0) + (d2 > 0 ? d2 : 0) + (d3 > 0 ? d3 : 0);
        if (sum <= 0) continue;
        const out = Math.min(mobile * 0.5, kflow * fluid * sum * 4), fr = out / sum;
        if (d0 > 0) { dL[i - 1] += d0 * fr; dH[i - 1] += d0 * fr * q; }
        if (d1 > 0) { dL[i + 1] += d1 * fr; dH[i + 1] += d1 * fr * q; }
        if (d2 > 0) { dL[i - GW] += d2 * fr; dH[i - GW] += d2 * fr * q; }
        if (d3 > 0) { dL[i + GW] += d3 * fr; dH[i + GW] += d3 * fr * q; }
        dL[i] -= out; dH[i] -= out * q;
      }
      // cool, quench, solidify; ages
      const sub = smooth(0.78, 1, f.stage) * 0.004 * speedMul, ero = L.erosion * 0.01 * speedMul;
      for (let i = 0; i < n; i++) {
        let l = Lv[i] + dL[i], hq = Hq[i] + dH[i];
        Age[i] += dt;
        if (l > 1e-5) {
          let q = clamp(hq / l);
          const surf = Tb[i] + Ta[i] + l;
          const under = surf < 0;
          q -= dt * cool * (0.03 + 0.012 / (l * 30 + 0.2)) * (under ? 10 : 1);
          if (under && q > 0.5 && !warm && steam.length < 120 && hash(i, tSim) < 0.08) steam.push({ x: i % GW, y: (i / GW) | 0, a: 1 });
          if (q < 0.45) {
            const frac = Math.min(1, (0.45 - q) / 0.45 * dt * 1.5 * (under ? 4 : 1) + (q < 0.03 ? 1 : 0));
            const moved = l * frac; Ta[i] += moved; l -= moved; Age[i] = 0;
          }
          if (l < 1e-4) { Ta[i] += l; l = 0; q = 0; }
          hq = l * clamp(q);
        } else if (l > 0) { Ta[i] += l; l = 0; hq = 0; }
        Lv[i] = l; Hq[i] = hq;
        // geology: the deposits erode and sink once the volcano is quiet
        if (Ta[i] > 0) Ta[i] = Math.max(0, Ta[i] - dt * (ero * Math.max(0, Tb[i] + Ta[i]) * (0.5 + F.valley[i]) + sub));
      }
    }

    return {
      render(f) {
        const { ctx, w, h, t } = f, p = f.p, L = f.life, s = f.stage;
        const dl = daylight(p.light), day = dl.day, night = dl.night;
        setup(f);
        // base terrain for this stage, instantly
        const H = lifeHeight(s);
        for (let i = 0; i < n; i++) Tb[i] = baseAt(i, s, H, L, false);
        if (builtStage < 0 || Math.abs(s - builtStage) > 0.06 || f.epoch !== builtEpoch) rebuild(f);
        builtStage = s;
        // clicks open a vent for a while
        for (const c of f.pointer.clicks) clicks.push({ x: clamp(c.x) * GW, y: clamp(c.y) * GH, until: simT + 18 });
        if (clicks.length > 6) clicks.splice(0, clicks.length - 6);
        // simulate
        const dt = Math.min(0.1, f.dt) * speedMul;
        if (dt > 0) { for (let k = 0; k < 2; k++) { simT += dt / 2; step(f, dt / 2, simT, false); } }
        else for (let i = 0; i < n; i++) S[i] = Tb[i] + Ta[i] + Lv[i];
        // ---- colour
        const D = img.data, levels = 14;
        const lx = -0.6, ly = -0.8, lz = 0.6, lnorm = 1 / Math.sqrt(lx * lx + ly * ly + lz * lz);
        for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
          const i = y * GW + x, z = S[i], tb = Tb[i] + Ta[i];
          const xr = x + 1 < GW ? S[i + 1] : z, yd = y + 1 < GH ? S[i + GW] : z;
          const dx = (xr - z) * GW * 0.08, dy = (yd - z) * GH * 0.08;
          const shade = clamp((-dx * lx - dy * ly + lz) / Math.sqrt(dx * dx + dy * dy + 1) * lnorm * 1.3, 0, 1);
          const l = Lv[i], q = l > 1e-5 ? clamp(Hq[i] / l) : 0, lavaK = smooth(0.0005, 0.004, l);
          const land = tb > 0, age = Age[i], reefy = !land && tb > -0.06 && F.z60[i] < 0.02 && L.reef > 0.1;
          let R, G, B;
          if (style === 'thermal') {
            let temp = land ? 0.3 + 0.2 * day * shade - 0.15 * clamp(tb) + 0.35 * smooth(60, 0, age) : 0.15 + 0.05 * smooth(-0.3, 0, tb);
            temp = lerp(temp, 0.55 + 0.45 * q, lavaK);
            const c = ironbow(temp); R = c[0]; G = c[1]; B = c[2];
          } else if (style === 'age') {
            if (land) { const a = age; const c = a < 20 ? [230, 40, 30] : a < 60 ? [245, 130, 40] : a < 150 ? [245, 210, 70] : a < 400 ? [140, 190, 90] : [120, 160, 200]; const sh = 0.7 + 0.5 * shade; R = c[0] * sh; G = c[1] * sh; B = c[2] * sh; }
            else { R = 228; G = 236; B = 244; if (reefy) { R = 245; G = 200; B = 205; } }
            if (lavaK > 0) { R = lerp(R, 30, lavaK); G = lerp(G, 20, lavaK); B = lerp(B, 20, lavaK); if (q > 0.4) { const c = lavaRGB(q); R = lerp(R, c[0], lavaK); G = lerp(G, c[1], lavaK); B = lerp(B, c[2], lavaK); } }
            if ((xr > 0) !== land || (yd > 0) !== land) { R = 30; G = 30; B = 30; }
          } else if (style === 'contour') {
            const lv = Math.floor(z * levels), contour = land && (Math.floor(xr * levels) !== lv || Math.floor(yd * levels) !== lv);
            if (land) { const e = clamp(tb); R = lerp(214, 190, e); G = lerp(206, 160, e); B = lerp(170, 120, e); const sh = 0.85 + 0.3 * shade; R *= sh; G *= sh; B *= sh; if (contour) { R *= 0.65; G *= 0.6; B *= 0.55; } }
            else { const sh1 = smooth(-0.25, 0, tb); R = lerp(236, 190, sh1); G = lerp(242, 220, sh1); B = lerp(246, 236, sh1); if (reefy) { R = 180; G = 225; B = 215; } }
            if (lavaK > 0) { const c = lavaRGB(0.35 + 0.65 * q); R = lerp(R, c[0], lavaK); G = lerp(G, c[1], lavaK); B = lerp(B, c[2], lavaK); }
            if ((xr > 0) !== land || (yd > 0) !== land) { R = 40; G = 50; B = 70; }
          } else {
            // natural / night / timelapse / fissure
            if (land) {
              const rockT = smooth(5, 90, age), veg = L.veg * smooth(90, 400, age) * (1 - smooth(0.5, 0.9, tb));
              R = lerp(16, 112, rockT); G = lerp(14, 96, rockT); B = lerp(14, 80, rockT);
              R = lerp(R, 58, veg); G = lerp(G, 128, veg); B = lerp(B, 46, veg);
              const vy = F.valley[i] * L.erosion; R = lerp(R, 30, vy * 0.5); G = lerp(G, 80, vy * 0.5); B = lerp(B, 34, vy * 0.5);
              if (L.reef > 0.3 && F.z60[i] < 0.02 && tb < 0.05) { R = 238; G = 226; B = 190; }
              const sh = 0.55 + 0.7 * shade; R *= sh; G *= sh; B *= sh;
            } else {
              const shallow = Math.pow(smooth(-1, 0, tb), 1.6);
              R = lerp(8, 60, shallow); G = lerp(30, 150, shallow); B = lerp(70, 170, shallow);
              if (reefy) { R = lerp(R, 170, 0.9 * L.reef); G = lerp(G, 235, 0.9 * L.reef); B = lerp(B, 225, 0.9 * L.reef); }
              if (tb > -0.03 && F.tex[i] > 0.62) { R += 30; G += 30; B += 25; }
            }
            const dk = 0.3 + 0.7 * day; R *= dk; G *= dk; B *= dk;
            if (lavaK > 0) {
              // crust (dark) over a glowing interior; cracks show the glow through
              const crust = smooth(0.6, 0.3, q), crack = smooth(0.45, 0.7, F.tex[i] + 0.3 * q);
              const c = lavaRGB(0.3 + 0.7 * q), gl = lerp(1, crack, crust);
              const cr = [26, 20, 18];
              R = lerp(R, lerp(cr[0], c[0], gl), lavaK); G = lerp(G, lerp(cr[1], c[1], gl), lavaK); B = lerp(B, lerp(cr[2], c[2], gl), lavaK);
            }
          }
          const o = i * 4; D[o] = R; D[o + 1] = G; D[o + 2] = B; D[o + 3] = 255;
        }
        buf.ctx.putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(buf.canvas, 0, 0, GW, GH, 0, 0, w, h);
        // glow bloom at night: draw the hot buffer again, additively and blurred, for the natural styles
        if (night > 0.15 && style !== 'thermal' && style !== 'age' && style !== 'contour') {
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5 * night; ctx.filter = `blur(${Math.max(2, h * 0.012)}px)`;
          ctx.drawImage(buf.canvas, 0, 0, GW, GH, 0, 0, w, h); ctx.restore();
        }
        // steam where lava meets the sea
        const wx = windX(p.wind);
        for (let k = steam.length - 1; k >= 0; k--) {
          const st = steam[k]; st.a -= f.dt * 0.35 * speedMul; if (st.a <= 0) { steam.splice(k, 1); continue; }
          const u = 1 - st.a, px = (st.x + 0.5) / GW * w + wx * u * h * 0.12, py = (st.y + 0.5) / GH * h - u * h * 0.05, r = h * (0.01 + 0.05 * u);
          const g = ctx.createRadialGradient(px, py, 0, px, py, r); g.addColorStop(0, `rgba(255,255,255,${0.55 * st.a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
        }
        // caption
        const fs = Math.max(9, h * 0.024);
        const ink = style === 'contour' || style === 'age' ? '#1b1b1b' : '#f0f0f0', bg = style === 'contour' || style === 'age' ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.55)';
        const label = (x, y, text, size, weight = 500) => { ctx.font = `${weight} ${size}px ${FONT}`; const tw = ctx.measureText(text).width, pad = size * 0.4; ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x, y - size * 0.7, tw + pad * 2, size * 1.4, size * 0.25); ctx.fill(); ctx.fillStyle = ink; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(text, x + pad, y); };
        const titles = { thermal: 'Thermal camera', natural: 'Lava flow simulation', age: 'Flow age map', contour: 'Elevation and active flows', night: 'Night glow', timelapse: 'Time-lapse: the island builds itself', fissure: 'Fissure eruption' };
        label(fs * 0.6, fs * 1.3, titles[style] || 'Lava flow simulation', fs * 1.05, 600);
        label(fs * 0.6, fs * 2.9, `${L.index + 1}. ${L.name}`, fs * 0.85);
        let active = 0, hot = 0; for (let i = 0; i < n; i += 7) if (Lv[i] > 0.0005) { active++; if (Hq[i] / Lv[i] > 0.5) hot++; }
        ctx.font = `500 ${fs * 0.75}px ${MONO}`; ctx.fillStyle = ink; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = bg; const txt = `active flows ${(active * 7 / n * 100).toFixed(1)}%  molten ${(hot * 7 / n * 100).toFixed(1)}%  click to open a vent`; const tw = ctx.measureText(txt).width;
        ctx.fillRect(w * 0.98 - tw - fs * 0.6, h * 0.97 - fs * 1.1, tw + fs * 0.8, fs * 1.3); ctx.fillStyle = ink; ctx.fillText(txt, w * 0.98, h * 0.97);
        if (style === 'age') {
          const items = [['#e62820', '< 20 s'], ['#f58228', '< 1 min'], ['#f5d246', '< 2.5 min'], ['#8cbe5a', '< 7 min'], ['#78a0c8', 'older']];
          ctx.font = `500 ${fs * 0.75}px ${FONT}`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          items.forEach(([c, nm], k) => { const yy = h * 0.6 + k * fs * 1.15; ctx.fillStyle = c; ctx.fillRect(w * 0.86, yy - fs * 0.35, fs * 1.4, fs * 0.7); ctx.fillStyle = ink; ctx.fillText(nm, w * 0.86 + fs * 1.9, yy); });
        }
      },
    };
  },
};

export const scenes = [
  { id: 'lavaflow-thermal', name: 'Thermal Camera', tags: ['sim', 'science', 'map', 'lava', 'eruption', '2d'],
    desc: 'A simulated eruption seen by a thermal camera: molten channels blaze white, crusted flows cool to orange, the sea stays cold.',
    opts: { style: 'thermal' }, params: { stage: 0.36, grow: 0.3, activity: 0.6, scale: 0.5, detail: 0.6, light: 0.8, x1: 0.55, x2: 0.4, x3: 0.5, x4: 0.4 } },
  { id: 'lavaflow-natural', name: 'Flows in Colour', tags: ['sim', 'realistic', 'map', 'lava', 'hawaii', '2d'],
    desc: 'Lava from the summit and rift vents runs downhill, crusts over, freezes into new black rock and steams where it reaches the sea.',
    opts: { style: 'natural' }, params: { stage: 0.4, grow: 0.3, activity: 0.6, scale: 0.5, detail: 0.6, light: 0.9, x1: 0.5, x2: 0.4, x3: 0.5, x4: 0.4 } },
  { id: 'lavaflow-age', name: 'Flow Age Map', tags: ['sim', 'science', 'map', 'diagram', '2d'],
    desc: 'Each flow is coloured by how long ago it froze, so the island shows the sequence of eruptions that built it.',
    opts: { style: 'age' }, params: { stage: 0.38, grow: 0.3, activity: 0.6, scale: 0.5, detail: 0.6, light: 0.9, x1: 0.55, x2: 0.45, x3: 0.5, x4: 0.5 } },
  { id: 'lavaflow-contour', name: 'Contours and Flows', tags: ['sim', 'map', 'diagram', '2d'],
    desc: 'Elevation contours on a pale base with the active flows drawn in red, like a hazard map updated live.',
    opts: { style: 'contour' }, params: { stage: 0.42, grow: 0.3, activity: 0.6, scale: 0.5, detail: 0.6, light: 0.9, x1: 0.5, x2: 0.4, x3: 0.5, x4: 0.4 } },
  { id: 'lavaflow-night', name: 'Night Glow', tags: ['sim', 'night', 'lava', 'realistic', '2d'],
    desc: 'The same simulation after dark: only the incandescent channels and cracked crust glow, with a soft bloom.',
    opts: { style: 'night' }, params: { stage: 0.38, grow: 0.3, activity: 0.7, scale: 0.5, detail: 0.6, light: 0.05, x1: 0.6, x2: 0.4, x3: 0.45, x4: 0.5 } },
  { id: 'lavaflow-timelapse', name: 'Time-Lapse Build', tags: ['sim', 'map', 'lava', 'hawaii', '2d'],
    desc: 'Fast forward: flow after flow piles up and the island visibly builds itself, then erodes and sinks as the cycle runs on.',
    opts: { style: 'timelapse', speed: 5 }, params: { stage: 0.3, grow: 0.55, activity: 0.7, scale: 0.5, detail: 0.55, light: 0.85, x1: 0.7, x2: 0.35, x3: 0.6, x4: 0.6 } },
  { id: 'lavaflow-fissure', name: 'Fissure Eruption', tags: ['sim', 'lava', 'eruption', 'map', '2d'],
    desc: 'A curtain of fire along a rift-zone fissure: a line of vents feeds broad sheets of runny lava down to the coast.',
    opts: { style: 'fissure', fissure: true }, params: { stage: 0.34, grow: 0.3, activity: 0.7, scale: 0.55, detail: 0.6, light: 0.8, x1: 0.6, x2: 0.3, x3: 0.5, x4: 0.5 } },
];
