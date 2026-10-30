// Procedural sound with WebAudio: there are no audio files, everything is synthesized.
//
// Chain: instruments and effects → bus (music | effects | ambience) → reverb + compressor + limiter → speakers.
// - Loose sound effects: Sound.thunder(), Sound.wolf({ pan: -0.5 }), Sound.creak()… (js/audio/sfx-*.js).
//   All accept { t, pan, vel, wet }: t = audio instant (default now), pan -1..1 or [from, to].
// - Score for each scene (music + effects synced to the image): js/audio/NN-name.js with registerScore().
// - Continuous ambiences (wind, rain, crickets, fire, drone, night): A.bed('rain', 0.6) from the score.
// The browser won't play anything until the first key or click: the sound starts on its own at that moment.

const PARTY_BPM = 112;
const SCORES = {};

// Score for a scene (by its name). score = { beds?, start?(A, S), tick(A, S) }
function registerScore(sceneName, score) { SCORES[sceneName] = score; }

// Named sound effect: available as Sound.name(o) and A.name(o) in the scores
const SFX = {};
function registerSfx(name, fn) {
  SFX[name] = fn;
  Sound[name] = (o = {}) => Sound.play(name, o);
}

const midiHz = m => 440 * Math.pow(2, (m - 69) / 12);

function createAudioEngine(ac, clock) {
  const E = { ac, now: clock };
  const sr = ac.sampleRate;
  // Careful: in WebAudio the Q of lowpass/highpass is in dB (0 ≈ no resonance, -3 = Butterworth); in bandpass/peaking it is linear.
  const BW = -3.01;

  // ---------- output (mastering) ----------
  // master (volume) → 45 Hz high-pass at 24 dB/oct (outdoor speakers give no sub-bass: it would only make the compressor
  // work) → EQ (bass slightly reduced with a boost at 160 Hz that is audible, presence, less hiss up top)
  // → 2-band compressor (bass | rest: heavy bass hits don't sink the rest, no pumping)
  // → limiter → gentle safety clip (ceiling ≈ -0.9 dBFS: never saturates)
  E.master = ac.createGain();
  const presence = filt('peaking', 2800, 0.8), air = filt('highshelf', 9500), lowS = filt('lowshelf', 100), punch = filt('peaking', 160, 1.1);
  presence.gain.value = 1.5; air.gain.value = -3; lowS.gain.value = -4; punch.gain.value = 2;
  E.master.connect(filt('highpass', 45, BW)).connect(filt('highpass', 45, BW)).connect(lowS).connect(punch).connect(presence).connect(air);
  const comp = (att, rel) => {
    const c = ac.createDynamicsCompressor();
    c.threshold.value = -18; c.knee.value = 10; c.ratio.value = 3; c.attack.value = att; c.release.value = rel;
    return c;
  };
  const XO = 150, mix = gain(1);
  air.connect(filt('lowpass', XO, BW)).connect(filt('lowpass', XO, BW)).connect(comp(0.03, 0.45)).connect(mix);
  air.connect(filt('highpass', XO, BW)).connect(filt('highpass', XO, BW)).connect(comp(0.01, 0.25)).connect(mix);
  const limiter = ac.createDynamicsCompressor();
  limiter.threshold.value = -4; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.15;
  const clip = ac.createWaveShaper();
  clip.curve = softClip(); clip.oversample = '2x';
  mix.connect(limiter).connect(clip).connect(ac.destination);

  // convolution reverb: wide outdoor space (early reflections from facades and ground + short dark tail:
  // the street and facade already add their echo; a cathedral tail would blur melodies at 20 m)
  E.reverb = ac.createConvolver();
  E.reverb.buffer = impulse(2.6, 2.2);
  const revOut = gain(0.65);
  E.reverb.connect(filt('highpass', 200, BW)).connect(filt('lowpass', 5200, BW)).connect(revOut).connect(E.master);

  const bus = v => { const g = ac.createGain(); g.gain.value = v; g.connect(E.master); return g; };
  E.music = bus(0.75);
  E.sfx = bus(1);
  E.amb = bus(0.8);

  const noiseBuf = ac.createBuffer(1, sr * 3, sr);
  { const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  // approximate pink noise (more natural for wind, rain, murmurs)
  const pinkBuf = ac.createBuffer(1, sr * 3, sr);
  {
    const d = pinkBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + w * 0.5362) * 0.11;
    }
  }
  // rain texture: thousands of droplets (many soft, few strong), each a noise click that fades out
  const rainBuf = ac.createBuffer(1, sr * 4, sr);
  {
    const d = rainBuf.getChannelData(0), n = d.length;
    let ss = 0;
    for (let k = 0; k < 4 * 1800; k++) {
      const i0 = Math.floor(Math.random() * n), a = Math.pow(Math.random(), 3), dec = sr * (0.0004 + Math.random() * 0.0025);
      for (let j = 0; j < dec * 5 && i0 + j < n; j++) d[i0 + j] += a * (Math.random() * 2 - 1) * Math.exp(-j / dec);
    }
    for (let i = 0; i < n; i++) ss += d[i] * d[i];
    const k = 0.25 / Math.sqrt(ss / n);
    for (let i = 0; i < n; i++) d[i] *= k;
  }
  // smooth random curve (40 points with cosine interpolation) for natural modulations
  const driftBuf = ac.createBuffer(1, sr * 2, sr);
  {
    const d = driftBuf.getChannelData(0), K = 40, pts = Array.from({ length: K }, () => Math.random() * 2 - 1), seg = d.length / K;
    for (let i = 0; i < d.length; i++) { const x = i / seg, k = Math.floor(x), f = x - k, a = pts[k % K], b = pts[(k + 1) % K]; d[i] = a + (b - a) * (0.5 - 0.5 * Math.cos(Math.PI * f)); }
  }

  function impulse(secs, rt60) {
    const len = Math.floor(sr * secs), b = ac.createBuffer(2, len, sr), pre = Math.floor(sr * 0.014);
    // early reflections [ms, gain]: facade, ground, neighboring houses; different in each channel (width)
    const ER = [[[9, 0.9], [17, -0.6], [26, 0.55], [38, -0.45], [53, 0.4], [71, -0.3], [92, 0.24]],
      [[11, 0.85], [21, -0.65], [31, 0.5], [44, -0.42], [61, 0.36], [80, -0.28], [101, 0.22]]];
    // bass common to both channels (in a real space the bass arrives almost in phase; otherwise a low note
    // can sound 4 dB louder on one side) and independent highs (width)
    const shared = new Float32Array(len), aLo = 1 - Math.exp(-2 * Math.PI * 450 / sr);
    for (let i = 0, s = 0; i < len; i++) { s += aLo * (Math.random() * 2 - 1 - s); shared[i] = s * 2.2; }
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      let lp = 0, lo = 0;
      // tail: noise that decays exponentially; a low-pass that closes over time kills the highs first
      for (let i = pre; i < len; i++) {
        const tt = (i - pre) / sr, fc = 1000 + 6500 * Math.exp(-tt * 1.1), a = 1 - Math.exp(-2 * Math.PI * fc / sr), w = Math.random() * 2 - 1;
        lo += aLo * (w - lo);
        lp += a * (w - lo + shared[i] - lp);
        d[i] = lp * Math.exp(-6.91 * tt / rt60) * Math.min(1, 0.25 + tt / 0.07);
      }
      // each reflection: short, soft pulse without bass (rough wall, not a metallic click)
      // (times slightly random on each load: no fixed comb that always boosts the same notes in one channel)
      for (const [ms, g] of ER[c]) {
        const i0 = Math.floor(sr * (ms + (Math.random() - 0.5) * 3) / 1000), w = 48;
        for (let j = 0; j < w; j++) d[i0 + j] += g * 1.3 * Math.sin(2 * Math.PI * j / w) * (0.6 + Math.random() * 0.4);
      }
    }
    // the right tail carries 30% of the left delayed 7 ms: with fully independent tails a high note
    // sounds louder on one side depending on the load; this compensates without losing width
    { const L = b.getChannelData(0), Rr = b.getChannelData(1), sh = Math.floor(sr * 0.007);
      for (let i = len - 1; i >= sh; i--) Rr[i] = Rr[i] * 0.85 + L[i - sh] * 0.3; }
    // same level in both channels (different reflections must not tilt the mix to one side)
    const rms = c => { const d = b.getChannelData(c); let s = 0; for (let i = 0; i < len; i++) s += d[i] * d[i]; return Math.sqrt(s / len); };
    const rL = rms(0), rR = rms(1), m = (rL + rR) / 2;
    for (const [c, r] of [[0, rL], [1, rR]]) { const d = b.getChannelData(c), k = m / r; for (let i = 0; i < len; i++) d[i] *= k; }
    return b;
  }
  // linear up to 0.7 and gentle curve up to ~0.9: the limiter does the work, this only tames stray peaks
  function softClip() {
    const n = 4096, c = new Float32Array(n), k = 0.7, room = 0.244;
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1, a = Math.abs(x); c[i] = Math.sign(x) * (a < k ? a : k + room * Math.tanh((a - k) / room)); }
    return c;
  }

  // ---------- basic building blocks ----------
  const T = o => Math.max(o.t ?? E.now() + 0.01, E.now());
  function osc(type, freq, t, end) {
    const o = ac.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    o.start(t); o.stop(end + 0.05);
    return o;
  }
  function noise(t, end, pink = false) {
    const s = ac.createBufferSource();
    s.buffer = pink ? pinkBuf : noiseBuf; s.loop = true;
    s.start(t, Math.random() * 2.5); s.stop(end + 0.05);
    return s;
  }
  function filt(type, freq, q = 0.7, t = 0) {
    const f = ac.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    return f;
  }
  function gain(v = 1) { const g = ac.createGain(); g.gain.value = v; return g; }
  // linear attack, sustain, smooth fall
  function env(t, a, peak, hold, r) {
    const g = ac.createGain(), p = g.gain;
    hold = Math.max(0, hold);
    p.setValueAtTime(0, t); p.linearRampToValueAtTime(peak, t + a);
    p.setValueAtTime(peak, t + a + hold); p.setTargetAtTime(0, t + a + hold, r / 4);
    return g;
  }
  // hit: rises in 3 ms and falls exponentially
  function perc(t, peak, decay, attack = 0.003) {
    const g = ac.createGain(), p = g.gain;
    p.setValueAtTime(0.0001, t); p.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    p.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }
  // output with panning (fixed or moving) and send to reverb
  function out(node, o, defBus, defWet, t = 0, dur = 0) {
    let n = node;
    if (o.pan) {
      const p = ac.createStereoPanner();
      if (Array.isArray(o.pan)) { p.pan.setValueAtTime(clampPan(o.pan[0]), t); p.pan.linearRampToValueAtTime(clampPan(o.pan[1]), t + Math.max(0.05, dur)); }
      else p.pan.value = clampPan(o.pan);
      n.connect(p); n = p;
    }
    n.connect(o.out || defBus);
    const wet = o.wet ?? defWet;
    if (wet > 0) { const s = gain(wet); n.connect(s); s.connect(E.reverb); }
    return n;
  }
  const clampPan = v => Math.max(-1, Math.min(1, v || 0));
  function distCurve(k) {
    const c = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; c[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    return c;
  }
  // vowel formants for synthetic voices (choirs, howls, laughs)
  const VOWELS = { a: [[800, 1], [1150, 0.5], [2900, 0.25]], e: [[400, 1], [1700, 0.4], [2600, 0.2]], o: [[450, 1], [800, 0.45], [2830, 0.12]], u: [[325, 1], [700, 0.3], [2700, 0.08]], i: [[300, 1], [2200, 0.3], [3000, 0.2]] };
  function formant(src, vowel, t, q = 9) {
    const sum = gain(1);
    for (const [f, a] of VOWELS[vowel] || VOWELS.a) { const bp = filt('bandpass', f, q, t), g = gain(a * 2.2); src.connect(bp).connect(g).connect(sum); }
    return sum;
  }
  function vibrato(param, t, end, rate, depth) {
    const l = osc('sine', rate, t, end), g = gain(depth);
    l.connect(g).connect(param);
  }
  // smooth random modulation in -1..1 that changes `hz` times per second (connect to a gain → AudioParam)
  function drift(t, end, hz = 0.2) {
    const s = ac.createBufferSource();
    s.buffer = driftBuf; s.loop = true; s.playbackRate.value = hz / 20;
    s.start(t, Math.random() * 2); s.stop(end + 0.05);
    return s;
  }
  // waveform from its harmonic amplitudes [a1, a2, …] (stored by name)
  const waves = {};
  function pw(name, amps) {
    if (!waves[name]) {
      const a = typeof amps === 'function' ? Array.from({ length: 48 }, (_, k) => amps(k + 1)) : amps, im = new Float32Array(a.length + 1);
      a.forEach((v, k) => { im[k + 1] = v; });
      waves[name] = ac.createPeriodicWave(new Float32Array(a.length + 1), im);
    }
    return waves[name];
  }
  function wosc(wave, freq, t, end) {
    const o = ac.createOscillator();
    o.setPeriodicWave(wave); o.frequency.setValueAtTime(freq, t);
    o.start(t); o.stop(end + 0.05);
    return o;
  }
  function panner(v) { const p = ac.createStereoPanner(); p.pan.value = clampPan(v); return p; }
  const shapers = {};
  function drive(k) { const s = ac.createWaveShaper(); s.curve = shapers[k] ??= distCurve(k); return s; }
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------- continuous ambiences ----------
  // Each ambience: layers → input (calibration) → level (fade) → ambience bus, with its send to reverb.
  // At level 1 they sit below music and effects and move on their own (gusts, intensity, flicker).
  // The granular parts (drops, clicks, crickets, leaves) are scheduled in tickBeds and enter through the same level.
  const BED_CAL = { wind: 0.55, rain: 0.4, crickets: 0.1, fire: 0.67, drone: 0.32, night: 0.5 };
  const BED_WET = { wind: 0.15, rain: 0.12, crickets: 0.35, fire: 0.12, drone: 0.3, night: 0.3 };
  const beds = {};
  const BEDS = {
    // wind: gusts (slow curve + tremor, shaped so there are calms and strong hits), stereo body whose band
    // rises with the gust, deep roar, whistling in the gaps and leaves that only peek out in strong gusts
    wind(b, t, end) {
      // gust contour: very slow swell + gusts every few seconds + tremor, shaped with a cube
      // (long calms, short strong hits)
      const G = gain(1), g = ac.createWaveShaper();
      g.curve = Float32Array.from({ length: 256 }, (_, i) => Math.pow(i / 255, 3));
      drift(t, end, 0.07).connect(gain(0.4)).connect(G); drift(t, end, 0.25).connect(gain(0.8)).connect(G); drift(t, end, 2).connect(gain(0.3)).connect(G);
      const off = ac.createConstantSource(); off.offset.value = 0.1; off.start(t); off.stop(end); off.connect(G);
      G.connect(g);
      for (const p of [-0.6, 0.6]) {
        const n = noise(t, end, true), bp = filt('bandpass', 300, 1.4), body = gain(0.02);
        g.connect(gain(1.6)).connect(body.gain); g.connect(gain(1000)).connect(bp.frequency); drift(t, end, 0.6).connect(gain(110)).connect(bp.frequency);
        n.connect(bp).connect(body).connect(panner(p)).connect(b.in);
      }
      const r = noise(t, end, true), rg = gain(0.04);
      g.connect(gain(0.3)).connect(rg.gain);
      r.connect(filt('lowpass', 300, 0)).connect(filt('highpass', 100, BW)).connect(rg).connect(b.in);
      // whistling in the gaps: two tones (the second a fifth up, on the other side) that rise with the gust
      for (const [k, p] of [[1, 0.35], [1.5, -0.35]]) {
        const n2 = noise(t, end), wh = filt('bandpass', 500 * k, 18), wg = gain(0);
        g.connect(gain(0.35 / k)).connect(wg.gain); g.connect(gain(1100 * k)).connect(wh.frequency); drift(t, end, 0.4).connect(gain(150 * k)).connect(wh.frequency);
        n2.connect(wh).connect(wg).connect(panner(p)).connect(b.in);
      }
      const n3 = noise(t, end), lg = gain(0.02);
      g.connect(gain(0.1)).connect(lg.gain);
      n3.connect(filt('bandpass', 3800, 0.9)).connect(lg).connect(panner(-0.35)).connect(b.in);
    },
    // rain: fine stereo pattering with a granular texture + background wash, subtle so it covers nothing;
    // the intensity comes and goes and the nearby drops (tickBeds) are heard individually above it
    rain(b, t, end) {
      // intensity that comes and goes: showers lasting a few seconds over a slow swell
      const lvl = gain(0.75);
      drift(t, end, 0.2).connect(gain(0.3)).connect(lvl.gain); drift(t, end, 0.05).connect(gain(0.2)).connect(lvl.gain);
      lvl.connect(b.in);
      for (const [p, rate] of [[-0.65, 1], [0.65, 0.96]]) {
        const r = ac.createBufferSource();
        r.buffer = rainBuf; r.loop = true; r.playbackRate.value = rate; r.start(t, Math.random() * 4); r.stop(end);
        r.connect(filt('highpass', 1600, 0)).connect(filt('lowpass', 7000, BW)).connect(filt('lowpass', 7000, BW)).connect(gain(0.5)).connect(panner(p)).connect(lvl);
        const n = noise(t, end);
        n.connect(filt('highpass', 2500, 0)).connect(filt('lowpass', 6000, BW)).connect(gain(0.05)).connect(panner(p)).connect(lvl);
      }
      const w = noise(t, end, true);
      w.connect(filt('bandpass', 1100, 0.5)).connect(gain(0.25)).connect(lvl);
      const l = noise(t, end, true);
      l.connect(filt('lowpass', 300, 0)).connect(filt('highpass', 70, BW)).connect(gain(0.07)).connect(lvl);
    },
    // crickets: distant chorus singing in pulses (2-3.5 per second, with gaps) with its 2nd harmonic;
    // the nearby individuals sing from tickBeds
    crickets(b, t, end) {
      const gc = Float32Array.from({ length: 256 }, (_, i) => { const x = i / 127.5 - 1; return Math.min(1, Math.max(0, (x - 0.2) * 6)); });
      for (const [f, rate, p, pr] of [[4650, 34, -0.5, 2.3], [5050, 29, 0.5, 3.1]]) {
        const s = osc('sine', f, t, end), s2 = osc('sine', f * 2, t, end), am = gain(0.5), sw = gain(0.1), gate = gain(0);
        osc('sine', rate, t, end).connect(gain(0.5)).connect(am.gain);
        // singing pulse: slow sine through a steep threshold (≈40% of the time sounding)
        const pl = osc('sine', pr, t, end), sh = ac.createWaveShaper();
        sh.curve = gc; drift(t, end, 0.2).connect(gain(0.5)).connect(pl.frequency);
        pl.connect(sh).connect(gate.gain);
        drift(t, end, 0.4).connect(gain(0.09)).connect(sw.gain);
        const fd = drift(t, end, 0.3); fd.connect(gain(150)).connect(s.frequency); fd.connect(gain(300)).connect(s2.frequency);
        s.connect(am); s2.connect(gain(0.125)).connect(am);
        am.connect(gate).connect(sw).connect(panner(p)).connect(b.in);
      }
    },
    // fire: flickering roar, flame whoosh and wood hiss (the crackles are separate)
    fire(b, t, end) {
      const flick = drift(t, end, 5), slow = drift(t, end, 0.25);
      const n = noise(t, end, true), roar = gain(0.5);
      flick.connect(gain(0.22)).connect(roar.gain); slow.connect(gain(0.15)).connect(roar.gain);
      n.connect(filt('lowpass', 520, 0)).connect(filt('highpass', 60, BW)).connect(roar).connect(b.in);
      const n2 = noise(t, end, true), bg = gain(0.14);
      flick.connect(gain(0.08)).connect(bg.gain);
      n2.connect(filt('bandpass', 1300, 0.8)).connect(bg).connect(panner(0.25)).connect(b.in);
      const n3 = noise(t, end), hg = gain(0.022);
      slow.connect(gain(0.01)).connect(hg.gain);
      n3.connect(filt('bandpass', 5000, 1.2)).connect(hg).connect(panner(-0.25)).connect(b.in);
    },
    // deep drone in A (fits the scores in A minor): filtered saws that breathe + ghostly air
    drone(b, t, end) {
      const lp = filt('lowpass', 320, 2), dg = gain(0.2);
      drift(t, end, 0.1).connect(gain(120)).connect(lp.frequency);
      for (const [f, d, a] of [[55, -5, 1], [55, 6, 1], [82.41, 2, 0.6], [110, -3, 0.45]]) { const s = osc('sawtooth', f, t, end); s.detune.value = d; s.connect(gain(a)).connect(lp); }
      lp.connect(filt('highpass', 90, BW)).connect(dg).connect(b.in);
      dg.gain.setValueAtTime(0.2, t);
      drift(t, end, 0.06).connect(gain(0.05)).connect(dg.gain);
      for (const p of [-0.55, 0.55]) {
        const n = noise(t, end), rs = filt('bandpass', 1400, 12), rg = gain(0.05);
        drift(t, end, 0.2).connect(gain(550)).connect(rs.frequency); drift(t, end, 0.25).connect(gain(0.05)).connect(rg.gain);
        n.connect(rs).connect(rg).connect(panner(p)).connect(b.in);
      }
    },
    // night: distant murmur and a soft breeze (the moving leaves are separate)
    night(b, t, end) {
      const n = noise(t, end, true), g = gain(0.5);
      drift(t, end, 0.08).connect(gain(0.18)).connect(g.gain);
      n.connect(filt('highpass', 110, BW)).connect(filt('lowpass', 400, 0)).connect(g).connect(b.in);
      for (const p of [-0.5, 0.5]) {
        const n2 = noise(t, end, true), bg = gain(0.08);
        drift(t, end, 0.15).connect(gain(0.06)).connect(bg.gain);
        n2.connect(filt('bandpass', 900, 0.6)).connect(bg).connect(panner(p)).connect(b.in);
      }
    },
  };
  function makeBed(name) {
    const t = ac.currentTime, end = t + 60 * 60 * 6, b = { gain: gain(0), in: gain(BED_CAL[name] ?? 0.5), send: gain(BED_WET[name] ?? 0.2), level: 0, linked: false, offAt: Infinity };
    b.in.connect(b.gain);
    b.send.connect(E.reverb);
    BEDS[name]?.(b, t, end);
    return (beds[name] = b);
  }
  // a quiet ambience disconnects (the browser stops computing it) and reconnects when it sounds again
  function bedLink(b, on) {
    if (on === b.linked) return;
    b.linked = on;
    if (on) { b.gain.connect(E.amb); b.gain.connect(b.send); } else b.gain.disconnect();
  }
  E.bed = (name, level, tc = 1) => {
    const b = beds[name] || makeBed(name);
    b.level = level;
    if (level > 0) bedLink(b, true);
    b.offAt = level > 0 ? Infinity : E.now() + tc * 3 + 0.5;
    b.gain.gain.setTargetAtTime(level, E.now(), tc / 3);
  };
  E.bedLevel = name => beds[name]?.level || 0;
  E.silenceBeds = (except = {}, tc = 1.5) => { for (const k in beds) if (!(k in except)) E.bed(k, 0, tc); };
  // granular parts of the ambiences (fire crackles, drops, crickets, leaves)
  let grainNext = 0;
  E.tickBeds = () => {
    const now = E.now();
    for (const k in beds) if (now > beds[k].offAt) bedLink(beds[k], false);
    if (grainNext < now) grainNext = now;
    while (grainNext < now + 0.2) {
      const t = grainNext;
      if (E.bedLevel('fire') > 0.02 && Math.random() < 0.45) crackle(t);
      if (E.bedLevel('rain') > 0.02 && Math.random() < 0.75) drop(t);
      if (E.bedLevel('night') > 0.02 && Math.random() < 0.006) rustle(t);
      grainNext += 0.02 + Math.random() * 0.06;
    }
    if (E.bedLevel('crickets') > 0.02) cricketsTick(now);
  };
  const grainOut = (node, name, p) => node.connect(panner(p)).connect(beds[name].in);
  // cluster of crackles (sometimes a deeper wood burst)
  function crackle(t) {
    const big = Math.random() < 0.08, k = big ? 1 : 1 + Math.floor(Math.random() ** 2 * 5), end = t + k * 0.03 + 0.06;
    const n = noise(t, end), bp = filt('bandpass', big ? rnd(500, 1100) : rnd(1200, 5500), big ? 2 : rnd(1, 2.5)), g = ac.createGain(), p = g.gain;
    p.setValueAtTime(0, t);
    let tt = t;
    for (let i = 0; i < k; i++) {
      const a = (big ? 1.6 : rnd(0.25, 1)) * (i ? rnd(0.3, 0.8) : 1), d = big ? 0.03 : rnd(0.002, 0.008);
      p.setValueAtTime(a, tt); p.setTargetAtTime(0, tt + 0.0005, d / 3);
      tt += rnd(0.004, 0.028);
    }
    grainOut(n.connect(bp).connect(g), 'fire', rnd(-0.6, 0.6));
  }
  // drop: tap on leaves/ground; sometimes a "plic" in a puddle (bubble rising in pitch)
  function drop(t) {
    const r = Math.random();
    if (r < 0.86) {
      const n = noise(t, t + 0.02), g = perc(t, rnd(0.1, 0.55), rnd(0.003, 0.012), 0.0005);
      grainOut(n.connect(filt('bandpass', rnd(1200, 4500), rnd(0.8, 1.6))).connect(g), 'rain', rnd(-0.9, 0.9));
    } else {
      const heavy = r > 0.97, f = heavy ? rnd(700, 1300) : rnd(1300, 3200), d = rnd(0.03, 0.07), s = osc('sine', f, t, t + d + 0.02), g = perc(t, heavy ? 0.22 : 0.1, d, 0.001);
      s.frequency.exponentialRampToValueAtTime(f * rnd(1.3, 1.8), t + d);
      grainOut(s.connect(g), 'rain', rnd(-0.8, 0.8));
    }
  }
  // leaves stirring in the distance
  function rustle(t) {
    const d = rnd(0.6, 1.8), n = noise(t, t + d + 0.05), g = ac.createGain(), amp = rnd(0.15, 0.4);
    g.gain.value = 0;
    g.gain.setValueCurveAtTime(Float32Array.from({ length: 40 }, (_, i) => Math.sin(Math.PI * i / 39) ** 2 * rnd(0.3, 1) * amp), t, d);
    grainOut(n.connect(filt('bandpass', rnd(2400, 4500), 0.9)).connect(g), 'night', rnd(-0.8, 0.8));
  }
  // nearby crickets: each with its own tone, syllable rhythm, position and rests
  const crickets = [-0.85, -0.5, -0.15, 0.2, 0.55, 0.85].map(p => ({ f: rnd(4100, 5200), syl: 3 + Math.floor(Math.random() * 3), sp: rnd(0.022, 0.034), per: rnd(0.38, 0.8), pan: p + rnd(-0.1, 0.1), amp: rnd(0.35, 1), next: 0 }));
  function cricketsTick(now) {
    for (const c of crickets) {
      if (c.next < now) c.next = now + Math.random() * c.per;
      while (c.next < now + 0.25) {
        if (Math.random() < 0.05) { c.next += rnd(1.5, 5); continue; }
        chirp(c.next, c);
        c.next += c.per * rnd(0.93, 1.07);
      }
    }
  }
  function chirp(t, c) {
    const len = c.syl * c.sp, s = osc('sine', c.f * 1.01, t, t + len), g = ac.createGain(), N = c.syl * 24;
    s.frequency.linearRampToValueAtTime(c.f * 0.99, t + len);
    g.gain.value = 0;
    // each syllable: bell-shaped pulse (62% of the period); the last one slightly weaker
    g.gain.setValueCurveAtTime(Float32Array.from({ length: N + 1 }, (_, i) => {
      const k = Math.min(c.syl - 1, Math.floor(i / 24)), x = (i % 24) / 24 / 0.62;
      return x < 1 ? Math.sin(Math.PI * x) ** 2 * c.amp * (k === c.syl - 1 ? 0.7 : 1) : 0;
    }), t, len);
    grainOut(s.connect(g), 'crickets', c.pan);
  }

  // ---------- instruments (for the scores) ----------
  const I = {};
  const ORGAN = [1, 0.9, 0.38, 0.6, 0.12, 0.3, 0.05, 0.3, 0.04, 0.12, 0.02, 0.15, 0.01, 0.03, 0.01, 0.1];
  const BOURDON = [1, 0.04, 0.25, 0.02, 0.08, 0, 0.03];
  // pipe organ: full (8'+4'+mixture) in two slightly detuned rows, 16' bourdon, attack chiff and gentle tremolo
  I.organ = (t, notes, dur, o = {}) => {
    const v = o.vel ?? 0.5, rel = o.release ?? 0.5, end = t + dur + rel * 2 + 0.1, n = notes.length;
    const lp = filt('lowpass', o.cutoff ?? 3800, 0, t), hp = filt('highpass', 55, BW), g = env(t, 0.07, v * 0.105 / Math.sqrt(n), dur, rel);
    const trem = gain(1);
    osc('sine', o.tremRate ?? 5.3, t, end).connect(gain(o.trem ?? 0.05)).connect(trem.gain);
    const ch = noise(t, t + 0.15), chg = perc(t, v * 0.8, 0.09, 0.012);
    for (const m of notes) {
      const f = midiHz(m);
      // very low notes: the 8' would fall below 60 Hz (not audible and it pumps); the 4' sounds instead
      wosc(pw('organ', ORGAN), f < 60 ? f * 2 : f, t, end).connect(hp);
      const b = wosc(pw('organ', ORGAN), f, t, end);
      b.detune.value = 3 + Math.random() * 3;
      b.connect(gain(0.6)).connect(hp);
      // bourdon only if it doesn't fall into sub-bass the speakers can't reproduce (and which makes the compressor pump)
      if (f / 2 >= 45) wosc(pw('bourdon', BOURDON), f / 2, t, end).connect(gain(0.6)).connect(hp);
      ch.connect(filt('bandpass', Math.min(6000, f * 3), 5)).connect(chg);
    }
    chg.connect(hp);
    out(hp.connect(lp).connect(trem).connect(g), o, E.music, 0.35, t, dur);
  };
  // music box: steel tine (reed modes 1 : 5.9 : 17.4), doubled for beating, tine click
  I.musicBox = (t, m, o = {}) => {
    const v = o.vel ?? 0.5, f = midiHz(m), sum = gain(1), dec = (o.decay ?? 1.8) * Math.min(1.4, Math.pow(880 / f, 0.35));
    for (const [mul, amp, d] of [[1, 1, 1], [1.0012, 0.45, 0.75], [5.93, 0.35, 0.1], [17.4, 0.12, 0.03]]) {
      if (f * mul > 11000) continue;
      const s = osc('sine', f * mul, t, t + dec * d + 0.1);
      s.connect(perc(t, amp * v * 0.2, dec * d, 0.0015)).connect(sum);
    }
    noise(t, t + 0.02).connect(filt('bandpass', Math.min(8000, f * 4), 3)).connect(perc(t, v * 0.25, 0.008, 0.0008)).connect(sum);
    out(sum, o, E.music, 0.35, t, dec);
  };
  // celesta: plates with resonator, felt hammer, sweeter than the music box
  I.celesta = (t, m, o = {}) => {
    const v = o.vel ?? 0.5, f = midiHz(m), sum = gain(1), dec = (o.decay ?? 1.5) * Math.min(1.5, Math.pow(660 / f, 0.4));
    for (const [mul, amp, d] of [[1, 1, 1], [1.0008, 0.35, 0.9], [2, 0.12, 0.45], [2.76, 0.1, 0.18], [5.4, 0.05, 0.07]]) {
      if (f * mul > 11000) continue;
      osc('sine', f * mul, t, t + dec * d + 0.1).connect(perc(t, amp * v * 0.2, dec * d, 0.003)).connect(sum);
    }
    noise(t, t + 0.04).connect(filt('lowpass', 1800, 0)).connect(perc(t, v * 0.12, 0.015, 0.002)).connect(sum);
    out(sum, o, E.music, 0.38, t, dec);
  };
  // theremin: almost a sine with some harmonics and nasality; holds each note and glides to the next
  // path = [[seconds, midi], ...]; or.glide = glide seconds (default 0.45)
  I.theremin = (t, path, o = {}) => {
    const v = o.vel ?? 0.5, dur = path[path.length - 1][0], end = t + dur + 1.4;
    const s = wosc(pw('theremin', [1, 0.22, 0.12, 0.04, 0.03, 0.01]), midiHz(path[0][1]), t, end);
    let prev = path[0][1], pt = 0;
    for (const [dt, m] of path.slice(1)) {
      const gl = Math.min(o.glide ?? 0.45, (dt - pt) * 0.7);
      s.frequency.setValueAtTime(midiHz(prev), t + dt - gl); s.frequency.exponentialRampToValueAtTime(midiHz(m), t + dt);
      prev = m; pt = dt;
    }
    // vibrato that grows, slightly irregular, with a little volume tremolo
    const l = osc('sine', 6.1, t, end), la = gain(0), amp = gain(1);
    drift(t, end, 1.5).connect(gain(0.5)).connect(l.frequency);
    la.gain.setValueAtTime(0, t); la.gain.linearRampToValueAtTime(o.vibrato ?? 24, t + Math.min(1.4, dur));
    l.connect(la).connect(s.detune); l.connect(gain(0.06)).connect(amp.gain);
    const g = env(t, 0.3, v * 0.13, Math.max(0, dur - 0.3), 1);
    const nasal = filt('peaking', 1300, 1); nasal.gain.value = 4;
    s.connect(filt('highpass', 140, BW)).connect(nasal).connect(amp).connect(g);
    out(g, o, E.music, 0.55, t, dur);
  };
  // synthetic string pad: 4 saws per note spread left/right, slow chorus and a breathing filter
  I.pad = (t, notes, dur, o = {}) => {
    const v = o.vel ?? 0.5, rel = o.release ?? 2.5, end = t + dur + rel * 2 + 0.1, cut = o.cutoff ?? 1150;
    const lp = filt('lowpass', cut, 0, t), g = env(t, o.attack ?? 1.5, v * 0.09 / Math.sqrt(notes.length), dur, rel);
    if (o.sweep) { lp.frequency.setValueAtTime(cut, t); lp.frequency.linearRampToValueAtTime(o.sweep, t + dur); }
    drift(t, end, 0.3).connect(gain(cut * 0.2)).connect(lp.frequency);
    const L = panner(-0.55), R = panner(0.55), mixp = gain(1), ch = drift(t, end, 0.8), cg = gain(5);
    ch.connect(cg);
    L.connect(mixp); R.connect(mixp);
    for (const m of notes) [-11, -4, 4, 11].forEach((d, k) => {
      const s = osc('sawtooth', midiHz(m), t, end);
      s.detune.value = d + (Math.random() - 0.5) * 4;
      if (k % 2) cg.connect(s.detune);
      s.connect(k % 2 ? R : L);
    });
    out(mixp.connect(filt('highpass', 90, BW)).connect(lp).connect(g), o, E.music, 0.4, t, dur);
  };
  // choir formants (contralto): [frequency, bandwidth, dB]
  const CHOIR = {
    a: [[800, 80, 0], [1150, 90, -4], [2800, 120, -10], [3500, 130, -26], [4950, 140, -34]],
    e: [[400, 60, 0], [1600, 80, -16], [2700, 120, -14], [3300, 150, -28], [4950, 200, -36]],
    i: [[350, 50, 0], [1700, 100, -14], [2700, 120, -14], [3700, 150, -28], [4950, 200, -36]],
    o: [[450, 70, 0], [800, 80, -7], [2830, 100, -9], [3500, 130, -26], [4950, 135, -36]],
    u: [[325, 50, 0], [700, 60, -10], [2530, 170, -17], [3500, 180, -32], [4950, 200, -38]],
  };
  // ghostly choir: 3 voices per note with their own detuning and vibrato, breath, bank of 5 formants.
  // o.vowel = vowel; o.vowel2 = vowel it morphs into during the note
  I.choir = (t, notes, dur, o = {}) => {
    const v = o.vel ?? 0.5, rel = o.release ?? 2.5, end = t + dur + rel * 2 + 0.1;
    const g = env(t, o.attack ?? 1.2, v * 0.36 / Math.sqrt(notes.length), dur, rel), src = gain(1), L = panner(-0.5), R = panner(0.5);
    L.connect(src); R.connect(src);
    for (const m of notes) for (let k = 0; k < 3; k++) {
      const s = osc('sawtooth', midiHz(m), t, end);
      s.detune.value = (k - 1) * 8 + (Math.random() - 0.5) * 6;
      vibrato(s.detune, t, end, rnd(4.5, 5.7), rnd(12, 22));
      s.connect(k === 1 ? src : k ? R : L);
    }
    noise(t, end).connect(filt('highpass', 1200, 0)).connect(gain(0.05 * Math.sqrt(notes.length))).connect(src);
    const tilt = filt('lowpass', 4000, BW), bank = gain(1), V = CHOIR[o.vowel] || CHOIR.a, V2 = o.vowel2 && CHOIR[o.vowel2];
    src.connect(tilt);
    V.forEach(([f, bw, dB], k) => {
      // F3-F5 slightly wider: in a choir distinct voices add up and the 2.5-3.5 kHz zone is a cluster, not a peak
      const bp = filt('bandpass', f, f / (bw * (k >= 2 ? 2.2 : 1)), t), a = gain(Math.pow(10, dB / 20));
      if (V2) { bp.frequency.setValueAtTime(f, t + dur * 0.2); bp.frequency.linearRampToValueAtTime(V2[k][0], t + dur * 0.8); a.gain.setValueAtTime(a.gain.value, t + dur * 0.2); a.gain.linearRampToValueAtTime(Math.pow(10, V2[k][2] / 20), t + dur * 0.8); }
      tilt.connect(bp).connect(a).connect(bank);
    });
    // "singer's formant" (brightness at 3 kHz): it's what lets a choir be heard above the drone at a distance
    const sf = filt('peaking', 3000, 0.9); sf.gain.value = 4;
    out(bank.connect(sf).connect(g), o, E.music, 0.7, t, dur);
  };
  // plucked / pizzicato: plucked string (harmonics depending on the pluck point) with a filter that closes and a click
  I.pluck = (t, m, o = {}) => {
    const v = o.vel ?? 0.5, f = midiHz(m), dec = o.decay ?? 0.35, end = t + dec * 3 + 0.1;
    const lp = filt('lowpass', Math.min(9000, f * 14), 2, t), g = ac.createGain();
    lp.frequency.exponentialRampToValueAtTime(Math.max(350, f * 2.2), t + 0.22);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.3, t + 0.003); g.gain.setTargetAtTime(0, t + 0.003, dec / 3.2);
    const w = pw('pluck', n => Math.abs(Math.sin(n * Math.PI * 0.17)) / Math.pow(n, 1.1));
    wosc(w, f, t, end).connect(lp);
    const s2 = wosc(w, f, t, end);
    s2.detune.value = 7; s2.connect(gain(0.45)).connect(lp);
    noise(t, t + 0.012).connect(perc(t, v * 0.05, 0.006, 0.0005)).connect(lp);
    out(lp.connect(g), o, E.music, 0.25, t, dec);
  };
  // harpsichord: quill plucking near the end, two 8' strings and one 4', damper on release (o.dur)
  I.harpsichord = (t, m, o = {}) => {
    const v = o.vel ?? 0.5, f = midiHz(m), dur = o.dur ?? 1.2, dec = Math.min(3, 1.6 * Math.pow(220 / f, 0.5)), end = t + dur + 0.25;
    const w = pw('harpsi', n => Math.abs(Math.sin(n * Math.PI * 0.08)) / Math.pow(n, 0.85));
    const lp = filt('lowpass', Math.min(8000, f * 20), 0, t), g = ac.createGain(), damp = gain(1), sum = gain(1);
    lp.frequency.exponentialRampToValueAtTime(Math.max(1500, f * 5), t + 0.4);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v * 0.3, t + 0.002); g.gain.setTargetAtTime(0, t + 0.002, dec / 3);
    damp.gain.setValueAtTime(1, t + dur); damp.gain.setTargetAtTime(0, t + dur, 0.03);
    wosc(w, f, t, end).connect(lp);
    const b = wosc(w, f, t, end); b.detune.value = 4; b.connect(gain(0.8)).connect(lp);
    wosc(w, f * 2, t, end).connect(gain(0.3)).connect(lp);
    lp.connect(g).connect(damp).connect(sum);
    noise(t, t + 0.01).connect(filt('highpass', 2000, 0)).connect(perc(t, v * 0.05, 0.006, 0.0005)).connect(sum);
    noise(t + dur, t + dur + 0.05).connect(filt('bandpass', 500, 2)).connect(perc(t + dur, v * 0.05, 0.03, 0.002)).connect(sum);
    out(sum, o, E.music, 0.35, t, dur);
  };
  // church bell (additive): hum, prime, minor third, fifth, nominal… each partial with its own decay and beating,
  // plus the clapper strike with FM brightness (o.ratio, o.index still control that brightness)
  I.bell = (t, m, o = {}) => {
    const v = o.vel ?? 0.6, f = midiHz(m), dec = o.decay ?? 5, sum = gain(1);
    // the nominal (2x) lasts the longest: the hum (0.5x) falls in bass that small speakers can't reproduce
    const hum = f * 0.5 < 90 ? 0.15 : 0.3;
    for (const [mul, amp, d, beat] of [[0.5, hum, 0.8, 0.6], [1, 0.4, 0.75, 0.9], [1.19, 0.5, 0.6, 0], [1.5, 0.25, 0.45, 0], [2, 0.8, 0.9, 1.3], [2.5, 0.25, 0.4, 0], [2.66, 0.25, 0.35, 0], [3.01, 0.3, 0.3, 0], [4.07, 0.2, 0.22, 0], [5.2, 0.12, 0.15, 0], [6.3, 0.08, 0.1, 0], [8, 0.05, 0.07, 0]]) {
      const fq = f * mul * (1 + (Math.random() - 0.5) * 0.002);
      if (fq > 9000) continue;
      const e = t + dec * d + 0.1, pg = perc(t, amp * v * 0.13, dec * d, 0.002);
      osc('sine', fq, t, e).connect(pg);
      if (beat) osc('sine', fq + beat, t, e).connect(gain(0.45)).connect(pg);
      pg.connect(sum);
    }
    const fe = t + dec * 0.25, car = osc('sine', f * 2, t, fe), mod = osc('sine', f * 2 * (o.ratio ?? 3.5), t, fe), mg = gain(0);
    mg.gain.setValueAtTime(f * 2 * (o.index ?? 4) * 0.5, t); mg.gain.exponentialRampToValueAtTime(f * 0.1, t + dec * 0.2);
    mod.connect(mg).connect(car.frequency);
    car.connect(perc(t, v * 0.07, dec * 0.2, 0.002)).connect(sum);
    noise(t, t + 0.04).connect(filt('bandpass', Math.min(5000, f * 8), 1.5)).connect(perc(t, v * 0.12, 0.02, 0.001)).connect(sum);
    out(sum, o, E.music, 0.4, t, dec);
  };
  // tubular bells: nearly harmonic partials (pitch set by the 2nd-4th), metallic hammer strike
  I.tubular = (t, m, o = {}) => {
    const v = o.vel ?? 0.6, f = midiHz(m), dec = o.decay ?? 6, sum = gain(1);
    for (const [mul, amp, d] of [[1, 0.5, 1], [2.02, 0.75, 0.8], [3, 0.9, 0.65], [4.17, 0.5, 0.45], [5.43, 0.35, 0.3], [6.79, 0.2, 0.2], [8.21, 0.12, 0.12]]) {
      const fq = f * mul * (1 + (Math.random() - 0.5) * 0.0015);
      if (fq > 10000) continue;
      osc('sine', fq, t, t + dec * d + 0.1).connect(perc(t, amp * v * 0.13, dec * d, 0.002)).connect(sum);
    }
    noise(t, t + 0.03).connect(filt('highpass', 2500, 0)).connect(perc(t, v * 0.1, 0.015, 0.0008)).connect(sum);
    out(sum, o, E.music, 0.42, t, dec);
  };
  // timpani: membrane modes with the kettle (1 : 1.5 : 1.98 : 2.44), pitch that settles, felt mallet
  // with a dull hit at 300-600 Hz. Useful range: MIDI 38-55 (D2-G3, 73-196 Hz). o.roll = roll seconds; o.decay
  I.timpani = (t, m, o = {}) => {
    const v = o.vel ?? 0.7, f = midiHz(m), dec = o.decay ?? 2.2, roll = o.roll ?? 0, end = t + roll + dec + 0.2, sum = gain(1);
    const N = Math.max(2, Math.round(roll * 15)), hits = roll > 0 ? Array.from({ length: N }, (_, i) => [t + i / 15 + Math.random() * 0.008, 0.35 + 0.65 * i / (N - 1)]) : [[t, 1]];
    const modes = [[1, 1, 1], [1.5, 0.5, 0.6], [1.98, 0.35, 0.45], [2.44, 0.2, 0.3], [2.9, 0.1, 0.2]];
    for (const [mul, amp, d] of modes) {
      const s = osc('sine', f * mul, t, end), g = ac.createGain(), p = g.gain;
      p.setValueAtTime(0, t);
      for (const [ht, a] of hits) { p.setTargetAtTime(amp * a * v * 0.18, ht, 0.002); p.setTargetAtTime(0, ht + 0.008, dec * d / 4.5); s.frequency.setValueAtTime(f * mul * 1.025, ht); s.frequency.setTargetAtTime(f * mul, ht, 0.04); }
      s.connect(g).connect(sum);
    }
    const n = noise(t, t + roll + 0.1), ng = ac.createGain();
    ng.gain.setValueAtTime(0, t);
    for (const [ht, a] of hits) { ng.gain.setTargetAtTime(a * v * 0.15, ht, 0.001); ng.gain.setTargetAtTime(0, ht + 0.004, 0.012); }
    n.connect(filt('lowpass', 2500, 0)).connect(ng).connect(sum);
    const th = osc('sine', rnd(300, 600), t, t + roll + 0.15), tg = ac.createGain();
    tg.gain.setValueAtTime(0, t);
    for (const [ht, a] of hits) { tg.gain.setTargetAtTime(a * v * 0.12, ht, 0.001); tg.gain.setTargetAtTime(0, ht + 0.005, 0.02); }
    th.connect(tg).connect(sum);
    out(sum, o, E.music, 0.4, t, roll + dec * 0.5);
  };
  // strings (section): 3 bows per note with late-entering vibrato, violin body (resonances), o.trem = bow tremolo
  I.strings = (t, notes, dur, o = {}) => {
    const v = o.vel ?? 0.5, rel = o.release ?? 1, end = t + dur + rel * 2 + 0.1;
    const g = env(t, o.attack ?? 0.35, v * 0.075 / Math.sqrt(notes.length), dur, rel), L = panner(-0.45), R = panner(0.45), mixs = gain(1);
    L.connect(mixs); R.connect(mixs);
    for (const m of notes) for (let k = 0; k < 3; k++) {
      const s = osc('sawtooth', midiHz(m), t, end), la = gain(0);
      s.detune.value = (k - 1) * 6 + (Math.random() - 0.5) * 5;
      la.gain.setValueAtTime(0, t + 0.2); la.gain.linearRampToValueAtTime(o.vibrato ?? 12, t + rnd(0.5, 0.9));
      osc('sine', rnd(5, 6), t, end).connect(la).connect(s.detune);
      s.connect(k === 1 ? mixs : k ? R : L);
    }
    const b1 = filt('peaking', 450, 1.2), b2 = filt('peaking', 2600, 1.2);
    b1.gain.value = 3; b2.gain.value = 4;
    let chain = mixs.connect(filt('highpass', 110, BW)).connect(b1).connect(b2).connect(filt('lowpass', o.cutoff ?? 5500, BW));
    if (o.trem) { const tg = gain(0.5); osc('triangle', o.trem === true ? 12 : o.trem, t, end).connect(gain(0.5)).connect(tg.gain); chain = chain.connect(tg); }
    out(chain.connect(g), o, E.music, 0.4, t, dur);
  };
  // bass: saw + square with a filter that closes (without fully closing) and some saturation, plus a layer
  // parallel saturated at 800-1000 Hz ("growl") which is what you hear from a bass on small speakers; discreet sub
  I.bass = (t, m, dur, o = {}) => {
    const v = o.vel ?? 0.5, f = midiHz(m), end = t + dur + 0.4, lp = filt('lowpass', 1400, 3, t), g = env(t, 0.004, v * 0.22, dur, 0.15);
    lp.frequency.setValueAtTime(Math.min(4500, f * 18), t); lp.frequency.exponentialRampToValueAtTime(Math.max(600, f * 6), t + 0.22);
    const src = gain(1);
    osc('sawtooth', f, t, end).connect(src);
    const sq = osc('square', f, t, end); sq.detune.value = -7; sq.connect(gain(0.45)).connect(src);
    src.connect(lp).connect(drive(2.5)).connect(g);
    src.connect(drive(4)).connect(filt('bandpass', rnd(800, 1000), 1.2)).connect(gain(0.25)).connect(g);
    if (f / 2 >= 50) osc('sine', f / 2, t, end).connect(gain(0.25)).connect(g);
    out(g, o, E.music, 0.08, t, dur);
  };
  // kick: body with a pitch drop ending at 55 Hz (not lower: speakers can't reproduce it), saturated to give
  // audible harmonics, "punch" at 110-130 Hz and mallet click at 2.5-4 kHz that is heard at 20 m
  I.kick = (t, o = {}) => {
    const v = o.vel ?? 0.8, s = osc('sine', 170, t, t + 0.4), sum = gain(1), fe = rnd(54, 58);
    s.frequency.exponentialRampToValueAtTime(62, t + 0.05); s.frequency.exponentialRampToValueAtTime(fe, t + 0.25);
    s.connect(drive(2.2)).connect(perc(t, v * 0.4, 0.32, 0.002)).connect(sum);
    const pu = osc('triangle', rnd(115, 128), t, t + 0.1);
    pu.frequency.exponentialRampToValueAtTime(fe * 2, t + 0.06);
    pu.connect(perc(t, v * 0.2, 0.06, 0.001)).connect(sum);
    noise(t, t + 0.03).connect(filt('bandpass', rnd(2600, 3800), 1.2)).connect(perc(t, v * 0.42, 0.02, 0.0005)).connect(sum);
    out(sum, o, E.music, 0.05, t, 0.3);
  };
  // snare: two patch modes + snares (noise with brightness)
  I.snare = (t, o = {}) => {
    const v = o.vel ?? 0.6, sum = gain(1);
    for (const [f, a, d] of [[185, 0.4, 0.11], [330, 0.22, 0.07]]) {
      const s = osc('triangle', f * 1.12, t, t + 0.25);
      s.frequency.exponentialRampToValueAtTime(f, t + 0.03);
      s.connect(perc(t, v * a, d, 0.001)).connect(sum);
    }
    const pk = filt('peaking', 4800, 0.9); pk.gain.value = 5;
    noise(t, t + 0.35).connect(filt('highpass', 1200, 0)).connect(filt('lowpass', 9000, 0)).connect(pk).connect(perc(t, v * 0.42, 0.2, 0.001)).connect(sum);
    out(sum, o, E.music, 0.2, t, 0.2);
  };
  // hi-hat: inharmonic squares (metal) + noise, in the high band without overdoing the highs
  I.hat = (t, o = {}) => {
    const v = o.vel ?? 0.4, dec = o.open ? 0.22 : 0.05, end = t + dec + 0.05, metal = gain(0.12);
    for (const f of [205.3, 304.4, 369.6, 522.7, 540, 800]) osc('square', f * 1.6, t, end).connect(metal);
    noise(t, end).connect(gain(0.5)).connect(metal);
    const g = perc(t, v * 6, dec, 0.0015);
    metal.connect(filt('bandpass', 6500, 1.2)).connect(filt('lowpass', 10000, BW)).connect(g);
    out(g, o, E.music, 0.05, t, 0.1);
  };
  // timbal / tom: two modes with a pitch drop and stick hit
  I.tom = (t, m, o = {}) => {
    const v = o.vel ?? 0.6, f = midiHz(m), sum = gain(1);
    const s = osc('sine', f * 1.5, t, t + 0.6);
    s.frequency.exponentialRampToValueAtTime(f, t + 0.15);
    s.connect(perc(t, v * 0.5, 0.42)).connect(sum);
    const s2 = osc('sine', f * 1.59 * 1.3, t, t + 0.3);
    s2.frequency.exponentialRampToValueAtTime(f * 1.59, t + 0.12);
    s2.connect(perc(t, v * 0.16, 0.2)).connect(sum);
    noise(t, t + 0.03).connect(filt('lowpass', 3000, 0)).connect(perc(t, v * 0.15, 0.015, 0.001)).connect(sum);
    out(sum, o, E.music, 0.25, t, 0.4);
  };
  // organ stab chord + brass (saws with a filter that opens suddenly) for dramatic hits
  I.stab = (t, notes, o = {}) => {
    const v = o.vel ?? 0.7, dur = o.dur ?? 0.35, end = t + dur + 0.8;
    I.organ(t, notes, dur, { ...o, vel: v * 1.1, cutoff: 5000, release: 0.5 });
    const lp = filt('lowpass', 500, 2, t), g = env(t, 0.01, v * 0.07 / Math.sqrt(notes.length), dur, 0.35);
    lp.frequency.exponentialRampToValueAtTime(4500, t + 0.03); lp.frequency.exponentialRampToValueAtTime(1500, t + 0.35);
    for (const m of [...notes, Math.min(...notes) - 12]) for (const d of [-8, 8]) { const s = osc('sawtooth', midiHz(m), t, end); s.detune.value = d; s.connect(lp); }
    out(lp.connect(g), o, E.music, 0.4, t, dur);
  };
  // drone (instrument): detuned saws with a slowly breathing filter and sub-octave; o.cutoff = brightness
  I.drone = (t, m, dur, o = {}) => {
    const v = o.vel ?? 0.5, end = t + dur + 4.1, cut = o.cutoff ?? 300, f = midiHz(m), lp = filt('lowpass', cut, 3, t), g = env(t, o.attack ?? 2, v * 0.08, dur, 2);
    drift(t, end, 0.15).connect(gain(cut * 0.35)).connect(lp.frequency);
    for (const d of [-12, 0, 7]) { const s = osc('sawtooth', f, t, end); s.detune.value = d; s.connect(lp); }
    lp.connect(g);
    if (f / 2 >= 55) osc('sine', f / 2, t, end).connect(gain(0.35)).connect(g);
    out(g, o, E.music, 0.4, t, dur);
  };
  E.inst = I;

  // pieces for the sound effects (js/audio/sfx-*.js)
  E.h = { ac, T, osc, noise, filt, gain, env, perc, out, formant, vibrato, distCurve, I, drift, pw, wosc, panner, drive, rnd };
  E.sfxs = {};
  for (const [n, fn] of Object.entries(SFX)) E.sfxs[n] = (o = {}) => fn(E, o);

  return E;
}

