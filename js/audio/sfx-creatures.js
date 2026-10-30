// Effects: creatures and body.
// Each effect: registerSfx(name, (E, o) => ...); E.h brings the synthesis pieces (see createAudioEngine in js/audio.js).
// o = { t, pan, vel, wet, ... }: t audio instant (default now), pan -1..1 or [from, to].
// wolf (o.count = pack), owl, crow (o.count), bats (o.count, o.dur), skitter (o.dur, o.count), roar, heartbeat (o.gap),
// cat (o.kind 'yowl' | 'meow' | 'hiss'), ratSqueak (o.count), zombieGroan (o.count), monsterBreath (o.phase 'in' | 'out' | 'both'),
// flies (o.count, o.dur), boneRattle (o.count).

// ---------- local utilities (crea prefix: the scripts share the global scope) ----------
const creaRnd = (a, b) => a + Math.random() * (b - a);
const creaEase = x => x * x * (3 - 2 * x);
const creaClamp = (v, a, b) => Math.max(a, Math.min(b, v));
// curve of n points with f(x), x in 0..1
const creaCurve = (n, f) => Float32Array.from({ length: n }, (_, i) => f(i / (n - 1)));
// smooth path through points [[x, value], ...] with x in 0..1
const creaPath = pts => x => {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { const [x0, a] = pts[i - 1], [x1, b] = pts[i]; return a + (b - a) * creaEase((x - x0) / (x1 - x0 || 1)); }
  return pts[pts.length - 1][1];
};
// smooth noise: passes through k+1 random values in -1..1 (pitch, amplitude, position drifts)
function creaWobble(k) {
  k = Math.max(1, Math.round(k));
  const p = Array.from({ length: k + 1 }, () => Math.random() * 2 - 1);
  return x => { const q = creaClamp(x, 0, 1) * k, i = Math.min(k - 1, Math.floor(q)); return p[i] + (p[i + 1] - p[i]) * creaEase(q - i); };
}
// automates a parameter with a curve (clears the previous one: setValueCurveAtTime doesn't allow overlaps)
function creaSet(param, curve, t, dur) { param.cancelScheduledValues(0); param.setValueCurveAtTime(curve, t, Math.max(0.01, dur)); }
// pan of o.pan shifted (number or [from, to])
const creaPanOff = (pan, d) => Array.isArray(pan) ? [pan[0] + d, pan[1] + d] : (pan || 0) + d;
// waveform with given harmonics (one per context)
const creaWaves = new WeakMap();
function creaWave(ac, key, amps) {
  let m = creaWaves.get(ac);
  if (!m) creaWaves.set(ac, m = {});
  if (!m[key]) { const im = Float32Array.from([0, ...amps]); m[key] = ac.createPeriodicWave(new Float32Array(im.length), im); }
  return m[key];
}
// formant bank: bands = [[hz | curve, q, gain], ...]; the curves run over [t, t + dur]
function creaFormants(E, src, bands, t, dur) {
  const { filt, gain } = E.h, sum = gain(1);
  for (const [f, q, a] of bands) {
    const bp = filt('bandpass', typeof f === 'number' ? f : f[0], q, t);
    if (typeof f !== 'number') creaSet(bp.frequency, f, t, dur);
    src.connect(bp).connect(gain(a)).connect(sum);
  }
  return sum;
}

// ---------- wolf ----------
// a howl: breathy start, rises with a small overshoot, plateau with growing vibrato, falls and closes into "uuu"
function creaHowl(E, o, t, f0, dur, vel, pan) {
  const { ac, osc, noise, filt, gain, out } = E.h;
  const end = t + dur + 0.2, N = 160, r = Math.min(0.7, dur * 0.2) / dur, fall = creaRnd(0.7, 0.8);
  const w = creaWobble(dur * 1.5), up = creaRnd(-0.02, 0.05), mid = Math.max(r + 0.14, creaRnd(0.4, 0.5));
  // slow arched plateau (rises a few semitones and falls back before dropping)
  const pitch = creaPath([[0, 0.6], [r, 1.04], [r + 0.07, 1], [mid, 1.07 + up], [fall, 0.98 + up], [1, 0.7 + up]]);
  // voice break ("yodel") sometimes: drop of ~1.5 semitones over 40-60 ms, fast edges
  const brk = Math.random() < 0.3 ? [creaRnd(0.5, 0.8), creaRnd(0.04, 0.06) / dur] : null;
  const dip = x => { if (!brk) return 1; const q = (x - brk[0]) / brk[1]; return q <= 0 || q >= 1 ? 1 : 1 - 0.083 * Math.min(1, q * 5, (1 - q) * 5); };
  const v = osc('sine', f0, t, end);
  v.setPeriodicWave(creaWave(ac, 'howl', [1, 0.5, 0.3, 0.16, 0.09, 0.05, 0.03]));
  creaSet(v.frequency, creaCurve(Math.ceil(dur * 150), x => f0 * (pitch(x) + 0.03 * w(x)) * dip(x)), t, dur);
  // vibrato: starts at the plateau
  const lfo = osc('sine', creaRnd(4.8, 6.2), t, end), vd = gain(0);
  vd.gain.setValueAtTime(0, t + dur * r); vd.gain.linearRampToValueAtTime(creaRnd(25, 40), t + dur * 0.62);
  lfo.connect(vd).connect(v.detune);
  const vg = gain(0), src = gain(1);
  creaSet(vg.gain, creaCurve(N, creaPath([[0, 0], [r * 0.9, 1], [fall, 0.82], [1, 0]])), t, dur);
  v.connect(vg).connect(src);
  // breath: dominates the start ("hhh") and sits below the voice
  const br = noise(t, end), bbp = filt('bandpass', f0 * 2.6, 0.8), bg = gain(0);
  creaSet(bg.gain, creaCurve(N, creaPath([[0, 0], [0.025, 0.55], [r, 0.16], [fall, 0.1], [1, 0]])), t, dur);
  br.connect(bbp).connect(bg).connect(src);
  // mouth: opens on the rise ("auu") and closes on the fall ("uuu")
  const lp = filt('lowpass', 900, 1.4, t), k = f0 / 420;
  creaSet(lp.frequency, creaCurve(N, x => k * creaPath([[0, 600], [r, 1900], [fall, 1300], [1, 540]])(x)), t, dur);
  const g = gain(0.32 * vel);
  out(src.connect(lp).connect(g), { ...o, pan }, E.sfx, 0.8, t, dur);
}

