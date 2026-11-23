# Writing an engine

An **engine** is one way of drawing volcanic islands (a raymarcher, a cross-section diagram, pixel art…). A **scene**
is an engine plus preset values. The gallery lists scenes. Each engine lives in `js/engines/<id>.js` and is listed in
`js/registry.js`. The host API is the same as [Mega-Clouds](https://github.com/CrumpLabSandbox/Mega-Clouds)' (so its
engines are useful reading), plus the island life cycle and the cloud-combo sky.

```js
// js/engines/example.js
import { clamp, sky, lavaCss, eruptAmount } from '../util.js';

export default {
  id: 'example',
  name: 'Example',
  kind: '2d',          // '2d' → the host passes a CanvasRenderingContext2D; 'gl' → a WebGL2RenderingContext
  res: 1,              // render-resolution multiplier (0.5 for heavy shaders); the host upscales
  sky: true,           // false for views with no open sky (maps from above, underwater, cutaways that fill the frame)
  params: [            // up to four engine-specific controls, mapped to p.x1..p.x4, all 0..1
    { id: 'x1', label: 'Outline', value: 0.5, tip: 'optional tooltip' },
  ],
  create(ctx, opts) {  // opts = the scene's opts object (constants: palettes, modes, counts)
    return {
      render(f) { /* draw one frame; see the frame object below */ },
      resize(w, h) {},  // optional
      dispose() {}      // optional
    };
  }
};

export const scenes = [
  { id: 'example-basic', name: 'Basic Example', tags: ['cartoon', '2d'], desc: 'One line about it.',
    opts: { palette: 'day' },
    params: { stage: 0.35, grow: 0.5, activity: 0.5, scale: 0.5, light: 0.8, x1: 0.5 } },
];
```

## The island life cycle

Every scene shows the same story, from `js/life.js`: a hotspot volcano is born on the sea floor, breaks the surface,
builds a shield, collapses into a caldera, erodes and grows a reef, sinks, and ends as an atoll. The host turns the
**Stage** and **Growth** controls into `f.stage` (0..1, looping when Growth is above 0) and hands you `f.life`:

| stage | phase (`f.life.id`) | what to show |
|---|---|---|
| 0.00–0.12 | `seamount` | all under water: pillow lava, a cone growing on the sea floor, maybe a bubbling/discoloured patch of sea |
| 0.12–0.22 | `breach` | Surtseyan eruption: black cypressoid ("cock's tail") jets of tephra and white steam from a vent at sea level, a raw black tuff cone |
| 0.22–0.50 | `shield` | lava fountains and flows, broad shield growing, lava entering the sea with steam plumes (laze), new black land |
| 0.50–0.62 | `caldera` | summit caldera, cinder cones, rarer explosive bursts, first green on old flows |
| 0.62–0.80 | `erosion` | quiet; green valleys, sea cliffs, beaches, a fringing reef (turquoise ring hugging the coast) |
| 0.80–0.92 | `sinking` | the island shrinks; barrier reef with a lagoon between reef and shore |
| 0.92–1.00 | `atoll` | only a ring of reef and sandy islets around a lagoon (later it drowns: a guyot) |

`f.life` fields (all smooth, so animations don't jump): `height` (summit above sea level, −1 deep sea floor … 0 sea
level … 1 tallest), `erupt` (0..1 eruptive output), `steam` (Surtseyan steam/ash jets), `submarine` (1 while the vent
is under water), `explosive`, `caldera`, `erosion`, `veg`, `reef`, `lagoon`, plus `stage`, `index`, `id`, `name`,
`text`. Multiply eruption by the **Activity** control with `eruptAmount(f)` (0..2; 0.5 Activity = natural). `f.epoch`
counts completed loops: reseed the island's shape from it so each cycle grows a new one. At the wrap from 1 back to 0
a new seamount starts; that's fine (the old atoll is gone below the sea).

**Size** (`p.scale`) is how big the island looks. **Wind** (`p.wind`, 0.5 = blowing right, `windX`/`windDir`) bends
plumes. **Light** (`p.light`, 0 night → ~0.3 golden hour → 1 noon) is time of day; at night lava should glow.

## The frame object

| field | meaning |
|---|---|
| `f.ctx` | the context (same one `create` got) |
| `f.w`, `f.h` | canvas size in pixels (already includes the quality scale) |
| `f.t` | scene time in seconds, **already scaled by the Speed control** (Speed 0 freezes it). Animate with `f.t`. |
| `f.dt` | scaled seconds since the last frame (0 when frozen) |
| `f.clock` | real seconds, unscaled (only for things like flicker) |
| `f.stage`, `f.epoch`, `f.life` | the island life cycle (above) |
| `f.combo` | true when a Mega-Clouds layer will show through your sky: leave sky pixels **transparent** (below) |
| `f.p` | controls, all **0..1**: `stage`, `grow`, `activity`, `scale`, `detail`, `wind`, `light`, `x1..x4` |
| `f.pointer` | `{ x, y }` in 0..1 (y down), `down`, `moved`, `dragX`, `dragY` accumulated drag in screen heights (orbit/pan), `clicks` (array of `{x,y}` since the last frame) |
| `f.opts` | the scene opts |

