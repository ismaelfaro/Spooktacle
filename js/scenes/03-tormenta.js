// Scene: Storm
// Rain in three layers, water running down the walls, dripping from the eave, leaves blowing in the wind and
// lightning with several flashes that reveal the house (edges in white) and whoever peeks out.
// Arc: the storm arrives (clouds over the pediment) → distant strikes with silhouettes → bolt on the right wing →
// big bolt on the pediment whose discharge runs along the edges → eyes in the dark →
// someone at the door → the storm moves away.
registerScene((() => {
  const DUR = 29, TB = 18.6, TDOOR = 23.6, TEND = 26.2;
  const frac = x => x - Math.floor(x);
  const easeInOut = k => k * k * (3 - 2 * k);
  const easeOut = k => 1 - (1 - k) * (1 - k);
  const UNIT = [[0, 0], [1, 0], [1, 1], [0, 1]];

  // pulses of each strike: [offset s, amplitude, decay 1/s]
  const P_SHEET = [[0, 0.5, 12], [0.08, 1, 8], [0.2, 0.45, 11], [0.33, 0.8, 7]];
  // far: one last flicker at 0.62 s to see the silhouette twice (already in another pose)
  const P_FAR = [[-0.16, 0.22, 26], [0, 1, 8], [0.13, 0.62, 10], [0.31, 0.4, 9], [0.62, 0.5, 9]];
  const P_DOOR = [[-0.16, 0.22, 26], [0, 1, 8], [0.13, 0.62, 10], [0.31, 0.4, 9], [0.62, 0.7, 7], [0.95, 0.55, 7], [1.3, 0.6, 6]];
  const P_NEAR = [[-0.2, 0.16, 28], [-0.09, 0.3, 24], [0, 1, 6.5], [0.1, 0.8, 8.5], [0.26, 0.62, 8]];
  // big: 90 ms of lightning over the dark house, then the flash
  const P_BIG = [[-0.4, 0.07, 30], [-0.27, 0.09, 30], [-0.13, 0.12, 30], [0, 0.25, 20], [0.09, 1.5, 13], [0.2, 0.95, 11], [0.37, 0.85, 10], [0.64, 0.7, 8]];
  // small flicker inside the clouds
  const P_MICRO = [[0, 0.6, 18], [0.07, 1, 13]];
  // cloud flashes between 6 and 18 s (every 1.2–2.5 s, position and strength by hash)
  const MICRO = (() => {
    const out = [];
    for (let t = 6, i = 0; t < 17.8; i++) {
      t += 1.2 + 1.3 * hash(i * 3.17 + 41);
      out.push({ t, a: 0.15 + 0.2 * hash(i * 5.3 + 7), u: 0.15 + 0.7 * hash(i * 2.9 + 13) });
    }
    return out;
  })();

  // sheet = flash inside the clouds; far = side light without a bolt; near/big = visible bolt
  const STRIKES = [
    { t: 1.9, kind: 'sheet', p: 0.4, u: 0.3, pulses: P_SHEET, thunder: 1.4 },
    { t: 3.2, kind: 'sheet', p: 0.55, u: 0.72, pulses: P_SHEET },
    { t: 5.0, kind: 'far', p: 0.7, lx: 0.97, ly: -0.12, win: 3, fig: 'hood', pulses: P_FAR, thunder: 1.3 },
    { t: 9.4, kind: 'far', p: 0.75, lx: 0.06, ly: -0.12, win: 0, fig: 'cat', pulses: P_FAR, thunder: 0.9 },
    { t: 11.7, kind: 'sheet', p: 0.5, u: 0.5, pulses: P_SHEET, thunder: 1.2 },
    { t: 13.6, kind: 'near', p: 0.78, bolt: 'right', lead: 0.3, win: 2, fig: 'hands', pulses: P_NEAR, thunder: 0.12 },
    { t: 16.3, kind: 'sheet', p: 0.6, u: 0.22, pulses: P_SHEET },
    { t: 17.2, kind: 'sheet', p: 0.75, u: 0.8, pulses: P_SHEET },
    { t: TB, kind: 'big', p: 1, bolt: 'apex', lead: 0.5, win: 'all', pulses: P_BIG, thunder: 0 },
    { t: TDOOR, kind: 'far', p: 0.75, lx: 0.12, ly: -0.12, door: true, pulses: P_DOOR, thunder: 1.1 },
    // closing: all windows light up empty (the visitors have left)
    { t: TEND, kind: 'far', p: 0.6, lx: 0.5, ly: -0.2, win: 'empty', soft: true, pulses: P_FAR, thunder: 1.3 },
  ];
  const STD = STRIKES.find(s => s.door);

  // wind gusts: [start, duration, leaves]
  const GUSTS = [[6.2, 4.6, 14], [14.8, 4.4, 18], [23.9, 3.6, 9]];
  const gust = t => GUSTS.reduce((g, [s, d]) => Math.max(g, pulse(t, s, s + d, d * 0.35)), 0);
  const windAt = t => 0.1 + 0.3 * gust(t) + 0.03 * Math.sin(t * 0.9);
  const rainI = t => clamp(0.3 + 0.4 * smooth(1.5, 9, t) + 0.3 * smooth(11, 16, t) - 0.35 * smooth(21, 25, t) - 0.4 * smooth(25.5, 28.3, t));
  // brighter rain sweep crossing the house with each gust: [center 0..1, strength]
  const sweepAt = t => {
    for (const [s, d] of GUSTS) if (t > s && t < s + d) return [lerp(-0.2, 1.2, easeInOut((t - s) / d)), pulse(t, s, s + d, d * 0.3)];
    return [0, 0];
  };
  const wetAt = t => 0.25 + 0.75 * smooth(3, 15, t);
  // tremor (screen px at 1080p)
  const shakeAt = t => (t >= TB ? 9 * Math.exp(-(t - TB) * 4.5) : 0) + (t >= 13.6 && t < TB ? 6 * Math.exp(-(t - 13.6) * 7) : 0);

  // brightness of a strike (no power) and main pulse in progress (-1 = still in pre-flashes)
  function env(st, d, km = 1) {
    let f = 0, pi = -1, n = 0;
    for (const [o, a, k] of st.pulses) {
      if (d < o) break;
      const v = a * Math.exp(-(d - o) * k * km);
      if (v > f) f = v;
      if (o >= 0 && a >= 0.4) pi = n++;
    }
    return [f, pi];
  }
  const lastPose = st => st.pulses.filter(p => p[0] >= 0 && p[1] >= 0.4).length - 1;

  // ---------- screen geometry ----------

  // homography between two quadrilaterals (src → dst)
  function homog(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
    }
    const M = solveLinear(A, b);
    if (!M || !M.every(Number.isFinite)) {
      return (x, y) => [lerp(lerp(dst[0][0], dst[1][0], x), lerp(dst[3][0], dst[2][0], x), y), lerp(lerp(dst[0][1], dst[1][1], x), lerp(dst[3][1], dst[2][1], x), y)];
    }
    return (x, y) => { const q = M[6] * x + M[7] * y + 1; return [(M[0] * x + M[1] * y + M[2]) / q, (M[3] * x + M[4] * y + M[5]) / q]; };
  }

  // midpoint displacement: broken line from a to b
  function jag(ax, ay, bx, by, rough, depth, r) {
    let pts = [[ax, ay], [bx, by]], off = Math.hypot(bx - ax, by - ay) * rough;
    for (let it = 0; it < depth; it++) {
      const n = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const [px, py] = pts[i - 1], [qx, qy] = pts[i], dx = qx - px, dy = qy - py, l = Math.hypot(dx, dy) || 1, d = (r() - 0.5) * off;
        n.push([(px + qx) / 2 - (dy / l) * d, (py + qy) / 2 + (dx / l) * d], pts[i]);
      }
      pts = n; off *= 0.52;
    }
    return pts;
  }

  // points of a line that fall inside any window
  const inWins = (pts, wins, pad) => pts.reduce((n, [x, y]) => n + (wins.some(w => x > w.x0 - pad && x < w.x1 + pad && y > w.y0 - pad && y < w.y1 + pad) ? 1 : 0), 0);

  // bolt with branches; neither the trunk nor the branches cover the windows (silhouettes go there)
  function genBolt(a, b, seed, U, nBr, wins, pad) {
    let main = null, r = null, best = Infinity;
    for (let tr = 0; tr < 12 && best > 0; tr++) {
      const rr = rng(seed + tr * 101), m = jag(a[0], a[1], b[0], b[1], 0.2, 6, rr), n = inWins(m, wins, pad * 0.5);
      if (n < best) { best = n; main = m; r = rr; }
    }
    const N = main.length, len = Math.hypot(b[0] - a[0], b[1] - a[1]), br = [];
    for (let i = 0; i < nBr; i++) {
      for (let tr = 0; tr < 6; tr++) {
        const si = 4 + Math.floor(r() * N * 0.72), [sx, sy] = main[si], [nx, ny] = main[Math.min(N - 1, si + 3)];
        const dir = Math.atan2(ny - sy, nx - sx) + (r() < 0.5 ? -1 : 1) * (0.35 + r() * 0.6), l = len * (0.12 + r() * 0.22);
        const pts = jag(sx, sy, sx + Math.cos(dir) * l, sy + Math.sin(dir) * l, 0.3, 4, r);
        if (inWins(pts, wins, pad * 0.5)) continue;
        br.push({ pts, s: si / N, w: 0.55 });
        const [tx, ty] = pts[4 + Math.floor(r() * 8)], d2 = dir + (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.5), l2 = l * (0.3 + r() * 0.3);
        const sub = jag(tx, ty, tx + Math.cos(d2) * l2, ty + Math.sin(d2) * l2, 0.3, 3, r);
        if (!inWins(sub, wins, pad * 0.5)) br.push({ pts: sub, s: si / N + 0.06, w: 0.32 });
        break;
      }
    }
    return { main, br, a, b, lw: (nBr > 6 ? 5.6 : 4.4) * U };
  }

  // how many samples of the segment a→b fall inside a window (so the bolt doesn't cover silhouettes)
  function hits(a, b, wins, pad) {
    let n = 0;
    for (let k = 1; k < 24; k++) {
      const x = lerp(a[0], b[0], k / 24), y = lerp(a[1], b[1], k / 24);
      for (const w of wins) if (x > w.x0 - pad && x < w.x1 + pad && y > w.y0 - pad && y < w.y1 + pad) n++;
    }
    return n;
  }

  let geo = null;
  function geoOf(S) {
    const Z = S.screenZones, W = innerWidth, H = innerHeight;
    let sig = W * 0.37 + H * 1.13 + Z.length;
    Z.forEach((k, i) => { for (const p of k.pts) sig += p[0] * (i + 1.31) + p[1] * (i + 2.17) * 1.618; });
    if (geo && geo.sig === sig) return geo;
    const U = H / 1080, maps = {};
    for (const k of Z) maps[k.id] = homog(UNIT, k.pts);
    const box = Z.length
      ? { x0: Math.min(...Z.map(k => k.x0)), y0: Math.min(...Z.map(k => k.y0)), x1: Math.max(...Z.map(k => k.x1)), y1: Math.max(...Z.map(k => k.y1)) }
      : { x0: 0, y0: 0, x1: W, y1: H };
    const of = kind => Z.filter(k => k.kind === kind);
    const walls = of('wall'), wins = of('window'), doors = of('door'), roof = of('roof')[0];
    const area = k => (k.x1 - k.x0) * (k.y1 - k.y0);
    const big = wins.reduce((a, b) => (!a || area(b) > area(a) ? b : a), null);
    const rank = {};
    let rk = 0;
    for (const k of [...wins].sort((a, b) => a.cx - b.cx)) if (k !== big) rank[k.id] = rk++;

    // big bolt: from the pediment's apex to the ground of the wall below, dodging windows
    const bolts = {}, pad = 14 * U;
    const top = roof || walls.reduce((a, b) => (!a || area(b) > area(a) ? b : a), null);
    let apex = null;
    if (top) {
      apex = maps[top.id](0.5, roof ? 0.03 : 0.02);
      const under = walls.filter(k => k !== top && k.x0 < apex[0] && k.x1 > apex[0] && k.y0 > apex[1]).sort((a, b) => a.y0 - b.y0)[0];
      let end = maps[top.id](0.42, 1), best = Infinity;
      if (under) {
        for (let i = 0; i <= 20; i++) {
          const p = maps[under.id](0.06 + 0.88 * (i / 20), 0.985), dx = Math.abs(p[0] - apex[0]) / (under.x1 - under.x0);
          const score = hits(apex, p, wins, pad) * 100 + Math.abs(dx - 0.18) * 10;
          if (score < best) { best = score; end = p; }
        }
      }
      bolts.apex = genBolt(apex, end, 1307, U, 8, wins, pad);
    }
    // right-wing bolt: drops from the sky (above the eave) to the ground, between the window and the corner
    const side = walls.filter(k => k !== top).sort((a, b) => b.cx - a.cx)[0];
    if (side) {
      let pair = null, best = Infinity;
      for (let i = 0; i <= 16; i++) {
        const u = 0.5 + 0.35 * (i / 16), e = maps[side.id](u, 0), a = [e[0] - 0.03 * H, e[1] - 0.1 * H], b = maps[side.id](clamp(u + 0.05, 0.04, 0.96), 1);
        const score = hits(a, b, wins, 0) * 8 + Math.abs(u - 0.66) * 10;
        if (score < best) { best = score; pair = [a, b]; }
      }
      bolts.right = genBolt(pair[0], pair[1], 2711, U, 7, wins, 0);
      bolts.right.lw = 5.5 * U;
    }
    // zones the big bolt crosses: there the whole wall is not whitened by the flash (the bolt would lose its edge)
    const crossed = {};
    if (bolts.apex) for (const B of [bolts.apex]) for (const [x, y] of B.main) for (const k of Z) if (x > k.x0 && x < k.x1 && y > k.y0 && y < k.y1) crossed[k.id] = 1;

    // eave drip (top edge of the walls, except where the pediment covers it)
    const r = rng(4242), drips = [], splash = [];
    for (const k of walls) {
      const m = maps[k.id], [ax, ay] = m(0, 0), [bx, by] = m(1, 0), n = Math.floor(Math.hypot(bx - ax, by - ay) / (30 * U));
      for (let i = 0; i < n; i++) {
        const u = (i + 0.3 + r() * 0.4) / n, [x, y] = m(u, 0), yb = m(u, 1)[1];
        if (roof && k !== roof && x > roof.x0 && x < roof.x1 && Math.abs(y - roof.y1) < 0.045 * H) continue;
        drips.push({ x, y, yb, per: 1.3 + r() * 1.7, ph: r(), R: (2.3 + r() * 1.6) * U });
      }
    }
    // splashes: ground under the walls, sills and the door step
    for (const k of [...walls, ...wins, ...doors]) {
      const m = maps[k.id], [ax, ay] = m(0, 1), [bx, by] = m(1, 1), n = Math.floor(Math.hypot(bx - ax, by - ay) / (15 * U));
      for (let i = 0; i < n; i++) {
        const [x, y] = m(0.02 + r() * 0.96, 1);
        splash.push({ x, y: y - 1.5 * U, per: 0.45 + r() * 0.5, ph: r(), rank: r(), s: (k.kind === 'wall' ? 1 : 0.75) * U });
      }
    }
    geo = { sig, U, W, H, box, maps, big: big?.id, rank, apex, bolts, drips, splash, crossed };
    return geo;
  }

  // outlines of the zones (on screen). path = clip (whole perimeter); epath = only the real architecture:
  // whole windows and door, the two pediment slopes and the eave (top edge) of each wall.
  // zones = those same edges subdivided for the electric discharge; wpath = windows only
  const shapes = {};
  let shapeVer = 0, outl = null;
  function archRuns(kind, uv) {
    const n = uv.length, keep = i => {
      const [u1, v1] = uv[i], [u2, v2] = uv[(i + 1) % n];
      if (kind === 'roof') return !(v1 > 0.9 && v2 > 0.9);
      if (kind === 'wall') return v1 < 0.06 && v2 < 0.06;
      return true;
    };
    const ks = uv.map((_, i) => keep(i));
    if (ks.every(Boolean)) return [{ idx: [...uv.keys(), 0], closed: true }];
    const s0 = ks.findIndex(k => !k), runs = [];
    let cur = null;
    for (let j = 1; j <= n; j++) {
      const i = (s0 + j) % n;
      if (ks[i]) { if (!cur) cur = [i]; cur.push((i + 1) % n); }
      else if (cur) { runs.push({ idx: cur, closed: false }); cur = null; }
    }
    if (cur) runs.push({ idx: cur, closed: false });
    return runs;
  }
  function outlinesOf(S, G) {
    const sig = G.sig + shapeVer * 0.123;
    if (outl && outl.sig === sig) return outl;
    const U = G.U, step = 7 * U, path = new Path2D(), epath = new Path2D(), wpath = new Path2D(), zones = [], [ax, ay] = G.apex || [G.W / 2, 0], speed = 2300 * U;
    S.screenZones.forEach((k, zi) => {
      const m = G.maps[k.id], uv = shapes[k.id] || [[0, 1], [0, 0], [1, 0], [1, 1]], poly = uv.map(([u, v]) => m(u, v));
      path.moveTo(poly[0][0], poly[0][1]);
      for (let i = 1; i < poly.length; i++) path.lineTo(poly[i][0], poly[i][1]);
      path.closePath();
      archRuns(k.kind, uv).forEach((run, ri) => {
        const pts = run.idx.map(i => poly[i]);
        for (const P of k.kind === 'window' ? [epath, wpath] : [epath]) pts.forEach(([x, y], i) => (i ? P.lineTo(x, y) : P.moveTo(x, y)));
        const xs = [], ys = [];
        for (let i = 0; i < pts.length - 1; i++) {
          const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step));
          for (let j = 0; j < n; j++) { xs.push(lerp(x1, x2, j / n)); ys.push(lerp(y1, y2, j / n)); }
        }
        xs.push(pts[pts.length - 1][0]); ys.push(pts[pts.length - 1][1]);
        const n = xs.length, nx = new Float32Array(n), ny = new Float32Array(n), cum = new Float32Array(n), arr = new Float32Array(n);
        let c = 0, best = Infinity;
        for (let i = 0; i < n; i++) {
          const p = Math.max(0, i - 1), q = Math.min(n - 1, i + 1), dx = xs[q] - xs[p], dy = ys[q] - ys[p], l = Math.hypot(dx, dy) || 1;
          nx[i] = -dy / l; ny[i] = dx / l;
          if (i) cum[i] = cum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
          const d = Math.hypot(xs[i] - ax, ys[i] - ay);
          if (d < best) { best = d; c = i; }
        }
        const total = cum[n - 1];
        for (let i = 0; i < n; i++) { const a = Math.abs(cum[i] - cum[c]); arr[i] = (best + (run.closed ? Math.min(a, total - a) : a)) / speed; }
        zones.push({ xs: Float32Array.from(xs), ys: Float32Array.from(ys), nx, ny, arr, k: zi * 17.3 + ri * 5.1 });
      });
    });
    outl = { sig, path, epath, wpath, zones };
    return outl;
  }

  // ---------- light of the instant ----------

  function lightPos(st, G) {
    if (st.lx != null) return [st.lx, st.ly, 1.15];
    const B = G.bolts[st.bolt];
    if (!B) return [0.5, -0.2, 1.3];
    const p = B.main[Math.floor(B.main.length * (st.kind === 'big' ? 0.3 : 0.45))];
    return [p[0] / G.W, p[1] / G.H, st.kind === 'big' ? 1.05 : 0.8];
  }

  let memoK = NaN, memo = null;
  function light(S) {
    const G = geoOf(S), key = S.t + G.sig * 1e-7;
    if (key === memoK && memo) return memo;
    const t = S.t, L = { F: 0, edge: 0, wedge: 0, after: 0, sky: 0, skyU: 0.5, lx: 0.5, ly: -0.3, R: 1.3 };
    for (const m of MICRO) {
      const d = t - m.t;
      if (d < 0 || d > 0.6) continue;
      const ep = env({ pulses: P_MICRO }, d)[0] * m.a;
      if (ep > L.sky) { L.sky = ep; L.skyU = m.u; }
    }
    for (const st of STRIKES) {
      const d = t - st.t;
      if (d < -0.7 || d > 6) continue;
      const ep = env(st, d)[0] * st.p;
      if (st.soft) {
        L.wedge = Math.max(L.wedge, ep);
        L.sky = Math.max(L.sky, ep * 0.5);
        if (ep * 0.35 >= L.F) { L.F = ep * 0.35; [L.lx, L.ly, L.R] = lightPos(st, G); }
        continue;
      }
      if (st.kind === 'sheet') {
        if (ep > L.sky) { L.sky = ep; L.skyU = st.u; }
        L.F = Math.max(L.F, ep * 0.12);
        continue;
      }
      if (d >= 0) L.after = Math.max(L.after, st.p * Math.exp(-d * 1.5));
      L.edge = Math.max(L.edge, ep);
      if (ep >= L.F) { L.F = ep; [L.lx, L.ly, L.R] = lightPos(st, G); }
    }
    memoK = key; memo = L;
    return L;
  }

  // lightning light on a zone: radial gradient from the source (in screen coords 0..1)
  function lightZone(ctx, z, L, k, G) {
    const F = L.F * k;
    if (F < 0.004) return;
    const { w, h } = z, xs = z.pts.map(p => p[0]), ys = z.pts.map(p => p[1]);
    const bx0 = Math.min(...xs), by0 = Math.min(...ys), bw = Math.max(...xs) - bx0 || 1, bh = Math.max(...ys) - by0 || 1;
    const px = ((L.lx - bx0) / bw) * w, py = ((L.ly - by0) / bh) * h, R = L.R * (h / bh), I = Math.min(F, 1) * 0.55;
    const g = ctx.createRadialGradient(px, py, 0, px, py, R);
    g.addColorStop(0, rgba([220, 228, 255], I));
    g.addColorStop(0.35, rgba([170, 185, 255], I * 0.62));
    g.addColorStop(1, rgba([110, 125, 220], I * 0.16));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // flash of the big bolt: everything goes white for an instant
    if (F > 1 && !(G && G.crossed[z.id])) { ctx.fillStyle = rgba([250, 252, 255], 0.5 * clamp((F - 1) * 2.2)); ctx.fillRect(0, 0, w, h); }
  }

  function zoneShake(ctx, z, t) {
    const a = shakeAt(t);
    if (a > 0.05) shake(ctx, a * (innerHeight / 1080) * (z.w / (z.cssW || z.w)), t, 1);
  }

  // ---------- walls: running water ----------

  function makeRivs(w, h, seed) {
    const r = rng(seed + 17), n = clamp(Math.round((2.2 * w) / h), 3, 6), N = 24, list = [];
    for (let i = 0; i < n; i++) {
      const xs = new Float32Array(N + 1);
      let x = ((i + 0.15 + r() * 0.7) / n) * w, dx = 0;
      for (let k = 0; k <= N; k++) {
        dx = dx * 0.4 + (r() - 0.5) * w * 0.0022;
        if (r() < 0.08) dx += (r() - 0.5) * w * 0.008;
        x += dx; xs[k] = x;
      }
      list.push({ xs, per: 3.2 + r() * 3.5, ph: r(), steps: 3 + Math.floor(r() * 3), rank: r() });
    }
    return list;
  }

  function rivulets(ctx, z, t, F, wet) {
    const { w, h } = z, list = cached(z, 'riv', () => makeRivs(w, h, z.seed)), N = 24, lw = Math.max(2, h * 0.013), dy = h / N;
    const P = [new Path2D(), new Path2D(), new Path2D()], heads = new Path2D();
    for (const R of list) {
      if (R.rank > wet) continue;
      const xAt = y => { const f = clamp(y / h) * N, i = Math.min(N - 1, Math.floor(f)); return lerp(R.xs[i], R.xs[i + 1], f - i); };
      const seg = (p, ya, yb) => {
        if (yb <= ya) return;
        p.moveTo(xAt(ya), ya);
        for (let y = Math.ceil(ya / dy) * dy; y < yb; y += dy) p.lineTo(xAt(y), y);
        p.lineTo(xAt(yb), yb);
      };
      // moves in jerks (stops and starts), like real water
      const k = frac(t / R.per + R.ph), q = k * R.steps, i = Math.floor(q), f = q - i;
      const yh = ((i + f * f * (3 - 2 * f)) / R.steps) * h * 1.15, sp = 6 * f * (1 - f);
      const len = h * 0.55 * smooth(0, 0.35, k) * (1 - smooth(0.8, 1, k)), top = yh - len;
      const ya = Math.max(0, top), yb = Math.min(yh, h);
      seg(P[0], ya, Math.min(yb, top + len * 0.45));
      seg(P[1], Math.max(ya, top + len * 0.45), Math.min(yb, top + len * 0.8));
      seg(P[2], Math.max(ya, top + len * 0.8), yb);
      if (yh < h) { const hx = xAt(yh), ry = lw * (1.2 + sp * 0.9); heads.moveTo(hx + lw * 1.1, yh); heads.ellipse(hx, yh, lw * 1.1, ry, 0, 0, TAU); }
    }
    ctx.lineCap = 'round';
    ctx.lineWidth = lw * 1.6;
    // with the flash the wet trickle looks darker than the lit wall
    if (F > 0.05) P.forEach((p, i) => { ctx.strokeStyle = rgba([20, 30, 70], F * (0.06 + i * 0.06)); ctx.stroke(p); });
    ctx.lineWidth = lw;
    P.forEach((p, i) => { ctx.strokeStyle = rgba([150, 180, 250], 0.25 + i * 0.13); ctx.stroke(p); });
    ctx.fillStyle = rgba([230, 240, 255], 0.65 + 0.35 * F);
    ctx.fill(heads);
  }

  function drawWall(ctx, z, S, L) {
    const { w, h } = z, t = S.t;
    ctx.fillStyle = '#04050d';
    ctx.fillRect(0, 0, w, h);
    zoneShake(ctx, z, t);
    lightZone(ctx, z, L, 1, geoOf(S));
    if (L.F > 0.03) {
      // eave shadow: the light comes from above
      const g = ctx.createLinearGradient(0, 0, 0, h * 0.16);
      g.addColorStop(0, rgba([0, 0, 0], 0.6 * clamp(L.F)));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h * 0.16);
    }
    rivulets(ctx, z, t, clamp(L.F), wetAt(t));
    // low haze that glows with the lightning
    if (L.F > 0.02) {
      const g = ctx.createLinearGradient(0, h * 0.6, 0, h);
      g.addColorStop(0, 'rgba(150,170,230,0)');
      g.addColorStop(1, rgba([150, 170, 230], 0.22 * clamp(L.F)));
      ctx.fillStyle = g;
      ctx.fillRect(0, h * 0.6, w, h * 0.4);
    }
  }

  // ---------- pediment: storm sky ----------

  function blob(c, x, y, r, sq, stops) {
    c.save();
    c.translate(x, y); c.scale(1.8, sq);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
    for (const [o, col, a] of stops) g.addColorStop(o, rgba(col, a));
    c.fillStyle = g;
    c.fillRect(-r, -r, 2 * r, 2 * r);
    c.restore();
  }

  // two horizontally repeatable cloud layers (cumulus banks): dark and lit version
  function makeClouds(w, h, seed) {
    return [0, 1].map(li => {
      const r = rng(seed * 13 + li * 101 + 7), W = Math.ceil(w * 1.5), banks = li ? 4 : 6;
      const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = Math.ceil(h); return c; };
      const dark = mk(), lit = mk(), dc = dark.getContext('2d'), lc = lit.getContext('2d');
      for (let b = 0; b < banks; b++) {
        const bx = r() * W, by = h * (li ? 0.55 + r() * 0.4 : 0.2 + r() * 0.5), n = 9 + Math.floor(r() * 5);
        for (let i = 0; i < n; i++) {
          const a = r() * TAU, k = r(), rad = h * (li ? 0.2 : 0.14) * (1.35 - k * 0.7);
          const x = bx + Math.cos(a) * k * h * 0.7, y = by + Math.sin(a) * k * h * 0.13 - k * h * 0.05, sq = 0.6 + r() * 0.2;
          for (const ox of [x - W, x, x + W]) {
            if (ox + rad * 1.8 < 0 || ox - rad * 1.8 > W) continue;
            blob(dc, ox, y, rad, sq, [[0, [4, 5, 13], 0.97], [0.65, [5, 6, 16], 0.85], [1, [6, 8, 20], 0]]);
            blob(lc, ox, y + rad * 0.15, rad, sq, [[0, [215, 225, 255], 0.75], [0.5, [165, 180, 250], 0.55], [0.85, [110, 125, 220], 0.2], [1, [90, 100, 200], 0]]);
          }
        }
      }
      // the faint silver edge is already baked into the dark version
      dc.globalCompositeOperation = 'lighter';
      dc.globalAlpha = li ? 0.25 : 0.18;
      dc.drawImage(lit, 0, 0);
      return { dark, lit, W, v: (li ? 0.05 : 0.028) * w };
    });
  }

  // the pediment is very distorted (it measures little at the top): the sky is painted on the global layer,
  // clipped to the triangle on screen, so the clouds don't come out squashed
  let skyC = null;
  function skyOf(S, G) {
    const roof = S.screenZones.find(k => k.kind === 'roof');
    if (!roof) return null;
    const key = G.sig + shapeVer * 0.123;
    if (skyC && skyC.key === key) return skyC;
    const m = G.maps[roof.id], poly = (shapes[roof.id] || [[0, 1], [0.5, 0], [1, 1]]).map(([u, v]) => m(u, v));
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys);
    const w = Math.max(8, Math.max(...xs) - x0), h = Math.max(8, Math.max(...ys) - y0), path = new Path2D();
    poly.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y)));
    path.closePath();
    const tmp = document.createElement('canvas');
    tmp.width = Math.ceil(w); tmp.height = Math.ceil(h);
    skyC = { key, path, x0, y0, w, h, layers: makeClouds(w, h, 77), tmp };
    return skyC;
  }

  function drawSkyG(ctx, S, G, L) {
    const K = skyOf(S, G);
    if (!K) return;
    const { w, h, layers } = K, t = S.t, xs = layers.map(c => frac((t * c.v) / c.W) * c.W - c.W);
    ctx.save();
    ctx.clip(K.path);
    ctx.translate(K.x0, K.y0);
    vGradient(ctx, w, h, [[0, '#010207'], [1, '#070a1e']]);
    const litA = clamp(L.edge * 1.2);
    layers.forEach((c, i) => {
      ctx.drawImage(c.dark, xs[i], 0); ctx.drawImage(c.dark, xs[i] + c.W, 0);
      if (litA < 0.01) return;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = litA * (i ? 1 : 0.7);
      ctx.drawImage(c.lit, xs[i], 0); ctx.drawImage(c.lit, xs[i] + c.W, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    });
    // lightning inside the clouds: only the ones around it are lit
    if (L.sky > 0.01) {
      const tc = K.tmp.getContext('2d'), cx = L.skyU * w, cy = h * 0.6;
      tc.globalCompositeOperation = 'source-over';
      tc.clearRect(0, 0, K.tmp.width, K.tmp.height);
      layers.forEach((c, i) => { tc.drawImage(c.lit, xs[i], 0); tc.drawImage(c.lit, xs[i] + c.W, 0); });
      tc.globalCompositeOperation = 'destination-in';
      const g = tc.createRadialGradient(cx, cy, 0, cx, cy, w * 0.4);
      g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.45, 'rgba(0,0,0,0.65)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      tc.fillStyle = g;
      tc.fillRect(0, 0, K.tmp.width, K.tmp.height);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(L.sky * 1.8);
      ctx.drawImage(K.tmp, 0, 0);
      ctx.globalAlpha = 1;
      glow(ctx, cx, cy, w * 0.28, [150, 165, 255], L.sky * 0.5);
      ctx.globalCompositeOperation = 'source-over';
    }
    // strike light (from its source, in screen px)
    const F = Math.min(L.F, 1) * 0.45;
    if (F > 0.004) {
      const px = L.lx * G.W - K.x0, py = L.ly * G.H - K.y0, R = L.R * G.H, g = ctx.createRadialGradient(px, py, 0, px, py, R);
      g.addColorStop(0, rgba([235, 240, 255], F)); g.addColorStop(0.35, rgba([190, 202, 255], F * 0.6)); g.addColorStop(1, rgba([110, 125, 220], F * 0.16));
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
  }

  // ---------- silhouettes (unit space: base at y=0, height 1, up = negative y) ----------

  function hoodShape(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.58, 0.08);
    ctx.bezierCurveTo(-0.56, -0.3, -0.46, -0.5, -0.26, -0.57);
    ctx.bezierCurveTo(-0.29, -0.8, -0.15, -0.97, 0.06, -1.0);
    ctx.bezierCurveTo(0.21, -0.9, 0.29, -0.74, 0.26, -0.57);
    ctx.bezierCurveTo(0.46, -0.5, 0.56, -0.3, 0.58, 0.08);
    ctx.closePath();
    ctx.fill();
  }

  // open hand with fingers up; claw = long claws
  function handShape(ctx, claw) {
    ell(ctx, 0, 0, 0.17, 0.21);
    ctx.lineCap = 'round';
    ctx.lineWidth = claw ? 0.075 : 0.1;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = -0.42 + i * 0.28, l = (claw ? 0.62 : 0.46) * (i === 1 || i === 2 ? 1 : 0.86);
      ctx.moveTo(Math.sin(a) * 0.12, -0.12);
      ctx.quadraticCurveTo(Math.sin(a) * l * 0.75, -l * 0.6, Math.sin(a) * l * 0.95 + (claw ? 0.05 : 0), -l);
    }
    ctx.moveTo(-0.13, 0.02);
    ctx.quadraticCurveTo(-0.3, -0.02, -0.36, -0.2);
    ctx.stroke();
  }

  function witchShape(ctx) {
    ctx.save();
    ctx.rotate(-0.05);
    ell(ctx, 0.02, -0.56, 0.46, 0.045);
    ctx.beginPath();
    ctx.moveTo(-0.22, -0.56); ctx.lineTo(0.2, -0.57);
    ctx.quadraticCurveTo(0.08, -0.72, 0.06, -0.86);
    ctx.quadraticCurveTo(0.12, -0.96, 0.26, -0.98);
    ctx.quadraticCurveTo(0.06, -1.03, -0.03, -0.9);
    ctx.quadraticCurveTo(-0.12, -0.72, -0.22, -0.56);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // mane
    ctx.beginPath();
    ctx.moveTo(-0.16, -0.56); ctx.lineTo(-0.44, -0.42); ctx.lineTo(-0.36, -0.34); ctx.lineTo(-0.5, -0.18); ctx.lineTo(-0.2, -0.26);
    ctx.closePath(); ctx.fill();
    // profile: hooked nose, chin and shoulders
    ctx.beginPath();
    ctx.moveTo(-0.18, -0.54);
    ctx.quadraticCurveTo(-0.26, -0.4, -0.2, -0.28);
    ctx.quadraticCurveTo(-0.5, -0.2, -0.56, 0.08);
    ctx.lineTo(0.52, 0.08);
    ctx.quadraticCurveTo(0.44, -0.16, 0.12, -0.24);
    ctx.lineTo(0.16, -0.3);
    ctx.quadraticCurveTo(0.25, -0.32, 0.2, -0.36);
    ctx.lineTo(0.15, -0.37);
    ctx.lineTo(0.36, -0.41);
    ctx.quadraticCurveTo(0.22, -0.45, 0.18, -0.5);
    ctx.lineTo(0.17, -0.55);
    ctx.closePath(); ctx.fill();
  }

  function tophatShape(ctx) {
    ctx.beginPath();
    ctx.moveTo(-0.56, 0.08);
    ctx.quadraticCurveTo(-0.53, -0.3, -0.2, -0.38);
    ctx.lineTo(-0.07, -0.45); ctx.lineTo(0.07, -0.45); ctx.lineTo(0.2, -0.38);
    ctx.quadraticCurveTo(0.53, -0.3, 0.56, 0.08);
    ctx.closePath(); ctx.fill();
    ell(ctx, 0, -0.58, 0.13, 0.16);
    ell(ctx, 0, -0.71, 0.24, 0.035);
    ctx.beginPath();
    ctx.moveTo(-0.13, -0.72); ctx.lineTo(-0.15, -1.0); ctx.lineTo(0.15, -1.0); ctx.lineTo(0.13, -0.72);
    ctx.closePath(); ctx.fill();
  }

  // cat with arched back (looks left); puff = bristles
  function catShape(ctx, puff) {
    const arch = 0.85 + 0.15 * puff;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = 0.17;
    ctx.beginPath(); ctx.moveTo(-0.34, -0.02); ctx.bezierCurveTo(-0.36, -0.8 * arch, 0.36, -0.8 * arch, 0.34, -0.02); ctx.stroke();
    ell(ctx, 0, -0.55 * arch, 0.3, 0.13);
    if (puff > 0.5) for (let i = 0; i < 7; i++) {
      const a = Math.PI * (1.15 + i * 0.1), x = Math.cos(a) * 0.3, y = -0.55 * arch + Math.sin(a) * 0.16;
      tri(ctx, x - 0.04, y + 0.02, x + 0.04, y + 0.02, x * 1.15, y - 0.09);
    }
    // curled tail
    ctx.lineWidth = 0.075;
    ctx.beginPath(); ctx.moveTo(0.3, -0.3); ctx.bezierCurveTo(0.6, -0.4, 0.58, -0.9, 0.4, -0.96); ctx.quadraticCurveTo(0.3, -0.98, 0.32, -0.88); ctx.stroke();
    // head and ears
    ell(ctx, -0.46, -0.5, 0.16, 0.14);
    tri(ctx, -0.6, -0.52, -0.6, -0.76, -0.47, -0.6);
    tri(ctx, -0.42, -0.6, -0.33, -0.76, -0.31, -0.5);
  }

  const FIGS = {
    hood: { draw: hoodShape, eyes: [[-0.065, -0.72], [0.065, -0.72]], er: 0.032, col: [255, 40, 25] },
    giant: {
      draw(ctx, pose) {
        hoodShape(ctx);
        // in the last flashes the hands appear pressed against the glass
        if (pose >= 2) for (const s of [-1, 1]) { ctx.save(); ctx.translate(s * 0.62, -0.5 + (pose - 2) * 0.09); ctx.rotate(s * 0.22); ctx.scale(0.95, 0.95); handShape(ctx, true); ctx.restore(); }
      },
      eyes: [[-0.065, -0.72], [0.065, -0.72]], er: 0.03, col: [255, 40, 25],
    },
    // red door: almost-white eyes (red on red doesn't show)
    door: { draw: hoodShape, eyes: [[-0.075, -0.72], [0.075, -0.72]], er: 0.05, col: [255, 200, 120], core: [255, 245, 220] },
    witch: { draw: witchShape, eyes: [[0.1, -0.455]], er: 0.032, col: [120, 255, 80] },
    tophat: { draw: tophatShape, eyes: [[-0.05, -0.6], [0.05, -0.6]], er: 0.026, col: [255, 190, 40] },
    cat: { draw: (ctx, pose) => catShape(ctx, pose >= 1 ? 1 : 0), eyes: [[-0.52, -0.5], [-0.41, -0.5]], er: 0.035, col: [205, 255, 60] },
    hands: {
      draw(ctx, pose) {
        // hands pressed to the glass that slide with each flash
        for (const [s, from] of [[-1, 0], [1, 1]]) {
          if (pose < from) continue;
          ctx.save(); ctx.translate(s * 0.62, s * 0.06); ctx.rotate(s * 0.18); handShape(ctx, false); ctx.restore();
        }
      },
    },
  };

  // where each silhouette goes in the zone (w×h) according to the flash: [x, base, height]
  function place(type, w, h, pose) {
    const p = Math.max(0, pose);
    switch (type) {
      case 'hood': return [w * (0.36 + 0.07 * p), h * 1.02, h * (0.8 + 0.1 * p)];
      case 'giant': return [w * 0.5, h * (1.05 + 0.1 * p), h * (0.95 + 0.17 * p)];
      case 'witch': return [w * (0.42 + 0.03 * p), h * 1.02, h * (0.96 + 0.05 * p)];
      case 'tophat': return [w * (0.62 - 0.05 * p), h * 1.02, h * (0.86 + 0.06 * p)];
      case 'cat': return [w * (0.55 - 0.03 * p), h * 0.99, h * (0.8 + 0.04 * p)];
      case 'hands': return [w * 0.5, h * (0.5 + 0.08 * p), h * 0.78];
      case 'door': return [w * 0.5, h * (1.04 - 0.01 * p), h * (0.64 + 0.04 * p)];
      default: return [w * 0.5, h * 0.64, w * 1.25];
    }
  }

  function eye(ctx, x, y, r, col, open, core) {
    if (open <= 0.01) return;
    glow(ctx, x, y, r * 6, col, 0.4 * Math.min(1, open * 2));
    ctx.fillStyle = rgba(core || mix(col, [255, 255, 255], 0.5));
    ell(ctx, x, y, r * 1.25, r * 0.8 * open);
    ctx.fillStyle = rgba(mix(col, [40, 0, 0], 0.6));
    ell(ctx, x, y, r * 0.25, r * 0.7 * open);
  }

  function figure(ctx, type, w, h, pose, sil, open, ek = 1) {
    const F = FIGS[type], [x, y, s] = place(type, w, h, pose);
    if (sil > 0) {
      ctx.save();
      ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = ctx.strokeStyle = rgba([0, 0, 0], sil);
      F.draw(ctx, pose);
      ctx.restore();
    }
    if (F.eyes && open > 0.01) for (const [ex, ey] of F.eyes) eye(ctx, x + ex * s, y + ey * s, F.er * s * ek, F.col, open, F.core);
  }

  // eyes: open with the second flash, blink and close at the end
  function eyeOpen(d, off) {
    let o = smooth(0.1, 0.22, d) * (1 - smooth(off - 0.3, off, d));
    if (off > 2) { const b = off * 0.5; o *= 1 - pulse(d, b, b + 0.26, 0.1); }
    return o;
  }

  // ---------- windows ----------

  const LINEUP = ['witch', 'cat', 'tophat', 'hood'];
  function winStrike(z, G, t) {
    let res = null;
    for (const st of STRIKES) {
      const d = t - st.t;
      if (d < -0.8 || d > 6) continue;
      if (st.win === 'empty') res = { st, d, type: null, off: 0 };
      else if (st.win === 'all') {
        const big = z.id === G.big, rk = G.rank[z.id] ?? 0;
        res = { st, d, type: big ? 'giant' : LINEUP[rk % LINEUP.length], off: big ? 4.6 : 2.5 + rk * 0.6 };
      } else if (st.win != null && z.index === st.win % z.count) res = { st, d, type: st.fig, off: 1.5 };
    }
    return res;
  }

  // drops on the glass (front layer): fixed + some sliding
  function glass(ctx, z, t, back) {
    const { w, h } = z;
    const D = cached(z, 'glass', () => {
      const r = rng(z.seed + 99), n = Math.round((16 * w) / h + 6), rim = new Path2D(), hi = new Path2D(), slide = [];
      for (let i = 0; i < n; i++) {
        const x = r() * w, y = r() * h, s = h * (0.012 + r() * r() * 0.035);
        rim.moveTo(x + s, y + s * 0.25); rim.ellipse(x, y + s * 0.25, s, s * 1.15, 0, 0, TAU);
        hi.moveTo(x, y - s * 0.3); hi.ellipse(x - s * 0.3, y - s * 0.3, s * 0.4, s * 0.4, 0, 0, TAU);
      }
      for (let i = 0; i < 3; i++) slide.push({ x: (0.15 + 0.7 * r()) * w, per: 2.8 + r() * 2.5, ph: r(), s: h * (0.025 + r() * 0.015) });
      return { rim, hi, slide };
    });
    if (back > 0.03) { ctx.fillStyle = rgba([25, 35, 80], 0.3 * back); ctx.fill(D.rim); }
    ctx.fillStyle = rgba([200, 220, 255], 0.1 + 0.5 * back);
    ctx.fill(D.hi);
    ctx.strokeStyle = rgba([190, 210, 255], 0.08 + 0.35 * back);
    ctx.lineCap = 'round';
    for (const d of D.slide) {
      const k = frac(t / d.per + d.ph), q = k * 3, i = Math.floor(q), f = q - i, y = ((i + f * f * (3 - 2 * f)) / 3) * h * 1.2;
      ctx.lineWidth = d.s * 0.6;
      ctx.beginPath(); ctx.moveTo(d.x, Math.max(0, y - h * 0.35)); ctx.lineTo(d.x, y); ctx.stroke();
      ell(ctx, d.x, y, d.s, d.s * 1.3);
    }
  }

  function drawWindow(ctx, z, S, L, G) {
    const { w, h } = z, t = S.t;
    ctx.fillStyle = '#03040b';
    ctx.fillRect(0, 0, w, h);
    zoneShake(ctx, z, t);
    // a candle lit in a window; the big bolt puts it out
    if (G.rank[z.id] === 1) {
      // ...and at the end someone lights it again (match and growing flame)
      const rel = t - TEND - 0.55, match = rel > 0 && rel < 0.35 ? Math.sin((rel / 0.35) * Math.PI) : 0;
      if (match > 0.01) glow(ctx, w * 0.5, h * 0.82, h * 0.3, [255, 200, 120], 0.9 * match);
      const on = Math.max(smooth(1, 3.5, t) * (1 - smooth(TB - 0.05, TB + 0.15, t)), smooth(0.1, 0.6, rel) * 1.25);
      if (on > 0.01) {
        const f = flicker(t * (1 + gust(t)), z.seed) * on, cx = w * 0.5 + Math.sin(t * 1.3) * w * 0.01;
        glow(ctx, cx, h * 0.95, h * 1.1, [255, 130, 40], Math.min(0.6, 0.42 * f));
        glow(ctx, cx, h * 0.8, h * 0.16, [255, 215, 140], 0.85 * f);
        ctx.fillStyle = rgba([255, 240, 200], Math.min(1, f));
        ell(ctx, cx, h * 0.8, h * 0.025, h * 0.06);
      }
    }
    const ws = winStrike(z, G, t);
    let back = L.F * 0.32, pose = -1;
    let fe = 0;
    if (ws) { const [e, pi] = env(ws.st, ws.d, 0.6); fe = e; back = Math.max(back, e); pose = pi; }
    if (back > 0.008) {
      const b = clamp(back), g = ctx.createRadialGradient(w * 0.5, h * 0.38, 0, w * 0.5, h * 0.38, Math.max(w, h) * 0.72);
      g.addColorStop(0, rgba([245, 248, 255], b));
      g.addColorStop(0.55, rgba([185, 198, 245], b * 0.85));
      g.addColorStop(1, rgba([90, 105, 185], b * 0.7));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    if (ws && ws.type) {
      const show = pose >= 0 && fe > 0.03, open = FIGS[ws.type].eyes ? eyeOpen(ws.d, ws.off) : 0;
      figure(ctx, ws.type, w, h, show ? pose : lastPose(ws.st), show ? 1 : 0, open, z.id === G.big ? 1 : 1.6);
    }
    glass(ctx, z, t, clamp(back));
  }

  // ---------- door ----------

  function drawDoor(ctx, z, S, L) {
    const { w, h } = z, t = S.t;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    zoneShake(ctx, z, t);
    lightZone(ctx, z, L, 0.9, geoOf(S));
    // warm light under the door: someone is home
    const on = smooth(0.8, 2.5, t) * (1 - smooth(TDOOR + 1.6, TDOOR + 2.2, t));
    if (on > 0.01) {
      // when the footsteps stop the light flickers (something covers it for an instant)
      const stop = pulse(t, 17.3, 17.9, 0.12) * (0.5 + 0.5 * Math.sin(t * 41));
      const f = (0.8 + 0.2 * flicker(t * 0.8, 5)) * on * (1 - 0.7 * stop), sh = h * 0.25;
      const g = ctx.createLinearGradient(0, h, 0, h - sh);
      g.addColorStop(0, rgba([255, 235, 170], f));
      g.addColorStop(0.25, rgba([255, 185, 80], 0.75 * f));
      g.addColorStop(1, rgba([255, 130, 30], 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, h - sh, w, sh);
      // footsteps approaching and standing still behind the door: long shadows upward
      if (t > 14.6) {
        const k = smooth(14.6, 17.4, t), fx = lerp(-0.35, 0.5, k) * w, step = Math.sin(t * 7) * (1 - k);
        ctx.fillStyle = rgba([0, 0, 0], 0.95);
        for (const s of [-1, 1]) {
          const lift = Math.max(0, step * s) * sh * 0.25, cx = fx + s * w * 0.1, fw = w * 0.07;
          ctx.beginPath();
          ctx.moveTo(cx - fw, h + 2); ctx.lineTo(cx + fw, h + 2);
          ctx.lineTo(cx + fw * 2.1 + s * w * 0.06, h - sh * 1.05 - lift); ctx.lineTo(cx - fw * 2.1 + s * w * 0.06, h - sh * 1.05 - lift);
          ctx.closePath(); ctx.fill();
        }
      }
    }
    // door frame in warm tones since someone approaches
    const fr = smooth(14.6, 15.6, t) * (1 - smooth(TDOOR - 0.1, TDOOR + 0.1, t)) + smooth(TDOOR + 2.4, TDOOR + 3, t) * (1 - smooth(DUR - 1.4, DUR - 0.6, t)) * 0.6;
    if (fr > 0.01) {
      const lw = w * 0.07, br = (0.75 + 0.15 * Math.sin(t * 2.2) + 0.1 * flicker(t, 9)) * fr;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = rgba([255, 150, 50], 0.35 * br); ctx.lineWidth = lw * 2.4; ctx.strokeRect(lw, lw, w - 2 * lw, h - 2 * lw);
      ctx.strokeStyle = rgba([255, 230, 170], br); ctx.lineWidth = lw; ctx.strokeRect(lw, lw, w - 2 * lw, h - 2 * lw);
    }
    // the last bolt shows it on the other side of the door (several re-strikes)
    const d = t - TDOOR;
    if (d > -0.8 && d < 3.2) {
      const [e0, pi] = env(STD, d, 0.35), e = clamp(e0 * 2.2);
      if (e > 0.008) {
        const g = ctx.createRadialGradient(w * 0.5, h * 0.3, 0, w * 0.5, h * 0.3, h * 0.8);
        g.addColorStop(0, rgba([255, 255, 255], e));
        g.addColorStop(1, rgba([255, 250, 245], e * 0.85));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }
      figure(ctx, 'door', w, h, Math.max(pi, 0), pi >= 0 && e > 0.02 ? 1 : 0, eyeOpen(d, 2.4));
    }
  }

  // ---------- global layer ----------

  const RAIN = [
    // per 1000 px of house width at 1080p: number, length, thickness, speed px/s, alpha, relative tilt
    { n: 120, len: 16, lw: 1.6, sp: 820, a: 0.28, par: 0.8 },
    { n: 70, len: 32, lw: 2.4, sp: 1250, a: 0.4, par: 1 },
    { n: 30, len: 70, lw: 3.5, sp: 1900, a: 0.34, par: 1.25 },
  ];

  function rain(ctx, G, t, I, F, wind, li) {
    const R = RAIN[li], U = G.U, { x0, y0, x1, y1 } = G.box, bh = y1 - y0, slant = wind * R.par;
    const len = R.len * U, sp = R.sp * U, span = bh + len, ex = slant * bh;
    const n = Math.round(((R.n * (x1 - x0)) / (1000 * U)) * I);
    const passes = li === 2 ? [[1, 1], [0.38, 1.6]] : [[1, 1]], col = mix([150, 175, 235], [240, 245, 255], clamp(F));
    // rain curtains: denser bands that sweep the house with the wind (3 brightness sections)
    // + a fourth section: the bright sweep of each gust
    const bw = x1 - x0, band = x => 0.5 + 0.5 * Math.sin(((x - x0) / bw) * TAU * 1.3 - t * (1.2 + 2 * wind) + li);
    const [sc, sk] = sweepAt(t), sx = x0 + sc * bw, sww = bw * 0.14;
    for (const [lwk, ak] of passes) {
      const r = rng(911 + li * 77), paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()];
      for (let i = 0; i < n; i++) {
        const rx = r(), ph = r(), sv = 0.85 + 0.3 * r();
        const y = y0 - len + ((ph * span + t * sp * sv) % span);
        const x = x0 - ex + rx * (x1 - x0 + ex) + (y - y0) * slant;
        let b = li === 2 ? 2 : Math.min(2, Math.floor(band(x) * 3));
        if (sk > 0.05 && Math.abs(x - sx) < sww * sk) b = 3;
        paths[b].moveTo(x, y);
        paths[b].lineTo(x + len * slant, y + len);
      }
      ctx.lineWidth = R.lw * U * lwk;
      paths.forEach((P, k) => {
        ctx.strokeStyle = rgba(col, clamp(R.a * ak * [0.25, 0.6, 1, 1.9][k] * (1 + (li === 2 ? 0.7 : 1.8) * F)));
        ctx.stroke(P);
      });
    }
  }

  // leaves: maple (5 lobes) and oval leaf, radius 1
  const MAPLE = (() => {
    const p = new Path2D(), n = 70;
    for (let i = 0; i <= n; i++) {
      const a = -Math.PI / 2 + (i / n) * TAU, lobe = Math.pow(0.5 + 0.5 * Math.cos(5 * (a + Math.PI / 2)), 0.9);
      const r = (0.55 + 0.45 * lobe + 0.05 * Math.cos(15 * (a + Math.PI / 2))) * (1 - 0.3 * Math.max(0, Math.sin(a)));
      if (i) p.lineTo(Math.cos(a) * r, Math.sin(a) * r); else p.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    p.closePath();
    p.moveTo(-0.05, 0.25); p.lineTo(0.05, 0.25); p.lineTo(0.03, 0.85); p.lineTo(-0.01, 0.85); p.closePath();
    return p;
  })();
  const OVAL = (() => {
    const p = new Path2D();
    p.moveTo(0, -1); p.quadraticCurveTo(0.8, -0.2, 0, 0.7); p.quadraticCurveTo(-0.8, -0.2, 0, -1); p.closePath();
    p.moveTo(-0.04, 0.6); p.lineTo(0.04, 0.6); p.lineTo(0.02, 0.95); p.lineTo(-0.01, 0.95); p.closePath();
    return p;
  })();
  const LEAF_COLS = [[255, 120, 25], [230, 55, 20], [255, 185, 40], [200, 100, 30]];

  function leaves(ctx, G, t, F) {
    const { x0, y0, x1, y1 } = G.box, bw = x1 - x0, bh = y1 - y0, U = G.U;
    GUSTS.forEach(([gs, gd, n], gi) => {
      if (t < gs || t > gs + gd + 5) return;
      const r = rng(5000 + gi * 31);
      for (let i = 0; i < n; i++) {
        const st = gs + r() * gd * 0.75, depth = r(), D = 3.4 - depth * 1.4 + r() * 0.6, yb = y0 + bh * (0.05 + r() * 0.75), ph = r() * TAU;
        const spin = (r() - 0.5) * 8, flipR = 4 + r() * 6, loop = r() < 0.3, ci = Math.floor(r() * 4), maple = r() < 0.5;
        const u = (t - st) / D;
        if (u <= 0 || u >= 1) continue;
        // gusts of wind and some curls
        const ue = u + 0.06 * Math.sin(u * TAU + ph);
        let x = x0 - bw * 0.06 + ue * bw * 1.12, y = yb + Math.sin(u * TAU * (0.7 + depth * 0.6) + ph) * bh * 0.07 + u * bh * 0.1;
        if (loop) { const a = smooth(0.35, 0.65, u) * TAU, R = bh * 0.08; x -= Math.sin(a) * R; y -= (1 - Math.cos(a)) * R; }
        const s = U * (13 + depth * 18), fl = Math.cos(t * flipR + ph), c = LEAF_COLS[ci], lum = 0.72 + 0.28 * Math.abs(fl);
        // with the flash they look backlit, almost black
        const col = mix([c[0] * lum, c[1] * lum, c[2] * lum], [6, 5, 10], clamp(F * 1.3));
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(ph + spin * (t - st));
        ctx.scale(s * (Math.abs(fl) < 0.15 ? 0.15 : Math.abs(fl)) * (fl < 0 ? -1 : 1), s);
        const P = maple ? MAPLE : OVAL;
        ctx.fillStyle = rgba(col);
        ctx.fill(P);
        // lighter half of the leaf (volume shows when it flips) and central vein
        ctx.save();
        ctx.beginPath(); ctx.rect(0, -1.2, 1.2, 2.4); ctx.clip();
        ctx.fillStyle = rgba(mix(col, [255, 240, 200], 0.18 * (1 - clamp(F * 1.3))));
        ctx.fill(P);
        ctx.restore();
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.06;
        ctx.beginPath(); ctx.moveTo(0, maple ? 0.8 : 0.9); ctx.lineTo(0, maple ? -0.75 : -0.85); ctx.stroke();
        ctx.restore();
      }
    });
  }

  // drops that swell on the eave, stretch, fall and splash
  function drips(ctx, G, t, F) {
    const U = G.U, g = 1500 * U, body = new Path2D(), hi = new Path2D(), spl = new Path2D(), sz = 1.8 * U;
    for (const d of G.drips) {
      const k = frac(t / d.per + d.ph), R = d.R;
      let y, rx, ry;
      if (k < 0.62) { const q = easeOut(k / 0.62); rx = R * (0.3 + 0.7 * q); ry = rx * (1 + 0.2 * q); y = d.y + ry * 0.9; }
      else if (k < 0.7) { const q = (k - 0.62) / 0.08; rx = R * (1 - 0.18 * q); ry = R * (1.2 + 0.8 * q); y = d.y + ry; }
      else {
        const tau = (k - 0.7) * d.per, ys = d.y + R * 2;
        y = ys + 0.5 * g * tau * tau;
        if (y > d.yb) {
          const q = (tau - Math.sqrt((2 * Math.max(0, d.yb - ys)) / g)) / 0.22;
          if (q < 1) {
            const hgt = R * 3 * Math.sin(q * Math.PI), dx = R * 2.4 * easeOut(q);
            spl.rect(d.x - dx - sz / 2, d.yb - hgt, sz, sz); spl.rect(d.x + dx - sz / 2, d.yb - hgt * 0.8, sz, sz);
          }
          continue;
        }
        rx = R * 0.75; ry = R * (1.3 + Math.min(2.2, (g * tau) / (700 * U)));
      }
      body.moveTo(d.x + rx, y); body.ellipse(d.x, y, rx, ry, 0, 0, TAU);
      const hx = d.x - rx * 0.28, hy = y - ry * 0.3;
      hi.moveTo(hx + rx * 0.35, hy); hi.ellipse(hx, hy, rx * 0.35, rx * 0.35, 0, 0, TAU);
    }
    ctx.fillStyle = rgba([190, 210, 255], 0.5 + 0.4 * F);
    ctx.fill(body);
    ctx.fillStyle = rgba([255, 255, 255], 0.65 + 0.35 * F);
    ctx.fill(hi);
    ctx.fill(spl);
  }

  function splashes(ctx, G, t, I, F) {
    const U = G.U, dots = new Path2D(), rings = new Path2D();
    for (const s of G.splash) {
      if (s.rank > I) continue;
      const k = frac(t / s.per + s.ph);
      if (k > 0.32) continue;
      const q = k / 0.32, e = easeOut(q), hgt = s.s * 7 * Math.sin(q * Math.PI), dx = s.s * 6 * e, sz = 1.7 * s.s;
      dots.rect(s.x - dx - sz / 2, s.y - hgt, sz, sz);
      dots.rect(s.x + dx * 0.8 - sz / 2, s.y - hgt * 0.75, sz, sz);
      if (q < 0.6) { const rx = dx * 1.2 + 0.5; rings.moveTo(s.x - rx, s.y); rings.ellipse(s.x, s.y, rx, rx * 0.28, 0, Math.PI, TAU); }
    }
    ctx.fillStyle = rgba([175, 195, 255], 0.55 + 0.45 * F);
    ctx.fill(dots);
    ctx.strokeStyle = rgba([150, 175, 245], 0.35 + 0.4 * F);
    ctx.lineWidth = 1.2 * U;
    ctx.stroke(rings);
  }

  function boltPath(ctx, pts, upto) {
    const n = Math.min(pts.length, Math.ceil(upto));
    if (n < 2) return;
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  }

  // bolt with layered halo (without shadowBlur); prog = how far it has descended; leader = faint guide stroke
  function drawBolt3(ctx, B, a, prog, brA, leader) {
    const N = B.main.length;
    const layers = leader
      ? [[[140, 100, 255], 6, 0.3], [[200, 185, 255], 2.4, 0.7], [[245, 240, 255], 0.9, 1]]
      : [[[90, 70, 255], 18, 0.1], [[110, 120, 255], 9, 0.22], [[150, 175, 255], 4.2, 0.55], [[215, 228, 255], 2, 0.9], [[255, 255, 255], 1, 1]];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const [c, mul, al] of layers) {
      ctx.strokeStyle = rgba(c, al * a);
      ctx.lineWidth = B.lw * mul;
      ctx.beginPath(); boltPath(ctx, B.main, prog * N); ctx.stroke();
      if (brA <= 0) continue;
      ctx.strokeStyle = rgba(c, al * a * brA);
      for (const wk of [0.55, 0.32]) {
        ctx.lineWidth = B.lw * mul * wk;
        ctx.beginPath();
        for (const b of B.br) if (b.w === wk && prog > b.s) boltPath(ctx, b.pts, ((prog - b.s) / Math.max(0.05, 1 - b.s)) * b.pts.length * 1.6);
        ctx.stroke();
      }
    }
  }

  function bolts(ctx, G, t, F) {
    const U = G.U;
    for (const st of STRIKES) {
      const B = st.bolt && G.bolts[st.bolt], d = t - st.t;
      if (!B || d < -st.lead || d > 2.2) continue;
      if (d < 0) {
        // staggered guide: drops down in jumps before the return strike
        const q = (d + st.lead) / st.lead, s = q * 7, k = Math.floor(s), prog = (k + smooth(0, 0.35, s - k)) / 7;
        drawBolt3(ctx, B, 0.55 + 0.45 * hash(Math.floor(t * 45) + st.t), prog, 1, true);
        glow(ctx, B.a[0], B.a[1], 60 * U, [170, 150, 255], 0.3);
        continue;
      }
      const big = st.kind === 'big', [e0, pi0] = env(st, d, big ? 0.35 : 0.5);
      // the big bolt is at full strength from the first frame, before the flash
      const e = big && d < 0.12 ? Math.max(e0, 1) : e0, pi = Math.max(0, pi0), a = clamp(e * 1.15);
      // persistent violet image (as on the retina)
      const ghost = 0.4 * Math.exp(-d * 1.6) * smooth(0.04, 0.2, d);
      if (ghost > 0.01) {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = rgba([120, 80, 255], ghost); ctx.lineWidth = B.lw * 3;
        ctx.beginPath(); boltPath(ctx, B.main, B.main.length); ctx.stroke();
        ctx.strokeStyle = rgba([200, 180, 255], ghost); ctx.lineWidth = B.lw * 0.9;
        ctx.stroke();
      }
      if (a < 0.02) continue;
      // with the house lit, a dark corridor under the channel so the bolt keeps its edge
      if (F > 0.3) {
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.strokeStyle = rgba([2, 3, 12], 0.55 * a * clamp(F)); ctx.lineWidth = B.lw * 7;
        ctx.beginPath(); boltPath(ctx, B.main, B.main.length); ctx.stroke();
        ctx.lineWidth = B.lw * 3.2;
        ctx.beginPath();
        for (const b of B.br) if (b.w > 0.5) boltPath(ctx, b.pts, b.pts.length);
        ctx.stroke();
      }
      drawBolt3(ctx, B, a, 1, pi % 2 ? 0.45 : 1, false);
      // volumetric halo along the bolt and at its ends
      for (let k = 1; k < 4; k++) { const p = B.main[Math.floor((k / 4) * B.main.length)]; glow(ctx, p[0], p[1], 70 * U, [150, 170, 255], 0.22 * a); }
      glow(ctx, B.b[0], B.b[1], 90 * U, [200, 215, 255], 0.7 * a);
      glow(ctx, B.a[0], B.a[1], 70 * U, [200, 215, 255], 0.6 * a);
    }
  }

  // house edges: white flash with each strike, a glow that fades and,
  // with the big bolt, the discharge running along all the edges from the pediment
  function edges(ctx, S, G, t, L) {
    const O = outlinesOf(S, G), U = G.U;
    ctx.save();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (L.after > 0.01) { ctx.strokeStyle = rgba([110, 130, 255], 0.5 * L.after); ctx.lineWidth = 3.5 * U; ctx.stroke(O.epath); }
    // closing: only the windows, in soft blue
    if (L.wedge > 0.01) {
      for (const [c, lw, al] of [[[90, 120, 255], 10, 0.22], [[150, 175, 255], 4, 0.6]]) { ctx.strokeStyle = rgba(c, al * L.wedge); ctx.lineWidth = lw * U; ctx.stroke(O.wpath); }
    }
    // during the big bolt's discharge the crackle already draws the edges
    const e = t - TB, crackle = e >= 0 && e < 2.4, a = crackle ? 0 : clamp(L.edge * 1.1);
    if (a > 0.01) {
      for (const [c, lw, al] of [[[120, 150, 255], 9, 0.2], [[185, 205, 255], 4, 0.5], [[255, 255, 255], 2.2, 0.95]]) {
        ctx.strokeStyle = rgba(c, al * a); ctx.lineWidth = lw * U; ctx.stroke(O.epath);
      }
    }
    if (crackle) {
      const fr = Math.floor(t * 24), head = new Path2D(), live = new Path2D(), J = 6 * U;
      for (const o of O.zones) {
        const { xs, ys, nx, ny, arr } = o, n = xs.length;
        const off = i => { const age = e - arr[i]; return (hash(i * 1.37 + fr * 7.1 + o.k) - 0.5) * 2 * J * clamp(1 - age / 1.6); };
        // continuous polylines: only cut when switching segments (head / rest)
        let last = null, oj = 0;
        for (let i = 0; i < n - 1; i++) {
          const j = i + 1, ta = Math.max(arr[i], arr[j]);
          if (ta > e || e - ta > 2) { last = null; continue; }
          const P = e - ta < 0.12 ? head : live;
          if (P !== last) { const oi = off(i); P.moveTo(xs[i] + nx[i] * oi, ys[i] + ny[i] * oi); last = P; }
          oj = off(j);
          P.lineTo(xs[j] + nx[j] * oj, ys[j] + ny[j] * oj);
        }
      }
      const fade = 1 - smooth(0.6, 2.2, e);
      ctx.lineJoin = 'bevel'; ctx.lineCap = 'butt';
      for (const [c, lw, al] of [[[90, 140, 255], 8, 0.28], [[160, 200, 255], 3.2, 0.65], [[235, 245, 255], 1.4, 0.95]]) {
        ctx.strokeStyle = rgba(c, al * fade); ctx.lineWidth = lw * U; ctx.stroke(live);
      }
      ctx.strokeStyle = rgba([200, 220, 255], 0.45); ctx.lineWidth = 10 * U; ctx.stroke(head);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.6 * U; ctx.stroke(head);
    }
    ctx.restore();
  }

  // impact sparks and ember that cools
  function sparks(ctx, G, t) {
    const e = t - TB;
    if (e < 0 || e > 4.5 || !G.apex) return;
    const U = G.U, g = 1300 * U, kd = 2.2, hot = new Path2D(), cool = new Path2D();
    [[G.apex, 34], [G.bolts.apex?.b, 26]].forEach(([p, n], pi) => {
      if (!p) return;
      const r = rng(777 + pi * 13);
      for (let i = 0; i < n; i++) {
        const ang = -Math.PI * (0.05 + 0.9 * r()), v = (260 + 700 * r()) * U, life = 0.5 + r() * 1.1, del = r() < 0.3 ? 0.31 : 0;
        const tau = e - del;
        if (tau < 0 || tau > life) continue;
        const pos = tt => { const f = (1 - Math.exp(-kd * tt)) / kd; return [p[0] + Math.cos(ang) * v * f, p[1] + Math.sin(ang) * v * f + 0.5 * g * tt * tt]; };
        const [xa, ya] = pos(Math.max(0, tau - 0.04)), [xb, yb] = pos(tau), P = tau / life < 0.4 ? hot : cool;
        P.moveTo(xa, ya); P.lineTo(xb, yb);
      }
    });
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,250,215,0.95)'; ctx.lineWidth = 2.6 * U; ctx.stroke(hot);
    ctx.strokeStyle = 'rgba(255,140,40,0.85)'; ctx.lineWidth = 1.9 * U; ctx.stroke(cool);
    const c = smooth(0, 2.5, e), a = 1 - smooth(0.5, 4.5, e), emb = new Path2D();
    [G.apex, G.bolts.apex?.b].forEach((p, pi) => {
      if (!p) return;
      glow(ctx, p[0], p[1], 45 * U * (1.3 - 0.3 * c) * (0.85 + 0.15 * flicker(t, pi)), mix([255, 240, 200], [255, 70, 10], c), 0.85 * a);
      // embers rising with the heat
      const r = rng(31 + pi * 7);
      for (let i = 0; i < 14; i++) {
        const t0 = 0.3 + r() * 3, life = 0.8 + r() * 0.8, k = (e - t0) / life, sx = (r() - 0.5) * 30 * U, sw = r() * TAU;
        if (k < 0 || k > 1) continue;
        const x = p[0] + sx + Math.sin(k * 5 + sw) * 8 * U + k * 25 * U, y = p[1] - k * 70 * U, sz = 2.6 * U * (1 - k * 0.6);
        emb.rect(x - sz / 2, y - sz / 2, sz, sz);
      }
    });
    ctx.fillStyle = rgba([255, 170, 60], 0.9 * a);
    ctx.fill(emb);
  }

  return {
    name: 'Storm',
    duration: DUR,
    ambience: 1,
    // thunder, rumble and effects: scheduled by the score (js/audio/03-tormenta.js), aligned with each flash
    update(S) {},
    draw(ctx, z, S) {
      const us = cached(z, 'ushape', () => shapeOf(z).map(([x, y]) => [x / z.w, y / z.h]));
      if (shapes[z.id] !== us) { shapes[z.id] = us; shapeVer++; }
      const L = light(S), G = geoOf(S);
      if (z.kind === 'roof') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, z.w, z.h); }
      else if (z.kind === 'window') drawWindow(ctx, z, S, L, G);
      else if (z.kind === 'door') drawDoor(ctx, z, S, L);
      else drawWall(ctx, z, S, L);
    },
    drawGlobal(ctx, W, H, S) {
      if (!S.screenZones.length) return;
      const t = S.t, G = geoOf(S), L = light(S), I = rainI(t), wind = windAt(t), F = clamp(L.F), sk = shakeAt(t);
      // clip to the real shapes of the zones (the pediment is a triangle, not its quadrilateral)
      ctx.clip(outlinesOf(S, G).path);
      if (sk > 0.05) shake(ctx, sk * G.U, t, 1);
      drawSkyG(ctx, S, G, L);
      rain(ctx, G, t, I, F, wind, 0);
      rain(ctx, G, t, I, F, wind, 1);
      leaves(ctx, G, t, F);
      drips(ctx, G, t, F);
      bolts(ctx, G, t, L.F);
      edges(ctx, S, G, t, L);
      sparks(ctx, G, t);
      splashes(ctx, G, t, I, F);
      rain(ctx, G, t, I, F, wind, 2);
    },
  };
})());
