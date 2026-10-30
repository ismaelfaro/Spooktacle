// Effects: voices (laughs, cackles, ghosts, groans, boo!, screams, whispers, giggles, choir).
// Each effect: registerSfx(name, (E, o) => ...); E.h brings the synthesis pieces (see createAudioEngine in js/audio.js).
// o = { t, pan, vel, wet, ... }: t audio instant (default now), pan -1..1 or [from, to].
//
// Almost all use the same synthetic Klatt-style voice (voxMake): glottal source (falling harmonics, jitter, roughness)
// + aspiration (noise) → cascaded vocal tract (5 resonators that move from vowel to vowel) → lips → output.
// Syllables, pitch and vowels are scheduled with automations: few nodes per voice (~25) even with many syllables.

// formants (Hz) of an adult male voice; each voice scales them (×1.15 woman, ×1.3 child, ×0.86 giant)
const VOX_F = {
  a: [750, 1200, 2550, 3500, 4500], ah: [640, 1180, 2450, 3450, 4500], ae: [690, 1700, 2600, 3550, 4500],
  e: [470, 1850, 2550, 3500, 4500], eh: [560, 1750, 2500, 3500, 4500], i: [290, 2250, 3000, 3600, 4500],
  ih: [400, 2000, 2600, 3600, 4500], o: [480, 860, 2550, 3450, 4500], oo: [400, 920, 2400, 3350, 4400],
  u: [330, 780, 2300, 3350, 4500], m: [260, 1050, 2200, 3300, 4400],
};
// resonance of each formant: [typical frequency, bandwidth] → Q in dB of the resonant low-pass
const VOX_BW = [[600, 90], [1400, 110], [2500, 160], [3500, 250], [4500, 320]];
const voxQ = (i, bw = 1) => 20 * Math.log10(VOX_BW[i][0] / (VOX_BW[i][1] * bw));

// voice: k = { t, end, f0, vowel, scale, bw, tilt, jit, rough, roughHz, sub, twang, bright, lips, hp, level }
// tilt: harmonic falloff (0.8 tense/scream, 1.1 normal, 1.6+ breathy) · jit: cents of micro-variation
// rough: roughness (irregular amplitude modulation at roughHz) · sub: sub-octave (monster voice)
// bright: dB of presence above ~2 kHz (it reads better outdoors)
// v.voiced.gain / v.asp.gain: loudness and aspiration · v.lips.frequency: lips (closed ≈ 400 Hz)
function voxMake(E, k) {
  const { ac, osc, noise, filt, gain, drift, pw } = E.h;
  const t = k.t, end = k.end, base = k.f0, sc = k.scale ?? 1, bw = k.bw ?? 1, tilt = k.tilt ?? 1.1;
  const wave = pw('vox' + tilt.toFixed(2), Array.from({ length: 160 }, (_, n) => Math.pow(n + 1, -tilt)));
  // pitch in cents above f0: moves the source and the sub-octave together; jitter on top
  const pc = ac.createConstantSource();
  pc.offset.value = 0; pc.start(t); pc.stop(end + 0.05);
  drift(t, end, 30).connect(gain((k.jit ?? 12) * 2)).connect(pc.offset);
  const glot = gain(1), s = osc('sine', base, t, end);
  s.setPeriodicWave(wave); pc.connect(s.detune); s.connect(glot);
  if (k.sub) { const so = osc('sine', base / 2, t, end); so.setPeriodicWave(wave); pc.connect(so.detune); so.connect(gain(k.sub)).connect(glot); }
  // roughness: irregular amplitude modulation (broken voice, throat clearing)
  let src = glot, rough = null;
  if (k.rough) {
    const rg = gain(1);
    rough = gain(k.rough * 2);
    drift(t, end, (k.roughHz ?? 60) * 2).connect(rough).connect(rg.gain);
    glot.connect(rg); src = rg;
  }
  const voiced = gain(0), asp = gain(0), sum = gain(1);
  src.connect(voiced).connect(sum);
  noise(t, end).connect(filt('highpass', 400, -3, t)).connect(asp).connect(sum);
  // cascaded tract: each formant is a resonant low-pass (natural relative amplitudes)
  const V = VOX_F[k.vowel] || VOX_F.a, tract = [];
  let n = sum;
  for (let i = 0; i < 5; i++) { const r = filt('lowpass', V[i] * sc, voxQ(i, bw), t); n.connect(r); n = r; tract.push(r); }
  if (k.twang) {
    // nasal and shrill: a hollow toward 1.1 kHz, brightness toward 3 kHz
    const a = filt('peaking', 1100 * sc, 2, t), b = filt('peaking', 3000 * sc, 1.4, t);
    a.gain.value = -12; b.gain.value = 8;
    n.connect(a).connect(b); n = b;
  }
  const pres = filt('highshelf', 2000 * sc, 0, t), lips = filt('lowpass', k.lips ?? 9000, -3, t), o = gain(k.level ?? 1);
  pres.gain.value = k.bright ?? 5;
  n.connect(pres).connect(lips).connect(filt('highpass', k.hp ?? 90, -3, t)).connect(o);
  const cents = hz => 1200 * Math.log2(Math.max(20, hz) / base);
  return {
    pc, voiced, asp, rough, lips, tract, out: o,
    // pitch: ramp (exponential in Hz) up to tt · jump at tt
    pitch: (tt, hz) => pc.offset.linearRampToValueAtTime(cents(hz), tt),
    pitchSet: (tt, hz) => pc.offset.setValueAtTime(cents(hz), tt),
    // formants toward the vowel; f = extra scale, f1min = minimum F1 (in a high voice F1 follows the pitch)
    say(tt, vowel, tc = 0.03, f = 1, f1min = 0) {
      const W = VOX_F[vowel] || VOX_F.a;
      let prev = 0;
      for (let i = 0; i < 5; i++) {
        const hz = i ? Math.max(W[i] * sc * f, prev * 1.25) : Math.max(W[0] * sc * f, f1min);
        tract[i].frequency.setTargetAtTime(hz, tt, tc);
        prev = hz;
      }
    },
  };
}

