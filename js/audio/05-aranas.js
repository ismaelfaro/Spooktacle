// Score: Spiders — tiptoe pizzicato that tightens, baby spiders falling over the music, the giant
// (footsteps, scurrying, roar and swarm are triggered by the scene in update) with strings that rise on each gust,
// climax on her rising and a return to calm with the mother's eyes. A minor, 0.3 s per eighth note.
registerScore('Spiders', {
  beds: { night: 0.4, crickets: 0.15 },
  gain: 0.9,
  // baby spiders: same timings as the scene (t0 fall, tf escape) and panning by the position of their zone in the house
  start(A, S) {
    const zs = S.screenZones || [];
    let X0 = Infinity, X1 = -Infinity;
    for (const z of zs) { X0 = Math.min(X0, z.x0); X1 = Math.max(X1, z.x1); }
    const rel = z => Math.max(0, Math.min(1, (z.cx - X0) / Math.max(1, X1 - X0)));
    // no mapping (lab): the default house
    const list = zs.length ? zs.map(z => [z.kind, rel(z)]) : [['wall', 0.1], ['wall', 0.34], ['wall', 0.8], ['window', 0.12], ['window', 0.34], ['window', 0.35], ['window', 0.78], ['roof', 0.4], ['door', 0.54]];
    const drops = [], pan = r => (r * 2 - 1) * 0.8;
    for (const [k, r] of list) {
      if (k === 'wall') for (let j = 0; j < 3; j++) drops.push({ t0: 5.3 + r * 2.6 + j * 0.55, tf: 10.35 + r * 0.35 + j * 0.12, pan: pan(r) + (j - 1) * 0.08 });
      else if (k === 'window') drops.push({ t0: 4.9 + r * 2.6, tf: 10.4 + r * 0.3, pan: pan(r) });
      else if (k === 'roof') drops.push({ t0: 6.6, tf: 10.55, pan: pan(r) });
      else if (k === 'door') A.state.door = pan(r);
    }
    drops.sort((a, b) => a.t0 - b.t0);
    A.state.drops = drops;
    A.state.roof = pan((list.find(([k]) => k === 'roof') || [0, 0.45])[1]);
  },
  tick(A, S) {
    const st = A.state, R = [45, 48, 50, 51, 52, 53, 56, 57];   // A minor with sixth and diminished fifth

    // ---------- 0–9.4 s: webs being woven ----------
    // tiptoe pizzicato: bar 1 bass only, then the line; from 4.8 a countermelody and it rises by semitones
    const LINE = [45, 0, 52, 0, 51, 0, 52, 48], HI = [0, 64, 0, 63, 0, 60, 0, 63];
    A.steps('pizz', 0.3, (i, t) => {
      const bar = Math.floor(i / 8), k = i % 8, up = bar >= 3 ? Math.floor((i - 24) / 2) : 0, cres = Math.min(1, i / 30);
      const m = LINE[k];
      if (m && (bar > 0 || k % 4 === 0)) A.pluck(t, m + up, { vel: 0.32 + 0.22 * cres, pan: k % 2 ? 0.15 : -0.15 });
      if (bar >= 2 && HI[k]) A.pluck(t, HI[k] + up, { vel: 0.18 + 0.1 * cres, decay: 0.25, pan: 0.35 });
    }, 0.2, 9.3);
    // low strings in tremolo that gradually tighten
    A.at(4.8, t => A.strings(t, [45, 51], 4.4, { vel: 0.22, trem: 9, attack: 2.5, release: 0.6, cutoff: 2400 }), 'tr1');
    A.at(7.2, t => A.strings(t, [57, 58], 2.2, { vel: 0.18, trem: 11, attack: 1.8, release: 0.4, cutoff: 3500 }), 'tr2');
    // dew: random celesta sparkles from when it appears
    A.steps('dew', 0.45, (i, t) => { if (Math.random() < 0.55) A.celesta(t, R[(i * 5) % 8] + 24, { vel: 0.14, pan: Math.random() * 1.6 - 0.8 }); }, 5.2, 7.3);
    // light sweep across the dew (7.4–9.8, left → right): music-box glissando that follows it
    A.steps('sweep1', 0.12, (i, t) => {
      const u = i / 20, x = 0.5 - 0.5 * Math.cos(Math.PI * u);
      A.musicBox(t, R[i % 8] + 24 + 12 * Math.floor(i / 8), { vel: 0.14 + 0.08 * Math.sin(Math.PI * u), pan: -0.8 + 1.6 * x });
    }, 7.4, 9.75);

    // baby spiders falling: thread hiss, jerk (pizzicato "boing") and a softer bounce
    (st.drops || []).forEach((d, n) => {
      const m = R[(7 - n % 8 + 8) % 8] + 12;
      A.at(d.t0, t => {
        A.whoosh({ t, dur: 0.5, vel: 0.12, pitch: 1.8, pan: d.pan });
        A.pluck(t + 0.5, m, { vel: 0.4, decay: 0.5, pan: d.pan });
        A.pluck(t + 0.8, m - 12, { vel: 0.16, decay: 0.4, pan: d.pan });
      }, 'd' + n);
      // escape upward (with anticipation): fast rising pizzicato
      A.at(d.tf + 0.3, t => [0, 3, 7].forEach((s, j) => A.pluck(t + j * 0.05, m + 12 + s, { vel: 0.22, decay: 0.15, pan: d.pan })), 'f' + n);
    });

    // ---------- 9.4–11.4 s: the moon, the tremor and the shadow ----------
    A.at(9.4, t => { A.timpani(t, 45, { vel: 0.55, decay: 2.5 }); A.strings(t, [45, 51, 56], 1.8, { vel: 0.4, trem: 13, attack: 0.05, release: 1.2, cutoff: 4000 }); }, 'moon');
    A.at(10.1, t => { A.drone(t, 33, 6, { vel: 0.55, cutoff: 380, attack: 1.2 }); A.strings(t, [57, 58], 1.3, { vel: 0.16, trem: 7, attack: 0.8, release: 0.5 }); }, 'shadow');
    // probing taps (10.68, 11.0): two double-bass notes
    A.at(10.68, t => A.pluck(t, 33 + 12, { vel: 0.5, decay: 0.5, pan: -0.7 }), 'tap1');
    A.at(11.0, t => A.pluck(t, 34 + 12, { vel: 0.5, decay: 0.5, pan: -0.7 }), 'tap2');

    // ---------- 11.4–16.1 s: the giant crosses in bursts ----------
    // each burst: timpani and tremolo half a tone higher; on the stops it cuts (tense silence)
    [[11.4, 1.35, 0], [13.15, 1.1, 1], [14.55, 1.0, 2], [15.55, 0.55, 3]].forEach(([t0, d, k]) => A.at(t0, t => {
      A.timpani(t, 45 + k, { vel: 0.5 + 0.1 * k, decay: 1.2 });
      A.strings(t, [45 + k, 51 + k, 57 + k], d, { vel: 0.3 + 0.08 * k, trem: 12 + 2 * k, attack: 0.15, release: 0.25, cutoff: 3000 + 600 * k });
      // pizzicato bass on the step
      for (let j = 0; j * 0.15 < d - 0.1; j++) A.pluck(t + j * 0.15, (j % 2 ? 40 : 33) + 12 + k, { vel: 0.3, decay: 0.2 });
    }, 'burst' + k));
    // turns and crouches: drumroll that grows until the roar
    A.at(15.6, t => A.timpani(t, 45, { vel: 0.75, roll: 0.75, decay: 0.6 }), 'roll');
    A.at(15.8, t => A.strings(t, [57, 58, 63], 0.6, { vel: 0.35, trem: 18, attack: 0.5, release: 0.1, cutoff: 6000 }), 'rise');

    // ---------- 16.45 s: rises and roars (climax) ----------
    A.at(16.45, t => {
      A.stab(t, [45, 51, 57], { vel: 0.6, dur: 0.5 });
      A.timpani(t, 40, { vel: 0.9, decay: 2.5 });
      A.strings(t + 0.15, [45, 51, 56, 60], 1.9, { vel: 0.55, trem: 14, attack: 0.25, release: 1.1, cutoff: 5000 });
    }, 'roar');
    // swarm (16.95): high pizzicato that spreads to both sides, faster at the start
    A.at(16.95, t => {
      for (let j = 0, tt = 0; j < 26; j++, tt += 0.05 + j * 0.004) {
        const side = j % 2 ? 1 : -1, u = j / 25;
        A.pluck(t + tt, R[(j * 3) % 8] + 24 + (j % 3) * 12 - Math.floor(u * 12), { vel: 0.3 * (1 - 0.6 * u), decay: 0.12, pan: side * (0.15 + 0.7 * u) });
      }
    }, 'swarm');

    // ---------- 18.55–21.3 s: climbs into her web and vanishes into the vent ----------
    // pizzicato scale that rises and speeds up with her (the scene speeds up with k^1.7)
    A.at(18.55, t => {
      for (let j = 0; j < 18; j++) {
        const u = j / 18, tt = 2.6 * Math.pow(u, 1 / 1.7);
        A.pluck(t + tt, R[j % 8] + 12 * Math.floor(j / 8) + 12, { vel: 0.34 * (1 - 0.5 * u), decay: 0.22, pan: st.roof ?? 0 });
      }
      A.strings(t, [57, 63], 2.6, { vel: 0.22, trem: 10, attack: 0.05, release: 1, cutoff: 3000 });
    }, 'climb');
    A.at(21.3, t => A.celesta(t, 81, { vel: 0.22, pan: st.roof ?? 0 }), 'gone');

    // ---------- 21.4–26 s: calm, dew and the mother's eyes ----------
    // return sweep (21.4–23.8, right → left) and the door spider descending (21.6)
    A.steps('sweep2', 0.16, (i, t) => {
      const u = i / 15, x = 0.5 - 0.5 * Math.cos(Math.PI * u);
      A.musicBox(t, R[(15 - i) % 8] + 24, { vel: 0.12 + 0.06 * Math.sin(Math.PI * u), pan: 0.8 - 1.6 * x });
    }, 21.4, 23.8);
    A.at(21.6, t => {
      const p = st.door ?? 0.1;
      A.whoosh({ t, dur: 0.5, vel: 0.12, pitch: 1.8, pan: p });
      A.pluck(t + 0.5, 57, { vel: 0.4, decay: 0.5, pan: p });
      A.pluck(t + 0.8, 45, { vel: 0.18, decay: 0.4, pan: p });
    }, 'door');
    // tiptoe pizzicato returns, very soft
    A.steps('pizz2', 0.3, (i, t) => { const m = LINE[i % 8]; if (m) A.pluck(t, m, { vel: 0.22 - 0.012 * i, pan: i % 2 ? 0.15 : -0.15 }); }, 22.2, 23.8);
    // eyes (23.9): open in pairs, blink (24.72) and everything fades out before the end
    A.at(23.9, t => {
      A.strings(t, [45, 51, 56], 0.7, { vel: 0.25, attack: 0.3, release: 0.35, cutoff: 2500 });
      [0, 0.12, 0.24, 0.36].forEach((d, j) => A.celesta(t + d, 88 - j * 3, { vel: 0.16, pan: (st.roof ?? 0) + (j % 2 ? 0.1 : -0.1) }));
      A.bed('night', 0.15, 0.6); A.bed('crickets', 0.05, 0.6);
    }, 'eyes');
    A.at(24.72, t => { A.celesta(t, 76, { vel: 0.12, decay: 0.6 }); A.pluck(t + 0.05, 33 + 12, { vel: 0.3, decay: 0.4 }); }, 'blink');
  },
});
