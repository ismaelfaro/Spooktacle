// Scene: Eyes. The house is alive: the windows are eyes, the door a mouth and the walls flesh with veins.
// Script: wakes up → a moth of light flies out of the pediment and all the eyes follow it → the mouth lures it with its light
// and eats it → the light runs through the veins → ROAR (everyone looks at the mouth) → they look at the audience and
// a third eye opens on the pediment → they fall asleep and the mouth burps out the moth, which flies off.
registerScene((() => {
  // ---------- script (s) ----------
  const K = { moth: 5.4, lure: 13.4, chomp: 15.15, gulp: 16.3, roar: 18.6, roarEnd: 21.0, third: 22.0, squint: 24.9, burp: 27.6 };
  const AMBER = [[255, 172, 28], [255, 146, 30], [246, 196, 40], [255, 160, 54]];
  const SHOCK_R = 1000; // final radius of the roar's waves (screen px at 1080p)
  const MOTH = [185, 255, 228], THIRD = [110, 255, 196], HOT = [255, 236, 190];

  // ---------- utilities ----------
  const seg = (t, a, b) => clamp((t - a) / (b - a));
  const eOut = k => 1 - (1 - clamp(k)) ** 3;
  const eIn = k => clamp(k) ** 3;
  const eInOut = k => { k = clamp(k); return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2; };
  const bOut = k => easeBack(clamp(k));
  const lerp2 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
  // per-zone cache that is rebuilt when the signature changes (e.g. when a window moves)
  const keyed = (z, key, sig, make) => { const c = z.cache[key]; if (c && c.sig === sig) return c.v; const v = make(); z.cache[key] = { sig, v }; return v; };
  // elliptical glow
  function oval(g, x, y, rx, ry, c, a) {
    if (rx <= 0 || ry <= 0 || a <= 0.004) return;
    g.save(); g.translate(x, y); g.scale(1, ry / rx); glow(g, 0, 0, rx, c, a); g.restore();
  }
  // glow with a precomputed sprite: much cheaper than creating a gradient each frame
  const glowSprites = new Map();
  function glowFast(ctx, x, y, r, c, a) {
    if (r <= 0 || a <= 0.004) return;
    const key = c.join();
    let spr = glowSprites.get(key);
    if (!spr) { spr = canvas(128, 128); glow(spr.getContext('2d'), 64, 64, 64, c, 1); glowSprites.set(key, spr); }
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * Math.min(1, a);
    ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = ga;
  }
  function ovalFast(ctx, x, y, rx, ry, c, a) {
    if (rx <= 0 || ry <= 0 || a <= 0.004) return;
    ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx); glowFast(ctx, 0, 0, rx, c, a); ctx.restore();
  }
  const bilinear = (p, u, v) => lerp2(lerp2(p[0], p[1], u), lerp2(p[3], p[2], u), v);
  const bez = (a, b, c, d, u) => { const v = 1 - u; return v * v * v * a + 3 * v * v * u * b + 3 * v * u * u * c + u * u * u * d; };
  const play = (name, o) => { try { Sound[name]?.(o); } catch {} };

  // ---------- heartbeat ----------
  const bpm = t => t < 5 ? 50 : t < K.gulp ? lerp(50, 64, seg(t, 5, 9)) : t < K.roar - 0.35 ? lerp(70, 132, eIn(seg(t, K.gulp, K.roar - 0.35))) : t < K.roarEnd + 0.6 ? 0 : lerp(66, 40, seg(t, K.roarEnd + 0.6, 27));
  const BEATS = [];
  for (let t = 0.6; t < 27.4;) { const b = bpm(t); if (b > 0) { BEATS.push(t); t += 60 / b; } else t += 0.05; }
  const lastBeat = t => { let b = -9; for (const x of BEATS) { if (x > t) break; b = x; } return b; };
  // "pum-pum" envelope (strike and echo at 0.24 s, like the sound)
  function heart(t) {
    const d = t - lastBeat(t);
    return Math.exp(-d * 7) + (d > 0.24 ? 0.6 * Math.exp(-(d - 0.24) * 8) : 0);
  }

  // ---------- house geometry on screen ----------
  let G = null;
  function geometry(S) {
    const zs = S.screenZones, W = innerWidth, H = innerHeight;
    const sig = zs.map(z => `${z.id}:${z.x0 | 0},${z.y0 | 0},${z.x1 | 0},${z.y1 | 0}`).join('|') + `@${W}x${H}`;
    if (G && G.sig === sig) return G;
    const area = z => (z.x1 - z.x0) * (z.y1 - z.y0);
    const big = list => list.reduce((a, b) => (!a || area(b) > area(a) ? b : a), null);
    const door = big(zs.filter(z => z.kind === 'door')), roof = big(zs.filter(z => z.kind === 'roof'));
    const wins = zs.filter(z => z.kind === 'window');
    const s = W / 1920;
    const M = door ? [door.cx, lerp(door.y0, door.y1, 0.57)] : [W * 0.5, H * 0.6];
    const vent = roof ? bilinear(roof.pts, 0.5, 0.4) : [W * 0.5, H * 0.2];
    const third = roof ? bilinear(roof.pts, 0.5, 0.69) : null;
    // waking order: from the mouth outward
    const rank = new Map([...wins].sort((a, b) => Math.hypot(a.cx - M[0], a.cy - M[1]) - Math.hypot(b.cx - M[0], b.cy - M[1])).map((z, i) => [z.id, i]));
    G = { sig, W, H, s, door, roof, wins, M, vent, third, rank, n: wins.length, byId: new Map(zs.map(z => [z.id, z])) };
    G.route = buildRoute(G);
    G.escape = buildEscape(G);
    return G;
  }

  // ---------- moth flight (Hermite with timings: continuous velocity) ----------
  // comic landing on the bay window's eyelid (s)
  const LAND = [9.9, 10.65];
  function buildRoute(G) {
    const { vent, M, wins, s } = G, d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const P = [vent, [vent[0] - 6 * s, vent[1] + 22 * s]], T = [K.moth, K.moth + 0.6];
    const L = w => ({ x0: w.x0, y0: w.y0, x1: w.x1, y1: w.y1, cx: w.cx, cy: w.cy, w: w.x1 - w.x0, h: w.y1 - w.y0 });
    // segments [x, y, slowness]: slow near the eyes, fast between them
    const legs = (list, t0, t1) => {
      let total = 0;
      const cum = list.map((p, i) => (total += d(p, i ? list[i - 1] : P[P.length - 1]) * p[2]));
      const base = P.length;
      list.forEach((p, i) => { P.push([p[0], p[1]]); T.push(t0 + (t1 - t0) * (cum[i] / total)); });
      return base;
    };
    if (wins.length >= 4) {
      // bay window → balcony (loop) → low window → lands on the bay window's eyelid → right wing → door
      const byX = [...wins].sort((a, b) => a.cx - b.cx), l = L(byX[0]), r = L(byX[byX.length - 1]);
      const mid = byX.slice(1, -1).sort((a, b) => a.cy - b.cy), up = L(mid[0]), lo = L(mid[mid.length - 1]);
      G.landId = mid[0].id;
      const land = [up.cx + up.w * 0.08, up.y0 + up.h * 0.07];
      legs([[up.x0 - up.w * 0.2, up.cy + up.h * 0.05, 1.4], [l.cx + l.w * 0.3, l.y1 + l.h * 0.6, 0.7], [l.x0 + l.w * 0.05, l.y1 + l.h * 1.7, 1],
        [lo.x0 - lo.w * 0.35, lo.cy - lo.h * 0.1, 0.65], [lo.cx + lo.w * 0.05, (up.y1 + lo.y0) / 2, 1.3], [up.cx + up.w * 0.32, up.y0 - up.h * 0.32, 0.9],
        [land[0], land[1], 1.6]], K.moth + 0.6, LAND[0]);
      P.push(land); T.push(LAND[1]);
      legs([[up.cx + up.w * 0.42, up.y0 - up.h * 0.55, 0.5], [up.x1 + up.w * 0.3, up.cy - up.h * 0.1, 0.8], [r.x0 - r.w * 0.42, r.cy + r.h * 0.2, 0.55],
        [r.cx, r.y1 + r.h * 0.7, 1.2], [r.x1 + r.w * 0.3, r.cy, 0.8], [r.cx + r.w * 0.1, r.y1 + r.h * 1.4, 1], [r.x0 - r.w * 0.6, r.y1 + r.h * 0.4, 1.3]],
      LAND[1], K.lure + 0.8);
      G.land = land;
    } else {
      // another facade: windows by nearest neighbor
      let cur = P[1];
      const left = [...wins], fly = [];
      while (left.length) {
        left.sort((a, b) => d([a.cx, a.cy], cur) - d([b.cx, b.cy], cur));
        const w = L(left.shift()), up = fly.length % 4 === 0;
        fly.push([w.x0 - w.w * 0.3, up ? w.y0 - w.h * 0.4 : w.y1 + w.h * 0.5, 1], [w.x1 + w.w * 0.3, w.cy, 1]);
        cur = [w.cx, w.cy];
      }
      fly.push([M[0] + 70 * s, M[1] - 60 * s, 1]);
      legs(fly, K.moth + 0.6, K.lure + 0.8);
      G.landId = null; G.land = null;
    }
    // attracted by the mouth's light: hesitates in front and goes in
    P.push([M[0] + 14 * s, M[1] - 52 * s], [M[0] - 12 * s, M[1] - 28 * s], [M[0], M[1] - 4 * s]);
    T.push(K.lure + 1.3, K.chomp - 0.3, K.chomp);
    return { P, T };
  }
  // at the end the mouth burps it out and it flies back, dizzy, to the pediment's attic
  function buildEscape(G) {
    const { vent, M, s } = G, up = G.wins.length >= 4 ? [...G.wins].sort((a, b) => a.cx - b.cx).slice(1, -1).sort((a, b) => a.cy - b.cy)[0] : null;
    const side = up ? [up.x1 + (up.x1 - up.x0) * 0.35, up.cy] : [M[0] - 90 * s, M[1] - 50 * s];
    return { P: [[M[0], M[1]], [M[0] - 6 * s, M[1] - 45 * s], side, [side[0] - 10 * s, side[1] - 70 * s], [vent[0] + 20 * s, vent[1] + 45 * s], [vent[0], vent[1] + 4 * s]],
      T: [K.burp + 0.15, K.burp + 0.5, K.burp + 0.95, K.burp + 1.35, K.burp + 1.75, K.burp + 2.15] };
  }
  function routeAt(R, t) {
    const { P, T } = R, n = P.length;
    if (t <= T[0]) return P[0];
    if (t >= T[n - 1]) return P[n - 1];
    let i = 0;
    while (t > T[i + 1]) i++;
    if (P[i] === P[i + 1]) return P[i];
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 2), dt = T[i + 1] - T[i], u = (t - T[i]) / dt;
    const m1 = [(P[i + 1][0] - P[a][0]) / (T[i + 1] - T[a]) * dt, (P[i + 1][1] - P[a][1]) / (T[i + 1] - T[a]) * dt];
    const m2 = [(P[b][0] - P[i][0]) / (T[b] - T[i]) * dt, (P[b][1] - P[i][1]) / (T[b] - T[i]) * dt];
    const u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = 3 * u2 - 2 * u3, h11 = u3 - u2;
    return [h00 * P[i][0] + h10 * m1[0] + h01 * P[i + 1][0] + h11 * m2[0], h00 * P[i][1] + h10 * m1[1] + h01 * P[i + 1][1] + h11 * m2[1]];
  }
  // fluttering: each flap lifts the body + gentle drift
  function mothPos(t) {
    const escape = t > K.burp;
    const p = routeAt(escape ? G.escape : G.route, t), s = G.s;
    const calm = escape ? 1.5 * (1 - seg(t, K.burp + 1.8, K.burp + 2.15)) : seg(t, K.moth, K.moth + 0.8) * (1 - seg(t, K.chomp - 0.35, K.chomp)) * (G.land ? 1 - pulse(t, LAND[0] - 0.1, LAND[1], 0.15) : 1);
    return [p[0] + (Math.sin(t * 5.3) * 7 + Math.sin(t * 8.9 + 1) * 4) * s * calm, p[1] + (Math.sin(t * 6.1 + 2) * 5 - Math.abs(Math.sin(t * 9 * Math.PI)) * 5) * s * calm];
  }
  const mothVisible = t => (t > K.moth && t < K.chomp + 0.02) || (t > K.burp + 0.15 && t < K.burp + 2.15);

  // ---------- gaze ----------
  // saccades: quick jumps with a bounce between fixation points
  function saccade(t, seed, period, amp) {
    const off = hash(seed) * period, x = (t + off) / period, k = Math.floor(x), f = (x - k) * period;
    const tgt = i => [(hash(seed + i * 1.37) * 2 - 1) * amp, (hash(seed + i * 2.71 + 9) * 2 - 1) * amp * 0.5];
    return lerp2(tgt(k - 1), tgt(k), bOut(f / 0.12));
  }
  // direction from an eye (screen px) to a point, as if looking at something in front of the facade
  function dirTo(E, P) {
    const dx = P[0] - E[0], dy = P[1] - E[1], D = 230 * G.s, l = Math.sqrt(dx * dx + dy * dy + D * D);
    return [clamp((dx / l) * 1.3, -1, 1), clamp((dy / l) * 1.5, -1, 1)];
  }
  function gaze(t, r, E, lag, third) {
    let g = saccade(t, r * 7.1 + 3, 1.6 + r * 0.23, 0.6);
    if (!third) {
      if (t > K.moth) g = lerp2(g, dirTo(E, mothPos(Math.min(t - lag, K.chomp))), bOut(seg(t, K.moth + 0.25 + lag, K.moth + 0.5 + lag)));
      const nerv = pulse(t, K.gulp + 0.15, K.roar - 0.05, 0.12);
      if (nerv > 0) g = lerp2(g, saccade(t, r * 3.3 + 50, 0.38 + r * 0.05, 0.95), nerv);
      g = lerp2(g, dirTo(E, G.M), bOut(seg(t, K.roar + lag * 0.4, K.roar + 0.13 + lag * 0.4)));
      g = lerp2(g, [0, 0.25], eInOut(seg(t, K.roarEnd + 0.5 + lag * 1.5, K.roarEnd + 1.7 + lag * 1.5)));
    } else g = lerp2(g, [0, 0.25], 0.85);
    // sweep synchronized with the audience and return to center
    const sw = pulse(t, 23.25, 24.85, 0.35);
    if (sw > 0) g = [g[0] + Math.sin((t - 23.25) * 3.9) * 0.62 * sw, g[1] + 0.05 * sw];
    g[0] += (noise1(t * 3 + r * 9) - 0.5) * 0.05;
    return g;
  }

  // ---------- eyelids ----------
  // natural blink: closes quickly (70 ms) and opens more slowly (250 ms)
  function blinkShape(d) {
    if (d < 0 || d > 0.36) return 0;
    if (d < 0.07) return (d / 0.07) ** 2;
    if (d < 0.11) return 1;
    return 1 - eOut((d - 0.11) / 0.25);
  }
  const NOBLINK = [[K.chomp - 0.5, K.gulp + 0.3], [K.roar - 0.4, K.roarEnd + 0.1], [22.4, 30]];
  const blinkCache = new Map();
  function blinks(r) {
    if (!blinkCache.has(r)) {
      const list = [];
      for (let t = 4.8 + hash(r * 5.3) * 1.5, k = 0; t < 30; k++) {
        if (!NOBLINK.some(([a, b]) => t > a && t < b)) list.push(t);
        t += 2.2 + 3.4 * hash(r * 13.1 + k * 1.7);
      }
      list.push(K.roarEnd + 0.25);
      list.sort((a, b) => a - b);
      blinkCache.set(r, list);
    }
    return blinkCache.get(r);
  }
  // waking: half-opens, hesitates, blinks and fully opens with a bounce
  function wake(t, t0) {
    if (t < t0) return 0;
    if (t < t0 + 0.75) return eOut(seg(t, t0, t0 + 0.45)) * 0.3 - 0.05 * seg(t, t0 + 0.45, t0 + 0.75);
    if (t < t0 + 0.86) return 0.25 * (1 - eIn(seg(t, t0 + 0.75, t0 + 0.83)));
    return bOut(seg(t, t0 + 0.9, t0 + 1.35));
  }
  // falling asleep: the eyelids drop to half-mast, hold and close
  const sleepy = (t, c) => 0.5 * eInOut(seg(t, c, c + 0.4)) + 0.5 * eInOut(seg(t, c + 0.65, c + 1.0));

  const REST = 0.84; // normal opening: the eyelid covers the iris a little
  function eyeState(t, r, E, landed) {
    const lag = 0.04 + r * 0.05;
    let open = wake(t, 2.3 + r * 0.55) * REST;
    let b = 0;
    for (const x of blinks(r)) { if (x > t) break; b = Math.max(b, blinkShape(t - x)); }
    // the moth lands on it: strong annoyed wink
    if (landed) b = Math.max(b, blinkShape(t - LAND[0] - 0.2), 0.85 * blinkShape((t - LAND[0] - 0.55) * 0.7));
    open *= 1 - b;
    const roarK = pulse(t, K.roar, K.roarEnd, 0.12);
    // surprise at seeing the bite; eyes bulging with the roar
    open *= 1 + 0.4 * pulse(t, K.chomp + 0.02, K.gulp, 0.07) + 0.34 * roarK + 0.05 * roarK * Math.sin(t * 47 + r);
    open *= 1 - sleepy(t, 25.95 + (G.n - 1 - r) * 0.32);
    // the window nearest the mouth peeks out to see how the moth escapes
    if (r === 0) open = Math.max(open, 0.5 * pulse(t, K.burp + 0.6, K.burp + 1.9, 0.25));
    // the moth dazzles: the eye narrows and the pupil shrinks when it passes close
    let near = 0;
    if (mothVisible(t)) { const p = mothPos(t); near = 1 - smooth(40 * G.s, 160 * G.s, Math.hypot(p[0] - E[0], p[1] - E[1])); }
    const squint = Math.max(0.7 * pulse(t, K.squint, K.squint + 0.75, 0.22), 0.4 * near, landed ? 0.75 * pulse(t, LAND[0] - 0.05, LAND[1] + 0.05, 0.1) : 0);
    const stare = smooth(K.roarEnd + 1, 23.5, t) * (1 - smooth(K.squint, K.squint + 0.3, t));
    let [lx, ly] = gaze(t, r, E, lag, false);
    if (r === 0 && t > K.burp) [lx, ly] = dirTo(E, mothPos(t - 0.1));
    return {
      open, squint, lx, ly,
      dil: lerp((1 - 0.5 * pulse(t, K.chomp, K.gulp + 0.2, 0.1)) * (1 + 0.8 * stare) * (1 - 0.45 * near), 0.25, roarK), red: roarK,
      glow: 0.35 + 0.2 * heart(t) + 0.65 * roarK + 0.25 * stare,
      blood: 0.75 * smooth(K.roar, K.roar + 0.5, t) * (1 - 0.6 * smooth(22, 26, t)),
      leak: 0.9 * smooth(0.3, 1.2, t) * (1 - seg(t, 3.3 + r * 0.55, 3.9 + r * 0.55)) + 0.6 * seg(t, 26.5, 27.5) * (1 - seg(t, 28.5, 29.5)),
      rem: saccade(t, r * 4.4 + 21, 0.9, 1)[0],
    };
  }
  function thirdState(t) {
    const open = bOut(seg(t, K.third + 0.85, K.third + 1.45)) * 1.02 * (1 - sleepy(t, 26.9));
    const [lx, ly] = gaze(t, 9, [0, 0], 0, true);
    return {
      open, squint: 0.7 * pulse(t, K.squint, K.squint + 0.75, 0.22), lx, ly,
      dil: 1.15 + 0.25 * heart(t), glow: 0.8 + 0.3 * heart(t), blood: 0.2,
      leak: 1.4 * seg(t, K.third + 0.1, K.third + 0.7), rem: 0,
    };
  }

  // ---------- veins ----------
  // vein tree that snakes from roots [x, y, angle, thickness]; segments [x1, y1, x2, y2, thickness]
  // root with a 5th element [tx, ty, radius]: the trunk curves toward that point (a basin) and ends on arrival
  function growVeins(roots, w, h, r, unit, o = {}) {
    const segs = [], taper = o.taper ?? 0.955, branch = o.branch ?? 0.1, wander = o.wander ?? 0.2, minW = o.minW ?? unit * 0.09;
    const steer = o.steer ?? 0, ca0 = o.childA ?? 0.45, ca1 = o.childSpread ?? 0.6, maxC = o.maxCurv ?? 9;
    const grow = (x, y, a, wd, depth, tg) => {
      let curv = (r() - 0.5) * 0.1;
      for (let n = 0; n < 90 && wd > minW; n++) {
        curv = clamp(curv * 0.8 + (r() - 0.5) * wander, -maxC, maxC);
        a += curv;
        if (tg) {
          const dx = tg[0] - x, dy = tg[1] - y;
          if (dx * dx + dy * dy < tg[2] * tg[2]) return;
          let da = Math.atan2(dy, dx) - a;
          da = Math.atan2(Math.sin(da), Math.cos(da));
          a += da * steer * (1 + n * 0.04);
        }
        const len = unit * (0.7 + r() * 0.4), nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
        segs.push([x, y, nx, ny, wd]);
        x = nx; y = ny; wd *= taper;
        if (x < -unit * 3 || y < -unit * 3 || x > w + unit * 3 || y > h + unit * 3) return;
        if (depth < 4 && n > 2 && r() < branch) {
          const side = r() < 0.5 ? -1 : 1;
          grow(x, y, a + side * (ca0 + r() * ca1), wd * (0.5 + r() * 0.2), depth + 1, null);
          wd *= 0.9; a -= side * 0.08;
        }
      }
    };
    for (const [x, y, a, wd, tg] of roots) grow(x, y, a, wd, 0, tg || null);
    return segs;
  }
  // groups by thickness (8 groups) to paint with few stroke calls
  function bucketize(segs) {
    const maxW = segs.reduce((m, s) => Math.max(m, s[4]), 1e-6);
    for (const s of segs) s[6] = Math.min(7, Math.floor((s[4] / maxW) * 8));
    return maxW;
  }
  // layers [color, ×thickness, offset x, offset y (× thickness)]; the thin veins come out fainter
  function paintVeins(g, segs, layers, fineAlpha = 0.5) {
    if (!segs.length) return;
    const maxW = bucketize(segs);
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const [col, mul, ox, oy] of layers) {
      g.strokeStyle = col;
      for (let k = 0; k < 8; k++) {
        const wd = (maxW * (k + 0.6)) / 8;
        g.globalAlpha = lerp(fineAlpha, 1, k / 7);
        g.lineWidth = Math.max(0.6, wd * mul);
        g.beginPath();
        for (const s of segs) if (s[6] === k) { g.moveTo(s[0] + ox * wd, s[1] + oy * wd); g.lineTo(s[2] + ox * wd, s[3] + oy * wd); }
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  }

  // ---------- flesh walls ----------
  // screen px → local zone px (approx. from the box)
  function toLocal(z, sz, p) {
    const kx = z.w / (sz.x1 - sz.x0), ky = z.h / (sz.y1 - sz.y0);
    return [(p[0] - sz.x0) * kx, (p[1] - sz.y0) * ky, (kx + ky) / 2];
  }
  const inPoly = (pts, x, y) => {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  };
  function makeWall(z, sz) {
    const { w, h } = z, m = Math.min(w, h), r = rng(z.seed * 7 + 11);
    const [ox, oy, k] = toLocal(z, sz, G.M);
    const roof = z.kind === 'roof';
    // sockets: windows that fall inside this wall
    const sockets = [];
    for (const wz of G.wins) {
      if (roof || wz.cx < sz.x0 || wz.cx > sz.x1 || wz.cy < sz.y0 || wz.cy > sz.y1) continue;
      const a = toLocal(z, sz, [wz.x0, wz.y0]), b = toLocal(z, sz, [wz.x1, wz.y1]);
      sockets.push({ id: wz.id, x0: a[0], y0: a[1], x1: b[0], y1: b[1], cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, rx: (b[0] - a[0]) / 2, ry: (b[1] - a[1]) / 2 });
    }
    const T3 = roof && G.third ? toLocal(z, sz, G.third) : null;
    // almost black flesh: only very dark specks; the light comes from the veins and the eyes
    const flesh = canvas(w, h), g = flesh.getContext('2d');
    g.fillStyle = '#020001'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 14; i++) {
      const rad = m * (0.2 + r() * 0.5);
      oval(g, r() * w, r() * h, rad, rad * (0.45 + r() * 0.6), mix([12, 1, 3], [40, 4, 10], r()), 0.1 + r() * 0.1);
    }
    // heat only close to the side of the mouth
    glow(g, ox, oy, 330 * G.s * k, [120, 12, 22], 0.28);
    // sockets: tight flesh halo, lit brow and shadow below
    for (const s of sockets) {
      oval(g, s.cx, s.cy, s.rx * 1.38, s.ry * 1.75, [150, 30, 38], 0.5);
      oval(g, s.cx, s.y0 - s.ry * 0.25, s.rx * 1.05, s.ry * 0.42, [255, 120, 95], 0.28);
      oval(g, s.cx, s.y1 + s.ry * 0.55, s.rx * 1.0, s.ry * 0.4, [2, 0, 1], 0.7);
    }
    if (T3) oval(g, T3[0], T3[1], m * 0.5, m * 0.32, [110, 24, 30], 0.35);
    // veins: a few thick trunks from the mouth's side that curve toward the sockets and feed them
    const unit = m * 0.045, rw = m * 0.09, roots = [];
    const ex = clamp(ox, 0, w), ey = clamp(oy, 0, h);
    const inward = Math.atan2(h / 2 - ey, w / 2 - ex);
    const tgt = s => [s.cx, s.cy, Math.max(s.rx, s.ry) * 0.95];
    if (roof) {
      // pediment: trunks from the eave that converge on the third eye
      // pediment: they enter almost horizontally at the eave's corners and curve up to the eye
      for (const [u, ang] of [[0.14, -0.22], [0.86, -Math.PI + 0.22], [0.44, -Math.PI / 2 - 0.35]]) roots.push([w * u, h, ang, rw * (0.75 + r() * 0.2), T3 ? [T3[0], T3[1], m * 0.12] : null]);
    } else {
      for (let i = 0; i < 3; i++) {
        const s = sockets[i];
        roots.push([ex, clamp(ey + (i - 1) * h * 0.28 + (r() - 0.5) * h * 0.08, 0, h), inward + (i - 1) * 0.45 + (r() - 0.5) * 0.2, rw * (0.85 + r() * 0.3), s ? tgt(s) : null]);
      }
      // each socket distributes blood toward the far side
      for (const s of sockets) {
        const away = Math.atan2(s.cy - ey, s.cx - ex) + (r() - 0.5) * 0.6;
        roots.push([s.cx + Math.cos(away) * s.rx * 1.05, s.cy + Math.sin(away) * s.ry * 1.1, away, rw * (0.5 + r() * 0.15)]);
      }
    }
    const segs = growVeins(roots, w, h, r, unit, { taper: 0.93, branch: 0.14, wander: 0.07, steer: 0.05, childA: 0.35, childSpread: 0.35, maxCurv: 0.09 });
    // raised veins: offset shadow, body and glow
    const veinLayers = [['rgba(0,0,0,0.85)', 1.6, 0.3, 0.4], ['rgb(170,20,38)', 1, 0, 0], ['rgba(255,150,140,0.55)', 0.32, -0.18, -0.22]];
    const veins = canvas(w, h);
    paintVeins(veins.getContext('2d'), segs, veinLayers, 0.5);
    const body = canvas(w, h), gb = body.getContext('2d');
    gb.drawImage(flesh, 0, 0); gb.drawImage(veins, 0, 0);
    // light layer (added with 'lighter'): heat under the skin + lit veins
    const hot = canvas(w, h), gh = hot.getContext('2d');
    glow(gh, ox, oy, 950 * G.s * k, [190, 18, 26], 0.25);
    for (const s of sockets) oval(gh, s.cx, s.cy, s.rx * 1.6, s.ry * 2, [255, 60, 40], 0.32);
    paintVeins(gh, segs, [['rgba(255,30,24,0.18)', 4.5, 0, 0], ['rgba(255,62,40,0.65)', 1.5, 0, 0], ['rgba(255,214,170,0.95)', 0.42, 0, 0]], 0.35);
    const cold = canvas(w, h);
    paintVeins(cold.getContext('2d'), segs, [['rgba(60,210,255,0.18)', 4.5, 0, 0], ['rgba(120,240,255,0.65)', 1.5, 0, 0], ['rgba(235,255,255,1)', 0.42, 0, 0]], 0.35);
    // veins to bright white (roar strike)
    const white = canvas(w, h);
    paintVeins(white.getContext('2d'), segs, [['rgba(255,120,50,0.3)', 5, 0, 0], ['rgba(255,225,170,0.9)', 1.7, 0, 0], ['rgba(255,255,245,1)', 0.6, 0, 0]], 0.5);
    // segments sorted by distance to the mouth, for the waves that run through the veins
    for (const s of segs) s[5] = Math.hypot((s[0] + s[2]) / 2 - ox, (s[1] + s[3]) / 2 - oy);
    segs.sort((a, b) => a[5] - b[5]);
    // small eyes opening in the empty flesh (the house fills with eyes)
    const minis = [], kx = z.w / (sz.x1 - sz.x0), ky = z.h / (sz.y1 - sz.y0);
    const area = (sz.x1 - sz.x0) * (sz.y1 - sz.y0) * (roof ? 0.5 : 1) / (G.s * G.s);
    const want = clamp(Math.round(area / 32000), 1, 5), poly = roof ? shapeOf(z) : null;
    for (let tries = 0; tries < 160 && minis.length < want; tries++) {
      const ew = (34 + 26 * r()) * G.s * k, eh = ew * 0.5, x = r() * w, y = r() * h;
      if (x < ew * 1.2 || x > w - ew * 1.2 || y < eh * 2 || y > h - eh * 2) continue;
      if (sockets.some(s => Math.abs(x - s.cx) < s.rx + ew * 1.2 && Math.abs(y - s.cy) < s.ry + eh * 1.8)) continue;
      if (minis.some(q => Math.abs(x - q.cx) < (ew + q.ew) * 1.3 && Math.abs(y - q.cy) < (eh + q.eh) * 2.2)) continue;
      if (Math.hypot(x - ox, y - oy) < ew * 2.5) continue;
      if (poly && !(inPoly(poly, x - ew * 1.5, y + eh * 2) && inPoly(poly, x + ew * 1.5, y + eh * 2) && inPoly(poly, x, y - eh * 2.5))) continue;
      if (T3 && Math.abs(x - T3[0]) < (G.roof.x1 - G.roof.x0) * 0.25 * kx + ew) continue;
      minis.push({ cx: x, cy: y, ew, eh, sx: sz.x0 + x / kx, sy: sz.y0 + y / ky, seed: z.seed * 3 + minis.length * 17 });
    }
    return { flesh, veins, body, hot, cold, white, segs, dists: segs.map(s => s[5]), maxW: segs.reduce((mm, s) => Math.max(mm, s[4]), 1), sockets, minis, ox, oy, k, m };
  }

  const lowerBound = (a, x) => { let lo = 0, hi = a.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (a[mid] < x) lo = mid + 1; else hi = mid; } return lo; };
  // light wave running through the veins: only segments near the front are drawn (cheap)
  function veinWave(ctx, Wl, R, band, a, glowCol, coreCol) {
    if (a <= 0.01 || R <= 0) return;
    const i0 = lowerBound(Wl.dists, R - band), i1 = lowerBound(Wl.dists, R);
    if (i1 <= i0) return;
    ctx.lineCap = 'round';
    for (const [lo, hi, al] of [[R - band, R - band * 0.4, 0.45], [R - band * 0.4, R, 1]]) {
      const j0 = lowerBound(Wl.dists, lo), j1 = lowerBound(Wl.dists, hi);
      for (const thick of [true, false]) {
        ctx.beginPath();
        let any = false;
        for (let i = j0; i < j1; i++) { const s = Wl.segs[i]; if (s[4] > Wl.maxW * 0.22 && (s[4] > Wl.maxW * 0.5) === thick) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); any = true; } }
        if (!any) continue;
        const wd = Wl.maxW * (thick ? 0.75 : 0.36);
        if (thick) { ctx.strokeStyle = rgba(glowCol, 0.35 * a * al); ctx.lineWidth = wd * 3.2; ctx.stroke(); }
        ctx.strokeStyle = rgba(coreCol, a * al); ctx.lineWidth = wd * 0.9; ctx.stroke();
      }
    }
  }

  // tremor common to the whole house (same phase in all zones, screen px) with overscale so no empty edges show
  function quake(ctx, z, A, T) {
    const sz = G.byId.get(z.id);
    if (A <= 0.01 || !sz) return;
    const kx = z.w / (sz.x1 - sz.x0), ky = z.h / (sz.y1 - sz.y0), sc = 1 + (2.4 * A) / Math.max(1, Math.min(sz.x1 - sz.x0, sz.y1 - sz.y0));
    ctx.translate(z.w / 2, z.h / 2); ctx.scale(sc, sc); ctx.translate(-z.w / 2, -z.h / 2);
    ctx.translate(Math.sin(T * 53 + 4.4) * A * kx, Math.cos(T * 47 + 3.1) * A * ky);
  }
  const houseShake = F => (F.roar * 6 + F.chompHit * 3) * G.s;
  // roar strike: white flash (0.25 s) and veins to bright white (0.5 s)
  const roarFlash = t => t < K.roar - 0.02 ? 0 : Math.exp(-Math.max(0, t - K.roar) * 9) * smooth(K.roar - 0.02, K.roar + 0.02, t);
  const roarWhite = t => smooth(K.roar - 0.05, K.roar, t) * (1 - smooth(K.roar + 0.15, K.roar + 0.65, t));

  function drawWall(ctx, z, S, F) {
    const sz = G.byId.get(z.id);
    if (!sz) return;
    const Wl = keyed(z, 'wall', G.sig + z.w + 'x' + z.h, () => makeWall(z, sz));
    const t = S.t, { ox, oy, k } = Wl, u = G.s * k;
    quake(ctx, z, houseShake(F), S.T);
    ctx.globalAlpha = F.life;
    const R = F.reveal * 1150 * u;
    if (F.reveal < 1) {
      // on waking, blood fills the veins from the mouth; the flesh comes after
      ctx.save(); ctx.beginPath(); ctx.arc(ox, oy, Math.max(0.1, R * 0.8), 0, TAU); ctx.clip();
      ctx.drawImage(Wl.flesh, 0, 0);
      ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.arc(ox, oy, Math.max(0.1, R), 0, TAU); ctx.clip();
      ctx.drawImage(Wl.veins, 0, 0);
    } else ctx.drawImage(Wl.body, 0, 0);
    // heat under the skin with each heartbeat (and red hot with the roar)
    ctx.globalCompositeOperation = 'lighter';
    const heat = 0.36 * F.heart * F.life + F.roar * (0.8 + 0.2 * Math.sin(t * 41));
    if (heat > 0.01) { ctx.globalAlpha = Math.min(1, heat); ctx.drawImage(Wl.hot, 0, 0); }
    // each socket lights up when its eye wakes (and at full with the roar)
    ctx.globalAlpha = 1;
    for (const s of Wl.sockets) {
      const fl = Math.max(F.flare.get(s.id) || 0, F.roar);
      if (fl > 0.01) ovalFast(ctx, s.cx, s.cy, s.rx * 1.45, s.ry * 1.8, [255, 90, 60], 0.5 * fl * F.life);
    }
    // cold light of the swallowed moth (remainder fading out)
    if (F.coldRest > 0.01) { ctx.globalAlpha = F.coldRest; ctx.drawImage(Wl.cold, 0, 0); ctx.globalAlpha = 1; }
    // heartbeat waves from the mouth
    for (const b of F.beats) veinWave(ctx, Wl, (t - b) * (t > K.gulp ? 950 : 700) * u, 130 * u, (0.55 + 0.45 * F.excite) * F.life * (1 - seg(t - b, 0.5, 1.5)), [255, 50, 35], [255, 185, 150]);
    if (F.reveal < 1) { veinWave(ctx, Wl, R, 180 * u, F.life, [255, 40, 30], [255, 200, 160]); ctx.restore(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1; }
    // the moth's light runs through the veins
    if (F.cold > 0) veinWave(ctx, Wl, (t - K.gulp - 0.15) * 560 * u, 260 * u, F.cold, [80, 220, 255], [235, 255, 255]);
    // ROAR: veins to white, flash, and the shockwaves light the veins as they pass
    const wh = roarWhite(t);
    if (wh > 0.01) { ctx.globalAlpha = wh; ctx.drawImage(Wl.white, 0, 0); ctx.globalAlpha = 1; }
    const rk = t - K.roar;
    for (let i = 0; i < 3; i++) {
      const age = rk - i * 0.24;
      if (age > 0 && age < 1.2) veinWave(ctx, Wl, SHOCK_R * u * eOut(age / 1.2), 200 * u, 1 - age / 1.2, [255, 130, 60], [255, 250, 230]);
    }
    const fx = roarFlash(t);
    if (fx > 0.01) { ctx.fillStyle = `rgba(255,236,215,${0.6 * fx})`; ctx.fillRect(0, 0, z.w, z.h); }
    ctx.globalCompositeOperation = 'source-over';
    // the house fills with eyes
    if (t > K.third - 0.2 && t < 27.2) Wl.minis.forEach((q, i) => drawMini(ctx, q, i, t, F));
  }

  // ---------- small flesh eyes ----------
  const miniSpr = new Map();
  function drawMini(ctx, q, i, t, F) {
    const d = (q.sx / G.W) * 0.85, t0 = K.third + 0.3 + d;
    const show = seg(t, t0 - 0.35, t0 + 0.3) * (1 - seg(t, 26.1, 26.9));
    if (show <= 0) return;
    const qe = Math.max(8, Math.round(q.ew / 8) * 8), sc = q.ew / qe, col = AMBER[(i + 1) % AMBER.length];
    let spr = miniSpr.get(qe + ':' + col);
    if (!spr) {
      const ew = qe, eh = ew * 0.5, bw = ew * 3.4, bh = eh * 5.5, E = { cx: bw / 2, cy: bh / 2, ew, eh, tilt: 0.06 };
      spr = { E, bw, bh, skin: makeSkin(bw, bh, E, 70 + qe, true), sclera: makeSclera(bw, bh, E, 71 + qe, false), blood: makeSclera(bw, bh, E, 72 + qe, true), iris: irisSprite(col, 30 + (i % 4)) };
      miniSpr.set(qe + ':' + col, spr);
    }
    const [lx, ly] = gaze(t + i * 0.37, 20 + i, [q.sx, q.sy], 0, true);
    const P = {
      open: wake(t, t0) * REST * (1 - sleepy(t, 25.0 + d * 0.4)), squint: 0.7 * pulse(t, K.squint, K.squint + 0.75, 0.22), lx, ly,
      dil: 1.1 + 0.2 * F.heart, glow: 0.7 + 0.3 * F.heart, blood: 0, leak: 1.3 * seg(t, t0 - 0.35, t0), rem: 0, col, slit: true,
    };
    ctx.save();
    ctx.translate(q.cx - spr.bw * sc / 2, q.cy - spr.bh * sc / 2);
    ctx.scale(sc, sc);
    ctx.globalAlpha = show * F.life;
    ctx.drawImage(spr.skin, 0, 0);
    ctx.globalAlpha = 1;
    drawOrganicEye(ctx, spr.E, P, spr);
    ctx.restore();
  }

  // ---------- organic eye ----------
  function lidCtl(E, topY, botY) {
    const { cx, cy, ew, tilt } = E, ly = cy + tilt * ew, ry = cy - tilt * ew, base = 0.125 * (ly + ry);
    return { lx: cx - ew, ly, rx: cx + ew, ry, cT: (topY - base) / 0.75, cB: (botY - base) / 0.75, c1: cx - ew * 0.48, c2: cx + ew * 0.52 };
  }
  function upperPath(ctx, L) { ctx.moveTo(L.lx, L.ly); ctx.bezierCurveTo(L.c1, L.cT, L.c2, L.cT, L.rx, L.ry); }
  function lidPath(ctx, L) {
    ctx.beginPath(); upperPath(ctx, L);
    ctx.bezierCurveTo(L.c2, L.cB, L.c1, L.cB, L.lx, L.ly);
    ctx.closePath();
  }

  // fibrous iris with its soft shadow around it (the iris takes up 78% of the sprite's radius)
  const IR = 0.78;
  const irisCache = new Map();
  function irisSprite(col, seed) {
    const key = col.join() + ':' + seed;
    if (irisCache.has(key)) return irisCache.get(key);
    const N = 224, H = N / 2, R = H * IR, c = canvas(N, N), g = c.getContext('2d'), r = rng(seed);
    g.translate(H, H);
    const sh = g.createRadialGradient(0, 0, R * 0.9, 0, 0, H);
    sh.addColorStop(0, 'rgba(60,8,16,0.55)'); sh.addColorStop(1, 'rgba(60,8,16,0)');
    g.fillStyle = sh; g.fillRect(-H, -H, N, N);
    const base = g.createRadialGradient(0, 0, 0, 0, 0, R);
    base.addColorStop(0, rgba(mix(col, [255, 255, 215], 0.8)));
    base.addColorStop(0.32, rgba(mix(col, [255, 240, 170], 0.35)));
    base.addColorStop(0.7, rgba(col));
    base.addColorStop(0.88, rgba(mix(col, [60, 0, 0], 0.55)));
    base.addColorStop(1, 'rgb(18,0,2)');
    g.fillStyle = base; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
    g.lineCap = 'round';
    for (let i = 0; i < 120; i++) {
      const a = r() * TAU, r0 = R * (0.22 + r() * 0.15), r1 = R * (0.62 + r() * 0.3), wob = (r() - 0.5) * 0.3, light = r() < 0.55;
      g.strokeStyle = light ? rgba(mix(col, [255, 255, 225], 0.65), 0.3 + r() * 0.35) : rgba(mix(col, [70, 0, 0], 0.75), 0.25 + r() * 0.3);
      g.lineWidth = R * (0.012 + r() * 0.03);
      g.beginPath();
      g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
      g.quadraticCurveTo(Math.cos(a + wob) * (r0 + r1) / 2, Math.sin(a + wob) * (r0 + r1) / 2, Math.cos(a) * r1, Math.sin(a) * r1);
      g.stroke();
    }
    g.strokeStyle = rgba(mix(col, [255, 255, 200], 0.55), 0.55); g.lineWidth = R * 0.05;
    g.beginPath();
    for (let i = 0; i <= 48; i++) { const a = (i / 48) * TAU, rr = R * (0.36 + 0.035 * Math.sin(i * 2.7) + 0.03 * (r() - 0.5)); g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath(); g.stroke();
    const lim = g.createRadialGradient(0, 0, R * 0.72, 0, 0, R);
    lim.addColorStop(0, 'rgba(0,0,0,0)'); lim.addColorStop(1, 'rgba(12,0,2,0.9)');
    g.fillStyle = lim; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
    irisCache.set(key, c);
    return c;
  }

  // skin around the eye; fade = blends into the flesh (pediment eye)
  function makeSkin(w, h, E, seed, fade) {
    const c = canvas(w, h), g = c.getContext('2d'), r = rng(seed), { cx, cy, ew, eh } = E;
    // no opaque background: the skin blends to black before the window's corners (the window IS the eye)
    const rx = fade ? ew * 1.45 : ew * 1.15, ry = fade ? eh * 2.4 : Math.max(eh * 2, h * 0.5 * 1.25);
    g.save(); g.translate(cx, cy); g.scale(1, ry / rx);
    const sg = g.createRadialGradient(0, 0, 0, 0, 0, rx);
    sg.addColorStop(0, 'rgb(186,72,74)'); sg.addColorStop(0.5, 'rgb(136,38,48)'); sg.addColorStop(0.78, 'rgba(64,11,20,0.75)'); sg.addColorStop(1, 'rgba(30,4,10,0)');
    g.fillStyle = sg; g.fillRect(-rx, -rx, rx * 2, rx * 2);
    g.restore();
    // upper eyelid lit from above and dark bag underneath
    oval(g, cx, cy - eh * 1.2, ew * 0.9, eh * 0.5, [255, 150, 125], 0.4);
    oval(g, cx, cy + eh * 1.35, ew * 0.8, eh * 0.38, [8, 0, 3], 0.55);
    for (let i = 0; i < 10; i++) oval(g, cx + (r() - 0.5) * ew * 1.8, cy + (r() - 0.5) * eh * 2.2, ew * (0.15 + r() * 0.25), eh * (0.2 + r() * 0.3), mix([90, 15, 25], [200, 80, 80], r()), 0.14);
    return c;
  }
  function makeSclera(w, h, E, seed, blood) {
    const c = canvas(w, h), g = c.getContext('2d'), r = rng(seed), { cx, cy, ew, eh } = E;
    if (!blood) {
      g.save(); g.translate(cx, cy - eh * 0.1); g.scale(1, (eh * 1.3) / ew);
      const sg = g.createRadialGradient(-ew * 0.12, -ew * 0.18, ew * 0.05, 0, 0, ew * 1.04);
      sg.addColorStop(0, '#fffdf6'); sg.addColorStop(0.42, '#fbefe4'); sg.addColorStop(0.72, '#e8bcb0'); sg.addColorStop(0.9, '#b05a62'); sg.addColorStop(1, '#5c1622');
      g.fillStyle = sg; g.fillRect(-ew * 1.1, -ew * 1.1, ew * 2.2, ew * 2.2);
      g.restore();
      oval(g, cx - ew * 0.97, cy + eh * 0.08, eh * 0.55, eh * 0.5, [150, 30, 45], 0.75);
      oval(g, cx + ew * 0.99, cy, eh * 0.45, eh * 0.45, [90, 15, 30], 0.6);
    }
    // small veins from the corners toward the iris
    const roots = [], n = blood ? 9 : 8;
    for (let i = 0; i < n; i++) {
      const side = i % 2 ? 1 : -1, a = (side > 0 ? 0 : Math.PI) + (r() - 0.5) * 1.3;
      roots.push([cx + Math.cos(a) * ew * 1.02, cy + Math.sin(a) * eh * 0.9, a + Math.PI + (r() - 0.5) * 0.5, eh * (blood ? 0.06 : 0.035)]);
    }
    const segs = growVeins(roots, w, h, r, eh * 0.13, { taper: blood ? 0.9 : 0.86, branch: 0.22, wander: 0.5, minW: eh * 0.007 });
    if (blood) paintVeins(g, segs, [['rgba(255,30,40,0.25)', 3, 0, 0], ['rgba(205,12,28,0.9)', 1, 0, 0]], 0.7);
    else paintVeins(g, segs, [['rgba(196,50,62,0.5)', 1, 0, 0]], 0.6);
    return c;
  }

  // complete eye over its skin: globe, iris, pupil, shadows, eyelids, lashes and light through the slit
  function drawOrganicEye(ctx, E, P, spr) {
    const { cx, cy, ew, eh } = E;
    const seam = cy + eh * 0.32;
    const oU = Math.max(0, P.open) * (1 - 0.5 * P.squint), oL = Math.min(1, Math.max(0, P.open)) * (1 - 0.6 * P.squint);
    const topY = lerp(seam, cy - eh, oU), botY = lerp(seam + eh * 0.015, cy + eh * 0.86, oL);
    const L = lidCtl(E, topY, botY);
    const a0 = ctx.globalAlpha;
    // bulge of the eye moving under the eyelid (REM sleep)
    if (oU < 0.12) ovalFast(ctx, cx + P.rem * ew * 0.35, cy - eh * 0.05, ew * 0.42, eh * 0.55, [255, 150, 140], 0.2 * (1 - oU / 0.12));
    if (botY - topY > 0.8) {
      ctx.save();
      lidPath(ctx, L); ctx.clip();
      ctx.drawImage(spr.sclera, 0, 0);
      if (P.blood > 0.03) { ctx.globalAlpha = a0 * clamp(P.blood); ctx.drawImage(spr.blood, 0, 0); ctx.globalAlpha = a0; }
      const ir = eh * 0.84, lx = clamp(P.lx, -1, 1), ly = clamp(P.ly, -1, 1);
      const ix = cx + lx * ew * 0.54, iy = cy + eh * 0.04 + ly * eh * 0.38;
      const sx = 1 - 0.3 * lx * lx, sy = 1 - 0.22 * ly * ly, rr = ir / IR;
      ctx.drawImage(spr.iris, ix - rr * sx, iy - rr * sy, rr * 2 * sx, rr * 2 * sy);
      if (P.red > 0.01 && spr.irisRed) { ctx.globalAlpha = a0 * clamp(P.red); ctx.drawImage(spr.irisRed, ix - rr * sx, iy - rr * sy, rr * 2 * sx, rr * 2 * sy); ctx.globalAlpha = a0; }
      // pupil: sharp cat slit or round
      const dil = clamp(P.dil, 0.25, 2.2);
      ctx.fillStyle = '#070003';
      ctx.beginPath();
      if (P.slit) {
        const pw = ir * sx * 0.17 * dil, ph = ir * sy * (0.66 + 0.18 * Math.min(dil, 1.4));
        ctx.moveTo(ix, iy - ph); ctx.quadraticCurveTo(ix + pw * 2, iy, ix, iy + ph); ctx.quadraticCurveTo(ix - pw * 2, iy, ix, iy - ph);
      } else ctx.ellipse(ix, iy, ir * sx * 0.34 * dil, ir * sy * 0.34 * dil, 0, 0, TAU);
      ctx.fill();
      // the iris's own light
      ctx.globalCompositeOperation = 'lighter';
      glowFast(ctx, ix, iy, ir * 1.3, P.red > 0.01 ? mix(P.col, [255, 40, 30], clamp(P.red)) : P.col, P.glow * 0.42);
      ctx.globalCompositeOperation = 'source-over';
      // shadow of the upper eyelid on the globe
      const sg = ctx.createLinearGradient(0, topY, 0, topY + eh * 0.75);
      sg.addColorStop(0, 'rgba(40,0,10,0.6)'); sg.addColorStop(1, 'rgba(40,0,10,0)');
      ctx.fillStyle = sg; ctx.fillRect(cx - ew, topY - eh * 0.3, ew * 2, eh * 1.1);
      // corneal highlights
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.beginPath(); ctx.ellipse(ix - ir * 0.36 - lx * ir * 0.12, iy - ir * 0.36, ir * 0.19, ir * 0.12, -0.6, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ell(ctx, ix + ir * 0.3, iy + ir * 0.3, ir * 0.07, ir * 0.07);
      ctx.restore();
    }
    // eyelid edge: wet mucosa below, thick dark line above
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(L.rx, L.ry); ctx.bezierCurveTo(L.c2, L.cB, L.c1, L.cB, L.lx, L.ly);
    ctx.strokeStyle = 'rgba(215,95,105,0.8)'; ctx.lineWidth = eh * 0.09; ctx.stroke();
    ctx.beginPath(); upperPath(ctx, L);
    ctx.strokeStyle = 'rgb(34,2,8)'; ctx.lineWidth = eh * 0.15; ctx.stroke();
    // eyelid crease: soft shadow and light above
    const cpk = Math.min(topY, cy - eh * 0.55) - eh * (0.32 + 0.12 * (1 - Math.min(1, oU)));
    const cc = (cpk - 0.125 * (L.ly + L.ry - eh * 0.3)) / 0.75;
    for (const [col, lw, dy] of [['rgba(255,160,140,0.22)', 0.07, -eh * 0.07], ['rgba(25,0,6,0.35)', 0.1, 0]]) {
      ctx.beginPath(); ctx.moveTo(L.lx + ew * 0.12, L.ly - eh * 0.2 + dy);
      ctx.bezierCurveTo(L.c1, cc + dy, L.c2, cc + dy, L.rx - ew * 0.12, L.ry - eh * 0.2 + dy);
      ctx.strokeStyle = col; ctx.lineWidth = eh * lw; ctx.stroke();
    }
    // sharp, curved lashes, longer toward the outer corner; they hang when the eye is closed
    const up = clamp(oU * 1.3), dirY = lerp(1, -1, up), outer = E.tilt >= 0 ? 1 : -1;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) {
      const u = 0.17 + i * 0.115, side = (u - 0.5) * 2, o = outer > 0 ? u : 1 - u;
      const bx = bez(L.lx, L.c1, L.c2, L.rx, u), by = bez(L.ly, L.cT, L.cT, L.ry, u);
      const len = eh * (0.16 + 0.3 * o * o) * (0.55 + 0.45 * Math.abs(dirY));
      let dx = side * 0.7 + outer * 0.25, dy = dirY;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const nx = -dy, ny = dx, bw = eh * 0.05, curl = side * len * 0.35;
      const tx = bx + dx * len + curl, ty = by + dy * len, mx = bx + dx * len * 0.55, my = by + dy * len * 0.55;
      ctx.moveTo(bx - nx * bw, by - ny * bw);
      ctx.quadraticCurveTo(mx - nx * bw * 0.4, my - ny * bw * 0.4, tx, ty);
      ctx.quadraticCurveTo(mx + nx * bw * 0.6, my + ny * bw * 0.6, bx + nx * bw, by + ny * bw);
      ctx.closePath();
    }
    ctx.fillStyle = '#0a0103'; ctx.fill();
    // light escaping through the slit of the closed eye
    const leak = P.leak * (1 - clamp(oU / 0.3));
    if (leak > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath(); upperPath(ctx, L);
      for (const [lw, a] of [[0.55, 0.12], [0.2, 0.35], [0.06, 0.9]]) { ctx.strokeStyle = rgba(P.col, a * leak); ctx.lineWidth = eh * lw; ctx.stroke(); }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawWindowEye(ctx, z, S, F) {
    const sz = G.byId.get(z.id);
    const r = G.rank.get(z.id) ?? z.index, E0 = sz ? [sz.cx, sz.cy] : [0, 0];
    const tilt = 0.1 * (E0[0] < G.M[0] ? -1 : 1), ew = z.w * 0.47;
    const E = { cx: z.w / 2, cy: z.h * 0.55, ew, eh: Math.min(z.h * 0.42, ew * 0.55), tilt }, col = AMBER[r % AMBER.length];
    const spr = keyed(z, 'eye', `${z.w}x${z.h}:${tilt}`, () => ({
      skin: makeSkin(z.w, z.h, E, z.seed, false), sclera: makeSclera(z.w, z.h, E, z.seed + 1, false),
      blood: makeSclera(z.w, z.h, E, z.seed + 2, true), iris: irisSprite(col, 7 + r), irisRed: irisSprite([255, 34, 26], 7 + r),
    }));
    const t = S.t, P = eyeState(t, r, E0, !!sz && sz.id === G.landId);
    P.col = col; P.slit = true;
    quake(ctx, z, houseShake(F), S.T);
    // the skin appears when blood reaches the window (before, only the slit of light is seen)
    ctx.globalAlpha = F.life * seg(t, 1.9 + r * 0.45, 2.9 + r * 0.45);
    ctx.drawImage(spr.skin, 0, 0);
    // the skin beats with the heart
    ctx.globalCompositeOperation = 'lighter';
    ovalFast(ctx, E.cx, E.cy, E.ew * 1.2, E.eh * 1.9, [255, 60, 50], (0.12 * F.heart + 0.3 * F.roar) * F.life);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    drawOrganicEye(ctx, E, P, spr);
    // the window's real frame is drawn as the eyelid edge and pulses
    const awake = seg(t, 2.3 + r * 0.55 + 0.6, 2.3 + r * 0.55 + 1.6) * (1 - seg(t, 26.2, 27.6));
    const rim = awake * (0.22 + 0.4 * F.heart) * F.life + F.roar * (0.7 + 0.3 * Math.sin(t * 37));
    if (rim > 0.01) neonStroke(ctx, shapeOf(z), 1, F.roar > 0.3 ? [255, 70, 40] : [255, 150, 70], Math.min(z.w, z.h) * 0.018, Math.min(1, rim));
    const fx = roarFlash(t);
    if (fx > 0.01) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,236,215,${0.45 * fx})`; ctx.fillRect(0, 0, z.w, z.h); ctx.globalCompositeOperation = 'source-over'; }
  }

  // ---------- pediment ----------
  function drawRoof(ctx, z, S, F) {
    drawWall(ctx, z, S, F);
    // the pediment's edge is drawn in red on waking and pulses
    const m = Math.min(z.w, z.h);
    const strobe = F.roar > 0.05 ? (Math.sin(S.t * 31) > 0 ? 1 : 0.25) : 1;
    neonStroke(ctx, shapeOf(z), eOut(seg(S.t, 0.8, 3.2)), F.roar > 0.3 ? [255, 120, 70] : [255, 50, 40], m * 0.025, Math.min(1, (0.3 + 0.35 * F.heart) * F.life + F.roar * strobe));
  }
  // third eye: drawn on the global layer (screen px) so the pediment's perspective doesn't distort it
  function drawThirdEye(ctx, S) {
    const t = S.t, show = seg(t, K.third - 0.3, K.third + 0.5) * (1 - seg(t, 28.0, 28.8));
    if (!G.third || show <= 0) return;
    const dpr = ctx.getTransform().a || 1, rw = G.roof.x1 - G.roof.x0;
    const ew = rw * 0.12, eh = ew * 0.44, bw = ew * 3.4, bh = eh * 5.5;
    if (!G.thirdSpr || G.thirdSpr.dpr !== dpr) {
      const E = { cx: (bw * dpr) / 2, cy: (bh * dpr) / 2, ew: ew * dpr, eh: eh * dpr, tilt: 0 }, W = bw * dpr, H = bh * dpr;
      G.thirdSpr = { dpr, E, skin: makeSkin(W, H, E, 55, true), sclera: makeSclera(W, H, E, 56, false), blood: makeSclera(W, H, E, 57, true), iris: irisSprite(THIRD, 99) };
    }
    const spr = G.thirdSpr, E = spr.E, P = thirdState(t);
    P.col = THIRD; P.slit = false;
    ctx.save();
    ctx.translate(G.third[0] - bw / 2, G.third[1] - bh / 2);
    ctx.scale(1 / dpr, 1 / dpr);
    ctx.globalAlpha = show * F.life;
    ctx.drawImage(spr.skin, 0, 0);
    // the flesh swells and glows before opening
    ctx.globalCompositeOperation = 'lighter';
    ovalFast(ctx, E.cx, E.cy, E.ew * 1.7, E.eh * 2.6, THIRD, 0.3 * pulse(t, K.third, K.third + 1.6, 0.4) + 0.08 * F.heart);
    ctx.globalCompositeOperation = 'source-over';
    drawOrganicEye(ctx, E, P, spr);
    ctx.restore();
  }

  // ---------- mouth (door) ----------
  function mouthState(t) {
    const breath = (p, a) => a * (0.5 - 0.5 * Math.cos((t / p) * TAU));
    let open = 0.03 + breath(3.4, 0.07), squash = 0, grin = 0.35, inner = [255, 96, 40], innerA = 0.6;
    if (t > K.lure) {
      // half-opens and glows from inside: the light attracts the moth
      const lure = eInOut(seg(t, K.lure, K.lure + 0.9));
      open = lerp(open, 0.26 + 0.02 * Math.sin(t * 3), lure);
      inner = HOT; innerA = lerp(innerA, 0.65 + 0.25 * Math.sin(t * 4.2), lure);
      open += 0.16 * eOut(seg(t, K.chomp - 0.35, K.chomp - 0.08));
    }
    if (t > K.chomp - 0.08) {
      // NOM! dry close with a squash and bounce
      const k = seg(t, K.chomp - 0.08, K.chomp);
      open = lerp(0.42, 0, eIn(k));
      squash = 0.3 * k * Math.exp(-Math.max(0, t - K.chomp) * 6) * Math.cos(Math.max(0, t - K.chomp) * 20);
      inner = HOT; innerA = 0.8;
    }
    if (t > K.chomp + 0.15) {
      // chews twice and swallows
      const c = t - K.chomp - 0.2;
      open = c < 0.9 ? 0.14 * Math.abs(Math.sin((c / 0.45) * Math.PI)) : 0.01;
      squash = c < 0.9 ? -0.08 * Math.sin((c / 0.45) * Math.PI) : -0.16 * pulse(c, 0.95, 1.3, 0.12);
      innerA = 0.8 + 0.2 * Math.sin(t * 9);
    }
    if (t > K.gulp + 0.2) { open = 0.015 + 0.01 * Math.sin(t * 30); squash = -0.05; grin = lerp(0.35, 0.1, seg(t, K.gulp, K.roar)); }
    if (t > K.roar - 0.4) { const a = eInOut(seg(t, K.roar - 0.4, K.roar - 0.1)); squash = lerp(squash, -0.2, a); open = 0; grin = 0; }
    if (t > K.roar - 0.05) {
      // ROAR
      const o = bOut(seg(t, K.roar - 0.05, K.roar + 0.22)) * (1 - 0.88 * eInOut(seg(t, K.roarEnd - 0.4, K.roarEnd + 0.7)));
      open = o * (1 + 0.05 * Math.sin(t * 52)); squash = 0.1 * o; grin = 0;
      inner = HOT; innerA = 0.95 * o + 0.3;
    }
    if (t > K.roarEnd + 0.7) {
      open = 0.05 + breath(2.3, 0.1) * (1 - seg(t, 25, 27)); squash = 0;
      grin = lerp(0.1, 0.9, eInOut(seg(t, 22.6, 23.6))) * (1 - 0.4 * seg(t, 25.8, 27));
      inner = [255, 96, 40]; innerA = 0.65;
    }
    if (t > K.burp) {
      // burp: bursts open, the moth comes out and it licks its lips, satisfied
      const b = pulse(t, K.burp, K.burp + 0.75, 0.12);
      open = Math.max(open * (1 - b), 0.45 * b); squash = 0.12 * b;
      inner = mix([255, 96, 40], HOT, b); innerA = 0.65 + 0.35 * b;
      grin = lerp(grin, 1, seg(t, K.burp + 0.6, K.burp + 1));
    }
    return { open, squash, grin, inner, innerA };
  }

  function drawMouth(ctx, z, S, F) {
    const { w, h } = z, t = S.t, m = Math.min(w, h), M = mouthState(t);
    // black = red door as is; the whole mouth is painted with high, warm light
    quake(ctx, z, houseShake(F), S.T);
    shake(ctx, F.roar * m * 0.04 + F.chompHit * m * 0.04, S.T, z.seed);
    const a0 = F.life;
    ctx.globalAlpha = a0;
    const frame = 0.45 * pulse(t, K.lure, K.chomp + 0.3, 0.5) * (0.7 + 0.3 * Math.sin(t * 4.2)) + F.roar * (0.85 + 0.15 * Math.sin(t * 37)) + 0.25 * F.heart * seg(t, 1, 3);
    if (frame > 0.01) neonStroke(ctx, shapeOf(z), 1, F.roar > 0.3 ? HOT : [255, 150, 60], m * 0.035, Math.min(1, frame));
    const cx = w / 2, cy = h * 0.56, op = clamp(M.open, 0, 1.25);
    const mw = w * 0.49 * (1 + 0.06 * M.squash), sq = 1 - 0.18 * M.squash;
    const mhT = lerp(h * 0.04, h * 0.3, op) * sq, mhB = lerp(h * 0.05, h * 0.36, op) * sq;
    const corner = cy - M.grin * h * 0.06 * (1 - 0.7 * clamp(op));
    const cT = (cy - mhT - 0.25 * corner) / 0.75 + M.grin * h * 0.012, cB = (cy + mhB - 0.25 * corner) / 0.75 + M.grin * h * 0.012;
    // upper lip almost straight (jaws), lower lip round
    const L = { lx: cx - mw, ly: corner, rx: cx + mw, ry: corner, cT, cB, c1: cx - mw * 0.72, c2: cx + mw * 0.72 };
    const lowerPath = () => { ctx.moveTo(L.rx, L.ry); ctx.bezierCurveTo(cx + mw * 0.5, cB, cx - mw * 0.5, cB, L.lx, L.ly); };
    const mouthPath = () => { ctx.beginPath(); upperPath(ctx, L); lowerPath(); ctx.closePath(); };
    // interior: throat white-hot, tongue and uvula
    ctx.save();
    mouthPath();
    ctx.fillStyle = '#000'; ctx.fill();
    ctx.clip();
    const deep = Math.max(1, Math.min(mw * 1.2, mhT + mhB) * 0.8);
    ctx.globalCompositeOperation = 'lighter';
    glowFast(ctx, cx, cy + mhB * 0.1, deep * 0.95, mix(M.inner, [255, 200, 90], 0.4), Math.min(1, M.innerA * 1.1) * a0);
    glowFast(ctx, cx, cy + mhB * 0.05, deep * 0.4, [255, 250, 220], 0.9 * M.innerA * a0 * clamp(0.3 + op * 3));
    ctx.globalCompositeOperation = 'source-over';
    if (op > 0.3) { ctx.fillStyle = 'rgb(255,150,110)'; ell(ctx, cx, cy - mhT * 0.45, mw * 0.1, mhT * 0.2); }
    ctx.fillStyle = 'rgb(255,110,90)';
    ell(ctx, cx + Math.sin(t * 2.3) * mw * 0.08, cy + mhB * 0.82, mw * 0.68, Math.max(1, mhB * 0.42));
    ctx.strokeStyle = 'rgba(90,0,10,0.8)'; ctx.lineWidth = Math.max(1, m * 0.03);
    ctx.beginPath(); ctx.moveTo(cx, cy + mhB * 0.55); ctx.lineTo(cx, cy + mhB * 0.95); ctx.stroke();
    ctx.restore();
    // lips: dark outline, orange halo and warm white core
    mouthPath();
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = m * 0.17; ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(255,120,20,${0.55 * a0})`; ctx.lineWidth = m * 0.12; ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = '#fff2c0'; ctx.lineWidth = m * 0.055; ctx.stroke();
    // large white teeth: long fangs above and below; with the mouth closed the row is visible
    const tooth = (x, y, tw, len) => {
      ctx.beginPath(); ctx.moveTo(x - tw / 2, y);
      ctx.quadraticCurveTo(x - tw * 0.4, y + len * 0.7, x, y + len);
      ctx.quadraticCurveTo(x + tw * 0.4, y + len * 0.7, x + tw / 2, y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    };
    ctx.globalAlpha = a0;
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = 'rgba(0,0,0,0.85)'; ctx.lineWidth = Math.max(1, m * 0.045); ctx.lineJoin = 'round';
    const nT = 6, nB = 5, tw = ((2 * mw) / nT) * 0.98, oo = clamp(op);
    for (let i = 0; i < nB; i++) {
      const u = 0.14 + (i / (nB - 1)) * 0.72, x = bez(L.rx, cx + mw * 0.5, cx - mw * 0.5, L.lx, u), y = bez(L.ry, cB, cB, L.ly, u);
      const fang = i === 0 || i === nB - 1;
      tooth(x, y + h * 0.008, tw * (fang ? 1 : 0.92), -h * (fang ? 0.075 + 0.09 * oo : 0.04 + 0.04 * oo));
    }
    for (let i = 0; i < nT; i++) {
      const u = 0.09 + (i / (nT - 1)) * 0.82, x = bez(L.lx, L.c1, L.c2, L.rx, u), y = bez(L.ly, L.cT, L.cT, L.ry, u);
      const fang = i === 1 || i === nT - 2;
      tooth(x, y - h * 0.008, tw * (fang ? 1.15 : 0.95), h * (fang ? 0.12 + 0.12 * oo : 0.05 + 0.05 * oo));
    }
    // drool that stretches when the mouth opens wide
    if (op > 0.45) {
      const a = clamp((op - 0.45) * 3);
      ctx.strokeStyle = `rgba(255,250,235,${0.85 * a})`; ctx.lineWidth = Math.max(1, m * 0.03); ctx.lineCap = 'round';
      ctx.beginPath();
      for (const u of [0.3, 0.68]) {
        const x = lerp(cx - mw, cx + mw, u), y0 = cy - mhT * 0.75, y1 = cy + mhB * 0.7;
        ctx.moveTo(x, y0); ctx.quadraticCurveTo(x + Math.sin(t * 6 + u * 9) * mw * 0.12, (y0 + y1) / 2 + mhB * 0.35, x + mw * 0.05, y1);
      }
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    // the swallowed light escapes between the lips
    const leak = M.innerA * (1 - clamp(op * 6)) * (t > K.chomp && t < K.roar + 0.2 ? 1 : 0.3);
    if (leak > 0.02) {
      ctx.beginPath(); upperPath(ctx, L);
      for (const [lw, a] of [[0.35, 0.25], [0.12, 0.7]]) { ctx.strokeStyle = rgba(HOT, a * leak * a0); ctx.lineWidth = m * lw; ctx.stroke(); }
    }
    // breath mist: puffs rising from the mouth
    const breathA = ((t < K.lure ? 1 : 0) + (t > K.roarEnd + 1 && t < 27.4 ? 1 : 0)) * a0 * smooth(1.5, 3, t);
    if (breathA > 0) {
      for (let i = 0; i < 4; i++) {
        const ph = ((t / 3.4) + i * 0.25) % 1, x = cx + (hash(i) - 0.5) * w * 0.3 + Math.sin(t + i) * w * 0.1, y = cy - mhT - ph * h * 0.5;
        glowFast(ctx, x, y, (0.2 + 0.4 * ph) * w, [235, 240, 255], 0.3 * Math.sin(ph * Math.PI) * breathA);
      }
    }
    const fx = roarFlash(t);
    if (fx > 0.01) { ctx.fillStyle = `rgba(255,240,215,${0.6 * fx})`; ctx.fillRect(0, 0, w, h); }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- global layer: moth, light, mist, roar waves ----------
  let wingSprite = null;
  function makeWing() {
    // right wings of a moon moth (body at x = 0, facing up); 128 × 128
    const c = canvas(128, 128), g = c.getContext('2d');
    const fill = g.createRadialGradient(20, 50, 4, 30, 56, 110);
    fill.addColorStop(0, '#ffffff'); fill.addColorStop(0.45, '#c8ffe6'); fill.addColorStop(1, '#5fd8c0');
    g.fillStyle = fill;
    // front wing with a hooked tip
    g.beginPath(); g.moveTo(0, 46);
    g.bezierCurveTo(18, 20, 60, 2, 104, 6); g.quadraticCurveTo(114, 8, 108, 18);
    g.bezierCurveTo(98, 40, 70, 58, 36, 62); g.quadraticCurveTo(14, 62, 0, 56);
    g.closePath(); g.fill();
    // back wing with long tail
    g.beginPath(); g.moveTo(0, 58);
    g.bezierCurveTo(30, 58, 70, 66, 74, 84); g.bezierCurveTo(76, 96, 62, 102, 52, 104);
    g.quadraticCurveTo(50, 118, 44, 126); g.quadraticCurveTo(34, 114, 32, 100);
    g.bezierCurveTo(18, 92, 4, 80, 0, 68);
    g.closePath(); g.fill();
    // dark leading edge, veins and ocelli
    g.strokeStyle = 'rgba(90,40,110,0.8)'; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(2, 44); g.bezierCurveTo(20, 20, 60, 4, 102, 7); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(4, 52); g.quadraticCurveTo(50, 34, 100, 16); g.moveTo(4, 56); g.quadraticCurveTo(50, 52, 90, 36); g.moveTo(4, 64); g.quadraticCurveTo(40, 80, 44, 120); g.stroke();
    g.fillStyle = '#ffb347'; ell(g, 62, 36, 7, 6); ell(g, 46, 82, 6, 5);
    g.fillStyle = '#3a1050'; ell(g, 62, 36, 3, 2.6); ell(g, 46, 82, 2.6, 2.2);
    return c;
  }
  function drawMoth(ctx, x, y, s, ang, t, a, halo, rest) {
    if (a <= 0.01) return;
    wingSprite ??= makeWing();
    // perched: flaps slowly and opens the wings fully
    const span = 75 * s, ph = (t * (rest ? 1.6 : 9)) % 1, flap = 0.14 + 0.86 * (0.5 + 0.5 * Math.cos(ph * TAU)) ** (rest ? 0.3 : 0.8);
    ctx.save();
    ctx.globalAlpha = a;
    glowFast(ctx, x, y, 160 * s, MOTH, 0.5 * halo);
    glowFast(ctx, x, y, 60 * s, [235, 255, 245], 0.75 * Math.max(0.5, halo));
    ctx.translate(x, y); ctx.rotate(ang);
    for (const side of [1, -1]) {
      ctx.save(); ctx.scale(side * flap, 1);
      ctx.drawImage(wingSprite, 0, -span * 0.42, span, span);
      ctx.restore();
    }
    ctx.fillStyle = '#fffbe8';
    ell(ctx, 0, span * 0.03, span * 0.07, span * 0.24);
    ctx.strokeStyle = 'rgba(255,250,220,0.9)'; ctx.lineWidth = Math.max(1, s * 1.3); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-span * 0.03, -span * 0.2); ctx.quadraticCurveTo(-span * 0.1, -span * 0.4, -span * 0.22, -span * 0.46);
    ctx.moveTo(span * 0.03, -span * 0.2); ctx.quadraticCurveTo(span * 0.1, -span * 0.4, span * 0.22, -span * 0.46);
    ctx.stroke();
    ctx.restore();
  }
  // trail of luminous dust: one speck every 50 ms where the moth was
  function drawDust(ctx, t, s, t0, t1) {
    const step = 0.05, life = 1.3, now = Math.floor(t / step), lv = [[], [], [], []];
    for (let i = 0; i < life / step; i++) {
      const te = (now - i) * step, age = t - te;
      if (te < t0 || te > t1 || age < 0) continue;
      const p = mothPos(te), k = age / life;
      const x = p[0] + (hash(te * 7.13) - 0.5) * 50 * s * age, y = p[1] + 30 * s * age * age + (hash(te * 3.31) - 0.5) * 24 * s * age;
      const a = (1 - k) ** 2 * (0.55 + 0.45 * Math.sin(t * 21 + te * 53));
      lv[Math.min(3, Math.floor(a * 4))].push(x, y, (3.4 * (1 - k) + 1) * s);
    }
    ctx.fillStyle = rgba(MOTH, 1);
    lv.forEach((list, i) => {
      if (!list.length) return;
      ctx.globalAlpha = (i + 0.6) / 4;
      ctx.beginPath();
      for (let j = 0; j < list.length; j += 3) { ctx.moveTo(list[j] + list[j + 2], list[j + 1]); ctx.arc(list[j], list[j + 1], list[j + 2], 0, TAU); }
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  }

  // union of the zones on screen as a path (to hand-clip what lives on the walls)
  function zonesPath(ctx, skipDoor) {
    ctx.beginPath();
    for (const sz of G.zs) {
      if (skipDoor && sz.kind === 'door') continue;
      ctx.moveTo(sz.pts[0][0], sz.pts[0][1]); for (let i = 1; i < sz.pts.length; i++) ctx.lineTo(sz.pts[i][0], sz.pts[i][1]); ctx.closePath();
    }
  }
  const inDoor = p => { const d = G.door, e = 25 * G.s; return !!d && p[0] > d.x0 - e && p[0] < d.x1 + e && p[1] > d.y0 - e && p[1] < d.y1 + e; };

  function drawGlobal(ctx, W, H, S) {
    if (!G) return;
    const t = S.t, s = G.s, [mx, my] = G.M;
    G.zs = S.screenZones;
    // 1) over the walls (not the door, so as not to wash out the mouth): light from the mouth and the roar's flash
    ctx.save(); zonesPath(ctx, true); ctx.clip('nonzero');
    drawThirdEye(ctx, S);
    ctx.globalCompositeOperation = 'lighter';
    const lureA = pulse(t, K.lure, K.chomp, 0.6) * (0.75 + 0.25 * Math.sin(t * 4.2));
    const roar = pulse(t, K.roar, K.roarEnd + 0.4, 0.15), fl = 0.75 + 0.25 * Math.sin(t * 37) * Math.sin(t * 13);
    glowFast(ctx, mx, my, 220 * s, [255, 170, 80], 0.3 * lureA);
    glowFast(ctx, mx, my, 520 * s, [255, 100, 40], 0.35 * roar * fl);
    // roar shockwaves: thick, bright rings
    const rk = t - K.roar;
    if (rk > 0 && rk < 1.8) {
      for (let i = 0; i < 3; i++) {
        const age = rk - i * 0.24;
        if (age <= 0 || age > 1.2) continue;
        const R = SHOCK_R * s * eOut(age / 1.2), a = 1 - age / 1.2;
        for (const [lw, al, c] of [[40, 0.18, [255, 110, 60]], [20, 0.45, [255, 180, 120]], [10, 0.9, [255, 248, 230]]]) {
          ctx.strokeStyle = rgba(c, al * a); ctx.lineWidth = lw * s * (0.35 + 0.65 * a);
          ctx.beginPath(); ctx.ellipse(mx, my, R, R * 0.72, 0, 0, TAU); ctx.stroke();
        }
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    // roar mist coming out of the mouth to the sides
    if (rk > 0 && rk < 3.4) {
      for (let i = 0; i < 10; i++) {
        const age = rk - i * 0.16;
        if (age <= 0 || age > 2.6) continue;
        const side = i % 2 ? -1 : 1, a = (side > 0 ? 0 : Math.PI) + side * (-0.2 - hash(i * 1.9) * 0.45);
        const dist = (240 + 260 * hash(i * 4.3)) * s * (1 - Math.exp(-age * 2.4));
        const x = mx + Math.cos(a) * dist, y = my + Math.sin(a) * dist * 0.8 - 40 * s * age;
        glowFast(ctx, x, y, (40 + 110 * eOut(age / 1.8)) * s, [205, 225, 255], 0.32 * (1 - age / 2.6) * smooth(0, 0.15, age));
      }
    }
    ctx.restore();
    // 2) over all the zones: bite sparks
    ctx.save(); zonesPath(ctx, false); ctx.clip('nonzero');
    ctx.globalCompositeOperation = 'lighter';
    const ck = t - K.chomp;
    if (ck > 0 && ck < 0.9) {
      for (let i = 0; i < 14; i++) {
        const a = -Math.PI / 2 + (hash(i * 3.1) - 0.5) * 2.6, v = (90 + 140 * hash(i * 5.7)) * s;
        const x = mx + Math.cos(a) * v * ck, y = my + Math.sin(a) * v * ck + 160 * s * ck * ck;
        ctx.globalAlpha = (1 - ck / 0.9) ** 1.5;
        ctx.fillStyle = rgba(i % 3 ? MOTH : HOT);
        ctx.beginPath(); ctx.arc(x, y, 3.2 * s * (1 - ck) + 0.6, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    // 3) unclipped: the moth also crosses the porch gap (it is real surface of the house)
    ctx.globalCompositeOperation = 'lighter';
    // the mouth's light spills across the porch around the door (without touching the door)
    const spill = 0.5 * lureA + roar * fl + 0.6 * pulse(t, K.burp - 0.05, K.burp + 0.8, 0.1) + 0.8 * Math.exp(-Math.max(0, t - K.chomp) * 5) * (t > K.chomp ? 1 : 0);
    if (G.door && spill > 0.01) {
      const d = G.door, dh = d.y1 - d.y0;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.rect(d.x0, d.y0, d.x1 - d.x0, dh); ctx.clip('evenodd');
      glowFast(ctx, d.cx, lerp(d.y0, d.y1, 0.55), dh * 1.3, [255, 120, 40], 0.55 * Math.min(1.2, spill));
      glowFast(ctx, d.cx, lerp(d.y0, d.y1, 0.55), dh * 0.7, [255, 200, 120], 0.45 * Math.min(1.2, spill));
      ctx.restore();
    }
    // dust when it takes off from the eyelid
    const hk = G.land ? t - LAND[1] : -1;
    if (hk > 0 && hk < 0.9) {
      for (let i = 0; i < 16; i++) {
        const a = -Math.PI * (0.1 + 0.8 * hash(i * 2.3)), v = (60 + 120 * hash(i * 6.1)) * s;
        const x = G.land[0] + Math.cos(a) * v * eOut(hk / 0.9) * 1.2, y = G.land[1] + Math.sin(a) * v * eOut(hk / 0.9) * 0.8 + 70 * s * hk * hk;
        ctx.globalAlpha = (1 - hk / 0.9) ** 1.4;
        ctx.fillStyle = rgba(MOTH);
        ctx.beginPath(); ctx.arc(x, y, 3.4 * s * (1 - hk * 0.8) + 0.6, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    for (const [t0, t1] of [[K.moth, K.chomp], [K.burp + 0.15, K.burp + 2.15]]) {
      if (t < t0 || t > t1 + 1.4) continue;
      drawDust(ctx, t, s, t0, t1);
      if (t > t1) continue;
      const p = mothPos(t), q = mothPos(t + 0.06), o = mothPos(t - 0.06);
      const vx = q[0] - o[0], vy = q[1] - o[1], sp = Math.hypot(vx, vy) / 0.12;
      const ang = Math.atan2(vx, -vy) * smooth(20 * s, 140 * s, sp) * 0.6;
      const born = t0 === K.moth ? bOut(seg(t, K.moth, K.moth + 0.5)) : bOut(seg(t, t0, t0 + 0.3));
      const into = t0 === K.moth ? 1 - 0.45 * seg(t, K.chomp - 0.5, K.chomp) : 1;
      const fade = t0 === K.moth ? 1 - seg(t, K.chomp - 0.04, K.chomp) : 1 - seg(t, t1 - 0.5, t1);
      const rest = !!G.land && t > LAND[0] + 0.05 && t < LAND[1] - 0.05;
      drawMoth(ctx, p[0], p[1], s * (0.3 + 0.7 * born) * into, ang, t, Math.min(1, born * 1.5) * fade, inDoor(p) ? 0.35 : 1, rest);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- per-frame state shared by the zones ----------
  const F = { life: 1, heart: 0, roar: 0, excite: 0, reveal: 0, cold: 0, coldRest: 0, chompHit: 0, beats: [], flare: new Map() };
  const pan = x => clamp((x / (G?.W || 1)) * 2 - 1, -1, 1);

  return {
    name: 'Eyes',
    duration: 30,
    globalClip: false,
    ambience: 0.6,
    update(S) {
      geometry(S);
      const t = S.t;
      // sound: heartbeat, breath, bite and roar go in js/audio/04-ojos.js; here only what follows the moth
      if (S.crossed(K.moth)) play('sparkle', { vel: 0.45, pan: pan(G.vent[0]) });
      // flutter: soft puffs where the moth is (not while it is perched)
      const resting = G.land && t > LAND[0] && t < LAND[1];
      if (t > K.moth + 0.5 && t < K.chomp - 0.3 && !resting && S.every(0.42, K.moth)) play('whoosh', { vel: 0.06, dur: 0.38, pitch: 2.2, pan: pan(mothPos(t + 0.2)[0]) });
      if (G.land && S.crossed(LAND[0] + 0.15)) play('pop', { vel: 0.3, pitch: 1.7, pan: pan(G.land[0]) });
      if (G.land && S.crossed(LAND[1])) play('sparkle', { vel: 0.2, dur: 0.8, count: 4, pan: pan(G.land[0]) });
      // burped out, it flies dizzy to the pediment
      if (S.crossed(K.burp + 0.2)) play('sparkle', { vel: 0.35, pan: pan(G.M[0]) });
      if (S.crossed(K.burp + 0.3)) play('whoosh', { vel: 0.22, dur: 1.7, pitch: 1.8, pan: [pan(G.M[0]), pan(G.vent[0])] });
      F.life = smooth(0.5, 2.6, t) * (1 - 0.8 * smooth(26.2, 28.8, t));
      F.heart = Math.min(1.2, heart(t));
      F.roar = pulse(t, K.roar, K.roarEnd, 0.15);
      F.excite = seg(t, K.gulp, K.roar);
      F.reveal = eInOut(seg(t, 0.7, 4.6));
      F.cold = pulse(t, K.gulp + 0.1, K.roar, 0.25);
      F.coldRest = 0.3 * eOut(seg(t, K.gulp + 0.4, K.gulp + 1.2)) * (1 - seg(t, K.roar - 0.3, K.roar + 0.3));
      F.chompHit = t > K.chomp ? Math.exp(-(t - K.chomp) * 9) : 0;
      F.beats = BEATS.filter(b => b <= t && t - b < 1.5).slice(-2);
      // the sockets light up when their eye wakes
      F.flare.clear();
      for (const wz of G.wins) { const r = G.rank.get(wz.id), o = 2.3 + r * 0.55; F.flare.set(wz.id, pulse(t, o + 0.85, o + 1.9, 0.15)); }
    },
    draw(ctx, z, S) {
      if (!G) geometry(S);
      if (z.kind === 'window') drawWindowEye(ctx, z, S, F);
      else if (z.kind === 'door') drawMouth(ctx, z, S, F);
      else if (z.kind === 'roof') drawRoof(ctx, z, S, F);
      else drawWall(ctx, z, S, F);
    },
    drawGlobal,
  };
})());
