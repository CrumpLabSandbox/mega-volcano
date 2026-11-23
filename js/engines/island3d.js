// Island 3D: a raymarched heightfield island in an animated ocean, with a volumetric plume (ash column bent by the
// wind, white laze where lava meets the sea, black Surtseyan jets during the breach), glowing lava flows and a lava
// fountain, under a sun-lit sky. The island's shape comes from the shared life-cycle heightfield (_island.js).
// Drag to orbit. STEEP picks the island-arc stratovolcano profile.
import { shaderEngine } from '../gl.js';
import { ISLAND_GLSL } from './_island.js';

const fs = ISLAND_GLSL + `
float T, DAY, NIGHT, OCTM, OCTW, ERUPT, SKYA;
vec3 SUN, SUNC, AMBC, VENT;
vec3 PCOL, PEMIT;

vec3 skyAll(vec3 rd){
  vec3 c = skyColor(rd, SUN, DAY);
  float st = smoothstep(.22, .0, DAY)*smoothstep(-.02, .12, rd.y);
  if (st > .001) {
    vec3 q = rd*260.;
    float s = step(.9965, hash13(floor(q)))*pow(hash13(floor(q) + 7.), 2.);
    c += s*st*.9;
    // moon glow opposite the sun
    vec3 moon = normalize(vec3(-SUN.x, .45, -SUN.z));
    c += vec3(.3,.35,.5)*pow(max(dot(rd, moon), 0.), 40.)*.35*st;
  }
  return c;
}

// ---------- terrain
float terrainMarch(vec3 ro, vec3 rd, float tmax, float steps){
  float top = max(I_PEAK, 0.) + .35*I_R;
  float t = 0.;
  if (ro.y > top) { if (rd.y >= 0.) return -1.; t = (ro.y - top)/(-rd.y); }
  if (t > tmax) return -1.;
  float lh = 0., ly = 0., dt = .01;
  for (int i = 0; i < 160; i++) {
    if (float(i) >= steps) break;
    vec3 p = ro + rd*t;
    float h = islandH(p.xz, OCTM);
    if (p.y < h) {
      if (i > 0) t -= dt*(h - p.y)/((h - p.y) + (ly - lh));
      return t;
    }
    dt = clamp((p.y - h)*.55, .006*I_R + .002*t, .35*I_R);
    lh = h; ly = p.y;
    t += dt;
    if (t > tmax) return -1.;
  }
  return -1.;
}
vec3 terrainNormal(vec2 xz, float eps){
  float hx = islandH(xz + vec2(eps, 0.), OCTM) - islandH(xz - vec2(eps, 0.), OCTM);
  float hz = islandH(xz + vec2(0., eps), OCTM) - islandH(xz - vec2(0., eps), OCTM);
  return normalize(vec3(-hx, 2.*eps, -hz));
}
float terrainShadow(vec3 p){
  if (SUN.y < .02) return 0.;
  float s = 1., t = .04*I_R;
  for (int i = 0; i < 7; i++) {
    vec3 q = p + SUN*t;
    float h = islandH(q.xz, 2.);
    s = min(s, smoothstep(-.02*I_R, .06*I_R, q.y - h));
    t *= 1.7;
  }
  return s;
}

// ---------- plume: density at p; also sets PCOL (albedo, weighted) and PEMIT (emission)
float plumeDensity(vec3 p){
  float d = 0.; PCOL = vec3(0.); PEMIT = vec3(0.);
  float e = ERUPT;
  vec3 q = p - VENT;
  float h = q.y;
  vec2 wd = windDir();
  float colE = e*(1. - IL.submarine);
  // main column: gas and ash
  if (colE > .01 && h > 0.) {
    float H = I_R*(.7 + .5*min(colE, 1.5))*mix(.45, 1.5, uX4);
    float u = h/H;
    if (u < 1.2) {
      vec2 off = q.xz - wd*(h*h/H)*BEND*1.6 - wd*h*BEND*.25;
      float rad = I_R*(.06 + .05*colE) + h*.2 + I_R*(.3 + .3*min(colE, 1.))*smoothstep(.6, 1., u)*smoothstep(1.2, .95, u);
      float dr = length(off)/rad;
      if (dr < 1.25) {
        vec3 np = vec3(off.x, h - T*I_R*.35, off.y)*(2.6/I_R);
        float n = fbm3(np + I_SEED*5., OCTW);
        float dens = smoothstep(.0, .55, (1. - dr) + (n - .5)*1.3)*(1. - smoothstep(.85, 1.2, u))*smoothstep(0., .06, u);
        dens *= mix(1.1, 2.2, min(colE, 1.));
        float ash = mix(.3, .95, IL.expl)*(1. - .35*u);
        vec3 c = mix(vec3(.93,.91,.9), vec3(.2,.18,.17), ash);
        d += dens; PCOL += c*dens;
      }
    }
  }
  // Surtseyan cock's-tail jets: black tephra arcs, pulsing out of the sea
  if (IL.steam > .01) {
    float js = IL.steam*min(e, 1.5);
    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      float pulse = smoothstep(.1, .55, .5 + .5*sin(T*2.2 + fk*1.9 + I_SEED*20.));
      float ak = hash11(I_SEED*3.1 + fk*7.7)*TAU + .3*sin(T*.4 + fk);
      float tilt = .25 + .35*hash11(fk*4.3 + I_SEED);
      vec3 dir = normalize(vec3(cos(ak)*sin(tilt), cos(tilt), sin(ak)*sin(tilt)));
      float len = I_R*(.5 + .5*hash11(fk + 9.))*js*pulse;
      vec3 qj = q + vec3(0., .05*I_R, 0.);
      float s = dot(qj, dir);
      if (s > 0. && s < len) {
        // gravity bends the arc over
        vec3 arc = dir*s - vec3(0., .55*s*s/max(len, .01), 0.);
        float perp = length(qj - arc);
        float w = I_R*(.025 + .08*s/len);
        float jd = smoothstep(w, w*.25, perp)*(1. - .6*s/len)*(.6 + .4*noise3(qj*(9./I_R) - vec3(0., T*2., 0.)));
        d += jd*7.; PCOL += vec3(.05,.045,.04)*jd*7.;
      }
    }
    // billowing white steam around the vent
    float sh = h + .05*I_R;
    if (sh > 0. && sh < .9*I_R) {
      vec2 off = q.xz - wd*sh*sh*(1.2/I_R)*BEND;
      float rad = I_R*(.12 + .35*sh/I_R);
      float dr = length(off)/rad;
      if (dr < 1.2) {
        float n = fbm3(vec3(off.x, sh - T*I_R*.3, off.y)*(3./I_R) + I_SEED, OCTW);
        float sd = smoothstep(0., .6, (1. - dr) + (n - .5)*1.4)*smoothstep(.9, .5, sh/I_R)*js*3.;
        d += sd; PCOL += vec3(.95,.95,.96)*sd;
      }
    }
  }
  // laze: white steam where lava flows pour into the sea
  float lz = (1. - IL.submarine)*(1. - IL.erosion)*min(e, 1.5)*smoothstep(.22, .3, I_STAGE);
  if (lz > .01 && p.y > -.02*I_R && p.y < .6*I_R) {
    for (int k = 0; k < 2; k++) {
      float ak = hash11(I_SEED*7.7 + float(k)*2.1)*TAU + float(k)*2.4;
      vec2 sp = vec2(cos(ak), sin(ak))*I_SHORE*islShape(ak);
      float on = lavaFlow(sp*.96, T);
      if (on < .04) continue;
      vec2 off = p.xz - sp - wd*p.y*p.y*(1.5/I_R);
      float rad = I_R*(.07 + .3*p.y/I_R);
      float dr = length(off)/rad;
      if (dr < 1.2) {
        float n = fbm3(vec3(off.x, p.y - T*I_R*.3, off.y)*(4./I_R) + float(k)*3., OCTW);
        float sd = smoothstep(0., .6, (1. - dr) + (n - .5)*1.3)*smoothstep(.6, .3, p.y/I_R)*lz*2.5*smoothstep(.04, .2, on);
        d += sd; PCOL += vec3(.97)*sd;
      }
    }
  }
  // lava fountain at the vent (emissive)
  if (colE > .02 && IL.erosion < .99 && h > -.02*I_R) {
    float fh = I_R*(.12 + .22*min(colE, 1.5))*(.8 + .2*sin(T*7. + I_SEED*3.));
    if (h < fh) {
      float rad = I_R*.025 + .06*I_R*h/fh;
      float fd = smoothstep(rad, rad*.2, length(q.xz))*(.5 + .5*noise3(q*(18./I_R) - vec3(0., T*6., 0.)))*(1. - IL.erosion);
      d += fd*4.; PCOL += vec3(.2)*fd*4.;
      PEMIT += lavaColor(.92 - .3*h/fh)*fd*6.;
    }
  }
  if (d > 1e-4) PCOL /= d;
  return d;
}

vec4 plumeMarch(vec3 ro, vec3 rd, float tmax, float steps){
  // bounding slab: between the sea surface and the top of the plume
  float top = max(I_PEAK, 0.) + 1.8*I_R*mix(.45, 1.5, uX4);
  float t0, t1;
  if (abs(rd.y) < 1e-4) { t0 = 0.; t1 = tmax; }
  else { float a = (-.05*I_R - ro.y)/rd.y, b = (top - ro.y)/rd.y; t0 = max(min(a, b), 0.); t1 = min(max(a, b), tmax); }
  // and a horizontal radius around the island
  vec2 oc = ro.xz; float rr = 3.2*I_R;
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
  for (int i = 0; i < 48; i++) {
    if (float(i) >= steps || Tr < .03) break;
    vec3 p = ro + rd*t;
    float d = plumeDensity(p);
    if (d > .002) {
      vec3 alb = PCOL, em = PEMIT;
      // light: sun from its side, one cheap shadow sample up-sun, sky ambient, lava glow from below
      vec3 toS = normalize(p - VENT + vec3(0., .001, 0.));
      float side = .5 + .5*dot(toS, SUN);
      float sh = 1.;
      if (uDetail > .45) { float ds = plumeDensity(p + SUN*.18*I_R); sh = exp(-ds*.35); }
      float hN = clamp((p.y - VENT.y)/I_R, 0., 2.);
      vec3 light = SUNC*side*sh*1.1 + AMBC*(.7 + .3*min(hN, 1.)) + lavaGlow*exp(-hN*3.5)*(.4 + .6*(1. - side));
      float a = 1. - exp(-d*dt*2.2);
      sum += Tr*a*(alb*light + em*(1. + NIGHT));
      Tr *= 1. - a;
    }
    t += dt;
  }
  return vec4(sum, Tr);
}
float plumeShadow(vec3 p){
  if (SUN.y < .03 || ERUPT*(1. - IL.submarine) < .02) return 1.;
  float ymid = VENT.y + .9*I_R;
  float ts = (ymid - p.y)/SUN.y;
  vec3 q = p + SUN*ts;
  float d = plumeDensity(q) + plumeDensity(p + SUN*ts*.5)*.5;
  return exp(-d*.3);
}

// ---------- shading
vec3 shadeLand(vec3 p, vec3 n, float t){
  float r = length(p.xz), a = atan(p.z, p.x + 1e-5);
  float slope = 1. - n.y;
  float hN = clamp(p.y/(I_PEAKH*I_R), 0., 1.);
  float tex = fbm2(p.xz*(14./I_R) + I_SEED, 3.);
  vec3 basalt = vec3(.055,.05,.05)*(.7 + .6*tex);
  vec3 oldRock = mix(vec3(.24,.19,.14), vec3(.4,.32,.24), tex);
  float ageing = smoothstep(.0, .6, IL.veg + .6*IL.erosion);
  vec3 rock = mix(basalt, oldRock, ageing);
  vec3 veg = mix(vec3(.09,.3,.07), vec3(.3,.46,.12), tex);
  veg = mix(veg, vec3(.05,.2,.05), smoothstep(.5, .9, hN)*.6);
  float vegM = IL.veg*smoothstep(.6, .22, slope)*smoothstep(1.05, .55, hN)*(.6 + .4*smoothstep(.4, .6, tex));
  float lv = lavaFlow(p.xz, T);
  vegM *= 1. - smoothstep(0., .08, lv);
  vec3 alb = mix(rock, veg, vegM);
  // fresh flow surfaces are jet black, with a hot crust pattern
  alb = mix(alb, vec3(.03), smoothstep(0., .12, lv)*(1. - lv*.5));
  // red cinder on the post-shield cones
  float cind = smoothstep(.5, .58, I_STAGE)*(1. - .6*IL.erosion);
  if (cind > .01) for (int i = 0; i < 3; i++) { vec2 d = p.xz - coneAt(i); alb = mix(alb, vec3(.35,.14,.08), cind*exp(-dot(d, d)/(.02*I_R*I_R))*(1. - vegM*.7)); }
  // beaches and reef islets: sand
  float sand = smoothstep(.04*I_R, .006*I_R, abs(p.y))*max(IL.reef, IL.erosion*.6)*smoothstep(.5, .15, slope);
  float motu = IL.lagoon*smoothstep(I_REEF*.8*islShape(a), I_REEF*.9*islShape(a), r);
  alb = mix(alb, vec3(.8,.74,.58), clamp(sand + motu, 0., 1.));
  // wet black tephra at the breach
  alb = mix(alb, vec3(.04,.04,.045), IL.steam*.8);
  float dif = max(dot(n, SUN), 0.);
  float sh = uDetail > .3 ? terrainShadow(p) : 1.;
  sh *= plumeShadow(p);
  vec3 col = alb*(AMBC*(.55 + .45*n.y) + SUNC*dif*sh);
  // glowing lava
  vec3 glow = lavaColor(.35 + .65*lv)*smoothstep(.02, .3, lv)*(1.2 + 2.5*NIGHT);
  glow *= .6 + .4*smoothstep(.3, .7, fbm2(p.xz*(30./I_R) + T*.3, 2.));
  col += glow;
  return col;
}

vec3 shadeWater(vec3 ro, vec3 rd, float tW){
  vec3 p = ro + rd*tW;
  float r = length(p.xz), a = atan(p.z, p.x + 1e-5);
  float depth = max(-islandH(p.xz, OCTW), 0.);
  // waves
  float wf = 3.2/I_R*mix(1.6, .7, uSize);
  vec2 q = p.xz*wf;
  float e = .02*I_R;
  float w0 = fbm2(q + T*vec2(.35, .2), 3.) + .5*fbm2(q*2.3 - T*vec2(.2, .4), 2.);
  float wx = fbm2((p.xz + vec2(e, 0.))*wf + T*vec2(.35, .2), 3.) + .5*fbm2((p.xz + vec2(e, 0.))*wf*2.3 - T*vec2(.2, .4), 2.);
  float wz = fbm2((p.xz + vec2(0., e))*wf + T*vec2(.35, .2), 3.) + .5*fbm2((p.xz + vec2(0., e))*wf*2.3 - T*vec2(.2, .4), 2.);
  float amp = .035*I_R*smoothstep(.0, .15*I_R, depth + .02*I_R);
  vec3 nrm = normalize(vec3(-(wx - w0)*amp/e, 1., -(wz - w0)*amp/e));
  // colour by depth
  float dn = clamp(depth/(.3*I_R), 0., 1.);
  vec3 deep = vec3(.01,.06,.16), shallow = vec3(.04,.5,.52), sandc = vec3(.72,.76,.6);
  vec3 wc = mix(mix(sandc, shallow, smoothstep(0., .2, dn)), deep, smoothstep(.08, 1., dn));
  // the submarine volcano stains and bubbles the sea above it
  float stain = IL.submarine*ERUPT*smoothstep(-1., -.25, IL.h)*smoothstep(.6*I_R, .05*I_R, r)*1.3;
  if (stain > .001) {
    float bub = fbm2(p.xz*(6./I_R) - T*vec2(.1, .25), 3.);
    wc = mix(wc, vec3(.35,.5,.4), stain*(.6 + .4*bub));
    wc = mix(wc, vec3(.8,.85,.8), stain*smoothstep(.62, .75, bub)*.8);
  }
  vec3 refl = skyAll(reflect(rd, nrm));
  float fr = .03 + .9*pow(1. - max(dot(-rd, nrm), 0.), 5.);
  vec3 col = wc*(AMBC*1.1 + SUNC*.55*max(dot(nrm, SUN), 0.))*plumeShadow(p);
  col = mix(col, refl, fr);
  float glint = pow(max(dot(reflect(rd, nrm), SUN), 0.), 160.)*smoothstep(-.02, .1, SUN.y);
  col += SUNC*glint*1.6;
  // foam: shore break and surf on the reef
  float fn = fbm2(p.xz*(10./I_R) + T*vec2(.6, .3), 3.);
  float reefR = I_REEF*islShape(a);
  float foam = smoothstep(.035*I_R, .0, depth)*smoothstep(.35, .6, fn + .3*sin(T*2. + depth*(60./I_R)))*(1. - IL.lagoon*smoothstep(reefR*.9, reefR*.6, r));
  float surf = IL.reef*(1. - smoothstep(0., .09*I_R, abs(r - reefR)))*smoothstep(.4, .65, fn + .25*sin(T*2.5 + a*6.));
  float sfoam = clamp(foam + surf*.9, 0., 1.);
  col = mix(col, vec3(.92,.95,.97)*(AMBC + SUNC*.7), sfoam);
  // lava pouring into the sea
  float lv = lavaFlow(p.xz, T)*smoothstep(.05*I_R, 0., depth)*(1. - IL.submarine);
  col += lavaColor(.75)*lv*(1.5 + 2.*NIGHT);
  // lava-light on the sea at night
  float nglow = ERUPT*(1. - IL.submarine)*(1. - IL.erosion)*NIGHT*exp(-max(r - I_SHORE, 0.)/(.5*I_R));
  col += vec3(1., .35, .08)*nglow*.25*(.6 + .4*w0);
  // submarine glow at night: a faint red where pillow lava erupts under the sea
  col += vec3(.8,.15,.03)*IL.submarine*ERUPT*NIGHT*smoothstep(-.8, -.1, IL.h)*smoothstep(.3*I_R, .0, r)*.4;
  return col;
}

void main(){
  T = uTime + uSeed*100.;
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  DAY = uLight; NIGHT = 1. - smoothstep(0., .25, DAY);
  float sa = mix(-.12, 1.15, DAY);
  float az = SUNAZ;
  SUN = normalize(vec3(sin(az)*cos(sa), sin(sa), cos(az)*cos(sa)));
  SUNC = mix(vec3(1., .45, .2), vec3(1., .97, .92), smoothstep(.0, .42, DAY))*2.3*smoothstep(-.1, .08, SUN.y);
  AMBC = mix(vec3(.025,.035,.07), vec3(.45,.55,.72), smoothstep(-.1, .55, DAY));
  OCTM = mix(2.5, 5.5, uDetail); OCTW = mix(2., 3.5, uDetail);
  Life L = life(uStage);
  float R = mix(1.3, 3.4, uSize);
#ifdef STEEP_1
  islandSetup(L, uStage, R, .8, 1.3, 2.9, uEpoch*3.7 + uSeed*11., .62, .18);
#else
  islandSetup(L, uStage, R, .9, 2., 1.7, uEpoch*3.7 + uSeed*11., .34, .14);
#endif
  I_ROUGH = mix(.3, 2.2, uX1);
  ERUPT = eruptAmt(L);
  VENT = vec3(0., max(I_PEAK, -.02*I_R) - IL.caldera*I_CAL*I_R*.6, 0.);

  // camera orbit
  float yaw = YAW + uDrag.x*2.2 + T*ORBIT;
  float pitch = clamp(PITCH + uDrag.y*1.2, .04, 1.5);
  float dist = DIST*mix(1.9, .65, uX2);
  vec3 ta = vec3(0., TARGY + .18*max(I_PEAK, 0.), 0.);
  vec3 ro = ta + dist*vec3(cos(pitch)*sin(yaw), sin(pitch), cos(pitch)*cos(yaw));
  ro.y = max(ro.y, .06);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(fw, vec3(0., 1., 0.))), up = cross(rt, fw);
  vec3 rd = normalize(fw*FOV + uv.x*rt + uv.y*up);

  vec3 sky = skyAll(rd);
  vec3 col = sky;
  float skyAmt = 1.;
  float tW = rd.y < 0. ? -ro.y/rd.y : 1e5;
  float tmax = min(tW, 60.);
  float steps = mix(60., 150., uDetail);
  float tT = terrainMarch(ro, rd, tmax, steps);
  float tHit = 1e5;
  if (tT > 0.) {
    vec3 p = ro + rd*tT;
    vec3 n = terrainNormal(p.xz, .0025*I_R + .0015*tT);
    col = shadeLand(p, n, tT); tHit = tT; skyAmt = 0.;
  } else if (rd.y < 0.) {
    col = shadeWater(ro, rd, tW); tHit = tW; skyAmt = 0.;
  }
  // aerial perspective
  if (tHit < 1e4) {
    float hz = 1. - exp(-tHit*mix(.004, .06, uX3)*(1. - .5*NIGHT));
    vec3 hazeC = mix(skyColor(normalize(vec3(rd.x, .02, rd.z)), SUN, DAY), vec3(.6,.7,.85)*AMBC*2., .3);
    col = mix(col, hazeC, hz);
  }
  // the plume, in front
  vec4 pl = plumeMarch(ro, rd, min(tHit, 60.), mix(18., 44., uDetail));
  col = col*pl.a + pl.rgb;
  skyAmt *= pl.a;
  // tone
  col *= EXPO;
  col = 1. - exp(-col*1.1);
  col = pow(col, vec3(.92));
  finish(col, skyAmt);
}`;

