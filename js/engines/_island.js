// Shared GLSL for the 3D engines: one island heightfield driven by the life model (js/life.js), so Island 3D,
// Low Poly, From Orbit and Undersea all draw the same mountain. World units: sea level is y = 0, the island's base
// radius is I_R. Call islandSetup() once per frame (in main) and then islandH(xz, octaves) anywhere.
//
//   islandSetup(L, uStage, R, floorDepth, profP, profS, seed, peakH, calDepth)
//     R          base radius of the volcano on the sea floor
//     floorDepth sea-floor depth as a fraction of R
//     profP/S    flank profile exp(-(r/R)^P * S): P 2, S 2.2 = shield; P 1.3, S 3.5 = steep stratovolcano
//     peakH      summit height at the shield maximum, as a fraction of R
//     calDepth   caldera depth as a fraction of R
//   islandH(xz, oct)   terrain height (negative under water)
//   lavaFlow(xz, t)    0..1 temperature of lava flows on the flanks (0 = none)
//   islShape(angle)    the island's angular outline factor (reef and shore radii are multiplied by it)
//   I_SHORE / I_REEF   shoreline radius right now / reef ring radius (both before islShape)
//   I_ROUGH            flank roughness multiplier (set after islandSetup; 1 = default)

export const ISLAND_GLSL = `
float I_R, I_PEAK, I_FLOOR, I_P, I_S, I_SEED, I_SHORE, I_REEF, I_STAGE, I_PEAKH, I_CAL, I_ROUGH;
Life IL;
float islProf(float x){ return exp(-pow(max(x, 0.), I_P)*I_S); }
// radius where the flank profile crosses sea level for a given summit height (0 when the summit is under water)
float shoreRadius(float peak){
  if (peak <= 0.001) return 0.;
  float pr = clamp(-I_FLOOR/(peak - I_FLOOR), 1e-4, .9999);
  return I_R*pow(-log(pr)/I_S, 1./I_P);
}
void islandSetup(Life L, float stage, float R, float floorDepth, float profP, float profS, float seed, float peakH, float calDepth){
  IL = L; I_STAGE = stage; I_R = R; I_FLOOR = -floorDepth*R; I_P = profP; I_S = profS; I_SEED = seed; I_PEAKH = peakH; I_CAL = calDepth; I_ROUGH = 1.;
  I_PEAK = L.h*peakH*R;
  I_SHORE = shoreRadius(I_PEAK);
  // the reef settles on the shoreline of the island as it was when coral arrived (stage ~0.66)
  I_REEF = shoreRadius(lifeHeight(.66)*peakH*R)*1.06 + .03*R;
}
// angular outline: the island is not a perfect circle
float islShape(float a){ vec2 c = vec2(cos(a), sin(a)); return 1. + .5*(fbm2(c*1.4 + I_SEED*13.1, 3.) - .5); }
vec2 coneAt(int i){ float h = hash11(I_SEED*7.3 + float(i)*3.7); float a = h*TAU; return vec2(cos(a), sin(a))*I_R*(.22 + .25*hash11(h + 5.1)); }
float islandH(vec2 xz, float oct){
  float r = length(xz), a = atan(xz.y, xz.x + 1e-5);
  float sh = islShape(a);
  float rr = r/sh;
  float x = rr/I_R;
  float y = mix(I_FLOOR, I_PEAK, islProf(x));
  // the raw tuff cone of the Surtseyan breach
  y += .14*I_R*IL.steam*smoothstep(.2*I_R, 0., rr);
  // flank texture, rougher once erosion sets in
  float lift = clamp((y - I_FLOOR)/(.4*I_R), 0., 1.);
  float n = fbm2(xz*(3.2/I_R) + I_SEED*31.7, oct) - .5;
  y += n*I_R*(.05 + .07*IL.erosion)*(1. - .75*IL.lagoon)*lift*I_ROUGH;
  // erosion: radial amphitheatre valleys and sea cliffs
  if (IL.erosion > .001) {
    vec2 c = vec2(cos(a), sin(a));
    float va = a*5. + 2.5*(fbm2(c*2.1 + I_SEED*3.3, 2.) - .5)*4.;
    float v = pow(abs(sin(va)), .55);
    float carve = IL.erosion*(1. - v)*smoothstep(.0, .3, x)*smoothstep(1.3, .45, x);
    y -= carve*(max(y, 0.)*.7 + .04*I_R);
  }
  // summit caldera
  y -= IL.caldera*I_CAL*I_R*smoothstep(.3*I_R, .1*I_R, rr)*smoothstep(0., .2, I_PEAK/I_R);
  // post-shield cinder cones on the upper flanks
  float cc = smoothstep(.5, .58, I_STAGE)*(1. - .6*IL.erosion)*smoothstep(0., .25, I_PEAK/I_R);
  if (cc > .001) for (int i = 0; i < 3; i++) { vec2 d = xz - coneAt(i); y += cc*.07*I_R*exp(-dot(d, d)/(.012*I_R*I_R)); }
  // the reef: a ring that stays at sea level while the island sinks inside it
  if (IL.reef > .001) {
    float reefR = I_REEF*sh;
    float ring = 1. - smoothstep(0., .08*I_R, abs(r - reefR));
    float rn = noise2(xz*(7./I_R) + I_SEED*3.);
    float top = -.012*I_R + .01*I_R*rn;
    float motu = IL.lagoon*smoothstep(.5, .62, rn)*.045*I_R;
    y = mix(y, max(y, top + motu), IL.reef*ring);
    float inside = smoothstep(reefR, reefR*.8, r);
    y = mix(y, max(y, -.07*I_R - .04*I_R*rn), IL.reef*inside);
    // the drowned summit sinks well below the lagoon floor at the atoll stage
    float sink = smoothstep(.75, 1., IL.lagoon);
    y = mix(y, min(y, -.14*I_R - .04*I_R*rn), sink*inside);
  }
  return y;
}
// lava flows running down the flanks (and into the sea); 0..1 temperature
float lavaFlow(vec2 xz, float t){
  float e = eruptAmt(IL)*(1. - IL.submarine)*(1. - IL.erosion)*(1. - .85*IL.steam);   // Surtseyan blasts, not flows, while the sea reaches the vent
  if (e <= .001) return 0.;
  float r = length(xz), a = atan(xz.y, xz.x + 1e-5);
  float a2 = a + .6*(noise2(xz*(1.6/I_R) + I_SEED*4.4) - .5);
  vec2 c = vec2(cos(a2), sin(a2));
  float sector = noise2(c*2.6 + I_SEED*7.7);
  float braid = noise2(c*6. + xz*(1.6/I_R) + I_SEED*2.);
  float reach = max(I_SHORE*1.12 + .08*I_R, .25*I_R);
  float along = r/reach;
  float m = smoothstep(.64 - .2*min(e, 1.) + .1*IL.caldera, .72 + .1*IL.caldera, sector*.6 + braid*.4)*smoothstep(1.05, .85, along);
  float temp = m*(1. - .45*along)*(.7 + .3*sin(along*26. - t*2.5 + sector*12.));
  // the vent itself: a lava lake / spatter field at the summit
  temp = max(temp, smoothstep(.12*I_R, .03*I_R, r)*(.85 + .15*sin(t*3.)));
  return clamp(temp*min(e, 1.), 0., 1.);
}
`;