registerSfx('wolf', (E, o) => {
  const t = E.h.T(o), n = creaClamp(Math.round(o.count ?? 1), 1, 6), vel = (o.vel ?? 1) * (n > 1 ? 1.3 / Math.sqrt(n) : 1);
  const base = o.pitch ?? creaRnd(400, 470), dur = o.dur ?? creaRnd(3, 3.6);
  const steps = [1, 1.19, 0.84, 1.33, 0.75, 1.12];   // not very consonant intervals, like a pack
  let tt = t;
  for (let i = 0; i < n; i++) {
    const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * creaRnd(0.3, 0.7);
    creaHowl(E, o, tt, base * steps[i] * creaRnd(0.97, 1.03), dur * (i ? creaRnd(0.7, 1.05) : 1), vel * (i ? creaRnd(0.65, 0.9) : 1), creaPanOff(o.pan, side));
    tt += creaRnd(0.35, 0.9);
  }
});

// ---------- owl ----------
// barn owl: "uuu ... u-u-uuuuu" (the last one trembles); soft sines with a 2nd harmonic and an "h" breath on each hoot
registerSfx('owl', (E, o) => {
  const { T, osc, noise, filt, gain, out } = E.h;
  const t = T(o), vel = o.vel ?? 1, f0 = (o.pitch ?? 390) * creaRnd(0.95, 1.05);
  const pat = (o.count ?? 4) <= 1 ? [[0, 0.5, 1]] : [[0, creaRnd(0.38, 0.48), 1], [creaRnd(0.85, 1), 0.12, 0.7], [0.1, 0.13, 0.8], [0.12, creaRnd(0.6, 0.8), 1, 1]];
  let tt = t;
  const times = pat.map(([gap, len, a, trem], i) => { tt += i ? gap + pat[i - 1][1] : 0; return [tt, len, a, trem]; });
  const end = tt + pat[pat.length - 1][1] + 0.4, sum = gain(1);
  // shared breath: one envelope per hoot
  const br = noise(t, end, true), bbp = filt('bandpass', f0 * 2.2, 1.4), blp = filt('lowpass', 1800), bg = gain(0);
  br.connect(bbp).connect(blp).connect(bg).connect(sum);
  for (const [ts, len, a, trem] of times) {
    const f = f0 * (trem ? 0.97 : 1) * creaRnd(0.99, 1.01), e = ts + len, g = gain(0);
    const at = Math.min(0.07, len * 0.4), rs = Math.max(ts + at, e - 0.06), lv = 0.46 * vel * a;   // attack and fall without overlapping
    g.gain.setValueAtTime(0, ts); g.gain.linearRampToValueAtTime(lv, ts + at);
    g.gain.setValueAtTime(lv, rs); g.gain.setTargetAtTime(0, rs, Math.min(0.035, len * 0.25));   // short fall: lets the rhythm be heard
    let vib = null;
    if (trem) {
      const l = osc('sine', creaRnd(6, 7.5), ts, e + 0.35);
      vib = gain(0);
      vib.gain.setValueAtTime(0, ts + 0.1); vib.gain.linearRampToValueAtTime(35, ts + len * 0.7);
      l.connect(vib);
    }
    for (const [k, lvl] of [[1, 1], [2, 0.16], [3, 0.04]]) {
      const s = osc('sine', f * k, ts, e + 0.35), fr = s.frequency;
      fr.setValueAtTime(f * k * 0.9, ts); fr.exponentialRampToValueAtTime(f * k, ts + at);
      // the last one bends downward at the end; the others fall a little
      if (trem) { fr.setValueAtTime(f * k, ts + len * 0.7); fr.exponentialRampToValueAtTime(f * k * 0.96, e - 0.08); fr.exponentialRampToValueAtTime(f * k * 0.86, e + 0.04); }
      else { fr.setValueAtTime(f * k, ts + len * 0.6); fr.exponentialRampToValueAtTime(f * k * 0.92, e + 0.04); }
      if (vib) vib.connect(s.detune);
      s.connect(gain(lvl)).connect(g);
    }
    g.connect(sum);
    const b1 = ts + Math.min(0.04, len * 0.25), b2 = ts + Math.min(0.12, len * 0.6), b3 = Math.max(b2, e - 0.04);
    bg.gain.setValueAtTime(0, ts); bg.gain.linearRampToValueAtTime(0.14 * vel * a, b1);
    bg.gain.linearRampToValueAtTime(0.045 * vel * a, b2); bg.gain.setValueAtTime(0.045 * vel * a, b3); bg.gain.linearRampToValueAtTime(0, e + 0.02);
  }
  out(sum, o, E.sfx, 0.3, t, end - t);
});

