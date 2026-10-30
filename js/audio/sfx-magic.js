// Effects: magic and details.
// Each effect: registerSfx(name, (E, o) => ...); E.h brings the synthesis pieces (see createAudioEngine in js/audio.js).
// o = { t, pan, vel, wet, ... }: t audio instant (default now), pan -1..1 or [from, to].
// sparkle, pop, slime, toll, spellZap, broomFlyby, musicBoxWind, ghostShimmer, bubble.

// ---------- common pieces (magic prefix: the scripts share the global scope) ----------
function magicRand(a, b) { return a + Math.random() * (b - a); }
function magicPick(list) { return list[Math.floor(Math.random() * list.length)]; }
function magicClampPan(p) { return Math.max(-1, Math.min(1, p || 0)); }
// curve of n points fn(u), u from 0 to 1 (for setValueCurveAtTime)
function magicCurve(n, fn) { const c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = fn(i / (n - 1)); return c; }
// twinkle: random peaks that fade fast; dens(u) = probability per point
function magicTwinkle(n, dens, decay = 0.9) {
  const c = new Float32Array(n);
  let lvl = 0;
  for (let i = 0; i < n; i++) {
    if (Math.random() < dens(i / (n - 1))) lvl = Math.max(lvl, magicRand(0.35, 1));
    c[i] = lvl; lvl *= decay;
  }
  c[n - 1] = 0;
  return c;
}
// ascending major pentatonic notes from root
function magicPenta(root, count) { const S = [0, 2, 4, 7, 9], r = []; for (let i = 0; i < count; i++) r.push(root + 12 * Math.floor(i / 5) + S[i % 5]); return r; }
// glockenspiel-style bell: fundamental + detuned twin (beating) + short 2.76 partial
function magicChime(E, t, f, amp, dec, dest, twin = true, att = 0.0015) {
  const { osc, gain, perc } = E.h;
  const g = perc(t, amp, dec, att);
  osc('sine', f, t, t + dec).connect(g);
  if (twin) osc('sine', f * 1.0035, t, t + dec).connect(gain(0.5)).connect(g);
  g.connect(dest);
  if (f * 2.76 < 9000) { const g2 = perc(t, amp * 0.2, dec * 0.3, 0.001); osc('sine', f * 2.76, t, t + dec * 0.3).connect(g2).connect(dest); }
}
// open stereo mix: two internal panners (L, R) that add up in mix
function magicSpread(E, width) {
  const { ac, gain } = E.h, mix = gain(1);
  const side = w => { const p = ac.createStereoPanner(); p.pan.value = w; p.connect(mix); return p; };
  const L = side(-width), R = side(width);
  return { mix, L, R, any: () => (Math.random() < 0.5 ? L : R) };
}

// magic glitter: rising arpeggio that speeds up + noise twinkle + high flashes
registerSfx('sparkle', (E, o) => {
  const { T, noise, filt, gain, out } = E.h;
  const t = T(o), v = o.vel ?? 1, dur = o.dur ?? 1.4, sp = magicSpread(E, 0.45);
  const root = magicPick([79, 81, 84]) + (o.pitch ?? 0), notes = o.notes ?? magicPenta(root, o.count ?? 8);
  let tt = t;
  notes.forEach((m, i) => {
    const k = i / Math.max(1, notes.length - 1), f = midiHz(m) * Math.pow(2, magicRand(-8, 8) / 1200);
    magicChime(E, tt, f, v * 0.2 * (1 - k * 0.35), 1 - k * 0.45, i % 2 ? sp.R : sp.L, true, 0.003);
    tt += (0.07 - 0.035 * k) * magicRand(0.8, 1.2);
  });
  const arp = tt - t;
  // loose flashes above the arpeggio
  for (let i = 0; i < 10; i++) {
    const u = Math.pow(Math.random(), 0.8), tw = t + 0.1 + u * (dur - 0.35);
    magicChime(E, tw, midiHz(root + magicPick([19, 21, 24, 26, 28, 31])), v * 0.056 * (1 - u * 0.6), magicRand(0.6, 0.8), sp.any(), Math.random() < 0.5);
  }
  // twinkle: bright noise (4-8 kHz) opened at random peaks
  const n = noise(t, t + dur), bp = filt('bandpass', 4500, 1.6), lp = filt('lowpass', 6500, -3), lp2 = filt('lowpass', 7500, -3), tw = gain(0), lv = gain(0), ra = Math.min(0.25, dur * 0.4);
  tw.gain.setValueCurveAtTime(magicTwinkle(Math.round(dur * 300), u => 0.2 * (1 - u * 0.7), 0.86), t, dur);
  lv.gain.setValueAtTime(0, t); lv.gain.linearRampToValueAtTime(0.17 * v, t + ra); lv.gain.linearRampToValueAtTime(0, t + dur);
  n.connect(tw).connect(bp).connect(lp).connect(lp2).connect(lv).connect(sp.mix);
  // fairy breath: noise that rises with the arpeggio
  const n2 = noise(t, t + arp + 0.3, true), bp2 = filt('bandpass', 1200, 2.2), g2 = gain(0);
  bp2.frequency.setValueAtTime(1200, t); bp2.frequency.exponentialRampToValueAtTime(6000, t + arp + 0.2);
  g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(0.12 * v, t + arp * 0.7); g2.gain.linearRampToValueAtTime(0, t + arp + 0.3);
  n2.connect(bp2).connect(g2).connect(sp.mix);
  out(sp.mix, o, E.sfx, 0.5, t, dur);
});

