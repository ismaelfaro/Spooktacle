// Scene 1: Awakening. The house wakes up: a spark stretches into a beam that sweeps the facade and
// leaves the architecture drawn in neon; the red door throbs like a heart and each beat lights
// a window (candles, a pumpkin, a cat); the moon rises over the pediment and, after holding its breath,
// the whole house lights up with a wave, sparks and bats. An unsettling calm and, at the end,
// a gust of wind from right to left blows out the candles.
registerScene((() => {
  // ---------- script (seconds) ----------
  const DUR = 24;
  const SPARK = 0.5, SCAN0 = 2, SCAN1 = 6.2;             // spark and sweep, left → right
  const MOON0 = 6, MOON1 = 12.5;                          // the moon rises over the pediment
  const BEATS = [7, 8.3, 9.5, 10.6, 11.5, 12.25, 12.85, 13.3]; // beats, more and more frequent
  const ON = 13.6, RING_DUR = 1.3;                        // burst: the house lights up
  const GUST = 19.4, GUST_DUR = 2.6;                      // gust that blows everything out
  const CAT_EYES = 8.6;                                   // cat's eyes in the dark window
  const LAST = 22.3;                                      // one last beat: the house is still alive

  // ---------- palette ----------
  const CYAN = [80, 220, 255], ORANGE = [255, 112, 18], VIOLET = [150, 55, 255], WARM = [255, 160, 60];
  const FIRE = [255, 205, 100], WHITE = [255, 255, 255], HEART = [255, 40, 70], MOONC = [170, 190, 255];
  const FLY = [200, 255, 90], EMBER = [255, 140, 40], MIST = [150, 180, 230], RIM = [150, 90, 255], SEAM = [255, 135, 35];
  const SMOKE = [150, 150, 165], CLOUD = [3, 4, 14];

  // windows from left to right; candles: u = relative x, k = relative height, d = delay
  const VARIANTS = ['duo', 'pumpkin', 'trio', 'cat'];
  const CANDLES = {
    duo: [{ u: 0.43, k: 0.46, d: 0 }, { u: 0.58, k: 0.3, d: 0.2 }, { u: 0.13, k: 0.24, d: 0.42 }],
    pumpkin: [{ u: 0.13, k: 0.38, d: 0.35 }, { u: 0.87, k: 0.28, d: 0.55 }],
    trio: [{ u: 0.5, k: 0.48, d: 0 }, { u: 0.37, k: 0.32, d: 0.15 }, { u: 0.63, k: 0.25, d: 0.28 }, { u: 0.12, k: 0.22, d: 0.45 }, { u: 0.88, k: 0.22, d: 0.55 }],
    cat: [{ u: 0.66, k: 0.24, d: 0 }, { u: 0.88, k: 0.38, d: 0.2 }],
  };

  // ---------- curves ----------
  const easeOut = k => 1 - (1 - clamp(k)) ** 3;
  const easeIn = k => clamp(k) ** 3;
  const sineIO = k => 0.5 - 0.5 * Math.cos(Math.PI * clamp(k));
  const decay = (x, tau) => (x < 0 ? 0 : Math.exp(-x / tau));
  const bump = u => (u <= 0 ? 0 : (1 - Math.exp(-u / 0.022)) * Math.exp(-u / 0.16));

  // double beat (lub-dub), getting stronger each time
  function beat(t) {
    let v = 0;
    for (let i = 0; i < BEATS.length; i++) {
      const u = t - BEATS[i];
      if (u < 0 || u > 1.3) continue;
      v += (0.55 + 0.45 * (i / (BEATS.length - 1))) * (bump(u) + 0.6 * bump(u - 0.24));
    }
    return v;
  }
  const lastBeat = t => 0.7 * (bump(t - LAST) + 0.6 * bump(t - LAST - 0.24));
  const RIPPLES = BEATS.map((b, i) => [b, 0.45 + 0.55 * (i / (BEATS.length - 1))]).concat([[LAST, 0.55]]);
  // the house holds its breath just before the burst, then everything gets brighter
  const sag = t => 1 - 0.85 * pulse(t, ON - 0.34, ON + 0.01, 0.14);
  const boost = t => 1 + 0.7 * decay(t - ON, 0.35);

  // ---------- glow sprites (cheaper than a gradient per call) ----------
  // offscreen canvases in CPU memory: drawing them does not force a GPU read on each call
  function canvas2d(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return [c, c.getContext('2d', { willReadFrequently: true })];
  }
  const sprites = {};
  function sprite(c, soft) {
    const key = c.join() + (soft ? 's' : 'h');
    if (!sprites[key]) {
      const [s, g] = canvas2d(128, 128), rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      const stops = soft ? [[0, 1], [0.3, 0.7], [0.6, 0.28], [0.85, 0.07], [1, 0]] : [[0, 1], [0.12, 0.8], [0.3, 0.32], [0.6, 0.08], [1, 0]];
      for (const [p, a] of stops) rg.addColorStop(p, rgba(!soft && p < 0.1 ? mix(c, WHITE, 0.6) : c, a));
      g.fillStyle = rg;
      g.fillRect(0, 0, 128, 128);
      sprites[key] = s;
    }
    return sprites[key];
  }
  // only with fixed palette colors (each color creates a sprite)
  function blob(ctx, c, x, y, rx, ry, a, soft) {
    if (a <= 0.004 || rx < 0.5 || ry < 0.5) return;
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * Math.min(1, a);
    ctx.drawImage(sprite(c, soft), x - rx, y - ry, rx * 2, ry * 2);
    ctx.globalAlpha = ga;
  }
  function line(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

  // ---------- geometry: zone px ↔ screen px ----------
  function homog(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
    }
    return solveLinear(A, b);
  }
  const hx = (m, x, y) => { const d = m[6] * x + m[7] * y + 1; return [(m[0] * x + m[1] * y + m[2]) / d, (m[3] * x + m[4] * y + m[5]) / d]; };
  const shapes = {};
  function geo(z, S) {
    const sz = S.screenZones.find(s => s.id === z.id);
    if (!sz) return null;
    shapes[z.id] = z.shape;
    const sig = sz.pts.join() + '|' + z.w + 'x' + z.h;
    let g = z.cache.d1geo;
    if (!g || g.sig !== sig) {
      const rect = [[0, 0], [z.w, 0], [z.w, z.h], [0, z.h]];
      g = z.cache.d1geo = { sig, fwd: homog(rect, sz.pts), inv: homog(sz.pts, rect) };
    }
    g.sz = sz;
    return g.fwd && g.inv ? g : null;
  }
  // half-plane (zone px) of what lies on screen to the left of X (dir = -1: to the right)
  const leftOf = (m, X, dir = 1) => [dir * (m[0] - X * m[6]), dir * (m[1] - X * m[7]), dir * (m[2] - X)];
  function clipHalf(pts, [a, b, c]) {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      const fp = a * p[0] + b * p[1] + c, fq = a * q[0] + b * q[1] + c;
      if (fp <= 0) out.push(p);
      if ((fp < 0 && fq > 0) || (fp > 0 && fq < 0)) { const k = fp / (fp - fq); out.push([lerp(p[0], q[0], k), lerp(p[1], q[1], k)]); }
    }
    return out;
  }
  // part of the zone between the screen verticals X0 and X1 (null = no limit)
  function band(g, w, h, X0, X1) {
    let p = [[0, 0], [w, 0], [w, h], [0, h]];
    if (X1 != null) p = clipHalf(p, leftOf(g.fwd, X1));
    if (X0 != null && p.length) p = clipHalf(p, leftOf(g.fwd, X0, -1));
    return p;
  }
  // zone x where the screen vertical X falls at height y
  const zoneX = (g, X, y) => { const [a, b, c] = leftOf(g.fwd, X); return -(b * y + c) / a; };
  // convex polygon offset d px inward
  function inset(pts, d) {
    const n = pts.length;
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p[0] / n; cy += p[1] / n; }
    const L = pts.map((a, i) => {
      const b = pts[(i + 1) % n];
      let nx = a[1] - b[1], ny = b[0] - a[0];
      const l = Math.hypot(nx, ny) || 1;
      nx /= l; ny /= l;
      if ((cx - (a[0] + b[0]) / 2) * nx + (cy - (a[1] + b[1]) / 2) * ny < 0) { nx = -nx; ny = -ny; }
      return [a[0] + nx * d, a[1] + ny * d, b[0] - a[0], b[1] - a[1]];
    });
    return L.map((l, i) => {
      const p = L[(i + n - 1) % n], det = p[2] * l[3] - p[3] * l[2];
      if (Math.abs(det) < 1e-9) return [l[0], l[1]];
      const k = ((l[0] - p[0]) * l[3] - (l[1] - p[1]) * l[2]) / det;
      return [p[0] + p[2] * k, p[1] + p[3] * k];
    });
  }
  const perimeter = pts => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + Math.hypot(q[0] - p[0], q[1] - p[1]); }, 0);
  // outline of each zone on screen (the pediment is a triangle)
  function screenPoly(sz) {
    const p = sz.pts;
    return shapes[sz.id] === 'triangulo' ? [p[3], [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2], p[2]] : p;
  }

  // ---------- house data on screen (recalculated if the mapping changes) ----------
  let memo = null;
  function info(S) {
    const zs = S.screenZones;
    if (memo && memo.src === zs) return memo;
    const F = { src: zs, ok: zs.length > 0, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 };
    for (const s of zs) { F.x0 = Math.min(F.x0, s.x0); F.x1 = Math.max(F.x1, s.x1); F.y0 = Math.min(F.y0, s.y0); F.y1 = Math.max(F.y1, s.y1); }
    if (!F.ok) Object.assign(F, { x0: 0, x1: 1, y0: 0, y1: 1 });
    F.U = (F.x1 - F.x0) / 1000;
    const area = s => (s.x1 - s.x0) * (s.y1 - s.y0);
    const big = kind => zs.filter(s => s.kind === kind).sort((a, b) => area(b) - area(a))[0];
    const door = big('door'), roof = big('roof');
    F.door = door ? [door.cx, door.cy] : [(F.x0 + F.x1) / 2, lerp(F.y0, F.y1, 0.7)];
    F.apex = roof ? [(roof.pts[0][0] + roof.pts[1][0]) / 2, (roof.pts[0][1] + roof.pts[1][1]) / 2] : [(F.x0 + F.x1) / 2, F.y0];
    F.roof = roof;
    F.roofH = roof ? roof.y1 - roof.y0 : (F.y1 - F.y0) * 0.3;
    F.wins = zs.filter(s => s.kind === 'window').sort((a, b) => a.cx - b.cx);
    const left = zs.reduce((a, b) => (b.x0 < a.x0 ? b : a), zs[0]);
    F.sparkY = left ? left.cy : (F.y0 + F.y1) / 2;
    F.sparkX = left ? left.cx : F.x0 + 100 * F.U;
    F.maxR = Math.max(...[[F.x0, F.y0], [F.x1, F.y0], [F.x0, F.y1], [F.x1, F.y1]].map(([x, y]) => Math.hypot(x - F.door[0], y - F.door[1]))) + 40;
    F.gv = (F.x1 - F.x0 + 360) / GUST_DUR;
    return (memo = F);
  }

  // ---------- timings that depend on the location ----------
  const scanX = (F, t) => lerp(F.sparkX, F.x1 + 90, sineIO((t - SCAN0) / (SCAN1 - SCAN0)));
  // wave of each beat: radius at u s and delay with which it reaches (x, y)
  const RIP_DUR = 1.5;
  const ripR = (F, u) => F.maxR * 0.9 * easeOut(u / RIP_DUR);
  const ripDelay = (F, x, y) => RIP_DUR * (1 - Math.cbrt(1 - Math.min(0.999, Math.hypot(x - F.door[0], y - F.door[1]) / (F.maxR * 0.9))));
  // glow of a zone's neon: the beat arrives with the wave, flickers before the burst,
  // and at the end one last breath of the whole house at once before going out
  function neonA(F, t, T, cx, cy, tOn, tg, seed) {
    const d = ripDelay(F, cx, cy), off = smooth(tg - 0.2, tg + 0.5, t);
    let a = 0.7 + 1.1 * beat(t - d);
    if (t > 12 && t < ON) { const k = smooth(12, ON - 0.2, t); if (hash(Math.floor(T * 20) + seed * 0.13) < 0.08 + 0.5 * k) a *= 0.25; }
    a *= sag(t) * (1 + 1.6 * decay(t - tOn, 0.3)) * (1 - 0.6 * off);
    // after the gust: the outline breathes again and culminates with the last beat
    const breath = smooth(GUST + GUST_DUR - 0.4, LAST, t);
    a = lerp(a, 1.1 + 1.6 * lastBeat(t) / 0.7, breath);
    return a * (1 - easeOut((t - LAST - 0.25) / 1.2));
  }
  const gustX = (F, t) => F.x1 + 160 - (t - GUST) * F.gv;
  const gustT = (F, X) => GUST + (F.x1 + 160 - X) / F.gv;
  // the burst wave leaves the door: radius and moment it reaches (x, y)
  const ringR = (F, t) => F.maxR * easeOut((t - ON) / RING_DUR);
  const ringT = (F, x, y) => ON + RING_DUR * (1 - Math.cbrt(1 - Math.min(1, Math.hypot(x - F.door[0], y - F.door[1]) / F.maxR)));
  function ignT(F, sz) {
    const n = F.wins.length, i = Math.max(0, F.wins.indexOf(sz));
    return (n <= 4 ? BEATS[i] : lerp(BEATS[0], BEATS[3], i / (n - 1))) + 0.1;
  }
  const winLight = (F, s, t) => { const i = ignT(F, s), o = gustT(F, s.cx); return smooth(i, i + 0.6, t) * (1 - smooth(o - 0.1, o + 0.5, t)) * sag(t) * boost(t); };

  // ---------- neon that draws the architecture ----------
  function neonPath(ctx, pts, col, lw, a) {
    tracePath(ctx, pts);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(col, 0.15 * a); ctx.lineWidth = lw * 5.5; ctx.stroke();
    ctx.strokeStyle = rgba(col, 0.5 * a); ctx.lineWidth = lw * 2.3; ctx.stroke();
    ctx.strokeStyle = rgba(mix(col, WHITE, 0.7), a); ctx.lineWidth = lw; ctx.stroke();
  }
  function outline(ctx, z, S, F, g, hot, lwk = 1) {
    const { w, h } = z, t = S.t, T = S.T, sz = g.sz;
    const X = scanX(F, t);
    if (t < SCAN0 || X < sz.x0) return;
    const lw = Math.max(1.5, Math.min(w, h) * 0.012 * lwk);
    const pts = cached(z, 'd1in' + lwk, () => inset(shapeOf(z), lw * 1.5));
    const tOn = ringT(F, sz.cx, sz.cy), tOff = gustT(F, sz.cx);
    const on = smooth(tOn, tOn + 0.25, t), off = smooth(tOff - 0.2, tOff + 0.5, t);
    const col = mix(mix(CYAN, hot, on), CYAN, off);
    const a = neonA(F, t, T, sz.cx, sz.cy, tOn, tOff, z.seed);
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (X < sz.x1 + 2) {
      const r = band(g, w, h, null, X);
      if (!r.length) { ctx.restore(); return; }
      tracePath(ctx, r); ctx.clip();
    }
    neonPath(ctx, pts, col, lw, a);
    // pulse running along the outline, like a neon sign, while the house is lit
    const chase = on * (1 - off);
    if (chase > 0.01) {
      const per = cached(z, 'd1per' + lwk, () => perimeter(pts));
      ctx.setLineDash([per * 0.12, per * 0.88]);
      ctx.lineDashOffset = -((T * 0.2 + hash(z.seed)) % 1) * per;
      ctx.strokeStyle = rgba(WHITE, 0.8 * chase); ctx.lineWidth = lw * 1.3; ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
    // segment just traced by the beam: hot white that cools behind
    if (t < SCAN1 + 0.3 && X - 180 < sz.x1) {
      const f = band(g, w, h, X - 180, X);
      if (f.length) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        tracePath(ctx, f); ctx.clip();
        const y = h / 2, gr = ctx.createLinearGradient(zoneX(g, X - 180, y), 0, zoneX(g, X, y), 0);
        gr.addColorStop(0, rgba(CYAN, 0)); gr.addColorStop(0.6, rgba(CYAN, 0.6)); gr.addColorStop(1, rgba(WHITE, 1));
        tracePath(ctx, pts);
        ctx.strokeStyle = gr;
        ctx.globalAlpha = 0.25; ctx.lineWidth = lw * 6; ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = lw * 1.6; ctx.stroke();
        ctx.restore();
      }
    }
  }

  // ---------- sweep: the cladding and bricks glow as the beam passes ----------
  function gridPath(z) {
    const { w, h } = z, m = Math.min(w, h), p = new Path2D();
    if (z.kind === 'roof') {
      // horizontal boards of the pediment
      const sp = Math.max(5, h * 0.07);
      for (let y = h - sp * 0.5; y > 0; y -= sp) { p.moveTo(0, y); p.lineTo(w, y); }
      return p;
    }
    const split = h * 0.64, sp = Math.max(6, m * 0.05);
    for (let x = sp / 2; x < w; x += sp) { p.moveTo(x, 0); p.lineTo(x, split); }
    const bh = Math.max(5, m * 0.045), bw = bh * 2.7;
    for (let y = split + bh * 0.5, row = 0; y < h; y += bh, row++) {
      p.moveTo(0, y); p.lineTo(w, y);
      for (let x = (row % 2) * bw * 0.5; x < w; x += bw) { p.moveTo(x, y); p.lineTo(x, Math.min(h, y + bh)); }
    }
    return p;
  }
  function sweepLines(ctx, z, F, g, t) {
    if (t < SCAN0 || t > SCAN1 + 0.5) return;
    const { w, h } = z, X = scanX(F, t), TR = 260 * F.U;
    if (X < g.sz.x0 || X - TR > g.sz.x1) return;
    const path = cached(z, 'd1grid', () => gridPath(z));
    const gr = ctx.createLinearGradient(zoneX(g, X - TR, h / 2), 0, zoneX(g, X, h / 2), 0);
    gr.addColorStop(0, rgba(CYAN, 0)); gr.addColorStop(0.7, rgba(CYAN, 0.25)); gr.addColorStop(0.96, rgba(WHITE, 0.95)); gr.addColorStop(1, rgba(WHITE, 0));
    ctx.strokeStyle = gr;
    ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.007);
    ctx.stroke(path);
  }

  // ---------- walls ----------
  // lit house: a single neon line on the cornice where the boards meet the brick,
  // and every ~3 s a band of light runs along the joints (not a fixed grid)
  const SHINE = 3.2;
  function belt(ctx, z, F, g, t, T) {
    const { w, h } = z, sz = g.sz, U = F.U;
    const t0 = ringT(F, sz.cx, sz.cy), gx = gustX(F, t);
    let a = smooth(t0, t0 + 0.3, t) * boost(t);
    if (a <= 0.01 || gx < sz.x0 - 40 * U) return;
    if (t < t0 + 0.45 && hash(Math.floor(T * 24) + z.seed) < 0.35) a *= 0.25;
    ctx.save();
    if (gx < sz.x1 + 40 * U) { const r = band(g, w, h, null, gx); if (!r.length) { ctx.restore(); return; } tracePath(ctx, r); ctx.clip(); }
    const y = h * 0.64, lw = Math.max(1.5, Math.min(w, h) * 0.011);
    neonPath(ctx, [[0, y], [w, y]], ORANGE, lw, 0.8 * a * (0.85 + 0.15 * Math.sin(T * 2.4)));
    // band sweeping the joints: leaves the door outward
    const ph = ((t - ON - 0.8) / SHINE) % 1;
    if (t > ON + 0.8 && ph < 0.55) {
      const k = sineIO(ph / 0.55), side = sz.cx < F.door[0] ? -1 : 1, TR = 220 * U;
      const X = F.door[0] + side * k * (F.x1 - F.x0) * 0.6;
      const x1 = zoneX(g, X, h / 2), x0 = zoneX(g, X - side * TR, h / 2);
      const gr = ctx.createLinearGradient(x0, 0, x1, 0), b = a * Math.sin(Math.PI * k);
      gr.addColorStop(0, rgba(SEAM, 0)); gr.addColorStop(0.75, rgba(SEAM, 0.45 * b)); gr.addColorStop(0.95, rgba([255, 230, 190], 0.9 * b)); gr.addColorStop(1, rgba(SEAM, 0));
      ctx.strokeStyle = gr;
      ctx.lineWidth = Math.max(1, Math.min(w, h) * 0.008);
      ctx.stroke(cached(z, 'd1grid', () => gridPath(z)));
    }
    ctx.restore();
  }
  function drawWall(ctx, z, S, F, g) {
    const { w, h } = z, t = S.t, T = S.T, sz = g.sz;
    ctx.globalCompositeOperation = 'lighter';
    // when the house lights up: wall washers from the floor, orange and violet alternating
    if (t > ON) {
      const n = Math.max(2, Math.round(w / (h * 0.42))), sw = w / n;
      for (let i = 0; i < n; i++) {
        const x = (i + 0.5) * sw, [X, Y] = hx(g.fwd, x, h);
        const t0 = ringT(F, X, Y), t1 = gustT(F, X) + hash(z.seed + i) * 0.15;
        let k = smooth(t0, t0 + 0.2, t) * (1 - smooth(t1, t1 + 0.35, t));
        // turn-on and turn-off with flicker (as they pass the gust they flicker like candles)
        if ((t > t0 && t < t0 + 0.4) || (t > t1 - 0.6 && t < t1 + 0.35)) k *= hash(Math.floor(T * 26) + i * 7.1 + z.seed) < 0.4 ? 0.15 : 1;
        if (k <= 0.01) continue;
        k *= (0.82 + 0.18 * Math.sin(T * 1.1 + i * 2.1 + z.seed)) * boost(t);
        const col = (i + z.index) % 2 ? VIOLET : ORANGE;
        blob(ctx, col, x, h * 1.05, sw * 0.7, h * 1.1, 0.9 * k, true);
        blob(ctx, col, x, h, sw * 0.3, h * 0.38, 0.8 * k);
      }
    }
    // lit windows illuminate the wall around them (blooms when lit)
    for (const win of F.wins) {
      if (win.cx < sz.x0 || win.cx > sz.x1 || win.cy < sz.y0 || win.cy > sz.y1) continue;
      const L = winLight(F, win, t);
      if (L <= 0.01) continue;
      const i0 = ignT(F, win), bloom = 1 + 0.8 * pulse(t, i0, i0 + 0.7, 0.25);
      const [px, py] = hx(g.inv, win.cx, win.cy);
      const rx = ((win.x1 - win.x0) / (sz.x1 - sz.x0)) * w, ry = ((win.y1 - win.y0) / (sz.y1 - sz.y0)) * h;
      blob(ctx, WARM, px, py + ry * 0.1, rx * 1.3, ry * 1.5, 0.55 * L * bloom * (0.8 + 0.2 * flicker(T, win.index)), true);
    }
    belt(ctx, z, F, g, t, T);
    sweepLines(ctx, z, F, g, t);
    ctx.globalCompositeOperation = 'source-over';
    outline(ctx, z, S, F, g, ORANGE);
  }

  // ---------- pediment: sky, stars and moon ----------
  // The pediment canvas is very distorted (its top edge is almost a point), so
  // it is drawn in screen px from the global layer, clipped to the triangle.
  function makeStars(F, P, r) {
    const R = rng(r.id.length * 31 + 7), list = [], top = r.y0, hh = r.y1 - r.y0;
    for (let i = 0; i < 80 && list.length < 22; i++) {
      let a = R(), b = R();
      if (a + b > 1) { a = 1 - a; b = 1 - b; }
      const x = P[0][0] + (P[1][0] - P[0][0]) * a + (P[2][0] - P[0][0]) * b;
      const y = P[0][1] + (P[1][1] - P[0][1]) * a + (P[2][1] - P[0][1]) * b;
      if (y < top + hh * 0.3 || y > r.y1 - hh * 0.08) continue;
      list.push({ x, y, s: 1.4 + 1.8 * R(), sp: 1 + R() * 3, ph: R() * TAU, d: R() * 2.5, big: R() < 0.25 });
    }
    return list;
  }
  function drawRoofG(ctx, F, S) {
    const r = F.roof;
    if (!r) return;
    const t = S.t, T = S.T, U = F.U, P = screenPoly(r), top = r.y0, bot = r.y1, hh = bot - top;
    const tOn = ringT(F, r.cx, r.cy), tg = gustT(F, r.cx);
    // at the end the whole pediment fades into the house's last breath
    const endF = 1 - easeOut((t - LAST - 0.25) / 1.2);
    if (endF <= 0) return;
    ctx.save();
    tracePath(ctx, P); ctx.clip();
    ctx.globalAlpha = endF;
    // very dark sky: only a tint, the moon provides the light
    const sky = smooth(MOON0 - 0.5, MOON0 + 2, t);
    if (sky > 0) {
      const gr = ctx.createLinearGradient(0, top, 0, bot);
      gr.addColorStop(0, rgba([0, 1, 5], sky)); gr.addColorStop(0.55, rgba([1, 2, 10], sky)); gr.addColorStop(1, rgba([4, 6, 22], sky));
      ctx.fillStyle = gr; ctx.fillRect(r.x0, top, r.x1 - r.x0, hh);
      ctx.globalCompositeOperation = 'lighter';
      for (const s of (F.stars ??= makeStars(F, P, r))) {
        const a = sky * (0.45 + 0.55 * Math.sin(T * s.sp + s.ph)) * smooth(MOON0 + s.d, MOON0 + s.d + 0.6, t);
        if (a < 0.03) continue;
        ctx.fillStyle = rgba([255, 245, 225], a);
        ctx.fillRect(s.x - (s.s * U) / 2, s.y - (s.s * U) / 2, s.s * U, s.s * U);
        if (s.big) blob(ctx, MOONC, s.x, s.y, s.s * 5 * U, s.s * 5 * U, a * 0.5);
      }
    }
    // the moon rises slowly and settles; glows brighter when the house lights up
    const k = easeOut((t - MOON0) / (MOON1 - MOON0));
    if (k > 0) {
      const R = hh * 0.3, mx = lerp(r.x0, r.x1, 0.4), my = lerp(bot + R * 1.3, top + hh * 0.64, k);
      const c = smooth(tg - 0.4, tg + 2.0, t), lit = (0.9 + 0.5 * decay(t - tOn, 0.6)) * (1 - 0.45 * c);
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, MOONC, mx, my, R * 5, R * 3.6, 0.35 * lit, true);
      blob(ctx, [225, 232, 255], mx, my, R * 2, R * 2, 0.5 * lit, true);
      ctx.globalCompositeOperation = 'source-over';
      // under the cloud the moon nearly goes out (a dark cloud cannot darken a projection)
      ctx.globalAlpha = endF * (1 - 0.85 * c);
      const gr = ctx.createRadialGradient(mx - R * 0.35, my - R * 0.35, R * 0.1, mx, my, R);
      gr.addColorStop(0, '#fffdf2'); gr.addColorStop(0.7, '#f3ead0'); gr.addColorStop(1, '#c4b78f');
      ctx.fillStyle = gr; ell(ctx, mx, my, R, R);
      ctx.fillStyle = 'rgba(150,140,112,0.45)';
      ell(ctx, mx - R * 0.3, my + R * 0.12, R * 0.22, R * 0.17);
      ell(ctx, mx + R * 0.28, my - R * 0.28, R * 0.13, R * 0.11);
      ell(ctx, mx + R * 0.32, my + R * 0.36, R * 0.1, R * 0.08);
      ctx.globalAlpha = endF;
      // cloud covering the moon when the gust passes: dark lobes with a silver edge
      if (c > 0) {
        const cx = lerp(mx + R * 7, mx - R * 0.6, c), cy = my + R * 0.15;
        const lobes = [[-2.1, 0.35, 2.2, 1.3], [0, 0, 2.8, 1.75], [2.4, 0.3, 2.4, 1.45], [4.6, 0.15, 2, 1.2]];
        ctx.globalCompositeOperation = 'source-over';
        for (let pass = 0; pass < 2; pass++) for (const [dx, dy, rx, ry] of lobes) blob(ctx, CLOUD, cx + dx * R, cy + dy * R + pass * R * 0.15, rx * R, ry * R, 1, true);
        // silver edge: thin, on the top of each lobe, stronger near the moon
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (const [dx, dy, rx, ry] of lobes) {
          const x = cx + dx * R, near = Math.exp(-Math.abs(x - mx) / (R * 2.2));
          if (near < 0.05) continue;
          ctx.beginPath(); ctx.ellipse(x, cy + dy * R, rx * R * 0.62, ry * R * 0.55, 0, Math.PI * 1.2, Math.PI * 1.8);
          ctx.strokeStyle = rgba(MOONC, 0.35 * near); ctx.lineWidth = R * 0.22; ctx.stroke();
          ctx.strokeStyle = rgba([235, 240, 255], 0.8 * near); ctx.lineWidth = R * 0.06; ctx.stroke();
        }
      }
    }
    // horizontal boards of the pediment as the beam passes
    if (t > SCAN0 && t < SCAN1 + 0.5) {
      const X = scanX(F, t), TR = 260 * U;
      const gr = ctx.createLinearGradient(X - TR, 0, X, 0);
      gr.addColorStop(0, rgba(CYAN, 0)); gr.addColorStop(0.7, rgba(CYAN, 0.25)); gr.addColorStop(0.96, rgba(WHITE, 0.95)); gr.addColorStop(1, rgba(WHITE, 0));
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = gr; ctx.lineWidth = 1.4 * U;
      ctx.beginPath();
      for (let y = bot - hh * 0.035; y > top + hh * 0.3; y -= hh * 0.07) { ctx.moveTo(X - TR, y); ctx.lineTo(X, y); }
      ctx.stroke();
    }
    ctx.restore();
    // pediment neon, in screen px so the thickness is uniform
    const X = scanX(F, t);
    if (t < SCAN0 || X < r.x0) return;
    const lw = 2.8 * U, pts = (F.roofIn ??= inset(P, lw * 1.5));
    const on = smooth(tOn, tOn + 0.25, t), off = smooth(tg - 0.2, tg + 0.5, t);
    const a = neonA(F, t, T, r.cx, r.cy, tOn, tg, 5.4);
    if (a <= 0.01) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.beginPath(); ctx.rect(r.x0 - 20 * U, top - 20 * U, X - r.x0 + 20 * U, hh + 40 * U); ctx.clip();
    neonPath(ctx, pts, mix(mix(CYAN, ORANGE, on), CYAN, off), lw, a);
    const chase = on * (1 - off);
    if (chase > 0.01) {
      const per = perimeter(pts);
      ctx.setLineDash([per * 0.12, per * 0.88]);
      ctx.lineDashOffset = -((T * 0.2) % 1) * per;
      ctx.strokeStyle = rgba(WHITE, 0.8 * chase); ctx.lineWidth = lw * 1.3; ctx.stroke();
      ctx.setLineDash([]);
    }
    if (t < SCAN1 + 0.3) {
      const gr = ctx.createLinearGradient(X - 180 * U, 0, X, 0);
      gr.addColorStop(0, rgba(CYAN, 0)); gr.addColorStop(0.6, rgba(CYAN, 0.6)); gr.addColorStop(1, rgba(WHITE, 1));
      tracePath(ctx, pts);
      ctx.strokeStyle = gr;
      ctx.globalAlpha = 0.25; ctx.lineWidth = lw * 6; ctx.stroke();
      ctx.globalAlpha = 1; ctx.lineWidth = lw * 1.6; ctx.stroke();
    }
    ctx.restore();
  }

  // ---------- red door: the heart of the house ----------
  function drawDoor(ctx, z, S, F, g) {
    const { w, h } = z, t = S.t, T = S.T;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    const hb = (t < ON ? beat(t) : 0) + lastBeat(t) * 1.3, tg = gustT(F, g.sz.cx);
    const lit = smooth(ON, ON + 0.1, t) * (1 - 0.8 * smooth(tg, tg + 0.8, t)) * (1 - smooth(22.4, 23.6, t));
    const br = 0.85 + 0.15 * Math.sin(T * 2.4);
    ctx.globalCompositeOperation = 'lighter';
    // each beat: a white flash of the whole door (on red wood it looks intense pinkish-red)
    const flash = Math.min(1, hb * 2.2);
    if (flash > 0.01) { ctx.fillStyle = rgba(WHITE, flash); ctx.fillRect(0, 0, w, h); }
    blob(ctx, FIRE, w / 2, h * 0.55, w * 1.1, h * 0.8, lit * 0.45 * br, true);
    if (lit > 0.01) { ctx.fillStyle = rgba(FIRE, 0.3 * lit * br); ctx.fillRect(0, 0, w, h); }
    // light escaping through the panels and cracks; the door swells on each beat
    const leak = clamp(smooth(6.4, ON, t) * 0.45 + hb * 0.6 + lit * br) * sag(t);
    const sc = 1 + 0.08 * Math.min(1, hb);
    ctx.save();
    ctx.translate(w / 2, h / 2); ctx.scale(sc, sc); ctx.translate(-w / 2, -h / 2);
    if (leak > 0.01) {
      ctx.fillStyle = rgba(FIRE, 0.55 * leak);
      for (const x of [0.15, 0.53]) { ctx.beginPath(); ctx.roundRect(w * x, h * 0.56, w * 0.32, h * 0.36, w * 0.04); ctx.fill(); }
      ctx.strokeStyle = rgba(WHITE, 0.8 * leak);
      ctx.lineWidth = Math.max(1, w * 0.035);
      for (const x of [0.15, 0.53]) { ctx.beginPath(); ctx.roundRect(w * x, h * 0.56, w * 0.32, h * 0.36, w * 0.04); ctx.stroke(); }
      // small upper window lit from inside, with its cross
      ctx.fillStyle = rgba(FIRE, 0.35 * leak);
      ctx.fillRect(w * 0.17, h * 0.09, w * 0.66, h * 0.38);
      blob(ctx, FIRE, w / 2, h, w * 0.9, h * 0.2, leak);
      ctx.strokeStyle = rgba(FIRE, 0.9 * leak);
      ctx.lineWidth = Math.max(1.5, w * 0.06);
      ctx.strokeRect(w * 0.03, h * 0.015, w * 0.94, h * 0.97);
      // lock next to the knob
      blob(ctx, WHITE, w * 0.14, h * 0.53, w * 0.22, w * 0.22, leak);
      ctx.fillStyle = rgba(WHITE, leak);
      ell(ctx, w * 0.14, h * 0.515, w * 0.035, w * 0.035);
      tri(ctx, w * 0.14, h * 0.515, w * 0.115, h * 0.55, w * 0.165, h * 0.55);
    }
    if (leak > 0.01) {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#000';
      ctx.fillRect(w * 0.48, h * 0.09, w * 0.04, h * 0.38);
      ctx.fillRect(w * 0.17, h * 0.27, w * 0.66, h * 0.025);
      ctx.globalCompositeOperation = 'lighter';
    }
    ctx.restore();
    // burst flash
    const fl = decay(t - ON, 0.25);
    if (fl > 0.01) { ctx.fillStyle = rgba(WHITE, fl); ctx.fillRect(0, 0, w, h); }
    ctx.globalCompositeOperation = 'source-over';
    outline(ctx, z, S, F, g, [255, 225, 160], 1.2);
  }

  // ---------- windows: candles, pumpkin and cat ----------
  function candleState(ti, to, t, T, seed) {
    const grow = t < ti + 0.08 ? 0 : easeBack(clamp((t - ti - 0.08) / 0.5));
    const die = 1 - smooth(to - 0.05, to + 0.28, t);
    const fl = 0.84 + 0.28 * noise1(T * 7 + seed * 3.3) - 0.12 * noise1(T * 17 + seed);
    // just before dying, the flame flares up fighting the wind
    const fight = 1 + 0.6 * pulse(t, to - 0.3, to - 0.02, 0.06);
    const s = grow * die * sag(t) * boost(t) * fight;
    return { s, f: clamp(s * fl, 0, 1.6), ti, to, lean: -smooth(to - 0.45, to, t), sway: (noise1(T * 2.3 + seed) - 0.5) * 2, seed };
  }
  // pre-drawn candle body: static, per frame only its opacity changes
  function candleSprite(cw, ch, seed) {
    const [c, ctx] = canvas2d(Math.ceil(cw * 1.8), Math.ceil(ch + cw * 0.4 + 2)), x = c.width / 2, yb = c.height - 1, top = yb - ch;
    const gr = ctx.createLinearGradient(x - cw / 2, 0, x + cw / 2, 0);
    gr.addColorStop(0, '#8a3a10'); gr.addColorStop(0.32, '#ffe6b8'); gr.addColorStop(0.55, '#ffd9a0'); gr.addColorStop(1, '#7a300c');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.roundRect(x - cw / 2, top, cw, ch, [cw * 0.2, cw * 0.2, 0, 0]); ctx.fill();
    // wax drips down the edge
    const r = rng(seed);
    for (const side of [-1, 1]) {
      const dl = ch * (0.12 + r() * 0.3);
      ctx.beginPath(); ctx.roundRect(x + side * cw * 0.42 - cw * 0.1, top, cw * 0.2, dl, cw * 0.1); ctx.fill();
    }
    // light comes from above: the base is in shadow
    ctx.globalCompositeOperation = 'source-atop';
    const sh = ctx.createLinearGradient(0, top, 0, yb);
    sh.addColorStop(0, 'rgba(30,8,0,0)'); sh.addColorStop(1, 'rgba(30,8,0,0.65)');
    ctx.fillStyle = sh; ctx.fillRect(0, top, c.width, ch);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff7e4'; ell(ctx, x, top + cw * 0.06, cw * 0.44, cw * 0.13);
    ctx.fillStyle = '#1a0a04'; ctx.fillRect(x - cw * 0.05, top - cw * 0.32, cw * 0.1, cw * 0.36);
    return c;
  }
  function candleBody(ctx, spr, x, yb, a) {
    if (a <= 0.01) return;
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * clamp(a);
    ctx.drawImage(spr, x - spr.width / 2, yb - spr.height + 1);
    ctx.globalAlpha = ga;
  }
  // flame: pre-drawn teardrop that stretches, leans and sways with a transform
  let flameSpr = null;
  function flameSprite() {
    if (flameSpr) return flameSpr;
    const [c, g] = canvas2d(64, 128), x = 32;
    flameSpr = c;
    const y = 112, fh = 100, fw = 24;
    g.beginPath();
    g.moveTo(x, y + fw * 0.3);
    g.bezierCurveTo(x - fw, y + fw * 0.1, x - fw * 0.75, y - fh * 0.45, x, y - fh);
    g.bezierCurveTo(x + fw * 0.75, y - fh * 0.45, x + fw, y + fw * 0.1, x, y + fw * 0.3);
    const gr = g.createRadialGradient(x, y - fh * 0.12, 0, x, y - fh * 0.3, fh * 0.85);
    gr.addColorStop(0, 'rgb(255,255,245)'); gr.addColorStop(0.3, 'rgb(255,235,140)');
    gr.addColorStop(0.7, 'rgba(255,150,40,0.95)'); gr.addColorStop(1, 'rgba(255,70,0,0.5)');
    g.fillStyle = gr; g.fill();
    return c;
  }
  // pre-drawn tilted variants (tilting with transform is expensive in software rasterization)
  const flameSk = {};
  function flameSkew(q) {
    if (flameSk[q]) return flameSk[q];
    // the tip (y=12) shifts 100·s relative to the base (y=112); the flame occupies y∈[12,119]
    const s = q / 20, e = s > 0 ? 119 * s : 12 * s;
    const [c, g] = canvas2d(64 + Math.ceil(Math.abs(s) * 107), 128);
    g.setTransform(1, 0, -s, 1, e, 0);
    g.drawImage(flameSprite(), 0, 0);
    return (flameSk[q] = { c, bx: 32 - 112 * s + e });
  }
  function flameShape(ctx, x, y, fh, fw, sway, lean, a) {
    if (a <= 0.01 || fh < 0.5) return;
    const h2 = fh * (1 - Math.abs(lean) * 0.35), dx = sway * fw * 0.6 + lean * fh * 0.85;
    const A = fw / 24, D = h2 / 100;
    const q = clamp(Math.round((dx / (100 * A)) * 20), -40, 40), v = flameSkew(q);
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * clamp(a);
    ctx.drawImage(v.c, x - v.bx * A, y - 112 * D, v.c.width * A, 128 * D);
    ctx.globalAlpha = ga;
  }
  // pre-drawn pumpkin (normal and open mouth) to avoid repeating its blurred shadows
  function pumpkinSprites(r, seed) {
    return [0.4, 0.8].map(mouth => {
      const n = Math.ceil(r * 4.4), [c, pg] = canvas2d(n, n);
      drawPumpkin(pg, n / 2, n / 2 + r * 0.1, r, 0, { light: 1 / flicker(0, seed), mouth, seed });
      return c;
    });
  }
  // sitting cat, feet at (0,0); s = height
  function catShape(ctx, s, p) {
    const hx0 = p.head * s * 0.05, e = p.ear;
    ctx.beginPath();
    ctx.moveTo(-s * 0.3, 0);
    ctx.bezierCurveTo(-s * 0.38, -s * 0.3, -s * 0.24, -s * 0.52, -s * 0.11, -s * 0.6);
    ctx.lineTo(s * 0.11, -s * 0.6);
    ctx.bezierCurveTo(s * 0.24, -s * 0.52, s * 0.38, -s * 0.3, s * 0.3, 0);
    ctx.closePath(); ctx.fill();
    ell(ctx, hx0, -s * 0.7, s * 0.19, s * 0.16);
    tri(ctx, hx0 - s * 0.18, -s * 0.72, hx0 - s * 0.04, -s * 0.83, hx0 - s * 0.16 - e * s * 0.08, -s * 0.98 + e * s * 0.08);
    tri(ctx, hx0 + s * 0.18, -s * 0.72, hx0 + s * 0.04, -s * 0.83, hx0 + s * 0.16, -s * 0.98);
    // tail: sways; from fright it bristles and stands stiff upward
    const k = p.puff;
    ctx.lineWidth = s * (0.075 + 0.06 * k); ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s * 0.22, -s * 0.03);
    ctx.bezierCurveTo(s * lerp(0.55, 0.42, k), s * lerp(0, -0.05, k), s * lerp(0.62 + p.tail * 0.08, 0.44, k), -s * lerp(0.25, 0.6, k),
      s * lerp(0.48 + p.tail * 0.22, 0.38, k), -s * lerp(0.48 - Math.abs(p.tail) * 0.06, 1.02, k));
    ctx.stroke();
  }
  function catPose(t, T) {
    // startled jump with a stretch and squash when the house lights up
    const u = t - ON;
    let jy = 0, sy = 1;
    if (u > 0 && u < 0.45) { const k = u / 0.45; jy = -4 * k * (1 - k) * 0.22; sy = 1 + 0.16 * Math.sin(Math.PI * k) * (k < 0.5 ? 1 : -0.4); }
    else if (u >= 0.45 && u < 0.75) sy = 1 - 0.18 * Math.sin(Math.PI * (u - 0.45) / 0.3);
    let open = smooth(CAT_EYES, CAT_EYES + 0.3, t) * (1 - smooth(23.2, 23.4, t));
    for (const b of [9.7, 12.0, 15.2, 18.6, 21.9]) open *= 1 - pulse(t, b, b + 0.2, 0.07);
    return {
      head: lerp(0.8, -0.2, smooth(14.4, 15.2, t)) + 0.15 * Math.sin(T * 0.7) - 0.6 * pulse(t, 9, 9.9, 0.3),
      tail: Math.sin(T * 1.7) * 0.8 + 0.25 * Math.sin(T * 4.3 + 1),
      puff: pulse(u, 0, 1.6, 0.12),
      ear: pulse(t, 16.3, 16.55, 0.07) + pulse(t, 18.1, 18.3, 0.06) + pulse(u, 0, 1.2, 0.1),
      jy, sy, open, wide: pulse(u, 0, 1.5, 0.1),
    };
  }

  function roomSprite(w, h, sill, cw, list) {
    const [c, g] = canvas2d(w, h);
    g.fillStyle = 'rgb(46,16,6)'; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    blob(g, [255, 120, 40], w * 0.5, sill - h * 0.25, w * 0.8, h * 0.95, 0.7, true);
    for (const k of list) blob(g, WARM, k.u * w, sill - k.k * h - cw, h * 0.45, h * 0.5, 0.6, true);
    g.globalCompositeOperation = 'source-over';
    const gr = g.createLinearGradient(0, 0, 0, h * 0.55);
    gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h * 0.55);
    g.fillStyle = 'rgb(80,34,12)'; g.fillRect(0, sill, w, h - sill);
    g.fillStyle = 'rgb(255,200,140)'; g.globalAlpha = 0.85; g.fillRect(0, sill, w, Math.max(1.5, h * 0.022));
    return c;
  }

  function drawWindow(ctx, z, S, F, g) {
    const { w, h } = z, t = S.t, T = S.T, sz = g.sz;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    const v = VARIANTS[z.index % VARIANTS.length], ign = ignT(F, sz);
    // small windows: fewer and thicker candles, so they read at 20 m
    const small = sz.x1 - sz.x0 < 125 * F.U;
    const list = small && v !== 'pumpkin' && v !== 'cat' ? CANDLES[v].slice(0, v === 'trio' ? 3 : 2).map(c => Object.assign({}, c, { k: c.k * 0.62 })) : CANDLES[v];
    const sill = h * 0.84, cw = Math.max(3, small ? Math.min(w * 0.1, h * 0.16) : Math.min(w * 0.065, h * 0.11));
    const sxOf = u => sz.x0 + u * (sz.x1 - sz.x0);
    const cs = list.map((c, i) => Object.assign(candleState(ign + c.d, gustT(F, sxOf(c.u)) + hash(z.seed + i) * 0.1, t, T, z.seed + i * 17), c));
    const pTo = gustT(F, sxOf(0.5));
    const pk = v === 'pumpkin' ? smooth(ign, ign + 0.35, t) * (1 - smooth(pTo, pTo + 0.5, t)) * sag(t) * boost(t) : 0;
    let L = pk * 0.7;
    for (const c of cs) L += (c.f * 1.25) / cs.length;
    L = clamp(L);
    // back room (pre-drawn): warm wall, lighter near the flames, dim ceiling, windowsill
    if (L > 0.01) {
      const room = cached(z, 'd1room' + small, () => roomSprite(w, h, sill, cw, list));
      ctx.globalAlpha = L;
      ctx.drawImage(room, 0, 0);
      ctx.globalAlpha = 1;
    }
    const cat = v === 'cat' ? catPose(t, T) : null, cs0 = cat ? s => s * h * 0.62 : null;
    // huge shadow of the cat on the back wall, swaying with the flame
    if (cat && L > 0.01) {
      const c = cs[0], s = cs0(1), lx = c.u * w;
      ctx.save();
      ctx.translate(lx + (0.4 * w - lx) * 1.5 - c.sway * w * 0.02, sill - h * 0.02 + cat.jy * s * 1.4);
      ctx.scale(1.4 / Math.sqrt(cat.sy), 1.4 * cat.sy);
      ctx.fillStyle = ctx.strokeStyle = rgba([0, 0, 0], 0.62 * L);
      catShape(ctx, s, cat);
      ctx.restore();
    }
    const sprs = cached(z, 'd1cs' + small, () => list.map((c, i) => candleSprite(cw, c.k * h, z.seed + i * 17)));
    cs.forEach((c, i) => candleBody(ctx, sprs[i], c.u * w, sill + h * 0.01, Math.min(1, L * 1.2 + c.f * 0.3)));
    if (v === 'pumpkin' && L > 0.01) {
      const r = Math.min(w * 0.2, h * 0.36), u = t - ON, k = u / 0.42;
      const hop = u > 0 && k < 1 ? 4 * k * (1 - k) : 0;
      let sq = 0.6 * decay(t - ign, 0.25) * Math.sin((t - ign) * 24);
      if (u > 0 && u < 0.42) sq -= 0.6 * Math.sin(Math.PI * k);
      else if (u >= 0.42 && u < 0.72) sq += 0.8 * Math.sin(Math.PI * (u - 0.42) / 0.3);
      const pks = cached(z, 'd1pk', () => pumpkinSprites(r, z.seed)), n = pks[0].width;
      const kx = 1 + sq * 0.12, ky = 1 - sq * 0.12, cx = w / 2, cy = sill - r * 0.8 * ky - hop * r * 0.4, mo = pulse(u, 0, 1.4, 0.15);
      // normal mouth ↔ open mouth in surprise when the burst happens
      for (const [img, a] of [[pks[0], 1 - mo], [pks[1], mo]]) {
        if (a <= 0.01) continue;
        ctx.globalAlpha = clamp(L * 1.4) * a;
        ctx.drawImage(img, cx - (n / 2) * kx, cy - (n / 2 + r * 0.1) * ky, n * kx, n * ky);
      }
      ctx.globalAlpha = 1;
      // the candle inside makes the face flicker
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, FIRE, cx, cy + r * 0.12 * ky, r * 0.8 * kx, r * 0.5 * ky, 0.4 * clamp(pk) * flicker(T, z.seed));
      ctx.globalCompositeOperation = 'source-over';
    }
    if (cat && L > 0.01) {
      ctx.save();
      ctx.translate(0.4 * w, sill + cat.jy * cs0(1));
      ctx.scale(1 / Math.sqrt(cat.sy), cat.sy);
      ctx.translate(cs0(1) * 0.035, -cs0(1) * 0.01);
      ctx.fillStyle = ctx.strokeStyle = rgba([255, 165, 80], 0.85 * L);
      catShape(ctx, cs0(1), cat);
      ctx.translate(-cs0(1) * 0.035, cs0(1) * 0.01);
      ctx.fillStyle = ctx.strokeStyle = '#050208';
      catShape(ctx, cs0(1), cat);
      ctx.restore();
    }
    // flames, ignition sparks and smoke when going out
    for (const c of cs) {
      const x = c.u * w, y = sill + h * 0.01 - c.k * h - cw * 0.3, fh = cw * (small ? 2.8 : 2.2) * c.s, fw = cw * 0.42 * Math.min(1.2, c.s);
      flameShape(ctx, x, y, fh, fw, c.sway, c.lean, clamp(c.f * 1.1));
      ctx.globalCompositeOperation = 'lighter';
      blob(ctx, FIRE, x, y - fh * 0.35, fh * (small ? 1.6 : 1.2), fh * (small ? 1.8 : 1.45), 0.8 * c.f);
      const u = t - c.ti;
      if (u > 0 && u < 0.4) {
        blob(ctx, WHITE, x, y, cw * 3 * (1 - u / 0.4), cw * 3 * (1 - u / 0.4), 1);
        ctx.fillStyle = rgba(FIRE, 1 - u / 0.4);
        for (let i = 0; i < 6; i++) {
          const a = hash(c.seed + i) * TAU, sp = cw * (5 + 6 * hash(c.seed + i * 3));
          ctx.fillRect(x + Math.cos(a) * sp * u - 1, y + Math.sin(a) * sp * u + cw * 18 * u * u - 1, 2, 2);
        }
      }
      const sm = t - c.to - 0.15;
      if (sm > 0 && sm < 2.4) {
        const k = sm / 2.4;
        blob(ctx, EMBER, x, y + cw * 0.2, cw * 0.7, cw * 0.7, 1 - smooth(0, 0.4, k));
        for (let j = 1; j <= 6; j++) {
          const q = j / 6;
          if (sm < q * 0.45) continue;
          const yy = y - q * h * (0.1 + 0.45 * easeOut(k)), xx = x - q * w * 0.07 * k + Math.sin(q * 5 + T * 2 + c.seed) * cw * 0.7 * q, rr = cw * (0.35 + 1.2 * q);
          blob(ctx, SMOKE, xx, yy, rr, rr * 1.2, 0.3 * (1 - q * 0.55) * (1 - k), true);
        }
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    // cat's eyes: glow in the dark (round pupil) and in light (slit)
    if (cat && cat.open > 0.02) {
      const s = cs0(1), ex = 0.4 * w + cat.head * s * 0.05, ey = sill + cat.jy * s + (-s * 0.71) * cat.sy, ew = s * 0.068 * (1 + 0.2 * cat.wide), eh = s * 0.05 * cat.open * (1 + 0.3 * cat.wide);
      const dark = 1 - L;
      ctx.globalCompositeOperation = 'lighter';
      for (const d of [-1, 1]) {
        const x = ex + d * s * 0.08;
        blob(ctx, FLY, x, ey, ew * 4, ew * 4, Math.max(0.35 + 0.4 * dark, 0.8 * smooth(GUST + 1, GUST + 2, t)) * cat.open);
        ctx.fillStyle = rgba([225, 255, 120], 0.95 * cat.open);
        ell(ctx, x, ey, ew, Math.max(0.5, eh));
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#050208';
      const pw = ew * lerp(0.25, 0.75, Math.max(dark, cat.wide));
      for (const d of [-1, 1]) ell(ctx, ex + d * s * 0.08 + cat.head * ew * 0.3, ey, pw, Math.max(0.4, eh * 0.92));
    }
    outline(ctx, z, S, F, g, [255, 150, 50]);
  }

  // ---------- global layer: what crosses the whole house ----------
  function drawScan(ctx, F, t, T) {
    const U = F.U, Hh = F.y1 - F.y0, sx = F.sparkX, sy = F.sparkY;
    // feints: the spark tries to catch two or three times before starting
    if (t > 0.2 && t < SPARK + 0.4) {
      const pop = pulse(t, 0.22, 0.34, 0.03) * 0.5 + pulse(t, 0.52, 0.6, 0.02) * 0.35 + pulse(t, 0.74, 0.95, 0.04) * 0.8;
      const a = pop * (0.6 + 0.4 * noise1(T * 40));
      if (a > 0.01) {
        blob(ctx, CYAN, sx, sy, 45 * U, 45 * U, 0.5 * a);
        blob(ctx, WHITE, sx, sy, 14 * U, 14 * U, a);
        ctx.fillStyle = rgba(WHITE, a);
        for (let i = 0; i < 5; i++) {
          const an = hash(i * 5.3 + Math.floor(t * 9)) * TAU, d = (10 + 30 * hash(i * 2.9 + Math.floor(t * 9))) * U;
          ctx.fillRect(sx + Math.cos(an) * d - U, sy + Math.sin(an) * d - U, 2.4 * U, 2.4 * U);
        }
      }
    }
    // spark charging (anticipation) and stretching into a vertical line (action)
    if (t > SPARK && t < SCAN0 + 0.5) {
      const k = easeIn(clamp((t - SPARK - 0.4) / (SCAN0 - 0.15 - SPARK - 0.4))), fl = 0.75 + 0.25 * noise1(T * 30), out = 1 - smooth(SCAN0, SCAN0 + 0.5, t);
      const on = smooth(SPARK + 0.4, SPARK + 0.5, t);
      blob(ctx, CYAN, sx, sy, (30 + 50 * k) * U, (30 + 50 * k) * U, (0.35 + 0.6 * k) * fl * out * on);
      blob(ctx, WHITE, sx, sy, (12 + 22 * k) * U, (12 + 22 * k) * U, fl * out * on);
      blob(ctx, CYAN, sx, sy, (40 + 50 * k) * U, (3 + 3 * k) * U, 0.9 * fl * out * on);
      ctx.fillStyle = rgba(WHITE, 0.9 * out);
      for (let i = 0; i < 16; i++) {
        const ph = (t * 0.9 + hash(i * 3.7)) % 1, a = hash(i * 9.1) * TAU, d = (1 - ph) ** 2 * 80 * U;
        ctx.globalAlpha = ph * k * on;
        ctx.fillRect(sx + Math.cos(a) * d - U, sy + Math.sin(a) * d * 0.8 - U, 2.2 * U, 2.2 * U);
      }
      ctx.globalAlpha = 1;
      const s = easeOut((t - (SCAN0 - 0.35)) / 0.45);
      if (s > 0) {
        ctx.strokeStyle = rgba(WHITE, out);
        ctx.lineWidth = 4 * U;
        line(ctx, sx, lerp(sy, F.y0, s), sx, lerp(sy, F.y1, s));
      }
    }
    // beam sweeping the facade
    const env = smooth(SCAN0 - 0.15, SCAN0 + 0.2, t) * (1 - smooth(SCAN1 - 0.3, SCAN1 + 0.2, t));
    if (env <= 0) return;
    const X = scanX(F, t);
    let gr = ctx.createLinearGradient(X - 340 * U, 0, X + 40 * U, 0);
    gr.addColorStop(0, rgba(CYAN, 0)); gr.addColorStop(0.75, rgba(CYAN, 0.1 * env)); gr.addColorStop(0.94, rgba(CYAN, 0.32 * env)); gr.addColorStop(1, rgba(CYAN, 0));
    ctx.fillStyle = gr; ctx.fillRect(X - 340 * U, F.y0, 380 * U, Hh);
    gr = ctx.createLinearGradient(X - 14 * U, 0, X + 8 * U, 0);
    gr.addColorStop(0, rgba(WHITE, 0)); gr.addColorStop(0.6, rgba(WHITE, env)); gr.addColorStop(1, rgba(WHITE, 0));
    ctx.fillStyle = gr; ctx.fillRect(X - 14 * U, F.y0, 22 * U, Hh);
    // flashes where the beam cuts the edges of the architecture
    for (const sz of F.src) {
      const p = screenPoly(sz);
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        if ((a[0] - X) * (b[0] - X) > 0 || a[0] === b[0]) continue;
        const y = lerp(a[1], b[1], (X - a[0]) / (b[0] - a[0]));
        blob(ctx, WHITE, X, y, 16 * U, 16 * U, env);
        blob(ctx, CYAN, X, y, 90 * U, 4 * U, 0.8 * env);
      }
    }
    // dust in suspension, visible only inside the beam
    for (let i = 0; i < 90; i++) {
      const px = F.x0 + hash(i * 1.37) * (F.x1 - F.x0) + (noise1(T * 0.2 + i) - 0.5) * 60 * U;
      const d = X - 20 * U - px;
      if (d < -30 * U || d > 160 * U) continue;
      const py = F.y0 + ((hash(i * 2.71) + T * 0.01 * (hash(i) - 0.5)) % 1) * Hh + Math.sin(T * 0.6 + i) * 10 * U;
      const a = env * (d < 0 ? 1 + d / (30 * U) : 1 - d / (160 * U)) * (0.4 + 0.6 * hash(i * 5.3));
      ctx.fillStyle = rgba(WHITE, a);
      ctx.fillRect(px, py, 2.4 * U, 2.4 * U);
    }
  }
  // clips outside the windows (so the waves and flashes don't cover their scenes)
  function clipNoWindows(ctx, F) {
    ctx.beginPath();
    ctx.rect(F.x0 - 200, F.y0 - 200, F.x1 - F.x0 + 400, F.y1 - F.y0 + 400);
    for (const s of F.wins) { const p = s.pts; ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); }
    ctx.clip('evenodd');
  }
  // each beat sends a wave of red light from the door: wide and soft band, not a line
  function drawRipples(ctx, F, t) {
    const hb = (t < ON ? beat(t) : 0) + lastBeat(t), U = F.U, [cx, cy] = F.door;
    ctx.save();
    clipNoWindows(ctx, F);
    blob(ctx, HEART, cx, cy, 200 * U, 200 * U, 0.55 * hb, true);
    for (const [b, amp] of RIPPLES) {
      const u = t - b;
      if (u < 0 || u > RIP_DUR) continue;
      const k = u / RIP_DUR, a = 0.35 * amp * (1 - k) ** 1.5, R = ripR(F, u), th = 70 * U * (1 + k);
      if (a < 0.01) continue;
      const r0 = Math.max(0, R - th), r1 = R + th * 0.35;
      const gr = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
      gr.addColorStop(0, rgba(HEART, 0)); gr.addColorStop(0.7, rgba(HEART, a)); gr.addColorStop(0.85, rgba([255, 120, 140], a * 1.2)); gr.addColorStop(1, rgba(HEART, 0));
      const x0 = Math.max(cx - r1, F.x0), y0 = Math.max(cy - r1, F.y0), x1 = Math.min(cx + r1, F.x1), y1 = Math.min(cy + r1, F.y1);
      if (x1 > x0 && y1 > y0) { ctx.fillStyle = gr; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
    }
    ctx.restore();
  }
  function sparkPos(o, ang, v, u, g) {
    const k = 2.4, e = (1 - Math.exp(-k * u)) / k;
    return [o[0] + Math.cos(ang) * v * e, o[1] + (Math.sin(ang) * v - g / k) * e + (g / k) * u];
  }
  function drawBurst(ctx, F, t) {
    const u = t - ON, U = F.U;
    if (u < 0) return;
    const fl = decay(u, 0.13), k = u / RING_DUR;
    if (fl > 0.01 || k < 1) {
      // flash and wave only over walls and pediment: the window scenes remain readable
      ctx.save(); clipNoWindows(ctx, F);
      if (fl > 0.01) { ctx.fillStyle = rgba([255, 245, 228], 0.6 * fl); ctx.fillRect(F.x0, F.y0, F.x1 - F.x0, F.y1 - F.y0); }
      if (k < 1) {
        // warm light wave: wide band with a nearly white front
        const R = Math.max(1, ringR(F, t)), a = (1 - k) ** 1.5, [cx, cy] = F.door, th = (90 + 120 * k) * U;
        const r0 = Math.max(0, R - th), r1 = R + 20 * U;
        const gr = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
        gr.addColorStop(0, rgba(FIRE, 0)); gr.addColorStop(0.6, rgba(ORANGE, 0.3 * a)); gr.addColorStop(0.88, rgba([255, 240, 200], 0.75 * a)); gr.addColorStop(1, rgba(FIRE, 0));
        const x0 = Math.max(cx - r1, F.x0), y0 = Math.max(cy - r1, F.y0), x1 = Math.min(cx + r1, F.x1), y1 = Math.min(cy + r1, F.y1);
        if (x1 > x0 && y1 > y0) { ctx.fillStyle = gr; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); }
      }
      ctx.restore();
    }
    ctx.lineCap = 'round';
    for (let i = 0; i < 48; i++) {
      const life = 0.9 + 0.9 * hash(i * 2.9);
      if (u > life) continue;
      const ang = hash(i * 4.1) * TAU, v = (350 + 800 * hash(i * 7.3)) * U, kk = u / life;
      const p = sparkPos(F.door, ang, v, u, 450 * U), q = sparkPos(F.door, ang, v, Math.max(0, u - 0.05), 450 * U);
      ctx.strokeStyle = rgba(mix([255, 250, 220], ORANGE, kk), 1 - kk);
      ctx.lineWidth = 2.8 * U * (1 - kk * 0.5);
      line(ctx, q[0], q[1], p[0], p[1]);
    }
  }
  function drawFireflies(ctx, F, t, T) {
    const U = F.U, conv = t < ON ? easeIn((t - 12.3) / (ON - 12.3)) : 0;
    for (let i = 0; i < 24; i++) {
      let x = F.x0 + hash(i * 3.17) * (F.x1 - F.x0) + (noise1(T * 0.23 + i * 7.1) - 0.5) * 180 * U;
      let y = F.y0 + (0.25 + 0.75 * hash(i * 5.71)) * (F.y1 - F.y0) + (noise1(T * 0.31 + i * 3.3) - 0.5) * 90 * U;
      const ph = (T * 0.42 + hash(i * 9.7)) % 1;
      let a = ph < 0.4 ? Math.sin((Math.PI * ph) / 0.4) ** 2 : 0;
      if (t < ON) {
        // drawn toward the door before the burst, increasingly bright
        a = lerp(a, 1, conv) * smooth(5 + hash(i) * 2, 7 + hash(i) * 2, t);
        if (conv > 0) {
          // spiral toward the door: the radius closes and the angle turns faster and faster
          const dx = x - F.door[0], dy = y - F.door[1], r = Math.hypot(dx, dy) * (1 - conv);
          const an = Math.atan2(dy, dx) + 3.2 * conv * conv;
          x = F.door[0] + Math.cos(an) * r; y = F.door[1] + Math.sin(an) * r * 0.8;
        }
      } else {
        a *= smooth(15.3 + hash(i) * 2, 16.8 + hash(i) * 2, t);
        const p = t - gustT(F, x);
        if (p > 0) { x -= p * p * 500 * U; y -= p * 40 * U; a *= 1 - smooth(0, 1, p); }
      }
      if (a < 0.02) continue;
      blob(ctx, FLY, x, y, 40 * U, 40 * U, 0.6 * a);
      ctx.fillStyle = rgba([240, 255, 200], a);
      ell(ctx, x, y, 4.5 * U, 4.5 * U);
    }
  }
  function drawEmbers(ctx, F, t, T) {
    const U = F.U, vis = smooth(ON, ON + 0.8, t);
    if (vis <= 0) return;
    for (let i = 0; i < 22; i++) {
      const ph = (T * (0.1 + 0.1 * hash(i * 1.9)) + hash(i * 6.1)) % 1;
      let x = F.x0 + hash(i * 8.3) * (F.x1 - F.x0) + Math.sin(T * 1.3 + i) * 14 * U;
      const y = F.y1 - ph * (F.y1 - F.y0) * 0.85;
      let a = vis * Math.sin(Math.PI * ph) * (0.6 + 0.4 * noise1(T * 4 + i));
      const p = t - gustT(F, x);
      if (p > 0) { x -= p * p * 600 * U; a *= 1 - smooth(0, 0.7, p); }
      if (a < 0.02) continue;
      blob(ctx, EMBER, x, y, 10 * U, 10 * U, 0.6 * a);
      ctx.fillStyle = rgba([255, 210, 130], a);
      ctx.fillRect(x - U, y - U, 2.4 * U, 2.4 * U);
    }
  }
  // bats leaving the pediment and flying toward the audience (grow as they approach)
  function drawBats(ctx, F, t, T) {
    const U = F.U, N = 8, rim = rgba(mix(FIRE, WHITE, 0.4), 0.95);
    for (let i = 0; i < N; i++) {
      // they leave after the flash, staggered, so they are not swallowed by it
      const t0 = ON + 0.3 + (i / N) * 0.55 + hash(i * 3.1) * 0.12, dur = 1.5 + 0.5 * hash(i * 5.9), u = t - t0;
      if (u < 0 || u > dur) continue;
      // they leave in a fan from the pediment grille and dart toward the audience (grow with acceleration)
      const k = u / dur, ang = lerp(-0.1, 1.1, (i + 0.5 + (hash(i * 7.7) - 0.5) * 0.6) / N) * Math.PI;
      const D = (230 + 220 * hash(i * 1.3)) * U * easeOut(k * 0.9), wob = Math.sin(u * 7 + i) * 26 * U * k;
      const x0 = F.apex[0] + (hash(i * 4.4) - 0.5) * 60 * U, y0 = F.apex[1] + F.roofH * (0.3 + 0.15 * hash(i * 6.2));
      const x = x0 + Math.cos(ang) * D - Math.sin(ang) * wob, y = y0 + Math.sin(ang) * D * 0.7 + Math.cos(ang) * wob;
      const s = (16 + (100 + 50 * hash(i * 2.3)) * k ** 1.7) * U, flap = Math.sin(T * (20 - 8 * k) + i * 1.7);
      ctx.save();
      ctx.globalAlpha = 1 - smooth(0.85, 1, k);
      ctx.translate(x, y);
      ctx.rotate(Math.cos(ang) * 0.3 * Math.cos(u * 7 + i));
      drawBat(ctx, 0, 0, s * 1.12, flap, rim, { rim: null });
      drawBat(ctx, 0, 0, s, flap, '#050208', { rim: null });
      ctx.restore();
    }
  }
  // cold gust from right to left: a wide mist front with a bright leading edge,
  // swirls rising, wind lines and dry leaves spinning
  function drawGust(ctx, F, t, T) {
    const U = F.U, X = gustX(F, t), env = smooth(GUST - 0.3, GUST + 0.3, t) * (1 - smooth(GUST + GUST_DUR - 0.2, GUST + GUST_DUR + 0.6, t));
    if (env <= 0) return;
    const Hh = F.y1 - F.y0, FW = 480 * U;
    // front: horizontal gradient, bright at the leading edge (left) and dissolving behind
    const gr = ctx.createLinearGradient(X - 40 * U, 0, X + FW, 0);
    gr.addColorStop(0, rgba(MIST, 0)); gr.addColorStop(0.07, rgba([210, 228, 255], 0.5 * env)); gr.addColorStop(0.2, rgba(MIST, 0.3 * env));
    gr.addColorStop(0.6, rgba(MIST, 0.12 * env)); gr.addColorStop(1, rgba(MIST, 0));
    ctx.fillStyle = gr; ctx.fillRect(X - 40 * U, F.y0, FW + 40 * U, Hh);
    // mist swirls curling upward behind the front
    for (let i = 0; i < 9; i++) {
      const ph = (T * 0.5 + hash(i * 3.3)) % 1, y = F.y1 - (0.1 + 0.95 * ((hash(i * 7.1) + ph * 0.6) % 1)) * Hh;
      const x = X + (30 + 260 * hash(i * 2.7)) * U + Math.sin(ph * TAU + i) * 50 * U;
      blob(ctx, MIST, x, y, (130 + 80 * hash(i)) * U, (55 + 40 * ph) * U, 0.3 * env * Math.sin(Math.PI * ph), true);
    }
    blob(ctx, [220, 235, 255], X + 10 * U, (F.y0 + F.y1) / 2, 70 * U, Hh * 0.6, 0.35 * env, true);
    // thick wind lines
    ctx.lineCap = 'round';
    ctx.lineWidth = 5.5 * U;
    for (let i = 0; i < 14; i++) {
      const L = (140 + 200 * hash(i * 4.4)) * U, x = X + (hash(i * 5.5) * 420 - 40) * U - ((T * 380 * U + hash(i) * 240 * U) % (240 * U));
      const y = F.y0 + (0.05 + 0.9 * hash(i * 2.2)) * Hh, bend = (12 + Math.sin(T * 3 + i) * 10) * U;
      const lg = ctx.createLinearGradient(x, 0, x + L, 0), a = 0.7 * env * (0.6 + 0.4 * hash(i * 6.6));
      lg.addColorStop(0, rgba([225, 235, 255], 0)); lg.addColorStop(0.25, rgba([225, 235, 255], a)); lg.addColorStop(1, rgba([225, 235, 255], 0));
      ctx.strokeStyle = lg;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + L * 0.5, y - bend, x + L, y + 6 * U); ctx.stroke();
    }
    drawLeaves(ctx, F, t, T, env);
  }
  // pre-drawn dry leaf: dark silhouette with orange edge (readable on light and dark walls)
  let leafSpr = null;
  function leafSprite() {
    if (leafSpr) return leafSpr;
    const [c, g] = canvas2d(64, 64);
    const shape = s => {
      g.beginPath();
      g.moveTo(32 - 26 * s, 32);
      g.bezierCurveTo(32 - 14 * s, 32 - 20 * s, 32 + 10 * s, 32 - 20 * s, 32 + 24 * s, 32 - 3 * s);
      g.lineTo(32 + 29 * s, 32 + 1 * s);
      g.lineTo(32 + 23 * s, 32 + 4 * s);
      g.bezierCurveTo(32 + 8 * s, 32 + 20 * s, 32 - 14 * s, 32 + 18 * s, 32 - 26 * s, 32);
      g.closePath(); g.fill();
    };
    g.fillStyle = 'rgb(255,130,30)'; shape(1.12);
    g.fillStyle = 'rgb(40,12,4)'; shape(0.95);
    g.strokeStyle = 'rgb(255,150,60)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(8, 32); g.lineTo(56, 32); g.stroke();
    return (leafSpr = c);
  }
  function drawLeaves(ctx, F, t, T, env) {
    const U = F.U, Hh = F.y1 - F.y0, spr = leafSprite(), X0 = F.x1 + 160 * U;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 26; i++) {
      // each leaf starts when the front passes its position and is flung to the left
      const off = (hash(i * 3.9) * 380 - 20) * U, t0 = GUST + 0.1 * hash(i * 8.1);
      const u = t - t0;
      if (u < 0) continue;
      const x = X0 + off - (u * F.gv * 1.05 + u * u * 160 * U);
      if (x < F.x0 - 80 * U) continue;
      const by = F.y0 + (0.1 + 0.85 * hash(i * 2.3)) * Hh;
      const y = by + Math.sin(u * (3 + 2 * hash(i)) + i) * 35 * U - u * u * 30 * U;
      const s = (30 + 22 * hash(i * 6.7)) * U / 58, rot = u * (4 + 6 * hash(i * 1.7)) * (hash(i * 4.2) < 0.5 ? -1 : 1) + i;
      const flip = Math.cos(u * (5 + 4 * hash(i * 9.3)) + i); // the leaf spins on itself
      ctx.save();
      ctx.globalAlpha = env;
      ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s * Math.max(0.15, Math.abs(flip)));
      ctx.drawImage(spr, -32, -32);
      ctx.restore();
    }
    ctx.restore();
  }

  return {
    name: 'Awakening',
    duration: DUR,
    ambience: 0.5,
    // the sound (beats, burst, gust…) is scheduled by its score: js/audio/01-despertar.js
    update() {},
    draw(ctx, z, S) {
      const g = geo(z, S);
      if (!g) return;
      const F = info(S);
      if (z.kind === 'window') drawWindow(ctx, z, S, F, g);
      else if (z.kind === 'door') drawDoor(ctx, z, S, F, g);
      else if (z.kind === 'roof') return; // the pediment is drawn in the global layer
      else drawWall(ctx, z, S, F, g);
    },
    drawGlobal(ctx, W, H, S) {
      const F = info(S), t = S.t, T = S.T;
      if (!F.ok) return;
      drawRoofG(ctx, F, S);
      ctx.globalCompositeOperation = 'lighter';
      if (t < SCAN1 + 0.6) drawScan(ctx, F, t, T);
      if ((t > BEATS[0] && t < ON + 0.2) || (t > LAST && t < LAST + 1.5)) drawRipples(ctx, F, t);
      drawFireflies(ctx, F, t, T);
      drawEmbers(ctx, F, t, T);
      if (t > ON && t < ON + 2.5) drawBurst(ctx, F, t);
      if (t > GUST - 0.3) drawGust(ctx, F, t, T);
      ctx.globalCompositeOperation = 'source-over';
      if (t > ON && t < ON + 3.5) drawBats(ctx, F, t, T);
    },
  };
})());
