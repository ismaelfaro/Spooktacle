// Effects: the house (wood, doors, chains, glass, clock, cauldron).
// Each effect: registerSfx(name, (E, o) => ...); E.h brings the synthesis pieces (see createAudioEngine in js/audio.js).
// o = { t, pan, vel, wet, ... }: t audio instant (default now), pan -1..1 or [from, to].
// Almost everything is computed sample by sample in JS (damped resonant modes, pulse trains, bubbles): natural
// impacts and hundreds of grains with 3-4 nodes per call. That computation is NOT done when the effect is launched: each effect is
// a pure render (sr, p) → { ch: [Float32Array…] } that runs in a Worker (another thread: the animation doesn't stop) and keeps
// 3-4 ready variants per effect and parameter set. Each call plays one at random (with ±3% speed) and requests a new one.
// Levels by loudness (max RMS over 400 ms), not by peak: a slammed door sounds louder than a hinge.

// ---------- common pieces (house prefix: the scripts share the global scope) ----------
const houseRnd = (a, b) => a + Math.random() * (b - a);
const housePan = p => [Math.cos((p + 1) * Math.PI / 4), Math.sin((p + 1) * Math.PI / 4)];
const houseArr = (sr, secs) => new Float32Array(Math.max(1, Math.ceil(secs * sr)));
const houseQ = (x, q) => +(Math.round(x / q) * q).toFixed(3);

// resonant mode: damped sine (f Hz, tau s down to 1/e) added from sample i0; R optional (stereo).
// Cut off once it drops below ~-70 dB (weak grains cost little)
function houseMode(L, R, i0, sr, f, tau, aL, aR = 0) {
  const a = Math.max(Math.abs(aL), Math.abs(aR));
  if (!(f > 20 && f < sr * 0.45) || i0 < 0 || i0 >= L.length || a < 3e-4) return;
  const w = 2 * Math.PI * f / sr, r = Math.exp(-1 / (tau * sr)), c = r * Math.cos(w), s = r * Math.sin(w);
  const n = Math.min(L.length - i0, Math.ceil(tau * sr * Math.min(6.9, Math.log(a / 3e-4))));
  let re = 1, im = 0;
  if (R) {
    for (let k = 0; k < n; k++) { L[i0 + k] += im * aL; R[i0 + k] += im * aR; const nr = re * c - im * s; im = re * s + im * c; re = nr; }
  } else {
    for (let k = 0; k < n; k++) { L[i0 + k] += im * aL; const nr = re * c - im * s; im = re * s + im * c; re = nr; }
  }
}

// mode with pitch drop (low thumps): f0 → f1 with constant g s
function houseGlide(L, i0, sr, f0, f1, g, tau, amp) {
  const n = Math.min(L.length - i0, Math.ceil(tau * sr * 6.9)), kd = Math.exp(-1 / (tau * sr)), kg = Math.exp(-1 / (g * sr));
  let ph = 0, a = amp, f = f0;
  for (let k = 0; k < n; k++) { L[i0 + k] += Math.sin(ph) * a; f = f1 + (f - f1) * kg; ph += 2 * Math.PI * f / sr; a *= kd; }
}

// filtered noise (soft 2nd-order high-pass and low-pass) with envelope shape(seconds)
function houseNoise(L, R, i0, sr, len, shape, hp, lp, aL, aR = 0) {
  if (i0 < 0) i0 = 0;
  const n = Math.min(L.length - i0, Math.floor(len * sr)), bl = 1 - Math.exp(-2 * Math.PI * lp / sr), bh = Math.exp(-2 * Math.PI * hp / sr);
  let l1 = 0, l2 = 0, h1 = 0, x1 = 0, h2 = 0, x2 = 0;
  for (let k = 0; k < n; k++) {
    l1 += bl * (Math.random() * 2 - 1 - l1); l2 += bl * (l1 - l2);
    h1 = bh * (h1 + l2 - x1); x1 = l2;
    h2 = bh * (h2 + h1 - x2); x2 = h1;
    const v = h2 * shape(k / sr);
    L[i0 + k] += v * aL;
    if (R) R[i0 + k] += v * aR;
  }
}

// 2-pole resonator: filters x and sums into y (a unit impulse gives a damped sine of amplitude amp)
function houseReso(x, y, sr, f, tau, amp) {
  const w = 2 * Math.PI * f / sr, r = Math.exp(-1 / (tau * sr)), a1 = 2 * r * Math.cos(w), a2 = -r * r, g = amp * Math.sin(w);
  let y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = g * x[i] + a1 * y1 + a2 * y2; y2 = y1; y1 = v; y[i] += v; }
}

// soft 2nd-order low-pass (two 1st-order poles) over the array, in place
function houseLow(d, sr, fc) {
  const b = 1 - Math.exp(-2 * Math.PI * fc / sr);
  let a = 0, c = 0;
  for (let i = 0; i < d.length; i++) { a += b * (d[i] - a); c += b * (a - c); d[i] = c; }
}

// soft 2nd-order high-pass (two 1st-order poles), in place: cleans up bass that adds nothing
function houseHigh(d, sr, fc) {
  const b = Math.exp(-2 * Math.PI * fc / sr);
  let y1 = 0, x1 = 0, y2 = 0, x2 = 0;
  for (let i = 0; i < d.length; i++) { y1 = b * (y1 + d[i] - x1); x1 = d[i]; y2 = b * (y2 + y1 - x2); x2 = y1; d[i] = y2; }
}

// fades the end of the buffer to zero from the second `from` (long tails don't end in a click)
function houseFade(sr, from, ...chs) {
  for (const c of chs) {
    const i0 = Math.floor(from * sr), n = c.length - i0;
    for (let i = 0; i < n; i++) c[i0 + i] *= 0.5 + 0.5 * Math.cos(Math.PI * i / n);
  }
}

// soft random walk (one point every `step` s, ±depth): q → ~1 (drags, pushes that are not exponential)
function houseWalk(len, step, depth) {
  const K = Math.ceil(len / step) + 2, v = [1];
  for (let i = 1; i < K; i++) v.push(Math.max(0.25, Math.min(1.6, v[i - 1] + houseRnd(-depth, depth))));
  return q => { const x = Math.max(0, q / step), i = Math.min(K - 2, Math.floor(x)), f = Math.min(1, x - i); return v[i] + (v[i + 1] - v[i]) * f; };
}