// cartoon pop (pumpkin appearing): crack + a rising "blop" + short low thump. o.pitch, o.magic (trail)
registerSfx('pop', (E, o) => {
  const { T, osc, noise, filt, gain, env, perc, out } = E.h;
  const t = T(o), v = o.vel ?? 1, p = (o.pitch ?? 1) * magicRand(0.85, 1.18), sum = gain(1);
  // crack: noise burst of a few ms (the cork), no extra highs
  const n = noise(t, t + 0.03), bp = filt('bandpass', 2400 * p, 1.2), ng = perc(t, 0.15 * v, 0.01, 0.0015);
  n.connect(bp).connect(filt('lowpass', 5000, -3)).connect(ng).connect(sum);
  // "blop": the cavity opens and the pitch jumps up; holds 35 ms so it lasts at a distance.
  // explicit 2nd and 3rd harmonics (presence on small speakers) instead of saturating: no squeaky harmonics
  const f0 = 230 * p, sg = env(t, 0.003, 0.26 * v, 0.035, 0.18);
  for (const [h, a] of [[1, 1], [2, 0.22], [3, 0.08]]) {
    const s = osc('sine', f0 * h, t, t + 0.4);
    s.frequency.exponentialRampToValueAtTime(f0 * h * 3.3, t + 0.05); s.frequency.exponentialRampToValueAtTime(f0 * h * 3.9, t + 0.26);
    s.connect(gain(a)).connect(sg);
  }
  sg.connect(sum);
  // very short low body: weight at a distance
  const b = osc('sine', 160 * p, t, t + 0.1), bg = perc(t, 0.15 * v, 0.06, 0.002);
  b.frequency.exponentialRampToValueAtTime(75, t + 0.07);
  b.connect(bg).connect(sum);
  if (o.magic) for (let i = 0; i < 3; i++) magicChime(E, t + 0.06 + i * 0.05, midiHz(magicPick([88, 91, 93, 96, 100])), 0.07 * v, 0.3, sum, false);
  out(sum, o, E.sfx, 0.18, t, 0.35);
});

