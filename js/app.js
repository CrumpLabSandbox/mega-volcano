// Mega-Volcano host: gallery, viewer, controls, screensaver shuffle, the island life cycle, Mega-Clouds combos,
// recording, Invisible Hands, and the embed API.
import { loadAll, defaultsFor, CONTROLS, LOOK, growRate } from './registry.js';
import { createOutput, MODES } from './post.js';
import { life, STAGES } from './life.js';
import { loadClouds, CLOUDS_SITE } from './clouds.js';

const $ = s => document.querySelector(s);
const clamp = (v, lo = 0, hi = 1) => v < lo ? lo : v > hi ? hi : v;
const query = new URLSearchParams(location.search);
const EMBED = query.get('ui') === '0';
const EXTRA = ['x1', 'x2', 'x3', 'x4'];
const ALL_IDS = [...CONTROLS.map(c => c.id), ...EXTRA, ...LOOK.map(c => c.id)];
// Speed: 0 freezes, 0.5 is real time, 1 is 16×
const speedFactor = s => s < 0.02 ? 0 : Math.pow(2, (s - 0.5) * 8);

let scenes = [], engines = [];
let cur = null;           // current slot { scene, engine, canvas, ctx, inst, t, life }
let old = null;           // outgoing slot during a crossfade
let fadeT = 1, fadeDur = 1.5;
let params = {};          // live control values for the current scene
let paused = false, view = 'gallery';
let output;
let quality = 'auto', autoScale = 0.75;
let shuffleSec = 0, shuffleAt = 0, filterTag = 'all', searchText = '';
const pointer = { x: 0.5, y: 0.5, down: false, moved: false, dragX: 0, dragY: 0, clicks: [] };
let recorder = null, hands = null, lastMeasure = { luma: 0, white: 0, lava: 0 };
let shownStage = -1, captions = !EMBED && query.get('captions') !== '0';

// Cloud combo: a Mega-Clouds scene layered with the volcano (see post.js for the modes)
const combo = {
  lib: null,              // Mega-Clouds { scenes, engines, defaultsFor } once loaded
  want: '',               // '' = off, 'random', or a cloud scene id
  cur: null, old: null, mix: 1,
  mode: 'auto',           // 'auto' or one of MODES
  amount: 0.5,            // strength of the clouds in front (mist / over / screen)
  cover: null, size: null,// cloud Coverage and Size overrides (null = the cloud scene's own)
  link: true,             // clouds follow the volcano's Light, Wind and Speed
  shuffle: 'both',        // what the screensaver changes: both | volcano | clouds
};
const comboOn = () => !!(combo.want && combo.cur);
const comboMode = (slot = cur) => combo.mode !== 'auto' ? combo.mode : slot?.engine.sky === false ? 'over' : 'sky';

// ---------------------------------------------------------------- slots
function makeSlot(scene, cloud = false) {
  const engine = scene.engine;
  const canvas = document.createElement('canvas');
  // volcano layers keep an alpha channel so their sky can be transparent in a combo
  const ctx = engine.kind === 'gl'
    ? canvas.getContext('webgl2', { alpha: !cloud, antialias: false, preserveDrawingBuffer: false, premultipliedAlpha: false })
    : canvas.getContext('2d', { alpha: !cloud });
  if (!ctx) throw new Error('Could not create a ' + engine.kind + ' context');
  const slot = { scene, engine, cloud, canvas, ctx, inst: null, t: 20 + Math.random() * 80, nearest: !!engine.nearest, life: 0 };
  sizeSlot(slot);
  slot.inst = engine.create(ctx, scene.opts || {});
  return slot;
}
function disposeSlot(s) {
  if (!s) return;
  try { s.inst?.dispose?.(); } catch (e) { console.warn(e); }
  if (s.engine.kind === 'gl') s.ctx.getExtension('WEBGL_lose_context')?.loseContext();
  s.canvas.width = s.canvas.height = 1;
}
// the gallery backdrop is blurred, so it renders small; cloud layers are soft, so they render a little smaller
function renderScale() { return view === 'gallery' ? 0.3 : quality === 'auto' ? autoScale : +quality; }
function sizeSlot(s) {
  const W = output.canvas.width, H = output.canvas.height;
  const k = renderScale() * (s.scene.res ?? s.engine.res ?? 1) * (s.cloud ? 0.8 : 1);
  const w = Math.max(16, Math.round(W * k)), h = Math.max(9, Math.round(H * k));
  if (s.canvas.width !== w || s.canvas.height !== h) {
    s.canvas.width = w; s.canvas.height = h;
    s.inst?.resize?.(w, h);
  }
}
function sizeOutput() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr);
  const cap = 1920 * 1200; if (w * h > cap) { const k = Math.sqrt(cap / (w * h)); w = Math.round(w * k); h = Math.round(h * k); }
  if (output.canvas.width !== w || output.canvas.height !== h) { output.canvas.width = w; output.canvas.height = h; }
  for (const s of [cur, old, combo.cur, combo.old]) if (s) sizeSlot(s);
}

