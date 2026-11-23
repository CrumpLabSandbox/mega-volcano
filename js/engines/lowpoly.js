// Low Poly: a flat-shaded diorama. The island is the shared life-cycle heightfield sampled on an equilateral
// triangle lattice and rendered as planar facets (one normal per triangle); the ocean is a second lattice of
// bobbing facets; plumes, jets, laze and the lava fountain are clusters of spheres with quantised normals; lava
// shows as whole glowing triangles. HEX cuts the world into a floating hexagonal tile with a layered side wall.
// Drag to orbit; the diorama turns slowly on its own.
import { shaderEngine } from '../gl.js';
import { ISLAND_GLSL } from './_island.js';

const fs = ISLAND_GLSL + `
float T, DAY, NIGHT, CS, ERUPT;
vec3 SUN, SUNC, AMBC, VENT;

// ---------- the triangle lattice
vec2 latToWorld(vec2 uv){ return CS*vec2(uv.x + .5*uv.y, .8660254*uv.y); }
vec2 worldToLat(vec2 w){ float v = w.y/(.8660254*CS); return vec2(w.x/CS - .5*v, v); }
// the three lattice corners of the triangle holding world point w
void triCorners(vec2 w, out vec2 A, out vec2 B, out vec2 C){
  vec2 uv = worldToLat(w); vec2 i = floor(uv), f = uv - i;
  if (f.x + f.y < 1.) { A = i; B = i + vec2(1., 0.); C = i + vec2(0., 1.); }
  else { A = i + vec2(1., 1.); B = i + vec2(0., 1.); C = i + vec2(1., 0.); }
}
// planar height and normal of the island facet under w
float facetH(vec2 w, out vec3 n, out vec2 cen){
  vec2 A, B, C; triCorners(w, A, B, C);
  vec2 a = latToWorld(A), b = latToWorld(B), c = latToWorld(C);
  float ha = islandH(a, 2.), hb = islandH(b, 2.), hc = islandH(c, 2.);
  vec3 pa = vec3(a.x, ha, a.y), pb = vec3(b.x, hb, b.y), pc = vec3(c.x, hc, c.y);
  n = normalize(cross(pb - pa, pc - pa)); if (n.y < 0.) n = -n;
  cen = (a + b + c)/3.;
  return pa.y - (n.x*(w.x - pa.x) + n.z*(w.y - pa.z))/n.y;
}
float waveH(vec2 w){
  return .018*I_R*(sin(w.x*(5./I_R) + T*1.3) + sin((w.x*.6 + w.y*.8)*(7./I_R) - T*1.7) + .6*sin(w.y*(9./I_R) + T*2.1 + w.x*(2./I_R)));
}
float seaFacetH(vec2 w, out vec3 n, out vec2 cen){
  float cs0 = CS; CS *= 1.6;
  vec2 A, B, C; triCorners(w, A, B, C);
  vec2 a = latToWorld(A), b = latToWorld(B), c = latToWorld(C);
  CS = cs0;
  vec3 pa = vec3(a.x, waveH(a), a.y), pb = vec3(b.x, waveH(b), b.y), pc = vec3(c.x, waveH(c), c.y);
  n = normalize(cross(pb - pa, pc - pa)); if (n.y < 0.) n = -n;
  cen = (a + b + c)/3.;
  return pa.y - (n.x*(w.x - pa.x) + n.z*(w.y - pa.z))/n.y;
}

// ---------- hex tile
float hexDist(vec2 p){ p = abs(p); return max(dot(p, vec2(.8660254, .5)), p.y); }
#ifdef HEX_1
#define HEXR (I_R*HEXK)
#else
#define HEXR 1e5
#endif

// ---------- balls: plume puffs, jets, laze, fountain
#define NB 26
vec3 BC[NB]; float BR[NB]; vec3 BCOL[NB]; float BEM[NB];
void setupBalls(){
  vec2 wd = windDir();
  float colE = ERUPT*(1. - IL.submarine);
  float H = I_R*(.9 + .5*min(colE, 1.5))*mix(.5, 1.5, uX4);
  float ash = mix(.25, .9, IL.expl);
  vec3 pc = mix(PLUMEC, ASHC, ash);
  for (int i = 0; i < NB; i++) { BR[i] = 0.; BC[i] = vec3(0., -9., 0.); BCOL[i] = pc; BEM[i] = 0.; }
  // 12 rising puffs
  if (colE > .02) for (int i = 0; i < 12; i++) {
    float fi = float(i), hi = hash11(fi*3.3 + I_SEED);
    float u = fract(T*.11*(1. + .2*hi) + fi/12.);
    float side = (hash11(fi + 1.7) - .5)*.18*I_R*u;
    vec3 c = VENT + vec3(0., u*H, 0.) + vec3(wd.x, 0., wd.y)*(u*u*H*BEND) + vec3(-wd.y, 0., wd.x)*side;
    BC[i] = c; BR[i] = I_R*(.045 + .13*u)*(.7 + .5*min(colE, 1.))*smoothstep(1., .8, u)*smoothstep(0., .08, u);
    BCOL[i] = mix(pc, mix(pc, vec3(1.), .25), u);
  }
  // 6 black tephra lumps along cock's-tail arcs
  if (IL.steam > .01) for (int i = 0; i < 6; i++) {
    float fi = float(i), k = floor(fi/3.);
    float ak = hash11(k*7.7 + I_SEED*3.1)*TAU;
    float pulse = fract(T*.5 + k*.5);
    float s = (fi - k*3. + 1.)/3.5*pulse;
    float len = I_R*.9*IL.steam*min(ERUPT, 1.5);
    vec3 dir = normalize(vec3(cos(ak)*.55, 1., sin(ak)*.55));
    BC[12 + i] = vec3(0., -.02*I_R, 0.) + dir*s*len - vec3(0., .5*s*s*len, 0.);
    BR[12 + i] = I_R*.035*(1. + s)*smoothstep(0., .15, pulse)*smoothstep(1., .85, pulse);
    BCOL[12 + i] = vec3(.06,.06,.07);
  }
  // 4 white steam balls at the breach vent
  if (IL.steam > .01) for (int i = 0; i < 4; i++) {
    float fi = float(i); float u = fract(T*.2 + fi*.25);
    BC[18 + i] = vec3(0., .02*I_R + u*.6*I_R, 0.) + vec3(wd.x, 0., wd.y)*u*u*.5*I_R;
    BR[18 + i] = I_R*(.07 + .12*u)*IL.steam*smoothstep(1., .8, u);
    BCOL[18 + i] = vec3(.97);
  }
  // laze: 2 white balls where flows hit the sea
  float lz = (1. - IL.submarine)*(1. - IL.erosion)*min(ERUPT, 1.5)*smoothstep(.22, .3, I_STAGE);
  if (lz > .02) for (int i = 0; i < 2; i++) {
    float fi = float(i); float ak = hash11(I_SEED*7.7 + fi*2.1)*TAU + fi*2.4;
    vec2 sp = vec2(cos(ak), sin(ak))*I_SHORE*islShape(ak);
    float on = smoothstep(.04, .2, lavaFlow(sp*.96, T));
    float u = fract(T*.25 + fi*.5);
    BC[22 + i] = vec3(sp.x, u*.35*I_R, sp.y) + vec3(wd.x, 0., wd.y)*u*u*.3*I_R;
    BR[22 + i] = I_R*(.07 + .12*u)*lz*on*smoothstep(1., .8, u);
    BCOL[22 + i] = vec3(.97);
  }
  // fountain: 2 glowing balls
  if (colE > .02 && IL.erosion < .99) for (int i = 0; i < 2; i++) {
    float fi = float(i); float u = fract(T*.9 + fi*.5);
    float fh = I_R*(.1 + .2*min(colE, 1.5));
    BC[24 + i] = VENT + vec3(0., u*fh, 0.);
    BR[24 + i] = I_R*.035*(1. + .5*u)*(1. - u*.6)*(1. - IL.erosion);
    BCOL[24 + i] = vec3(1., .5, .1); BEM[24 + i] = 1.;
  }
}
float ballsSDF(vec3 p, out int id){
  float d = 1e5; id = -1;
  for (int i = 0; i < NB; i++) { if (BR[i] <= 0.) continue; float di = length(p - BC[i]) - BR[i]; if (di < d) { d = di; id = i; } }
  return d;
}
vec3 facetNormal(vec3 n){ return normalize(floor(n*2.4 + .5)/2.4 + 1e-4); }

// ---------- marching
float marchLand(vec3 ro, vec3 rd, float tmax, out vec3 n, out vec2 cen){
  float top = max(I_PEAK, 0.) + .4*I_R;
  float t = 0.;
  if (ro.y > top) { if (rd.y >= 0.) return -1.; t = (ro.y - top)/(-rd.y); }
  float lt = t, ld = 1.;
  for (int i = 0; i < 90; i++) {
    vec3 p = ro + rd*t;
    float h = facetH(p.xz, n, cen);
    float d = p.y - h;
    if (d < 0.) {
      // bisect
      float a = lt, b = t;
      for (int k = 0; k < 4; k++) { float m = .5*(a + b); vec3 q = ro + rd*m; if (q.y - facetH(q.xz, n, cen) < 0.) b = m; else a = m; }
      t = .5*(a + b); vec3 q = ro + rd*t; facetH(q.xz, n, cen);
      return t;
    }
    lt = t;
    t += clamp(d*.5, .008*I_R, .3*I_R);
    if (t > tmax) return -1.;
  }
  return -1.;
}
float marchSea(vec3 ro, vec3 rd, float tmax, out vec3 n, out vec2 cen){
  if (rd.y >= 0.) return -1.;
  // the bobbing sea lives between y = +-.06 R: march that slab in fixed steps, so the far sea is never missed
  float t0 = max((.06*I_R - ro.y)/rd.y, 0.), t1 = (-.06*I_R - ro.y)/rd.y;
  if (t0 > tmax) return -1.;
  float dt = (t1 - t0)/14.;
  float lt = t0;
  for (int i = 0; i <= 14; i++) {
    float t = t0 + dt*float(i);
    vec3 p = ro + rd*t;
    float d = p.y - seaFacetH(p.xz, n, cen);
    if (d < 0.) { float a = lt, b = t; for (int k = 0; k < 3; k++) { float m = .5*(a + b); vec3 q = ro + rd*m; if (q.y - seaFacetH(q.xz, n, cen) < 0.) b = m; else a = m; } t = .5*(a + b); vec3 q = ro + rd*t; seaFacetH(q.xz, n, cen); return t > tmax ? -1. : t; }
    lt = t;
  }
  return -1.;
}

vec3 lit(vec3 alb, vec3 n){
  float dif = max(dot(n, SUN), 0.);
  return alb*(AMBC*(.6 + .4*n.y) + SUNC*dif);
}
vec3 landColor(vec2 cen, vec3 n, float y){
  float slope = 1. - n.y;
  float hN = clamp(y/(.34*I_R), 0., 1.);
  float r = length(cen), a = atan(cen.y, cen.x + 1e-5);
  float ht = hash12(cen*7.);
  vec3 rock = mix(ROCKC, ROCKC*1.25, step(.5, ht));
  vec3 fresh = BASALTC;
  float ageing = smoothstep(0., .6, IL.veg + .6*IL.erosion);
  vec3 col = mix(fresh, rock, ageing);
  vec3 grass = mix(GRASSC, GRASSC*vec3(.8, 1.1, .8), step(.5, ht));
  float vegM = IL.veg*step(slope, .5 + .1*ht)*step(hN, .9);
  col = mix(col, grass, vegM);
  col = mix(col, PEAKC, step(.72, hN)*(1. - IL.erosion*.5)*step(.2, slope));
  // sand near sea level, sandy motu
  float sand = step(abs(y), .04*I_R)*max(IL.reef, IL.erosion*.6)*step(slope, .35);
  float motu = IL.lagoon*step(I_REEF*.85*islShape(a), r);
  col = mix(col, SANDC, clamp(sand + motu, 0., 1.));
  col = mix(col, vec3(.05,.05,.06), IL.steam*.8);
  // cinder cones
  float cind = smoothstep(.5, .58, I_STAGE)*(1. - .6*IL.erosion);
  if (cind > .01) for (int i = 0; i < 3; i++) { vec2 d = cen - coneAt(i); col = mix(col, CINDERC, cind*step(dot(d, d), .018*I_R*I_R)); }
  return col;
}

void main(){
  T = uTime + uSeed*100.;
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  DAY = uLight; NIGHT = 1. - smoothstep(0., .25, DAY);
  float sa = mix(-.1, 1.1, DAY);
  SUN = normalize(vec3(sin(SUNAZ)*cos(sa), sin(sa), cos(SUNAZ)*cos(sa)));
  SUNC = mix(vec3(1., .5, .25), vec3(1., .96, .9), smoothstep(0., .4, DAY))*1.6*smoothstep(-.1, .1, SUN.y)*SUNK;
  AMBC = mix(AMBN, AMBD, smoothstep(-.1, .5, DAY));
  Life L = life(uStage);
  float R = mix(1.2, 3., uSize);
#ifdef HEX_1
  islandSetup(L, uStage, R, .45, 2., 1.7, uEpoch*3.7 + uSeed*11., .36, .14);
#else
  islandSetup(L, uStage, R, .9, 2., 1.7, uEpoch*3.7 + uSeed*11., .36, .14);
#endif
  I_ROUGH = mix(.2, 1.6, uX1);
  CS = R*mix(.22, .07, uX3)*mix(1.3, .8, uDetail);
  ERUPT = eruptAmt(L);
  VENT = vec3(0., max(I_PEAK, 0.) - IL.caldera*I_CAL*I_R*.6, 0.);
  setupBalls();

  float yaw = YAW + uDrag.x*2.2 + T*SPIN;
  float pitch = clamp(PITCH + uDrag.y*1.2, .08, 1.45);
  float dist = DIST*mix(1.8, .7, uX2);
  vec3 ta = vec3(0., .25*max(I_PEAK, 0.) + .15, 0.);
  vec3 ro = ta + dist*vec3(cos(pitch)*sin(yaw), sin(pitch), cos(pitch)*cos(yaw));
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(fw, vec3(0., 1., 0.))), up = cross(rt, fw);
  vec3 rd = normalize(fw*FOV + uv.x*rt + uv.y*up);

  // background sky: flat bands
  vec3 sky = mix(SKYB, SKYT, smoothstep(-.3, .6, rd.y));
  sky = mix(sky, mix(NSKYB, NSKYT, smoothstep(-.3, .6, rd.y)), NIGHT);
  if (NIGHT > .01) { vec3 q = rd*140.; float s = step(.995, hash13(floor(q))); sky += s*NIGHT*.8*smoothstep(0., .1, rd.y); }
  // big low sun disc
  float sd = dot(rd, SUN);
  sky += SUNC*.4*smoothstep(.995, .997, sd)*step(0., SUN.y);
  vec3 col = sky; float skyAmt = 1.;
  float tHit = 1e5;

  // hex prism: clip everything to it
  float tEnter = 0., tExit = 1e5;
#ifdef HEX_1
  {
    // slab test against the 3 pairs of planes of a hexagonal prism (flat-topped in xz)
    float r = HEXR; tEnter = 0.; tExit = 1e5;
    for (int k = 0; k < 3; k++) {
      float ang = float(k)*PI/3. + PI/6.;
      vec2 nrm = vec2(cos(ang), sin(ang));
      float o = dot(ro.xz, nrm), d = dot(rd.xz, nrm);
      if (abs(d) < 1e-5) { if (abs(o) > r) { tExit = -1.; } continue; }
      float t0 = (-r - o)/d, t1 = (r - o)/d;
      tEnter = max(tEnter, min(t0, t1)); tExit = min(tExit, max(t0, t1));
    }
    float yb = I_FLOOR - .3*I_R;
    if (rd.y != 0.) { float tb = (yb - ro.y)/rd.y; if (rd.y < 0.) tExit = min(tExit, tb); else tEnter = max(tEnter, tb); }
    if (tExit <= tEnter) { finish(col, 1.); return; }
  }
#endif
  float tLim = tExit;
  vec3 n; vec2 cen;
  vec3 ro2 = ro + rd*tEnter;
#ifdef HEX_1
  // entering the prism through a side wall or the bottom: a solid cross-section (water block over rock)
  {
    vec3 pe = ro2;
    float hb = facetH(pe.xz, n, cen);
    bool bottom = pe.y < I_FLOOR - .29*I_R;
    if (bottom || pe.y < hb || pe.y < 0.) {
      vec3 wn;
      if (bottom) wn = vec3(0., -1., 0.);
      else { float best = -1e5; wn = vec3(1., 0., 0.); for (int k = 0; k < 6; k++) { float ang = float(k)*PI/3. + PI/6.; vec2 nm = vec2(cos(ang), sin(ang)); float dd = dot(pe.xz, nm); if (dd > best) { best = dd; wn = vec3(nm.x, 0., nm.y); } } }
      vec3 alb;
      if (pe.y < hb) { float strata = step(.5, fract(pe.y*(9./I_R) + .2*sin(pe.x*4./I_R))); alb = mix(ROCKC*.8, ROCKC*.55, strata); if (pe.y > hb - .06*I_R && hb > 0.) alb = ROCKC; }
      else { float dn = clamp(-pe.y/(.3*I_R), 0., 1.); alb = mix(SEASHALLOW, SEADEEP, dn)*.9; }
      // lava glow bleeding into the cut near the vent conduit
      float cond = ERUPT*(1. - IL.erosion)*exp(-length(pe.xz)/(.12*I_R));
      col = lit(alb, wn) + vec3(1., .4, .1)*cond*.8;
      finish(col, 0.); return;
    }
  }
#endif
  float tSeaEnd = rd.y < 0. ? (-.06*I_R - ro2.y)/rd.y : 1e5;
  float tL = marchLand(ro2, rd, min(tLim - tEnter, tSeaEnd), n, cen);
  if (tL > 0.) {
    vec3 p = ro2 + rd*tL;
    float lv = lavaFlow(cen, T);
    vec3 alb = landColor(cen, n, p.y);
    col = lit(alb, n);
    float lava = step(.22, lv)*(1. - IL.erosion);
    col = mix(col, lavaColor(.45 + .55*lv)*(1.3 + 1.5*NIGHT), lava);
    tHit = tEnter + tL; skyAmt = 0.;
  }
  float tS = marchSea(ro2, rd, min(tL > 0. ? tL : 1e5, tLim - tEnter), n, cen);
  if (tS > 0.) {
    vec3 p = ro2 + rd*tS;
    float depth = max(-islandH(cen, 2.), 0.);
    float dn = clamp(depth/(.3*I_R), 0., 1.);
    vec3 alb = mix(SEASHALLOW, SEADEEP, smoothstep(.05, 1., dn));
    alb = mix(alb, SANDC*.9, step(dn, .04)*IL.reef*.8);
    float r = length(cen), a = atan(cen.y, cen.x + 1e-5);
    float reefR = I_REEF*islShape(a);
    float surf = IL.reef*step(abs(r - reefR), .06*I_R)*step(.4, hash12(cen*3. + floor(T*2.)));
    float foam = step(depth, .025*I_R)*step(.45, hash12(cen*5. + floor(T*1.5)));
    alb = mix(alb, FOAMC, clamp(foam + surf, 0., 1.));
    // seamount stain
    float stain = IL.submarine*ERUPT*smoothstep(-1., -.25, IL.h)*step(r, .5*I_R)*step(.3, hash12(cen*2. + floor(T)));
    alb = mix(alb, vec3(.45,.6,.5), stain);
    vec3 c = lit(alb, n);
    float spec = pow(max(dot(reflect(rd, n), SUN), 0.), 90.)*step(0., SUN.y);
    c += SUNC*spec*.2;
    float lv = lavaFlow(cen, T)*step(depth, .05*I_R)*(1. - IL.submarine);
    c += lavaColor(.7)*step(.25, lv)*1.5;
    c += vec3(1., .4, .1)*ERUPT*(1. - IL.submarine)*(1. - IL.erosion)*NIGHT*exp(-max(r - I_SHORE, 0.)/(.4*I_R))*.3;
    c += vec3(.9,.2,.05)*IL.submarine*ERUPT*NIGHT*smoothstep(-.8, -.1, IL.h)*step(r, .3*I_R)*.4;
    col = c; tHit = tEnter + tS; skyAmt = 0.;
  }
  // balls: sphere-trace in front of what we hit
  {
    float t = 0.; int id = -1;
    for (int i = 0; i < 48; i++) {
      vec3 p = ro + rd*t;
      float d = ballsSDF(p, id);
      if (d < .002*I_R) break;
      t += d; if (t > min(tHit, 40.)) { id = -1; break; }
    }
    if (id >= 0 && t < tHit) {
      vec3 p = ro + rd*t;
      vec3 bn = facetNormal((p - BC[id])/BR[id]);
      vec3 c = lit(BCOL[id], bn);
      float glow = ERUPT*(1. - IL.submarine)*(1. - IL.erosion)*exp(-max(p.y - VENT.y, 0.)/(.35*I_R));
      c += BCOL[id]*vec3(1., .4, .1)*glow*(.3 + 1.2*NIGHT);
      c = mix(c, BCOL[id]*2.2, BEM[id]);
      col = c; skyAmt = 0.;
    }
  }
  if (tHit < 1e4) col = mix(col, sky, 1. - exp(-tHit*FOG));
  col = pow(col, vec3(.95));
  finish(col, skyAmt);
}`;