## Cloud combos: keep the sky transparent when asked

Mega-Volcano can layer any Mega-Clouds scene with any volcano scene. In the *sky* and *mist* modes the clouds are drawn
**behind** your picture and show through wherever your output is transparent. So when `f.combo` is true:

- **2D**: don't paint the sky. Call `sky(f)` (or `sky(f, (ctx, w, h) => yourSkyPainter())`) from `util.js`: it paints
  normally, but clears to transparent in a combo. Everything else (ocean, island, plume, ash, steam, stars only if you
  must) draws on top as usual, so a semi-transparent plume stays semi-transparent over the clouds. Low-res buffers made
  with `buffer()` have alpha too: clear them the same way and `drawImage` keeps the transparency.
  Never paint the sky as a full-frame `fillRect` with alpha for trails; if you need trails, keep them on a buffer.
- **GL** (`shaderEngine`): end `main()` with `finish(col, skyAmount)`, where `skyAmount` is 1 for open-sky pixels and 0
  for anything solid (sea, land, plume core). It writes alpha 1 normally and `1 - skyAmount` in a combo. For a
  semi-transparent plume over sky, pass `skyAmount = 1 - plumeOpacity`.
- Engines with no open sky (`sky: false`: top-down maps, underwater, full-frame cutaways) ignore `f.combo`; the host
  then lays the clouds over the top instead (as if seen from above).
- Night scenes: the cloud scene follows the volcano's Light by default, so don't fight it.

Test it with `node tools/shot.mjs <engine> /tmp/x.png combo=1`: transparent pixels show as a checkerboard.

## Rules

- Draw the **whole** frame every call (no reliance on the previous frame) unless the engine deliberately keeps buffers.
- Look good on the very first frame, at any `t` (the host starts `t` at a random offset, and thumbnails render a single
  frame). Prefer state that is a pure function of `t` and `f.stage`; if you keep particles or a simulation, warm it up
  in `create` and make it follow `f.stage` (e.g. rebuild/reseed when the stage jumps by more than ~0.05 or `f.epoch`
  changes, because the user can drag the Stage slider).
- Be resolution independent: size things relative to `f.h` / `f.w`, never fixed pixels.
- No network requests, no external libraries, no images. Plain ES modules.
- `rng(seed)` gives correlated first values for nearby seeds; spread them first, e.g. `rng(Math.imul(i + 1, 2654435761))`.
- Hue/saturation/brightness/contrast/vignette/grain are applied by the host afterwards — don't duplicate them.
- Keep a frame under ~8 ms at 1280×720 for 2D, and make GL shaders scale with Detail.

## Shader engines

`js/gl.js` exports `shaderEngine({ id, name, fs, params, res, sky, defaults })`. `fs` is GLSL ES 3.00 with a `main()`
that ends with `finish(col, skyAmount)` (or writes `outColor` itself with alpha 1). Prepended for you:

- uniforms `uRes uTime uClock uMouse uDrag uStage uEpoch uActivity uSize uDetail uWind uLight uX1..uX4 uSeed uCombo`
- noise: `noise2/3`, `fbm2/3(p, octaves)` (fractional octaves), `worley2/3`, `hash11/12/22/13`, `hsv2rgb`, `luma`, `rot2`,
  `windDir()`, `skyColor(rd, sun, day)`
- volcano: `Life L = life(uStage);` (fields `h erupt steam submarine expl caldera erosion veg reef lagoon`),
  `eruptAmt(L)` (with Activity), `lavaColor(temp01)`, `finish(col, sky)`

Scene `opts` that are numbers become float `#define`s (`K: 0.5` → `#define K 0.50000`, `MODE: 2` → `#define MODE
2.00000`); a non-negative integer also defines a flag, `MODE: 2` → `#define MODE_2`, so `#ifdef MODE_2` selects code at
compile time. Arrays of 2–4 numbers become `vecN`. Give every define a default in the engine's `defaults`.

For several passes or persistent state (a lava-flow simulation, a heightmap you erode), write a `kind: 'gl'` engine by
hand with `compile(gl, fullscreenVS, HEADER + NOISE + VOLCANO + yourFS)` from `gl.js`, and render-to-texture as you like.

## Testing

- `node tools/shot.mjs <engine> /tmp/<engine>.png` renders every scene of the engine to one image (Playwright, headless,
  SwiftShader — slow GPU, so timings are pessimistic). Look at it with an image viewer.
- `… stages=1` renders each scene at six life stages (0.06 0.17 0.35 0.56 0.72 0.96) — check the whole story reads.
- `… combo=1` renders with a transparent sky (checkerboard).
- `node tools/smoke.mjs` runs the real app through every scene.
- `node tools/serve.mjs` serves the parent folder at http://localhost:8123/mega-volcano/ so the Mega-Clouds combo works
  locally (it needs the sibling `Mega-Clouds` clone).