// ---------- crow ----------
// "craa" caws: sawtooth + sub-harmonic (rasp) + noise, roughness from fast AM, saturation and "aa" formants
registerSfx('crow', (E, o) => {
  const { ac, T, osc, noise, filt, gain, out, distCurve } = E.h;
  const t = T(o), vel = o.vel ?? 1, n = creaClamp(Math.round(o.count ?? 3), 1, 8), f0 = (o.pitch ?? 480) * creaRnd(0.92, 1.08);
  const times = [];
  let tt = t;
  // 0.3-0.5 s gaps (crow cadence); sometimes the last one is short and higher
  const tag = n > 1 && Math.random() < 0.25;
  for (let i = 0; i < n; i++) { const last = i === n - 1, len = creaRnd(0.26, 0.34) * (last ? (tag ? 0.7 : 1.2) : 1); times.push([tt, len, last && tag ? 1.08 : 1]); tt += len + creaRnd(0.28, 0.5); }
  const end = tt + 0.1;
  // shared chain: each caw schedules its pitch, its roughness and its envelope
  const src = gain(1), am = gain(0.4), lfo = osc('sine', 75, t, end), la = gain(0.6);
  lfo.connect(la).connect(am.gain);
  const sh = ac.createWaveShaper(); sh.curve = distCurve(7);
  src.connect(am).connect(gain(1.3)).connect(sh);
  const F1 = filt('bandpass', 1000, 3.5, t), sum = gain(1);
  sh.connect(F1).connect(gain(1)).connect(sum);
  sh.connect(filt('bandpass', 1650, 5)).connect(gain(0.75)).connect(sum);
  sh.connect(filt('bandpass', 2700, 6)).connect(gain(0.4)).connect(sum);
  const amp = gain(0);
  sum.connect(filt('lowpass', 4800)).connect(filt('lowpass', 6000)).connect(amp);
  for (const [ts, len, pk] of times) {
    const f = f0 * pk * creaRnd(0.94, 1.06), e = ts + len, lvl = 0.75 * vel * creaRnd(0.85, 1);
    const s = osc('sawtooth', f, ts, e), sub = osc('sawtooth', f / 2, ts, e), nz = noise(ts, e);
    for (const [x, k] of [[s, 1], [sub, 0.5]]) { x.frequency.setValueAtTime(f * k * 0.82, ts); x.frequency.exponentialRampToValueAtTime(f * k * 1.06, ts + 0.05); x.frequency.exponentialRampToValueAtTime(f * k * 0.7, e); }
    s.connect(src); sub.connect(gain(0.45)).connect(src); nz.connect(gain(0.9)).connect(src);
    lfo.frequency.setValueAtTime(creaRnd(60, 95), ts);
    F1.frequency.setValueAtTime(850, ts); F1.frequency.linearRampToValueAtTime(1150, ts + 0.06); F1.frequency.linearRampToValueAtTime(780, e);
    amp.gain.setValueAtTime(0, ts); amp.gain.linearRampToValueAtTime(lvl, ts + 0.012);
    amp.gain.linearRampToValueAtTime(lvl * 0.7, e - 0.07); amp.gain.linearRampToValueAtTime(0, e);   // "kraa": hit and fade out
  }
  out(amp, o, E.sfx, 0.35, t, end - t);
});

// ---------- bats ----------
// each bat: leather flapping (medium noise + high click per flap) and screeches in bursts;
// everything goes out through its own panning, which follows o.pan (if [from, to] they cross the stereo) and comes closer mid-flight
registerSfx('bats', (E, o) => {
  const { T, osc, noise, filt, gain, out } = E.h;
  const t = T(o), dur = o.dur ?? 2, vel = o.vel ?? 1, n = creaClamp(Math.round(o.count ?? 3), 1, 6);
  for (let b = 0; b < n; b++) {
    const t0 = t + (b ? creaRnd(0, Math.min(0.5, dur * 0.25)) : 0), d = dur - (t0 - t), e = t0 + d, off = creaRnd(-0.3, 0.3);
    const pan = Array.isArray(o.pan) ? [o.pan[0] + off, o.pan[1] + off * 0.5] : [(o.pan || 0) + off - creaRnd(0.2, 0.5), (o.pan || 0) + off + creaRnd(0.2, 0.5)];
    if (Math.random() < 0.5 && !Array.isArray(o.pan)) pan.reverse();
    const near = x => 0.55 + 0.45 * Math.sin(Math.PI * x), lvl = 2 * vel / Math.sqrt(n);
    const sum = gain(1), nz = noise(t0, e, true), wb = filt('bandpass', 600, 1.1), wg = gain(0), cb = filt('bandpass', 1900, 1.3), cg = gain(0);
    nz.connect(filt('highpass', 250)).connect(wb).connect(wg).connect(sum); nz.connect(cb).connect(cg).connect(sum);
    // flaps
    const rate = creaRnd(8, 12);
    for (let tt = t0 + creaRnd(0, 0.05); tt < e - 0.05; tt += creaRnd(0.88, 1.12) / rate) {
      const x = (tt - t0) / d, a = lvl * near(x) * creaRnd(0.65, 1) * Math.min(1, x * 8, (1 - x) * 4);
      wg.gain.setValueAtTime(0, tt); wg.gain.linearRampToValueAtTime(1.1 * a, tt + 0.014); wg.gain.setTargetAtTime(0, tt + 0.014, 0.02);
      wb.frequency.setValueAtTime(420, tt); wb.frequency.exponentialRampToValueAtTime(950, tt + 0.03);
      cg.gain.setValueAtTime(0, tt + 0.006); cg.gain.linearRampToValueAtTime(0.45 * a, tt + 0.011); cg.gain.setTargetAtTime(0, tt + 0.011, 0.008);
    }
    // screeches: bursts of 2-5 downward sweeps (one oscillator per bat)
    const ch = osc('sine', 5000, t0, e), chg = gain(0);
    ch.connect(chg).connect(sum);
    for (let tb = t0 + creaRnd(0, 0.3); tb < e - 0.1; tb += creaRnd(0.25, 0.6)) {
      const k = 2 + Math.floor(Math.random() * 4), fb = creaRnd(3800, 6000);
      for (let j = 0, tc = tb; j < k && tc < e - 0.05; j++, tc += creaRnd(0.028, 0.048)) {
        const x = (tc - t0) / d, f = fb * creaRnd(0.92, 1.08) * (1 + 0.06 * (0.5 - x)), a = 0.4 * lvl * near(x) * creaRnd(0.6, 1);
        ch.frequency.setValueAtTime(f, tc); ch.frequency.exponentialRampToValueAtTime(f * 0.62, tc + 0.022);
        chg.gain.setValueAtTime(0, tc); chg.gain.linearRampToValueAtTime(a, tc + 0.003); chg.gain.setTargetAtTime(0, tc + 0.006, 0.007);
      }
    }
    out(sum.connect(filt('lowpass', 7000)).connect(filt('lowpass', 8500)), { ...o, pan }, E.sfx, 0.2, t0, d);
  }
});

