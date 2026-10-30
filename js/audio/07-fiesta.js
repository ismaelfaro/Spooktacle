// Score: Pumpkin party — song at PARTY_BPM, step 0 = t 0 (eighth notes in phase with S.beat)
// Beats: intro 0-8 · verse 8-24 · bridge 24-40 · rise 40-52 · final bar 52-56 · hit 56 (30 s) and curtain.
// The mouths sing LEAD (same array as the scene): question (steps 0-7) and answer (8-15) of each 8-beat phrase.
registerScore('Pumpkin party', (() => {
  const SPB = 60 / PARTY_BPM, ST = SPB / 2, HIT = 56, HIT_T = HIT * SPB, bt = b => b * SPB;
  const LEAD = [69, 72, 76, 72, 69, 72, 76, 77, 76, 72, 69, 68, 69, 0, 64, 0];
  // harmony per 8-beat phrase: melody transposition, bass root and chord (Am Am Dm Am Em Am Dm E7)
  const PH = [
    { tr: 0, r: 45, ch: [57, 60, 64] }, { tr: 0, r: 45, ch: [57, 60, 64] }, { tr: 5, r: 50, ch: [57, 62, 65] },
    { tr: 0, r: 45, ch: [57, 60, 64] }, { tr: -5, r: 52, ch: [55, 59, 64] }, { tr: 0, r: 45, ch: [57, 60, 64] },
    { tr: 5, r: 50, ch: [57, 62, 65] },
  ];
  // "monster" bass: root, octave, seventh and chromatic descent (null = silence)
  const BASS = [0, null, 12, 0, null, 0, 10, null, 0, null, 12, 0, 7, null, 5, 3];
  const E7 = [64, 68, 71, 74, 76, 80, 83, 86];

  // ---------- panning (with fallback if there are no zones: lab) ----------
  const area = z => (z.x1 - z.x0) * (z.y1 - z.y0);
  function pans(A) {
    const zs = A.S.screenZones || [];
    if (A.state.ref === zs) return A.state.p;
    const wins = zs.filter(z => z.kind === 'window');
    const leads = [...wins].sort((a, c) => area(c) - area(a)).slice(0, 2).sort((a, c) => a.cx - c.cx);
    const back = wins.filter(z => !leads.includes(z)), roof = zs.filter(z => z.kind === 'roof').sort((a, c) => area(c) - area(a))[0];
    const nw = wins.length || 4;
    const p = {
      call: leads[0] ? A.panX(leads[0].cx) : -0.45,
      resp: leads[1] ? A.panX(leads[1].cx) : leads[0] ? A.panX(leads[0].cx) : 0.45,
      back: back.length ? back.reduce((s, z) => s + A.panX(z.cx), 0) / back.length : 0,
      door: zs.some(z => z.kind === 'door') ? A.zonePan('door') : 0,
      win: i => (wins.find(z => z.index === i) ? A.panX(wins.find(z => z.index === i).cx) : (i / Math.max(1, nw - 1)) * 1.2 - 0.6),
      // x relative to the gable (0..1, may go outside) → panning
      gx: x => (roof ? A.panX(roof.x0 + x * (roof.x1 - roof.x0)) : Math.max(-0.95, Math.min(0.95, -0.4 + x * 0.8))),
      nw,
    };
    A.state.ref = zs; A.state.p = p;
    return p;
  }

  return {
    beds: {},
    gain: 0.7,
    tick(A, S) {
      const P = pans(A);
      const crash = (t, v = 0.7) => A.hat(t, { open: true, vel: v });

      // ---------- eighth-note grid: band, voice and choir ----------
      A.steps('beat', ST, (i, t) => {
        const b = i / 2, k = i % 16, ph = PH[Math.min(6, i >> 4)], onBeat = i % 2 === 0, bk = (i >> 1) % 4;

        // intro 0-8: breathing organ, and the music box leads the chorus
        if (b < 8) {
          if (i === 0) A.organ(t, [45, 57, 60, 64], bt(7.5), { vel: 0.32, release: 0.6 });
          if (b < 4 && LEAD[k]) A.musicBox(t, LEAD[k] + 12, { vel: 0.4, pan: -0.2 + 0.4 * (k / 7) });
          if (b >= 4 && b < 7 && LEAD[k]) A.musicBox(t, LEAD[k] + 12, { vel: 0.3, pan: 0.2 });
          if (onBeat && b >= 4) A.kick(t, { vel: 0.4 + 0.08 * (b - 4) });
          if (!onBeat) A.hat(t, { vel: 0.12 + 0.04 * b });
          if (b >= 4 && BASS[k] != null) A.bass(t, 45 + BASS[k], ST * 0.85, { vel: 0.45 });
          // drum roll before starting (the skeleton crouches)
          if (b >= 7) { A.tom(t, b < 7.5 ? 50 : 45, { vel: 0.6 }); A.snare(t + ST / 2, { vel: 0.35 }); }
          return;
        }

        // final bar 52-56: everyone sings the E7 arpeggio in crescendo, drum roll and kick on each beat
        if (b >= 52) {
          // last eighth in silence (the skeleton crouches): the hit comes in on its own
          if (i === 111) return;
          const c = (b - 52) / 4;
          A.choir(t, [E7[i - 104]], ST * 0.85, { vowel: 'a', attack: 0.015, release: 0.12, vel: 0.32 + 0.3 * c });
          if (onBeat) { A.kick(t, { vel: 0.85 }); A.stab(t, [52, 56, 59, 62], { vel: 0.3 + 0.25 * c, dur: 0.12 }); }
          A.snare(t, { vel: 0.3 + 0.4 * c }); A.snare(t + ST / 2, { vel: 0.25 + 0.4 * c });
          if (b >= 54) A.tom(t + ST / 2, 57 - (i - 108) * 2, { vel: 0.5 + 0.3 * c });
          if (onBeat) A.bass(t, 40, ST * 1.6, { vel: 0.6 });
          return;
        }

        const verse = b < 24, bridge = b >= 24 && b < 40, build = b >= 40;
        // drums: kick on each beat (pulses with S.kick), snare on 2 and 4, hi-hat on eighth notes
        if (onBeat) A.kick(t, { vel: build ? 0.85 : 0.72 });
        if (k === 11 && !build) A.kick(t, { vel: 0.45 });
        if (onBeat && (bk === 1 || bk === 3)) { A.snare(t, { vel: build ? 0.62 : 0.5 }); if (build) A.snare(t + 0.012, { vel: 0.3, pan: -0.3 }); }
        if (!onBeat) A.hat(t, { vel: build ? 0.32 : 0.24, open: build && k % 4 === 3 });
        // cymbals at section changes
        if (i === 16 || i === 48 || i === 80) crash(t, 0.8);

        // bass: monster riff (louder on the rise)
        if (BASS[k] != null) A.bass(t, ph.r + BASS[k], ST * 0.85, { vel: build ? 0.62 : 0.55 });

        // organ: long chord in the verse; plucked offbeats in the bridge and rise
        if (verse && k === 0) A.organ(t, ph.ch, bt(7.6), { vel: 0.22, release: 0.4 });
        if (!verse && !onBeat) for (const c of ph.ch.slice(1)) A.pluck(t, c, { vel: 0.32, decay: 0.12, pan: c % 2 ? -0.3 : 0.3 });

        // voice: the question pumpkin (left) and the answer pumpkin (right), LEAD notes
        const n = LEAD[k];
        if (n) {
          const nk = (k + 1) % 16, cont = LEAD[nk] && (k < 8) === (nk < 8), m = n + ph.tr;
          A.choir(t, [m], cont ? ST * 0.92 : 0.17, { vowel: n >= 72 ? 'o' : 'a', attack: 0.018, release: 0.07, vel: 0.6, pan: k < 8 ? P.call : P.resp, wet: 0.35 });
          // plucked one octave down: sets the syllable's rhythm at a distance
          A.pluck(t, m - 12, { vel: 0.3, pan: k < 8 ? P.call : P.resp });
        }

        // background chorus: "du" on each beat from the bridge
        if (b >= 24 && onBeat) A.choir(t, [ph.ch[bk % 2 ? 1 : 0]], 0.12, { vowel: 'u', attack: 0.012, release: 0.08, vel: 0.42, pan: P.back });
      }, 0, HIT_T - 0.01);

      // ---------- transitions ----------
      A.at(bt(8) - 1.0, t => A.reverseSwell({ t, dur: 1.0, vel: 0.35 }));
      A.at(bt(24) - 1.0, t => A.reverseSwell({ t, dur: 1.0, vel: 0.4 }));
      A.at(bt(40) - 1.0, t => A.reverseSwell({ t, dur: 1.0, vel: 0.45 }));
      A.at(bt(48), t => A.riser({ t, dur: HIT_T - bt(48), vel: 0.5 }));

      // curtains that open (beat 6 + 1/3 per window)
      for (let w = 0; w < P.nw; w++) A.at(bt(6 + w * 0.33), t => A.pop({ t, pan: P.win(w), vel: 0.45, pitch: 0.9 + w * 0.08 }), 'telon' + w);

      // ---------- skeleton at the door ----------
      // rattling on 2 and 4; on the disco (24-32) on each arm click
      A.steps('huesos', SPB, (i, t) => {
        const b = 8 + i;
        if (b >= 33 && b < 37) return;
        const disco = b >= 24 && b < 32;
        if (!disco && i % 2 === 0) return;
        A.boneRattle({ t: t + 0.01, pan: P.door, count: disco ? 3 : 4, vel: disco ? 0.6 : b >= 40 ? 0.5 : 0.42 });
      }, bt(8), bt(52));
      // the head escapes (34), clacks in the air and recovers it (36)
      A.at(bt(33.4), t => A.boneRattle({ t, pan: P.door, count: 8, vel: 0.5 }));
      A.at(bt(34), t => A.pop({ t, pan: P.door, vel: 0.8, pitch: 1.25 }));
      A.at(bt(34.3), t => A.boneRattle({ t, pan: P.door, count: 18, vel: 0.38 }));
      A.at(bt(36), t => { A.pop({ t, pan: P.door, vel: 0.7, pitch: 0.75 }); A.boneRattle({ t: t + 0.02, pan: P.door, count: 10, vel: 0.6 }); });
      // turn in the final bar and the "ta-dah!" jump
      A.at(bt(52), t => A.whoosh({ t, dur: bt(2), pan: [P.door - 0.25, P.door + 0.25], vel: 0.35 }));

      // ---------- bats (11.5-22.8 s): enter from the left, circle the moon, turn on the right wing and leave ----------
      A.at(11.5, t => A.bats({ t, dur: 3.3, count: 3, pan: [-0.95, P.gx(0.35)], vel: 0.45 }));
      A.at(14.9, t => A.bats({ t, dur: 4.4, count: 3, pan: [P.gx(0.25), P.gx(0.75)], vel: 0.4 }));
      A.at(19.4, t => A.bats({ t, dur: 3.4, count: 3, pan: [0.5, 0.95], vel: 0.45 }));

      // ---------- witch ----------
      // pass 1: rises from the left to the moon (14-18), waves with a cackle, dives right (21.5-26)
      A.at(bt(14), t => A.broomFlyby({ t, dur: bt(4.2), pan: [P.gx(-0.12), P.gx(0.48)], vel: 0.8 }));
      A.at(bt(18.6), t => A.cackle({ t, pan: P.gx(0.5), vel: 0.75, count: 8 }));
      A.at(bt(21.5), t => A.broomFlyby({ t, dur: bt(4.5), pan: [P.gx(0.6), P.gx(0.98)], vel: 0.85 }));
      // pass 2: enters from the right (45.5-50) and circles the moon until the hit
      A.at(bt(45.5), t => A.broomFlyby({ t, dur: bt(4.5), pan: [P.gx(1.38), P.gx(0.68)], vel: 0.8 }));
      A.at(bt(50.5), t => A.whoosh({ t, dur: bt(2), pan: [P.gx(0.68), P.gx(0.32)], vel: 0.3 }));
      A.at(bt(53), t => A.whoosh({ t, dur: bt(2), pan: [P.gx(0.32), P.gx(0.68)], vel: 0.3 }));

      // ---------- final hit (beat 56 = 30 s): A major of "ta-dah!" ----------
      A.at(HIT_T, t => {
        A.impactHit({ t, vel: 0.75, metal: 0.6, braam: 0.5 });
        A.kick(t, { vel: 1 });
        crash(t, 1);
        A.stab(t, [57, 61, 64, 69], { vel: 0.7, dur: 0.5 });
        A.bass(t, 45, 0.9, { vel: 0.7 });
        A.choirSting({ t, notes: [45, 52, 57, 61, 64, 69, 73], dur: 0.8, vel: 0.8 });
        // the pumpkins' shout with happy eyes
        A.choir(t, [64, 69, 73], 0.75, { vowel: 'a', attack: 0.02, release: 0.4, vel: 0.5 });
        // the flock bursts out of the moon toward the audience
        A.bats({ t: t + 0.05, dur: 2.3, count: 4, pan: [P.gx(0.5) - 0.2, P.gx(0.5) + 0.2], vel: 0.5 });
        A.sparkle({ t: t + 0.1, dur: 1.6, vel: 0.6 });
      }, 'golpe');
      A.at(HIT_T + bt(0.5), t => A.cackle({ t, pan: P.gx(0.31), vel: 0.7, count: 7 }));
      // curtain and bow: the witch leaves to the left, farewell jingle
      A.at(HIT_T + bt(3), t => A.broomFlyby({ t, dur: bt(1.8), pan: [P.gx(0.31), P.gx(-0.2)], vel: 0.6 }));
      A.at(HIT_T + 2.2, t => { A.musicBox(t, 81, { vel: 0.35, decay: 0.5, pan: P.call }); A.musicBox(t + 0.14, 88, { vel: 0.35, decay: 0.5, pan: P.resp }); });
    },
  };
})());
