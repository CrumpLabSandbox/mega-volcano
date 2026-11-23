// Eruption: cinematic side views built from particle systems that are pure functions of time (so the first frame is
// already full). The island profile follows the life cycle; the eruption style is chosen by the scene (Surtseyan
// cock's-tail jets, Hawaiian fountains and fissure curtains, Strombolian bomb arcs, a Plinian column with an umbrella,
// volcanic lightning, a pyroclastic density current, the Hunga Tonga blast ring, a laze plume at an ocean entry) and
// scaled by what the island is doing at this stage. Clicks fire a burst at the vent.
import { clamp, lerp, smooth, fract, hash, noise2, fbm2, puff, sky, lavaCss, lavaRGB, eruptAmount, windX, daylight, hsl } from '../util.js';

const TAU = Math.PI * 2;
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const css = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

// a stream of n particles that are re-emitted forever; fn(i, age, life, k, r) with r(j) = per-cycle random numbers
function stream(n, t, life, seed, fn) {
  for (let i = 0; i < n; i++) {
    const jitter = hash(i, seed), ph = t / life + jitter, k = Math.floor(ph), age = (ph - k) * life;
    const r = j => hash(i + 0.37 * j, k * 1.618 + seed * 7.1 + j);
    fn(i, age, life, k, r);
  }
}