export default shaderEngine({
  id: 'lowpoly', name: 'Low Poly', fs, res: 0.7,
  defaults: {
    HEX: 0, HEXK: 1.15, YAW: 0.5, PITCH: 0.42, DIST: 3.2, FOV: 1.4, FOG: 0.05, SPIN: 0.06, SUNAZ: 2.3, SUNK: 1.0, BEND: 0.7,
    SKYT: [0.45, 0.68, 0.95], SKYB: [0.85, 0.92, 1.0], NSKYT: [0.03, 0.03, 0.09], NSKYB: [0.1, 0.08, 0.2],
    AMBD: [0.5, 0.58, 0.72], AMBN: [0.05, 0.06, 0.12],
    SEADEEP: [0.08, 0.3, 0.6], SEASHALLOW: [0.3, 0.82, 0.8], FOAMC: [0.95, 0.98, 1.0], SANDC: [0.93, 0.85, 0.62],
    GRASSC: [0.35, 0.68, 0.3], ROCKC: [0.5, 0.4, 0.33], BASALTC: [0.16, 0.14, 0.15], PEAKC: [0.42, 0.36, 0.34], CINDERC: [0.6, 0.25, 0.15],
    PLUMEC: [0.92, 0.92, 0.95], ASHC: [0.3, 0.28, 0.3]
  },
  params: [
    { id: 'x1', label: 'Rugged', value: 0.5, tip: 'Flank roughness' },
    { id: 'x2', label: 'Zoom', value: 0.5, tip: 'Camera distance' },
    { id: 'x3', label: 'Facets', value: 0.5, tip: 'Coarse to fine triangles' },
    { id: 'x4', label: 'Plume', value: 0.5, tip: 'Height of the puff column' },
  ]
});

