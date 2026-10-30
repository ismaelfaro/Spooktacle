// Scene 8: Happy Halloween — the finale before starting over.
// Neon draws the house, pumpkins fall and light up in cascade, "HAPPY" bursts from
// sparks on the gable and "HALLOWEEN" crosses the right wing (global layer, above its window),
// ghosts wave, a bat fireworks salvo, and a soft fade-out.
registerScene((() => {
  // ---------- script (seconds) ----------
  const DUR = 24;
  const L1 = 3.3, L1S = 0.22, L2 = 4.8, L2S = 0.17;  // letter entrance: HAPPY, HALLOWEEN
  const LIGHT0 = 1.7, LIGHTS = 1.6;                   // pumpkin cascade (left → right)
  const GHOST = 7.2, BOOM = 9.8;                      // ghosts, firecracker
  // flight of the ghost from the big window: it crouches, leaves, loops around the gable and goes into the door
  const LEAVE = 13.35, FLY0 = 13.7, FLYD = 2.75, LAND = FLY0 + FLYD, RET = 17.3;
  const WAVES = [[BOOM, 0.34], [12.5, 0.14], [FLY0 + 0.05, 0.12], [15.0, 0.16], [LAND + 0.05, 0.22], [18.1, 0.18]];
  const SWEEPS = [BOOM + 0.05, 17.0];                 // light sweeps across the title
  const BYE = 18.7, PK_OFF = 19.2, TFADE = 20.4, NEON_OFF = 21.2, END = 23.3;
  const ORANGE = [255, 120, 20], PURPLE = [165, 90, 255], GREEN = [120, 255, 70], GOLD = [255, 205, 90], PINK = [255, 90, 170];
  const WHITE = [255, 255, 255];
  // fireworks on real surfaces: [t, type, index (left → right), u, v (in that zone's box), color, relative radius]
  const FW = [
    [BOOM + 0.1, 'wall', 0, 0.5, 0.42, GOLD, 1.15],
    [BOOM + 0.22, 'wall', 1, 0.86, 0.3, GREEN, 0.8],
    [BOOM + 0.34, 'wall', 2, 0.3, 0.74, PURPLE, 0.85],
    [10.9, 'wall', 2, 0.8, 0.72, GREEN, 0.85],
    [11.7, 'roof', 0, 0.5, 0.42, PINK, 0.9],
    [12.5, 'wall', 0, 0.3, 0.3, ORANGE, 0.95],
    [13.1, 'wall', 1, 0.12, 0.35, PURPLE, 0.75],
    [LAND + 0.15, 'wall', 0, 0.55, 0.38, GREEN, 1],
    [LAND + 0.3, 'wall', 2, 0.72, 0.72, GOLD, 0.9],
    [17.6, 'wall', 1, 0.86, 0.3, PINK, 0.8],
  ];
  const NBATS = 24, NPERCH = 5;

  // ---------- utilities ----------
  const biggest = l => l.reduce((a, b) => (!a || (b.x1 - b.x0) * (b.y1 - b.y0) > (a.x1 - a.x0) * (a.y1 - a.y0) ? b : a), null);
  const bgK = t => smooth(0, 1.6, t) * (1 - smooth(21.6, END, t));
  const shapeById = id => (typeof App !== 'undefined' ? App.zones.find(q => q.id === id)?.shape : null) || 'rect';

  // radial halo cached in a sprite (cheaper than creating a gradient every time)
  const GLOWS = new Map();
  function sGlow(ctx, x, y, r, c, a = 1) {
    if (r <= 0 || a <= 0.004) return;
    // two resolutions: small halos don't pay for scaling a large sprite
    const n = r < 20 ? 32 : 128, key = c.join(',') + ':' + n;
    let spr = GLOWS.get(key);
    if (!spr) {
      spr = Object.assign(document.createElement('canvas'), { width: n, height: n });
      glow(spr.getContext('2d'), n / 2, n / 2, n / 2, c, 1);
      GLOWS.set(key, spr);
    }
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * clamp(a);
    ctx.drawImage(spr, x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = ga;
  }

  // convex polygon offset d px inward (so the neon doesn't get cut at the edge)
  function inset(pts, d) {
    const n = pts.length;
    let cx = 0, cy = 0;
    for (const p of pts) { cx += p[0] / n; cy += p[1] / n; }
    const L = [];
    for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      let nx = a[1] - b[1], ny = b[0] - a[0];
      const l = Math.hypot(nx, ny) || 1;
      nx /= l; ny /= l;
      if ((cx - a[0]) * nx + (cy - a[1]) * ny < 0) { nx = -nx; ny = -ny; }
      L.push([a[0] + nx * d, a[1] + ny * d, b[0] - a[0], b[1] - a[1]]);
    }
    return L.map((l, i) => {
      const m = L[(i + n - 1) % n], den = m[2] * l[3] - m[3] * l[2];
      if (Math.abs(den) < 1e-6) return [l[0], l[1]];
      const s = ((l[0] - m[0]) * l[3] - (l[1] - m[1]) * l[2]) / den;
      return [m[0] + m[2] * s, m[1] + m[3] * s];
    });
  }

  // point at fraction p along the closed outline
  function pointAt(pts, p) {
    const n = pts.length, lens = [];
    let total = 0;
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; lens.push(Math.hypot(b[0] - a[0], b[1] - a[1])); total += lens[i]; }
    let left = total * clamp(p);
    for (let i = 0; i < n; i++) {
      if (left <= lens[i]) { const a = pts[i], b = pts[(i + 1) % n], k = left / (lens[i] || 1); return [lerp(a[0], b[0], k), lerp(a[1], b[1], k)]; }
      left -= lens[i];
    }
    return pts[0];
  }

  // house box and left → right order of each zone (in screen px)
  let HOUSE = null;
  function house(S) {
    if (HOUSE && HOUSE.src === S.screenZones) return HOUSE;
    const zs = S.screenZones;
    const x0 = Math.min(...zs.map(q => q.x0)), x1 = Math.max(...zs.map(q => q.x1));
    const y0 = Math.min(...zs.map(q => q.y0)), y1 = Math.max(...zs.map(q => q.y1));
    const door = biggest(zs.filter(q => q.kind === 'door'));
    HOUSE = { src: zs, x0, x1, y0, y1, w: x1 - x0 || 1, h: y1 - y0 || 1, cx: (x0 + x1) / 2, ox: door ? door.cx : (x0 + x1) / 2, oy: door ? door.cy : lerp(y0, y1, 0.55) };
    HOUSE.nx = x => clamp((x - x0) / HOUSE.w);
    HOUSE.walls = zs.filter(q => q.kind === 'wall');
    return HOUSE;
  }
  const szOf = (z, S) => S.screenZones.find(q => q.id === z.id);
  // moment when something turns on / off based on its horizontal position
  const lightOn = (S, sx) => LIGHT0 + LIGHTS * house(S).nx(sx);
  const lightOff = (S, sx) => PK_OFF + 1.3 * house(S).nx(sx);
  // shared light hits: the firecracker and the ghost's landing at the door
  const flare = t => (t > BOOM ? 0.4 * Math.exp(-(t - BOOM) * 2) : 0) + (t > LAND ? 0.35 * Math.exp(-(t - LAND) * 2.5) : 0);

  // ---------- neon that draws (and then erases) each outline ----------
  // frac < 1 traces only the start of the outline (on the gable: the two slopes, without the base)
  function neonFrame(ctx, z, S, col, t0, lwK = 1, frac = 1) {
    const t = S.t, m = Math.min(z.w, z.h), lw = clamp(m * 0.011, 1.6, 6) * lwK;
    const pts = cached(z, 'neon8', () => inset(shapeOf(z), clamp(m * 0.011, 1.6, 6) * 2.3));
    const off = NEON_OFF + 0.12 * (z.order ?? 0);
    const pIn = easeInOut((t - t0) / 1.4), pOut = easeInOut((t - off) / 1.3);
    const p = pIn * (1 - pOut) * frac;
    if (p <= 0.001) return;
    const boom = t > BOOM ? Math.exp(-(t - BOOM) * 2.5) : 0;
    const a = (0.5 + 0.3 * flicker(S.T, z.seed)) * (1 + boom);
    if (pOut > 0) {
      // turns off by retracting toward the start of the stroke
      neonStroke(ctx, pts, p, col, lw, a * (1 - pOut * 0.5));
    } else neonStroke(ctx, pts, p, col, lw, a);
    // spark at the head of the stroke while it draws
    if (pIn > 0 && pIn < 1) {
      const [hx, hy] = pointAt(pts, pIn * frac);
      ctx.globalCompositeOperation = 'lighter';
      sGlow(ctx, hx, hy, lw * 9, col, 0.9);
      sGlow(ctx, hx, hy, lw * 3, [255, 255, 255], 1);
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ---------- pumpkin with a life cycle: falls, bounces, lights up, sputters and goes out ----------
  // lit, still pumpkin painted once (drawPumpkin is expensive: clips and gradients)
  function pumpkinSprite(z, key, r, seed) {
    return cached(z, key, () => {
      const c = document.createElement('canvas');
      c.width = Math.ceil(r * 2.5); c.height = Math.ceil(r * 2.5);
      drawPumpkin(c.getContext('2d'), r * 1.25, r * 1.35, r, 0, { seed, mouth: 0.5, light: 2, glow: 0 });
      return c;
    });
  }

  function lifePumpkin(ctx, x, y, r, S, tOn, tOff, seed, z, key) {
    const t = S.t, k = (t - tOn) / 0.5;
    if (k <= 0) return;
    const off = t - tOff;
    const body = 1 - smooth(0.6, 1.6, off);
    // smoke after going out
    if (off > 0.15 && off < 2.6) {
      const so = off - 0.15;
      for (let i = 0; i < 3; i++) {
        const q = so - i * 0.18;
        if (q <= 0) continue;
        const sy = y - r * 0.6 - q * r * 1.5, sx = x + Math.sin(q * 3 + i * 2 + seed) * r * 0.3 * q;
        const sr = r * (0.18 + q * 0.35), sa = 0.22 * (1 - q / 2.4) * clamp(q * 4);
        if (sa > 0) sGlow(ctx, sx, sy, sr, [150, 140, 170], sa);
      }
    }
    if (body <= 0) return;
    // fall with gravity (accelerates), stretched at the end, squash on ground contact and a small bounce
    const kf = clamp((t - tOn) / 0.42), land = t - (tOn + 0.42);
    let dy = -(1 - kf * kf) * r * 2.4;
    if (land > 0 && land < 0.22) { const q = land / 0.22; dy = -4 * q * (1 - q) * r * 0.25; }
    const sq = land > 0 ? Math.sin(Math.min(1, land / 0.4) * Math.PI) * 1.6 * Math.exp(-land * 3) - Math.sin(Math.min(1, Math.max(0, land - 0.4) / 0.35) * Math.PI) * 0.6 * Math.exp(-land * 3) : kf > 0.7 ? -0.25 : 0;
    // light: faint while falling, flare when lit, sputter when going out
    const lt = t - (tOn + 0.6);
    let light = lt < 0 ? 0.35 : Math.max(0.35, Math.min(1, lt / 0.1) * (1 + 0.5 * Math.exp(-lt * 4)));
    if (off > 0) light *= (1 - smooth(0, 0.45, off)) * (0.65 + 0.35 * Math.sin(off * 47 + seed));
    const boom = flare(t);
    if (z && land > 1.4 && lt > 1.2 && off < 0) {
      // steady state: additive sprite + halo and candle flicker
      const fl = flicker(S.T, seed);
      ctx.globalCompositeOperation = 'lighter';
      sGlow(ctx, x, y + r * 0.1, r * 1.9, [255, 120, 20], 0.3 + 0.2 * fl + boom);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(pumpkinSprite(z, key, r, seed), x - r * 1.25, y - r * 1.35);
      ctx.globalCompositeOperation = 'lighter';
      sGlow(ctx, x, y + r * 0.15, r * 0.85, [255, 190, 90], 0.12 + 0.3 * (fl - 0.5) + boom);
      ctx.globalCompositeOperation = 'source-over';
      return;
    }
    ctx.save();
    ctx.globalAlpha = body * clamp(k * 8);
    drawPumpkin(ctx, x, y + dy, r, S.T, { seed, mouth: 0.5, light: light + boom, squash: sq, glow: 1 });
    ctx.restore();
    // flash when lit
    if (lt > 0 && lt < 0.8) {
      ctx.globalCompositeOperation = 'lighter';
      sGlow(ctx, x, y, r * 3.2, [255, 170, 60], 0.55 * Math.exp(-lt * 5));
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ---------- ghost that rises, waves and drifts away ----------
  function lifeGhost(ctx, x, yRest, s, S, tIn, tOut, seed, look, extra) {
    const t = S.t, k = (t - tIn) / 0.9;
    if (k <= 0) return;
    const ko = clamp((t - tOut) / 1.5);
    if (ko >= 1) return;
    const rise = easeBack(clamp(k));
    const y = lerp(yRest + s * 1.7, yRest, rise) - easeInOut(ko) ** 1.5 * s * 1.6 + Math.sin(t * 1.7 + seed) * s * 0.05;
    const settle = t - (tIn + 0.5);
    const squash = k < 0.6 ? -0.25 * (1 - k / 0.6) : settle > 0 ? 0.18 * Math.sin(Math.min(1, settle / 0.5) * Math.PI) * Math.exp(-settle * 2) : 0;
    // reaction to the firecracker: open mouth and eyes looking up
    const wow = Math.max(pulse(t, BOOM + 0.05, BOOM + 1.9, 0.25), pulse(t, LAND, LAND + 1.2, 0.2));
    ctx.save();
    if (ko > 0) ctx.globalAlpha = 1 - easeInOut(ko);
    drawGhost(ctx, x, y, s, t + seed, {
      seed, wave: k > 0.6 && ko < 0.75, mouth: lerp(0.05, 0.75, wow), lookX: look * (1 - wow), lookY: -wow * 1.2,
      alpha: clamp(k * 2.5), squash: squash - ko * 0.2, glow: 1, ...extra,
    });
    ctx.restore();
  }

  // ---------- what each window does ----------
  let ROLES = null;
  function roles(S) {
    if (ROLES && ROLES.src === S.screenZones) return ROLES;
    const g = GEO && GEO.src === S.screenZones ? GEO : null;
    const box = g?.lineB;
    const wins = S.screenZones.filter(q => q.kind === 'window');
    const map = {};
    // the window below "HALLOWEEN" stays dark: the title passes over it
    const free = [];
    for (const q of wins) {
      if (box && q.x1 > box.x0 && q.x0 < box.x1 && q.y1 > box.y0 && q.y0 < box.y1) map[q.id] = 'title';
      else free.push(q);
    }
    if (free.length >= 3) map[free.reduce((a, b) => (b.cy > a.cy ? b : a)).id] = 'pumpkins';
    for (const q of free) map[q.id] ??= 'ghost';
    // the ghost from the largest window is the one that flies out
    const gw = biggest(free.filter(q => map[q.id] === 'ghost'));
    ROLES = { src: S.screenZones, map, ok: !!g, trav: gw ? gw.id : null };
    return ROLES;
  }

  // room on the other side of the paper: warm light from below, opening with inner shadow
  function room(ctx, w, h, k, warm = [150, 70, 20]) {
    if (k <= 0) return;
    ctx.fillStyle = radial(ctx, w / 2, h * 1.05, 0, Math.max(w, h) * 0.85, [[0, rgba(warm, 0.85 * k)], [0.45, rgba(mix(warm, [50, 12, 40], 0.6), 0.5 * k)], [1, 'rgba(10,0,20,0)']]);
    ctx.fillRect(0, 0, w, h);
  }
  function recess(ctx, w, h) {
    const d = Math.min(w, h) * 0.14;
    const edge = (x0, y0, x1, y1, rx, ry, rw, rh) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, 'rgba(0,0,0,0.9)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(rx, ry, rw, rh);
    };
    edge(0, 0, 0, d * 1.4, 0, 0, w, d * 1.4);
    edge(0, 0, d, 0, 0, 0, d, h);
    edge(w, 0, w - d, 0, w - d, 0, d, h);
    edge(0, h, 0, h - d * 0.6, 0, h - d * 0.6, w, d * 0.6);
  }

  function drawWindow(ctx, z, S) {
    const { w, h } = z, t = S.t, sz = szOf(z, S);
    const role = roles(S).map[z.id] || 'ghost';
    if (role === 'title') return; // transparent: the wall and the title above are visible
    const sx = sz ? sz.cx : 0, hs = house(S);
    if (role === 'pumpkins') {
      const on = lightOn(S, sx) - 0.2;
      room(ctx, w, h, smooth(on, on + 1.2, t) * (1 - smooth(lightOff(S, sx), lightOff(S, sx) + 1.5, t)) * 0.7);
      const n = w / h > 1.6 ? 3 : 2, r = Math.min(h * 0.3, w / (n * 2.4));
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n, big = n === 3 && i === 1 ? 1.18 : 0.95;
        const px = sz ? lerp(sz.x0, sz.x1, u) : sx;
        lifePumpkin(ctx, u * w, h - r * big * 0.95, r * big, S, lightOn(S, px), lightOff(S, px), z.seed + i * 5, z, 'pks' + i);
      }
      recess(ctx, w, h);
    } else {
      const order = hs.nx(sx), tIn = GHOST + order * 0.9, tOut = BYE + order * 0.5;
      room(ctx, w, h, smooth(tIn - 0.5, tIn + 0.4, t) * (1 - smooth(tOut + 0.3, tOut + 1.6, t)), [90, 60, 150]);
      const s = Math.min(h * 0.6, w * 0.42);
      const trav = roles(S).trav === z.id && flight(S);
      // the traveler leaves the window (drawn by the global layer) and peeks back out later
      if (!trav || t < LEAVE) lifeGhost(ctx, w / 2, h * 0.5, s, S, tIn, tOut, z.seed % 97, sx < hs.cx ? 0.7 : -0.7);
      else if (t >= RET) lifeGhost(ctx, w / 2, h * 0.5, s, S, RET, tOut, z.seed % 97, sx < hs.cx ? 0.7 : -0.7);
      recess(ctx, w, h);
    }
    neonFrame(ctx, z, S, PURPLE, 0.9 + 0.25 * z.index);
  }

  // red door: flooded with cold white light (on red it reads light pink) and the ghost is cut out
  // by value: a black hole (no light = the door's dark red) around its silhouette
  function drawDoor(ctx, z, S) {
    const { w, h } = z, t = S.t, hs = house(S), sz = szOf(z, S);
    const tIn = GHOST + 0.45, tOut = BYE + 0.25;
    const k = smooth(tIn - 0.6, tIn + 0.2, t) * (1 - smooth(tOut + 0.4, tOut + 1.6, t));
    // white flashes: the firecracker leaves the door and the traveling ghost enters it
    const fl = (t > BOOM ? Math.exp(-(t - BOOM) * 9) : 0) + (t > LAND ? Math.exp(-(t - LAND) * 5) : 0);
    if (k > 0) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, rgba([210, 228, 255], 0.5 * k)); g.addColorStop(1, rgba([230, 242, 255], 0.7 * k));
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    const s = Math.min(w * 0.66, h * 0.36), gy = h * 0.45, look = sz && sz.cx > hs.cx ? -0.5 : 0.5;
    if (k > 0.01 && t > tIn) {
      // thick black outline: the same ghost, slightly larger, erasing the light
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.translate(w / 2, gy + s * 0.25); ctx.scale(1.3, 1.22); ctx.translate(-w / 2, -gy - s * 0.25);
      lifeGhost(ctx, w / 2, gy, s, S, tIn, tOut, 41, look, { glow: 0 });
      ctx.restore();
    }
    lifeGhost(ctx, w / 2, gy, s, S, tIn, tOut, 41, look, { glow: 0 });
    if (fl > 0.01) { ctx.fillStyle = rgba(WHITE, clamp(fl) * 0.85); ctx.fillRect(0, 0, w, h); }
    recess(ctx, w, h);
    neonFrame(ctx, z, S, WHITE, 1.3, 0.45);
  }

  // pumpkins at the foot of each wall, avoiding what windows and the door cover
  function pumpkinSlots(z, S) {
    return cached(z, 'pk8', () => {
      const sz = szOf(z, S), holes = S.screenZones.filter(q => q.kind === 'window' || q.kind === 'door');
      const k3 = z.count === 3 ? z.index : 1, r = Math.min(z.h * [0.14, 0.14, 0.12][k3], z.w * 0.13), n = Math.max(2, Math.round(z.w / (r * 6.5)));
      // base of the row per wall (measured in the photo): above the bushes and the plinth
      const foot = z.count === 3 ? [0.8, 1, 0.75][z.index] : 1;
      const out = [];
      for (let i = 0; i < n; i++) {
        const u = lerp(k3 === 2 ? 0.2 : 0.11, 0.89, i / (n - 1)), rr = r * (0.9 + 0.2 * hash(z.seed + i)), y = Math.min(z.h * foot, z.h - r * 0.15) - rr * 0.95;
        let sx = u * z.w;
        if (sz) {
          sx = lerp(sz.x0, sz.x1, u);
          const sy = lerp(sz.y0, sz.y1, y / z.h), sr = rr * (sz.x1 - sz.x0) / z.w;
          if (holes.some(q => sx + sr > q.x0 && sx - sr < q.x1 && sy + sr > q.y0 && sy - sr * 1.1 < q.y1)) continue;
        }
        out.push({ x: u * z.w, y, r: rr, sx, seed: z.seed + i * 7 });
      }
      return out;
    });
  }

  function drawWall(ctx, z, S) {
    const { w, h } = z, t = S.t, a = bgK(t);
    // black background (no light): only what glows is projected
    for (const p of pumpkinSlots(z, S)) lifePumpkin(ctx, p.x, p.y, p.r, S, lightOn(S, p.sx), lightOff(S, p.sx), p.seed, z, 'pks' + p.seed);
    neonFrame(ctx, z, S, ORANGE, 0.2 + 0.3 * z.index);
  }

  function drawRoof(ctx, z, S) {
    // no background wash: only the two slopes in neon (the base is already traced by the wall below)
    const sp = shapeById(z.id) === 'triangulo' ? 2 * Math.hypot(z.w / 2, z.h) : 0;
    neonFrame(ctx, z, S, ORANGE, 0.5, 1, sp ? sp / (sp + z.w) : 1);
  }

  // ---------- title (global layer, screen px) ----------
  let GEO = null;
  function getGeo(S) {
    const ready = _fontReady(80);
    if (GEO && GEO.src === S.screenZones && GEO.ready === ready) return GEO;
    const zs = S.screenZones;
    const meas = (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(4, 4) : document.createElement('canvas')).getContext('2d');
    meas.font = `100px ${_FONT}`;
    const unit = ch => meas.measureText(ch).width / 100;
    const roof = biggest(zs.filter(q => q.kind === 'roof'));
    const wall = zs.find(q => q.id === S.textZoneId) || biggest(zs.filter(q => q.kind === 'wall')) || biggest(zs);
    const letters = [];
    // own clipping: walls, gaps and the gable as a true triangle
    const clip = new Path2D();
    for (const q of zs) {
      if (q.kind === 'roof' && shapeById(q.id) === 'triangulo') {
        const ax = (q.pts[0][0] + q.pts[1][0]) / 2, ay = (q.pts[0][1] + q.pts[1][1]) / 2;
        clip.moveTo(q.pts[3][0], q.pts[3][1]); clip.lineTo(ax, ay); clip.lineTo(q.pts[2][0], q.pts[2][1]); clip.closePath();
      } else { clip.moveTo(q.pts[0][0], q.pts[0][1]); for (let i = 1; i < 4; i++) clip.lineTo(q.pts[i][0], q.pts[i][1]); clip.closePath(); }
    }
    // straight line centered at (cx, base) of size s
    const lineAt = (txt, cx, base, s, ci0, t0, step) => {
      const ws = [...txt].map(ch => unit(ch) * s), tw = ws.reduce((x, y) => x + y, 0);
      let x = cx - tw / 2;
      [...txt].forEach((ch, i) => { letters.push({ ch, x: x + ws[i] / 2, y: base, rot: 0, s, cw: ws[i], ci: ci0 + i, t0: t0 + i * step, seed: 11 + ci0 + i }); x += ws[i]; });
      return { x0: cx - tw / 2, x1: cx + tw / 2, y0: base - s * 0.85, y1: base + s * 0.1 };
    };
    let lineB, roofClip = null;
    if (roof && wall) {
      // HAPPY on an arc inside the gable triangle: the largest size that fits
      const tri = shapeById(roof.id) === 'triangulo';
      const A = tri ? [(roof.pts[0][0] + roof.pts[1][0]) / 2, (roof.pts[0][1] + roof.pts[1][1]) / 2] : null;
      const B = roof.pts[2], C = roof.pts[3];
      const edges = tri ? [[C, A], [A, B], [B, C]] : [[roof.pts[0], roof.pts[1]], [roof.pts[1], B], [B, C], [C, roof.pts[0]]];
      const icx = edges.reduce((a, e) => a + e[0][0], 0) / edges.length, icy = edges.reduce((a, e) => a + e[0][1], 0) / edges.length;
      const inside = (x, y, m) => edges.every(([p, q]) => {
        let nx = p[1] - q[1], ny = q[0] - p[0];
        const l = Math.hypot(nx, ny) || 1;
        nx /= l; ny /= l;
        const sg = Math.sign((icx - p[0]) * nx + (icy - p[1]) * ny) || 1;
        return ((x - p[0]) * nx + (y - p[1]) * ny) * sg >= m;
      });
      const txt = 'HAPPY', cx = (B[0] + C[0]) / 2, botY = (B[1] + C[1]) / 2;
      const us = [...txt].map(unit), tu = us.reduce((x, y) => x + y, 0);
      let best = null;
      for (let s = (roof.y1 - roof.y0) * 0.9; s > 8; s *= 0.97) {
        // positive top margin measured on the drool cap (not just the letter body)
        const tw = tu * s, arch = tri ? 0.18 * s : 0, base = botY - s * 0.05, m = s * 0.03, mt = s * 0.02;
        let x = cx - tw / 2, ok = true;
        const L = [];
        for (let i = 0; i < txt.length && ok; i++) {
          const cw = us[i] * s, lx = x + cw / 2, u = (lx - cx) / (tw / 2), yb = base - arch * (1 - u * u);
          ok = inside(lx - cw * 0.42, yb - s * 0.86, mt) && inside(lx + cw * 0.42, yb - s * 0.86, mt) && inside(lx - cw / 2, yb, m) && inside(lx + cw / 2, yb, m);
          L.push({ ch: txt[i], x: lx, y: yb, rot: Math.atan(2 * arch * u / (tw / 2)), s, cw, ci: i, t0: L1 + i * L1S, seed: 11 + i, ymax: botY + s * 0.3, roof: tri });
          x += cw;
        }
        if (ok) { best = L; break; }
      }
      if (best) letters.push(...best);
      if (tri) { roofClip = new Path2D(); roofClip.moveTo(C[0], C[1]); roofClip.lineTo(A[0], A[1]); roofClip.lineTo(B[0], B[1]); roofClip.closePath(); }
      // HALLOWEEN crossing the text wall (above its window); a bit to the right so it doesn't fall
      // on the conifer in front of the right wing
      const ww = wall.x1 - wall.x0, wh = wall.y1 - wall.y0;
      const s2 = Math.min((ww * 0.84) / [...'HALLOWEEN'].reduce((a, ch) => a + unit(ch), 0), wh * 0.4);
      const n0 = letters.length, base2 = wall.y0 + wh * 0.13 + s2 * 0.8;
      lineB = lineAt('HALLOWEEN', wall.x0 + ww * 0.545, base2, s2, 5, L2, L2S);
      // drip floor: drops squash on the cladding, never reach the lawn
      for (let i = n0; i < letters.length; i++) letters[i].ymax = Math.min(wall.y1 - s2 * 0.05, base2 + s2 * 1.15);
    } else if (wall) {
      const ww = wall.x1 - wall.x0, wh = wall.y1 - wall.y0;
      const s2 = Math.min((ww * 0.9) / [...'HALLOWEEN'].reduce((a, ch) => a + unit(ch), 0), wh * 0.36);
      lineAt('HAPPY', (wall.x0 + wall.x1) / 2, wall.y0 + wh * 0.1 + s2 * 0.8, s2, 0, L1, L1S);
      lineB = lineAt('HALLOWEEN', (wall.x0 + wall.x1) / 2, wall.y0 + wh * 0.1 + s2 * 1.9, s2, 5, L2, L2S);
      for (const L of letters) L.ymax = wall.y1 - s2 * 0.05;
    }
    GEO = { src: zs, ready, letters, clip, lineB, roofClip };
    FLIGHT = null;
    ROLES = null;
    return GEO;
  }

  // animated state of one letter
  function letterState(L, t) {
    const lt = t - L.t0;
    let hop = 0;
    for (const [tw, amp] of WAVES) { const wt = t - tw - L.ci * 0.06; if (wt > 0 && wt < 0.5) hop += Math.sin((wt / 0.5) * Math.PI) * amp; }
    let flash = lt > 0 ? Math.exp(-lt * 4.5) * 0.95 : 0;
    for (const t0 of SWEEPS) {
      const k = (t - t0) / 1.1;
      if (k > 0 && k < 1) { const hs = HOUSE, sx = lerp(hs.x0 - hs.w * 0.1, hs.x1 + hs.w * 0.1, easeInOut(k)); flash += 0.8 * Math.exp(-(((L.x - sx) / (L.s * 1.1)) ** 2)); }
    }
    const fs = TFADE + L.ci * 0.13, fo = smooth(fs, fs + 1.0, t);
    const k = clamp(lt / 0.42), sc = easeBack(k);
    const land = Math.sin(clamp((lt - 0.22) / 0.36) * Math.PI) * 0.2 * Math.exp(-Math.max(0, lt - 0.22) * 3);
    const wob = Math.sin(lt * 12) * Math.exp(-lt * 3.2) * 0.16 + hop * Math.sin(t * 9 + L.ci) * 0.25;
    return { lt, hop, flash, fo, sc, land, wob, alpha: 1 - fo };
  }

  // visual center of the letter (the base is at L.y)
  const center = L => [L.x + Math.sin(L.rot) * L.s * 0.4, L.y - Math.cos(L.rot) * L.s * 0.4];

  function drawDrips(ctx, L, st, dyOff) {
    const grow = smooth(0.45, 3.6, st.lt);
    if (grow <= 0 || st.alpha <= 0) return;
    const s = L.s, dw = s * 0.065, body = new Path2D(), shine = new Path2D(), c = Math.cos(L.rot), sn = Math.sin(L.rot);
    for (const [dxr, lr, per, ph] of _dripsOf(L.ch, L.seed)) {
      const Ld = s * (0.06 + 0.38 * lr) * grow, cyc = (st.lt / per + ph) % 1;
      const len = Ld * (cyc < 0.85 ? 0.65 + 0.35 * easeInOut(cyc / 0.85) : 0.65);
      const ax = (dxr - 0.5) * L.cw, bx = L.x + ax * c, by = L.y + ax * sn + dyOff;
      const y0 = by - s * 0.2, y1 = by + len, neck = cyc > 0.7 && cyc < 0.85 ? 1 - ((cyc - 0.7) / 0.15) * 0.35 : 1;
      body.roundRect(bx - (dw / 2) * neck, y0, dw * neck, y1 - y0, dw / 2);
      body.moveTo(bx + dw * 0.9, y1); body.ellipse(bx, y1, dw * 0.9, dw * 1.1, 0, 0, TAU);
      shine.rect(bx - dw * 0.3, y0 + s * 0.05, dw * 0.2, (y1 - y0) * 0.85);
      if (cyc >= 0.85 && Ld > s * 0.08) {
        // loose drop: falls with gravity to the letter's floor and squashes there for an instant
        const ft = (cyc - 0.85) * per, fy = y1 + dw + 15 * s * ft * ft, ym = L.ymax ?? Infinity;
        if (fy < ym) { body.moveTo(bx + dw * 0.65, fy); body.ellipse(bx, fy, dw * 0.65, dw * (0.9 + ft * 2), 0, 0, TAU); }
        else if (ym > y1 + dw) {
          const hit = Math.sqrt((ym - y1 - dw) / (15 * s)), q = (ft - hit) / 0.25;
          if (q < 1) { const sw = dw * (0.8 + 1.6 * easeOut(q)) * (1 - q * 0.4), sh = dw * 0.45 * (1 - q); if (sh > 0.3) { body.moveTo(bx + sw, ym); body.ellipse(bx, ym, sw, sh, 0, 0, TAU); } }
        }
      }
    }
    ctx.globalAlpha = st.alpha;
    ctx.fillStyle = '#5ee83a'; ctx.fill(body);
    ctx.fillStyle = 'rgba(230,255,200,0.8)'; ctx.fill(shine);
    ctx.globalAlpha = 1;
  }

  // sparks converging before the letter and bursting when it appears (additive)
  function letterSparks(ctx, L, st) {
    const lt = st.lt, s = L.s, [cx, cy] = center(L);
    if (lt > -0.7 && lt < 0) {
      const k = (lt + 0.7) / 0.7, p = new Path2D();
      for (let j = 0; j < 14; j++) {
        const h1 = hash(L.seed * 31 + j), h2 = hash(L.seed * 17 + j * 3), spin = (hash(L.seed + j * 7) - 0.5) * 3;
        const at = q => { const e = q * q * q, r = s * (1.3 + 1.8 * h2) * (1 - e), a = h1 * TAU + spin * e; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8]; };
        const [x1, y1] = at(k), [x0, y0] = at(Math.max(0, k - 0.12));
        p.moveTo(x0, y0); p.lineTo(x1, y1);
      }
      ctx.strokeStyle = rgba(mix([255, 140, 30], [255, 250, 220], k), 0.35 + 0.6 * k);
      ctx.lineWidth = Math.max(1.5, s * 0.03); ctx.lineCap = 'round';
      ctx.stroke(p);
      sGlow(ctx, cx, cy, s * (0.3 + 0.5 * k), [255, 200, 120], 0.6 * k * k);
    }
    if (lt >= 0 && lt < 1) {
      // flash, wave and sparks that fly out with gravity
      sGlow(ctx, cx, cy, s * 1.2, [255, 190, 90], 0.6 * Math.exp(-lt * 7));
      if (lt < 0.5) {
        const k = lt / 0.5;
        ctx.strokeStyle = rgba([255, 230, 170], 0.8 * (1 - k));
        ctx.lineWidth = s * 0.05 * (1 - k) + 1;
        ctx.beginPath(); ctx.ellipse(cx, cy, s * (0.3 + 0.85 * easeOut(k)), s * (0.25 + 0.65 * easeOut(k)), 0, 0, TAU); ctx.stroke();
      }
      const p = new Path2D();
      for (let j = 0; j < 12; j++) {
        const a = hash(L.seed * 13 + j) * TAU, v = s * (1.2 + 1.6 * hash(L.seed * 7 + j));
        const at = q => [cx + Math.cos(a) * v * (1 - Math.exp(-q * 4)) / 1.6, cy + Math.sin(a) * v * (1 - Math.exp(-q * 4)) / 1.6 + 0.5 * s * 3 * q * q];
        const [x1, y1] = at(lt), [x0, y0] = at(Math.max(0, lt - 0.06));
        p.moveTo(x0, y0); p.lineTo(x1, y1);
      }
      ctx.strokeStyle = rgba([255, 200, 110], 1 - lt);
      ctx.lineWidth = Math.max(1.5, s * 0.03);
      ctx.stroke(p);
    }
    // small farewell flash when going out
    if (st.fo > 0 && st.fo < 0.6) {
      const k = st.fo / 0.6, a = Math.sin(k * Math.PI), r = s * 0.45 * a;
      const sx = cx + L.cw * 0.25, sy = cy - s * 0.35;
      sGlow(ctx, sx, sy, r * 1.2, [255, 240, 200], 0.7 * a);
      ctx.fillStyle = rgba([255, 255, 240], a);
      ctx.beginPath();
      for (let i = 0; i < 8; i++) { const ang = (i / 8) * TAU + k, rr = i % 2 ? r * 0.16 : r; ctx.lineTo(sx + Math.cos(ang) * rr, sy + Math.sin(ang) * rr); }
      ctx.closePath(); ctx.fill();
    }
  }

  // letter to project: no dark extrusion or outline (the dark is just dirty light, a brown band);
  // around it stays empty (black = no light) and a thin pale yellow edge cuts it out. Thin drool cap.
  function letterSprite(ch, S, ready, seed) {
    const key = `l8${ch}:${S}:${ready ? 1 : 0}:${seed}`;
    const old = _SPR.get(key);
    if (old) return old;
    const meas = (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(4, 4) : document.createElement('canvas')).getContext('2d');
    meas.font = `${S}px ${_FONT}`;
    const cw = meas.measureText(ch).width, pad = S * 0.1, W = cw + pad * 2, H = S * 1.15 + pad * 2;
    const bx = pad, by = pad + S * 0.95;
    const spr = _sprite(key, W, H, c => {
      c.font = `${S}px ${_FONT}`;
      c.textBaseline = 'alphabetic';
      c.lineJoin = 'round';
      c.lineWidth = Math.max(2.5, S * 0.045); c.strokeStyle = '#fff4b8';
      c.strokeText(ch, bx, by);
      const g = c.createLinearGradient(0, by - S * 0.8, 0, by);
      g.addColorStop(0, '#fff27e'); g.addColorStop(0.4, '#ffb21e'); g.addColorStop(1, '#ff5a00');
      c.fillStyle = g;
      c.fillText(ch, bx, by);
      // drool only on the letter: thin band with lobes where the drips start
      c.globalCompositeOperation = 'source-atop';
      const top = by - S * 0.82, drips = _dripsOf(ch, seed);
      c.beginPath();
      c.moveTo(0, 0); c.lineTo(W, 0);
      for (let i = 0; i <= 30; i++) {
        const xx = W - (i / 30) * W, rel = (xx - bx) / cw;
        let yy = top + S * (0.1 + 0.025 * Math.sin(xx * 0.09 + seed));
        for (const [dxr] of drips) yy += S * 0.09 * Math.exp(-((((rel - dxr) * cw) / (S * 0.07)) ** 2));
        c.lineTo(xx, yy);
      }
      c.closePath();
      const sg = c.createLinearGradient(0, top - S * 0.05, 0, top + S * 0.22);
      sg.addColorStop(0, '#eaffb8'); sg.addColorStop(0.35, '#86ff52'); sg.addColorStop(1, '#3ad62a');
      c.fillStyle = sg; c.fill();
      c.fillStyle = 'rgba(255,255,255,0.5)';
      c.fillRect(0, top - S * 0.04, W, S * 0.04);
    });
    spr._bx = bx; spr._by = by; spr._cw = cw;
    return spr;
  }

  function drawLetter(ctx, L, st, scale, ready) {
    const spx = Math.max(8, Math.round(L.s * scale)), spr = letterSprite(L.ch, spx, ready, L.seed);
    const sq = st.land - st.hop * 0.08;
    // still, straight letter: direct copy at whole pixels (the cheapest)
    if (!L.rot && st.lt > 1.6 && !st.hop && !st.fo && st.flash <= 0.02) {
      ctx.save();
      ctx.translate(L.x, L.y);
      ctx.scale(1 / scale, 1 / scale);
      ctx.drawImage(spr, Math.round(-spr._bx - spr._cw / 2), Math.round(-spr._by));
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.translate(L.x, L.y - st.hop * L.s * 0.5 + st.fo * st.fo * L.s * 0.12);
    ctx.rotate(L.rot + st.wob);
    ctx.scale(st.sc * (1 + sq) / scale, st.sc * (1 - sq) / scale);
    ctx.globalAlpha = st.alpha;
    ctx.drawImage(spr, -spr._bx - spr._cw / 2, -spr._by);
    if (st.flash > 0.02) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = clamp(st.flash) * st.alpha;
      ctx.drawImage(spr, -spr._bx - spr._cw / 2, -spr._by);
    }
    ctx.restore();
  }

  function drawTitle(ctx, S, g, scale) {
    const t = S.t, ready = g.ready;
    const sts = g.letters.map(L => letterState(L, t));
    // drips (peek out below each letter; no clipping, they squash on their floor)
    g.letters.forEach((L, i) => { if (sts[i].lt > 0) drawDrips(ctx, L, sts[i], -sts[i].hop * L.s * 0.5); });
    const live = (L, i) => sts[i].lt > 0 && sts[i].alpha > 0;
    // HAPPY clipped to the gable triangle: the bounce and little hops don't invade the roof
    if (g.roofClip && g.letters.some((L, i) => L.roof && live(L, i))) {
      ctx.save(); ctx.clip(g.roofClip);
      g.letters.forEach((L, i) => { if (L.roof && live(L, i)) drawLetter(ctx, L, sts[i], scale, ready); });
      ctx.restore();
    }
    g.letters.forEach((L, i) => { if ((!L.roof || !g.roofClip) && live(L, i)) drawLetter(ctx, L, sts[i], scale, ready); });
    return sts;
  }

  // ---------- firecracker: fireworks over real walls ----------
  const hostOf = (S, kind, idx) => S.screenZones.find(q => q.kind === kind && q.index === idx) || biggest(S.screenZones.filter(q => q.kind === kind)) || biggest(S.screenZones);
  function fillZone(ctx, q) { ctx.beginPath(); ctx.moveTo(q.pts[0][0], q.pts[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(q.pts[i][0], q.pts[i][1]); ctx.closePath(); ctx.fill(); }
  const fwOn = t => FW.some(f => t > f[0] - 0.8 && t < f[0] + 2.3);

  function drawFireworks(ctx, S, hs) {
    const t = S.t, u1 = hs.h / 600; // relative stroke width (≈1 at 1080p)
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    FW.forEach(([tb, kind, idx, u, v, col, rk], fi) => {
      const k = t - tb;
      if (k < -0.75 || k > 2.3) return;
      const q = hostOf(S, kind, idx);
      if (!q) return;
      const qh = q.y1 - q.y0, x = lerp(q.x0, q.x1, u), y = lerp(q.y0, q.y1, v), R = Math.min(qh * 0.6, hs.h * 0.4) * rk;
      if (k < 0) {
        // rocket rising with a trail from the foot of its wall
        const p = (k + 0.75) / 0.75, e = easeOut(p), ry = lerp(q.y1, y, e), rx = x + Math.sin(p * 6 + fi) * 4 * u1;
        const ty = lerp(q.y1, y, easeOut(Math.max(0, p - 0.3)));
        const g = ctx.createLinearGradient(rx, ty, rx, ry);
        g.addColorStop(0, rgba(GOLD, 0)); g.addColorStop(1, rgba([255, 235, 180], 0.95));
        ctx.strokeStyle = g; ctx.lineWidth = 4 * u1;
        ctx.beginPath(); ctx.moveTo(rx, ty); ctx.lineTo(rx, ry); ctx.stroke();
        sGlow(ctx, rx, ry, 16 * u1, [255, 235, 180], 1);
        return;
      }
      // the whole wall is tinted by the burst (the explosion lights the house)
      ctx.fillStyle = rgba(col, 0.35 * Math.exp(-k * 2.2));
      fillZone(ctx, q);
      sGlow(ctx, x, y, R * 1.6, col, 0.5 * Math.exp(-k * 2.4));
      sGlow(ctx, x, y, R * 0.45, WHITE, Math.exp(-k * 8));
      const n = Math.round(26 + 8 * rk), life = 2.1, a = Math.max(0, 1 - k / life) ** 1.3; // without max: NaN and a stroke with the old color
      if (a <= 0) return;
      const pos = (j, s) => {
        const ang = (j / n) * TAU + hash(fi * 91 + j) * 0.15, vv = 3 * R * (0.85 + 0.2 * hash(fi * 37 + j));
        const d = vv * (1 - Math.exp(-s * 3)) / 3;
        return [x + Math.cos(ang) * d, y + Math.sin(ang) * d * 0.95 + 0.4 * R * s * s];
      };
      // long trails: several points per trail, so they curve with gravity
      const tail = Math.min(k, 0.16 + k * 0.12), p = new Path2D();
      for (let j = 0; j < n; j++) {
        let [px, py] = pos(j, k - tail);
        p.moveTo(px, py);
        for (let m = 1; m <= 3; m++) { [px, py] = pos(j, k - tail * (1 - m / 3)); p.lineTo(px, py); }
      }
      const glit = k > 1.1 ? 0.65 + 0.35 * Math.sin(k * 37 + fi) : 1;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = rgba(col, 0.5 * a * glit); ctx.lineWidth = 12 * u1; ctx.stroke(p);
      ctx.strokeStyle = rgba(mix(col, WHITE, 0.7), a * glit); ctx.lineWidth = 4 * u1; ctx.stroke(p);
      // bright heads of each trail
      if (k < 1.4) {
        const hp = new Path2D(), hr = 3.2 * u1 * (1 - k / 1.4) + 1;
        for (let j = 0; j < n; j++) { const [px, py] = pos(j, k); hp.moveTo(px + hr, py); hp.arc(px, py, hr, 0, TAU); }
        ctx.fillStyle = rgba(WHITE, a); ctx.fill(hp);
      }
      // inner ring of another color
      if (rk >= 0.85) {
        const p2 = new Path2D(), col2 = col === GOLD ? GREEN : GOLD;
        for (let j = 0; j < n; j += 2) { const [x1, y1] = pos(j + 0.5, k * 0.9), [x0, y0] = pos(j + 0.5, Math.max(0, k * 0.9 - tail)); p2.moveTo(x + (x1 - x) * 0.5, y + (y1 - y) * 0.5); p2.lineTo(x + (x0 - x) * 0.5, y + (y0 - y) * 0.5); }
        ctx.strokeStyle = rgba(mix(col2, WHITE, 0.4), a * glit); ctx.lineWidth = 5 * u1; ctx.stroke(p2);
      }
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawBats(ctx, S, hs, W, H) {
    const t = S.t, k0 = t - BOOM;
    if (k0 < 0 || k0 > 3.4) return;
    // flash at the door
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, hs.ox, hs.oy, hs.w * 0.55, [255, 170, 90], 0.55 * Math.exp(-k0 * 3.5));
    ctx.globalCompositeOperation = 'source-over';
    const base = hs.h * 0.12, D = Math.hypot(W, H) * 0.55;
    for (let j = NPERCH; j < NBATS; j++) {
      const tb = BOOM + hash(j * 3.1) * 0.35, dur = 1.9 + hash(j * 5.3) * 1.1, k = (t - tb) / dur;
      if (k <= 0 || k >= 1) continue;
      const ang = -Math.PI / 2 + (hash(j * 7.7) * 2 - 1) * 2.3, dist = D * (0.55 + 0.45 * hash(j * 2.9));
      const e = 1 - (1 - k) ** 2.4, wob = Math.sin(k * 9 + j) * hs.h * 0.03 * k;
      const x = hs.ox + Math.cos(ang) * dist * e - Math.sin(ang) * wob, y = hs.oy + Math.sin(ang) * dist * e + Math.cos(ang) * wob;
      const s = base * (0.35 + 1.25 * k) * (0.8 + 0.4 * hash(j * 1.3)) * (j % 4 === 0 ? 1.5 : 1);
      const fp = t * 15 + j * 1.7, flap = Math.sin(fp + 0.6 * Math.sin(fp));
      ctx.save();
      ctx.globalAlpha = clamp(k * 12) * (1 - smooth(0.8, 1, k));
      ctx.translate(x, y);
      ctx.rotate(Math.cos(ang) * 0.35 + Math.sin(t * 3 + j) * 0.12);
      drawBat(ctx, 0, 0, s, flap, [160, 100, 255], { rim: [255, 190, 90], bones: [225, 190, 255] });
      ctx.restore();
    }
  }

  // bats that break off from the firecracker and hang from the eave of the left wing until the farewell
  function drawPerched(ctx, S, hs) {
    const t = S.t;
    if (t < BOOM || t > BYE + 2.2) return;
    const lw = hostOf(S, 'wall', 0);
    if (!lw) return;
    const s = Math.min(hs.h * 0.11, (lw.x1 - lw.x0) * 0.16);
    for (let i = 0; i < NPERCH; i++) {
      const px = lerp(lw.x0, lw.x1, 0.13 + 0.74 * (i / (NPERCH - 1))), py = lw.y0 + s * (0.42 + 0.12 * hash(i * 4.4));
      const tf = BOOM + 0.15 + i * 0.13, ta = tf + 1.25, tl = BYE + i * 0.11;
      let x, y, rot = 0, flap, sc = 1, a = 1;
      if (t < tf) continue;
      if (t < ta) {
        // arc flight from the door to its spot; brakes on arrival
        const k = easeInOut((t - tf) / (ta - tf)), cx = lerp(hs.ox, px, 0.5), cy = Math.min(hs.oy, py) - hs.h * (0.25 + 0.1 * hash(i));
        x = (1 - k) ** 2 * hs.ox + 2 * (1 - k) * k * cx + k * k * px;
        y = (1 - k) ** 2 * hs.oy + 2 * (1 - k) * k * cy + k * k * py;
        sc = 0.5 + 0.5 * k;
        const fp = t * 16 + i * 2;
        flap = Math.sin(fp + 0.6 * Math.sin(fp));
        rot = (px - hs.ox) * 0.0003 + Math.sin(t * 3 + i) * 0.1;
      } else if (t < tl) {
        // hanging upside down: flips over, sways and now and then shakes its wings
        const h = t - ta, flip = easeBack(clamp(h / 0.35));
        x = px + Math.sin(t * 1.6 + i) * s * 0.04; y = py;
        rot = Math.PI * flip + Math.sin(t * 1.9 + i * 1.3) * 0.06;
        const cyc = (h + hash(i * 9.2) * 2.4) % 2.6, sh = cyc < 0.45 ? Math.sin((cyc / 0.45) * Math.PI) : 0;
        flap = lerp(1, Math.sin(t * 30), sh);
        sc = 1 - (1 - sh) * 0.32 * flip; // wings folded (narrower) except when shaking them
      } else {
        // lets go and flies off upward
        const k = clamp((t - tl) / 1.3), e = k * k;
        x = px + (i - 2) * s * 2 * e; y = py - hs.h * 0.7 * e + Math.sin(k * Math.PI) * s * 0.4;
        rot = Math.PI * (1 - easeOut(k * 3));
        const fp = t * 18 + i;
        flap = Math.sin(fp + 0.6 * Math.sin(fp));
        a = 1 - smooth(0.6, 1, k);
      }
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(sc, 1);
      drawBat(ctx, 0, 0, s, flap, [160, 100, 255], { rim: [255, 190, 90], bones: [225, 190, 255] });
      ctx.restore();
    }
  }

  // ---------- the big-window ghost flies around the house ----------
  let FLIGHT = null;
  function flight(S) {
    if (FLIGHT && FLIGHT.src === S.screenZones) return FLIGHT.ok ? FLIGHT : null;
    const zs = S.screenZones, r = roles(S);
    const wz = r.trav && zs.find(q => q.id === r.trav), door = biggest(zs.filter(q => q.kind === 'door'));
    if (!wz || !door) { FLIGHT = { src: zs, ok: false }; return null; }
    const s = Math.min((wz.y1 - wz.y0) * 0.6, (wz.x1 - wz.x0) * 0.42);
    // loop over the free cladding of its window's wall (white: the ghost reads better
    // than over HAPPY); the top of the loop grazes the soffit just under HAPPY
    const wall = zs.find(q => q.kind === 'wall' && wz.cx > q.x0 && wz.cx < q.x1 && wz.cy > q.y0 && wz.cy < q.y1) || wz;
    const cx = (wall.x0 + wall.x1) / 2, cy = (wall.y0 + wall.y1) / 2, gr = Math.min(wall.x1 - wall.x0, wall.y1 - wall.y0) * 0.36;
    const dh = door.y1 - door.y0, top = wall.y0 + s * 0.6;
    const P = [
      [wz.cx, wz.cy], [wz.cx + s * 0.1, top], [cx - gr, cy - gr * 0.1], [cx, cy + gr * 0.62], [cx + gr, cy - gr * 0.2],
      [door.cx, door.y0 + dh * 0.12], [door.cx, door.y0 + dh * 0.45],
    ];
    FLIGHT = { src: zs, ok: true, P, s, sDoor: Math.min((door.x1 - door.x0) * 0.66, dh * 0.36), wz, door };
    return FLIGHT;
  }
  // Catmull-Rom through the waypoints; the clock runs fast on leaving and diving in and slow in the loop
  function flyPos(F, t) {
    const P = F.P, n = P.length - 1, k = clamp((t - FLY0) / FLYD), e = clamp(k + 0.075 * Math.sin(k * TAU));
    const u = e * n, i = Math.min(n - 1, Math.floor(u)), f = u - i;
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(n, i + 2)];
    const cr = (a, b, c, d) => 0.5 * (2 * b + (c - a) * f + (2 * a - 5 * b + 4 * c - d) * f * f + (3 * b - a - 3 * c + d) * f * f * f);
    return [cr(p0[0], p1[0], p2[0], p3[0]), cr(p0[1], p1[1], p2[1], p3[1]), u / n];
  }

  function drawFlight(ctx, S, hs) {
    const t = S.t, F = flight(S);
    if (F && t > LAND - 0.05 && t < LAND + 1) {
      // landing: the door bursts into white light that splashes the neighboring walls, with a ring of sparks
      const k = Math.max(0, t - LAND), d = F.door, dh = d.y1 - d.y0, u1 = hs.h / 600;
      ctx.globalCompositeOperation = 'lighter';
      sGlow(ctx, d.cx, d.cy, dh * 2, [200, 220, 255], Math.exp(-k * 3.5));
      sGlow(ctx, d.cx, d.cy, dh * 0.6, WHITE, Math.exp(-k * 7));
      if (k < 0.8) {
        const p = new Path2D(), e = easeOut(k / 0.8);
        for (let j = 0; j < 18; j++) {
          const a = (j / 18) * TAU + hash(j * 5.1) * 0.3, r1 = dh * (0.3 + 1.1 * e) * (0.8 + 0.4 * hash(j)), r0 = r1 * 0.75;
          p.moveTo(d.cx + Math.cos(a) * r0, d.cy + Math.sin(a) * r0); p.lineTo(d.cx + Math.cos(a) * r1, d.cy + Math.sin(a) * r1);
        }
        ctx.strokeStyle = rgba([235, 240, 255], 1 - k / 0.8); ctx.lineWidth = 4 * u1; ctx.lineCap = 'round'; ctx.stroke(p);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (!F || t < LEAVE || t > LAND + 0.05) return;
    const u1 = hs.h / 600;
    let x, y, sq = 0, look = 0, lookY = -1, mouth = 0.55, vx = 0, tilt = 0, st = 0, ang = 0, sc = 1, a = 1;
    if (t < FLY0) {
      // anticipation: crouches looking up
      const q = (t - LEAVE) / (FLY0 - LEAVE);
      [x, y] = F.P[0];
      sq = -0.32 * Math.sin(q * Math.PI * 0.5);
      y += F.s * 0.12 * Math.sin(q * Math.PI * 0.5);
      mouth = 0.2;
    } else {
      const [x1, y1, p] = flyPos(F, t), [x0, y0] = flyPos(F, t - 1 / 60);
      x = x1; y = y1;
      const dx = (x1 - x0) * 60, dy = (y1 - y0) * 60, sp = Math.hypot(dx, dy);
      st = clamp(sp / (F.s * 14), 0, 0.32); ang = Math.atan2(dy, dx);
      vx = clamp(dx / (F.s * 8), -1, 1); tilt = clamp(dx / (F.s * 12), -0.45, 0.45);
      look = clamp(dx / (F.s * 5), -1.2, 1.2); lookY = clamp(dy / (F.s * 5), -1.2, 1.2);
      // smaller inside the gable (it recedes), regains size when it drops to the door
      sc = lerp(1, F.sDoor / F.s, smooth(0.7, 0.95, p));
      if (t < FLY0 + 0.25) sq = 0.35 * (1 - (t - FLY0) / 0.25); // takeoff stretch
      const ent = clamp((t - (LAND - 0.14)) / 0.14);
      if (ent > 0) { sc *= 1 - 0.7 * ent * ent; a = 1 - ent; }
      // trail of bright dust
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 14; i++) {
        const tt = t - i * 0.05;
        if (tt < FLY0) break;
        const [tx, ty] = flyPos(F, tt), j = i * 13.7, d = F.s * 0.25 * (i / 14);
        const sx = tx + (hash(j) - 0.5) * d * 2, sy = ty + F.s * 0.25 + (hash(j + 1) - 0.5) * d * 2 + i * i * 0.15 * u1;
        const fade = (1 - i / 15) * a, rr = (2 + 5 * (1 - i / 15)) * u1 * (0.7 + 0.6 * Math.sin(t * 25 + i * 2));
        sGlow(ctx, sx, sy, rr * 3, i % 3 === 0 ? GOLD : i % 3 === 1 ? [190, 210, 255] : [215, 160, 255], 0.8 * fade);
        sGlow(ctx, sx, sy, rr, WHITE, fade);
      }
      // the ghost lights up the facade as it passes
      sGlow(ctx, x, y + F.s * 0.3 * sc, F.s * 1.5 * sc, [150, 175, 255], 0.3 * a);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.save();
    ctx.translate(x, y);
    if (st > 0.01) { ctx.rotate(ang); ctx.scale(1 + st, 1 - st * 0.45); ctx.rotate(-ang); }
    ctx.scale(sc, sc);
    drawGhost(ctx, 0, 0, F.s, t + 3, { seed: 7, mouth, lookX: look, lookY, vx, tilt: t < FLY0 ? 0 : tilt, squash: sq, alpha: a, glow: 1 });
    ctx.restore();
  }

  // embers rising up the facade during the party
  function drawEmbersUp(ctx, S, hs) {
    const t = S.t, k = smooth(BOOM - 0.5, BOOM + 1.5, t) * (1 - smooth(19.5, 21.5, t));
    if (k <= 0 || !hs.walls.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 30; i++) {
      const per = 4 + hash(i * 2.3) * 4, q = ((t / per) + hash(i * 4.1)) % 1;
      // each ember rises inside a wall: so no clipping is needed
      const wz = hs.walls[i % hs.walls.length], ww = wz.x1 - wz.x0, wh = wz.y1 - wz.y0;
      const x = wz.x0 + ww * (0.04 + 0.92 * hash(i * 6.7)) + Math.sin(t * 1.3 + i) * ww * 0.03;
      const y = wz.y1 - wh * (0.03 + 0.94 * q), r = 1.5 + hash(i * 9.1) * 2.5;
      const a = k * Math.sin(q * Math.PI) * (0.5 + 0.5 * Math.sin(t * 7 + i * 3));
      if (a <= 0.02) continue;
      sGlow(ctx, x, y, r * 3, i % 3 ? [255, 150, 40] : [190, 255, 110], a * 0.7);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  return {
    name: 'Happy Halloween',
    globalClip: false, // uses its own clipping (triangular gable)
    duration: DUR,
    ambience: 0.5,
    // all the sound (effects included) is carried by the score js/audio/08-happy-halloween.js
    update(S) {},
    draw(ctx, z, S) {
      getGeo(S);
      house(S);
      if (z.kind === 'window') drawWindow(ctx, z, S);
      else if (z.kind === 'door') drawDoor(ctx, z, S);
      else if (z.kind === 'roof') drawRoof(ctx, z, S);
      else drawWall(ctx, z, S);
    },
    drawGlobal(ctx, W, H, S) {
      const g = getGeo(S), hs = house(S), scale = ctx.getTransform().a || 1;
      // whatever spills out of the zones (fireworks, bats, ghost) is clipped; title and embers already fall
      // inside their zone and are drawn without clipping, which on software raster makes each operation costly
      const t = S.t, batsOn = t > BOOM && t < BOOM + 3.4, perchOn = t > BOOM && t < BYE + 2.2, flyOn = t > LEAVE && t < LAND + 1;
      drawEmbersUp(ctx, S, hs);
      const sts = drawTitle(ctx, S, g, scale);
      const sparks = (t > L1 - 0.8 && t < L2 + 10 * L2S + 1.1) || t > TFADE;
      if (!(fwOn(t) || sparks || batsOn || perchOn || flyOn)) return;
      ctx.save(); ctx.clip(g.clip);
      // fireworks on top of the title, additive: they light it instead of hiding it
      if (fwOn(t)) drawFireworks(ctx, S, hs);
      if (sparks) {
        ctx.globalCompositeOperation = 'lighter';
        g.letters.forEach((L, i) => letterSparks(ctx, L, sts[i]));
        ctx.globalCompositeOperation = 'source-over';
      }
      if (batsOn) drawBats(ctx, S, hs, W, H);
      if (perchOn) drawPerched(ctx, S, hs);
      if (flyOn) drawFlight(ctx, S, hs);
      ctx.restore();
    }
  };
})());
