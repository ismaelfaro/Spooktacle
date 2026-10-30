// Effects: storm, impacts and transitions.
// Each effect: registerSfx(name, (E, o) => ...); E.h brings the synthesis pieces (see createAudioEngine in js/audio.js).
// o = { t, pan, vel, wet, ... }: t audio instant (default now), pan -1..1 or [from, to].
// Many textures (thunder tearing, rubble, sparks, leaves, rattling) are ONE chain noise → gain → filter
// whose gain follows a precomputed curve with random peaks (setValueCurveAtTime): it sounds granular and costs few nodes.

{
  const rnd = (a, b) => a + Math.random() * (b - a);
  const lim = (v, a = -1, b = 1) => Math.max(a, Math.min(b, v));
  const panAt = o => (Array.isArray(o.pan) ? o.pan[0] : o.pan) || 0;

  // automation curve (replaces whatever was scheduled before on that parameter)
  const setCurve = (param, c, t, dur) => { param.cancelScheduledValues(0); param.setValueCurveAtTime(c, t, dur); };
  // n points of fn(u, i) with u 0..1
  const fnCurve = (n, fn) => { const c = new Float32Array(Math.max(2, n)); for (let i = 0; i < c.length; i++) c[i] = fn(i / (c.length - 1), i); return c; };
  // values 0..1 that wander slowly (swirls, thunder rolling, tremor)
  function wander(n, smooth = 0.9, jump = 0.08) {
    const a = new Float32Array(n);
    let v = Math.random(), target = Math.random();
    for (let i = 0; i < n; i++) { if (Math.random() < jump) target = Math.random(); v += (target - v) * (1 - smooth); a[i] = v; }
    return a;
  }
  // hits [[instant s, amplitude, fall s, attack s?]] → gain curve (rises and falls exponentially), resolution res s
  function hitsCurve(dur, hits, res = 0.002) {
    const n = Math.max(2, Math.ceil(dur / res) + 1), c = new Float32Array(n);
    for (const [ht, a, dec, att = 0] of hits) {
      const i0 = Math.max(0, Math.round(ht / res)), ia = Math.round(att / res), len = Math.min(n - i0, ia + Math.ceil(dec * 6 / res));
      for (let j = 0; j < len; j++) c[i0 + j] += a * (j < ia ? j / ia : Math.exp(-(j - ia) * res / dec));
    }
    c[n - 1] = 0;
    return c;
  }
  // random hits: rate(u) hits/s, amp(u) maximum amplitude, fall between d0 and d1 s, attack ~att s (u = 0..1 across dur)
  function scatter(dur, rate, amp, d0, d1, att = 0) {
    const hits = [];
    for (let ht = -Math.log(1 - Math.random() * 0.999) / Math.max(0.3, rate(0)); ht < dur;) {
      const u = ht / dur;
      hits.push([ht, amp(u) * (0.15 + 0.85 * Math.random() ** 2), rnd(d0, d1), att * rnd(0.5, 1.5)]);
      ht += -Math.log(1 - Math.random() * 0.999) / Math.max(0.3, rate(u));
    }
    return hits;
  }
  const shaper = (E, k) => { const s = E.ac.createWaveShaper(); s.curve = E.h.distCurve(k); s.oversample = '2x'; return s; };
  const panner = (E, c, t, dur) => { const p = E.ac.createStereoPanner(); setCurve(p.pan, c, t, dur); return p; };

  // thunder: a crack that tears + rumble in several waves that rolls across the stereo.
  // o.distance 0 (overhead: dry, bright crack) .. 1 (far: no crack, dull, slow and longer).
  // Without o.distance it is inferred from o.vel (a soft thunder sounds far). o.pan [from, to] marks where it rolls toward; o.dur lengthens the rumble.
  registerSfx('thunder', (E, o) => {
    const { T, osc, noise, filt, gain, perc, out } = E.h;
    const t = T(o), p = o.vel ?? 1, d = lim(o.distance ?? 0.95 - 0.9 * p + rnd(-0.1, 0.15), 0, 1), near = 1 - d, lvl = 1.2 * Math.pow(p, 0.4) * (1 - 0.2 * d);
    const arr = Array.isArray(o.pan), p0 = arr ? o.pan[0] : o.pan || rnd(-0.45, 0.45);
    const dir = arr ? Math.sign(o.pan[1] - o.pan[0]) || 1 : p0 > 0.15 ? -1 : p0 < -0.15 ? 1 : Math.random() < 0.5 ? -1 : 1;
    const p1 = arr ? o.pan[1] : lim(p0 + dir * rnd(0.8, 1.2), -0.9, 0.9);
    const L = o.dur ?? 3.4 + 2.6 * d + rnd(0, 0.8);
    if (near > 0.3) {
      const c = Math.pow((near - 0.3) / 0.7, 1.2) * lvl, po = { ...o, pan: p0 };
      // crack: bright dry noise + medium saturated burst (weight at 20 m)
      const n = noise(t, t + 0.3), hp = filt('highpass', 700), lp = filt('lowpass', 7000), g = perc(t, 0.7 * c, 0.09, 0.001);
      out(n.connect(hp).connect(lp).connect(g), po, E.sfx, 0.25, t, 0.2);
      const mb = filt('bandpass', rnd(1000, 2500), 1), mg = perc(t, 1.4 * c, 0.025, 0.0008), msl = filt('lowpass', 5000, 0.5);
      out(n.connect(mb).connect(mg).connect(shaper(E, 3)).connect(msl).connect(gain(0.5)), po, E.sfx, 0.2, t, 0.1);
      // tear: burst of cracks spaced out more and more
      const tear = [];
      for (let tt = 0.003, a = 1; tt < 0.4 + 0.35 * near; tt += rnd(0.005, 0.028) * (1 + tt * 5), a *= 0.94) tear.push([tt, a * rnd(0.3, 1), rnd(0.004, 0.02)]);
      const tn = noise(t, t + 1), tg = gain(0), tb = filt('bandpass', rnd(1300, 2300), 0.55);
      setCurve(tg.gain, hitsCurve(1, tear, 0.001).map(x => Math.min(x, 1)), t, 1);
      out(tn.connect(tg).connect(tb).connect(filt('lowpass', 6500, 0.5)).connect(filt('lowpass', 7500, 0.5)).connect(gain(0.6 * c)), po, E.sfx, 0.3, t, 1);
      // low bolt thump, saturated so it has harmonics on small speakers
      const s = osc('sine', rnd(85, 105), t, t + 1.4), sd = perc(t, 1.6, 1, 0.004), sh = shaper(E, 4), slp = filt('lowpass', 800);
      s.frequency.exponentialRampToValueAtTime(42, t + 0.6);
      out(s.connect(sd).connect(sh).connect(slp).connect(gain(0.28 * c)), po, E.sfx, 0.3, t, 0.8);
    }
    // rumble: successive waves, each one farther across the stereo; each wave opens with a dull boom,
    // rolls irregularly and sheds low lumps
    const ns = 3 + Math.round(rnd(0, 1.2) + 2 * d), on = 0.05 + 0.42 * d * d, res = 0.01;
    for (let i = 0; i < ns; i++) {
      const st = t + on + (i ? (i / ns) * L * 0.55 * rnd(0.8, 1.2) : 0), Ls = Math.max(1.4, L - (st - t) * 0.7), N = Math.ceil(Ls / res) + 1;
      const amp = 1.3 * lvl * (near * Math.pow(0.72, i) + d * (0.5 + 0.5 * Math.sin(Math.PI * (i + 0.5) / ns))) * rnd(0.75, 1.1);
      const att = i ? rnd(0.08, 0.3) : 0.06 + 0.56 * d, tau = Ls * rnd(0.2, 0.28), w = wander(N, 0.82, 0.12);
      // slow rolling: 2-4 audible waves per segment (normalized so the level isn't lost)
      const ws = wander(N, 0.97, 0.03), wm = ws.reduce((m, x) => Math.max(m, x), 0.01), roll = k => 0.1 + 0.9 * Math.pow(ws[k] / wm, 2);
      const envAt = x => (x < att ? Math.pow(x / att, 1.5) : Math.exp(-(x - att) / tau)) * Math.min(1, (Ls - x) / (Ls * 0.15));
      const fc = (170 + 1100 * near * near) * Math.pow(0.8, i) * rnd(0.85, 1.15);
      const n = noise(st, st + Ls, true), sum = gain(1);
      const l1 = filt('lowpass', fc, 0.8), l2 = filt('lowpass', fc * 1.6, 0.6), bg = gain(0);
      setCurve(bg.gain, fnCurve(N, (u, k) => 0.8 * amp * envAt(u * Ls) * (0.35 + 0.65 * Math.pow(w[k], 1.5)) * roll(k)), st, Ls);
      n.connect(l1).connect(l2).connect(bg).connect(sum);
      // boom of the wave (low-mids: what you hear on small speakers) and the odd loose echo
      // from afar the boom is the main gesture: louder, at 250-500 Hz and with a soft attack
      const far = d > 0.5, claps = [[att * 0.6, 1, rnd(0.12, 0.25) * (far ? 1.4 : 1), far ? rnd(0.04, 0.08) : 0.015 + 0.05 * d]];
      for (let j = Math.round(rnd(0, 2)); j > 0; j--) claps.push([rnd(0.3, 0.6) * Ls, rnd(0.3, 0.7), rnd(0.1, 0.2), rnd(0.02, 0.06)]);
      const cg = gain(0), cb = filt('bandpass', far ? rnd(250, 500) : rnd(300, 600) * (0.6 + 0.6 * near), 0.9);
      setCurve(cg.gain, hitsCurve(Ls, claps.map(([ht, a, dec, at]) => [ht, a * amp * (far ? 2.1 : 1.6), dec, at]), res), st, Ls);
      n.connect(cg).connect(cb).connect(sum);
      // lumps: loose low hits that make the thunder "roll"
      const gg = gain(0), gb = filt('bandpass', rnd(140, 320) * (0.8 + 0.5 * near), 1.3);
      setCurve(gg.gain, hitsCurve(Ls, scatter(Ls, u => 14 - 9 * u, u => amp * 1.6 * envAt(u * Ls), 0.02, 0.08, 0.008), 0.004), st, Ls);
      n.connect(gg).connect(gb).connect(sum);
      // from afar it arrives dull: the air eats the highs
      // no sub-bass (mud outdoors) and with the low-mids boosted
      const top = filt('lowpass', 1200 + 5000 * near * near, 0.6), hp = filt('highpass', 60, 0.6), lm = filt('peaking', 280, 0.9), a = p0 + (p1 - p0) * (i / ns), b = p0 + (p1 - p0) * Math.min(1, (i + 1.5) / ns);
      lm.gain.value = 4;
      out(sum.connect(hp).connect(lm).connect(top), { ...o, pan: [lim(a), lim(b)] }, E.sfx, 0.4 + 0.25 * d, st, Ls);
    }
  });

  // earthquake: low rumble that grows, ground that creaks and grinds (low-mids) and rattling of things that vibrate. o.dur
  registerSfx('rumble', (E, o) => {
    const { T, osc, noise, filt, gain, out } = E.h;
    const t = T(o), dur = Math.max(1, o.dur ?? 6), v = o.vel ?? 1, end = t + dur, c = panAt(o), res = 0.01, n = Math.ceil(dur / res) + 1;
    // grows until almost the end (leads into the prep hit) and falls short
    const pk = 1 - Math.min(0.18 * dur, rnd(0.25, 0.45)) / dur;
    const shape = u => u < pk ? Math.pow(u / pk, 1.5) : Math.pow(Math.max(0, 1 - (u - pk) / (1 - pk)), 1.4);
    const w1 = wander(n, 0.8, 0.15), w2 = wander(n, 0.9, 0.12);
    // low background with irregular jolts
    const bn = noise(t, end, true), bh = filt('highpass', 45, 0.6), b1 = filt('lowpass', 180, 0.9), b2 = filt('lowpass', 360), bg = gain(0);
    setCurve(bg.gain, fnCurve(n, (u, i) => 0.4 * v * shape(u) * (0.35 + 0.65 * w1[i])), t, dur);
    out(bn.connect(bh).connect(b1).connect(b2).connect(bg), o, E.sfx, 0.25, t, dur);
    // the ground grinds: noise through a drifting low band-pass, saturated (harmonics 200-800 Hz)
    const gn = noise(t, end, true), gb = filt('bandpass', 140, 3), drv = gain(0), glp = filt('lowpass', 900), gg = gain(0.24 * v);
    setCurve(gb.frequency, fnCurve(Math.ceil(n / 2), (u, i) => 90 + 130 * w2[i * 2]), t, dur);
    setCurve(drv.gain, fnCurve(n, (u, i) => 5 * shape(u) * (0.3 + 0.7 * w2[i])), t, dur);
    out(gn.connect(gb).connect(drv).connect(shaper(E, 4)).connect(glp).connect(gg), o, E.sfx, 0.2, t, dur);
    // very faint tonal growl: two saws (an octave above the sub-bass) that beat and drift in pitch
    const f0 = rnd(72, 84), zs = gain(1);
    for (const m of [1, 1.06]) {
      const s = osc('sawtooth', f0 * m, t, end), w = wander(Math.ceil(n / 4), 0.85, 0.15);
      setCurve(s.frequency, w.map(x => f0 * m * (0.85 + 0.3 * x)), t, dur);
      s.connect(zs);
    }
    const zl = filt('lowpass', 420, 1), zg = gain(0);
    setCurve(zg.gain, fnCurve(n, (u, i) => 0.1 * v * shape(u) * w1[n - 1 - i]), t, dur);
    out(zs.connect(zl).connect(zg), o, E.sfx, 0.2, t, dur);
    // rattling: crystal, plates and wood (three streams spread across the stereo), only with the strong jolt
    for (const [f, q, side, a] of [[rnd(2000, 3000), 5, -1, 0.75], [rnd(3000, 4200), 6, 1, 0.55], [rnd(380, 600), 4, 0, 1.1]]) {
      const rn = noise(t, end), rg = gain(0), rb = filt('bandpass', f, q);
      setCurve(rg.gain, hitsCurve(dur, scatter(dur, u => 1 + 45 * shape(u) ** 2, u => a * v * shape(u) ** 1.5, 0.003, 0.014), 0.002), t, dur);
      out(rn.connect(rg).connect(rb), { ...o, pan: lim(c + side * 0.6) }, E.sfx, 0.2, t, dur);
    }
  });

  // cinematic hit: crack + mid punch and crunch (what small speakers reproduce) + falling low + air.
  // o.pitch (multiplies the pitch), o.dur (tail)
  registerSfx('boom', (E, o) => {
    const { T, osc, noise, filt, gain, perc, out } = E.h;
    const t = T(o), v = o.vel ?? 1, k = (o.pitch ?? 1) * rnd(0.9, 1.1), dec = (o.dur ?? 2) * rnd(0.85, 1.15), sum = gain(0.7);
    // impact crack
    const cn = noise(t, t + 0.4), cb = filt('bandpass', rnd(1800, 2800), 0.8), cg = perc(t, 0.4 * v, 0.035, 0.0005);
    cn.connect(cb).connect(cg).connect(sum);
    // mid crunch of the explosion
    const mb = filt('bandpass', rnd(420, 620) * k, 0.9), mg = perc(t, 0.7 * v, 0.35, 0.002);
    cn.connect(mb).connect(mg).connect(sum);
    // mid punch: falling triangle, saturated
    const pu = osc('triangle', 260 * k, t, t + 0.6), pd = perc(t, 1.6, 0.35, 0.001), plp = filt('lowpass', 2000), pg = gain(0.42 * v);
    pu.frequency.exponentialRampToValueAtTime(75 * k, t + 0.12);
    pu.connect(pd).connect(shaper(E, 5)).connect(plp).connect(pg).connect(sum);
    // falling low, with its octave so it can be sensed without sub-bass
    const s1 = osc('sine', 95 * k, t, t + dec * 0.6 + 0.2), s2 = osc('sine', 190 * k, t, t + dec), s1d = perc(t, 2, dec * 0.6, 0.002), sd = perc(t, 0.9, dec, 0.002), sm = gain(1), sg = gain(0.42 * v);
    s1.frequency.exponentialRampToValueAtTime(50 * k, t + dec * 0.5);
    s2.frequency.exponentialRampToValueAtTime(100 * k, t + dec * 0.6);
    s1.connect(s1d).connect(sm); s2.connect(sd).connect(sm);
    sm.connect(shaper(E, 3.5)).connect(sg).connect(sum);
    // air of the shockwave
    const an = noise(t, t + dec + 0.2, true), alp = filt('lowpass', 2000, 0.9), ag = perc(t, 0.75 * v, dec * 0.8, 0.006);
    alp.frequency.setValueAtTime(2400 * k, t); alp.frequency.exponentialRampToValueAtTime(250, t + dec * 0.7);
    an.connect(alp).connect(ag).connect(sum);
    out(sum, o, E.sfx, 0.5, t, dec);
  });

  // tension riser: noise that opens + saws that rise two octaves with a tremolo that speeds up; cuts dry at the end. o.dur, o.pitch
  registerSfx('riser', (E, o) => {
    const { T, osc, noise, filt, gain, out } = E.h;
    const t = T(o), dur = Math.max(0.5, o.dur ?? 3), v = o.vel ?? 1, end = t + dur, k = (o.pitch ?? 1) * rnd(0.96, 1.04), c = panAt(o);
    const res = 0.005, tot = dur + 0.03, n = Math.ceil(tot / res) + 1;
    const rise = (pw, a) => fnCurve(n, u => (u * tot <= dur ? a * Math.pow(u * tot / dur, pw) : 0));
    // noise: two bands (left and right) that rise
    for (const side of [-1, 1]) {
      const nn = noise(t, end), bp = filt('bandpass', 300, 1.2), lp = filt('lowpass', 8000, 0.5), g = gain(0);
      bp.frequency.setValueAtTime(rnd(250, 350), t); bp.frequency.exponentialRampToValueAtTime(rnd(5000, 6500), end);
      bp.Q.setValueAtTime(1, t); bp.Q.linearRampToValueAtTime(3, end);
      setCurve(g.gain, rise(1.3, 0.36 * v), t, tot);
      out(nn.connect(bp).connect(lp).connect(g), { ...o, pan: lim(c + side * 0.45) }, E.sfx, 0.1, t, dur);
    }
    // tone: saws (root, fifth, octave) that rise, resonant filter that opens and tremolo that speeds up
    // (starts in the mids: 130 Hz and filter at 600 Hz, so it's audible from the start on mid-size speakers)
    const tl = filt('lowpass', 600, 2.5), trem = gain(0.6), lfo = osc('sine', 3, t, end), tg = gain(0);
    tl.frequency.setValueAtTime(600, t); tl.frequency.exponentialRampToValueAtTime(5500, end);
    lfo.frequency.exponentialRampToValueAtTime(18, end);
    lfo.connect(gain(0.4)).connect(trem.gain);
    for (const [m, dt] of [[1, -8], [1, 8], [1.5, 0], [2, 4]]) {
      const s = osc('sawtooth', 130 * k * m, t, end);
      s.detune.value = dt; s.frequency.exponentialRampToValueAtTime(130 * k * m * 4, end);
      s.connect(tl);
    }
    setCurve(tg.gain, rise(1.1, 0.14 * v), t, tot);
    out(tl.connect(trem).connect(tg), o, E.sfx, 0.08, t, dur);
  });

  // fast air pass. If o.pan moves ([from, to]) it is something flying by: it sounds louder and brighter
  // when passing in front, the panning speeds up in the center and there is a Doppler effect (high on approach, low on recede).
  // o.dur, o.pitch, o.tone (whistle also without movement)
  registerSfx('whoosh', (E, o) => {
    const { T, noise, filt, gain, out } = E.h;
    const t = T(o), dur = Math.max(0.2, o.dur ?? 1) * rnd(0.9, 1.1), v = o.vel ?? 1, k = (o.pitch ?? 1) * rnd(0.85, 1.15);
    const fly = Array.isArray(o.pan) && o.pan[0] !== o.pan[1], X = 2.5, mach = fly ? 0.16 : 0.06, res = 0.005, n = Math.ceil(dur / res) + 1;
    const xs = u => (u * 2 - 1) * X, r = u => Math.hypot(xs(u), 1), dop = u => 1 / (1 + mach * xs(u) / r(u)), br = u => 0.3 + 1.3 / r(u);
    const amp = u => Math.pow(Math.sin(Math.PI * u), 0.6) / Math.pow(r(u), 1.4);
    const pink = noise(t, t + dur, true), white = noise(t, t + dur), sum = gain(1.3);
    for (const [src, f, q, a, pw] of [[pink, 520, 1.3, 1.6, 1], [white, 1900, 2.2, 0.55, 1.4], ...(fly || o.tone ? [[white, 950, 24, 2.6, 1.6], [white, 2140, 30, 1.3, 1.6]] : [])]) {
      const bp = filt('bandpass', f, q), g = gain(0);
      setCurve(bp.frequency, fnCurve(n, u => f * k * (q > 10 ? 1 : br(u)) * dop(u)), t, dur);
      setCurve(g.gain, fnCurve(n, u => a * v * Math.pow(amp(u), pw)), t, dur);
      src.connect(bp).connect(g).connect(sum);
    }
    let node = sum.connect(filt('lowpass', 8000, 0.5)).connect(filt('highpass', 180));
    if (fly) {
      const [a, b] = o.pan, ex = X / Math.hypot(X, 1);
      node = node.connect(panner(E, fnCurve(n, u => lim(a + (b - a) * (0.5 + 0.5 * (xs(u) / r(u)) / ex))), t, dur));
    }
    out(node, fly ? { ...o, pan: 0 } : o, E.sfx, 0.3, t, dur);
  });

  // collapse: initial hit, bricks falling (dull thud + ceramic click), rubble rolling and dust. o.dur
  registerSfx('crash', (E, o) => {
    const { T, osc, noise, filt, gain, perc, env, out } = E.h;
    const t = T(o), v = o.vel ?? 1, c = panAt(o), len = (o.dur ?? 2.6) * rnd(0.85, 1.15);
    E.sfxs.boom({ t, vel: 0.65 * v, pan: c, wet: 0.35, pitch: 0.8, dur: 1.4 });
    // bricks
    const nb = Math.round(rnd(8, 11));
    for (let i = 0; i < nb; i++) {
      const tt = t + 0.03 + Math.pow(Math.random(), 1.6) * len * 0.7, a = v * rnd(0.4, 1) * (1 - ((tt - t) / len) * 0.6), f0 = rnd(130, 230), sum = gain(1);
      // dull thud: a bit of falling sine + low noise (masonry, not a drum) + ceramic click
      const s = osc('sine', f0, tt, tt + 0.25), sg = perc(tt, 0.4 * a, rnd(0.05, 0.09), 0.001);
      s.frequency.exponentialRampToValueAtTime(f0 * 0.55, tt + 0.06);
      const cn = noise(tt, tt + 0.15), cb = filt('bandpass', rnd(900, 2800), rnd(3, 6)), cg = perc(tt, 1.8 * a, rnd(0.025, 0.06), 0.0008);
      const tb = filt('bandpass', rnd(350, 900), 1.5), tg = perc(tt, 2.2 * a, rnd(0.04, 0.09), 0.0015);
      s.connect(sg).connect(sum); cn.connect(cb).connect(cg).connect(sum); cn.connect(tb).connect(tg).connect(sum);
      out(sum, { ...o, pan: lim(c + rnd(-0.6, 0.6)) }, E.sfx, 0.3, tt, 0.2);
    }
    // rubble: stones rolling (low, mid and high), more and more sparse
    for (const [f, q, side, a, rate, d0, d1, att, pink] of [[300, 1, 0, 1.8, 16, 0.025, 0.06, 0.006, true], [1200, 1.6, -1, 2.1, 55, 0.004, 0.012, 0], [2800, 2, 1, 1.4, 60, 0.002, 0.006, 0]]) {
      const rn = noise(t, t + len, pink), rg = gain(0), rb = filt('bandpass', f * rnd(0.85, 1.15), q);
      setCurve(rg.gain, hitsCurve(len, scatter(len, u => rate * Math.exp(-u * 2.5), u => a * v * Math.exp(-u * 1.8), d0, d1, att), 0.001), t, len);
      out(rn.connect(rg).connect(rb), { ...o, pan: lim(c + side * 0.5) }, E.sfx, 0.3, t, len);
    }
    // dust: wide hiss that rises and settles
    for (const side of [-1, 1]) {
      const t0 = t + 0.1, dn = noise(t0, t0 + len + 1), hp = filt('highpass', 1500), lp = filt('lowpass', 6500), dg = env(t0, 0.35, 0.09 * v, 0.2, len * 0.8);
      out(dn.connect(hp).connect(lp).connect(dg), { ...o, pan: lim(c + side * 0.7) }, E.sfx, 0.3, t0, len);
    }
  });

  // ignition: "fff" that sucks in and a low "WHOOMF" (resonant filter that opens and closes), roaring flame and sparks
  registerSfx('fireUp', (E, o) => {
    const { T, osc, noise, filt, gain, perc, out } = E.h;
    const t = T(o), v = o.vel ?? 1, k = rnd(0.85, 1.15), pre = 0.16 * rnd(0.8, 1.3), ti = t + pre, tail = 1.8 * rnd(0.85, 1.2), end = ti + tail, sum = gain(0.75);
    // preceding inhale
    const an = noise(t, ti + 0.05, true), abp = filt('bandpass', 600, 1), ag = gain(0);
    abp.frequency.setValueAtTime(500, t); abp.frequency.exponentialRampToValueAtTime(2500, ti);
    ag.gain.setValueAtTime(0, t); ag.gain.linearRampToValueAtTime(0.3 * v, ti); ag.gain.linearRampToValueAtTime(0, ti + 0.04);
    an.connect(abp).connect(ag).connect(sum);
    // whoomf: noise through a resonant low-pass that opens suddenly and closes slowly
    const wn = noise(ti, end, true), wl = filt('lowpass', 90, 12), wg = gain(0);
    wl.frequency.setValueAtTime(100 * k, ti); wl.frequency.exponentialRampToValueAtTime(1400 * k, ti + 0.22); wl.frequency.exponentialRampToValueAtTime(380 * k, ti + 0.9); wl.frequency.exponentialRampToValueAtTime(250, end);
    wg.gain.setValueAtTime(0, ti); wg.gain.linearRampToValueAtTime(1.1 * v, ti + 0.05); wg.gain.setTargetAtTime(0, ti + 0.2, tail / 4);
    wn.connect(wl).connect(wg).connect(sum);
    // body: sine that rises and falls, saturated
    const s = osc('sine', 55 * k, ti, ti + 0.9), sd = perc(ti, 1.4, 0.6, 0.03);
    s.frequency.exponentialRampToValueAtTime(115 * k, ti + 0.1); s.frequency.exponentialRampToValueAtTime(60 * k, ti + 0.5);
    s.connect(sd).connect(shaper(E, 3)).connect(gain(0.4 * v)).connect(sum);
    // flame: wide mid band that flickers
    const fn = noise(ti, end), fb = filt('bandpass', 1000 * k, 0.5), fg = gain(0), N = Math.ceil(tail / 0.01) + 1, w = wander(N, 0.65, 0.3);
    setCurve(fg.gain, fnCurve(N, (u, i) => 0.45 * v * Math.min(1, u * 8) * Math.exp(-u * 2.2) * (0.3 + 0.7 * w[i]) * (1 - u)), ti, tail);
    fn.connect(fb).connect(fg).connect(sum);
    // sparks (they start once it has already caught)
    const cn = noise(ti, end), cg = gain(0), chp = filt('highpass', 1800), clp = filt('lowpass', 7000);
    setCurve(cg.gain, hitsCurve(tail, scatter(tail, u => 30 * (1 - u), u => (u < 0.06 ? 0 : 0.7 * v * (1 - u)), 0.003, 0.012), 0.001).map(x => Math.min(x, 0.6 * v)), ti, tail);
    cn.connect(cg).connect(chp).connect(clp).connect(sum);
    out(sum, o, E.sfx, 0.4, t, pre + tail);
  });

  // howling wind gust: noise body that rises in pitch with the force, narrow whistles (gaps) and leaves.
  // o.dur, o.pitch, o.pan [from, to] (by default crosses from one side to the other)
  registerSfx('windGust', (E, o) => {
    const { T, noise, filt, gain, out } = E.h;
    const t = T(o), dur = Math.max(1, o.dur ?? 3.2) * rnd(0.85, 1.2), v = o.vel ?? 1, k = (o.pitch ?? 1) * rnd(0.85, 1.15), end = t + dur;
    const res = 0.01, n = Math.ceil(dur / res) + 1, w = wander(n, 0.9, 0.1), sk = rnd(0.6, 1);
    const force = fnCurve(n, (u, i) => Math.pow(Math.sin(Math.PI * Math.pow(u, sk)), 1.5) * (0.7 + 0.3 * w[i]));
    const at = u => force[Math.min(n - 1, Math.round(u * (n - 1)))];
    const pink = noise(t, end, true), white = noise(t, end), sum = gain(0.75);
    // body
    const bh = filt('highpass', 150, 0.7), bp = filt('bandpass', 400, 0.7), bg = gain(0);
    setCurve(bp.frequency, force.map(f => (250 + 650 * f) * k), t, dur);
    setCurve(bg.gain, force.map(f => 0.8 * v * f), t, dur);
    pink.connect(bh).connect(bp).connect(bg).connect(sum);
    // howl: narrow resonances that rise with the gust
    // (each one wanders on its own and they take turns in the lead: no parallel chord)
    for (const [f, a] of [[rnd(440, 540), 1], [rnd(690, 800), 0.75], [rnd(1050, 1250), 0.5]]) {
      const hb = filt('bandpass', f, 30), hg = gain(0), wi = wander(n, 0.95, 0.04), wg = wander(n, 0.93, 0.05);
      setCurve(hb.frequency, force.map((x, i) => f * k * (0.65 + 0.7 * x) * (0.92 + 0.16 * wi[i])), t, dur);
      setCurve(hg.gain, force.map((x, i) => 11 * a * v * x * x * (0.4 + 0.9 * wg[i])), t, dur);
      white.connect(hb).connect(hg).connect(sum);
    }
    // leaves and branches: high granular whisper when it blows hard
    const lg = gain(0), lb = filt('bandpass', 4000, 0.8), ll = filt('lowpass', 8000, 0.5);
    setCurve(lg.gain, hitsCurve(dur, scatter(dur, u => 5 + 120 * at(u) ** 2, u => 0.3 * v * at(u), 0.003, 0.01), 0.002), t, dur);
    white.connect(lg).connect(lb).connect(ll).connect(sum);
    const p0 = Array.isArray(o.pan) ? o.pan[0] : o.pan || rnd(-0.8, 0.8), p1 = Array.isArray(o.pan) ? o.pan[1] : lim(-p0 * rnd(0.5, 1) + rnd(-0.2, 0.2));
    out(sum, { ...o, pan: [p0, p1] }, E.sfx, 0.4, t, dur);
  });

  // electric crackle before the bolt: dry sparks more and more frequent, a flickering buzz, hiss and a final snap.
  // o.dur, o.snap (false: no final snap)
  registerSfx('staticCrackle', (E, o) => {
    const { T, osc, noise, filt, gain, perc, out } = E.h;
    const t = T(o), dur = Math.max(0.3, o.dur ?? 1.4), v = o.vel ?? 1, end = t + dur, c = panAt(o);
    // sparks: two streams (left and right) with clusters of clicks
    for (const side of [-1, 1]) {
      const hits = [];
      for (let ht = rnd(0, 0.05); ht < dur;) {
        const u = ht / dur, a = v * (0.35 + 0.65 * u) * (0.2 + 0.8 * Math.random() ** 2);
        const m = Math.random() < 0.25 ? Math.round(rnd(2, 6)) : 1;
        for (let j = 0; j < m; j++) hits.push([ht + j * rnd(0.002, 0.006), a * (j ? rnd(0.4, 0.9) : 1), rnd(0.0012, 0.005)]);
        ht += -Math.log(1 - Math.random() * 0.999) / (8 + 80 * u * u);
      }
      const sn = noise(t, end), sg = gain(0), shp = filt('highpass', 900), sb = filt('peaking', rnd(2000, 3500), 1), slp = filt('lowpass', 7000, 0.6), slp2 = filt('lowpass', 6500, 0.6);
      sb.gain.value = 8;
      setCurve(sg.gain, hitsCurve(dur, hits, 0.0005).map(x => Math.min(x, v)), t, dur);
      out(sn.connect(sg).connect(shp).connect(sb).connect(slp).connect(slp2).connect(gain(0.75)), { ...o, pan: lim(c + side * rnd(0.3, 0.7)) }, E.sfx, 0.2, t, dur);
    }
    // buzz: saws at ~120 Hz, saturated, that switch on now and then (more and more)
    const f = rnd(110, 125), zs = gain(1), N = Math.ceil(dur / 0.005) + 1;
    for (const m of [1, 2.01]) osc('sawtooth', f * m, t, end).connect(zs);
    let on = 0;
    const flick = fnCurve(N, u => { if (Math.random() < 0.08) on = Math.random() < 0.1 + 0.7 * u * u ? 1 : 0; return on * (0.2 + 0.8 * u); });
    const zb = filt('bandpass', 1400, 1.5), zg = gain(0), zhp = filt('highpass', 250), zlp = filt('lowpass', 6000);
    setCurve(zg.gain, flick, t, dur);
    out(zs.connect(zb).connect(shaper(E, 8)).connect(zhp).connect(zlp).connect(zg).connect(gain(0.12 * v)), o, E.sfx, 0.12, t, dur);
    // rough hiss
    const hn = noise(t, end), hb = filt('bandpass', 4000, 1), hl = filt('lowpass', 7000), hg = gain(0), w = wander(N, 0.5, 0.4);
    setCurve(hg.gain, fnCurve(N, (u, i) => 0.08 * v * Math.pow(u, 1.5) * w[i]), t, dur);
    out(hn.connect(hb).connect(hl).connect(hg), o, E.sfx, 0.12, t, dur);
    // final snap with body: click + burst at 1.5 kHz + tone falling 500 → 90 Hz, all saturated
    if (o.snap !== false) {
      const te = end - 0.04, ks = gain(1), kn = noise(te, te + 0.2), khp = filt('highpass', 700), kl = filt('lowpass', 6500), kg = perc(te, 0.6 * v, 0.06, 0.0005);
      kn.connect(khp).connect(kl).connect(kg).connect(ks);
      kn.connect(filt('bandpass', 1500, 1.2)).connect(perc(te, 1.4 * v, 0.05, 0.0008)).connect(ks);
      const ko = osc('triangle', 500, te, te + 0.2);
      ko.frequency.exponentialRampToValueAtTime(90, te + 0.06);
      ko.connect(perc(te, 1.2 * v, 0.09, 0.001)).connect(ks);
      out(ks.connect(shaper(E, 3)).connect(filt('lowpass', 6000, 0.5)).connect(gain(0.55)), o, E.sfx, 0.15, te, 0.15);
    }
  });

  // reversed cymbal for transitions: inharmonic metallic partials + breath that grows exponentially,
  // opens in brightness and cuts dry on arrival. o.dur, o.pitch
  registerSfx('reverseSwell', (E, o) => {
    const { T, osc, noise, filt, gain, out } = E.h;
    const t = T(o), dur = Math.max(0.4, o.dur ?? 2), v = o.vel ?? 1, end = t + dur, k = (o.pitch ?? 1) * rnd(0.95, 1.08), c = panAt(o);
    const res = 0.005, tot = dur + 0.02, n = Math.ceil(tot / res) + 1;
    const swell = (a, pw) => fnCurve(n, u => { const x = u * tot / dur; return x <= 1 ? a * (Math.exp(pw * x) - 1) / (Math.exp(pw) - 1) : 0; });
    // metal: inharmonic squares (808 style) ring-modulated in pairs (denser), with slow pitch drift;
    // only the high partials (> 3 kHz) pass as brightness, no chord
    const ms = gain(1), mh = filt('highpass', 3000, 0.7), mh2 = filt('highpass', 3000, 0.7), mb = filt('bandpass', 4000, 0.9), ml = filt('lowpass', 7500, 0.5), ml2 = filt('lowpass', 8500, 0.5), mg = gain(0);
    const sq = [205.3, 304.4, 369.6, 522.7, 540, 800].map(f => {
      const s = osc('square', f * k, t, end);
      setCurve(s.detune, wander(Math.ceil(dur / 0.05) + 1, 0.9, 0.2).map(x => (x - 0.5) * 20), t, dur);
      s.connect(ms);
      return s;
    });
    for (let i = 0; i < 6; i += 2) { const rm = gain(0); sq[i].connect(rm); sq[i + 1].connect(rm.gain); rm.connect(ms); }
    mb.frequency.setValueAtTime(3200, t); mb.frequency.exponentialRampToValueAtTime(6000, end);
    setCurve(mg.gain, swell(0.5 * v, 5.5), t, tot);
    out(ms.connect(mh).connect(mh2).connect(mb).connect(ml).connect(ml2).connect(mg), o, E.sfx, 0.03, t, dur);
    // cymbal breath (two sources to open it in stereo)
    for (const side of [-1, 1]) {
      const nn = noise(t, end), nb = filt('bandpass', 3000, 0.8), nl = filt('lowpass', 8000, 0.5), ng = gain(0);
      nb.frequency.setValueAtTime(rnd(1500, 2000), t); nb.frequency.exponentialRampToValueAtTime(rnd(5000, 6000), end);
      setCurve(ng.gain, swell(0.36 * v, 5.5), t, tot);
      out(nn.connect(nb).connect(nl).connect(ng), { ...o, pan: lim(c + side * 0.5) }, E.sfx, 0.03, t, dur);
    }
    // body: reversed reverb tail (mid band)
    const bn = noise(t, end, true), bh = filt('highpass', 250, 0.7), bb = filt('bandpass', 900, 0.8), bg = gain(0);
    setCurve(bg.gain, swell(0.45 * v, 3), t, tot);
    out(bn.connect(bh).connect(bb).connect(bg), o, E.sfx, 0.03, t, dur);
  });

  // short trailer hit: kick with pitch drop + click + inharmonic metal plate + low "braam" that closes.
  // o.pitch, o.dur, o.metal (0..1), o.braam (0..1)
  registerSfx('impactHit', (E, o) => {
    const { T, osc, noise, filt, gain, perc, out } = E.h;
    const t = T(o), v = o.vel ?? 1, k = (o.pitch ?? 1) * rnd(0.94, 1.06), dec = (o.dur ?? 1.4) * rnd(0.9, 1.1), sum = gain(0.64);
    // kick
    const s = osc('sine', 150 * k, t, t + dec), sd = perc(t, 1.2, dec * 0.5, 0.001);
    s.frequency.exponentialRampToValueAtTime(46 * k, t + 0.1);
    s.connect(sd).connect(shaper(E, 2.5)).connect(gain(0.35 * v)).connect(sum);
    // click: high + mid
    const cn = noise(t, t + 0.3);
    cn.connect(filt('bandpass', 2200, 0.8)).connect(perc(t, 0.8 * v, 0.035, 0.0005)).connect(sum);
    cn.connect(filt('bandpass', 500, 1)).connect(perc(t, 0.8 * v, 0.12, 0.001)).connect(sum);
    // metal plate: inharmonic partials that fade at different rates
    const mt = (o.metal ?? 0.7) * v, f0 = 196 * k * rnd(0.97, 1.03);
    if (mt > 0) for (const [r, a, dd] of [[1, 0.8, 0.9], [1.51, 0.6, 0.8], [2.76, 1, 0.6], [4.07, 0.6, 0.45], [5.4, 0.7, 0.4], [8.93, 0.35, 0.25]]) osc('sine', f0 * r, t, t + dec * dd + 0.1).connect(perc(t, a * 0.32 * mt, dec * dd, 0.001)).connect(sum);
    // braam: low saws with a filter that closes
    const bm = (o.braam ?? 1) * v;
    if (bm > 0) {
      const bl = filt('lowpass', 2400, 2), bd = perc(t, 1.4, dec * 0.7, 0.004);
      bl.frequency.setValueAtTime(3000, t); bl.frequency.exponentialRampToValueAtTime(220, t + 0.7);
      for (const [m, dt] of [[1, -12], [1, 12], [1.5, 0], [2, 6]]) { const b = osc('sawtooth', 55 * k * m, t, t + dec); b.detune.value = dt; b.connect(bl); }
      bl.connect(bd).connect(shaper(E, 2)).connect(gain(0.5 * bm)).connect(sum);
    }
    out(sum, o, E.sfx, 0.55, t, dec);
  });
}
