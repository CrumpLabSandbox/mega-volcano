// From Orbit: the island seen from space. MODE 0: an oblique astronaut photo (sea plane, scattered cumulus with
// shadows, the raymarched island, a volumetric plume and its shadow); MODE 1: nadir true colour (also used for the
// THERMAL false-colour variant); MODE 2: a globe with the Hawaiian–Emperor chain riding over a fixed hotspot;
// MODE 3: the 2022 Hunga Tonga umbrella cloud with its pressure-wave ring. No open sky: the frame is all Earth.
// Drag pans the camera or turns the globe.
import { shaderEngine } from '../gl.js';
import { ISLAND_GLSL } from './_island.js';

const fs = ISLAND_GLSL + `
float T, DAY, NIGHT, OCTM, ERUPT, CH;
vec3 SUN, SUNC, AMBC, VENT;
vec3 PCOL, PEMIT;

// ---------- clouds: a scattered-cumulus layer at altitude CH
float cloudField(vec2 xz){
  vec2 q = xz*(.9/I_R)*mix(1.4, .6, uX3) + windDir()*T*.02 + I_SEED*9.;
  float n = fbm2(q, OCTM) *.7 + fbm2(q*3.1 + 4., 2.)*.3;
  float cov = mix(.02, .55, uX2);
  return smoothstep(1. - cov - .08, 1. - cov + .12, n);
}

// ---------- plume density (column + Surtseyan jets + laze + fountain) with the cloud layer folded in
float plumeDensity(vec3 p){
  float d = 0.; PCOL = vec3(0.); PEMIT = vec3(0.);
  float e = ERUPT; vec3 q = p - VENT; float h = q.y; vec2 wd = windDir();
  float colE = e*(1. - IL.submarine);
  if (colE > .01 && h > 0.) {
    float H = I_R*(.8 + .6*min(colE, 1.5))*mix(.5, 1.5, uX4);
    float u = h/H;
    if (u < 1.2) {
      vec2 off = q.xz - wd*(h*h/H)*1.1 - wd*h*.2;
      float rad = I_R*(.05 + .05*colE) + h*.2 + I_R*(.35 + .35*min(colE, 1.))*smoothstep(.6, 1., u)*smoothstep(1.2, .95, u);
      float dr = length(off)/rad;
      if (dr < 1.25) {
        float n = fbm3(vec3(off.x, h - T*I_R*.35, off.y)*(2.6/I_R) + I_SEED*5., OCTM - 1.);
        float dens = smoothstep(.0, .55, (1. - dr) + (n - .5)*1.3)*(1. - smoothstep(.85, 1.2, u))*smoothstep(0., .06, u)*mix(1.2, 2.4, min(colE, 1.));
        float ash = mix(.3, .95, IL.expl)*(1. - .35*u);
        d += dens; PCOL += mix(vec3(.95,.94,.93), vec3(.22,.2,.19), ash)*dens;
      }
    }
  }
  if (IL.steam > .01) {
    float js = IL.steam*min(e, 1.5);
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float pulse = smoothstep(.1, .55, .5 + .5*sin(T*2.2 + fk*1.9 + I_SEED*20.));
      float ak = hash11(I_SEED*3.1 + fk*7.7)*TAU;
      float tilt = .3 + .3*hash11(fk*4.3 + I_SEED);
      vec3 dir = normalize(vec3(cos(ak)*sin(tilt), cos(tilt), sin(ak)*sin(tilt)));
      float len = I_R*(.5 + .4*hash11(fk + 9.))*js*pulse;
      float s = dot(q, dir);
      if (s > 0. && s < len) {
        vec3 arc = dir*s - vec3(0., .55*s*s/max(len, .01), 0.);
        float perp = length(q - arc);
        float w = I_R*(.03 + .08*s/len);
        float jd = smoothstep(w, w*.25, perp)*(1. - .6*s/len);
        d += jd*7.; PCOL += vec3(.05,.045,.04)*jd*7.;
      }
    }
    float sh = h + .05*I_R;
    if (sh > 0. && sh < .9*I_R) {
      vec2 off = q.xz - wd*sh*sh*(1.2/I_R);
      float dr = length(off)/(I_R*(.12 + .35*sh/I_R));
      if (dr < 1.2) {
        float n = fbm3(vec3(off.x, sh - T*I_R*.3, off.y)*(3./I_R) + I_SEED, 2.5);
        float sd = smoothstep(0., .6, (1. - dr) + (n - .5)*1.4)*smoothstep(.9, .5, sh/I_R)*js*3.;
        d += sd; PCOL += vec3(.95)*sd;
      }
    }
  }
  float lz = (1. - IL.submarine)*(1. - IL.erosion)*min(e, 1.5)*smoothstep(.22, .3, I_STAGE);
  if (lz > .01 && p.y > -.02*I_R && p.y < .5*I_R) {
    for (int k = 0; k < 2; k++) {
      float ak = hash11(I_SEED*7.7 + float(k)*2.1)*TAU + float(k)*2.4;
      vec2 sp = vec2(cos(ak), sin(ak))*I_SHORE*islShape(ak);
      float on = lavaFlow(sp*.96, T);
      if (on < .04) continue;
      vec2 off = p.xz - sp - wd*p.y*p.y*(1.5/I_R);
      float dr = length(off)/(I_R*(.06 + .3*p.y/I_R));
      if (dr < 1.2) {
        float n = fbm3(vec3(off.x, p.y - T*I_R*.3, off.y)*(4./I_R) + float(k)*3., 2.5);
        float sd = smoothstep(0., .6, (1. - dr) + (n - .5)*1.3)*smoothstep(.5, .25, p.y/I_R)*lz*2.5*smoothstep(.04, .2, on);
        d += sd; PCOL += vec3(.97)*sd;
      }
    }
  }
  if (colE > .02 && IL.erosion < .99 && h > -.02*I_R) {
    float fh = I_R*(.1 + .2*min(colE, 1.5));
    if (h < fh) {
      float rad = I_R*.03 + .05*I_R*h/fh;
      float fd = smoothstep(rad, rad*.2, length(q.xz))*(1. - IL.erosion);
      d += fd*4.; PCOL += vec3(.2)*fd*4.; PEMIT += lavaColor(.92 - .3*h/fh)*fd*6.;
    }
  }
  if (d > 1e-4) PCOL /= d;
  return d;
}
float plumeShadow(vec3 p){
  if (SUN.y < .03) return 1.;
  float d = 0.;
  if (ERUPT*(1. - IL.submarine) > .02) {
    float ts = (VENT.y + .8*I_R - p.y)/SUN.y;
    d += plumeDensity(p + SUN*ts) + plumeDensity(p + SUN*ts*.5)*.5;
  }
#ifdef CLOUDS_1
  d += cloudField((p + SUN*((CH + .04*I_R - p.y)/SUN.y)).xz)*3.;
#endif
  return exp(-d*.35);
}
vec4 plumeMarch(vec3 ro, vec3 rd, float tmax, float steps){
  float top = max(I_PEAK, 0.) + 1.9*I_R*mix(.5, 1.5, uX4);
  float t0, t1;
  if (abs(rd.y) < 1e-4) { t0 = 0.; t1 = tmax; }
  else { float a = (-.05*I_R - ro.y)/rd.y, b = (top - ro.y)/rd.y; t0 = max(min(a, b), 0.); t1 = min(max(a, b), tmax); }
  vec2 oc = ro.xz; float rr = 3.*I_R;
  float bq = dot(oc, rd.xz), cq = dot(oc, oc) - rr*rr, aq = dot(rd.xz, rd.xz);
  float disc = bq*bq - aq*cq;
  if (disc < 0.) return vec4(0., 0., 0., 1.);
  float sq = sqrt(disc);
  float tc0 = (-bq - sq)/max(aq, 1e-5), tc1 = (-bq + sq)/max(aq, 1e-5);
  if (aq < 1e-5) { tc0 = 0.; tc1 = tmax; }
  t0 = max(t0, tc0); t1 = min(t1, tc1);
  if (t1 <= t0) return vec4(0., 0., 0., 1.);
  float dt = (t1 - t0)/steps;
  float t = t0 + dt*hash12(gl_FragCoord.xy + fract(uClock)*17.);
  vec3 sum = vec3(0.); float Tr = 1.;
  vec3 lavaGlow = vec3(1., .4, .1)*ERUPT*(1. - IL.submarine)*(1. - IL.erosion)*(.25 + 1.2*NIGHT);
  for (int i = 0; i < 40; i++) {
    if (float(i) >= steps || Tr < .03) break;
    vec3 p = ro + rd*t;
    float d = plumeDensity(p);
    if (d > .002) {
      vec3 alb = PCOL, em = PEMIT;
      vec3 toS = normalize(p - VENT + vec3(0., .001, 0.));
      float side = .5 + .5*dot(toS, SUN);
      float sh = 1.;
      if (uDetail > .45) { float ds = plumeDensity(p + SUN*.15*I_R); sh = exp(-ds*.35); }
      float hN = clamp((p.y - VENT.y)/I_R, 0., 2.);
      vec3 light = SUNC*(.4 + .6*side)*sh + AMBC*(.7 + .3*min(hN, 1.)) + lavaGlow*exp(-hN*3.5)*(.4 + .6*(1. - side));
#ifdef THERMAL_1
      light = vec3(1.); alb = vec3(.06); em *= .2;
#endif
      float a = 1. - exp(-d*dt*2.2);
      sum += Tr*a*(alb*light + em*(1. + NIGHT));
      Tr *= 1. - a;
    }
    t += dt;
  }
  return vec4(sum, Tr);
}

// ---------- island
float terrainMarch(vec3 ro, vec3 rd, float tmax){
  float top = max(I_PEAK, 0.) + .35*I_R;
  float t = 0.;
  if (ro.y > top) { if (rd.y >= 0.) return -1.; t = (ro.y - top)/(-rd.y); }
  if (t > tmax) return -1.;
  float lh = 0., ly = 0., dt = .01;
  for (int i = 0; i < 90; i++) {
    vec3 p = ro + rd*t;
    float h = islandH(p.xz, OCTM);
    if (p.y < h) { if (i > 0) t -= dt*(h - p.y)/((h - p.y) + (ly - lh)); return t; }
    dt = clamp((p.y - h)*.6, .006*I_R, .3*I_R);
    lh = h; ly = p.y; t += dt;
    if (t > tmax) return -1.;
  }
  return -1.;
}
vec3 terrainNormal(vec2 xz, float eps){
  float hx = islandH(xz + vec2(eps, 0.), OCTM) - islandH(xz - vec2(eps, 0.), OCTM);
  float hz = islandH(xz + vec2(0., eps), OCTM) - islandH(xz - vec2(0., eps), OCTM);
  return normalize(vec3(-hx, 2.*eps, -hz));
}
vec3 shadeLand(vec3 p, vec3 n){
  float r = length(p.xz), a = atan(p.z, p.x + 1e-5);
  float slope = 1. - n.y;
  float hN = clamp(p.y/(I_PEAKH*I_R), 0., 1.);
  float tex = fbm2(p.xz*(14./I_R) + I_SEED, 3.);
  vec3 basalt = vec3(.05,.045,.045)*(.7 + .6*tex);
  vec3 oldRock = mix(vec3(.26,.2,.14), vec3(.42,.34,.25), tex);
  vec3 rock = mix(basalt, oldRock, smoothstep(.0, .6, IL.veg + .6*IL.erosion));
  vec3 veg = mix(vec3(.08,.28,.06), vec3(.28,.44,.11), tex);
  float vegM = IL.veg*smoothstep(.6, .22, slope)*smoothstep(1.05, .55, hN)*(.6 + .4*smoothstep(.4, .6, tex));
  float lv = lavaFlow(p.xz, T);
  vegM *= 1. - smoothstep(0., .08, lv);
  vec3 alb = mix(rock, veg, vegM);
  alb = mix(alb, vec3(.03), smoothstep(0., .12, lv)*(1. - lv*.5));
  float sand = smoothstep(.04*I_R, .006*I_R, abs(p.y))*max(IL.reef, IL.erosion*.6)*smoothstep(.5, .15, slope);
  float motu = IL.lagoon*smoothstep(I_REEF*.8*islShape(a), I_REEF*.9*islShape(a), r);
  alb = mix(alb, vec3(.82,.76,.6), clamp(sand + motu, 0., 1.));
  alb = mix(alb, vec3(.04,.04,.045), IL.steam*.8);
#ifdef THERMAL_1
  return vec3(.38 + .08*hN + .6*lv);
#endif
  float dif = max(dot(n, SUN), 0.);
  vec3 col = alb*(AMBC*(.55 + .45*n.y) + SUNC*dif*plumeShadow(p));
  col += lavaColor(.35 + .65*lv)*smoothstep(.02, .3, lv)*(1.2 + 2.5*NIGHT);
  return col;
}
vec3 shadeSea(vec3 ro, vec3 rd, float tW){
  vec3 p = ro + rd*tW;
  float r = length(p.xz), a = atan(p.z, p.x + 1e-5);
  float depth = max(-islandH(p.xz, 2.5), 0.);
  float dn = clamp(depth/(.3*I_R), 0., 1.);
  vec3 deep = vec3(.008,.05,.14), shallow = vec3(.04,.5,.52), sandc = vec3(.72,.76,.6);
  vec3 wc = mix(mix(sandc, shallow, smoothstep(0., .2, dn)), deep, smoothstep(.08, 1., dn));
  // swell texture and sun glint
  float wf = (1.2/I_R)*SEAF;
  float w = fbm2(p.xz*wf + T*vec2(.3, .15), 2.);
  float wx = fbm2((p.xz + vec2(.05*I_R, 0.))*wf + T*vec2(.3, .15), 2.) - w;
  float wz = fbm2((p.xz + vec2(0., .05*I_R))*wf + T*vec2(.3, .15), 2.) - w;
  vec3 nrm = normalize(vec3(-wx*GLINTW, .3, -wz*GLINTW));
  float stain = IL.submarine*ERUPT*smoothstep(-1., -.25, IL.h)*smoothstep(.6*I_R, .05*I_R, r)*1.3;
  if (stain > .001) { float bub = fbm2(p.xz*(6./I_R) - T*vec2(.1, .25), 3.); wc = mix(wc, vec3(.35,.5,.4), stain*(.6 + .4*bub)); wc = mix(wc, vec3(.8,.85,.8), stain*smoothstep(.62, .75, bub)*.8); }
  float fn = fbm2(p.xz*(10./I_R) + T*vec2(.6, .3), 3.);
  float reefR = I_REEF*islShape(a);
  float foam = smoothstep(.035*I_R, .0, depth)*smoothstep(.35, .6, fn)*(1. - IL.lagoon*smoothstep(reefR*.9, reefR*.6, r));
  float surf = IL.reef*(1. - smoothstep(0., .08*I_R, abs(r - reefR)))*smoothstep(.4, .65, fn);
  wc = mix(wc, vec3(.92,.95,.97), clamp(foam + surf*.9, 0., 1.));
#ifdef THERMAL_1
  return vec3(.2 - .06*dn + .5*lavaFlow(p.xz, T)*smoothstep(.05*I_R, 0., depth)*(1. - IL.submarine));
#endif
  float sh = plumeShadow(p);
  vec3 col = wc*(AMBC*1.1 + SUNC*.55*sh);
  float glint = pow(max(dot(reflect(rd, nrm), SUN), 0.), GLINTP)*smoothstep(-.02, .1, SUN.y);
  col += SUNC*glint*GLINTK*sh*(.6 + .4*fbm2(p.xz*(8./I_R) + T*vec2(.5, .2), 2.));
  float lv = lavaFlow(p.xz, T)*smoothstep(.05*I_R, 0., depth)*(1. - IL.submarine);
  col += lavaColor(.75)*lv*(1.5 + 2.*NIGHT);
  col += vec3(1., .35, .08)*ERUPT*(1. - IL.submarine)*(1. - IL.erosion)*NIGHT*exp(-max(r - I_SHORE, 0.)/(.4*I_R))*.25;
  col += vec3(.8,.15,.03)*IL.submarine*ERUPT*NIGHT*smoothstep(-.8, -.1, IL.h)*smoothstep(.3*I_R, .0, r)*.4;
  return col;
}
vec3 ironbow(float t){
  t = clamp(t, 0., 1.);
  vec3 c = vec3(0.);
  c = mix(vec3(.02,.0,.08), vec3(.35,.0,.55), smoothstep(.0, .25, t));
  c = mix(c, vec3(.9,.1,.1), smoothstep(.25, .5, t));
  c = mix(c, vec3(1.,.7,.0), smoothstep(.5, .75, t));
  c = mix(c, vec3(1.,1.,.85), smoothstep(.75, 1., t));
  return c;
}

#ifdef MODE_2
// ---------- the globe and the Hawaiian–Emperor chain
vec3 islandOnGlobe(vec2 uvt, float stage, float big, inout float bathy, float t){
  // returns an rgb modulation + alpha in bathy (0 = none) for one chain island at tangent-plane origin
  Life L = life(min(stage, 1.));
  float drowned = smoothstep(1., 1.25, stage);
  float r = length(uvt);
  float R = big*(.04 + .02*clamp(L.h, 0., 1.));
  float reefR = R*1.25 + .006*big;
  float sh = 1. + .25*(noise2(normalize(uvt + 1e-4)*2.5 + stage*7.) - .5);
  r /= sh;
  vec3 col = vec3(0.);
  float a = 0.;
  if (L.h > 0.) {
    float land = 1. - smoothstep(R*.9, R, r);
    vec3 fresh = vec3(.06,.05,.05), green = vec3(.1,.3,.08), brown = vec3(.3,.25,.16);
    vec3 lc = mix(mix(fresh, brown, L.erosion), green, L.veg*.8);
    float lv = (1. - L.submarine)*(1. - L.erosion)*L.erupt*2.*uActivity*smoothstep(R*.5, 0., r);
    lc += lavaColor(.7)*lv*(.5 + 2.*NIGHT);
    col = mix(col, lc, land); a = max(a, land);
  }
  // reef and lagoon
  float ring = L.reef*(1. - smoothstep(0., R*.3, abs(r - reefR)))*(1. - drowned);
  float lag = L.reef*smoothstep(reefR, reefR*.6, r)*(1. - a)*(1. - drowned);
  col = mix(col, vec3(.1,.6,.6), lag*.9); a = max(a, lag*.9);
  col = mix(col, vec3(.85,.9,.9), ring*.9); a = max(a, ring*.9);
  // a drowned guyot / seamount: a lighter bathymetric blob
  bathy += (drowned + L.submarine)*.5*(1. - smoothstep(R*1.2, R*2.2, r));
  return col*a + vec3(-1.)*(1. - a)*0.; // alpha is returned via the caller's reading of a
}
#endif

void main(){
  T = uTime + uSeed*100.;
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  DAY = uLight; NIGHT = 1. - smoothstep(0., .25, DAY);
  float sa = mix(-.12, 1.15, DAY);
  SUN = normalize(vec3(sin(SUNAZ)*cos(sa), sin(sa), cos(SUNAZ)*cos(sa)));
  SUNC = mix(vec3(1., .45, .2), vec3(1., .97, .92), smoothstep(.0, .42, DAY))*2.1*smoothstep(-.1, .08, SUN.y);
  AMBC = mix(vec3(.02,.03,.06), vec3(.4,.5,.68), smoothstep(-.1, .55, DAY));
  OCTM = mix(2.5, 5., uDetail);
  Life L = life(uStage);
  float R = mix(1.0, 2.6, uSize);
  islandSetup(L, uStage, R, .9, 2., 1.7, uEpoch*3.7 + uSeed*11., .34, .14);
  I_ROUGH = mix(.4, 1.8, uX1);
  ERUPT = eruptAmt(L);
  VENT = vec3(0., max(I_PEAK, -.02*I_R) - IL.caldera*I_CAL*I_R*.6, 0.);
  CH = .55*I_R;
  vec3 col = vec3(0.);

#ifdef MODE_2
  // ---- globe
  {
  float spin = uDrag.x*1.5 + uTime*.008 + SPIN0;
  float tiltA = clamp(.35 - uDrag.y*1.2, -1.2, 1.2);
  vec3 ro = vec3(0., 0., 3.4);
  vec3 rd = normalize(vec3(uv*.72, -1.));
  float b = dot(ro, rd), c = dot(ro, ro) - 1.;
  float disc = b*b - c;
  // stars
  vec3 sq = rd*300.; col = vec3(step(.997, hash13(floor(sq))))*.7;
  vec3 sunW = normalize(vec3(sin(SUNAZ)*cos(.3), .3, cos(SUNAZ)*cos(.3)));
  sunW = normalize(mix(vec3(-1., .2, .4), vec3(.4, .3, 1.), uLight));
  if (disc > 0.) {
    float t = -b - sqrt(disc);
    vec3 p = ro + rd*t; vec3 n = p;
    // rotate into the globe's frame
    vec3 q = p; q.yz = rot2(q.yz, tiltA); q.xz = rot2(q.xz, spin);
    float lat = asin(clamp(q.y, -1., 1.)), lon = atan(q.x, q.z);
    // ocean + continents
    float cont = fbm2(vec2(lon*1.3, lat*2.) + 3.7, 5.);
    float landM = smoothstep(.58, .62, cont);
    vec3 ocean = mix(vec3(.01,.05,.16), vec3(.02,.1,.25), fbm2(vec2(lon, lat)*6., 3.));
    vec3 land = mix(vec3(.12,.2,.08), vec3(.4,.33,.2), fbm2(vec2(lon, lat)*9., 3.));
    vec3 g = mix(ocean, land, landM);
    // the chain: tangent plane around the hotspot
    vec3 H = normalize(vec3(-.05, -.25, .95));
    vec3 east = normalize(cross(vec3(0., 1., 0.), H)), north = cross(H, east);
    float bathy = 0., chainNear = 0.;
    if (dot(q, H) > .3) {
      vec2 uvt = vec2(dot(q, east), dot(q, north))/dot(q, H);
      float big = mix(.6, 1.6, uSize);
      vec3 acc = vec3(0.); float accA = 0.;
      // drift: the plate carries the chain NW; island 0 sits on the hotspot and ages with the Stage control
      for (int k = 0; k < 11; k++) {
        float fk = float(k);
        float s = fk*.075*big;
        vec2 dir = fk < 7. ? normalize(vec2(-.72, .69)) : normalize(vec2(-.3, .95));
        vec2 cpos = fk < 7. ? dir*s : normalize(vec2(-.72, .69))*(6.*.075*big) + dir*(s - 6.*.075*big);
        float st = uStage + fk*.13;
        float dum = 0.;
        chainNear = max(chainNear, 1. - smoothstep(.04*big, .12*big, length(uvt - cpos)));
        vec3 ic = islandOnGlobe(uvt - cpos, st, big*(1. - .03*fk), bathy, T);
        float ia = clamp(length(ic)*3., 0., 1.);
        acc = mix(acc, ic, ia); accA = max(accA, ia);
      }
      g = mix(g, g + vec3(.03,.08,.12), clamp(bathy, 0., 1.));
      g = mix(g, acc, accA);
      // the hotspot: a red glow under island 0
      float hs = exp(-dot(uvt, uvt)/(.0025*big*big))*(.6 + .4*sin(T*1.5));
      g += vec3(.9,.15,.03)*hs*.6;
      // plume from the youngest island
      float colE = ERUPT*(1. - IL.submarine);
      if (colE > .02) {
        vec2 wd = windDir();
        float along = dot(uvt, wd), across = dot(uvt, vec2(-wd.y, wd.x));
        float pl = smoothstep(.0, .02*big, along + .01*big)*smoothstep(.3*big*colE, 0., along)*(1. - smoothstep(0., (.01 + .08*along/big)*big, abs(across)));
        pl *= .5 + .5*fbm2(uvt*60. - vec2(T*.3, 0.), 3.);
        g = mix(g, vec3(.9), pl*.9);
      }
    }
    // clouds
    float cl = smoothstep(.58, .74, fbm2(vec2(lon*2. - T*.01, lat*3.) + 11., 5.)*.7 + fbm2(vec2(lon, lat)*12., 3.)*.3)*(1. - chainNear);
    g = mix(g, vec3(.95), cl*.9);
    // lighting with a terminator; night side keeps the lava and hotspot glow
    float dif = dot(n, sunW);
    float day = smoothstep(-.1, .25, dif);
    vec3 lit = g*(.03 + 1.1*max(dif, 0.)) ;
    lit += g*vec3(.1,.15,.3)*.3*(1. - day);
    // specular on the ocean
    lit += vec3(1.,.95,.85)*pow(max(dot(reflect(rd, n), sunW), 0.), 80.)*.35*(1. - landM)*(1. - cl);
    // atmosphere rim
    float fr = pow(1. - max(dot(-rd, n), 0.), 3.);
    lit += vec3(.3,.5,1.)*fr*(.35 + .65*day);
    col = lit;
  } else {
    // thin atmospheric halo just off the limb
    float dd = sqrt(max(c + 1. - b*b, 0.)) - 1.;
    col += vec3(.25,.45,1.)*exp(-dd*22.)*.8;
  }
  col = 1. - exp(-col*1.2);
  finish(col, 0.);
  return;
  }
#endif

#ifdef MODE_3
  // ---- Hunga Tonga umbrella, seen from geostationary height
  {
    vec2 g = uv*mix(14., 6., uSize)*I_R;
    g += (uDrag*vec2(1., 1.))*I_R*3.;
    float phase = fract(T/60.);
    float e = clamp(uActivity*2., .2, 2.);
    float Ru = I_R*(.35 + 4.2*smoothstep(0., .85, phase))*e;   // umbrella radius grows then holds
    float r = length(g);
    // sea
    float depth = max(-islandH(g, 2.5), 0.);
    float dn = clamp(depth/(.3*I_R), 0., 1.);
    vec3 sea = mix(mix(vec3(.6,.7,.6), vec3(.05,.45,.5), smoothstep(0., .2, dn)), vec3(.01,.05,.14), smoothstep(.08, 1., dn));
    sea *= .8 + .2*fbm2(g*(1.5/I_R) + T*.05, 3.);
    // island (tuff cone) below
    float hL = islandH(g, OCTM);
    vec3 ground = sea;
    if (hL > 0.) { vec3 n = terrainNormal(g, .01*I_R); ground = shadeLand(vec3(g.x, hL, g.y), n); }
    // ambient cloud field
    float cf = smoothstep(.5, .72, fbm2(g*(.25/I_R) + vec2(T*.01, 0.) + I_SEED, 4.));
    // the pressure wave: a ring racing out at ~300 m/s, well beyond the umbrella
    float Rp = I_R*(.4 + 14.*phase);
    float pw = exp(-pow((r - Rp)/(.25*I_R), 2.));
    cf = clamp(cf + pw*.5*(1. - cf) - pw*.3*cf, 0., 1.);
    ground = mix(ground, vec3(.9), cf*.8);
    // umbrella shadow
    vec2 so = vec2(SUN.x, SUN.z)/max(SUN.y, .2)*1.6*I_R;
    float shad = 1. - smoothstep(Ru*.95, Ru*1.05, length(g + so));
    ground *= 1. - shad*.6;
    ground *= .3 + .7*smoothstep(-.1, .3, SUN.y);
    // umbrella top: cauliflower + concentric gravity waves + an overshooting dome
    float u = r/Ru;
    float caul = 1. - worley2(g*(4./I_R) + I_SEED) ;
    float caul2 = 1. - worley2(g*(12./I_R) + 5.);
    float waves = .5 + .5*sin(r*(30./Ru)*1.5 - T*2.);
    float edge = 1. - smoothstep(.85, 1.02, u + (caul - .5)*.12);
    vec3 top = vec3(.95, .95, .97)*(.35 + .45*caul + .2*caul2)*(.75 + .25*waves*smoothstep(.2, .7, u));
    top = mix(top, top*vec3(.75,.7,.68), smoothstep(.5, .1, u)*.5);
    float dome = smoothstep(.22, .0, u);
    top = mix(top, vec3(1.3), dome*.6);
    top *= 1.7;
    // lighting: sun from its side; the dome throws a shadow across the umbrella
    vec2 gd = normalize(g + 1e-5);
    float side = .5 + .5*dot(gd, normalize(SUN.xz + 1e-5))*smoothstep(0., 1., u);
    top *= .45 + .75*side;
    float domeSh = smoothstep(.26, .2, length(g + so*.25))*(1. - dome);
    top *= 1. - domeSh*.5;
    top *= .25 + .75*smoothstep(-.1, .3, SUN.y);
    // lightning at the edge
    float fl = step(.93, hash11(floor(uClock*9.) + I_SEED))*smoothstep(.3, 1., u)*(.5 + .5*noise2(g*(3./I_R) + floor(uClock*9.)));
    top += vec3(.9,.9,1.)*fl*.8;
    col = mix(ground, top, edge);
    col = 1. - exp(-col*1.3);
    finish(col, 0.);
    return;
  }
#endif

  // ---- camera over the sea plane (oblique or nadir)
  float yaw = YAW + uDrag.x*1.2 + T*ORBIT;
  float pitch = clamp(PITCH + uDrag.y*.8, .3, 1.55);
  float dist = DIST*I_R;
  vec3 ta = vec3(0., 0., 0.);
  vec3 ro = ta + dist*vec3(cos(pitch)*sin(yaw), sin(pitch), cos(pitch)*cos(yaw));
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(fw, vec3(0., 1., 0.))), up = cross(rt, fw);
  vec3 rd = normalize(fw*FOV + uv.x*rt + uv.y*up);
  float tW = rd.y < 0. ? -ro.y/rd.y : 1e4;
  float tT = terrainMarch(ro, rd, tW);
  float tHit;
  if (tT > 0.) { vec3 p = ro + rd*tT; col = shadeLand(p, terrainNormal(p.xz, .003*I_R)); tHit = tT; }
  else { col = shadeSea(ro, rd, tW); tHit = tW; }
  // atmosphere between the camera and the ground
#ifndef THERMAL_1
  float hz = 1. - exp(-tHit*HAZE/I_R*(1. - .6*NIGHT));
  col = mix(col, mix(vec3(.55,.65,.85), vec3(1.,.6,.4), smoothstep(.4, .1, DAY))*AMBC*1.6, hz*.6);
#endif
#ifdef CLOUDS_1
  if (rd.y < 0.) {
    float tc = (CH - ro.y)/rd.y;
    if (tc > 0. && tc < tHit) {
      vec3 cp = ro + rd*tc;
      float ca = cloudField(cp.xz);
      if (ca > .001) {
        float e = .04*I_R;
        float gx = cloudField(cp.xz + vec2(e, 0.)) - ca, gz = cloudField(cp.xz + vec2(0., e)) - ca;
        vec3 cn = normalize(vec3(-gx*3., 1., -gz*3.));
        float puffs = .7 + .3*fbm2(cp.xz*(6./I_R) + I_SEED, 3.);
        vec3 cc = vec3(.98)*puffs*(AMBC*1.2 + SUNC*(.35 + .65*max(dot(cn, SUN), 0.)));
        col = mix(col, cc, smoothstep(0., .6, ca));
      }
    }
  }
#endif
  vec4 pl = plumeMarch(ro, rd, tHit, mix(14., 32., uDetail));
  col = col*pl.a + pl.rgb;
#ifdef THERMAL_1
  // false colour: scan lines and an ironbow palette
  float v = col.r;
  v += (hash12(gl_FragCoord.xy + fract(uClock)*3.) - .5)*.03;
  col = ironbow(v);
  col *= .9 + .1*step(.5, fract(gl_FragCoord.y*.5));
#else
  col = 1. - exp(-col*1.15*EXPO);
  col = pow(col, vec3(.93));
#endif
  finish(col, 0.);
}`;