// "ha" syllable: aspiration burst (h) and a falling vowel; a = intensity, h = length of the h, ha = strength of the h
// vr = vowel closure (short = staccato: each syllable closes before the next)
function voxSyl(v, t, len, a, h = 0.04, ha = 0.5, vr = 0.02) {
  const g = v.voiced.gain, b = v.asp.gain;
  b.setTargetAtTime(a * ha, t, 0.006); b.setTargetAtTime(a * ha * 0.15, t + h, 0.02); b.setTargetAtTime(0, t + len * 0.8, 0.02);
  g.setTargetAtTime(a, t + h * 0.7, 0.01); g.setTargetAtTime(a * 0.7, t + h + 0.03, len * 0.35); g.setTargetAtTime(0, t + len, vr);
}

// vibrato (cents) that grows over `rise` seconds
function voxVib(E, v, t, end, rate, depth, rise = 0.3) {
  const { osc, gain } = E.h, g = gain(0);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(depth, t + rise);
  osc('sine', rate, t, end).connect(g).connect(v.pc.offset);
}

// requested panning or, if none, a gentle random drift
function voxPan(o, spread = 0.5, move = 0.4) {
  if (o.pan !== undefined) return o.pan;
  const p = (Math.random() * 2 - 1) * spread;
  return [p, p + (Math.random() * 2 - 1) * move];
}

// low evil laugh: "MWAH-ha-ha-ha-ha-HAAAA" with a falling pitch and a dragged final "haaa"
// o.count = number of short "ha" (4), o.pitch = pitch (Hz)
registerSfx('laugh', (E, o) => {
  const { T, out, rnd } = E.h;
  const t = T(o), vel = o.vel ?? 1, n = Math.min(12, Math.max(1, Math.round(o.count ?? 4))), f0 = (o.pitch ?? 112) * rnd(0.93, 1.07);
  const step = 0.21 * rnd(0.94, 1.08), t1 = t + 0.44, tf = t1 + n * step, fin = 1.5 * rnd(0.9, 1.15), end = tf + fin + 0.5;
  const v = voxMake(E, { t, end, f0, vowel: 'm', scale: 0.86, tilt: 1.0, jit: 14, rough: 0.2, roughHz: 55, sub: 0.12, hp: 150, bright: 8, lips: 420, level: 0.095 * vel });
  const g = v.voiced.gain, b = v.asp.gain;
  // "M": nasal murmur with the lips closed
  v.pitchSet(t, f0 * 0.92);
  g.setTargetAtTime(0.6, t, 0.012);
  // "MWAH": lips open (u → a) and the pitch rises with emphasis
  const tu = t + 0.16;
  v.lips.frequency.setTargetAtTime(9000, tu, 0.025);
  v.say(tu, 'u', 0.012); v.say(tu + 0.045, 'a', 0.03);
  g.setTargetAtTime(1, tu, 0.02);
  v.pitch(tu, f0 * 0.98); v.pitch(tu + 0.11, f0 * 1.25); v.pitch(t + 0.38, f0 * 1.12);
  g.setTargetAtTime(0, t + 0.35, 0.025);
  // short "ha"s: breathy h + "a", each one lower
  for (let i = 0; i < n; i++) {
    const ts = t1 + i * step + rnd(-0.012, 0.012), fi = f0 * (1.14 - i * 0.065) * rnd(0.98, 1.02), len = step * 0.66;
    voxSyl(v, ts, len, 1 - i * 0.05, 0.05, 0.8);
    v.pitchSet(ts, fi * 1.03); v.pitch(ts + len, fi * 0.88);
    v.say(ts, 'a', 0.02, rnd(0.96, 1.04));
  }
  // final "HAAAA": long, sinks to low with vibrato and throat clearing
  b.setTargetAtTime(0.6, tf, 0.006); b.setTargetAtTime(0.1, tf + 0.06, 0.03);
  g.setTargetAtTime(1.05, tf + 0.035, 0.012); g.setTargetAtTime(0.75, tf + 0.25, fin * 0.35); g.setTargetAtTime(0, tf + fin - 0.2, 0.12);
  b.setTargetAtTime(0.25, tf + fin * 0.55, 0.25); b.setTargetAtTime(0, tf + fin, 0.1);
  v.pitchSet(tf, f0 * 1.06); v.pitch(tf + 0.18, f0 * 1.12); v.pitch(tf + fin * 0.5, f0 * 0.86); v.pitch(tf + fin, f0 * 0.55);
  v.say(tf, 'a', 0.02); v.say(tf + fin * 0.5, 'ah', fin * 0.3);
  voxVib(E, v, tf + 0.25, end, 5.2, 28, fin * 0.5);
  v.rough.gain.setTargetAtTime(1.4, tf + fin * 0.45, 0.3);
  out(v.out, o, E.sfx, 0.42, t, end - t);
});