// ---------------------------------------------------------------- scene switching
function setScene(scene, { fade = true, keepParams = false } = {}) {
  if (!scene) return;
  let next;
  try { next = makeSlot(scene); }
  catch (e) { console.error(e); toast('Could not start ' + scene.name + ': ' + e.message); return; }
  if (old) disposeSlot(old);
  if (cur && fade && fadeDur > 0) { old = cur; fadeT = 0; } else { disposeSlot(cur); old = null; fadeT = 1; }
  cur = next;
  if (!keepParams) params = defaultsFor(scene.engine, scene);
  buildPanel();
  $('#s-name').textContent = scene.name;
  $('#s-engine').textContent = `${scene.engine.name} · ${scenes.indexOf(scene) + 1}/${scenes.length}`;
  $('#s-desc').textContent = scene.desc || '';
  document.title = scene.name + ' · Mega-Volcano';
  pointer.dragX = pointer.dragY = 0;
  shuffleAt = performance.now() / 1000 + shuffleSec;
  shownStage = -1;
  hands?.describe();
  writeURL();
}
function pool() {
  const list = filtered();
  return list.length ? list : scenes;
}
function step(dir) {
  const list = pool(); const i = list.indexOf(cur?.scene);
  setScene(list[(i + dir + list.length) % list.length]);
}
function randomScene() {
  const list = pool().filter(s => s !== cur?.scene);
  setScene(list[Math.floor(Math.random() * list.length)] || scenes[0]);
}

// ---------------------------------------------------------------- cloud combos
// want: '' (off), 'random' or a Mega-Clouds scene id
async function setClouds(want, { fade = true } = {}) {
  combo.want = want || '';
  if (!combo.want) {
    disposeSlot(combo.cur); disposeSlot(combo.old); combo.cur = combo.old = null; combo.mix = 1;
    syncCloudUI(); writeURL(); return;
  }
  if (!combo.lib) {
    combo.lib = await loadClouds();
    if (!combo.lib) { combo.want = ''; toast('Mega-Clouds could not be loaded'); syncCloudUI(); return; }
    fillCloudLists();
  }
  const list = combo.lib.scenes;
  const scene = combo.want === 'random'
    ? list.filter(s => s !== combo.cur?.scene)[Math.floor(Math.random() * (list.length - 1))]
    : list.find(s => s.id === combo.want);
  if (!scene) { combo.want = ''; syncCloudUI(); return; }
  let next;
  try { next = makeSlot(scene, true); }
  catch (e) { console.error(e); toast('Could not start clouds ' + scene.name + ': ' + e.message); return; }
  if (combo.old) disposeSlot(combo.old);
  if (combo.cur && fade && fadeDur > 0) { combo.old = combo.cur; combo.mix = 0; } else { disposeSlot(combo.cur); combo.old = null; combo.mix = 1; }
  combo.cur = next;
  next.params = combo.lib.defaultsFor(scene.engine, scene);
  syncCloudUI(); writeURL();
}
function cloudParams(s) {
  const p = s.params;
  if (combo.cover != null) p.coverage = combo.cover;
  if (combo.size != null) p.scale = combo.size;
  if (combo.link) { p.light = params.light; p.wind = params.wind; p.speed = params.speed; }
  return p;
}
function fillCloudLists() {
  for (const sel of [$('#c-clouds'), $('#g-clouds')]) {
    const keep = sel.value;
    sel.textContent = '';
    const add = (v, t, parent = sel) => { const o = document.createElement('option'); o.value = v; o.textContent = t; parent.append(o); };
    add('', 'No clouds'); add('random', 'Random clouds');
    if (combo.lib) {
      const groups = {};
      for (const s of combo.lib.scenes) (groups[s.engine.name] ||= []).push(s);
      for (const [name, list] of Object.entries(groups)) {
        const g = document.createElement('optgroup'); g.label = name;
        for (const s of list) add(s.id, s.name, g);
        sel.append(g);
      }
    }
    sel.value = keep;
  }
}
function syncCloudUI() {
  const v = combo.want === 'random' ? 'random' : combo.want;
  for (const sel of [$('#c-clouds'), $('#g-clouds')]) if (sel.value !== v) sel.value = v;
  $('#cloud-extra').hidden = !combo.want;
  $('#c-cmode').value = combo.mode;
  const lab = $('#s-clouds');
  lab.textContent = comboOn() ? ' + ' + combo.cur.scene.name : '';
  $('#b-clouds').classList.toggle('lit', !!combo.want);
  for (const [id, v] of [['camount', combo.amount], ['ccover', combo.cover ?? combo.cur?.params?.coverage ?? 0.5], ['csize', combo.size ?? combo.cur?.params?.scale ?? 0.5]]) {
    const el = $('#c-' + id); if (el) { el.value = v; el.nextSibling.textContent = Math.round(v * 100); }
  }
  $('#c-clink').checked = combo.link;
  $('#c-cshuffle').value = combo.shuffle;
}