// ---------- skittering ----------
// many little feet on wood or brick: resonant taps of 3-8 ms in short runs with pauses,
// the odd double tap and scrapes; a single noise source and scheduled envelopes (cheap even with hundreds of steps)
registerSfx('skitter', (E, o) => {
  const { ac, T, noise, filt, gain, out, distCurve } = E.h;
  const t = T(o), dur = o.dur ?? 1.5, vel = o.vel ?? 1, n = creaClamp(Math.round(o.count ?? 2), 1, 4);
  for (let c = 0; c < n; c++) {
    const nz = noise(t, t + dur + 0.1), sum = gain(1);
    const legs = [[1500, 9], [2600, 8], [3900, 7]].map(([f, q]) => {
      const g = gain(0);
      nz.connect(g).connect(filt('bandpass', f * creaRnd(0.85, 1.15), q)).connect(sum);
      return g;
    });
    const scr = gain(0);
    nz.connect(scr).connect(filt('bandpass', 3800, 1.3)).connect(sum);
    // surface body: short low resonance
    const body = filt('bandpass', creaRnd(700, 1100), 7), mix = gain(1);
    sum.connect(mix); sum.connect(body).connect(gain(2.8)).connect(mix);
    const lp = filt('lowpass', 6000);
    // soft saturation: clips stray noise peaks without touching the normal taps
    const sh = ac.createWaveShaper(); sh.curve = distCurve(2);
    mix.connect(sh).connect(gain(0.8)).connect(filt('lowpass', 7000)).connect(lp);
    const lvl = 2.4 * vel / Math.sqrt(n), fade = x => Math.min(1, x / 0.08, (1 - x) / 0.15);
    let tt = t + (c ? creaRnd(0.02, 0.2) : 0);
    while (tt < t + dur) {
      const stop = Math.min(t + dur, tt + creaRnd(0.15, 0.5)), rate = creaRnd(28, 50);
      for (; tt < stop; tt += creaRnd(0.6, 1.4) / rate) {
        const a = lvl * creaRnd(0.35, 1) * fade((tt - t) / dur), leg = legs[Math.floor(Math.random() * 3)].gain;
        leg.setValueAtTime(0, tt); leg.linearRampToValueAtTime(a, tt + 0.0004); leg.setTargetAtTime(0, tt + 0.0004, creaRnd(0.0018, 0.0035));   // no step: less peak
        if (Math.random() < 0.25) { const l2 = legs[Math.floor(Math.random() * 3)].gain, t2 = tt + creaRnd(0.003, 0.007); l2.setValueAtTime(0, t2); l2.linearRampToValueAtTime(a * 0.6, t2 + 0.0004); l2.setTargetAtTime(0, t2 + 0.0004, 0.0015); }
        if (Math.random() < 0.1) { scr.gain.setValueAtTime(0, tt); scr.gain.linearRampToValueAtTime(a * 0.2, tt + 0.006); scr.gain.setTargetAtTime(0, tt + 0.006, 0.012); }
      }
      tt += creaRnd(0.05, 0.22);
    }
    out(lp, { ...o, pan: creaPanOff(o.pan, c ? creaRnd(-0.25, 0.25) : 0) }, E.sfx, 0.15, t, dur);
  }
});

// ---------- roar ----------
// big monster: saws with a sub-harmonic and a pitch that rises and drags, irregular AM growl,
// noise breath, saturation and formants that open ("aaa") and close ("ooo"); body 80-300 Hz
registerSfx('roar', (E, o) => {
  const { ac, T, osc, noise, filt, gain, out, distCurve } = E.h;
  const t = T(o), dur = o.dur ?? 2.6, vel = o.vel ?? 1, end = t + dur + 0.1, N = 160, f0 = (o.pitch ?? 82) * creaRnd(0.92, 1.08);
  const w = creaWobble(dur * 4), w2 = creaWobble(dur * 3), op = Math.min(0.35, 0.45 / dur);
  // start: pitch jump x1.5 in the first 25 ms (bark) and then the normal arc
  const b = 0.025 / dur, pc0 = creaPath([[0, 0.78], [op, 1.14], [0.6, 1], [1, 0.62]]);
  const pc = x => x < b * 3 ? pc0(x) * (1 + 0.5 * Math.min(x / b, (b * 3 - x) / (b * 2))) : pc0(x);
  const src = gain(1);
  for (const [k, d, a] of [[1, -9, 1], [1, 10, 0.8], [0.5, 0, 0.2]]) {
    const s = osc('sawtooth', f0 * k, t, end);
    s.detune.value = d;
    creaSet(s.frequency, creaCurve(N, x => f0 * k * pc(x) * (1 + 0.035 * w(x))), t, dur);
    s.connect(gain(a)).connect(src);
  }
  // breath: puff at the start, low, and a snort at the end
  const nz = noise(t, end), nzp = noise(t, end, true), ng = gain(0);
  creaSet(ng.gain, creaCurve(N, creaPath([[0, 0.5], [0.05, 0.22], [0.5, 0.2], [0.85, 0.42], [1, 0.18]])), t, dur);
  nz.connect(gain(1)).connect(ng); nzp.connect(gain(1.2)).connect(ng); ng.connect(src);
  // growl: irregular AM between 22 and 38 Hz, stronger toward the end
  const am = gain(0.6), lfo = osc('sine', 30, t, end), la = gain(0);
  creaSet(lfo.frequency, creaCurve(N, x => 30 + 8 * w2(x)), t, dur);
  creaSet(la.gain, creaCurve(N, x => 0.42 + 0.25 * x), t, dur);
  lfo.connect(la).connect(am.gain);
  const sh = ac.createWaveShaper(); sh.curve = distCurve(6);
  src.connect(am).connect(gain(0.9)).connect(sh);
  const F = (a, b, c) => creaCurve(N, creaPath([[0, a], [op, b], [0.65, b * 0.92], [1, c]]));
  const sum = creaFormants(E, sh, [[F(450, 850, 460), 4.5, 3.2], [F(950, 1300, 880), 6, 2.4], [F(2300, 2700, 2200), 7, 1]], t, dur);
  // chest: 150-300 Hz (what a mid-size speaker does reproduce), no sub-bass
  sh.connect(filt('bandpass', 210, 1.2)).connect(gain(0.6)).connect(sum);
  // initial bark: noise 900-1800 Hz that peaks in ~20 ms and fades in ~80 ms
  const bk = noise(t, t + 0.15), bkg = gain(0);
  bkg.gain.setValueAtTime(0, t); bkg.gain.linearRampToValueAtTime(0.9, t + 0.02); bkg.gain.setTargetAtTime(0, t + 0.03, 0.03);
  bk.connect(filt('highpass', 900)).connect(filt('lowpass', 1800)).connect(bkg).connect(sum);
  const amp = gain(0);
  creaSet(amp.gain, creaCurve(N, x => 0.27 * vel * creaPath([[0, 0], [b, 0.8], [Math.max(op * 0.35, b * 2), 1], [0.55, 0.85], [0.8, 0.6], [1, 0]])(x)), t, dur);
  out(sum.connect(filt('highpass', 110)).connect(filt('highpass', 90)).connect(filt('lowpass', 5500)).connect(filt('lowpass', 7000)).connect(amp), o, E.sfx, 0.45, t, dur);
});