// viscous slime: noise splashing through a resonant filter that moves in jerks + thick bubbles + sticky strings that snap.
// o.dur (scales the duration, ~0.6 s)
registerSfx('slime', (E, o) => {
  const { ac, T, osc, noise, filt, gain, perc, out, distCurve } = E.h;
  const t = T(o), v = o.vel ?? 1, sc = (o.dur ?? 0.6) / 0.6, sum = gain(1);
  // chained blurps: [start, length, rest frequency, opening frequency, strength]; the first is the big one
  const blobs = [], nb = 3 + Math.floor(Math.random() * 3);
  let s0 = 0;
  for (let i = 0; i < nb; i++) {
    const l = (i ? magicRand(0.06, 0.13) : magicRand(0.15, 0.22)) * sc;
    blobs.push([s0, l, magicRand(200, 340), magicRand(900, 1800), i ? magicRand(0.45, 0.85) : 1]);
    s0 += l * magicRand(0.55, 1.05);
  }
  const dur = s0 + blobs[nb - 1][1] + 0.08, N = Math.round(dur * 400), fl = magicRand(24, 38), ph = Math.random() * 6;
  // frequency: each blurp opens (rises) and closes (falls) the filter's "mouth"; amplitude with fast gurgling
  const fc = magicCurve(N, u => {
    let f = 280, w = 0;
    for (const [s, l, lo, hi, a] of blobs) { const k = (u * dur - s) / l; if (k > 0 && k < 1.5) { const e = a * Math.exp(-k * 2) * Math.min(1, k * 8); if (e > w) { w = e; f = lo + (hi - lo) * Math.sin(Math.PI * Math.min(1, k * 0.9 + 0.05)); } } }
    return f;
  });
  const ga = magicCurve(N, u => {
    let a = 0;
    for (const [s, l, , , st] of blobs) { const k = (u * dur - s) / l; if (k > 0) a += st * Math.min(1, k * 10) * Math.exp(-k * 2.6); }
    return Math.min(1.1, a) * (0.6 + 0.4 * Math.sin(u * dur * fl * 6.283 + ph + Math.sin(u * 37) * 2)) * Math.min(1, (1 - u) / 0.05);
  });
  const n = noise(t, t + dur, true), hp = filt('highpass', 160, 0.7), lp = filt('lowpass', 600, 14), am = gain(0), sh = ac.createWaveShaper(), mg = gain(0.75 * v);
  sh.curve = distCurve(1.2);
  lp.frequency.setValueCurveAtTime(fc, t, dur); am.gain.setValueCurveAtTime(ga, t, dur);
  // fixed low-pass after saturation: the wet part lives at 150 Hz-4 kHz
  n.connect(hp).connect(lp).connect(am).connect(sh).connect(filt('lowpass', 4000, -3)).connect(mg).connect(sum);
  // thick bubbles: "glop" that falls or rises
  for (const [s, l, , , st] of blobs) {
    const tt = t + s + l * 0.35, f = magicRand(140, 280), up = Math.random() < 0.5, b = osc('triangle', f, tt, tt + 0.14), bg = perc(tt, 0.22 * v * st, 0.09, 0.006);
    b.frequency.exponentialRampToValueAtTime(up ? f * 1.9 : f * 0.55, tt + 0.09);
    b.connect(filt('lowpass', 1100, 2)).connect(bg).connect(sum);
  }
  // sticky strings that snap: short wet clicks (points every 4 ms: no instant attacks;
  // two low-passes in a row cut what the band-pass lets through up top)
  const Nc = Math.round(dur * 250), cn = noise(t, t + dur), cb = filt('bandpass', magicRand(1900, 2600), 3.5), cl = filt('lowpass', 5000, -3), cl2 = filt('lowpass', 5500, -3), ck = gain(0);
  ck.gain.setValueCurveAtTime(magicTwinkle(Nc, u => (u > 0.25 ? 0.048 : 0.006), 0.75), t, dur);
  cn.connect(ck).connect(cb).connect(cl).connect(cl2).connect(gain(0.3 * v)).connect(sum);
  out(sum, o, E.sfx, 0.2, t, dur);
});

