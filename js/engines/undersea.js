// Undersea: the island's life from below the waves. MODE 0 is a dive on the flank (raymarched heightfield in
// depth-attenuated water: pillow lava glowing between its lobes, hydrothermal smokers and bubbles while the vent is
// submerged, the surface seen from below with Snell's window, caustics, coral and fish once the reef arrives, the
// drowned guyot at the end). HUD adds a ROV camera overlay with a 3x5 bitmap font; MODE 3 is a sonar bathymetry
// screen. No open sky: the frame is all water. Drag swims around the island.
import { shaderEngine } from '../gl.js';
import { ISLAND_GLSL } from './_island.js';

// 3x5 bitmap font, rows top to bottom
const GLYPHS = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111', '9': '111101111001111',
  A: '010101111101101', B: '110101110101110', C: '111100100100111', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '111100101101111', H: '101101111101101', I: '111010010010111', K: '101101110101101',
  L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '111101101101111', P: '111101111100100',
  R: '111101110101101', S: '111100111001111', T: '111010010010010', U: '101101101101111', V: '101101101101010',
  W: '101101111111101', Y: '101101010010010', ' ': '000000000000000', '.': '000000000000010', '-': '000000111000000', ':': '000010000010000'
};
const KEYS = Object.keys(GLYPHS);
const FONT = KEYS.map(k => parseInt(GLYPHS[k], 2));
const LABELS = ['DEPTH', 'TEMP', 'HDG', 'REC', 'ROV CAM 1', 'M', 'C', 'LIFE', 'SONAR', 'BATHYMETRY', 'SWEEP', 'SUMMIT', 'SEA LEVEL', 'VENT', 'PRESS', 'BAR', 'DIVE', 'NIGHT'];
const TXT = []; const OFF = {};
for (const l of LABELS) { OFF[l] = [TXT.length, l.length]; for (const ch of l) TXT.push(Math.max(0, KEYS.indexOf(ch))); }
const fontGLSL = `
const int FONT[${FONT.length}] = int[${FONT.length}](${FONT.join(',')});
const int TXT[${TXT.length}] = int[${TXT.length}](${TXT.join(',')});
float glyph(int g, vec2 q){ if (q.x < 0. || q.x >= 1. || q.y < 0. || q.y >= 1.) return 0.; ivec2 c = ivec2(int(q.x*3.), int(q.y*5.)); int bit = c.y*3 + (2 - c.x); return float((FONT[g] >> bit) & 1); }
// text at pos (origin bottom-left) with glyph height h, in screen uv units
float textAt(vec2 p, vec2 pos, float h, int start, int len){
  vec2 q = (p - pos)/h; q.x /= .8;
  int i = int(floor(q.x)); if (i < 0 || i >= len || q.y < 0. || q.y >= 1.) return 0.;
  return glyph(TXT[start + i], vec2((fract(q.x) - .1)/.8, q.y));
}
float numberAt(vec2 p, vec2 pos, float h, float v, int digits){
  vec2 q = (p - pos)/h; q.x /= .8;
  int i = int(floor(q.x)); if (i < 0 || i >= digits || q.y < 0. || q.y >= 1.) return 0.;
  float d = floor(mod(v/pow(10., float(digits - 1 - i)), 10.));
  return glyph(int(d), vec2((fract(q.x) - .1)/.8, q.y));
}
`;
const T = (label) => `${OFF[label][0]}, ${OFF[label][1]}`;

