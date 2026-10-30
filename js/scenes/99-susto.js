// Scare on demand (J key): the whole house turns into a face that screams.
// Large windows = burning almond eyes (fixed to the real window), door = skull nose,
// lower band of the walls = wide jagged mouth, gable = furrowed brow.
// 0–0.06 white flash; 0.10 face appears and the jaw snaps open; 0.30 a red negative;
// 0.35–1.5 sustained scream; 1.5–2.0 fades out; the eyes narrow, flash and slam shut.
registerJumpscare((() => {
  const DUR = 2.6;
  let layoutKey = '', L = null, lastT = -1, fired = false, ember = null;

  // ---- face geometry from the zones on screen ----
  const area = sz => (sz.x1 - sz.x0) * (sz.y1 - sz.y0);
  const box = sz => ({ x0: sz.x0, y0: sz.y0, x1: sz.x1, y1: sz.y1, cx: (sz.x0 + sz.x1) / 2, cy: (sz.y0 + sz.y1) / 2, w: sz.x1 - sz.x0, h: sz.y1 - sz.y0, pts: sz.pts });
  const inBox = (b, x, y) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
  // angle designed for the right eye (0 = outward); the left one is its mirror
  const ang = (dir, a) => dir > 0 ? Math.PI - a : a;
  const mkCanvas = (w, h) => typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });

  // branched vein from (x,y) toward angle a
  function crack(r, x, y, a, len, segs, out, depth, delay) {
    const pts = [[x, y]];
    for (let i = 0; i < segs; i++) {
      a += (r() - 0.5) * 0.8;
      x += Math.cos(a) * len / segs; y += Math.sin(a) * len / segs;
      pts.push([x, y]);
      if (depth > 0 && i > 2 && r() < 0.16) crack(r, x, y, a + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5), len * 0.45, Math.max(3, segs >> 1), out, depth - 1, delay + i / segs * 0.25);
    }
    out.push({ pts, delay, w: depth + 1 });
  }

  function layout(W, H, zones) {
    const key = W + 'x' + H + ':' + zones.map(z => z.pts.map(p => p[0].toFixed(0) + ',' + p[1].toFixed(0)).join(';')).join('|');
    if (key === layoutKey) return L;
    layoutKey = key;
    let X0 = W, Y0 = H, X1 = 0, Y1 = 0;
    for (const z of zones) { X0 = Math.min(X0, z.x0); Y0 = Math.min(Y0, z.y0); X1 = Math.max(X1, z.x1); Y1 = Math.max(Y1, z.y1); }
    if (!zones.length) { X0 = 0; Y0 = 0; X1 = W; Y1 = H; }
    const HW = X1 - X0, HH = Y1 - Y0;
    // eyes: the two largest windows, from left to right
    const wins = zones.filter(z => z.kind === 'window').sort((a, b) => area(b) - area(a));
    let eyes = wins.slice(0, 2).map(box).sort((a, b) => a.cx - b.cx);
    const fake = (cx, cy) => { const w = HW * 0.1, h = HH * 0.16; return { x0: cx - w / 2, y0: cy - h / 2, x1: cx + w / 2, y1: cy + h / 2, cx, cy, w, h, pts: [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]] }; };
    if (eyes.length < 2) eyes = [fake(X0 + HW * 0.3, Y0 + HH * 0.4), fake(X0 + HW * 0.7, Y0 + HH * 0.4)];
    const others = wins.slice(2).map(box);
    const doors = zones.filter(z => z.kind === 'door').sort((a, b) => area(b) - area(a));
    const door = doors.length ? box(doors[0]) : null;
    const roofs = zones.filter(z => z.kind === 'roof').sort((a, b) => area(b) - area(a));
    const roof = roofs.length ? box(roofs[0]) : null;
    const walls = zones.filter(z => z.kind === 'wall');
    // wall containing each eye (for eyebrows and the base of the mouth)
    const ew = eyes.map(e => {
      const w = walls.filter(z => inBox(z, e.cx, e.cy)).sort((a, b) => area(a) - area(b))[0];
      return w ? box(w) : { x0: e.x0 - e.w * 0.5, x1: e.x1 + e.w * 0.5, y0: e.y0 - e.h * 0.6, y1: Math.max(Y1, e.y1 + e.h) };
    });
    const d = eyes[1].cx - eyes[0].cx, eyeBot = Math.max(eyes[0].y1, eyes[1].y1);
    // mouth: wide smile under the two eyes, from outer edge to outer edge; upper lip below the line
    // of the eyes and jaw 5% above the base of the walls (the bushes cover the lower part)
    const mx = (eyes[0].x0 + eyes[1].x1) / 2, mrx = (eyes[1].x1 - eyes[0].x0) / 2 * 0.95;
    const top = eyeBot + d * 0.03;
    const bot = Math.max(top + d * 0.14, Math.min(ew[0].y1, ew[1].y1) - HH * 0.05);
    const my = top + (bot - top) * 0.32, mup = my - top, mdn = bot - my;
    // unmapped gap between the two walls (the entrance): the teeth start with their tips on its edges
    let gL = mx, gR = mx;
    if (ew[0].x1 < ew[1].x0 && ew[0].x1 > mx - mrx && ew[1].x0 < mx + mrx) { gL = ew[0].x1; gR = ew[1].x0; }
    // eyebrows: they don't go past the top edge of their wall
    const brows = eyes.map((e, i) => {
      const th = clamp(Math.min(e.h * 0.4, e.y0 - ew[i].y0 - 6), e.h * 0.12, e.h * 0.4);
      return { dir: i ? -1 : 1, top: Math.max(ew[i].y0 + 4, e.y0 - th) };
    });
    // veins: few and thick, from the outer side of the eyes and the corners of the mouth
    const r = rng(9137), veins = [];
    eyes.forEach((e, i) => {
      const dir = i ? -1 : 1;
      for (const a0 of [-1.15, -0.35, 0.3]) {
        const a = ang(dir, a0 + (r() - 0.5) * 0.25);
        crack(r, e.cx + Math.cos(a) * e.w * 0.55, e.cy + Math.sin(a) * e.h * 0.6, a, d * (0.3 + r() * 0.15), 9, veins, 1, 0.12 + r() * 0.1);
      }
    });
    for (const dir of [1, -1]) for (const a0 of [-0.3, 0.35]) {
      const a = ang(dir, a0 + (r() - 0.5) * 0.2);
      crack(r, mx - dir * mrx * 1.08, my, a, d * (0.24 + r() * 0.12), 8, veins, 1, 0.1 + r() * 0.08);
    }
    // embers: two bursts (jaw slam and peak of the scream)
    const embers = Array.from({ length: 12 }, (_, i) => ({
      burst: i < 6 ? 0.12 : 0.6, del: r() * 0.06, u: (r() - 0.5) * 1.5, vx: (r() - 0.5) * 0.8, rise: 0.4 + r() * 0.6, life: 0.55 + r() * 0.3, sz: 0.8 + r() * 0.5 }));
    const inMouth = o => o.x1 > mx - mrx && o.x0 < mx + mrx && o.y1 > top && o.y0 < bot;
    const othersIn = others.filter(inMouth), othersOut = others.filter(o => !inMouth(o));
    const sx = X0 - HW * 0.06, sy = Y0 - HH * 0.06, sw = HW * 1.12, sh = HH * 1.12;
    L = { sx, sy, sw, sh, X0, Y0, X1, Y1, HW, HH, eyes, ew, brows, othersIn, othersOut, door, roof, d, eyeBot,
      mx, my, mrx, mup, mdn, top, bot, gL, gR, tw: d * 0.07, veins, embers };
    return L;
  }

  // ---- cached skin: red gradient, sunken cheeks, brow wrinkles on the gable ----
  function skinCanvas(l, pr) {
    if (l.skin && l.pr === pr) return l.skin;
    l.pr = pr;
    const cv = mkCanvas(Math.ceil(l.sw * pr), Math.ceil(l.sh * pr)), c = cv.getContext('2d');
    c.scale(pr, pr);
    c.translate(-l.sx, -l.sy);
    const fy = (l.eyes[0].cy + l.my) / 2;
    c.fillStyle = radial(c, l.mx, fy, 0, Math.max(l.HW, l.HH) * 0.72, [
      [0, 'rgb(210,38,6)'], [0.3, 'rgb(150,8,0)'], [0.7, 'rgb(70,0,4)'], [1, 'rgb(20,0,5)']]);
    c.fillRect(l.sx, l.sy, l.sw, l.sh);
    // sunken cheeks below and outside each eye
    l.eyes.forEach((e, i) => {
      const dir = i ? -1 : 1, x = e.cx - dir * e.w * 0.85, y = e.y1 + e.h * 0.35, R = e.w * 0.75;
      c.fillStyle = radial(c, x, y, 0, R, [[0, 'rgba(0,0,0,0.7)'], [0.6, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]);
      c.fillRect(x - R, y - R, R * 2, R * 2);
      // cheekbone: warm highlight above the hollow
      const hx = e.cx - dir * e.w * 0.95, hy = e.cy - e.h * 0.1, hr = e.w * 0.45;
      c.fillStyle = radial(c, hx, hy, 0, hr, [[0, 'rgba(255,90,20,0.35)'], [1, 'rgba(255,90,20,0)']]);
      c.fillRect(hx - hr, hy - hr, hr * 2, hr * 2);
    });
    // gable: brow. Heat from below and 4 wrinkles converging toward the vertex grid
    const g = l.roof;
    if (g) {
      c.fillStyle = radial(c, g.cx, g.y1, 0, g.w * 0.55, [[0, 'rgba(255,60,10,0.45)'], [1, 'rgba(255,60,10,0)']]);
      c.fillRect(g.x0, g.y0, g.w, g.h);
      const ax = g.cx, ay = g.y0 + g.h * 0.2;
      c.lineCap = 'round';
      for (let i = 0; i < 4; i++) {
        const k = i - 1.5, xs = g.cx + k * g.w * 0.2, ys = g.y1 - g.h * 0.04;
        const xe = ax + k * g.w * 0.03, ye = ay + g.h * 0.14 + Math.abs(k) * g.h * 0.08;
        const cx = lerp(xs, xe, 0.5) - k * g.w * 0.015, cy = lerp(ys, ye, 0.5);
        const path = (oy) => { c.beginPath(); c.moveTo(xs, ys + oy); c.quadraticCurveTo(cx, cy + oy, xe, ye + oy); };
        path(0); c.strokeStyle = 'rgba(0,0,0,0.85)'; c.lineWidth = l.d * 0.03; c.stroke();
        path(l.d * 0.016); c.strokeStyle = 'rgba(255,120,30,0.9)'; c.lineWidth = l.d * 0.01; c.stroke();
        path(l.d * 0.016); c.strokeStyle = 'rgba(255,60,0,0.3)'; c.lineWidth = l.d * 0.03; c.stroke();
      }
    }
    l.skin = cv;
    return cv;
  }

  // ---- mouth: contour sampled in x (upper lip left to right, lower lip back) ----
  const env = u => Math.pow(Math.max(0, 1 - Math.pow(Math.abs(u), 2.4)), 0.55);
  // tooth profile with the tip on each edge of the gap; off shifts it half a tooth (lower row)
  function tooth(l, x, off) {
    const dd = x <= l.gL ? l.gL - x : x >= l.gR ? x - l.gR : 0, q = dd / l.tw + 0.5 + off;
    const ph = q % 1, idx = Math.floor(q);
    return { tip: 1 - Math.abs(2 * ph - 1), idx };
  }
  function mouthPath(ctx, l, m, grow, teeth) {
    const N = 150, rx = m.rx * grow;
    const yU = u => m.cy - m.up * grow * env(u) + m.up * 0.3 * u * u * env(u);
    const yL = u => m.cy + m.dn * grow * env(u) * (1 - 0.15 * u * u);
    ctx.beginPath();
    for (let i = 0; i <= N; i++) {
      const u = -1 + 2 * i / N, x = m.cx + u * rx;
      let y = yU(u);
      if (teeth) {
        const gap = yL(u) - y, t = tooth(l, x, 0), fang = t.idx === 1 ? 1.45 : 1;
        y += Math.min(gap * 0.62, Math.min(gap * 0.42, l.tw * 1.1) * fang) * t.tip * smooth(0, 0.4, env(u));
      }
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    for (let i = N; i >= 0; i--) {
      const u = -1 + 2 * i / N, x = m.cx + u * rx;
      let y = yL(u);
      if (teeth) {
        const gap = y - yU(u), t = tooth(l, x, 0.5);
        y -= Math.min(gap * 0.3, l.tw * 0.8) * t.tip * smooth(0, 0.4, env(u));
      }
      ctx.lineTo(x, y);
    }
    ctx.closePath();
  }

  function mouthDims(l, t, open) {
    const tremble = 1 + 0.04 * Math.sin(t * 61) * smooth(0.3, 0.5, t) * (1 - smooth(1.4, 1.8, t));
    return { cx: l.mx, cy: l.my, rx: l.mrx * (0.88 + 0.12 * open), up: l.mup * (0.6 + 0.4 * open), dn: l.mdn * (0.12 + 0.88 * open) * tremble };
  }

  function drawMouth(ctx, l, t, open, heat, rim) {
    const m = mouthDims(l, t, open);
    ctx.save();
    // dark halo of the lips
    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    mouthPath(ctx, l, m, 1.14);
    ctx.fill();
    // lit lip
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = rgba([255, 50, 0], 0.35 * rim);
    ctx.lineWidth = l.d * 0.04;
    mouthPath(ctx, l, m, 1.1);
    ctx.stroke();
    ctx.strokeStyle = rgba([255, 120, 30], 0.9 * rim);
    ctx.lineWidth = l.d * 0.014;
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    // teeth (bone) = solid contour; the jagged hole on top
    const dim = c => rgba([c[0] * rim, c[1] * rim, c[2] * rim]);
    const bg = ctx.createLinearGradient(0, m.cy - m.up, 0, m.cy + m.dn);
    bg.addColorStop(0, dim([255, 250, 230])); bg.addColorStop(0.5, dim([255, 215, 160])); bg.addColorStop(1, dim([255, 245, 220]));
    ctx.fillStyle = bg;
    mouthPath(ctx, l, m, 1);
    ctx.fill();
    // throat: fire stretched across the width of the mouth
    mouthPath(ctx, l, m, 1, true);
    ctx.save();
    ctx.clip();
    ctx.fillStyle = '#0a0000';
    ctx.fillRect(m.cx - m.rx, m.cy - m.up, m.rx * 2, m.up + m.dn);
    ctx.save();
    ctx.translate(m.cx, m.cy + m.dn * 0.3);
    ctx.scale(1, Math.max(0.05, (m.up + m.dn) * 1.3 / m.rx));
    ctx.fillStyle = radial(ctx, 0, 0, 0, m.rx, [
      [0, rgba([255 * heat, 240 * heat, 170 * heat])], [0.3, rgba([255 * heat, 120 * heat, 10 * heat])],
      [0.65, dim([150, 10, 0])], [1, '#140000']]);
    ctx.fillRect(-m.rx, -m.rx, m.rx * 2, m.rx * 2);
    ctx.restore();
    // windows inside the mouth: the hottest part of the throat
    ctx.globalCompositeOperation = 'lighter';
    for (const o of l.othersIn) {
      glow(ctx, o.cx, o.cy + o.h * 0.1, Math.max(o.w, o.h) * 0.8, [255, 120, 20], 0.9 * heat);
      glow(ctx, o.cx, o.cy + o.h * 0.1, Math.max(o.w, o.h) * 0.35, [255, 240, 180], 0.8 * heat);
    }
    ctx.restore();
    // tooth separation
    ctx.strokeStyle = 'rgba(60,0,0,0.9)';
    ctx.lineWidth = Math.max(2, l.d * 0.006);
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.restore();
  }

  // ---- eyes: burning almond inside the window, fixed to the real window ----
  function eyePath(ctx, e, dir, oT, oB) {
    const hw = e.w * 0.45, ox = e.cx - dir * hw, oy = e.cy - e.h * 0.08, ix = e.cx + dir * hw, iy = e.cy + e.h * 0.12;
    const cx = (ox + ix) / 2, cy = (oy + iy) / 2;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.quadraticCurveTo(cx - dir * hw * 0.12, cy - e.h * 0.78 * oT, ix, iy);
    ctx.quadraticCurveTo(cx + dir * hw * 0.05, cy + e.h * 0.62 * oB, ox, oy);
    ctx.closePath();
  }

  function drawEye(ctx, l, i, t, lid, core, jit, dil, a) {
    const e = l.eyes[i], dir = i ? -1 : 1;
    // slowly looks from side to side and trembles inside the socket
    const px = e.cx + dir * e.w * 0.03 + Math.sin(t * 2.2) * e.w * 0.06 + Math.sin(t * 67 + i) * e.w * 0.04 * jit;
    const py = e.cy + e.h * 0.04 + Math.cos(t * 59 + i * 2) * e.h * 0.05 * jit;
    ctx.save();
    tracePath(ctx, e.pts);
    ctx.clip();
    ctx.fillStyle = '#000';
    ctx.fillRect(e.x0 - 2, e.y0 - 2, e.w + 4, e.h + 4);
    if (lid < 1) {
      const oT = 1 - lid, oB = 1 - lid * lid * 0.9 - lid * 0.1;
      eyePath(ctx, e, dir, oT, oB);
      ctx.save();
      ctx.clip();
      const R = e.w * 0.48 * (0.9 + 0.1 * core);
      ctx.fillStyle = radial(ctx, px, py, 0, R, [
        [0, rgba([255, 255, 235], a)], [0.18, rgba([255, 240, 150], a)], [0.35, rgba([255, 190, 40], a)],
        [0.6, rgba([255, 85, 0], a)], [0.85, rgba([190, 15, 0], a)], [1, rgba([80, 0, 0], a)]]);
      ctx.fillRect(e.x0, e.y0, e.w, e.h);
      // pupil: black vertical slit
      const pw = e.w * 0.06 * dil, ph = e.h * 0.5;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.moveTo(px, py - ph);
      ctx.quadraticCurveTo(px + pw * 2, py, px, py + ph);
      ctx.quadraticCurveTo(px - pw * 2, py, px, py - ph);
      ctx.fill();
      ctx.restore();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = rgba([255, 200, 120], 0.55 * a);
      ctx.lineWidth = l.d * 0.007;
      eyePath(ctx, e, dir, oT, oB);
      ctx.stroke();
    } else if (t < 2.52) {
      // bright seam of the freshly closed eyelid
      const k = 1 - clamp((t - 2.42) / 0.1), hw = e.w * 0.45;
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(e.cx - dir * hw, e.cy - e.h * 0.08);
      ctx.quadraticCurveTo(e.cx, e.cy + e.h * 0.05, e.cx + dir * hw, e.cy + e.h * 0.12);
      ctx.strokeStyle = rgba([255, 80, 0], 0.5 * k); ctx.lineWidth = l.d * 0.02; ctx.stroke();
      ctx.strokeStyle = rgba([255, 230, 160], k); ctx.lineWidth = Math.max(2.5, l.d * 0.006); ctx.stroke();
    }
    ctx.restore();
    // glow spilling over the wall
    const o = (1 - lid * 0.85) * a;
    if (o > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, e.cx, e.cy, Math.max(e.w, e.h) * 1.15, [255, 60, 0], 0.4 * o);
      glow(ctx, px, py, e.w * 0.45, [255, 210, 120], 0.3 * core * o);
      ctx.restore();
    }
  }

  // socket: dark halo around the eye
  function drawSocket(ctx, e, a) {
    const R = Math.max(e.w, e.h) * 0.95;
    ctx.save();
    ctx.translate(e.cx, e.cy);
    ctx.scale(1, 0.75);
    ctx.fillStyle = radial(ctx, 0, 0, R * 0.45, R, [[0, rgba([0, 0, 0], 0.9 * a)], [1, 'rgba(0,0,0,0)']]);
    ctx.fillRect(-R, -R, R * 2, R * 2);
    ctx.restore();
  }

  // furious eyebrow: black wedge cutting the inner corner of the almond, with a glowing edge.
  // drop: 0 raised .. 1 furrowed (easeBack overshoots it by 10%)
  function browPath(ctx, l, i, drop) {
    const e = l.eyes[i], b = l.brows[i], dir = b.dir, hw = e.w * 0.5;
    const xo = e.cx - dir * hw * 1.12, xi = e.cx + dir * hw * 1.04;
    const yo = e.y0 + e.h * 0.04 * drop, yi = e.y0 + e.h * (-0.05 + 0.47 * drop);
    const ti = Math.max(b.top, yi - e.h * 0.24);
    ctx.beginPath();
    ctx.moveTo(xo, b.top);
    ctx.lineTo(xi + dir * e.w * 0.04, ti);
    ctx.lineTo(xi, yi);
    ctx.quadraticCurveTo((xo + xi) / 2, (yo + yi) / 2 + e.h * 0.07, xo, yo);
    ctx.closePath();
    return { xo, yo, xi, yi, cx: (xo + xi) / 2, cy: (yo + yi) / 2 + e.h * 0.07 };
  }
  function drawBrow(ctx, l, i, drop, a) {
    ctx.save();
    const p = browPath(ctx, l, i, drop);
    ctx.fillStyle = '#000';
    ctx.fill();
    if (a > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.xi, p.yi);
      ctx.quadraticCurveTo(p.cx, p.cy, p.xo, p.yo);
      ctx.strokeStyle = rgba([255, 70, 0], 0.3 * a); ctx.lineWidth = l.d * 0.045; ctx.stroke();
      ctx.strokeStyle = rgba([255, 170, 60], 0.95 * a); ctx.lineWidth = l.d * 0.016; ctx.stroke();
    }
    ctx.restore();
  }

  // skull nose (glowing inverted heart) at the top of the door: the bright parts
  // read well on the red door
  function nosePath(ctx, l) {
    const dr = l.door, nb = Math.min(l.top, dr.y1) - l.d * 0.012, nt = dr.y0 + (nb - dr.y0) * 0.12;
    const hh = nb - nt, nw = dr.w * 0.5, cx = dr.cx;
    ctx.beginPath();
    ctx.moveTo(cx, nt);
    ctx.bezierCurveTo(cx + nw * 0.35, nt + hh * 0.25, cx + nw * 1.3, nb - hh * 0.55, cx + nw * 0.85, nb);
    ctx.quadraticCurveTo(cx + nw * 0.4, nb + hh * 0.12, cx, nb - hh * 0.3);
    ctx.quadraticCurveTo(cx - nw * 0.4, nb + hh * 0.12, cx - nw * 0.85, nb);
    ctx.bezierCurveTo(cx - nw * 1.3, nb - hh * 0.55, cx - nw * 0.35, nt + hh * 0.25, cx, nt);
    ctx.closePath();
    return { cx, nt, nb, hh, nw };
  }
  function drawNose(ctx, l, heat, a) {
    if (!l.door || l.door.y0 > l.top - l.door.h * 0.2 || a <= 0) return;
    ctx.save();
    tracePath(ctx, l.door.pts);
    ctx.clip();
    const n = nosePath(ctx, l);
    ctx.fillStyle = radial(ctx, n.cx, n.nb - n.hh * 0.25, 0, n.hh * 0.9, [
      [0, rgba([255, 250, 210], a)], [0.35, rgba([255, 200, 80], a)], [0.75, rgba([255, 100, 10], a)], [1, rgba([200, 30, 0], a)]]);
    ctx.fill();
    ctx.strokeStyle = rgba([40, 0, 0], 0.9 * a);
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, l.door.w * 0.07);
    ctx.stroke();
    ctx.lineWidth = Math.max(3, l.door.w * 0.1);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(n.cx, n.nt + n.hh * 0.35); ctx.lineTo(n.cx, n.nb - n.hh * 0.28); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, n.cx, n.nb - n.hh * 0.3, n.hh * 1.1, [255, 90, 10], 0.7 * heat * a);
    glow(ctx, n.cx, n.nb - n.hh * 0.35, n.hh * 0.5, [255, 240, 190], 0.5 * heat * a);
    ctx.restore();
  }

  // secondary windows: a pair of slit eyes that blink out of sync
  function drawLittleEyes(ctx, l, t, a) {
    l.othersOut.forEach((o, j) => {
      ctx.save();
      tracePath(ctx, o.pts); ctx.clip();
      ctx.fillStyle = '#000'; ctx.fillRect(o.x0, o.y0, o.w, o.h);
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 2; k++) {
        const dir = k ? -1 : 1, x = o.x0 + o.w * (0.3 + 0.4 * k), y = o.cy + o.h * 0.04;
        const tb = 0.6 + k * 0.08 + j * 0.05, tb2 = 1.1 + (1 - k) * 0.08 + j * 0.05;
        const op = (1 - 0.95 * pulse(t, tb, tb + 0.14, 0.06)) * (1 - 0.95 * pulse(t, tb2, tb2 + 0.14, 0.06));
        const hw = o.w * 0.15, hh = o.h * 0.2 * op;
        glow(ctx, x, y, hw * 2.4, [255, 60, 0], 0.7 * a * (0.4 + 0.6 * op));
        ctx.fillStyle = rgba([255, 225, 150], a);
        ctx.beginPath();
        ctx.moveTo(x - dir * hw, y - hh * 0.4);
        ctx.quadraticCurveTo(x, y - hh * 1.6, x + dir * hw, y + hh * 0.5);
        ctx.quadraticCurveTo(x, y + hh * 1.1, x - dir * hw, y - hh * 0.4);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  // adds the segment [p0, p1] of the polyline to the current stroke
  function traceRange(ctx, pts, p0, p1) {
    const n = pts.length - 1;
    const at = p => { const m = clamp(p) * n, k = Math.min(n - 1, Math.floor(m)), f = m - k; return [lerp(pts[k][0], pts[k + 1][0], f), lerp(pts[k][1], pts[k + 1][1], f)]; };
    const a = at(p0), k0 = Math.floor(clamp(p0) * n) + 1, k1 = clamp(p1) * n;
    ctx.moveTo(a[0], a[1]);
    for (let i = k0; i < k1; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    const b = at(p1);
    ctx.lineTo(b[0], b[1]);
  }

  // live veins: they grow, pulse with the beat and a heat wave runs through them
  function drawVeins(ctx, l, t, a, beat) {
    if (a <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const base = Math.max(2, l.d * 0.012);
    for (const wv of [1, 2]) {
      ctx.beginPath();
      for (const v of l.veins) {
        if (v.w !== wv) continue;
        const p = easeOut((t - v.delay) / 0.35);
        if (p > 0) traceRange(ctx, v.pts, 0, p);
      }
      ctx.strokeStyle = rgba([255, 20, 0], 0.3 * a * (0.6 + 0.4 * beat));
      ctx.lineWidth = base * wv * 2;
      ctx.stroke();
      ctx.strokeStyle = rgba([255, 110, 30], 0.8 * a);
      ctx.lineWidth = base * wv * 0.7;
      ctx.stroke();
    }
    // heat wave: a bright stretch that runs outward every 0.4 s
    const q = ((t - 0.35) / 0.4) % 1;
    if (t > 0.35) {
      ctx.beginPath();
      for (const v of l.veins) traceRange(ctx, v.pts, Math.max(0, q - 0.22), q);
      ctx.strokeStyle = rgba([255, 210, 130], 0.45 * a * Math.sin(q * Math.PI));
      ctx.lineWidth = base * 1.2;
      ctx.stroke();
    }
    ctx.restore();
  }

  // ember: cached glow sprite
  function emberSprite() {
    if (ember) return ember;
    const s = 64;
    ember = mkCanvas(s, s);
    const c = ember.getContext('2d');
    c.fillStyle = radial(c, s / 2, s / 2, 0, s / 2, [[0, 'rgba(255,255,230,1)'], [0.18, 'rgba(255,220,120,1)'], [0.35, 'rgba(255,110,10,0.6)'], [1, 'rgba(255,40,0,0)']]);
    c.fillRect(0, 0, s, s);
    return ember;
  }
  function drawEmbers(ctx, l, t, a) {
    if (a <= 0) return;
    const spr = emberSprite(), g = l.d * 3, room = Math.max(l.d * 0.03, l.my - l.eyeBot);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of l.embers) {
      const age = t - p.burst - p.del;
      if (age < 0 || age > p.life) continue;
      const vy = Math.sqrt(2 * g * room * p.rise);
      const x = l.mx + p.u * l.mrx * 0.6 + (p.u * 0.9 + p.vx) * l.d * 1.1 * age;
      const y = Math.max(l.eyeBot + l.d * 0.02, l.my - vy * age + 0.5 * g * age * age);
      const k = age / p.life, R = l.d * 0.015 * p.sz * 4 * (1 - 0.4 * k);
      ctx.globalAlpha = a * (1 - k * k);
      ctx.drawImage(spr, x - R, y - R, R * 2, R * 2);
    }
    ctx.restore();
  }

  // hot edge of the gable (fixed to the architecture)
  function drawGableRim(ctx, l, a) {
    const g = l.roof;
    if (!g || a <= 0) return;
    const p = g.pts;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(p[3][0], p[3][1]); ctx.lineTo(p[0][0], p[0][1]); ctx.lineTo(p[1][0], p[1][1]); ctx.lineTo(p[2][0], p[2][1]);
    ctx.strokeStyle = rgba([255, 50, 0], 0.4 * a); ctx.lineWidth = l.d * 0.09; ctx.stroke();
    ctx.strokeStyle = rgba([255, 150, 40], 0.95 * a); ctx.lineWidth = l.d * 0.03; ctx.stroke();
    ctx.restore();
  }

  return {
    duration: DUR,
    update(S, t) {
      if (t < lastT) fired = false;
      lastT = t;
      if (!fired && t > 0) {
        fired = true;
        if (typeof Sound !== 'undefined' && Sound.play) { Sound.play('crash', { vel: 0.8 }); Sound.play('roar', { dur: 1.8, vel: 0.9 }); }
      }
    },
    // the zones stay black: the whole face goes in the global layer
    draw() {},
    drawGlobal(ctx, W, H, S, t = 0) {
      const l = layout(W, H, S.screenZones || []);
      const { X0, Y0, HW, HH, eyes } = l, pr = ctx.getTransform().a || 1;
      // the skin is prepared on the first frame (white flash), not mid-scare
      const sk = skinCanvas(l, pr);
      // 1st flash: white 0–0.06; black 0.06–0.10
      if (t < 0.06) {
        ctx.fillStyle = 'rgb(255,250,240)';
        ctx.fillRect(0, 0, W, H);
        return;
      }
      if (t < 0.1) return;
      // envelopes
      const out = 1 - smooth(1.5, 2.0, t);              // skin and mouth fade out
      const snap = easeBack(clamp((t - 0.1) / 0.2));     // jaw and eyebrows snap
      const open = snap * (1 + 0.07 * easeInOut((t - 0.5) / 0.8)) * (1 - 0.75 * smooth(1.45, 1.9, t));
      const heat = (0.75 + 0.25 * flicker(t * 3, 4)) * out;
      // eyes, last: narrow, flash and slam shut
      const lid = t < 2.1 ? 0.35 * easeInOut((t - 1.7) / 0.25) : t < 2.28 ? 0.35 * (1 - easeOut((t - 2.1) / 0.08)) : easeInOut((t - 2.28) / 0.14);
      const glare = pulse(t, 2.1, 2.3, 0.06);
      const jit = 1 - smooth(0.1, 0.6, t);
      const drops = [0, 1].map(i => snap + 0.12 * pulse(t, 0.72 + i * 0.1, 0.92 + i * 0.1, 0.08) + 0.12 * pulse(t, 1.12 + i * 0.1, 1.32 + i * 0.1, 0.08) + 0.15 * glare);

      // 2nd and final bright flash (red, not white): negative with the mouth fully open
      if (t >= 0.3 && t < 0.35) {
        ctx.fillStyle = 'rgb(255,95,45)';
        ctx.fillRect(X0 - HW, Y0 - HH, HW * 3, HH * 3);
        ctx.fillStyle = '#000';
        eyes.forEach((e, i) => { eyePath(ctx, e, i ? -1 : 1, 1, 1); ctx.fill(); });
        eyes.forEach((e, i) => drawBrow(ctx, l, i, 1, 0));
        // mouth in negative: black ring, pale teeth, black hole
        const m1 = mouthDims(l, t, 1);
        mouthPath(ctx, l, m1, 1.14); ctx.fill();
        mouthPath(ctx, l, m1, 1); ctx.fillStyle = 'rgb(255,215,170)'; ctx.fill();
        mouthPath(ctx, l, m1, 1, true); ctx.fillStyle = '#000'; ctx.fill();
        if (l.door) { ctx.save(); tracePath(ctx, l.door.pts); ctx.clip(); nosePath(ctx, l); ctx.fill(); ctx.restore(); }
        return;
      }

      // violent shake that decays + snap zoom: only skin, veins, mouth and embers
      const amp = H * (0.03 * jit + 0.004 * (1 - smooth(1.4, 1.8, t)));
      const sc = 1 + 0.12 * (1 - easeOut((t - 0.1) / 0.3));
      const beat = Math.pow(Math.abs(Math.sin(t * 9)), 3);
      const shaken = fn => {
        ctx.save();
        ctx.translate(l.mx + Math.sin(t * 71) * amp + Math.sin(t * 43 + 1) * amp * 0.6, l.my + Math.cos(t * 59) * amp * 0.8);
        ctx.rotate(Math.sin(t * 37) * 0.012 * jit);
        ctx.scale(sc, sc);
        ctx.translate(-l.mx, -l.my);
        fn();
        ctx.restore();
      };

      if (out > 0) {
        shaken(() => {
          ctx.globalAlpha = out;
          ctx.drawImage(sk, l.sx, l.sy, l.sw, l.sh);
          ctx.globalAlpha = 1;
          drawVeins(ctx, l, t, 0.9 * out, beat);
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, l.mx, l.my, l.d * 0.8, [255, 40, 0], (0.2 * beat + 0.5 * (1 - smooth(0.1, 0.25, t))) * out);
          ctx.restore();
        });
        drawGableRim(ctx, l, out * (0.75 + 0.25 * beat));
        eyes.forEach(e => drawSocket(ctx, e, out));
        drawNose(ctx, l, heat, out);
        drawLittleEyes(ctx, l, t, out);
        shaken(() => {
          drawMouth(ctx, l, t, open, heat, out);
          drawEmbers(ctx, l, t, out);
        });
      }

      // eyes and eyebrows on top of everything, fixed to the real windows
      const core = 0.8 + 0.4 * flicker(t * 2, 2) + 0.6 * glare;
      const dil = (1 - 0.45 * smooth(1.7, 1.95, t)) * (1 + 1.2 * glare);
      eyes.forEach((e, i) => drawEye(ctx, l, i, t, clamp(lid), core * (1 + 0.3 * jit * flicker(t * 8, i)), jit, dil, 1));
      if (lid < 1) eyes.forEach((e, i) => drawBrow(ctx, l, i, drops[i], 0.45 + 0.55 * out + 0.4 * glare));
    },
  };
})());