// church bell (midnight): real bell partials (hum, prime, minor third, fifth, nominal…)
// with doublets that beat slowly, a long fall and the clapper's metal strike. o.note = prime (midi), o.decay
registerSfx('toll', (E, o) => {
  const { T, osc, noise, filt, gain, perc, out } = E.h;
  const t = T(o), v = o.vel ?? 0.9, f = midiHz(o.note ?? 45), dec = o.decay ?? 7, hit = magicRand(0.85, 1.15), sum = gain(1);
  // [ratio, amplitude, fraction of the fall, beating Hz]; the hum (0.5) is kept very low: mid-size speakers don't reproduce it
  // and it would only load the bass compressor; the weight is carried by the nominal (2) and the 2.5-4 partials
  const P = [[0.5, 0.12, 0.8, 0.35], [1, 0.6, 1, 0.8], [1.188, 0.62, 0.85, 1.2], [1.5, 0.15, 0.5, 0], [2, 1, 0.75, 1.6], [2.51, 0.56 * hit, 0.62, 0.9],
    [2.66, 0.3 * hit, 0.5, 0], [3.01, 0.34 * hit, 0.46, 0.5], [4.07, 0.4 * hit, 0.38, 0.7], [5.21, 0.2 * hit, 0.26, 0], [6.39, 0.15 * hit, 0.18, 0],
    [7.91, 0.12 * hit, 0.12, 0], [9.46, 0.09 * hit, 0.09, 0], [11.2, 0.07 * hit, 0.07, 0], [13.1, 0.05 * hit, 0.05, 0], [15.3, 0.035 * hit, 0.04, 0], [17.8, 0.025 * hit, 0.035, 0]];
  for (const [r, a, d, beat] of P) {
    const fr = f * r * (1 + magicRand(-0.002, 0.002)), td = Math.max(0.25, dec * d);
    if (fr > 9000) continue;
    const g = perc(t, a * v * 0.1, td, 0.004);
    osc('sine', fr, t, t + td).connect(g);
    if (beat) osc('sine', fr + beat * magicRand(0.7, 1.3), t, t + td).connect(gain(0.6)).connect(g);
    g.connect(sum);
  }
  // clapper: inharmonic metal partials (1.2-3.5 kHz) of 80-150 ms + a bit of noise: a "clang" readable at 20 m
  let sk = 0;
  for (const r of [11.2, 14.6, 19.3, 23.9, 28.7]) {
    let fs = f * r * magicRand(0.99, 1.01);
    while (fs > 3600) fs /= 2;
    while (fs < 1100) fs *= 2;
    const td = magicRand(0.08, 0.15), g = perc(t, 0.05 * v * hit * (sk++ ? magicRand(0.6, 1) : 1), td, 0.0015);
    osc('sine', fs, t, t + td).connect(g).connect(sum);
  }
  const n = noise(t, t + 0.06), bp = filt('bandpass', 2600, 1.1), ng = perc(t, 0.07 * v * hit, 0.04, 0.0015);
  n.connect(bp).connect(filt('lowpass', 5000, -3)).connect(ng).connect(sum);
  // two high-passes at 100 Hz: remove what the speakers can't give
  const hp = filt('highpass', 100, -3), hp2 = filt('highpass', 100, -3);
  out(sum.connect(hp).connect(hp2), o, E.sfx, 0.65, t, dec);
});

// spell: rising charge "fiiu" → falling bolt (bzzziuu: saws with a resonant filter that closes and an electric trill)
// + crackle + hit + sparks. o.pitch, o.dur
registerSfx('spellZap', (E, o) => {
  const { ac, T, osc, noise, filt, gain, env, perc, out } = E.h;
  const t = T(o), v = o.vel ?? 1, p = (o.pitch ?? 1) * magicRand(0.9, 1.12), dur = o.dur ?? 1.1, sp = magicSpread(E, 0.4), tz = t + 0.1, zl = 0.5;
  const mix = gain(1), top = filt('lowpass', 7000, -3);
  sp.mix.connect(top).connect(filt('lowpass', 7500, -3)).connect(mix);
  // charge
  const c = osc('sine', 350 * p, t, tz + 0.04), cg = gain(0);
  c.frequency.exponentialRampToValueAtTime(2200 * p, tz);
  cg.gain.setValueAtTime(0, t); cg.gain.linearRampToValueAtTime(0.15 * v, tz - 0.01); cg.gain.linearRampToValueAtTime(0, tz + 0.03);
  c.connect(cg).connect(sp.mix);
  // bolt: two saws almost in unison that fall, resonant filter that follows them and amplitude trill
  const f0 = 1500 * p, f1 = 140 * p, lp = filt('lowpass', f0 * 3, 12), am = gain(0.55), tr = osc('square', magicRand(30, 40), tz, tz + zl + 0.2), tg = gain(0.45);
  for (const d of [1, 1.012]) { const s = osc('sawtooth', f0 * d, tz, tz + zl + 0.2); s.frequency.exponentialRampToValueAtTime(f1 * d, tz + zl); s.connect(lp); }
  lp.frequency.setValueAtTime(f0 * 3, tz); lp.frequency.exponentialRampToValueAtTime(f1 * 4, tz + zl);
  // trill via low-pass: buzz without steps (clicks)
  tr.connect(filt('lowpass', 250, 0.7)).connect(tg).connect(am.gain);
  const ze = env(tz, 0.004, 0.075 * v, 0.12, zl - 0.12);
  lp.connect(am).connect(ze).connect(sp.mix);
  // metallic timbre: brief inharmonic FM on top of the attack
  const car = osc('sine', f0 * 2, tz, tz + 0.25), mod = osc('sine', f0 * 2 * 1.41, tz, tz + 0.25), mg = gain(f0 * 2), fe = perc(tz, 0.08 * v, 0.2, 0.002);
  car.frequency.exponentialRampToValueAtTime(f1 * 4, tz + 0.25); mod.frequency.exponentialRampToValueAtTime(f1 * 4 * 1.41, tz + 0.25);
  mod.connect(mg).connect(car.frequency);
  car.connect(fe).connect(sp.mix);
  // electric crackle
  const cn = noise(tz, tz + 0.4), cb = filt('bandpass', 3200, 2.5), cf = gain(0);
  cf.gain.setValueCurveAtTime(magicTwinkle(120, u => 0.22 * (1 - u), 0.8), tz, 0.4);
  cn.connect(cf).connect(cb).connect(filt('lowpass', 5200, -3)).connect(filt('lowpass', 5500, -3)).connect(gain(0.3 * v)).connect(sp.mix);
  // lingering magic sparks
  for (let i = 0; i < 9; i++) {
    const u = Math.random(), tw = tz + 0.06 + u * (dur - 0.35);
    magicChime(E, tw, midiHz(magicPick([86, 88, 91, 93, 96, 98, 100])) * p, v * 0.056 * (1 - u * 0.5), magicRand(0.6, 0.8), sp.any(), Math.random() < 0.5);
  }
  out(mix, o, E.sfx, 0.4, t, dur);
  // low hit (almost dry: the reverb would blur it)
  const b = osc('sine', 190, tz, tz + 0.25), bg = perc(tz, 0.12 * v, 0.16, 0.002);
  b.frequency.exponentialRampToValueAtTime(80, tz + 0.15);
  out(b.connect(bg), { ...o, wet: 0.08 }, E.sfx, 0.08, t, dur);
});

