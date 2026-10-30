// Scene: Collapse. A sweep of light builds a fake 3D brick wall (bevel, side faces,
// shadow); the heartbeats come out of the big window and bulge the bricks in waves, the wall cracks with
// lava through the joints, it collapses brick by brick and each wall opens into its own tunnel of
// fire (glowing joints, rivers of lava, white-hot core); the glass explodes, the
// door is an oven, something with horns watches us from the central gap, and at the end everything rewinds.
// The bricks are laid out in screen px (continuous rows across zones) and carried to each zone
// with its homography; what flies (bricks, glass, dust, embers) goes in drawGlobal.
registerScene((() => {
  // ---------- script (s) ----------
  const DUR = 29;
  const SCAN = [0.3, 2.7];                 // sweep that builds the wall
  const GLINT = [2.9, 4.4];                // grazing light that shows the relief
  const GLINT2 = [25.5, 26.6];
  const BEATS = [3.8, 5.2, 6.4, 7.4, 8.2, 8.9];
  const CRACK0 = 8.8;                      // cracks start
  const FALL0 = 13.6, FALL_SPAN = 3.0;     // collapse
  const BACK0 = 21.2, BACK_SPAN = 3.0, BACK_DUR = 1.0;  // rewind
  const DOOR_SHUT = BACK0 + BACK_SPAN + 0.3;
  const EYES = [17.4, 21.0], BLINK = 20.25;   // something lives inside: eyes in the abyss
  const THUMP = 25.15;                     // last brick: final blow
  const HEAL = [25.2, 26.3];               // the cracks close
  const OUT = [26.6, 28.0];                // the wall dematerializes
  const KZ = 0.02;                         // perspective of what sticks out
  const DEPTH = 0.045;                     // wall thickness toward the vanishing point
  const NV = 8, LV = [1, 0.84, 0.7, 0.57, 0.45, 0.33];
  const PAL = [[158, 66, 46], [146, 58, 44], [170, 78, 52], [132, 54, 46], [152, 72, 56], [122, 50, 42], [176, 88, 60], [140, 64, 58]];
  const CRACK_PASSES = [['rgb(255,60,0)', 1.2, 0.16], ['rgb(255,110,20)', 0.38, 0.6], ['rgb(255,238,175)', 0.12, 1]];

  const eOut3 = k => 1 - (1 - k) ** 3;
  const eInOut = k => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
  const eSine = k => 0.5 - 0.5 * Math.cos(Math.PI * clamp(k));
  const invSine = e => Math.acos(1 - 2 * clamp(e)) / Math.PI;
  const scanX = (B, t, a, b, rev) => { const k = eSine((t - a) / (b - a)); return rev ? B.x1 - B.w * k : B.x0 + B.w * k; };

  // ---------- homographies ----------
  // unit square → quadrilateral (Heckbert); x = (a u + b v + c) / (g u + h v + 1)
  function sq2quad(p) {
    const [x0, y0] = p[0], [x1, y1] = p[1], [x2, y2] = p[2], [x3, y3] = p[3];
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
    let g = 0, h = 0;
    const den = dx1 * dy2 - dx2 * dy1;
    if ((sx || sy) && den) { g = (sx * dy2 - dx2 * sy) / den; h = (dx1 * sy - sx * dy1) / den; }
    return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h, 1];
  }
  function inv3(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    return [e * i - f * h, c * h - b * i, b * f - c * e, f * g - d * i, a * i - c * g, c * d - a * f, d * h - e * g, b * g - a * h, a * e - b * d];
  }
  function hp(m, x, y) { const w = m[6] * x + m[7] * y + m[8]; return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w]; }
  function segDist(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy || 1, u = clamp(((px - x1) * dx + (py - y1) * dy) / l2);
    return [Math.hypot(px - x1 - dx * u, py - y1 - dy * u), u];
  }
  function polyOf(sz, shape) {
    if (!shape || shape === 'rect') return sz.pts.map(p => [p[0], p[1]]);
    const p = sz.pts, d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const w = Math.max(d(p[0], p[1]), d(p[3], p[2])) || 1, h = Math.max(d(p[0], p[3]), d(p[1], p[2])) || 1, M = sq2quad(p);
    return shapePoints(shape, w, h).map(([x, y]) => hp(M, x / w, y / h));
  }
  const inPoly = (x, y, p) => pointInPoly([x, y], p);
  function quad(ctx, ax, ay, bx, by, cx, cy, dx, dy, col) {
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.lineTo(dx, dy); ctx.closePath(); ctx.fill();
  }

  // ---------- sprites ----------
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function poly(x, pts, col) { x.fillStyle = col; x.beginPath(); pts.forEach(([a, b], i) => (i ? x.lineTo(a, b) : x.moveTo(a, b))); x.closePath(); x.fill(); }

  // brick face with bevel (moonlight from upper-left), pores and chipped spots
  function brickSprite(w, h, col, seed, mode) {
    const c = canvas(w, h), x = c.getContext('2d'), r = rng(seed), W = c.width, H = c.height;
    const cc = col;
    const gr = x.createLinearGradient(0, 0, W * 0.3, H);
    gr.addColorStop(0, rgba(mix(cc, [255, 225, 215], 0.14)));
    gr.addColorStop(1, rgba(mix(cc, [0, 0, 0], 0.2)));
    x.fillStyle = gr; x.fillRect(0, 0, W, H);
    // large stains and pores
    for (let i = 0; i < 3; i++) {
      const g2 = x.createRadialGradient(r() * W, r() * H, 0, r() * W, r() * H, H * (0.6 + r()));
      g2.addColorStop(0, r() < 0.5 ? 'rgba(0,0,0,0.16)' : 'rgba(255,200,170,0.1)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g2; x.fillRect(0, 0, W, H);
    }
    for (let i = 0; i < 22; i++) {
      const s = (0.5 + r() * 1.4) * H / 24;
      x.fillStyle = r() < 0.6 ? 'rgba(20,0,0,0.28)' : 'rgba(255,225,200,0.16)';
      x.fillRect(r() * W, r() * H, s, s);
    }
    const bv = Math.max(1, H * 0.15);
    poly(x, [[0, 0], [W, 0], [W - bv, bv], [bv, bv]], rgba(mix(cc, [235, 232, 255], 0.45)));
    poly(x, [[0, 0], [bv, bv], [bv, H - bv], [0, H]], rgba(mix(cc, [235, 225, 245], 0.22)));
    poly(x, [[0, H], [bv, H - bv], [W - bv, H - bv], [W, H]], rgba(mix(cc, [0, 0, 0], 0.58)));
    poly(x, [[W, 0], [W, H], [W - bv, H - bv], [W - bv, bv]], rgba(mix(cc, [0, 0, 0], 0.4)));
    x.fillStyle = rgba(mix(cc, [255, 250, 255], 0.65)); x.fillRect(bv * 0.6, 0, W - bv * 1.2, Math.max(0.7, H * 0.04));
    // chipped spots at the corners
    x.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 2; i++) {
      const cx = r() < 0.5 ? 0 : W, cy = r() < 0.5 ? 0 : H, s = H * (0.12 + r() * 0.2);
      poly(x, [[cx, cy], [cx + (cx ? -s * 1.6 : s * 1.6), cy], [cx, cy + (cy ? -s : s)]], '#000');
    }
    x.globalCompositeOperation = 'source-over';
    if (mode === 'back') {
      // fire backlight: dark face with a hot edge at the bottom
      x.globalCompositeOperation = 'source-atop';
      x.fillStyle = 'rgba(8,2,0,0.62)'; x.fillRect(0, 0, W, H);
      const g3 = x.createLinearGradient(0, H, 0, H * 0.45);
      g3.addColorStop(0, 'rgba(255,170,60,0.95)'); g3.addColorStop(1, 'rgba(255,60,0,0)');
      x.fillStyle = g3; x.fillRect(0, 0, W, H);
      x.globalCompositeOperation = 'source-over';
    }
    return c;
  }
  // lava glow on the edges (added with 'lighter')
  function hotSprite(w, h) {
    const c = canvas(w, h), x = c.getContext('2d'), W = c.width, H = c.height, e = H * 0.42;
    x.fillStyle = 'rgba(255,60,0,0.22)'; x.fillRect(0, 0, W, H);
    const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const g = x.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(255,190,80,0.95)'); g.addColorStop(0.35, 'rgba(255,90,10,0.45)'); g.addColorStop(1, 'rgba(255,40,0,0)');
      x.fillStyle = g; x.fillRect(rx, ry, rw, rh);
    };
    edge(0, 0, 0, e, 0, 0, W, e); edge(0, H, 0, H - e, 0, H - e, W, e);
    edge(0, 0, e, 0, 0, 0, e, H); edge(W, 0, W - e, 0, W - e, 0, e, H);
    return c;
  }
  // only the lit edges: for the grazing light
  function hlSprite(w, h) {
    const c = canvas(w, h), x = c.getContext('2d'), W = c.width, H = c.height, bv = Math.max(1, H * 0.16);
    x.fillStyle = 'rgba(200,215,255,0.07)'; x.fillRect(0, 0, W, H);
    poly(x, [[0, 0], [W, 0], [W - bv, bv], [bv, bv]], 'rgba(235,240,255,0.95)');
    poly(x, [[0, 0], [bv, bv], [bv, H - bv], [0, H]], 'rgba(220,230,255,0.55)');
    return c;
  }
  function shadowSprite(w, h, pad) {
    const c = canvas(w + pad * 2, h + pad * 2), x = c.getContext('2d');
    x.shadowColor = 'rgba(0,0,0,1)'; x.shadowBlur = pad * 0.9; x.shadowOffsetX = c.width;
    x.fillStyle = '#000'; x.fillRect(pad - c.width, pad, w, h);
    return c;
  }
  function blobSprite(size, col, n, seed) {
    const c = canvas(size, size), x = c.getContext('2d'), r = rng(seed), s = c.width / 2;
    for (let i = 0; i < n; i++) {
      const px = s + (r() - 0.5) * s * (n > 1 ? 0.7 : 0), py = s + (r() - 0.5) * s * (n > 1 ? 0.7 : 0), rr = s * (n > 1 ? 0.45 + r() * 0.35 : 1);
      const g = x.createRadialGradient(px, py, 0, px, py, rr);
      g.addColorStop(0, rgba(col, n > 1 ? 0.55 : 1)); g.addColorStop(0.45, rgba(col, n > 1 ? 0.3 : 0.5)); g.addColorStop(1, rgba(col, 0));
      x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    }
    return c;
  }

  // ---------- global geometry (screen px) ----------
  let G = null, F = null;

  function build(S) {
    const W = innerWidth, H = innerHeight, all = S.screenZones || [];
    const g = { ref: S.screenZones, W, H, gen: (G ? G.gen : 0) + 1 };
    const shapes = {};
    try { for (const z of App.zones) shapes[z.id] = z.shape; } catch (e) { /* without App: everything is rectangles */ }
    const polys = {};
    for (const sz of all) polys[sz.id] = polyOf(sz, shapes[sz.id]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const sz of all) { x0 = Math.min(x0, sz.x0); y0 = Math.min(y0, sz.y0); x1 = Math.max(x1, sz.x1); y1 = Math.max(y1, sz.y1); }
    if (!all.length) { x0 = W * 0.2; y0 = H * 0.2; x1 = W * 0.8; y1 = H * 0.8; }
    const B = g.B = { x0, y0, x1, y1, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
    const area = s => (s.x1 - s.x0) * (s.y1 - s.y0);
    const walls = all.filter(s => s.kind === 'wall' || s.kind === 'roof');
    const holeP = all.filter(s => s.kind === 'window' || s.kind === 'door').map(s => polys[s.id]);
    const wins0 = all.filter(s => s.kind === 'window');
    // main wall: the one under the gable (if there is no gable, the largest)
    const roof0 = walls.find(s => s.kind === 'roof');
    const ovx = s => roof0 ? Math.max(0, Math.min(s.x1, roof0.x1) - Math.max(s.x0, roof0.x0)) : 0;
    const big = walls.filter(s => s.kind === 'wall').sort((a, b) => ovx(b) - ovx(a) || area(b) - area(a))[0] || walls[0];
    const winIn = s => wins0.filter(w => w.cx > s.x0 && w.cx < s.x1 && w.cy > s.y0 && w.cy < s.y1).sort((a, b) => area(b) - area(a))[0];
    // heart: the big window of the large wall (focus of the composition); the heartbeats come from here
    const bw0 = big && winIn(big);
    const vp = g.vp = bw0 ? [bw0.cx, bw0.cy] : big ? [big.cx, big.y0 + (big.y1 - big.y0) * 0.55] : [(x0 + x1) / 2, y0 + B.h * 0.55];
    const hs = g.hs = H / 1080;
    const bh = g.bh = Math.max(8, H * 0.021), bw = g.bw = bh * 2.15, gp = Math.max(0.7, bh * 0.075);
    const fw = g.fw = bw / 2 - gp, fh = g.fh = bh / 2 - gp;
    g.grav = 2600 * hs; g.waveV = B.w * 0.75; g.waveW = bh * 2.4;
    const ox = big ? big.x0 : x0, oy = big ? big.y0 : y0;

    // sprites
    const SPR = g.SPR = Math.min(2, Math.max(1, devicePixelRatio || 1));
    const sw = fw * 2 * SPR, sh = fh * 2 * SPR;
    g.spr = LV.map((l, li) => PAL.map((c, v) => brickSprite(sw, sh, c.map(q => q * l), 101 + v * 7 + li, 'norm')));
    g.back = PAL.map((c, v) => brickSprite(sw, sh, c, 401 + v * 7, 'back'));
    g.faces = LV.map(l => PAL.map(c => {
      const cc = c.map(q => q * l);
      return { top: rgba(mix(cc, [225, 220, 255], 0.38)), side: rgba(mix(cc, [0, 0, 0], 0.42)), bot: rgba(mix(cc, [0, 0, 0], 0.7)) };
    }));
    g.hot = hotSprite(sw, sh); g.hl = hlSprite(sw, sh);
    g.sp = bh * 0.35; g.shadow = shadowSprite(sw, sh, g.sp * SPR);
    g.dust = blobSprite(96, [215, 165, 125], 6, 9);
    g.ember = blobSprite(24, [255, 190, 90], 1, 1);
    g.flare = blobSprite(64, [255, 255, 255], 1, 1);
    g.core = blobSprite(96, [255, 200, 110], 1, 1);
    g.flame = blobSprite(64, [255, 110, 18], 1, 1);
    g.blk = blobSprite(96, [0, 0, 0], 1, 1);
    g.vig = (() => {
      const c = canvas(128, 128), x = c.getContext('2d'), gr = x.createRadialGradient(64, 64, 22, 64, 64, 64);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0.88)');
      x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      return c;
    })();

    // outer edges of each wall (edges shared with another wall don't count as border)
    const ext = {};
    for (const s of walls) {
      const p = polys[s.id], list = [];
      for (let k = 0; k < p.length; k++) {
        const a = p[k], b = p[(k + 1) % p.length], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
        let nx = -(b[1] - a[1]), ny = b[0] - a[0];
        const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
        if (inPoly(mx + nx * 3, my + ny * 3, p)) { nx = -nx; ny = -ny; }
        if (!walls.some(o => o !== s && inPoly(mx + nx * 5, my + ny * 5, polys[o.id]))) list.push([a[0], a[1], b[0], b[1]]);
      }
      ext[s.id] = list;
    }

    // epicenters: one per wall, away from the windows; the ones near the door start earlier
    const eps = g.eps = walls.map(s => {
      const r = rng((hashString(s.id) ^ 0x51ed) >>> 0), p = polys[s.id], roof = s.kind === 'roof';
      let ex = s.cx, ey = s.cy;
      for (let k = 0; k < 16; k++) {
        const cx = s.x0 + (s.x1 - s.x0) * (roof ? 0.44 + 0.12 * r() : 0.28 + 0.44 * r());
        const cy = s.y0 + (s.y1 - s.y0) * (roof ? 0.6 + 0.12 * r() : 0.35 + 0.35 * r());
        if (inPoly(cx, cy, p) && !holeP.some(h => inPoly(cx, cy, h))) { ex = cx; ey = cy; break; }
      }
      const reach = Math.max(...p.map(q => Math.hypot(q[0] - ex, q[1] - ey)), bh * 4);
      return { x: ex, y: ey, reach, zone: s.id, d: Math.hypot(ex - vp[0], ey - vp[1]), L: 0, heat: 0, Lmax: 1 };
    });
    eps.slice().sort((a, b) => a.d - b.d).forEach((e, k) => { e.rank = k; e.t0 = CRACK0 + k * 0.5; });
    const epOf = {};
    eps.forEach((e, k) => { e.i = k; epOf[e.zone] = e; });

    // one tunnel per wall: its real silhouette, with its own vanishing point (each wall is a readable opening)
    const tun = g.tun = walls.map(s => {
      const p = polys[s.id], e = epOf[s.id], wn = winIn(s);
      let v;
      if (s === big) v = vp.slice();
      else if (s.kind === 'roof') v = [p.reduce((a, q) => a + q[0], 0) / p.length, s.y0 + (s.y1 - s.y0) * 0.6];
      else if (wn) v = [lerp(s.cx, wn.cx, 0.7), lerp(s.cy, wn.cy, 0.7)];
      else v = [lerp(e.x, s.cx, 0.6), lerp(e.y, s.cy, 0.6)];
      // edges: type (floor, ceiling, side) based on where they face, and floor = the lowest one
      const E = p.map((a, k) => {
        const b = p[(k + 1) % p.length], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dl = Math.hypot(mx - v[0], my - v[1]) || 1;
        const ny = (my - v[1]) / dl, len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return { a: k, b: (k + 1) % p.length, kind: ny > 0.55 ? 'bot' : ny < -0.55 ? 'top' : 'side', nj: Math.max(3, Math.round(len / (bw * 1.25))), my };
      });
      const fl = E.reduce((m, q) => (q.my > m.my ? q : m), E[0]);
      const r = rng((hashString(s.id) ^ 0x7a1a) >>> 0), nr = 2 + (r() < 0.5 ? 1 : 0);
      const rivers = [];
      for (let k = 0; k < nr; k++) rivers.push({ u: (k + 0.25 + r() * 0.5) / nr, w: 0.025 + 0.025 * r(), ph: r() * 9, am: 0.03 + 0.05 * r() });
      const R2 = Math.max(...p.map(q => Math.hypot(q[0] - v[0], q[1] - v[1])));
      const bb = [Math.min(...p.map(q => q[0])), Math.min(...p.map(q => q[1])), Math.max(...p.map(q => q[0])), Math.max(...p.map(q => q[1]))];
      return { id: s.id, p, vp: v, E, floor: fl, rivers, R2, bb, path: null, I: s.kind === 'roof' ? 0.55 : 1 };
    });
    const tunOf = {};
    tun.forEach(tn => { tunOf[tn.id] = tn; });

    // stair-step cracks following the joints
    const segs = g.segs = [];
    const headX = row => ox + ((row & 1) ? bw / 2 : 0);
    const walk = (e, x, y, ang, len, s, wd, depth, r) => {
      let j = Math.round((y - oy) / bh);
      y = oy + j * bh;
      const sy = Math.sin(ang) >= 0 ? 1 : -1;
      let row = sy > 0 ? j : j - 1;
      x = headX(row) + Math.round((x - headX(row)) / bw) * bw;
      const end = s + len;
      while (s < end) {
        const ny = y + sy * bh;
        segs.push({ e, x1: x, y1: y, x2: x, y2: ny, s0: s, s1: s + bh, w: wd });
        s += bh; y = ny; row += sy;
        if (y < B.y0 - bh || y > B.y1 + bh) break;
        ang += (r() - 0.5) * 0.4;
        const dx = Math.cos(ang), dy = Math.abs(Math.sin(ang)) + 0.06;
        let n = Math.min(9, Math.round((Math.abs(dx) / dy) * bh / (bw / 2)));
        if (n % 2 === 0) n += 1;
        const sx = Math.abs(dx) < 0.3 ? (r() < 0.5 ? -1 : 1) : Math.sign(dx), L = n * bw / 2;
        segs.push({ e, x1: x, y1: y, x2: x + sx * L, y2: y, s0: s, s1: s + L, w: wd });
        x += sx * L; s += L; wd *= 0.97;
        if (x < B.x0 - bw || x > B.x1 + bw) break;
        if (depth < 2 && r() < 0.2) walk(e, x, y, ang + (r() < 0.5 ? -1 : 1) * (0.7 + r() * 0.6), (end - s) * 0.55, s, wd * 0.62, depth + 1, r);
      }
    };
    for (const e of eps) {
      const r = rng((hashString(e.zone) ^ 0xc4a) >>> 0), nb = r() < 0.5 ? 3 : 4, a0 = r() * TAU;
      for (let k = 0; k < nb; k++) walk(e.i, e.x, e.y, a0 + (k + (r() - 0.5) * 0.5) * TAU / nb, e.reach * (0.5 + 0.4 * r()), 0, 1, 0, r);
    }
    for (const e of eps) {
      e.Lmax = Math.max(bh, ...segs.filter(sg => sg.e === e.i).map(sg => sg.s1));
      const u = Math.max(0.5, FALL0 - 0.7 - e.t0);
      e.v = e.Lmax / (u - 0.9 * Math.sin(TAU * u / 0.8) * 0.8 / TAU);
    }
    for (const sg of segs) { sg.mx = (sg.x1 + sg.x2) / 2; sg.my = (sg.y1 + sg.y2) / 2; sg.hl = Math.abs(sg.x2 - sg.x1) / 2 + bh; }

    // bricks
    const bricks = g.bricks = [], grid = new Map(), zoneBricks = g.zoneBricks = new Map();
    walls.forEach(s => zoneBricks.set(s.id, []));
    const rA = Math.floor((y0 - oy) / bh) - 1, rB = Math.ceil((y1 - oy) / bh) + 1;
    const roofZ = walls.find(s => s.kind === 'roof') || big;
    const keyX = roofZ ? roofZ.cx : B.x0 + B.w / 2, keyY = roofZ ? roofZ.y0 : B.y0;
    for (let row = rA; row <= rB; row++) {
      const off = (row & 1) ? bw / 2 : 0, yc = oy + (row + 0.5) * bh;
      const cA = Math.floor((x0 - ox - off) / bw) - 1, cB = Math.ceil((x1 - ox - off) / bw) + 1;
      for (let col = cA; col <= cB; col++) {
        const xc = ox + off + (col + 0.5) * bw;
        if (holeP.some(p => inPoly(xc, yc, p))) continue;
        const pts = [[xc, yc], [xc - fw, yc - fh], [xc + fw, yc - fh], [xc + fw, yc + fh], [xc - fw, yc + fh]];
        const zs = walls.filter(s => xc + bw / 2 > s.x0 && xc - bw / 2 < s.x1 && yc + bh / 2 > s.y0 && yc - bh / 2 < s.y1 &&
          (pts.some(q => inPoly(q[0], q[1], polys[s.id])) || polys[s.id].some(([px, py]) => Math.abs(px - xc) < bw / 2 && Math.abs(py - yc) < bh / 2)));
        if (!zs.length) continue;
        const prim = zs.find(s => inPoly(xc, yc, polys[s.id])) || zs[0];
        const r = rng((hashString(row + ':' + col) ^ 0x9e37) >>> 0);
        const tv = tunOf[prim.id].vp;
        const b = { x: xc, y: yc, row, col, v: Math.floor(r() * NV), ph: r() * TAU, dx: xc - tv[0], dy: yc - tv[1] };
        b.r = Math.hypot(xc - vp[0], yc - vp[1]);
        const lr = r() - 0.5;
        // appears with the sweep and disappears at the end
        b.ta = SCAN[0] + (SCAN[1] - SCAN[0]) * invSine((xc - B.x0) / B.w) + Math.abs(yc - (B.y0 + B.h * 0.5)) / B.h * 0.22 + r() * 0.1;
        b.tz = OUT[0] + (OUT[1] - OUT[0] - 0.5) * invSine((B.x1 - xc) / B.w) + r() * 0.12;
        b.pop = r() < 0.12 ? 5.2 + r() * 8.2 : -9;
        b.cz = (r() - 0.3) * 0.9; b.crot = (r() - 0.5) * 0.12; b.cox = (r() - 0.5) * bh * 0.22; b.coy = (r() - 0.5) * bh * 0.16;
        // does it stay? (irregular frame along the edges of the house)
        let ed = Infinity;
        for (const s of zs) for (const e of ext[s.id]) ed = Math.min(ed, segDist(xc, yc, e[0], e[1], e[2], e[3])[0]);
        b.keep = !inPoly(xc, yc, polys[prim.id]) || ed < bh * (0.5 + 1.5 * r());
        // moonlight focused on the gable's apex; occlusion along frames and edges
        let wd = Infinity;
        for (const hp2 of holeP) for (let k = 0; k < hp2.length; k++) { const a = hp2[k], c = hp2[(k + 1) % hp2.length]; wd = Math.min(wd, segDist(xc, yc, a[0], a[1], c[0], c[1])[0]); }
        const L = 1 - 0.55 * ((yc - keyY) / B.h) - 0.35 * Math.abs(xc - keyX) / (B.w / 2) + lr * 0.14;
        let lv = L > 0.8 ? 0 : L > 0.66 ? 1 : L > 0.52 ? 2 : L > 0.38 ? 3 : L > 0.24 ? 4 : 5;
        lv += (wd < bh * 0.9 ? 2 : wd < bh * 1.9 ? 1 : 0) + (ed < bh * 1.2 ? 1 : 0);
        b.lv = Math.min(LV.length - 1, lv);
        // fall: from its epicenter outward, toward the viewer, spinning
        const E = epOf[prim.id];
        const ddx = xc - E.x, ddy = yc - E.y, dl = Math.hypot(ddx, ddy) || 1;
        b.ord = Math.min(1, dl / E.reach);
        b.tf = FALL0 + E.rank * 0.3 + Math.pow(b.ord, 0.85) * FALL_SPAN + r() * 0.2;
        b.vx = (ddx / dl) * (50 + 130 * r()) * hs + b.dx * 0.12;
        b.vy = (-(40 + 160 * r()) + (ddy / dl) * 50) * hs;
        b.grow = 0.25 + 0.55 * r(); b.spin = (r() - 0.5) * 7; b.tum = (r() < 0.5 ? -1 : 1) * (2.5 + 6 * r());
        let gy = -Infinity;
        for (const s of walls) if (xc >= s.x0 && xc <= s.x1) gy = Math.max(gy, s.y1);
        b.gy = gy > -Infinity ? gy : B.y1;
        const A = 0.5 * g.grav, C = yc - b.gy;
        b.tg = (-b.vy + Math.sqrt(b.vy * b.vy - 4 * A * C)) / (2 * A);
        b.tout = b.tg + 0.2;
        b.dust = r() < 0.4; b.puff = r() < 0.45; b.chips = r() < 0.32 ? [0, 1, 2].map(() => [(r() - 0.5) * 260 * hs, -(60 + r() * 200) * hs, 0.12 + r() * 0.16]) : null;
        b.hx = tv[0] > xc ? 1 : -1; b.hy = tv[1] > yc ? 1 : -1;
        const i = bricks.length;
        bricks.push(b);
        grid.set(row + ',' + col, i);
        for (const s of zs) zoneBricks.get(s.id).push(i);
      }
    }
    // rewind: the last to fall is the first to return
    const falling = bricks.filter(b => !b.keep);
    const fEnd = Math.max(FALL0 + 0.1, ...falling.map(b => b.tf));
    for (const b of bricks) {
      b.tb = BACK0 + ((fEnd - b.tf) / (fEnd - FALL0)) * BACK_SPAN * 0.95 + hash(b.ph) * 0.1;
      // neighbors toward the vanishing point (to see the wall's thickness in the gaps)
      const look = (rw, cl) => { const i = grid.get(rw + ',' + cl); return i === undefined ? -1 : i; };
      b.nh = look(b.row, b.col + b.hx);
      const rw = b.row + b.hy, off2 = (rw & 1) ? bw / 2 : 0, cA = Math.round((b.x - bw / 2 - ox - off2) / bw - 0.5);
      b.nv1 = look(rw, cA); b.nv2 = look(rw, cA + 1);
      // first crack that touches the brick
      let best = Infinity, be = -1, bs = 0;
      for (const sg of segs) {
        if (Math.abs(sg.mx - b.x) > sg.hl + bw || Math.abs(sg.my - b.y) > bh * 1.6) continue;
        const [d, u] = segDist(b.x, b.y, sg.x1, sg.y1, sg.x2, sg.y2);
        if (d > bh * 0.8) continue;
        const e = eps[sg.e], s = sg.s0 + u * (sg.s1 - sg.s0), at = e.t0 + s / e.v;
        if (at < best) { best = at; be = sg.e; bs = s; }
      }
      b.ce = be; b.cs = bs;
    }

    // windows: fan of shards around the impact
    const wins = all.filter(s => s.kind === 'window').map(s => buildWindow(s, polys[s.id], g));
    wins.sort((a, b) => a.d - b.d).forEach((w, k) => {
      w.ts = FALL0 + 0.05 + k * 0.3;
      w.tc1 = CRACK0 + 1.6 + k * 0.5; w.tc2 = CRACK0 + 3.3 + k * 0.3;
      w.tr = BACK0 + BACK_SPAN * 0.8 - k * 0.2;
      w.tscan = SCAN[0] + (SCAN[1] - SCAN[0]) * invSine((w.cx - B.x0) / B.w);
      w.tout = OUT[0] + (OUT[1] - OUT[0] - 0.5) * invSine((B.x1 - w.cx) / B.w);
    });
    g.wins = wins; g.winById = new Map(wins.map(w => [w.id, w]));

    // embers rising from the abyss toward the viewer
    const re = rng(777);
    g.embers = [];
    for (let i = 0; i < 90; i++) g.embers.push({ a: re() * TAU, p: re(), sp: 0.22 + re() * 0.4, r0: 0.5 + re() * 0.9, s: 0.5 + re(), sw: (re() - 0.5) * 1.4, c: re(), tn: tun[i % tun.length] });

    // abyss: low-resolution canvas in screen px, shared by all zones
    g.vq = 0.33;
    // the eyes: centered on the heart (window + gap in the central wall)
    g.eyeAt = [vp[0], vp[1] + bh * 0.3];
    g.eyeW = Math.min(B.h * 0.17, big ? (big.x1 - big.x0) * 0.2 : B.w * 0.08);
    g.vc = canvas(B.w * g.vq + 2, B.h * g.vq + 2);
    g.vctx = g.vc.getContext('2d');
    return g;
  }

  function buildWindow(s, p, g) {
    const r = rng((hashString(s.id) ^ 0x61a55) >>> 0), hs = g.hs;
    const w = s.x1 - s.x0, h = s.y1 - s.y0;
    // vanishing point of the wall that contains it
    const tn = g.tun.find(q => s.cx > q.bb[0] && s.cx < q.bb[2] && s.cy > q.bb[1] && s.cy < q.bb[3]);
    const wv = tn ? tn.vp : g.vp;
    // off-center impact, near a corner
    const fx = 0.2 + 0.15 * r(), fy = 0.22 + 0.13 * r();
    const cx = s.x0 + w * (r() < 0.5 ? fx : 1 - fx), cy = s.y0 + h * (r() < 0.5 ? fy : 1 - fy);
    const N = 8 + Math.floor(r() * 3), a0 = r() * TAU;
    const angs = [];
    for (let k = 0; k < N; k++) angs.push(a0 + (k + (r() - 0.5) * 0.6) * TAU / N);
    const hit = a => {
      const dx = Math.cos(a), dy = Math.sin(a);
      let best = Math.hypot(w, h);
      for (let k = 0; k < p.length; k++) {
        const [ax, ay] = p[k], [bx, by] = p[(k + 1) % p.length], ex = bx - ax, ey = by - ay;
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const tt = ((ax - cx) * ey - (ay - cy) * ex) / den, u = ((ax - cx) * dy - (ay - cy) * dx) / den;
        if (tt > 0 && u >= 0 && u <= 1) best = Math.min(best, tt);
      }
      return [cx + dx * best, cy + dy * best];
    };
    const P = angs.map(hit);
    const at = (q, f) => [cx + (q[0] - cx) * f, cy + (q[1] - cy) * f];
    const A1 = P.map(q => at(q, 0.15 + 0.35 * r())), A2 = P.map(q => at(q, 0.45 + 0.45 * r()));
    const corners = p.map(q => [q, Math.atan2(q[1] - cy, q[0] - cx)]);
    const shards = [], cracks = [];
    const addShard = pts => {
      const n = pts.length, mx = pts.reduce((a, q) => a + q[0], 0) / n, my = pts.reduce((a, q) => a + q[1], 0) / n;
      const dx = mx - cx, dy = my - cy, dl = Math.hypot(dx, dy) || 1, sp = (160 + 380 * r()) * hs;
      shards.push({ x: mx, y: my, pts: pts.map(q => [q[0] - mx, q[1] - my]), vx: dx / dl * sp, vy: dy / dl * sp - 110 * hs, grow: 0.5 + 1.3 * r(), spin: (r() - 0.5) * 9, flip: 2 + 7 * r(), ph: r() * TAU });
    };
    // 3-4 long cracks reach the frame with a mid-way kink; the rest die out before
    const runs = new Set();
    while (runs.size < Math.min(N, 3 + (r() < 0.5 ? 1 : 0))) runs.add(Math.floor(r() * N));
    for (let k = 0; k < N; k++) {
      const k2 = (k + 1) % N, a = angs[k], b = k2 ? angs[k2] : angs[0] + TAU;
      const mid = corners.map(([q, ca]) => { let c = ca; while (c < a) c += TAU; while (c >= a + TAU) c -= TAU; return [q, c]; }).filter(([, c]) => c < b).sort((u, v) => u[1] - v[1]).map(([q]) => q);
      addShard([[cx, cy], A1[k], A1[k2]]);
      addShard([A1[k], A2[k], A2[k2], A1[k2]]);
      addShard([A2[k], P[k], ...mid, P[k2], A2[k2]]);
      const d = r() * 0.12;
      cracks.push([cx, cy, A1[k][0], A1[k][1], 1, d]);
      if (r() < 0.3) cracks.push([A1[k][0], A1[k][1], A1[k2][0], A1[k2][1], 1, d + 0.08]);
      cracks.push([A1[k][0], A1[k][1], A2[k][0], A2[k][1], 1, d + 0.1]);
      if (r() < 0.3) cracks.push([A2[k][0], A2[k][1], A2[k2][0], A2[k2][1], 2, d + 0.1]);
      if (runs.has(k)) {
        const mx = lerp(A2[k][0], P[k][0], 0.4 + 0.2 * r()), my = lerp(A2[k][1], P[k][1], 0.4 + 0.2 * r());
        const L = Math.hypot(P[k][0] - A2[k][0], P[k][1] - A2[k][1]), j = (r() - 0.5) * 0.5 * L;
        const nx = -(P[k][1] - A2[k][1]) / (L || 1), ny = (P[k][0] - A2[k][0]) / (L || 1);
        cracks.push([A2[k][0], A2[k][1], mx + nx * j, my + ny * j, 2, d + 0.05], [mx + nx * j, my + ny * j, P[k][0], P[k][1], 2, d + 0.11]);
      }
    }
    // glass teeth in the frame: few, toward the corners, some long jagged shards
    const teeth = [], m = Math.min(w, h);
    let slivers = 1 + (r() < 0.5 ? 1 : 0);
    for (let k = 0; k < p.length; k++) {
      const [ax, ay] = p[k], [bx, by] = p[(k + 1) % p.length];
      let nx = -(by - ay), ny = bx - ax;
      const L = Math.hypot(nx, ny) || 1; nx /= L; ny /= L;
      if ((cx - ax) * nx + (cy - ay) * ny < 0) { nx = -nx; ny = -ny; }
      const n = Math.max(0, Math.floor(r() * 4) - 1) + (slivers > 0 && r() < 0.45 ? 1 : 0);
      for (let i = 0; i < n; i++) {
        const long = slivers > 0 && (i === 0 && r() < 0.6);
        if (long) slivers--;
        const base = long ? 0.08 + 0.07 * r() : 0.04 + 0.06 * r(), dd = long ? m * (0.25 + 0.2 * r()) : m * (0.05 + 0.1 * r());
        const side = r() < 0.5, uc = side ? 0.02 + 0.22 * r() ** 1.5 : 0.98 - 0.22 * r() ** 1.5;
        const u0 = clamp(uc - base / 2), u1 = clamp(uc + base / 2), um = lerp(u0, u1, 0.15 + r() * 0.7);
        const tip = [lerp(ax, bx, um) + nx * dd, lerp(ay, by, um) + ny * dd], q0 = [lerp(ax, bx, u0), lerp(ay, by, u0)], q1 = [lerp(ax, bx, u1), lerp(ay, by, u1)];
        // lit edge: the side facing the vanishing point
        const gx = (q0[0] + q1[0] + tip[0]) / 3, gy = (q0[1] + q1[1] + tip[1]) / 3;
        const lit = q => { const mx = (q[0] + tip[0]) / 2, my = (q[1] + tip[1]) / 2; let ex = -(tip[1] - q[1]), ey = tip[0] - q[0]; if (ex * (mx - gx) + ey * (my - gy) < 0) { ex = -ex; ey = -ey; } return (ex * (wv[0] - mx) + ey * (wv[1] - my)) / (Math.hypot(ex, ey) || 1); };
        teeth.push({ pts: [q0, tip, q1], rim: lit(q0) > lit(q1) ? 0 : 1, a: 0.7 + 0.25 * r() });
      }
    }
    return { id: s.id, cx: s.cx, cy: s.cy, ix: cx, iy: cy, w, h, d: Math.hypot(s.cx - g.vp[0], s.cy - g.vp[1]), shards, cracks, teeth };
  }

  // ---------- per-frame state ----------
  function crackLen(e, t) {
    if (t < e.t0) return 0;
    const u = t - e.t0;
    let L = Math.min(e.Lmax, e.v * (u - 0.9 * Math.sin(TAU * u / 0.8) * 0.8 / TAU));
    if (t > HEAL[0]) L *= 1 - eInOut(clamp((t - HEAL[0]) / (HEAL[1] - HEAL[0])));
    return L;
  }
  function wave(u, r) {
    if (u <= 0 || u > 2.6) return 0;
    const d = (r - u * G.waveV) / G.waveW;
    const d2 = d + 1.7;
    return (Math.exp(-d * d) - 0.42 * Math.exp(-d2 * d2)) * Math.exp(-u * 0.7);
  }
  function popCurve(p) {
    if (p <= 0 || p >= 1) return 0;
    if (p < 0.12) return -0.3 * Math.sin(Math.PI * p / 0.12);
    if (p < 0.62) return easeBack(clamp((p - 0.12) / 0.16));
    return 1 - eInOut((p - 0.62) / 0.38);
  }

  function prep(S) {
    if (!G || G.ref !== S.screenZones || G.W !== innerWidth || G.H !== innerHeight) { G = build(S); F = null; }
    const g = G, t = S.t, T = S.T, n = g.bricks.length, bh = g.bh;
    if (F && F.t === t && F.T === T) return;
    if (!F) {
      const fa = () => new Float32Array(n);
      F = { st: new Uint8Array(n), zz: fa(), rot: fa(), ox: fa(), oy: fa(), sc: fa(), al: fa(), fl: fa(), hot: fa(), gl: fa(), tau: fa() };
    }
    const f = F;
    f.t = t; f.T = T;
    for (const e of g.eps) { e.L = crackLen(e, t); e.heat = smooth(e.t0, e.t0 + 2.5, t) * (1 - smooth(HEAL[0], HEAL[1], t)) * (0.75 + 0.25 * flicker(T, e.i)); }
    f.va = smooth(FALL0 - 0.3, FALL0 + 0.7, t) * (1 - smooth(BACK0 + BACK_SPAN + 0.6, THUMP + 0.2, t));
    f.crackA = (1 - smooth(FALL0 + 0.2, FALL0 + 1.4, t)) + smooth(THUMP - 0.15, THUMP + 0.05, t);
    f.holes = t >= FALL0 && t < BACK0 + BACK_SPAN + BACK_DUR + 0.3;
    // tremor (screen px)
    let amp = smooth(CRACK0, FALL0, t) * 0.08 + (t > FALL0 ? 0.45 * Math.exp(-(t - FALL0) * 1.3) : 0) + smooth(FALL0, FALL0 + 1, t) * (1 - smooth(FALL0 + 2.5, FALL0 + 4, t)) * 0.1;
    let bg = 0;
    for (const tb of BEATS) {
      if (t <= tb) continue;
      amp += 0.14 * Math.exp(-(t - tb) * 12);
      bg += 0.6 * Math.exp(-(t - tb) * 2.6) + (t > tb + 0.24 ? 0.4 * Math.exp(-(t - tb - 0.24) * 3) : 0);
    }
    if (t > THUMP) amp += 0.3 * Math.exp(-(t - THUMP) * 8);
    amp *= bh;
    f.sx = Math.sin(T * 53.1) * amp; f.sy = Math.cos(T * 47.3) * amp * 0.8;
    f.beatGlow = Math.min(1.2, bg) * smooth(3.4, 4.4, t) * (1 - smooth(FALL0, FALL0 + 1, t));
    // grazing light
    let glp = null;
    for (const [a, b] of [GLINT, GLINT2]) if (t > a && t < b) glp = lerp(-0.3, 1.3, eSine((t - a) / (b - a)));
    const B = g.B;
    let anyFx = false;
    for (let i = 0; i < n; i++) {
      const b = g.bricks[i];
      let st = 1, zz = 0, rot = 0, ox = 0, oy = 0, sc = 1, al = 1, fl = 0, hot = 0, tau = 0;
      const a = (t - b.ta) / 0.5;
      if (a <= 0) st = 0;
      else if (a < 1) { sc = 0.55 + 0.45 * easeBack(a); al = smooth(0, 0.3, a); fl = (1 - a) ** 3 * 0.9; zz += 1.6 * (1 - a) ** 2; }
      const d = (t - b.tz) / 0.5;
      if (d >= 1) st = 0;
      else if (d > 0) { al *= 1 - smooth(0.25, 1, d); fl = Math.max(fl, Math.sin(Math.PI * d) * 0.55); sc *= 1 + 0.2 * d; zz += 1.4 * d; }
      if (st) {
        // heartbeats (lub-dub) and final blow: the wavefront bulges the bricks and lights their edges
        let wz = 0;
        for (let k = 0; k < BEATS.length; k++) {
          const u = t - BEATS[k];
          if (u <= 0 || u > 2.9) continue;
          const am = 1.8 + 0.3 * k;
          wz += am * wave(u, b.r) + am * 0.6 * wave(u - 0.24, b.r);
        }
        if (t > THUMP) wz += 2.2 * wave(t - THUMP, b.r);
        zz += wz;
        if (wz > 0.25) hot = Math.min(0.75, (wz - 0.25) * 0.32);
        if (b.pop > 0) zz += 1.25 * popCurve((t - b.pop) / 1.2);
        if (b.ce >= 0) {
          const k = smooth(b.cs, b.cs + bh * 3, g.eps[b.ce].L);
          if (k > 0) {
            zz += k * b.cz; rot += k * b.crot; ox += k * b.cox; oy += k * b.coy;
            hot = Math.max(hot, k * (0.3 + 0.35 * flicker(T, b.ph)));
          }
        }
        if (!b.keep) {
          const u = t - b.tf + 0.7;
          if (u > 0 && u < 0.7) { const k = u / 0.7; rot += Math.sin(T * 50 + b.ph * 7) * 0.05 * k; zz += 0.5 * k * k; ox += Math.sin(T * 63 + b.ph * 3) * bh * 0.06 * k; hot = Math.max(hot, k * 0.6); }
          if (t >= b.tf) {
            const p = (t - b.tb) / BACK_DUR;
            if (t < b.tb) {
              const tt = t - b.tf;
              if (tt < b.tout) { st = 2; tau = tt; } else st = 4;
            } else if (p < 1) { st = 3; tau = b.tout * (1 - easeBack(p)); } else {
              const u2 = t - b.tb - BACK_DUR;
              zz += 0.8 * Math.exp(-u2 * 7) * Math.cos(u2 * 22); fl = Math.max(fl, Math.exp(-u2 * 9) * 0.6);
            }
          }
        }
        if (glp !== null) { const q = (b.x - B.x0) / B.w * 0.8 + (b.y - B.y0) / B.h * 0.2 - glp; f.gl[i] = Math.exp(-(q * q) / 0.006) * 0.6; } else f.gl[i] = 0;
      }
      if (st === 1 && (hot >= 0.02 || fl >= 0.02 || f.gl[i] >= 0.02)) anyFx = true;
      f.st[i] = st; f.zz[i] = zz; f.rot[i] = rot; f.ox[i] = ox; f.oy[i] = oy; f.sc[i] = sc; f.al[i] = al; f.fl[i] = fl; f.hot[i] = hot; f.tau[i] = tau;
    }
    f.anyFx = anyFx;
    f.needVoid = f.va > 0.01 || f.beatGlow > 0.01 || g.eps.some(e => e.heat > 0.01);
    if (f.needVoid) renderVoid(g, f, t, T);
  }

  // ---------- fire abyss (screen px, low resolution) ----------
  function renderVoid(g, f, t, T) {
    const c = g.vctx, B = g.B, q = g.vq, [vx, vy] = g.vp, bh = g.bh, va = f.va;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = '#000'; c.fillRect(0, 0, g.vc.width, g.vc.height);
    c.setTransform(q, 0, 0, q, -B.x0 * q, -B.y0 * q);
    c.globalCompositeOperation = 'lighter';
    const pre = 1 - va;
    if (pre > 0.01) {
      for (const e of g.eps) if (e.heat > 0.01) glow(c, e.x, e.y, bh * 3 + e.L * 0.9, [255, 70, 8], e.heat * 0.7 * pre);
      // each heartbeat: red pulse seeping through the joints
      if (f.beatGlow > 0.01) glow(c, vx, vy, B.w * 0.55, [255, 55, 6], Math.min(1, f.beatGlow * 0.8) * pre);
    }
    if (va > 0.01) {
      c.globalCompositeOperation = 'source-over';
      const fl = flicker(T, 3);
      for (const tn of g.tun) drawTunnel(c, g, tn, t, T, va, fl);
      // dark smoke rising
      c.globalCompositeOperation = 'source-over';
      for (let k = 0; k < 4; k++) {
        const u = (T * 0.06 + k / 4) % 1, x = B.x0 + B.w * ((k * 0.37 + 0.1) % 1) + Math.sin(T * 0.4 + k) * B.w * 0.04;
        const y = B.y1 - u * B.h * 1.3, r = B.h * 0.32;
        c.globalAlpha = va * 0.55 * Math.sin(Math.PI * u);
        c.drawImage(g.blk, x - r, y - r, r * 2, r * 2);
      }
      // the head: a bag of darkness that grows behind the eyes
      const ha = smooth(EYES[0] - 0.7, EYES[0] + 0.2, t) * (1 - smooth(EYES[1] - 0.3, EYES[1] + 0.4, t));
      if (ha > 0.01) {
        const [ex, ey] = g.eyeAt, ew = g.eyeW, bob = Math.sin(T * 1.3) * ew * 0.06, rise = (1 - eOut3(clamp((t - EYES[0] + 0.7) / 1.1))) * ew * 1.2;
        c.globalAlpha = va * ha * 0.85;
        c.drawImage(g.blk, ex - ew * 2.6, ey - ew * 2.2 + rise, ew * 5.2, ew * 5.2);
        // silhouette: skull, horns and shoulders, cut out against the fire
        c.globalAlpha = va * ha;
        c.fillStyle = '#000';
        c.save(); c.translate(ex, ey + bob + rise);
        c.beginPath(); c.ellipse(0, ew * 0.2, ew * 1.5, ew * 1.4, 0, 0, TAU); c.fill();
        for (const sd of [-1, 1]) {
          c.beginPath(); c.moveTo(sd * ew * 0.75, -ew * 1.05); c.quadraticCurveTo(sd * ew * 1.9, -ew * 1.6, sd * ew * 1.55, -ew * 2.6);
          c.quadraticCurveTo(sd * ew * 1.5, -ew * 1.55, sd * ew * 1.45, -ew * 0.55); c.closePath(); c.fill();
        }
        c.beginPath(); c.moveTo(-ew * 0.9, ew * 1.3); c.quadraticCurveTo(-ew * 2.6, ew * 1.6, -ew * 3, ew * 4); c.lineTo(ew * 3, ew * 4); c.quadraticCurveTo(ew * 2.6, ew * 1.6, ew * 0.9, ew * 1.3); c.closePath(); c.fill();
        c.restore();
      }
      c.globalAlpha = 1;
    }
    c.globalCompositeOperation = 'source-over';
  }

  // brick tunnel toward each wall's vanishing point, with the zone's real silhouette:
  // nearly black faces, glowing joints (the light comes out of the lines), white-hot core
  // and continuous rivers of lava across the floor flowing toward the viewer
  const T_FACE = { top: 0.5, side: 0.75, bot: 1 };
  function drawTunnel(c, g, tn, t, T, va, fl) {
    const P = tn.p, n = P.length, [vx, vy] = tn.vp, bh = g.bh;
    if (!tn.path) { tn.path = new Path2D(); P.forEach(([x, y], k) => (k ? tn.path.lineTo(x, y) : tn.path.moveTo(x, y))); tn.path.closePath(); }
    const flow = t < BACK0 - 0.4 ? (t - FALL0) * 0.55 : (BACK0 - 0.4 - FALL0) * 0.55 - (t - BACK0 + 0.4) * 1.6;
    const SP = 0.42, DMAX = 7.5, j0 = Math.floor(flow) - 1;
    const ringD = j => 1 + (j - flow) * SP;
    const pt = (k, d) => [vx + (P[k][0] - vx) / d, vy + (P[k][1] - vy) / d];
    c.save();
    c.clip(tn.path);
    // back: glowing mouth
    c.globalAlpha = va;
    c.fillStyle = 'rgb(255,236,190)';
    c.beginPath(); for (let k = 0; k < n; k++) { const q = pt(k, DMAX); k ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]); } c.closePath(); c.fill();
    // bands: dark faces
    const bands = [];
    for (let j = j0 + Math.ceil(DMAX / SP) + 2; j >= j0; j--) {
      const da = ringD(j), db = ringD(j + 1);
      if (db <= 0.6 || da > DMAX) continue;
      const dN = Math.max(0.6, da), dF = Math.min(DMAX, db), lum = clamp((dF - 1) / (DMAX - 1));
      bands.push([j, dN, dF, lum, clamp((DMAX - da) / 1.2)]);
    }
    for (const [j, dN, dF, lum, fade] of bands) {
      const L = lum ** 2.4;
      c.globalAlpha = va * fade;
      for (const E of tn.E) {
        const k = T_FACE[E.kind] * L, a1 = pt(E.a, dN), a2 = pt(E.b, dN), b1 = pt(E.a, dF), b2 = pt(E.b, dF);
        quad(c, a1[0], a1[1], a2[0], a2[1], b2[0], b2[1], b1[0], b1[1], rgba([6 + 84 * k, 1 + 21 * k, 4 * k]));
      }
    }
    // glowing joints: ring + staggered mortar
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    for (const [j, dN, dF, lum, fade] of bands) {
      c.globalAlpha = va * fade * (0.3 + 0.7 * lum ** 1.4);
      c.strokeStyle = rgba(mix([255, 110, 25], [255, 232, 165], lum ** 1.5));
      c.lineWidth = bh * 0.35 / dN;
      c.beginPath();
      const off = (j & 1) ? 0.5 : 0;
      for (const E of tn.E) {
        const a1 = pt(E.a, dN), a2 = pt(E.b, dN), b1 = pt(E.a, dF), b2 = pt(E.b, dF);
        c.moveTo(a1[0], a1[1]); c.lineTo(a2[0], a2[1]);
        for (let q = 0; q < E.nj; q++) {
          const u = (q + off + 0.25) / E.nj;
          c.moveTo(lerp(a1[0], a2[0], u), lerp(a1[1], a2[1], u)); c.lineTo(lerp(b1[0], b2[0], u), lerp(b1[1], b2[1], u));
        }
      }
      c.stroke();
    }
    // lava rivers across the floor: continuous strips whose glow travels with the bands
    const Fa = P[tn.floor.a], Fb = P[tn.floor.b];
    const fp = (u, d) => [vx + (lerp(Fa[0], Fb[0], u) - vx) / d, vy + (lerp(Fa[1], Fb[1], u) - vy) / d];
    for (const rv of tn.rivers) {
      const uu = j => rv.u + rv.am * Math.sin(j * 0.7 + rv.ph);
      for (const [j, dN, dF, lum, fade] of bands) {
        const un = uu(j), uf = uu(j + 1), br = 0.35 + 0.65 * noise1(j * 0.9 + rv.ph);
        for (const [wk, col, al] of [[1, 'rgb(255,90,10)', 0.9], [0.38, 'rgb(255,215,130)', 0.95]]) {
          const w = rv.w * wk, p1 = fp(un - w, dN), p2 = fp(un + w, dN), p3 = fp(uf + w, dF), p4 = fp(uf - w, dF);
          c.globalAlpha = va * fade * br * al;
          quad(c, p1[0], p1[1], p2[0], p2[1], p3[0], p3[1], p4[0], p4[1], col);
        }
      }
    }
    // tunnel edges and glow from the back
    c.globalAlpha = va * 0.45;
    c.strokeStyle = 'rgb(255,120,30)'; c.lineWidth = bh * 0.3;
    c.beginPath();
    for (let k = 0; k < n; k++) { const p = pt(k, 1.6), q = pt(k, DMAX); c.moveTo(p[0], p[1]); c.lineTo(q[0], q[1]); }
    c.stroke();
    const Rc = Math.min(tn.R2, (tn.bb[3] - tn.bb[1]) * 1.2) / DMAX * (2.4 + 0.4 * fl);
    c.globalAlpha = va * (0.75 + 0.25 * fl) * tn.I;
    c.drawImage(g.core, vx - Rc, vy - Rc, Rc * 2, Rc * 2);
    // vignette: the near part sinks into shadow
    c.globalCompositeOperation = 'source-over';
    c.globalAlpha = va;
    c.drawImage(g.vig, vx - tn.R2, vy - tn.R2, tn.R2 * 2, tn.R2 * 2);
    // flame tongues at the edge of the floor
    c.globalCompositeOperation = 'lighter';
    const fw = Math.hypot(Fb[0] - Fa[0], Fb[1] - Fa[1]) / 4;
    for (let k = 0; k < 3; k++) {
      const u = (k + 0.5) / 3 + Math.sin(T * 1.9 + k * 2.1) * 0.04, fh = fw * (0.9 + 1.1 * noise1(T * 1.7 + k * 3.7 + tn.R2));
      const x = lerp(Fa[0], Fb[0], u), y = lerp(Fa[1], Fb[1], u);
      c.globalAlpha = va * 0.5 * tn.I;
      c.drawImage(g.flame, x - fw * 0.6, y - fh, fw * 1.2, fh * 2);
    }
    c.restore();
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  // slit eyes that open in the dark, look left and right, see us (narrow and
  // dilate the pupil), blink and close. At full resolution, in screen px.
  function drawEyes(c, g, t, T, va) {
    if (t < EYES[0] || t > EYES[1]) return;
    let open = easeBack(clamp((t - EYES[0]) / 0.45)) * (1 - eInOut(clamp((t - EYES[1] + 0.4) / 0.4)));
    const bl = (t - BLINK) / 0.24;
    if (bl > 0 && bl < 1) open *= Math.abs(Math.cos(Math.PI * bl));
    const sq = smooth(19.3, 19.65, t) * (1 - smooth(19.95, 20.2, t));
    open *= 1 - 0.42 * sq;
    if (open <= 0.02) return;
    const dil = 1 + 1.4 * smooth(19.4, 19.75, t) * (1 - smooth(20.4, 20.8, t));
    const [ex, ey] = g.eyeAt, ew = g.eyeW, eh = ew * 0.42;
    const look = -eInOut(clamp((t - 17.95) / 0.3)) + 2 * eInOut(clamp((t - 18.5) / 0.35)) - eInOut(clamp((t - 19.1) / 0.3));
    const bob = Math.sin(T * 1.3) * eh * 0.15;
    for (const sd of [-1, 1]) {
      const px = look * ew * 0.2 - sd * sq * ew * 0.07;
      c.save();
      c.translate(ex + sd * ew * 0.82 + look * ew * 0.08, ey + bob);
      c.rotate(-sd * (0.22 + 0.1 * sq));
      glow(c, 0, 0, ew * 1.4, [255, 120, 15], (0.5 + 0.3 * sq) * va * Math.min(1, open));
      c.scale(1, Math.max(0.03, open));
      c.beginPath(); c.moveTo(-ew / 2, 0); c.quadraticCurveTo(0, -eh * 1.25, ew / 2, 0); c.quadraticCurveTo(0, eh * 1.05, -ew / 2, 0); c.closePath();
      const gr = c.createRadialGradient(px * 0.6, 0, 0, 0, 0, ew * 0.55);
      gr.addColorStop(0, rgba([255, 253, 215], va)); gr.addColorStop(0.45, rgba([255, 210, 60], va)); gr.addColorStop(1, rgba([230, 80, 8], va));
      c.fillStyle = gr; c.fill();
      c.lineWidth = eh * 0.16; c.strokeStyle = rgba([25, 4, 0], va); c.stroke();
      c.fillStyle = rgba([8, 0, 0], va); ell(c, px, 0, ew * 0.075 * dil, eh * 0.66);
      c.restore();
    }
  }

  // ---------- per-zone data: homography and transforms for each brick ----------
  function zoneData(z) {
    const g = G, W = innerWidth, H = innerHeight, p = z.pts;
    const sig = g.gen + ':' + z.w + 'x' + z.h + ':' + p[0][0] + ',' + p[0][1] + ',' + p[1][0] + ',' + p[1][1] + ',' + p[2][0] + ',' + p[2][1] + ',' + p[3][0] + ',' + p[3][1];
    const old = z.cache.derrumbe;
    if (old && old.sig === sig) return old;
    const sp = p.map(([x, y]) => [x * W, y * H]);
    const Hs = sq2quad(sp), Mi = inv3(Hs);
    const M = [Mi[0] * z.w, Mi[1] * z.w, Mi[2] * z.w, Mi[3] * z.h, Mi[4] * z.h, Mi[5] * z.h, Mi[6], Mi[7], Mi[8]];
    const map = (x, y) => hp(M, x, y);
    const jac = (x, y) => { const a = map(x, y), b = map(x + 1, y), c = map(x, y + 1); return [a[0], a[1], b[0] - a[0], b[1] - a[1], c[0] - a[0], c[1] - a[1]]; };
    const idx = Int32Array.from(g.zoneBricks.get(z.id) || []);
    const tf = new Float32Array(idx.length * 6);
    idx.forEach((i, k) => tf.set(jac(g.bricks[i].x, g.bricks[i].y), k * 6));
    const ctr = hp(Hs, 0.5, 0.5), jc = jac(ctr[0], ctr[1]);
    const affine = Math.abs(Hs[6]) + Math.abs(Hs[7]) < 0.02, ns = affine ? 1 : 5, strips = [];
    for (let s = 0; s < ns; s++) {
      const y0 = z.h * s / ns, y1 = z.h * (s + 1) / ns, q = hp(Hs, 0.5, (y0 + y1) / 2 / z.h), j = jac(q[0], q[1]);
      // screen box of the strip (to clip what overflows)
      const cn = [[0, y0 - 2], [z.w, y0 - 2], [0, y1 + 2], [z.w, y1 + 2]].map(([u, v]) => hp(Hs, u / z.w, v / z.h));
      const bx = cn.map(c => c[0]), by = cn.map(c => c[1]);
      strips.push({ y0: y0 - 1, y1: y1 + 1, m: [j[2], j[3], j[4], j[5], j[0] - j[2] * q[0] - j[4] * q[1], j[1] - j[3] * q[0] - j[5] * q[1]],
        bb: [Math.min(...bx) - 4, Math.min(...by) - 4, Math.max(...bx) + 4, Math.max(...by) + 4] });
    }
    // cracks of this zone in zone px
    const x0 = Math.min(...sp.map(q => q[0])) - g.bw, x1 = Math.max(...sp.map(q => q[0])) + g.bw;
    const y0 = Math.min(...sp.map(q => q[1])) - g.bh, y1 = Math.max(...sp.map(q => q[1])) + g.bh;
    const cs = [];
    g.segs.forEach((sg, k) => {
      if (Math.max(sg.x1, sg.x2) < x0 || Math.min(sg.x1, sg.x2) > x1 || Math.max(sg.y1, sg.y2) < y0 || Math.min(sg.y1, sg.y2) > y1) return;
      cs.push(k);
    });
    const Z = { sig, M, map, idx, tf, jc, sc: Math.sqrt(Math.abs(jc[2] * jc[5] - jc[3] * jc[4])), strips, cs, pro: [], fr: new Float32Array(idx.length * 4) };
    const wd = g.winById.get(z.id);
    if (wd) {
      Z.wcr = wd.cracks.map(([ax, ay, bx, by, st, dl]) => [...map(ax, ay), ...map(bx, by), st, dl]);
      Z.teeth = wd.teeth.map(tr => ({ pts: tr.pts.map(([x, y]) => map(x, y)), rim: tr.rim, a: tr.a }));
    }
    z.cache.derrumbe = Z;
    return Z;
  }

  // draws in screen px inside the zone: affine by strips to follow the homography
  function inScreen(ctx, Z, fn) {
    const f = F, sx = f.sx, sy = f.sy;
    for (const s of Z.strips) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.save();
      if (Z.strips.length > 1) { ctx.beginPath(); ctx.rect(-4, s.y0, 1e5, s.y1 - s.y0); ctx.clip(); }
      const m = s.m;
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4] + m[0] * sx + m[2] * sy, m[5] + m[1] * sx + m[3] * sy);
      fn();
      ctx.restore();
    }
  }
  // pastes the abyss into the zone
  function blitVoid(ctx, Z, a) {
    const g = G;
    if (!F.needVoid || a <= 0) return;
    const B = g.B, q = g.vq, f = F;
    for (const s of Z.strips) {
      // only the part of the abyss that falls in this strip
      const x0 = Math.max(B.x0, s.bb[0] - f.sx), y0 = Math.max(B.y0, s.bb[1] - f.sy);
      const x1 = Math.min(B.x0 + g.vc.width / q, s.bb[2] - f.sx), y1 = Math.min(B.y0 + g.vc.height / q, s.bb[3] - f.sy);
      if (x1 <= x0 || y1 <= y0) continue;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (Z.strips.length > 1) { ctx.beginPath(); ctx.rect(-4, s.y0, 1e5, s.y1 - s.y0); ctx.clip(); }
      const m = s.m;
      ctx.setTransform(m[0], m[1], m[2], m[3], m[4] + m[0] * f.sx + m[2] * f.sy, m[5] + m[1] * f.sx + m[3] * f.sy);
      ctx.globalAlpha = a;
      ctx.drawImage(g.vc, (x0 - B.x0) * q, (y0 - B.y0) * q, (x1 - x0) * q, (y1 - y0) * q, x0, y0, x1 - x0, y1 - y0);
      ctx.restore();
    }
  }

  // ---------- walls ----------
  function drawWall(ctx, Z) {
    const g = G, f = F, idx = Z.idx, tf = Z.tf, n = idx.length, BR = g.bricks, fw = g.fw, fh = g.fh, sx = f.sx, sy = f.sy;
    blitVoid(ctx, Z, 1);
    const put = (k, i) => {
      const o = k * 6, a = tf[o + 2], b = tf[o + 3], c = tf[o + 4], d = tf[o + 5], ox = f.ox[i] + sx, oy = f.oy[i] + sy, rot = f.rot[i];
      const e = tf[o] + a * ox + c * oy, ff = tf[o + 1] + b * ox + d * oy;
      if (rot === 0) ctx.setTransform(a, b, c, d, e, ff);
      else { const cs = Math.cos(rot), sn = Math.sin(rot); ctx.setTransform(a * cs + c * sn, b * cs + d * sn, c * cs - a * sn, d * cs - b * sn, e, ff); }
    };
    // 1) wall thickness inside the gaps, lit by the fire
    if (f.holes) {
      ctx.globalAlpha = f.va;
      for (let k = 0; k < n; k++) {
        const i = idx[k];
        if (f.st[i] !== 1) continue;
        const b = BR[i];
        const oh = b.nh >= 0 && f.st[b.nh] >= 2, ov = (b.nv1 >= 0 && f.st[b.nv1] >= 2) || (b.nv2 >= 0 && f.st[b.nv2] >= 2);
        if (!oh && !ov) continue;
        put(k, i);
        const bx = -b.dx * DEPTH, by = -b.dy * DEPTH, s = 1 - DEPTH;
        if (oh) { const xa = b.hx * fw, xb = bx + b.hx * fw * s; quad(ctx, xa, -fh, xa, fh, xb, by + fh * s, xb, by - fh * s, 'rgb(205,82,26)'); }
        if (ov) { const ya = b.hy * fh, yb = by + b.hy * fh * s; quad(ctx, -fw, ya, fw, ya, bx + fw * s, yb, bx - fw * s, yb, b.hy < 0 ? 'rgb(150,48,14)' : 'rgb(255,140,50)'); }
      }
    }
    // 2) flat and recessed bricks
    const pro = Z.pro, fr = Z.fr;
    pro.length = 0;
    for (let k = 0; k < n; k++) {
      const i = idx[k];
      if (f.st[i] !== 1) continue;
      const z = f.zz[i];
      if (z > 0.035) { pro.push(k); continue; }
      const b = BR[i], spr = g.spr[b.lv][b.v];
      put(k, i);
      ctx.globalAlpha = f.al[i];
      let s = f.sc[i], cx = 0, cy = 0;
      if (z < -0.035) { const zk = -z * KZ; s *= 1 - zk * 2.5; cx = -b.dx * zk; cy = -b.dy * zk; }
      const X = cx - fw * s, Y = cy - fh * s, Wd = fw * 2 * s, Ht = fh * 2 * s;
      ctx.drawImage(spr, X, Y, Wd, Ht);
      if (z < -0.035) { ctx.globalAlpha = f.al[i] * Math.min(0.7, -z * 0.9); ctx.fillStyle = '#000'; ctx.fillRect(X, Y, Wd, Ht); }
      fr[k * 4] = X; fr[k * 4 + 1] = Y; fr[k * 4 + 2] = Wd; fr[k * 4 + 3] = Ht;
    }
    // 3) protruding bricks: shadow, side face and front face, back to front
    if (pro.length) {
      pro.sort((a, b) => f.zz[idx[a]] - f.zz[idx[b]]);
      for (const k of pro) {
        const i = idx[k], b = BR[i], z = f.zz[i], al = f.al[i];
        put(k, i);
        const zk = z * KZ, s = f.sc[i] * (1 + zk * 3), cx = b.dx * zk, cy = b.dy * zk;
        const so = Math.min(z, 2.2), sp = g.sp;
        ctx.globalAlpha = al * Math.min(0.85, z * 0.7);
        ctx.drawImage(g.shadow, so * g.bh * 0.32 - fw - sp, so * g.bh * 0.5 - fh - sp, (fw + sp) * 2, (fh + sp) * 2);
        ctx.globalAlpha = al;
        const fc = g.faces[b.lv][b.v], X0 = cx - fw * s, X1 = cx + fw * s, Y0 = cy - fh * s, Y1 = cy + fh * s;
        if (cx > 0) quad(ctx, -fw, -fh, -fw, fh, X0, Y1, X0, Y0, fc.side);
        else quad(ctx, fw, -fh, fw, fh, X1, Y1, X1, Y0, fc.side);
        if (cy > 0) quad(ctx, -fw, -fh, fw, -fh, X1, Y0, X0, Y0, fc.top);
        else quad(ctx, -fw, fh, fw, fh, X1, Y1, X0, Y1, fc.bot);
        ctx.drawImage(g.spr[b.lv][b.v], X0, Y0, X1 - X0, Y1 - Y0);
        fr[k * 4] = X0; fr[k * 4 + 1] = Y0; fr[k * 4 + 2] = X1 - X0; fr[k * 4 + 3] = Y1 - Y0;
      }
    }
    // 4) additive light: lava, grazing light, glints (cool when building, warm when rewinding)
    const flc = f.t > FALL0 && f.t < OUT[0] - 0.5 ? 'rgb(255,190,120)' : 'rgb(170,225,255)';
    ctx.globalCompositeOperation = 'lighter';
    for (let k = 0; f.anyFx && k < n; k++) {
      const i = idx[k];
      if (f.st[i] !== 1) continue;
      const h = f.hot[i], gl = f.gl[i], fl = f.fl[i];
      if (h < 0.02 && gl < 0.02 && fl < 0.02) continue;
      put(k, i);
      const o = k * 4, X = fr[o], Y = fr[o + 1], Wd = fr[o + 2], Ht = fr[o + 3];
      if (h >= 0.02) { ctx.globalAlpha = h * f.al[i]; ctx.drawImage(g.hot, X, Y, Wd, Ht); }
      if (gl >= 0.02) { ctx.globalAlpha = gl * f.al[i]; ctx.drawImage(g.hl, X, Y, Wd, Ht); }
      if (fl >= 0.02) { ctx.globalAlpha = fl; ctx.drawImage(g.hl, X, Y, Wd, Ht); ctx.globalAlpha = fl * 0.35; ctx.fillStyle = flc; ctx.fillRect(X, Y, Wd, Ht); }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    drawCracks(ctx, Z);
  }

  // cracks with lava, traced in screen px (uniform thickness also on the gable)
  function drawCracks(ctx, Z) {
    const g = G, f = F, a = Math.min(1, f.crackA), cs = Z.cs;
    if (a <= 0.01 || !cs.length) return;
    const p1 = new Path2D(), p2 = new Path2D();
    let any = false;
    for (let k = 0; k < cs.length; k++) {
      const sg = g.segs[cs[k]], L = g.eps[sg.e].L;
      if (L <= sg.s0) continue;
      const u = Math.min(1, (L - sg.s0) / (sg.s1 - sg.s0)), p = sg.w > 0.7 ? p1 : p2;
      p.moveTo(sg.x1, sg.y1); p.lineTo(sg.x1 + (sg.x2 - sg.x1) * u, sg.y1 + (sg.y2 - sg.y1) * u);
      any = true;
    }
    if (!any) return;
    const u = g.bh, pul = 0.85 + 0.15 * flicker(f.T, 7);
    inScreen(ctx, Z, () => {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (const [col, lw, al] of CRACK_PASSES) {
        ctx.strokeStyle = col; ctx.globalAlpha = al * a * pul;
        ctx.lineWidth = u * lw; ctx.stroke(p1);
        ctx.lineWidth = u * lw * 0.6; ctx.stroke(p2);
      }
    });
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // ---------- windows ----------
  function drawWindow(ctx, z, Z, S) {
    const g = G, f = F, t = S.t, T = S.T, w = z.w, h = z.h, m = Math.min(w, h);
    const wd = g.winById.get(z.id);
    if (!wd) return;
    const done = wd.tr + 0.9, broken = t >= wd.ts && t < done;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (broken) {
      blitVoid(ctx, Z, 1);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // glass teeth stuck to the frame; only the edge facing the fire lights up
      if (t < wd.tr + 0.6) {
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,175,80,0.9)'; ctx.lineWidth = Math.max(1, m * 0.008);
        for (const tr of Z.teeth) {
          const q = tr.pts;
          ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]); ctx.lineTo(q[1][0], q[1][1]); ctx.lineTo(q[2][0], q[2][1]); ctx.closePath();
          ctx.fillStyle = rgba([0, 0, 0], tr.a); ctx.fill();
          const e = q[tr.rim ? 2 : 0];
          ctx.beginPath(); ctx.moveTo(e[0], e[1]); ctx.lineTo(q[1][0], q[1][1]); ctx.stroke();
        }
      }
      const k = (t - wd.ts) / 0.35;
      if (k < 1) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba([235, 245, 255], (1 - k) ** 2); ctx.fillRect(0, 0, w, h); ctx.globalCompositeOperation = 'source-over'; }
      return;
    }
    // interior: fire growing inside the house
    let heat = t < wd.ts ? smooth(3.5, FALL0 - 0.6, t) * 0.85 + f.beatGlow * 0.4 : 0.85 * (1 - smooth(done, done + 2.2, t));
    heat *= 0.72 + 0.28 * flicker(T, z.seed);
    if (heat > 0.01) {
      vGradient(ctx, w, h, [[0, rgba([40, 6, 2], heat)], [0.55, rgba([150, 35, 8], heat)], [1, rgba([255, 125, 30], heat)]]);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 4; i++) {
        const fx = w * (0.15 + 0.23 * i) + Math.sin(T * 1.3 + i * 2) * w * 0.04, fh = h * (0.45 + 0.35 * noise1(T * 1.4 + i * 5.3 + z.seed));
        ctx.save(); ctx.translate(fx, h); ctx.scale(1, fh / (w * 0.2)); glow(ctx, 0, 0, w * 0.2, [255, 150, 40], 0.5 * heat); ctx.restore();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalCompositeOperation = 'lighter';
    // cold reflection on the glass
    const u = ((T * 0.07 + hash(z.seed) * 1.6) % 1.6) - 0.3;
    ctx.fillStyle = 'rgba(150,185,255,0.10)';
    ctx.beginPath(); ctx.moveTo((u - 0.1) * w, 0); ctx.lineTo((u + 0.06) * w, 0); ctx.lineTo((u - 0.2) * w, h); ctx.lineTo((u - 0.36) * w, h); ctx.closePath(); ctx.fill();
    // frame traced with the light sweep
    let fa = Math.max(t > wd.tscan ? Math.exp(-(t - wd.tscan) * 2.2) : 0, t > wd.tout ? Math.sin(Math.PI * clamp((t - wd.tout) / 0.6)) : 0) + heat * 0.25;
    // the ring of the final blow lights the frame as it passes
    if (t > THUMP && t < THUMP + 1.1) { const R = eOut3((t - THUMP) / 1.1) * g.B.w * 0.75, dq = (Math.hypot(wd.cx - g.vp[0], wd.cy - g.vp[1]) - R) / (g.B.w * 0.06); fa += Math.exp(-dq * dq) * 1.2; }
    if (fa > 0.01) {
      const lw = m * 0.05;
      ctx.strokeStyle = rgba([150, 220, 255], fa * 0.35); ctx.lineWidth = lw * 3; ctx.strokeRect(0, 0, w, h);
      ctx.strokeStyle = rgba([220, 245, 255], fa); ctx.lineWidth = lw; ctx.strokeRect(lw / 2, lw / 2, w - lw, h - lw);
    }
    // cracks in the glass (before the burst) or seams melting shut (after)
    const seam = t >= done ? 1 - smooth(done, done + 0.9, t) : 0;
    if (t < wd.ts ? t > wd.tc1 : seam > 0.01) {
      ctx.lineCap = 'round';
      for (const [col, lw, al] of [['rgb(140,190,255)', 3.2, 0.35], ['rgb(245,250,255)', 1, 1]]) {
        ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, m * 0.012 * lw); ctx.globalAlpha = al * (t < wd.ts ? 1 : seam);
        ctx.beginPath();
        for (const [ax, ay, bx, by, st, dl] of Z.wcr) {
          const k = t >= wd.ts ? 1 : clamp((t - (st === 1 ? wd.tc1 : wd.tc2) - dl) / 0.18);
          if (k <= 0) continue;
          ctx.moveTo(ax, ay); ctx.lineTo(lerp(ax, bx, k), lerp(ay, by, k));
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // white flash at each new phase of cracks
    for (const tc of [wd.tc1, wd.tc2]) {
      const k = (t - tc) / 0.3;
      if (k > 0 && k < 1 && t < wd.ts) { ctx.fillStyle = rgba([225, 238, 255], 0.55 * (1 - k) ** 2); ctx.fillRect(0, 0, w, h); }
    }
    // flash on reassembly
    if (t >= done && t < done + 0.5) { ctx.fillStyle = rgba([220, 240, 255], (1 - (t - done) / 0.5) ** 2 * 0.8); ctx.fillRect(0, 0, w, h); }
    ctx.globalCompositeOperation = 'source-over';
  }

  // ---------- door (red: only very bright light) ----------
  function drawDoor(ctx, z, Z, S) {
    const f = F, t = S.t, T = S.T, w = z.w, h = z.h, m = Math.min(w, h);
    const open = smooth(FALL0 - 0.15, FALL0 + 0.2, t) * (1 - smooth(DOOR_SHUT, DOOR_SHUT + 0.5, t));
    if (open > 0.01) {
      // oven: nearly white light (on the red door it reads red and incandescent) with dark shapes on top
      const fk = flicker(T, 11);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = rgba([255, 248, 225], 0.85 * open); ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, w / 2, h * 0.62, Math.max(w, h) * 0.6, [255, 255, 245], open * (0.35 + 0.4 * fk));
      ctx.globalCompositeOperation = 'source-over';
      // heat haze: black bars that ripple
      ctx.fillStyle = rgba([0, 0, 0], 0.62 * open);
      for (let i = 0; i < 3; i++) {
        const bx = w * (0.18 + 0.32 * i) + Math.sin(T * 0.9 + i * 2.3) * w * 0.07, bw2 = w * (0.05 + 0.025 * i);
        ctx.beginPath();
        for (let k = 0; k <= 8; k++) { const y = h * k / 8, x = bx + Math.sin(k * 1.3 - T * 5 + i) * w * 0.03; k ? ctx.lineTo(x - bw2, y) : ctx.moveTo(x - bw2, y); }
        for (let k = 8; k >= 0; k--) { const y = h * k / 8, x = bx + Math.sin(k * 1.3 - T * 5 + i) * w * 0.03; ctx.lineTo(x + bw2, y); }
        ctx.closePath(); ctx.fill();
      }
      // someone crosses in front of the fire
      const fp = (t - 15.9) / 1.5;
      if (fp > 0 && fp < 1) {
        const fx = lerp(-0.45, 1.45, eInOut(fp)) * w, by = Math.abs(Math.sin(fp * Math.PI * 4)) * h * 0.025;
        ctx.save(); ctx.translate(0, h * 0.1 + by);
        drawFigure(ctx, w, h * 0.95, fx, rgba([0, 0, 0], 0.95 * open));
        ctx.restore();
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const shut = 1 - open;
    const leak = (smooth(2.6, 6, t) * 0.45 + f.beatGlow * 0.9 + smooth(CRACK0, FALL0, t) * 0.55) * (1 - smooth(25.8, 27.2, t)) * (0.75 + 0.25 * flicker(T, 5)) * shut;
    if (leak <= 0.01) return;
    ctx.globalCompositeOperation = 'lighter';
    // gap at the bottom and its glow
    const gh = h * 0.035;
    ctx.fillStyle = rgba([255, 248, 225], Math.min(1, leak * 1.2)); ctx.fillRect(0, h - gh, w, gh);
    const gr = ctx.createLinearGradient(0, h, 0, h * 0.45);
    gr.addColorStop(0, rgba([255, 205, 120], leak * 0.7)); gr.addColorStop(1, rgba([255, 120, 40], 0));
    ctx.fillStyle = gr; ctx.fillRect(0, h * 0.45, w, h * 0.55);
    // gaps at the sides and top
    const lw = Math.max(1, w * 0.04);
    ctx.fillStyle = rgba([255, 235, 190], leak * 0.75);
    ctx.fillRect(0, 0, lw, h); ctx.fillRect(w - lw, 0, lw, h); ctx.fillRect(0, 0, w, lw);
    // keyhole
    const kx = w * 0.78, ky = h * 0.54, kr = m * 0.075;
    glow(ctx, kx, ky, kr * 5, [255, 210, 130], leak * 0.7);
    ctx.fillStyle = rgba([255, 250, 230], Math.min(1, leak * 1.3));
    ctx.beginPath(); ctx.arc(kx, ky, kr, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(kx - kr * 0.55, ky); ctx.lineTo(kx + kr * 0.55, ky); ctx.lineTo(kx + kr * 0.9, ky + kr * 2.6); ctx.lineTo(kx - kr * 0.9, ky + kr * 2.6); ctx.closePath(); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }

  return {
    name: 'Collapse',
    duration: DUR,
    ambience: 0.4,
    update(S) {
      prep(S);
      const g = G, pan = x => clamp((x / g.W) * 2 - 1, -1, 1);
      const sfx = (name, o) => { if (typeof Sound[name] === 'function') Sound[name](o); };
      if (S.crossed(SCAN[0])) sfx('whoosh', { dur: SCAN[1] - SCAN[0], pan: [pan(g.B.x0), pan(g.B.x1)], vel: 0.35 });
      BEATS.forEach((tb, k) => { if (S.crossed(tb)) sfx('heartbeat', { vel: 0.7 + k * 0.05 }); });
      if (S.crossed(CRACK0 - 0.2)) Sound.rumble({ dur: 5.6, vel: 0.6 });
      // crack per wall: deep crack + hiss of lava; wall collapse at its epicenter
      for (const e of g.eps) {
        if (S.crossed(e.t0)) { sfx('floorboard', { pitch: 0.5, dur: 0.4, pan: pan(e.x), vel: 0.7 }); sfx('staticCrackle', { dur: 1.2, snap: false, pan: pan(e.x), vel: 0.35 }); }
        if (e.rank > 0 && S.crossed(FALL0 + e.rank * 0.3)) sfx('crash', { pan: pan(e.x), vel: Math.max(0.4, 0.75 - e.rank * 0.08) });
      }
      for (const w of g.wins) {
        if (S.crossed(w.tc1) || S.crossed(w.tc2)) sfx('windowRattle', { dur: 0.6, pan: pan(w.cx), vel: 0.5 });
        if (S.crossed(w.ts)) sfx('shatter', { pan: pan(w.cx), vel: 0.9 });
        if (S.crossed(w.tr)) sfx('sparkle', { pan: pan(w.cx), vel: 0.35, count: 6 });   // the glass reassembles
      }
      if (S.crossed(FALL0)) Sound.crash();
      if (S.crossed(FALL0 + 1.2)) sfx('crash', { pan: 0.4, vel: 0.7 });
      if (S.crossed(FALL0 + 2.3)) sfx('crash', { pan: -0.5, vel: 0.5 });
      if (S.crossed(EYES[0] + 0.1)) sfx('roar', { vel: 0.7 });
      if (S.crossed(DOOR_SHUT)) sfx('doorSlam', { vel: 0.45, swing: 0.1 });
      if (S.crossed(THUMP - 3.4)) sfx('reverseSwell', { dur: 3.4, vel: 0.4 });
      if (S.crossed(THUMP)) sfx('impactHit', { vel: 0.7 });
      if (S.crossed(OUT[0])) sfx('sparkle', { pan: [pan(g.B.x1), pan(g.B.x0)], vel: 0.6 });
    },
    draw(ctx, z, S) {
      prep(S);
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, z.w, z.h);
      const Z = zoneData(z);
      if (z.kind === 'wall' || z.kind === 'roof') drawWall(ctx, Z);
      else if (z.kind === 'window') drawWindow(ctx, z, Z, S);
      else drawDoor(ctx, z, Z, S);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    },
    drawGlobal(ctx, W, H, S) {
      prep(S);
      const g = G, f = F, t = S.t, T = S.T, B = g.B, bh = g.bh, fw = g.fw, fh = g.fh;
      const m0 = ctx.getTransform(), k0 = m0.a, e0 = m0.e, f0 = m0.f;
      const at = (a, b, c, d, x, y) => ctx.setTransform(k0 * a, k0 * b, k0 * c, k0 * d, k0 * x + e0, k0 * y + f0);
      ctx.globalCompositeOperation = 'lighter';
      // light sweeps: builds the wall at the start and undoes it at the end
      for (const [a, b, rev] of [[SCAN[0], SCAN[1], false], [OUT[0], OUT[1] - 0.5, true]]) {
        if (t < a - 0.1 || t > b + 0.3) continue;
        const x = scanX(B, t, a, b, rev), al = smooth(a - 0.1, a + 0.2, t) * (1 - smooth(b, b + 0.3, t)), r = bh * 7, tr = rev ? 1 : -1;
        // soft trail behind the line and white core
        const gr = ctx.createLinearGradient(x + tr * r, 0, x - tr * r * 0.35, 0);
        gr.addColorStop(0, 'rgba(60,140,255,0)'); gr.addColorStop(0.7, rgba([90, 170, 255], 0.28 * al)); gr.addColorStop(0.74, rgba([150, 215, 255], 0.75 * al));
        gr.addColorStop(0.75, rgba([245, 252, 255], al)); gr.addColorStop(0.77, rgba([150, 215, 255], 0.6 * al)); gr.addColorStop(1, 'rgba(60,140,255,0)');
        ctx.fillStyle = gr; ctx.fillRect(x - r, B.y0, r * 2, B.h);
        ctx.globalAlpha = 0.7 * al;
        for (let k = 0; k < 9; k++) { const y = B.y0 + B.h * hash(k * 3.1 + Math.floor(T * 14) * 0.37), s = bh * (1.2 + 1.6 * hash(k + Math.floor(T * 14))); ctx.drawImage(g.flare, x - s, y - s, s * 2, s * 2); }
        ctx.globalAlpha = 1;
      }
      // grazing light: a soft band that crosses the house
      for (const [a, b] of [GLINT, GLINT2]) {
        if (t <= a || t >= b) continue;
        const p = lerp(-0.3, 1.3, eSine((t - a) / (b - a))), x = B.x0 + B.w * p, al = Math.sin(Math.PI * (t - a) / (b - a)) * 0.07, r = B.w * 0.08;
        const gr = ctx.createLinearGradient(x - r, 0, x + r, 0);
        gr.addColorStop(0, 'rgba(200,215,255,0)'); gr.addColorStop(0.5, rgba([200, 215, 255], al)); gr.addColorStop(1, 'rgba(200,215,255,0)');
        ctx.fillStyle = gr; ctx.fillRect(x - r, B.y0, r * 2, B.h);
      }
      // flash of the collapse
      if (t > FALL0 && t < FALL0 + 0.9) glow(ctx, g.vp[0], g.vp[1], B.w * 0.6, [255, 170, 80], 0.55 * (1 - (t - FALL0) / 0.9) ** 2);
      // embers: from the vanishing point toward the viewer (rewound with the wall)
      const ea = f.va * (1 - smooth(BACK0 + BACK_SPAN * 0.6, BACK0 + BACK_SPAN + 0.5, t));
      if (ea > 0.01) {
        const flow = t < BACK0 - 0.4 ? t - FALL0 : (BACK0 - 0.4 - FALL0) - (t - BACK0 + 0.4) * 1.6;
        for (const e of g.embers) {
          const u = ((e.p + flow * e.sp) % 1 + 1) % 1, zf = Math.max(0.05, 1 - u), ang = e.a + u * e.sw, v = e.tn.vp;
          const rr = e.r0 * e.tn.R2 * 0.1 / zf, x = v[0] + Math.cos(ang) * rr * 1.4, y = v[1] + Math.sin(ang) * rr - u * u * bh * 4;
          const s = Math.min(bh * 0.9, e.s * bh * 0.09 / zf), a = ea * smooth(0, 0.12, u) * (1 - smooth(0.8, 1, u));
          if (a < 0.02) continue;
          ctx.globalAlpha = a;
          ctx.drawImage(g.ember, x - s, y - s, s * 2, s * 2);
        }
        ctx.globalAlpha = 1;
      }
      ctx.globalCompositeOperation = 'source-over';
      // bricks in the air
      const BR = g.bricks, n = BR.length, grav = g.grav, va = f.va;
      for (let i = 0; i < n; i++) {
        const st = f.st[i];
        if (st !== 2 && st !== 3) continue;
        const b = BR[i], tau = f.tau[i];
        const x = b.x + b.vx * tau, y = b.y + b.vy * tau + 0.5 * grav * tau * tau;
        const s = 1 + b.grow * tau, rot = b.spin * tau, ph = b.tum * tau, co = Math.cos(ph), si = Math.sin(ph);
        const cs = Math.cos(rot) * s, sn = Math.sin(rot) * s;
        at(cs, sn, -sn, cs, x, y);
        // tumbling box: big face scaled by |cos|, edge by |sin|
        const fy = (co >= 0 ? -1 : 1) * fh * 0.9 * si, hh = fh * Math.abs(co), dh = fh * 0.9 * Math.abs(si), cy = (si >= 0 ? 1 : -1) * fh * co;
        if (dh > 0.3) { ctx.globalAlpha = 1; ctx.fillStyle = si > 0 ? g.faces[1][b.v].bot : g.faces[0][b.v].top; ctx.fillRect(-fw, cy - dh, fw * 2, dh * 2); }
        if (hh > 0.3) {
          ctx.globalAlpha = 1;
          ctx.drawImage(g.spr[b.lv][b.v], -fw, fy - hh, fw * 2, hh * 2);
          if (va > 0.02) { ctx.globalAlpha = va; ctx.drawImage(g.back[b.v], -fw, fy - hh, fw * 2, hh * 2); }
        }
      }
      ctx.setTransform(m0);
      ctx.globalAlpha = 1;
      // dust and rubble from the collapse
      for (let i = 0; i < n; i++) {
        const b = BR[i];
        if (b.keep || t < b.tf || t > b.tf + b.tg + 1.9) continue;
        const u = t - b.tf;
        if (b.puff && u < 0.8) {
          const k = u / 0.8, r = g.bw * (0.35 + 0.8 * eOut3(k));
          ctx.globalAlpha = 0.32 * (1 - k); ctx.drawImage(g.dust, b.x - r, b.y - r - k * bh, r * 2, r * 2);
        }
        if (b.dust && u > b.tg) {
          const k = (u - b.tg) / 1.8, r = g.bw * (0.6 + 1.6 * eOut3(k)), gx = b.x + b.vx * b.tg;
          ctx.globalAlpha = 0.42 * (1 - k) ** 1.5; ctx.drawImage(g.dust, gx - r, b.gy - r * 0.8 - eOut3(k) * bh * 2, r * 2, r * 2);
        }
        if (b.chips && u < 1.1) {
          ctx.globalAlpha = 1 - u / 1.1; ctx.fillStyle = g.faces[1][b.v].side;
          for (const [vx, vy, sz] of b.chips) { const s = bh * sz; ctx.fillRect(b.x + vx * u - s / 2, b.y + vy * u + 0.5 * grav * u * u - s / 2, s, s); }
        }
      }
      ctx.globalAlpha = 1;
      // glass: bursts toward the viewer and returns when rewinding
      ctx.globalCompositeOperation = 'lighter';
      for (const wd of g.wins) {
        let tau = -1;
        if (t >= wd.ts && t < wd.ts + 1.5) tau = t - wd.ts;
        else if (t >= wd.tr && t < wd.tr + 0.9) tau = 1.5 * (1 - eOut3((t - wd.tr) / 0.9));
        if (t >= wd.ts && t < wd.ts + 0.5) glow(ctx, wd.cx, wd.cy, Math.max(wd.w, wd.h) * 1.3, [210, 235, 255], 0.7 * (1 - (t - wd.ts) / 0.5) ** 2);
        if (tau < 0) continue;
        const al = 1 - smooth(0.7, 1.5, tau);
        if (al <= 0.01) continue;
        for (const sh of wd.shards) {
          const x = sh.x + sh.vx * tau, y = sh.y + sh.vy * tau + 0.4 * grav * tau * tau, s = 1 + sh.grow * tau;
          const rot = sh.spin * tau, ph = sh.flip * tau + sh.ph, fx = Math.cos(ph), gl = Math.abs(Math.sin(ph)) ** 6;
          const cs = Math.cos(rot) * s, sn = Math.sin(rot) * s;
          at(cs * fx, sn * fx, -sn, cs, x, y);
          ctx.beginPath();
          sh.pts.forEach(([px, py], k) => (k ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
          ctx.closePath();
          ctx.fillStyle = rgba([170, 210, 255], al * (0.16 + 0.55 * gl)); ctx.fill();
          ctx.strokeStyle = rgba([255, 225, 190], al * 0.85); ctx.lineWidth = 1.4 / s; ctx.stroke();
        }
      }
      ctx.setTransform(m0);
      // sparks when dematerializing
      if (t > OUT[0] - 0.2 && t < OUT[1] + 0.8) {
        ctx.fillStyle = 'rgb(170,225,255)';
        for (let i = 0; i < n; i++) {
          const b = BR[i], d = (t - b.tz) / 0.9;
          if (d <= 0 || d >= 1) continue;
          ctx.globalAlpha = (1 - d) * 0.9;
          for (let k = 0; k < 2; k++) {
            const hx = hash(b.ph + k * 7.7), s = bh * (0.08 + 0.08 * hx);
            ctx.fillRect(b.x + (hx - 0.5) * g.bw + Math.sin(d * 6 + k) * bh * 0.3, b.y - eOut3(d) * bh * (2 + 3 * hx), s, s);
          }
        }
      }
      // eyes in the abyss (full resolution)
      if (f.va > 0.01) { ctx.globalCompositeOperation = 'source-over'; drawEyes(ctx, g, t, T, f.va); }
      // final blow: light wave from the heart
      if (t > THUMP && t < THUMP + 1.1) {
        const k = (t - THUMP) / 1.1, R = eOut3(k) * B.w * 0.75, a = (1 - k) ** 2;
        ctx.globalCompositeOperation = 'lighter';
        ctx.beginPath(); ctx.arc(g.vp[0], g.vp[1], R, 0, TAU);
        ctx.globalAlpha = 0.35 * a; ctx.strokeStyle = 'rgb(255,170,80)'; ctx.lineWidth = bh * 4; ctx.stroke();
        ctx.globalAlpha = 0.9 * a; ctx.strokeStyle = 'rgb(255,240,210)'; ctx.lineWidth = bh; ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  };
})());