// stick-slip creak: train of jerks (rhythm rate = [[0..1, Hz], ...], more irregular the slower it is)
// through a bank of wood resonances; added at d from i0 with peak amp
function houseCreakInto(d, sr, i0, p) {
  const n = Math.max(2, Math.min(Math.floor(p.dur * sr), d.length - i0)), x = new Float32Array(n), y = new Float32Array(n), R = p.rate;
  const rateAt = u => {
    let k = 1;
    while (k < R.length - 1 && R[k][0] < u) k++;
    const [u0, r0] = R[k - 1], [u1, r1] = R[k], f = Math.min(1, Math.max(0, (u - u0) / ((u1 - u0) || 1)));
    return r0 * Math.pow(r1 / r0, f);
  };
  const wf = houseRnd(2, 5), ph = Math.random() * 6.28;
  let s = 0, walk = 0;
  while (s < p.dur) {
    const i = Math.floor(s * sr);
    if (i >= n - 1) break;
    const r = Math.max(8, rateAt(s / p.dur) * (1 + (p.wob ?? 0.12) * Math.sin(6.283 * wf * s + ph)) * (1 + walk));
    walk = walk * 0.92 + (Math.random() - 0.5) * 0.05;
    const slow = Math.min(1, 45 / r), e = Math.min(1, s / p.att, (p.dur - s) / p.rel);
    const a = e * (0.6 + 0.4 * Math.random()) * (0.75 + 0.5 * slow);
    x[i] += a; x[i + 1] -= a * 0.4;
    s += (1 + (Math.random() - 0.5) * (0.03 + 0.5 * slow ** 3)) / r;
  }
  for (const [f, tau, amp] of p.modes) houseReso(x, y, sr, f * houseRnd(0.93, 1.07), tau, amp);
  for (let i = 1; i < n; i++) y[i] += (x[i] - x[i - 1]) * p.grit;
  houseLow(y, sr, p.lp ?? 6500);
  let m = 1e-9;
  for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(y[i]));
  for (let i = 0; i < n; i++) d[i0 + i] += y[i] * p.amp / m;
}

// normalizes to peak 1 (all channels together)
function houseNorm(...chs) {
  let m = 1e-9;
  for (const c of chs) for (let i = 0; i < c.length; i++) { const a = Math.abs(c[i]); if (a > m) m = a; }
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] /= m;
}

// saturates (tanh(kx)/tanh(k), peak already at 1) for `len` s from i0 and returns to linear over `fade` s: denser hit, same peak
function houseSat(d, sr, i0, len, k, fade = 0.03) {
  const n1 = Math.floor(len * sr), n2 = Math.max(1, Math.floor(fade * sr)), tk = Math.tanh(k);
  for (let i = Math.max(0, -i0); i < n1 + n2 && i0 + i < d.length; i++) {
    const x = d[i0 + i], m = i < n1 ? 1 : 1 - (i - n1) / n2;
    d[i0 + i] = x + (Math.tanh(x * k) / tk - x) * m;
  }
}

// loudness level: brings the max RMS over 400 ms to `target` dBFS without the peak going above `ceil` (≈ -1 dBFS)
function houseLoud(chs, sr, target, ceil = 0.89) {
  const n = chs[0].length, W = Math.floor(0.4 * sr), H = Math.floor(0.01 * sr), cs = new Float64Array(n + 1);
  let peak = 1e-9, best = 1e-12;
  for (let i = 0; i < n; i++) {
    let e = 0;
    for (const c of chs) { const v = c[i]; e += v * v; if (v > peak) peak = v; else if (-v > peak) peak = -v; }
    cs[i + 1] = cs[i] + e / chs.length;
  }
  for (let i = 0; i < n; i += H) best = Math.max(best, (cs[Math.min(n, i + W)] - cs[i]) / W);
  const g = Math.min(Math.pow(10, target / 20) / Math.sqrt(best), ceil / peak);
  for (const c of chs) for (let i = 0; i < n; i++) c[i] *= g;
  return +(20 * Math.log10(Math.sqrt(best) * g)).toFixed(1);
}

// wood modes: hinge door (higher, "whine") and floorboard (duller)
const HOUSE_DOOR = [[240, 0.025, 0.35], [580, 0.025, 1], [1150, 0.02, 0.85], [1900, 0.015, 0.6], [2900, 0.01, 0.4], [4100, 0.006, 0.15]];
const HOUSE_BOARD = [[180, 0.03, 0.4], [420, 0.03, 1], [860, 0.022, 0.8], [1450, 0.016, 0.55], [2300, 0.01, 0.3]];

// clanking link: click + inharmonic partials of a steel ring (heavy: thick link, strong second partial)
function houseLink(L, R, i0, sr, f, tau, amp, pan, heavy = false) {
  const [gl, gr] = housePan(pan);
  houseNoise(L, R, i0, sr, 0.002, q => Math.exp(-q / 0.0004), heavy ? 1200 : 2000, 7500, amp * gl * 0.6, amp * gr * 0.6);
  const P = heavy ? [[1, 1, 1], [houseRnd(1.55, 1.68), 0.6, 0.85], [houseRnd(2.3, 2.5), 0.4, 0.5], [houseRnd(3.05, 3.3), 0.25, 0.35]]
    : [[1, 1, 1], [houseRnd(1.55, 1.68), 0.8, 0.7], [houseRnd(2.3, 2.5), 0.6, 0.5], [houseRnd(3.05, 3.3), 0.45, 0.3]];
  for (const [m, tm, a] of P) if (f * m < 8000) houseMode(L, R, i0, sr, f * m, tau * tm, amp * a * gl, amp * a * gr);
}

// glass shard: click + 3 inharmonic plate partials (no going above 8 kHz: no crackle up top)
function houseShard(L, R, i0, sr, f, tau, amp, pan) {
  const [gl, gr] = housePan(pan);
  houseNoise(L, R, i0, sr, 0.0015, q => Math.exp(-q / 0.0003), 3000, 7500, amp * gl * 0.5, amp * gr * 0.5);
  for (const [m, tm, a] of [[1, 1, 1], [houseRnd(1.45, 1.62), 0.7, 0.6], [houseRnd(2.1, 2.4), 0.5, 0.4]]) {
    if (f * m < 8000) houseMode(L, R, i0, sr, f * m, tau * tm, amp * a * gl, amp * a * gr);
  }
}

// bubble (Minnaert / van den Doel): sine that rises a little in pitch while it fades; the big ones pop with a click.
// dkm lengthens (<1) or shortens the fall
function houseBubble(L, R, i0, sr, f0, rise, amp, pan, pop, dkm = 1) {
  if (i0 >= L.length || amp < 3e-4) return;
  const dk = (0.043 * f0 + 0.0014 * Math.pow(f0, 1.5)) * 0.8 * dkm, n = Math.min(L.length - i0, Math.ceil(Math.min(6, Math.log(amp / 3e-4)) / dk * sr)), [gl, gr] = housePan(pan);
  const kd = Math.exp(-dk / sr), w0 = 2 * Math.PI * f0 / sr, dw = w0 * rise * dk / sr, na = Math.ceil(0.002 * sr);
  // "magic circle" oscillator: stable even when the pitch changes, without one sine per sample
  let x = 1, y = 0, w = w0, e = amp;
  for (let k = 0; k < n; k++) {
    const v = y * e * (k < na ? k / na : 1), q = w * (1 - w * w / 24);
    x -= q * y; y += q * x; w += dw; e *= kd;
    L[i0 + k] += v * gl; R[i0 + k] += v * gr;
  }
  if (pop) houseNoise(L, R, i0 + Math.floor(1.5 / dk * sr), sr, 0.006, q => Math.exp(-q / 0.0012), 600, 3500, amp * 0.3 * gl, amp * 0.3 * gr);
}

