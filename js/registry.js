// Every engine, in gallery order. A scene = engine + presets; see docs/ENGINES.md.
const ENGINE_FILES = [
  'island3d', 'section', 'hotspot', 'map', 'lavaflow', 'eruption', 'lava', 'undersea', 'orbit', 'lowpoly',
  'voxel', 'pixel', 'cartoon', 'woodblock', 'papercut', 'poster', 'painterly', 'sketch', 'ascii', 'synth'
];

// The standard controls every scene has (0..1). Engines add x1..x4.
// `wind` and `light` mean the same as in Mega-Clouds, so a cloud layer can follow them.
export const CONTROLS = [
  { id: 'speed', label: 'Speed', value: 0.5, tip: '0 freezes time; the middle is real time; the top is a 16× time-lapse' },
  { id: 'stage', label: 'Stage', value: 0.35, tip: 'Where the island is in its life: seamount → breaching → shield → caldera → erosion → sinking → atoll' },
  { id: 'grow', label: 'Growth', value: 0.5, tip: '0 holds the Stage; higher runs the whole life cycle on a loop, from 10 minutes down to 20 seconds' },
  { id: 'activity', label: 'Activity', value: 0.5, tip: 'How hard the volcano erupts (the middle is natural for the stage)' },
  { id: 'scale', label: 'Size', value: 0.5, tip: 'How big the island looks' },
  { id: 'detail', label: 'Detail', value: 0.6, tip: 'Fine structure (heavier to draw)' },
  { id: 'wind', label: 'Wind dir', value: 0.5, tip: 'Which way the plume drifts: middle blows right, the ends blow left' },
  { id: 'light', label: 'Light', value: 0.8, tip: 'Time of day: night → golden hour → noon' },
];
export const LOOK = [
  { id: 'hue', label: 'Hue', value: 0 },
  { id: 'saturation', label: 'Saturation', value: 0.5 },
  { id: 'brightness', label: 'Brightness', value: 0.5 },
  { id: 'contrast', label: 'Contrast', value: 0.5 },
  { id: 'vignette', label: 'Vignette', value: 0 },
  { id: 'grain', label: 'Grain', value: 0 },
];

// Growth control → life-cycle loops per second of scene time (0 holds the stage)
export const growRate = g => g < 0.02 ? 0 : 1 / (20 * Math.pow(30, 1 - g));

// all params for a scene: standard defaults < engine extras < scene presets
export function defaultsFor(engine, scene) {
  const p = {};
  for (const c of CONTROLS) p[c.id] = c.value;
  for (const k of ['x1', 'x2', 'x3', 'x4']) p[k] = 0.5;
  for (const x of engine.params || []) p[x.id] = x.value ?? 0.5;
  for (const c of LOOK) p[c.id] = c.value;
  Object.assign(p, scene.params || {});
  return p;
}

export async function loadAll(only) {
  const files = only ? ENGINE_FILES.filter(f => only.includes(f)) : ENGINE_FILES;
  const mods = await Promise.all(files.map(f => import(`./engines/${f}.js`).then(m => m, err => { console.error(`engine ${f}:`, err); return null; })));
  const engines = [], scenes = [];
  mods.forEach(m => {
    if (!m) return;
    const e = m.default; engines.push(e);
    for (const s of m.scenes || []) scenes.push({ ...s, engine: e, tags: s.tags || [] });
  });
  return { engines, scenes };
}