const Sound = (() => {
  let E = null, live = null, muted = false, volume = 0.9, cur = null;
  try { volume = +(localStorage.getItem('hallowin.volume') ?? 0.9); } catch {}
  const LOOK = 0.25;

  function ensure() {
    if (live) return live;
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    live = E = createAudioEngine(ac, () => ac.currentTime);
    applyVolume();
    return live;
  }
  function applyVolume() { if (E) E.master.gain.setTargetAtTime(muted ? 0 : volume, E.now(), 0.08); }
  const ready = () => E && (E.ac.state === 'running' || E.ac instanceof OfflineAudioContext);

  // API each score receives: instruments, effects, ambiences and a sequencer tied to scene time
  function makeScoreAPI(name) {
    const outGain = E.ac.createGain();
    outGain.connect(E.music);
    const st = { anchor: 0, steps: {}, fired: {} };
    const A = { out: outGain, state: {} };
    // instruments: go out through this score's bus (it fades when the scene changes)
    for (const [k, fn] of Object.entries(E.inst)) A[k] = (t, ...args) => {
      const last = args.length && typeof args[args.length - 1] === 'object' && !Array.isArray(args[args.length - 1]) ? args.pop() : {};
      return fn(t, ...args, { out: outGain, ...last });
    };
    A.sfx = (n, o = {}) => E.sfxs[n]?.(o);
    for (const n of Object.keys(SFX)) A[n] = (o = {}) => E.sfxs[n]?.(o);
    A.bed = (n, level, tc) => E.bed(n, level, tc);
    A.midi = midiHz;
    A.time = sceneT => st.anchor + sceneT;
    // panning by horizontal position on screen (px) or by a zone (by type and index)
    A.panX = x => clamp((x / (typeof innerWidth === 'number' && innerWidth ? innerWidth : 1920)) * 2 - 1, -1, 1) * 0.9;
    A.zonePan = (kind, index = 0) => {
      const sz = (A.S?.screenZones || []).find(z => z.kind === kind && z.index === index);
      return sz ? A.panX(sz.cx) : 0;
    };
    // fn(i, when) for each step i that falls at scene time from + i*dt (up to `to`)
    A.steps = (key, dt, fn, from = 0, to = Infinity) => {
      const S = A.S, s = (st.steps[key] ??= { next: Math.max(0, Math.ceil((S.t - from) / dt - 1e-6)) });
      while (from + s.next * dt < Math.min(S.t + LOOK, to)) {
        const when = st.anchor + from + s.next * dt;
        if (when >= E.now() - 0.02) fn(s.next, when);
        s.next++;
      }
    };
    // fn(when) only once when the scene reaches sceneT
    A.at = (sceneT, fn, key = sceneT) => {
      const S = A.S;
      if (st.fired[key] || sceneT > S.t + LOOK) return;
      st.fired[key] = true;
      if (sceneT >= S.t - 0.3) fn(Math.max(st.anchor + sceneT, E.now()));
    };
    A._sync = S => {
      A.S = S;
      const want = E.now() - S.t;
      if (!st.started || Math.abs(want - st.anchor) > 0.12) {
        st.anchor = want;
        st.steps = {};
        st.started = true;
      }
    };
    A._fade = () => {
      outGain.gain.setTargetAtTime(0, E.now(), 0.4);
      if (!(E.ac instanceof OfflineAudioContext)) setTimeout(() => outGain.disconnect(), 4000);
    };
    return A;
  }

  // Called every frame by main.js: switches score when the scene changes and advances it
  function tick(scene, S, active) {
    if (!ready()) return;
    E.tickBeds();
    const name = scene?.name;
    const restarted = cur && cur.name === name && S.t < cur.lastT - 0.5;
    if (!cur || cur.name !== name || restarted) {
      cur?.A._fade();
      const score = SCORES[name];
      cur = { name, score, A: makeScoreAPI(name), lastT: S.t };
      // score.gain (optional, 1 by default): volume adjustment for that score's music
      if (score?.gain > 0) cur.A.out.gain.value = score.gain;
      if (score) {
        E.silenceBeds(score.beds || {});
        for (const [b, lvl] of Object.entries(score.beds || {})) E.bed(b, lvl, 2);
      }
      cur.A._sync(S);
      score?.start?.(cur.A, S);
    }
    cur.lastT = S.t;
    if (!active) { cur.A.S = S; return; }
    cur.A._sync(S);
    try { cur.score?.tick?.(cur.A, S); } catch (err) { if (!cur.err) { console.error(err); cur.err = true; } }
  }

  const api = {
    get on() { return !!live && !muted && live.ac.state === 'running'; },
    get started() { return !!live && live.ac.state === 'running'; },
    get volume() { return volume; },
    // M: the first time starts the sound; afterwards mutes / unmutes
    toggle() {
      const wasRunning = api.started;
      ensure();
      live.ac.resume();
      muted = wasRunning ? !muted : false;
      applyVolume();
      return !muted;
    },
    // first key or click: the browser now allows audio to start
    unlock() { ensure(); if (live.ac.state === 'suspended') live.ac.resume(); },
    setVolume(v) {
      volume = clamp(v, 0, 1.5);
      try { localStorage.setItem('hallowin.volume', String(volume)); } catch {}
      applyVolume();
    },
    // default ambience level (wind + drone) for scenes without a score
    ambience(level) {
      if (!E || typeof App === 'undefined' || SCORES[SCENES[App.scene]?.name]) return;
      E.bed('wind', level * 0.8, 2); E.bed('drone', level * 0.6, 2);
    },
    tick,
    // compatibility: the party music is now played by its score
    music() {},

    // Renders a scene in non-real time (audio lab): returns an AudioBuffer
    // onFrame(S, k): optional, called every simulated frame (the lab draws the zones there)
    async renderScene(scene, S, from, secs, onFrame) {
      const sr = 44100, oac = new OfflineAudioContext(2, Math.ceil(sr * secs), sr);
      let sim = 0;
      const saved = { E, cur, muted };
      E = createAudioEngine(oac, () => sim);
      E.master.gain.value = 1;
      cur = null; muted = false;
      S.t = S.prevT = from;
      for (let k = 0; k <= secs * 60; k++) {
        sim = k / 60;
        S.prevT = S.t; S.t = from + sim; S.T = sim; S.dt = 1 / 60;
        try { scene.update?.(S); onFrame?.(S, k); } catch (err) { console.error(err); }
        tick(scene, S, true);
      }
      const buf = await oac.startRendering();
      ({ E, cur, muted } = saved);
      return buf;
    },
  };
  // loose effect by name (silent if audio hasn't started); a number is taken as intensity,
  // except in rumble, where it is the duration (old signature)
  api.play = (name, o = {}) => {
    if (!ready() || !E.sfxs[name]) return;
    E.sfxs[name](typeof o === 'number' ? (name === 'rumble' ? { dur: o } : { vel: o }) : o);
  };
  return api;
})();