// ---------------------------------------------------------------- render loop
let last = performance.now(), frameMs = 16, slowFor = 0, fastFor = 0, fpsShown = 0, frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dtReal = Math.min(0.1, (now - last) / 1000); last = now;
  if (!cur) return;
  const t0 = performance.now();
  const sdt = paused ? 0 : dtReal * speedFactor(params.speed);
  const on = comboOn();
  renderSlot(cur, sdt, now / 1000);
  if (old) {
    fadeT += dtReal / fadeDur;
    if (fadeT >= 1) { disposeSlot(old); old = null; fadeT = 1; }
    else renderSlot(old, sdt, now / 1000, true);
  }
  if (on) {
    renderCloud(combo.cur, sdt, now / 1000);
    if (combo.old) {
      combo.mix += dtReal / Math.max(fadeDur, 0.5);
      if (combo.mix >= 1) { disposeSlot(combo.old); combo.old = null; combo.mix = 1; }
      else renderCloud(combo.old, sdt, now / 1000, true);
    }
  }
  pointer.clicks.length = 0;
  output.draw(cur, old, fadeT, params, now / 1000,
    on ? { a: combo.cur, b: combo.old, mix: combo.mix, mode: comboMode(), amount: combo.amount } : null);
  // adaptive quality: keep the frame time under ~30 ms
  frameMs = frameMs * 0.95 + (performance.now() - t0 + (dtReal * 1000 > 40 ? dtReal * 1000 - 16 : 0)) * 0.05;
  if (quality === 'auto' && view === 'viewer' && !old && !combo.old) {
    if (frameMs > 30) { if (++slowFor > 45) { autoScale = Math.max(0.3, autoScale * 0.85); slowFor = 0; sizeOutput(); } } else slowFor = 0;
    if (frameMs < 10) { if (++fastFor > 240 && autoScale < 1) { autoScale = Math.min(1, autoScale * 1.12); fastFor = 0; sizeOutput(); } } else fastFor = 0;
  }
  if (++frames % 30 === 0) {
    const fps = Math.round(1000 / Math.max(1, (now - fpsShown) / 30)); fpsShown = now;
    if (view === 'viewer' && !$('#panel').hidden) $('#fps').textContent = `${fps} fps · ${cur.canvas.width}×${cur.canvas.height} render → ${output.canvas.width}×${output.canvas.height}`;
  }
  if (hands && frames % 12 === 0) lastMeasure = output.measure();
  if (frames % 10 === 0) showStage();
  if (shuffleSec > 0 && view === 'viewer' && !paused && now / 1000 > shuffleAt) shuffleStep();
}
function shuffleStep() {
  const what = comboOn() ? combo.shuffle : 'volcano';
  if (what !== 'volcano') setClouds('random');
  if (what !== 'clouds') randomScene(); else shuffleAt = performance.now() / 1000 + shuffleSec;
}
// the island's life: the Stage control plus however far Growth has carried it since the scene started
function stageOf(s, p) {
  const x = p.stage + s.life;
  return { stage: x - Math.floor(x), epoch: Math.floor(x) };
}
function renderSlot(s, sdt, clock, frozenPointer) {
  sizeSlot(s);
  s.t += sdt;
  const p = s === cur ? params : (s.params ||= defaultsFor(s.engine, s.scene));
  s.life += sdt * growRate(p.grow);
  const { stage, epoch } = stageOf(s, p);
  const L = life(stage);
  const transparentSky = comboOn() && ['sky', 'mist'].includes(comboMode(s)) && s.engine.sky !== false;
  try {
    s.inst.render({ ctx: s.ctx, w: s.canvas.width, h: s.canvas.height, t: s.t, dt: sdt, clock, p, stage, epoch, life: L,
      combo: transparentSky, pointer: frozenPointer ? { ...pointer, clicks: [] } : pointer, opts: s.scene.opts || {} });
  } catch (e) {
    if (!s.failed) { console.error(e); toast(s.scene.name + ': ' + e.message); s.failed = true; }
  }
}
function renderCloud(s, sdt, clock, frozen) {
  sizeSlot(s);
  s.t += sdt;
  try {
    s.inst.render({ ctx: s.ctx, w: s.canvas.width, h: s.canvas.height, t: s.t, dt: sdt, clock, p: cloudParams(s),
      pointer: frozen ? { ...pointer, clicks: [] } : { ...pointer, clicks: [] }, opts: s.scene.opts || {} });
  } catch (e) {
    if (!s.failed) { console.error(e); toast('Clouds ' + s.scene.name + ': ' + e.message); s.failed = true; }
  }
}
function currentLife() { return cur ? life(stageOf(cur, params).stage) : life(params.stage ?? 0); }
function showStage() {
  if (!cur) return;
  const L = currentLife();
  const el = $('#stage');
  $('#stage-bar').style.left = (L.stage * 100).toFixed(1) + '%';
  el.hidden = !captions || view !== 'viewer' || cur.engine.captions === false;
  if (L.index === shownStage) return;
  shownStage = L.index;
  $('#stage-name').textContent = `${L.index + 1}/${STAGES.length} · ${L.name}`;
  $('#stage-text').textContent = L.text;
}

