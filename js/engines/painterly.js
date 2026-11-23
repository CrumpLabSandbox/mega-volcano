// Painterly: one procedural side-on island painting (sky, sea with reflections, the island through its life, plumes,
// lava, reef) rendered through a different painter's hand per scene. MODE selects the style at compile time:
// 0 impressionist broken colour, 1 pointillism, 2 watercolour, 3 oil impasto, 4 Van Gogh swirl, 5 Turner haze,
// 6 gouache, 7 nocturne. Strokes are made by sampling the scene at jittered / quantised / flow-aligned positions.
import { shaderEngine } from '../gl.js';

const fs = `
float T, ASP, SEA, FL, HP, HC, W, WFULL, WR, CX, SK, DAY, DUSK, NIGHT, ER, SEED, PROFP;
vec3 SUN, SUNCOL;
Life L;

// ---------------------------------------------------------------- the island
float profS(float x){                       // smooth analytic elevation (sea level = 0, sea floor = FL)
  float d = min(abs(x - CX)/W, 1.);
  return FL + HC*(1. - pow(d, PROFP));
}
float prof(float x){                        // detailed elevation with ridges, valleys, caldera and cinder cones
  float d = abs(x - CX)/W;
  float e = profS(x);
  float inl = smoothstep(1., .7, d);
  float n = fbm2(vec2(x*9. + SEED*40., uEpoch*3.1), 3.) - .5;
  e += HC*(.04 + .14*L.erosion)*n*inl;
  // amphitheatre valleys cut by rain
  e -= L.erosion*HC*.2*pow(.5 + .5*sin(x*22./SK + SEED*30.), 3.)*smoothstep(0., .25, d)*(1. - min(d, 1.));
  // caldera with a raised rim
  e -= L.caldera*HC*.16*smoothstep(.22, .04, d);
  e += L.caldera*HC*.035*smoothstep(.34, .22, d)*smoothstep(.1, .2, d);
  // cinder cones on the upper slopes
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float cxi = CX + (hash11(SEED*7. + fi*3.3 + uEpoch) - .5)*W*1.1*(fi == 0. ? .4 : 1.);
    float dd = (x - cxi)/(.035*SK);
    e += .03*SK*L.caldera*(1. - .6*L.erosion)*exp(-dd*dd)*step(.02, profS(cxi));
  }
  return e;
}
// turquoise ring: 1 inside the reef / lagoon footprint (plan view radius WR), 0 outside
float reefRing(float x){ return smoothstep(WR*1.08, WR*.98, abs(x - CX)); }

// terrain colour at a point above the sea; sl = signed slope (dy/dx), e = elevation
vec3 terrainCol(float x, float y, float sl){
  float d = abs(x - CX)/W;
  float n = fbm2(vec2(x*30., y*30.) + SEED*10., 3.);
  vec3 tuff = vec3(.13,.1,.08), basalt = vec3(.1,.09,.09), old = vec3(.25,.2,.16);
  vec3 rock = mix(tuff, basalt, smoothstep(.17, .3, uStage));
  rock = mix(rock, old, .6*L.erosion);
  // vegetation: fills the lowlands and valleys first, more where it is older
  float vg = L.veg*smoothstep(HC*.9, HC*.15, y)*(.55 + .45*n)*(1. - .7*smoothstep(.0, .25, max(0., -1.)) );
  vg = clamp(vg*1.6 - .2*smoothstep(.0,.3, uStage - .62 + .3)*0., 0., 1.);
  vec3 green = mix(vec3(.12,.3,.1), vec3(.35,.5,.15), n);
  vec3 col = mix(rock, green, vg);
  // beach sand and a chalky coast on eroded islands
  col = mix(col, vec3(.85,.78,.6), L.erosion*smoothstep(.007*SK, .0, y)*.9);
  // sunlit slopes
  float lit = clamp(.55 + .6*sl*SUN.x*sign(SUN.x + 1e-3)*2. , .15, 1.3);
  lit = clamp(.6 + .9*dot(normalize(vec2(-sl, 1.)), normalize(SUN.xy)), .2, 1.3);
  col *= mix(.35, 1., DAY)*lit;
  col = mix(col, col*vec3(1.1,.9,.75), DUSK*.6);
  // glowing lava channels down the flanks while the shield builds
  float flow = eruptAmt(L)*(1. - L.submarine)*(1. - smoothstep(.5, .62, uStage));
  float ch = fbm2(vec2((x - CX)*9./SK + SEED*50., y*3.5/SK + SEED), 2.);
  float lava = smoothstep(.028, .004, abs(ch - .5))*smoothstep(.03, .1, d)*smoothstep(1., .9, d)*step(.001, y)*min(flow, 1.);
  float temp = (1. - d*.45)*(.6 + .4*noise2(vec2(x*40., y*25. - T*.8)));
  col = mix(col, lavaColor(temp)*(1.2 + .8*NIGHT), lava*.9);
  // fresh black flow tongues (new land) at the coast
  col = mix(col, vec3(.06,.06,.06), (1. - L.erosion)*smoothstep(.05, .0, y)*smoothstep(.22, .3, uStage)*.6*(1. - L.veg));
  return col;
}

// ---------------------------------------------------------------- plumes: colour and opacity
vec4 plume(vec2 uv){
  float vy = max(prof(CX), 0.);
  vec2 d = uv - vec2(CX, vy);
  if (d.y < -.02*SK) return vec4(0.);
  float wind = windDir().x;
  float ea = eruptAmt(L);
  vec4 acc = vec4(0.);
  // Surtseyan steam: a billowing white column that leans with the wind
  float st = L.steam*min(ea*1.3, 1.5);
  if (st > .01) {
    float h = d.y/SK;
    float cx = wind*h*h*1.1 + .3*wind*h;
    float r = (.05 + .5*h)*SK;
    float n = fbm3(vec3(uv*7./SK - vec2(0., T*.5), T*.12 + SEED), 3.5);
    float a = smoothstep(1., .35, abs(d.x - cx*SK)/r + (n - .5)*1.2)*smoothstep(1.3*st, .1, h)*st;
    vec3 c = mix(vec3(.55,.56,.6), vec3(1.,.98,.95), n)*mix(.35, 1., DAY);
    c = mix(c, c*vec3(1.2,.85,.7), DUSK);
    acc = vec4(c, clamp(a*1.4, 0., 1.));
  }
  // black cypressoid "cock's tail" tephra jets
  if (st > .01) {
    float r = length(d);
    float ang = atan(d.x, d.y);
    float jets = 0.;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float ph = T*.9 + fi*1.7;
      float len = SK*(.12 + .22*st)*(.6 + .4*sin(ph))*(.7 + .3*hash11(fi + 2.));
      float a0 = (fi/5. - .5)*1.9 + .2*sin(ph*.7 + fi) + .25*wind;
      float aj = a0 + sign(a0)*r/SK*1.1;                   // droop with gravity
      float wj = .035 + .3*r/SK;
      float j = smoothstep(wj, wj*.3, abs(ang - aj))*smoothstep(len, len*.55, r)*smoothstep(0., .03*SK, r);
      j *= .6 + .4*noise2(vec2(r*40./SK - T*4., fi*7.));
      jets = max(jets, j);
    }
    jets *= st;
    acc = mix(acc, vec4(vec3(.05,.04,.04), 1.), jets*.95);
  }
  // lava fountain and thin gas plume while the shield builds
  float ef = ea*(1. - L.submarine)*(1. - smoothstep(.48, .6, uStage))*(1. - L.steam);
  if (ef > .01) {
    float hF = SK*(.05 + .14*ef);
    float wob = (noise2(vec2(d.y*30./SK - T*6., SEED)) - .5)*.02*SK;
    float f = smoothstep(.014*SK*(1. + d.y/hF), 0., abs(d.x - wob - wind*d.y*.15))*smoothstep(hF, hF*.3, d.y);
    f *= .7 + .3*sin(T*9. + d.y*40.);
    vec3 fc = lavaColor(1. - .5*d.y/hF)*(1.4 + .6*NIGHT);
    acc = mix(acc, vec4(fc, 1.), clamp(f*1.3, 0., 1.));
    // sparks
    vec2 g = (d + vec2(0., T*.3*SK))*60./SK; vec2 gi = floor(g);
    float sp = step(.93, hash12(gi + SEED))*smoothstep(.3, .0, length(fract(g) - .5 - .3*(hash22(gi) - .5)))*smoothstep(hF*1.6, hF*.2, d.y)*smoothstep(.12*SK, .0, abs(d.x))*ef;
    acc = mix(acc, vec4(1.,.6,.2, 1.), sp*.8);
    // gas and ash haze above the fountain
    float h = d.y/SK;
    float cx = wind*h*h*.9 + .2*wind*h;
    float n = fbm3(vec3(uv*6./SK - vec2(0., T*.3), T*.1 + SEED), 3.);
    float a = smoothstep(1., .3, abs(d.x - cx*SK)/((.03 + .3*h)*SK) + (n - .5)*1.4)*smoothstep(1.1*ef, hF/SK*.5, h)*smoothstep(hF/SK*.3, hF/SK, h)*ef*.45;
    acc = mix(acc, vec4(mix(vec3(.5,.48,.5), vec3(.85,.82,.8), n)*mix(.3, 1., DAY), 1.), a);
  }
  // rarer explosive ash bursts from the caldera stage
  float ex = L.expl*(1. - L.steam)*uActivity*2.;
  if (ex > .01) {
    float pulse = smoothstep(.2, .9, sin(T*.35 + SEED*6.)*.5 + .5);
    float h = d.y/SK;
    float cx = wind*h*h*.8 + .25*wind*h;
    float n = fbm3(vec3(uv*5./SK - vec2(0., T*.4), T*.1), 3.);
    float a = smoothstep(1., .35, abs(d.x - cx*SK)/((.05 + .45*h)*SK) + (n - .5)*1.3)*smoothstep(.9*ex*pulse + .05, .0, h)*ex*pulse*.8;
    acc = mix(acc, vec4(mix(vec3(.25,.22,.22), vec3(.6,.55,.5), n)*mix(.3, 1., DAY), 1.), a);
  }
  return acc;
}
// white laze where lava pours into the sea
float laze(vec2 uv){
  float ef = eruptAmt(L)*(1. - L.submarine)*(1. - smoothstep(.45, .6, uStage))*(1. - L.steam)*smoothstep(.2, .26, uStage);
  if (ef < .01) return 0.;
  float a = 0.;
  float wind = windDir().x;
  for (int i = 0; i < 2; i++) {
    float sx = CX + (float(i)*2. - 1.)*W*(.98 + .04*sin(T*.2 + float(i)));
    vec2 d = uv - vec2(sx, 0.);
    float h = d.y/SK; if (h < 0.) continue;
    float n = fbm3(vec3(uv*9./SK - vec2(0., T*.4), T*.15 + float(i)), 3.);
    a = max(a, smoothstep(1., .3, abs(d.x - wind*h*h*SK*1.5 - wind*h*.2*SK)/((.025 + .35*h)*SK) + (n - .5)*1.3)*smoothstep(.45*ef, .0, h)*ef*.8);
  }
  return a;
}

// everything above the horizon line: sky, island, plume. .a = how much of it is open sky
vec4 above(vec2 uv){
  uv.y -= SEA;                              // sea level is y = 0 from here on
  vec3 rd = normalize(vec3(uv.x, max(uv.y, 0.) + .01, 1.));
  vec3 col = skyColor(rd, SUN, DAY);
  // a few soft painted clouds (fade out in a cloud combo, where Mega-Clouds paints them)
  float cl = fbm2(vec2(uv.x*2.2 + T*.012, uv.y*5.) + SEED*3., 4.);
  float ca = smoothstep(.55, .72, cl)*smoothstep(0., .25, uv.y)*(1. - uCombo)*.7;
  col = mix(col, mix(col, mix(vec3(.5,.52,.6), vec3(1.), DAY)*mix(1., .9, DUSK) + SUNCOL*DUSK*.4, .8), ca);
  // moon at night
  vec2 mp = vec2(-ASP*.3 + .1*SEED, .3);
  col += vec3(.9,.9,.8)*smoothstep(.035, .028, length(uv - mp))*NIGHT + vec3(.3,.3,.4)*exp(-length(uv - mp)*12.)*NIGHT*.4;
  // stars
  vec2 sg = uv*40.; vec2 si = floor(sg);
  col += vec3(1.)*step(.97, hash12(si + 1.))*smoothstep(.12, .02, length(fract(sg) - .5 - .3*(hash22(si) - .5)))*NIGHT*(.6 + .4*sin(uClock*3. + hash12(si)*20.));
  float skyA = 1.;
  // the island
  float e = prof(uv.x);
  if (uv.y < e && e > 0.) {
    float sl = (prof(uv.x + .004) - prof(uv.x - .004))/.008;
    col = terrainCol(uv.x, uv.y, sl);
    // distant haze on the far slopes
    skyA = 0.;
  }
  // plume
  vec4 pl = plume(uv);
  col = mix(col, pl.rgb, pl.a);
  skyA *= 1. - pl.a;
  float lz = laze(uv);
  col = mix(col, mix(vec3(.6,.62,.66), vec3(1.), DAY*.9), lz);
  skyA *= 1. - lz;
  return vec4(col, skyA);
}

vec4 scene(vec2 uv){
  if (uv.y >= SEA) return above(uv);
  // ---- the sea: depth gradient, lagoon, reef surf, reflections
  float dz = SEA - uv.y;                    // distance down from the horizon
  float persp = dz/(.5 + SEA);              // 0 at the horizon → 1 at the bottom
  vec3 deep = mix(vec3(.02,.04,.09), mix(vec3(.05,.2,.35), vec3(.08,.3,.5), persp), DAY);
  deep = mix(deep, deep*vec3(1.4,.9,.7) + SUNCOL*.25*(1. - persp), DUSK*.7);
  vec3 col = deep;
  // plan-view radius of this pixel from the island centre (sea is a plane seen obliquely)
  float px = uv.x - CX, pz = dz*3.2;        // z along the view, scaled so the lagoon reads
  float rr = length(vec2(px, pz));
  // lagoon and reef
  float inReef = smoothstep(WR*1.05, WR*.95, rr)*L.reef;
  vec3 lag = mix(vec3(.1,.55,.6), vec3(.25,.8,.75), smoothstep(WR, WR*.3, rr))*mix(.3, 1., DAY);
  col = mix(col, lag, inReef*(.35 + .55*L.lagoon));
  float surf = smoothstep(.06*WR, .0, abs(rr - WR))*L.reef*(.6 + .4*noise2(vec2(px*40., pz*40. - T)));
  col = mix(col, vec3(.9,.93,.95)*mix(.4, 1., DAY), surf*.8);
  // sandy motu islets on the atoll ring
  float motu = smoothstep(.04*WR, .0, abs(rr - WR*1.0))*step(.6, noise2(vec2(atan(px, pz)*4. + SEED*9., 1.)))*smoothstep(.85, .95, uStage);
  col = mix(col, vec3(.9,.85,.65)*mix(.3, 1., DAY), motu);
  // discoloured water and bubbles over the growing seamount
  float sub = L.submarine*smoothstep(-1., -.45, L.h);
  float ptch = exp(-pow(px/(W*2. + .08), 2.) - pow(pz/(W*1.5 + .06), 2.))*sub;
  col = mix(col, vec3(.35,.5,.35)*mix(.3, 1., DAY), ptch*.85*(.6 + .4*noise2(vec2(px*14., pz*14. + T*.3))));
  // the seamount's dark shape through the water
  col = mix(col, vec3(.08,.1,.1), smoothstep(1., .2, length(vec2(px/(W*1.1 + .05), pz/(W*.8 + .04))))*sub*.3*DAY);
  vec2 bg = vec2(px*60., pz*60. + T*1.5); vec2 bi = floor(bg);
  col += vec3(.5)*step(.85, hash12(bi + SEED))*smoothstep(.2, .0, length(fract(bg) - .5))*ptch*1.5*step(-.3, L.h);
  // reflection of the sky, island and plume
  float wob = sin(uv.y*90. + T*1.2 + noise2(vec2(uv.x*20., uv.y*40.))*4.)*.008*(1. + persp);
  vec2 ruv = vec2(uv.x + wob, 2.*SEA - uv.y*(1. + .6*persp));
  vec4 ab = above(ruv);
  float streak = .55 + .45*noise2(vec2(uv.x*30., uv.y*260. - T*.7));
  float fres = mix(.6, .2, persp)*streak;
  col = mix(col, ab.rgb*vec3(.85,.92,1.), fres*(ab.a < .5 ? .8 : .5));
  // sun glitter
  float glit = pow(max(0., 1. - abs(uv.x - SUN.x*.9)*3.), 8.)*smoothstep(.0, .1, SUN.y)*noise2(vec2(uv.x*120., uv.y*300. - T*2.))*(1. - persp);
  col += SUNCOL*glit*.6;
  // wave strokes
  col *= .92 + .08*sin(uv.y*220. - T*1.5 + noise2(uv*30.)*3.);
  // lava glow on the water at night
  col += vec3(1.,.4,.1)*NIGHT*eruptAmt(L)*(1. - L.submarine)*(1. - L.erosion)*exp(-abs(px)*4.)*(1. - persp)*.25;
  col = mix(col, ab.rgb, 0.);
  return vec4(col, 0.);
}

// ---------------------------------------------------------------- painters
vec3 paper(vec2 uv){ return vec3(.5*fbm2(uv*vec2(140., 110.), 3.) + .5*noise2(uv*700.)); }
vec3 sat(vec3 c, float k){ float l = luma(c); return mix(vec3(l), c, k); }
vec3 hueShift(vec3 c, float a){ vec3 k = vec3(.57735); float cs = cos(a), sn = sin(a); return c*cs + cross(k, c)*sn + k*dot(k, c)*(1. - cs); }

void main(){
  ASP = uRes.x/uRes.y; T = uTime;
  vec2 uv = gl_FragCoord.xy/uRes.y - vec2(ASP*.5, .5);
  L = life(uStage);
  SEED = fract(uSeed*7. + uEpoch*.618);
  SK = mix(.55, 1.4, uSize);
  SEA = -.14;
  FL = -.45;
  HP = sign(L.h)*pow(abs(L.h), .7)*.3*SK;    // tuff cones are small but must still show
  HP = max(HP, .05*SK*L.steam*(1. - L.submarine));   // the raw tuff cone shows as soon as the vent is above water
  HC = HP - FL;
  CX = (SEED - .5)*.3*ASP;
  WFULL = 1.02*SK;
  W = (.12 + .9*smoothstep(.1, .5, uStage))*(1. - .55*smoothstep(.78, .96, uStage))*SK;
  W = max(W, .03);
  WR = max(W*1.08, WFULL*.95*L.reef) ;
  PROFP = mix(1.15, 1.9, smoothstep(.15, .45, uStage));
  DAY = smoothstep(.0, .5, uLight);
  DUSK = smoothstep(.0, .3, uLight)*(1. - smoothstep(.3, .6, uLight));
  NIGHT = 1. - smoothstep(.0, .25, uLight);
  float sel = mix(-.15, .95, uLight);
  SUN = normalize(vec3(.6*ASP*(1. - uLight*.6), sel, 1.));
  SUNCOL = mix(vec3(1.,.5,.2), vec3(1.,.95,.85), smoothstep(.1, .6, uLight));

  // stroke scale from Stroke size and Detail
  float ss = mix(.004, .03, uX1)*mix(1.4, .7, uDetail);
  float loose = uX2;
  vec4 r;

#if defined(MODE_0)
  // impressionist broken colour: two overlapping grids of dabs with per-dab colour drift
  vec2 g1 = uv/ss; vec2 c1 = floor(g1) + .5 + (hash22(floor(g1)) - .5)*.8;
  vec2 g2 = rot2(uv, .5)/ss*1.3 + 7.; vec2 c2 = floor(g2) + .5 + (hash22(floor(g2)) - .5)*.8;
  vec2 p1 = c1*ss, p2 = rot2((c2 - 7.)*ss/1.3, -.5);
  vec4 s1 = scene(p1), s2 = scene(p2);
  float sel2 = step(.5, noise2(uv/ss*.7 + T*.05));
  r = mix(s1, s2, sel2);
  float hv = (hash12(floor(mix(g1, g2, sel2))) - .5)*loose*.9;
  r.rgb = hueShift(r.rgb, hv)*(1. + (hash12(floor(g1) + 3.) - .5)*loose*.6);
  float bristle = noise2(vec2(uv.x*600., uv.y*90.)) ;
  r.rgb *= .9 + .25*bristle;
  r.rgb = sat(r.rgb, 1.25);
  r.rgb = mix(r.rgb, r.rgb*(.85 + .3*paper(uv).x), uX3);
#elif defined(MODE_1)
  // pointillism: dots on cream canvas; complementary flecks between
  vec2 g = uv/ss; vec2 gi = floor(g);
  vec2 jit = (hash22(gi) - .5)*.5;
  float dd = length(fract(g) - .5 - jit);
  vec2 gb = (uv + vec2(ss*.5))/ss; vec2 gbi = floor(gb);
  float db = length(fract(gb) - .5 - (hash22(gbi + 11.) - .5)*.5);
  vec4 sa = scene((gi + .5 + jit)*ss), sb = scene((gbi + .5 + (hash22(gbi + 11.) - .5)*.5)*ss - ss*.5);
  vec3 canvas = vec3(.93,.9,.82)*(.9 + .1*paper(uv).x*uX3*2.);
  float ra = .42 + .1*hash12(gi + 5.), rb = .36 + .1*hash12(gbi + 9.);
  vec3 ca = sat(sa.rgb, 1.5), cb = sat(sb.rgb, 1.5);
  // every few dots a complementary fleck
  ca = mix(ca, hueShift(ca, 2.6), step(.75, hash12(gi + 2.))*loose*.6);
  cb = mix(cb, hueShift(cb, -2.6), step(.8, hash12(gbi + 4.))*loose*.6);
  float ea = smoothstep(ra, ra - .08, dd), eb = smoothstep(rb, rb - .08, db);
  r.rgb = mix(canvas, cb, eb);
  r.rgb = mix(r.rgb, ca, ea);
  r.a = mix(mix(1., sb.a, eb), sa.a, ea);
  float dark = min(sa.a, sb.a) < .5 ? 1. : 1.;
  r.rgb *= dark;
#elif defined(MODE_2)
  // watercolour: wet washes with wobbly edges, darkened edges, granulation and paper
  vec2 warp = vec2(fbm2(uv*18. + 3., 3.), fbm2(uv*18. + 9., 3.)) - .5;
  vec2 q = uv + warp*ss*2.5*(.5 + loose);
  vec4 s0 = scene(q);
  vec4 sx = scene(q + vec2(ss*1.5, 0.)), sy = scene(q + vec2(0., ss*1.5));
  float edge = clamp((length(s0.rgb - sx.rgb) + length(s0.rgb - sy.rgb))*2.5, 0., 1.);
  vec3 c = s0.rgb;
  // quantise into washes
  float lv = mix(14., 5., loose);
  c = floor(c*lv + .5)/lv;
  c = mix(c, c*c*1.6, .3);
  float gran = noise2(uv*260.)*.5 + .5*noise2(uv*90. + 5.);
  c *= .88 + .24*gran*(.4 + .6*uX3);
  c = mix(c, c*.6, edge*.7);
  // the paper shows through the lightest washes
  vec3 pap = vec3(.97,.95,.9)*(.93 + .07*paper(uv).x);
  float light = smoothstep(.55, .95, luma(c));
  c = mix(c, pap, light*.8);
  // dry-brush white flecks
  c = mix(c, pap, step(.93, noise2(uv*400.))*.5);
  r = vec4(c, s0.a);
#elif defined(MODE_3)
  // oil impasto: strokes follow the structure (horizontal for sky/sea, down the slopes on the island)
  float e = prof(uv.x);
  float sl = (prof(uv.x + .005) - prof(uv.x - .005))/.01;
  vec2 dir = normalize(vec2(1., uv.y > SEA && uv.y - SEA < e ? -sign(uv.x - CX)*abs(sl)*1.5 : (uv.y > SEA ? .15*sin(uv.x*6. + uv.y*4.) : 0.)));
  vec2 perp = vec2(-dir.y, dir.x);
  float a = dot(uv, dir), b = dot(uv, perp);
  float bi = floor(b/ss); float bj = fract(b/ss);
  float ai = floor((a + hash11(bi)*ss*3.)/(ss*4.));
  vec2 p = dir*((ai + .5)*ss*4. - hash11(bi)*ss*3.) + perp*((bi + .5)*ss);
  vec4 s = scene(p);
  vec4 s2 = scene(uv);
  r = mix(s, s2, .25);
  r.rgb = hueShift(r.rgb, (hash12(vec2(ai, bi)) - .5)*loose*.5)*(1. + (hash12(vec2(bi, ai)) - .5)*loose*.3);
  // paint relief: ridge along each stroke, lit from the upper left
  float ridge = sin(bj*TAU)*.5 + .5;
  float bump = ridge*.6 + .4*noise2(vec2(a*500., b*80.));
  float lit = (bump - (sin((bj - .06)*TAU)*.5 + .5)*.6)*uX3*3.;
  r.rgb *= 1. + lit*.9;
  r.rgb += vec3(.08)*pow(max(0., 1. - abs(bj - .35)*4.), 4.)*uX3;
  r.rgb = sat(r.rgb, 1.2);
#elif defined(MODE_4)
  // Van Gogh: swirling flow field around the sun and the plume, short dashed strokes along it
  vec2 vc = vec2(SUN.x*.8, .28), vc2 = vec2(CX, SEA + max(prof(CX), 0.) + .22*SK);
  ss *= 1.8;
  vec2 uq = (floor(uv/(ss*5.)) + .5)*ss*5.;        // one stroke direction per patch, so the dashes line up
  vec2 fl = vec2(cos(noise2(uq*3. + T*.03)*TAU), sin(noise2(uq*3. + T*.03)*TAU));
  vec2 rr = uq - vc; float l = length(rr); fl += vec2(-rr.y, rr.x)/max(l, 1e-3)*exp(-l*l/.12)*3.;
  rr = uq - vc2; l = length(rr); fl += vec2(rr.y, -rr.x)/max(l, 1e-3)*exp(-l*l/.06)*2.5;
  float e = prof(uv.x);
  if (uv.y < SEA) fl = vec2(1., .25*sin(uv.x*20. + uv.y*30. + T*.3));
  else if (uv.y - SEA < e) { float sl = (prof(uv.x + .005) - prof(uv.x - .005))/.01; fl = vec2(sign(uv.x - CX), -abs(sl)*1.2); }
  fl = normalize(fl);
  vec2 perp = vec2(-fl.y, fl.x);
  float b = dot(uv, perp), a = dot(uv, fl);
  float bi = floor(b/ss);
  float ai = floor((a + hash11(bi)*ss*3.)/(ss*3.));
  vec4 s = vec4(0.);
  for (int i = -1; i <= 1; i++) s += scene(uv + fl*float(i)*ss*1.2)*(i == 0 ? .5 : .25);
  r = s;
  r.rgb = hueShift(r.rgb, (hash12(vec2(ai, bi)) - .5)*loose*.8)*(1. + (hash12(vec2(bi, ai) + 1.) - .5)*loose*.5);
  float dash = smoothstep(.0, .2, fract(a/(ss*3.) + hash11(bi)));
  float stroke = sin(fract(b/ss)*TAU)*.5 + .5;
  r.rgb *= .75 + .4*stroke*dash + .1*dash;
  r.rgb = sat(r.rgb, 1.5);
  // halos of light around the sun and the vent, like rings of brushwork
  float ring = sin(length(uv - vc)*32. - T)*.5 + .5;
  r.rgb += vec3(1.,.85,.4)*ring*exp(-length(uv - vc)*5.)*.35*step(.5, r.a);
  r.rgb = mix(r.rgb, r.rgb*(.9 + .2*paper(uv).x), uX3*.5);
#elif defined(MODE_5)
  // Turner: light and fiery haze; soft, warm, dissolving forms
  vec4 s = vec4(0.);
  for (int i = 0; i < 4; i++) {
    vec2 o = (hash22(vec2(float(i), floor(uv.y*3.))) - .5)*ss*3.*(.5 + loose);
    s += scene(uv + o + vec2(fbm2(uv*6. + float(i), 2.) - .5)*ss*4.)*.25;
  }
  r = s;
  vec3 warm = vec3(1.,.8,.55);
  float dsun = length((uv - vec2(SUN.x*.8, SUN.y*.55 + SEA + .02))*vec2(1., 1.4));
  float glow = exp(-dsun*3.)*(.5 + .5*DAY) + exp(-dsun*1.2)*.4;
  vec3 c = mix(r.rgb, vec3(luma(r.rgb))*warm, .45);
  c = mix(c, warm*1.1, glow*.7);
  // eruption light scatters through the haze
  vec2 vp = vec2(CX, SEA + max(prof(CX), 0.));
  float ea = eruptAmt(L)*(1. - L.submarine);
  c += vec3(1.,.5,.2)*exp(-length((uv - vp)*vec2(1., .8))*4.)*ea*.5*(1. - L.erosion);
  c += vec3(.9,.9,1.)*exp(-length(uv - vp - vec2(0., .1))*5.)*L.steam*.3;
  float mist = fbm2(uv*4. + vec2(T*.03, 0.), 4.);
  c = mix(c, warm*mix(.3, .95, DAY)*(.85 + .3*mist), smoothstep(.3, .8, mist)*.35*(.5 + uX3));
  c = mix(vec3(.5), c, .8);           // lifted blacks
  c = pow(c, vec3(.9));
  r.rgb = c;
#elif defined(MODE_6)
  // gouache: flat opaque poster shapes, slight edge wobble, matte finish
  vec2 q = uv + (vec2(noise2(uv*40.), noise2(uv*40. + 7.)) - .5)*ss*.8*loose;
  vec4 s = scene(q);
  vec3 c = s.rgb;
  float lv = mix(9., 4., loose);
  vec3 hsv = c; float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float v = floor(pow(mx, .9)*lv + .5)/lv;
  c = mn >= mx - 1e-4 ? vec3(v) : c/mx*v;
  c = sat(c, 1.25);
  c = mix(c, c*(.92 + .16*paper(uv).x), uX3);
  // chalky highlights where the paint is light
  c += vec3(.05)*smoothstep(.6, .9, luma(c));
  r = vec4(c, s.a);
#else
  // nocturne: Whistler blues, soft forms, the volcano's light the only warmth
  vec4 s = vec4(0.);
  for (int i = 0; i < 3; i++) s += scene(uv + (hash22(vec2(float(i), 1.)) - .5)*ss*2.*(.4 + loose))*(1./3.);
  r = s;
  vec3 c = r.rgb;
  float heat = smoothstep(.2, .6, c.r - c.b);  // keep the lava and fountain warm
  vec3 cool = mix(vec3(luma(c))*vec3(.6,.7,.95), c, .3);
  c = mix(cool, c*vec3(1.1,.8,.5), heat);
  // gold flecks: embers and lamplight
  vec2 g = uv*90.; vec2 gi = floor(g);
  c += vec3(1.,.75,.3)*step(.985, hash12(gi + floor(T*.3)))*smoothstep(.25, .0, length(fract(g) - .5))*smoothstep(SEA - .3, SEA, uv.y)*.6;
  c = mix(c, c*(.9 + .2*paper(uv).x), uX3*.4);
  c *= .9;
  r.rgb = c;
#endif
  // glow: bloom around hot and bright things
  vec2 vpg = vec2(CX, SEA + max(prof(CX), 0.));
  float eag = eruptAmt(L)*(1. - L.submarine)*(1. - smoothstep(.55, .66, uStage));
  r.rgb += vec3(1.,.45,.15)*exp(-length((uv - vpg)*vec2(1.3, 1.))*6./SK)*eag*uX4*(.25 + .6*NIGHT);
  r.rgb += SUNCOL*exp(-length(uv - vec2(SUN.x*.8, SUN.y*.55 + SEA + .02))*6.)*uX4*.35*smoothstep(-.1, .2, SUN.y)*step(.5, r.a)*(1. - uCombo);
  finish(clamp(r.rgb, 0., 1.5), r.a);
}
`;

