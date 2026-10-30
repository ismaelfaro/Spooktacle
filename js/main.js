// Startup, animation loop, scene sequence and keyboard.

const stage = $('stage');
const params = new URLSearchParams(location.search);

// Global layer: an undistorted canvas covering the whole screen, for what crosses from zone to zone
const fx = document.createElement('canvas');
fx.id = 'fx';
const fctx = fx.getContext('2d');
// Fade to black between scenes (black = no light projected)
const fadeEl = document.createElement('div');
fadeEl.id = 'fade';

const App = { zones: [], mode: 'show', view: 'test', scene: 0, scare: -1, hasRef: false, refMix: 0.55, opacity: 1, fade: 0, fxUsed: false, fxScale: 1 };

const S = {
  t: 0, prevT: 0, T: 0, dt: 0, dur: 1, playing: true, active: true,
  zoneCount: 0, kinds: {}, focus: [0.5, 0.8], textZoneId: null, aspect: 16 / 9, screenZones: [],
  crossed(x) { return this.prevT < x && this.t >= x; },
  every(p, off = 0) { return this.t >= off && Math.floor((this.t - off) / p) !== Math.floor((this.prevT - off) / p); },
};

function setZones(list) {
  App.zones = sanitizeZones(list).map(createZone);
  refreshZones();
}

// Layer order, indices per type, size of each canvas and data used by the scenes
function refreshZones() {
  const byKind = indexZones(App.zones);
  stage.replaceChildren(...[...App.zones].sort((a, b) => LAYER[a.role] - LAYER[b.role]).map(z => z.canvas), fx, fadeEl);
  App.zones.forEach(z => layoutZone(z));
  resizeFx();
  const biggest = list => (list || []).reduce((a, b) => (!a || b.area > a.area ? b : a), null);
  S.zoneCount = App.zones.length;
  S.kinds = Object.fromEntries(Object.entries(byKind).map(([k, v]) => [k, v.length]));
  S.textZoneId = (biggest(byKind.wall) || biggest(App.zones))?.id;
  const door = biggest(byKind.door);
  S.focus = door ? [door.cx, door.cy] : [0.5, 0.8];
  S.aspect = innerWidth / innerHeight;
  updateScreenZones();
}

function updateScreenZones() {
  const W = innerWidth, H = innerHeight;
  S.screenZones = App.zones.map(z => {
    const pts = z.pts.map(([x, y]) => [x * W, y * H]);
    const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
    return { id: z.id, name: z.name, kind: z.kind, index: z.index, count: z.count, pts, cx: z.cx * W, cy: z.cy * H, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  });
  drawCover();
}

// Preview: windows are simulated as covered with white paper (as recommended in the setup)
function drawCover() {
  const c = $('cover'), W = innerWidth, H = innerHeight;
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(235,235,230,0.92)';
  for (const sz of S.screenZones) {
    if (sz.kind !== 'window') continue;
    ctx.beginPath();
    sz.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.fill();
  }
}

function resizeFx() {
  const W = innerWidth, H = innerHeight;
  App.fxScale = Math.min(devicePixelRatio || 1, 2, 3840 / W);
  fx.width = Math.round(W * App.fxScale);
  fx.height = Math.round(H * App.fxScale);
  fx.style.width = W + 'px';
  fx.style.height = H + 'px';
}

function goScene(i) {
  App.scene = (i + SCENES.length) % SCENES.length;
  S.t = S.prevT = 0;
  Sound.ambience(SCENES[App.scene].ambience ?? 0.5);
  Editor.syncScene();
}

function setMode(mode) {
  App.mode = mode;
  document.body.classList.toggle('edit', mode === 'edit');
  $('panel').hidden = mode !== 'edit';
  if (mode === 'edit') {
    document.body.classList.remove('nocursor');
    Editor.refreshPanel();
  } else requestWakeLock();
}

function scare() {
  if (App.scare >= 0) return;
  App.scare = 0;
  Sound.scream();
}

let toastTimer = 0;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 1600);
}

