// Score: Awakening — the spark crackles on the left and charges up, the beam sweeps the facade (pad that
// crosses the stereo field and flashes), the moon rises (ghostly glow + theremin), the door throbs faster and faster
// and each beat lights a window (celesta), the house holds its breath (silence) and bursts (strike, choir,
// organ, fire, bats, startled cat); an unsettling calm with music box, owl and wood block; the gust
// crosses from right to left blowing out candles and fire; last beat and silence before the end.
// Timings copied from js/scenes/01-despertar.js (if they change there, change them here).
(() => {
  const SCAN0 = 2, SCAN1 = 6.2, MOON0 = 6;
  const BEATS = [7, 8.3, 9.5, 10.6, 11.5, 12.25, 12.85, 13.3];
  const ON = 13.6, GUST = 19.4, GUST_DUR = 2.6, CAT_EYES = 8.6, LAST = 22.3;
  const VARIANTS = ['duo', 'pumpkin', 'trio', 'cat'];
  const lerp = (a, b, k) => a + (b - a) * k;

  // house on screen (pan and timings that depend on the mapping); without mapping, a typical facade
  function house(A) {
    const zs = A.S.screenZones || [];
    if (A.state.H && A.state.src === zs) return A.state.H;
    const W = typeof innerWidth === 'number' && innerWidth ? innerWidth : 1920;
    let x0 = Infinity, x1 = -Infinity;
    for (const z of zs) { x0 = Math.min(x0, z.x0); x1 = Math.max(x1, z.x1); }
    if (!zs.length) { x0 = W * 0.1; x1 = W * 0.9; }
    const area = z => (z.x1 - z.x0) * (z.y1 - z.y0);
    const big = k => zs.filter(z => z.kind === k).sort((a, b) => area(b) - area(a))[0];
    const wz = zs.filter(z => z.kind === 'window').sort((a, b) => a.cx - b.cx);
    const wins = wz.length ? wz.map(z => ({ x: z.cx, v: VARIANTS[z.index % VARIANTS.length] }))
      : [0.2, 0.38, 0.64, 0.82].map((u, i) => ({ x: lerp(x0, x1, u), v: VARIANTS[i] }));
    const n = wins.length, gv = (x1 - x0 + 360) / GUST_DUR;
    wins.forEach((w, i) => {
      w.pan = A.panX(w.x);
      // lit (as ignT) and off when the gust passes (as gustT)
      w.on = (n <= 4 ? BEATS[i] : lerp(BEATS[0], BEATS[3], i / Math.max(1, n - 1))) + 0.1;
      w.off = GUST + (x1 + 160 - w.x) / gv;
    });
    const door = big('door'), roof = big('roof'), left = zs.reduce((a, b) => (b.x0 < a.x0 ? b : a), zs[0]);
    const H = {
      wins,
      door: door ? A.panX(door.cx) : -0.05,
      roof: roof ? A.panX(roof.cx) : 0,
      spark: left ? A.panX(left.cx) : -0.8,
      L: A.panX(x0), R: A.panX(x1),
    };
    A.state.src = zs;
    return (A.state.H = H);
  }
  // ambience change right on its moment (A.at advances up to 0.25 s and E.bed acts already)
  const bedAt = (A, t, name, lvl, tc) => { const k = 'b' + t + name; if (A.S.t >= t && !A.state[k]) { A.state[k] = 1; A.bed(name, lvl, tc); } };

  registerScore('Awakening', {
    beds: { night: 0.35, drone: 0.1 },
    tick(A, S) {
      const H = house(A);

      // ---------- intro: spark on the left (feints 0.22 / 0.52 / 0.74) that charges and stretches ----------
      A.at(0.22, t => A.staticCrackle({ t, dur: 0.3, vel: 0.35, snap: false, pan: H.spark }));
      A.at(0.52, t => A.staticCrackle({ t, dur: 0.25, vel: 0.3, snap: false, pan: H.spark }));
      A.at(0.74, t => A.staticCrackle({ t, dur: 0.4, vel: 0.55, pan: H.spark }));
      A.at(0.95, t => A.reverseSwell({ t, dur: 0.9, vel: 0.4, pitch: 1.3, pan: H.spark }));
      A.at(1.85, t => A.spellZap({ t, vel: 0.45, pitch: 1.2, pan: H.spark }));

      // ---------- sweep 2 → 6.2: pad that opens and travels with the beam, flashes at the edges ----------
      A.at(SCAN0, t => A.pad(t, [45, 52, 57, 64], SCAN1 - SCAN0, { vel: 0.5, attack: 0.6, release: 1.8, cutoff: 450, sweep: 2600, pan: [H.L, H.R] }));
      A.at(SCAN0, t => A.whoosh({ t, dur: SCAN1 - SCAN0, vel: 0.25, tone: true, pan: [H.L, H.R] }));
      A.steps('glint', 0.95, (i, t) => A.celesta(t, [88, 91, 93, 96, 100][i], { vel: 0.3, pan: lerp(H.L, H.R, (i + 0.5) / 4) }), SCAN0 + 0.35, SCAN1 - 0.2);
      bedAt(A, SCAN0, 'drone', 0.18, 3);

      // ---------- moon 6 → 12.5 on the pediment: ghostly glow and theremin rising toward the leading tone ----------
      A.at(MOON0, t => A.ghostShimmer({ t, note: 69, dur: 6.2, attack: 3, release: 1.5, vel: 0.5, pan: H.roof }));
      A.at(6.4, t => A.theremin(t, [[0, 64], [1.8, 69], [3.4, 72], [4.6, 71], [5.9, 68]], { vel: 0.32, pan: H.roof }));

      // ---------- door beats (more and more frequent and loud) ----------
      BEATS.forEach((b, i) => A.at(b, t => {
        const k = i / (BEATS.length - 1);
        A.heartbeat({ t, vel: 0.6 + 0.4 * k, pan: H.door });
        A.timpani(t, 45, { vel: 0.2 + 0.25 * k, decay: 1.2, pan: H.door });
      }, 'beat' + i));
      bedAt(A, BEATS[0], 'drone', 0.14, 4);

      // each beat lights a window: celesta rising (candles), magic pop on the pumpkin
      H.wins.forEach((w, i) => A.at(w.on, t => {
        A.celesta(t, [81, 84, 88, 93, 96, 100][i % 6], { vel: 0.55, pan: w.pan });
        if (w.v === 'pumpkin') A.pop({ t: t + 0.05, vel: 0.6, magic: true, pan: w.pan });
        else A.sparkle({ t, count: 4, dur: 0.5, vel: 0.3, pan: w.pan });
      }, 'win' + i));
      // cat's eyes in their dark window
      const cat = H.wins.find(w => w.v === 'cat');
      if (cat) A.at(CAT_EYES, t => A.cat({ t, kind: 'meow', vel: 0.35, pan: cat.pan }));

      // ---------- tension 7 → 13.3: swelling strings, drum roll, neon flicker ----------
      A.at(7.05, t => A.strings(t, [57, 60], 6.25, { vel: 0.18, attack: 2.5, release: 0.15 }));
      A.at(9.5, t => A.strings(t, [45, 52, 64], 3.8, { vel: 0.25, attack: 2, release: 0.15, trem: 9 }));
      A.at(11.5, t => A.strings(t, [69, 72, 75], 1.8, { vel: 0.32, attack: 1.2, release: 0.12, trem: 14 }));
      A.at(11.5, t => A.timpani(t, 40, { vel: 0.45, roll: 1.75, decay: 0.3 }));
      A.at(11.6, t => A.riser({ t, dur: 1.7, vel: 0.55 }));
      A.at(12.0, t => A.staticCrackle({ t, dur: 1.25, vel: 0.35, snap: false, pan: [H.L, H.R] }));
      // the house holds its breath (13.26 → 13.6): ambiences are cut
      bedAt(A, 13.2, 'drone', 0, 0.25);
      bedAt(A, 13.2, 'night', 0.05, 0.25);

      // ---------- burst at 13.6: the house lights up ----------
      A.at(ON, t => {
        A.impactHit({ t, vel: 0.9, braam: 0.8, metal: 0.4, pan: H.door });
        A.boom({ t, vel: 0.6, pan: H.door });
        A.fireUp({ t: t + 0.02, vel: 0.6, pan: H.door });
        A.choirSting({ t, notes: [45, 57, 60, 64, 69], dur: 1.2, vel: 0.9 });
        A.organ(t, [45, 57, 64, 69, 72], 2.6, { vel: 1.1, release: 1.2 });
        A.strings(t, [57, 64, 69, 72], 2.2, { vel: 0.5, attack: 0.05, release: 1.5 });
        A.tubular(t, 69, { vel: 0.5, decay: 5 });
      }, 'on');
      if (cat) A.at(ON + 0.05, t => A.cat({ t, kind: 'hiss', vel: 0.5, pan: cat.pan }));
      // bats: leave the pediment in a fan toward both sides
      A.at(ON + 0.3, t => {
        A.bats({ t, count: 3, dur: 1.8, vel: 0.7, pan: [H.roof, H.L] });
        A.bats({ t: t + 0.2, count: 3, dur: 1.7, vel: 0.7, pan: [H.roof, H.R] });
      }, 'bats');
      // the lit house: fire from the embers, choir that breathes and calms down
      bedAt(A, ON, 'fire', 0.45, 1);
      bedAt(A, ON + 0.4, 'night', 0.22, 3);
      bedAt(A, ON + 0.4, 'drone', 0.12, 3);
      A.at(ON + 0.6, t => A.choir(t, [57, 64, 72], 1.4, { vel: 0.6, attack: 0.4, release: 1.6, vowel: 'a', vowel2: 'o' }));
      A.at(ON + 0.6, t => A.pad(t, [45, 52, 57, 60], 1.6, { vel: 0.4, attack: 0.5, release: 1.5, cutoff: 1400, sweep: 700 }));

      // ---------- unsettling calm 15 → 19.2: music-box lullaby, owl, wood block (the cat moves its ears) ----------
      bedAt(A, 15.3, 'crickets', 0.25, 2);
      bedAt(A, 15.0, 'fire', 0.12, 1.5);
      bedAt(A, 15.0, 'drone', 0.04, 2);
      const NANA = [[0, 76], [1, 81], [2, 84], [3, 83], [4, 81], [5, 76], [6, 77], [7, 76], [8, 74], [9, 75], [10, 76]];
      A.steps('nana', 0.38, (i, t) => {
        const n = NANA.find(x => x[0] === i);
        if (n) A.musicBox(t, n[1], { vel: 0.65, pan: 0.15 });
        if (i % 3 === 0) A.pluck(t, i === 9 ? 44 : 45, { vel: 0.3, decay: 0.5 });
      }, 15.0, 15.0 + 11 * 0.38);
      A.at(15.0, t => A.pad(t, [57, 60, 64], 4.0, { vel: 0.2, attack: 1.2, release: 1.2, cutoff: 900 }));
      A.at(16.0, t => A.owl({ t, vel: 0.45, pan: H.L * 0.8 }));
      A.at(17.85, t => A.floorboard({ t, vel: 0.5, pan: H.door }));

      // ---------- gust 19.4 → 22 from right to left: ghost, wind, windows and candles going out ----------
      A.at(GUST - 0.3, t => A.ghost({ t, dur: 2.6, vel: 0.5, pan: [H.R, H.L] }));
      A.at(GUST - 0.1, t => A.windGust({ t, dur: GUST_DUR + 0.4, vel: 0.6, pan: [H.R, H.L] }));
      A.at(GUST - 0.1, t => A.strings(t, [63, 69], 2.4, { vel: 0.22, attack: 0.4, release: 1.5, trem: 7 }));
      H.wins.forEach((w, i) => A.at(w.off - 0.25, t => {
        A.windowRattle({ t, dur: 0.6, vel: 0.45, pan: w.pan });
        A.whoosh({ t: t + 0.25, dur: 0.35, vel: 0.2, pan: w.pan });
      }, 'off' + i));
      bedAt(A, GUST - 0.2, 'wind', 0.25, 1);
      bedAt(A, GUST, 'crickets', 0, 1);
      bedAt(A, GUST + 0.6, 'fire', 0, 1.5);
      bedAt(A, GUST + 1.8, 'wind', 0.12, 2);
      bedAt(A, GUST + 1.8, 'night', 0.25, 2);

      // ---------- last beat 22.3: the house is still alive; the cat's eyes close and everything goes off ----------
      A.at(LAST, t => {
        A.heartbeat({ t, vel: 0.85, pan: H.door });
        A.organ(t, [45, 52, 57, 60], 0.7, { vel: 0.4, release: 0.8, cutoff: 1800 });
        A.choir(t, [57, 64], 0.8, { vel: 0.3, attack: 0.3, release: 0.9, vowel: 'u' });
      }, 'last');
      if (cat) A.at(23.15, t => A.musicBox(t, 93, { vel: 0.4, decay: 0.7, pan: cat.pan }));
      for (const b of ['night', 'wind', 'drone', 'fire', 'crickets']) bedAt(A, 22.1, b, 0, 1);
    },
  });
})();