// witch cackle: "JIII-ke-ke-ke-ke!" high, nasal, raspy and speeding up; o.count = number of "ke" (8), o.pitch
registerSfx('cackle', (E, o) => {
  const { T, out, rnd } = E.h;
  const t = T(o), vel = o.vel ?? 1, n = Math.min(20, Math.max(2, Math.round(o.count ?? 8))), f0 = (o.pitch ?? 620) * rnd(0.93, 1.08);
  const ts = [];
  let tt = t + 0.34, d = 0.15 * rnd(0.95, 1.08);
  for (let i = 0; i < n; i++) { ts.push(tt); tt += d; d = Math.max(0.078, d * 0.9); }
  const end = tt + 0.6;
  const v = voxMake(E, { t, end, f0, vowel: 'ih', scale: 1.2, bw: 1.7, tilt: 0.92, jit: 40, rough: 0.4, roughHz: 90, twang: true, hp: 180, level: 0.16 * vel });
  const g = v.voiced.gain, b = v.asp.gain;
  // starting "JIII!", high and rising
  b.setTargetAtTime(0.5, t, 0.005); b.setTargetAtTime(0.12, t + 0.04, 0.02); b.setTargetAtTime(0, t + 0.26, 0.03);
  g.setTargetAtTime(0.7, t + 0.025, 0.015); g.setTargetAtTime(0, t + 0.24, 0.025);
  v.pitchSet(t, f0 * 1.15); v.pitch(t + 0.2, f0 * 1.45); v.pitch(t + 0.27, f0 * 1.3);
  v.say(t, 'ih', 0.02, 1, f0 * 1.3); v.say(t + 0.1, 'eh', 0.05, 1, f0 * 1.6);
  // "ke-ke-ke" speeding up, each one lower and weaker
  for (let i = 0; i < n; i++) {
    const s = ts[i], len = (ts[i + 1] ?? s + 0.1) - s, x = i / (n - 1), fi = f0 * (1.22 - 0.38 * x) * rnd(0.96, 1.04);
    voxSyl(v, s, len * 0.62, 1 - 0.4 * x, 0.022, 0.6, 0.012);
    v.pitchSet(s, fi * 0.95); v.pitch(s + len * 0.22, fi * 1.06); v.pitch(s + len * 0.62, fi * 0.88);
    v.say(s, Math.random() < 0.6 ? 'eh' : 'ae', 0.012, rnd(0.97, 1.05), fi * 1.15);
  }
  // final gasp
  b.setTargetAtTime(0.28, tt, 0.02); b.setTargetAtTime(0, tt + 0.3, 0.07);
  v.say(tt, 'i', 0.03);
  out(v.out, o, E.sfx, 0.3, t, end - t);
});