const fs = ISLAND_GLSL + fontGLSL + `
float T, DAY, NIGHT, OCTM, ERUPT, LAMP, SURF;
vec3 SUN, VENT, CAMF;
vec3 CRO;

float lightAt(float y){ return exp(min(y, 0.)/(.22*I_R))*SURF; }
vec3 waterCol(float y){ return mix(vec3(.0,.012,.03), vec3(.02,.3,.42), lightAt(y)); }
float caustic(vec2 xz, float t){
  vec2 q = xz*(6./I_R);
  float a = worley2(q + vec2(t*.25, t*.17));
  float b = worley2(q*1.3 + vec2(-t*.2, t*.23) + 7.);
  return pow(smoothstep(.25, .62, a), 2.)*.7 + pow(smoothstep(.25, .62, b), 2.)*.7;
}
float terrainMarch(vec3 ro, vec3 rd, float tmax){
  float t = .01*I_R, lh = 0., ly = 0., dt = .01;
  for (int i = 0; i < 110; i++) {
    vec3 p = ro + rd*t;
    float h = islandH(p.xz, OCTM);
    if (p.y < h) { if (i > 0) t -= dt*(h - p.y)/((h - p.y) + (ly - lh)); return t; }
    dt = clamp((p.y - h)*.5, .004*I_R + .01*t, .25*I_R);
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
// pillow-lava relief and glow
vec3 pillows(vec3 p, inout vec3 n, out float glow){
  vec2 q = p.xz*(18./I_R);
  float w = worley2(q + I_SEED);
  float w2 = worley2(q*2.7 + 3.);
  // bump the normal with the cell field gradient
  float e = .02;
  float wx = worley2(q + vec2(e, 0.) + I_SEED) - w, wz = worley2(q + vec2(0., e) + I_SEED) - w;
  n = normalize(n + vec3(-wx, 0., -wz)*8.*uX1);
  float seam = 1. - smoothstep(.0, .1, w);
  float r = length(p.xz);
  // fresh pillows bud near the vent while it is submerged; later the whole flank is old pillow and hyaloclastite
  float fresh = IL.submarine*ERUPT*smoothstep(.5*I_R, .08*I_R, r)*(.7 + .3*sin(T*2. + w*20.));
  glow = seam*fresh*(.5 + .5*noise2(q*.7));
  vec3 alb = mix(vec3(.075,.075,.085), vec3(.1,.095,.09), smoothstep(.3, .7, w2));
  alb = mix(alb, vec3(.22,.2,.18), (1. - seam)*.3*IL.erosion);
  return alb;
}
// coral and sand on the shallow flanks once the reef arrives
vec3 reefCol(vec3 p, vec3 n, vec3 alb){
  float shallow = smoothstep(-.3*I_R, -.05*I_R, p.y);
  float reef = IL.reef*shallow;
  if (reef < .01) return alb;
  vec2 q = p.xz*(26./I_R);
  float w = worley2(q + I_SEED*2.);
  float alive = 1. - smoothstep(.95, 1., I_STAGE);
  float cell = hash12(floor(q + I_SEED*2.));
  vec3 coral = hsv2rgb(vec3(fract(cell*5.3 + .85), .42*alive, .75 - .4*(1. - alive)));
  coral = mix(coral, vec3(.9,.85,.7), step(.75, cell));
  float head = (1. - smoothstep(.15, .45, w))*step(.35, cell)*(.6 + .4*noise2(q*3.))*(.3 + .7*alive);
  float sand = smoothstep(.5, .9, n.y)*smoothstep(-.12*I_R, -.02*I_R, p.y);
  vec3 sandc = vec3(.75,.72,.6)*(.85 + .15*sin(p.x*(40./I_R) + p.z*(10./I_R)));
  vec3 c = mix(alb, sandc, sand*reef);
  c = mix(c, coral*(.6 + .4*noise2(q*4.)), head*reef);
  return c;
}
// smokers and bubbles: a short volumetric march near the vent (returns rgb, alpha-premultiplied in .a as transmittance)
vec4 ventVolume(vec3 ro, vec3 rd, float tmax){
  float sub = IL.submarine*ERUPT;
  float colE = ERUPT*(1. - IL.submarine)*(1. - IL.erosion);
  if (sub < .02 && colE < .02) return vec4(0., 0., 0., 1.);
  // bounding sphere round the vent
  vec3 oc = ro - VENT; float rr = .7*I_R;
  float b = dot(oc, rd), c = dot(oc, oc) - rr*rr, disc = b*b - c;
  if (disc < 0.) return vec4(0., 0., 0., 1.);
  float sq = sqrt(disc); float t0 = max(-b - sq, 0.), t1 = min(-b + sq, tmax);
  if (t1 <= t0) return vec4(0., 0., 0., 1.);
  float steps = mix(10., 22., uDetail);
  float dt = (t1 - t0)/steps;
  float t = t0 + dt*hash12(gl_FragCoord.xy + fract(uClock)*13.);
  vec3 sum = vec3(0.); float Tr = 1.;
  for (int i = 0; i < 22; i++) {
    if (float(i) >= steps || Tr < .05) break;
    vec3 p = ro + rd*t;
    vec3 q = p - VENT;
    float d = 0.; vec3 col = vec3(0.);
    if (sub > .02) {
      // three black smokers rising and drifting
      for (int k = 0; k < 3; k++) {
        float fk = float(k); float ak = hash11(I_SEED*4. + fk*2.3)*TAU;
        vec2 vp = vec2(cos(ak), sin(ak))*I_R*(.06 + .1*hash11(fk + 1.));
        float h = q.y + .02*I_R;
        if (h < 0. || h > .6*I_R) continue;
        vec2 off = q.xz - vp - vec2(.2, .1)*h*h/I_R;
        float rad = I_R*(.015 + .12*h/I_R);
        float dr = length(off)/rad;
        if (dr > 1.2) continue;
        float n = fbm3(vec3(off.x, h - T*I_R*.25, off.y)*(6./I_R) + fk, 2.5);
        float sd = smoothstep(0., .6, (1. - dr) + (n - .5)*1.3)*smoothstep(.6, .3, h/I_R)*sub*5.;
        d += sd; col += vec3(.04,.035,.03)*sd;
      }
      // a haze of bubbles and warm shimmer over the vent
      float h = q.y + .02*I_R;
      if (h > 0. && h < .8*I_R) {
        float dr = length(q.xz)/(I_R*(.08 + .2*h/I_R));
        if (dr < 1.) { float bub = step(.93, noise3(q*(40./I_R) - vec3(0., T*2.5, 0.)))*(1. - dr); d += bub*3.*sub; col += vec3(.7,.8,.85)*bub*3.*sub; }
      }
    }
    // glow haze around hot lava
    float hot = max(sub*smoothstep(.3*I_R, 0., length(q)), colE*smoothstep(.15*I_R, 0., length(q)));
    vec3 em = vec3(1., .3, .06)*hot*.09;
    float a = 1. - exp(-d*dt*2.);
    sum += Tr*(a*col*(.3 + .7*lightAt(p.y)) + em*dt*(1. + 2.*NIGHT));
    Tr *= 1. - a;
    t += dt;
  }
  return vec4(sum, Tr);
}
// the sea surface seen from below
vec3 surfaceFromBelow(vec3 p, vec3 rd){
  vec2 q = p.xz*(3./I_R);
  float w = fbm2(q + T*vec2(.3, .2), 3.) + .5*fbm2(q*2.3 - T*vec2(.2, .4), 2.);
  float e = .03*I_R;
  float wx = fbm2((p.xz + vec2(e, 0.))*(3./I_R) + T*vec2(.3, .2), 3.) + .5*fbm2((p.xz + vec2(e, 0.))*(6.9/I_R) - T*vec2(.2, .4), 2.) - w;
  float wz = fbm2((p.xz + vec2(0., e))*(3./I_R) + T*vec2(.3, .2), 3.) + .5*fbm2((p.xz + vec2(0., e))*(6.9/I_R) - T*vec2(.2, .4), 2.) - w;
  vec3 n = normalize(vec3(-wx*6., 1., -wz*6.));
  // refract out of the water (eta 1.33): total internal reflection outside Snell's window
  vec3 rf = refract(rd, -n, 1.33);
  vec3 col;
  float sunUp = smoothstep(-.1, .3, DAY);
  if (dot(rf, rf) < .5) col = waterCol(-.2*I_R)*.6;   // reflection of the dim water below
  else {
    vec3 sky = skyColor(rf, SUN, DAY)*.8;
    col = sky*(.6 + .4*sunUp);
    col += vec3(1., .95, .8)*pow(max(dot(rf, SUN), 0.), 60.)*.8*sunUp;
    float colE = ERUPT*(1. - IL.submarine);
    if (colE > .02) { float pl = smoothstep(.5*I_R, .05*I_R, length(p.xz - windDir()*.3*I_R*min(colE, 1.))); col = mix(col, vec3(.5,.48,.46), pl*.6); }
    // jets and steam above, seen as dark shapes
    if (IL.steam > .01) {
      vec2 wd = windDir();
      float dark = 0.;
      for (int k = 0; k < 5; k++) {
        float fk = float(k); float ak = fk*1.26 + .4*hash11(I_SEED*3.1 + fk*7.7);
        float pulse = smoothstep(.1, .55, .5 + .5*sin(T*2.2 + fk*1.9));
        vec2 dir = vec2(cos(ak), sin(ak));
        float s = dot(p.xz, dir), perp = abs(dot(p.xz, vec2(-dir.y, dir.x)));
        float len = I_R*.8*IL.steam*pulse;
        dark += smoothstep(.09*I_R + .18*s, 0., perp)*step(-.05*I_R, s)*smoothstep(len, len*.3, s);
      }
      float steam = smoothstep(.5*I_R, .1*I_R, length(p.xz - wd*.2*I_R))*IL.steam;
      col = mix(col, vec3(.95), steam*.6);
      // tephra fallout darkens the water around the vent
      float fall = smoothstep(.7*I_R, .15*I_R, length(p.xz))*IL.steam*(.4 + .4*noise2(p.xz*(8./I_R) + T*.5));
      col = mix(col, vec3(.1,.09,.08), clamp(fall*1.2, 0., 1.));
      col = mix(col, vec3(.03,.03,.04), clamp(dark, 0., 1.)*.9);
    }
  }
  return col;
}

void main(){
  T = uTime + uSeed*100.;
  vec2 uv = (gl_FragCoord.xy - .5*uRes)/uRes.y;
  vec2 suv = gl_FragCoord.xy/uRes.y;
  DAY = uLight; NIGHT = 1. - smoothstep(0., .25, DAY);
  float sa = mix(-.12, 1.15, DAY);
  SUN = normalize(vec3(sin(2.2)*cos(sa), sin(sa), cos(2.2)*cos(sa)));
  SURF = mix(.06, 1., smoothstep(-.05, .35, DAY));
  OCTM = mix(2.5, 5., uDetail);
  Life L = life(uStage);
  float R = mix(1.2, 3., uSize);
  islandSetup(L, uStage, R, .9, 2., 1.7, uEpoch*3.7 + uSeed*11., .34, .14);
  I_ROUGH = 1.;
  ERUPT = eruptAmt(L);
  VENT = vec3(0., I_PEAK + .12*I_R*IL.steam*0. - IL.caldera*I_CAL*I_R*.6, 0.);
  LAMP = uX2;
  vec3 col = vec3(0.);

#ifdef MODE_3
  // ---- sonar / bathymetry screen
  {
    vec2 g = uv*mix(4.2, 2.2, uSize)*I_R + uDrag*I_R*2.;
    float h = islandH(g, OCTM);
    float depth = -h/(.9*I_R);      // 0 at the surface, 1 at the sea floor
    vec3 c;
    if (h > 0.) c = mix(vec3(.25,.3,.2), vec3(.5,.45,.3), smoothstep(0., .3*I_R, h));
    else {
      float d = clamp(depth, 0., 1.);
      c = mix(vec3(.95,.85,.3), vec3(.2,.8,.7), smoothstep(0., .12, d));
      c = mix(c, vec3(.05,.3,.7), smoothstep(.12, .5, d));
      c = mix(c, vec3(.02,.05,.25), smoothstep(.5, 1., d));
    }
    // contour lines
    float lv = h/(.045*I_R);
    float fw = max(fwidth(lv), 1e-4);
    float cont = 1. - smoothstep(0., 1.5*fw, abs(fract(lv + .5) - .5));
    c = mix(c, c*.45, cont*.8);
    // grid
    vec2 gg = abs(fract(g/(.5*I_R) + .5) - .5);
    float grid = 1. - smoothstep(0., .02, min(gg.x, gg.y));
    c = mix(c, vec3(.4,.8,.7), grid*.25);
    // the sweep
    float a = atan(g.y, g.x);
    float sw = fract((a - T*.6)/TAU);
    float sweep = pow(1. - sw, 6.);
    c += vec3(.2,.9,.6)*sweep*.5;
    float ping = fract(T*.25); float pr = length(g)/(4.*I_R);
    c += vec3(.3,.9,.6)*(1. - smoothstep(0., .02, abs(pr - ping)))*(1. - ping)*.6;
    // hot vent return
    c += vec3(1., .3, .1)*ERUPT*IL.submarine*smoothstep(.2*I_R, 0., length(g))*(.5 + .5*sin(T*4.));
    // phosphor look: scanlines and a slow flicker
    c *= .85 + .15*step(.5, fract(gl_FragCoord.y*.5));
    c *= .95 + .05*sin(uClock*30.);
    // text
    vec2 hp = suv; float th = .035;
    float tx = textAt(hp, vec2(.04, .9), th, ${T('SONAR')}) + textAt(hp, vec2(.04, .85), th*.8, ${T('BATHYMETRY')});
    tx += textAt(hp, vec2(.04, .07), th*.8, ${T('SUMMIT')}) + numberAt(hp, vec2(.04 + 7.*th*.8*.8, .07), th*.8, abs(I_PEAK/I_R*1000.), 4) + textAt(hp, vec2(.04 + 12.*th*.8*.8, .07), th*.8, ${T('M')});
    tx += textAt(hp, vec2(.04, .12), th*.8, ${T('LIFE')}) + numberAt(hp, vec2(.04 + 5.*th*.8*.8, .12), th*.8, uStage*100., 2);
    c = mix(c, vec3(.6, 1., .8), clamp(tx, 0., 1.));
    col = c;
    finish(col, 0.);
    return;
  }
#endif

  // ---- camera: swimming round the island
  float ca = YAW + uDrag.x*2.;
  float pitch = clamp(PITCH + uDrag.y*1.2, -1.3, 1.4);
  float rad = max(CAMR*I_R, I_SHORE + .12*I_R);
  vec2 cp = vec2(cos(ca), sin(ca))*rad;
  float ground = islandH(cp, 3.);
  for (int k = 0; k < 4; k++) { if (ground < -.09*I_R) break; rad += .14*I_R; cp = vec2(cos(ca), sin(ca))*rad; ground = islandH(cp, 3.); }
  if (IL.reef > .01) { rad = max(rad, I_REEF*islShape(ca)*1.2 + .08*I_R); cp = vec2(cos(ca), sin(ca))*rad; ground = islandH(cp, 3.); }
  float cy = min(max(ground + CAMH*I_R, -CAMD*I_R), -.04*I_R);
  vec3 ro = vec3(cp.x, cy, cp.y);
  CRO = ro;
  // aim at the flank ahead, then tilt by PITCH
  vec2 tp = vec2(cos(ca), sin(ca))*max(rad - .45*I_R, 0.);
  vec3 ta = vec3(tp.x, min(islandH(tp, 3.), -.02*I_R), tp.y);
  vec3 fw0 = normalize(ta - ro);
  float el = clamp(asin(clamp(fw0.y, -1., 1.)) + pitch, -1.4, 1.4);
  vec2 hd = normalize(fw0.xz + 1e-5);
  vec3 fw = normalize(vec3(hd.x*cos(el), sin(el), hd.y*cos(el)));
  vec3 rt = normalize(cross(fw, vec3(0., 1., 0.))), up = cross(rt, fw);
  vec3 rd = normalize(fw*FOV + uv.x*rt + uv.y*up);
  CAMF = fw;

  float tS = rd.y > 0. ? -ro.y/rd.y : 1e4;
  float tmax = min(tS, 12.*I_R);
  float tT = terrainMarch(ro, rd, tmax);
  float tHit; vec3 base;
  float lampT = 0.;
  if (tT > 0.) {
    vec3 p = ro + rd*tT;
    vec3 n = terrainNormal(p.xz, .004*I_R + .002*tT);
    float glow;
    vec3 alb = pillows(p, n, glow);
    alb = reefCol(p, n, alb);
    float li = lightAt(p.y);
    float caus = caustic(p.xz, T)*li*smoothstep(-.6*I_R, -.05*I_R, p.y)*max(n.y, 0.)*uX3*1.4;
    float dif = .35 + .65*max(dot(n, normalize(vec3(.3, 1., .2))), 0.);
    vec3 lampC = vec3(1., .95, .85)*LAMP*4.5*pow(max(dot(rd, CAMF), 0.), 5.)/(1. + tT*tT*(1.5/(I_R*I_R)))*max(dot(n, -rd), 0.);
    base = alb*(waterCol(p.y)*2.5*dif*li*(1. + caus*2.) + lampC + vec3(.09,.12,.16)*dif*(1. - li));
    base += lavaColor(.5 + .4*glow)*glow*(1.2 + 1.5*NIGHT);
    // lava pouring in at the shore (shield stage): a glowing fringe where flows reach the water
    float lv = lavaFlow(p.xz, T)*(1. - IL.submarine)*smoothstep(-.35*I_R, -.04*I_R, p.y)*smoothstep(.45, .7, noise2(p.xz*(5./I_R) + I_SEED*3.));
    float seamL = 1. - smoothstep(.0, .12, worley2(p.xz*(22./I_R) + 3.));
    base += lavaColor(.35 + .55*seamL)*lv*(1.2 + .8*seamL)*(1. + NIGHT);
    tHit = tT;
  } else if (tS < 1e3) {
    vec3 p = ro + rd*tS;
    base = surfaceFromBelow(p, rd);
    tHit = tS;
  } else {
    base = waterCol(ro.y + rd.y*2.*I_R); tHit = tmax;
  }
  // water fog
  float fogK = mix(.55, .22, uDetail)*(1. + 2.*NIGHT*(1. - LAMP));
  float fog = 1. - exp(-tHit*fogK/I_R);
  vec3 fogC = waterCol(ro.y + rd.y*tHit*.5);
  // the lamp beam lights the water itself
  fogC += vec3(.4,.4,.38)*LAMP*pow(max(dot(rd, CAMF), 0.), 10.)*.35;
  col = mix(base, fogC, fog);
  // vents: smokers, bubbles and glow haze
  vec4 vv = ventVolume(ro, rd, tHit);
  col = col*vv.a + vv.rgb;
  // marine snow: three drifting layers
  {
    float snow = 0.;
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      vec2 q = (uv + vec2(fk*.3, -T*(.02 + .01*fk)) + uDrag*(.5 + .3*fk))*(60. + 25.*fk);
      vec2 cell = floor(q); vec2 f = fract(q) - .5 - (hash22(cell + fk) - .5)*.8;
      snow += smoothstep(.12, .0, length(f))*step(.7, hash12(cell*1.7 + fk))*(.6 - .15*fk);
    }
    col += snow*.35*(.3 + .7*lightAt(ro.y) + LAMP*.6);
  }
  // fish: a shoal once there is a reef
  float fishA = IL.reef*smoothstep(-.4*I_R, -.05*I_R, ro.y);
  if (fishA > .01) {
    for (int k = 0; k < 14; k++) {
      float fk = float(k); float hk = hash11(fk*7.1 + 3.);
      vec3 fp = vec3((hash11(fk + 1.) - .5)*2.*I_R, -.05*I_R - hk*.25*I_R, (hash11(fk + 2.) - .5)*2.*I_R);
      float ang = T*(.15 + .1*hk) + fk; vec2 orb = vec2(cos(ang), sin(ang));
      fp.xz = cp + vec2(-cos(ca), -sin(ca))*(.5 + .5*hk)*I_R + orb*(.15 + .2*hash11(fk + 5.))*I_R + fp.xz*.1;
      fp.y += .02*I_R*sin(T*2. + fk);
      vec3 d = fp - ro; float dist = length(d); if (dist > tHit || dist < .35*I_R) continue;
      vec3 dn = d/dist;
      float px = dot(dn, rt), py = dot(dn, up), pz = dot(dn, fw);
      if (pz < .3) continue;
      vec2 sp = vec2(px, py)/pz*FOV;
      vec2 dd = (uv - sp)*dist/I_R;
      dd.x /= 2.2;
      float body = 1. - smoothstep(.012, .016, length(dd));
      float fogf = exp(-dist*fogK/I_R);
      vec3 fc = mix(vec3(.9,.8,.3), vec3(.2,.5,.9), step(.5, hk))*lightAt(fp.y)*2.;
      col = mix(col, mix(fc, fogC, 1. - fogf), body*fishA);
    }
  }
  // bubbles rising from the vent, as sprites
  float bubA = IL.submarine*ERUPT + .4*IL.steam;
  if (bubA > .02) {
    for (int k = 0; k < 16; k++) {
      float fk = float(k); float hk = hash11(fk*3.3 + 1.);
      float u = fract(T*(.12 + .1*hk) + hk*3.);
      vec3 bp = VENT + vec3((hash11(fk + 9.) - .5)*.25*I_R + .05*I_R*sin(T + fk), u*1.2*I_R, (hash11(fk + 4.) - .5)*.25*I_R);
      if (bp.y > -.01*I_R) continue;
      vec3 d = bp - ro; float dist = length(d); if (dist > tHit) continue;
      vec3 dn = d/dist;
      float px = dot(dn, rt), py = dot(dn, up), pz = dot(dn, fw);
      if (pz < .3) continue;
      vec2 sp = vec2(px, py)/pz*FOV;
      float rad = (.008 + .007*hk)*I_R/dist*FOV;
      float dd = length(uv - sp)/rad;
      float ring = smoothstep(1., .85, dd)*smoothstep(.6, .8, dd) + smoothstep(.3, .0, length(uv - sp - vec2(-.3, .3)*rad)/rad)*.6;
      col += vec3(.7,.85,.95)*ring*bubA*(.3 + .7*lightAt(bp.y) + LAMP*.5)*exp(-dist/(3.*I_R));
    }
  }
  // tone
  col = 1. - exp(-col*1.3);
  col = pow(col, vec3(.95));
  col += (hash12(gl_FragCoord.xy + fract(uClock)*7.) - .5)*.02;

#ifdef HUD_1
  {
    vec2 hp = suv; float asp = uRes.x/uRes.y;
    vec3 hc = vec3(.6, 1., .7);
    float m = 0.;
    // corner brackets
    float bw = .003, bl = .08;
    vec2 e = vec2(.04, .05);
    for (int k = 0; k < 4; k++) {
      vec2 c = vec2(k < 2 ? e.x : asp - e.x, (k == 0 || k == 2) ? e.y : 1. - e.y);
      vec2 d = abs(hp - c);
      vec2 sgn = sign(hp - c);
      bool okx = (k < 2) ? sgn.x >= 0. : sgn.x <= 0.;
      bool oky = (k == 0 || k == 2) ? sgn.y >= 0. : sgn.y <= 0.;
      if (okx && oky) m += step(d.y, bw)*step(d.x, bl) + step(d.x, bw)*step(d.y, bl);
    }
    // crosshair
    vec2 cc = hp - vec2(asp*.5, .5);
    m += step(abs(cc.y), bw*.7)*step(.02, abs(cc.x))*step(abs(cc.x), .06);
    m += step(abs(cc.x), bw*.7)*step(.02, abs(cc.y))*step(abs(cc.y), .06);
    // heading tape along the top
    float hdg = mod(degrees(ca) + 360., 360.);
    float tape = hp.y > .93 && hp.y < .95 ? step(fract((hp.x - asp*.5)*8. + hdg/45.), .08) : 0.;
    m += tape;
    // text
    float th = .03;
    float depthM = max(-ro.y, 0.)/(.9*I_R)*4000.;
    m += textAt(hp, vec2(.06, .1), th, ${T('DEPTH')}) + numberAt(hp, vec2(.06 + 6.*th*.8, .1), th, depthM, 4) + textAt(hp, vec2(.06 + 11.*th*.8, .1), th, ${T('M')});
    float temp = 2. + 300.*ERUPT*IL.submarine*smoothstep(.6*I_R, .1*I_R, length(ro.xz))*(.8 + .2*sin(T*3.)) + 20.*smoothstep(-.3*I_R, 0., ro.y);
    m += textAt(hp, vec2(.06, .15), th, ${T('TEMP')}) + numberAt(hp, vec2(.06 + 5.*th*.8, .15), th, temp, 3) + textAt(hp, vec2(.06 + 9.*th*.8, .15), th, ${T('C')});
    m += textAt(hp, vec2(.06, .2), th, ${T('HDG')}) + numberAt(hp, vec2(.06 + 4.*th*.8, .2), th, hdg, 3);
    m += textAt(hp, vec2(.06, .88), th, ${T('ROV CAM 1')});
    float rec = step(.5, fract(uClock));
    m += textAt(hp, vec2(asp - .2, .88), th, ${T('REC')})*rec;
    m += smoothstep(.012, .008, length((hp - vec2(asp - .24, .895))*vec2(1., 1.)))*rec;
    m += textAt(hp, vec2(asp - .3, .1), th, ${T('LIFE')}) + numberAt(hp, vec2(asp - .3 + 5.*th*.8, .1), th, uStage*100., 2);
    col = mix(col, hc, clamp(m, 0., 1.)*.9);
    // scanlines and a slight camera vignette
    col *= .93 + .07*step(.5, fract(gl_FragCoord.y*.5));
  }
#endif
  finish(col, 0.);
}`;

