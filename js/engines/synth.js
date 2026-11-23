// Vector & Neon: glowing lines. The island is a wireframe surface of revolution (rings and meridians found by
// inverting the profile per pixel), the sea a perspective grid, plumes are vector arcs, rings and strokes.
// MODE: 0 synthwave sunset, 1 Battlezone vector monitor, 2 oscilloscope XY, 3 Tron light trails,
// 4 vaporwave pastel, 5 VHS glitch, 6 thermal camera, 7 neon sign.
import { shaderEngine } from '../gl.js';

const fs = `
float T, ASP, PX, SEA, FL, HP, HC, W, WR, CX, SK, PROFP, SEED, TILT, DAY, NIGHT, GLOW, FLK;
Life L;

// ---------------------------------------------------------------- geometry
float profS(float x){ float d = min(abs(x - CX)/W, 1.); return FL + HC*(1. - pow(d, PROFP)); }
float prof(float x){
  float d = abs(x - CX)/W;
  float e = profS(x);
  float inl = smoothstep(1., .7, d);
  e += HC*(.04 + .14*L.erosion)*(fbm2(vec2(x*9. + SEED*40., uEpoch*3.1), 3.) - .5)*inl;
  e -= L.erosion*HC*.2*pow(.5 + .5*sin(x*22./SK + SEED*30.), 3.)*smoothstep(0., .25, d)*(1. - min(d, 1.));
  e -= L.caldera*HC*.16*smoothstep(.22, .04, d);
  e += L.caldera*HC*.035*smoothstep(.34, .22, d)*smoothstep(.1, .2, d);
  return e;
}
// plan radius of the ring at elevation e (smooth profile)
float rw(float e){ return W*pow(clamp((HP - e)/HC, 0., 1.), 1./PROFP); }
// (elevation, azimuth 0..PI front half, inside flag) of the front surface under a pixel
vec3 surf(vec2 uv){
  float dx = uv.x - CX;
  // solve y = e - TILT*sqrt(rw(e)^2 - dx^2) for e by bisection (monotonic in e)
  float lo = FL, hi = HP;
  for (int i = 0; i < 14; i++) {
    float e = .5*(lo + hi); float r = rw(e); float s = sqrt(max(r*r - dx*dx, 0.));
    if (e - TILT*s < uv.y) lo = e; else hi = e;
  }
  float e = .5*(lo + hi);
  float r = rw(e);
  float inside = step(abs(dx), r)*step(FL, e)*step(e, HP - 1e-4)*step(2.*PX, r);
  float a = atan(sqrt(max(r*r - dx*dx, 0.)), dx);
  return vec3(e, a, inside);
}
// anti-aliased line and glow from a distance in uv units
float core(float d, float w){ return 1. - smoothstep(w*PX*.5, w*PX*1.5, d); }
float halo(float d){ return exp(-d/(GLOW*PX)); }
// distance to the curve y = f(x) for the profile, accounting for slope
float dProfile(vec2 uv, float mask){
  float e = prof(uv.x);
  float sl = (prof(uv.x + 2.*PX) - prof(uv.x - 2.*PX))/(4.*PX);
  return abs(uv.y - e)/sqrt(1. + sl*sl) + (1. - mask)*1e3;
}
float dCircle(vec2 p, vec2 c, float r){ return abs(length(p - c) - r); }
float dSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba)/dot(ba, ba), 0., 1.); return length(pa - ba*h); }

// ---------------------------------------------------------------- vector plumes: returns (steam, tephra, fountain, ash) line intensities
vec4 plumeLines(vec2 uv){
  float vy = max(prof(CX), 0.);
  vec2 d = uv - vec2(CX, vy);
  vec4 o = vec4(0.);
  if (d.y < -.03*SK) return o;
  float wind = windDir().x, ea = eruptAmt(L);
  float st = L.steam*min(ea*1.3, 1.5);
  if (st > .01) {
    // steam: stacked rings along the bending column
    for (int i = 0; i < 7; i++) {
      float fi = float(i), t = (fi + .5)/7.;
      float h = t*1.2*st*SK;
      vec2 c = vec2(CX + (wind*h*h*1.1 + .3*wind*h)*SK + (noise2(vec2(fi*.9, T*.4)) - .5)*.06*SK, vy + h);
      float r = (.05 + .45*h)*SK*.45*(.8 + .4*noise2(vec2(fi, T*.5)));
      o.x = max(o.x, core(dCircle(uv, c, r), 1.5)*.9 + halo(dCircle(uv, c, r))*.5);
    }
    // tephra: thin drooping jets with a dot at the tip
    float r = length(d), ang = atan(d.x, d.y);
    for (int i = 0; i < 6; i++) {
      float fi = float(i), ph = T*.9 + fi*1.7;
      float len = SK*(.12 + .22*st)*(.6 + .4*sin(ph))*(.7 + .3*hash11(fi + 2.));
      float a0 = (fi/5. - .5)*1.9 + .2*sin(ph*.7 + fi) + .25*wind;
      float aj = a0 + sign(a0)*r/SK*1.1;
      float dd = abs(ang - aj)*r;
      o.y = max(o.y, (core(dd, 2.) + halo(dd*3.)*.5)*st*smoothstep(0., .02, r)*smoothstep(len, len*.85, r));
      vec2 tip = vec2(CX, vy) + vec2(sin(aj), cos(aj))*len;
      o.y = max(o.y, core(length(uv - tip) - 2.*PX, 2.)*st);
    }
  }
  float ef = ea*(1. - L.submarine)*(1. - smoothstep(.48, .6, uStage))*(1. - L.steam);
  if (ef > .01) {
    float hF = SK*(.05 + .14*ef);
    for (int i = 0; i < 9; i++) {
      float fi = float(i);
      float a = (fi/8. - .5)*.9 + (noise2(vec2(fi, T*2.)) - .5)*.4;
      float len = hF*(.5 + .5*hash11(fi + 61.))*(.8 + .2*sin(T*7. + fi));
      vec2 p0 = vec2(CX, vy), p1 = p0 + vec2(sin(a), cos(a))*len + vec2(wind*.02*SK, -len*.5);
      float dd = dSeg(uv, p0, p1);
      o.z = max(o.z, core(dd, 1.5) + halo(dd)*.6);
    }
    // gas: dotted circles above
    for (int i = 0; i < 5; i++) {
      float fi = float(i), t = (fi + .5)/5.;
      float h = hF + t*.8*ef*SK;
      vec2 c = vec2(CX + (wind*h*h*.9 + .2*wind*h)*SK, vy + h);
      float r = (.03 + .25*h)*SK*.45;
      float dd = dCircle(uv, c, r) + step(.5, fract(atan(uv.y - c.y, uv.x - c.x)*4.))*1e3;
      o.w = max(o.w, core(dd, 1.2)*.6*ef);
    }
  }
  float ex = L.expl*(1. - L.steam)*uActivity*2.;
  if (ex > .01) {
    float pulse = smoothstep(.2, .9, sin(T*.35 + SEED*6.)*.5 + .5);
    for (int i = 0; i < 6; i++) {
      float fi = float(i), t = (fi + .5)/6.;
      float h = (t*.9*ex*pulse + .02)*SK;
      vec2 c = vec2(CX + (wind*h*h*.8 + .25*wind*h)*SK, vy + h);
      float r = (.05 + .4*h)*SK*.45;
      float dd = dCircle(uv, c, r) + step(.5, fract(atan(uv.y - c.y, uv.x - c.x)*3. + T))*1e3;
      o.w = max(o.w, (core(dd, 1.3)*.7 + halo(dd)*.3)*ex*pulse);
    }
  }
  return o;
}
// ocean-entry steam as little rings
float lazeLines(vec2 uv){
  float ef = eruptAmt(L)*(1. - L.submarine)*(1. - smoothstep(.45, .6, uStage))*(1. - L.steam)*smoothstep(.2, .26, uStage);
  if (ef < .01) return 0.;
  float o = 0., wind = windDir().x;
  for (int s = 0; s < 2; s++) for (int i = 0; i < 4; i++) {
    float fi = float(i), t = (fi + .5)/4., h = t*.4*ef*SK;
    float sx = CX + (float(s)*2. - 1.)*W;
    vec2 c = vec2(sx + (wind*h*h*1.5 + wind*h*.2)*SK, h);
    float r = (.025 + .3*h)*SK*.4;
    o = max(o, core(dCircle(uv, c, r), 1.2)*.7*ef);
  }
  return o;
}

// ---------------------------------------------------------------- the wireframe island: (edge lines, mesh lines, lava lines, fill mask)
vec4 wire(vec2 uv, float meshN){
  vec4 o = vec4(0.);
  vec3 s = surf(uv);
  float above = step(0., uv.y);
  // silhouette: the real profile above the sea; the smooth cone below it
  float dp = dProfile(uv, 1.);
  float ds = abs(uv.y - profS(uv.x))/1.4 + step(0., uv.y)*1e3;   // underwater part only
  float sil = (core(dp, 2.) + halo(dp)*.6)*step(.001, prof(uv.x))*step(uv.y, prof(uv.x) + .02)*above + (core(ds, 1.2)*.5 + halo(ds)*.25)*step(FL, uv.y)*step(uv.y, HP)*(1. - above);
  o.x = sil;
  if (s.z > .5) {
    // rings every de of elevation and meridians every PI/meshN
    float de = max(HC/meshN, .01);
    float ring = abs(fract(s.x/de + .5) - .5)*de;
    float rr = rw(s.x);
    float mer = abs(fract(s.y*meshN/PI + .5) - .5)*PI/meshN*max(rr*sin(s.y), .003);
    float dm = min(ring*mix(1., .3, abs(TILT)), mer);
    float dim = mix(.35, 1., above);
    o.y = (core(dm, 1.2)*.8 + halo(dm)*.35)*dim;
    o.w = 1.;
    // lava: glowing dashes running down a few meridians
    float flow = eruptAmt(L)*(1. - L.submarine)*(1. - smoothstep(.5, .62, uStage));
    if (flow > .01 && above > .5) {
      float mid = floor(s.y*meshN/PI);
      float on = step(1. - min(flow, 1.)*.5, hash11(mid*3.1 + SEED*10. + floor(uEpoch)));
      float dash = smoothstep(.3, .5, fract(s.x*30. + T*.8 + hash11(mid)));
      o.z = (core(mer, 2.5) + halo(mer)*.8)*on*dash*smoothstep(HP, HP - .05*SK, s.x)*step(0., s.x);
    }
  }
  return o;
}
// reef ring on the sea plane: (ring line, lagoon fill, motu dots)
vec3 reefLines(vec2 uv){
  if (L.reef < .02) return vec3(0.);
  vec2 q = vec2(uv.x - CX, (uv.y - SEA)/TILT);
  float r = length(q);
  float d = abs(r - WR)*TILT;
  float ring = (core(d, 1.5) + halo(d)*.5)*L.reef*step(uv.y, SEA + .002);
  float lag = smoothstep(WR, WR*.9, r)*(.3 + .7*L.lagoon)*L.reef*step(uv.y, SEA);
  float a = atan(q.y, q.x);
  float motu = smoothstep(.86, .96, uStage)*step(.6, noise2(vec2(a*4. + SEED*9., 1.)))*core(d - 3.*PX, 3.)*step(uv.y, SEA);
  return vec3(ring, lag, motu);
}
// perspective grid on the sea plane
float seaGrid(vec2 uv, float density){
  if (uv.y > SEA) return 0.;
  float z = .12/(SEA - uv.y + .01);
  float xw = (uv.x - CX)*z*density;
  float zw = z*density*.5 + T*.6;
  float gx = abs(fract(xw + .5) - .5)/max(fwidth(xw), 1e-4), gz = abs(fract(zw + .5) - .5)/max(fwidth(zw), 1e-4);
  float g = min(gx, gz);
  return (1. - smoothstep(.5, 1.5, g))*smoothstep(0., .04, SEA - uv.y) + exp(-g*.4)*.2;
}

vec3 NEON_M = vec3(1., .17, .84), NEON_C = vec3(.1, .9, 1.), NEON_O = vec3(1., .55, .1), NEON_Y = vec3(1., .9, .3), NEON_P = vec3(.5, .2, 1.);

// ---------------------------------------------------------------- scenes
vec4 synthwave(vec2 uv){
  vec3 col = mix(vec3(.02,.0,.08), vec3(.45,.05,.4), smoothstep(.5, -.15, uv.y))*mix(.4, 1., .5 + .5*DAY);
  col = mix(col, vec3(.95,.3,.2), smoothstep(.25, -.14, uv.y)*.6*smoothstep(0., .15, uLight));
  // striped sun
  vec2 sp = vec2(CX + .25*ASP*(SEED - .5)*0., SEA + .16*(.3 + uLight));
  float sd = length((uv - sp)*vec2(1., 1.));
  float sun = smoothstep(.17, .165, sd)*step(.5, fract(uv.y*60. + smoothstep(.0, -.1, uv.y - sp.y)*uv.y*200.) + smoothstep(.03, .1, uv.y - sp.y));
  col = mix(col, mix(NEON_Y, NEON_M, smoothstep(.1, -.1, uv.y - sp.y)), sun*step(SEA, uv.y));
  col += NEON_M*halo(max(sd - .17, 0.))*.4*step(SEA, uv.y);
  // stars
  vec2 sg = uv*50.; vec2 si = floor(sg);
  col += vec3(1.)*step(.975, hash12(si + 1.))*smoothstep(.15, .0, length(fract(sg) - .5))*NIGHT*step(SEA, uv.y);
  float skyA = 1.;
  // sea: dark plane with a magenta grid and the sun's reflection
  if (uv.y < SEA) {
    col = vec3(.03,.0,.08);
    float g = seaGrid(uv, mix(4., 12., uX2));
    col += NEON_M*g*.9 + NEON_C*g*.2;
    col += NEON_M*exp(-abs(uv.x - sp.x)*12.)*.15*(.6 + .4*sin(uv.y*200. + T*3.));
    skyA = 0.;
  }
  vec3 rl = reefLines(uv);
  col = mix(col, NEON_C*.35, rl.y); col += NEON_C*rl.x + NEON_Y*rl.z;
  vec4 wr = wire(uv, mix(6., 18., uX2));
  col = mix(col, vec3(.02,.0,.06), wr.w*step(0., uv.y)*.9);
  col += NEON_C*wr.y + NEON_M*wr.x*1.2 + NEON_O*wr.z*1.3;
  skyA *= 1. - wr.w*step(0., uv.y) - wr.x*.8;
  vec4 pl = plumeLines(uv); float lz = lazeLines(uv);
  col += vec3(1.)*pl.x + NEON_P*pl.y*1.2 + NEON_Y*pl.z*1.4 + NEON_C*pl.w*.7 + vec3(.9,.95,1.)*lz;
  skyA *= 1. - clamp(pl.x + pl.y + pl.z + pl.w + lz, 0., 1.);
  return vec4(col, clamp(skyA, 0., 1.));
}

vec4 battlezone(vec2 uv){
  vec3 g = vec3(.2, 1., .35);
  vec3 col = vec3(0., .01, 0.);
  float skyA = 1.;
  float hz = core(abs(uv.y - SEA), 1.5) + halo(abs(uv.y - SEA))*.4;
  float sea = 0.;
  if (uv.y < SEA) { float z = .12/(SEA - uv.y + .01); float zw = z*4. + T*.6; float l = abs(fract(zw + .5) - .5)/max(fwidth(zw), 1e-4); sea = (1. - smoothstep(.5, 1.5, l))*.25*step(.5, fract((uv.x - CX)*z*2. + .25)); skyA = 0.; }
  vec4 wr = wire(uv, mix(5., 14., uX2));
  vec4 pl = plumeLines(uv); float lz = lazeLines(uv);
  vec3 rl = reefLines(uv);
  float v = hz + sea + wr.x*1.2 + wr.y + wr.z*1.5 + pl.x + pl.y*1.3 + pl.z*1.5 + pl.w + lz + rl.x + rl.z;
  // HUD: reticle and frame
  vec2 c = vec2(0., .05); float rd = length(uv - c);
  float hud = core(abs(rd - .06), 1.2)*step(.6, abs(fract(atan(uv.y - c.y, uv.x - c.x)*2./PI + .125)))*.8;
  hud += core(abs(uv.x) + step(.03, abs(uv.y - c.y))*1e3, 1.2)*step(abs(uv.y - c.y), .025)*.8 + core(abs(uv.y - c.y) + step(.03, abs(uv.x))*1e3, 1.2)*.8;
  vec2 fr = abs(uv) - vec2(ASP*.5 - .03, .47);
  hud += core(abs(max(fr.x, fr.y)), 1.2)*step(.9*max(fr.x, fr.y), -0.) *step(-.02, max(fr.x, fr.y));
  v += hud*(.5 + .5*uX4);
  // phosphor flicker and a faint raster
  float fl = 1. - FLK*.25*hash11(floor(uClock*30.));
  col += g*v*fl*(.9 + .1*sin(uv.y*uRes.y*3.14));
  skyA *= 1. - clamp(v, 0., 1.);
  return vec4(col, skyA);
}

vec4 oscilloscope(vec2 uv){
  vec3 col = vec3(.02, .05, .03);
  // graticule
  vec2 gq = abs(fract(uv*5. + .5) - .5)/max(fwidth(uv.x*5.), 1e-4);
  float grat = (1. - smoothstep(.5, 1.5, min(gq.x, gq.y)))*.18 + (1. - smoothstep(.5, 1.5, min(abs(uv.x)/PX, abs(uv.y)/PX)))*.3;
  col += vec3(.2,.5,.3)*grat*(.4 + .6*uX2);
  // trace 1: the island profile with plume excursions (and ghost traces behind it)
  float v = 0.;
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float tt = T - fk*.12*uX4;
    float sweep = fract(tt*.25);
    float x = uv.x;
    float e = max(prof(x), FL*.6) ;
    float vy = max(prof(CX), 0.);
    float dxv = (x - CX)/SK;
    float spike = L.steam*smoothstep(.12, 0., abs(dxv))*(.25 + .15*sin(tt*9. + x*90.))*SK*hash11(floor(x*120. + tt*30.));
    spike += eruptAmt(L)*(1. - L.submarine)*(1. - L.erosion)*smoothstep(.03, 0., abs(dxv))*.12*SK*abs(sin(tt*20. + x*300.));
    float y = SEA + e + spike;
    float sl = (prof(x + 2.*PX) - prof(x - 2.*PX))/(4.*PX);
    float d = abs(uv.y - y)/sqrt(1. + sl*sl);
    float beam = step(x, sweep*ASP - ASP*.5)*(1. - .5*fk/4.);
    float w = (core(d, 1.5) + halo(d)*.7)*(1. - fk*.22);
    v = max(v, w*mix(.5, 1., beam));
    // the moving beam dot
    if (k == 0) { float bx = sweep*ASP - ASP*.5; float by = SEA + max(prof(bx), FL*.6); v += (core(length(uv - vec2(bx, by)) - 2.*PX, 2.) + halo(length(uv - vec2(bx, by)))*.8); }
  }
  // trace 2: the sea surface as a flat line with ripples, plus the reef ring as an XY Lissajous ellipse
  float sl2 = SEA + .006*sin(uv.x*80. + T*3.)*(1. + L.lagoon);
  float d2 = abs(uv.y - sl2);
  v = max(v, (core(d2, 1.) + halo(d2)*.3)*.6);
  vec3 rl = reefLines(uv);
  v += rl.x*.9 + rl.z;
  // trace 3: tremor across the bottom
  float tr = -.4 + .025*(noise2(vec2(uv.x*22. - T*4., 1.)) - .5)*(1. + 3.*eruptAmt(L) + 3.*L.expl);
  float d3 = abs(uv.y - tr);
  v += (core(d3, 1.) + halo(d3)*.4)*.7;
  float fl = 1. - FLK*.2*hash11(floor(uClock*40.));
  col += vec3(.35, 1., .5)*v*fl;
  col += vec3(.1,.3,.15)*exp(-length(uv)*.8)*.2;
  return vec4(col, 1. - clamp(v, 0., 1.));
}

vec4 tron(vec2 uv){
  vec3 col = vec3(.0, .01, .02);
  float skyA = 1.;
  if (uv.y < SEA) {
    float g = seaGrid(uv, mix(3., 9., uX2));
    col += NEON_C*g*.8;
    col = mix(col, vec3(.0,.04,.06), .5*step(0., SEA - uv.y));
    skyA = 0.;
  }
  vec3 rl = reefLines(uv);
  col = mix(col, NEON_C*.25, rl.y); col += NEON_C*rl.x*1.2 + vec3(1.)*rl.z;
  vec4 wr = wire(uv, mix(4., 10., uX2));
  // solid dark body with glowing edge, lava as orange light trails
  col = mix(col, vec3(.01,.02,.03), wr.w*step(0., uv.y));
  col += NEON_C*(wr.x*1.3 + wr.y*.45) + NEON_O*wr.z*1.6;
  skyA *= 1. - wr.w*step(0., uv.y) - wr.x;
  // light-trail lava: long comet dashes down the flank (extra trails beyond the meshed ones)
  float flow = eruptAmt(L)*(1. - L.submarine)*(1. - smoothstep(.5, .62, uStage));
  if (flow > .01) {
    vec3 s = surf(uv);
    if (s.z > .5 && s.x > 0.) {
      float n = 7.;
      float mid = floor(s.y*n/PI);
      float on = step(1. - min(flow, 1.)*.6, hash11(mid*7.3 + SEED*3.));
      float mer = abs(fract(s.y*n/PI + .5) - .5)*PI/n*max(rw(s.x)*sin(s.y), .003);
      float trail = pow(fract(-s.x*6./SK + T*.5*(1. + uX4) + hash11(mid)), 3.)*on;
      col += NEON_O*(core(mer, 2.) + halo(mer))*trail*2.;
    }
  }
  vec4 pl = plumeLines(uv); float lz = lazeLines(uv);
  col += vec3(1.)*pl.x*1.2 + NEON_P*pl.y*1.3 + NEON_O*pl.z*1.5 + NEON_C*pl.w + vec3(.8,.95,1.)*lz;
  skyA *= 1. - clamp(pl.x + pl.y + pl.z + pl.w + lz, 0., 1.);
  // the disc of the sun as a thin ring
  float sd = abs(length(uv - vec2(ASP*.3, SEA + .25)) - .06);
  col += NEON_C*(core(sd, 1.5) + halo(sd)*.5)*step(SEA, uv.y)*.7;
  skyA *= 1. - core(sd, 1.5)*step(SEA, uv.y);
  return vec4(col, clamp(skyA, 0., 1.));
}

vec4 vaporwave(vec2 uv){
  vec3 pink = vec3(1., .55, .8), teal = vec3(.45, .9, .9), lilac = vec3(.75, .6, 1.), cream = vec3(1., .95, .85);
  vec3 col = mix(pink, lilac, smoothstep(-.14, .5, uv.y));
  col = mix(col, cream, smoothstep(.0, -.14, uv.y)*.5);
  vec2 sp = vec2(ASP*.22, SEA + .2);
  float sd = length(uv - sp);
  float sun = smoothstep(.15, .145, sd)*step(.5, fract(uv.y*40.) + smoothstep(.0, .08, uv.y - sp.y));
  col = mix(col, mix(vec3(1.,.7,.3), vec3(1.,.4,.6), smoothstep(.1, -.1, uv.y - sp.y)), sun*step(SEA, uv.y));
  float skyA = 1.;
  if (uv.y < SEA) {
    float z = .12/(SEA - uv.y + .01);
    vec2 g = floor(vec2((uv.x - CX)*z*mix(2., 6., uX2), z*mix(2., 6., uX2)*.5 + T*.4));
    float chk = mod(g.x + g.y, 2.);
    col = mix(teal, pink*.9, chk);
    col = mix(col, cream, smoothstep(.02, .0, SEA - uv.y));
    skyA = 0.;
  }
  vec3 rl = reefLines(uv);
  col = mix(col, teal*1.05, rl.y); col = mix(col, vec3(1.), rl.x); col = mix(col, cream, rl.z);
  vec4 wr = wire(uv, mix(5., 12., uX2));
  float e = prof(uv.x);
  if (uv.y > 0. && uv.y < e) col = mix(mix(lilac*.9, teal, smoothstep(0., HP, uv.y)), mix(vec3(.4,.8,.5), teal, .5), L.veg*.8);
  col = mix(col, vec3(1.), wr.y*.5*step(0., uv.y)); col = mix(col, vec3(.25,.1,.4), wr.x*step(0., uv.y)); col = mix(col, vec3(1.,.5,.2), wr.z);
  skyA *= 1. - step(0., uv.y)*step(uv.y, e)*step(.001, e);
  // palm silhouettes in the foreground corners
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    vec2 base = vec2(-ASP*.46 + fi*ASP*.88, -.36);
    float lean = (fi*2. - 1.)*.25;
    float trunk = dSeg(uv, base, base + vec2(lean, .5));
    float palm = core(trunk - .006, 1.);
    vec2 top = base + vec2(lean, .5);
    for (int k = 0; k < 7; k++) { float a = float(k)/6.*PI; vec2 dir = vec2(cos(a), sin(a)*.5 + .1); float ds = dSeg(uv, top, top + dir*.12); palm = max(palm, core(ds - .004 + abs(dot(uv - top, dir))*.03, 1.)); }
    col = mix(col, vec3(.2,.1,.3), palm);
    skyA *= 1. - palm;
  }
  // a floating wireframe pyramid and a bust-like sphere, just because
  vec2 pc = vec2(-ASP*.3, .28 + .02*sin(T)); float pr = abs(length(uv - pc) - .05); float ptri = abs(abs(uv.x - pc.x)*1.7 + (uv.y - pc.y) - .07) + step(.0, uv.y - pc.y - .07)*1e3 + step(.07, pc.y - uv.y)*1e3;
  col = mix(col, vec3(1.), core(ptri, 1.2)*.8);
  col = mix(col, vec3(.25,.1,.4), core(abs(uv.y - pc.y + .07) + step(.045, abs(uv.x - pc.x))*1e3, 1.2)*.8);
  vec4 pl = plumeLines(uv); float lz = lazeLines(uv);
  col = mix(col, vec3(1.), pl.x); col = mix(col, vec3(.25,.1,.4), pl.y); col = mix(col, vec3(1.,.6,.2), pl.z); col = mix(col, vec3(1.), pl.w*.7 + lz);
  skyA *= 1. - clamp(pl.x + pl.y + pl.z + pl.w + lz, 0., 1.);
  // dither grain like a 90s render
  col += (hash12(floor(uv*uRes.y/2.)) - .5)*.05;
  return vec4(col, clamp(skyA, 0., 1.));
}

vec4 thermal(vec2 uv){
  // temperature field 0..1
  float t = .04;
  float skyA = 1.;
  float e = prof(uv.x);
  if (uv.y < SEA) { t = .14 + .03*noise2(vec2(uv.x*30., uv.y*80. - T)); skyA = 0.; }
  float ey = uv.y - SEA;
  if (ey > 0. && ey < e) {
    float d = abs(uv.x - CX)/W;
    float sl = (prof(uv.x + .004) - prof(uv.x - .004))/.008;
    t = .26 + .14*clamp(.5 + .9*sl*(uLight - .5), 0., 1.)*(.4 + .6*DAY) - .08*L.veg + .08*noise2(uv*40.) + .06*smoothstep(.3, 0., ey/HP);
    float flow = eruptAmt(L)*(1. - L.submarine)*(1. - smoothstep(.5, .62, uStage));
    float ch = fbm2(vec2((uv.x - CX)*9./SK + SEED*50., ey*3.5/SK + SEED), 2.);
    float lava = smoothstep(.04, .006, abs(ch - .5))*smoothstep(.03, .1, d)*min(flow, 1.);
    t = max(t, lava*(.75 + .25*noise2(vec2(uv.x*60., ey*30. - T))));
    t = max(t, .55*L.caldera*smoothstep(.15, .0, d)*(1. - L.erosion));   // warm caldera floor
    t = max(t, (1. - L.submarine)*smoothstep(.04, .0, d)*smoothstep(.35, .0, uStage - .12)*.8);  // hot vent
    skyA = 0.;
  }
  // plumes by temperature: tephra and steam warm, fountain hottest
  float vy = SEA + max(e, 0.);
  vec2 dd = uv - vec2(CX, SEA + max(prof(CX), 0.));
  float wind = windDir().x;
  if (dd.y > 0.) {
    float h = dd.y/SK, cx = (wind*h*h*1.1 + .3*wind*h)*SK;
    float n = fbm3(vec3(uv*7./SK - vec2(0., T*.5), T*.12 + SEED), 3.);
    float st = L.steam*min(eruptAmt(L)*1.3, 1.5);
    float steam = smoothstep(1., .35, abs(dd.x - cx)/((.05 + .5*h)*SK) + (n - .5)*1.2)*smoothstep(1.3*st, .1, h)*st;
    t = max(t, steam*(.5 - .25*h));
    float ef = eruptAmt(L)*(1. - L.submarine)*(1. - smoothstep(.48, .6, uStage))*(1. - L.steam);
    float hF = SK*(.05 + .14*ef);
    float fnt = smoothstep(.02*SK*(1. + dd.y/hF), 0., abs(dd.x - wind*dd.y*.15))*smoothstep(hF, hF*.3, dd.y)*step(.01, ef);
    t = max(t, fnt);
    float ash = smoothstep(1., .3, abs(dd.x - cx*.8)/((.03 + .3*h)*SK) + (n - .5)*1.4)*smoothstep(1.1*ef, hF/SK*.5, h)*smoothstep(hF/SK*.3, hF/SK, h)*ef;
    t = max(t, ash*.4);
    skyA *= 1. - clamp(steam*2. + fnt + ash, 0., 1.);
  }
  // sensor noise
  t += (hash12(floor(uv*uRes.y/2.) + floor(uClock*20.)) - .5)*.04*FLK;
  t = clamp(t*mix(.8, 1.3, uX2), 0., 1.);
  // ironbow palette
  vec3 col = t < .25 ? mix(vec3(0.,0.,.05), vec3(.35,0.,.5), t/.25)
           : t < .5 ? mix(vec3(.35,0.,.5), vec3(.9,.1,.1), (t - .25)/.25)
           : t < .75 ? mix(vec3(.9,.1,.1), vec3(1.,.7,.0), (t - .5)/.25)
           : mix(vec3(1.,.7,.0), vec3(1.), (t - .75)/.25);
  // HUD: crosshair, corner brackets, a scale bar and the hot-spot marker
  float hud = 0.;
  hud += core(abs(uv.x) + step(.04, abs(uv.y))*1e3 + step(abs(uv.y), .012)*1e3, 1.) + core(abs(uv.y) + step(.04, abs(uv.x))*1e3 + step(abs(uv.x), .012)*1e3, 1.);
  vec2 fr = abs(uv) - vec2(ASP*.5 - .04, .45);
  float brk = core(abs(max(fr.x, fr.y)), 1.2)*step(min(abs(fr.x), abs(fr.y)), 0.)*step(-.06, max(abs(fr.x), abs(fr.y)) - .0)*step(max(fr.x, fr.y), .003);
  hud += brk*step(-.06, min(fr.x, fr.y));
  vec2 hot = vec2(CX, SEA + max(prof(CX), 0.) + .01);
  vec2 hb = abs(uv - hot) - .03;
  hud += core(abs(max(hb.x, hb.y)), 1.2)*step(max(hb.x, hb.y), .002)*(1. - L.submarine)*step(.001, HP)*(.5 + .5*sin(uClock*4.));
  // scale bar at the right
  vec2 sb = uv - vec2(ASP*.5 - .07, 0.);
  if (abs(sb.x) < .012 && abs(sb.y) < .3) { float tt = sb.y/.6 + .5; col = tt < .25 ? mix(vec3(0.,0.,.05), vec3(.35,0.,.5), tt/.25) : tt < .5 ? mix(vec3(.35,0.,.5), vec3(.9,.1,.1), (tt - .25)/.25) : tt < .75 ? mix(vec3(.9,.1,.1), vec3(1.,.7,.0), (tt - .5)/.25) : mix(vec3(1.,.7,.0), vec3(1.), (tt - .75)/.25); skyA = 0.; }
  hud += core(abs(max(abs(sb.x) - .013, abs(sb.y) - .301)), 1.)*step(max(abs(sb.x) - .013, abs(sb.y) - .301), .002);
  hud += core(abs(sb.y - .3) + step(.03, abs(sb.x - .025))*1e3, 1.) + core(abs(sb.y + .3) + step(.03, abs(sb.x - .025))*1e3, 1.);
  col = mix(col, vec3(1.), hud*uX4);
  skyA *= 1. - hud*uX4;
  return vec4(col, skyA);
}

// neon sign: tubes on a brick wall
vec4 neon(vec2 uv){
  // brick wall
  vec2 bq = uv*vec2(10., 24.);
  bq.x += step(.5, fract(bq.y*.5))*.5;
  vec2 bf = fract(bq);
  float mortar = smoothstep(.0, .07, bf.x)*smoothstep(1., .93, bf.x)*smoothstep(.0, .12, bf.y)*smoothstep(1., .88, bf.y);
  vec3 brick = mix(vec3(.22,.1,.08), vec3(.35,.17,.12), hash12(floor(bq)))*(.8 + .3*noise2(uv*60.));
  vec3 col = mix(vec3(.12,.1,.09), brick, mortar)*.35;
  // tubes: colour, distance; unlit tubes show as dim glass
  float g = 0.; vec3 lit = vec3(0.);
  vec3 litc = vec3(0.);
  float on;
  // sea: zigzag tube across the sign
  float zz = SEA + .025*abs(fract(uv.x*6. + T*.2) - .5)*2. - .012;
  float dsea = abs(uv.y - zz)/1.2 + step(ASP*.45, abs(uv.x))*1e3;
  on = 1.;
  litc += NEON_C*(core(dsea, 3.) + halo(dsea)*.8)*on; g = max(g, core(dsea, 3.));
  // island outline: the smooth profile as a tube (lit once the island is above the sea; dim glass while a seamount)
  float e = profS(uv.x);
  float dis = abs(uv.y - SEA - e)/1.3 + step(e, .002)*1e3;
  float dsub = abs(uv.y - SEA - e)/1.3 + step(uv.y, FL + SEA)*1e3;
  float onI = step(.001, HP)*(1. - .5*smoothstep(.9, .97, uStage));
  float flick = 1. - FLK*step(.93, hash11(floor(uClock*22.) + 7.))*.9;
  vec3 ic = mix(NEON_M, vec3(.2,1.,.4), L.veg);
  litc += ic*(core(dis, 3.) + halo(dis)*.9)*onI*flick; g = max(g, core(dis, 3.)*onI);
  col += vec3(.25)*core(dsub, 2.5)*(1. - onI)*.6;                 // unlit glass of the submerged cone
  // reef ring: dotted cyan tube around the base
  if (L.reef > .05) { vec2 q = vec2(uv.x - CX, (uv.y - SEA)/.3); float dr = abs(length(q) - WR)*.3 + step(.5, fract(atan(q.y, q.x)*8.))*1e3; litc += NEON_C*(core(dr, 2.5) + halo(dr)*.8)*L.reef; g = max(g, core(dr, 2.5)); }
  // lava tubes down the flanks
  float flow = eruptAmt(L)*(1. - L.submarine)*(1. - smoothstep(.5, .62, uStage));
  for (int i = 0; i < 4; i++) {
    float fi = float(i), side = fi < 2. ? -1. : 1.;
    float x0 = CX + side*W*(.08 + .12*fi), x1 = x0 + side*W*(.5 + .2*hash11(fi + 3.));
    vec2 a = vec2(x0, SEA + max(profS(x0), 0.) - .01), b = vec2(x1, SEA + max(profS(x1), 0.));
    float dl = dSeg(uv, a, b) + step(flow, .02)*1e3;
    float blink = step(.3, fract(T*.7 + fi*.25));
    litc += NEON_O*(core(dl, 3.) + halo(dl))*min(flow, 1.)*blink; g = max(g, core(dl, 3.)*step(.02, flow));
  }
  // steam: three ring tubes, chasing on and off; tephra: two arcs
  float vy = SEA + max(profS(CX), 0.);
  float st = L.steam*min(eruptAmt(L)*1.3, 1.5), wind = windDir().x;
  for (int i = 0; i < 3; i++) {
    float fi = float(i); float h = (.08 + .1*fi)*SK; vec2 c = vec2(CX + wind*h*1.2, vy + h); float r = (.03 + .025*fi)*SK;
    float dc = dCircle(uv, c, r) + step(st, .02)*1e3;
    float chase = step(fi/3., fract(T*.8))*step(fract(T*.8), 1.);
    litc += vec3(1.)*(core(dc, 3.) + halo(dc)*.8)*st*mix(.3, 1., chase); g = max(g, core(dc, 3.)*step(.02, st));
  }
  for (int i = 0; i < 2; i++) {
    float side = float(i)*2. - 1.;
    vec2 c = vec2(CX + side*.12*SK, vy); float r = .12*SK;
    float ang = atan(uv.y - c.y, uv.x - c.x);
    float darc = dCircle(uv, c, r) + step(st, .02)*1e3 + step(0., -(uv.y - c.y))*1e3 + step(0., side*(uv.x - c.x))*1e3;
    litc += NEON_P*(core(darc, 3.) + halo(darc))*st; g = max(g, core(darc, 3.)*step(.02, st));
  }
  // a fountain tube: short vertical with a fan, while the shield builds
  float ef = eruptAmt(L)*(1. - L.submarine)*(1. - smoothstep(.48, .6, uStage))*(1. - L.steam);
  for (int i = 0; i < 3; i++) { float a = (float(i) - 1.)*.5; vec2 b = vec2(CX, vy) + vec2(sin(a), cos(a))*.11*SK*(.8 + .2*sin(T*6. + float(i))); float df = dSeg(uv, vec2(CX, vy), b) + step(ef, .02)*1e3; litc += NEON_Y*(core(df, 3.) + halo(df))*min(ef, 1.); g = max(g, core(df, 3.)*step(.02, ef)); }
  // the sun / moon tube
  vec2 sc = vec2(ASP*.33, SEA + .3); float ds = dCircle(uv, sc, .07);
  vec3 scol = mix(vec3(.8,.85,1.), NEON_Y, DAY);
  litc += scol*(core(ds, 3.) + halo(ds)*.8)*(.4 + .6*step(.1, fract(T*.1 + .5)));
  g = max(g, core(ds, 3.));
  // compose: the wall catches the glow, tubes have a white-hot core
  col += litc*.9;
  col = mix(col, vec3(1.), g*.35*smoothstep(.0, 1., length(litc)));
  // a mounting frame
  vec2 fr = abs(uv) - vec2(ASP*.47, .46); float dfr = abs(max(fr.x, fr.y));
  col += vec3(.3,.3,.32)*core(dfr, 2.)*.6;
  return vec4(col, 0.);
}

void main(){
  ASP = uRes.x/uRes.y; T = uTime; PX = 1./uRes.y;
  vec2 uv = gl_FragCoord.xy/uRes.y - vec2(ASP*.5, .5);
  L = life(uStage);
  SEED = fract(uSeed*7. + uEpoch*.618);
  SK = mix(.55, 1.3, uSize);
  SEA = -.14; FL = -.3;
  HP = sign(L.h)*pow(abs(L.h), .7)*.3*SK;
  HP = max(HP, .05*SK*L.steam*(1. - L.submarine));
  HC = HP - FL;
  CX = (SEED - .5)*.25*ASP;
  W = max(.03, (.12 + .9*smoothstep(.1, .5, uStage))*(1. - .55*smoothstep(.78, .96, uStage))*SK*min(1., .44*ASP/(1.02*SK)));
  float WFULL = 1.02*SK*min(1., .44*ASP/(1.02*SK));
  WR = max(W*1.08, WFULL*.95*L.reef);
  PROFP = mix(1.15, 1.9, smoothstep(.15, .45, uStage));
  TILT = .22;
  DAY = smoothstep(.0, .5, uLight); NIGHT = 1. - smoothstep(.0, .25, uLight);
  GLOW = mix(2., 16., uX1);
  FLK = uX3;
  vec4 r;
  // the vector scenes work in a frame where sea level is y = 0; the others keep SEA
  float SEA0 = SEA;
#if defined(MODE_1)
  SEA = 0.; r = battlezone(uv - vec2(0., SEA0));
#elif defined(MODE_2)
  r = oscilloscope(uv);
#elif defined(MODE_3)
  SEA = 0.; r = tron(uv - vec2(0., SEA0));
#elif defined(MODE_4)
  SEA = 0.; r = vaporwave(uv - vec2(0., SEA0));
#elif defined(MODE_5)
  // VHS glitch over the synthwave scene: row tearing, chroma split, tracking noise, block mosh
  float row = floor(uv.y*uRes.y/3.);
  float tear = (hash11(row + floor(uClock*12.)) - .5)*step(.8 + .19*(1. - FLK), hash11(floor(uClock*7.) + row*.1))*.3*FLK;
  float band = smoothstep(.04, .0, abs(fract(uClock*.15) - .5 - uv.y*.9 + .45))*.03*FLK;
  vec2 q = uv + vec2(tear + band + (hash11(floor(uClock*30.)) - .5)*.004*FLK, 0.);
  vec2 blk = floor(q*vec2(6., 10.)); float mosh = step(.96 - .1*FLK, hash12(blk + floor(uClock*4.)))*FLK;
  q += (hash22(blk) - .5)*.08*mosh;
  float ca = (.003 + .01*FLK)*(1. + band*30.);
  SEA = 0.;
  vec4 a = synthwave(q - vec2(0., SEA0)), b = synthwave(q + vec2(ca, 0.) - vec2(0., SEA0)), c = synthwave(q - vec2(ca, 0.) - vec2(0., SEA0));
  r = vec4(b.r, a.g, c.b, a.a);
  // static, tracking bar, scanlines
  float stat = hash12(floor(uv*uRes.y/1.5) + floor(uClock*60.));
  r.rgb = mix(r.rgb, vec3(stat), .08*FLK + band*8.);
  r.rgb *= .85 + .15*sin(uv.y*uRes.y*3.14*(1. - .5*uX4));
  r.rgb = mix(r.rgb, r.rgb*vec3(1.1,.95,1.05), .5);
  r.a = clamp(r.a - band*20., 0., 1.);
#elif defined(MODE_6)
  r = thermal(uv);
#elif defined(MODE_7)
  r = neon(uv);
#else
  SEA = 0.; r = synthwave(uv - vec2(0., SEA0));
  r.rgb *= .92 + .08*sin(uv.y*uRes.y*3.14)*uX4;
#endif
  finish(clamp(r.rgb, 0., 1.6), r.a);
}
`;