export default shaderEngine({
  id: 'painterly',
  name: 'Painterly',
  fs,
  res: 1,
  sky: true,
  defaults: { MODE: 0 },
  params: [
    { id: 'x1', label: 'Stroke size', value: 0.45, tip: 'Size of the dabs, dots and strokes' },
    { id: 'x2', label: 'Looseness', value: 0.5, tip: 'How far colours and edges wander from the subject' },
    { id: 'x3', label: 'Texture', value: 0.5, tip: 'Canvas, paper and impasto relief' },
    { id: 'x4', label: 'Glow', value: 0.5, tip: 'Light bloom around the sun and the eruption' },
  ],
});

export const scenes = [
  { id: 'painterly-impressionist', name: 'Impressionist Shield', tags: ['art', 'realistic', 'hawaii', 'lava', 'eruption'],
    desc: 'Broken colour and quick dabs: a shield volcano fountaining lava, its flows steaming into a sunlit sea.',
    opts: { MODE: 0 }, params: { stage: 0.36, grow: 0.3, activity: 0.55, scale: 0.55, light: 0.75, x1: 0.4, x2: 0.55, x3: 0.5, x4: 0.4 } },
  { id: 'painterly-pointillism', name: 'Pointillist Afternoon', tags: ['art', 'calm', 'hawaii'],
    desc: 'Seurat-style dots of pure colour build a quiet, eroded island with its fringing reef on a hazy afternoon.',
    opts: { MODE: 1 }, params: { stage: 0.7, grow: 0.3, activity: 0.5, scale: 0.6, light: 0.85, x1: 0.35, x2: 0.5, x3: 0.6, x4: 0.3 } },
  { id: 'painterly-watercolour', name: 'Watercolour Surtsey', tags: ['art', 'paper', 'surtseyan', 'eruption'],
    desc: 'Wet washes and blooming edges: black cock’s-tail jets and white steam as a new island breaks the surface.',
    opts: { MODE: 2 }, params: { stage: 0.17, grow: 0.35, activity: 0.6, scale: 0.5, light: 0.7, x1: 0.5, x2: 0.5, x3: 0.7, x4: 0.3 } },
  { id: 'painterly-impasto', name: 'Oil Impasto Caldera', tags: ['art', 'lava', 'hawaii'],
    desc: 'Thick directional strokes rake down the slopes of a collapsing shield dotted with cinder cones at golden hour.',
    opts: { MODE: 3 }, params: { stage: 0.55, grow: 0.3, activity: 0.5, scale: 0.6, light: 0.32, x1: 0.5, x2: 0.4, x3: 0.75, x4: 0.4 } },
  { id: 'painterly-vangogh', name: 'Starry Eruption', tags: ['art', 'night', 'eruption', 'lava'],
    desc: 'A Van Gogh sky swirls around the moon while the volcano below glows and throws fountains of fire.',
    opts: { MODE: 4 }, params: { stage: 0.33, grow: 0.3, activity: 0.7, scale: 0.55, light: 0.12, x1: 0.45, x2: 0.65, x3: 0.4, x4: 0.7 } },
  { id: 'painterly-turner', name: 'Turner Haze', tags: ['art', 'eruption', 'surtseyan'],
    desc: 'Light dissolves everything into fiery haze: a Surtseyan eruption seen through Turner’s golden mist, fast-forwarding through its life.',
    opts: { MODE: 5 }, params: { stage: 0.2, grow: 0.6, activity: 0.6, scale: 0.6, light: 0.28, x1: 0.6, x2: 0.6, x3: 0.6, x4: 0.8 } },
  { id: 'painterly-gouache', name: 'Gouache Atoll', tags: ['art', 'poster', 'atoll', 'calm'],
    desc: 'Flat, matte gouache shapes: a barrier reef and turquoise lagoon around the last stub of a sinking island.',
    opts: { MODE: 6 }, params: { stage: 0.86, grow: 0.3, activity: 0.5, scale: 0.65, light: 0.9, x1: 0.3, x2: 0.35, x3: 0.5, x4: 0.2 } },
  { id: 'painterly-nocturne', name: 'Nocturne in Blue and Fire', tags: ['art', 'night', 'lava', 'calm'],
    desc: 'A Whistler nocturne: muted blues, a soft sea, and lava threads the only warm light on a quiet night.',
    opts: { MODE: 7 }, params: { stage: 0.42, grow: 0.25, activity: 0.45, scale: 0.55, light: 0.05, x1: 0.5, x2: 0.4, x3: 0.5, x4: 0.6 } },
];