// ---------------------------------------------------------------- controls panel
function slider(host, id, label, tip, get = () => params[id], set = v => { params[id] = v; }) {
  const row = document.createElement('div'); row.className = 'row';
  const lab = document.createElement('label'); lab.textContent = label; lab.htmlFor = 'c-' + id; if (tip) lab.title = tip;
  const inp = document.createElement('input'); inp.type = 'range'; inp.min = 0; inp.max = 1; inp.step = 0.001; inp.id = 'c-' + id; inp.value = get();
  const out = document.createElement('output'); out.textContent = Math.round(get() * 100);
  inp.oninput = () => { set(+inp.value); out.textContent = Math.round(+inp.value * 100); hands?.recenter(id); writeURLSoon(); };
  inp.ondblclick = () => { if (ALL_IDS.includes(id)) { params[id] = defaultsFor(cur.engine, cur.scene)[id]; syncSliders(); writeURLSoon(); } };
  if (hands) lab.append(hands.tag(id));
  row.append(lab, inp, out); host.append(row);
  return row;
}
function buildPanel() {
  const main = $('#ctl-main'), extra = $('#ctl-extra'), look = $('#ctl-look');
  main.textContent = extra.textContent = look.textContent = '';
  for (const c of CONTROLS) slider(main, c.id, c.label, c.tip);
  const ex = cur.engine.params || [];
  for (const x of ex) slider(extra, x.id, x.label, x.tip);
  $('#h-extra').hidden = !ex.length;
  for (const c of LOOK) slider(look, c.id, c.label);
}
function buildCloudPanel() {
  const host = $('#cloud-sliders'); host.textContent = '';
  slider(host, 'camount', 'In front', 'How strongly the clouds drift in front of the island (Mist, Over and Screen modes)', () => combo.amount, v => { combo.amount = v; });
  slider(host, 'ccover', 'Cloud cover', 'Coverage of the cloud scene', () => combo.cover ?? 0.5, v => { combo.cover = v; });
  slider(host, 'csize', 'Cloud size', 'Size of the clouds', () => combo.size ?? 0.5, v => { combo.size = v; });
}
function syncSliders() {
  for (const id of ALL_IDS) { const el = $('#c-' + id); if (el) { el.value = params[id]; el.nextSibling.textContent = Math.round(params[id] * 100); } }
}
function labelFor(id) {
  const c = CONTROLS.find(c => c.id === id) || LOOK.find(c => c.id === id) || (cur?.engine.params || []).find(c => c.id === id);
  return c ? c.label : null;
}

// ---------------------------------------------------------------- URL state
function writeURL() {
  if (view !== 'viewer' || !cur) return;
  const q = new URLSearchParams();
  q.set('scene', cur.scene.id);
  const def = defaultsFor(cur.engine, cur.scene);
  for (const id of ALL_IDS) if (params[id] !== undefined && Math.abs(params[id] - def[id]) > 0.004) q.set(id, params[id].toFixed(3));
  if (combo.want) {
    q.set('clouds', combo.want);
    if (combo.mode !== 'auto') q.set('cmode', combo.mode);
    if (Math.abs(combo.amount - 0.5) > 0.004) q.set('camount', combo.amount.toFixed(3));
    if (combo.cover != null) q.set('ccover', combo.cover.toFixed(3));
    if (combo.size != null) q.set('csize', combo.size.toFixed(3));
    if (!combo.link) q.set('clink', '0');
  }
  if (EMBED) q.set('ui', '0');
  if (!captions && !EMBED) q.set('captions', '0');
  if (shuffleSec) q.set('shuffle', shuffleSec);
  if (hands?.room) q.set('room', hands.room);
  history.replaceState(null, '', '?' + q.toString().replace(/%2C/g, ','));
}
let urlTimer = 0;
function writeURLSoon() { clearTimeout(urlTimer); urlTimer = setTimeout(writeURL, 300); }

// ---------------------------------------------------------------- views
function showViewer(scene) {
  view = 'viewer';
  document.body.classList.remove('gallery-mode');
  $('#gallery').hidden = true; $('#hud').hidden = EMBED;
  if (scene && scene !== cur?.scene) setScene(scene, { fade: false });
  shownStage = -1;
  writeURL(); wake();
}
function showGallery() {
  view = 'gallery';
  document.body.classList.add('gallery-mode');
  $('#gallery').hidden = false; $('#hud').hidden = true; $('#stage').hidden = true;
  history.replaceState(null, '', location.pathname);
  document.title = 'Mega-Volcano';
  thumbs.kick();
}