const d = (id, name, desc, opts, params, tags = []) => ({ id: 'lowpoly-' + id, name, desc, opts, params, tags: ['3d', 'cartoon', ...tags] });
export const scenes = [
  d('pastel', 'Pastel Diorama', 'A toy shield volcano on a faceted sea, lava as glowing triangles, puffs of white gas drifting downwind. Drag to orbit.',
    {}, { stage: 0.36, light: 0.85, activity: 0.55, x2: 0.5, x4: 0.5 }, ['hawaii', 'eruption', 'lava']),
  d('neon', 'Neon Night', 'The shield at night: black facets, electric lava and a magenta-lit plume over an inky sea.',
    { NSKYT: [0.02, 0.0, 0.08], NSKYB: [0.25, 0.02, 0.3], AMBN: [0.12, 0.03, 0.2], SEADEEP: [0.03, 0.02, 0.12], SEASHALLOW: [0.1, 0.5, 0.6], BASALTC: [0.08, 0.06, 0.12], PLUMEC: [0.75, 0.4, 0.9], ASHC: [0.3, 0.1, 0.4] },
    { stage: 0.4, light: 0.02, activity: 0.7, x4: 0.55 }, ['night', 'neon', 'lava']),
  d('sunset', 'Sunset Breach', 'Surtsey as a diorama at sunset: black tephra lumps arcing out of an orange sea beside white steam balls.',
    { SKYT: [0.35, 0.3, 0.6], SKYB: [1.0, 0.6, 0.35], AMBD: [0.6, 0.45, 0.5], SEADEEP: [0.2, 0.2, 0.45], SEASHALLOW: [0.6, 0.6, 0.55], PITCH: 0.22, DIST: 2.4, SUNAZ: 2.9 },
    { stage: 0.17, light: 0.22, activity: 0.6, wind: 0.45, x4: 0.4 }, ['surtseyan', 'eruption']),
  d('clay', 'Clay Model', 'A monochrome clay maquette of the caldera stage: cinder cones, a collapsed summit, only the lava carrying colour.',
    { SKYT: [0.8, 0.8, 0.78], SKYB: [0.92, 0.9, 0.86], AMBD: [0.55, 0.53, 0.5], SEADEEP: [0.55, 0.52, 0.48], SEASHALLOW: [0.7, 0.68, 0.62], FOAMC: [0.85, 0.83, 0.8], SANDC: [0.75, 0.72, 0.66],
      GRASSC: [0.62, 0.6, 0.55], ROCKC: [0.58, 0.55, 0.5], BASALTC: [0.42, 0.4, 0.38], PEAKC: [0.5, 0.48, 0.45], CINDERC: [0.5, 0.45, 0.42], PLUMEC: [0.8, 0.78, 0.75], ASHC: [0.5, 0.48, 0.46], PITCH: 0.6, SUNAZ: 1.2 },
    { stage: 0.56, light: 0.75, activity: 0.5, x4: 0.4 }, ['art', 'caldera']),
  d('hex', 'Hex Tile', 'The island on a floating hexagonal tile: the side wall shows the sea as a block of blue over layered rock and the hot conduit below the vent.',
    { HEX: 1, PITCH: 0.5, DIST: 3.8, SPIN: 0.1, FOG: 0.0 }, { stage: 0.34, light: 0.8, activity: 0.55, scale: 0.45, x2: 0.5, x4: 0.45 }, ['diagram', 'eruption']),
  d('green', 'Green Island', 'The quiet, eroded island: valley facets in two greens, sandy beaches and a pale reef ring.',
    { PITCH: 0.5, SUNAZ: 1.8 }, { stage: 0.72, light: 0.9, activity: 0.5, x2: 0.55 }, ['calm']),
  d('atoll', 'Atoll Tile', 'The end of the story on a hex tile: a ring of sand facets round a turquoise lagoon, the drowned volcano visible in the cut.',
    { HEX: 1, HEXK: 1.3, PITCH: 0.75, DIST: 4.0, SPIN: 0.08, FOG: 0.0 }, { stage: 0.95, light: 0.85, activity: 0.5, scale: 0.4, x2: 0.5 }, ['atoll', 'diagram', 'calm']),
  d('lapse', 'Life Time-Lapse', 'The whole life cycle looping on the turntable: seamount stain, breach, shield, caldera, green valleys, reef, lagoon, atoll.',
    { PITCH: 0.45, SPIN: 0.08 }, { stage: 0.2, grow: 0.8, light: 0.7, activity: 0.5 }, ['time-lapse']),
];