// ---------- heartbeat ----------
// "pum-pum": falling sine (thump), 100-200 Hz body and dull noise, with soft saturation so the
// heartbeat is heard on mid-size speakers and not only as sub-bass. o.gap = lub-dub spacing
registerSfx('heartbeat', (E, o) => {
  const { ac, T, osc, noise, filt, gain, perc, out, distCurve } = E.h;
  const t = T(o), vel = o.vel ?? 1, gap = o.gap ?? creaRnd(0.24, 0.28), sum = gain(1);
  for (const [dt, v, k, dec] of [[0, 1, 1, 0.2], [gap, 0.7, 1.12, 0.15]]) {
    const tt = t + dt, a = v * creaRnd(0.92, 1);
    const s = osc('sine', 120 * k, tt, tt + dec + 0.1), g = perc(tt, a * 0.8, dec, 0.008);
    s.frequency.exponentialRampToValueAtTime(70 * k, tt + 0.07);
    s.connect(g).connect(sum);
    const b = osc('triangle', 170 * k, tt, tt + dec), bg = perc(tt, a * 0.8, dec * 0.6, 0.006);
    b.frequency.exponentialRampToValueAtTime(95 * k, tt + 0.06);
    b.connect(bg).connect(sum);
    const n = noise(tt, tt + 0.1, true), lp = filt('lowpass', 900, 0.8), ng = perc(tt, a * 0.9, 0.05, 0.004);
    n.connect(lp).connect(ng).connect(sum);
    const kn = osc('sine', 330 * k, tt, tt + 0.08), kg = perc(tt, a * 0.6, 0.045, 0.003);
    kn.frequency.exponentialRampToValueAtTime(210 * k, tt + 0.04);
    kn.connect(kg).connect(sum);
    // skin: ~25 ms noise thump at 250-450 Hz (definition at a distance)
    const sk = noise(tt, tt + 0.06), sg = perc(tt, a * 0.7, 0.025, 0.002);
    sk.connect(filt('bandpass', 340, 1.6)).connect(sg).connect(sum);
  }
  const sh = ac.createWaveShaper(); sh.curve = distCurve(2.5);
  out(sum.connect(gain(0.9)).connect(sh).connect(filt('highpass', 55)).connect(filt('lowpass', 1100)).connect(gain(0.6 * vel)), o, E.sfx, 0.08, t, gap + 0.3);
});

// ---------- cat ----------
// cat meow / yowl in heat: sawtooth with formants that move from closed "m" to open "aa" and to "uu";
// high formants (short vocal tract), rising pitch, irregular vibrato and some breath
function creaCatVoice(E, o, meow) {
  const { ac, T, osc, noise, filt, gain, out } = E.h;
  const t = T(o), vel = o.vel ?? 1, dur = o.dur ?? (meow ? creaRnd(0.65, 0.85) : creaRnd(1.5, 2)), end = t + dur + 0.1, N = 128;
  const f0 = (o.pitch ?? (meow ? 600 : 470)) * creaRnd(0.92, 1.08), w = creaWobble(meow ? 3 : dur * 5);
  const pitch = meow ? creaPath([[0, 0.85], [0.3, 1.25], [0.6, 1.15], [1, 0.8]]) : creaPath([[0, 0.8], [0.22, 1.1], [0.5, 1.75], [0.75, 1.6], [1, 1.05]]);
  // nasal source: harmonics that fall off quickly (a pure sawtooth sounds like a synth)
  const s = osc('sine', f0, t, end);
  s.setPeriodicWave(creaWave(ac, 'cat', [1, 0.6, 0.4, 0.25, 0.15, 0.1, 0.06, 0.04]));
  creaSet(s.frequency, creaCurve(N, x => f0 * (pitch(x) + (meow ? 0.01 : 0.035) * w(x))), t, dur);
  if (!meow) {
    const l = osc('sine', creaRnd(6.5, 8), t, end), ld = gain(0);
    ld.gain.setValueAtTime(0, t + dur * 0.35); ld.gain.linearRampToValueAtTime(45, t + dur * 0.7);
    l.connect(ld).connect(s.detune);
  }
  const src = gain(1), nz = noise(t, end);
  s.connect(src); nz.connect(gain(0.15)).connect(src);
  const P = pts => creaCurve(N, creaPath(pts));
  const op = meow ? 0.3 : 0.45;
  const sum = creaFormants(E, src, [
    [P([[0, meow ? 380 : 680], [op, 1150], [0.75, 1000], [1, 640]]), 5, 1],   // meow: closed "m" → "iaa"
    [P([[0, meow ? 2100 : 1300], [op, 1900], [0.75, 1700], [1, 1100]]), 7, 0.8],
    [P([[0, 3200], [op, 3800], [1, 3000]]), 8, 0.45],
  ], t, dur);
  src.connect(filt('lowpass', 900)).connect(gain(0.2)).connect(sum);
  // "rrr" roughness in the upper part of the yowl
  const rough = gain(1);
  if (!meow) {
    const l2 = osc('sine', creaRnd(28, 40), t, end), rd = gain(0);
    creaSet(rd.gain, creaCurve(N, creaPath([[0, 0], [0.4, 0], [0.6, 0.35], [0.85, 0.2], [1, 0]])), t, dur);
    l2.connect(rd).connect(rough.gain);
  }
  const amp = gain(0);
  creaSet(amp.gain, creaCurve(N, x => (meow ? 2 : 1.3) * vel * creaPath(meow ? [[0, 0], [0.1, 0.15], [0.3, 1], [0.75, 0.8], [1, 0]] : [[0, 0], [0.15, 0.3], [0.5, 1], [0.8, 0.85], [1, 0]])(x)), t, dur);
  out(sum.connect(rough).connect(filt('lowpass', 6000)).connect(filt('lowpass', 4500)).connect(amp), o, E.sfx, 0.4, t, dur);
}