// ghost moan: airy "uuuOOOOuuu" that rises and falls; two voices almost in unison (unsettling beating)
// o.dur (2.4), o.pitch (300 Hz)
registerSfx('ghost', (E, o) => {
  const { T, out, rnd } = E.h;
  const t = T(o), vel = o.vel ?? 1, dur = Math.max(0.8, o.dur ?? 2.4), f0 = (o.pitch ?? 300) * rnd(0.94, 1.06), end = t + dur * 1.15 + 0.4;
  const p = voxPan(o, 0.5, 0.35), pan = Array.isArray(p) ? p : [p, p];
  // random contour on each call (so five ghosts in a row don't sound like the same sample)
  const J = () => rnd(0.92, 1.08), F = () => rnd(0.9, 1.1), peak = Math.random() < 0.3 ? 'o' : 'ah';
  const C = [[0.15, 1.12], [0.32, 1.5], [0.45, 1.7], [0.58, 1.6], [0.8, 1.12]].map(([x, y]) => [x * F(), y * J()]);
  const dl = rnd(0.04, 0.08);
  // main: more brightness (F2/F3) so "uu-OO" is understood · second: breathier, enters slowly (no double attack)
  for (const [ratio, delay, lvl, dp, tilt, fade] of [[1, 0, 1, 0, 1.3, 0.12], [rnd(1.006, 1.012), dl, 0.5, 0.25, 1.5, 0.25]]) {
    const ts = t + delay, d = dur - delay * 0.5, fr = f0 * ratio;
    const v = voxMake(E, { t: ts, end, f0: fr, vowel: 'u', scale: 1.12, bw: 1.1, tilt, jit: 10, bright: 8, hp: 180, level: 0.042 * lvl * vel });
    const g = v.voiced.gain, b = v.asp.gain;
    g.setTargetAtTime(1, ts, d * fade); g.setTargetAtTime(0, ts + d * 0.68, d * 0.11);
    b.setTargetAtTime(0.9, ts, 0.06 + fade * 0.4); b.setTargetAtTime(0.5, ts + d * 0.3, 0.2); b.setTargetAtTime(0, ts + d * 0.8, d * 0.08);
    v.pitchSet(ts, fr);
    for (const [x, y] of C) v.pitch(ts + d * Math.min(0.95, x), fr * y);
    v.pitch(ts + d, fr * 0.85 * J());
    v.say(ts, 'u', 0.05); v.say(ts + d * 0.2, 'o', d * 0.08); v.say(ts + d * 0.38, peak, d * 0.08, 1, fr * 1.8);
    v.say(ts + d * 0.62, 'o', d * 0.08); v.say(ts + d * 0.82, 'u', d * 0.08);
    voxVib(E, v, ts + 0.2, end, rnd(4.8, 5.8), 40, d * 0.5);
    voxVib(E, v, ts, end, rnd(0.7, 1.1), 25, 0.5);
    out(v.out, { ...o, pan: [pan[0] + dp, pan[1] - dp] }, E.sfx, 0.75, ts, d);
  }
});

// low zombie / lost soul groan: "mmmuuuaaaooo" hoarse, with throat clearing and bursts of air
// (unlike ghost: low, voiced and rough instead of high and airy); o.dur (2.6), o.pitch (105 Hz)
registerSfx('moan', (E, o) => {
  const { T, out, rnd } = E.h;
  const t = T(o), vel = o.vel ?? 1, dur = Math.max(0.8, o.dur ?? 2.6), f0 = (o.pitch ?? 105) * rnd(0.92, 1.08), end = t + dur + 0.3;
  const v = voxMake(E, { t, end, f0, vowel: 'm', scale: 0.92, tilt: 1.1, jit: 35, rough: 0.5, roughHz: 36, sub: 0.08, bright: 9, hp: 150, lips: 480, level: 0.085 * vel });
  const g = v.voiced.gain, b = v.asp.gain, J = () => rnd(0.92, 1.08), F = () => rnd(0.9, 1.1);
  g.setTargetAtTime(0.6, t, 0.08);
  v.lips.frequency.setTargetAtTime(9000, t + dur * 0.12, 0.08);
  // vowels: the center changes on each call ("muaao", "muooa", "muaau"…)
  const mid = [['ah', 'o'], ['o', 'ah'], ['ah', 'oo'], ['a', 'o']][Math.floor(Math.random() * 4)];
  v.say(t + dur * 0.1, 'u', 0.06); v.say(t + dur * 0.3 * F(), mid[0], dur * 0.1); v.say(t + dur * 0.62 * F(), mid[1], dur * 0.1); v.say(t + dur * 0.85, 'u', dur * 0.08);
  // bursts of air (number and place random)
  for (let k = rnd(0.12, 0.2); k < 0.82; k += rnd(0.1, 0.26)) g.setTargetAtTime(rnd(0.65, 1), t + dur * k, rnd(0.06, 0.14));
  g.setTargetAtTime(0, t + dur * 0.88, dur * 0.06);
  b.setTargetAtTime(0.18, t, 0.2); b.setTargetAtTime(0.3, t + dur * 0.8, 0.15); b.setTargetAtTime(0, t + dur, 0.08);
  v.pitchSet(t, f0 * 0.88 * J()); v.pitch(t + dur * 0.35 * F(), f0 * 1.1 * J()); v.pitch(t + dur * 0.6 * F(), f0 * J()); v.pitch(t + dur, f0 * 0.74 * J());
  voxVib(E, v, t + 0.3, end, rnd(3.3, 4.3), 18, dur * 0.4);
  out(v.out, { ...o, pan: voxPan(o, 0.4, 0.2) }, E.sfx, 0.5, t, dur);
});