export default shaderEngine({
  id: 'orbit', name: 'From Orbit', fs, res: 0.65, sky: false,
  defaults: { MODE: 0, CLOUDS: 1, THERMAL: 0, YAW: 0.4, PITCH: 0.75, DIST: 4.5, FOV: 1.8, ORBIT: 0.0, SUNAZ: 2.4, HAZE: 0.12, EXPO: 1.0, SEAF: 1.0, GLINTW: 2.5, GLINTP: 40.0, GLINTK: 0.5, SPIN0: 0.0 },
  params: [
    { id: 'x1', label: 'Rugged', value: 0.5, tip: 'Flank roughness' },
    { id: 'x2', label: 'Clouds', value: 0.35, tip: 'Cumulus cover around the island' },
    { id: 'x3', label: 'Cloud size', value: 0.5, tip: 'Size of the cumulus cells' },
    { id: 'x4', label: 'Plume', value: 0.5, tip: 'Height of the eruption column' },
  ]
});

const d = (id, name, desc, opts, params, tags = []) => ({ id: 'orbit-' + id, name, desc, opts, params, tags: ['space', 'realistic', ...tags] });
export const scenes = [
  d('astronaut', 'Astronaut Photo', 'An oblique view from the space station: the erupting island, cumulus around it, and the ash plume throwing a long shadow across the sea.',
    { DIST: 3.6 }, { stage: 0.38, light: 0.75, activity: 0.6, wind: 0.55, scale: 0.6, x2: 0.4, x3: 0.5, x4: 0.5 }, ['3d', 'eruption']),
  d('nadir', 'Nadir True Colour', 'Straight down, like a Landsat scene: black flows, laze plumes at the coast, turquoise reef flats and the sea darkening with depth.',
    { MODE: 1, PITCH: 1.52, DIST: 4.2, FOV: 1.6, YAW: 0.0 }, { stage: 0.44, light: 0.85, activity: 0.55, wind: 0.5, x2: 0.25 }, ['map', 'eruption']),
  d('globe', 'Hotspot Chain', 'The whole conveyor belt on a globe: the plate carries the chain of islands off the hotspot, so they age from erupting shield to atoll to drowned seamount, with the Emperor bend. Drag to turn.',
    { MODE: 2 }, { stage: 0.36, light: 0.7, activity: 0.5, scale: 0.55 }, ['hawaii', 'diagram', 'science']),
  d('night', 'Night Pass', 'The dark side of the planet: incandescent flows and the fountain light the plume from below while moonlight glints on the sea.',
    { PITCH: 0.9, DIST: 3.8, SUNAZ: 1.2 }, { stage: 0.4, light: 0.02, activity: 0.7, wind: 0.5, x2: 0.3 }, ['night', 'lava']),
  d('thermal', 'Thermal Infrared', 'A false-colour infrared image: the fountain and flows burn white and yellow, the cold ash plume top is purple, the sea cool blue.',
    { MODE: 1, THERMAL: 1, CLOUDS: 0, PITCH: 1.52, DIST: 4.2, FOV: 1.6, YAW: 0.0 }, { stage: 0.4, light: 0.6, activity: 0.7, wind: 0.5 }, ['science', 'map', 'lava']),
  d('hunga', 'Hunga Tonga Umbrella', 'The 15 January 2022 explosion from a weather satellite: an umbrella cloud spreading hundreds of kilometres, an overshooting dome, gravity-wave ripples, lightning, and the pressure wave racing out across the sea.',
    { MODE: 3 }, { stage: 0.18, light: 0.75, activity: 0.6, scale: 0.4, speed: 0.55 }, ['eruption', 'surtseyan', 'science']),
  d('glint', 'Sunglint Pass', 'Low sun straight ahead: the whole sea turns to glint and the island and its plume stand as silhouettes with a bright laze shore.',
    { PITCH: 0.5, DIST: 4.0, SUNAZ: 3.6, YAW: 0.5, GLINTP: 40.0, GLINTK: 0.9 }, { stage: 0.3, light: 0.25, activity: 0.55, wind: 0.4, x2: 0.3 }, ['3d', 'eruption']),
  d('atoll', 'Atoll from Orbit', 'Nadir over the end of the story: a ring of reef and motu around a pale lagoon, with the barrier stage a drag of the Stage slider away.',
    { MODE: 1, PITCH: 1.52, DIST: 4.0, FOV: 1.6, CLOUDS: 1 }, { stage: 0.95, light: 0.9, activity: 0.5, scale: 0.6, x2: 0.3 }, ['atoll', 'map', 'calm']),
];