// witch on a broom flying past: physical trajectory (distance, Doppler, panning) for air, flapping cape,
// magic whistle and spark trail. o.pan = [from, to] (a number p = from p to -p), o.dur
registerSfx('broomFlyby', (E, o) => {
  const { ac, T, osc, noise, filt, gain, out, vibrato } = E.h;
  const t = T(o), v = o.vel ?? 1, dur = o.dur ?? 2.6, end = t + dur, N = 160;
  const [p0, p1] = Array.isArray(o.pan) ? o.pan : o.pan ? [o.pan, -o.pan] : (Math.random() < 0.5 ? [-0.95, 0.95] : [0.95, -0.95]);
  // tc = relative instant of passing, h = minimum relative distance, beta = speed / sound (exaggerated, cartoon-like)
  const tc = magicRand(0.45, 0.55), h = magicRand(0.17, 0.24), beta = 0.12;
  const path = u => {
    const x = (u - tc) * 2, d = Math.hypot(x, h), e = Math.max(0, Math.min(1, u / 0.12, (1 - u) / 0.15));
    return { prox: h / d, dop: 1 / (1 + beta * x / d), side: x / d, edge: e * e * (3 - 2 * e) };
  };
  const C = fn => magicCurve(N, u => fn(path(u), u));
  const panAt = q => magicClampPan(p0 + (p1 - p0) * (0.5 + 0.5 * q.side));
  const body = gain(1), hp = filt('highpass', 250, 0.7), top = filt('lowpass', 9000, 0.5), pan = ac.createStereoPanner();
  pan.pan.setValueCurveAtTime(C(panAt), t, dur);
  body.connect(hp).connect(top).connect(pan);
  // displaced air: band that rises on approach and falls on recede
  const n1 = noise(t, end, true), bp1 = filt('bandpass', 700, 1.9), g1 = gain(0);
  bp1.frequency.setValueCurveAtTime(C(q => 600 * q.dop * (0.55 + 2 * q.prox * q.prox)), t, dur);
  g1.gain.setValueCurveAtTime(C(q => 1.5 * v * Math.pow(q.prox, 1.8) * q.edge), t, dur);
  n1.connect(bp1).connect(g1).connect(body);
  // hiss of air passing close
  const n2 = noise(t, end), hp2 = filt('highpass', 2500), lp2 = filt('lowpass', 7000), g2 = gain(0);
  g2.gain.setValueCurveAtTime(C(q => 0.15 * v * Math.pow(q.prox, 3) * q.edge), t, dur);
  n2.connect(hp2).connect(lp2).connect(g2).connect(body);
  // broom cape and twigs flapping
  const n3 = noise(t, end, true), bp3 = filt('bandpass', 520, 1.6), fl = gain(0.5), lfo = osc('triangle', magicRand(11, 16), t, end), lg = gain(0.5), g3 = gain(0);
  lfo.connect(lg).connect(fl.gain);
  g3.gain.setValueCurveAtTime(C(q => 1.3 * v * Math.pow(q.prox, 2) * q.edge), t, dur);
  n3.connect(bp3).connect(fl).connect(g3).connect(body);
  // magic whistle (fifth) with a Doppler drop as it passes
  const fw = magicRand(620, 820), gw = gain(0), lw = filt('lowpass', 4000);
  for (const [mul, a] of [[1, 1], [1.5, 0.55]]) {
    const s = osc('triangle', fw * mul, t, end);
    s.frequency.setValueCurveAtTime(C(q => fw * mul * q.dop), t, dur);
    vibrato(s.detune, t, end, magicRand(5, 6.5), 16);
    s.connect(gain(a)).connect(gw);
  }
  gw.gain.setValueCurveAtTime(C(q => 0.15 * v * Math.pow(q.prox, 1.5) * q.edge), t, dur);
  gw.connect(lw).connect(body);
  out(pan, { ...o, pan: 0 }, E.sfx, 0.3, t, dur);
  // spark trail: follows the broom with the panning slightly delayed
  const trail = gain(1), tp = ac.createStereoPanner();
  tp.pan.setValueCurveAtTime(magicCurve(N, u => panAt(path(Math.max(0, u - 0.08)))), t, dur);
  trail.connect(tp);
  for (let i = 0, made = 0; made < 16 && i < 200; i++) {
    const u = magicRand(0.15, 0.97), q = path(Math.max(0, u - 0.06));
    if (Math.random() > q.prox * q.edge) continue;
    made++;
    magicChime(E, t + u * dur, midiHz(magicPick([84, 86, 88, 91, 93, 96, 98])) * q.dop, v * 0.07 * Math.sqrt(q.prox), magicRand(0.6, 0.8), trail, Math.random() < 0.5);
  }
  out(tp, { ...o, pan: 0 }, E.sfx, 0.5, t, dur);
});

