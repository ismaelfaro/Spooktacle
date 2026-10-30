// Scene: Pumpkin party. A concert synced to the music (PARTY_BPM):
// moving spotlights, neons running along the real frames, pumpkins singing a duet,
// a skeleton dancing at the door, a flock of bats and the witch crossing the moon.
// Beats: intro 0-8 · verse 8-24 · bridge 24-40 · rise 40-52 · final bar 52-56 · hit 56 and curtain.
registerScene((() => {
  const SPB = 60 / PARTY_BPM, STEP = SPB / 2;
  const HIT = 56, HIT_T = HIT * SPB;
  // melody from audio.js: the mouths sing the notes that play
  const LEAD = [69, 72, 76, 72, 69, 72, 76, 77, 76, 72, 69, 68, 69, 0, 64, 0];
  const WHITE = [255, 248, 235], MAG = [255, 40, 190], CYAN = [30, 215, 255], LIME = [140, 255, 60];
  const ORANGE = [255, 125, 20], PURPLE = [150, 60, 255], GOLD = [255, 195, 50];

  const fr = x => x - Math.floor(x);
  const easeOut = k => 1 - (1 - clamp(k)) ** 3;
  const easeIn = k => clamp(k) ** 3;
  const easeInOut = k => { k = clamp(k); return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2; };
  const backOut = k => easeBack(clamp(k));
  // damped spring 0 → 1 with bounce; k in seconds
  const spring = (k, f = 1.6, d = 6) => (k <= 0 ? 0 : 1 - Math.exp(-d * k) * Math.cos(f * TAU * k));
  const kickOf = (b, d = 6) => (b < 0 ? 0 : Math.exp(-fr(b) * d));
  const hop4 = f => 4 * f * (1 - f);
  const energy = b => 0.25 * (smooth(4, 8, b) + smooth(22, 24, b) + smooth(38, 40, b) + smooth(51, 52, b));
  // color pair for the moment: changes on the strong beats, like a lighting desk
  function colors(b) {
    if (b >= HIT) return [GOLD, ORANGE];
    if (b >= 52) return [[MAG, CYAN, LIME, GOLD][Math.floor(b - 52)], WHITE];
    if (b >= 40) return [[MAG, CYAN], [LIME, PURPLE], [ORANGE, CYAN], [CYAN, MAG]][Math.floor((b - 40) / 4) % 4];
    if (b >= 24) return Math.floor(b / 8) % 2 ? [CYAN, MAG] : [MAG, CYAN];
    return [PURPLE, ORANGE];
  }
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

  // ---------- cached sprites ----------
  let dotSp = null;
  function dotSprite() {
    if (dotSp) return dotSp;
    const c = mkCanvas(64, 64), g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.42, 'rgba(255,255,255,0.95)');
    gr.addColorStop(0.55, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return (dotSp = c);
  }
  // vector bat in 8 flapping phases (Path2D in wingspan units: sharp at 4K and cheap)
  const BAT_FR = 8;
  let batP = null;
  function batPaths() {
    if (batP) return batP;
    batP = [];
    for (let k = 0; k < BAT_FR; k++) {
      const f = Math.cos((k / BAT_FR) * TAU), wy = -f * 0.55, span = 1 - 0.18 * Math.max(0, -f), p = new Path2D();
      for (const sd of [-1, 1]) {
        const X = x => sd * x * span;
        // leading edge to the tip, and scalloped trailing edge back to the body
        p.moveTo(sd * 0.07, -0.08);
        p.quadraticCurveTo(X(0.3), -0.22 + wy * 0.45, X(0.5), -0.2 + wy * 0.7);
        p.quadraticCurveTo(X(0.78), -0.16 + wy * 0.95, X(1), -0.02 + wy);
        p.quadraticCurveTo(X(0.86), 0.02 + wy * 0.85, X(0.78), 0.14 + wy * 0.8);
        p.quadraticCurveTo(X(0.66), 0.04 + wy * 0.6, X(0.54), 0.12 + wy * 0.55);
        p.quadraticCurveTo(X(0.42), 0.04 + wy * 0.35, X(0.3), 0.15 + wy * 0.25);
        p.quadraticCurveTo(X(0.18), 0.08, sd * 0.06, 0.12);
        p.closePath();
        // ear
        p.moveTo(sd * 0.075, -0.17); p.lineTo(sd * 0.065, -0.33); p.lineTo(sd * 0.02, -0.2); p.closePath();
      }
      p.ellipse(0, 0.03, 0.1, 0.18, 0, 0, TAU);
      p.moveTo(0.085, -0.15); p.arc(0, -0.15, 0.085, 0, TAU);
      batP.push(p);
    }
    return batP;
  }

  // ---------- house geometry in screen px (global layer) ----------
  const shapes = {};   // shape of each zone (set by draw) to clip the gable properly
  let geo = null, geoRef = null, geoSig = '';
  const mid = (a, c) => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
  const along = (a, c, k) => [lerp(a[0], c[0], k), lerp(a[1], c[1], k)];
  const bil = (p, u, v) => along(along(p[0], p[1], u), along(p[3], p[2], u), v);
  const outlineOf = z => (shapes[z.id] === 'triangulo' ? [mid(z.pts[0], z.pts[1]), z.pts[2], z.pts[3]] : z.pts);
  // pushes each corner d px outward: the neon falls on the white wall, not the black frame
  const growQuad = (pts, d) => {
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    return pts.map(([x, y]) => [x + Math.sign(x - cx) * d, y + Math.sign(y - cy) * d]);
  };
  const polyPath = (pts, closed = true, path = new Path2D()) => {
    path.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
    if (closed) path.closePath();
    return path;
  };
  const areaOf = z => (z.x1 - z.x0) * (z.y1 - z.y0);

  function getGeo(S) {
    const zs = S.screenZones, sig = zs.map(z => z.id + (shapes[z.id] || '')).join();
    if (geo && geoRef === zs && geoSig === sig) return geo;
    geoRef = zs; geoSig = sig;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const z of zs) { x0 = Math.min(x0, z.x0); y0 = Math.min(y0, z.y0); x1 = Math.max(x1, z.x1); y1 = Math.max(y1, z.y1); }
    if (!zs.length) { x0 = y0 = 0; x1 = y1 = 1; }
    const bw = Math.max(1, x1 - x0), bh = Math.max(1, y1 - y0), lw = Math.max(1.2, bh * 0.0062);
    const byX = k => zs.filter(z => z.kind === k).sort((a, c) => a.cx - c.cx);
    const walls = byX('wall'), wins = byX('window'), doors = byX('door');
    const roof = byX('roof').sort((a, c) => areaOf(c) - areaOf(a))[0];
    // gable box on screen; the moon sits low, away from the dark vent at the apex
    let gbox = { x: x0 + bw * 0.3, y: y0, w: bw * 0.4, h: bh * 0.3 }, roofPath = null;
    if (roof) {
      const o = outlineOf(roof), xs = o.map(p => p[0]), ys = o.map(p => p[1]);
      gbox = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      roofPath = polyPath(o);
    }
    const moon = [gbox.x + gbox.w / 2, gbox.y + gbox.h * 0.66], mr = gbox.h * 0.3;
    // spotlights at the foot of each wall: the central one lights first, the side ones in cascade
    const fixtures = [];
    let side = 0;
    for (const w of walls) for (const f of [0.17, 0.5, 0.83]) fixtures.push({ p: along(w.pts[3], w.pts[2], f), on: f === 0.5 ? 8 : 16 + 0.5 * side++ });
    const holes = new Path2D();
    for (const z of [...wins, ...doors]) polyPath(z.pts, true, holes);
    const clip = new Path2D();
    for (const z of zs) polyPath(outlineOf(z), true, clip);
    // windows: neon outside the frame; door: inside (there is no zone around it and it would get clipped)
    const frames = [...wins, ...doors].map(z => { const pts = growQuad(z.pts, z.kind === 'door' ? -lw * 1.6 : lw * 2.6); return { z, pts, path: polyPath(pts) }; });
    // porch gap above the door (real wall with no zone): the flying skull can cross it
    const porch = new Path2D(clip);
    if (doors[0]) {
      const d = doors[0], dw = d.x1 - d.x0, top = roof ? gbox.y + gbox.h * 0.9 : d.y0 - (d.y1 - d.y0);
      porch.rect(d.x0 - dw * 0.5, top, dw * 2, d.y1 - top);
    }
    // gable edges: from each bottom corner up to the apex
    let gable = null;
    if (roof) {
      const o = outlineOf(roof);
      gable = o.length === 3 ? [[o[2], o[0]], [o[1], o[0]]] : [[o[3], o[0], mid(o[0], o[1])], [o[2], o[1], mid(o[0], o[1])]];
      gable = gable.map(pts => ({ pts, path: polyPath(pts, false) }));
    }
    const house = new Path2D();
    for (const z of [...walls, ...(roof ? [roof] : [])]) polyPath(outlineOf(z), true, house);
    geo = { x0, y0, x1, y1, bw, bh, lw, walls, wins, doors, roof, moon, mr, gbox, roofPath, fixtures, holes, clip, frames, porch, gable, house, bats: null };
    return geo;
  }

  // ---------- moving spotlights ----------
  // rise formations: they jump from one to the next on each beat
  const FORMS = [s => s * 0.55, (s, i) => (i % 2 ? 0.42 : -0.42), s => -0.4 + s * 0.08, s => 0.4 + s * 0.08, s => -s * 0.4, s => s * 0.18];
  const SEQ = [0, 1, 2, 3, 4, 1, 5, 0, 3, 2, 4, 1];
  function beamAngle(i, n, b, g) {
    const s = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
    const sweep = s * (0.12 + 0.3 * (0.5 + 0.5 * Math.sin((b * TAU) / 8))) + 0.18 * Math.sin((b * TAU) / 16 + 1);
    const bally = bb => Math.sin((bb * TAU) / 4 + i * 0.9) * 0.35 + s * 0.15;
    if (b < 24) return sweep;
    if (b < 40) return lerp(sweep, bally(b), easeInOut(b - 24));
    const form = n0 => (n0 < 40 ? bally(40) : FORMS[SEQ[(n0 - 40) % SEQ.length]](s, i));
    const n0 = Math.floor(Math.min(b, 52)), snap = lerp(form(n0 - 1), form(n0), backOut(fr(Math.min(b, 52)) / 0.4));
    if (b < 52) return snap;
    // final bar: all aim at the moon; on the hit, fan opens
    const f = g.fixtures[i].p, aim = Math.atan2(g.moon[0] - f[0], f[1] - g.moon[1]);
    const a = lerp(form(51), aim, easeOut((b - 52) / 0.6));
    return b < HIT ? a : lerp(aim, s * 0.75, backOut((b - HIT) / 0.35));
  }
  function beam(ctx, x, y, ang, len, hw, col, a) {
    const dx = Math.sin(ang), dy = -Math.cos(ang), ex = x + dx * len, ey = y + dy * len, nx = -dy, ny = dx;
    for (const [wm, al, c] of [[1.5, 0.18, col], [0.32, 0.62, mix(col, WHITE, 0.55)]]) {
      const half = Math.tan(hw * wm) * len, base = len * 0.004 * wm;
      const gr = ctx.createLinearGradient(x, y, ex, ey);
      gr.addColorStop(0, rgba(c, al * a)); gr.addColorStop(0.45, rgba(c, al * a * 0.45)); gr.addColorStop(1, rgba(c, 0));
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(x - nx * base, y - ny * base); ctx.lineTo(ex - nx * half, ey - ny * half);
      ctx.lineTo(ex + nx * half, ey + ny * half); ctx.lineTo(x + nx * base, y + ny * base);
      ctx.fill();
    }
    glow(ctx, x, y, len * 0.06, col, 0.9 * Math.min(1, a));
    glow(ctx, x, y, len * 0.018, WHITE, Math.min(1, a));
  }
  function drawBeams(ctx, g, b, t, kick) {
    const n = g.fixtures.length;
    if (!n || b < 7.9) return;
    const E = energy(b), [cA, cB] = colors(b), len = g.bh * 1.7, hw = lerp(0.065, 0.045, smooth(38, 40, b));
    for (let i = 0; i < n; i++) {
      const fx = g.fixtures[i], on = smooth(fx.on, fx.on + 0.12, b), pop = b > fx.on ? Math.exp(-(b - fx.on) * 3) : 0;
      if (on <= 0) continue;
      let a = (0.5 + 0.2 * E + 0.35 * kick * E) * on + pop * 0.7;
      if (b >= 52 && b < HIT) a = 0.35 + 0.9 * kickOf(b, 5);
      if (b >= HIT) {
        const s = Math.abs((i / Math.max(1, n - 1)) * 2 - 1), off = HIT_T + 0.5 + (1 - s) * 0.6;
        a = (0.3 + 0.8 * Math.exp(-(t - HIT_T) * 4)) * (1 - smooth(off, off + 0.5, t));
      }
      if (a <= 0.01) continue;
      beam(ctx, fx.p[0], fx.p[1], beamAngle(i, n, b, g), len, hw, b >= HIT ? WHITE : i % 2 ? cB : cA, a);
    }
  }

  // ---------- disco ball spots (the moon turns into a ball on beat 40) ----------
  const SPOTS = (() => { const r = rng(4242), l = []; for (let i = 0; i < 320; i++) l.push([r() * TAU, r() * 1.25 - 0.3, 0.7 + r() * 0.6]); return l; })();
  function drawSpots(ctx, g, b, t, kick) {
    const on = spotsOn(b);
    if (on <= 0) return;
    const [cA, cB] = colors(b), R = g.bh * 0.012, flash = b >= HIT ? 1 + 1.2 * Math.exp(-(t - HIT_T) * 4) : 1;
    // slow spin and side sweep on the beats (with braking)
    const bb = Math.min(b, HIT + 4), rot = (t - 40 * SPB) * 0.25 + (Math.floor(bb) + easeOut(fr(bb) / 0.35)) * 0.16;
    const paths = [new Path2D(), new Path2D(), new Path2D()];
    for (let i = 0; i < SPOTS.length; i++) {
      const [l0, lat, sz] = SPOTS[i], lon = l0 + rot, c = Math.cos(lon);
      if (c < 0.15) continue;
      const x = g.moon[0] + Math.sin(lon) * g.bw * 0.62, y = g.moon[1] + g.bh * 0.1 + lat * g.bh * 0.9;
      if (y < g.y0 || y > g.y1) continue;
      const r = R * sz * flash, p = paths[i % 3];
      p.moveTo(x + r * c, y); p.ellipse(x, y, r * c, r, 0, 0, TAU);
    }
    const a = clamp(on * (0.7 + 0.3 * kick));
    [WHITE, mix(cA, WHITE, 0.25), mix(cB, WHITE, 0.25)].forEach((col, i) => { ctx.fillStyle = rgba(col, a); ctx.fill(paths[i]); });
  }

  // ---------- neons on the architecture ----------
  function neon(ctx, path, col, lw, a, dash, off) {
    if (a <= 0.01) return;
    ctx.setLineDash(dash || []);
    ctx.lineDashOffset = off || 0;
    ctx.strokeStyle = rgba(col, 0.14 * a); ctx.lineWidth = lw * 5.5; ctx.stroke(path);
    ctx.strokeStyle = rgba(col, 0.5 * a); ctx.lineWidth = lw * 2.2; ctx.stroke(path);
    ctx.strokeStyle = rgba(mix(col, WHITE, 0.6), Math.min(1, a)); ctx.lineWidth = lw; ctx.stroke(path);
  }
  // fraction p of a polyline and its tip (for the spark that draws it)
  function partial(pts, p, closed) {
    const seq = closed ? [...pts, pts[0]] : pts, path = new Path2D();
    let total = 0;
    for (let i = 1; i < seq.length; i++) total += Math.hypot(seq[i][0] - seq[i - 1][0], seq[i][1] - seq[i - 1][1]);
    let left = total * clamp(p), tip = seq[0];
    path.moveTo(tip[0], tip[1]);
    for (let i = 1; i < seq.length && left > 0; i++) {
      const a = seq[i - 1], c = seq[i], l = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1, k = Math.min(1, left / l);
      tip = along(a, c, k); path.lineTo(tip[0], tip[1]); left -= l;
    }
    return { path, tip };
  }
  function drawNeon(ctx, g, b, t, kick) {
    const lw = g.lw, L = g.bh * 0.03, [cA, cB] = colors(b);
    // list: gable (rises toward the apex), windows and door; each with its own drawing moment
    const items = [];
    if (g.gable) for (const e of g.gable) items.push({ ...e, closed: false, t0: 0.5, dur: 2, col: cA });
    g.frames.forEach((f, i) => { const door = f.z.kind === 'door'; items.push({ pts: f.pts, path: f.path, closed: true, door, t0: door ? 4.2 : 2 + i * 0.5, dur: 1.3, col: door ? LIME : i % 2 ? cA : cB }); });
    for (const it of items) {
      const lwi = it.door ? lw * 1.4 : lw;
      if (b < 8) {
        // intro: the neon draws itself, with a spark at the tip
        const p = easeInOut((b - it.t0) / it.dur);
        if (p <= 0) continue;
        const { path, tip } = p < 1 ? partial(it.pts, p, it.closed) : { path: it.path, tip: null };
        neon(ctx, path, it.col, lwi, p < 1 ? 1 : 0.75 + 0.25 * Math.sin(b * Math.PI));
        if (tip) { glow(ctx, tip[0], tip[1], lw * 9, WHITE, 0.9); glow(ctx, tip[0], tip[1], lw * 3, WHITE, 1); }
        continue;
      }
      if (b < 24) {
        // verse: marquee that advances half a pattern on each beat
        neon(ctx, it.path, it.col, lwi, 0.75 + 0.4 * kick, [L, L], -(Math.floor(b) + easeOut(fr(b) / 0.3)) * L);
      } else if (b < 40) {
        // bridge: two-color chase, every half beat
        const h2 = b * 2, off = -(Math.floor(h2) + easeOut(fr(h2) / 0.3)) * L * 0.8;
        neon(ctx, it.path, cA, lwi, 0.8 + 0.35 * kick, [L * 0.8, L * 0.8], off);
        neon(ctx, it.path, cB, lwi, 0.8 + 0.35 * kick, [L * 0.8, L * 0.8], off + L * 0.8);
      } else if (b < 52) {
        // rise: continuous, fast run
        neon(ctx, it.path, Math.floor(b) % 2 ? cA : cB, lwi, 0.85 + 0.45 * kick, [L * 1.4, L * 0.6], -b * L * 2);
      } else if (b < HIT) {
        neon(ctx, it.path, cA, lwi, 0.35 + 1.0 * kickOf(b, 5));
      } else {
        const k = t - HIT_T;
        // after the flash the frames stay softly lit for the final photo
        neon(ctx, it.path, mix(WHITE, it.col, smooth(0.3, 1.2, k)), lwi, 1.7 * Math.exp(-k * 2) + 0.4 + 0.15 * Math.sin(k * 3));
      }
    }
    // gable apex: spark when the two neons meet
    if (g.gable && b > 2.3 && b < 4) {
      const apex = g.gable[0].pts[g.gable[0].pts.length - 1], a = Math.exp(-(b - 2.5) * 3) * smooth(2.3, 2.5, b);
      glow(ctx, apex[0], apex[1], g.bh * 0.12, WHITE, a); glow(ctx, apex[0], apex[1], g.bh * 0.3, cA, 0.6 * a);
    }
    // final hit: the whole silhouette of the house in white neon
    if (b >= HIT) neon(ctx, g.house, WHITE, lw * 1.2, 1.5 * Math.exp(-(t - HIT_T) * 2.2));
    ctx.setLineDash([]);
  }

  // ---------- flock (precomputed boids: deterministic even if time is skipped) ----------
  // Normalized space: x, y in units of the house height, from its upper-left corner.
  // one strong pass (11.5-22.5 s): enters from the left, circles the moon, swirls in the empty zone of the right wing and leaves
  const BAT_T0 = 11.5, BAT_T1 = 22.5;
  function simBats(g) {
    const N = 26, dt = 1 / 30, T0 = BAT_T0, T1 = BAT_T1, steps = Math.ceil((T1 - T0) / dt) + 2;
    const A = g.bw / g.bh, nrm = p => [(p[0] - g.x0) / g.bh, (p[1] - g.y0) / g.bh];
    const [mx, my] = nrm(g.moon);
    // free gap in the right wing: left of its window (or its left third)
    const rw = g.walls[g.walls.length - 1], rwin = rw && g.wins.filter(q => q.cx > rw.x0 && q.cx < rw.x1)[0];
    const sx1 = rw ? (rwin ? (rw.x0 + rwin.x0) / 2 : rw.x0 + (rw.x1 - rw.x0) * 0.2) : g.x1 - g.bw * 0.2;
    const [cx, cy] = rw ? nrm([sx1, rw.y0 + (rw.y1 - rw.y0) * 0.42]) : [A * 0.85, 0.6];
    const W = [[10.5, -0.9, 0.8], [12.3, -0.25, 0.72], [13.6, A * 0.16, 0.45], [14.8, mx - 0.75, my + 0.28]];
    for (let i = 0; i <= 14; i++) { const a = Math.PI * 0.9 + (i / 14) * TAU * 0.95; W.push([15.6 + i * 0.26, mx + Math.cos(a) * 0.6, my + 0.04 + Math.sin(a) * 0.12]); }
    for (let i = 1; i <= 12; i++) { const k = i / 12, a = Math.PI + k * TAU * 1.6, rr = lerp(0.3, 0.1, k); W.push([19.6 + k * 1.6, cx + Math.cos(a) * rr * 0.9, cy + Math.sin(a) * rr * 0.6]); }
    W.push([21.9, A * 0.97, 0.85], [22.8, A + 0.6, 0.95], [24, A + 1.2, 1]);
    const leader = tt => spline(W, tt);
    const r = rng(1313), P = [], V = [], prm = [];
    for (let j = 0; j < N; j++) {
      P.push([-0.5 - r() * 0.9, 0.55 + (r() - 0.5) * 0.5]); V.push([0.6, 0]);
      prm.push({ ro: 0.08 + r() * 0.24, ph: r() * TAU, om: (r() < 0.5 ? -1 : 1) * (0.9 + r() * 1.4), vmax: 1.25 + r() * 0.45 });
    }
    const depth = new Float32Array(N), freq = new Float32Array(N), ph = new Float32Array(N);
    for (let j = 0; j < N; j++) { depth[j] = r(); freq[j] = 6 + r() * 3; ph[j] = r(); }
    const pos = new Float32Array(steps * N * 2), vel = new Float32Array(steps * N * 2);
    const burst = null;
    for (let s = 0; s < steps; s++) {
      const tt = T0 + s * dt, L = leader(tt);
      for (let j = 0; j < N; j++) {
        const p = P[j], v = V[j], q = prm[j];
        let ax = 0, ay = 0;
        if (!burst) {
          // looks for its gap around the leader (each one follows its own rhythm: the flock breathes)
          const tx = L[0] + Math.cos(q.ph + q.om * tt) * q.ro * 1.5, ty = L[1] + Math.sin(q.ph + q.om * tt) * q.ro * 0.7;
          let ux = (tx - p[0]) * 2.4, uy = (ty - p[1]) * 2.4;
          const ul = Math.hypot(ux, uy);
          if (ul > q.vmax) { ux *= q.vmax / ul; uy *= q.vmax / ul; }
          ax += (ux - v[0]) * 3.2; ay += (uy - v[1]) * 3.2;
        } else if (tt < HIT_T + 0.3) {
          // final hit: they burst outward
          const ox = p[0] - burst[0], oy = p[1] - burst[1], ol = Math.hypot(ox, oy) || 1;
          ax += (ox / ol) * 26; ay += (oy / ol) * 26 - 4;
        }
        // separation and alignment with neighbors
        let sx = 0, sy = 0, avx = 0, avy = 0, cnt = 0;
        for (let k = 0; k < N; k++) {
          if (k === j) continue;
          const ox = p[0] - P[k][0], oy = p[1] - P[k][1], d2 = ox * ox + oy * oy;
          if (d2 < 0.017) { const d = Math.sqrt(d2) || 0.001; sx += (ox / d) * (0.13 - d); sy += (oy / d) * (0.13 - d); }
          if (d2 < 0.06) { avx += V[k][0]; avy += V[k][1]; cnt++; }
        }
        ax += sx * 45; ay += sy * 45;
        if (cnt && !burst) { ax += (avx / cnt - v[0]) * 1.1; ay += (avy / cnt - v[1]) * 1.1; }
        const al = Math.hypot(ax, ay), amax = burst ? 60 : 7;
        if (al > amax) { ax *= amax / al; ay *= amax / al; }
        v[0] += ax * dt; v[1] += ay * dt;
        const vl = Math.hypot(v[0], v[1]), vm = burst ? 4 : q.vmax * 1.35;
        if (vl > vm) { v[0] *= vm / vl; v[1] *= vm / vl; }
      }
      for (let j = 0; j < N; j++) {
        P[j][0] += V[j][0] * dt; P[j][1] += V[j][1] * dt;
        const o = (s * N + j) * 2;
        pos[o] = P[j][0]; pos[o + 1] = P[j][1]; vel[o] = V[j][0]; vel[o + 1] = V[j][1];
      }
    }
    const order = [...Array(N).keys()].sort((a, c) => depth[a] - depth[c]);
    return { N, dt, T0, steps, pos, vel, depth, freq, ph, order };
  }
  // setTransform composed with the layer's base transform (no save/restore per piece)
  const setXf = (ctx, m, a, b, c, d, e, f) => ctx.setTransform(m.a * a + m.c * b, m.b * a + m.d * b, m.a * c + m.c * d, m.b * c + m.d * d, m.a * e + m.c * f + m.e, m.b * e + m.d * f + m.f);
  // bat with colored backlight; dimmer when passing in front of a window with a pumpkin
  function oneBat(ctx, g, X, Y, size, ang, frame, cA, dep, rim) {
    if (X < g.x0 - size * 2 || X > g.x1 + size * 2 || Y < g.y0 - size * 2 || Y > g.y1 + size * 2) return;
    let a = 1;
    for (const q of g.wins) if (X > q.x0 && X < q.x1 && Y > q.y0 && Y < q.y1) { a = 0.45; break; }
    ctx.globalAlpha = a;
    glow(ctx, X, Y, size * 1.8, cA, 0.22 + 0.12 * dep);
    const c = Math.cos(ang) * size, sn = Math.sin(ang) * size;
    setXf(ctx, g.m, c, sn, -sn, c, X, Y - size * 0.05);
    ctx.fillStyle = rim; ctx.fill(batPaths()[frame]);
    setXf(ctx, g.m, c, sn, -sn, c, X, Y);
    ctx.fillStyle = '#06030b'; ctx.fill(batPaths()[frame]);
    ctx.setTransform(g.m);
    ctx.globalAlpha = 1;
  }
  function drawBats(ctx, g, b, t) {
    const [cA] = colors(b), rim = rgba(mix(cA, [220, 210, 255], 0.55), 0.95);
    g.m = ctx.getTransform();
    if (t >= BAT_T0 && t < BAT_T1) {
      const sim = g.bats || (g.bats = simBats(g));
      const k = (t - sim.T0) / sim.dt, i0 = Math.min(sim.steps - 2, Math.floor(k)), f = Math.min(1, k - i0);
      for (const j of sim.order) {
        const o0 = (i0 * sim.N + j) * 2, o1 = o0 + sim.N * 2;
        const X = g.x0 + lerp(sim.pos[o0], sim.pos[o1], f) * g.bh, Y = g.y0 + lerp(sim.pos[o0 + 1], sim.pos[o1 + 1], f) * g.bh;
        const vx = lerp(sim.vel[o0], sim.vel[o1], f), vy = lerp(sim.vel[o0 + 1], sim.vel[o1 + 1], f);
        const size = g.bh * (0.042 + 0.036 * sim.depth[j]);
        // flapping; when diving it glides with the wings up
        const frame = vy > 0.55 ? 0 : Math.floor(fr(t * sim.freq[j] + sim.ph[j]) * BAT_FR);
        oneBat(ctx, g, X, Y, size, clamp(vx * 0.22 + vy * 0.1 * Math.sign(vx), -0.5, 0.5), frame, cA, sim.depth[j], rim);
      }
    }
    // final hit: bats shoot out of the ball toward the audience (grow as they approach)
    const k = t - HIT_T;
    if (k > 0 && k < 2.6) {
      const r = rng(777), [mx, my] = g.moon;
      for (let j = 0; j < 22; j++) {
        const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.7, sp = 0.7 + r() * 0.8, d0 = r() * 0.12, fq = 7 + r() * 3, ph = r();
        const kk = k - d0;
        if (kk <= 0) continue;
        const e = easeOut(kk / 1.6), dist = g.bh * sp * (0.15 + 1.1 * e);
        const X = mx + Math.cos(a) * dist * 1.6, Y = my + Math.sin(a) * dist + kk * kk * g.bh * 0.12;
        const size = g.bh * (0.03 + 0.09 * e) * (0.8 + 0.4 * r());
        oneBat(ctx, g, X, Y, size, Math.cos(a) * 0.4, Math.floor(fr(kk * fq + ph) * BAT_FR), WHITE, 1, rgba(mix(GOLD, WHITE, 0.4), 0.95));
      }
    }
  }

  // ---------- confetti on the final hit ----------
  const CONF = (() => {
    const r = rng(9091), cols = [MAG, CYAN, LIME, GOLD, ORANGE, WHITE, PURPLE], l = [];
    for (let i = 0; i < 150; i++) {
      // 0 and 1: cannons at the ends of the house aiming inward; 2: from the ball, in all directions
      const src = i % 3;
      const a = src === 2 ? r() * TAU : -Math.PI / 2 + (src ? -1 : 1) * (0.25 + r() * 0.45), sp = src === 2 ? 0.8 + r() * 1.7 : 2.4 + r() * 1.6;
      l.push({ src, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ph: r() * TAU, spin: (r() - 0.5) * 16, fl: 5 + r() * 6, sw: 0.02 + r() * 0.03, col: rgba(cols[i % 7]), sz: 0.7 + r() * 0.7, d: r() * 0.08 });
    }
    return l;
  })();
  function drawConfetti(ctx, g, t) {
    const t0 = t - HIT_T;
    if (t0 <= 0) return;
    const k = 3, vt = 1 / k, s0 = g.bh * 0.026, m = ctx.getTransform();
    const srcs = [[g.x0 + g.bw * 0.05, g.y1 - g.bh * 0.1], [g.x1 - g.bw * 0.05, g.y1 - g.bh * 0.1], g.moon];
    for (const c of CONF) {
      const tau = t0 - c.d;
      if (tau <= 0) continue;
      const e = (1 - Math.exp(-k * tau)) / k, [ox, oy] = srcs[c.src];
      const x = ox + (c.vx * e * (c.src === 2 ? 1 : 0.9) + Math.sin(tau * c.fl * 0.5 + c.ph) * c.sw * smooth(0.3, 1, tau)) * g.bh;
      const y = oy + (vt * tau + (c.vy - vt) * e) * g.bh, sz = s0 * c.sz;
      if (y > g.y1 + sz) continue;
      const ro = c.ph + c.spin * tau, cs = Math.cos(ro), sn = Math.sin(ro), fy = Math.cos(tau * c.fl + c.ph);
      setXf(ctx, m, cs, sn, -sn * fy, cs * fy, x, y);
      ctx.fillStyle = c.col; ctx.fillRect(-sz, -sz * 0.6, sz * 2, sz * 1.2);
    }
    ctx.setTransform(m);
  }

  // final hit: additive burst from the ball with thin spinning rays (without washing out the whole facade)
  function drawBurst(ctx, g, b, t) {
    const [mx, my] = g.moon;
    if (b >= 52 && b < HIT) {
      // final bar: the ball pulses on each beat
      const a = 0.35 * kickOf(b, 6) * (0.5 + (b - 52) / 8);
      glow(ctx, mx, my, g.mr * 5, colors(b)[0], a);
      return;
    }
    const k = t - HIT_T;
    if (k < 0 || k > 2.2) return;
    glow(ctx, mx, my, g.bw * 1.2, WHITE, 0.5 * Math.exp(-k * 10));
    glow(ctx, mx, my, g.mr * 4, GOLD, 0.8 * Math.exp(-k * 3));
    const n = 14, rot = k * 0.5 + easeOut(k / 0.6) * 0.3, len = g.bw * (0.35 + 0.5 * easeOut(k / 0.4)), ra = Math.exp(-k * 1.8) * (1 - smooth(1.6, 2.2, k));
    if (ra <= 0.01) return;
    ctx.save();
    ctx.translate(mx, my);
    for (const [wd, al, col] of [[0.035, 0.35, GOLD], [0.008, 0.9, WHITE]]) {
      ctx.fillStyle = rgba(col, al * ra);
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const an = rot + (i / n) * TAU + (i % 2) * 0.08, l = len * (i % 2 ? 0.7 : 1), dw = wd * (i % 2 ? 0.7 : 1);
        ctx.moveTo(Math.cos(an) * g.mr * 1.2, Math.sin(an) * g.mr * 1.2);
        ctx.lineTo(Math.cos(an - dw) * l, Math.sin(an - dw) * l);
        ctx.lineTo(Math.cos(an + dw) * l, Math.sin(an + dw) * l);
        ctx.closePath();
      }
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------- windows: little stages with singing pumpkins ----------
  // papers: the two largest windows do the duet (call and response), the rest are the chorus
  let roles = {}, rolesRef = null;
  function roleOf(z, S) {
    if (rolesRef !== S.screenZones) {
      rolesRef = S.screenZones; roles = {};
      const wins = S.screenZones.filter(q => q.kind === 'window');
      const leads = [...wins].sort((a, c) => areaOf(c) - areaOf(a)).slice(0, 2).sort((a, c) => a.cx - c.cx);
      const callX = leads[0] ? leads[0].cx : 0, respX = leads[1] ? leads[1].cx : callX;
      for (const q of wins) roles[q.id] = { role: 'back', x: q.cx, callX, respX };
      if (leads.length === 1) roles[leads[0].id].role = 'solo';
      if (leads.length === 2) { roles[leads[0].id].role = 'call'; roles[leads[1].id].role = 'resp'; }
    }
    return roles[z.id] || { role: 'back', x: 0, callX: 0, respX: 0 };
  }
  const isLead = R => R.role !== 'back';
  const mineAt = (R, k) => R.role === 'solo' || (R.role === 'call') === (k < 8);

  // mouth, eyes and spotlight of each pumpkin according to the note playing
  function voice(R, b) {
    const v = { open: 0.17, q: 0, act: 0, happy: 0, look: 0 };
    if (b < 7) return v;
    const st = Math.floor(b * 2), k = st % 16, dt = fr(b * 2) * STEP, callTurn = k < 8;
    const tb = ((k % 8) + fr(b * 2)) * STEP;   // seconds since the last turn change
    const lookTo = turnCall => (isLead(R) && mineAt(R, turnCall ? 0 : 8) ? 0 : Math.sign((turnCall ? R.callX : R.respX) - R.x));
    v.look = lerp(lookTo(!callTurn), lookTo(callTurn), easeOut(tb / 0.25));
    if (b < 8) return v;
    if (b < 52) {
      if (isLead(R)) {
        const mine = mineAt(R, k);
        v.act = mine ? smooth(0, 0.12, tb) : 1 - smooth(0, 0.3, tb);
        const n = LEAD[k];
        if (mine && n) {
          const nk = (k + 1) % 16, cont = LEAD[nk] && mineAt(R, nk);
          let env = smooth(0, 0.03, dt) * (0.62 + 0.38 * Math.exp(-dt / 0.07));
          if (!cont) env *= 1 - smooth(0.15, 0.24, dt);
          const p = (n - 64) / 13;
          v.open = 0.17 + env * (0.45 + 0.45 * p);
          v.q = smooth(0.55, 1, p) * 0.9;
          v.happy = smooth(0.75, 1, p) * env;
        }
      } else if (b >= 24) {
        // chorus: "du" on each beat
        const bd = fr(b) * SPB;
        v.open = 0.17 + 0.45 * smooth(0, 0.03, bd) * Math.exp(-bd / 0.14);
        v.q = 0.85; v.act = 0.45;
      }
    } else if (b < HIT) {
      // final bar: everyone at once, crescendo
      const c = (b - 52) / 4;
      v.open = 0.35 + 0.4 * c + 0.25 * Math.exp(-fr(b * 2) * 3);
      v.q = 0.3 + 0.5 * c; v.act = 1; v.look = 0;
    } else {
      // final shout with happy eyes
      v.open = 1 - 0.75 * smooth(HIT + 1.3, HIT + 2.6, b); v.q = 0.2; v.act = 1; v.happy = 1; v.look = 0;
    }
    return v;
  }

  function pumpkinBody(r) {
    const W = r * 2.5, H = r * 2.1, c = mkCanvas(W, H), g = c.getContext('2d');
    const cx = c.width / 2, cy = c.height / 2 + r * 0.05, rx = r, ry = r * 0.82;
    g.translate(cx, cy);
    for (const [ox, sw, tone] of [[-0.56, 0.48, 0.7], [0.56, 0.48, 0.7], [-0.29, 0.55, 0.88], [0.29, 0.55, 0.88], [0, 0.5, 1]]) {
      const gx = ox * rx, lr = rx * sw;
      const gr = g.createRadialGradient(gx - lr * 0.3, -ry * 0.42, r * 0.05, gx, 0, ry * 1.08);
      gr.addColorStop(0, rgba(mix([240, 140, 50], [255, 190, 95], tone)));
      gr.addColorStop(0.55, rgba(mix([180, 64, 6], [238, 108, 14], tone)));
      gr.addColorStop(1, rgba([120, 36, 4]));
      g.fillStyle = gr;
      g.beginPath(); g.ellipse(gx, 0, lr, ry, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(110,30,0,0.55)'; g.lineWidth = r * 0.028; g.stroke();
    }
    g.globalCompositeOperation = 'source-atop';
    const sh = g.createLinearGradient(0, -ry, 0, ry);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(40,0,20,0.55)');
    g.fillStyle = sh; g.fillRect(-rx * 1.3, -ry * 1.3, rx * 2.6, ry * 2.6);
    g.fillStyle = 'rgba(255,245,210,0.3)';
    g.beginPath(); g.ellipse(-rx * 0.33, -ry * 0.58, rx * 0.15, ry * 0.07, -0.45, 0, TAU); g.fill();
    return { c, cx, cy };
  }

  const CARVE = 'rgba(80,20,0,0.9)';
  function face(ctx, r, v, lit, look, blink) {
    const rx = r, ry = r * 0.82, L = clamp(lit);
    const g = ctx.createRadialGradient(0, ry * 0.05, r * 0.05, 0, ry * 0.05, r * 0.95);
    g.addColorStop(0, rgba(mix([110, 35, 0], [255, 252, 225], L)));
    g.addColorStop(0.5, rgba(mix([80, 22, 0], [255, 205, 80], L)));
    g.addColorStop(1, rgba(mix([55, 12, 0], [255, 125, 10], L)));
    ctx.fillStyle = g;
    // triangular eyes; "happy" ones close into an arc ^ ^
    const hp = clamp(v.happy), eh = ry * 0.36 * (1 - 0.88 * blink);
    ctx.beginPath();
    for (const sd of [-1, 1]) {
      const ex = sd * rx * 0.37, ey = -ry * 0.2, ew = rx * 0.24, by = ey + eh * 0.45;
      ctx.moveTo(ex - ew, by);
      ctx.lineTo(ex + sd * rx * 0.03, ey - eh * 0.6);
      ctx.lineTo(ex + ew, by);
      ctx.quadraticCurveTo(ex, by - hp * eh * 1.6, ex - ew, by);
      ctx.closePath();
    }
    ctx.moveTo(0, -ry * 0.02); ctx.lineTo(-rx * 0.08, ry * 0.13); ctx.lineTo(rx * 0.08, ry * 0.13); ctx.closePath();
    ctx.strokeStyle = CARVE; ctx.lineWidth = r * 0.07; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.fill();
    // dark pupils looking at whoever is singing
    const pa = (1 - smooth(0.2, 0.6, hp)) * (1 - blink);
    if (pa > 0.05) {
      ctx.fillStyle = rgba([60, 14, 0], pa);
      for (const sd of [-1, 1]) ell(ctx, sd * rx * 0.37 + look * rx * 0.085, -ry * 0.11, rx * 0.075, rx * 0.085);
    }
    // mouth: wide smile on low notes, "O" on high ones
    const open = clamp(v.open), q = clamp(v.q);
    const my = ry * 0.3, mw = rx * 0.68 * (1 - 0.45 * q), cy = my - ry * 0.13 * (1 - q) * (1 - open * 0.4);
    const yU = my + ry * 0.03 - q * open * ry * 0.14, yL = my + ry * (0.1 + 0.5 * open), kx = mw * lerp(0.3, 0.95, q);
    const cU = (8 * yU - 2 * cy) / 6, cL = (8 * yL - 2 * cy) / 6;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-mw, cy);
    ctx.bezierCurveTo(-kx, cU, kx, cU, mw, cy);
    ctx.bezierCurveTo(kx, cL, -kx, cL, -mw, cy);
    ctx.closePath(); ctx.strokeStyle = CARVE; ctx.stroke(); ctx.fill();
    // pumpkin teeth
    const ta = clamp((open - 0.12) / 0.2) * (1 - smooth(0.5, 0.8, q));
    if (ta > 0) {
      ctx.fillStyle = '#e8700e';
      const tw = mw * 0.17, th = ry * 0.11 * ta;
      for (const sd of [-1, 1]) ctx.fillRect(sd * mw * 0.32 - tw / 2, yU - ry * 0.06, tw, th + ry * 0.06);
      ctx.fillRect(-tw / 2, yL - th, tw, th + ry * 0.06);
    }
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, 0, ry * 0.08, r * 1.1, [255, 170, 40], 0.28 * L * (0.6 + open));
    ctx.globalCompositeOperation = 'source-over';
  }

  function noteGlyph(ctx, x, y, s, a, col) {
    glow(ctx, x, y - s * 0.4, s * 1.2, col, 0.3 * a);
    ctx.globalAlpha = a;
    ctx.fillStyle = ctx.strokeStyle = rgba(col);
    ell(ctx, x, y, s * 0.32, s * 0.22, -0.45);
    ctx.lineWidth = s * 0.15; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + s * 0.27, y - s * 0.05); ctx.lineTo(x + s * 0.27, y - s * 1.05);
    ctx.quadraticCurveTo(x + s * 0.42, y - s * 0.7, x + s * 0.72, y - s * 0.6); ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // curtain: cached gradients per zone (folds + vertical shadow); stretched with scale when opening
  function makeCurtain(ctx, cw, h) {
    const n = 4, lg = ctx.createLinearGradient(0, 0, cw, 0);
    for (let i = 0; i <= 32; i++) { const k = i / 32, s = 0.5 + 0.5 * Math.cos(k * n * TAU); lg.addColorStop(k, rgba(mix([55, 0, 14], [235, 32, 62], s ** 1.6))); }
    const vg = ctx.createLinearGradient(0, 0, 0, h);
    vg.addColorStop(0, 'rgba(0,0,0,0.55)'); vg.addColorStop(0.3, 'rgba(0,0,0,0)'); vg.addColorStop(0.85, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    return { lg, vg, cw };
  }
  function makeValance(w, h) {
    const vh = h * 0.13, c = mkCanvas(w, vh * 1.6), g = c.getContext('2d'), n = Math.max(3, Math.round(w / (h * 0.3)));
    const path = new Path2D();
    path.moveTo(0, -vh); path.lineTo(w, -vh); path.lineTo(w, vh);
    for (let i = n; i > 0; i--) { const xa = (i / n) * w, xb = ((i - 1) / n) * w; path.quadraticCurveTo((xa + xb) / 2, vh * 1.5, xb, vh); }
    path.closePath();
    const gr = g.createLinearGradient(0, 0, 0, vh * 1.3);
    gr.addColorStop(0, '#3a000c'); gr.addColorStop(0.65, '#c4183a'); gr.addColorStop(1, '#6a0618');
    g.fillStyle = gr; g.fill(path);
    g.strokeStyle = '#ffc24a'; g.lineWidth = vh * 0.12; g.stroke(path);
    g.fillStyle = '#ffd36a';
    for (let i = 0; i <= n; i++) ell(g, (i / n) * w, vh * 1.12, vh * 0.1, vh * 0.17);
    return c;
  }
  // width covered by each half of the curtain (0.5 = closed): opens in the intro and closes after the hit
  function curtainCover(z, t) {
    const open = spring(t - (6 + z.index * 0.33) * SPB);
    const close = easeInOut((t - HIT_T - 1.35 - z.index * 0.12) / 0.75);
    // final bow: the curtain parts slightly and smiling pumpkins peek out
    const peek = spring(t - HIT_T - 2.2 - z.index * 0.12, 1.2, 5);
    return lerp(lerp(0.5, 0.1, open), 0.5, close) - 0.12 * peek + 0.004 * Math.sin(t * 2.3 + z.index);
  }

  function drawWindow(ctx, z, S, b, t) {
    const { w, h } = z, kick = S.kick, E = energy(b), [cA] = colors(b), R = roleOf(z, S);
    // very wide windows: pumpkin duet (the second one a quarter beat behind)
    const r1 = Math.min(w * 0.33, h * 0.46), r2 = Math.min(w * 0.2, h * 0.46), duo = r2 >= r1 * 0.85;
    const r = duo ? r2 : r1, xs = duo ? [w * 0.3, w * 0.7] : [w / 2], floorY = h * 0.95, cover = curtainCover(z, t);
    vGradient(ctx, w, h, [[0, '#040108'], [1, '#170714']]);
    if (cover < 0.49) {
      const vs = xs.map((x, i) => voice(R, b - i * 0.25));
      ctx.globalCompositeOperation = 'lighter';
      // colored backlight and overhead spot that follows the singer
      glow(ctx, w / 2, floorY - r * 0.9, Math.max(r * 2.5, w * 0.45), cA, 0.3 + 0.25 * kick * E + 0.2 * vs[0].act);
      xs.forEach((x, i) => {
        const v = vs[i], sa = 0.08 + 0.24 * v.act, cg = ctx.createLinearGradient(0, 0, 0, floorY);
        cg.addColorStop(0, rgba([255, 240, 210], sa)); cg.addColorStop(1, rgba([255, 240, 210], sa * 0.35));
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.moveTo(x - r * 0.3, 0); ctx.lineTo(x + r * 0.3, 0); ctx.lineTo(x + r * 1.4, floorY); ctx.lineTo(x - r * 1.4, floorY); ctx.closePath(); ctx.fill();
        ctx.save(); ctx.translate(x, floorY); ctx.scale(1, 0.16); glow(ctx, 0, 0, r * 1.7, [255, 235, 200], 0.4 + 0.5 * v.act); ctx.restore();
      });
      ctx.globalCompositeOperation = 'source-over';
      xs.forEach((x, i) => singer(ctx, z, S, x, floorY, r, b - i * 0.25, t, vs[i], kick, cA, i));
      // notes coming out of the singer's mouth (only in the big solo windows)
      if (isLead(R) && b >= 8 && b < 52) {
        const st = Math.floor(b * 2);
        for (let s = st; s > st - 8 && s >= 16; s--) {
          const k = s % 16, n = LEAD[k];
          if (!n || !mineAt(R, k)) continue;
          const age = (b * 2 - s) * STEP;
          if (age > 1.2) continue;
          const side = hash(s * 7.31 + z.seed) < 0.5 ? -1 : 1, x0 = xs[s % xs.length];
          const nx = x0 + side * (r * 0.6 + age * r * 0.9) + Math.sin(age * 6 + s) * r * 0.12, ny = floorY - r * 0.7 - age * h * 0.55;
          noteGlyph(ctx, nx, ny, r * 0.64 * (0.6 + 0.4 * easeOut(age / 0.25)), smooth(0, 0.06, age) * (1 - smooth(0.6, 1.2, age)), n >= 76 ? WHITE : GOLD);
        }
      }
    }
    drawCurtains(ctx, z, cover, b);
  }

  function singer(ctx, z, S, x, floorY, r, b, t, v, kick, cA, idx) {
    const spr = cached(z, 'pk' + Math.round(r), () => pumpkinBody(r)), ph = (z.seed % 7) * 0.9 + idx * 2.1;
    const tiltAt = bb => Math.sin((bb * Math.PI) / 2 + ph) * 0.07 * smooth(7, 9, bb);
    const tilt = tiltAt(b);
    // bounces: one on each beat in the rise, higher in the final bar, big jump on the hit
    let hop = 0, stretch = 0;
    if (b >= 40 && b < HIT) { const f = fr(b), amp = b >= 52 ? 0.45 : 0.2; hop = amp * r * hop4(f); stretch = amp * 0.4 * (1 - 2 * f); }
    if (b >= HIT) { const k = (t - HIT_T) / 0.55; if (k < 1) { hop = r * 0.8 * hop4(k); stretch = 0.25 * (1 - 2 * k); } }
    const landing = b >= 40 && b < HIT + 1.1 ? kickOf(b, 7) * (hop < r * 0.05 ? 1 : 0) : 0;
    const sq = 0.06 * kick * smooth(7, 9, b) + 0.14 * landing;
    const sy = Math.max(0.7, 1 + 0.08 * v.open * v.act + Math.max(0, stretch) * 0.5 - sq), sx = 1 / Math.pow(sy, 0.7);
    const stemRot = -(tilt - tiltAt(b - 0.3)) * 5 - stretch * 0.4;
    const blinkP = fr(t / (3.3 + (z.seed % 5) * 0.45 + idx * 0.7) + z.seed * 0.13 + idx * 0.4), blink = blinkP < 0.045 ? Math.sin((blinkP / 0.045) * Math.PI) : 0;
    const lit = (0.8 + 0.2 * flicker(S.T, z.seed)) * (0.72 + 0.2 * kick + 0.45 * v.open) * smooth(5.5, 7, b);
    ctx.save();
    ctx.translate(x, floorY - hop);
    ctx.rotate(tilt);
    ctx.scale(sx, sy);
    ctx.translate(0, -r * 0.82);
    // rim light edge
    ctx.fillStyle = rgba(mix(cA, WHITE, 0.3), 0.8);
    ell(ctx, 0, -r * 0.02, r * 1.035, r * 0.84);
    // stem with delay: follows the movement
    ctx.save();
    ctx.translate(0, -r * 0.7); ctx.rotate(stemRot);
    ctx.fillStyle = '#6a9a2a';
    ctx.beginPath(); ctx.moveTo(-r * 0.1, r * 0.05); ctx.quadraticCurveTo(-r * 0.1, -r * 0.28, r * 0.12, -r * 0.38);
    ctx.lineTo(r * 0.19, -r * 0.29); ctx.quadraticCurveTo(r * 0.06, -r * 0.2, r * 0.1, r * 0.05); ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.drawImage(spr.c, -spr.cx, -spr.cy);
    face(ctx, r, v, lit, v.look, blink);
    ctx.restore();
  }

  function drawCurtains(ctx, z, cover, b) {
    const { w, h } = z, cw = w * cover;
    if (cw > 1) {
      const sp = cached(z, 'curtain', () => makeCurtain(ctx, w * 0.56, h));
      for (const sd of [0, 1]) {
        ctx.save();
        if (sd) { ctx.translate(w, 0); ctx.scale(-1, 1); }
        const sg = ctx.createLinearGradient(cw, 0, cw + w * 0.08, 0);
        sg.addColorStop(0, 'rgba(0,0,0,0.6)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg; ctx.fillRect(cw, 0, w * 0.08, h);
        ctx.save(); ctx.scale(cw / sp.cw, 1);
        ctx.fillStyle = sp.lg; ctx.fillRect(0, 0, sp.cw, h);
        ctx.fillStyle = sp.vg; ctx.fillRect(0, 0, sp.cw, h);
        ctx.restore();
        ctx.fillStyle = 'rgba(255,200,90,0.9)'; ctx.fillRect(cw - h * 0.025, 0, h * 0.025, h);
        ctx.restore();
      }
    }
    // footlights: warm light from below onto the closed curtain
    const foot = clamp((cover - 0.1) / 0.4) * smooth(0.3, 2, b);
    if (foot > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.save(); ctx.translate(w / 2, h * 1.02); ctx.scale(1, 0.55); glow(ctx, 0, 0, w * 0.55, [255, 160, 70], 0.45 * foot); ctx.restore();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.drawImage(cached(z, 'valance', () => makeValance(w, h)), 0, 0);
  }

  // ---------- door: dancing skeleton ----------
  // pose: air, hip, lean, head, jaw, arms (shoulder/elbow), legs (thigh/shin/knee up),
  // turn, bow and skull displacement (when it flies off)
  const REST = { air: 0, sway: 0, tilt: 0, head: 0, jaw: 0, lsh: 0.18, lel: 0.15, rsh: 0.18, rel: 0.15, lth: 0.06, lsn: 0.02, llift: 0, rth: 0.06, rsn: 0.02, rlift: 0, spin: 0, bow: 0, skx: 0, sky: 0, skr: 0 };
  const PKEYS = Object.keys(REST);
  const pose = o => Object.assign({}, REST, o);
  const mixPose = (a, c, k) => { const o = {}; for (const key of PKEYS) o[key] = a[key] + (c[key] - a[key]) * k; return o; };
  // knee bend (the hip drops on its own because the planted foot always touches the ground)
  const knees = (p, d) => { p.lth += 0.34 * d; p.rth += 0.34 * d; p.lsn -= 0.24 * d; p.rsn -= 0.24 * d; return p; };

  function groove(b) {
    const sw = Math.sin(b * Math.PI), alt = 0.5 + 0.5 * Math.cos(b * Math.PI);
    return knees(pose({ sway: 0.35 * sw, tilt: -0.09 * sw, head: 0.14 * Math.sin(b * TAU), jaw: 0.35 * kickOf(b, 5),
      lsh: 0.35 + 0.4 * alt, lel: 1.9 + 0.3 * alt, rsh: 0.75 - 0.4 * alt, rel: 2.2 - 0.3 * alt }), 0.5 + 0.5 * Math.cos(fr(b) * TAU));
  }
  function tada(b) {
    const k = (b - HIT) * SPB, land = k > 0.5 ? Math.exp(-(k - 0.5) * 7) : 0;
    return knees(pose({ lsh: 2.5, rsh: 2.5, lel: 0.25, rel: 0.25, lth: 0.34, lsn: 0.34, rth: 0.34, rsn: 0.34, jaw: 0.9, air: k < 0.5 ? 2.2 * hop4(k / 0.5) : 0 }), 0.7 * land);
  }
  const MOVES = [
    [0, b => { // hunched, waiting; crouches just before starting (anticipation)
      const a = smooth(7.3, 7.9, b);
      return knees(pose({ sky: 0.35 + 0.15 * a, head: 0.15, tilt: 0.04, lsh: 0.05, rsh: 0.05, lel: 0, rel: 0 }), 0.25 + 0.45 * a);
    }],
    [8, groove],
    [24, b => { // disco: arm up on the right / crossed low
      const k = backOut(fr(b) / 0.32);
      const up = pose({ rsh: 2.55, rel: 0.05, lsh: 0.55, lel: -2.0, sway: 0.4, tilt: -0.14, head: 0.22, jaw: 0.5 });
      const down = pose({ rsh: -0.5, rel: -0.25, lsh: 0.55, lel: -2.0, sway: -0.35, tilt: 0.12, head: -0.12, jaw: 0.1 });
      return knees(Math.floor(b) % 2 ? mixPose(up, down, k) : mixPose(down, up, k), 0.35 + 0.35 * Math.cos(fr(b) * TAU));
    }],
    [32, b => { // the head escapes, searches for it and recovers it
      const g = groove(b);
      if (b < 33.4) return g;
      if (b < 34) { const k = smooth(33.4, 34, b); return knees(mixPose(g, pose({ lsh: 0.1, rsh: 0.1, lel: 0.2, rel: 0.2, sky: 0.2, head: 0.2 }), k), 0.6 * k); }
      if (b < 36) {
        const k = (b - 34) / 2, wv = Math.sin(b * TAU * 1.5);
        return knees(pose({ lsh: 2.3 + 0.35 * wv, rsh: 2.3 - 0.35 * wv, lel: 0.4, rel: 0.4, sway: 0.25 * wv, tilt: 0.06 * wv,
          sky: -9 * hop4(k), skx: 1.2 * Math.sin(Math.PI * k), skr: TAU * easeInOut(k), jaw: 0.5 + 0.5 * Math.sin(b * 40) }), 0.2 * (0.5 + 0.5 * Math.cos(fr(b) * TAU)));
      }
      const k = (b - 36) * SPB, land = Math.exp(-k * 6) * Math.cos(k * 18);
      const p = mixPose(pose({ lsh: 0.9, rsh: 0.9, lel: 1.2, rel: 1.2, jaw: 0.6 * Math.abs(Math.sin(b * TAU * 2)), tilt: 0.1 * land }), g, smooth(37, 38, b));
      return knees(p, 0.8 * Math.max(0, land));
    }],
    [40, b => { // alternating knees up, opposite arms
      const u = 0.5 - 0.5 * Math.cos(Math.PI * (b - 0.5)), lL = Math.max(0, Math.sin(Math.PI * b)), lR = Math.max(0, -Math.sin(Math.PI * b));
      return pose({ sway: 0.2 * (lR - lL), tilt: 0.06 * (lL - lR), jaw: 0.45 * kickOf(b, 5), head: 0.1 * Math.sin(b * TAU),
        lsh: lerp(0.5, 2.1, u), lel: lerp(1.6, 0.5, u), rsh: lerp(2.1, 0.5, u), rel: lerp(0.5, 1.6, u),
        llift: 0.8 * lL, lth: 0.06 + 0.2 * lL, rlift: 0.8 * lR, rth: 0.06 + 0.2 * lR });
    }],
    [48, b => { // arms in a V, jumping on each beat
      const sw = Math.sin(b * Math.PI), f = fr(b);
      const p = pose({ lsh: 2.5 + 0.35 * sw, rsh: 2.5 - 0.35 * sw, lel: 0.2, rel: 0.2, sway: 0.3 * sw, tilt: -0.1 * sw, jaw: 0.7 * kickOf(b, 4), air: 0.9 * hop4(f) });
      p.llift = p.rlift = 0.35 * hop4(f);
      return knees(p, 0.5 * kickOf(b, 7));
    }],
    [52, b => { // full turn and crouch of anticipation before the hit
      const c = smooth(54, 55.3, b);
      const spin = pose({ spin: TAU * easeInOut((b - 52) / 2), lsh: 0.4, rsh: 0.4, lel: 1.3, rel: 1.3, jaw: 0.3 });
      const crouch = pose({ lsh: -0.15, rsh: -0.15, lel: 0.3, rel: 0.3, head: 0.1, sky: 0.12, sway: 0.04 * Math.sin(b * 60) * smooth(55.3, 55.8, b), spin: TAU });
      return knees(mixPose(spin, crouch, c), 0.3 + 0.9 * c);
    }],
    [HIT, tada],
    [HIT + 3, b => mixPose(tada(b), pose({ bow: 1, lsh: 0.55, lel: -2.2, rsh: 1.25, rel: 0.35, sky: 0.3, head: 0.1, lth: 0.1, rth: 0.1 }), easeInOut((b - HIT - 3) / 1.2))],
  ];
  function skelPose(b) {
    let i = 0;
    while (i < MOVES.length - 1 && b >= MOVES[i + 1][0]) i++;
    const [b0, fn] = MOVES[i], cur = fn(b);
    // the transitions at the start and at the hit are overdone with braking (exaggeration)
    const snappy = b0 === 8 || b0 === HIT, bl = snappy ? 0.45 : 0.5;
    if (i === 0 || b - b0 >= bl) return cur;
    const k = (b - b0) / bl;
    return mixPose(MOVES[i - 1][1](b), cur, snappy ? backOut(k) : easeInOut(k));
  }

  function skull(ctx, s, jaw, eye) {
    ctx.fillStyle = '#ffffff';
    ell(ctx, 0, -0.1 * s, 0.5 * s, 0.46 * s);
    ctx.beginPath(); ctx.roundRect(-0.31 * s, 0.05 * s, 0.62 * s, 0.28 * s, 0.1 * s); ctx.fill();
    const jy = 0.31 * s + jaw * 0.2 * s;
    ctx.beginPath(); ctx.roundRect(-0.26 * s, jy, 0.52 * s, 0.17 * s, [0.03 * s, 0.03 * s, 0.1 * s, 0.1 * s]); ctx.fill();
    ctx.fillStyle = '#0a0306';
    if (jy > 0.34 * s) ctx.fillRect(-0.2 * s, 0.33 * s, 0.4 * s, jy - 0.33 * s);
    ell(ctx, -0.19 * s, 0, 0.15 * s, 0.17 * s); ell(ctx, 0.19 * s, 0, 0.15 * s, 0.17 * s);
    tri(ctx, 0, 0.13 * s, -0.06 * s, 0.25 * s, 0.06 * s, 0.25 * s);
    ctx.fillStyle = rgba(mix(eye, WHITE, 0.45));
    ell(ctx, -0.19 * s, 0.03 * s, 0.055 * s, 0.055 * s); ell(ctx, 0.19 * s, 0.03 * s, 0.055 * s, 0.055 * s);
    ctx.strokeStyle = '#0a0306'; ctx.lineWidth = s * 0.025;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) { ctx.moveTo(i * 0.09 * s, 0.25 * s); ctx.lineTo(i * 0.09 * s, 0.33 * s); ctx.moveTo(i * 0.09 * s, jy); ctx.lineTo(i * 0.09 * s, jy + 0.07 * s); }
    ctx.stroke();
  }

  // skeleton layout (px of the door): used by the door and the flying skull in the global layer
  function skelLayout(cx, floorY, u, P) {
    const hipW = u * 0.48, thL = u * 2.15, shL = u * 2.2;
    const legs = [-1, 1].map(sd => {
      const th = sd < 0 ? P.lth : P.rth, sn = sd < 0 ? P.lsn : P.rsn, lift = sd < 0 ? P.llift : P.rlift;
      const a1 = sd * th, a2 = sd * sn, l1 = thL * (1 - 0.6 * lift), hx = sd * hipW;
      const kx = hx + Math.sin(a1) * l1, ky = Math.cos(a1) * l1;
      return { sd, hx, kx, ky, fx: kx + Math.sin(a2) * shL, fy: ky + Math.cos(a2) * shL };
    });
    const pelvisY = floorY - Math.max(legs[0].fy, legs[1].fy) - u * 0.2 - P.air * u;
    const c = Math.cos(P.spin), sx = (c < 0 ? -1 : 1) * Math.max(0.07, Math.abs(c));
    const sp = 1 - 0.42 * P.bow, shY = -2.6 * u * sp, neckY = -2.95 * u * sp;
    // skull center in door px
    const ox = cx + P.sway * u, ct = Math.cos(P.tilt), st = Math.sin(P.tilt);
    const lx = P.skx * u, ly = neckY - 0.85 * u + P.sky * u;
    const head = { x: ox + (lx * ct - ly * st) * sx, y: pelvisY + lx * st + ly * ct, rot: P.tilt + P.head + P.skr, sx, s: u * 1.9 };
    return { legs, pelvisY, sx, sp, shY, neckY, ox, head };
  }

  function skeleton(ctx, cx, floorY, u, P, glowCol, alpha, showSkull) {
    const bw = u * 0.8, L = skelLayout(cx, floorY, u, P), { legs, sp, shY, neckY } = L;
    const arm = (sd, sh, el) => {
      const x0 = sd * 1.05 * u, a1 = sd * sh, a2 = a1 + sd * el, ex = x0 + Math.sin(a1) * 1.45 * u, ey = shY + Math.cos(a1) * 1.45 * u;
      return [x0, shY, ex, ey, ex + Math.sin(a2) * 1.35 * u, ey + Math.cos(a2) * 1.35 * u];
    };
    const arms = [arm(-1, P.lsh, P.lel), arm(1, P.rsh, P.rel)];
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(L.ox, L.pelvisY);
    ctx.scale(L.sx, 1);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // two passes: thin black outline (separates crossing bones) and pure white bone on top
    for (const pass of [0, 1]) {
      const m = pass ? 1 : 1.35, e = pass ? 1 : 1.2;
      ctx.strokeStyle = ctx.fillStyle = pass ? '#ffffff' : '#000';
      ctx.lineWidth = bw * m;
      ctx.beginPath();
      for (const G of legs) { ctx.moveTo(G.hx, 0); ctx.lineTo(G.kx, G.ky); ctx.lineTo(G.fx, G.fy); }
      ctx.stroke();
      for (const G of legs) ell(ctx, G.fx + G.sd * 0.2 * u, G.fy + 0.06 * u, 0.36 * u * e, 0.17 * u * e);
      for (const G of legs) ell(ctx, G.kx, G.ky, 0.3 * u * e, 0.3 * u * e);
      ctx.save();
      ctx.rotate(P.tilt);
      ell(ctx, -0.34 * u, -0.05 * u, 0.44 * u * e, 0.32 * u * e);
      ell(ctx, 0.34 * u, -0.05 * u, 0.44 * u * e, 0.32 * u * e);
      ctx.lineWidth = bw * 0.9 * m;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, neckY); ctx.moveTo(-1.1 * u, shY); ctx.lineTo(1.1 * u, shY); ctx.stroke();
      // rib cage: rounded white block
      const ry0 = -2.5 * u * sp, rh = 1.75 * u * sp, pad = pass ? 0 : bw * 0.18;
      ctx.beginPath(); ctx.roundRect(-0.95 * u - pad, ry0 - pad, 1.9 * u + pad * 2, rh + pad * 2, [0.35 * u, 0.35 * u, 0.7 * u, 0.7 * u]); ctx.fill();
      ctx.lineWidth = bw * 0.85 * m;
      ctx.beginPath();
      for (const A of arms) { ctx.moveTo(A[0], A[1]); ctx.lineTo(A[2], A[3]); ctx.lineTo(A[4], A[5]); }
      ctx.stroke();
      for (const A of arms) ell(ctx, A[4], A[5], 0.3 * u * e, 0.3 * u * e);
      ctx.restore();
    }
    // rib slots (3) and sternum
    ctx.save();
    ctx.rotate(P.tilt);
    ctx.fillStyle = '#000';
    for (let i = 0; i < 3; i++) {
      const y = (-2.18 + i * 0.44) * u * sp, hw = (0.68 - i * 0.06) * u;
      ctx.beginPath(); ctx.roundRect(-hw, y, hw * 2, 0.18 * u * sp, 0.09 * u); ctx.fill();
    }
    ctx.fillStyle = '#ffffff'; ctx.fillRect(-0.09 * u, -2.3 * u * sp, 0.18 * u, 1.45 * u * sp);
    ctx.restore();
    ctx.restore();
    if (showSkull) {
      const H = L.head;
      ctx.save();
      ctx.globalAlpha *= alpha;
      ctx.translate(H.x, H.y); ctx.scale(H.sx, 1); ctx.rotate(H.rot);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, 0, 0, u * 2.4, WHITE, 0.25);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000'; ell(ctx, 0, -0.05 * H.s, 0.56 * H.s, 0.56 * H.s);
      skull(ctx, H.s, P.jaw, glowCol);
      ctx.restore();
    }
  }

  const doorU = (w, h) => Math.min(h * 0.085, w / 5.6);
  // the skull leaves the door (drawn by the global layer) while it flies high
  const skullFlying = P => P.sky < -1.5;
  function drawDoor(ctx, z, S, b) {
    const { w, h } = z, [cA] = colors(b), E = energy(b), kick = S.kick;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    // the light flickers like a tube light before it comes on
    const on = b < 6 ? 0 : b < 6.7 ? [1, 0, 0, 1, 0, 1, 1][Math.floor((b - 6) * 10)] : 1;
    if (!on) return;
    const floorY = h * 0.965, u = doorU(w, h), P = skelPose(b);
    ctx.globalCompositeOperation = 'lighter';
    // faint cone and pool of white light on the floor: maximum contrast against the red door
    const cg = ctx.createLinearGradient(0, 0, 0, floorY);
    cg.addColorStop(0, 'rgba(255,250,240,0.08)'); cg.addColorStop(1, 'rgba(255,250,240,0.02)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.moveTo(w * 0.36, 0); ctx.lineTo(w * 0.64, 0); ctx.lineTo(w, floorY); ctx.lineTo(0, floorY); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.translate(w / 2, floorY); ctx.scale(1, 0.2); glow(ctx, 0, 0, w * 0.7, WHITE, 0.85 + 0.15 * kick); ctx.restore();
    glow(ctx, w / 2, floorY - u * 5, u * 5, cA, 0.1 + 0.12 * kick * E);
    ctx.globalCompositeOperation = 'source-over';
    skeleton(ctx, w / 2, floorY, u, P, cA, 1, !skullFlying(P));
  }
  // flying skull in screen px: door position mapped with bil() and a spark trail
  function drawFlyingSkull(ctx, g, b, t) {
    const d = g.doors[0];
    if (!d || b < 33.9 || b > 36.1) return;
    const P = skelPose(b);
    if (!skullFlying(P)) return;
    const w = Math.hypot(d.pts[1][0] - d.pts[0][0], d.pts[1][1] - d.pts[0][1]), h = Math.hypot(d.pts[3][0] - d.pts[0][0], d.pts[3][1] - d.pts[0][1]);
    const u = doorU(w, h), at = bb => { const H = skelLayout(w / 2, h * 0.965, u, skelPose(bb)).head; return [bil(d.pts, H.x / w, H.y / h), H]; };
    const [[x, y], H] = at(b), s = H.s * (1 + 0.6 * clamp((-P.sky - 1.5) / 6));
    ctx.save();
    ctx.clip(g.porch);
    ctx.globalCompositeOperation = 'lighter';
    for (let j = 1; j <= 12; j++) {
      const bb = b - j * 0.035;
      if (bb < 34) break;
      const [[px, py]] = at(bb), a = 1 - j / 13, id = j + Math.floor(t * 24);
      const ox = (hash(id) - 0.5) * s * 0.5, oy = (hash(id + 0.3) - 0.5) * s * 0.5 + j * s * 0.03;
      star(ctx, px + ox, py + oy, s * 0.42 * a * (0.6 + 0.4 * hash(id + 0.7)), j % 3 ? GOLD : WHITE, a);
    }
    glow(ctx, x, y, s * 2.6, WHITE, 0.55);
    glow(ctx, x, y, s * 1.3, colors(b)[0], 0.5);
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(x, y); ctx.scale(H.sx, 1); ctx.rotate(H.rot);
    ctx.fillStyle = '#000'; ell(ctx, 0, -0.05 * s, 0.6 * s, 0.6 * s);
    skull(ctx, s, P.jaw, colors(b)[0]);
    ctx.restore();
  }

  // ---------- gable: moon (disco ball from beat 40) and witch ----------
  function moonDisc(ctx, R) {
    const g = ctx.createRadialGradient(-R * 0.3, -R * 0.3, R * 0.1, 0, 0, R);
    g.addColorStop(0, '#fffef4'); g.addColorStop(0.7, '#f2eacb'); g.addColorStop(1, '#cfc49c');
    ctx.fillStyle = g; ell(ctx, 0, 0, R, R);
    ctx.fillStyle = 'rgba(150,140,110,0.32)';
    ell(ctx, -R * 0.3, R * 0.12, R * 0.2, R * 0.16); ell(ctx, R * 0.28, -R * 0.3, R * 0.13, R * 0.11); ell(ctx, R * 0.36, R * 0.36, R * 0.1, R * 0.08);
  }
  function discoBall(ctx, R, t, cA, cB) {
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.clip();
    ctx.fillStyle = '#14141c'; ctx.fillRect(-R, -R, 2 * R, 2 * R);
    const rows = 12, rot = t * 1.4, gap = Math.max(0.6, R * 0.025), tick = Math.floor(t * 7);
    for (let j = 0; j < rows; j++) {
      const la0 = -Math.PI / 2 + (j / rows) * Math.PI, la1 = la0 + Math.PI / rows, lam = (la0 + la1) / 2;
      const y0 = Math.sin(la0) * R, y1 = Math.sin(la1) * R, rho = Math.cos(lam), n = Math.max(4, Math.round(rows * 2 * rho));
      for (let c = 0; c < n; c++) {
        const lo0 = (c / n) * TAU + rot, lo1 = lo0 + TAU / n, lm = (lo0 + lo1) / 2, cz = Math.cos(lm);
        if (cz <= 0) continue;
        const xa = Math.sin(lo0) * rho * R, xb = Math.sin(lo1) * rho * R;
        const shade = cz * (0.45 + 0.55 * Math.max(0, Math.cos(lam + 0.5) * 0.7 + 0.3 * Math.sin(lm + 0.6)));
        const hsh = hash(j * 131 + c * 17 + tick * 0.37);
        let col = mix([30, 30, 48], [225, 228, 250], clamp(shade));
        if (hsh > 0.93) col = WHITE; else if (hsh < 0.12) col = mix(col, cA, 0.75); else if (hsh < 0.2) col = mix(col, cB, 0.65);
        ctx.fillStyle = rgba(col);
        ctx.fillRect(Math.min(xa, xb) + gap / 2, Math.min(y0, y1) + gap / 2, Math.abs(xb - xa) - gap, Math.abs(y1 - y0) - gap);
      }
    }
    const sh = ctx.createRadialGradient(-R * 0.35, -R * 0.35, R * 0.1, 0, 0, R);
    sh.addColorStop(0, 'rgba(255,255,255,0.25)'); sh.addColorStop(0.45, 'rgba(0,0,0,0)'); sh.addColorStop(0.85, 'rgba(0,0,0,0.45)'); sh.addColorStop(1, 'rgba(0,0,0,0.8)');
    ctx.fillStyle = sh; ctx.fillRect(-R, -R, 2 * R, 2 * R);
    ctx.restore();
    // star-shaped flashes
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const k = fr(t * 1.7 + i / 3), id = Math.floor(t * 1.7 + i / 3) * 3 + i, a = hash(id) * TAU, d = Math.sqrt(hash(id + 0.5)) * R * 0.8;
      star(ctx, Math.cos(a) * d, Math.sin(a) * d, R * 0.5 * Math.sin(Math.PI * k), WHITE, 1);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  function star(ctx, x, y, s, col, a) {
    if (s <= 0.3 || a <= 0) return;
    glow(ctx, x, y, s * 0.8, col, 0.5 * a);
    ctx.fillStyle = rgba(mix(col, WHITE, 0.5), a);
    ctx.beginPath();
    ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.16, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.16, y); ctx.closePath();
    ctx.moveTo(x - s, y); ctx.lineTo(x, y + s * 0.16); ctx.lineTo(x + s, y); ctx.lineTo(x, y - s * 0.16); ctx.closePath();
    ctx.fill();
  }

  // witch silhouette facing +x, with a cat on the broom; flow 0..1 = speed (cape, hair and hat wave)
  function witchShape(ctx, s, t, flow, wave) {
    const fl = Math.sin(t * 9) * s * 0.05 * (0.4 + flow), fl2 = Math.sin(t * 9 - 1.2) * s * 0.05 * (0.4 + flow);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = s * 0.06;
    ctx.beginPath(); ctx.moveTo(-0.72 * s, 0.13 * s); ctx.lineTo(0.88 * s, -0.03 * s); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-0.6 * s, 0.07 * s); ctx.lineTo(-1.12 * s, -0.08 * s + fl2 * 0.5); ctx.lineTo(-1.02 * s, 0.06 * s);
    ctx.lineTo(-1.22 * s, 0.16 * s + fl2 * 0.6); ctx.lineTo(-1.04 * s, 0.24 * s); ctx.lineTo(-1.14 * s, 0.36 * s + fl2 * 0.4);
    ctx.lineTo(-0.6 * s, 0.2 * s); ctx.closePath(); ctx.fill();
    // cat
    ell(ctx, -0.45 * s, 0, 0.1 * s, 0.11 * s);
    ell(ctx, -0.39 * s, -0.13 * s, 0.07 * s, 0.065 * s);
    tri(ctx, -0.45 * s, -0.16 * s, -0.43 * s, -0.26 * s, -0.39 * s, -0.17 * s);
    tri(ctx, -0.37 * s, -0.17 * s, -0.33 * s, -0.26 * s, -0.32 * s, -0.15 * s);
    ctx.lineWidth = s * 0.035;
    ctx.beginPath(); ctx.moveTo(-0.54 * s, 0.05 * s); ctx.quadraticCurveTo(-0.72 * s, -0.02 * s, -0.66 * s, -0.22 * s + fl * 0.8); ctx.stroke();
    // cape flying backward
    ctx.beginPath();
    ctx.moveTo(0.16 * s, -0.4 * s); ctx.lineTo(0.32 * s, 0.07 * s); ctx.lineTo(-0.14 * s, 0.13 * s);
    ctx.quadraticCurveTo(-0.42 * s, 0.02 * s + fl, -0.72 * s, -0.12 * s + fl * 1.8);
    ctx.quadraticCurveTo(-0.5 * s, -0.17 * s + fl, -0.3 * s, -0.25 * s + fl * 0.4);
    ctx.quadraticCurveTo(-0.15 * s, -0.36 * s, 0, -0.44 * s);
    ctx.closePath(); ctx.fill();
    // leg and boot
    ctx.lineWidth = s * 0.075;
    ctx.beginPath(); ctx.moveTo(0.12 * s, 0.06 * s); ctx.lineTo(0.24 * s, 0.27 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.18 * s, 0.24 * s); ctx.quadraticCurveTo(0.34 * s, 0.25 * s, 0.42 * s, 0.17 * s); ctx.lineTo(0.37 * s, 0.31 * s); ctx.lineTo(0.18 * s, 0.33 * s); ctx.closePath(); ctx.fill();
    // arm: on the broom or waving
    const hx = lerp(0.46, 0.3 + 0.1 * Math.sin(t * 14), wave) * s, hy = lerp(-0.02, -0.78, wave) * s;
    ctx.lineWidth = s * 0.06;
    ctx.beginPath(); ctx.moveTo(0.14 * s, -0.3 * s); ctx.quadraticCurveTo(lerp(0.32, 0.36, wave) * s, lerp(-0.2, -0.45, wave) * s, hx, hy); ctx.stroke();
    ell(ctx, hx, hy, s * 0.045, s * 0.045);
    // head, nose, chin and hair in the wind
    ell(ctx, 0.13 * s, -0.48 * s, 0.1 * s, 0.11 * s);
    tri(ctx, 0.2 * s, -0.52 * s, 0.39 * s, -0.43 * s, 0.21 * s, -0.43 * s);
    tri(ctx, 0.14 * s, -0.41 * s, 0.26 * s, -0.36 * s, 0.21 * s, -0.43 * s);
    ctx.lineWidth = s * 0.035;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const yy = -0.5 + i * 0.06; ctx.moveTo(0.06 * s, yy * s); ctx.quadraticCurveTo(-0.1 * s, (yy + 0.02) * s + fl * (0.6 + i * 0.3), -0.3 * s, (yy + 0.12) * s + fl * (1 + i * 0.4)); }
    ctx.stroke();
    // hat: brim and cone that bends backward with speed
    ctx.beginPath(); ctx.ellipse(0.1 * s, -0.57 * s, 0.28 * s, 0.05 * s, -0.12, 0, TAU); ctx.fill();
    const tipX = (-0.16 - 0.16 * flow) * s + fl * 0.6, tipY = (-1.0 + 0.08 * flow) * s;
    ctx.beginPath(); ctx.moveTo(-0.05 * s, -0.58 * s); ctx.quadraticCurveTo(0.04 * s, -0.8 * s, tipX, tipY); ctx.quadraticCurveTo(0.12 * s, -0.8 * s, 0.25 * s, -0.61 * s); ctx.closePath(); ctx.fill();
  }

  // Catmull-Rom spline through keys [beat, x, y]
  function spline(K, tt) {
    let i = 0;
    while (i < K.length - 2 && K[i + 1][0] <= tt) i++;
    const p0 = K[Math.max(0, i - 1)], p1 = K[i], p2 = K[i + 1], p3 = K[Math.min(K.length - 1, i + 2)];
    const u = clamp((tt - p1[0]) / (p2[0] - p1[0])), u2 = u * u, u3 = u2 * u;
    const cr = (a, b, c, d) => 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (3 * b - a - 3 * c + d) * u3);
    return [cr(p0[1], p1[1], p2[1], p3[1]), cr(p0[2], p1[2], p2[2], p3[2])];
  }
  // pass 1: rises from the left wall, crosses right through the center of the moon (brakes and waves) and dives down the facade
  const W1 = [[13.5, -0.12, 1.5], [14, -0.08, 1.45], [16, 0.18, 0.98], [18, 0.4, 0.68], [19, 0.475, 0.66], [20, 0.525, 0.66], [21.5, 0.63, 0.8], [23, 0.56, 1.3], [24.5, 0.6, 1.75], [26, 0.86, 1.98], [26.5, 0.95, 2]];
  // pass 2: enters from the right wing, climbs to the gable, makes 1.5 turns around the ball and stays beside it on the hit
  const W2 = [[45.5, 1.38, 1.4], [46, 1.3, 1.35], [48, 0.92, 0.95], [50, 0.68, 0.66], [50.5, 0.68, 0.66]];
  const W3 = [[HIT + 3, 0.31, 0.66], [HIT + 3.01, 0.31, 0.66], [HIT + 3.8, 0.17, 1.15], [HIT + 4.6, -0.1, 1.7], [HIT + 5, -0.2, 1.8]];
  // witch position (gable px) on beat b; null if she isn't there
  function witchAt(b, w, h) {
    const mx = w / 2, my = h * 0.66;
    if (b >= 14 && b < 26) {
      const [x, y] = spline(W1, b);
      return { x: x * w, y: y * h, dir: 1, wave: smooth(18.6, 18.9, b) * (1 - smooth(20.1, 20.5, b)) };
    }
    if (b >= 46 && b < HIT + 4.6) {
      if (b < 50) { const [x, y] = spline(W2, b); return { x: x * w, y: y * h, dir: -1 }; }
      if (b < HIT) {
        const k = (b - 50) / 6, a = -Math.PI * 3 * easeInOut(k), rx = w * 0.18, ry = h * 0.17;
        const x = mx + Math.cos(a) * rx, y = my + Math.sin(a) * ry, vx = Math.sin(a) * (k < 1 ? 1 : 0);
        // turns around (smooth flip) when the direction changes
        return { x, y, dir: Math.sign(vx || -1) * Math.max(0.15, Math.min(1, Math.abs(vx) * 3)) * (k > 0.92 ? 1 - 2 * smooth(0.92, 1, k) : 1) || 1, level: smooth(0.85, 1, k) };
      }
      if (b < HIT + 3) return { x: w * 0.31, y: my + Math.sin(b * 2.5) * h * 0.02, dir: 1, level: 1, wave: smooth(HIT + 0.2, HIT + 0.5, b) * (1 - smooth(HIT + 2.5, HIT + 2.9, b)) };
      const [x, y] = spline(W3, b), turn = smooth(HIT + 3, HIT + 3.3, b);
      return { x: x * w, y: y * h, dir: lerp(1, -1, turn) || -0.15, alpha: 1 - smooth(HIT + 4, HIT + 4.6, b) };
    }
    return null;
  }
  function witchDraw(ctx, w, h, b, t, mx, my, rim) {
    const P = witchAt(b, w, h);
    if (!P) return;
    const s = h * 0.5, Q = witchAt(b - 0.03, w, h) || P, vx = (P.x - Q.x) / 0.03, vy = (P.y - Q.y) / 0.03;
    const sd = P.dir < 0 ? -1 : 1, dir = sd * Math.max(0.15, Math.abs(P.dir));
    const rot = clamp(sd * Math.atan2(vy, Math.abs(vx) + 1e-3) * 0.6, -0.7, 0.7) * (1 - (P.level || 0));
    const flow = clamp(Math.hypot(vx, vy) / (h * 1.2)), al = P.alpha == null ? 1 : P.alpha;
    // spark trail from the broom
    ctx.globalCompositeOperation = 'lighter';
    const bx = -1.12 * s * dir, by = 0.15 * s, cr = Math.cos(rot), sr = Math.sin(rot);
    const cols = b < 40 ? [GOLD, WHITE, GOLD, [255, 230, 150]] : [GOLD, MAG, CYAN, WHITE];
    for (let j = 1; j <= 20; j++) {
      const age = j * 0.05, Pj = witchAt(b - age / SPB, w, h);
      if (!Pj) continue;
      const k = (1 - age / 1.05) * (Pj.alpha == null ? 1 : Pj.alpha), id = j + Math.floor(t * 20);
      const x = Pj.x + bx * cr - by * sr + Math.sin(j * 1.7 + t * 3) * h * 0.02, y = Pj.y + bx * sr + by * cr + age * age * h * 0.5;
      star(ctx, x, y, s * 0.16 * k * (0.5 + 0.5 * hash(id)), cols[id % 4], k);
    }
    ctx.globalCompositeOperation = 'source-over';
    // light edge on the moon side and black silhouette on top
    const dx = mx - P.x, dy = my - P.y, dl = Math.hypot(dx, dy) || 1;
    let lx = (dx * Math.cos(-rot) - dy * Math.sin(-rot)) / dl, ly = (dx * Math.sin(-rot) + dy * Math.cos(-rot)) / dl;
    lx *= sd;
    // near the moon, the backlight surrounds her entirely
    const near = 1 - smooth(0.6, 1.4, dl / (h * 0.3));
    ctx.save();
    ctx.globalAlpha = al;
    ctx.translate(P.x, P.y); ctx.rotate(rot); ctx.scale(dir, 1);
    ctx.fillStyle = ctx.strokeStyle = rim;
    for (const [ox, oy] of near > 0.3 ? [[lx, ly], [-lx * 0.6, -ly * 0.6], [0, -1], [0, 1]] : [[lx, ly], [0, -0.5]]) {
      ctx.save(); ctx.translate(ox * s * 0.07, oy * s * 0.07); witchShape(ctx, s, t, flow, P.wave || 0); ctx.restore();
    }
    ctx.fillStyle = ctx.strokeStyle = '#050208';
    witchShape(ctx, s, t, flow, P.wave || 0);
    ctx.restore();
  }

  // the gable canvas is very distorted (narrow trapezoid at the top): here only sky and stars;
  // moon, ball and witch are drawn on the global layer, in screen px
  function drawRoof(ctx, z, S, b) {
    const { w, h } = z;
    vGradient(ctx, w, h, [[0, '#000003'], [1, '#080318']]);
    drawStars(ctx, w, h, S.T, 55, z.seed, smooth(0, 3, b));
  }
  function drawGable(ctx, g, b, t, kick) {
    const G = g.gbox, [cA, cB] = colors(b), E = energy(b);
    // the moon comes out from behind the eave in the intro; on beat 40 it spins like a coin and becomes a disco ball;
    // after the hit it spins again and the moon remains for the final bow
    const rise = easeOut((b - 0.5) / 4.5), mx = g.moon[0];
    const flipA = clamp((b - 39.5) / 1), flipB = clamp((b - HIT - 3) / 1);
    const sxm = Math.abs(Math.cos(Math.PI * (flipA + flipB))), disco = flipA >= 0.5 && flipB < 0.5;
    // the ball grows (with bounce) and rises a little so it doesn't leave the triangle
    const grow = b >= 40 ? backOut((b - 40) / 0.8) * (1 - easeInOut(flipB * 2)) : 0, mr = g.mr * (1 + 0.22 * grow);
    const my = lerp(G.y + G.h + g.mr * 1.3, g.moon[1], rise) - G.h * 0.07 * grow;
    const halo = (0.8 + 0.5 * kick * E) * rise;
    ctx.save();
    if (g.roofPath) ctx.clip(g.roofPath);
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, mx, my, mr * 2.4, disco ? cA : [150, 165, 255], 0.1 * halo);
    glow(ctx, mx, my, mr * 1.45, disco ? mix(cA, WHITE, 0.5) : [215, 222, 255], 0.3 * halo);
    const fl = flipA > 0 && flipA < 1 ? flipA : flipB > 0 && flipB < 1 ? flipB : 0;
    if (fl) glow(ctx, mx, my, mr * 2.8, WHITE, 0.9 * Math.sin(Math.PI * fl));
    ctx.globalCompositeOperation = 'source-over';
    ctx.translate(mx, my); ctx.scale(Math.max(0.02, sxm), 1);
    if (disco) discoBall(ctx, mr, t, cA, cB); else moonDisc(ctx, mr);
    ctx.restore();
    // the witch flies in front of the whole house
    ctx.save();
    ctx.translate(G.x, G.y);
    witchDraw(ctx, G.w, G.h, b, t, mx - G.x, g.moon[1] - G.y, b < 40 ? '#ffffff' : rgba(mix(cA, WHITE, 0.45), 1));
    ctx.restore();
  }

  // ---------- walls: dark stage, glow at the base and haze (the spotlights go in the global layer) ----------
  // dimming of the puddles while the ball's spots spin (the dots read better on black)
  const spotsOn = b => smooth(40, 41, b) * (1 - smooth(HIT + 2, HIT + 3.5, b));
  function drawWall(ctx, z, S, b, t) {
    const { w, h } = z, E = energy(b), [cA, cB] = colors(b), kick = S.kick;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    // on the hit the walls go dark all at once: only the burst, the neon and the confetti remain
    const tau = t - HIT_T, live = smooth(6, 8, b) * (tau < 0 ? 1 : 1 - smooth(0, 0.15, tau)) * (1 - 0.6 * spotsOn(b));
    if (live <= 0.005) return;
    ctx.globalCompositeOperation = 'lighter';
    // light pools at the foot of each spotlight (same color as its beam): the upper half is black
    const sweep = b >= 40 && b < 52 && Math.floor(b) % Math.max(1, z.count) === z.index ? kickOf(b, 3.5) : 0;
    for (let k = 0; k < 3; k++) {
      const i = z.index * 3 + k, f = [0.17, 0.5, 0.83][k], on = b < 16 ? (k === 1 ? smooth(8, 8.12, b) : 0) : smooth(16 + 0.5 * i, 16.12 + 0.5 * i, b);
      const x = f * w, a = (0.32 + 0.18 * E + 0.5 * kick * E + 0.5 * sweep) * live * Math.max(on, smooth(6, 8, b) * 0.35);
      if (a <= 0.01) continue;
      const col = i % 2 ? cB : cA, R = h * (0.25 + 0.05 * kick * E);
      ctx.save(); ctx.translate(x, h); ctx.scale(1, 0.5);
      glow(ctx, 0, 0, R * 1.6, col, a * 0.55);
      glow(ctx, 0, 0, R * 0.55, mix(col, WHITE, 0.5), a);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  return {
    name: 'Pumpkin party',
    duration: 34,
    globalClip: false,
    ambience: 0.15,
    update(S) {
      S.beat = (S.t * PARTY_BPM) / 60;
      S.kick = Math.exp(-(S.beat % 1) * 5);
      // the music is played from its score (js/audio/07-fiesta.js)
    },
    draw(ctx, z, S) {
      shapes[z.id] = z.shape;
      const b = S.beat, t = S.t;
      if (z.kind === 'window') drawWindow(ctx, z, S, b, t);
      else if (z.kind === 'door') drawDoor(ctx, z, S, b);
      else if (z.kind === 'roof') drawRoof(ctx, z, S, b);
      else drawWall(ctx, z, S, b, t);
    },
    drawGlobal(ctx, W, H, S) {
      const g = getGeo(S), b = S.beat, t = S.t, kick = S.kick;
      ctx.save();
      // own clipping (with the real triangular gable); the flying skull also crosses the porch
      ctx.clip(g.clip);
      // spotlights (additive light) that don't touch windows or the door
      ctx.globalCompositeOperation = 'lighter';
      drawBeams(ctx, g, b, t, kick);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = '#000'; ctx.fill(g.holes);
      ctx.globalCompositeOperation = 'lighter';
      drawGable(ctx, g, b, t, kick);
      ctx.globalCompositeOperation = 'lighter';
      drawSpots(ctx, g, b, t, kick);
      drawBurst(ctx, g, b, t);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      drawNeon(ctx, g, b, t, kick);
      ctx.globalCompositeOperation = 'source-over';
      drawBats(ctx, g, b, t);
      drawConfetti(ctx, g, t);
      ctx.restore();
      drawFlyingSkull(ctx, g, b, t);
    }
  };
})());
