// Lava: shader close-ups of molten rock. One fragment shader, eight MODEs: pāhoehoe toes, ʻaʻā clinker, a lava lake
// with crust plates, an ocean entry, a lava-tube skylight, a fissure curtain at night, pillow lava under water and
// ferns colonising an old flow. Ground views are shaded heightfields on a plane seen from a low camera; sky views
// end with finish(col, skyAmount) so a Mega-Clouds layer can show through. The life cycle is read as what is
// happening at this one spot: pillows under the sea → quench and steam → hot flows → cooling crust → plants → drowning.
import { shaderEngine } from '../gl.js';

const fs = `
float OCT, HEAT, CRUST, STEAM, ZOOM, DAY, NIGHT;
vec3 SUN;
Life L;
// what this patch of ground is doing (from the life cycle)
float WET, QUENCH, HOT, COOL, MOSS, DROWN, E;

void setup(){
  L = life(uStage); E = eruptAmt(L);
  OCT = 2. + 4.*uDetail;
  HEAT = mix(.3, 1.6, uX1); CRUST = uX2; STEAM = uX3; ZOOM = mix(1.8, .5, uX4);
  DAY = smoothstep(0., .5, uLight); NIGHT = 1. - smoothstep(0., .25, uLight);
  float el = mix(.05, 1.2, uLight);
  SUN = normalize(vec3(.6, sin(el), -.4*cos(el)));
  float s = uStage;
  WET = L.submarine; QUENCH = L.steam;
  HOT = (1.-L.submarine)*smoothstep(.18,.28,s)*(1.-smoothstep(.5,.64,s))*clamp(E,0.,1.5) + L.caldera*(1.-smoothstep(.55,.64,s))*.4*E;
  COOL = smoothstep(.5,.66,s);
  MOSS = L.veg*smoothstep(.6,.78,s);
  DROWN = smoothstep(.84,.95,s);
}
float hmap(vec2 p);

// ---------- materials
// ropy pāhoehoe: folds pushed up by the flow, warped by low-frequency noise, in lobes
float ropes(vec2 p, float k){
  vec2 w = vec2(fbm2(p*.9+3.1, 3.), fbm2(p*.9+9.7, 3.))-.5;
  float lobe = worley2(p*.55 + w*.6);
  float r = sin((p.y + w.x*2.2 + lobe*3.)*k*6.2832)*.5+.5;
  r = pow(r, 1.6);
  return r*.35*(1.-lobe*.5) + (1.-lobe)*.45;
}
// ʻaʻā clinker: jagged blocks
float clinker(vec2 p){
  float a = worley2(p*3.), b = worley2(p*7.+5.), c = noise2(p*22.);
  return pow(1.-a, 1.3)*.6 + (1.-b)*.3 + c*.1;
}
// distance to the nearest cell edge (F2 - F1): thin seams between crust plates
float worleyEdge(vec2 p){
  vec2 i = floor(p), f = fract(p); float d1 = 8., d2 = 8.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y); vec2 r = g + hash22(i+g) - f; float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return sqrt(d2) - sqrt(d1);
}
float LOD;   // 1 near the camera → 0 far away (fine detail fades out instead of aliasing)
// temperature pattern: the molten interior shows through seams between crust plates
float cracks(vec2 p, float scale){
  vec2 w = (vec2(fbm2(p*.8 + 2.2, 3.), fbm2(p*.8 + 7.9, 3.)) - .5)*1.6;   // warp so the plates are not a honeycomb
  float e1 = worleyEdge(p*scale + w), e2 = worleyEdge(p*scale*2.3 + 7. + w);
  float seam = smoothstep(.06, .0, e1) + .5*smoothstep(.04, .0, e2)*LOD;
  seam *= smoothstep(.35, .55, fbm2(p*.6 + 11., 3.));                       // only some seams are still open
  return 1. - clamp(seam, 0., 1.);   // 1 on the plates, 0 in the seams
}

#if defined(MODE_0) || defined(MODE_7)
float hmap(vec2 p){ return ropes(p, 1.4)*.5; }
#elif defined(MODE_1)
float hmap(vec2 p){ return clinker(p)*.6; }
#elif defined(MODE_6)
float hmap(vec2 p){ // pillows: rounded lobes, each budding from the last
  float w = worley2(p*1.3 + .3*vec2(fbm2(p*.7, 3.), fbm2(p*.7+5., 3.)));
  return sqrt(max(0., 1.-w*w*1.6))*.5 + noise2(p*14.)*.03;
}
#else
float hmap(vec2 p){ return ropes(p, 1.)*.3; }
#endif

vec3 gnormal(vec2 p, float e){
  float h = hmap(p), hx = hmap(p+vec2(e,0.)), hz = hmap(p+vec2(0.,e));
  return normalize(vec3(h-hx, e*1.4, h-hz));
}
// camera over the ground; returns the ground point and the view ray
vec3 ground(vec2 uv, float height, float tilt, out vec3 rd, out float t){
  vec3 ro = vec3(0., height, 0.);
  rd = normalize(vec3(uv.x, uv.y - tilt, 1.25));
  t = rd.y < -0.001 ? -ro.y/rd.y : 1e5;
  return ro + rd*t;
}
vec3 shade(vec3 base, vec3 n, float ao){
  float dif = max(dot(n, SUN), 0.);
  vec3 amb = mix(vec3(.08,.1,.18), vec3(.45,.5,.6), DAY);
  vec3 sunc = mix(vec3(1.,.5,.25), vec3(1.,.95,.88), DAY);
  return base*(amb*ao + sunc*dif*(1.-NIGHT*.95)) ;
}
// the whole stage story on a ground patch: colour, emissive glow
vec3 lavaGround(vec2 p, vec3 n, float h, float crackScale, float tempBias, out float glowOut){
  float plate = cracks(p, crackScale);
  float seam = 1. - plate;
  float hot = clamp(HOT*HEAT + tempBias + WET*clamp(E, 0., 1.)*HEAT*.5, 0., 1.4);   // under the sea the seams still glow
  // crust coverage: more crust with the Crust control and as the flow cools; windows of open melt where it is thin
  float crustAmt = mix(.45, .97, CRUST) + COOL*.3;
  float open = smoothstep(crustAmt, crustAmt + .2, fbm2(p*1.1 + 4., 3.));
  float temp = hot*clamp(seam*.9 + open*.7, 0., 1.)*(.7 + .3*noise2(p*3.+uTime*.3))*LOD;
  temp *= 1. - COOL*.85 - MOSS*.5 - DROWN;
  temp = clamp(temp, 0., 1.);
  vec3 rock = mix(vec3(.06,.055,.06), vec3(.2,.19,.19), h);                      // fresh black basalt
  rock = mix(rock, vec3(.32,.3,.28), COOL*.5*smoothstep(.3,.7,h));             // weathering: grey tops
  rock = mix(rock, vec3(.14,.28,.1), MOSS*.5*smoothstep(.45,.65,fbm2(p*2.+1., 3.))*(1.-h*.6));   // moss and lichen in hollows
  rock = mix(rock, vec3(.1,.28,.16), DROWN*.4);
  float ao = .5 + .5*h;
  vec3 col = shade(rock, n, ao);
  vec3 glow = lavaColor(temp)*temp*(1.2 + NIGHT*.8);
  col += glow;
  col += lavaColor(.5)*.25*hot*seam*(1.-temp)*LOD*(1.-COOL);                     // dull red in cooling seams
  col += vec3(1.,.4,.12)*temp*.15*NIGHT;                                          // the ground lit by its own glow
  glowOut = temp;
  return col;
}
// under water: blue absorption with distance, caustics, bubbles
vec3 underwater(vec3 col, float t, vec2 p){
  float ca = pow(noise2(p*3.+uTime*.4)*noise2(p*3.3-uTime*.3+7.), 1.5)*2.;
  col *= 1. + ca*.6*DAY;
  vec3 water = mix(vec3(.01,.04,.09), vec3(.05,.25,.4), DAY);
  return mix(col, water, 1.-exp(-t*.35));
}
float bubbles(vec2 uv, float n){
  float b = 0.;
  for (float i = 0.; i < 3.; i++) {
    vec2 q = uv*(4.+i*2.5); q.y -= uTime*(.25+i*.12)*(4.+i*2.5)*.25; q.x += sin(uTime*2.+i+uv.y*6.)*.08; vec2 id = floor(q); vec2 f = fract(q)-.5;
    vec2 o = (hash22(id+i*7.)-.5)*.6; float r = .04+.05*hash12(id+3.);
    if (hash12(id+i) < n*.35) b += smoothstep(r, r*.5, length(f-o))*(.35+.65*step(.0, f.x-o.x));
  }
  return clamp(b, 0., 1.);
}
// billowing white steam in screen space, above a source line
float steamPuff(vec2 uv, vec2 src, float width, float height, float speed, float seed){
  vec2 q = uv - src;
  float rise = clamp(q.y/height, 0., 1.);
  vec2 d = vec2(q.x - windDir().x*rise*rise*width*2.5, q.y);
  float env = smoothstep(width*(1.+rise*1.5), width*.2, abs(d.x)) * smoothstep(0., .1, q.y) * (1.-smoothstep(.4, 1., rise));
  float n = smoothstep(.25, .75, fbm2(vec2(d.x*3.5 + seed, q.y*2.2 - uTime*speed), OCT));
  float v = smoothstep(.5, .9, env*(.15 + 1.4*n) + .08*(1.-rise));   // noise erodes the edges into billows
  return v*(.6 + .4*n + .3*env*(1.-rise));                            // lighter, denser core
}
vec3 skyBg(vec3 rd){ return skyColor(rd, SUN, uLight)*(.6+.4*DAY) ; }
vec3 fogCol(){ return mix(vec3(.06,.07,.1), vec3(.62,.66,.74), DAY); }
// a ground view with a horizon: sky above, haze toward it
vec3 horizonMix(vec3 col, vec3 rd, float t, float k, out float sky){
  if (t > 1e4) { sky = 1.; return skyBg(rd); }
  sky = 0.;
  float fog = 1. - exp(-t*k);
  return mix(col, skyBg(normalize(vec3(rd.x, 0.015, rd.z)))*.95, fog);
}
vec3 lavaLightSky(vec3 col, vec3 rd, float glow){ // night sky lit from below by lava
  return col + vec3(1.,.4,.1)*glow*NIGHT*pow(clamp(1.-rd.y*3., 0., 1.), 2.)*.6*step(0., rd.y);
}

void main(){
  setup();
  vec2 uv = (gl_FragCoord.xy*2. - uRes)/uRes.y;
  vec3 col = vec3(0.); float sky = 0.;
  vec2 wind = windDir();

#ifdef MODE_0   // ---- pāhoehoe toes advancing toward the camera
  vec3 rd; float t; vec3 p = ground(uv, 1.1, .35, rd, t);
  vec2 g = p.xz*ZOOM*1.2 + vec2(uEpoch*3.1, 0.);
  LOD = exp(-t*.12);
  float h = hmap(g); vec3 n = gnormal(g, .02);
  float glow; col = lavaGround(g, n, h/.5, 2.2, 0., glow);
  // the advancing toes: a bright molten rind where each lobe front faces the camera
  float lobe = worley2(g*.55 + .6*(vec2(fbm2(g*.9+3.1, 3.), fbm2(g*.9+9.7, 3.))-.5));
  float rind = smoothstep(.6, .9, lobe)*smoothstep(.1, -.25, n.z)*HOT*HEAT*LOD*(1.-COOL);
  col += lavaColor(.7)*rind*.9;
  col = horizonMix(col, rd, t, .09, sky);
  col = mix(col, underwater(col, t, g), max(WET, DROWN)); sky *= 1. - max(WET, DROWN);
  col += vec3(.9,.95,1.)*bubbles(uv, .6)*WET*.5;
  // steam where the hot crust is being quenched
  float st = steamPuff(uv, vec2(0., -.6), .6, 1.6, .25, 1.)*QUENCH*.9 + steamPuff(uv, vec2(.3, -.3), .3, 1.2, .3, 4.)*HOT*STEAM*.5;
  st = clamp(st, 0., 1.);
  col = mix(col, mix(vec3(.5,.52,.6), vec3(.95), DAY), st); sky *= 1. - st;
#endif

#ifdef MODE_1   // ---- ʻaʻā clinker: a rubble front, glowing between blocks
  vec3 rd; float t; vec3 p = ground(uv, 1.3, .3, rd, t);
  vec2 g = p.xz*ZOOM + vec2(uEpoch*5.3, 0.);
  LOD = exp(-t*.12);
  float h = hmap(g); vec3 n = gnormal(g, .015);
  float glow; col = lavaGround(g, n, h/.6, 1.6, -.2, glow);
  col *= 1.3;
  // deep gaps between the blocks glow hottest
  float gap = smoothstep(.35, .05, h/.6)*LOD;
  col += lavaColor(.9)*gap*HOT*HEAT*(1.-COOL)*(.7+.3*sin(uClock*3.+h*20.))*.9;
  col *= 1. - smoothstep(.5, .1, h/.6)*.4;
  col = horizonMix(col, rd, t, .09, sky);
  col = mix(col, underwater(col, t, g), max(WET, DROWN)); sky *= 1. - max(WET, DROWN);
  col += vec3(.9,.95,1.)*bubbles(uv, .5)*WET*.5;
  float st = steamPuff(uv, vec2(-.4, -.5), .5, 1.4, .25, 2.)*QUENCH*.9 + steamPuff(uv, vec2(.5, -.2), .3, 1., .3, 5.)*HOT*STEAM*.5;
  st = clamp(st, 0., 1.);
  col = mix(col, mix(vec3(.5,.52,.6), vec3(.95), DAY), st); sky *= 1. - st;
#endif

#ifdef MODE_2   // ---- lava lake: crust plates drifting on a glowing lake, fountaining at the rim
  vec3 rd; float t; vec3 p = ground(uv, 1.6, .22, rd, t);
  if (t > 1e4 || p.z > 60.) { col = skyBg(rd); sky = 1.; }
  else {
    vec2 g = p.xz*ZOOM*.6;
    LOD = exp(-t*.08);
    // the lake fills a circle; the walls of the pit beyond
    float R = 9.; float d = length(g - vec2(0., 7.));
    // plates: voronoi cells carried by a slow circulating flow, seams of melt between them
    vec2 flow = g + vec2(sin(g.y*.3+uTime*.1), cos(g.x*.3+uTime*.08))*1.2 + vec2(uTime*.12, 0.);
    float e1 = worleyEdge(flow*.7), e2 = worleyEdge(flow*1.9+4.);
    float seam = smoothstep(.12 + .1*(1.-CRUST), 0., e1) + .5*smoothstep(.06, 0., e2)*LOD;
    float hot = clamp(HOT*HEAT + .25*(1.-COOL), 0., 1.2)*(1.-DROWN)*(1.-WET);
    float open = smoothstep(.5 + .45*CRUST, .85 + .3*CRUST, fbm2(flow*.5 + 2., 3.));   // patches of bare melt
    float temp = clamp(seam + open, 0., 1.)*hot*(.8 + .2*noise2(flow*4. + uTime));
    temp *= 1. - COOL*.8;
    // upwelling / fountaining spots
    float up = 0.;
    for (float i = 0.; i < 3.; i++) { vec2 c = vec2(cos(i*2.1+uEpoch), sin(i*2.1+uEpoch))*R*.6 + vec2(0., 7.);
      float pulse = .5+.5*sin(uTime*1.3 + i*2.);
      up += smoothstep(1.3, 0., length(g-c))*pulse*E*(1.-COOL); }
    temp = clamp(temp + up*.9, 0., 1.);
    vec3 crust = vec3(.05,.045,.05) + .03*noise2(flow*6.);
    crust = mix(crust, vec3(.3,.29,.27), COOL*.6); crust = mix(crust, vec3(.15,.3,.14), MOSS*.6);
    vec3 n = normalize(vec3(e1-worleyEdge((flow+vec2(.03,0.))*.7), .15, e1-worleyEdge((flow+vec2(0.,.03))*.7)));
    col = shade(crust, n, .8) + lavaColor(temp)*temp*(1.3+NIGHT*.8) + vec3(1.,.35,.1)*hot*.08*(1.-temp)*NIGHT;
    // the pit wall: dark rock beyond the lake, lit by the lake
    float wall = smoothstep(R-.6, R+.6, d);
    vec3 wallc = shade(vec3(.09,.08,.085), vec3(0.,1.,0.), .6) + vec3(1.,.35,.1)*hot*.25*exp(-(d-R)*.4)*(.5+NIGHT);
    col = mix(col, wallc, wall);
    col = mix(col, underwater(col, t, g), max(WET, DROWN));
    // fountain sparks above the upwelling spots (screen space)
    float spark = 0.;
    for (float i = 0.; i < 3.; i++) { vec2 c = vec2(cos(i*2.1+uEpoch), sin(i*2.1+uEpoch))*R*.6 + vec2(0., 7.);
      vec3 w = vec3(c.x/ZOOM/.6, 0., c.y/ZOOM/.6);                                 // back to world
      vec3 v = w - vec3(0., 1.6, 0.); vec2 suv = vec2(v.x/v.z*1.25, v.y/v.z*1.25 + .22);
      vec2 q = uv - suv; float pulse = .5+.5*sin(uTime*1.3 + i*2.);
      float env = smoothstep(.25, 0., abs(q.x))*smoothstep(0., .05, q.y)*smoothstep(.6*pulse+.1, 0., q.y);
      float n2 = noise2(vec2(q.x*40., q.y*12. - uTime*4. + i*9.));
      spark += env*smoothstep(.6, .8, n2)*E*(1.-COOL)*(1.-WET); }
    col += lavaColor(1.)*spark*2.;
    float st = steamPuff(uv, vec2(0., -.35), .8, 1.5, .2, 3.)*(QUENCH*.9 + STEAM*hot*.3);
    col = mix(col, mix(vec3(.4,.4,.48), vec3(.92), DAY) + vec3(1.,.4,.1)*hot*NIGHT*.4, clamp(st, 0., 1.));
    col = mix(col, mix(fogCol(), vec3(.3,.12,.05)*hot, NIGHT*.7), (1.-exp(-t*.025))*.6);
  }
  col = lavaLightSky(col, rd, HOT*HEAT*.6*(1.-COOL));
#endif

#ifdef MODE_3   // ---- ocean entry: a lava bench meets the surf; waves flash to steam; black sand below
  vec3 rd; float t; vec3 p = ground(uv, 1.0, .2, rd, t);
  if (t > 1e4 || p.z > 80.) { col = skyBg(rd); sky = 1.; }
  else {
    vec2 g = p.xz*ZOOM*.8 + vec2(uEpoch*2.2, 0.);
    LOD = exp(-t*.1);
    // the shoreline runs diagonally; land on the left, sea on the right
    float shore = g.x - .25*g.y - 1.5 + fbm2(g*.5, 3.)*1.2;
    float wave = sin(shore*2. - uTime*1.6)*.5 + sin(shore*4.3 - uTime*2.1+1.)*.25;
    float seaMask = smoothstep(-.1, .1, shore + wave*.35);
    // land: a new lava delta, with molten fingers reaching the water when hot
    float h = hmap(g); vec3 n = gnormal(g, .02);
    float glow; vec3 land = lavaGround(g, n, h/.3, 2.4, 0., glow);
    float edge = smoothstep(1.2, 0., shore)*HOT*HEAT*(1.-COOL)*LOD;
    land += lavaColor(.7)*edge*smoothstep(.55,.7, fbm2(g*1.5+vec2(0., uTime*.1), 3.))*1.2;
    land = mix(land, vec3(.05,.045,.05)*1.5, smoothstep(0., -1.2, shore)*smoothstep(.0,.3,fbm2(g*2.+7.,3.))*.5*(1.-MOSS)); // black sand
    // sea: dark water with foam at the surf line
    float ripple = fbm2(g*3. + vec2(uTime*.5, 0.), OCT);
    vec3 sea = mix(mix(vec3(.02,.05,.1), vec3(.05,.3,.45), DAY), vec3(.1,.5,.6)*DAY, ripple*.5);
    sea = mix(sea, skyBg(reflect(rd, vec3(0.,1.,0.)))*.6, .35*smoothstep(0., 20., p.z));
    float foam = smoothstep(.0, .5, 1.-abs(shore + wave*.35 - .4)/.5)*smoothstep(.4, .7, ripple + wave*.3);
    sea = mix(sea, vec3(.9,.95,1.)*(.3+.7*DAY), foam*.9);
    sea = mix(sea, vec3(.3,.8,.7)*DAY, L.reef*smoothstep(3., 1., shore)*.4);     // reef shallows later in life
    col = mix(land, sea, seaMask);
    col += lavaColor(.7)*edge*seaMask*smoothstep(1.5, 0., shore)*.4;              // glow under the water at the entry
    col = mix(col, underwater(col, t, g), WET);
    col = mix(col, fogCol(), (1.-exp(-t*.05))*.5);
  }
  // laze: white steam exploding up from the entry, bent by the wind
  float hot = (HOT*HEAT*(1.-COOL))*(1.-WET);
  float st = steamPuff(uv, vec2(.15, -.42), .3, 1.6, .35, 1.)*hot*1.2 + steamPuff(uv, vec2(-.3, -.5), .22, 1.1, .3, 6.)*hot*.7;
  st += steamPuff(uv, vec2(.0, -.5), .7, 1.6, .25, 2.)*QUENCH;
  st *= (.5 + STEAM)*(1.-WET)*(1.-DROWN);
  vec3 steamc = mix(vec3(.35,.36,.45), vec3(.95,.96,1.), DAY) + vec3(1.,.4,.1)*hot*.3*NIGHT;
  col = mix(col, steamc, clamp(st, 0., 1.)); sky *= 1. - clamp(st, 0., 1.);
  col = lavaLightSky(col, rd, hot*.5);
#endif

#ifdef MODE_4   // ---- lava tube skylight: looking down through a hole in the crust at the river beneath
  vec2 q = uv*ZOOM*.9;
  float hole = length(q*vec2(1., 1.3)) - .55 + .18*fbm2(q*2.5+uEpoch, 3.) - .05;
  // the river below: flowing hot texture
  vec2 flow = q*2. + vec2(uTime*.9, 0.) + vec2(0., .3*sin(q.x*3.+uTime));
  float r1 = fbm2(flow, OCT), r2 = fbm2(flow*2.3 + 5., OCT);
  float hot = clamp(HOT*HEAT*.9 + .15, 0., 1.1)*(1.-COOL*.9)*(1.-WET)*(1.-DROWN);
  float temp = clamp(hot*(.35 + .5*r1 - .3*r2*CRUST), 0., 1.);
  vec3 river = lavaColor(temp)*temp*(1.3+NIGHT*.5) + vec3(.02);
  // skin of crust forming on the river when cooler
  river = mix(river, vec3(.06,.05,.05)+lavaColor(temp)*temp*.3, smoothstep(.45, .7, r2)*CRUST*.7);
  // the crust surface around the hole: pāhoehoe in top-down light
  float h = ropes(q*1.2+3., 1.4); vec2 e = vec2(.01, 0.);
  vec3 n = normalize(vec3(h-ropes(q*1.2+3.+e.xy, 1.4), .03, h-ropes(q*1.2+3.+e.yx, 1.4)));
  vec3 crust = vec3(.07,.065,.07); crust = mix(crust, vec3(.3,.29,.27), COOL*.6*h); crust = mix(crust, vec3(.15,.3,.12), MOSS*smoothstep(.4,.6,h));
  vec3 top = shade(crust, n, .6+.4*h);
  // hot rim: the crust nearest the hole glows and is lit from below
  float rim = smoothstep(.5, 0., hole);
  top += lavaColor(.55)*rim*rim*hot*.35 + vec3(1.,.35,.08)*rim*rim*hot*.3;
  float inside = smoothstep(.02, -.02, hole);
  col = mix(top, river, inside);
  // depth shading inside: the wall of the tube in shadow near the edge
  col *= mix(1., smoothstep(-.02, -.25, hole)*.7+.3, inside);
  // pale sulphur and salt crusts around the rim
  col += vec3(.75,.7,.4)*smoothstep(.25,.0,abs(hole-.15))*smoothstep(.55,.75,fbm2(q*6., 3.))*.3*(1.-MOSS)*DAY;
  col = mix(col, underwater(col, 2.+uv.y, q), max(WET, DROWN));
  col += vec3(.9,.95,1.)*bubbles(uv, .5)*WET*.5;
  float st = fbm2(vec2(uv.x*1.5, uv.y*1.2 - uTime*.35)+uEpoch, OCT);
  float stm = smoothstep(.45, .8, st)*(.35*STEAM*hot*inside + QUENCH*.8);
  col = mix(col, mix(vec3(.5,.5,.58), vec3(.95), DAY), stm);
#endif

#ifdef MODE_5   // ---- fissure eruption: a curtain of fire along a crack in the ground
  vec3 rd; float t; vec3 p = ground(uv, 1.4, .12, rd, t);
  float hot = clamp(HOT*HEAT, 0., 1.6)*(1.-COOL*.95)*(1.-WET)*(1.-DROWN);
  if (t > 1e4 || p.z > 90.) { col = skyBg(rd); sky = 1.; }
  else {
    vec2 g = p.xz*ZOOM*.7 + vec2(uEpoch*4.4, 0.);
    LOD = exp(-t*.1);
    float h = hmap(g); vec3 n = gnormal(g, .02);
    float glow; col = lavaGround(g, n, h/.3, 2.6, -.5, glow);
    // the fissure: a ragged line across the ground at z ≈ 9
    float fz = 9. + sin(g.x*.4)*1.2;
    float df = abs(g.y - fz) - .25 - .2*noise2(g*2.);
    float crack = smoothstep(.3, -.1, df);
    col = mix(col, lavaColor(1.)*1.6*hot + lavaColor(.5)*.3, crack*(.3+.7*hot));
    // spatter ramparts: fresh glowing blobs along the crack
    float sp = smoothstep(.65, .9, noise2(g*4.+3.))*smoothstep(1.6, .3, abs(g.y - fz))*hot*LOD;
    col += lavaColor(.75)*sp*.7;
    // the ground is lit by the curtain
    col += vec3(1.,.4,.12)*hot*.25*exp(-abs(g.y-fz)*.35)*(.3+NIGHT);
    col = mix(col, fogCol()*.6 + vec3(.3,.1,.03)*hot*NIGHT, (1.-exp(-t*.03))*.5);
    col = mix(col, underwater(col, t, g), max(WET, DROWN));
  }
  // the curtain of fire, in screen space above where the fissure projects
  {
    float fzW = 9./(ZOOM*.7);                      // world z of the fissure
    float y0 = (-1.4)/fzW*1.25 + .12;              // screen y of the ground at that distance
    float spread = 1.;
    float n1 = noise2(vec2(uv.x*18. + uTime*.3, (uv.y - y0)*5. - uTime*5.));
    float n2 = noise2(vec2(uv.x*40. - uTime*.5, (uv.y - y0)*9. - uTime*9.)+7.);
    float ht = (.12 + .3*E)*(.5+.5*noise2(vec2(uv.x*6.+uTime*.7, uTime*.5)));
    float env = smoothstep(ht, 0., uv.y - y0)*smoothstep(0., .02, uv.y - y0);
    float jet = env*smoothstep(.5, .78, n1*.7 + n2*.5 + .25*smoothstep(.25, 0., uv.y - y0));
    float fall = env*smoothstep(.8, .95, n2)*.8;
    float f = clamp(jet + fall, 0., 1.)*hot;
    col += lavaColor(.95)*f*1.6 + lavaColor(.7)*env*hot*.15*(.5+NIGHT);
    sky *= 1. - f;
    // the glow in the sky above
    col = lavaLightSky(col, rd, hot*1.2);
    // ash haze drifting downwind
    float haze = smoothstep(.35, .75, fbm2(vec2(uv.x*1.3 - wind.x*uTime*.1, uv.y*1.2 - uTime*.12), OCT))*smoothstep(-.3, .6, uv.y)*STEAM*hot*.35;
    col = mix(col, vec3(.3,.22,.22)*(.3+DAY) + vec3(.5,.2,.1)*NIGHT*hot*.4, haze);
    sky *= 1. - haze;
  }
#endif

#ifdef MODE_6   // ---- pillow lava budding on the sea floor
  vec3 rd; float t; vec3 p = ground(uv, 1.5, .3, rd, t);
  vec2 g = p.xz*ZOOM*.8 + vec2(uEpoch*2.7, 0.);
  LOD = exp(-t*.15);
  float h = hmap(g); vec3 n = gnormal(g, .02); n = normalize(vec3(n.x*2.5, n.y, n.z*2.5));
  // each pillow: glassy black skin, a glowing seam where the new lobe is budding
  float w = worley2(g*1.3 + .3*vec2(fbm2(g*.7, 3.), fbm2(g*.7+5., 3.)));
  float seam = smoothstep(.55, .85, w);
  float fresh = (WET + QUENCH*.5)*clamp(E, 0., 1.5)*HEAT + HOT*.5;
  fresh = clamp(fresh, 0., 1.5)*(1.-COOL*.9)*(1.-DROWN*.7);
  float wrinkle = smoothstep(.3,.7,noise2(g*20.))*.15*LOD;
  vec3 skin = mix(vec3(.04,.04,.05), vec3(.16,.16,.18), h + wrinkle);
  skin = mix(skin, vec3(.25,.22,.2), COOL*.5); skin = mix(skin, vec3(.6,.3,.2), DROWN*smoothstep(.4,.6,noise2(g*5.))*.6); // sediment / coral encrusting later
  skin = mix(skin, vec3(.9,.5,.3), DROWN*smoothstep(.65,.8,noise2(g*9.+2.))*.5);
  // a dive light from the camera plus dim blue daylight from above
  float lamp = max(dot(n, -rd), 0.)*exp(-t*.2)*2.;
  col = shade(skin, n, .4+.6*h)*(1.2 + DAY) + skin*lamp*vec3(1.,.95,.85)*2.5 + vec3(.02,.05,.08)*max(n.y,0.)*DAY;
  col *= .6 + .4*smoothstep(.0, .5, h);   // the gaps between pillows are dark
  col += vec3(.5,.6,.7)*pow(max(dot(reflect(rd, n), SUN), 0.), 24.)*.3*DAY*h;    // glassy skin highlight
  float temp = clamp(seam*fresh*(.6 + .4*sin(uClock*1.5 + w*9.)), 0., 1.)*(.8 + .4*CRUST)*LOD;
  col += lavaColor(temp)*temp*1.4;
  // hyaloclastite: pale glassy shards between pillows
  col += vec3(.35,.33,.3)*smoothstep(.2, .0, h)*.25*(1.-DROWN);
  float depthBlend = clamp(1. - L.h*.5, .2, 1.);   // less murk as the vent rises toward the surface
  col = underwater(col, t*depthBlend*.5, g);
  col += vec3(.9,.95,1.)*bubbles(uv, .7)*(.3 + .5*fresh)*.5;
  // marine snow
  vec2 sq = vec2(uv.x*30., uv.y*30. + uTime*1.5); vec2 sf = fract(sq)-.5; vec2 so = hash22(floor(sq))-.5;
  float snow = smoothstep(.06, .02, length(sf - so*.7))*step(.93, hash12(floor(sq)+3.));
  col += snow*.35*(.3+DAY);
  // surface light rays
  col += vec3(.1,.25,.35)*DAY*smoothstep(.1, 1., uv.y)*smoothstep(.4, .9, noise2(vec2(uv.x*3.+uTime*.1, 0.)))*.6*(1.-L.submarine*.3);
#endif

#ifdef MODE_7   // ---- ferns colonising an old pāhoehoe flow
  vec3 rd; float t; vec3 p = ground(uv, 1.0, .3, rd, t);
  vec2 g = p.xz*ZOOM + vec2(uEpoch*6.1, 0.);
  LOD = exp(-t*.12);
  float h = hmap(g); vec3 n = gnormal(g, .02);
  float glow; col = lavaGround(g, n, h/.5, 2.2, 0., glow);
  // this spot's story: bare → lichens → ferns → forest floor; life arrives earlier here than on the whole island
  float plants = clamp(smoothstep(.42, .68, uStage)*(1.-DROWN) + MOSS*.5, 0., 1.)*mix(.3, 1.2, uX2);
  // lichen: pale grey-green crusts on the high points
  col = mix(col, vec3(.55,.6,.45)*(.4+.6*DAY), smoothstep(.5,.75,fbm2(g*5., 3.))*smoothstep(.4,.7,h/.5)*plants*.5);
  // ferns: in cells of the ground, each a rosette of curling pinnate fronds
  vec3 fern = vec3(0.); float fmask = 0.;
  vec2 cell = floor(g*1.4);
  for (int j = 0; j < 4; j++) {
    vec2 id = cell + vec2(j & 1, j >> 1) - .5; vec2 c = (id + .5 + (hash22(id)-.5)*.6)/1.4;
    vec2 d = g - c; float r = length(d), a = atan(d.y, d.x);
    float has = step(1. - plants*.85, hash12(id+9.));
    if (has < .5) continue;
    float sz = (.2 + .3*hash12(id+3.))*clamp(plants*1.5, 0., 1.);
    float u = r/sz;
    float fronds = 7. + floor(hash12(id+5.)*4.);
    float sway = sin(uTime*1.5 + id.x*3. + id.y)*.04;
    float fa = fract(a/TAU*fronds + hash12(id) + u*u*.15 + sway) - .5;    // fronds curl as they go out
    float perp = abs(fa)*TAU/fronds*r;                                     // distance from the frond's midrib
    float pinna = pow(abs(sin(u*20. + hash12(id)*3.)), .6);
    float width = .2*sz*(1.-u)*(.25 + .75*pinna)*smoothstep(0., .25, u);   // tapered, pinnate
    float leaf = smoothstep(width, width*.5, perp)*smoothstep(1., .92, u)*step(.03*sz, r);
    float mid = smoothstep(.02*sz, 0., perp)*smoothstep(1., .85, u);       // the midrib
    float m = max(leaf, mid);
    vec3 fc = mix(vec3(.1,.3,.06), vec3(.4,.68,.2), .2 + .8*u*(.5+.5*pinna))*(.35+.65*DAY);
    fc = mix(fc, vec3(.28,.42,.1), mid);
    fern = mix(fern, fc, m); fmask = max(fmask, m);
  }
  fmask *= LOD;
  // ʻōhiʻa seedlings: a red blossom now and then
  float blossom = smoothstep(.9, .95, noise2(g*7.+2.))*plants*smoothstep(.6,.8,uStage)*LOD;
  col = mix(col, fern, fmask);
  col = mix(col, vec3(.85,.15,.1)*(.4+.6*DAY), blossom*.8);
  col = horizonMix(col, rd, t, .1, sky);
  col = mix(col, underwater(col, t, g), max(WET, DROWN)); sky *= 1. - max(WET, DROWN);
  col += vec3(.9,.95,1.)*bubbles(uv, .5)*WET*.4;
  float st = steamPuff(uv, vec2(0., -.6), .6, 1.6, .25, 1.)*QUENCH*.9 + steamPuff(uv, vec2(-.3, -.4), .3, 1.2, .3, 8.)*HOT*STEAM*.4;
  st = clamp(st, 0., 1.);
  col = mix(col, mix(vec3(.5,.52,.6), vec3(.95), DAY), st); sky *= 1. - st;
#endif

  // tone
  col = col/(1.+col*.25);
  col = pow(max(col, 0.), vec3(.95));
  finish(col, sky);
}
`;

