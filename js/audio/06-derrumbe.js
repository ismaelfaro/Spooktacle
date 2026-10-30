// Score: Collapse (29 s, D minor) — the wall breathes, cracks, collapses onto the fire and is rebuilt.
// The scene triggers what's tied to each zone: sweep, heartbeats, crack per wall, glass per window, collapse per wall,
// roar, rewind, final blow and flashes. Here: music, ambiences, rise and generic debris.
registerScore('Collapse', {
  beds: { drone: 0.35 },
  tick(A, S) {
    const r = k => Math.sin(k * 12.9898) * 0.5 + 0.5;   // fixed randomness per index
    // 0.3–8.8 the wall builds and breathes
    A.at(0.3, t => { A.drone(t, 26, 13, { vel: 0.45, attack: 3, cutoff: 220 }); A.pad(t, [38, 45, 50], 8.5, { vel: 0.3, attack: 2.5, cutoff: 600, sweep: 1300 }); });
    [3.8, 5.2, 6.4, 7.4, 8.2, 8.9].forEach((tb, k) => A.at(tb, t => A.timpani(t, 38, { vel: 0.22 + k * 0.07, decay: 1.3 }), 'lat' + k));
    A.at(5.2, t => A.strings(t, [50, 53, 57], 3.8, { vel: 0.22, attack: 2.2, trem: 9, cutoff: 3000 }));
    // 8.8–13.6 cracks with lava: growing tension
    A.at(8.8, t => {
      A.bed('drone', 0.6, 2.5);
      A.strings(t, [50, 53, 56, 62], 4.4, { vel: 0.38, attack: 3.5, trem: true, release: 0.4 });
      A.choir(t, [38, 45], 4.4, { vel: 0.3, attack: 3, vowel: 'o', release: 0.5 });
    });
    const crk = (i, t, v) => i % 3 === 2 ? A.staticCrackle({ t, dur: 0.35, vel: v * 0.6, pan: r(i) * 1.6 - 0.8 })
      : A.floorboard({ t, pitch: 0.5 + r(i + 7) * 0.2, dur: 0.3, vel: v, pan: r(i) * 1.6 - 0.8 });
    A.steps('crkA', 0.8, (i, t) => crk(i, t, 0.45), 9.2, 11.2);
    A.steps('crkB', 0.4, (i, t) => crk(i + 11, t, 0.45), 11.2, 12.6);
    A.steps('crkC', 0.2, (i, t) => crk(i + 23, t, 0.45), 12.6, 13.45);
    A.at(10, t => A.riser({ t, dur: 3.6, vel: 0.6 }));
    A.at(11.6, t => A.timpani(t, 38, { vel: 0.4, roll: 2, decay: 0.6 }));
    A.at(12.1, t => A.reverseSwell({ t, dur: 1.5, vel: 0.7 }));
    // 13.6 collapse: the strongest hit, debris keeps falling to both sides
    A.at(13.6, t => {
      A.impactHit({ t, vel: 1, braam: 1 });
      A.boom({ t, vel: 0.9, pitch: 0.7, dur: 2.5 });
      A.choirSting({ t, notes: [38, 50, 53, 57, 62], dur: 1.2, vel: 0.8 });
      A.bed('drone', 0.3, 1.5); A.bed('fire', 0.65, 0.6);
    });
    [[0.5, -0.7, 0.6], [1.7, 0.75, 0.55], [2.6, -0.3, 0.45]].forEach(([d, p, v], k) => A.at(13.6 + d, t => A.crash({ t, pan: p, vel: v, dur: 2 }), 'esc' + k));
    A.at(14.2, t => A.fireUp({ t, vel: 0.9 }));
    // 13.6–21.2 fire abyss: ostinato at 100 ppm
    const OST = [38, 38, 50, 38, 38, 48, 38, 46], q = 0.3;
    A.steps('ost', q, (i, t) => {
      const fade = 0.75;
      A.bass(t, OST[i % 8], q * 0.8, { vel: 0.5 * fade });
      if (i % 4 === 0) A.timpani(t, i % 8 ? 45 : 38, { vel: 0.45 * fade, decay: 1 });
    }, 14.2, 21.0);
    A.at(14.2, t => { A.strings(t, [50, 53, 57, 62], 3.4, { vel: 0.34, attack: 0.6 }); A.choir(t, [38, 45, 50], 6.8, { vel: 0.35, attack: 1.5, vowel: 'a' }); });
    A.at(17.6, t => A.strings(t, [46, 50, 53, 58], 3.4, { vel: 0.34, attack: 0.6 }));
    A.at(17.4, t => A.drone(t, 26, 3.4, { vel: 0.5, attack: 0.8, cutoff: 400 }));   // the eyes
    A.at(20.25, t => A.timpani(t, 41, { vel: 0.35, decay: 0.8 }));                  // blink
    // 21.2–25.15 magic rewind
    A.at(21.0, t => { A.bed('fire', 0.12, 1.2); A.bed('drone', 0.25, 2); });
    A.at(21.2, t => {
      A.pad(t, [50, 57, 62, 66], 4, { vel: 0.35, attack: 1.5, cutoff: 900, sweep: 3200 });
      A.ghostShimmer({ t: t + 0.2, note: 74, dur: 3.6, vel: 0.3 });
    });
    const ARP = [62, 66, 69, 73, 74, 78, 81, 85];
    A.steps('arp', 0.22, (i, t) => A.celesta(t, ARP[i % 8] - (i < 8 ? 12 : 0), { vel: 0.18 + Math.min(i, 12) * 0.008 }), 21.3, 24.9);
    // 25.15 last brick: chord that resolves
    A.at(25.15, t => {
      A.timpani(t, 38, { vel: 0.6, decay: 2 });
      A.tubular(t, 62, { vel: 0.4, decay: 3 });
      A.choir(t, [50, 57, 62, 66], 1.6, { vel: 0.35, attack: 0.15, release: 0.8 });
    });
    A.at(26.6, t => [86, 81, 78, 74].forEach((m, k) => A.celesta(t + k * 0.18, m, { vel: 0.25 })));
    // fade before the last second
    A.at(26.8, () => { A.bed('fire', 0, 0.4); A.bed('drone', 0, 0.4); });
    A.at(27.3, t => A.out.gain.setTargetAtTime(0, t, 0.25));
  },
});