// winding the music box: bursts of ratchet teeth (metal resonators + wooden box)
// and the key's scrape; pause while repositioning the fingers. o.count = turns
registerSfx('musicBoxWind', (E, o) => {
  const { T, noise, filt, gain, out } = E.h;
  const t = T(o), v = o.vel ?? 1, turns = o.count ?? 3, sum = gain(1), turnSpans = [], clicks = [];
  let tt = t + 0.02;
  for (let k = 0; k < turns; k++) {
    const nT = 7 + Math.floor(Math.random() * 5), gap = magicRand(0.034, 0.046), t0 = tt;
    for (let i = 0; i < nT; i++) {
      const u = i / (nT - 1);
      clicks.push([tt, (0.6 + 0.4 * Math.sin(Math.PI * u)) * magicRand(0.7, 1) * (1 + k * 0.1)]);
      tt += gap * (1.3 - 0.55 * Math.sin(Math.PI * u)) * magicRand(0.85, 1.15);
    }
    turnSpans.push([t0 - 0.03, tt]);
    tt += magicRand(0.22, 0.4);
  }
  const end = tt;
  // excitation: open noise only on each tooth (soft ratchet pre-click + dry click)
  const n = noise(t, end), ex = gain(0), eg = ex.gain;
  for (const [c, a] of clicks) {
    const pre = c - 0.007;
    eg.setValueAtTime(0, pre); eg.linearRampToValueAtTime(a * 0.18, pre + 0.0005); eg.linearRampToValueAtTime(0, pre + 0.002);
    eg.setValueAtTime(0, c); eg.linearRampToValueAtTime(a * 0.6, c + 0.0004); eg.linearRampToValueAtTime(0, c + 0.003);
  }
  n.connect(ex);
  // resonators: metal pieces (high Q) and wooden box (low Q)
  // the wood gets no bass from the click (300 Hz high-pass)
  const tune = magicRand(0.95, 1.05), lp = filt('lowpass', 8000, -3), exw = filt('highpass', 300, -3);
  ex.connect(exw);
  for (const [f, q, a] of [[2350, 22, 4.5], [3580, 28, 3.5], [4900, 32, 2.4], [6400, 36, 1.4], [640, 5, 1.4], [1350, 7, 1]]) {
    const bp = filt('bandpass', f * tune, q);
    if (q > 10) turnSpans.forEach(([a0], k) => bp.frequency.setValueAtTime(f * tune * (1 + 0.012 * k), a0));
    (q > 10 ? ex : exw).connect(bp).connect(gain(a * v)).connect(lp);
  }
  // bright branch with its own low-pass (7 kHz) in addition to the common one
  ex.connect(filt('highpass', 3000)).connect(filt('lowpass', 7000, -3)).connect(gain(0.06 * v)).connect(lp);
  lp.connect(filt('lowpass', 7500, -3)).connect(sum);
  // scrape of the fingers and the key on each turn
  const rn = noise(t, end, true), rb = filt('bandpass', 1100, 0.9), rg = gain(0);
  for (const [a, b] of turnSpans) { rg.gain.setValueAtTime(0, a); rg.gain.linearRampToValueAtTime(0.05 * v, a + 0.05); rg.gain.linearRampToValueAtTime(0.03 * v, b - 0.03); rg.gain.linearRampToValueAtTime(0, b + 0.02); }
  rn.connect(rb).connect(rg).connect(sum);
  // no bass: the mechanism is small
  out(sum.connect(filt('highpass', 220, -3)), o, E.sfx, 0.15, t, end - t);
});

