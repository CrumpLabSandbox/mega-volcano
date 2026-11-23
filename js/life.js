// The life of a hotspot volcanic island, shared by every engine so all views tell the same story.
// stage 0..1 runs from the first submarine eruption to a drowned atoll (see docs/SCIENCE.md).
// life(stage) returns smooth curves engines draw from; LIFE_GLSL is the same model for shaders.

export const STAGES = [
  { at: 0.00, id: 'seamount', name: 'Seamount',
    text: 'Magma from a hotspot erupts on the deep sea floor. The water pressure smothers explosions, so lava squeezes out as pillow lava and a seamount slowly grows.' },
  { at: 0.12, id: 'breach', name: 'Breaching the surface',
    text: 'In shallow water, sea water flashes to steam on contact with magma. Surtseyan blasts throw black jets of ash and steam, and a fragile cone of tephra rises above the waves.' },
  { at: 0.22, id: 'shield', name: 'Shield building',
    text: 'Sealed off from the sea, lava flows freely. Runny basalt piles up flow on flow into a broad shield volcano, and lava pouring into the ocean adds new land.' },
  { at: 0.50, id: 'caldera', name: 'Caldera and cinder cones',
    text: 'The magma supply wanes. The summit collapses into a caldera, gassier lava builds cinder cones, and eruptions become rarer.' },
  { at: 0.62, id: 'erosion', name: 'Erosion and life',
    text: 'The volcano falls quiet. Rain carves valleys, waves cut sea cliffs, seeds and birds arrive, and a fringing coral reef grows along the shore.' },
  { at: 0.80, id: 'sinking', name: 'Sinking',
    text: 'The plate carries the island away from the hotspot; the crust cools and sinks. The island shrinks while the reef keeps growing up, leaving a lagoon behind a barrier reef.' },
  { at: 0.92, id: 'atoll', name: 'Atoll',
    text: 'The volcano has sunk below the waves. Only the reef remains: a ring of sandy islets around a lagoon, as Darwin predicted in 1842.' },
];

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Summit height relative to sea level: -1 = deep sea floor, 0 = sea level, 1 = the tallest the shield gets.
export function lifeHeight(s) {
  return -1 + ss(0, 0.16, s) + 0.12 * ss(0.16, 0.22, s) + 0.88 * ss(0.22, 0.5, s) - 0.05 * ss(0.5, 0.62, s)
    - 0.4 * ss(0.62, 0.8, s) - 0.43 * ss(0.8, 0.9, s) - 0.17 * ss(0.9, 0.95, s) - 0.25 * ss(0.95, 1, s);
}

export function stageIndex(s) { let i = 0; while (i + 1 < STAGES.length && s >= STAGES[i + 1].at) i++; return i; }

export function life(stage) {
  const s = Math.min(1, Math.max(0, stage));
  const erupt = 0.3 + 0.2 * ss(0, 0.1, s) + 0.5 * ss(0.1, 0.14, s) - 0.1 * ss(0.14, 0.22, s) - 0.4 * ss(0.48, 0.52, s)
    - 0.15 * ss(0.52, 0.6, s) - 0.35 * ss(0.6, 0.64, s);
  const steam = ss(0.1, 0.14, s) * (1 - ss(0.2, 0.24, s));          // magma meets sea water (Surtseyan)
  const i = stageIndex(s);
  return {
    stage: s, index: i, id: STAGES[i].id, name: STAGES[i].name, text: STAGES[i].text,
    height: lifeHeight(s),                                         // -1..1
    erupt,                                                         // 0..1 eruptive output
    steam,                                                         // 0..1 phreatomagmatic (steam + ash jets)
    submarine: 1 - ss(0.13, 0.17, s),                              // vent still under water
    explosive: Math.min(1, steam + 0.6 * ss(0.48, 0.52, s) * (1 - ss(0.58, 0.64, s))),
    caldera: ss(0.46, 0.54, s) * (1 - 0.5 * ss(0.7, 0.85, s)),      // summit collapse depth 0..1
    erosion: ss(0.55, 0.85, s),                                    // valleys, cliffs
    veg: ss(0.3, 0.7, s) * (1 - 0.6 * ss(0.9, 0.97, s)),           // plants
    reef: ss(0.55, 0.75, s),                                       // coral reef development
    lagoon: ss(0.75, 0.95, s),                                     // reef pulled away from the shrinking shore
    age: s,
  };
}

// Same model in GLSL. Call `Life L = life(uStage);`.
export const LIFE_GLSL = `
struct Life { float h, erupt, steam, submarine, expl, caldera, erosion, veg, reef, lagoon; };
float lifeHeight(float s){
  return -1. + smoothstep(0.,.16,s) + .12*smoothstep(.16,.22,s) + .88*smoothstep(.22,.5,s) - .05*smoothstep(.5,.62,s)
    - .4*smoothstep(.62,.8,s) - .43*smoothstep(.8,.9,s) - .17*smoothstep(.9,.95,s) - .25*smoothstep(.95,1.,s);
}
Life life(float s){
  Life L;
  L.h = lifeHeight(s);
  L.erupt = .3 + .2*smoothstep(0.,.1,s) + .5*smoothstep(.1,.14,s) - .1*smoothstep(.14,.22,s) - .4*smoothstep(.48,.52,s)
    - .15*smoothstep(.52,.6,s) - .35*smoothstep(.6,.64,s);
  L.steam = smoothstep(.1,.14,s)*(1. - smoothstep(.2,.24,s));
  L.submarine = 1. - smoothstep(.13,.17,s);
  L.expl = min(1., L.steam + .6*smoothstep(.48,.52,s)*(1. - smoothstep(.58,.64,s)));
  L.caldera = smoothstep(.46,.54,s)*(1. - .5*smoothstep(.7,.85,s));
  L.erosion = smoothstep(.55,.85,s);
  L.veg = smoothstep(.3,.7,s)*(1. - .6*smoothstep(.9,.97,s));
  L.reef = smoothstep(.55,.75,s);
  L.lagoon = smoothstep(.75,.95,s);
  return L;
}
`;
