// Score: Happy Halloween — triumphant finale (organ, choir, bells) in A minor → A major.
// Hit per letter, drool on the drips, pop per pumpkin, firecracker, the ghost's flight, big burst,
// farewell laugh and a soft fade toward the night (scene 1 starts in silence with night and bells).
// Script copied from js/scenes/08-happy-halloween.js (same seconds).
(() => {
  const L1 = 3.3, L1S = 0.22, L2 = 4.8, L2S = 0.17, LIGHT0 = 1.7, LIGHTS = 1.6;
  const GHOST = 7.2, BOOM = 9.8, FLY0 = 13.7, LAND = 13.7 + 2.75, BYE = 18.7, PK_OFF = 19.2, TFADE = 20.4;
  // fireworks: [t, type, index, u] (u = horizontal position in its zone); the first 3 are the firecracker
  const FW = [[10.9, 'wall', 2, 0.8], [11.7, 'roof', 0, 0.5], [12.5, 'wall', 0, 0.3], [13.1, 'wall', 1, 0.12],
    [LAND + 0.15, 'wall', 0, 0.55], [LAND + 0.3, 'wall', 2, 0.72], [17.6, 'wall', 1, 0.86]];
  const WORD = 'HAPPYHALLOWEEN';
  const t0Of = ci => (ci < 5 ? L1 + ci * L1S : L2 + (ci - 5) * L2S);
  // chords (organ) and bass root
  const CH = {
    Am: [[57, 60, 64, 69], 45], F: [[53, 57, 60, 65], 41], Dm: [[50, 57, 62, 65], 38], E: [[52, 56, 59, 64], 40],
    A: [[57, 61, 64, 69], 45], D: [[50, 57, 62, 66], 38],
  };
  const big = l => l.reduce((a, b) => (!a || (b.x1 - b.x0) * (b.y1 - b.y0) > (a.x1 - a.x0) * (a.y1 - a.y0) ? b : a), null);

  // geometry for panning (house, letters, fireworks) from the screen zones
  function geo(A) {
    const S = A.S, zs = S.screenZones || [];
    if (A.state.g && A.state.g.src === zs) return A.state.g;
    const x0 = zs.length ? Math.min(...zs.map(q => q.x0)) : 0, x1 = zs.length ? Math.max(...zs.map(q => q.x1)) : 1920;
    const roof = big(zs.filter(q => q.kind === 'roof'));
    const wall = zs.find(q => q.id === S.textZoneId) || big(zs.filter(q => q.kind === 'wall'));
    const house = nx => A.panX(x0 + nx * (x1 - x0));
    const letter = ci => {
      if (ci < 5) return roof ? A.panX(roof.cx + (roof.x1 - roof.x0) * 0.32 * (ci / 4 - 0.5) * 2) : 0;
      if (!wall) return 0;
      const ww = wall.x1 - wall.x0;
      return A.panX(wall.x0 + ww * (0.545 + 0.84 * ((ci - 5) / 8 - 0.5)));
    };
    const fw = (kind, idx, u) => {
      const q = zs.find(z => z.kind === kind && z.index === idx) || big(zs.filter(z => z.kind === kind));
      return q ? A.panX(q.x0 + (q.x1 - q.x0) * u) : 0;
    };
    const door = big(zs.filter(q => q.kind === 'door'));
    const g = { src: zs, house, letter, fw, door: door ? A.panX(door.cx) : 0 };
    // drool drops: same calculation as drawDrips (they let go at cyc = 0.85 and squash a bit later)
    const drops = [];
    if (typeof _dripsOf === 'function') [...WORD].forEach((ch, ci) => {
      const t0 = t0Of(ci), fade = TFADE + ci * 0.13, land = ci < 5 ? 0.1 : 0.2;
      for (const [, lr, per, ph] of _dripsOf(ch, 11 + ci)) for (let k = 0; k < 12; k++) {
        const lt = (k + 0.85 - ph) * per, t = t0 + lt + land;
        if (lt < 0) continue;
        if (t > fade) break;
        if ((0.06 + 0.38 * lr) * smooth(0.45, 3.6, lt) > 0.08) drops.push([t, ci]);
      }
    });
    drops.sort((a, b) => a[0] - b[0]);
    // only the ones you can hear: outside the firecracker and final burst, and no more than one every 0.45 s
    let last = -9;
    g.drops = drops.filter(([t]) => {
      const loud = (t > BOOM - 0.2 && t < 13.3) || (t > LAND - 0.2 && t < BYE + 0.1);
      if (loud || t - last < 0.45) return false;
      last = t; return true;
    });
    return (A.state.g = g);
  }

  registerScore('Happy Halloween', {
    beds: {},
    tick(A, S) {
      const G = geo(A), chord = (t, name, dur, o = {}) => A.organ(t, CH[name][0], dur, o);

      // ---- 0–3.3: the neon draws the house, pumpkins fall and light up ----
      A.at(0.15, t => A.staticCrackle({ t, dur: 1.5, vel: 0.15 }));
      A.at(0.1, t => A.drone(t, 45, 3.2, { vel: 0.32, attack: 1.4, cutoff: 380 }));
      A.at(0.4, t => A.organ(t, [45, 52, 57, 60, 64], 2.8, { vel: 0.28, release: 1 }));
      // cascade left → right: dull thud on landing (+0.42) and pop + note on lighting (+0.6)
      const PK = 7, ARP = [57, 60, 64, 69, 72, 76, 81];
      for (let i = 0; i < PK; i++) {
        const nx = (i + 0.5) / PK, on = LIGHT0 + LIGHTS * nx, p = G.house(nx);
        A.at(on + 0.42, t => A.tom(t, 43 + i, { vel: 0.22, pan: p }), 'pkT' + i);
        A.at(on + 0.6, t => { A.pop({ t, vel: 0.55, pitch: 0.8 + i * 0.07, pan: p }); A.celesta(t, ARP[i], { vel: 0.45, pan: p }); }, 'pkP' + i);
      }

      // ---- 3.3–6.2: the title, one hit per letter ----
      A.at(L1 - 0.1, t => A.sparkle({ t, vel: 0.45 }));
      A.at(L1 - 0.9, t => A.reverseSwell({ t, dur: 0.9, vel: 0.35 }));
      const HAPPY = [69, 72, 76, 79, 81], HALLO = [76, 74, 72, 71, 72, 74, 76, 80, 81];
      for (let ci = 0; ci < WORD.length; ci++) {
        const p = G.letter(ci), first = ci === 0 || ci === 5;
        A.at(t0Of(ci), t => {
          if (ci < 5) {
            A.tubular(t, HAPPY[ci], { vel: 0.5, pan: p, decay: 3 });
            A.timpani(t, ci % 2 ? 52 : 45, { vel: first ? 0.75 : 0.45, decay: 1.2 });
            if (ci === 4) A.stab(t, CH.Am[0], { vel: 0.45, dur: 0.3 });
          } else {
            A.tubular(t, HALLO[ci - 5], { vel: 0.38, pan: p, decay: 2.2 });
            A.pluck(t, HALLO[ci - 5] - 12, { vel: 0.4, pan: p });
            if (first) A.timpani(t, 45, { vel: 0.5, roll: L2S * 8, decay: 1 });
          }
        }, 'L' + ci);
      }
      // full HALLOWEEN: big hit with choir and full organ
      const TT = L2 + 8 * L2S;
      A.at(TT, t => {
        A.impactHit({ t, vel: 0.7, dur: 1.6 });
        A.choirSting({ t, notes: [57, 64, 69, 72, 76], dur: 1.1, vel: 0.6 });
        A.organ(t, [45, 57, 64, 69, 72, 76], 1.6, { vel: 0.5, release: 0.8 });
        A.bass(t, 45, 1.5, { vel: 0.5 });
      }, 'title');

      // ---- 6.6–9.8: theme (the ghosts rise at 7.2) and build-up to the firecracker ----
      const TH = [69, 72, 76, 77, 76, 72, 69, 68];
      A.steps('theme', 0.5, (i, t) => {
        if (i < 4) A.bass(t, 45, 0.35, { vel: 0.4 });
        A.kick(t, { vel: 0.22 });
        A.musicBox(t, TH[i] + 12, { vel: 0.35, decay: 1.4 });
        if (i % 2) A.hat(t, { vel: 0.18 });
      }, 6.6, 8.6);
      A.at(6.6, t => chord(t, 'Am', 1.9, { vel: 0.24 }));
      A.at(GHOST + 0.3, t => A.giggle({ t, vel: 0.45, pan: -0.3 }));
      A.at(GHOST + 0.9, t => A.giggle({ t, vel: 0.35, pan: 0.4, pitch: 470 }));
      A.at(8.6, t => {
        A.strings(t, CH.E[0], 1.2, { vel: 0.45, trem: true, attack: 0.6, release: 0.3 });
        A.riser({ t, dur: 1.2, vel: 0.5 });
        A.timpani(t, 40, { vel: 0.55, roll: 1.1, decay: 0.8 });
      });

      // ---- 9.8–13.3: firecracker, bats and fireworks (120 ppm) ----
      A.at(BOOM, t => {
        A.boom({ t, vel: 0.8 });
        A.impactHit({ t, vel: 0.6 });
        A.bats({ t, vel: 0.6, dur: 2.5, count: 4 });
        A.choir(t, [57, 64, 69, 72], 1.6, { vel: 0.45, attack: 0.05, release: 1, vowel: 'a' });
        A.sparkle({ t: t + 0.12, vel: 0.35 });
      });
      const PROG1 = ['Am', 'Am', 'F', 'F', 'Dm', 'E', 'E'], MEL1 = [76, 72, 77, 72, 74, 71, 68];
      A.steps('fw', 0.25, (i, t) => {
        const b = i >> 1, c = PROG1[b];
        if (i % 2 === 0) {
          A.kick(t, { vel: b === 0 ? 0.8 : 0.6 });
          A.bass(t, CH[c][1], 0.4, { vel: 0.5 });
          A.tubular(t, MEL1[b], { vel: 0.4, decay: 2 });
          if (b === 0 || PROG1[b - 1] !== c) chord(t, c, b === 4 ? 0.4 : 0.9, { vel: 0.38 });
        } else A.hat(t, { vel: 0.22 });
        if (i % 4 === 2) A.snare(t, { vel: 0.45 });
        A.pluck(t, CH[c][0][i % 4] + 12, { vel: 0.25 });
      }, BOOM, 13.3);
      // rocket (short whistle) and burst of each firework, panned where it explodes
      FW.forEach(([tb, kind, idx, u], k) => {
        const p = G.fw(kind, idx, u), loud = tb > LAND;
        A.at(tb - 0.7, t => A.whoosh({ t, dur: 0.7, vel: 0.18, pitch: 1.6, pan: p }), 'fwR' + k);
        A.at(tb, t => { A.boom({ t, vel: loud ? 0.55 : 0.4, pan: p, dur: 1.4 }); A.sparkle({ t: t + 0.1, vel: 0.25, pan: p }); }, 'fwB' + k);
      });

      // ---- 13.3–16.45: the ghost flies out, loops around the gable and enters through the door ----
      A.at(13.3, t => A.choir(t, [57, 64, 69], 3, { vel: 0.3, attack: 0.6, release: 0.8, vowel: 'o', vowel2: 'u' }));
      A.steps('fly', 0.5, (i, t) => A.pluck(t, [45, 52, 45, 52, 48, 52][i % 6], { vel: 0.28 }), 13.3, 16.3);
      A.at(FLY0, t => {
        A.ghostShimmer({ t, vel: 0.5, dur: 2.4, release: 1 });
        A.theremin(t, [[0, 69], [0.7, 72], [1.4, 76], [2.1, 75], [2.6, 76]], { vel: 0.42 });
        A.whoosh({ t, dur: 1.1, vel: 0.3, pan: [-0.5, 0.5] });
      });
      A.at(FLY0 + 0.05, t => A.celesta(t, 81, { vel: 0.35 }), 'hop1');
      A.at(15.0, t => A.celesta(t, 84, { vel: 0.35 }), 'hop2');
      A.at(LAND - 0.6, t => A.whoosh({ t, dur: 0.7, vel: 0.3, pan: [0.5, G.door] }));
      A.at(LAND - 1.2, t => A.reverseSwell({ t, dur: 1.2, vel: 0.55 }));

      // ---- 16.45–18.7: big final burst in A major ----
      A.at(LAND, t => {
        A.impactHit({ t, vel: 1, dur: 1.8, pan: G.door * 0.5 });
        A.boom({ t, vel: 0.7, pan: G.door });
        A.choirSting({ t, notes: [57, 61, 64, 69, 73, 76], dur: 1.4, vel: 0.75 });
        A.sparkle({ t: t + 0.05, vel: 0.5 });
      });
      const PROG2 = ['A', 'A', 'D', 'E', 'A'], MEL2 = [81, 76, 78, 80, 81];
      A.steps('fin', 0.25, (i, t) => {
        const b = i >> 1, c = PROG2[Math.min(4, b)];
        if (i % 2 === 0 && b < 5) {
          A.kick(t, { vel: b ? 0.65 : 0.85 });
          A.bass(t, CH[c][1], 0.4, { vel: 0.55 });
          A.tubular(t, MEL2[b], { vel: 0.5, decay: b === 4 ? 4 : 2 });
          if (b === 0 || PROG2[b - 1] !== c) chord(t, c, b === 4 ? 1.4 : b === 0 ? 0.9 : 0.4, { vel: 0.42, release: b === 4 ? 1.4 : 0.5 });
        } else if (b < 4) A.hat(t, { vel: 0.22 });
        if (i % 4 === 2 && b < 4) A.snare(t, { vel: 0.5 });
        if (b < 4) A.pluck(t, CH[c][0][i % 4] + 12, { vel: 0.25 });
      }, LAND, LAND + 2.3);
      A.at(LAND + 2.0, t => A.timpani(t, 45, { vel: 0.7, roll: 0.25, decay: 1.6 }));
      A.at(17.0, t => A.sparkle({ t, vel: 0.35, pan: -0.6 }), 'sweep');
      A.at(17.4, t => A.sparkle({ t, vel: 0.3, pan: 0.6 }), 'sweep2');

      // ---- 18.7–20.4: farewell (ghosts and bats leave) and final laugh ----
      A.at(BYE, t => { A.ghostShimmer({ t, vel: 0.4, dur: 2, release: 1.5 }); A.bats({ t: t + 0.1, vel: 0.35, dur: 1.6, count: 2 }); });
      A.at(BYE + 0.35, t => A.laugh({ t, vel: 0.75, count: 4 }));
      A.at(BYE + 1.1, t => A.cackle({ t, vel: 0.4, pan: 0.55, count: 6 }));
      // the pumpkins go out left → right: pops that fall
      for (let i = 0; i < 5; i++) {
        const nx = (i + 0.5) / 5;
        A.at(PK_OFF + 1.3 * nx + 0.1, t => A.pop({ t, vel: 0.22, pitch: 0.75 - i * 0.06, pan: G.house(nx) }), 'pkO' + i);
      }
      // resolution: music-box lullaby and final chord that fades toward the night
      const BYE_M = [[19.8, 76], [20.3, 72], [20.8, 71], [21.3, 69]];
      for (const [tt, m] of BYE_M) A.at(tt, t => A.musicBox(t, m + 12, { vel: 0.3, decay: 1.6 }), 'bm' + tt);
      A.at(19.7, t => A.choir(t, [57, 64, 69], 1.6, { vel: 0.25, attack: 0.8, release: 1.3, vowel: 'u' }));
      A.at(20.6, t => A.organ(t, [45, 52, 57, 60, 64], 1.0, { vel: 0.22, release: 0.9, cutoff: 2000 }));
      A.at(20.0, t => { A.bed('night', 0.4, 1.5); A.bed('crickets', 0.3, 2); }, 'night');
      // music goes silent before the last second
      A.at(22.2, t => A.out.gain.setTargetAtTime(0, t, 0.3), 'fade');

      // ---- drool: splat on the drops that are heard ----
      for (const [tt, ci] of G.drops) A.at(tt, t => A.slime({ t, dur: 0.28, vel: tt < 9 ? 0.4 : 0.3, pan: G.letter(ci) }), 'd' + tt.toFixed(3) + ci);
    },
  });
})();
