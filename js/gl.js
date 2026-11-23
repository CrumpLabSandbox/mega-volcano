// WebGL2 helpers for shader engines.
import { LIFE_GLSL } from './life.js';
// shaderEngine() turns one fragment shader body into an engine: the host hands it a WebGL2 context, and every
// frame it draws a full-screen triangle with the standard uniforms below. Scene opts that are numbers become
// #defines (opts.MODE = 2 → `#define MODE 2.00000` plus `#define MODE_2`, so `#ifdef MODE_2` selects code), so one shader serves many scenes without branching cost.

export const HEADER = `#version 300 es
precision highp float;
uniform vec2 uRes;        // canvas size in pixels
uniform float uTime;      // scene time in seconds, already scaled by the Speed control
uniform float uClock;     // wall-clock seconds (not scaled), for flicker that should not follow Speed
uniform vec4 uMouse;      // x, y in 0..1 (y up), z = 1 while pressed, w = 1 once the pointer has moved
uniform vec2 uDrag;       // accumulated drag, in screen heights (x right, y up); use for orbit / pan
uniform float uStage;     // island life 0..1: seamount → breach → shield → caldera → erosion → sinking → atoll
uniform float uEpoch;     // how many life cycles have looped (reseed the island with it)
uniform float uActivity, uSize, uDetail, uWind, uLight;   // the standard controls, 0..1
uniform float uX1, uX2, uX3, uX4;                         // engine-specific controls, 0..1
uniform float uSeed;      // per-scene random number 0..1
uniform float uCombo;     // 1 when a Mega-Clouds layer shows through the sky: write sky pixels with alpha 0 (see finish())
out vec4 outColor;
`;

export const NOISE = `
#define PI 3.14159265
#define TAU 6.2831853
float hash11(float p){ p = fract(p*.1031); p *= p+33.33; p *= p+p; return fract(p); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
vec2 hash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); p3 += dot(p3, p3.yzx+33.33); return fract((p3.xx+p3.yz)*p3.zy); }
float hash13(vec3 p3){ p3 = fract(p3*.1031); p3 += dot(p3, p3.zyx+31.32); return fract((p3.x+p3.y)*p3.z); }
float noise2(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.-2.*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), u.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), u.x), u.y); }
float noise3(vec3 p){ vec3 i = floor(p), f = fract(p); vec3 u = f*f*(3.-2.*f);
  return mix(mix(mix(hash13(i), hash13(i+vec3(1,0,0)), u.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), u.x), u.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), u.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), u.x), u.y), u.z); }
// fbm with a fractional octave count (detail control maps to oct)
float fbm2(vec2 p, float oct){ float s = 0., a = .5, n = 0.; mat2 m = mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<9;i++){ float w = clamp(oct-float(i), 0., 1.); if(w<=0.) break; s += w*a*noise2(p); n += w*a; p = m*p; a *= .5; } return s/max(n,1e-4); }
float fbm3(vec3 p, float oct){ float s = 0., a = .5, n = 0.;
  for(int i=0;i<8;i++){ float w = clamp(oct-float(i), 0., 1.); if(w<=0.) break; s += w*a*noise3(p); n += w*a; p = p*2.02 + vec3(1.7,9.2,3.1); a *= .5; } return s/max(n,1e-4); }
// Worley (cellular) distance, for billowy cauliflower tops
float worley3(vec3 p){ vec3 i = floor(p), f = fract(p); float d = 1.;
  for(int z=-1;z<=1;z++) for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec3 g = vec3(x,y,z); vec3 o = vec3(hash13(i+g), hash13(i+g+17.1), hash13(i+g+31.7));
    vec3 r = g+o-f; d = min(d, dot(r,r)); } return sqrt(d); }
float worley2(vec2 p){ vec2 i = floor(p), f = fract(p); float d = 1.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g = vec2(x,y); vec2 r = g+hash22(i+g)-f; d = min(d, dot(r,r)); } return sqrt(d); }
vec3 hsv2rgb(vec3 c){ vec3 p = abs(fract(c.xxx+vec3(0.,2./3.,1./3.))*6.-3.); return c.z*mix(vec3(1.), clamp(p-1.,0.,1.), c.y); }
float luma(vec3 c){ return dot(c, vec3(.2126,.7152,.0722)); }
vec2 rot2(vec2 p, float a){ float c = cos(a), s = sin(a); return mat2(c,s,-s,c)*p; }
// wind direction from the Wind control: 0.5 = blowing right, full turn across the range
vec2 windDir(){ float a = (uWind-.5)*TAU; return vec2(cos(a), sin(a)); }
// a simple physically-flavoured sky (rd = view ray, sun = sun direction, day = the Light control): sun elevation from 0 (night) to 1 (noon)
vec3 skyColor(vec3 rd, vec3 sun, float day){
  float h = max(rd.y, 0.);
  vec3 zen = mix(vec3(.01,.02,.06), vec3(.18,.38,.78), smoothstep(-.1,.5,day));
  vec3 hor = mix(vec3(.05,.06,.12), vec3(.70,.80,.92), smoothstep(-.1,.5,day));
  vec3 sunset = vec3(1.,.45,.18)*smoothstep(.55,.0,abs(day-.12))*1.2;
  vec3 col = mix(hor + sunset*pow(1.-h,6.)*(.5+.5*dot(rd.xz, normalize(sun.xz+1e-4))), zen, pow(h,.45));
  float s = max(dot(rd, sun), 0.);
  col += vec3(1.,.85,.6)*pow(s, 300.)*4.*smoothstep(-.05,.05,sun.y) + vec3(1.,.6,.3)*pow(s, 8.)*.25*smoothstep(-.2,.1,sun.y);
  return col;
}
`;

