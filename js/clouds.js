// Bridge to Mega-Clouds: loads its engines straight from its own site so any cloud scene can run with any volcano.
// Both apps live on crumplabsandbox.github.io, so ../Mega-Clouds/ is the same origin. Locally, serve the folder that
// holds both clones (see README). ?clouds=<url> points somewhere else (it must send CORS headers for ES modules).

const query = new URLSearchParams(location.search);
export const CLOUDS_BASE = new URL(query.get('clouds-base') || '../Mega-Clouds/', location.href).href;
export const CLOUDS_SITE = 'https://crumplabsandbox.github.io/Mega-Clouds/';

let loading = null;
// → { scenes, engines, defaultsFor } or null when Mega-Clouds can't be reached
export function loadClouds() {
  loading ||= import(CLOUDS_BASE + 'js/registry.js').then(async reg => {
    const { scenes, engines } = await reg.loadAll();
    if (!scenes.length) return null;
    return { scenes, engines, defaultsFor: reg.defaultsFor };
  }).catch(err => { console.warn('Mega-Clouds not available:', err.message); return null; });
  return loading;
}