// playful "BOO!" (friendly): b with closed lips that bursts, an exclaimed "uu" (rises and falls) and a tremor
// o.dur = length of the "uu" (0.5), o.pitch (160 Hz)
registerSfx('boo', (E, o) => {
  const { T, out, noise, filt, gain, perc, rnd } = E.h;
  const t = T(o), vel = o.vel ?? 1, len = Math.max(0.25, o.dur ?? 0.5), f0 = (o.pitch ?? 160) * rnd(0.94, 1.08), tr = t + 0.03, end = tr + len + 0.35;
  const v = voxMake(E, { t, end, f0, vowel: 'u', scale: 1, bw: 1.15, tilt: 0.95, jit: 10, rough: 0.06, bright: 7, hp: 140, lips: 380, level: 0.24 * vel });
  const g = v.voiced.gain, b = v.asp.gain, mix = gain(1);
  v.out.connect(mix);
  // b: voiced bar with closed lips and an explosion
  g.setTargetAtTime(0.3, t, 0.008);
  v.lips.frequency.setTargetAtTime(9000, tr, 0.005);
  b.setTargetAtTime(0.9, tr, 0.0015); b.setTargetAtTime(0.05, tr + 0.012, 0.008); b.setTargetAtTime(0, tr + len, 0.05);
  // click of the "b" outside the tract (if it goes through the "u" it sounds like a dull thump) + short body
  noise(tr, tr + 0.06).connect(filt('bandpass', rnd(2000, 2400), 0.8, tr)).connect(perc(tr, 0.35 * vel, 0.012, 0.001)).connect(mix);
  noise(tr, tr + 0.1).connect(filt('lowpass', 300, 0, tr)).connect(perc(tr, 0.5 * vel, 0.05, 0.002)).connect(filt('highpass', 140, -3, tr)).connect(mix);
  v.say(t, 'u', 0.01, 0.8); v.say(tr + 0.005, 'oo', 0.03);
  g.setTargetAtTime(1, tr + 0.004, 0.01); g.setTargetAtTime(0.7, tr + 0.12, len * 0.4); g.setTargetAtTime(0, tr + len, 0.07);
  // exclamation pitch: jumps up suddenly and falls
  v.pitchSet(t, f0 * 0.95); v.pitch(tr, f0); v.pitch(tr + 0.09, f0 * 1.45 * rnd(0.95, 1.05)); v.pitch(tr + 0.22, f0 * 1.32); v.pitch(tr + len, f0 * 0.82 * rnd(0.94, 1.06));
  voxVib(E, v, tr + 0.18, end, rnd(6, 7), 30, len * 0.5);
  out(mix, o, E.sfx, 0.4, t, len);
});