// gallery grid + filters
function filtered() {
  const q = searchText.trim().toLowerCase();
  return scenes.filter(s => (filterTag === 'all' || s.tags.includes(filterTag)) &&
    (!q || (s.name + ' ' + s.desc + ' ' + s.tags.join(' ') + ' ' + s.engine.name).toLowerCase().includes(q)));
}
function buildGallery() {
  $('#count').textContent = scenes.length;
  const counts = {};
  for (const s of scenes) for (const t of s.tags) counts[t] = (counts[t] || 0) + 1;
  const tags = Object.keys(counts).filter(t => counts[t] >= 2).sort((a, b) => counts[b] - counts[a]);
  const chips = $('#chips'); chips.textContent = '';
  for (const t of ['all', ...tags]) {
    const b = document.createElement('button'); b.className = 'chip'; b.setAttribute('aria-pressed', t === filterTag);
    b.innerHTML = `${t}<small>${t === 'all' ? scenes.length : counts[t]}</small>`;
    b.onclick = () => { filterTag = t; chips.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c === b)); drawGrid(); };
    chips.append(b);
  }
  drawGrid();
}
function drawGrid() {
  const grid = $('#grid'); grid.textContent = '';
  thumbs.reset();
  for (const s of filtered()) {
    const card = document.createElement('button'); card.className = 'card'; card.title = s.desc || s.name;
    const c = document.createElement('canvas'); c.width = 384; c.height = 216;
    const meta = document.createElement('div'); meta.className = 'meta';
    meta.innerHTML = `<strong></strong><span></span>`;
    meta.firstChild.textContent = s.name; meta.lastChild.textContent = s.engine.name;
    const desc = document.createElement('div'); desc.className = 'desc'; desc.textContent = s.desc || '';
    card.append(c, desc, meta);
    card.onclick = () => showViewer(s);
    grid.append(card);
    thumbs.watch(c, s);
  }
}

// Thumbnails: render one frame of each visible card on two shared canvases (one WebGL2, one 2D), one per idle slice.
const thumbs = (() => {
  const W = 384, H = 216, cache = new Map();
  let queue = [], busy = false, io = null, glc = null, c2 = null;
  function ctxFor(kind) {
    if (kind === 'gl') {
      if (!glc || glc.ctx.isContextLost()) { const c = document.createElement('canvas'); c.width = W; c.height = H; glc = { c, ctx: c.getContext('webgl2', { preserveDrawingBuffer: true, alpha: false }) }; }
      return glc;
    }
    if (!c2) { const c = document.createElement('canvas'); c.width = W; c.height = H; c2 = { c, ctx: c.getContext('2d', { alpha: false }) }; }
    return c2;
  }
  function paint(target, s) {
    const g = target.getContext('2d');
    if (cache.has(s.id)) { g.drawImage(cache.get(s.id), 0, 0); return; }
    const { c, ctx } = ctxFor(s.engine.kind);
    let inst;
    try {
      inst = s.engine.create(ctx, s.opts || {});
      const p = defaultsFor(s.engine, s);
      const ptr = { x: 0.5, y: 0.5, down: false, moved: false, dragX: 0, dragY: 0, clicks: [] };
      const L = life(p.stage);
      for (let i = 0; i < (s.engine.kind === 'gl' ? 1 : 3); i++) inst.render({ ctx, w: W, h: H, t: 30 + i / 30, dt: 1 / 30, clock: 30 + i / 30, p, stage: p.stage, epoch: 0, life: L, combo: false, pointer: ptr, opts: s.opts || {} });
      const keep = document.createElement('canvas'); keep.width = W; keep.height = H; keep.getContext('2d').drawImage(c, 0, 0);
      cache.set(s.id, keep); g.drawImage(keep, 0, 0);
    } catch (e) { console.warn('thumb', s.id, e); g.fillStyle = '#2a1a14'; g.fillRect(0, 0, W, H); }
    try { inst?.dispose?.(); } catch {}
  }
  function pump() {
    if (busy || !queue.length) return;
    busy = true;
    const go = () => {
      const t0 = performance.now();
      while (queue.length && performance.now() - t0 < 30) { const { el, s } = queue.shift(); if (el.isConnected) paint(el, s); }
      busy = false; if (queue.length) setTimeout(pump, 0);
    };
    (window.requestIdleCallback || setTimeout)(go, { timeout: 100 });
  }
  return {
    reset() { queue = []; io?.disconnect(); io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); queue.push(e.target._q); } pump(); }, { rootMargin: '300px' }); },
    watch(el, s) { el._q = { el, s }; io.observe(el); },
    kick: pump
  };
})();

// ---------------------------------------------------------------- HUD behaviour
let idleTimer = 0;
function wake() {
  $('#hud').classList.remove('idle'); document.body.classList.remove('hide-cursor');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (view === 'viewer' && $('#panel').hidden) { $('#hud').classList.add('idle'); document.body.classList.add('hide-cursor'); } }, 3000);
}
let toastTimer = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2400); }