// Advances the scene clock and fires its events (sounds, etc.)
function step(dt) {
  S.dt = dt; S.T += dt; S.prevT = S.t;
  const animating = App.mode === 'show' || App.view === 'anim';
  const scaring = App.scare >= 0;
  if (scaring) {
    if (S.playing) App.scare += dt;
    if (App.scare > JUMPSCARE.duration) App.scare = -1;
  } else if (S.playing && animating) {
    S.t += dt;
    if (S.t >= SCENES[App.scene].duration) goScene(App.scene + 1);
  }
  const scene = SCENES[App.scene];
  S.dur = scene.duration;
  S.active = S.playing && animating && !scaring;
  scene.update?.(S);
  if (App.scare >= 0) JUMPSCARE.update?.(S, App.scare);
  Sound.tick(scene, S, S.active);
}

// A drawing error must not stop the show: it is logged once and execution continues
function safeDraw(key, owner, fn) {
  try { fn(); } catch (err) { if (!owner[key]) { console.error(err); owner[key] = true; } }
}

function render() {
  const scene = SCENES[App.scene], scaring = App.scare >= 0;
  const test = App.mode === 'edit' && App.view === 'test';

  const fade = test || scaring ? 0 : 1 - smooth(0, 1, S.t) * (1 - smooth(S.dur - 1, S.dur, S.t));
  if (Math.abs(fade - App.fade) > 0.002) fadeEl.style.opacity = App.fade = fade;
  const opacity = App.mode === 'edit' && App.hasRef ? App.refMix : 1;
  if (opacity !== App.opacity) stage.style.opacity = App.opacity = opacity;

  for (const z of App.zones) {
    const ctx = z.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, z.w, z.h);
    ctx.save();
    safeDraw('err', z.cache, () => {
      if (z.shape !== 'rect') { tracePath(ctx, shapeOf(z)); ctx.clip(); }
      if (test) drawTestPattern(ctx, z, z.id === Editor.selectedId);
      else if (scaring) JUMPSCARE.draw(ctx, z, S, App.scare);
      else scene.draw(ctx, z, S);
    });
    ctx.restore();
  }

  const owner = scaring ? JUMPSCARE : scene;
  const global = test ? null : owner.drawGlobal;
  if (global || App.fxUsed) {
    fctx.setTransform(1, 0, 0, 1, 0, 0);
    fctx.globalAlpha = 1;
    fctx.clearRect(0, 0, fx.width, fx.height);
    App.fxUsed = !!global;
  }
  if (global) {
    const W = innerWidth, H = innerHeight;
    fctx.setTransform(App.fxScale, 0, 0, App.fxScale, 0, 0);
    fctx.save();
    if (owner.globalClip !== false) {
      // union of all zones: nothing is projected outside the house
      fctx.beginPath();
      for (const sz of S.screenZones) { fctx.moveTo(sz.pts[0][0], sz.pts[0][1]); for (let i = 1; i < 4; i++) fctx.lineTo(sz.pts[i][0], sz.pts[i][1]); fctx.closePath(); }
      fctx.clip('nonzero');
    }
    safeDraw('_globalErr', owner, () => global.call(owner, fctx, W, H, S, App.scare));
    fctx.restore();
  }
  if (App.mode === 'edit') Editor.drawOverlay();
}

let last = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000 || 0);
  last = now;
  step(dt);
  render();
}

// ?bench: measures how long each scene takes to draw (ms per frame; reading a pixel forces painting to finish)
function bench() {
  const results = [];
  const flush = () => { for (const z of App.zones) z.ctx.getImageData(0, 0, 1, 1); fctx.getImageData(0, 0, 1, 1); };
  const run = (name, prep) => {
    const N = 60;
    prep(0);
    render();
    flush();
    const t0 = performance.now();
    for (let i = 0; i < N; i++) { prep(i); step(1 / 60); render(); flush(); }
    results.push(`${name}: ${((performance.now() - t0) / N).toFixed(2)} ms/frame`);
  };
  SCENES.forEach((sc, i) => run(`${i + 1} ${sc.name}`, k => { if (k === 0) { goScene(i); S.t = sc.duration * 0.5; } S.playing = true; }));
  run('9 Susto', () => { App.scare = 0.8; });
  App.scare = -1;
  console.log('BENCH ' + results.join(' | '));
}