// hiss: initial spit, hissing with peaks at 3 and 6 kHz and irregular breath, low growl underneath
function creaCatHiss(E, o) {
  const { T, osc, noise, filt, gain, perc, out } = E.h;
  const t = T(o), vel = o.vel ?? 1, dur = o.dur ?? creaRnd(0.9, 1.3), end = t + dur + 0.1, N = 96, w = creaWobble(dur * 9), sum = gain(1);
  const sp = noise(t, t + 0.08), sg = perc(t, 0.8 * vel, 0.045, 0.002);
  sp.connect(filt('bandpass', 2400, 0.7)).connect(sg).connect(sum);
  const nz = noise(t, end), p1 = filt('peaking', 3200, 1.2), p2 = filt('peaking', 5800, 1.5), g = gain(0);
  p1.gain.value = 9; p2.gain.value = 5;
  creaSet(g.gain, creaCurve(N, x => 0.22 * vel * creaPath([[0, 0], [0.04, 0.7], [0.15, 1], [0.8, 0.8], [1, 0]])(x) * (1 + 0.25 * w(x))), t + 0.015, dur);
  nz.connect(filt('highpass', 1700)).connect(p1).connect(p2).connect(filt('lowpass', 7000)).connect(filt('lowpass', 7500)).connect(g).connect(sum);
  // low "rrr" growl
  const gr = osc('sawtooth', creaRnd(48, 60), t, end), am = gain(0.5), lfo = osc('sine', creaRnd(20, 28), t, end), la = gain(0.5);
  lfo.connect(la).connect(am.gain);
  const gg = gain(0);
  creaSet(gg.gain, creaCurve(N, x => 0.13 * vel * creaPath([[0, 0], [0.15, 1], [0.8, 0.9], [1, 0]])(x)), t, dur);
  gr.connect(filt('bandpass', 260, 0.9)).connect(am).connect(gg).connect(sum);
  out(sum, o, E.sfx, 0.25, t, dur);
}

registerSfx('cat', (E, o) => {
  const kind = o.kind ?? 'yowl';
  if (kind === 'hiss') creaCatHiss(E, o);
  else creaCatVoice(E, o, kind === 'meow');
});

// ---------- rat ----------
// short high squeaks (2.5-4 kHz) in bursts: arched, falling or rising, some with a trill; one oscillator for the whole burst.
// Each squeak starts with a pitch break upward, reaches its peak soon and fades; irregular AM of 60-90 Hz (lively)
registerSfx('ratSqueak', (E, o) => {
  const { T, osc, noise, filt, gain, out } = E.h;
  const t = T(o), vel = o.vel ?? 1, n = creaClamp(Math.round(o.count ?? 2 + Math.random() * 3), 1, 10), f0 = (o.pitch ?? 3000) * creaRnd(0.9, 1.1);
  const times = [];
  let tt = t + 0.03;   // the sources are already sounding (silently) when the first one opens: no click
  for (let i = 0; i < n; i++) { const len = creaRnd(0.05, 0.15); times.push([tt, len]); tt += len + creaRnd(0.03, 0.14); }
  const end = tt + 0.1, s = osc('sine', f0, t, end), h = osc('sine', f0 * 2, t, end), g = gain(0);
  const tr = osc('sine', creaRnd(28, 40), t, end), trg = gain(0);
  tr.connect(trg); trg.connect(s.detune); trg.connect(h.detune);
  s.connect(g); h.connect(gain(0.12)).connect(g);
  // breath: band that follows the pitch, cut to 1.5-6.5 kHz (no high hiss)
  const nb = filt('bandpass', f0, 5);
  noise(t, end).connect(nb).connect(filt('highpass', 1500)).connect(filt('lowpass', 6500)).connect(gain(0.3)).connect(g);
  // irregular AM
  const am = gain(0.8), al = osc('sine', creaRnd(60, 90), t, end), ad = gain(0.2);
  al.connect(ad).connect(am.gain); g.connect(am);
  const SHAPES = [[[0, 0.82], [0.35, 1.08], [1, 0.9]], [[0, 1.12], [1, 0.78]], [[0, 0.85], [0.8, 1.1], [1, 1.02]]];
  for (const [ts, len] of times) {
    const f = f0 * creaRnd(0.88, 1.12), sh = SHAPES[Math.floor(Math.random() * 3)], a = 0.66 * vel * creaRnd(0.7, 1), pk = ts + len * creaRnd(0.25, 0.35);
    for (const [p, k] of [[s.frequency, 1], [h.frequency, 2], [nb.frequency, 1]]) {
      const f1 = f * k * sh[0][1];
      p.setValueAtTime(f1 * creaRnd(1.12, 1.19), ts); p.linearRampToValueAtTime(f1, ts + 0.012);   // 2-3 semitone break
      for (const [x, v] of sh.slice(1)) p.linearRampToValueAtTime(f * k * v, ts + x * len);
    }
    al.frequency.setValueAtTime(creaRnd(60, 90), ts);
    trg.gain.setValueAtTime(Math.random() < 0.3 ? creaRnd(50, 90) : 0, ts);
    g.gain.setValueAtTime(0, ts); g.gain.linearRampToValueAtTime(a, pk); g.gain.linearRampToValueAtTime(a * 0.35, ts + len * 0.8); g.gain.linearRampToValueAtTime(0, ts + len);
  }
  out(am, o, E.sfx, 0.25, t, end - t);
});