// ethereal pad that grows and shines: high chord that slides in from below, with vibrato, slow drift
// and tremolo per voice; high octave that enters late and a whisper of air on the notes. o.note (root midi), o.dur, o.attack, o.release
registerSfx('ghostShimmer', (E, o) => {
  const { ac, T, osc, noise, filt, gain, out, formant } = E.h;
  const t = T(o), v = o.vel ?? 1, dur = o.dur ?? 4, att = o.attack ?? Math.min(2, dur * 0.45), rel = o.release ?? 2, end = t + dur + rel;
  const root = o.note ?? 69, V = magicPick([[0, 3, 7, 14, 19], [0, 7, 10, 15, 22], [0, 3, 10, 14, 17]]);
  const lp = filt('lowpass', 1500, 0.5), sw = gain(0), lvl = 0.055 * v, vm = gain(1);
  // 2-3 voices enter moaning from several semitones below; the rest slide a little
  const big = new Set([1, 2, 3, 4, 5].sort(() => Math.random() - 0.5).slice(0, 2 + Math.floor(Math.random() * 2)));
  lp.frequency.setValueAtTime(1500, t); lp.frequency.linearRampToValueAtTime(5500, t + att + dur * 0.3);
  sw.gain.setValueAtTime(0, t); sw.gain.linearRampToValueAtTime(lvl, t + att); sw.gain.setValueAtTime(lvl, t + dur); sw.gain.setTargetAtTime(0, t + dur, rel / 4);
  const side = Math.random() < 0.5 ? 1 : -1, pans = [0, -0.55, 0.55, -0.25, 0.25, 0];
  [-12, ...V].forEach((iv, i) => {
    const f = midiHz(root + iv), vg = gain(iv < 0 ? 0.15 : 0.6), p = ac.createStereoPanner();
    p.pan.value = side * pans[i] + magicRand(-0.08, 0.08);
    const a = osc('sine', f, t, end), b = osc('triangle', f, t, end), vl = osc('sine', magicRand(4.5, 6), t, end), vd = gain(9), dl = osc('sine', magicRand(0.08, 0.25), t, end), dd = gain(magicRand(6, 14));
    // enters sliding from below (ghostly) and then drifts slowly
    const from = f * Math.pow(2, -(big.has(i) ? magicRand(200, 500) : magicRand(30, 60)) / 1200), ta = t + att * magicRand(0.7, 1.1);
    for (const s of [a, b]) { s.frequency.setValueAtTime(from, t); s.frequency.exponentialRampToValueAtTime(f, ta); }
    a.detune.value = -magicRand(3, 8); b.detune.value = magicRand(5, 10);
    vl.connect(vd); vd.connect(a.detune); vd.connect(b.detune);
    dl.connect(dd); dd.connect(a.detune); dd.connect(b.detune);
    // slow moan per voice (random phase): the chord never sits still
    const mo = osc('sine', magicRand(0.15, 0.35), t, end), md = gain(magicRand(50, 90)), ph = Math.random() * 6.283;
    mo.setPeriodicWave(ac.createPeriodicWave(new Float32Array([0, Math.sin(ph)]), new Float32Array([0, Math.cos(ph)]), { disableNormalization: true }));
    mo.connect(md); md.connect(a.detune); md.connect(b.detune);
    const tr = osc('sine', magicRand(4, 8), t, end), tg = gain(iv < 0 ? 0.08 : 0.4);
    tr.connect(tg).connect(vg.gain);
    a.connect(vg); b.connect(gain(0.35)).connect(vg);
    vg.connect(p).connect(vm);
  });
  // "oooh": part of the chord through vowel "o" formants (low Q), the rest direct
  vm.connect(gain(0.55)).connect(lp);
  formant(vm, 'o', t, 2.5).connect(gain(0.35)).connect(lp);
  // high octave that enters late (brightness)
  const hi = gain(0);
  hi.gain.setValueAtTime(0, t); hi.gain.linearRampToValueAtTime(0.55, t + att + dur * 0.4);
  for (const iv of [24, 31]) { const s = osc('sine', midiHz(root + iv), t, end), tr = osc('sine', magicRand(7, 11), t, end), sg = gain(0.5), tg = gain(0.5); tr.connect(tg).connect(sg.gain); s.connect(sg).connect(hi); }
  hi.connect(lp);
  // whisper: noise through resonators tuned to the chord
  const n = noise(t, end), ag = gain(0);
  ag.gain.setValueAtTime(0, t); ag.gain.linearRampToValueAtTime(0.9, t + att * 0.6);
  for (const iv of V.slice(0, 3)) n.connect(filt('bandpass', midiHz(root + iv) * 2, 22)).connect(ag);
  ag.connect(lp);
  out(lp.connect(sw), o, E.sfx, 0.75, t, dur + rel);
});

