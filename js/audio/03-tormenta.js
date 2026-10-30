// Score: Storm (29 s) — rain and wind that follow the image, organ + choir in D minor,
// thunder glued to each flash (near ones arrive on the instant, distant ones a bit later and softer),
// crackling before the big bolts, climax at the pediment and fade before the end.
// Timings copied from js/scenes/03-tormenta.js (STRIKES, GUSTS, rainI); the scene no longer triggers sounds.
{
  const TB = 18.6, TDOOR = 23.6, TEND = 26.2;
  const GUSTS = [[6.2, 4.6], [14.8, 4.4], [23.9, 3.6]];
  const gustAt = t => GUSTS.reduce((g, [s, d]) => Math.max(g, pulse(t, s, s + d, d * 0.35)), 0);
  const rainI = t => clamp(0.3 + 0.4 * smooth(1.5, 9, t) + 0.3 * smooth(11, 16, t) - 0.35 * smooth(21, 25, t) - 0.4 * smooth(25.5, 28.3, t));
  // gap in the rain under each thunderclap: [flash, depth, duration]
  const DUCK = [[5, 0.25, 1.6], [9.4, 0.25, 1.6], [13.6, 0.4, 1.8], [TB, 0.6, 2.6], [TDOOR, 0.25, 1.8], [TEND, 0.2, 1.6]];
  const duck = t => DUCK.reduce((k, [s, a, d]) => k * (1 - a * pulse(t, s - 0.1, s + d, 0.25)), 1);
  const outro = t => 1 - smooth(26.6, 28.1, t);
  const rainL = t => (0.12 + 0.45 * rainI(t)) * duck(t) * outro(t);
  const windL = t => (0.1 + 0.35 * gustAt(t)) * outro(t);

  // aligned thunder: the near one starts with the flash; the distant one is advanced by the time its rumble takes
  // to build up (see thunder in sfx-weather) and arrives ~0.25·d s late
  const lead = d => 0.05 + 0.42 * d * d + 0.6 * (0.06 + 0.56 * d) + 0.06;
  const thAt = (flash, d) => (d < 0.3 ? flash : flash + 0.25 * d - lead(d));
  // [flash, distance, strength (vel: level scales with vel^0.4), pan [from, to], rumble duration]
  const THUNDER = [
    [1.9, 0.95, 0.04, [-0.35, 0.2], 3.2],    // cloud
    [3.2, 0.9, 0.05, [0.45, -0.1], 3.2],     // cloud
    [5.0, 0.6, 0.2, [0.8, -0.1], 4],         // distant right (hooded)
    [9.4, 0.55, 0.25, [-0.8, 0.15], 4],      // distant left (cat)
    [11.7, 0.85, 0.06, [0, 0.5], 3.2],       // cloud
    [13.6, 0.05, 0.9, [0.5, -0.45]],         // lightning on the right wing
    [16.3, 0.9, 0.05, [-0.55, 0], 2.6],      // cloud
    [17.2, 0.85, 0.07, [0.6, 0.1], 2.6],     // cloud
    [TB, 0, 1, [0, -0.7], 6],                // big bolt on the pediment
    [TDOOR, 0.6, 0.18, [-0.65, 0.4], 3],     // distant (someone at the door)
    [TEND, 0.9, 0.06, [0.1, 0.7], 2],        // moves away
  ];

  // chords (D minor)
  const Dm = [38, 45, 50, 53], Bb = [34, 46, 50, 53], Gm = [43, 50, 55, 58], AA = [45, 52, 57, 61];

  registerScore('Storm', {
    beds: { rain: 0.4, wind: 0.3 },
    tick(A, S) {
      // ambiences: follow the rain intensity and the image's gusts (every 0.1 s, slightly ahead)
      if (!(S.t < A.state.nb)) {
        A.state.nb = S.t + 0.1;
        const u = S.t + 0.15;
        A.bed('rain', rainL(u), 0.4);
        A.bed('wind', windL(u), 0.6);
      }
      // pan of a zone if one exists (in the lab there are no zones: default value)
      const zp = (k, i, f) => ((A.S.screenZones || []).some(z => z.kind === k && z.index === i) ? A.zonePan(k, i) : f);

      // thunder
      THUNDER.forEach(([f, d, vel, pan, dur], i) => A.at(thAt(f, d), t => A.thunder({ t, distance: d, vel, pan, dur }), 'th' + i));

      // gusts (cross from left to right like the rain sweep)
      A.at(0.4, t => A.windGust({ t, dur: 4, vel: 0.2, pan: [0.6, -0.4] }));
      GUSTS.forEach(([s, d], i) => A.at(s, t => A.windGust({ t, dur: d, vel: [0.3, 0.42, 0.28][i], pan: [-0.8, 0.8] }), 'g' + i));

      // --- the storm arrives: organ pedal and distant choir ---
      A.at(0.3, t => A.organ(t, Dm, 4.4, { vel: 0.2, cutoff: 1100 }));
      A.at(5.0, t => A.organ(t, Bb, 4.2, { vel: 0.28, cutoff: 1300 }), 'o5');
      A.at(5.0, t => A.choir(t, [58, 62, 65], 4, { vel: 0.22, vowel: 'u', pan: zp('window', 3, 0.6) * 0.4 }), 'c5');
      A.at(9.4, t => A.organ(t, Gm, 2.2, { vel: 0.3, cutoff: 1400 }), 'o9');
      A.at(9.4, t => A.choir(t, [55, 62, 67], 2.4, { vel: 0.26, vowel: 'o', pan: zp('window', 0, -0.6) * 0.4 }), 'c9');
      A.at(11.7, t => A.organ(t, AA, 1.8, { vel: 0.32, cutoff: 1500 }), 'o11');
      // cat silhouette: distant meow
      A.at(9.7, t => A.cat({ t, vel: 0.3, pan: zp('window', 0, -0.6) }));

      // --- near bolt (13.6): crackling for 0.8 s that bursts with the guide (13.3) ---
      A.at(12.5, t => A.staticCrackle({ t, dur: 0.8, vel: 0.6, pan: 0.5 }));
      A.at(13.6, t => { A.stab(t, [50, 53, 57, 62], { vel: 0.7 }); A.timpani(t, 38, { vel: 0.9 }); }, 'hit13');
      A.at(13.7, t => A.organ(t, Dm, 4.6, { vel: 0.3, cutoff: 1600 }), 'o13');

      // --- tension toward the big bolt ---
      A.at(14.2, t => A.strings(t, [50, 53, 56, 59], 4.2, { vel: 0.35, attack: 3, trem: true, release: 0.3 }));
      A.at(14.2, t => A.choir(t, [57, 62, 65], 4.2, { vel: 0.35, attack: 3, vowel: 'a', release: 0.4 }), 'c14');
      A.at(TB - 3.8, t => A.rumble({ t, dur: 3.8, vel: 0.7 }), 'rum');
      A.at(TB - 2, t => A.timpani(t, 38, { vel: 0.8, roll: 1.9 }), 'roll');
      // crackling: the final snap lands when the guide appears (TB - 0.5) and keeps crackling as it fades
      A.at(TB - 1.94, t => A.staticCrackle({ t, dur: 1.4, vel: 0.9, pan: 0 }), 'sc1');
      A.at(TB - 0.5, t => A.staticCrackle({ t, dur: 0.5, vel: 1, pan: 0, snap: false }), 'sc2');

      // --- climax: big bolt on the pediment ---
      A.at(TB, t => {
        A.crash({ t: t + 0.03, vel: 0.9, pan: 0 });
        A.impactHit({ t, vel: 0.8, metal: 0.4 });
        A.stab(t, [38, 50, 53, 57, 62], { vel: 1 });
        A.timpani(t, 38, { vel: 1, decay: 3 });
        A.tubular(t, 62, { vel: 0.45 });
      }, 'big');
      A.at(TB + 0.09, t => A.choirSting({ t, vel: 0.8, vowel: 'o', dur: 1 }), 'sting');
      A.at(TB + 0.1, t => A.organ(t, [38, 45, 50, 53, 57, 62], 4.3, { vel: 0.55, cutoff: 3000 }), 'oTB');
      A.at(TB + 0.3, t => A.choir(t, [62, 65, 69], 3.8, { vel: 0.5, attack: 0.6, vowel: 'o', vowel2: 'u' }), 'cTB');
      // sparks and embers on the pediment
      A.at(TB + 0.3, t => { A.staticCrackle({ t, dur: 2.2, vel: 0.4, pan: 0, snap: false }); A.bed('fire', 0.25, 0.3); }, 'emb');
      A.at(TB + 3.2, () => A.bed('fire', 0, 1.2), 'embOff');

      // --- eyes in the dark: drone and sneaky celesta ---
      A.at(TB + 2.4, t => A.drone(t, 38, 3.5, { vel: 0.4, attack: 1.5 }), 'dr');
      [[0, 74], [0.45, 69], [0.9, 70], [1.35, 69], [2.2, 74], [2.65, 77], [3.1, 76]].forEach(([dt, m], i) =>
        A.at(TB + 2.6 + dt, t => A.celesta(t, m, { vel: 0.28, pan: Math.sin(i * 1.7) * 0.5 }), 'cel' + i));

      // --- someone at the door ---
      A.at(TDOOR, t => A.organ(t, AA, 2.4, { vel: 0.34, cutoff: 1600 }), 'oD');
      A.at(TDOOR, t => A.choir(t, [57, 61, 64], 2.4, { vel: 0.3, vowel: 'u' }), 'cD');
      A.at(TDOOR + 0.2, t => A.creak({ t, dur: 1.6, pan: zp('door', 0, -0.1) }), 'door');

      // --- the storm moves away: last chord and fade (everything goes silent before 28.2 s) ---
      A.at(TEND, t => A.organ(t, Dm, 1.3, { vel: 0.24, cutoff: 1100, release: 0.4 }), 'oE');
      A.at(TEND, t => A.choir(t, [50, 57, 62], 1.2, { vel: 0.22, vowel: 'u', attack: 0.4, release: 0.5 }), 'cE');
      A.at(27.4, t => A.out.gain.setTargetAtTime(0, t, 0.25), 'fade');
    },
  });
}
