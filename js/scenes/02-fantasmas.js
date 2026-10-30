// Scene: Ghosts. Familiar but unsettling: the curtains open, the ghosts peek out
// in advance, three cross the house with ectoplasm trails, and one lunges toward the audience: "BOO!".
registerScene((() => {
  // ---------- script (seconds) ----------
  const DUR = 34;
  const SWEEP = 2.9, SWEEP_DUR = 1.6;                 // moon sweep from left to right: opens the curtains as it passes
  const HUSH = 21.6, RUSH = 22.9, RELEASE = 24.2, BOO = 24.9, POOF = 26.4, BYE = 28.0, CLOSE = 31.6;
  const EMERGE = 0.9, DIVE = 0.8;                     // leave / dive into a window
  // travelers of the global layer; size = head size relative to the height of the house
  const A = { key: 'A', t0: 11.2, t1: 18.0, from: 'hero', to: 'right', size: 0.16, seed: 11 };
  const B = { key: 'B', t0: 13.5, t1: 17.6, from: 'left', to: 'low', size: 0.12, seed: 23 };
  const C = { key: 'C', t0: 18.5, t1: 21.7, from: 'right', to: 'door', size: 0.14, seed: 37, dive: 1.0 };
  const TRAVEL = [B, A, C];
  const diveOf = d => d.dive ?? DIVE;
  // window numbers: [type, start, duration, side]
  const ACTS = {
    hero: [['peek', 4.6, 2.8, -1], ['pop', 7.9, 2.9], ['bye', BYE + 0.25, 3.3]],
    left: [['pop', 5.5, 2.5], ['bye', BYE, 3.4]],
    right: [['peek', 6.3, 1.5, 1], ['peek', 8.1, 2.3, 1], ['bye', BYE + 0.75, 2.9]],
    low: [['shy', 7.1, 3.1], ['bye', BYE + 0.5, 3.1]],
    extra: [['pop', 6.2, 2.6], ['bye', BYE + 0.4, 3.1]],
  };
  // each actor's character: size, proportion, sway rhythm and tilt (never in sync)
  const PERS = {
    hero: { sc: 1, sx: 1, sy: 1, bf: 2.1, tf: 1.3, ta: 0.08 },
    left: { sc: 1, sx: 0.8, sy: 1.2, bf: 1.55, tf: 0.85, ta: 0.13 },   // tall and skinny
    right: { sc: 1, sx: 1, sy: 1, bf: 2.7, tf: 1.9, ta: 0.05 },       // shy
    low: { sc: 0.82, sx: 1.12, sy: 0.9, bf: 3.3, tf: 2.3, ta: 0.1 },  // baby
    extra: { sc: 1, sx: 1, sy: 1, bf: 1.8, tf: 1.1, ta: 0.08 },
  };
  // moments when something passes through a window or the door: flash, frame echo, agitated curtains
  const CROSS = [];
  const SQUEEZED = C.t1 - 0.16;                       // ghost C finishes slipping through the slit
  const HOP = 0.25;                                   // ghostly hop from the right wing to the door
  for (const d of TRAVEL) CROSS.push([d.from, d.t0 + EMERGE], [d.to, d.to === 'door' ? SQUEEZED : d.t1 - DIVE]);
  CROSS.push(['hero', RELEASE]);
  const ICE = [215, 248, 255], TEAL = [70, 225, 220], AQUA = [110, 205, 235];

  // ---------- time ----------
  const easeOut = k => 1 - (1 - clamp(k)) ** 3;
  const easeIn = k => clamp(k) ** 3;
  const easeInOut = k => { k = clamp(k); return k < 0.5 ? 4 * k * k * k : 1 - (2 - 2 * k) ** 3 / 2; };
  const spring = k => (k <= 0 ? 0 : 1 - Math.exp(-5 * k) * Math.cos(2.2 * Math.PI * k));
  const hit = (t, t0, len) => (t < t0 ? 0 : Math.exp(-(t - t0) / len));
  const flyEase = k => 0.3 * k + 0.7 * (0.5 - 0.5 * Math.cos(Math.PI * clamp(k)));
  const hush = t => pulse(t, HUSH, BOO + 0.15, 0.6);
  const moonLight = t => smooth(0.3, 4.5, t) * (1 - 0.7 * hush(t)) * (1 - 0.5 * smooth(31.5, 34, t));
  const mistAmt = t => smooth(0.2, 4.5, t) * (1 - 0.35 * hush(t)) + 0.35 * smooth(30.5, 33.5, t);
  const booFlash = t => 0.6 * hit(t, BOO, 0.22) + 0.2 * hit(t, POOF, 0.3);
  const quake = t => hit(t, BOO, 0.32) + 0.35 * hit(t, RELEASE, 0.15);
  const beat = t => hit(t, 21.7, 0.12) + 0.6 * hit(t, 21.94, 0.12) + hit(t, 22.35, 0.12) + 0.6 * hit(t, 22.59, 0.12);
  const flashOf = (role, t) => { let f = 0; for (const [r, tc] of CROSS) if (r === role) f += hit(t, tc, 0.3); return f; };
  // curtains that snap shut during the calm (except the bay window); the right one stays closed after the BOO!
  const SHUT_ORDER = { left: 0, low: 1, right: 2, extra: 3 };
  const shut = (role, t) => {
    if (role === 'hero') return 0;
    const c = easeBack(clamp((t - 21.7 - (SHUT_ORDER[role] ?? 3) * 0.08) / 0.25));
    return c * (1 - easeOut((t - (role === 'right' ? 28 : BOO)) / 0.4));
  };
  // giant ghost's laugh during the BOO! (damped bounce)
  const laughOf = (t, ph = 0) => (t < BOO ? 0 : Math.sin(TAU * 3.5 * (t - BOO) + ph) * (0.45 + 0.55 * Math.exp(-(t - BOO) * 1.4)));
  const stirOf = (role, t) => { let f = 0; for (const [r, tc] of CROSS) if (r === role) f += pulse(t, tc - 0.6, tc + 1.4, 0.4); return f; };

  // ---------- house geometry (screen px) ----------
  const UNIT = [[0, 0], [1, 0], [1, 1], [0, 1]];
  function homog(src, dst) {
    const M = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      M.push([x, y, 1, 0, 0, 0, -x * u, -y * u]); b.push(u);
      M.push([0, 0, 0, x, y, 1, -x * v, -y * v]); b.push(v);
    }
    const H = solveLinear(M, b);
    if (!H || !H.every(Number.isFinite)) return null;
    return (x, y) => { const d = H[6] * x + H[7] * y + 1; return [(H[0] * x + H[1] * y + H[2]) / d, (H[3] * x + H[4] * y + H[5]) / d]; };
  }
  const area = z => (z.x1 - z.x0) * (z.y1 - z.y0);
  const biggest = list => list.reduce((a, b) => (!a || area(b) > area(a) ? b : a), null);

  // Catmull-Rom sampled and reparametrized by length: constant speed along the path
  function buildPath(ctrl) {
    const pts = [], cum = [0], n = ctrl.length;
    const cr = (a, b, c, d, u) => {
      const u2 = u * u, u3 = u2 * u;
      return [0, 1].map(i => 0.5 * (2 * b[i] + (c[i] - a[i]) * u + (2 * a[i] - 5 * b[i] + 4 * c[i] - d[i]) * u2 + (3 * b[i] - a[i] - 3 * c[i] + d[i]) * u3));
    };
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < 20; j++) pts.push(cr(ctrl[Math.max(0, i - 1)], ctrl[i], ctrl[i + 1], ctrl[Math.min(n - 1, i + 2)], j / 20));
    }
    pts.push(ctrl[n - 1]);
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const L = cum[cum.length - 1];
    return {
      L,
      at(d) {
        d = clamp(d, 0, L);
        let lo = 0, hi = cum.length - 1;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cum[mid] < d) lo = mid; else hi = mid; }
        const f = (d - cum[lo]) / (cum[hi] - cum[lo] || 1);
        return [lerp(pts[lo][0], pts[hi][0], f), lerp(pts[lo][1], pts[hi][1], f)];
      },
    };
  }

  let geo = null, shapesVer = 0;
  const shapes = {};                                  // shape of each zone (noted in draw)
  function geometry(S) {
    const zs = S.screenZones;
    if (geo && geo.src === zs) return geo;
    const g = { src: zs, byId: {}, fwd: {}, inv: {}, role: {}, win: {}, paths: {}, polyVer: -1, polys: null, poly: {} };
    for (const sz of zs) { g.byId[sz.id] = sz; g.fwd[sz.id] = homog(UNIT, sz.pts); g.inv[sz.id] = homog(sz.pts, UNIT); }
    const body = zs.filter(z => z.kind === 'wall' || z.kind === 'roof');
    const all = body.length ? body : zs;
    if (!all.length) { geo = g; return g; }
    const x0 = Math.min(...all.map(z => z.x0)), x1 = Math.max(...all.map(z => z.x1));
    const y0 = Math.min(...all.map(z => z.y0)), y1 = Math.max(...all.map(z => z.y1));
    const hs = g.house = { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2 };
    const P = (u, v) => [x0 + u * hs.w, y0 + v * hs.h];
    g.roof = biggest(zs.filter(z => z.kind === 'roof'));
    g.door = biggest(zs.filter(z => z.kind === 'door'));
    const rf = g.roof && g.fwd[g.roof.id];
    // the moon lives on the pediment, in screen px (the pediment canvas is very distorted)
    g.moon = g.roof ? [(g.roof.x0 + g.roof.x1) / 2, lerp(g.roof.y0, g.roof.y1, 0.62)] : [hs.cx, y0 + hs.h * 0.08];
    // window roles: the main one is the large one under the pediment
    const wins = zs.filter(z => z.kind === 'window');
    if (wins.length) {
      const ax = g.roof ? g.roof.cx : hs.cx;
      const score = z => area(z) / (1 + (3 * Math.abs(z.cx - ax)) / hs.w);
      const hero = wins.reduce((a, b) => (score(b) > score(a) ? b : a));
      const rest = wins.filter(z => z !== hero);
      const right = rest.filter(z => z.cx > hero.cx).sort((a, b) => b.cx - a.cx)[0];
      const left = rest.filter(z => z.cx < hero.cx).sort((a, b) => a.cx - b.cx)[0];
      const low = rest.filter(z => z !== right && z !== left).sort((a, b) => Math.abs(a.cx - hero.cx) - Math.abs(b.cx - hero.cx) || b.cy - a.cy)[0];
      g.win = { hero, right: right || hero, left: left || hero, low: low || left || hero };
      for (const [r, z] of [['hero', hero], ['right', right], ['left', left], ['low', low]]) if (z && !g.role[z.id]) g.role[z.id] = r;
      const c = z => [z.cx, z.cy];
      const W = g.win;
      // A: leaves the bay window, climbs to the pediment, crosses in front of the moon, goes through the eave
      // at the pediment's corner (ghostly phase) and dives down the right wing to its window
      const mA = [g.moon[0], g.moon[1] - hs.h * A.size * 0.35];
      g.paths.A = buildPath([c(W.hero), P(0.27, 0.36), P(0.3, 0.25), mA, P(0.52, 0.25), P(0.612, 0.286), P(0.66, 0.5), P(0.73, 0.72), P(0.84, 0.74), P(0.93, 0.6), P(0.88, 0.5), c(W.right)]);
      // B: from the balcony skims down to the floor and slips into the low window
      g.paths.B = buildPath([c(W.left), P(0.07, 0.6), P(0.065, 0.78), P(0.145, 0.84), P(0.235, 0.78), P(0.29, 0.7), c(W.low)]);
      if (g.door) {
        const df = g.fwd[g.door.id];
        g.crack = df ? df(0.08, 0.52) : [g.door.x0, g.door.cy];
        g.doorIn = df ? df(0.5, 0.52) : [g.door.cx, g.door.cy];
        // C: leaves the right window, circles along the wing and stops next to the door (then hops)
        const wing = biggest(zs.filter(z => z.kind === 'wall' && z.cx > g.door.cx)) || null;
        const ex = wing ? wing.x0 + (wing.x1 - wing.x0) * 0.15 : g.doorIn[0] + hs.w * 0.08;
        g.paths.C = buildPath([c(W.right), P(0.9, 0.43), P(0.95, 0.6), P(0.9, 0.78), P(0.78, 0.8), P(0.69, 0.71), [ex, g.doorIn[1]]]);
      }
      g.rushTo = [hero.cx, y0 + hs.h * 0.39];
      const walls = zs.filter(z => z.kind === 'wall');
      g.textZone = biggest(walls.filter(z => z.cx > hero.cx + hs.w * 0.1)) || biggest(walls);
      // wall that contains each window (to clip the frame echo)
      g.parent = {};
      for (const z of wins) g.parent[z.id] = walls.find(wz => inPoly(wz.pts, z.cx, z.cy)) || null;
    }
    // outlines of the architecture drawn at the start
    g.outlines = [];
    if (g.roof && rf) g.outlines.push({ pts: [rf(0, 1), rf(0.5, 0), rf(1, 1)], closed: false, t0: 0.8, col: [140, 190, 255], role: 'roof' });
    wins.slice().sort((a, b) => a.cx - b.cx).forEach((z, i) => g.outlines.push({ pts: z.pts, closed: true, t0: 1.5 + i * 0.35, col: [90, 230, 255], role: g.role[z.id] || 'extra' }));
    if (g.door) g.outlines.push({ pts: g.door.pts, closed: true, t0: 2.9, col: [235, 250, 255], role: 'door' });
    geo = g;
    return g;
  }
  // real outline of each zone on screen (the pediment is a triangle, not its quadrilateral)
  function housePolys(g) {
    if (g.polyVer === shapesVer) return g.polys;
    g.polys = g.src.map(sz => {
      const sh = shapes[sz.id], f = g.fwd[sz.id];
      const p = !sh || sh === 'rect' || !f ? sz.pts : shapePoints(sh, 1, 1).map(([u, v]) => f(u, v));
      g.poly[sz.id] = p;
      return dilate(p, 2.5);
    });
    g.polyVer = shapesVer;
    return g.polys;
  }
  // dilates a convex polygon d px (miter): closes the 2-4 px gaps between neighboring zones
  function dilate(pts, d) {
    const n = pts.length;
    let a2 = 0;
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a2 += p[0] * q[1] - q[0] * p[1]; }
    const sg = a2 >= 0 ? 1 : -1, nrm = [];
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dx, dy) || 1;
      nrm.push([(sg * dy) / l, (-sg * dx) / l]);
    }
    return pts.map((p, i) => {
      const n1 = nrm[(i + n - 1) % n], n2 = nrm[i], k = d / Math.max(0.3, 1 + n1[0] * n2[0] + n1[1] * n2[1]);
      return [p[0] + (n1[0] + n2[0]) * k, p[1] + (n1[1] + n2[1]) * k];
    });
  }
  function inPoly(pts, x, y) {
    let r = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) r = !r;
    }
    return r;
  }
  // path segments that pass through unmapped gaps: there the ghost "goes through the wall"
  // fast and turned into a wisp. Cost by length (low in the gap) → time remapping.
  function gapInfo(g, d) {
    housePolys(g);
    g.gaps = g.gaps && g.gapsVer === g.polyVer ? g.gaps : {};
    g.gapsVer = g.polyVer;
    if (g.gaps[d.key]) return g.gaps[d.key];
    const path = g.paths[d.key], N = 360, body = g.src.filter(z => z.kind !== 'window');
    const zoneAt = (x, y) => body.find(z => inPoly(g.poly[z.id] || z.pts, x, y)) || null;
    const ds = [], inside = [], raw = [], sF = g.house.h * d.size;
    // body probes (relative to the head): if much of it is outside the house, the cut would show
    const PROBE = [[0, 0.35], [-0.42, 0.3], [0.42, 0.3], [0, -0.45], [0, 0.85], [-0.3, -0.25], [0.3, -0.25], [-0.3, 0.7], [0.3, 0.7]];
    for (let i = 0; i <= N; i++) {
      const dd = (path.L * i) / N, [x, y] = path.at(dd), inC = !!zoneAt(x, y + sF * 0.35);
      let cov = 0;
      for (const [px, py] of PROBE) if (zoneAt(x + px * sF, y + py * sF)) cov++;
      ds.push(dd); inside.push(inC);
      raw.push(inC ? smooth(1, 0.86, cov / PROBE.length) : 1);
    }
    const ranges = [];
    for (let i = 0; i <= N; i++) {
      if (inside[i]) continue;
      let j = i;
      while (j < N && !inside[j + 1]) j++;
      if (i > 0 && j < N) ranges.push([ds[i], ds[j]]);
      i = j;
    }
    // smoothing along the path (±0.35 heads) and no phase at the ends (exit/arrival at the window)
    const win = Math.max(1, Math.round((sF * 0.5 * N) / path.L)), ph = [];
    for (let i = 0; i <= N; i++) {
      let m = 0;
      for (let j = Math.max(0, i - win); j <= Math.min(N, i + win); j++) m = Math.max(m, raw[j] * (1 - Math.abs(j - i) / (win + 1)));
      ph.push(m * smooth(0, 0.12, i / N) * smooth(1, 0.88, i / N));
    }
    const phAt = dd => { const f = clamp(dd / path.L) * N, i = Math.min(N - 1, Math.floor(f)); return lerp(ph[i], ph[i + 1], f - i); };
    const cost = [0];
    for (let i = 1; i <= N; i++) cost.push(cost[i - 1] + (ds[i] - ds[i - 1]) * (1 - 0.9 * (ph[i] + ph[i - 1]) / 2));
    const Ct = cost[N], D = d.t1 - d.t0, fly = D - EMERGE - diveOf(d);
    const info = {
      ranges,
      // fl 0..1 → distance traveled
      dist(fl) {
        const c = flyEase(fl) * Ct;
        let lo = 0, hi = N;
        while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cost[mid] < c) lo = mid; else hi = mid; }
        return lerp(ds[lo], ds[hi], (c - cost[lo]) / (cost[hi] - cost[lo] || 1));
      },
      ph: phAt,
      events: [],
    };
    // re-entries: moment and point where it reappears in the zone on the other side
    for (const [, b] of ranges) {
      const cb = cost[Math.round((b / path.L) * N)] / Ct;
      let lo = 0, hi = 1;
      for (let it = 0; it < 30; it++) { const mid = (lo + hi) / 2; if (flyEase(mid) < cb) lo = mid; else hi = mid; }
      const [x, y] = path.at(b + 4), z = zoneAt(x, y);
      info.events.push({ t: d.t0 + EMERGE + lo * fly, x, y, poly: z ? g.poly[z.id] || z.pts : null });
    }
    return (g.gaps[d.key] = info);
  }
  function polyPath(ctx, pts) { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }

  // ---------- sprites (once) ----------
  let SPR = null;
  function sprites() {
    if (SPR) return SPR;
    const mk = col => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, rgba(col, 1)); gr.addColorStop(0.3, rgba(col, 0.42)); gr.addColorStop(1, rgba(col, 0));
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      return c;
    };
    return (SPR = { teal: mk(TEAL), ice: mk(ICE), white: mk([255, 255, 255]) });
  }
  // horizontal fog strip that repeats seamlessly (half resolution)
  let mistTex = null;
  function mistTexture(g) {
    const key = `${g.house.w | 0}x${g.house.h | 0}`;
    if (mistTex && mistTex.key === key) return mistTex;
    const TW = Math.max(64, Math.round(g.house.w * 0.5)), TH = Math.max(32, Math.round(g.house.h * 0.3));
    const c = document.createElement('canvas');
    c.width = TW; c.height = TH;
    const x = c.getContext('2d'), r = rng(77);
    // few small bright wisps on transparent black (not a blanket of fog)
    for (let i = 0; i < 14; i++) {
      const band = i % 3, bx = r() * TW, by = TH * (0.4 + 0.2 * band + 0.1 * r()), br = TH * (0.05 + 0.06 * r()), a = 0.4 + 0.35 * r();
      for (const dx of [-TW, 0, TW]) {
        x.save(); x.translate(bx + dx, by); x.scale(3.5 + 2 * hash(i + 3), 1);
        const gr = x.createRadialGradient(0, 0, 0, 0, 0, br);
        gr.addColorStop(0, rgba([190, 240, 250], a)); gr.addColorStop(0.35, rgba([130, 215, 235], a * 0.5)); gr.addColorStop(1, rgba([90, 180, 220], 0));
        x.fillStyle = gr; x.fillRect(-br, -br, br * 2, br * 2);
        x.restore();
      }
    }
    // fades upward
    x.globalCompositeOperation = 'destination-in';
    const fade = x.createLinearGradient(0, 0, 0, TH);
    fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(0.45, 'rgba(0,0,0,0.75)'); fade.addColorStop(1, '#000');
    x.fillStyle = fade; x.fillRect(0, 0, TW, TH);
    return (mistTex = { key, c });
  }
  // "BOO!" letters with extrusion, outline and glow (cached by size and font)
  const glyphs = {};
  // document.fonts.check is expensive: checked at most every 1.5 s until the font is ready
  let fontOk = false, fontAt = -1e9;
  function fontReady() {
    const now = performance.now();
    if (!fontOk && now - fontAt > 1500) { fontAt = now; fontOk = !!document.fonts?.check?.('100px Creepster'); }
    return fontOk;
  }
  function glyph(ch, fs) {
    const ready = fontReady() ? 1 : 0;
    const key = `${ch}|${fs | 0}|${ready}`;
    if (glyphs[key]) return glyphs[key];
    const font = `${fs | 0}px Creepster, Impact, sans-serif`;
    const m = document.createElement('canvas').getContext('2d');
    m.font = font;
    const tw = m.measureText(ch).width, pad = fs * 0.4;
    const c = document.createElement('canvas');
    c.width = Math.ceil(tw + pad * 2); c.height = Math.ceil(fs * 1.25 + pad * 2);
    const x = c.getContext('2d'), cx = c.width / 2, cy = c.height / 2;
    x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    x.shadowColor = 'rgba(70,220,255,0.95)'; x.shadowBlur = fs * 0.3;
    x.fillStyle = 'rgba(30,150,200,0.9)'; x.fillText(ch, cx, cy);
    x.shadowBlur = 0;
    for (let i = 9; i > 0; i--) { x.fillStyle = rgba(mix([1, 14, 26], [16, 80, 110], 1 - i / 9)); x.fillText(ch, cx + i * fs * 0.011, cy + i * fs * 0.014); }
    x.lineWidth = fs * 0.07; x.strokeStyle = '#020c18'; x.strokeText(ch, cx, cy);
    const gr = x.createLinearGradient(0, cy - fs * 0.42, 0, cy + fs * 0.42);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#dcfaff'); gr.addColorStop(1, '#5cd6ff');
    x.fillStyle = gr; x.fillText(ch, cx, cy);
    return (glyphs[key] = { c, tw, cx, cy });
  }

  // ---------- wrapped ghost: cold aura, tilt, squash & stretch ----------
  function ghostFx(ctx, x, y, s, t, o) {
    const a = o.a ?? 1;
    if (a <= 0.01 || s < 1) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(o.rot || 0);
    if (o.aura) glow(ctx, 0, s * 0.35, s * o.aura, [80, 215, 230], 0.3 * a);
    const py = s * 0.35;                              // pivot at the center of the body
    ctx.translate(0, py); ctx.scale(o.sx ?? 1, o.sy ?? 1); ctx.translate(0, -py);
    drawGhost(ctx, 0, 0, s, t, { alpha: a, tilt: o.tilt ?? 0, vx: o.vx ?? 0, lookX: o.lookX ?? 0, lookY: o.lookY ?? 0, mouth: o.mouth ?? 0.3, wave: !!o.wave, arms: o.arms, seed: o.seed ?? 0, mood: o.mood, color: o.color || [190, 235, 255], glow: o.glow });
    ctx.restore();
  }

  // ---------- windows: room, actor, curtains ----------
  function pose(kind, k, D, w, h, side, T, seed, pr, small) {
    const s = (small ? Math.min(h * 0.68, w * 0.45) : Math.min(h * 0.5, w * 0.4)) * pr.sc, bob = Math.sin(T * pr.bf + seed) * h * 0.025;
    if (kind === 'peek') {
      // peeks out from the side, looks, gets scared and hides suddenly
      const xh = side < 0 ? -s * 1.1 : w + s * 1.1, xp = side < 0 ? w * 0.3 : w * 0.7;
      const inK = easeBack(clamp((k - 0.35) / 0.6)), outK = easeIn((k - (D - 0.3)) / 0.3);
      const jump = pulse(k, D - 0.8, D - 0.28, 0.12);
      const look = k < 1.3 ? -side : k < 1.9 ? 0 : side * 0.8;
      return { x: lerp(lerp(xh, xp, inK), xh, outK), y: h * 0.5 + bob - jump * h * 0.08, s, tilt: -side * (0.34 - 0.2 * jump) + Math.sin(T * pr.tf + seed) * pr.ta * 0.5, lookX: look, lookY: -0.4 * jump, mouth: 0.15 + 0.7 * jump, mood: jump > 0.5 ? 'scared' : undefined };
    }
    // pop / shy / bye: rises from the windowsill with a bounce, (waves) and drops after gathering momentum
    const rest = kind === 'shy' ? h * 0.78 : h * 0.45, hide = h + s * 0.7;
    const up = spring((k - 0.3) / 1.1);
    const hop = Math.sin(Math.PI * clamp((k - (D - 0.72)) / 0.32)) * h * 0.07;
    const down = easeIn((k - (D - 0.4)) / 0.4);
    let y = lerp(hide, rest, up) - hop;
    y = lerp(y, hide, down);
    const land = Math.sin(Math.PI * clamp((k - 0.62) / 0.32)) * 0.12;
    const look = kind === 'shy' ? Math.sin(k * 2.6) * 1.2 : Math.sin(T * 0.9 + seed) * 0.6;
    return { x: w * 0.5 + Math.sin(T * 0.8 * pr.tf + seed) * w * 0.05, y: y + bob * clamp(up), s, tilt: Math.sin(T * pr.tf + seed) * pr.ta, lookX: look, lookY: kind === 'shy' ? -0.5 : 0, mouth: kind === 'bye' ? 0.08 : kind === 'shy' ? 0.05 : 0.35, wave: kind === 'bye' && k > 0.9 && k < D - 0.7, sq: land };
  }
  function actor(acts, t, w, h, T, seed, pr, small) {
    for (const [kind, t0, D, side] of acts) {
      const k = t - t0;
      if (k < 0 || k > D) continue;
      const p = pose(kind, k, D, w, h, side, T, seed, pr, small), q = pose(kind, k - 0.03, D, w, h, side, T - 0.03, seed, pr, small);
      const vx = (p.x - q.x) / (0.03 * h), vy = (p.y - q.y) / (0.03 * h);
      const st = clamp(Math.hypot(vx, vy) * 0.05, 0, 0.3), sq = p.sq || 0;
      if (Math.abs(vy) >= Math.abs(vx)) { p.sy = 1 + st - sq; p.sx = 1 - st * 0.5 + sq; } else { p.sx = 1 + st * 0.6; p.sy = 1 - st * 0.3; }
      p.vx = clamp(vx * 0.3, -1, 1);
      p.sx *= pr.sx; p.sy *= pr.sy;
      return p;
    }
    return null;
  }
  // u: position 0..1 of the window in the house (the sweep reaches the left ones first)
  function curtainOpen(t, u) {
    const t0 = SWEEP + 0.15 + u * SWEEP_DUR;
    const o = easeBack(clamp((t - t0) / 1.5)) - 0.07 * Math.sin(clamp((t - t0 + 0.45) / 0.45) * Math.PI);
    return o * (1 - easeInOut((t - CLOSE - (1 - u) * 0.6) / 1.4));
  }
  // room light: rises when a ghost passes through it, turns off in the tense calm
  function roomLight(role, t, T, seed) {
    let present = 0;
    for (const d of TRAVEL) {
      if (d.from === role) present += pulse(t, d.t0, d.t0 + EMERGE + 0.3, 0.3);
      if (d.to === role) present += pulse(t, d.t1 - DIVE - 0.3, d.t1 + 0.4, 0.3);
    }
    if (role === 'hero') present += pulse(t, RUSH, RELEASE + 0.2, 0.4);
    return clamp(1 - shut(role, t)) * clamp((0.55 + 0.45 * flicker(T * 0.25, seed)) * smooth(0.5, 3.5, t) * (1 - 0.85 * hush(t)) * (1 - smooth(32.2, 34, t)) + 0.6 * present);
  }
  // curtains gathered to the sides with folds, lit edge and top valance
  function drawCurtains(ctx, w, h, open, T, stir, seed, lit) {
    const tieY = h * 0.6, lw = Math.max(1, w * 0.014);
    for (const side of [-1, 1]) {
      const sway = Math.sin(T * 1.3 + seed + side) * w * 0.006 + stir * Math.sin(T * 9 + side * 2) * w * 0.04;
      const xt = lerp(w * 0.53, w * 0.29, open), xi = lerp(w * 0.53, w * 0.1, open) + sway, xb = lerp(w * 0.53, w * 0.19, open) + sway * 1.7;
      const X = x => (side < 0 ? x : w - x);
      const edge = (f, first) => {
        if (first) ctx.moveTo(X(xt * f), 0); else ctx.lineTo(X(xt * f), 0);
        ctx.quadraticCurveTo(X(xt * f), tieY * 0.55, X(xi * f), tieY);
        ctx.quadraticCurveTo(X(xi * f), lerp(tieY, h, 0.5), X(xb * f), h);
      };
      ctx.beginPath();
      ctx.moveTo(X(0), 0);
      edge(1, false);
      ctx.lineTo(X(0), h);
      ctx.closePath();
      const gr = ctx.createLinearGradient(X(0), 0, X(xi), 0);
      gr.addColorStop(0, '#02080e'); gr.addColorStop(1, rgba(mix([10, 34, 48], [26, 78, 98], lit)));
      ctx.fillStyle = gr; ctx.fill();
      // folds: shadow + glow converging on the tie-back
      ctx.lineWidth = lw * 1.4;
      for (const f of [0.3, 0.55, 0.8]) {
        ctx.strokeStyle = 'rgba(0,4,8,0.6)';
        ctx.beginPath(); edge(f, true); ctx.stroke();
        ctx.strokeStyle = rgba([60, 150, 170], 0.22 * lit);
        ctx.beginPath(); edge(f + 0.06, true); ctx.stroke();
      }
      // inner edge lit by the room
      ctx.lineWidth = lw;
      ctx.strokeStyle = rgba([120, 230, 240], 0.55 * lit);
      ctx.beginPath(); edge(1, true); ctx.stroke();
      // tie-back
      if (open > 0.3) {
        ctx.fillStyle = rgba([150, 220, 230], 0.5 * lit * smooth(0.3, 0.8, open));
        ctx.beginPath(); ctx.ellipse(X(xi * 0.55), tieY, xi * 0.55, h * 0.025, 0, 0, TAU); ctx.fill();
      }
    }
    // scalloped valance
    const vh = h * 0.13, n = Math.max(2, Math.round(w / h * 2.2));
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(w, 0); ctx.lineTo(w, vh);
    for (let i = n - 1; i >= 0; i--) ctx.quadraticCurveTo(((i + 0.5) / n) * w, vh * 1.7, (i / n) * w, vh);
    ctx.closePath();
    ctx.fillStyle = '#030b12'; ctx.fill();
    ctx.strokeStyle = rgba([110, 210, 225], 0.35 * lit); ctx.lineWidth = lw; ctx.stroke();
  }
  function drawWindow(ctx, z, S, g) {
    const { w, h } = z, t = S.t, T = S.T, m = Math.min(w, h);
    const role = g.role[z.id] || 'extra', sz = g.byId[z.id];
    const lit = roomLight(role, t, T, z.seed % 97), u = sz ? clamp((sz.cx - g.house.x0) / g.house.w) : 0.5;
    vGradient(ctx, w, h, [[0, '#010207'], [1, '#04101c']]);
    glow(ctx, w * 0.5, h * 0.72, Math.max(w, h) * 0.75, [30, 125, 165], 0.55 * lit);
    // glowing silhouette behind the closed curtains (preview)
    if (role === 'hero') {
      const ts = pulse(t, 1.5, SWEEP + 0.25 + u * SWEEP_DUR, 0.4);
      if (ts > 0) glow(ctx, w * (0.25 + 0.5 * smooth(1.5, 3.2, t)), h * 0.5, h * 0.55, [170, 235, 255], 0.5 * ts);
    }
    const small = sz ? sz.y1 - sz.y0 < 0.16 * g.house.h : false;
    const p = actor(ACTS[role] || ACTS.extra, t, w, h, T, z.seed % 97, PERS[role] || PERS.extra, small);
    if (p) {
      glow(ctx, p.x, p.y + p.s * 0.3, p.s * 1.9, [110, 220, 240], 0.35);
      ghostFx(ctx, p.x, p.y, p.s, T + (z.seed % 13), p);
    }
    // eyes in the dark just before the scare
    if (role === 'hero') {
      const ea = pulse(t, HUSH + 0.5, RUSH + 0.4, 0.3);
      if (ea > 0) {
        const bc = (T * 0.8) % 1, bl = bc < 0.07 ? 0.12 : 1;
        const gr = 1 + 0.8 * smooth(RUSH - 0.6, RUSH + 0.3, t), r = m * 0.04 * gr, d = m * 0.1 * gr;
        for (const sx of [-1, 1]) {
          glow(ctx, w / 2 + sx * d, h * 0.5, r * 5, [80, 220, 255], 0.55 * ea);
          ctx.fillStyle = rgba(ICE, ea);
          ell(ctx, w / 2 + sx * d, h * 0.5, r, r * 1.3 * bl);
        }
      }
    }
    drawCurtains(ctx, w, h, curtainOpen(t, u) * (1 - shut(role, t)), T, stirOf(role, t), z.seed % 97, lit);
    const fl = flashOf(role, t);
    if (fl > 0.005) { ctx.fillStyle = rgba(ICE, 0.7 * clamp(fl)); ctx.fillRect(0, 0, w, h); }
    // inner shadow at the edges: depth
    const vig = cached(z, 'vig', () => {
      const e = m * 0.16, l = ctx.createLinearGradient(0, 0, e, 0), r = ctx.createLinearGradient(w, 0, w - e, 0), b = ctx.createLinearGradient(0, h, 0, h - e);
      for (const q of [l, r, b]) { q.addColorStop(0, 'rgba(0,0,0,0.65)'); q.addColorStop(1, 'rgba(0,0,0,0)'); }
      return { e, l, r, b };
    });
    ctx.fillStyle = vig.l; ctx.fillRect(0, 0, vig.e, h);
    ctx.fillStyle = vig.r; ctx.fillRect(w - vig.e, 0, vig.e, h);
    ctx.fillStyle = vig.b; ctx.fillRect(0, h - vig.e, w, vig.e);
  }

  // ---------- door: slit of cold light ----------
  // the door is red: everything projected there is multiplied by red → only very high whites
  const doorLight = (t, T) => (0.5 * smooth(2.4, 5.5, t) + 1.8 * hit(t, SQUEEZED, 0.9) + 0.3 * hush(t) + 0.7 * beat(t)
    + 0.6 * pulse(t, BYE + 0.4, CLOSE + 0.8, 0.5)) * (1 - smooth(32, 33.8, t)) * (0.85 + 0.15 * flicker(T * 0.6, 5));
  const doorGap = t => 0.12 + 0.18 * hit(t, SQUEEZED, 0.7) + 0.16 * pulse(t, BYE + 0.4, CLOSE + 0.6, 0.6);
  const WH = [255, 255, 255], WH2 = [240, 250, 255];
  function drawDoor(ctx, z, S) {
    const { w, h } = z, t = S.t, T = S.T;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
    const L = doorLight(t, T), gap = w * doorGap(t);
    // with a ghost inside, the background darkens so its white silhouette reads against black
    const inside = Math.max(pulse(t, C.t1 - diveOf(C) + HOP * 0.5, SQUEEZED, 0.15), pulse(t, BYE + 0.9, CLOSE + 0.4, 0.35)), Ls = L * (1 - 0.85 * inside);
    if (L > 0.005) {
      const sp = ctx.createLinearGradient(gap, 0, w, 0);
      sp.addColorStop(0, rgba(WH, 0.7 * Ls)); sp.addColorStop(0.35, rgba(WH2, 0.28 * Ls)); sp.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sp; ctx.fillRect(gap, 0, w - gap, h);
      const fb = ctx.createLinearGradient(0, h, 0, h * 0.84);
      fb.addColorStop(0, rgba(WH, 0.9 * Ls)); fb.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fb; ctx.fillRect(0, h * 0.84, w, h * 0.16);
      const core = ctx.createLinearGradient(0, 0, gap * 1.6, 0);
      core.addColorStop(0, rgba(WH, L * 1.4)); core.addColorStop(0.6, rgba(WH2, L)); core.addColorStop(1, rgba(WH2, 0));
      ctx.fillStyle = core; ctx.fillRect(0, 0, gap * 1.6, h);
      // mist escaping through the slit
      for (let i = 0; i < 5; i++) {
        const c = (T * 0.32 + i / 5) % 1;
        glow(ctx, gap + c * w * 0.55, h * (0.92 - c * 0.75) + Math.sin(T * 1.7 + i) * h * 0.04, w * (0.18 + 0.3 * c), WH2, 0.3 * Ls * Math.sin(Math.PI * c));
      }
    }
    // white flash of the whole door when the ghost finishes slipping in
    const fl = t > SQUEEZED ? (1 - clamp((t - SQUEEZED) / 0.4)) ** 2 : 0;
    if (fl > 0.005) { ctx.fillStyle = rgba(WH, 0.85 * fl); ctx.fillRect(0, 0, w, h); }
    // the ghost that slipped in peeks out to say goodbye (pure white, with additive pass)
    const k = t - (BYE + 0.9), D = CLOSE - BYE - 0.5;
    if (k > 0 && k < D) {
      const s = Math.min(w * 0.85, h * 0.42);
      const inK = easeBack(clamp(k / 0.6)), outK = easeIn((k - (D - 0.35)) / 0.35);
      const x = lerp(lerp(-s * 0.7, w * 0.42, inK), -s * 0.7, outK), y = h * 0.36 + Math.sin(T * 2) * h * 0.015;
      const o = { tilt: 0.25, lookX: 1, mouth: 0.1, wave: k > 0.7 && k < D - 0.5, color: WH };
      // additive pass underneath (saturates the body to white) and the normal one on top (dark eyes and mouth)
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ghostFx(ctx, x, y, s * 1.04, T + 3, Object.assign({}, o, { a: 0.6, glow: 0.5 }));
      ctx.restore();
      ghostFx(ctx, x, y, s, T + 3, Object.assign(o, { glow: 0 }));
    }
    // white frame: the door is part of the farewell number
    const fr = pulse(t, BYE + 0.3, CLOSE + 0.6, 0.4);
    if (fr > 0.01) {
      const lw = Math.max(2, w * 0.03);
      ctx.strokeStyle = rgba(WH, fr); ctx.lineWidth = lw;
      ctx.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
    }
  }

  // ---------- walls and pediment ----------
  function drawWall(ctx, z, S, g) {
    const { w, h } = z, t = S.t, lit = moonLight(t), inv = g.inv[z.id];
    ctx.fillStyle = '#010206'; ctx.fillRect(0, 0, w, h);
    if (lit > 0.005 && inv) {
      // the pediment moon lights the facade: closer means more light
      const [u, v] = inv(g.moon[0], g.moon[1]), mx = u * w, my = v * h, R = Math.hypot(w, h) * 0.6;
      const gr = ctx.createRadialGradient(mx, my, 0, mx, my, R);
      gr.addColorStop(0, rgba([70, 125, 190], 0.36 * lit)); gr.addColorStop(0.4, rgba([20, 40, 80], 0.08 * lit)); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    }
    const eave = cached(z, 'eave', () => { const e = ctx.createLinearGradient(0, 0, 0, h * 0.2); e.addColorStop(0, 'rgba(0,0,0,0.8)'); e.addColorStop(1, 'rgba(0,0,0,0)'); return e; });
    ctx.fillStyle = eave; ctx.fillRect(0, 0, w, h * 0.2);
  }
  // elongated cloud: dark core with soft edges, its upper rim lit by the moon
  function makeCloud(cw, ch, seed) {
    const c = document.createElement('canvas');
    c.width = Math.max(8, cw | 0); c.height = Math.max(8, ch | 0);
    const x = c.getContext('2d'), r = rng(seed), blobs = [];
    for (let i = 0; i < 11; i++) {
      const f = i / 10;
      blobs.push([cw * (0.08 + 0.84 * f), ch * (0.58 + 0.1 * (r() - 0.5)), ch * (0.16 + 0.2 * Math.sin(Math.PI * f) + 0.05 * r())]);
    }
    const blob = (bx, by, br, col, a) => {
      x.save(); x.translate(bx, by); x.scale(1.9, 1);
      const gr = x.createRadialGradient(0, 0, 0, 0, 0, br);
      gr.addColorStop(0, rgba(col, a)); gr.addColorStop(0.6, rgba(col, a * 0.8)); gr.addColorStop(1, rgba(col, 0));
      x.fillStyle = gr; x.fillRect(-br, -br, br * 2, br * 2);
      x.restore();
    };
    for (const [bx, by, br] of blobs) blob(bx, by - br * 0.3, br, [150, 205, 240], 0.55);
    for (const [bx, by, br] of blobs) blob(bx, by + br * 0.05, br, [2, 6, 16], 0.95);
    return c;
  }
  // pediment sky: stars, a cold moon rising and clouds crossing it (screen px)
  function drawSky(ctx, g, t, T) {
    const lit = moonLight(t), poly = g.roof && g.poly[g.roof.id];
    if (lit <= 0.005 || !poly) return;
    const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]);
    const left = Math.min(...xs), right = Math.max(...xs), top = Math.min(...ys), bot = Math.max(...ys), tw = right - left, th = bot - top;
    ctx.save();
    ctx.beginPath(); polyPath(ctx, poly); ctx.clip();
    const sky = ctx.createLinearGradient(0, top, 0, bot);
    sky.addColorStop(0, rgba([0, 2, 8], lit)); sky.addColorStop(1, rgba([5, 14, 36], lit));
    ctx.fillStyle = sky; ctx.fillRect(left, top, tw, th);
    const sp = sprites();
    ctx.globalCompositeOperation = 'lighter';
    // few but large stars, with slow twinkle (white core + halo)
    for (const [su, sv, k] of [[-0.3, 0.62, 0], [0.27, 0.55, 1], [-0.17, 0.83, 2], [0.36, 0.84, 3], [0.1, 0.36, 4], [-0.42, 0.9, 5]]) {
      const x = g.moon[0] + su * tw, y = top + sv * th, sr = th * (0.06 + 0.03 * hash(k + 2));
      const tw8 = 0.5 + 0.5 * Math.sin(T * (0.7 + 0.5 * hash(k + 9)) + k * 2.1);
      ctx.globalAlpha = lit * (0.3 + 0.55 * tw8);
      ctx.drawImage(sp.ice, x - sr, y - sr, sr * 2, sr * 2);
      ctx.globalAlpha = lit * (0.5 + 0.5 * tw8);
      ctx.drawImage(sp.white, x - sr * 0.3, y - sr * 0.3, sr * 0.6, sr * 0.6);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const { mx, my, mr } = moonGeo(g, t);
    glow(ctx, mx, my, mr * 6.5, [60, 130, 210], 0.13 * lit);
    glow(ctx, mx, my, mr * 2.4, [170, 220, 255], 0.38 * lit);
    const mg = ctx.createRadialGradient(mx - mr * 0.35, my - mr * 0.4, mr * 0.1, mx, my, mr);
    mg.addColorStop(0, rgba([255, 255, 255], lit)); mg.addColorStop(0.6, rgba([215, 235, 248], lit)); mg.addColorStop(1, rgba([140, 178, 210], lit));
    ctx.fillStyle = mg; ell(ctx, mx, my, mr, mr);
    ctx.fillStyle = rgba([110, 150, 190], 0.45 * lit);
    for (const [cx, cy, cr] of [[-0.32, 0.1, 0.2], [0.28, -0.3, 0.13], [0.36, 0.38, 0.1], [-0.05, -0.52, 0.08], [0.05, 0.5, 0.11]]) ell(ctx, mx + cx * mr, my + cy * mr, cr * mr, cr * mr * 0.85);
    // two clouds at different speeds (parallax)
    const key = `${tw | 0}x${th | 0}`;
    if (!g.cloud || g.cloudKey !== key) { g.cloud = makeCloud(tw * 0.42, th * 0.24, 7); g.cloudKey = key; }
    for (let i = 0; i < 2; i++) {
      const sc = i ? 0.75 : 1, cw = g.cloud.width * sc, ch = g.cloud.height * sc;
      const p = ((T * (0.022 + i * 0.012) + i * 0.6) % 1.7) - 0.35;
      ctx.globalAlpha = lit * (i ? 0.8 : 1);
      ctx.drawImage(g.cloud, left + p * tw - cw / 2, top + th * (0.66 - i * 0.2) - ch / 2, cw, ch);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---------- global layer ----------
  // intermediate layer the size of the final canvas and a mask (union of the dilated zones) cached
  let LAY = null;
  function layerFor(out, g) {
    const cw = out.canvas.width, ch = out.canvas.height, m = out.getTransform();
    if (!LAY || LAY.c.width !== cw || LAY.c.height !== ch) {
      const c = document.createElement('canvas'), mk = document.createElement('canvas');
      c.width = mk.width = cw; c.height = mk.height = ch;
      LAY = { c, x: c.getContext('2d'), mk, key: '' };
    }
    const polys = housePolys(g), key = `${g.polyVer}|${m.a},${m.b},${m.c},${m.d},${m.e},${m.f}`;
    if (LAY.key !== key || LAY.src !== g.src) {
      const x = LAY.mk.getContext('2d');
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cw, ch);
      x.setTransform(m);
      x.fillStyle = '#fff'; x.beginPath();
      for (const p of polys) polyPath(x, p);
      x.fill();
      LAY.key = key; LAY.src = g.src;
    }
    const x = LAY.x;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1; x.globalCompositeOperation = 'source-over';
    x.clearRect(0, 0, cw, ch);
    x.setTransform(m);
    return x;
  }
  function composeLayer(out) {
    const x = LAY.x;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalAlpha = 1;
    x.globalCompositeOperation = 'destination-in';
    x.drawImage(LAY.mk, 0, 0);
    x.globalCompositeOperation = 'source-over';
    out.save();
    out.setTransform(1, 0, 0, 1, 0, 0);
    out.drawImage(LAY.c, 0, 0);
    out.restore();
  }
  const MIST = [
    { y: 0.72, h: 0.32, sp: 6, a: 0.12, sc: 1.3 },    // background: tall, slow
    { y: 0.8, h: 0.27, sp: 14, a: 0.18, sc: 1 },
    { y: 0.88, h: 0.2, sp: 30, a: 0.26, sc: 0.8 },    // foreground: low, fast
  ];
  function drawMist(ctx, g, T, i, amt) {
    if (amt <= 0.005) return;
    const L = MIST[i], tex = mistTexture(g).c, hs = g.house;
    const dw = hs.w * L.sc, dh = hs.h * L.h, y = hs.y0 + hs.h * L.y + Math.sin(T * 0.21 + i) * hs.h * 0.02;
    const off = (T * L.sp * (hs.h / 470) + i * dw * 0.37) % dw;
    ctx.globalAlpha = clamp(L.a * amt);
    for (let x = hs.x0 - off; x < hs.x1; x += dw) ctx.drawImage(tex, x, y, dw + 1, dh);
    ctx.globalAlpha = 1;
  }
  function drawWisps(ctx, g, T, a) {
    if (a <= 0.01) return;
    const sp = sprites(), H = g.house.h;
    for (let i = 0; i < 7; i++) {
      const per = 6 + 4 * hash(i + 1), c = ((T + hash(i + 7) * per) / per) % 1;
      const x = g.house.x0 + g.house.w * (0.04 + 0.92 * hash(i * 3.3 + 1)) + Math.sin(T * 0.9 + i * 2) * H * 0.04;
      const y = g.house.y1 - H * (0.04 + 0.42 * c), r = H * (0.035 + 0.02 * hash(i + 3));
      const al = a * Math.sin(Math.PI * c) ** 2 * (0.65 + 0.35 * Math.sin(T * 7 + i));
      ctx.globalAlpha = clamp(al * 0.7); ctx.drawImage(sp.teal, x - r, y - r, r * 2, r * 2);
      ctx.globalAlpha = clamp(al); ctx.drawImage(sp.white, x - r * 0.3, y - r * 0.3, r * 0.6, r * 0.6);
    }
    ctx.globalAlpha = 1;
  }
  function polyline(ctx, pts, p, closed) {
    const P = closed ? [...pts, pts[0]] : pts, L = [];
    let total = 0;
    for (let i = 1; i < P.length; i++) { L.push(Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])); total += L[i - 1]; }
    let left = total * clamp(p), end = P[0];
    ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
    for (let i = 1; i < P.length && left > 0; i++) {
      const k = Math.min(1, left / L[i - 1]);
      end = [lerp(P[i - 1][0], P[i][0], k), lerp(P[i - 1][1], P[i][1], k)];
      ctx.lineTo(end[0], end[1]);
      left -= L[i - 1];
    }
    return end;
  }
  function drawOutlines(ctx, g, t) {
    const lw = g.house.h * 0.0055, out = 1 - smooth(31.8, 33.6, t), sp = sprites();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const o of g.outlines) {
      const p = easeInOut((t - o.t0) / 1.3);
      if (p <= 0) continue;
      let a = lerp(1, 0.4, smooth(o.t0 + 1.3, o.t0 + 3, t)) * (1 - 0.75 * hush(t));
      a = clamp((a + 0.9 * flashOf(o.role, t) + 0.6 * booFlash(t)) * out * (1 - 0.9 * clamp(shut(o.role, t))));
      if (a <= 0.01) continue;
      let end;
      for (const [c, mul, al] of [[o.col, 5, 0.12], [o.col, 2.2, 0.35], [mix(o.col, [255, 255, 255], 0.65), 0.8, 1]]) {
        ctx.strokeStyle = rgba(c, al * a); ctx.lineWidth = lw * mul;
        end = polyline(ctx, o.pts, p, o.closed); ctx.stroke();
      }
      if (p < 1) {
        const r = lw * 12;
        ctx.drawImage(sp.ice, end[0] - r, end[1] - r, r * 2, r * 2);
        ctx.drawImage(sp.white, end[0] - r * 0.35, end[1] - r * 0.35, r * 0.7, r * 0.7);
      }
    }
  }
  // moon sweep: a diagonal band that crosses the house and reveals the facade
  function drawSweep(ctx, g, t) {
    const k = (t - SWEEP) / SWEEP_DUR;
    if (k <= -0.15 || k >= 1.15) return;
    const hs = g.house, bw = hs.w * 0.14, x = hs.x0 + k * hs.w, a = Math.sin(Math.PI * clamp((k + 0.15) / 1.3));
    const gr = ctx.createLinearGradient(x - bw, hs.y0 - bw * 0.5, x + bw, hs.y0 + bw * 0.5);
    gr.addColorStop(0, rgba(ICE, 0)); gr.addColorStop(0.4, rgba(AQUA, 0.14 * a)); gr.addColorStop(0.5, rgba(ICE, 0.42 * a)); gr.addColorStop(0.6, rgba(AQUA, 0.14 * a)); gr.addColorStop(1, rgba(ICE, 0));
    ctx.fillStyle = gr;
    ctx.fillRect(hs.x0, hs.y0, hs.w, hs.h);
  }
  // lit windows spill cold light onto the wall around them
  function drawSpill(ctx, g, t, T) {
    const sp = sprites().teal;
    for (const sz of g.src) {
      if (sz.kind !== 'window') continue;
      const l = roomLight(g.role[sz.id] || 'extra', t, T, (hashString(sz.id) % 10007) % 97);
      if (l < 0.02) continue;
      const w = sz.x1 - sz.x0, h = sz.y1 - sz.y0;
      ctx.globalAlpha = 0.28 * l;
      ctx.drawImage(sp, sz.cx - w * 1.1, sz.cy - h * 0.7, w * 2.2, h * 2.6);
    }
    ctx.globalAlpha = 1;
  }
  // frame echo: the window "pulses" outward when something passes through it
  function drawEchoes(ctx, g, t) {
    const polys = housePolys(g);
    for (const [role, tc] of CROSS) {
      const age = t - tc;
      if (age < 0 || age > 0.9) continue;
      const sz = role === 'door' ? g.door : g.win[role];
      if (!sz) continue;
      const pts = g.poly[sz.id] || sz.pts, f = age / 0.75;
      if (f >= 1) continue;
      // a single soft echo: leaves the frame, ripples like ectoplasm and stays within its wall
      const sc = 1 + 0.35 * easeOut(f), fa = (1 - f) ** 2, par = g.parent && g.parent[sz.id];
      const ring = pts.map(([x, y], i) => [sz.cx + (x - sz.cx) * sc + Math.sin(t * 9 + i) * 2, sz.cy + (y - sz.cy) * sc + Math.cos(t * 9 + i * 1.7) * 2]);
      ctx.save();
      if (par) { ctx.beginPath(); polyPath(ctx, g.poly[par.id] || par.pts); ctx.clip(); }
      ctx.lineJoin = 'round';
      for (const [col, al, lw] of [[TEAL, 0.12, 0.03], [ICE, 0.5, 0.007]]) {
        ctx.strokeStyle = rgba(col, al * fa * 1.6); ctx.lineWidth = g.house.h * lw * (1 - 0.5 * f) + 1;
        ctx.beginPath(); polyPath(ctx, ring); ctx.stroke();
      }
      ctx.restore();
    }
    return polys;
  }

  // travelers: state at an instant (screen px)
  function tState(g, d, t) {
    const k = t - d.t0, D = d.t1 - d.t0, path = g.paths[d.key];
    const src = g.win[d.from], dst = d.to === 'door' ? g.door : g.win[d.to];
    if (!path || !src || !dst || k < 0 || k > D) return null;
    const sF = g.house.h * d.size, dv = diveOf(d);
    const sIn = Math.min(sF * 0.85, (src.y1 - src.y0) * 0.5), sOut = Math.min(sF * 0.85, (dst.y1 - dst.y0) * 0.5);
    const fl = (k - EMERGE) / (D - EMERGE - dv);
    if (fl < 0) {
      // appears at the back of the room, approaches and presses against the glass before leaving
      const e = k / EMERGE, [x, y] = path.at(0);
      return { x, y: y + Math.sin(Math.PI * e) * sIn * 0.15, s: lerp(sIn * 0.4, sIn, easeInOut(e)), a: smooth(0, 0.5, e), clip: src, sx: 1 + 0.14 * smooth(0.55, 1, e), sy: 1 - 0.14 * smooth(0.55, 1, e) };
    }
    if (fl <= 1) {
      const gi = gapInfo(g, d), dd = gi.dist(fl), [x, y] = path.at(dd);
      return { x, y, s: lerp(sIn, sF, easeOut(fl / 0.18)) * lerp(1, sOut / sF, smooth(0.6, 0.9, fl)), a: 1, flying: true, ph: gi.ph(dd) };
    }
    const kd = k - (D - dv), [x, y] = path.at(path.L);
    if (d.to === 'door') {
      // ghostly hop to the door (wisp), moves close to the slit, crouches and squeezes to slip in
      if (kd < HOP) {
        const u = kd / HOP, m = easeInOut(u);
        return { x: lerp(x, g.doorIn[0], m), y: lerp(y, g.doorIn[1], m) - Math.sin(Math.PI * u) * sOut * 0.25, s: sOut, a: 1, flying: true, ph: Math.sin(Math.PI * clamp(u * 1.15 - 0.075)) ** 0.6 };
      }
      const m = easeInOut((kd - HOP) / 0.3), q = easeInOut((kd - 0.58) / 0.26), crouch = Math.sin(Math.PI * clamp((kd - 0.42) / 0.22)) * 0.14;
      const settle = Math.sin(Math.PI * clamp((kd - HOP) / 0.2)) * 0.1;
      const nx = lerp(g.doorIn[0], g.crack[0] + sOut * 0.4, m);
      return { x: lerp(nx, g.crack[0], q), y: lerp(g.doorIn[1], g.crack[1], m * 0.5), s: sOut, a: 1 - smooth(0.8, 0.96, kd), clip: dst, sx: lerp(1 + crouch + settle, 0.06, q), sy: lerp(1 - crouch - settle, 1.4, q), lookX: -1.2, mood: q > 0.2 ? 'scared' : undefined, white: true };
    }
    const e = kd / dv;
    return { x, y, s: sOut * lerp(1, 0.25, easeOut(e)), a: 1 - smooth(0.25, 1, e), clip: dst };
  }
  // re-entries after passing through a gap (including the hop to the door)
  function eventsOf(g, d) {
    if (!g.paths[d.key]) return [];
    const gi = gapInfo(g, d);
    if (d.to === 'door' && g.door && !gi.doorEv) gi.doorEv = { t: d.t1 - diveOf(d) + HOP * 0.8, x: g.doorIn[0], y: g.doorIn[1], poly: g.poly[g.door.id] || g.door.pts };
    return gi.doorEv ? [...gi.events, gi.doorEv] : gi.events;
  }
  // adds tilt, stretch and gaze according to speed
  function tPose(g, d, t) {
    const st = tState(g, d, t);
    if (!st || !st.flying) return st;
    const q = tState(g, d, t - 0.08);
    const vx = q ? (st.x - q.x) / 0.08 : 0, vy = q ? (st.y - q.y) / 0.08 : 0, kv = 1 / (st.s * 7);
    st.rot = clamp(Math.atan2(vx * kv, -Math.min(-1 + vy * kv, -0.3)), -0.95, 0.95);
    const sp = clamp(Math.hypot(vx, vy) / (st.s * 12), 0, 0.28);
    st.sy = 1 + sp; st.sx = 1 - sp * 0.45;
    st.vx = clamp(vx / (st.s * 6), -1, 1);
    st.lookX = clamp(vx / 220, -1.2, 1.2); st.lookY = clamp(vy / 300, -1, 1);
    const ph = st.ph || 0;
    if (ph > 0.001) {
      // wisp: stretched in the direction of flight, translucent
      let ar = Math.atan2(vx, -vy) - st.rot;
      ar = Math.atan2(Math.sin(ar), Math.cos(ar));
      st.rot += ar * ph;
      st.sx = lerp(st.sx, 0.4, ph); st.sy = lerp(st.sy, 1.6, ph);
      st.a = lerp(1, 0.3, ph);
    }
    return st;
  }
  const tailOf = st => { const r = st.rot || 0; return [st.x - Math.sin(r) * st.s * 0.7, st.y + Math.cos(r) * st.s * 0.7, st.s]; };
  // ectoplasm trail: sharp, wavy ribbon in three layers (from wide and faint to thin and bright)
  function drawTrail(ctx, g, d, t) {
    const N = 16, dt = 0.035, P = [];
    for (let i = 0; i <= N; i++) {
      const st = tPose(g, d, t - i * dt);
      if (!st || !st.flying) break;
      P.push(tailOf(st));
    }
    if (P.length < 3) return;
    const L = [], R = [];
    for (const [wid, col, al] of [[0.72, TEAL, 0.06], [0.52, TEAL, 0.08], [0.36, AQUA, 0.12], [0.22, AQUA, 0.2], [0.1, ICE, 0.6]]) {
      L.length = R.length = 0;
      for (let i = 0; i < P.length; i++) {
        const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
        let nx = a[1] - b[1], ny = b[0] - a[0];
        const n = Math.hypot(nx, ny) || 1;
        nx /= n; ny /= n;
        const f = i / N, wob = Math.sin(t * 7 - i * 0.9 + d.seed) * P[i][2] * 0.14 * f;
        const half = P[i][2] * wid * (1 - f) ** 0.8 * (1 + 0.25 * Math.sin(i * 1.3 - t * 6));
        const cx = P[i][0] + nx * wob, cy = P[i][1] + ny * wob;
        L.push([cx + nx * half, cy + ny * half]); R.push([cx - nx * half, cy - ny * half]);
      }
      ctx.beginPath();
      ctx.moveTo(L[0][0], L[0][1]);
      for (const p of L) ctx.lineTo(p[0], p[1]);
      for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
      ctx.closePath();
      const last = P[P.length - 1], gr = ctx.createLinearGradient(P[0][0], P[0][1], last[0], last[1]);
      gr.addColorStop(0, rgba(col, al)); gr.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = gr; ctx.fill();
    }
  }
  // ectoplasm droplets that break off, fall slowly and twinkle
  function drawMotes(ctx, g, d, t) {
    const life = 1.5, step = 0.05, tStart = d.t0 + EMERGE, tEnd = d.t1 - diveOf(d), dot = sprites().ice;
    const j0 = Math.max(0, Math.ceil((t - life - tStart) / step)), j1 = Math.floor((Math.min(t, tEnd) - tStart) / step);
    for (let j = j0; j <= j1; j++) {
      const te = tStart + j * step, st = tState(g, d, te);
      if (!st) continue;
      const age = t - te, f = age / life, r1 = hash(j * 7.13 + d.seed), r2 = hash(j * 3.71 + d.seed * 2);
      const x = st.x + (r1 - 0.5) * st.s * 0.9 + Math.sin(age * 3 + j) * st.s * 0.15;
      const y = st.y + st.s * 0.65 + age * st.s * (0.2 + 0.5 * r2) + age * age * st.s * 0.25;
      const rad = st.s * (0.07 + 0.1 * r2) * (1 - f * 0.5);
      ctx.globalAlpha = clamp((1 - f) ** 2 * (0.55 + 0.45 * Math.sin(age * 14 + j)));
      ctx.drawImage(dot, x - rad, y - rad, rad * 2, rad * 2);
    }
    ctx.globalAlpha = 1;
  }
  function drawTraveller(ctx, g, d, t, T) {
    if (t < d.t0 || t > d.t1 + 1.6) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    drawMotes(ctx, g, d, t);
    drawTrail(ctx, g, d, t);
    ctx.restore();
    const st = tPose(g, d, t), sp = sprites();
    if (st && st.flying) {
      // pool of light the ghost casts on the facade (fainter the higher it flies)
      const hv = clamp((st.y - g.house.y0) / g.house.h), pa = 0.25 * st.a * (0.35 + 0.65 * hv);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = pa;
      ctx.drawImage(sp.teal, st.x - st.s * 1.25, st.y + st.s * 0.9 - st.s * 0.4, st.s * 2.5, st.s * 0.8);
      ctx.restore();
    }
    if (st) {
      const o = { a: st.a, rot: st.rot, sx: st.sx, sy: st.sy, vx: st.vx, lookX: st.lookX ?? 0, lookY: st.lookY ?? 0, mouth: st.flying ? 0.5 : 0.25, aura: 2.4, seed: d.seed, mood: st.mood };
      ctx.save();
      if (st.clip) { ctx.beginPath(); polyPath(ctx, g.poly[st.clip.id] || st.clip.pts); ctx.clip(); }
      if (st.white) {
        // on the red door only white works: additive pass underneath, white ghost on top
        Object.assign(o, { aura: 0, color: [255, 255, 255], glow: 0 });
        ctx.globalCompositeOperation = 'lighter';
        ghostFx(ctx, st.x, st.y, st.s * 1.04, T * 1.15 + d.seed, Object.assign({}, o, { a: st.a * 0.6, glow: 0.5 }));
        ctx.globalCompositeOperation = 'source-over';
      }
      ghostFx(ctx, st.x, st.y, st.s, T * 1.15 + d.seed, o);
      ctx.restore();
      if (d === A && st.flying) drawMoonPass(ctx, g, st, o, T * 1.15 + d.seed, t);
    }
    // reappears on the other side of the gap: icy burst, wave and flash of the zone's outline
    for (const ev of eventsOf(g, d)) {
      const age = t - ev.t, f = age / 0.55;
      if (f <= 0 || f >= 1) continue;
      const s0 = g.house.h * d.size, fa = (1 - f) ** 2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = fa;
      const rb = s0 * (0.5 + 1.1 * easeOut(f));
      ctx.drawImage(sp.ice, ev.x - rb, ev.y - rb, rb * 2, rb * 2);
      const rc = s0 * 0.35 * (1 - f);
      ctx.drawImage(sp.white, ev.x - rc, ev.y - rc, rc * 2, rc * 2);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = rgba(ICE, 0.7 * fa); ctx.lineWidth = s0 * 0.06 * (1 - f) + 1;
      ctx.beginPath(); ctx.ellipse(ev.x, ev.y, s0 * (0.3 + 1.6 * easeOut(f)), s0 * (0.22 + 1.1 * easeOut(f)), 0, 0, TAU); ctx.stroke();
      if (ev.poly) {
        ctx.lineJoin = 'round';
        const lw = g.house.h * 0.0055;
        for (const [mul, al] of [[4, 0.16], [1.6, 0.45], [0.7, 1]]) {
          ctx.strokeStyle = rgba(ICE, al * (1 - f) ** 1.5); ctx.lineWidth = lw * mul;
          ctx.beginPath(); polyPath(ctx, ev.poly); ctx.stroke();
        }
      }
      ctx.restore();
    }
  }
  // geometry of the pediment moon at an instant (screen px)
  function moonGeo(g, t) {
    const poly = g.roof && g.poly[g.roof.id];
    if (!poly) return null;
    const ys = poly.map(p => p[1]), top = Math.min(...ys), bot = Math.max(...ys), th = bot - top;
    const rise = easeOut((t - 0.4) / 4.5), mr = th * 0.28;
    return { mx: g.moon[0], my: lerp(bot + mr * 1.3, g.moon[1], rise) + smooth(31.5, 34, t) * th * 0.35, mr, th, top, bot };
  }
  // ghost in front of the moon: dark silhouette cut out of the disc, with a bright edge
  let silC = null;
  function drawMoonPass(ctx, g, st, o, tg, t) {
    const mo = moonGeo(g, t), lit = moonLight(t);
    if (!mo || lit < 0.05) return;
    const bx = st.x, by = st.y + st.s * 0.35, dd = Math.hypot(bx - mo.mx, by - mo.my);
    if (dd > mo.mr + st.s * 0.9) return;
    const dpr = ctx.getTransform().a || 1, ext = st.s * 3.4, px = Math.ceil(ext * dpr), ox = ext / 2, oy = ext * 0.4;
    if (!silC) silC = document.createElement('canvas');
    if (silC.width < px) silC.width = silC.height = px;
    const x = silC.getContext('2d');
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, px, px);
    x.setTransform(dpr, 0, 0, dpr, 0, 0);
    ghostFx(x, ox, oy, st.s * 0.95, tg, Object.assign({}, o, { a: 1, aura: 0, glow: 0 }));
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = 'rgba(0,4,12,0.92)'; x.fillRect(0, 0, ext, ext);
    x.globalCompositeOperation = 'source-over';
    const ov = clamp(1 - dd / (mo.mr + st.s * 0.9)) * lit;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, mo.mx, mo.my, mo.mr * 1.9, [170, 225, 255], 0.35 * ov);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.arc(mo.mx, mo.my, mo.mr * 1.01, 0, TAU); ctx.clip();
    ctx.globalAlpha = st.a * lit;
    ctx.drawImage(silC, 0, 0, px, px, st.x - ox, st.y - oy, px / dpr, px / dpr);
    ctx.restore();
  }

  // the ghost that lunges toward the audience
  function rushPose(g, t) {
    const hero = g.win.hero;
    if (!hero || !g.rushTo || t < RUSH || t > POOF + 0.6) return null;
    const h0 = hero.y1 - hero.y0, s0 = h0 * 0.14, sR = h0 * 0.42, sF = g.house.h * 0.55;
    let s, a = 1, mouth = 0.25, clip = null, wave = false, lift = 0, sx = 1, sy = 1, tilt = 0, lookX = 0, mood, back = 0;
    if (t < RELEASE) {
      // at the back of the room: perspective, grows faster and faster
      const k = (t - RUSH) / (RELEASE - RUSH);
      s = s0 / lerp(1, s0 / sR, k); clip = hero; a = smooth(0, 0.35, k);
    } else if (t < BOO) {
      const k = (t - RELEASE) / (BOO - RELEASE);
      s = sR / lerp(1, sR / sF, k); mouth = lerp(0.3, 1, smooth(0.45, 1, k)); wave = k > 0.55; mood = k > 0.6 ? 'boo' : undefined;
    } else {
      // screams, laughs out loud (bounce), tilts its head, looks at the audience from side to side,
      // gathers momentum (shrinks) and passes over everyone
      const k = (t - POOF) / 0.5, kh = t - BOO, lg = laughOf(t);
      const ant = smooth(POOF - 0.25, POOF, t) * (1 - smooth(POOF, POOF + 0.12, t));
      const rel = Math.sin(Math.PI * clamp(k / 0.5)) * (t > POOF ? 1 : 0);
      s = sF * (1 + 0.025 * Math.sin(t * 43) * hit(t, BOO, 0.35)) * (1 + 1.8 * easeIn(k)) * (1 - 0.04 * ant);
      sy = (1 + 0.06 * lg) * (1 - 0.15 * ant) * (1 + 0.2 * rel); sx = (1 - 0.045 * lg) * (1 + 0.1 * ant) * (1 - 0.12 * rel);
      tilt = 0.12 * Math.sin(TAU * kh / 0.8) * smooth(0, 0.25, kh) * (1 - ant);
      lookX = Math.sin(TAU * (kh - 0.2) / 1.3) * 1.1 * smooth(0.15, 0.4, kh);
      a = 1 - smooth(0.1, 0.9, k); mouth = 1 - 0.65 * smooth(BOO + 0.7, POOF - 0.1, t) + 0.15 * Math.max(0, lg); wave = true; lift = easeIn(k) * sF * 0.7;
      mood = 'boo'; back = ant;
    }
    const f = clamp((s - s0) / (sF - s0));
    return {
      x: lerp(hero.cx, g.rushTo[0], f) + Math.sin(t * 5) * s * 0.05 * (1 - f) + Math.sin(t * 47) * s * 0.012 * hit(t, BOO, 0.5),
      y: lerp(hero.cy, g.rushTo[1], f) - lift + back * sF * 0.05, s, a, mouth, clip, wave, sF, sx, sy, tilt, lookX, mood,
    };
  }
  function drawRush(ctx, g, t, T) {
    const r = rushPose(g, t);
    if (!r) return;
    const sp = sprites();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    // speed lines outward: it comes toward us
    const sl = pulse(t, RELEASE - 0.05, BOO + 0.25, 0.15) + pulse(t, POOF, POOF + 0.55, 0.12);
    if (sl > 0) {
      const cx = r.x, cy = r.y + r.s * 0.35;
      for (let i = 0; i < 34; i++) {
        const ang = (i / 34) * TAU + hash(i) * 0.5, p = (t * 2.6 + hash(i + 9)) % 1, ca = Math.cos(ang), sa = Math.sin(ang) * 0.7;
        const r0 = r.s * (0.75 + p * 3), r1 = r0 + r.s * (0.3 + p * 1.6), wd = r.s * 0.035 * (0.5 + p);
        ctx.fillStyle = rgba(ICE, 0.5 * sl * Math.sin(Math.PI * p));
        ctx.beginPath();
        ctx.moveTo(cx + ca * r0, cy + sa * r0);
        ctx.lineTo(cx + ca * r1 - sa * wd, cy + sa * r1 + ca * wd);
        ctx.lineTo(cx + ca * r1 + sa * wd, cy + sa * r1 - ca * wd);
        ctx.closePath(); ctx.fill();
      }
    }
    // scream waves
    for (let j = 0; j < 3; j++) {
      const age = t - (BOO + j * 0.14), f = age / 0.85;
      if (f <= 0 || f >= 1) continue;
      const R = r.sF * 0.3 + easeOut(f) * g.house.w * 0.75;
      ctx.strokeStyle = rgba(ICE, 0.55 * (1 - f) ** 2);
      ctx.lineWidth = r.sF * 0.07 * (1 - f) + 2;
      ctx.beginPath(); ctx.ellipse(r.x, r.y + r.s * 0.2, R, R * 0.55, 0, 0, TAU); ctx.stroke();
    }
    // spark burst as it passes
    const bk = t - POOF;
    if (bk > 0 && bk < 1.4) {
      for (let i = 0; i < 40; i++) {
        const ang = hash(i * 1.7) * TAU, v = (0.5 + hash(i * 2.3)) * g.house.h * 1.1, life = 0.8 + 0.6 * hash(i * 5.1);
        if (bk > life) continue;
        const dd = v * (1 - Math.exp(-bk * 2.2)) / 2.2, rad = g.house.h * (0.012 + 0.018 * hash(i * 3.3)) * (1 - bk / life * 0.5);
        const x = r.x + Math.cos(ang) * dd, y = r.y + r.sF * 0.3 + Math.sin(ang) * dd * 0.7 + bk * bk * g.house.h * 0.08;
        ctx.globalAlpha = clamp((1 - bk / life) ** 1.5);
        ctx.drawImage(sp.ice, x - rad * 3, y - rad * 3, rad * 6, rad * 6);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (t >= POOF) {
      // final pass: scaled still photo of the ghost (cheap and deterministic)
      const dpr = ctx.getTransform().a || 1, sn = rushSnap(r.sF, dpr), sc = r.s / r.sF / dpr;
      const py = r.y + r.s * 0.35;                    // exit stretch, pivoting on the body
      ctx.save();
      ctx.globalAlpha = r.a;
      ctx.translate(r.x, py); ctx.scale(r.sx, r.sy); ctx.translate(-r.x, -py);
      ctx.drawImage(sn.c, r.x - sn.ox * sc, r.y - sn.oy * sc, sn.c.width * sc, sn.c.height * sc);
      ctx.restore();
      return;
    }
    ctx.save();
    if (r.clip) { ctx.beginPath(); polyPath(ctx, g.poly[r.clip.id] || r.clip.pts); ctx.clip(); }
    // the scene's own clock (not T) so the flicker falls in the middle of the laugh
    ghostFx(ctx, r.x, r.y, r.s, t + 1.75, { a: r.a, mouth: r.mouth, wave: r.wave, aura: r.clip ? 1.6 : Math.min(2.4, (g.house.h * 0.7) / r.s), tilt: r.tilt, sx: r.sx, sy: r.sy, lookX: r.lookX, lookY: 0.1, seed: 4, mood: r.mood });
    ctx.restore();
  }
  let snap = null;
  function rushSnap(sF, dpr) {
    const s = sF * dpr, key = `${s | 0}`;
    if (snap && snap.key === key) return snap;
    const c = document.createElement('canvas');
    c.width = Math.ceil(s * 3.2); c.height = Math.ceil(s * 3.2);
    const ox = s * 1.6, oy = s * 1.3;
    ghostFx(c.getContext('2d'), ox, oy, s, POOF + 1.75, { mouth: 0.35, wave: true, aura: 1.1, lookX: 0, lookY: 0.1, seed: 4, mood: 'boo' });
    return (snap = { key, c, ox, oy });
  }
  function drawBoo(ctx, g, t, T) {
    if (t < BOO || t > 28 || !g.textZone) return;
    const tz = g.textZone, zw = tz.x1 - tz.x0, zh = tz.y1 - tz.y0, dpr = ctx.getTransform().a || 1;
    const chars = ['B', 'O', 'O', '!'];
    // size: fits the largest wall to the right of the bay window
    const probe = chars.map(c => glyph(c, 100)), ratio = probe.reduce((s, q) => s + q.tw, 0) / 100;
    const fs = Math.min(zh * 0.7, (zw * 0.9) / ratio), gl = chars.map(c => glyph(c, fs * dpr));
    const adv = gl.map(q => q.tw / dpr), total = adv.reduce((s, v) => s + v, 0);
    let x = tz.cx - total / 2;
    const cy = tz.cy + zh * 0.04;
    for (let i = 0; i < 4; i++) {
      const q = gl[i], k = (t - (BOO + 0.06 + i * 0.11)) / 0.34;
      if (k > 0) {
        const out = smooth(27.0 + i * 0.07, 27.55 + i * 0.07, t);
        const sc = lerp(2.6, 1, easeBack(clamp(k))) * (1 + out * 0.4) / dpr;
        const rot = (hash(i + 5) - 0.5) * 0.8 * (1 - easeOut(k)) + [-0.07, 0.05, -0.03, 0.09][i] + Math.sin(T * 4 + i * 1.7) * 0.03;
        ctx.save();
        ctx.globalAlpha = smooth(0, 0.2, k) * (1 - out);
        // the letters bounce to the rhythm of the ghost's laughter
        const lg = laughOf(t, -0.8 - i * 0.7);
        ctx.translate(x + adv[i] / 2, cy + Math.sin(T * 3.2 + i) * fs * 0.02 - lg * fs * 0.05 - easeIn(out) * fs * 0.5);
        ctx.rotate(rot + lg * 0.04); ctx.scale(sc * (1 - 0.03 * lg), sc * (1 + 0.05 * lg));
        ctx.drawImage(q.c, -q.cx, -q.cy);
        ctx.restore();
      }
      x += adv[i];
    }
  }

  return {
    name: 'Ghosts',
    duration: DUR,
    globalClip: false,                                // clips drawGlobal to the actual outlines
    ambience: 0.7,
    // moans, heartbeats and the BOO! are scheduled by the score (js/audio/02-fantasmas.js), panned per window
    update() {},
    draw(ctx, z, S) {
      if (shapes[z.id] !== z.shape) { shapes[z.id] = z.shape; shapesVer++; }
      const g = geometry(S), t = S.t, q = quake(t);
      if (q > 0.01) shake(ctx, q * Math.min(z.w, z.h) * 0.03, t, z.seed);
      if (z.kind === 'window') drawWindow(ctx, z, S, g);
      else if (z.kind === 'door') drawDoor(ctx, z, S);
      else if (z.kind === 'roof') { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, z.w, z.h); }
      else drawWall(ctx, z, S, g);
      const f = booFlash(t);
      if (f > 0.01) { ctx.fillStyle = rgba(ICE, f); ctx.fillRect(-40, -40, z.w + 80, z.h + 80); }
    },
    drawGlobal(out, W, H, S) {
      const g = geometry(S), t = S.t, T = S.T;
      if (!g.house) return;
      // drawn without clipping on a separate layer and masked only once with the silhouette of the house:
      // a complex clip makes each draw operation expensive (especially in software rasterization)
      const ctx = layerFor(out, g);
      drawSky(ctx, g, t, T);
      const q = quake(t);
      if (q > 0.01) shake(ctx, q * g.house.h * 0.015, t, 7);
      const mist = mistAmt(t);
      drawMist(ctx, g, T, 0, mist);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawWisps(ctx, g, T, mist);
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      drawSpill(ctx, g, t, T);
      drawSweep(ctx, g, t);
      ctx.restore();
      drawOutlines(ctx, g, t);
      drawEchoes(ctx, g, t);
      drawMist(ctx, g, T, 1, mist);
      for (const d of TRAVEL) drawTraveller(ctx, g, d, t, T);
      drawRush(ctx, g, t, T);
      drawMist(ctx, g, T, 2, mist);
      drawBoo(ctx, g, t, T);
      composeLayer(out, g);
    },
  };
})());
