// The output stage. Every scene draws into its own canvas; this copies it onto the visible WebGL2 canvas with the
// "look" controls (hue, saturation, brightness, contrast, vignette, grain) and crossfades between scenes.
// In a cloud combo it also layers a Mega-Clouds scene with the volcano:
//   sky    clouds fill the volcano's sky (its transparent pixels)
//   mist   as sky, plus the clouds' bright parts drift in front of the island
//   over   the volcano keeps its own sky; the clouds' bright parts are laid over the whole picture
//   screen the cloud picture is screen-blended over the volcano
// The output canvas is what Record, Snapshot and embedding (window.megaVolcano.canvas) see.
import { compile, fullscreenVS } from './gl.js';

export const MODES = ['sky', 'mist', 'over', 'screen'];

const FS = `#version 300 es
precision highp float;
uniform sampler2D uA, uB, uC, uD;   // volcano now, volcano outgoing, clouds now, clouds outgoing
uniform float uMix, uCMix, uCombo, uMode, uAmount, uHue, uSat, uBright, uContrast, uVig, uGrain, uTime;
uniform vec2 uRes;
out vec4 o;
vec3 hueRot(vec3 c, float a){ const vec3 k = vec3(0.57735); float ca = cos(a);
  return c*ca + cross(k, c)*sin(a) + k*dot(k, c)*(1.-ca); }
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
// how cloud-like a pixel of the cloud layer is: bright and unsaturated (white/grey), not blue sky
float cloudKey(vec3 c){
  float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b));
  float sat = (mx - mn)/max(mx, 1e-3), l = dot(c, vec3(.2126,.7152,.0722));
  return smoothstep(.32, .8, l)*(1. - smoothstep(.12, .55, sat));
}
vec3 layer(vec4 v, vec3 cl){
  if (uCombo < .5) return v.rgb;
  if (uMode < .5) return mix(cl, v.rgb, v.a);
  if (uMode < 1.5) return mix(mix(cl, v.rgb, v.a), cl, cloudKey(cl)*uAmount*.6*v.a);
  if (uMode < 2.5) return mix(v.rgb, cl, cloudKey(cl)*uAmount);
  return 1. - (1. - v.rgb)*(1. - cl*uAmount);
}
void main(){
  vec2 uv = gl_FragCoord.xy/uRes;
  vec3 cl = vec3(0.);
  if (uCombo > .5) { cl = texture(uC, uv).rgb; if (uCMix < 1.) cl = mix(texture(uD, uv).rgb, cl, smoothstep(0., 1., uCMix)); }
  vec3 c = layer(texture(uA, uv), cl);
  if (uMix < 1.) c = mix(layer(texture(uB, uv), cl), c, smoothstep(0., 1., uMix));
  c = hueRot(c, uHue*6.2831853);
  float l = dot(c, vec3(.2126,.7152,.0722));
  c = mix(vec3(l), c, uSat*2.);
  c = (c - .5)*(.25 + uContrast*1.5) + .5;
  c *= uBright*2.;
  vec2 q = uv - .5; q.x *= uRes.x/uRes.y;
  c *= 1. - uVig*1.4*smoothstep(.25, 1.1, length(q));
  c += (h12(gl_FragCoord.xy + fract(uTime*7.)*917.) - .5)*uGrain*.35;
  o = vec4(clamp(c, 0., 1.), 1.);
}`;

export function createOutput(canvas) {
  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  if (!gl) throw new Error('WebGL2 is not available in this browser.');
  const prog = compile(gl, fullscreenVS, FS);
  const U = n => gl.getUniformLocation(prog, n);
  const u = {};
  for (const n of ['A', 'B', 'C', 'D', 'Mix', 'CMix', 'Combo', 'Mode', 'Amount', 'Hue', 'Sat', 'Bright', 'Contrast', 'Vig', 'Grain', 'Time', 'Res']) u[n] = U('u' + n);
  const vao = gl.createVertexArray();
  const tex = () => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return t;
  };
  const T = [tex(), tex(), tex(), tex()];
  let small = null, sctx = null; // read-back for the brightness output (Invisible Hands)

  function upload(t, src, nearest) {
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    const f = nearest ? gl.NEAREST : gl.LINEAR;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
  }

  return {
    gl, canvas,
    // a, b: { canvas, nearest } — b is the outgoing scene during a crossfade (or null). look: post controls 0..1.
    // combo: null, or { a, b, mix, mode, amount } with the cloud slots (b outgoing).
    draw(a, b, mix, look, time, combo) {
      if (a) upload(T[0], a.canvas, a.nearest);
      if (b && mix < 1) upload(T[1], b.canvas, b.nearest);
      if (combo) {
        if (combo.a) upload(T[2], combo.a.canvas, combo.a.nearest);
        if (combo.b && combo.mix < 1) upload(T[3], combo.b.canvas, combo.b.nearest);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog); gl.bindVertexArray(vao);
      ['A', 'B', 'C', 'D'].forEach((n, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, T[i]); gl.uniform1i(u[n], i); });
      gl.uniform1f(u.Mix, b ? mix : 1);
      gl.uniform1f(u.Combo, combo ? 1 : 0);
      gl.uniform1f(u.CMix, combo?.b ? combo.mix : 1);
      gl.uniform1f(u.Mode, combo ? Math.max(0, MODES.indexOf(combo.mode)) : 0);
      gl.uniform1f(u.Amount, combo ? combo.amount : 0);
      gl.uniform1f(u.Hue, look.hue); gl.uniform1f(u.Sat, look.saturation); gl.uniform1f(u.Bright, look.brightness);
      gl.uniform1f(u.Contrast, look.contrast); gl.uniform1f(u.Vig, look.vignette); gl.uniform1f(u.Grain, look.grain);
      gl.uniform1f(u.Time, time); gl.uniform2f(u.Res, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    // average luminance, the share of bright pixels and the share of hot (lava-coloured) pixels, from a 16×9 copy
    measure() {
      if (!small) { small = document.createElement('canvas'); small.width = 16; small.height = 9; sctx = small.getContext('2d', { willReadFrequently: true }); }
      sctx.drawImage(canvas, 0, 0, 16, 9);
      const d = sctx.getImageData(0, 0, 16, 9).data; let sum = 0, bright = 0, hot = 0;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        sum += l; if (l > 0.72) bright++; if (r > 0.55 && r > g * 1.5 && r > b * 2.2) hot++;
      }
      return { luma: sum / 144, white: bright / 144, lava: hot / 144 };
    }
  };
}
