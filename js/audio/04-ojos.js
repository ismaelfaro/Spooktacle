// Score: Eyes — the house wakes up. Heartbeat and breath come out of the mouth (door); each eye that opens
// adds a voice to the choir; moth with theremin; NOM!; rise with the accelerating heartbeat; ROAR; third eye on the
// pediment; sweep of whispers with the gaze; lullaby as it falls asleep; burp and exit. The moth's sounds
// (screen position) are triggered by the scene.
(() => {
  // script: the same timings as js/scenes/04-ojos.js
  const K = { moth: 5.4, lure: 13.4, chomp: 15.15, gulp: 16.3, roar: 18.6, roarEnd: 21.0, third: 22.0, squint: 24.9, burp: 27.6 };
  const sg = (t, a, b) => Math.max(0, Math.min(1, (t - a) / (b - a)));
  const ln = (a, b, u) => a + (b - a) * u;
  const sm = (a, b, x) => { const u = sg(x, a, b); return u * u * (3 - 2 * u); };
  // heartbeat: same formula as the visual pulse (veins, skin, eyes)
  const bpm = t => t < 5 ? 50 : t < K.gulp ? ln(50, 64, sg(t, 5, 9)) : t < K.roar - 0.35 ? ln(70, 132, sg(t, K.gulp, K.roar - 0.35) ** 3) : t < K.roarEnd + 0.6 ? 0 : ln(66, 40, sg(t, K.roarEnd + 0.6, 27));
  const BEATS = [];
  for (let t = 0.6; t < 27.4;) { const b = bpm(t); if (b > 0) { BEATS.push(t); t += 60 / b; } else t += 0.05; }
  // house life (same as F.life): the heartbeat fades in and out with it
  const life = t => sm(0.5, 2.6, t) * (1 - 0.8 * sm(26.2, 28.8, t));

  // pan of the windows in waking order (from the mouth outward); without mapping, default spread
  function eyes(A) {
    const zs = A.S?.screenZones || [], d = zs.find(z => z.kind === 'door'), w = zs.filter(z => z.kind === 'window');
    if (!w.length) return [-0.2, 0.25, -0.55, 0.6];
    const M = d ? [d.cx, d.y0 + (d.y1 - d.y0) * 0.57] : [innerWidth / 2, innerHeight * 0.6];
    return w.sort((a, b) => Math.hypot(a.cx - M[0], a.cy - M[1]) - Math.hypot(b.cx - M[0], b.cy - M[1])).map(z => A.panX(z.cx));
  }

  registerScore('Eyes', {
    beds: { drone: 0.25, night: 0.15 },
    tick(A, S) {
      const P = A.zonePan('door') * 0.8, R = A.zonePan('roof') * 0.8, W = eyes(A), n = W.length;

      // ---- heartbeat from the mouth, at the tempo of the visual pulse (echo at 0.24 s like the envelope) ----
      BEATS.forEach((b, i) => A.at(b, t => {
        const v = (0.62 + 0.38 * sg(b, K.gulp, K.roar)) * (0.35 + 0.65 * life(b)) * (b > K.roarEnd ? 0.85 : 1);
        A.heartbeat({ t, vel: v, gap: 0.24, pan: P });
        // tension bass: low tom doubling each beat while it speeds up
        if (b > K.gulp) A.tom(t, 38, { vel: 0.25 + 0.35 * sg(b, K.gulp, K.roar), pan: P });
      }, 'hb' + i));

      // ---- drone: the house breathes low ----
      A.at(0.2, t => A.drone(t, 38, 17.6, { vel: 0.32, attack: 3, cutoff: 260 }));

      // ---- breath from the mouth (cos 3.4 s: opens = exhales with mist, closes = inhales) ----
      for (const [ts, ph, d, v] of [[1.75, 'in', 1.1, 0.22], [3.4, 'out', 1.5, 0.4], [5.1, 'in', 1.2, 0.32], [6.8, 'out', 1.5, 0.42], [8.5, 'in', 1.2, 0.32], [10.2, 'out', 1.5, 0.42], [11.9, 'in', 1.2, 0.3],
        // after the roar: recovers its breath (2.3 s) and drifts to sleep
        [22.0, 'in', 0.9, 0.5], [23.0, 'out', 1.1, 0.45], [24.2, 'in', 1.0, 0.35], [25.3, 'out', 1.1, 0.3], [26.5, 'out', 1.3, 0.2]])
        A.at(ts, t => A.monsterBreath({ t, phase: ph, dur: d, vel: v * 0.75, pan: P }), 'br' + ts);

      // ---- the eyes wake one by one: wet eyelid, celesta note and one more voice in the choir ----
      const WAKE = [62, 65, 69, 74], VOX = [50, 57, 62, 65];
      for (let r = 0; r < Math.min(n, 6); r++) {
        const t0 = 2.3 + r * 0.55, p = W[r];
        A.at(t0, t => A.slime({ t, vel: 0.16, dur: 0.25, pan: p }), 'lid' + r);
        A.at(t0 + 0.9, t => {
          A.celesta(t, WAKE[r % 4] + 12 * Math.floor(r / 4), { vel: 0.5, pan: p });
          // the choir holds until the mouth fully opens and cuts dead silent before the bite
          A.choir(t, [VOX[r % 4]], K.chomp - 0.25 - (t0 + 0.9), { vowel: 'o', vowel2: 'a', vel: 0.17, attack: 0.5, release: 0.25, pan: p * 0.7 });
        }, 'eye' + r);
      }

      // ---- moth: theremin fluttering (the eyes follow it); lands on the eyelid at 9.9 s ----
      A.at(K.moth + 0.2, t => A.theremin(t, [[0, 69], [0.9, 72], [1.6, 70], [2.5, 74], [3.3, 72], [4.3, 77], [5.2, 77], [5.9, 74], [7.0, 72], [8.0, 70], [9.4, 69]], { vel: 0.26, glide: 0.35, vibrato: 30 }));
      // tiptoe pizzicato off-beat to the heartbeat
      const PZ = [50, 53, 57, 56];
      BEATS.forEach((b, i) => { if (b > K.moth && b < K.lure - 0.4) A.at(b + 30 / bpm(b), t => A.pluck(t, PZ[i % 4], { vel: 0.32, pan: (i % 2 ? 0.3 : -0.3) }), 'pz' + i); });

      // ---- the mouth lures the moth: seductive shimmer and a puff before closing ----
      A.at(K.lure, t => A.ghostShimmer({ t, note: 62, dur: 1.5, attack: 1.2, release: 0.3, vel: 0.8, pan: P }));
      A.at(K.chomp - 0.33, t => A.monsterBreath({ t, phase: 'in', dur: 0.3, vel: 0.55, pan: P }));

      // ---- NOM! dry close, chews twice and swallows ----
      A.at(K.chomp - 0.01, t => { A.impactHit({ t, vel: 0.75, pitch: 1.4, metal: 0.2, braam: 0.45, pan: P }); A.tom(t, 43, { vel: 0.7, pan: P }); });
      A.at(K.chomp + 0.38, t => A.slime({ t, vel: 0.45, dur: 0.35, pan: P }), 'chew1');
      A.at(K.chomp + 0.83, t => A.slime({ t, vel: 0.4, dur: 0.3, pan: P }), 'chew2');
      A.at(K.gulp - 0.08, t => A.bubble({ t, count: 2, vel: 0.75, pitch: 0.45, pan: P }));

      // ---- light runs through the veins: rise, string tremolo and reversed cymbal up to the roar ----
      A.at(K.gulp + 0.25, t => A.riser({ t, dur: K.roar - K.gulp - 0.3, vel: 0.42, pan: P }));
      A.at(K.gulp + 0.1, t => A.strings(t, [50, 51, 56, 62], K.roar - 0.4 - (K.gulp + 0.1), { trem: 13, attack: 1.6, release: 0.08, vel: 0.55 }));
      A.at(K.roar - 1.05, t => A.reverseSwell({ t, dur: 1.03, vel: 0.45, pan: P }));
      // the mouth flattens and takes in air: half a second of tense silence
      A.at(K.roar - 0.4, t => A.monsterBreath({ t, phase: 'in', dur: 0.32, vel: 0.65, pan: P }));

      // ---- ROAR: mouth open, house shaking, horrified choir ----
      A.at(K.roar - 0.04, t => {
        A.roar({ t, vel: 1, dur: 2.7, pan: P });
        A.impactHit({ t: t + 0.03, vel: 0.7, pitch: 0.8, metal: 0.35, pan: P });
        A.choirSting({ t: t + 0.05, notes: [50, 56, 62, 65, 68, 74], dur: 1.4, vel: 0.75 });
        A.rumble({ t, dur: 2.5, vel: 0.5, pan: P });
        A.timpani(t + 0.04, 38, { vel: 0.6, roll: 1.4, decay: 1.6 });
      });
      A.at(K.roar, () => A.bed('drone', 0.6, 0.3), 'bedUp');
      A.at(K.roarEnd + 0.3, () => A.bed('drone', 0.22, 1.5), 'bedDown');

      // ---- after the roar: low choir hum and drone fading out ----
      A.at(K.roarEnd + 0.6, t => A.choir(t, [50, 53, 57], 4.4, { vowel: 'u', vel: 0.22, attack: 1.5, release: 1.6 }));
      A.at(K.roarEnd + 0.4, t => A.drone(t, 38, 5.2, { vel: 0.4, attack: 2, cutoff: 240 }));

      // ---- third eye on the pediment: flesh swells and opens ----
      A.at(K.third + 0.1, t => A.ghostShimmer({ t, note: 74, dur: 2.4, attack: 0.8, release: 1.5, vel: 0.75, pan: R }));
      A.at(K.third + 0.85, t => A.bell(t, 62, { vel: 0.45, pan: R }));

      // ---- they look at the audience: sweep to the right and to the left (sin(3.9·t)) ----
      A.at(23.3, t => A.whisper({ t, dur: 0.75, count: 3, vel: 0.7, pan: [0.05, 0.75] }));
      A.at(24.0, t => A.whisper({ t, dur: 0.85, count: 3, vel: 0.7, pan: [0.6, -0.75] }));

      // ---- eyes half-close: suspicious "mmm..." ----
      A.at(K.squint, t => { A.pluck(t, 45, { vel: 0.5 }); A.pluck(t + 0.28, 44, { vel: 0.45 }); });

      // ---- they fall asleep (the farthest first): falling celesta lullaby, each note in its window ----
      const NANA = [74, 69, 65, 62, 57, 53];
      for (let r = 0; r < Math.min(n, 6); r++) {
        const c = 25.95 + (n - 1 - r) * 0.32 + 0.7;
        A.at(c, t => A.celesta(t, NANA[n - 1 - r], { vel: 0.38, decay: 1.2, pan: W[r] }), 'nana' + r);
      }
      A.at(27.25, t => A.celesta(t, 50, { vel: 0.3, decay: 1.0, pan: R }), 'nanaR');

      // ---- burp: the mouth spits out the moth, which flies home ----
      A.at(K.burp, t => { A.pop({ t, vel: 0.75, pitch: 0.55, pan: P }); A.monsterBreath({ t: t + 0.02, phase: 'out', dur: 0.5, vel: 0.5, pan: P }); });
      [[0.45, 62], [0.75, 65], [1.05, 69], [1.4, 74]].forEach(([d, m], i) => A.at(K.burp + d, t => A.celesta(t, m + 12, { vel: 0.28, decay: 0.8, pan: ln(P, R, i / 3) }), 'esc' + i));
      // fade: everything goes silent before the last second
      A.at(27.8, () => { A.bed('drone', 0, 0.5); A.bed('night', 0, 0.6); }, 'fin');
    },
  });
})();