function togglePause() { paused = !paused; $('#b-pause').textContent = paused ? '▶' : '❚❚'; toast(paused ? 'Paused' : 'Playing'); }
function toggleFull() { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.(); }
function toggleCaptions() { captions = !captions; shownStage = -1; showStage(); toast(captions ? 'Stage captions on' : 'Stage captions off'); writeURL(); }
function snapshot() {
  output.canvas.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `${cur.scene.id}.png`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); });
  toast('Saved PNG');
}
function toggleRecord() {
  const b = $('#b-rec');
  if (recorder) { recorder.stop(); return; }
  const stream = output.canvas.captureStream(30);
  const type = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t));
  recorder = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 12e6 });
  const chunks = [];
  recorder.ondataavailable = e => chunks.push(e.data);
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: recorder.mimeType }); recorder = null; b.classList.remove('on');
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${cur.scene.id}.${type.includes('mp4') ? 'mp4' : 'webm'}`; a.click();
    toast('Recording saved');
  };
  recorder.start(); b.classList.add('on'); toast('Recording… press again to stop');
}

function bindUI() {
  $('#b-gallery').onclick = showGallery;
  $('#b-prev').onclick = () => step(-1);
  $('#b-next').onclick = () => step(1);
  $('#b-random').onclick = randomScene;
  $('#b-pause').onclick = togglePause;
  $('#b-full').onclick = toggleFull;
  $('#b-snap').onclick = snapshot;
  $('#b-rec').onclick = toggleRecord;
  $('#b-cap').onclick = toggleCaptions;
  $('#b-panel').onclick = () => { $('#panel').hidden = !$('#panel').hidden; wake(); };
  $('#b-clouds').onclick = () => { $('#panel').hidden = false; $('#cloud-sec').scrollIntoView({ block: 'start' }); if (!combo.want) setClouds('random'); };
  $('#b-link').onclick = () => { writeURL(); navigator.clipboard?.writeText(location.href).then(() => toast('Link copied'), () => toast(location.href)); };
  $('#b-reset').onclick = () => { params = defaultsFor(cur.engine, cur.scene); cur.life = 0; syncSliders(); pointer.dragX = pointer.dragY = 0; writeURL(); };
  $('#b-dice').onclick = () => { for (const c of [...CONTROLS, ...(cur.engine.params || [])]) if (c.id !== 'speed' && c.id !== 'grow') params[c.id] = clamp(params[c.id] + (Math.random() - 0.5) * 0.6); params.hue = Math.random() < 0.3 ? Math.random() : 0; syncSliders(); writeURL(); };
  $('#b-shuffle').onchange = e => setShuffle(+e.target.value);
  $('#quality').onchange = e => { quality = e.target.value; if (quality === 'auto') autoScale = 0.75; };
  $('#fade').onchange = e => { fadeDur = +e.target.value; };
  $('#g-shuffle').onclick = () => { setShuffle(shuffleSec || 30); showViewer(); randomScene(); };
  $('#g-combo').onclick = () => { combo.shuffle = 'both'; setClouds('random', { fade: false }); setShuffle(shuffleSec || 30); showViewer(); randomScene(); };
  $('#g-clouds').onchange = e => setClouds(e.target.value, { fade: false });
  $('#c-clouds').onchange = e => setClouds(e.target.value);
  $('#c-cmode').onchange = e => { combo.mode = e.target.value; writeURL(); };
  $('#c-clink').onchange = e => { combo.link = e.target.checked; writeURL(); };
  $('#c-cshuffle').onchange = e => { combo.shuffle = e.target.value; };
  $('#c-cnext').onclick = () => setClouds(combo.want === 'random' ? 'random' : nextCloudId(1));
  $('#search').oninput = e => { searchText = e.target.value; drawGrid(); };

  for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel']) addEventListener(ev, () => { if (view === 'viewer') wake(); }, { passive: true });
  const cv = output.canvas;
  let dragging = false, lx = 0, ly = 0, downAt = 0, moved = 0;
  cv.addEventListener('pointerdown', e => { dragging = true; lx = e.clientX; ly = e.clientY; downAt = performance.now(); moved = 0; pointer.down = true; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    pointer.x = e.clientX / innerWidth; pointer.y = e.clientY / innerHeight; pointer.moved = true;
    if (dragging) { const dx = (e.clientX - lx) / innerHeight, dy = (e.clientY - ly) / innerHeight; pointer.dragX += dx; pointer.dragY += dy; moved += Math.abs(dx) + Math.abs(dy); lx = e.clientX; ly = e.clientY; }
  });
  const up = () => { if (dragging && moved < 0.01 && performance.now() - downAt < 400) pointer.clicks.push({ x: pointer.x, y: pointer.y }); dragging = false; pointer.down = false; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('dblclick', toggleFull);

  addEventListener('keydown', e => {
    if (e.target.matches('input[type=search], input[type=text], select')) return;
    if (view !== 'viewer') return;
    const k = e.key.toLowerCase();
    if (k === 'arrowright') step(1); else if (k === 'arrowleft') step(-1);
    else if (k === 'arrowup') setClouds(combo.want ? nextCloudId(-1) : 'random');
    else if (k === 'arrowdown') setClouds(combo.want ? nextCloudId(1) : 'random');
    else if (k === ' ') { e.preventDefault(); togglePause(); }
    else if (k === 'f') toggleFull();
    else if (k === 'h') { $('#hud').hidden = !$('#hud').hidden; }
    else if (k === 'c') $('#b-panel').click();
    else if (k === 'k') setClouds(combo.want ? '' : 'random');
    else if (k === 'i') toggleCaptions();
    else if (k === 'r') randomScene();
    else if (k === 's') snapshot();
    else if (k === 'v') toggleRecord();
    else if (k === 'g' || k === 'escape') { if (k === 'escape' && document.fullscreenElement) return; showGallery(); }
  });
  addEventListener('resize', sizeOutput);
}
function nextCloudId(dir) {
  const list = combo.lib?.scenes || [];
  if (!list.length) return 'random';
  const i = list.indexOf(combo.cur?.scene);
  return list[(i + dir + list.length) % list.length].id;
}
function setShuffle(sec) {
  shuffleSec = sec; $('#b-shuffle').value = String(sec);
  shuffleAt = performance.now() / 1000 + sec;
  if (sec) toast(`Screensaver: new scene every ${sec < 60 ? sec + ' s' : sec / 60 + ' min'}`);
  writeURL();
}

// ---------------------------------------------------------------- Invisible Hands
function setupHands() {
  if (!window.InvisibleHands) return;
  const syncSlider = id => { const el = $('#c-' + id); if (el) { el.value = params[id]; el.nextSibling.textContent = Math.round(params[id] * 100); } };
  const ctl = id => ({ id, get label() { return labelFor(id) || id; }, get: () => params[id] ?? 0, set: v => { params[id] = v; syncSlider(id); } });
  const sceneCtl = {
    id: 'scene', label: 'Scene',
    get: () => scenes.length > 1 ? Math.max(0, scenes.indexOf(cur?.scene)) / (scenes.length - 1) : 0,
    set: v => { const s = scenes[Math.round(clamp(v) * (scenes.length - 1))]; if (s && s !== cur?.scene) setScene(s); }
  };
  // 0 = no clouds, then every Mega-Clouds scene in order
  const cloudCtl = {
    id: 'clouds', label: 'Clouds (Mega-Clouds scene)',
    get: () => { const l = combo.lib?.scenes || []; return comboOn() && l.length ? (l.indexOf(combo.cur.scene) + 1) / l.length : 0; },
    set: async v => {
      if (!combo.lib) combo.lib = await loadClouds();
      const l = combo.lib?.scenes || []; const i = Math.round(clamp(v) * l.length);
      const id = i === 0 ? '' : l[i - 1]?.id;
      if (id !== (comboOn() ? combo.cur.scene.id : '')) setClouds(id);
    }
  };
  const comboCtl = (id, label, key) => ({ id, label, get: () => combo[key] ?? 0.5, set: v => { combo[key] = v; syncCloudUI(); } });
  let nextHeld = 0, cnextHeld = 0;
  hands = window.InvisibleHands.create({
    app: 'mega-volcano', name: 'Mega-Volcano',
    params: [
      ...CONTROLS.map(c => ctl(c.id)),
      ...EXTRA.map(ctl),
      ...LOOK.map(c => ctl(c.id)),
      sceneCtl,
      { id: 'next', label: 'Next scene', kind: 'trig', get: () => nextHeld, set: v => { if (v > 0.5 && nextHeld <= 0.5) step(1); nextHeld = v; } },
      { id: 'pause', label: 'Pause', kind: 'toggle', get: () => paused ? 1 : 0, set: v => { if ((v > 0.5) !== paused) togglePause(); } },
      cloudCtl,
      { id: 'cloudnext', label: 'Next clouds', kind: 'trig', get: () => cnextHeld, set: v => { if (v > 0.5 && cnextHeld <= 0.5) setClouds('random'); cnextHeld = v; } },
      comboCtl('camount', 'Clouds in front', 'amount'),
      comboCtl('ccover', 'Cloud cover', 'cover'),
      comboCtl('csize', 'Cloud size', 'size'),
    ],
    outs: [
      { id: 'brightness', label: 'Brightness', get: () => lastMeasure.luma },
      { id: 'glow', label: 'Lava glow (share of hot pixels)', get: () => Math.min(1, lastMeasure.lava * 4) },
      { id: 'lifestage', label: 'Island life stage', get: () => currentLife().stage },
      { id: 'height', label: 'Island height above sea', get: () => clamp(currentLife().height * 0.5 + 0.5) },
      { id: 'eruption', label: 'Eruption strength', get: () => clamp(currentLife().erupt * (params.activity ?? 0.5) * 2) },
      { id: 'scene', label: 'Scene', get: () => sceneCtl.get() },
    ]
  });
  hands.on('status', () => writeURLSoon());
  $('#hands-slot').append(hands.badge({ label: 'Hands' }));
}

// ---------------------------------------------------------------- embed API (MEGA·CV and other hosts)
// Same-origin pages (e.g. crumplabsandbox.github.io/mega-cv) can iframe this page with ?ui=0 and read
// iframe.contentWindow.megaVolcano.canvas directly; any page can drive it with postMessage:
//   frame.postMessage({ megaVolcano: { scene: 'island3d-shield', set: { stage: 0.2 }, clouds: 'random' } }, '*')
function exposeAPI() {
  const api = {
    get canvas() { return output.canvas; },
    get scenes() { return scenes.map(s => ({ id: s.id, name: s.name, engine: s.engine.id, tags: s.tags })); },
    get scene() { return cur?.scene.id; },
    get params() { return { ...params }; },
    get life() { return currentLife(); },
    get clouds() { return comboOn() ? combo.cur.scene.id : ''; },
    get cloudScenes() { return (combo.lib?.scenes || []).map(s => ({ id: s.id, name: s.name, engine: s.engine.id })); },
    loadClouds: async () => { combo.lib ||= await loadClouds(); if (combo.lib) fillCloudLists(); return !!combo.lib; },
    setScene(id) { const s = scenes.find(s => s.id === id) || scenes[+id]; if (s) { if (view !== 'viewer') showViewer(s); else setScene(s); } return !!s; },
    set(id, v) {
      if (ALL_IDS.includes(id)) { params[id] = clamp(+v); if (id === 'stage' && cur) cur.life = 0; syncSliders(); }
      else if (id === 'camount') combo.amount = clamp(+v); else if (id === 'ccover') combo.cover = clamp(+v); else if (id === 'csize') combo.size = clamp(+v);
    },
    setClouds: (id, mode) => { if (mode) combo.mode = MODES.includes(mode) ? mode : 'auto'; return setClouds(id); },
    next() { step(1); }, prev() { step(-1); }, random() { randomScene(); },
    pause(on = true) { if (paused !== on) togglePause(); },
    measure: () => lastMeasure
  };
  window.megaVolcano = api;
  addEventListener('message', e => {
    const m = e.data && e.data.megaVolcano; if (!m || typeof m !== 'object') return;
    if (m.scene) api.setScene(m.scene);
    if (m.set && typeof m.set === 'object') for (const [k, v] of Object.entries(m.set)) api.set(k, v);
    if ('clouds' in m) api.setClouds(String(m.clouds || ''), m.cloudMode);
    if (m.next) api.next(); if (m.prev) api.prev(); if (m.random) api.random();
    if ('pause' in m) api.pause(!!m.pause);
  });
}

// ---------------------------------------------------------------- boot
async function boot() {
  try { output = createOutput($('#out')); }
  catch (e) { $('#err').hidden = false; $('#err').textContent = 'Mega-Volcano needs WebGL2: ' + e.message; return; }
  sizeOutput();
  ({ scenes, engines } = await loadAll());
  if (!scenes.length) { $('#err').hidden = false; $('#err').textContent = 'No scenes loaded.'; return; }
  setupHands();
  bindUI();
  exposeAPI();
  buildGallery();
  buildCloudPanel();
  fillCloudLists();
  $('#clouds-site').href = CLOUDS_SITE;
  const want = query.get('scene');
  const first = scenes.find(s => s.id === want);
  // the gallery's backdrop is a live scene, blurred
  setScene(first || scenes.find(s => s.id === 'island3d-shield') || scenes[0], { fade: false });
  if (first) {
    for (const id of ALL_IDS) if (query.has(id)) params[id] = clamp(+query.get(id));
    syncSliders();
  }
  if (query.get('quality')) { quality = query.get('quality'); $('#quality').value = quality; }
  if (query.has('cmode')) combo.mode = MODES.includes(query.get('cmode')) ? query.get('cmode') : 'auto';
  if (query.has('camount')) combo.amount = clamp(+query.get('camount'));
  if (query.has('ccover')) combo.cover = clamp(+query.get('ccover'));
  if (query.has('csize')) combo.size = clamp(+query.get('csize'));
  if (query.get('clink') === '0') combo.link = false;
  const sh = +query.get('shuffle'); if (sh) setShuffle(sh);
  if (first || EMBED || sh) { showViewer(); if (sh && !first) randomScene(); } else showGallery();
  // load Mega-Clouds in the background so the cloud menus fill in; start a combo if the link asks for one
  loadClouds().then(lib => {
    combo.lib = lib;
    document.body.classList.toggle('no-clouds', !lib);
    fillCloudLists();
    if (lib && query.get('clouds')) setClouds(query.get('clouds'), { fade: false });
    else syncCloudUI();
  });
  requestAnimationFrame(frame);
}
boot();