export default shaderEngine({
  id: 'lava',
  name: 'Lava',
  fs,
  res: 1,
  sky: true,
  params: [
    { id: 'x1', label: 'Heat', value: 0.6, tip: 'How hot and bright the molten rock is' },
    { id: 'x2', label: 'Crust', value: 0.5, tip: 'How much dark crust covers the melt (plant cover in the fern scene)' },
    { id: 'x3', label: 'Steam', value: 0.5, tip: 'Steam and haze' },
    { id: 'x4', label: 'Zoom', value: 0.5, tip: 'How close the camera is to the ground' },
  ],
  defaults: { MODE: 0 },
});

export const scenes = [
  { id: 'lava-pahoehoe', name: 'Pāhoehoe Toes', tags: ['realistic', 'lava', 'hawaii', 'science'],
    desc: 'Smooth ropy pāhoehoe lobes advance toward you, their dark skins folding over a molten interior that glows through every crack.',
    opts: { MODE: 0 }, params: { stage: 0.36, activity: 0.55, light: 0.6, x1: 0.6, x2: 0.5, x3: 0.4, x4: 0.5 } },
  { id: 'lava-aa', name: 'ʻAʻā Clinker', tags: ['realistic', 'lava', 'hawaii'],
    desc: 'A rubbly ʻaʻā flow front: jagged clinker blocks tumbling over a core that still glows in the gaps.',
    opts: { MODE: 1 }, params: { stage: 0.4, activity: 0.6, light: 0.25, x1: 0.7, x2: 0.6, x3: 0.3, x4: 0.4 } },
  { id: 'lava-lake', name: 'Lava Lake', tags: ['realistic', 'lava', 'hawaii', 'night'],
    desc: 'A Halemaʻumaʻu-style lava lake: dark crust plates drift apart on glowing seams while the lake fountains and sloshes at the rim.',
    opts: { MODE: 2 }, params: { stage: 0.45, activity: 0.6, light: 0.05, x1: 0.7, x2: 0.5, x3: 0.4, x4: 0.5 } },
  { id: 'lava-entry', name: 'Ocean Entry', tags: ['realistic', 'lava', 'hawaii', 'eruption'],
    desc: 'Where the flow meets the surf, waves flash into laze and the molten rock shatters into black sand along a new bench.',
    opts: { MODE: 3 }, params: { stage: 0.4, activity: 0.6, light: 0.35, wind: 0.5, x1: 0.7, x2: 0.4, x3: 0.6, x4: 0.5 } },
  { id: 'lava-skylight', name: 'Tube Skylight', tags: ['realistic', 'lava', 'hawaii', 'abstract'],
    desc: 'Looking down a skylight into a lava tube, a river of molten rock races beneath a crust that is already cool enough to stand on.',
    opts: { MODE: 4 }, params: { stage: 0.38, activity: 0.6, light: 0.7, x1: 0.7, x2: 0.4, x3: 0.3, x4: 0.5 } },
  { id: 'lava-fissure', name: 'Fissure at Night', tags: ['realistic', 'lava', 'night', 'eruption', 'hawaii'],
    desc: 'A rift-zone fissure opens into a curtain of fire, spattering ramparts along the crack and lighting the night sky orange.',
    opts: { MODE: 5 }, params: { stage: 0.32, activity: 0.7, light: 0.03, wind: 0.55, x1: 0.75, x2: 0.4, x3: 0.5, x4: 0.5 } },
  { id: 'lava-pillows', name: 'Pillow Lava', tags: ['realistic', 'lava', 'underwater', 'science'],
    desc: 'On the sea floor, lava squeezes out as pillows: each lobe chills to black glass as the next one buds from a glowing seam.',
    opts: { MODE: 6 }, params: { stage: 0.07, activity: 0.6, light: 0.6, x1: 0.6, x2: 0.5, x3: 0.3, x4: 0.5 } },
  { id: 'lava-ferns', name: 'Ferns on Old Lava', tags: ['realistic', 'lava', 'calm', 'science'],
    desc: 'Decades on, lichens and ferns take root in the cracks of a cooled pāhoehoe flow and the first ʻōhiʻa blossoms appear.',
    opts: { MODE: 7 }, params: { stage: 0.7, activity: 0.4, light: 0.8, x1: 0.3, x2: 0.7, x3: 0.2, x4: 0.55 } },
];