// scream of fright: rough "AAAAH!", the pitch shoots up and then falls; two throats (high + broken) and an initial hit
// o.dur (2.1)
registerSfx('scream', (E, o) => {
  const { T, out, osc, noise, filt, gain, perc, drive, drift, rnd } = E.h;
  const t = T(o), vel = o.vel ?? 1, dur = Math.max(0.8, o.dur ?? 2.1), end = t + dur + 0.2, mix = gain(1);
  // break: sudden upward pitch jump (~70 ms) mid-scream
  const tc = t + dur * rnd(0.36, 0.46), cr = rnd(1.18, 1.3);
  for (const [f0, sc, rough, rh, lvl] of [[640, 1.25, 0.35, 110, 1], [330, 1, 0.5, 70, 0.55]]) {
    const fr = f0 * rnd(0.94, 1.06);
    const v = voxMake(E, { t, end, f0: fr, vowel: 'a', scale: sc, bw: 2, tilt: 0.78, jit: 90, rough, roughHz: rh, hp: 150, level: 0.05 * lvl });
    const g = v.voiced.gain, b = v.asp.gain;
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(1, t + 0.012); g.setTargetAtTime(0.72, t + 0.35, 0.35); g.setTargetAtTime(0, t + dur - 0.3, 0.12);
    // aspiration: hit, sustain and a breathy ending (runs out of air)
    b.setValueAtTime(0, t); b.linearRampToValueAtTime(0.8, t + 0.008); b.setTargetAtTime(0.28, t + 0.05, 0.1);
    b.setTargetAtTime(0.6, t + dur - 0.45, 0.12); b.setTargetAtTime(0, t + dur - 0.1, 0.07);
    // pitch: shoots up, holds unstable (chaotic drift, not a siren), breaks and falls
    const pc = 1.75 + (1.6 - 1.75) * Math.max(0, Math.min(1, (tc - t - 0.45) / (dur * 0.62 - 0.45)));
    v.pitchSet(t, fr); v.pitch(t + 0.13, fr * 2); v.pitch(t + 0.45, fr * 1.75);
    if (dur >= 1.3) { v.pitch(tc, fr * pc); v.pitchSet(tc + 0.004, fr * pc * cr); v.pitchSet(tc + 0.07, fr * pc * 0.99); }
    v.pitch(t + dur * 0.62, fr * 1.6); v.pitch(t + dur, fr * 0.8);
    drift(t, end, rnd(10, 14)).connect(gain(55)).connect(v.pc.offset);
    // roughness that grows toward the end
    v.rough.gain.setTargetAtTime(rough * 4.5, t + dur * 0.5, dur * 0.25);
    // mouth wide open: F1 follows the pitch
    v.say(t, 'a', 0.02, 1, fr * 1.1); v.say(t + 0.06, 'a', 0.05, 1.08, fr * 2.1); v.say(t + dur * 0.6, 'ah', 0.3, 1, fr * 1.5);
    v.out.connect(mix);
  }
  // broken throat (saturation) without the intermodulation lows and with a cap on the highs
  const og = gain(0.7 * vel);
  mix.connect(drive(4)).connect(filt('highpass', 220, -3, t)).connect(filt('lowpass', 7500, -3, t)).connect(og);
  // initial hit (mid body, not sub-bass) + click with no extra highs
  const th = osc('sine', 200, t, t + 0.3);
  th.frequency.exponentialRampToValueAtTime(110, t + 0.12);
  th.connect(perc(t, 0.4, 0.16)).connect(og);
  noise(t, t + 0.12).connect(filt('bandpass', 1800, 0.7, t)).connect(filt('lowpass', 5000, -3, t)).connect(perc(t, 0.35, 0.06)).connect(og);
  out(og, o, E.sfx, 0.5, t, dur);
});