// volcano helpers: the island life model, glowing lava, and the combo-aware output
export const VOLCANO = LIFE_GLSL + `
// eruption strength: life cycle × the Activity control (0.5 = natural)
float eruptAmt(Life L){ return clamp(L.erupt*uActivity*2., 0., 2.); }
// glowing lava from temperature 0..1 (black crust → red → orange → yellow-white)
vec3 lavaColor(float t){ t = clamp(t, 0., 1.);
  return vec3(clamp(t*2.4,0.,1.), clamp((t-.32)*1.9,0.,1.)*.92, clamp((t-.78)*4.,0.,1.)*.82) + .07*(1.-t); }
// write the final colour; sky = how much of this pixel is open sky (0..1). In a cloud combo that part is transparent.
void finish(vec3 col, float sky){ outColor = vec4(col, 1. - uCombo*clamp(sky, 0., 1.)); }
`;

const VERT = `#version 300 es
void main(){ vec2 p = vec2((gl_VertexID<<1)&2, gl_VertexID&2); gl_Position = vec4(p*2.-1., 0., 1.); }`;

export function compile(gl, vs, fs) {
  const mk = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const lines = src.split('\n').map((l, i) => `${i + 1}: ${l}`);
      const m = /0:(\d+)/.exec(log || ''); const at = m ? +m[1] : 0;
      console.error(log + '\n' + lines.slice(Math.max(0, at - 4), at + 2).join('\n'));
      throw new Error('Shader compile failed: ' + log);
    }
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('Link failed: ' + gl.getProgramInfoLog(p));
  return p;
}

export const fullscreenVS = VERT;

function defines(opts) {
  let s = '';
  for (const [k, v] of Object.entries(opts || {})) {
    if (typeof v === 'number') { s += `#define ${k} ${v.toFixed(5)}\n`; if (Number.isInteger(v) && v >= 0) s += `#define ${k}_${v}\n`; }
    else if (typeof v === 'boolean' && v) s += `#define ${k} 1\n`;
    else if (Array.isArray(v) && v.length >= 2 && v.length <= 4) s += `#define ${k} vec${v.length}(${v.map(x => (+x).toFixed(4)).join(',')})\n`;
  }
  return s;
}

// shaderEngine({ id, name, fs, params, res, defaults }) → engine. `fs` is GLSL with a main() that writes outColor.
// `defaults` are opts every scene inherits; a scene's opts override them.
export function shaderEngine(def) {
  return {
    kind: 'gl',
    res: 1,
    ...def,
    create(gl, opts) {
      const o = { ...(def.defaults || {}), ...(opts || {}) };
      const prog = compile(gl, VERT, HEADER + defines(o) + NOISE + VOLCANO + def.fs);
      const U = {};
      const names = ['uRes', 'uTime', 'uClock', 'uMouse', 'uDrag', 'uStage', 'uEpoch', 'uActivity', 'uSize', 'uDetail', 'uWind', 'uLight', 'uX1', 'uX2', 'uX3', 'uX4', 'uSeed', 'uCombo'];
      for (const n of names) U[n] = gl.getUniformLocation(prog, n);
      const vao = gl.createVertexArray();
      const seed = Math.random();
      return {
        render(f) {
          gl.viewport(0, 0, f.w, f.h);
          gl.useProgram(prog); gl.bindVertexArray(vao);
          gl.uniform2f(U.uRes, f.w, f.h);
          gl.uniform1f(U.uTime, f.t); gl.uniform1f(U.uClock, f.clock);
          gl.uniform4f(U.uMouse, f.pointer.x, 1 - f.pointer.y, f.pointer.down ? 1 : 0, f.pointer.moved ? 1 : 0);
          gl.uniform2f(U.uDrag, f.pointer.dragX, -f.pointer.dragY);
          const p = f.p;
          gl.uniform1f(U.uStage, f.stage); gl.uniform1f(U.uEpoch, f.epoch); gl.uniform1f(U.uCombo, f.combo ? 1 : 0);
          gl.uniform1f(U.uActivity, p.activity); gl.uniform1f(U.uSize, p.scale); gl.uniform1f(U.uDetail, p.detail);
          gl.uniform1f(U.uWind, p.wind); gl.uniform1f(U.uLight, p.light);
          gl.uniform1f(U.uX1, p.x1); gl.uniform1f(U.uX2, p.x2); gl.uniform1f(U.uX3, p.x3); gl.uniform1f(U.uX4, p.x4);
          gl.uniform1f(U.uSeed, seed);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        },
        dispose() { gl.deleteProgram(prog); gl.deleteVertexArray(vao); }
      };
    }
  };
}