// ---------- zombie ----------
// "uuaaarrgh" groan: low voice with a dragging pitch, throat rasp (vocal fry) by AM in irregular pulses,
// breath, saturation and weak formants u → a → o → u. o.count = several zombies out of sync
function creaGroan(E, o, t, f0, dur, vel, pan) {
  const { ac, osc, noise, filt, gain, out, distCurve } = E.h;
  const end = t + dur + 0.1, N = 160, w = creaWobble(dur * 3), wa = creaWobble(dur * 4);
  const pitch = creaPath([[0, 0.92], [0.3, 1.12], [0.65, 1], [1, 0.78]]);
  const src = gain(1);
  for (const [d, a] of [[-7, 1], [8, 0.7]]) {
    const s = osc('sawtooth', f0, t, end);
    s.detune.value = d;
    creaSet(s.frequency, creaCurve(N, x => f0 * (pitch(x) + 0.05 * w(x))), t, dur);
    s.connect(gain(a)).connect(src);
  }
  noise(t, end, true).connect(gain(0.45)).connect(src);
  // rasp: irregular pulses of 24-36 Hz, stronger on entering and leaving
  const fry = gain(0.55), fl = osc('sawtooth', 30, t, end), fd = gain(0);
  creaSet(fl.frequency, creaCurve(N, x => 30 + 6 * wa(x)), t, dur);
  creaSet(fd.gain, creaCurve(N, creaPath([[0, 0.45], [0.25, 0.22], [0.6, 0.28], [1, 0.45]])), t, dur);
  fl.connect(fd).connect(fry.gain); src.connect(fry);
  const sh = ac.createWaveShaper(); sh.curve = distCurve(4);
  fry.connect(sh);
  const P = pts => creaCurve(N, creaPath(pts));
  const sum = creaFormants(E, sh, [
    [P([[0, 330], [0.3, 640], [0.65, 500], [1, 360]]), 5, 2.4],
    [P([[0, 780], [0.3, 1100], [0.65, 880], [1, 720]]), 6, 1.6],
    [2500, 7, 0.5],
  ], t, dur);
  sh.connect(filt('bandpass', 180, 1.2)).connect(gain(0.3)).connect(sum);
  // gurgle: deep little bubbles in the second half
  const gb = osc('sine', 200, t, end), gg = gain(0);
  for (let tb = t + dur * creaRnd(0.35, 0.5), k = 0; tb < t + dur * 0.92 && k < 7; tb += creaRnd(0.05, 0.16), k++) {
    const f = creaRnd(160, 320);
    gb.frequency.setValueAtTime(f, tb); gb.frequency.exponentialRampToValueAtTime(f * 1.8, tb + 0.03);
    gg.gain.setValueAtTime(0, tb); gg.gain.linearRampToValueAtTime(creaRnd(0.08, 0.16), tb + 0.004); gg.gain.setTargetAtTime(0, tb + 0.004, 0.012);
  }
  gb.connect(gg).connect(sum);
  const amp = gain(0);
  creaSet(amp.gain, creaCurve(N, x => 0.62 * vel * creaPath([[0, 0], [0.12, 0.8], [0.3, 1], [0.7, 0.85], [1, 0]])(x) * (1 + 0.15 * wa(x))), t, dur);
  out(sum.connect(filt('highpass', 100)).connect(filt('lowpass', 5000)).connect(amp), { ...o, pan }, E.sfx, 0.5, t, dur);
}

registerSfx('zombieGroan', (E, o) => {
  const t = E.h.T(o), n = creaClamp(Math.round(o.count ?? 1), 1, 5), vel = (o.vel ?? 1) * (n > 1 ? 1.2 / Math.sqrt(n) : 1);
  let tt = t;
  for (let i = 0; i < n; i++) {
    creaGroan(E, o, tt, (o.pitch ?? 95) * creaRnd(0.82, 1.2), (o.dur ?? 2.4) * creaRnd(0.85, 1.15), vel * (i ? creaRnd(0.7, 0.95) : 1), creaPanOff(o.pan, i ? creaRnd(-0.6, 0.6) : 0));
    tt += creaRnd(0.4, 1.1);
  }
});

// ---------- beast breathing ----------
// noise through the resonances of a huge throat, with snore (low AM); on the inhale the resonances rise
// and swell up to a dry cut; on the exhale it pushes hard, drops and fades, with a low growl underneath
function creaBreath(E, o, t, inhale, dur, vel) {
  const { osc, noise, filt, gain, out } = E.h;
  const end = t + dur + 0.1, N = 128, w = creaWobble(dur * 6);
  const src = gain(1);
  noise(t, end).connect(gain(inhale ? 0.35 : 0.15)).connect(src);
  noise(t, end, true).connect(gain(inhale ? 0.6 : 1)).connect(src);
  const am = gain(0.7), lfo = osc('triangle', creaRnd(18, 28), t, end), la = gain(0.3);
  lfo.connect(la).connect(am.gain); src.connect(am);
  const k = x => inhale ? 0.85 + 0.35 * x : 1.1 - 0.35 * x;
  const sum = creaFormants(E, am, [
    [creaCurve(N, x => 300 * k(x)), 3, 1],
    [creaCurve(N, x => 850 * k(x)), 4, 0.75],
    [creaCurve(N, x => 1900 * k(x)), 5, 0.45],
    [3300, 3, inhale ? 0.4 : 0.15],
  ], t, dur);
  if (!inhale) {
    const gr = osc('sawtooth', creaRnd(46, 56), t, end), gg = gain(0);
    gr.frequency.linearRampToValueAtTime(40, t + dur);
    creaSet(gg.gain, creaCurve(N, x => 0.16 * Math.min(1, x / 0.06) * Math.pow(1 - x, 1.5)), t, dur);
    gr.connect(filt('bandpass', 200, 1)).connect(gg).connect(sum);
  }
  const shape = inhale ? x => Math.pow(x, 1.3) * Math.min(1, (1 - x) / 0.05) : x => Math.min(1, x / 0.05) * Math.pow(1 - x, 1.3);
  const amp = gain(0);
  creaSet(amp.gain, creaCurve(N, x => (inhale ? 3.5 : 3.8) * vel * shape(x) * (1 + 0.18 * w(x))), t, dur);
  out(sum.connect(filt('highpass', 90)).connect(filt('lowpass', 5000)).connect(filt('lowpass', 7000)).connect(amp), o, E.sfx, 0.3, t, dur);
}