// unintelligible whispers floating across the stereo: several noise voices with random syllables (s, sh, f, t, k, p + vowel)
// o.dur (3 s), o.count = number of voices (3, max 6)
registerSfx('whisper', (E, o) => {
  const { T, out, noise, filt, gain, rnd } = E.h;
  const t = T(o), vel = o.vel ?? 1, dur = Math.max(0.5, o.dur ?? 3), n = Math.min(6, Math.max(1, Math.round(o.count ?? 3))), end = t + dur, lvl = Math.sqrt(3 / n);
  const VW = ['a', 'e', 'i', 'o', 'u', 'ah', 'eh'], CS = ['s', 'sh', 'f', 'h', 't', 'k', 'p', 's', 'sh', 'h'];
  for (let w = 0; w < n; w++) {
    const t0 = t + (w ? rnd(0.15, 0.7) : 0), sc = rnd(1, 1.25);
    if (w && end - t0 < 0.4) continue;
    const nz = noise(t0, end + 0.1), vg = gain(0), fb = filt('bandpass', 5000, 2, t0), fg = gain(0), sum = gain(1), tract = [];
    // whispered vowels: the same noise through the tract (4 resonators; F1 very damped, as in whispering)
    nz.connect(vg);
    let x = vg;
    for (let i = 0; i < 4; i++) { const r = filt('lowpass', VOX_F.a[i] * sc, voxQ(i, i ? 1.4 : 3), t0); x.connect(r); x = r; tract.push(r); }
    x.connect(sum);
    // fricatives and plosives: noise band that changes color (with an extra cap: no hiss above ~8 kHz)
    nz.connect(fb).connect(filt('lowpass', 7500, 0, t0)).connect(fg).connect(sum);
    const og = gain(0.35 * lvl * vel * rnd(0.75, 1)), air = filt('highshelf', 1800, 0, t0);
    air.gain.value = 4;
    sum.connect(filt('highpass', 550, -3, t0)).connect(air).connect(filt('lowpass', 7000, -3, t0)).connect(og);
    let tt = t0 + 0.03;
    while (tt < end - 0.3) {
      const c = CS[Math.floor(Math.random() * CS.length)], a = rnd(0.6, 1);
      let tv = tt;
      if (c === 's' || c === 'sh' || c === 'f') {
        const len = rnd(0.06, 0.13), [ff, q, lv] = c === 's' ? [rnd(4500, 6000), 3, 0.55] : c === 'sh' ? [rnd(2600, 3400), 2.5, 0.75] : [rnd(3000, 4200), 0.7, 0.3];
        fb.frequency.setValueAtTime(ff, tt); fb.Q.setValueAtTime(q, tt);
        fg.gain.setTargetAtTime(lv * a, tt, 0.015); fg.gain.setTargetAtTime(0, tt + len, 0.015);
        tv = tt + len * 0.85;
      } else if (c !== 'h') {
        const [ff, q] = c === 't' ? [4300, 1.5] : c === 'k' ? [2200, 2.5] : [1000, 1];
        fb.frequency.setValueAtTime(ff, tt); fb.Q.setValueAtTime(q, tt);
        fg.gain.setTargetAtTime(0.55 * a, tt, 0.002); fg.gain.setTargetAtTime(0, tt + 0.012, 0.008);
        tv = tt + 0.03;
      }
      // vowel (when whispering F1 rises a little)
      const W = VOX_F[VW[Math.floor(Math.random() * VW.length)]], vl = rnd(0.08, 0.18);
      for (let i = 0; i < 4; i++) tract[i].frequency.setTargetAtTime(W[i] * sc * (i ? 1 : 1.12), Math.max(tt, tv - 0.02), 0.025);
      vg.gain.setTargetAtTime(a, tv, c === 'h' ? 0.03 : 0.012); vg.gain.setTargetAtTime(0, tv + vl, 0.025);
      tt = tv + vl + rnd(0.03, 0.07);
      if (Math.random() < 0.22) tt += rnd(0.12, 0.35);
    }
    // each voice crosses the stereo on its own
    let pan;
    if (o.pan === undefined) { const a0 = rnd(-0.9, 0.9); pan = [a0, -a0 * rnd(0.4, 1)]; }
    else { const s = rnd(-0.35, 0.35), p = Array.isArray(o.pan) ? o.pan : [o.pan, o.pan]; pan = [p[0] + s, p[1] - s]; }
    out(og, { ...o, pan }, E.sfx, 0.6, t0, end - t0);
  }
});

// unsettling childlike giggle: "ji-ji-ji-jiiii" breathy, childlike, that ends trembling and with an inhale;
// with an echo on the other side (as if from another room). o.count = number of "ji" (6), o.pitch (400 Hz)
registerSfx('giggle', (E, o) => {
  const { ac, T, out, filt, gain, rnd } = E.h;
  const t = T(o), vel = o.vel ?? 1, n = Math.min(16, Math.max(2, Math.round(o.count ?? 6))), f0 = (o.pitch ?? 400) * rnd(0.93, 1.08);
  const ts = [];
  let tt = t + 0.02, d = 0.125 * rnd(0.92, 1.08);
  for (let i = 0; i < n; i++) { ts.push(tt); tt += d; d *= i < n / 2 ? 0.93 : 1.06; }
  const tl = tt + 0.04, ll = 0.38, tb = tl + ll + 0.18, end = tb + 0.4;
  const v = voxMake(E, { t, end, f0, vowel: 'ih', scale: 1.32, bw: 1.5, tilt: 1.35, jit: 16, rough: 0.12, roughHz: 70, hp: 200, level: 0.13 * vel });
  const b = v.asp.gain;
  for (let i = 0; i < n; i++) {
    const s = ts[i], x = i / (n - 1), fi = f0 * (1 + 0.28 * Math.sin(Math.PI * x) - 0.08 * x) * rnd(0.97, 1.03), len = 0.075;
    voxSyl(v, s, len, 0.75 + 0.25 * Math.sin(Math.PI * x), 0.032, 0.7, 0.012);
    v.pitchSet(s, fi * 0.97); v.pitch(s + len * 0.4, fi * 1.06); v.pitch(s + len, fi * 0.93);
    v.say(s, Math.random() < 0.65 ? 'ih' : 'eh', 0.012, rnd(0.97, 1.04), fi * 1.15);
  }
  // final "jiiii", long and trembling
  voxSyl(v, tl, ll, 0.9, 0.04, 0.7);
  v.pitchSet(tl, f0 * 1.05); v.pitch(tl + 0.12, f0 * 1.42); v.pitch(tl + ll, f0 * 1.15);
  v.say(tl, 'ih', 0.02, 1, f0 * 1.5);
  voxVib(E, v, tl + 0.06, end, 7.5, 40, 0.15);
  // final inhale (air drawn in)
  v.say(tb - 0.02, 'i', 0.02);
  b.setTargetAtTime(0.55, tb, 0.05); b.setTargetAtTime(0, tb + 0.24, 0.05);
  // echo on the other side
  const p = voxPan(o, 0.4, 0.3), pe = Array.isArray(p) ? p[1] : p, dl = ac.createDelay(1), eg = gain(0.32);
  dl.delayTime.value = 0.31;
  v.out.connect(dl).connect(filt('lowpass', 2600, -3, t)).connect(eg);
  out(v.out, { ...o, pan: p }, E.sfx, 0.45, t, end - t);
  out(eg, { ...o, pan: pe >= 0 ? -0.75 : 0.75 }, E.sfx, 0.6, t, end - t);
});