// bubble (cauldron): sine that rises fast as the bubble rises (Minnaert resonance) and soft click on breaking.
// o.count (default 3), o.dur (spread), o.pitch
registerSfx('bubble', (E, o) => {
  const { T, osc, gain, perc, out } = E.h;
  const t = T(o), v = o.vel ?? 1, count = o.count ?? 3, span = o.dur ?? 0.22 * (count - 1), sum = gain(1);
  const pops = [];
  for (let i = 0; i < count; i++) {
    const tt = t + (i ? Math.random() * span : 0), size = i ? Math.random() : magicRand(0.3, 0.7), f0 = (o.pitch ?? 1) * (260 + 640 * size);
    const dec = 0.06 + 0.1 * (1 - size), a = v * (0.4 - 0.15 * size) * (i ? magicRand(0.6, 1) : 1), rise = magicRand(1.7, 2.5);
    const s = osc('sine', f0, tt, tt + dec), g = perc(tt, a, dec, 0.004);
    s.frequency.exponentialRampToValueAtTime(f0 * rise, tt + dec);
    s.connect(g).connect(sum);
    // soft second harmonic: presence on small speakers
    const s2 = osc('sine', f0 * 2, tt, tt + dec), g2 = perc(tt, a * 0.18, dec * 0.6, 0.004);
    s2.frequency.exponentialRampToValueAtTime(f0 * 2 * rise, tt + dec);
    s2.connect(g2).connect(sum);
    if (Math.random() < 0.6) pops.push(tt + dec * magicRand(0.6, 0.9));
  }
  // "plip" of the surface when it breaks: very short high sine that falls a little (clean, no broadband noise)
  for (const pt of pops) {
    const fp = magicRand(2000, 2900), sp = osc('sine', fp, pt, pt + 0.03), gp = perc(pt, 0.09 * v * magicRand(0.7, 1), 0.012, 0.002);
    sp.frequency.exponentialRampToValueAtTime(fp * 0.8, pt + 0.02);
    sp.connect(gp).connect(sum);
  }
  const end = Math.max(t, ...pops) + 0.05;
  out(sum, o, E.sfx, 0.25, t, end - t + 0.2);
});
