// Scene: Spiders
// 0–9 s: the webs weave themselves (frame → spokes → spiral) and get covered in dew.
// 5–10 s: baby spiders drop down on their threads and bounce. 9.5 s: the moon rises, everything shakes and they flee.
// 10–11.4 s: her shadow comes first. 11.4–21 s: a giant spider crosses the house in bursts; under the gable
// turns upward, rises with its legs on the gable, roars and bursts its egg sac; then climbs
// back to its web and vanishes into the vent. 21–26 s: calm, dew, and the mother watches from the gable.
registerScene((() => {
  const DUR = 26;
  const SW = 0.32;               // fraction of the step with the leg in the air
  const LD = [1.1, 0.9];         // shadow: offset per unit of height (moon at upper-left)
  const SHK = 6;                 // shadow is painted at 1/6 resolution: comes out smooth
  const COLD = [205, 222, 255], WARM = [255, 222, 185], PURE = [255, 250, 244];
  const RIM = [175, 180, 255], RIM_WARM = [255, 175, 105], DARK = '#050307';
  // key moments (to sync the sound)
  const CUES = { moon: 9.4, flee: 10.4, probe: 10.55, enter: 11.4, arrive: 15.55, turn: 16.1, roar: 16.45, sac: 16.65, swarm: 16.95, leave: 18.55, gone: 21.3, door: 21.6, eyes: 23.9 };

  const play = (n, o) => { try { Sound[n]?.(o); } catch {} };

  // ---------- curves ----------
  const eOut = k => 1 - (1 - clamp(k)) ** 3;
  const eInOut = k => { k = clamp(k); return k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2; };
  const eInBack = k => { k = clamp(k); return 2.70158 * k * k * k - 1.70158 * k * k; };
  const eOutBack = k => { k = clamp(k) - 1; return 1 + 2.70158 * k * k * k + 1.70158 * k * k; };
  const sine = k => 0.5 - 0.5 * Math.cos(Math.PI * clamp(k));

  // ---------- light and ambience ----------
  // moon: very faint across the house and, from 9.3 s, a cold spotlight that waits for the giant and follows her
  const moonAt = t => 0.05 * smooth(0, 2.5, t) * (1 - 0.6 * smooth(23, 25.5, t)) + 0.04 * pulse(t, 9.5, 21.8, 1.5);
  function poolAt(g, t) {
    // flash on the roar
    const a = 0.85 * smooth(9.3, 10.8, t) * (1 - smooth(20.2, 21.8, t)) * (1 + 0.8 * pulse(t, 16.42, 16.9, 0.08));
    if (a <= 0.005) return null;
    const bx = bodyAt(g, trackD(g, t - 0.35))[0], k = smooth(11.2, 12.6, t);
    return { x: lerp(g.X0 + 110 * g.u, bx - 30 * g.u, k), y: g.yc - 85 * g.u, r: 430 * g.u, a };
  }
  // spotlight gradient (in the coordinates ctx uses)
  function poolFill(ctx, x, y, r, a, x0, y0, w, h) {
    const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba([185, 210, 255], a)); gr.addColorStop(0.2, rgba([140, 170, 240], a * 0.7));
    gr.addColorStop(0.5, rgba([60, 80, 150], a * 0.2)); gr.addColorStop(0.85, rgba([20, 30, 70], 0));
    ctx.fillStyle = gr; ctx.fillRect(x0, y0, w, h);
  }
  const shakeAt = t => (t > 16.55 && t < 19 ? Math.exp(-(t - 16.55) * 2.4) : 0);
  const trembleAt = t => pulse(t, 10.2, 12.4, 0.5) + 1.6 * shakeAt(t) + 2.5 * pulse(t, 16.42, 16.85, 0.1);
  // light sweep that lights up the dew (x in screen px)
  function sweepAt(g, t) {
    if (t > 7.4 && t < 9.8) return lerp(g.X0 - 150 * g.u, g.X1 + 150 * g.u, sine((t - 7.4) / 2.4));
    if (t > 21.4 && t < 23.8) return lerp(g.X1 + 150 * g.u, g.X0 - 150 * g.u, sine((t - 21.4) / 2.4));
    return null;
  }

  // ---------- local primitives ----------
  function oval(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); ctx.fill(); }
  function halo(ctx, x, y, r, c, a) {
    if (r <= 0 || a <= 0.005) return;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(c, a)); g.addColorStop(0.35, rgba(c, a * 0.45)); g.addColorStop(1, rgba(c, 0));
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // flash (dew, thread tip): radial halo + thin cross, in 'lighter' mode.
  // Vector on purpose: drawImage from one canvas to another is slow when reading pixels (bench).
  function flare(ctx, x, y, size, a) {
    if (a <= 0.03 || size < 2) return;
    a = Math.min(1, a);
    const r = size / 2, g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${a.toFixed(3)})`); g.addColorStop(0.1, `rgba(235,245,255,${(a * 0.8).toFixed(3)})`);
    g.addColorStop(0.3, `rgba(170,200,255,${(a * 0.2).toFixed(3)})`); g.addColorStop(1, 'rgba(140,170,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r, y - r, size, size);
    if (size < 8) return;
    ctx.strokeStyle = `rgba(255,255,255,${(a * 0.75).toFixed(3)})`; ctx.lineWidth = Math.max(0.8, size * 0.03);
    ctx.beginPath(); ctx.moveTo(x - r * 0.9, y); ctx.lineTo(x + r * 0.9, y); ctx.moveTo(x, y - r * 0.9); ctx.lineTo(x, y + r * 0.9); ctx.stroke();
  }
  // Traces fraction p of a polyline (closed or not); returns the tip
  function polyPart(ctx, pts, p, closed) {
    const n = pts.length, m = closed ? n : n - 1, lens = [];
    let total = 0;
    for (let i = 0; i < m; i++) { const a = pts[i], b = pts[(i + 1) % n]; lens.push(Math.hypot(b[0] - a[0], b[1] - a[1])); total += lens[i]; }
    let left = total * clamp(p), tip = pts[0];
    ctx.moveTo(tip[0], tip[1]);
    for (let i = 0; i < m && left > 0; i++) {
      const a = pts[i], b = pts[(i + 1) % n], k = Math.min(1, left / (lens[i] || 1));
      tip = [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
      ctx.lineTo(tip[0], tip[1]);
      left -= lens[i];
    }
    return tip;
  }
  const rectFrame = (x0, y0, x1, y1, sag) => {
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, sx = (x1 - x0) * sag, sy = (y1 - y0) * sag;
    return [[x0, y0], [mx, y0 + sy], [x1, y0], [x1 - sx, my], [x1, y1], [mx, y1 - sy], [x0, y1], [x0 + sx, my]];
  };

  // ---------- zone ↔ screen ----------
  // Homography unit square → quadrilateral (Heckbert) and its inverse
  function zoneFrame(z, S) {
    const sz = S.screenZones.find(s => s.id === z.id);
    if (!sz) return null;
    const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = sz.pts;
    const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
    let g = 0, h = 0;
    if (Math.abs(sx) > 1e-6 || Math.abs(sy) > 1e-6) {
      const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, den = dx1 * dy2 - dx2 * dy1 || 1e-9;
      g = (sx * dy2 - dx2 * sy) / den; h = (dx1 * sy - sx * dy1) / den;
    }
    const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
    const iA = e - f * h, iB = c * h - b, iC = b * f - c * e, iD = f * g - d, iE = a - c * g, iF = c * d - a * f, iG = d * h - e * g, iH = b * g - a * h, iI = a * e - b * d;
    const w = z.w, hh = z.h;
    return {
      sz, w, h: hh, kx: w / Math.max(1, sz.x1 - sz.x0), ky: hh / Math.max(1, sz.y1 - sz.y0),
      scr(x, y) { const u = x / w, v = y / hh, k = g * u + h * v + 1; return [(a * u + b * v + c) / k, (d * u + e * v + f) / k]; },
      zone(X, Y) { const k = iG * X + iH * Y + iI; return [((iA * X + iB * Y + iC) / k) * w, ((iD * X + iE * Y + iF) / k) * hh]; },
    };
  }

  // ---------- webs ----------
  function rayHit(poly, hx, hy, dx, dy) {
    let best = Infinity;
    for (let i = 0; i < poly.length; i++) {
      const [ax, ay] = poly[i], [bx, by] = poly[(i + 1) % poly.length];
      const ex = bx - ax, ey = by - ay, den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-9) continue;
      const t = ((ax - hx) * ey - (ay - hy) * ex) / den, s = ((ax - hx) * dy - (ay - hy) * dx) / den;
      if (t > 0 && s >= 0 && s <= 1) best = Math.min(best, t);
    }
    return best === Infinity ? 0 : best;
  }

  // Orb web inside a frame (polygon) centered on hub: spokes, spiral and dew
  function makeWeb(frame, hub, seed, o = {}) {
    const r = rng(seed), n = o.n || 14, [hx, hy] = hub, rad = [], rot = r() * TAU;
    for (let j = 0; j < n; j++) {
      const a = rot + ((j + (r() - 0.5) * 0.5) / n) * TAU, dx = Math.cos(a), dy = Math.sin(a);
      rad.push({ dx, dy, L: rayHit(frame, hx, hy, dx, dy) * 0.995, rank: 0 });
    }
    // natural order: each new spoke covers the largest gap left
    const done = [0];
    for (let k = 1; k < n; k++) {
      let bj = 0, bd = -1;
      for (let j = 0; j < n; j++) {
        if (done.includes(j)) continue;
        let dm = n;
        for (const q of done) dm = Math.min(dm, Math.abs(j - q), n - Math.abs(j - q));
        const sc = dm + r() * 0.9;
        if (sc > bd) { bd = sc; bj = j; }
      }
      done.push(bj); rad[bj].rank = k;
    }
    // capture spiral, from outside in, with threads that sag a bit
    const turns = o.turns || 8, fo = 0.9, fi = 0.27, total = turns * n, sp = [], segs = [], dew = [];
    for (let s = 0; s <= total; s++) {
      const R = rad[s % n], f = fo - ((fo - fi) * s) / total + (r() - 0.5) * 0.018;
      sp.push([hx + R.dx * R.L * f, hy + R.dy * R.L * f]);
    }
    for (let s = 0; s < total; s++) {
      const [x0, y0] = sp[s], [x1, y1] = sp[s + 1], mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const q = [x0, y0, lerp(mx, hx, 0.06), lerp(my, hy, 0.06), x1, y1, r() > (o.broken ?? 0.05)];
      segs.push(q);
      if (q[6] && r() < (o.dew ?? 0.22)) {
        const x = 0.25 * x0 + 0.5 * q[2] + 0.25 * x1, y = 0.25 * y0 + 0.5 * q[3] + 0.25 * y1;
        dew.push({ x, y, s: s / total, z: 0.5 + r(), ph: r(), r: Math.hypot(x - hx, y - hy) });
      }
    }
    // center: tight spiral, separated from the capture spiral by a free zone
    const hubPts = [], hn = Math.round(n * 2.5);
    for (let s = 0; s <= hn; s++) { const R = rad[s % n], f = 0.16 - (0.12 * s) / hn; hubPts.push([hx + R.dx * R.L * f, hy + R.dy * R.L * f]); }
    const maxR = Math.max(1, ...rad.map(R => R.L));
    for (const d of dew) d.r /= maxR;
    return { frame, hx, hy, rad, segs, hub: hubPts, dew, n, total, maxR, fo, fi };
  }

  // Weaves the web with progress p (0..1): frame → spokes → center → spiral.
  // o = { lw, col, a, t, ph, dv (dew 0..1), sweep, scr (zone → screen), U (screen unit) }
  function weave(ctx, W, p, o) {
    if (p <= 0 || o.a <= 0.01) return;
    const pf = clamp(p / 0.12), pr = clamp((p - 0.08) / 0.36), ps = clamp((p - 0.42) / 0.58), tips = [];
    ctx.beginPath();
    if (pf > 0) { const tp = polyPart(ctx, W.frame, pf, true); if (pf < 1) tips.push(tp); }
    for (const R of W.rad) {
      const k = eOut((pr - (R.rank / W.n) * 0.7) / 0.3);
      if (k <= 0) continue;
      const ex = W.hx + R.dx * R.L * k, ey = W.hy + R.dy * R.L * k;
      ctx.moveTo(W.hx, W.hy); ctx.lineTo(ex, ey);
      if (k < 1) tips.push([ex, ey]);
    }
    if (pr > 0.65) polyPart(ctx, W.hub, (pr - 0.65) / 0.35, false);
    if (ps > 0) {
      const cnt = ps * W.total, full = Math.min(W.total, Math.floor(cnt));
      let pen = false;
      for (let s = 0; s < full; s++) {
        const q = W.segs[s];
        if (!q[6]) { pen = false; continue; }
        if (!pen) ctx.moveTo(q[0], q[1]);
        ctx.quadraticCurveTo(q[2], q[3], q[4], q[5]);
        pen = true;
      }
      if (full < W.total) {
        const q = W.segs[full], k = cnt - full, cx = lerp(q[0], q[2], k), cy = lerp(q[1], q[3], k);
        const ex = lerp(cx, lerp(q[2], q[4], k), k), ey = lerp(cy, lerp(q[3], q[5], k), k);
        if (!pen) ctx.moveTo(q[0], q[1]);
        ctx.quadraticCurveTo(cx, cy, ex, ey);
        tips.push([ex, ey]);
      }
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (o.halo !== false) { ctx.strokeStyle = rgba(o.col, 0.14 * o.a); ctx.lineWidth = o.lw * 2.6; ctx.stroke(); }
    ctx.strokeStyle = rgba(o.col, 0.62 * o.a); ctx.lineWidth = o.lw; ctx.stroke();
    // brightness traveling across the web from center outward: one turn of spiral (and its spokes) brighter
    const rr = ((o.t * 0.18 + o.ph) % 1.6) - 0.3, fr = lerp(W.fi, W.fo, rr);
    if (rr > 0 && rr < 1) {
      const a = o.a * Math.sqrt(Math.sin(Math.PI * rr)), built = ps * W.total, span = W.fo - W.fi;
      for (const [bw, al, lw] of [[0.032, 0.75, 1.35]]) {
        ctx.beginPath();
        if (pr >= 1) for (const R of W.rad) { ctx.moveTo(W.hx + R.dx * R.L * (fr - bw), W.hy + R.dy * R.L * (fr - bw)); ctx.lineTo(W.hx + R.dx * R.L * (fr + bw), W.hy + R.dy * R.L * (fr + bw)); }
        const s0 = Math.max(0, Math.floor(((W.fo - fr - bw) / span) * W.total)), s1 = Math.min(Math.floor(built), Math.ceil(((W.fo - fr + bw) / span) * W.total), W.total);
        let pen = false;
        for (let k = s0; k < s1; k++) {
          const q = W.segs[k];
          if (!q[6]) { pen = false; continue; }
          if (!pen) ctx.moveTo(q[0], q[1]);
          ctx.quadraticCurveTo(q[2], q[3], q[4], q[5]);
          pen = true;
        }
        ctx.strokeStyle = `rgba(255,255,255,${(a * al).toFixed(3)})`; ctx.lineWidth = o.lw * lw; ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'lighter';
    if (o.dv > 0 && ps > 0) {
      ctx.fillStyle = rgba(mix(o.col, [255, 255, 255], 0.6), 0.85 * o.a);
      ctx.beginPath();
      for (const d of W.dew) {
        if (d.s > ps) break;
        const r = o.lw * (0.55 + d.z * 0.9) * o.dv * smooth(d.s, d.s + 0.06, ps);
        ctx.moveTo(d.x + r, d.y); ctx.arc(d.x, d.y, r, 0, TAU);
      }
      ctx.fill();
      for (const d of W.dew) {
        if (d.s > ps) break;
        let gi = rr > 0 && rr < 1 ? Math.max(0, 1 - Math.abs(W.fo - (W.fo - W.fi) * d.s - fr) / 0.03) * 0.8 : 0;
        gi += Math.max(0, Math.sin(o.t * 1.7 + d.ph * 40)) ** 60 * 0.9;
        if (o.sweep != null) { const sx = o.scr ? o.scr(d.x, d.y)[0] : d.x; gi += Math.exp(-(((sx - o.sweep) / (55 * o.U)) ** 2)) * 1.3; }
        if (gi > 0.05) flare(ctx, d.x, d.y, o.lw * 20 * d.z * Math.min(1.4, gi), gi * o.a * o.dv);
      }
    }
    for (const [x, y] of tips) flare(ctx, x, y, o.lw * 24, o.a);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  // web tremor around its center
  function wobble(ctx, W, amt, t, ph) {
    if (amt < 0.01) return;
    ctx.translate(W.hx, W.hy);
    ctx.rotate(Math.sin(t * 38 + ph) * 0.014 * amt);
    const s = 1 + Math.sin(t * 31 + ph * 2) * 0.01 * amt;
    ctx.scale(s, s);
    ctx.translate(-W.hx, -W.hy);
  }

  function drawWebList(ctx, list, t, o, trem) {
    for (const it of list) {
      const p = clamp((t - it.t0) / it.dur);
      if (p <= 0) continue;
      ctx.save();
      wobble(ctx, it.web, trem, t, it.ph);
      o.ph = it.ph;
      weave(ctx, it.web, p, o);
      ctx.restore();
    }
  }

  // ---------- hanging baby spiders ----------
  const FALL = 0.5;
  const dropY = (L, tau) => (tau <= 0 ? 0 : tau < FALL ? L * (tau / FALL) ** 2 : L + L * 0.2 * Math.exp(-(tau - FALL) * 3.2) * Math.sin((tau - FALL) * 10.5));
  // free fall, thread jerk with bounce, swing and escape upward (with anticipation)
  function hangState(sp, t) {
    const tau = t - sp.t0;
    if (tau <= 0) return null;
    const L = sp.L + sp.s * 1.6, settle = smooth(FALL, FALL + 1.6, tau);
    let y = -sp.s * 1.6 + dropY(L, tau) + Math.sin(t * 1.4 + sp.ph) * sp.L * 0.03 * settle;
    const v = (dropY(L, tau) - dropY(L, tau - 0.03)) / 0.03, q = Math.max(0, tau - FALL);
    let tuck = 1 - smooth(FALL * 0.7, FALL + 0.2, tau);
    const spread = 1 + (tau > FALL ? 0.28 * Math.exp(-q * 4) * Math.sin(q * 13) : 0);
    let st = 1 + clamp(v / (L * 6), -0.22, 0.32), rot = Math.sin(t * 0.9 + sp.ph) * 0.12 * settle;
    if (sp.tf != null && t > sp.tf) {
      const k = (t - sp.tf) / 0.7;
      if (k >= 1) return null;
      y = lerp(y, -sp.s * 3, eInBack(k));
      tuck = Math.max(tuck, smooth(0, 0.35, k));
      st = 1 + 0.35 * smooth(0.35, 0.8, k) - 0.12 * pulse(k, 0, 0.35, 0.15);
      rot *= 1 - k;
    }
    return { y: sp.ay + y, tuck, spread, st, rot };
  }

  // Spider upside down; (x, st.y) = spinnerets (where the thread comes out)
  function hanger(ctx, x, ay, st, s, rim, eye, t, ph) {
    if (st.y > ay) {
      ctx.strokeStyle = rgba(mix(rim, [255, 255, 255], 0.5), 0.65);
      ctx.lineWidth = Math.max(1, s * 0.045);
      ctx.beginPath(); ctx.moveTo(x, ay); ctx.lineTo(x, st.y); ctx.stroke();
    }
    ctx.save();
    ctx.translate(x, st.y); ctx.rotate(st.rot); ctx.scale(1 / Math.sqrt(st.st), st.st); ctx.translate(0, s * 0.72);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let sd = -1; sd <= 1; sd += 2) for (let k = 0; k < 4; k++) {
      const tw = Math.sin(t * (2.2 + k * 0.4) + k * 1.7 + sd + ph) * 0.08;
      const b = lerp([0.42, 1.05, 1.78, 2.4][k] * st.spread + tw, 2.75 + k * 0.1, st.tuck);
      const R = s * [1.05, 0.95, 0.9, 1.0][k], hx = sd * s * 0.12, hy = s * (0.3 - k * 0.07);
      const dx = sd * Math.sin(b), dy = Math.cos(b);
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + dx * R * 0.5 + sd * R * 0.26, hy + dy * R * 0.5 - R * 0.16);
      ctx.lineTo(hx + dx * R, hy + dy * R);
    }
    ctx.strokeStyle = rgba(rim, 0.9); ctx.lineWidth = s * 0.14; ctx.stroke();
    ctx.strokeStyle = DARK; ctx.lineWidth = s * 0.075; ctx.stroke();
    ctx.fillStyle = rgba(rim, 0.9);
    oval(ctx, 0, -s * 0.32, s * 0.34, s * 0.42); oval(ctx, 0, s * 0.27, s * 0.235, s * 0.255);
    ctx.fillStyle = DARK;
    oval(ctx, 0, -s * 0.32, s * 0.3, s * 0.38); oval(ctx, 0, s * 0.27, s * 0.2, s * 0.22);
    ctx.fillStyle = 'rgba(150,130,210,0.3)';
    oval(ctx, -s * 0.1, -s * 0.45, s * 0.08, s * 0.13);
    const ey = s * 0.4;
    halo(ctx, 0, ey, s * 0.35, eye, 0.55);
    ctx.fillStyle = rgba(mix(eye, [255, 255, 255], 0.5));
    oval(ctx, -s * 0.075, ey, s * 0.045, s * 0.045); oval(ctx, s * 0.075, ey, s * 0.045, s * 0.045);
    ctx.restore();
  }

  // ---------- giant spider ----------
  // Legs in u units, in the body frame (x forward, y toward side s)
  const LEGS = [];
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    const af = [0.5, 1.12, 1.9, 2.52][k], R = [212, 180, 168, 202][k], ah = [0.55, 1.05, 1.6, 2.15][k];
    const fx = Math.cos(af) * R, fy = s * Math.sin(af) * R * 0.7, hx = Math.cos(ah) * 30, hy = s * Math.sin(ah) * 25;
    const D = Math.hypot(fx - hx, fy - hy);
    // alternating tripods: L1 R2 L3 R4 vs R1 L2 R3 L4, with a slight wave offset
    LEGS.push({ s, k, fx, fy, hx, hy, L1: D * 0.6, L2: D * 0.66, off: ((k + (s > 0 ? 1 : 0)) % 2) * 0.5 + k * 0.035, i: LEGS.length });
  }
  const EYES = [[31, -6, 4.6], [31, 6, 4.6], [25, -15, 3.2], [25, 15, 3.2], [21, -6, 3], [21, 6, 3], [17, -17, 2.4], [17, 17, 2.4]];

  // House geometry in screen px (recalculated if the mapping changes)
  let geoKey = '', geo = null;
  function house(S) {
    const zs = S.screenZones;
    let key = '';
    for (const s of zs) key += `${s.kind}${s.x0 | 0},${s.y0 | 0},${s.x1 | 0},${s.y1 | 0};`;
    if (geo && key === geoKey) return geo;
    let X0 = 1e9, X1 = -1e9, Y0 = 1e9, Y1 = -1e9, wy0 = 1e9, wy1 = -1e9, roof = null;
    for (const s of zs) {
      X0 = Math.min(X0, s.x0); X1 = Math.max(X1, s.x1); Y0 = Math.min(Y0, s.y0); Y1 = Math.max(Y1, s.y1);
      if (s.kind === 'wall') { wy0 = Math.min(wy0, s.y0); wy1 = Math.max(wy1, s.y1); }
      if (s.kind === 'roof' && (!roof || s.x1 - s.x0 > roof.x1 - roof.x0)) roof = s;
    }
    if (X0 > X1) { X0 = 0; X1 = 1; Y0 = 0; Y1 = 1; }
    if (wy0 > wy1) { wy0 = Y0; wy1 = Y1; }
    const u = Math.max(0.25, (wy1 - wy0) / 300), xp = roof ? roof.cx : (X0 + X1) / 2;
    const g = { X0, X1, Y0, Y1, wy0, wy1, u, xp, yc: lerp(wy0, wy1, 0.47), st: 62 * u, xs: X0 - 270 * u, mx: xp, my: Y0 - (Y1 - Y0) * 0.35, mr: (X1 - X0) * 0.85 };
    // wall under the gable: where it turns upward and rises
    let cw = null;
    for (const s of zs) if (s.kind === 'wall' && s.x0 < xp && s.x1 > xp && (!cw || s.y0 < cw.y0)) cw = s;
    g.yv = cw ? lerp(cw.y0, cw.y1, 0.3) : lerp(wy0, wy1, 0.3);
    if (cw) g.xp = lerp(xp, cw.cx, 0.6);
    // burst movement; stops land where all legs are planted
    const snap = d => (Math.round(d / g.st - 0.355) + 0.355) * g.st;
    const d0 = 0.355 * g.st, da = snap(lerp(X0, xp, 0.2) - g.xs), db = snap(lerp(X0, xp, 0.6) - g.xs), dp = snap(g.xp - 20 * u - g.xs);
    g.dp = dp; g.dv = dp + 2 * g.st; g.P0 = walkAt(g, dp);
    const top = roof ? roof.y0 : Y0;
    g.keys = [[11.4, d0], [12.75, da], [13.15, da], [14.25, db], [14.55, db], [CUES.arrive, dp], [CUES.turn, g.dv], [CUES.leave, g.dv], [CUES.gone, g.dv + g.yv - top + 60 * u]];
    // gable: the big web is drawn on the global layer (in screen px, undistorted)
    if (roof) {
      const F = zoneFrame({ id: roof.id, w: 1, h: 1 }, S);
      const apex = F.scr(0.5, 0), bl = roof.pts[3], br = roof.pts[2];
      const la = Math.hypot(br[0] - bl[0], br[1] - bl[1]), lb = Math.hypot(apex[0] - br[0], apex[1] - br[1]), lc = Math.hypot(apex[0] - bl[0], apex[1] - bl[1]);
      const per = la + lb + lc, ix = (la * apex[0] + lb * bl[0] + lc * br[0]) / per, iy = (la * apex[1] + lb * bl[1] + lc * br[1]) / per;
      const area = Math.abs((bl[0] - apex[0]) * (br[1] - apex[1]) - (br[0] - apex[0]) * (bl[1] - apex[1])) / 2;
      const f = clamp((7 * u) / (area / (per / 2)), 0, 0.5), ins = p => [lerp(p[0], ix, f), lerp(p[1], iy, f)];
      const tri = [ins(bl), ins(apex), ins(br)];
      // the top third is the dark vent (no reflection): the web's center drops
      const bm = [(bl[0] + br[0]) / 2, (bl[1] + br[1]) / 2], cen = [(tri[0][0] + tri[1][0] + tri[2][0]) / 3, (tri[0][1] + tri[1][1] + tri[2][1]) / 3];
      const hub = [lerp(cen[0], bm[0], 0.25), lerp(cen[1], bm[1], 0.25)];
      const web = makeWeb(tri, hub, 911, { n: 22, turns: 12, dew: 0.18 });
      const vent = lerp(apex[1], bm[1], 0.4);
      g.gable = { web, apex: tri[1], hub, tri0: [bl, apex, br], vent, owner: { x: hub[0], ay: vent, L: hub[1] - vent - 14 * u, s: 17 * u, t0: 6.6, tf: 10.55, ph: 1.7 } };
      // gable point: sx lateral (-1..1 from the base), h height (0 base → 1 apex)
      g.gpt = (sx, h) => { const sd = sx > 0 ? br : bl, a = Math.abs(sx) * (1 - h); return [bm[0] + (sd[0] - bm[0]) * a + (apex[0] - bm[0]) * h, bm[1] + (sd[1] - bm[1]) * a + (apex[1] - bm[1]) * h]; };
    }
    g.burst = giantAt(g, CUES.swarm).tip;
    geoKey = key; geo = g;
    return g;
  }

  const walkAt = (g, d) => { const k = d / (150 * g.u); return [g.xs + d, g.yc + Math.sin(k) * 9 * g.u, Math.atan(Math.cos(k) * 0.06)]; };
  // path: crosses to the right, turns in place (stepping) upward and climbs the gable
  const bodyAt = (g, d) => {
    if (d <= g.dp) return walkAt(g, d);
    const P = g.P0;
    if (d < g.dv) { const e = sine((d - g.dp) / (g.dv - g.dp)); return [lerp(P[0], g.xp, e), lerp(P[1], g.yv, e), lerp(P[2], -Math.PI / 2, e)]; }
    return [g.xp, g.yv - (d - g.dv), -Math.PI / 2];
  };
  // where the L leg's foot lands on step m (mid-stance it sits at its rest position)
  function plantAt(g, L, m) {
    const [x, y, hd] = bodyAt(g, (m - L.off + SW + (1 - SW) / 2) * g.st), c = Math.cos(hd), s = Math.sin(hd);
    return [x + (L.fx * c - L.fy * s) * g.u, y + (L.fx * s + L.fy * c) * g.u];
  }
  function trackD(g, t) {
    const K = g.keys;
    if (t <= K[0][0]) return K[0][1];
    for (let i = 1; i < K.length; i++) {
      if (t > K[i][0]) continue;
      const [t0, d0] = K[i - 1], [t1, d1] = K[i], k = (t - t0) / (t1 - t0);
      return lerp(d0, d1, i === K.length - 1 ? k ** 1.7 : eInOut(k));
    }
    return K[K.length - 1][1];
  }
  // crouches (anticipation), rises with a bounce, threatens and lowers again
  function rearAt(t) {
    if (t < 16.12 || t > 18.6) return 0;
    if (t < 16.4) return -0.3 * sine((t - 16.12) / 0.28);
    if (t < 16.85) return lerp(-0.3, 1, eOutBack((t - 16.4) / 0.45));
    if (t < 18.1) return 1 + Math.sin((t - 16.85) * 4.5) * 0.05;
    return lerp(1 + Math.sin(1.25 * 4.5) * 0.05, 0, eInOut((t - 18.1) / 0.5));
  }
  // knee via two-bone inverse kinematics, always pointing outward (ox, oy)
  function kneeIK(hx, hy, px, py, L1, L2, ox, oy) {
    const dx = px - hx, dy = py - hy, D = clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
    const a = Math.atan2(dy, dx), b = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
    const k1x = hx + Math.cos(a + b) * L1, k1y = hy + Math.sin(a + b) * L1, k2x = hx + Math.cos(a - b) * L1, k2y = hy + Math.sin(a - b) * L1;
    return (k1x - hx) * ox + (k1y - hy) * oy > (k2x - hx) * ox + (k2y - hy) * oy ? [k1x, k1y] : [k2x, k2y];
  }

  function giantAt(g, t) {
    const u = g.u, d = trackD(g, t), rr = rearAt(t), up = Math.max(0, rr);
    const speed = Math.abs(trackD(g, t + 0.05) - d) / (0.05 * 200 * u), idle = 1 - clamp(speed * 3);
    let [bx, by, hd] = bodyAt(g, d);
    const c = Math.cos(hd), s = Math.sin(hd), nx = -s, ny = c, gp = (d / g.st) * TAU;
    // sways with the step; pulls back (anticipation) and stretches forward when rising
    const fw = (22 * up + 30 * Math.min(0, rr)) * u;
    bx += nx * Math.sin(gp) * 2.5 * u + c * fw;
    by += ny * Math.sin(gp) * 2.5 * u + s * fw;
    const sc = 1 + 0.3 * up, hb = (24 + 30 * rr) * u + Math.abs(Math.sin(gp)) * 2 * u;
    // probing: stretches the front legs and taps the wall twice, unsure
    const reach = pulse(t, 10.45, 11.45, 0.28);
    const tapAt = o => Math.max(Math.exp(-(((t - 10.68 - o) / 0.045) ** 2)), 0.8 * Math.exp(-(((t - 11.0 - o) / 0.045) ** 2)));
    const legs = LEGS.map(L => {
      const ph = d / g.st + L.off, n = Math.floor(ph), f = ph - n;
      let [px, py] = plantAt(g, L, n), lift = 0;
      if (f < SW) {
        const e = sine(f / SW), q = plantAt(g, L, n - 1);
        px = lerp(q[0], px, e); py = lerp(q[1], py, e); lift = Math.sin(Math.PI * e) * 24 * u;
      }
      // impatient taps while it's stopped
      const tap = idle * Math.max(0, Math.sin(t * 7 + L.i * 2.4)) ** 10;
      lift += tap * 14 * u; px += c * tap * 6 * u; py += s * tap * 6 * u;
      if (L.k === 0) { // probes the wall before entering
        const p = reach * (L.s > 0 ? 0.85 : 1), o = L.s > 0 ? 0.07 : 0;
        px += (c * 150 - s * L.s * 20) * u * p; py += (s * 150 + c * L.s * 20) * u * p;
        lift += p * 22 * u * (1 - tapAt(o));
      }
      if (rr > 0 && L.k < 2) { // threat: front legs up, spread over the gable, waving
        const a = Math.min(1.1, rr) * (L.k ? 0.85 : 1), wv = 12 * u;
        let tx, ty;
        if (g.gpt) [tx, ty] = L.k ? g.gpt(L.s * 0.86, 0.1) : g.gpt(L.s * 0.6, 0.34);
        else { tx = px + (60 * c - L.s * 55 * s) * u; ty = py + (60 * s + L.s * 55 * c) * u; }
        tx += Math.sin(t * 6.5 + L.s * 1.3 + L.k) * wv; ty += Math.cos(t * 5.2 + L.s + L.k * 2) * wv;
        px = lerp(px, tx, a); py = lerp(py, ty, a); lift += 90 * u * a;
      }
      const hx = bx + (L.hx * c - L.hy * s) * u * sc, hy = by + (L.hx * s + L.hy * c) * u * sc;
      const [kx, ky] = kneeIK(hx, hy, px, py, L.L1 * u * sc, L.L2 * u * sc, nx * L.s, ny * L.s);
      // ankle: slight inward curve (three-segment leg)
      const fl = Math.hypot(px - kx, py - ky);
      const ax = kx + (px - kx) * 0.62 - nx * L.s * fl * 0.05, ay = ky + (py - ky) * 0.62 - ny * L.s * fl * 0.05;
      return { hx, hy, kx, ky, ax, ay, px, py, lift, s: L.s };
    });
    const tl = -150 * u * sc;
    return { d, bx, by, hd, sc, hb, rr, up, legs, idle, gp, tip: [bx + c * tl, by + s * tl] };
  }

  let shCan = null, shCtx = null;
  function giantShadow(ctx, W, H, g, G, lit) {
    if (lit < 0.02) return;
    const u = g.u, cw = Math.ceil(W / SHK) + 2, ch = Math.ceil(H / SHK) + 2;
    if (!shCan) { shCan = document.createElement('canvas'); shCtx = shCan.getContext('2d'); }
    if (shCan.width !== cw || shCan.height !== ch) { shCan.width = cw; shCan.height = ch; }
    const c = shCtx, P = (x, y, z) => [x + LD[0] * z, y + LD[1] * z], kh = G.hb + 30 * u;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cw, ch);
    c.setTransform(1 / SHK, 0, 0, 1 / SHK, 0, 0);
    c.strokeStyle = c.fillStyle = '#000'; c.lineCap = 'round'; c.lineJoin = 'round';
    const pts = G.legs.map(L => [P(L.hx, L.hy, G.hb), P(L.kx, L.ky, kh + L.lift * 0.5), P(L.ax, L.ay, 9 * u + L.lift * 0.8), P(L.px, L.py, L.lift)]);
    for (const [w, i] of [[16, 0], [12, 1], [6, 2]]) {
      c.lineWidth = w * u * G.sc;
      c.beginPath();
      for (const q of pts) { c.moveTo(q[i][0], q[i][1]); c.lineTo(q[i + 1][0], q[i + 1][1]); }
      c.stroke();
    }
    const [sx, sy] = P(G.bx, G.by, G.hb);
    c.save(); c.translate(sx, sy); c.rotate(G.hd); c.scale(G.sc * u, G.sc * u);
    oval(c, 0, 0, 41, 35); oval(c, -84, 0, 67, 54); oval(c, -30, 0, 11, 9);
    c.restore();
    // wide penumbra: the giant blocks the moon
    const R = 330 * u * G.sc, cx = sx - 30 * u;
    const gr = ctx.createRadialGradient(cx, sy, 0, cx, sy, R);
    gr.addColorStop(0, `rgba(0,0,0,${Math.min(0.8, 0.5 * lit).toFixed(3)})`); gr.addColorStop(0.5, `rgba(0,0,0,${Math.min(0.5, 0.28 * lit).toFixed(3)})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(cx - R, sy - R, R * 2, R * 2);
    // crisp shadow (rescaled: soft edges)
    const x0 = clamp(Math.floor((G.bx - R) / SHK), 0, cw), x1 = clamp(Math.ceil((G.bx + R) / SHK), 0, cw);
    const y0 = clamp(Math.floor((G.by - R) / SHK), 0, ch), y1 = clamp(Math.ceil((G.by + R) / SHK), 0, ch);
    if (x1 > x0 && y1 > y0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, 0.85 * lit);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(shCan, x0, y0, x1 - x0, y1 - y0, x0 * SHK, y0 * SHK, (x1 - x0) * SHK, (y1 - y0) * SHK);
      ctx.restore();
    }
  }

  // tapered segment: trapezoid from (x0, y0) with half-width w0 to (x1, y1) with w1 (always the same orientation)
  function taper(ctx, x0, y0, x1, y1, w0, w1) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
    ctx.moveTo(x0 + nx * w0, y0 + ny * w0); ctx.lineTo(x1 + nx * w1, y1 + ny * w1);
    ctx.lineTo(x1 - nx * w1, y1 - ny * w1); ctx.lineTo(x0 - nx * w0, y0 - ny * w0); ctx.closePath();
  }
  // tapered legs (thick femur → pointed tarsus) with rounded joints
  function giantLegs(ctx, G, k, col, ex, ox, oy) {
    ctx.fillStyle = col;
    ctx.beginPath();
    for (const L of G.legs) {
      taper(ctx, L.hx + ox, L.hy + oy, L.kx + ox, L.ky + oy, 9 * k + ex, 7 * k + ex);
      taper(ctx, L.kx + ox, L.ky + oy, L.ax + ox, L.ay + oy, 6.5 * k + ex, 4.5 * k + ex);
      taper(ctx, L.ax + ox, L.ay + oy, L.px + ox, L.py + oy, 4 * k + ex, 0.8 * k + ex);
    }
    ctx.fill();
    ctx.beginPath();
    for (const L of G.legs) {
      ctx.moveTo(L.kx + ox + 8 * k + ex, L.ky + oy); ctx.arc(L.kx + ox, L.ky + oy, 8 * k + ex, 0, TAU);
      ctx.moveTo(L.ax + ox + 5 * k + ex, L.ay + oy); ctx.arc(L.ax + ox, L.ay + oy, 5 * k + ex, 0, TAU);
    }
    ctx.fill();
  }

  function giantBody(ctx, g, G, t) {
    const u = g.u, { bx, by, hd, sc, up } = G, k = u * sc;
    // legs: moonlit edge only at upper-left (offset), black on top, highlights and spines
    // hairs: hairy tarantula silhouette
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const L of G.legs) {
      for (const [x0, y0, x1, y1, n] of [[L.hx, L.hy, L.kx, L.ky, 6], [L.kx, L.ky, L.ax, L.ay, 5], [L.ax, L.ay, L.px, L.py, 3]]) {
        const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
        const o = nx * (x0 - bx) + ny * (y0 - by) > 0 ? 1 : -1;
        for (let i = 1; i <= n; i++) {
          const f = i / (n + 1), x = x0 + dx * f, y = y0 + dy * f;
          const hl = (14 + 6 * ((i * 7 + L.s) % 3 === 0)) * k * (1 - f * 0.4), w = 7 * k;
          ctx.moveTo(x, y); ctx.lineTo(x + (nx * o * 0.85 + (dx / l) * 0.5) * hl, y + (ny * o * 0.85 + (dy / l) * 0.5) * hl);
          ctx.moveTo(x, y); ctx.lineTo(x - (nx * o * 0.85 - (dx / l) * 0.5) * w, y - (ny * o * 0.85 - (dy / l) * 0.5) * w);
        }
      }
    }
    ctx.strokeStyle = 'rgba(175,165,250,0.32)'; ctx.lineWidth = 3.6 * u; ctx.stroke();
    ctx.strokeStyle = DARK; ctx.lineWidth = 2 * u; ctx.stroke();
    giantLegs(ctx, G, k, rgba([190, 180, 255], 0.75), 0.5 * u, -2 * u, -2.3 * u);
    giantLegs(ctx, G, k, DARK, 0, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineWidth = 2 * u; ctx.strokeStyle = 'rgba(150,130,225,0.32)';
    ctx.beginPath();
    for (const L of G.legs) { ctx.moveTo(L.hx - 2.5 * u, L.hy - 3.5 * u); ctx.lineTo(L.kx - 2.5 * u, L.ky - 3.5 * u); ctx.moveTo(L.kx - 1.8 * u, L.ky - 2.4 * u); ctx.lineTo(L.ax - 1.8 * u, L.ay - 2.4 * u); }
    ctx.stroke();

    ctx.save();
    ctx.translate(bx, by); ctx.rotate(hd); ctx.scale(k, k);
    const c = Math.cos(hd), s = Math.sin(hd), rox = (-2.2 * c - 2.5 * s) / sc, roy = (2.2 * s - 2.5 * c) / sc;
    // abdomen: pivots at the waist and trails the movement a little
    const bs = 1 + Math.sin(t * 2.6) * 0.02 + 0.05 * up;
    ctx.save();
    ctx.translate(-30, 0); ctx.rotate(Math.sin(G.gp - 0.8) * 0.04); ctx.translate(-54, 0);
    ctx.fillStyle = rgba(RIM, 0.95); oval(ctx, rox, roy, 64 * bs + 0.5, 51 * bs + 0.5);
    const ga = ctx.createRadialGradient(-20, -22, 3, 0, 0, 68);
    ga.addColorStop(0, '#2c2140'); ga.addColorStop(0.35, '#120c1c'); ga.addColorStop(0.8, '#070409'); ga.addColorStop(1, '#030103');
    ctx.fillStyle = ga; oval(ctx, 0, 0, 64 * bs, 51 * bs);
    // abdomen hair: serrated edge
    ctx.strokeStyle = DARK; ctx.lineWidth = 2.2; ctx.beginPath();
    for (let i = 0; i < 26; i++) { const a = (i / 26) * TAU, r0 = 0.94, r1 = 1.07 + 0.05 * ((i * 5) % 3); ctx.moveTo(Math.cos(a) * 64 * bs * r0, Math.sin(a) * 51 * bs * r0); ctx.lineTo(Math.cos(a + 0.05) * 64 * bs * r1, Math.sin(a + 0.05) * 51 * bs * r1); }
    ctx.stroke();
    // bone-colored skull on the back (the top faces the head); when roaring its eye sockets blaze
    ctx.save();
    ctx.translate(4, 0); ctx.rotate(Math.PI / 2); ctx.scale(bs * 0.9, bs * 0.9);
    const bone = 0.66 + 0.34 * up, fire = clamp(0.15 + up);
    ctx.globalCompositeOperation = 'lighter';
    halo(ctx, 0, 0, 44, [255, 235, 200], 0.12 + 0.18 * up);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = rgba([238, 230, 212], bone);
    ctx.beginPath(); ctx.ellipse(0, -7, 23, 21, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-14, 6); ctx.lineTo(14, 6); ctx.lineTo(11, 25); ctx.quadraticCurveTo(0, 29, -11, 25); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#0a0508';
    oval(ctx, -9, -4, 7.5, 8.5, 0.25); oval(ctx, 9, -4, 7.5, 8.5, -0.25);
    ctx.beginPath(); ctx.moveTo(0, 5); ctx.lineTo(-3.5, 12); ctx.lineTo(3.5, 12); ctx.closePath(); ctx.fill();
    ctx.fillRect(-10, 17, 20, 2.4);
    for (const x of [-6, -2, 2, 6]) ctx.fillRect(x - 0.9, 15, 1.8, 10);
    ctx.globalCompositeOperation = 'lighter';
    for (const x of [-9, 9]) { halo(ctx, x, -3, 9, [255, 60, 20], 0.8 * fire); halo(ctx, x, -2, 3.5, [255, 200, 110], 0.7 * fire); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();
    ctx.fillStyle = 'rgba(230,220,255,0.16)'; oval(ctx, -26, -30, 8, 3.5, -0.4);
    ctx.restore();
    // waist
    ctx.fillStyle = DARK; oval(ctx, -30, 0, 10, 8);
    // pedipalps: move on their own (secondary action)
    ctx.lineCap = 'round';
    for (const [col, lw, o] of [[rgba(RIM, 0.9), 5.6, 1], [DARK, 5, 0]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath();
      for (const sd of [-1, 1]) {
        const tw = Math.sin(t * 8.3 + sd * 1.9) * (0.15 + 0.2 * G.idle) + up * 0.5;
        const mx = 28 + Math.cos(0.55 * sd + tw * sd) * 18, my = sd * 16 + Math.sin(0.55 * sd + tw * sd) * 18;
        const ex = mx + Math.cos(-0.35 * sd - tw * sd * 1.4) * 14, ey = my + Math.sin(-0.35 * sd - tw * sd * 1.4) * 14;
        ctx.moveTo(28 + rox * o, sd * 16 + roy * o); ctx.lineTo(mx + rox * o, my + roy * o); ctx.lineTo(ex + rox * o, ey + roy * o);
      }
      ctx.stroke();
    }
    // cephalothorax
    ctx.fillStyle = rgba(RIM, 0.95); oval(ctx, rox, roy, 39.5, 33.5);
    const gc = ctx.createRadialGradient(-8, -12, 2, 0, 0, 40);
    gc.addColorStop(0, '#2c2240'); gc.addColorStop(0.4, '#120c1a'); gc.addColorStop(1, '#040205');
    ctx.fillStyle = gc; oval(ctx, 0, 0, 39, 33);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = Math.PI * 0.62 + (i / 5) * Math.PI * 0.76; ctx.moveTo(-6, 0); ctx.lineTo(-6 + Math.cos(a) * 26, Math.sin(a) * 22); }
    ctx.moveTo(-14, 0); ctx.lineTo(4, 0);
    ctx.stroke();
    // chelicerae and fangs (open when roaring)
    for (const sd of [-1, 1]) {
      ctx.fillStyle = rgba(RIM, 0.9); oval(ctx, 37 + rox, sd * 8 + roy, 9.3, 7);
      ctx.fillStyle = '#0b0710'; oval(ctx, 37, sd * 8, 9, 6.8);
      const op = clamp(up);
      ctx.strokeStyle = '#120a18'; ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.moveTo(43, sd * 9); ctx.quadraticCurveTo(53 + 2 * op, sd * (11 + 8 * op), 50 + 4 * op, sd * (3 + 13 * op)); ctx.stroke();
      ctx.strokeStyle = rgba([230, 215, 255], 0.55 + 0.35 * op); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(44, sd * 8.2); ctx.quadraticCurveTo(52.5 + 2 * op, sd * (10.2 + 8 * op), 49.6 + 4 * op, sd * (3.6 + 13 * op)); ctx.stroke();
    }
    // eyes: always glow and light up when threatening
    const ef = clamp(0.55 + 0.45 * up + 0.08 * Math.sin(t * 5));
    ctx.globalCompositeOperation = 'lighter';
    halo(ctx, 26, 0, 20 + 14 * up, [255, 35, 20], 0.3 * ef + 0.2 * up);
    ctx.globalCompositeOperation = 'source-over';
    for (const [x, y, r] of EYES) {
      const ge = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      ge.addColorStop(0, rgba([255, 235, 210], ef)); ge.addColorStop(0.45, rgba([255, 45, 30], 0.95)); ge.addColorStop(1, '#3a0004');
      ctx.fillStyle = ge; oval(ctx, x, y, r, r);
    }
    ctx.restore();
  }

  // roar shockwave and egg sac that swells and bursts
  function giantFx(ctx, g, G, t) {
    const u = g.u;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const kr = (t - CUES.roar) / 1.1;
    if (kr > 0 && kr < 1) {
      const R = eOut(kr) * 1100 * u, a = (1 - kr) ** 2;
      for (const [lw, al] of [[34, 0.12], [10, 0.4]]) {
        ctx.strokeStyle = rgba([255, 120, 90], al * a); ctx.lineWidth = lw * u * (1 - 0.6 * kr);
        ctx.beginPath(); ctx.arc(G.bx, G.by, R, 0, TAU); ctx.stroke();
      }
    }
    const [sx, sy] = G.tip, ks = (t - CUES.sac) / (CUES.swarm - CUES.sac);
    if (ks > 0 && ks < 1) {
      const r = 19 * u * eOutBack(ks) * (1 + 0.06 * Math.sin(t * 40)), rot = G.hd;
      halo(ctx, sx, sy, r * 3.2, [255, 230, 180], 0.55 * clamp(ks * 2));
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = rgba([255, 244, 220], 0.95); oval(ctx, sx, sy, r * 1.15, r, rot);
      ctx.fillStyle = 'rgba(120,90,70,0.5)';
      for (let i = 0; i < 7; i++) { const a = i * 2.4, q = 0.55 * (i % 3 ? 1 : 0.4); oval(ctx, sx + Math.cos(a) * r * q, sy + Math.sin(a) * r * q, r * 0.17, r * 0.17); }
      ctx.globalCompositeOperation = 'lighter';
    }
    const kb = (t - CUES.swarm) / 0.5;
    if (kb > 0 && kb < 1) {
      halo(ctx, sx, sy, 90 * u, [255, 250, 235], 0.9 * (1 - kb) ** 2);
      ctx.strokeStyle = rgba([255, 255, 255], 0.85 * (1 - kb)); ctx.lineWidth = 7 * u * (1 - kb) + 1;
      ctx.beginPath(); ctx.arc(sx, sy, eOut(kb) * 240 * u, 0, TAU); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- swarm of babies ----------
  function walker(ctx, x, y, s, ang, ph) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.beginPath();
    for (let side = -1; side <= 1; side += 2) for (let k = 0; k < 4; k++) {
      const a = [0.55, 1.2, 1.9, 2.5][k] + Math.sin(ph * TAU + ((k + (side > 0 ? 1 : 0)) % 2) * Math.PI) * 0.24;
      const ca = Math.cos(a), sa = Math.sin(a);
      ctx.moveTo(ca * s * 0.15, side * sa * s * 0.15);
      ctx.lineTo(ca * s * 0.75, side * (sa * s * 0.75 + s * 0.22));
      ctx.lineTo(ca * s * 1.35, side * sa * s * 1.05);
    }
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba(RIM, 0.85); ctx.lineWidth = s * 0.26; ctx.stroke();
    ctx.strokeStyle = DARK; ctx.lineWidth = s * 0.13; ctx.stroke();
    ctx.fillStyle = rgba(RIM, 0.85); oval(ctx, -s * 0.55, 0, s * 0.52, s * 0.4); oval(ctx, s * 0.12, 0, s * 0.34, s * 0.3);
    ctx.fillStyle = DARK; oval(ctx, -s * 0.55, 0, s * 0.45, s * 0.33); oval(ctx, s * 0.12, 0, s * 0.28, s * 0.24);
    ctx.fillStyle = '#ff4030'; oval(ctx, s * 0.31, -s * 0.08, s * 0.065, s * 0.065); oval(ctx, s * 0.31, s * 0.08, s * 0.065, s * 0.065);
    ctx.restore();
  }

  function drawSwarm(ctx, g, t) {
    const tau0 = t - CUES.swarm;
    if (tau0 < 0 || tau0 > 4.5) return;
    const u = g.u, r = rng(4242), [bx, by] = g.burst;
    for (let i = 0; i < 40; i++) {
      const a0 = (i / 40) * TAU + (r() - 0.5) * 0.5, v = (170 + r() * 230) * u, dl = r() * 0.6, s = (14 + r() * 8) * u;
      const ph = r() * TAU, cv = (r() - 0.5) * 1.6, st0 = (12 + r() * 40) * u, tau = tau0 - dl;
      if (tau <= 0) continue;
      let dx = Math.cos(a0), dy = Math.sin(a0) * 0.6;
      if (dy > 0) dy *= 0.35;   // they hatch at the foot of the wall: almost all climb or spread to the sides
      const dn = Math.hypot(dx, dy); dx /= dn; dy /= dn;
      const dist = st0 + v * (tau - 0.25 * (1 - Math.exp(-tau / 0.25)));
      const bend = (cv * dist * dist) / (900 * u), wig = Math.sin(dist / (10 * u) + ph) * 2.5 * u;
      const x = bx + dx * dist - dy * (bend + wig), y = by + dy * dist + dx * (bend + wig);
      if (x < g.X0 - 30 * u || x > g.X1 + 30 * u || y < g.Y0 - 30 * u || y > g.Y1 + 30 * u) continue;
      walker(ctx, x, y, s, Math.atan2(dy, dx) + Math.atan((2 * cv * dist) / (900 * u)), dist / (14 * u));
    }
  }

  // ---------- fixed data for each zone ----------
  function holes(S, F) {
    const out = [];
    for (const s of S.screenZones) {
      if ((s.kind !== 'window' && s.kind !== 'door') || s.cx < F.sz.x0 || s.cx > F.sz.x1 || s.cy < F.sz.y0 || s.cy > F.sz.y1) continue;
      const q = s.pts.map(([x, y]) => F.zone(x, y)), xs = q.map(p => p[0]), ys = q.map(p => p[1]);
      out.push([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
    }
    return out;
  }

  function wallSetup(z, S, F, g) {
    return cached(z, 'set', () => {
      const { w, h } = z, m = Math.min(w, h), u = g.u * (F.kx + F.ky) / 2, wins = holes(S, F);
      const rel = clamp((F.sz.cx - g.X0) / Math.max(1, g.X1 - g.X0)), webs = [];
      let sd = z.seed * 31 + 11;
      // webs in the upper corners, without touching the windows
      const corner = (right, size, t0) => {
        const ins = 3 * u, cx = right ? w - ins : ins, cy = ins, sx = right ? -1 : 1;
        let a = size * 1.3, b = size;
        for (const r of wins) {
          const q = Math.max(0, ((right ? r[2] : r[0]) - cx) * sx) / a + Math.max(0, r[1] - cy) / b;
          if (q < 1.1) { a *= q / 1.1; b *= q / 1.1; }
        }
        if (b < 25 * u) return;
        const ex = cx + sx * a, ey = cy + b, mx = (ex + cx) / 2, my = (cy + ey) / 2;
        const frame = [[cx, cy], [ex, cy], [lerp(mx, cx, 0.1), lerp(my, cy, 0.1)], [cx, ey]];
        webs.push({ web: makeWeb(frame, [cx + sx * a * 0.32, cy + b * 0.32], sd++, { n: 13, turns: 8 }), t0, dur: 6, ph: hash(sd) * 5 });
      };
      const size = Math.min(h * 0.52, w * 0.27);
      corner(false, size, 1.0 + rel * 1.4);
      corner(true, size * 0.92, 1.6 + rel * 1.4);
      // baby spiders that drop where no window blocks them
      const spiders = [];
      for (const fx of [0.17, 0.83, 0.5, 0.33, 0.67]) {
        const x = fx * w;
        let L = h * (0.48 + 0.16 * hash(sd + fx * 10));
        if (rel < 0.2) L = Math.min(L, h * 0.4);   // left wing: keep it from falling onto the balcony railing
        for (const r of wins) if (x > r[0] - m * 0.08 && x < r[2] + m * 0.08 && r[1] > 0) L = Math.min(L, r[1] - 22 * u);
        if (L < h * 0.25) continue;
        const j = spiders.length;
        spiders.push({ x, ay: 0, L, s: 19 * u * (0.85 + 0.3 * hash(sd + j)), t0: 5.3 + rel * 2.6 + j * 0.55, tf: 10.35 + rel * 0.35 + j * 0.12, ph: hash(sd + j * 3) * TAU });
        if (spiders.length >= 3) break;
      }
      return { webs, spiders, u, rel };
    });
  }

  function windowSetup(z, S, F, g) {
    return cached(z, 'set', () => {
      const { w, h } = z, m = Math.min(w, h), u = g.u * (F.kx + F.ky) / 2, rel = clamp((F.sz.cx - g.X0) / Math.max(1, g.X1 - g.X0));
      const right = z.index % 2 === 1, sd = z.seed * 17 + 5, ins = 2.5 * u, cx = right ? w - ins : ins, sx = right ? -1 : 1;
      const a = w * 0.52, b = h * 0.78, ex = cx + sx * a, ey = ins + b, mx = (ex + cx) / 2, my = (ins + ey) / 2;
      const front = makeWeb([[cx, ins], [ex, ins], [lerp(mx, cx, 0.08), lerp(my, ins, 0.08)], [cx, ey]], [cx + sx * a * 0.3, ins + b * 0.3], sd, { n: 12, turns: 4, dew: 0.08 });
      const back = makeWeb(rectFrame(w * 0.06, h * 0.08, w * 0.94, h * 0.95, 0.06), [w * (right ? 0.36 : 0.64), h * 0.44], sd + 1, { n: 12, turns: 6, broken: 0.12, dew: 0.1 });
      return {
        u, rel,
        front: [{ web: front, t0: 2.2 + rel * 1.2, dur: 5.5, ph: 1.3 }],
        back: [{ web: back, t0: 1.5 + rel, dur: 6.5, ph: 2.1 }],
        spider: { x: w * (0.3 + 0.4 * hash(sd)), ay: 0, L: h * (0.4 + 0.12 * hash(sd + 2)), s: m * 0.24, t0: 4.9 + rel * 2.6, tf: 10.4 + rel * 0.3, ph: hash(sd) * TAU },
        border: [[ins, ins], [w - ins, ins], [w - ins, h - ins], [ins, h - ins]],
      };
    });
  }

  function doorSetup(z, S, F, g) {
    return cached(z, 'set', () => {
      const { w, h } = z, m = Math.min(w, h), u = g.u * (F.kx + F.ky) / 2, i = 3 * u;
      const web = makeWeb(rectFrame(i, i, w - i, h - i, 0.05), [w * 0.5, h * 0.4], z.seed * 7 + 3, { n: 15, turns: 11, dew: 0.25 });
      return { u, webs: [{ web, t0: 1.6, dur: 7, ph: 0.4 }], spider: { x: w * 0.5, ay: 0, L: h * 0.36, s: m * 0.4, t0: CUES.door, tf: 24.5, ph: 0.6 } };
    });
  }

  // ---------- per-frame state ----------
  let envT = -1, env = null;
  function envAt(S) {
    const g = house(S), t = S.t;
    if (env && t === envT && env.g === g) return env;
    envT = t;
    env = { t, g, lv: moonAt(t), pool: poolAt(g, t), G: t > 9.9 && t < 21.8 ? giantAt(g, t) : null, sweep: sweepAt(g, t), shk: shakeAt(t), trem: trembleAt(t), fade: 1 - smooth(23.8, 25.4, t) };
    return env;
  }
  // how much a zone is affected when the giant passes nearby (0..1)
  const nearGiant = (E, F) => (E.G ? Math.exp(-(((F.sz.cx - E.G.bx) / (300 * E.g.u)) ** 2)) : 0);

  // ---------- zones ----------
  function drawMoonWall(ctx, z, F, g, E) {
    const { w, h } = z, lv = E.lv, P = E.pool;
    ctx.fillStyle = '#010205'; ctx.fillRect(-60, -60, w + 120, h + 120);
    if (lv > 0.005) {
      const mx = (g.mx - F.sz.x0) * F.kx, my = (g.my - F.sz.y0) * F.ky, R = g.mr * F.kx;
      const gr = ctx.createRadialGradient(mx, my, 0, mx, my, R);
      gr.addColorStop(0, rgba([150, 180, 255], lv)); gr.addColorStop(0.4, rgba([90, 115, 200], lv * 0.8));
      gr.addColorStop(1, rgba([12, 16, 40], lv * 0.1));
      ctx.fillStyle = gr; ctx.fillRect(-60, -60, w + 120, h + 120);
    }
    if (P) {
      ctx.save(); ctx.scale(F.kx, F.ky); ctx.translate(-F.sz.x0, -F.sz.y0);
      poolFill(ctx, P.x, P.y, P.r, P.a, F.sz.x0 - 40, F.sz.y0 - 40, F.sz.x1 - F.sz.x0 + 80, F.sz.y1 - F.sz.y0 + 80);
      ctx.restore();
    }
    // the foot of the wall, darker
    const v = ctx.createLinearGradient(0, 0, 0, h);
    v.addColorStop(0.55, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = v; ctx.fillRect(-60, -60, w + 120, h + 120);
  }

  function drawWall(ctx, z, S, E, F) {
    const t = S.t, g = E.g, set = wallSetup(z, S, F, g), u = set.u, prox = nearGiant(E, F);
    drawMoonWall(ctx, z, F, g, E);
    const o = { lw: 1.5 * u, col: COLD, a: E.fade, t, dv: smooth(4.5, 9, t), sweep: E.sweep, scr: F.scr, U: g.u };
    drawWebList(ctx, set.webs, t, o, E.trem + prox * 0.9);
    for (const sp of set.spiders) {
      const st = hangState(sp, t);
      if (st) hanger(ctx, sp.x, sp.ay, st, sp.s, RIM, [255, 45, 30], t, sp.ph);
    }
  }

  function drawRoof(ctx, z, E) {
    // the gable only sets the background light: its web and the spotlight go in the global layer (undistorted)
    const { w, h } = z, lv = E.lv;
    ctx.fillStyle = '#010205'; ctx.fillRect(-60, -60, w + 120, h + 120);
    if (lv > 0.005) vGradient(ctx, w, h, [[0, rgba([150, 180, 255], lv)], [1, rgba([90, 115, 200], lv * 0.8)]]);
  }

  function drawWindow(ctx, z, S, E, F) {
    const t = S.t, g = E.g, { w, h } = z, m = Math.min(w, h), set = windowSetup(z, S, F, g), u = set.u, prox = nearGiant(E, F);
    // dark room with a candle at the back: warm inside, cold outside
    ctx.fillStyle = '#030104'; ctx.fillRect(-60, -60, w + 120, h + 120);
    const fl = flicker(t, z.seed) * smooth(0.3, 3, t) * (1 - 0.75 * prox) * (0.55 + 0.45 * E.fade);
    const par = Math.sin(t * 0.37 + z.seed) * m * 0.04;   // parallax: distant things slide more
    const lx = w * 0.5 + par, ly = h * 1.05, R = Math.max(w, h) * 0.95;
    const gr = ctx.createRadialGradient(lx, ly, 0, lx, ly, R);
    gr.addColorStop(0, rgba([255, 175, 85], 0.8 * fl)); gr.addColorStop(0.35, rgba([190, 80, 30], 0.45 * fl)); gr.addColorStop(1, 'rgba(25,6,14,0)');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
    const o = { lw: 1.2 * u, col: WARM, a: 0.3 * E.fade, t, dv: smooth(5, 9, t) * 0.7, sweep: null, scr: F.scr, U: g.u, halo: false };
    ctx.save(); ctx.translate(par, 0);
    drawWebList(ctx, set.back, t, o, E.trem * 0.6 + prox * 0.6);
    ctx.restore();
    const st = hangState(set.spider, t);
    if (st) {
      ctx.save(); ctx.translate(par * 0.5, 0);
      hanger(ctx, set.spider.x, set.spider.ay, st, set.spider.s, RIM_WARM, [255, 70, 30], t, set.spider.ph);
      ctx.restore();
    }
    // front web: open and without halo, so it doesn't burn into a white triangle
    Object.assign(o, { lw: 1.5 * u, a: E.fade, dv: smooth(5, 9, t) * 0.5, sweep: E.sweep, halo: false });
    drawWebList(ctx, set.front, t, o, E.trem + prox);
    // a silk thread runs along the window frame (accents the architecture)
    const tp = smooth(0.3, 2.4, t - set.rel * 0.5), ta = (0.3 + 0.7 * (1 - smooth(2.4, 4.5, t))) * E.fade;
    if (tp > 0) {
      ctx.lineCap = ctx.lineJoin = 'round';
      let tip = null;
      for (const [lw, al] of [[5, 0.15], [1.6, 0.85]]) {
        ctx.strokeStyle = rgba(WARM, al * ta); ctx.lineWidth = lw * u;
        ctx.beginPath(); tip = polyPart(ctx, set.border, tp, true); ctx.stroke();
      }
      if (tp < 1) { ctx.globalCompositeOperation = 'lighter'; flare(ctx, tip[0], tip[1], 40 * u, 1); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    }
  }

  function drawDoor(ctx, z, S, E, F) {
    // red door: only high, clear light, which reads even when tinted red
    const t = S.t, { w, h } = z, set = doorSetup(z, S, F, E.g), u = set.u, prox = nearGiant(E, F);
    ctx.fillStyle = '#000'; ctx.fillRect(-60, -60, w + 120, h + 120);
    const sp = set.spider, lit = pulse(t, CUES.door - 0.4, 25.2, 0.8);
    halo(ctx, w * 0.5, h * 0.42, Math.max(w, h) * 0.7, [255, 225, 190], 0.1 + 0.06 * Math.sin(t * 1.3));
    // strong backlight behind the door spider: black silhouette against white light
    if (lit > 0.01) {
      const st0 = hangState(sp, t), cy = st0 ? st0.y + sp.s * 0.7 : h * 0.4;
      halo(ctx, w * 0.5, cy, Math.max(w, h) * 0.55, [255, 248, 235], 0.85 * lit * (0.92 + 0.08 * flicker(t, 7)));
    }
    const o = { lw: 1.9 * u, col: PURE, a: E.fade, t, dv: smooth(5, 9, t), sweep: E.sweep, scr: F.scr, U: E.g.u };
    drawWebList(ctx, set.webs, t, o, E.trem + prox);
    const st = hangState(sp, t);
    if (st) hanger(ctx, sp.x, sp.ay, st, sp.s, PURE, [255, 235, 90], t, sp.ph);
  }

  // ---------- global layer ----------
  function drawGable(ctx, g, E, t) {
    const gb = g.gable, u = g.u;
    const o = { lw: 1.6 * u, col: COLD, a: E.fade, t, dv: smooth(5, 9, t), sweep: E.sweep, scr: null, U: u, ph: 0.9 };
    const p = clamp((t - 0.6) / 8);
    ctx.save();
    wobble(ctx, gb.web, E.trem + (E.G ? Math.exp(-(((gb.hub[0] - E.G.bx) / (260 * u)) ** 2)) * 0.8 : 0), t, 0.9);
    weave(ctx, gb.web, p, o);
    ctx.restore();
    const st = hangState(gb.owner, t);
    if (st) hanger(ctx, gb.owner.x, gb.owner.ay, st, gb.owner.s, RIM, [255, 45, 30], t, gb.owner.ph);
    // ending: the mother returns to the center of her web; only her eight eyes are visible (against the light facade,
    // not the dark vent, which doesn't reflect). They open from the inside out, blink and go off
    const op = pulse(t, CUES.eyes, 25.6, 0.35);
    if (op > 0.01) {
      const ex = gb.hub[0], ey = gb.hub[1] - 4 * u, e = 7 * u, look = Math.sin((t - CUES.eyes) * 1.6) * 0.8 * e;
      const blink = 1 - pulse(t, 24.72, 24.95, 0.08), hc = eOut((t - CUES.eyes + 0.2) / 0.6) * op;
      // the mother: head and legs cut out in black against the lit web, with a moon edge
      if (hc > 0.01) {
        ctx.lineCap = ctx.lineJoin = 'round';
        ctx.beginPath();
        // upside down, like garden spiders: front legs down, back legs up
        const hy0 = ey - 0.8 * e, sp = 0.55 + 0.45 * hc;
        for (const sd of [-1, 1]) for (let k = 0; k < 4; k++) {
          const a0 = [0.75, 0.3, -0.2, -0.65][k], R = [12, 10.5, 9.5, 10.5][k] * e * sp, hx = ex + sd * 4.5 * e, hy = hy0 + (1.5 - k) * 1.2 * e;
          const kx = hx + sd * Math.cos(a0 - 0.55) * R * 0.55, ky = hy + Math.sin(a0 - 0.55) * R * 0.55;
          ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.lineTo(hx + sd * Math.cos(a0) * R, hy + Math.sin(a0) * R);
        }
        ctx.strokeStyle = rgba(RIM, 0.3 * hc); ctx.lineWidth = 1.5 * e + 2.5 * u; ctx.stroke();
        ctx.strokeStyle = DARK; ctx.lineWidth = 1.5 * e; ctx.stroke();
        ctx.fillStyle = rgba(RIM, 0.35 * hc); oval(ctx, ex, hy0, 7 * e + 2 * u, 5 * e + 2 * u); oval(ctx, ex, hy0 - 9 * e, 6 * e * hc + 2 * u, 6.8 * e * hc + 2 * u);
        ctx.fillStyle = DARK; oval(ctx, ex, hy0, 7 * e, 5 * e); oval(ctx, ex, hy0 - 9 * e, 6 * e * hc, 6.8 * e * hc);
      }
      ctx.globalCompositeOperation = 'lighter';
      halo(ctx, ex, ey, 80 * u, [255, 25, 10], 0.3 * op);
      halo(ctx, ex, ey, 22 * u, [255, 60, 30], 0.25 * op);
      const P = [[-2.2, 0, 1.25], [2.2, 0, 1.25], [-5.6, -0.7, 0.9], [5.6, -0.7, 0.9], [-1.6, 2.6, 0.8], [1.6, 2.6, 0.8], [-4.4, 2.9, 0.7], [4.4, 2.9, 0.7]];
      ctx.globalCompositeOperation = 'source-over';
      P.forEach(([dx, dy, r], i) => {
        const k = eOutBack((t - CUES.eyes - (i >> 1) * 0.12) / 0.35) * blink * op;
        if (k <= 0.01) return;
        const x = ex + dx * e * 0.8, y = ey + dy * e * 0.8, rr = r * e * 0.72;
        ctx.fillStyle = '#2a0003'; oval(ctx, x, y, rr * 1.15, rr * 1.15 * k);
        const ge = ctx.createRadialGradient(x - rr * 0.3, y - rr * 0.3, 0, x, y, rr);
        ge.addColorStop(0, rgba([255, 235, 200], op)); ge.addColorStop(0.4, rgba([255, 60, 30], op)); ge.addColorStop(1, rgba([120, 0, 5], op));
        ctx.fillStyle = ge; oval(ctx, x, y, rr, rr * k);
        ctx.fillStyle = rgba([255, 255, 255], 0.9 * op); oval(ctx, x + look * 0.25 - rr * 0.3, y - rr * 0.35 * k, rr * 0.22, rr * 0.22 * k);
      });
    }
  }

  return {
    name: 'Spiders',
    duration: DUR,
    ambience: 0.6,
    cues: CUES,
    update(S) {
      const g = house(S), pan = x => clamp(((x - g.X0) / Math.max(1, g.X1 - g.X0)) * 2 - 1, -1, 1) * 0.8;
      if (S.crossed(CUES.moon)) { play('rumble', { dur: 2.2, vel: 0.45 }); play('toll', { vel: 0.45 }); }
      if (S.crossed(10.1)) play('monsterBreath', { phase: 'in', vel: 0.5, pan: -0.8 });
      for (const tp of [10.68, 11.0]) if (S.crossed(tp)) play('knock', { count: 1, vel: 0.35, pan: -0.85 });
      // bursts of steps: scurrying that travels with her and a deep rumble
      const K = g.keys;
      for (let i = 1; i < K.length; i++) {
        const [t0, d0] = K[i - 1], [t1, d1] = K[i];
        if (d1 === d0 || !S.crossed(t0)) continue;
        const x0 = bodyAt(g, d0)[0], x1 = bodyAt(g, d1)[0];
        play('skitter', { dur: t1 - t0, count: 3, vel: 0.6, pan: [pan(x0), pan(x1)] });
        if (t0 < CUES.leave) play('rumble', { dur: 1.1, vel: 0.28, pan: pan(x1) });
      }
      // footsteps: each planted leg sounds, panned to its foot; the one that opens each tripod (k 0) hits hard,
      // the other three follow behind like a muffled drumroll
      if (S.t > K[0][0] && S.t < CUES.gone) {
        const da = trackD(g, S.prevT), db = trackD(g, S.t), fade = 1 - smooth(19.6, 21, S.t);   // fades as she climbs away
        let n = 0, sx = 0, heavy = false;
        if (db > da && fade > 0.05) for (const L of LEGS) for (let m = Math.floor(da / g.st + L.off - SW) + 1; m <= Math.floor(db / g.st + L.off - SW); m++) { n++; sx += plantAt(g, L, m)[0]; heavy ||= L.k === 0; }
        if (n) play('impactHit', heavy
          ? { vel: 0.42 * fade, pitch: 1.05 + Math.random() * 0.1, dur: 0.45, metal: 0, braam: 0, wet: 0.25, pan: pan(sx / n) }
          : { vel: 0.14 * fade * Math.min(2, n), pitch: 1.5 + Math.random() * 0.2, dur: 0.25, metal: 0, braam: 0, wet: 0.2, pan: pan(sx / n) });
      }
      // lowers the front legs after threatening
      if (S.crossed(18.5)) play('impactHit', { vel: 0.4, pitch: 1.1, dur: 0.5, metal: 0, braam: 0.25, pan: pan(g.xp) });
      if (S.crossed(CUES.roar - 0.1)) { play('roar', { vel: 1, dur: 2.4 }); play('impactHit', { vel: 0.6, pitch: 0.6 }); }
      if (S.crossed(CUES.sac)) play('slime', { vel: 0.5, dur: 0.4 });
      if (S.crossed(CUES.swarm)) {
        // the babies fan out from the sac: scurrying that spreads to both sides
        const b = pan(g.burst[0]);
        play('pop', { vel: 0.9, pitch: 0.55, pan: b });
        play('skitter', { dur: 2.4, count: 3, vel: 0.55, pan: [b, -0.85] });
        play('skitter', { dur: 2.6, count: 3, vel: 0.55, pan: [b, 0.85] });
        play('skitter', { dur: 1.6, count: 2, vel: 0.4, pan: [b, b * 0.5] });
      }
      if (S.crossed(CUES.eyes)) play('heartbeat', { vel: 0.7 });
    },
    draw(ctx, z, S) {
      const E = envAt(S), F = zoneFrame(z, S);
      if (!F) return;
      if (E.shk > 0.01) { const k = E.shk * 4 * E.g.u * (F.kx + F.ky) / 2; ctx.translate(Math.sin(S.t * 53 + z.seed) * k, Math.cos(S.t * 47 + z.seed) * k); }
      if (z.kind === 'window') drawWindow(ctx, z, S, E, F);
      else if (z.kind === 'door') drawDoor(ctx, z, S, E, F);
      else if (z.kind === 'roof') drawRoof(ctx, z, E);
      else drawWall(ctx, z, S, E, F);
    },
    drawGlobal(ctx, W, H, S) {
      const E = envAt(S), g = E.g, t = S.t;
      if (E.shk > 0.01) ctx.translate(Math.sin(t * 53) * E.shk * 4 * g.u, Math.cos(t * 47) * E.shk * 4 * g.u);
      if (g.gable && E.pool) {
        // the spotlight also lights the gable (clipped to its triangle)
        const P = E.pool, tri = g.gable.tri0;
        ctx.save();
        ctx.beginPath(); ctx.moveTo(tri[0][0], tri[0][1]); ctx.lineTo(tri[1][0], tri[1][1]); ctx.lineTo(tri[2][0], tri[2][1]); ctx.closePath(); ctx.clip();
        poolFill(ctx, P.x, P.y, P.r, P.a, g.X0, g.Y0, g.X1 - g.X0, g.Y1 - g.Y0);
        ctx.restore();
      }
      if (g.gable) drawGable(ctx, g, E, t);
      const G = E.G, u = g.u, ga = 1 - smooth(20.3, 21.2, t);   // vanishes into the vent
      if (G) {
        // the shadow comes first: before she enters, a huge leg shadow sweeps the left wing
        const pre = 1 - smooth(11.2, 12.6, t);
        ctx.save();
        if (pre > 0.01) { const k = 1 + 0.4 * pre; ctx.translate(G.bx + 220 * u * pre, G.by); ctx.scale(k, k); ctx.translate(-G.bx, -G.by); }
        giantShadow(ctx, W, H, g, G, (E.pool ? clamp(E.pool.a / 0.5) : 0) * ga * smooth(9.9, 10.5, t) * (1 + 0.35 * pre));
        ctx.restore();
        // red glow under the body when roaring
        if (G.up > 0.01) {
          ctx.globalCompositeOperation = 'lighter';
          halo(ctx, G.bx, G.by + 20 * u, 270 * u, [255, 35, 12], 0.5 * clamp(G.up) * (0.85 + 0.15 * Math.sin(t * 9)));
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      drawSwarm(ctx, g, t);
      if (G) {
        ctx.globalAlpha = ga;
        giantBody(ctx, g, G, t);
        ctx.globalAlpha = 1;
        giantFx(ctx, g, G, t);
      }
    }
  };
})());
