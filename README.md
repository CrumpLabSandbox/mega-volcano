# Mega-Volcano

A volcanic island simulator for the browser. Watch an island be born on the sea floor, break the surface in Surtseyan
blasts of ash and steam, build a lava shield, collapse into a caldera, erode, grow a reef, sink, and end as an atoll,
in over a hundred styles, from a raymarched 3D island and a real lava-flow simulation to cross-section diagrams, maps,
woodblock prints, pixel art and neon. It works as a gallery, a screensaver, and a clean video source, and it can layer
any [Mega-Clouds](https://crumplabsandbox.github.io/Mega-Clouds/) sky with any volcano.

**Live:** https://crumplabsandbox.github.io/mega-volcano/

No build step and no dependencies: plain ES modules, WebGL2 and canvas 2D. Serve the folder with any static server and
open `index.html`. To use cloud combos locally, serve the folder that holds both clones (`node tools/serve.mjs`, then
open http://localhost:8123/mega-volcano/).

## The engines

157 scenes across 20 engines:

| engine | what it is |
|---|---|
| Island 3D | raymarched island, ocean, wind-bent plume and lava glow; drag to orbit |
| Cross-Section | animated textbook cutaways: plume, magma chamber, layered flows, Darwin's sinking reef, island arcs, Iceland's ridge |
| Hotspot Chain | the plate conveyor: islands born over the hotspot, carried off, sinking into atolls; the Hawaiian–Emperor bend and ages |
| Maps | contours, nautical chart, hillshade, satellite, thermal, geologic, explorer's chart, radar |
| Lava Flow Sim | a real cellular-automaton lava simulation that builds the island flow by flow; click to open a vent |
| Eruption | Surtseyan jets, fountains, Strombolian bombs, Plinian column, volcanic lightning, pyroclastic flows, Hunga Tonga |
| Lava | close-ups: pāhoehoe, ʻaʻā, lava lake, ocean entry, tube skylight, fissure, pillows, ferns on old lava |
| Undersea | pillow lava, black smokers, the breach from below, reef wall, ROV camera, sonar, the drowned guyot |
| From Orbit | astronaut and satellite views, thermal, the Hawaiian chain on a globe, the Hunga Tonga umbrella cloud |
| Low Poly | faceted turntable dioramas, including a floating hex tile |
| Voxel | an isometric block island, with a cutaway |
| Pixel Art | NES, Game Boy, C64, PICO-8, CGA, 16-bit, 1-bit Mac, isometric |
| Cartoon | picture book, cel cartoon, a volcano with a face, comic book, sticker, clay, tiki |
| Woodblock & Ink | ukiyo-e, sumi-e, shan shui scroll, linocut, Victorian engraving, porcelain |
| Paper & Craft | cut-paper diorama, origami, felt, stained glass, mosaic, quilling, kirigami |
| Posters | WPA, art deco, Bauhaus, Swiss, Memphis, risograph, constructivist, minimal |
| Painterly | impressionist, pointillist, watercolour, impasto, swirling night, Turner, gouache, nocturne |
| Sketch & Notebook | a field notebook with annotations, blueprint, chalkboard, ballpoint, charcoal, stipple, flip-book |
| Text Mode | ASCII terminals, braille, teletext, a seismograph dashboard, typewriter, block elements, emoji |
| Vector & Neon | synthwave, vector monitor, oscilloscope, light trails, vaporwave, glitch, thermal, neon sign |

## The island's life

Every scene tells the same story, driven by one model (`js/life.js`, explained in [docs/SCIENCE.md](docs/SCIENCE.md)):

| stage | phase | |
|---|---|---|
| 0.00 | Seamount | pillow lava on the deep sea floor |
| 0.12 | Breaching the surface | Surtseyan jets of black tephra and steam, a tuff cone |
| 0.22 | Shield building | lava fountains and flows; lava pouring into the sea makes new land |
| 0.50 | Caldera and cinder cones | the summit collapses; eruptions wane |
| 0.62 | Erosion and life | valleys, sea cliffs, forest, a fringing reef |
| 0.80 | Sinking | the island subsides; a barrier reef and lagoon |
| 0.92 | Atoll | only the reef ring is left |

**Stage** sets where the island is; **Growth** runs the cycle on a loop (from 10 minutes down to 20 seconds per life;
0 holds the stage). A caption in the corner names the current phase (`I` toggles it).

## Using it

- **Gallery**: filter by tag or search, then click a scene.
- **Viewer**: drag to look around or orbit in 3D scenes; click to interact where a scene supports it. Press ⚙ for controls.
- **Controls** (all 0–1): Speed (0 freezes, the middle is real time, the top is a 16× time-lapse), Stage, Growth,
  Activity (eruption strength), Size, Detail, Wind direction, Light (night → golden hour → noon), up to four
  scene-specific controls, and a Look section (hue, saturation, brightness, contrast, vignette, grain).
- **Screensaver**: the ⟳ menu changes scene every 15 s to 5 min with a crossfade. Shuffle respects the gallery filter.
- **Keys**: `←` `→` scene · `↑` `↓` clouds · `K` clouds on/off · `Space` pause · `R` random · `I` captions ·
  `F` full screen · `H` hide the HUD · `C` controls · `S` save a PNG · `V` record WebM · `G`/`Esc` gallery.
- **Quality**: Auto lowers the render resolution until the frame rate holds, then raises it again.

## Volcano + clouds

Mega-Volcano loads [Mega-Clouds](https://github.com/CrumpLabSandbox/Mega-Clouds)' engines straight from its site (both
live on `crumplabsandbox.github.io`), so any of its scenes can run with any volcano scene. Pick a sky with ☁ in the
viewer or the **Clouds** menu in the gallery, or press **▶ Volcano + clouds screensaver** for random pairs.

- **Layering**: *Sky* puts the clouds behind the island (every side-on scene leaves its sky transparent for them);
  *Mist* also lets the clouds' bright parts drift in front; *Over* lays the clouds on top (the default for maps,
  undersea and space views); *Screen* blends the two pictures.
- **Follow** (on by default): the clouds take the volcano's Light, Wind and Speed, so the sky matches the island.
- Cloud cover, cloud size and the in-front strength have their own sliders. Shuffle can change both layers, only the
  volcano, or only the clouds.

## As a video source

URL parameters:

| parameter | effect |
|---|---|
| `scene=<id>` | open a scene (ids are shown by 🔗 *Copy link*) |
| `ui=0` | no HUD, no gallery, no captions: just the picture (H still toggles the HUD) |
| `shuffle=<seconds>` | screensaver mode |
| `stage=0.2`, `grow=0`, `activity=0.8`, `light=0.3`, … | any control, 0–1 |
| `clouds=<cloud scene id \| random>` | layer a Mega-Clouds scene |
| `cmode=sky \| mist \| over \| screen`, `camount`, `ccover`, `csize`, `clink=0` | cloud layering, strength, cover, size, don't follow |
| `captions=0` | hide the stage caption |
| `quality=0.5 \| 0.75 \| 1 \| 1.5` | fix the render scale |
| `room=<code>` | join an Invisible Hands room |

Embedding: `window.megaVolcano` exposes `canvas` (the output, a WebGL2 canvas with `preserveDrawingBuffer`), `scenes`,
`life` (the current phase and its curves), `setScene(id)`, `set(control, value)`, `setClouds(id, mode)`,
`cloudScenes`, `next()`, `prev()`, `random()`, `pause()` and `measure()`. A page on the same origin, such as
[MEGA·CV](https://crumplabsandbox.github.io/mega-cv/), can iframe `?ui=0` and read that canvas each frame as a
texture. Any page can drive it with
`frame.contentWindow.postMessage({ megaVolcano: { scene: 'island3d-shield', set: { stage: 0.15 }, clouds: 'random' } }, '*')`.
Screen capture of the tab works too.

## Invisible Hands

The **Hands** button joins an [Invisible Hands](https://github.com/samuelling/InvisibleHands) room (Sam Ling's
protocol, `js/vendor/invisible-hands.js`, copied unchanged from MEGA·CV), so other apps, MEGA·CV's Hands module for one,
can move the controls. It exposes every control (`speed`, `stage`, `grow`, `activity`, `scale`, `detail`, `wind`,
`light`, `x1`–`x4`, the look controls), `scene` (0–1 across the list), `next` (trigger), `pause` (toggle), and the cloud
layer: `clouds` (0 = none, then every Mega-Clouds scene), `cloudnext` (trigger), `camount`, `ccover`, `csize`. It
publishes `brightness`, `glow` (share of lava-hot pixels), `lifestage`, `height` (island height above the sea),
`eruption` and `scene`, so a patch can follow the island as it grows. Opening the page with `?room=<code>` joins that
room. While linked, the page holds a WebSocket to Sam's relay, `invisible-hands.samuelling.workers.dev`.

## How it is built

```
index.html, css/style.css
js/app.js          gallery, viewer, controls, life cycle, cloud combos, shuffle, recording, Invisible Hands, embed API
js/life.js         the island life model (JS and GLSL), shared by every engine
js/post.js         output stage: cloud layering, look controls and crossfades on one WebGL2 canvas
js/clouds.js       loads Mega-Clouds' engines from ../Mega-Clouds/
js/registry.js     engine list, standard controls, defaults
js/gl.js           shaderEngine() helper, the GLSL noise library and volcano helpers
js/util.js         2D helpers: noise, random, puff sprites, sky, lava colour
js/engines/*.js    one file per engine, each exporting the engine and its scenes
tools/             serve.mjs (local server), preview.html + shot.mjs (render an engine's scenes), smoke.mjs (app test)
docs/              ENGINES.md (how to write an engine), SCIENCE.md (how volcanic islands form)
```

An **engine** is a way of drawing islands; a **scene** is an engine plus presets. To add one, see
[docs/ENGINES.md](docs/ENGINES.md). `node tools/shot.mjs <engine> out.png stages=1` renders all its scenes at six
life stages to one image (needs Playwright).