registerSfx('monsterBreath', (E, o) => {
  const t = E.h.T(o), ph = o.phase ?? 'both', vel = o.vel ?? 1, dIn = o.dur ?? creaRnd(1.1, 1.4), dOut = o.dur ?? creaRnd(1.4, 1.8);
  if (ph !== 'out') creaBreath(E, o, t, true, dIn, vel);
  if (ph !== 'in') creaBreath(E, o, ph === 'out' ? t : t + dIn + creaRnd(0.1, 0.25), false, dOut, vel);
});

// ---------- flies ----------
// swarm: each fly is a filtered 170-250 Hz saw (wingbeat), with a random path:
// volume by distance, panning by position and Doppler by radial speed (the ones passing close change pitch)
registerSfx('flies', (E, o) => {
  const { ac, T, osc, filt, gain, out } = E.h;
  const t = T(o), dur = o.dur ?? 3, vel = o.vel ?? 1, n = creaClamp(Math.round(o.count ?? 5), 1, 10), end = t + dur + 0.1;
  const N = Math.max(48, Math.ceil(dur * 60)), sum = gain(1), lvl = 0.5 * vel / Math.sqrt(n);
  const fade = x => Math.min(1, x * dur / 0.4, (1 - x) * dur / 0.6);
  for (let i = 0; i < n; i++) {
    const f0 = creaRnd(170, 250), wx = creaWobble(dur * 1.2 + 1), wz = creaWobble(dur * 1.2 + 1), wf = creaWobble(dur * 5 + 2), wa = creaWobble(dur * 9 + 2);
    const pos = x => [wx(x) * 1.3, 0.35 + 0.6 * (wz(x) + 1)], dist = x => Math.hypot(...pos(x)), dx = 1 / (N - 1);
    const amps = new Float32Array(N), pans = new Float32Array(N), fr = new Float32Array(N);
    for (let j = 0; j < N; j++) {
      const x = j * dx, p = pos(x), d = Math.hypot(...p), vr = (dist(x + dx) - d) / (dur * dx);
      amps[j] = lvl * fade(x) * (1 + 0.3 * wa(x)) / d; pans[j] = creaClamp(p[0] / d, -1, 1); fr[j] = f0 * creaClamp(1 - 0.05 * vr, 0.85, 1.15) * (1 + 0.025 * wf(x));
    }
    const s = osc('sawtooth', f0, t, end), g = gain(0), p = ac.createStereoPanner();
    creaSet(s.frequency, fr, t, dur); creaSet(g.gain, amps, t, dur); creaSet(p.pan, pans, t, dur);
    s.connect(filt('bandpass', creaRnd(900, 1800), 0.8)).connect(g).connect(p).connect(sum);
  }
  out(sum.connect(filt('lowpass', 5000)), o, E.sfx, 0.15, t, dur);
});

// ---------- bones ----------
// skeleton rattling like a dry xylophone: each bone has bar modes 1 : 2.76 : 5.4 (fixed sines, one per mode)
// with envelopes that fire on each impact (low ~20 ms, highs shorter), plus a noise "clack" and the cavity
// of the body (350-500 Hz). Each impact hits two bones almost at once. o.count = number of impacts
registerSfx('boneRattle', (E, o) => {
  const { T, osc, noise, filt, gain, out } = E.h;
  const t = T(o), vel = o.vel ?? 1, n = creaClamp(Math.round(o.count ?? 12), 1, 40);
  // rhythm: groups of 2-4 quick impacts separated by short gaps
  const hits = [];
  let tt = t;
  while (hits.length < n) {
    const k = 2 + Math.floor(Math.random() * 3);
    for (let j = 0; j < k && hits.length < n; j++) { hits.push(tt); tt += creaRnd(0.025, 0.055); }
    tt += creaRnd(0.05, 0.13);
  }
  const end = tt + 0.2, sum = gain(1);
  // body cavity: wide band that picks up the noise of each impact, at a low level
  const nz = noise(t, end), hg = gain(0);
  nz.connect(filt('bandpass', creaRnd(350, 500), 3)).connect(hg).connect(sum);
  const ck = gain(0);
  nz.connect(filt('bandpass', 2400, 1.1)).connect(filt('lowpass', 5500)).connect(ck).connect(sum);
  // bones: (6 x (3 sines + 3 gains + 2 envelopes)) fixed nodes, reused on all impacts
  const bones = [620, 840, 1080, 1370, 1750, 2150].map(f => {
    f *= creaRnd(0.93, 1.07);
    const lo = gain(0), hi = gain(0);
    lo.connect(sum); hi.connect(sum);
    for (const [m, a] of [[1, 1], [2.76, 0.5], [5.4, 0.25]]) if (f * m < 7500) osc('sine', f * m * creaRnd(0.99, 1.01), t, end).connect(gain(a)).connect(m === 1 ? lo : hi);
    return [lo.gain, hi.gain];
  });
  const lvl = 0.3 * vel;
  // continuous hit (no jumps even while the bone still rings): rises with τ 0.4 ms and falls with τ
  const hit = (p, th, a, tau) => { p.setTargetAtTime(a, th, 0.0004); p.setTargetAtTime(0, th + 0.0016, tau); };
  for (const h of hits) {
    const a = lvl * creaRnd(0.55, 1), b1 = Math.floor(Math.random() * bones.length), b2 = (b1 + 1 + Math.floor(Math.random() * (bones.length - 1))) % bones.length;
    for (const [b, dt, k] of [[b1, 0, 1], [b2, creaRnd(0.001, 0.006), creaRnd(0.5, 0.9)]]) {
      const [lo, hi] = bones[b], th = h + dt;
      hit(lo, th, a * k, creaRnd(0.014, 0.024)); hit(hi, th, a * k, creaRnd(0.005, 0.009));
    }
    // contact clack (falls with τ 0.8 ms) and hollow hit
    hit(ck.gain, h, a * 1.6, 0.0008); hit(hg.gain, h, a * 1.2, 0.006);
  }
  out(sum.connect(filt('highpass', 180)).connect(filt('lowpass', 7000)).connect(filt('lowpass', 8000)), o, E.sfx, 0.18, t, end - t);
});