export default shaderEngine({
  id: 'synth',
  name: 'Vector & Neon',
  fs,
  res: 1,
  sky: true,
  defaults: { MODE: 0 },
  params: [
    { id: 'x1', label: 'Glow', value: 0.5, tip: 'Width of the light bloom around every line' },
    { id: 'x2', label: 'Grid', value: 0.5, tip: 'Density of the wireframe mesh and the sea grid (thermal: gain)' },
    { id: 'x3', label: 'Flicker', value: 0.4, tip: 'Phosphor flicker, sensor noise, VHS damage' },
    { id: 'x4', label: 'Trails', value: 0.5, tip: 'Persistence, light-trail speed, HUD and scanline strength' },
  ],
});

export const scenes = [
  { id: 'synth-synthwave', name: 'Synthwave Sunset', tags: ['neon', 'retro', 'abstract', 'lava', 'eruption'],
    desc: 'A striped sun sets behind a wireframe shield volcano on a neon grid sea; lava runs down the mesh in orange dashes.',
    opts: { MODE: 0 }, params: { stage: 0.36, grow: 0.3, activity: 0.6, scale: 0.55, light: 0.3, x1: 0.5, x2: 0.5, x3: 0.3, x4: 0.5 } },
  { id: 'synth-battlezone', name: 'Vector Monitor', tags: ['neon', 'retro', 'abstract', 'surtseyan', 'eruption'],
    desc: 'Green phosphor vectors on a black monitor, Battlezone-style: a wireframe cone, drooping tephra jets and a reticle.',
    opts: { MODE: 1 }, params: { stage: 0.17, grow: 0.4, activity: 0.6, scale: 0.55, light: 0.8, x1: 0.6, x2: 0.5, x3: 0.5, x4: 0.6 } },
  { id: 'synth-scope', name: 'Oscilloscope', tags: ['neon', 'retro', 'science', 'diagram', 'eruption'],
    desc: 'One sweeping trace draws the island’s profile on a graticule, spiking with each blast; a tremor trace runs beneath.',
    opts: { MODE: 2 }, params: { stage: 0.16, grow: 0.5, activity: 0.7, scale: 0.6, light: 0.8, x1: 0.55, x2: 0.5, x3: 0.4, x4: 0.6 } },
  { id: 'synth-tron', name: 'Light Trails', tags: ['neon', 'night', 'lava', 'abstract'],
    desc: 'Tron-like: a black island edged in cyan light, with orange lava trails streaking down its flanks over a glowing grid.',
    opts: { MODE: 3 }, params: { stage: 0.4, grow: 0.3, activity: 0.7, scale: 0.55, light: 0.1, x1: 0.6, x2: 0.5, x3: 0.2, x4: 0.6 } },
  { id: 'synth-vaporwave', name: 'Vaporwave Lagoon', tags: ['retro', 'abstract', 'cartoon', 'atoll', 'calm'],
    desc: 'Pastel pink and teal, a checkerboard sea, palms and a wireframe pyramid around a sinking island inside its reef.',
    opts: { MODE: 4 }, params: { stage: 0.84, grow: 0.3, activity: 0.5, scale: 0.55, light: 0.6, x1: 0.3, x2: 0.5, x3: 0.2, x4: 0.4 } },
  { id: 'synth-glitch', name: 'VHS Datamosh', tags: ['neon', 'retro', 'abstract', 'eruption'],
    desc: 'The synthwave tape is damaged: tearing rows, chroma split, tracking bands and moshed blocks as the island runs its life.',
    opts: { MODE: 5 }, params: { stage: 0.3, grow: 0.6, activity: 0.6, scale: 0.55, light: 0.3, x1: 0.5, x2: 0.5, x3: 0.6, x4: 0.5 } },
  { id: 'synth-thermal', name: 'Thermal Camera', tags: ['science', 'realistic', 'lava', 'hawaii', 'night'],
    desc: 'False-colour infrared: cold sea, warm slopes, white-hot lava channels and fountain, with a crosshair and scale bar.',
    opts: { MODE: 6 }, params: { stage: 0.38, grow: 0.3, activity: 0.7, scale: 0.6, light: 0.2, x1: 0.3, x2: 0.5, x3: 0.4, x4: 0.8 } },
  { id: 'synth-neon', name: 'Neon Sign', tags: ['neon', 'night', 'poster', 'abstract', 'lava'],
    desc: 'A flickering neon sign on a brick wall: magenta island tube, cyan zigzag sea, orange lava tubes and chasing steam rings.',
    opts: { MODE: 7 }, params: { stage: 0.34, grow: 0.45, activity: 0.6, scale: 0.6, light: 0.1, x1: 0.6, x2: 0.5, x3: 0.5, x4: 0.5 } },
];