// ---------- variant pools (rendered on another thread) ----------
const HOUSE_R = {};    // name → pure render (sr, p) → { ch, ...data to play back }
const HOUSE_POOL = {}; // name+params → { vars: [{ res, buf, uses }], n, wait }
let houseWk;           // Worker (undefined: not created yet; null: none available, computed here)

// the Worker keeps a copy of the pieces and of the renders (their source code)
function houseWorker() {
  if (houseWk !== undefined) return houseWk;
  houseWk = null;
  if (typeof Worker === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') return null;
  try {
    const lib = { houseRnd, housePan, houseArr, houseMode, houseGlide, houseNoise, houseReso, houseLow, houseHigh, houseFade, houseWalk,
      houseCreakInto, houseNorm, houseSat, houseLoud, houseLink, houseShard, houseBubble, HOUSE_DOOR, HOUSE_BOARD };
    const src = Object.entries(lib).map(([k, v]) => `const ${k} = ${typeof v === 'function' ? v.toString() : JSON.stringify(v)};`).join('\n') +
      `\nconst HOUSE_R = {\n${Object.entries(HOUSE_R).map(([k, f]) => `${k}: ${f.toString()}`).join(',\n')}\n};\n` +
      'onmessage = e => { const { key, name, p, sr } = e.data, res = HOUSE_R[name](sr, p); res.sr = sr; postMessage({ key, res }, res.ch.map(c => c.buffer)); };';
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = e => houseTake(e.data.key, e.data.res);
    // if the Worker fails, everything is computed here as before
    w.onerror = () => { houseWk = null; for (const P of Object.values(HOUSE_POOL)) P.wait = 0; };
    houseWk = w;
  } catch (err) { houseWk = null; }
  return houseWk;
}

const housePool = (name, p, n, sr) => {
  const key = name + JSON.stringify(p);
  return (HOUSE_POOL[key] ??= { key, name, p, n, sr, vars: [], wait: 0 });
};

// a new variant arrives: it is stored, or replaces the most used one
function houseTake(key, res) {
  const P = HOUSE_POOL[key];
  if (!P) return;
  P.wait = Math.max(0, P.wait - 1);
  const v = { res, uses: 0 };
  if (P.vars.length < P.n) { P.vars.push(v); return; }
  let w = 0;
  P.vars.forEach((x, i) => { if (x.uses > P.vars[w].uses) w = i; });
  if (P.vars[w].uses > 0) P.vars[w] = v;
}

// requests variants from the Worker (until the pool is full; after that, one at a time). Without a Worker it only fills at the start, in spare moments
function houseAsk(P) {
  const w = houseWorker(), room = Math.max(1, P.n - P.vars.length);
  if (w) {
    while (P.wait < room) { P.wait++; w.postMessage({ key: P.key, name: P.name, p: P.p, sr: P.sr }); }
  } else if (P.vars.length + P.wait < P.n && typeof setTimeout !== 'undefined') {
    P.wait++;
    setTimeout(() => { const res = HOUSE_R[P.name](P.sr, P.p); res.sr = P.sr; houseTake(P.key, res); }, 150 + 250 * P.wait);
  }
}

// one variant ready to play (AudioBuffer). If none exists yet, it is computed here (the caller takes t AFTER)
function houseGet(E, name, p, n = 3, fixed = false) {
  const P = housePool(name, p, n, E.ac.sampleRate);
  let v = P.vars[Math.floor(Math.random() * P.vars.length)];
  if (!v) { const res = HOUSE_R[name](P.sr, p); res.sr = P.sr; v = { res, uses: 0 }; P.vars.push(v); }
  v.uses++;
  if (!fixed || P.vars.length + P.wait < P.n) houseAsk(P);
  if (!v.buf) {
    const ch = v.res.ch, b = E.ac.createBuffer(ch.length, ch[0].length, v.res.sr);
    ch.forEach((c, i) => b.copyToChannel(c, i));
    v.buf = b; v.res.ch = null;
  }
  return v;
}

// effect with a pool: params(o) → p (only what changes the render, rounded), render(sr, p), play(E, o, v, p, t)
const HOUSE_P = {};    // name → [params, n] (to leave pools ready on load)
function houseSfx(name, params, render, play, n = 3) {
  HOUSE_R[name] = render; HOUSE_P[name] = [params, n];
  registerSfx(name, (E, o) => {
    const p = params(o), v = houseGet(E, name, p, n);
    play(E, o, v, p, E.h.T(o));
  });
}

// plays the variant at t: vel, pan (fixed, or [from, to] traveling over `span` s), reverb and ±3% speed.
// off: seconds of the buffer to skip (the sound starts already advanced)
function housePlay(E, v, o, t, wet, span = v.buf.duration, off = 0, rate = houseRnd(0.97, 1.03)) {
  const { ac, gain, out } = E.h, s = ac.createBufferSource(), g = gain(o.vel ?? 1);
  s.buffer = v.buf; s.playbackRate.value = rate;
  s.connect(g); s.start(t, off); s.stop(t + (v.buf.duration - off) / rate + 0.05);
  return out(g, o, E.sfx, wet, t, span);
}

// ---------- effects ----------

// old door hinge that creaks. o.dur (s), o.pitch (× rhythm of the jerks)
houseSfx('creak', o => ({ dur: houseQ(Math.max(0.3, o.dur ?? 1.6), 0.1), pitch: houseQ(o.pitch ?? 1, 0.05) }), (sr, p) => {
  const dur = p.dur, k = p.pitch * houseRnd(0.85, 1.2), d = houseArr(sr, dur + 0.15);
  // rhythm contours (Hz): opens slowly, whine, in jerks
  const shapes = [
    [[0, 28], [0.25, 70], [0.6, 210], [0.85, 270], [1, 150]],
    [[0, 70], [0.3, 320], [0.55, 230], [0.8, 380], [1, 190]],
    [[0, 24], [0.18, 130], [0.3, 45], [0.5, 190], [0.62, 70], [0.82, 300], [1, 120]],
  ];
  const rate = shapes[Math.floor(Math.random() * shapes.length)].map(([u, r]) => [u, r * k]);
  houseCreakInto(d, sr, 0, { dur, rate, att: 0.08, rel: 0.2, grit: 0.25, amp: 1, modes: HOUSE_DOOR });
  return { ch: [d], lu: houseLoud([d], sr, -16) };
}, (E, o, v, p, t) => housePlay(E, v, o, t, 0.3, p.dur));

// fist knocks on a solid door. o.count (3), o.gap (s between knocks); at low vel they sound duller
houseSfx('knock', o => ({ n: Math.max(1, Math.round(o.count ?? 3)), gap: houseQ(o.gap ?? 0.34, 0.02), hard: houseQ(Math.min(1.5, Math.max(0.3, o.vel ?? 1)), 0.1) }), (sr, p) => {
  const { n, gap, hard } = p, d = houseArr(sr, (n - 1) * gap * 1.1 + 0.8), door = houseRnd(0.92, 1.08), on = [];
  // low panel + wood + the house's cavity behind
  const modes = [[95, 0.07, 0.2], [160, 0.06, 0.55], [235, 0.05, 0.7], [320, 0.05, 0.8], [460, 0.04, 0.85], [690, 0.03, 0.75], [1020, 0.02, 0.6], [1550, 0.012, 0.4], [2300, 0.007, 0.25]];
  let s = 0;
  for (let k = 0; k < n; k++) {
    const i0 = Math.floor(s * sr), a = houseRnd(0.82, 1) * (k === n - 1 && n > 1 ? 1.1 : 1);
    on.push(i0);
    // fist contact (soft, ~3 ms) and knuckles
    houseNoise(d, null, i0, sr, 0.015, q => Math.exp(-q / 0.0025), 600, 6000, a * 0.8 * hard);
    for (const [f, tau, amp] of modes) houseMode(d, null, i0, sr, f * door * houseRnd(0.985, 1.015), tau, a * amp * houseRnd(0.65, 1.3) * (f > 500 ? hard ** 0.6 : 1));
    houseGlide(d, i0, sr, 230 * door, 150 * door, 0.025, 0.05, a * 0.45);
    s += gap * houseRnd(0.92, 1.08);
  }
  // each knock denser (same peak, more body)
  houseNorm(d);
  for (const i0 of on) houseSat(d, sr, i0, 0.035, 2.4, 0.03);
  return { ch: [d], span: Math.max(0.3, s - gap), lu: houseLoud([d], sr, -14) };
}, (E, o, v, p, t) => housePlay(E, v, o, t, 0.35, v.res.span));

// heavy chains that shake in irregular jerks; sometimes they end up settling into a few loose hits. o.dur (s)
houseSfx('chains', o => ({ dur: houseQ(Math.max(0.3, o.dur ?? 1.5), 0.1) }), (sr, p) => {
  const dur = p.dur, settle = dur > 0.8 && Math.random() < 0.6, shEnd = settle ? dur * houseRnd(0.7, 0.8) : dur;
  // settling hits: more and more spaced out and softer
  const st = [];
  if (settle) for (let m = 0, M = 3 + Math.floor(Math.random() * 4), s = shEnd + houseRnd(0.05, 0.1), g = houseRnd(0.1, 0.16), a = houseRnd(0.55, 0.75); m < M; m++) {
    st.push([s, a]); s += g; g *= houseRnd(1.1, 1.3); a *= houseRnd(0.6, 0.8);
  }
  const end = Math.max(dur, st.length ? st[st.length - 1][0] : 0) + 0.6, L = houseArr(sr, end), R = houseArr(sr, end);
  const avg = houseRnd(0.45, 0.65);
  let s0 = 0, j = 0;
  while (s0 < shEnd - 0.1) {
    const sp = avg * houseRnd(0.6, 1.4), len = Math.max(0.12, Math.min(sp * houseRnd(0.7, 1.15), shEnd - s0 + 0.1)), force = j === 0 ? 1 : houseRnd(0.55, 0.95);
    // heavy hit at the start of each shake: thick iron links
    for (let h = 0, H = 2 + Math.floor(Math.random() * 2); h < H; h++) houseLink(L, R, Math.floor((s0 + h * houseRnd(0.01, 0.035)) * sr), sr, houseRnd(280, 650), houseRnd(0.13, 0.2), force * houseRnd(0.6, 1) * (h ? 0.7 : 1), houseRnd(-0.3, 0.3), true);
    // drag (weight of the chain), with irregular pushes
    const wk = houseWalk(len, 0.04, 0.35), dl = len * houseRnd(0.35, 0.7);
    houseNoise(L, R, Math.floor(s0 * sr), sr, len, q => wk(q) * Math.exp(-q / dl) * Math.min(1, q / 0.01, (len - q) / 0.03), 150, 1200, force * 0.06, force * 0.06);
    // cluster of links: different density and decay on each shake
    const d0 = houseRnd(90, 170), dc = len * houseRnd(0.3, 0.6);
    let s = s0 + houseRnd(0, 0.02);
    while (s < s0 + len) {
      const q = s - s0, dens = d0 * Math.exp(-q / dc) + 8;
      houseLink(L, R, Math.floor(s * sr), sr, Math.exp(houseRnd(Math.log(1100), Math.log(4200))), houseRnd(0.012, 0.045), force * Math.exp(-q / (len * 0.6)) * Math.pow(Math.random(), 1.6), houseRnd(-0.45, 0.45));
      s += -Math.log(1 - Math.random()) / dens;
    }
    s0 += sp * (j ? 1 : houseRnd(0.75, 1)); j++;
  }
  // settles: loose thick-link hits with some jingling
  for (const [s, a] of st) {
    const pan = houseRnd(-0.3, 0.3);
    houseLink(L, R, Math.floor(s * sr), sr, houseRnd(300, 600), houseRnd(0.12, 0.2), a, pan, true);
    for (let c = 0, C = 1 + Math.floor(Math.random() * 3); c < C; c++) houseLink(L, R, Math.floor((s + houseRnd(0.005, 0.04)) * sr), sr, houseRnd(1200, 3000), houseRnd(0.012, 0.03), a * houseRnd(0.2, 0.45), pan + houseRnd(-0.15, 0.15));
  }
  return { ch: [L, R], lu: houseLoud([L, R], sr, -15) };
}, (E, o, v, p, t) => housePlay(E, v, o, t, 0.4, p.dur));

// window that breaks: hit, crack, burst of shards and pieces that fall and bounce.
// Several in a row (less than 150 ms apart) sound a bit softer: the brightness doesn't pile up
houseSfx('shatter', () => ({}), sr => {
  const L = houseArr(sr, 2.4), R = houseArr(sr, 2.4);
  // impact against the glass
  for (const [f, tau, amp] of [[170, 0.05, 0.5], [290, 0.035, 0.5], [520, 0.025, 0.45], [880, 0.018, 0.35]]) houseMode(L, R, 0, sr, f * houseRnd(0.9, 1.1), tau, amp * 1.1, amp * 1.1);
  // crack: bright burst + the whole pane vibrating for an instant
  houseNoise(L, R, 0, sr, 0.08, q => Math.exp(-q / 0.012), 900, 7500, 1, 1);
  for (const [f, tau, amp] of [[680, 0.05, 0.35], [1150, 0.04, 0.45], [1820, 0.03, 0.4], [2650, 0.02, 0.38], [3600, 0.014, 0.28]]) houseMode(L, R, 0, sr, f * houseRnd(0.95, 1.05), tau, amp, amp);
  // hiss of the glass crumbling (different noise on each side)
  for (const C of [L, R]) houseNoise(C, null, 0, sr, 0.6, q => Math.exp(-q / 0.09) * Math.min(1, q / 0.005), 1800, 7000, 0.35);
  // burst: dozens of shards in the first 0.35 s (the 2-6 kHz ones a bit louder)
  const lift = f => (f > 2000 && f < 6000 ? 1.15 : 1);
  for (let i = 0; i < 45; i++) {
    const s = 0.002 + 0.35 * Math.random() ** 2, f = Math.exp(houseRnd(Math.log(1800), Math.log(6500)));
    houseShard(L, R, Math.floor(s * sr), sr, f, houseRnd(0.025, 0.1), (1 - s * 1.8) * houseRnd(0.3, 1) * lift(f), houseRnd(-0.6, 0.6));
  }
  // fall: pieces that bounce on the sill and the floor, more and more spaced out
  for (let i = 0; i < 30; i++) {
    let s = 0.3 + 1.5 * Math.random() ** 1.5, gap = houseRnd(0.04, 0.09);
    const f = Math.exp(houseRnd(Math.log(2200), Math.log(7000))), tau = houseRnd(0.03, 0.12), pan = houseRnd(-0.7, 0.7);
    let a = houseRnd(0.15, 0.45) * Math.exp(-(s - 0.3) / 0.8) * lift(f);
    for (let b = 0; b < 4 && s < 2.2; b++) {
      houseShard(L, R, Math.floor(s * sr), sr, f * houseRnd(0.98, 1.02), tau, a, pan);
      if (Math.random() < 0.35) break;
      s += gap; gap *= 0.6; a *= 0.45;
    }
  }
  return { ch: [L, R], lu: houseLoud([L, R], sr, -14) };
}, (E, o, v, p, t) => {
  const last = E.houseShatter ?? -9;
  E.houseShatter = t;
  housePlay(E, v, Math.abs(t - last) < 0.15 ? { ...o, vel: (o.vel ?? 1) * 0.7 } : o, t, 0.35, 1.2);
}, 4);

// door slam: door swing (if there is room before t), dense low hit, wood, the house's rumble, reflection of the
// hallway, latch and frame that trembles. The hit lands exactly at t. o.swing: seconds of swing at most (0.18; 0 = no swing)
houseSfx('doorSlam', o => ({ swing: houseQ(Math.max(0, Math.min(0.4, o.swing ?? 0.18)), 0.02), hard: houseQ(Math.min(1.5, Math.max(0.3, o.vel ?? 1)), 0.1) }), (sr, p) => {
  const k = houseRnd(0.93, 1.07), hard = p.hard, pre = p.swing;
  const d = houseArr(sr, pre + 1.6), i0 = Math.floor(pre * sr), imp = houseArr(sr, 1.3);
  // swing: air that grows and a short hinge squeal
  if (pre > 0.08) {
    houseNoise(d, null, 0, sr, pre, q => Math.pow(q / pre, 2.5), 250, 1400, 0.14);
    if (Math.random() < 0.7) houseCreakInto(d, sr, Math.floor(pre * 0.25 * sr), { dur: pre * 0.7, rate: [[0, 120], [1, 420]], att: 0.03, rel: 0.02, grit: 0.2, amp: 0.08, modes: HOUSE_DOOR });
  }
  // low hit (pitch drop) and room rumble (long 150 Hz + 400-700 Hz)
  houseGlide(imp, 0, sr, 150 * k, 95 * k, 0.04, 0.12, 0.9);
  houseMode(imp, null, 0, sr, 175 * k, 0.08, 0.6);
  houseMode(imp, null, 0, sr, houseRnd(140, 180), houseRnd(0.2, 0.25), 0.45);
  houseMode(imp, null, 0, sr, houseRnd(400, 700), 0.12, 0.4);
  // wood body (the low modes last longer)
  for (const [f, tau, amp] of [[205, 0.1, 0.8], [290, 0.08, 0.75], [410, 0.06, 0.7], [575, 0.05, 0.65], [820, 0.035, 0.55], [1150, 0.025, 0.45], [1700, 0.015, 0.3], [2500, 0.009, 0.18]]) {
    houseMode(imp, null, 0, sr, f * k * houseRnd(0.97, 1.03), f < 600 ? tau * 1.5 : tau, 1.3 * amp * houseRnd(0.7, 1.2) * (f > 600 ? hard ** 0.6 : 1));
  }
  // door edge against the frame
  houseNoise(imp, null, 0, sr, 0.05, q => Math.exp(-q / 0.007), 400, 4500, 1.3 * hard);
  // whole hit saturated for the first 70 ms: denser and heavier, same peak
  houseNorm(imp);
  houseSat(imp, sr, 0, 0.07, 2.5, 0.04);
  // early reflection of the hallway: dark copy at 25-40 ms, -9 dB
  const er = Math.floor(houseRnd(0.025, 0.04) * sr), ref = imp.slice(0, imp.length - er);
  houseLow(ref, sr, 3000);
  for (let i = 0; i < ref.length; i++) imp[i + er] += ref[i] * 0.35;
  for (let i = 0; i < imp.length && i0 + i < d.length; i++) d[i0 + i] += imp[i];
  // metal latch and its bounce
  for (const [dt, a] of [[houseRnd(0.004, 0.009), 0.16 * hard], [houseRnd(0.05, 0.085), 0.07 * hard]]) {
    const j = i0 + Math.floor(dt * sr);
    houseNoise(d, null, j, sr, 0.004, q => Math.exp(-q / 0.0008), 2000, 7500, a);
    for (const [f, tau, amp] of [[2350, 0.03, 1], [3720, 0.02, 0.7], [5150, 0.012, 0.4]]) houseMode(d, null, j, sr, f * houseRnd(0.97, 1.03), tau, a * amp);
  }
  // the frame trembles
  let s = houseRnd(0.03, 0.05), a = 0.13;
  for (let m = 0, M = 5 + Math.floor(Math.random() * 5); m < M; m++) {
    const j = i0 + Math.floor(s * sr);
    houseMode(d, null, j, sr, houseRnd(450, 520), 0.02, a);
    houseMode(d, null, j, sr, houseRnd(1250, 1400), 0.015, a * 0.6);
    houseMode(d, null, j, sr, houseRnd(2500, 2800), 0.01, a * 0.4);
    s += houseRnd(0.03, 0.045); a *= 0.78;
  }
  return { ch: [d], pre, lu: houseLoud([d], sr, -12) };
}, (E, o, v, p, t) => {
  // the swing sounds before t only if there is room; otherwise it is skipped (and if very little is left, it starts at the hit)
  const rate = houseRnd(0.97, 1.03), pre = v.res.pre / rate, room = t - E.now() - 0.005;
  const skip = room >= pre ? 0 : room > 0.06 ? pre - room : pre;
  housePlay(E, v, o, t - pre + skip, 0.45, Math.max(0.3, pre - skip + 0.3), skip * rate, rate);
});

// slow, heavy steps on the wooden porch. o.count (4), o.gap (s), o.approach (1 = coming closer, -1 = moving away),
// o.creaky (probability that a board creaks, 0.35). With o.pan [from, to] they walk from one side to the other
houseSfx('footsteps', o => ({ n: Math.max(1, Math.round(o.count ?? 4)), gap: houseQ(o.gap ?? 0.85, 0.05), ap: houseQ(o.approach ?? 0, 0.5), creaky: houseQ(o.creaky ?? 0.35, 0.05) }), (sr, p) => {
  const { n, gap, ap } = p, d = houseArr(sr, (n - 1) * gap * 1.08 + 1), tmp = houseArr(sr, 0.8);
  const porch = houseRnd(0.93, 1.07);
  const modes = [[100, 0.1, 0.25], [128, 0.07, 0.4], [210, 0.06, 0.8], [335, 0.045, 0.85], [480, 0.035, 0.75], [770, 0.022, 0.6], [1200, 0.014, 0.4], [1950, 0.008, 0.25]];
  let s = 0;
  for (let k = 0; k < n; k++) {
    tmp.fill(0);
    const u = n > 1 ? k / (n - 1) : 1, far = ap > 0 ? (1 - u) * ap : ap < 0 ? -u * ap : 0;
    const board = porch * (k % 2 ? 1.035 : 0.975) * houseRnd(0.95, 1.05), a = houseRnd(0.85, 1) * (k % 2 ? 0.92 : 1);
    // heel: dull thud of the sole + porch boards
    houseNoise(tmp, null, 0, sr, 0.03, q => Math.exp(-q / 0.005), 150, 2500, a * 0.7);
    for (const [f, tau, amp] of modes) houseMode(tmp, null, 0, sr, f * board, tau, a * amp * houseRnd(0.7, 1.25));
    // the heel, denser (saturated ~50 ms relative to its own peak)
    let pk = 1e-9;
    for (let i = 0; i < 0.05 * sr; i++) pk = Math.max(pk, Math.abs(tmp[i]));
    for (let i = 0; i < tmp.length; i++) tmp[i] /= pk;
    houseSat(tmp, sr, 0, 0.05, 2.2, 0.04);
    for (let i = 0; i < tmp.length; i++) tmp[i] *= pk;
    // toe: softer and a bit brighter, with a sole drag
    const j = Math.floor(houseRnd(0.07, 0.11) * sr);
    for (const [f, tau, amp] of modes.slice(2)) houseMode(tmp, null, j, sr, f * board * 1.07, tau * 0.8, a * amp * 0.35);
    houseNoise(tmp, null, j - Math.floor(0.02 * sr), sr, 0.09, q => Math.sin(Math.PI * q / 0.09) ** 2, 700, 4000, a * 0.2);
    // sometimes a board creaks under the weight
    if (Math.random() < p.creaky) {
      houseCreakInto(tmp, sr, Math.floor(houseRnd(0.03, 0.08) * sr), { dur: houseRnd(0.18, 0.32), rate: [[0, 35], [0.5, houseRnd(90, 160)], [1, 50]], att: 0.04, rel: 0.08, grit: 0.2, amp: a * 0.4, modes: HOUSE_BOARD });
    }
    // distance: softer and darker
    const al = 1 - Math.exp(-2 * Math.PI * (9000 - 7500 * far) / sr), g = 1 - 0.65 * far, i0 = Math.floor(s * sr);
    let y = 0;
    for (let i = 0; i < tmp.length && i0 + i < d.length; i++) { y += al * (tmp[i] - y); d[i0 + i] += y * g; }
    s += gap * houseRnd(0.95, 1.05);
  }
  return { ch: [d], span: Math.max(0.3, s - gap), lu: houseLoud([d], sr, -14) };
}, (E, o, v, p, t) => housePlay(E, v, o, t, 0.25, v.res.span));

// wall clock tick-tock. o.count (4 beats), o.gap (s between beats, 0.5). Tick is metallic and clear, tock darker and
// of a box; the escapement limps a little (tick→tock 0.94·gap, tock→tick 1.06·gap), like a real clock
houseSfx('clockTick', o => ({ n: Math.max(1, Math.round(o.count ?? 4)), gap: houseQ(o.gap ?? 0.5, 0.02) }), (sr, p) => {
  const { n, gap } = p, k0 = houseRnd(0.94, 1.06), be = houseRnd(0.93, 0.95), on = [];
  for (let k = 0, s = 0; k < n; k++) { on.push(Math.max(0, s)); s += gap * (k % 2 ? 2 - be : be) + houseRnd(-0.002, 0.002); }
  const d = houseArr(sr, on[n - 1] + 0.35);
  for (let k = 0; k < n; k++) {
    const tock = k % 2 === 1, i0 = Math.floor(on[k] * sr), pe = k0 * (tock ? 0.75 : 1), am = tock ? 0.45 : 0.7;
    // escapement: two very close metallic clicks (tooth and pallet), slightly different each time
    for (const [dt, b] of [[0, 1], [houseRnd(0.004, 0.007), houseRnd(0.3, 0.6)]]) {
      const j = i0 + Math.floor(dt * sr);
      houseNoise(d, null, j, sr, 0.003, q => Math.exp(-q / 0.0005), 2500, 8000, am * b * 0.5);
      for (const [f, tau, amp] of [[2650, 0.01, 0.5], [3150, 0.008, 0.7], [4400, 0.006, 0.55], [5900, 0.004, 0.3]]) houseMode(d, null, j, sr, f * pe * houseRnd(0.98, 1.02), tau, am * b * amp);
    }
    // wooden clock case (the weight, in 700-1800 Hz); on the deeper tock, long and strong, with a dull tap
    const cs = tock ? 0.7 : 1, ct = tock ? houseRnd(0.05, 0.06) : 0.03, ca = tock ? 1.5 : 1;
    for (const [f, tau, amp] of [[420, 0.8, 0.3], [890, 1, 0.6], [1250, 1, 0.75], [1530, 0.8, 0.6], [2350, 0.4, 0.3]]) houseMode(d, null, i0, sr, f * cs * k0 * houseRnd(0.99, 1.01), ct * tau, ca * amp);
    if (tock) houseNoise(d, null, i0, sr, 0.012, q => Math.exp(-q / 0.003), 300, 2000, 0.5);
  }
  houseNorm(d);
  for (const s of on) houseSat(d, sr, Math.floor(s * sr), 0.02, 2, 0.02);
  return { ch: [d], span: Math.max(0.3, on[n - 1]), lu: houseLoud([d], sr, -18) };
}, (E, o, v, p, t) => housePlay(E, v, o, t, 0.2, v.res.span));

// grandfather clock chime: Westminster quarter on rods and hour strikes on the gong.
// o.count (strikes, 3; 0 = melody only), o.melody (false = strikes only), o.gap (s between strikes)
// rod (on E4): clean fundamental with beating + cantilever partials 2.76 (weak), 6.27 and 17.55
HOUSE_R.chimeRod = sr => {
  const r = houseArr(sr, 3.6), fr = 329.63;
  houseNoise(r, null, 0, sr, 0.004, q => Math.exp(-q / 0.0007), 1500, 7500, 0.3);
  for (const [m, tau, amp] of [[1, 1.8, 1], [1.0031, 1.6, 0.45], [2.76, 0.5, 0.07], [6.27, 0.3, 0.32], [6.31, 0.25, 0.14], [17.55, 0.06, 0.08]]) houseMode(r, null, 0, sr, fr * m, tau, amp);
  houseMode(r, null, 0, sr, 240, 0.04, 0.15);
  houseFade(sr, 1.4, r);
  houseNorm(r);
  return { ch: [r] };
};
// spiral hour gong (E3): low, long, nearly harmonic partials that beat
HOUSE_R.chimeGong = sr => {
  const g = houseArr(sr, 5), fg = 164.81;
  houseNoise(g, null, 0, sr, 0.006, q => Math.exp(-q / 0.001), 300, 3000, 0.3);
  for (const [m, tau, amp] of [[1, 2.6, 0.8], [1.004, 2.2, 0.4], [2.01, 2, 0.6], [2.97, 1.5, 0.45], [4.18, 1, 0.35], [5.62, 0.6, 0.22], [7.35, 0.4, 0.14], [9.4, 0.22, 0.08]]) houseMode(g, null, 0, sr, fg * m, tau, amp);
  houseFade(sr, 2.2, g);
  houseNorm(g);
  return { ch: [g] };
};
registerSfx('clockChime', (E, o) => {
  const { ac, T, gain, out } = E.h;
  // rod and gong don't change: computed once and reused
  const rod = houseGet(E, 'chimeRod', {}, 1, true).buf, gong = houseGet(E, 'chimeGong', {}, 1, true).buf;
  const t = T(o), n = Math.max(0, o.count ?? 3), gap = o.gap ?? 1.7;
  const sum = gain(0.18 * (o.vel ?? 1));
  const hit = (b, at, rate, v, cut = 0) => {
    const s = ac.createBufferSource(), sg = gain(v);
    s.buffer = b; s.playbackRate.value = rate;
    // with strikes very close together the gong dies out sooner (so it doesn't blur)
    if (cut) { sg.gain.setValueAtTime(v, at + cut); sg.gain.setTargetAtTime(0, at + cut, 0.3); }
    s.connect(sg).connect(sum); s.start(at); s.stop(at + (cut ? Math.min(b.duration / rate, cut + 1.5) : b.duration / rate) + 0.05);
  };
  const melody = o.melody === false ? [] : [68, 66, 64, 59];
  melody.forEach((m, i) => hit(rod, t + i * 0.62 + houseRnd(0, 0.02), Math.pow(2, (m - 64) / 12), i === melody.length - 1 ? 1 : 0.85));
  const t2 = t + (melody.length ? melody.length * 0.62 + 0.9 : 0);
  for (let k = 0; k < n; k++) hit(gong, t2 + k * gap, houseRnd(0.998, 1.002), houseRnd(0.9, 1), gap < 2 && k < n - 1 ? 1.6 : 0);
  out(sum, o, E.sfx, 0.4, t, t2 - t + n * gap + 3);
});

// old window that trembles in its frame (gust or ghost). o.dur (s). The long ones have the wind's push underneath
houseSfx('windowRattle', o => ({ dur: houseQ(Math.max(0.3, o.dur ?? 1.5), 0.1) }), (sr, p) => {
  const dur = p.dur, d = houseArr(sr, dur + 0.25), k = houseRnd(0.94, 1.06);
  // gusts: pushes that squeeze the frame
  const nG = Math.max(1, Math.round(dur / houseRnd(0.5, 0.8)));
  const G = Array.from({ length: nG }, (_, i) => [(i + houseRnd(0.3, 0.7)) / nG * dur, houseRnd(0.6, 1), houseRnd(0.15, 0.3)]);
  // the first gust arrives right away (the effect starts at t, with no gap)
  G[0] = [houseRnd(0.08, 0.14), 1, houseRnd(0.15, 0.25)];
  const gust = s => Math.min(1, G.reduce((m, [c, h, w]) => Math.max(m, h * Math.exp(-(((s - c) / w) ** 2))), 0)) * Math.max(0, Math.min(1, s / 0.05, (dur - s) / 0.1));
  // each hit: the glass against the glazing bead (short high partials) + the frame's wood
  const glass = [[1180, 0.018, 0.5], [1960, 0.014, 0.8], [2870, 0.011, 0.7], [3950, 0.008, 0.5], [5300, 0.005, 0.25]];
  const frame = [[240, 0.018, 0.3], [430, 0.016, 1], [760, 0.012, 0.75], [1250, 0.009, 0.45]];
  const hit = (i, a, gm) => {
    houseNoise(d, null, i, sr, 0.003, q => Math.exp(-q / 0.0006), 1000, 7000, a * 0.5);
    for (const [f, tau, amp] of frame) houseMode(d, null, i, sr, f * k * houseRnd(0.97, 1.03), tau, a * amp);
    for (const [f, tau, amp] of glass) houseMode(d, null, i, sr, f * k * houseRnd(0.96, 1.04), tau, a * gm * amp);
  };
  for (let s = 0; s < dur; s += houseRnd(0.7, 1.3) / (12 + 24 * gust(s))) {
    const gv = gust(s), i = Math.floor(s * sr);
    if (gv < 0.05) continue;
    const a = gv ** 1.3 * houseRnd(0.4, 1), gm = houseRnd(0.3, 1);
    hit(i, a, gm);
    // rebound
    if (Math.random() < 0.6) hit(i + Math.floor(houseRnd(0.003, 0.007) * sr), a * 0.4, Math.min(1, gm * 1.3));
  }
  // wind push: low band always, high band that rises with the gust (the center shifts with the strength)
  if (dur > 1) {
    houseNoise(d, null, 0, sr, dur + 0.2, s => gust(s) ** 1.5, 300, 800, 0.22);
    houseNoise(d, null, 0, sr, dur + 0.2, s => gust(s) ** 3, 600, 1400, 0.22);
  }
  houseHigh(d, sr, 160);
  return { ch: [d], lu: houseLoud([d], sr, -16) };
}, (E, o, v, p, t) => housePlay(E, v, o, t, 0.3, p.dur));

// floorboard that gets stepped on: foot thud, then the slow low groan of the board (and sometimes when released). o.pitch, o.dur
houseSfx('floorboard', o => ({ pitch: houseQ(o.pitch ?? 1, 0.05), dur: o.dur ? houseQ(Math.max(0.2, o.dur), 0.05) : 0 }), (sr, p) => {
  const k = p.pitch * houseRnd(0.85, 1.15), dur = p.dur || houseRnd(0.45, 0.65), on = houseRnd(0.04, 0.06);
  const back = Math.random() < 0.6, rd = houseRnd(0.16, 0.26), rg = houseRnd(0.12, 0.25);
  const d = houseArr(sr, on + dur + (back ? rg + rd : 0) + 0.2);
  // the step: sole (dull 20 ms noise) and the board giving way under the weight
  houseNoise(d, null, 0, sr, 0.02, q => Math.exp(-q / 0.004), 150, 1500, 1.2);
  for (const [f, tau, amp] of [[115, 0.06, 0.6], [230, 0.04, 0.5], [410, 0.03, 0.3]]) houseMode(d, null, 0, sr, f * houseRnd(0.95, 1.05), tau, amp * 1.1);
  // sinks: low, slow and irregular creak
  houseCreakInto(d, sr, Math.floor(on * sr), { dur, rate: [[0, 25 * k], [0.3, 60 * k], [0.7, 120 * k], [1, 45 * k]], wob: 0.2, att: 0.05, rel: 0.12, grit: 0.25, amp: 0.85, modes: HOUSE_BOARD });
  // returns to place: short whine
  if (back) houseCreakInto(d, sr, Math.floor((on + dur + rg) * sr), { dur: rd, rate: [[0, 70 * k], [0.5, 120 * k], [1, 40 * k]], wob: 0.2, att: 0.03, rel: 0.08, grit: 0.25, amp: 0.5, modes: HOUSE_BOARD });
  return { ch: [d], lu: houseLoud([d], sr, -16) };
}, (E, o, v, p, t) => housePlay(E, v, o, t, 0.25));

// bubbling cauldron. o.dur (s, 3), o.rate (bubbles per second, 11). A 4 s loop is computed with no seams
// (the bubble tails at the end come in at the start) and plays for as long as needed, from a random point
houseSfx('cauldron', o => ({ rate: houseQ(Math.max(2, o.rate ?? 11), 1) }), (sr, p) => {
  const LP = 4, X = 1, rate = p.rate, N = Math.floor(LP * sr), M = Math.floor((LP + X) * sr);
  const L = new Float32Array(M), R = new Float32Array(M), nz = new Float32Array(M);
  // background simmer
  houseNoise(nz, null, 0, sr, LP + X, s => 0.7 + 0.3 * Math.sin(s * 9), 70, 380, 0.12);
  // fat bubbles: slow "blup" (and after a big one a few small ones rise); sometimes a cluster of 2-4 (rolling boil)
  const bub = (s, a0) => {
    const big = Math.random() < 0.15, f0 = big ? houseRnd(150, 230) : Math.exp(houseRnd(Math.log(260), Math.log(1100)));
    const a = a0 * houseRnd(0.5, 1) * Math.pow(400 / f0, 0.4), pan = houseRnd(-0.3, 0.3);
    houseBubble(L, R, Math.floor(s * sr), sr, f0, big ? houseRnd(0.05, 0.12) : houseRnd(0.07, 0.15), a, pan, big || Math.random() < 0.2, big ? 0.85 : 1);
    if (big) for (let b = 0, B = 1 + Math.floor(Math.random() * 3); b < B; b++) houseBubble(L, R, Math.floor((s + houseRnd(0.03, 0.12)) * sr), sr, houseRnd(500, 1000), houseRnd(0.07, 0.15), a * 0.4, pan + houseRnd(-0.1, 0.1), false);
  };
  for (let s = houseRnd(0, 0.05); s < LP; s += -Math.log(1 - Math.random()) / rate) {
    if (Math.random() < 0.12) for (let b = 0, B = 2 + Math.floor(Math.random() * 3); b < B; b++) bub(s + houseRnd(0, 0.08), 0.8);
    else bub(s, 1);
  }
  // fine background bubbling
  for (let s = houseRnd(0, 0.05); s < LP; s += -Math.log(1 - Math.random()) / (rate * 2)) {
    houseBubble(L, R, Math.floor(s * sr), sr, houseRnd(700, 1600), houseRnd(0.07, 0.15), houseRnd(0.1, 0.25), houseRnd(-0.5, 0.5), false);
  }
  // closes the loop: tails at the start, the simmer blends into its continuation
  const oL = new Float32Array(N), oR = new Float32Array(N), xn = M - N;
  for (let i = 0; i < N; i++) {
    const w = i < xn ? i / xn : 1, z = i < xn ? nz[i] * Math.sin(w * Math.PI / 2) + nz[N + i] * Math.cos(w * Math.PI / 2) : nz[i];
    oL[i] = L[i] + (i < xn ? L[N + i] : 0) + z;
    oR[i] = R[i] + (i < xn ? R[N + i] : 0) + z;
  }
  return { ch: [oL, oR], lu: houseLoud([oL, oR], sr, -17) };
}, (E, o, v, p, t) => {
  const { ac, gain, out } = E.h, dur = Math.max(0.5, o.dur ?? 3), b = v.buf, s = ac.createBufferSource(), lv = o.vel ?? 1, g = gain(0), fo = Math.min(0.5, dur * 0.4);
  s.buffer = b; s.loop = true; s.playbackRate.value = houseRnd(0.97, 1.03);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(lv, t + 0.12);
  g.gain.setValueAtTime(lv, t + dur - fo); g.gain.linearRampToValueAtTime(0, t + dur);
  s.connect(g); s.start(t, Math.random() * b.duration); s.stop(t + dur + 0.05);
  out(g, o, E.sfx, 0.25, t, dur);
});

// on page load the Worker leaves the variants ready for the normal uses (the scene ones included)
if (typeof window !== 'undefined' && typeof setTimeout !== 'undefined') setTimeout(() => {
  const sr = 48000, warm = [['creak', {}], ['creak', { dur: 2 }], ['knock', {}], ['chains', {}], ['shatter', {}], ['doorSlam', {}], ['footsteps', {}],
    ['clockTick', {}], ['windowRattle', {}], ['windowRattle', { dur: 0.6 }], ['floorboard', {}], ['cauldron', {}]];
  if (!houseWorker()) return;
  for (const [name, o] of warm) { const [params, n] = HOUSE_P[name]; houseAsk(housePool(name, params(o), n, sr)); }
  houseAsk(housePool('chimeRod', {}, 1, sr)); houseAsk(housePool('chimeGong', {}, 1, sr));
}, 300);