export default shaderEngine({
  id: 'undersea', name: 'Undersea', fs, res: 0.65, sky: false,
  defaults: { MODE: 0, HUD: 0, CAMR: 0.45, CAMD: 0.3, CAMH: 0.12, PITCH: 0.0, YAW: 0.7, FOV: 1.3 },
  params: [
    { id: 'x1', label: 'Pillows', value: 0.5, tip: 'Relief of the pillow-lava lobes' },
    { id: 'x2', label: 'Lamp', value: 0.4, tip: 'ROV lamp brightness' },
    { id: 'x3', label: 'Caustics', value: 0.5, tip: 'Sunlight ripples on the bottom' },
    { id: 'x4', label: 'Drift', value: 0.5, tip: 'Unused' },
  ]
});

const d = (id, name, desc, opts, params, tags = []) => ({ id: 'undersea-' + id, name, desc, opts, params, tags: ['underwater', '3d', ...tags] });
export const scenes = [
  d('pillows', 'Pillow Lava Field', 'On the dark sea floor the seamount grows: lava chills into pillow lobes, glowing red where each new one buds, with black smokers and bubbles over the vent.',
    { CAMR: 0.3, CAMD: 0.6, CAMH: 0.1, PITCH: 0.05, YAW: 0.4 }, { stage: 0.07, light: 0.5, activity: 0.6, x1: 0.6, x2: 0.55 }, ['lava', 'realistic']),
  d('rov', 'ROV Camera', 'A remotely operated vehicle inspects the vent through its own lamp, with depth, temperature and heading on the overlay.',
    { HUD: 1, CAMR: 0.28, CAMD: 0.6, CAMH: 0.08, PITCH: 0.0, YAW: 1.6 }, { stage: 0.09, light: 0.3, activity: 0.6, x1: 0.5, x2: 0.8 }, ['text', 'science', 'lava']),
  d('breach', 'Breach from Below', 'Just under the surface during the Surtseyan eruption: the bright window of sky, the dark cock\'s-tail jets overhead, bubbles streaming up past the tuff cone.',
    { CAMR: 0.1, CAMD: 0.12, CAMH: 0.05, PITCH: 1.1, YAW: 2.4, FOV: 1.1 }, { stage: 0.17, light: 0.8, activity: 0.6, x1: 0.4, x2: 0.1, x3: 0.6 }, ['surtseyan', 'eruption']),
  d('entry', 'Lava Meets the Sea', 'Below the ocean entry of a shield-stage flow: new pillow lava and glowing rubble tumbling down the submarine slope in a haze of steam bubbles.',
    { CAMR: 0.55, CAMD: 0.2, CAMH: 0.1, PITCH: 0.15, YAW: 1.0 }, { stage: 0.36, light: 0.7, activity: 0.7, x1: 0.6, x2: 0.3, x3: 0.5 }, ['lava', 'eruption']),
  d('reefwall', 'Reef Wall', 'The green island\'s drowned flank, now a coral wall: heads of coral, white sand chutes, caustics and a shoal of fish in bright shallow water.',
    { CAMR: 0.62, CAMD: 0.14, CAMH: 0.06, PITCH: 0.2, YAW: 3.0 }, { stage: 0.74, light: 0.9, activity: 0.5, x1: 0.3, x2: 0.0, x3: 0.8 }, ['calm', 'realistic']),
  d('nightdive', 'Night Dive', 'A night dive on the erupting seamount: everything black except the lamp beam, the red seams between pillows and marine snow in the light.',
    { HUD: 1, CAMR: 0.26, CAMD: 0.6, CAMH: 0.08, PITCH: 0.0, YAW: 0.2 }, { stage: 0.1, light: 0.02, activity: 0.7, x1: 0.6, x2: 0.9 }, ['night', 'lava', 'text']),
  d('sonar', 'Sonar Bathymetry', 'A multibeam sonar screen of the island: depth bands and contours, a sweeping beam, and a hot return over the vent while it is still submerged.',
    { MODE: 3 }, { stage: 0.08, light: 0.6, activity: 0.5, scale: 0.55 }, ['map', 'diagram', 'science', 'text']),
  d('guyot', 'The Guyot', 'The end: the reef has died and the flat-topped mountain sinks out of the light, sand and dead coral under a dim sea, only marine snow drifting.',
    { CAMR: 0.3, CAMD: 0.2, CAMH: 0.1, PITCH: -0.05, YAW: 1.2 }, { stage: 0.995, light: 0.35, activity: 0.3, x1: 0.2, x2: 0.3, x3: 0.15 }, ['atoll', 'calm']),
];
