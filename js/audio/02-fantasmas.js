// Score: Ghosts — music-box waltzes in D minor, theremin flying with ghost A,
// silence with heartbeats, "BOO!" and a farewell in D major. Timings = script of js/scenes/02-fantasmas.js
registerScore('Ghosts', (() => {
  const HUSH = 21.6, RUSH = 22.9, RELEASE = 24.2, BOO = 24.9, POOF = 26.4, BYE = 28.0, CLOSE = 31.6;
  const M0 = 4.6, BAR = 1.2, BT = BAR / 3, R0 = 26.8;  // waltz: 1.2 s per bar, from the first peek; reprise
  // chords per bar (from M0): bass root and middle triad
  const Dm = [38, [50, 53, 57]], Gm = [43, [50, 55, 58]], Am = [45, [49, 52, 57]], Bb = [46, [50, 53, 58]];
  const HARM = [Dm, Dm, Gm, Am, Dm, Dm, Bb, Am, Dm, Gm, Am, Dm, Bb, Am];
  // music-box melody (bars 0-5), null = silence
  const MEL = [62, 65, 69, 74, 73, 74, 70, 69, 67, 69, null, 61, 62, 65, 69, 74, 76, 77];
  // phase 3: rising arpeggios (bars 11-13)
  const ARP = [[62, 65, 69], [70, 74, 77], [73, 76, 79]];
  // reprise in D major (from R0): chords and melody; the last bar falls on CLOSE
  const Dd = [38, [50, 54, 57]], Gd = [43, [50, 55, 59]], Ad = [45, [49, 52, 57]];
  const RH = [Dd, Dd, Gd, Ad], RMEL = [62, 66, 69, 74, 73, 74, 71, 69, 67, 66, 64, 61];
  const clampP = v => Math.max(-0.9, Math.min(0.9, v));

  // pan of each role: windows as in the scene (bay window under the pediment, ends, low); without mapping, the reference photo
  function places(A, S) {
    const zs = S.screenZones || [];
    if (A.state.src === zs) return A.state.P;
    const W = typeof innerWidth === 'number' && innerWidth ? innerWidth : 1920;
    let f = { x0: 0.082, x1: 0.953, hero: 0.38, low: 0.382, left: 0.186, right: 0.764, extra: null, door: 0.55, moon: 0.43, t0: 0.6, t1: 0.953, wins: [0.186, 0.38, 0.382, 0.764] };
    const wins = zs.filter(z => z.kind === 'window'), body = zs.filter(z => z.kind === 'wall' || z.kind === 'roof');
    if (wins.length && body.length) {
      const ar = z => (z.x1 - z.x0) * (z.y1 - z.y0), big = l => l.reduce((a, b) => (!a || ar(b) > ar(a) ? b : a), null), X = z => z.cx / W;
      const x0 = Math.min(...body.map(z => z.x0)), x1 = Math.max(...body.map(z => z.x1)), hw = x1 - x0;
      const roof = big(zs.filter(z => z.kind === 'roof')), door = big(zs.filter(z => z.kind === 'door')), ax = roof ? roof.cx : (x0 + x1) / 2;
      const sc = z => ar(z) / (1 + (3 * Math.abs(z.cx - ax)) / hw);
      const hero = wins.reduce((a, b) => (sc(b) > sc(a) ? b : a)), rest = wins.filter(z => z !== hero);
      const right = rest.filter(z => z.cx > hero.cx).sort((a, b) => b.cx - a.cx)[0], left = rest.filter(z => z.cx < hero.cx).sort((a, b) => a.cx - b.cx)[0];
      const low = rest.filter(z => z !== right && z !== left).sort((a, b) => Math.abs(a.cx - hero.cx) - Math.abs(b.cx - hero.cx) || b.cy - a.cy)[0];
      const extra = rest.find(z => z !== right && z !== left && z !== low);
      const walls = zs.filter(z => z.kind === 'wall'), tz = big(walls.filter(z => z.cx > hero.cx + hw * 0.1)) || big(walls);
      f = {
        x0: x0 / W, x1: x1 / W, hero: X(hero), right: X(right || hero), left: X(left || hero), low: X(low || left || hero), extra: extra ? X(extra) : null,
        door: door ? X(door) : X(hero), moon: roof ? X(roof) : (x0 + x1) / 2 / W, t0: tz ? tz.x0 / W : 0.6, t1: tz ? tz.x1 / W : 0.95,
        wins: wins.map(X).sort((a, b) => a - b),
      };
    }
    // a bit more open than the image: the audience is 10-25 m away
    const pn = x => clampP((x * 2 - 1) * 1.2), P = {};
    for (const k of ['hero', 'low', 'left', 'right', 'door', 'moon', 't0', 't1']) P[k] = pn(f[k]);
    P.extra = f.extra == null ? null : pn(f.extra);
    P.wins = f.wins.map(pn);
    P.u = u => pn(f.x0 + u * (f.x1 - f.x0));   // path point (fraction of the house)
    A.state.src = zs; A.state.P = P;
    return P;
  }

  return {
    beds: { wind: 0.22, night: 0.3 },
    tick(A, S) {
      const P = places(A, S), at = (t, k, fn) => A.at(t, fn, k);

      // ---------- intro: the house is drawn, the moon sweeps and opens the curtains ----------
      at(0, 'drone', t => A.drone(t, 38, 3.6, { vel: 0.5, cutoff: 260, attack: 2.2 }));
      at(0.3, 'bell0', t => A.tubular(t, 62, { vel: 0.3, decay: 4, pan: P.moon }));
      at(0.8, 'roof', t => A.celesta(t, 81, { vel: 0.22, pan: P.moon }));
      // window outlines (left to right) and the door
      P.wins.forEach((p, i) => at(1.5 + i * 0.35, 'win' + i, t => A.celesta(t, [74, 77, 81, 86, 89, 93][i % 6], { vel: 0.22, pan: p })));
      at(2.9, 'doorGlint', t => A.celesta(t, 86, { vel: 0.2, pan: P.door }));
      at(1.6, 'pad0', t => A.pad(t, [50, 57], 2.6, { vel: 0.3, attack: 1.6, release: 1 }));
      at(2.9, 'sweep', t => A.whoosh({ t, pan: [P.u(0), P.u(1)], dur: 1.8, vel: 0.45, pitch: 0.75 }));
      at(2.95, 'shim0', t => A.ghostShimmer({ t, note: 62, dur: 1.8, vel: 0.5, release: 1.2 }));

      // ---------- waltz (4.6-21.6): low pizzicato on 1, chord on 2 and 3, pad every two bars ----------
      A.steps('beat', BT, (i, t) => {
        const bar = Math.floor(i / 3), b = i % 3, [root, ch] = HARM[bar % HARM.length], bld = bar >= 11;
        if (b === 0) A.pluck(t, root, { vel: bld ? 0.7 : 0.55, decay: 0.5 });
        else A.pluck(t, ch[b], { vel: 0.26, pan: b === 1 ? -0.3 : 0.3 });
        // music box at the peeks; celesta rising during the chase
        if (bar < 6 && MEL[i] != null) A.musicBox(t, MEL[i] + 12, { vel: 0.38, pan: Math.sin(i * 0.7) * 0.3 });
        if (bld) A.celesta(t, ARP[bar - 11][b] + 12, { vel: 0.26, pan: P.right * 0.5 });
        // chase pulse (ghost C)
        if (bld) { if (b === 0) A.kick(t, { vel: 0.45 }); else A.hat(t, { vel: 0.14 }); }
      }, M0, HUSH - 0.25);
      A.steps('pad', BAR * 2, (i, t) => {
        const bar = i * 2, [, ch] = HARM[bar], bld = bar >= 6;
        A.pad(t, ch, BAR * 2 - 0.3, { vel: bld ? 0.3 : 0.24, cutoff: bld ? 1500 : 1000, attack: 0.8, release: 0.6 });
        if (bld) A.strings(t, ch.map(m => m + 12), BAR * 2 - 0.3, { vel: bar >= 10 ? 0.4 : 0.28, trem: bar >= 10 ? 10 : 0, attack: 0.6, release: 0.4 });
      }, M0, HUSH - 0.4);

      // ---------- peeks in the windows ----------
      at(4.7, 'heroPeek', t => A.ghost({ t, pan: P.hero, pitch: 320, dur: 1.6, vel: 0.55 }));
      at(5.8, 'leftPop', t => A.pop({ t, pan: P.left, pitch: 1.1, vel: 0.7 }));
      at(6.6, 'heroScared', t => A.whoosh({ t, pan: P.hero, dur: 0.35, vel: 0.35, pitch: 1.4 }));
      if (P.extra != null) at(6.5, 'extraPop', t => A.pop({ t, pan: P.extra, pitch: 1.25, vel: 0.6 }));
      at(6.65, 'rightPeek', t => A.giggle({ t, pan: P.right, count: 3, vel: 0.4 }));
      at(7.4, 'lowShy', t => A.ghost({ t, pan: P.low, pitch: 480, dur: 1.1, vel: 0.4 }));
      at(8.2, 'heroPop', t => A.pop({ t, pan: P.hero, pitch: 0.9, vel: 0.75 }));
      at(8.5, 'rightPeek2', t => A.ghost({ t, pan: P.right, pitch: 280, dur: 1.6, vel: 0.45 }));
      at(9.6, 'rightScared', t => A.whoosh({ t, pan: P.right, dur: 0.35, vel: 0.35, pitch: 1.4 }));

      // ---------- ghost A: bay window → pediment (moon) → right wing ----------
      at(11.4, 'aMoan', t => A.ghost({ t, pan: P.hero, pitch: 300, dur: 2, vel: 0.65 }));
      at(12.1, 'aTher', t => A.theremin(t, [[0, 74], [0.5, 77], [1.1, 76], [1.7, 73], [2.3, 74], [2.9, 77], [3.5, 79], [4.1, 76], [4.6, 73], [5.1, 69]], { vel: 0.42, glide: 0.35, pan: [P.hero, P.right] }));
      at(12.1, 'aFly1', t => A.whoosh({ t, pan: [P.hero, P.u(0.52)], dur: 2.4, vel: 0.55, pitch: 0.9 }));
      at(14.6, 'aFly2', t => A.whoosh({ t, pan: [P.u(0.52), P.u(0.93)], dur: 2.4, vel: 0.55, pitch: 0.85 }));
      at(17.2, 'aDive', t => { A.windowRattle({ t, pan: P.right, dur: 0.6, vel: 0.5 }); A.celesta(t, 86, { vel: 0.25, pan: P.right }); });
      // ---------- ghost B (small): balcony → skimming the floor → low window ----------
      at(14.4, 'bVoice', t => A.ghost({ t, pan: P.left, pitch: 430, dur: 1.2, vel: 0.45 }));
      at(14.4, 'bFly', t => A.whoosh({ t, pan: [P.left, P.low], dur: 2.4, vel: 0.45, pitch: 1.3 }));
      at(16.8, 'bDive', t => A.pop({ t, pan: P.low, pitch: 1.4, vel: 0.5 }));
      at(16.95, 'bGiggle', t => A.giggle({ t, pan: P.low, count: 4, vel: 0.4 }));
      // ---------- ghost C: right window → back along the wing → jump to the door → slit ----------
      at(18.7, 'cMoan', t => A.ghost({ t, pan: P.right, pitch: 260, dur: 1.6, vel: 0.6 }));
      at(19.4, 'cFly', t => A.whoosh({ t, pan: [P.u(0.93), P.door], dur: 1.3, vel: 0.5 }));
      at(20.7, 'cHop', t => A.pop({ t, pan: P.door, pitch: 1.3, vel: 0.5 }));
      at(20.95, 'cSqueeze', t => A.creak({ t, pan: P.door, dur: 0.6, pitch: 1.4, vel: 0.45 }));
      at(20.2, 'timp', t => A.timpani(t, 45, { vel: 0.55, roll: 1.3, decay: 0.6 }));

      // ---------- calm: hard cut, curtains close, heartbeats ----------
      at(HUSH, 'cut', t => {
        A.stab(t, [50, 53, 56], { vel: 0.5, dur: 0.2 });
        A.bed('wind', 0.08, 0.3); A.bed('night', 0.1, 0.3);
      });
      [P.left, P.low, P.right, P.extra].forEach((p, k) => { if (p != null) at(21.9 + k * 0.08, 'shut' + k, t => A.windowRattle({ t, pan: p, dur: 0.3, vel: 0.45 })); });
      at(21.7, 'hb1', t => A.heartbeat({ t, gap: 0.24, vel: 0.9 }));
      at(22.35, 'hb2', t => A.heartbeat({ t, gap: 0.24, vel: 1 }));
      at(21.8, 'hushDrone', t => A.drone(t, 37, 2.8, { vel: 0.45, cutoff: 180, attack: 1.2 }));

      // ---------- the giant: leaves the bay window, gathers momentum and lunges at the audience ----------
      at(RUSH, 'rushMoan', t => { A.ghost({ t, pan: P.hero, pitch: 210, dur: 1.5, vel: 0.85 }); A.bed('wind', 0.35, 0.8); });
      at(RUSH + 0.1, 'riser', t => A.riser({ t, dur: BOO - RUSH - 0.1, vel: 0.55 }));
      at(RUSH, 'rushStr', t => A.strings(t, [50, 51, 56, 62], BOO - RUSH, { vel: 0.4, attack: 1.6, trem: 12, release: 0.2 }));
      at(RELEASE, 'release', t => { A.timpani(t, 38, { vel: 0.7, decay: 0.8 }); A.whoosh({ t, pan: [P.hero, P.hero * 0.3], dur: 0.7, vel: 0.6, pitch: 0.7 }); });
      at(RELEASE, 'swell', t => A.reverseSwell({ t, dur: BOO - RELEASE, vel: 0.6 }));
      at(BOO - 0.03, 'boo', t => A.boo({ t, pan: P.hero * 0.3, dur: 0.7, vel: 1 }));
      at(BOO, 'booHit', t => { A.impactHit({ t, vel: 0.85, braam: 0.6 }); A.choirSting({ t, notes: [50, 57, 62, 65, 69], vowel: 'o', dur: 0.8, vel: 0.7 }); });
      // "BOO!" letters that fall one by one onto the wall
      for (let i = 0; i < 4; i++) at(BOO + 0.06 + i * 0.11 + 0.2, 'letter' + i, t => A.tom(t, 50 - i * 3, { vel: 0.45, pan: P.t0 + (P.t1 - P.t0) * (i + 0.5) / 4 }));
      at(BOO + 0.45, 'laugh', t => A.laugh({ t, pan: P.hero * 0.3, count: 4, vel: 0.7 }));
      at(BOO + 0.5, 'calm', t => { A.bed('wind', 0.22, 1.5); A.bed('night', 0.3, 1.5); });
      at(POOF, 'poof', t => { A.pop({ t, pitch: 0.6, vel: 0.9, magic: true }); A.sparkle({ t, vel: 0.6 }); });
      at(POOF + 0.1, 'poofShim', t => A.ghostShimmer({ t, note: 74, dur: 1.4, vel: 0.5, release: 1.2 }));

      // ---------- farewell in D major: everyone waves, the door opens slightly, curtains close ----------
      A.steps('rep', BT, (i, t) => {
        const bar = Math.floor(i / 3), b = i % 3, [root, ch] = RH[bar];
        if (b === 0) A.pluck(t, root, { vel: 0.45, decay: 0.6 });
        else A.pluck(t, ch[b], { vel: 0.2, pan: b === 1 ? -0.3 : 0.3 });
        if (RMEL[i] != null) A.musicBox(t, RMEL[i] + 12, { vel: 0.4, pan: Math.sin(i * 0.7) * 0.3 });
      }, R0, CLOSE - 0.05);
      A.steps('repPad', BAR, (i, t) => A.pad(t, RH[i][1], BAR - 0.1, { vel: 0.24, cutoff: 1300, attack: 0.5, release: 0.5 }), R0, CLOSE - 0.05);
      at(BYE + 0.3, 'byeLeft', t => A.ghost({ t, pan: P.left, pitch: 360, dur: 1.2, vel: 0.35 }));
      at(BYE + 0.4, 'doorOpen', t => A.creak({ t, pan: P.door, dur: 1, vel: 0.4 }));
      at(BYE + 0.8, 'byeLow', t => A.giggle({ t, pan: P.low, count: 4, vel: 0.35 }));
      at(BYE + 1.05, 'byeRight', t => A.ghost({ t, pan: P.right, pitch: 330, dur: 1.2, vel: 0.3 }));
      if (P.extra != null) at(BYE + 0.7, 'byeExtra', t => A.ghost({ t, pan: P.extra, pitch: 390, dur: 1, vel: 0.28 }));
      at(CLOSE, 'end', t => {
        A.musicBox(t, 74, { vel: 0.4 }); A.musicBox(t, 86, { vel: 0.3 });
        A.pluck(t, 38, { vel: 0.4, decay: 0.8 });
        A.pad(t, [50, 54, 57, 62], 0.6, { vel: 0.22, attack: 0.1, release: 0.4 });
        A.tubular(t, 62, { vel: 0.22, decay: 1.4 });
        A.whoosh({ t, pan: [P.right, P.left], dur: 2, vel: 0.25, pitch: 0.7 });
        A.bed('wind', 0, 0.45); A.bed('night', 0, 0.45);
      });
      at(CLOSE + 0.4, 'doorShut', t => A.creak({ t, pan: P.door, dur: 0.5, pitch: 1.2, vel: 0.28 }));
    },
  };
})());