export default {
  id: 'eruption',
  name: 'Eruption',
  kind: '2d',
  sky: true,
  params: [
    { id: 'x1', label: 'Vigour', value: 0.5, tip: 'How much material the vent throws out and how high' },
    { id: 'x2', label: 'Ash', value: 0.5, tip: 'Opacity of ash and steam' },
    { id: 'x3', label: 'Glow', value: 0.6, tip: 'Lava glow and bloom' },
    { id: 'x4', label: 'Haze', value: 0.3, tip: 'Distance haze over the island' },
  ],
  create(ctx, opts) {
    const mode = opts.mode || 'surtsey';
    const bursts = [];        // click bursts { t0, x, y }
    let seedEpoch = -1, isl = null;

    // ---- island profile (pure function of stage + epoch), cached per frame
    function island(f, W, H) {
      const L = f.life, p = f.p, cx = W * 0.5, hy = H * 0.6;
      const S = 0.45 + 0.9 * p.scale;
      const halfW = W * 0.3 * S, floor = hy + H * 0.34, peakH = H * 0.26 * S;
      const seed = f.epoch * 13.7 + (opts.seed || 0);
      const hgt = L.height, above = Math.max(0, hgt) * peakH;
      const peak = hy - above;
      // the submarine pedestal (steep flanks) rises to sea level as the seamount grows, then stays just under the
      // surface as the island sinks: that is the platform the reef sits on
      const pedH = (floor - hy) * clamp(1 + hgt) - (2 + 3 * L.lagoon) * H / 270;
      const domeW = 0.74 * clamp(0.3 + 0.7 * Math.sqrt(Math.max(0, hgt)));
      const N = 160, xs = new Float32Array(N), ys = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const u = (i / (N - 1)) * 2 - 1, au = Math.abs(u);
        let ped = smooth(1, 0.55, au) * (1 - 0.06 * noise2(u * 4 + seed, 1.1));
        ped += Math.max(0, 1 - au / 0.25) * 0.35 * L.submarine;             // a cone on top while it is a seamount
        let y = floor - pedH * Math.min(1, ped);
        if (above > 0) {
          const q = Math.max(0, 1 - au / domeW);
          const shield = Math.max(0, 1 - Math.pow(au / domeW, 1.7)), peaky = Math.pow(q, 1.4);
          let s = lerp(shield, peaky, 0.75 * L.erosion + 0.4 * L.steam) * (1 - 0.06 * noise2(u * 3 + seed, 2.1));
          s -= L.caldera * 0.2 * smooth(0.12, 0.02, Math.abs(u + 0.03)) * q;    // caldera notch
          s += L.caldera * 0.06 * (Math.max(0, 1 - Math.abs(u - 0.3) * 14) + Math.max(0, 1 - Math.abs(u + 0.46) * 16));
          s -= L.erosion * 0.18 * Math.pow(fbm2(u * 7 + seed * 3, 5.3, 3), 2) * Math.min(1, au * 3) * q;   // valleys
          y = Math.min(y, hy - above * Math.max(0, s));
        }
        // Surtseyan tuff cone: a raw little cone at sea level while breaching
        y -= H * 0.075 * S * L.steam * Math.max(0, 1 - au / 0.12) * (1 - L.submarine);
        xs[i] = cx + u * halfW; ys[i] = y;
      }
      const y = x => { // profile height at x
        const u = clamp((x - cx) / halfW * 0.5 + 0.5, 0, 0.99999) * (N - 1), i = Math.floor(u), fr = u - i;
        return lerp(ys[i], ys[Math.min(N - 1, i + 1)], fr);
      };
      // shoreline (where the profile crosses sea level), right side
      let shoreR = cx, shoreL = cx;
      for (let i = N >> 1; i < N; i++) if (ys[i] < hy - 0.5) shoreR = xs[i];
      for (let i = N >> 1; i >= 0; i--) if (ys[i] < hy - 0.5) shoreL = xs[i];
      const ventX = cx - 0.03 * halfW;
      return { cx, hy, halfW, floor, peak: Math.min(...ys), xs, ys, y, shoreR, shoreL, ventX, ventY: Math.min(hy, y(ventX)), S, seed };
    }

    // ---- what is happening, from the life cycle and the scene mode
    function features(f) {
      const L = f.life, E = eruptAmount(f), st = f.stage;
      const above = 1 - L.submarine;
      const shield = smooth(0.2, 0.26, st) * (1 - smooth(0.5, 0.58, st));
      const active = above * (1 - smooth(0.54, 0.64, st));            // breach through caldera
      const F = {
        E, above, shield, active,
        tephra: L.steam * E, steam: L.steam * E,
        fountain: shield * E * 0.9, flows: shield * Math.min(1, E), laze: shield * Math.min(1, E),
        bombs: (L.explosive * (1 - L.steam) * 0.8 + shield * 0.25) * E * above,
        ash: L.explosive * (1 - L.steam) * E * above * 0.6, lightning: 0, pdc: 0, ring: 0, curtain: 0,
        glow: clamp(E) * above * (1 - smooth(0.56, 0.66, st)),
        subglow: L.submarine * E * smooth(0.0, 0.05, st),
      };
      const boost = active * E;
      switch (mode) {
        case 'fountain': F.fountain += boost * 0.8; F.flows = Math.min(1.4, F.flows + boost * 0.6); F.laze += boost * 0.3; F.curtain = boost; break;
        case 'strombolian': F.bombs += boost * 1.2; F.ash += boost * 0.15; break;
        case 'plinian': F.ash += boost * 1.2; F.bombs += boost * 0.2; break;
        case 'lightning': F.ash += boost * 1.1; F.lightning = boost; break;
        case 'pdc': F.ash += boost * 0.6; F.pdc = boost; break;
        case 'hunga': F.ash += boost * 1.3; F.ring = boost; F.tephra += boost * 0.4; F.steam += boost * 0.5; break;
        case 'laze': F.flows = Math.min(1.4, F.flows + boost * 0.7); F.laze += boost * 1.2; F.fountain += boost * 0.2; break;
        default: F.tephra += boost * 0.3 * L.steam; F.steam += boost * 0.4 * L.steam;
      }
      return F;
    }

    // ---- colours from the Light control
    function palette(f) {
      const { day, dusk, night } = daylight(f.p.light);
      const k = 0.12 + 0.88 * smooth(0, 0.5, day);
      return {
        day, dusk, night, k,
        rock: mix3([8, 9, 18], [34, 30, 32], k), tuff: mix3([10, 9, 16], [48, 38, 30], k),
        veg: mix3([6, 14, 14], [58, 112, 46], k), sand: mix3([40, 42, 56], [236, 222, 178], k),
        seaTop: mix3([8, 14, 32], [38, 110, 160], k), seaDeep: mix3([3, 6, 18], [10, 42, 86], k),
        reef: mix3([20, 60, 70], [90, 215, 200], k), lagoon: mix3([14, 40, 60], [96, 196, 210], k),
        horizon: mix3([22, 26, 48], dusk > 0.3 ? [255, 160, 110] : [200, 222, 240], k),
        steam: mix3([120, 124, 150], [250, 250, 252], k), ash: mix3([38, 36, 44], [96, 88, 86], k),
      };
    }

    function render(f) {
      const { ctx, w: W, h: H, t } = f, p = f.p;
      const L = f.life, F = features(f), P = palette(f);
      const I = island(f, W, H);
      const wx = windX(p.wind), vig = 0.4 + 1.2 * p.x1, ashA = 0.25 + 0.75 * p.x2, glowK = p.x3, haze = p.x4;
      for (const c of f.pointer.clicks) bursts.push({ t0: t, x: c.x * W, y: c.y * H });
      while (bursts.length && t - bursts[0].t0 > 3) bursts.shift();
      const lavaT = (t) => lavaCss(t);

      // sky
      const drewSky = sky(f, (c, w, h) => {
        const g = c.createLinearGradient(0, 0, 0, I.hy);
        const top = mix3([4, 6, 20], [58, 118, 205], P.k), mid = mix3([12, 16, 40], [130, 180, 230], P.k);
        g.addColorStop(0, css(top)); g.addColorStop(0.75, css(mix3(mid, P.horizon, P.dusk * 0.6))); g.addColorStop(1, css(P.horizon));
        c.fillStyle = g; c.fillRect(0, 0, w, I.hy + 1);
      });
      if (drewSky) {
        if (P.night > 0.05) { // stars
          ctx.fillStyle = `rgba(255,255,255,${0.8 * P.night})`;
          for (let i = 0; i < 70; i++) { const sx = hash(i, 3.3) * W, sy = hash(i, 7.7) * I.hy * 0.95; const tw = 0.5 + 0.5 * Math.sin(f.clock * 3 + i); ctx.fillRect(sx, sy, 1.2 * tw + 0.6, 1.2 * tw + 0.6); }
        }
        const sunX = W * (0.5 - 0.3 * wx * 0.6), sunY = lerp(I.hy * 0.95, I.hy * 0.15, smooth(0.08, 0.9, P.day));
        if (P.day > 0.06) {
          const r = H * 0.05, g = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, r * 5);
          g.addColorStop(0, css(mix3([255, 140, 80], [255, 240, 210], P.day), 0.9)); g.addColorStop(0.2, css([255, 200, 140], 0.35 * (0.3 + P.dusk))); g.addColorStop(1, css([255, 160, 90], 0));
          ctx.fillStyle = g; ctx.fillRect(sunX - r * 5, sunY - r * 5, r * 10, r * 10);
          ctx.fillStyle = css(mix3([255, 150, 70], [255, 252, 235], P.day)); ctx.beginPath(); ctx.arc(sunX, sunY, r * (0.7 + 0.6 * P.dusk), 0, TAU); ctx.fill();
        } else { // moon
          const mx = W * 0.78, my = I.hy * 0.25; ctx.fillStyle = 'rgba(230,235,250,0.9)'; ctx.beginPath(); ctx.arc(mx, my, H * 0.025, 0, TAU); ctx.fill();
        }
      }

      // deep sea, submerged cone, then the translucent sea surface
      ctx.fillStyle = css(P.seaDeep); ctx.fillRect(0, I.hy, W, H - I.hy);
      const subCol = mix3(P.seaDeep, [70, 68, 78], 0.22 + 0.3 * L.submarine);
      drawProfile(ctx, I, css(subCol), I.hy, H);
      if (F.subglow > 0) { // seamount: pillow-lava glow on the summit and bubbles rising from it
        const g = ctx.createRadialGradient(I.ventX, I.peak, 0, I.ventX, I.peak, I.halfW * 0.35);
        g.addColorStop(0, lavaCss(0.8, 0.8 * Math.min(1, F.subglow))); g.addColorStop(0.3, lavaCss(0.5, 0.3 * F.subglow)); g.addColorStop(1, lavaCss(0.3, 0));
        ctx.fillStyle = g; ctx.fillRect(0, I.hy, W, H - I.hy);
        ctx.fillStyle = lavaCss(1, 0.9);
        for (let i = 0; i < 14; i++) { const u = (hash(i, 4.4) - 0.5) * 0.4, x = I.ventX + u * I.halfW, y = I.y(x); const fl = 0.5 + 0.5 * Math.sin(f.clock * 2 + i * 1.7); ctx.globalAlpha = fl * F.subglow; ctx.fillRect(x, y - 1, 2 + 2 * hash(i, 5), 2); }
        ctx.globalAlpha = 1;
      }
      const sg = ctx.createLinearGradient(0, I.hy, 0, H);
      sg.addColorStop(0, css(mix3(P.seaTop, P.horizon, 0.45), 0.85)); sg.addColorStop(0.3, css(P.seaTop, 0.72)); sg.addColorStop(1, css(P.seaDeep, 0.6));
      ctx.fillStyle = sg; ctx.fillRect(0, I.hy, W, H - I.hy);
      if (F.subglow > 0) { // the glow seen through the water, then bubbling, discoloured water over the seamount
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(I.ventX, I.peak, 0, I.ventX, I.peak, I.halfW * 0.4);
        g.addColorStop(0, lavaCss(0.7, 0.35 * Math.min(1, F.subglow))); g.addColorStop(1, lavaCss(0.3, 0));
        ctx.fillStyle = g; ctx.fillRect(0, I.hy, W, H - I.hy);
        ctx.globalCompositeOperation = 'source-over';
        const r = I.halfW * 0.3 * (1.2 + 0.6 * L.height);
        ctx.fillStyle = `rgba(190,215,170,${0.45 * F.subglow * P.k})`; ctx.beginPath(); ctx.ellipse(I.ventX, I.hy + H * 0.014, r, r * 0.1, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(255,255,255,${0.7 * P.k})`;
        stream(Math.round(50 * F.subglow), t, 2.5, 11, (i, age, life, k, rr) => { const a = age / life; ctx.globalAlpha = 0.6 * (1 - a) * P.k; const x = I.ventX + (rr(1) - 0.5) * r * 1.4 + Math.sin(t * 3 + i) * 2; ctx.fillRect(x, I.hy + H * 0.015 - a * H * 0.012, 1.5, 1.5); });
        ctx.globalAlpha = 1;
      }
      // reef, lagoon, atoll islets at the shore
      drawReef(ctx, f, I, P, L);
      // waves
      ctx.strokeStyle = css(mix3(P.horizon, [255, 255, 255], 0.3), 0.35 * P.k); ctx.lineWidth = Math.max(1, H / 540);
      for (let i = 0; i < 26; i++) {
        const yy = I.hy + H * 0.012 + Math.pow(hash(i, 1.1), 1.6) * (H - I.hy) * 0.9, len = W * (0.02 + 0.05 * hash(i, 2.2)) * (0.5 + (yy - I.hy) / (H - I.hy));
        const xx = fract(hash(i, 5.5) + t * 0.01 * (0.4 + hash(i, 9)) * wx) * (W + len) - len;
        ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + len, yy); ctx.stroke();
      }

      // island above water
      const hazeCol = P.horizon;
      drawIsland(ctx, f, I, P, L, F, hazeCol, haze);
      // lava flows down the flanks and into the sea
      if (F.flows > 0.02) drawFlows(ctx, f, I, F, P, glowK);
      // sea glow from lava (reflection)
      if (F.glow > 0 && P.night > 0.05) {
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(I.ventX, I.hy, 0, I.ventX, I.hy, I.halfW * 1.2);
        g.addColorStop(0, lavaCss(0.6, 0.3 * P.night * F.glow * glowK)); g.addColorStop(1, lavaCss(0.5, 0));
        ctx.fillStyle = g; ctx.fillRect(I.cx - I.halfW * 1.3, I.hy, I.halfW * 2.6, H - I.hy);
        ctx.globalCompositeOperation = 'source-over';
      }

      // ---- particle systems
      const N = 0.4 + 0.8 * p.detail;
      const vent = { x: I.ventX, y: I.ventY };
      // fissure curtain: a line of small fountains along the flank
      if (F.curtain > 0.02) {
        for (let j = 0; j < 7; j++) {
          const x = I.cx + I.halfW * (0.12 + j * 0.065), y = I.y(x) - 1;
          fountain(ctx, f, { x, y }, F.curtain * 0.5 * (0.6 + 0.6 * hash(j, 4)), 0.5 * vig, 20 * N, j * 31, glowK, P);
        }
      }
      if (F.fountain > 0.02) fountain(ctx, f, vent, F.fountain, vig, 160 * N, 1, glowK, P);
      if (F.bombs > 0.02) bombs(ctx, f, vent, F.bombs, vig, Math.round(26 * N * Math.min(2, F.bombs)), 2, glowK, P);
      if (F.laze > 0.02) laze(ctx, f, I, F.laze, P, ashA, wx, N);
      if (F.pdc > 0.02) pdc(ctx, f, I, F.pdc, P, ashA, wx, N);
      if (F.tephra > 0.02) tephra(ctx, f, vent, I, F.tephra, vig, N, P, ashA, wx);
      if (F.steam > 0.02) steamPlume(ctx, f, vent, F.steam, vig, N, P, ashA, wx);
      if (F.ash > 0.02) ashColumn(ctx, f, vent, I, F.ash, vig, N, P, ashA, wx, F.lightning, glowK);
      if (F.ring > 0.02) blastRing(ctx, f, I, F.ring, P);
      // click bursts: a flash and a spray of bombs + tephra at the vent (or where clicked if that's on the island)
      for (const b of bursts) {
        const age = t - b.t0, s = 1 - age / 3;
        const bx = Math.abs(b.x - I.cx) < I.halfW && b.y < I.hy + H * 0.05 ? b.x : vent.x, by = Math.min(I.y(bx), I.hy);
        burst(ctx, f, { x: bx, y: by }, age, s, vig, glowK, P, mode);
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }

    // ---- island drawing helpers
    function drawProfile(ctx, I, fill, clipTop, clipBottom) {
      ctx.save(); ctx.beginPath(); ctx.rect(0, clipTop, I.xs[I.xs.length - 1] * 2, clipBottom - clipTop); ctx.clip();
      ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(I.xs[0], I.floor + 2);
      for (let i = 0; i < I.xs.length; i++) ctx.lineTo(I.xs[i], I.ys[i]);
      ctx.lineTo(I.xs[I.xs.length - 1], I.floor + 2); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    function drawIsland(ctx, f, I, P, L, F, hazeCol, haze) {
      const H = f.h, above = I.hy - I.peak;
      if (above <= 1) return;
      const fresh = 1 - L.veg;
      const rock = mix3(mix3(P.rock, P.tuff, L.steam), hazeCol, haze * 0.45);
      const green = mix3(mix3(P.veg, P.rock, fresh), hazeCol, haze * 0.3);
      const g = ctx.createLinearGradient(0, I.peak, 0, I.hy);
      g.addColorStop(0, css(mix3(rock, green, L.veg * 0.35 * (1 - L.caldera * 0.5))));
      g.addColorStop(0.55, css(mix3(rock, green, L.veg * 0.75)));
      g.addColorStop(1, css(mix3(rock, green, L.veg)));
      drawProfile(ctx, I, g, 0, I.hy);
      // sunlit side / shaded side
      const sunSide = f.p.light > 0.06 ? -1 : 1;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, f.w, I.hy); ctx.clip();
      ctx.beginPath(); ctx.moveTo(I.cx, I.peak - 1);
      for (let i = 0; i < I.xs.length; i++) if ((I.xs[i] - I.cx) * sunSide > 0) ctx.lineTo(I.xs[i], I.ys[i]);
      ctx.lineTo(I.cx + sunSide * I.halfW, I.hy); ctx.lineTo(I.cx, I.hy); ctx.closePath();
      ctx.fillStyle = `rgba(255,235,200,${0.08 * P.k})`; ctx.fill();
      // erosion valleys: dark streaks from the summit
      if (L.erosion > 0.05) {
        ctx.strokeStyle = `rgba(0,0,0,${0.35 * L.erosion})`; ctx.lineWidth = Math.max(1, H / 400);
        for (let j = 0; j < 11; j++) {
          const u = (hash(j, I.seed + 2) - 0.5) * 1.6, x1 = I.cx + u * I.halfW * 0.25, x2 = I.cx + u * I.halfW * 0.95;
          ctx.beginPath(); ctx.moveTo(x1, I.y(x1) + above * 0.08); ctx.lineTo(x2, Math.min(I.hy, I.y(x2))); ctx.stroke();
        }
      }
      // beach / cliff rim at the shore
      if (L.erosion > 0.1 && L.height > 0) {
        ctx.fillStyle = css(P.sand, 0.9 * L.erosion);
        const bh = Math.max(1, H * 0.006);
        ctx.fillRect(I.shoreL - bh, I.hy - bh, I.halfW * 0.07, bh); ctx.fillRect(I.shoreR - I.halfW * 0.07 + bh, I.hy - bh, I.halfW * 0.07, bh);
      }
      ctx.restore();
      // glowing vent / caldera at night
      if (F.glow > 0 && P.night > 0.02) {
        const r = I.halfW * 0.08 * (1 + F.E * 0.5);
        const g2 = ctx.createRadialGradient(I.ventX, I.ventY, 0, I.ventX, I.ventY, r * 2.5);
        g2.addColorStop(0, lavaCss(0.7, 0.5 * P.night * F.glow)); g2.addColorStop(1, lavaCss(0.4, 0));
        ctx.fillStyle = g2; ctx.fillRect(I.ventX - r * 2.5, I.ventY - r * 2.5, r * 5, r * 5);
      }
    }
    function drawReef(ctx, f, I, P, L) {
      const H = f.h, hy = I.hy;
      if (L.reef < 0.02) return;
      const th = Math.max(1.5, H * 0.008);
      // fringing reef hugging the shore → barrier reef with a lagoon → atoll ring with islets
      const out = I.halfW * (0.04 + 0.5 * L.lagoon);
      const sl = L.height > -0.02 ? I.shoreL : I.cx, sr = L.height > -0.02 ? I.shoreR : I.cx;
      ctx.fillStyle = css(P.lagoon, 0.85 * L.lagoon * P.k);
      ctx.fillRect(sl - out, hy, (sr - sl) + 2 * out, th * 1.5);
      ctx.fillStyle = css(P.reef, 0.9 * L.reef * P.k);
      ctx.fillRect(sl - out - th * 4, hy, th * 4, th); ctx.fillRect(sr + out, hy, th * 4, th);
      // surf on the reef crest
      ctx.fillStyle = `rgba(255,255,255,${0.6 * L.reef * P.k * (0.6 + 0.4 * Math.sin(f.t * 2))})`;
      ctx.fillRect(sl - out - th * 4, hy - th * 0.5, th * 4, th * 0.6); ctx.fillRect(sr + out, hy - th * 0.5, th * 4, th * 0.6);
      // motu: low sandy islets with a few palms
      const motu = smooth(0.4, 0.9, L.lagoon);
      if (motu > 0) for (const sgn of [-1, 1]) {
        const x = (sgn < 0 ? sl - out : sr + out) + sgn * th * 2, w = I.halfW * 0.12 * motu, h = H * 0.012 * motu;
        ctx.fillStyle = css(P.sand); ctx.beginPath(); ctx.ellipse(x, hy + 0.5, w, h, 0, Math.PI, TAU); ctx.fill();
        ctx.fillStyle = css(mix3(P.veg, [30, 90, 40], 0.5)); ctx.beginPath(); ctx.ellipse(x, hy - h * 0.5, w * 0.6, h * 0.8, 0, Math.PI, TAU); ctx.fill();
        ctx.strokeStyle = css(mix3(P.rock, [60, 40, 20], 0.5)); ctx.lineWidth = Math.max(1, H / 500);
        for (let k = 0; k < 3; k++) { const px = x + (k - 1) * w * 0.35, ph = H * 0.03 * motu; ctx.beginPath(); ctx.moveTo(px, hy - h); ctx.lineTo(px + ph * 0.15, hy - h - ph); ctx.stroke();
          ctx.fillStyle = css(P.veg); ctx.beginPath(); ctx.arc(px + ph * 0.15, hy - h - ph, ph * 0.3, 0, TAU); ctx.fill(); }
      }
    }
    function drawFlows(ctx, f, I, F, P, glowK) {
      const H = f.h, k = 2 + Math.round(3 * Math.min(1, F.flows));
      for (let j = 0; j < k; j++) {
        const sgn = j % 2 ? 1 : -1, len = (0.5 + 0.5 * hash(j, I.seed + 9)) * Math.min(1, F.flows + 0.3);
        const x0 = I.ventX + sgn * I.halfW * 0.02, x1 = I.cx + sgn * I.halfW * len;
        const x1c = Math.min(Math.max(x1, I.shoreL), I.shoreR);
        // the river runs down the near face of the island (below the skyline), wandering a little
        const drop = 0.1 + 0.3 * hash(j, I.seed + 4);
        ctx.beginPath();
        for (let s = 0; s <= 24; s++) {
          const u = s / 24, x = lerp(x0, x1c, u) + Math.sin(u * 9 + j) * I.halfW * 0.015, py = Math.min(I.hy, I.y(x));
          ctx.lineTo(x, py + (I.hy - py) * drop * Math.sin(u * Math.PI) * 1.2 + u * 1.5);
        }
        const temp = 0.55 + 0.35 * Math.min(1, F.flows) + 0.15 * Math.sin(f.t * 2 + j);
        ctx.lineCap = 'round';
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = lavaCss(temp, 0.12 * glowK * (0.5 + P.night)); ctx.lineWidth = H * 0.012; ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = lavaCss(temp, 0.9); ctx.lineWidth = Math.max(1, H * 0.0035); ctx.stroke();
        // molten core flicker
        ctx.strokeStyle = lavaCss(1, 0.5 + 0.3 * Math.sin(f.clock * 7 + j * 2)); ctx.lineWidth = Math.max(0.6, H * 0.0012); ctx.stroke();
      }
    }

    // ---- particle systems
    function fountain(ctx, f, v, amt, vig, n, seed, glowK, P) {
      const H = f.h, t = f.t, spd = H * (0.55 + 0.6 * vig) * Math.sqrt(Math.min(1.5, amt)), g = H * 1.1;
      ctx.globalCompositeOperation = 'lighter';
      const gl = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, H * 0.08 * (0.5 + amt));
      gl.addColorStop(0, lavaCss(0.9, 0.45 * glowK)); gl.addColorStop(1, lavaCss(0.5, 0));
      ctx.fillStyle = gl; ctx.fillRect(v.x - H * 0.2, v.y - H * 0.2, H * 0.4, H * 0.4);
      const sz = Math.max(1, H / 300);
      stream(Math.round(n * Math.min(1.6, 0.5 + amt)), t, 1.2, seed, (i, age, life, k, r) => {
        const a = (r(1) - 0.5) * 0.5 * (0.6 + 0.6 * r(5)), s = spd * (0.6 + 0.5 * r(2));
        const x = v.x + Math.sin(a) * s * age + (r(3) - 0.5) * 2 * age * H * 0.02, y = v.y - Math.cos(a) * s * age + 0.5 * g * age * age;
        if (y > v.y + H * 0.02 && age > 0.3) return;
        const temp = 1 - age / life * 0.7;
        ctx.fillStyle = lavaCss(temp, 0.9 * (1 - age / life * 0.5));
        const d = sz * (1 + r(4));
        ctx.fillRect(x, y, d, d * 1.6);
      });
      ctx.globalCompositeOperation = 'source-over';
    }
    function bombs(ctx, f, v, amt, vig, n, seed, glowK, P) {
      const H = f.h, t = f.t, spd = H * (0.45 + 0.5 * vig), g = H * 0.9, wx = windX(f.p.wind);
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      stream(n, t, 2.6, seed, (i, age, life, k, r) => {
        if (r(6) > Math.min(1, amt) * 0.9 + 0.1) return;             // not every slot is used: bursts come in pulses
        const a = (r(1) - 0.5) * 1.3, s = spd * (0.5 + 0.6 * r(2));
        const pos = tt => [v.x + Math.sin(a) * s * tt + wx * tt * H * 0.03, v.y - Math.cos(a) * s * tt + 0.5 * g * tt * tt];
        const [x, y] = pos(age);
        // long-exposure streak back along the arc
        ctx.beginPath();
        for (let q = 0; q <= 8; q++) { const tt = Math.max(0, age - q * 0.06); const [px, py] = pos(tt); if (q === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
        ctx.strokeStyle = lavaCss(0.75, 0.35 * glowK * (1 - age / life)); ctx.lineWidth = Math.max(1, H / 360); ctx.stroke();
        ctx.fillStyle = lavaCss(1 - age / life * 0.6, 1);
        const d = Math.max(1.2, H / 200) * (0.7 + 0.8 * r(3)); ctx.beginPath(); ctx.arc(x, y, d, 0, TAU); ctx.fill();
      });
      ctx.globalCompositeOperation = 'source-over';
    }
    function tephra(ctx, f, v, I, amt, vig, N, P, ashA, wx) {
      const H = f.h, t = f.t, n = Math.round(300 * N * Math.min(1.5, amt)), spd = H * (0.28 + 0.3 * vig), g = H * 0.9;
      // several cock's-tail jets: each a narrow cypress-shaped spray of black tephra with a steam tail
      const jets = 6, life = 1.3;
      ctx.lineCap = 'round';
      stream(n, t, life, 17, (i, age, lf, k, r) => {
        const j = i % jets, ja = (hash(j, k * 0.37 + 1.3) - 0.5) * 1.5, jp = hash(j, k * 0.11 + 9);
        if (jp > Math.min(1, amt) * 0.8 + 0.2) return;
        const a = ja + (r(1) - 0.5) * 0.14, s = spd * (0.6 + 0.4 * r(2)) * (0.8 + 0.4 * hash(j, k));
        const pos = tt => [v.x + Math.sin(a) * s * tt + wx * tt * tt * H * 0.02, v.y - Math.cos(a) * s * tt + 0.5 * g * tt * tt];
        const [x, y] = pos(age);
        if (y > I.hy + 2) return;
        const [x0, y0] = pos(Math.max(0, age - 0.08));
        const fade = 1 - age / lf;
        ctx.strokeStyle = `rgba(14,10,10,${0.9 * fade})`; ctx.lineWidth = Math.max(0.8, H / 300) * (0.5 + r(3)) * (1 + age * 0.4);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x, y); ctx.stroke();
      });
      // base surge rolling out across the water
      const sp = puff(`${P.steam[0] | 0},${P.steam[1] | 0},${P.steam[2] | 0}`, 64, 0.3);
      stream(Math.round(40 * N * Math.min(1.2, amt)), t, 4, 23, (i, age, life, k, r) => {
        const sgn = i % 2 ? 1 : -1, a = age / life;
        const x = v.x + sgn * (I.halfW * 0.1 + age * H * 0.16 * (0.6 + 0.5 * r(1))), y = I.hy - H * 0.01 - r(2) * H * 0.03 * (1 + a);
        const rad = H * 0.025 * (0.6 + 1.6 * a);
        ctx.globalAlpha = ashA * 0.35 * (1 - a) * Math.min(1, age * 4);
        ctx.drawImage(sp, x - rad, y - rad, rad * 2, rad * 2);
      });
      ctx.globalAlpha = 1;
    }
    function steamPlume(ctx, f, v, amt, vig, N, P, ashA, wx) {
      const H = f.h, t = f.t, n = Math.round(90 * N * Math.min(1.5, amt));
      const sp = puff(`${P.steam[0] | 0},${P.steam[1] | 0},${P.steam[2] | 0}`, 64, 0.3), sh = puff(`${(P.steam[0] * 0.6) | 0},${(P.steam[1] * 0.6) | 0},${(P.steam[2] * 0.65) | 0}`, 64, 0.3);
      const rise = H * (0.1 + 0.1 * vig);
      stream(n, t, 7, 29, (i, age, life, k, r) => {
        const a = age / life, h = rise * age * (1 - 0.4 * a);
        const x = v.x + (r(1) - 0.5) * H * 0.08 * (1 + a * 4) + wx * age * age * H * 0.012 * (0.5 + r(2)), y = v.y - h - H * 0.01;
        const rad = H * 0.035 * (0.6 + 2.2 * a) * (0.7 + 0.6 * r(3));
        ctx.globalAlpha = ashA * 0.6 * Math.sin(Math.PI * Math.min(1, a * 1.15)) * Math.min(1, age * 3);
        ctx.drawImage(sh, x - rad, y - rad, rad * 2, rad * 2);
        ctx.globalAlpha *= 0.8;
        ctx.drawImage(sp, x - rad * 0.8 - rad * 0.25 * wx, y - rad * 1.05, rad * 1.6, rad * 1.6);
      });
      ctx.globalAlpha = 1;
    }
    function ashColumn(ctx, f, v, I, amt, vig, N, P, ashA, wx, lightning, glowK) {
      const H = f.h, W = f.w, t = f.t, n = Math.round(170 * N * Math.min(1.6, 0.4 + amt));
      const top = H * (0.3 + 0.28 * vig) * Math.min(1.3, 0.5 + amt);   // column height
      const ash = mix3(P.ash, [50, 44, 48], 0.3), ac = `${ash[0] | 0},${ash[1] | 0},${ash[2] | 0}`;
      const lit = mix3(P.ash, mix3([255, 240, 220], [255, 120, 60], P.night * 0.7), 0.55 + 0.3 * P.night * glowK);
      const sp = puff(ac, 64, 0.3), spl = puff(`${lit[0] | 0},${lit[1] | 0},${lit[2] | 0}`, 64, 0.3);
      const life = 9;
      stream(n, t, life, 41, (i, age, lf, k, r) => {
        const a = age / lf, rt = 0.45;                                      // rise, then umbrella
        const up = Math.min(a, rt) / rt, h = top * Math.sin(up * Math.PI * 0.5);
        const spread = Math.max(0, a - rt) / (1 - rt);
        const dir = r(4) < 0.5 + 0.35 * wx ? 1 : -1;
        const x = v.x + (r(1) - 0.5) * H * 0.08 * (1 + up * 2.2) + wx * up * up * H * 0.12 + spread * dir * H * (0.25 + 0.45 * r(2)) * (1 + 0.4 * wx * dir);
        const y = v.y - h - spread * H * 0.03 * r(3) + spread * spread * H * 0.04;
        const rad = H * 0.045 * (0.7 + 1.6 * up + 1.2 * spread) * (0.7 + 0.6 * r(5));
        const al = ashA * 0.6 * Math.min(1, age * 2) * (1 - smooth(0.75, 1, a));
        ctx.globalAlpha = al; ctx.drawImage(sp, x - rad, y - rad, rad * 2, rad * 2);
        ctx.globalAlpha = al * 0.55 * (1 - 0.5 * spread);
        ctx.drawImage(spl, x - rad * 0.9 + rad * 0.25 * (P.night > 0.5 ? 0 : -0.6), y - rad * 0.9 + rad * (P.night > 0.5 ? 0.3 : -0.2), rad * 1.3, rad * 1.3);
      });
      ctx.globalAlpha = 1;
      // volcanic lightning in the column
      if (lightning > 0.02) {
        const slot = Math.floor(f.clock * 9), fl = hash(slot, 77);
        if (fl < 0.22 * Math.min(1, lightning) + 0.04) {
          const rr = hash(slot, 3.3), bx = v.x + (rr - 0.5) * H * 0.2 + wx * H * 0.08, by = v.y - top * (0.3 + 0.6 * hash(slot, 5.5));
          ctx.globalCompositeOperation = 'lighter';
          const g = ctx.createRadialGradient(bx, by, 0, bx, by, H * 0.2);
          g.addColorStop(0, 'rgba(200,210,255,0.5)'); g.addColorStop(1, 'rgba(200,210,255,0)'); ctx.fillStyle = g; ctx.fillRect(bx - H * 0.2, by - H * 0.2, H * 0.4, H * 0.4);
          ctx.strokeStyle = 'rgba(235,240,255,0.95)'; ctx.lineWidth = Math.max(1, H / 300); ctx.lineJoin = 'round';
          for (let b = 0; b < 2; b++) {
            let x = bx, y = by; ctx.beginPath(); ctx.moveTo(x, y);
            for (let s = 0; s < 14; s++) { x += (hash(slot, s + b * 20) - 0.5) * H * 0.05; y += H * 0.02 * (0.3 + hash(slot, s * 3 + b)); ctx.lineTo(x, y); }
            ctx.stroke();
          }
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    }
    function laze(ctx, f, I, amt, P, ashA, wx, N) {
      const H = f.h, t = f.t;
      const sp = puff(`${P.steam[0] | 0},${P.steam[1] | 0},${P.steam[2] | 0}`, 64, 0.3);
      const pts = [[I.shoreR, 1], [I.shoreL, -1]];
      for (const [sx, sgn] of pts) {
        stream(Math.round(36 * N * Math.min(1.4, amt)), t, 5, 53 + sgn, (i, age, life, k, r) => {
          const a = age / life, x = sx + sgn * H * 0.01 + (r(1) - 0.5) * H * 0.05 * (1 + a * 2) + wx * age * H * 0.035 * (0.6 + r(2));
          const y = I.hy - H * 0.005 - age * H * (0.06 + 0.04 * r(3)) * (1 - 0.3 * a), rad = H * 0.018 * (0.5 + 2.4 * a);
          ctx.globalAlpha = ashA * 0.5 * Math.sin(Math.PI * a) * Math.min(1, age * 3) * P.k;
          ctx.drawImage(sp, x - rad, y - rad, rad * 2, rad * 2);
        });
        // hiss of spray at the entry
        ctx.globalAlpha = 0.8 * P.k; ctx.fillStyle = 'rgba(255,255,255,0.8)';
        for (let i = 0; i < 12; i++) { const ph = fract(t * 1.3 + hash(i, 2)); ctx.fillRect(sx + (hash(i, 3) - 0.5) * H * 0.03, I.hy - ph * H * 0.03, 1.5, 1.5); }
        // glow where lava meets water
        ctx.globalCompositeOperation = 'lighter';
        const g = ctx.createRadialGradient(sx, I.hy, 0, sx, I.hy, H * 0.05);
        g.addColorStop(0, lavaCss(0.8, 0.5 * Math.min(1, amt))); g.addColorStop(1, lavaCss(0.4, 0)); ctx.fillStyle = g; ctx.fillRect(sx - H * 0.05, I.hy - H * 0.05, H * 0.1, H * 0.1);
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = 1;
    }
    function pdc(ctx, f, I, amt, P, ashA, wx, N) {
      const H = f.h, t = f.t, sgn = wx >= 0 ? 1 : -1;
      const c = mix3(P.ash, [120, 112, 108], 0.4), sp = puff(`${c[0] | 0},${c[1] | 0},${c[2] | 0}`, 64, 0.3);
      const hot = puff('255,120,50', 64, 0.3);
      stream(Math.round(110 * N * Math.min(1.5, amt)), t, 7, 61, (i, age, life, k, r) => {
        const a = age / life, speed = H * 0.22 * (0.8 + 0.5 * r(1));
        const x = I.ventX + sgn * (age * speed), onLand = sgn > 0 ? x < I.shoreR : x > I.shoreL;
        const ground = onLand ? I.y(x) : I.hy, rad = H * 0.025 * (0.6 + 2.2 * Math.min(1, a * 1.5)) * (0.7 + 0.6 * r(2));
        const y = ground - rad * 0.5 - r(3) * rad * 0.8 - (onLand ? 0 : a * H * 0.05);
        ctx.globalAlpha = ashA * 0.6 * Math.min(1, age * 2) * (1 - smooth(0.7, 1, a));
        ctx.drawImage(sp, x - rad, y - rad, rad * 2, rad * 2);
        if (P.night > 0.3 && onLand) { ctx.globalAlpha *= 0.4 * P.night; ctx.drawImage(hot, x - rad * 0.7, y - rad * 0.3, rad * 1.4, rad * 1.4); }
      });
      ctx.globalAlpha = 1;
    }
    function blastRing(ctx, f, I, amt, P) {
      const H = f.h, W = f.w, t = f.t, period = 9;
      const ph = fract(t / period), age = ph * period;
      if (age > 6) return;
      const r = age * W * 0.22, a = (1 - age / 6);
      ctx.save(); ctx.beginPath(); ctx.rect(0, I.hy, W, H - I.hy); ctx.clip();
      // pressure wave on the sea: a ring of disturbed water
      ctx.strokeStyle = `rgba(255,255,255,${0.55 * a * amt})`; ctx.lineWidth = Math.max(2, H * 0.012 * (1 - age / 8));
      ctx.beginPath(); ctx.ellipse(I.ventX, I.hy + H * 0.01, r, r * 0.16, 0, 0, TAU); ctx.stroke();
      ctx.restore();
      // and in the sky: a faint brightness ring (the shock wave seen from the side)
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(255,245,230,${0.18 * a * amt})`; ctx.lineWidth = H * 0.03 * (1 - age / 7);
      ctx.beginPath(); ctx.arc(I.ventX, I.hy, r * 1.1, Math.PI, TAU); ctx.stroke();
      if (age < 0.5) { ctx.fillStyle = `rgba(255,250,235,${(0.5 - age) * 1.2 * amt})`; ctx.fillRect(0, 0, W, H); }
      ctx.globalCompositeOperation = 'source-over';
    }
    function burst(ctx, f, v, age, s, vig, glowK, P, mode) {
      const H = f.h, g = H * 0.9, spd = H * (0.5 + 0.5 * vig);
      ctx.globalCompositeOperation = 'lighter';
      if (age < 0.4) { const gl = ctx.createRadialGradient(v.x, v.y, 0, v.x, v.y, H * 0.25 * (0.3 + age)); gl.addColorStop(0, lavaCss(1, (0.4 - age) * 1.5)); gl.addColorStop(1, lavaCss(0.6, 0)); ctx.fillStyle = gl; ctx.fillRect(v.x - H * 0.3, v.y - H * 0.3, H * 0.6, H * 0.6); }
      const black = mode === 'surtsey' || mode === 'hunga';
      for (let i = 0; i < 70; i++) {
        const a = (hash(i, 8.8) - 0.5) * 1.8, sp = spd * (0.5 + 0.7 * hash(i, 9.9)), tt = Math.min(age, 0.1 + hash(i, 1.1) * 2.4);
        const x = v.x + Math.sin(a) * sp * tt, y = v.y - Math.cos(a) * sp * tt + 0.5 * g * tt * tt;
        if (y > f.h * 0.6 + 3) continue;
        ctx.fillStyle = black && i % 2 ? `rgba(20,14,12,${s})` : lavaCss(1 - tt * 0.3, s);
        const d = Math.max(1.5, H / 180) * (0.6 + hash(i, 4)); ctx.fillRect(x, y, d, d);
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    return { render };
  }
};

export const scenes = [
  { id: 'eruption-surtsey', name: 'Surtseyan Birth', tags: ['realistic', '2d', 'surtseyan', 'eruption', 'science'],
    desc: 'Black cock\'s-tail jets of tephra arc out of the sea beside billowing steam while base surges race across the water, as at Surtsey in 1963.',
    opts: { mode: 'surtsey', seed: 1 }, params: { stage: 0.17, activity: 0.55, scale: 0.45, wind: 0.5, light: 0.75, x1: 0.55, x2: 0.6, x3: 0.5, x4: 0.25 } },
  { id: 'eruption-fountain', name: 'Curtain of Fire', tags: ['realistic', '2d', 'hawaii', 'lava', 'eruption'],
    desc: 'A Hawaiian lava fountain at the summit and a curtain of fire along a rift fissure feed glowing flows down to the sea.',
    opts: { mode: 'fountain', seed: 2 }, params: { stage: 0.36, activity: 0.6, scale: 0.55, wind: 0.5, light: 0.3, x1: 0.6, x2: 0.4, x3: 0.75, x4: 0.2 } },
  { id: 'eruption-strombolian', name: 'Strombolian Night', tags: ['realistic', '2d', 'night', 'eruption', 'lava'],
    desc: 'Glowing bombs arc out of a cinder cone at night, drawn as long-exposure streaks against the stars.',
    opts: { mode: 'strombolian', seed: 3 }, params: { stage: 0.55, activity: 0.6, scale: 0.5, wind: 0.5, light: 0.02, x1: 0.6, x2: 0.3, x3: 0.8, x4: 0.1 } },
  { id: 'eruption-plinian', name: 'Plinian Column', tags: ['realistic', '2d', 'eruption', 'science'],
    desc: 'A towering ash column rises, spreads into an umbrella cloud and is bent downwind, the signature of a Plinian eruption.',
    opts: { mode: 'plinian', seed: 4 }, params: { stage: 0.53, activity: 0.7, scale: 0.5, wind: 0.6, light: 0.85, x1: 0.7, x2: 0.7, x3: 0.4, x4: 0.35 } },
  { id: 'eruption-lightning', name: 'Volcanic Lightning', tags: ['realistic', '2d', 'night', 'eruption'],
    desc: 'Ash particles rubbing together charge the plume, and lightning flickers inside the column of a night eruption.',
    opts: { mode: 'lightning', seed: 5 }, params: { stage: 0.54, activity: 0.7, scale: 0.5, wind: 0.42, light: 0.05, x1: 0.65, x2: 0.7, x3: 0.7, x4: 0.15 } },
  { id: 'eruption-pdc', name: 'Pyroclastic Flow', tags: ['realistic', '2d', 'eruption', 'science'],
    desc: 'A collapsing column feeds a pyroclastic density current that rolls down the flank and out across the sea on a cushion of steam.',
    opts: { mode: 'pdc', seed: 6 }, params: { stage: 0.52, activity: 0.65, scale: 0.55, wind: 0.5, light: 0.6, x1: 0.6, x2: 0.75, x3: 0.5, x4: 0.4 } },
  { id: 'eruption-hunga', name: 'Hunga Tonga 2022', tags: ['realistic', '2d', 'surtseyan', 'eruption', 'science'],
    desc: 'A sea-level blast throws a giant steam-and-ash plume while a pressure wave rings out across the ocean, after 15 January 2022.',
    opts: { mode: 'hunga', seed: 7 }, params: { stage: 0.2, activity: 0.9, scale: 0.4, wind: 0.5, light: 0.7, x1: 0.9, x2: 0.8, x3: 0.5, x4: 0.3 } },
  { id: 'eruption-laze', name: 'Ocean Entry', tags: ['realistic', '2d', 'hawaii', 'lava', 'calm'],
    desc: 'Lava rivers reach the coast and raise white laze plumes where molten rock boils the sea and builds new black land.',
    opts: { mode: 'laze', seed: 8 }, params: { stage: 0.42, activity: 0.5, scale: 0.6, wind: 0.5, light: 0.28, x1: 0.4, x2: 0.5, x3: 0.8, x4: 0.25 } },
];