// ---------- keyboard, mouse, screen ----------

addEventListener('keydown', e => {
  Sound.unlock();
  const tag = e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  if (App.mode === 'edit' && Editor.handleKey(e)) { e.preventDefault(); return; }
  const k = e.key.toLowerCase();
  if (k === 'e') {
    setMode(App.mode === 'edit' ? 'show' : 'edit');
    toast(App.mode === 'edit' ? 'Mapping edit' : 'Show · E edit · H help');
  } else if (k === 'f') {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.().catch(() => {});
  } else if (k === 'h' || k === '?') $('help').hidden = !$('help').hidden;
  else if (k === 'escape') $('help').hidden = true;
  else if (k === 'm') {
    const on = Sound.toggle();
    Sound.ambience(SCENES[App.scene].ambience ?? 0.5);
    toast(on ? 'Sound on' : 'Sound off');
  } else if (k === '+' || k === '=' || k === '-') {
    Sound.setVolume(Sound.volume + (k === '-' ? -0.1 : 0.1));
    toast(`Volume ${Math.round(Sound.volume * 100)}%`);
  } else if (k === 'j') scare();
  else if (k === 'v') document.body.classList.toggle('preview');
  else if (k === ' ') { S.playing = !S.playing; toast(S.playing ? 'Playing' : 'Paused'); }
  else if (k === 'arrowright' || k === 'n') { goScene(App.scene + 1); toast(SCENES[App.scene].name); }
  else if (k === 'arrowleft' || k === 'p') { goScene(App.scene - 1); toast(SCENES[App.scene].name); }
  else if (/^[1-9]$/.test(k) && +k <= SCENES.length) { goScene(+k - 1); toast(SCENES[App.scene].name); }
  else return;
  e.preventDefault();
});

addEventListener('pointerdown', () => Sound.unlock());

// in show mode the cursor hides after 2 s
let idleTimer = 0;
addEventListener('pointermove', () => {
  document.body.classList.remove('nocursor');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => { if (App.mode === 'show') document.body.classList.add('nocursor'); }, 2000);
});

addEventListener('resize', () => { Editor.resizeOverlay(); refreshZones(); });

// so the Mac does not turn off the screen during the show
let wakeLock = null;
async function requestWakeLock() {
  try { if (!wakeLock || wakeLock.released) wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && App.mode === 'show') requestWakeLock(); });

function init() {
  const saved = loadMapping();
  setZones(saved || defaultZones());
  Editor.init();
  const n = parseInt(params.get('scene'), 10);
  goScene(n > 0 ? n - 1 : 0);
  // without a saved mapping it starts in edit mode; ?show / ?edit force the mode
  setMode(params.has('edit') ? 'edit' : params.has('show') || saved ? 'show' : 'edit');
  // ?t=12 starts at that second; ?pause freezes; ?scare=0.8 shows the scare at that instant;
  // ?preview simulates the projection over the house photo (also with the V key)
  if (params.has('t')) S.t = S.prevT = +params.get('t') || 0;
  if (params.has('pause')) S.playing = false;
  if (params.has('scare')) App.scare = +params.get('scare') || 0;
  if (params.has('preview')) document.body.classList.add('preview');
  // sound starts with the first key press or click (with ?audio it is tried from the start, e.g. in kiosk mode)
  if (params.has('audio')) Sound.unlock();
  setTimeout(() => { if (!Sound.started && !params.has('pause')) toast('Press any key to enable sound'); }, 1500);
  $('help-scenes').textContent = 'Scenes: ' + SCENES.map((s, i) => `${i + 1} ${s.name}`).join(' · ');
  document.fonts?.load('40px Creepster').catch(() => {});
  if (params.has('bench')) bench();
  requestAnimationFrame(now => { last = now; frame(now); });
}

init();