// dramatic short choir hit "AAH!": low and high voices, two singers per note (one on each side),
// attack with an "h" and portamento toward the note, vibrato that enters late and a fall on release; "singer's formant" brightness.
// o.notes (midi, max 10), o.dur (0.7), o.vowel ('a')
registerSfx('choirSting', (E, o) => {
  const { T, out, osc, noise, filt, gain, pw, panner, drift, rnd } = E.h;
  const t = T(o), vel = o.vel ?? 1, dur = Math.max(0.15, o.dur ?? 0.7), rel = 0.6, end = t + dur + rel * 3, V = VOX_F[o.vowel] || VOX_F.a;
  const notes = (o.notes ?? [50, 57, 62, 65, 69, 74]).slice(0, 10);
  const wave = pw('vox1.00', Array.from({ length: 160 }, (_, n) => 1 / (n + 1)));
  // shared envelope: hit, falls to a sustain and fades out
  const eg = gain(0), p = eg.gain;
  p.setValueAtTime(0, t); p.linearRampToValueAtTime(1, t + 0.025); p.setTargetAtTime(0.55, t + 0.06, 0.15); p.setTargetAtTime(0, t + dur, rel / 3);
  for (const hi of [false, true]) {
    const ns = notes.filter(m => (m >= 60) === hi);
    if (!ns.length) continue;
    const sc = hi ? 1.16 : 0.98, ng = gain(0);
    // breath: "h" on the attack and a bit of air under the sustain (shared by the section)
    ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.35 * ns.length, t + 0.01); ng.gain.setTargetAtTime(0.08 * ns.length, t + 0.04, 0.05);
    noise(t, t + dur + rel).connect(filt('highpass', 500, -3, t)).connect(ng);
    // singers per note: left, right and (high ones, if there's room) one in the center
    const sides = [[-0.4, -7], [0.4, 6]];
    if (hi && ns.length <= 4) sides.push([0, rnd(-3, 3)]);
    for (const [side, dt] of sides) {
      const src = gain(1), vib = osc('sine', rnd(4.6, 6), t, end), va = gain(0);
      ng.connect(src);
      // row vibrato (enters late)
      va.gain.setValueAtTime(0, t + 0.15); va.gain.linearRampToValueAtTime(rnd(12, 20), t + 0.5);
      vib.connect(va);
      for (const m of ns) {
        // each singer enters a little out of phase (the attacks don't add up) and with its own pitch tremor
        const on = t + rnd(0, 0.025), s = osc('sine', midiHz(m), on, end), dd = dt + rnd(-3, 3), ne = gain(0), sh = gain(rnd(6, 12));
        s.setPeriodicWave(wave);
        s.detune.setValueAtTime(dd - 80, on); s.detune.setTargetAtTime(dd, on, rnd(0.018, 0.035)); s.detune.setTargetAtTime(dd - 45, t + dur, rel * 0.6);
        va.connect(s.detune); drift(on, end, rnd(3, 6)).connect(sh).connect(s.detune);
        ne.gain.setValueAtTime(0, on); ne.gain.linearRampToValueAtTime(1, on + 0.02);
        s.connect(ne).connect(src);
      }
      // tract of the row, each one with its own panning
      let x = src;
      for (let i = 0; i < 5; i++) { const r = filt('lowpass', V[i] * sc * rnd(0.98, 1.02), voxQ(i, 1.3), t); x.connect(r); x = r; }
      x.connect(panner(side * (hi ? 0.8 : 1))).connect(eg);
    }
  }
  // singer's formant (~2.9 kHz) and presence: you hear "AAH" and not an organ
  const sf = filt('peaking', rnd(2800, 3000), 1.2, t), pr = filt('highshelf', 2000, 0, t), og = gain(0.1 * vel / Math.sqrt(notes.length));
  sf.gain.value = 7.5; pr.gain.value = 4;
  eg.connect(filt('highpass', 130, -3, t)).connect(sf).connect(pr).connect(og);
  out(og, o, E.sfx, 0.7, t, dur);
});