export default shaderEngine({
  id: 'island3d', name: 'Island 3D', fs, res: 0.6,
  defaults: { STEEP: 0, YAW: 0.6, PITCH: 0.17, DIST: 3.6, TARGY: 0.3, FOV: 1.25, ORBIT: 0.0, SUNAZ: 2.2, BEND: 0.6, EXPO: 1.0 },
  params: [
    { id: 'x1', label: 'Rugged', value: 0.5, tip: 'Flank roughness' },
    { id: 'x2', label: 'Zoom', value: 0.5, tip: 'Camera distance' },
    { id: 'x3', label: 'Haze', value: 0.4, tip: 'Aerial perspective' },
    { id: 'x4', label: 'Plume', value: 0.5, tip: 'Height of the eruption column' },
  ]
});

const d = (id, name, desc, opts, params, tags = []) => ({ id: 'island3d-' + id, name, desc, opts, params, tags: ['realistic', '3d', ...tags] });
export const scenes = [
  d('shield', 'Shield Island', 'A broad basalt shield in full effusive eruption: a lava fountain at the summit, flows down the flanks, laze steam where they reach the sea. Drag to orbit.',
    {}, { stage: 0.36, light: 0.8, activity: 0.55, wind: 0.5, x2: 0.5, x3: 0.4, x4: 0.5 }, ['hawaii', 'eruption', 'lava']),
  d('surtsey', 'Surtsey, Day Two', 'A Surtseyan breach: black cock\'s-tail jets of tephra arc out of the sea beside billowing steam while a tuff cone builds above the waves.',
    { PITCH: 0.12, DIST: 3.0, TARGY: 0.3, SUNAZ: 2.9, EXPO: 1.05 }, { stage: 0.17, light: 0.55, activity: 0.6, wind: 0.42, x2: 0.55, x3: 0.35, x4: 0.4 }, ['surtseyan', 'eruption']),
  d('nightlava', 'Night Lava', 'The same shield at night: incandescent flows and the fountain light the plume and the sea from below.',
    { PITCH: 0.14, DIST: 3.8, SUNAZ: 1.0, EXPO: 1.1 }, { stage: 0.4, light: 0.03, activity: 0.7, wind: 0.55, x2: 0.5, x3: 0.25, x4: 0.55 }, ['night', 'lava', 'eruption']),
  d('caldera', 'Caldera and Cones', 'The summit has collapsed into a caldera and red cinder cones dot the flanks; the plume is darker and gassier as the magma supply wanes.',
    { PITCH: 0.55, DIST: 3.6, YAW: 1.4, SUNAZ: 0.6 }, { stage: 0.56, light: 0.7, activity: 0.5, wind: 0.6, x2: 0.5, x3: 0.3, x4: 0.4 }, ['caldera']),
  d('golden', 'Whole Life, Golden Hour', 'A time-lapse of the whole life cycle at low sun: seamount, breach, shield, caldera, green valleys, reef, lagoon and atoll.',
    { PITCH: 0.16, DIST: 4.6, SUNAZ: 2.6, ORBIT: 0.02, EXPO: 1.05 }, { stage: 0.3, grow: 0.78, light: 0.2, activity: 0.5, wind: 0.5, x2: 0.5, x3: 0.5, x4: 0.5 }, ['time-lapse', 'calm']),
  d('green', 'Green Island', 'The dead volcano, carved into amphitheatre valleys and sea cliffs, green to the summit, with a turquoise fringing reef hugging the shore.',
    { PITCH: 0.3, DIST: 3.6, YAW: -0.7, SUNAZ: 1.8 }, { stage: 0.72, light: 0.85, activity: 0.5, wind: 0.5, x2: 0.55, x3: 0.45 }, ['calm']),
  d('atoll', 'Atoll from a Drone', 'High above the end of the story: a ring of reef and sandy motu around a pale lagoon where the volcano used to be.',
    { PITCH: 1.0, DIST: 4.4, YAW: 0.3, SUNAZ: 2.0, ORBIT: 0.015 }, { stage: 0.96, light: 0.9, activity: 0.5, x2: 0.45, x3: 0.2, x4: 0.25 }, ['atoll', 'calm']),
  d('arc', 'Island-Arc Stratovolcano', 'A steep andesitic cone of an island arc, explosive and ash-rich: sticky, gas-rich magma builds stratovolcanoes rather than shields.',
    { STEEP: 1, PITCH: 0.13, DIST: 4.4, YAW: 2.4, SUNAZ: 2.4, BEND: 0.5 }, { stage: 0.47, light: 0.6, activity: 0.7, wind: 0.6, scale: 0.55, x2: 0.5, x3: 0.4, x4: 0.6 }, ['eruption']),
];
