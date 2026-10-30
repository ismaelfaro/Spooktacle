// Math utilities and procedural drawings on Canvas 2D.
// No external images: everything scales to any zone size and works offline.

const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
// Rises from 0 to 1 over `start`, falls to 0 at `end`; ramps of `fade`
const pulse = (x, start, end, fade = 0.5) => smooth(start, start + fade, x) * (1 - smooth(end - fade, end, x));
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a)})`;
const easeBack = k => 1 + 2.7 * (k - 1) ** 3 + 1.7 * (k - 1) ** 2;

// Deterministic pseudo-random: same seed = same drawing on every frame
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
function hashString(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function noise1(x) { const i = Math.floor(x), f = x - i; return lerp(hash(i), hash(i + 1), f * f * (3 - 2 * f)); }
// Candle-like flicker, 0.5..1
function flicker(t, seed = 0) { return 0.5 + 0.5 * (noise1(t * 6 + seed * 13.1) * 0.65 + noise1(t * 19 + seed * 7.3) * 0.35); }

// ---------- primitives ----------

function ell(ctx, x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); ctx.fill(); }
function tri(ctx, ax, ay, bx, by, cx, cy) { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill(); }

// Extra animation curves (0..1 → 0..1)
const easeInOut = k => (k = clamp(k), k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const easeOut = k => 1 - (1 - clamp(k)) ** 3;
const easeElastic = k => (k = clamp(k), k === 0 || k === 1 ? k : 2 ** (-9 * k) * Math.sin((k * 10 - 0.75) * TAU / 3) + 1);

// Cached sprites (static and costly parts are painted once); quantized sizes so they can be reused
const _SPR = new Map();
function _sprite(key, w, h, paint) {
  let c = _SPR.get(key);
  if (!c) {
    w = Math.max(1, Math.ceil(w)); h = Math.max(1, Math.ceil(h));
    if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(w, h);
    else { c = document.createElement('canvas'); c.width = w; c.height = h; }
    paint(c.getContext('2d'), w, h);
    if (_SPR.size > 320) _SPR.delete(_SPR.keys().next().value);
    _SPR.set(key, c);
  }
  return c;
}
const _qsize = v => Math.round(1.1 ** Math.round(Math.log(Math.max(2, v)) / Math.log(1.1)));
// Global show clock (if it exists) for effects that don't receive t
const _clock = () => (typeof S !== 'undefined' && S && Number.isFinite(S.T) ? S.T : 0);
// Radial gradient in a single call
function radial(ctx, x, y, r0, r1, stops) {
  const g = ctx.createRadialGradient(x, y, Math.max(0, r0), x, y, Math.max(0.1, r1));
  for (const [p, c] of stops) g.addColorStop(p, c);
  return g;
}

function glow(ctx, x, y, r, c, a = 1) {
  if (r <= 0 || a <= 0) return;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(c, a));
  g.addColorStop(0.4, rgba(c, a * 0.45));
  g.addColorStop(1, rgba(c, 0));
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function vGradient(ctx, w, h, stops) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [p, c] of stops) g.addColorStop(p, c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function tracePath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

// Draws only the fraction p (0..1) of the outline: "drawing the architecture" effect
function strokePartial(ctx, pts, p) {
  const n = pts.length, lens = [];
  let total = 0;
  for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; lens.push(Math.hypot(b[0] - a[0], b[1] - a[1])); total += lens[i]; }
  let left = total * clamp(p);
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n && left > 0; i++) {
    const a = pts[i], b = pts[(i + 1) % n], k = Math.min(1, left / lens[i]);
    ctx.lineTo(lerp(a[0], b[0], k), lerp(a[1], b[1], k));
    left -= lens[i];
  }
  ctx.stroke();
}

function neonStroke(ctx, pts, p, color, lw, a = 1) {
  if (p <= 0 || a <= 0) return;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  for (const [c, mul, al] of [[color, 4, 0.25], [color, 1.8, 0.6], [mix(color, [255, 255, 255], 0.6), 0.7, 1]]) {
    ctx.strokeStyle = rgba(c, al * a);
    ctx.lineWidth = lw * mul;
    strokePartial(ctx, pts, p);
  }
  ctx.restore();
}

// ---------- ambience ----------

function drawNight(ctx, w, h, a = 1) { vGradient(ctx, w, h, [[0, rgba([8, 6, 30], a)], [1, rgba([42, 14, 64], a)]]); }

// Stars: mostly twinkling dots (warm and cold); a few large ones with halo and cross-shaped flare
function drawStars(ctx, w, h, t, n, seed = 3, a = 1) {
  if (a <= 0) return;
  const r = rng(seed), s = Math.max(1.5, Math.min(w, h) / 250), big = [];
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h * 0.7, sp = 1 + r() * 3, ph = r() * TAU, mag = r(), warm = r();
    const tw = 0.5 + 0.5 * Math.sin(t * sp + ph), al = a * (0.35 + 0.65 * tw);
    if (mag > 0.88) { big.push([x, y, al, tw]); continue; }
    const sz = s * (0.7 + mag * 0.6);
    ctx.fillStyle = rgba(warm < 0.5 ? [255, 246, 215] : [210, 225, 255], al);
    ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
  }
  for (const [x, y, al, tw] of big) {
    glow(ctx, x, y, s * 5, [200, 215, 255], 0.55 * al);
    const L = s * (2 + 4 * tw * tw);
    ctx.strokeStyle = rgba([235, 240, 255], al * 0.8); ctx.lineWidth = Math.max(1, s * 0.4);
    ctx.beginPath(); ctx.moveTo(x - L, y); ctx.lineTo(x + L, y); ctx.moveTo(x, y - L); ctx.lineTo(x, y + L); ctx.stroke();
    ctx.fillStyle = rgba([255, 255, 255], al);
    ctx.fillRect(x - s * 0.7, y - s * 0.7, s * 1.4, s * 1.4);
  }
}

// Full moon: layered halo and disc with seas, craters with lit rims and darkening at the limb.
// Options: tint [r,g,b] (blood moon, etc.), halo 0..1
function drawMoon(ctx, x, y, r, o = {}) {
  const halo = o.halo ?? 1, tint = o.tint;
  const hc = tint ? mix(tint, [255, 255, 255], 0.3) : [190, 205, 255];
  if (halo > 0) {
    // halo in a single gradient: warm core close to the disc and a wide cold veil
    const hr = r * 3.3, k = r / hr, mid = tint ? mix(tint, [255, 240, 220], 0.4) : [235, 235, 255];
    ctx.fillStyle = radial(ctx, x, y, 0, hr, [[0, rgba([255, 250, 235], 0.6 * halo)], [k * 1.05, rgba([255, 250, 235], 0.5 * halo)], [k * 1.6, rgba(mid, 0.26 * halo)], [k * 2.6, rgba(hc, 0.12 * halo)], [1, rgba(hc, 0)]]);
    ctx.fillRect(x - hr, y - hr, hr * 2, hr * 2);
  }
  const R = _qsize(r);
  const disc = _sprite(`moon${R}`, R * 2, R * 2, (c, w) => {
    const rnd = rng(42);
    c.translate(w / 2, w / 2);
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.clip();
    c.fillStyle = radial(c, -R * 0.35, -R * 0.35, R * 0.05, R * 1.25, [[0, '#fffdf0'], [0.45, '#f3ecd0'], [0.8, '#d9cfa6'], [1, '#b8ad85']]);
    c.fillRect(-R, -R, R * 2, R * 2);
    // seas: large soft patches
    for (const [mx, my, mr] of [[-0.3, -0.15, 0.36], [0.12, -0.32, 0.26], [0.25, 0.1, 0.3], [-0.05, 0.38, 0.22], [-0.42, 0.25, 0.18], [0.42, -0.1, 0.16]]) {
      c.fillStyle = radial(c, mx * R, my * R, 0, mr * R, [[0, 'rgba(140,130,105,0.42)'], [0.7, 'rgba(150,140,112,0.25)'], [1, 'rgba(150,140,112,0)']]);
      c.fillRect((mx - mr) * R, (my - mr) * R, mr * 2 * R, mr * 2 * R);
    }
    // craters: dark floor, light rim at the bottom right
    for (let i = 0; i < 11; i++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * 0.85, cr = R * (0.02 + rnd() * rnd() * rnd() * 0.16);
      const cx = Math.cos(a) * d * R, cy = Math.sin(a) * d * R;
      c.fillStyle = 'rgba(120,110,88,0.35)';
      c.beginPath(); c.arc(cx, cy, cr, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,252,235,0.35)'; c.lineWidth = Math.max(0.6, cr * 0.2);
      c.beginPath(); c.arc(cx, cy, cr, -0.2, Math.PI * 0.9); c.stroke();
      c.strokeStyle = 'rgba(100,90,70,0.35)';
      c.beginPath(); c.arc(cx, cy, cr, Math.PI * 1.0, Math.PI * 1.7); c.stroke();
    }
    // bright crater with rays
    c.strokeStyle = 'rgba(255,253,240,0.08)'; c.lineWidth = Math.max(0.8, R * 0.02);
    c.beginPath();
    for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + rnd() * 0.4, l = R * (0.12 + rnd() * 0.25); c.moveTo(-R * 0.18, R * 0.55); c.lineTo(-R * 0.18 + Math.cos(a) * l, R * 0.55 + Math.sin(a) * l); }
    c.stroke();
    c.fillStyle = 'rgba(255,253,240,0.6)'; c.beginPath(); c.arc(-R * 0.18, R * 0.55, R * 0.025, 0, TAU); c.fill();
    // limb and soft shadow on the side opposite the light
    c.fillStyle = radial(c, -R * 0.2, -R * 0.2, R * 0.75, R * 1.15, [[0, 'rgba(90,80,70,0)'], [1, 'rgba(90,80,70,0.45)']]);
    c.fillRect(-R, -R, R * 2, R * 2);
  });
  ctx.drawImage(disc, x - r, y - r, r * 2, r * 2);
  if (tint) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = rgba(tint); ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.restore();
  }
}

function drawFog(ctx, w, h, t, a = 0.3, c = [170, 190, 230]) {
  if (a <= 0) return;
  for (let i = 0; i < 6; i++) {
    const x = (((i * 0.21 + t * 0.015 * (1 + (i % 3))) % 1.4) - 0.2) * w;
    const y = h * (0.82 + 0.1 * Math.sin(i * 1.7 + t * 0.3));
    ctx.save(); ctx.translate(x, y); ctx.scale(2.5, 1);
    glow(ctx, 0, 0, h * (0.25 + 0.12 * hash(i)), c, a);
    ctx.restore();
  }
}

function drawRain(ctx, w, h, t, n, a = 0.4, seed = 1) {
  const r = rng(seed);
  ctx.strokeStyle = rgba([170, 190, 235], a);
  ctx.lineWidth = Math.max(1, h / 450);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const x0 = r() * w * 1.2, sp = 1.4 + r() * 0.8, ph = r(), len = h * (0.03 + r() * 0.04);
    const y = ((ph + t * sp) % 1) * (h + len) - len, x = x0 - y * 0.18;
    ctx.moveTo(x, y); ctx.lineTo(x - len * 0.18, y + len);
  }
  ctx.stroke();
}

function drawCandleLight(ctx, w, h, t, seed, a) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  if (a <= 0) return;
  const f = flicker(t, seed) * a;
  vGradient(ctx, w, h, [[0, rgba([40, 10, 0], f)], [1, rgba([200, 80, 10], f)]]);
  glow(ctx, w * (0.5 + Math.sin(t * 0.7 + seed) * 0.05), h * 0.85, Math.max(w, h) * 0.75, [255, 170, 60], 0.8 * f);
}

// Fire tongue: wide base at y0, tip at (xt, y0 - fh) that curves
function _flame(ctx, x0, y0, bw, fh, xt) {
  ctx.moveTo(x0 - bw, y0);
  ctx.bezierCurveTo(x0 - bw * 1.05, y0 - fh * 0.45, xt - bw * 0.45, y0 - fh * 0.68, xt, y0 - fh);
  ctx.bezierCurveTo(xt + bw * 0.2, y0 - fh * 0.62, x0 + bw * 1.05, y0 - fh * 0.42, x0 + bw, y0);
  ctx.closePath();
}

// Fire filling the zone: ember bed, three flame layers (red behind, yellow in front)
// that blend by adding light, and little flame balls that break off. Options: seed, height (0..1)
function drawFire(ctx, w, h, t, a, o = {}) {
  if (a <= 0) return;
  const seed = o.seed ?? 0, hk = o.height ?? 1;
  vGradient(ctx, w, h, [[0, rgba([12, 0, 0], a)], [0.5, rgba([90, 10, 0], a)], [0.85, rgba([200, 50, 0], a)], [1, rgba([255, 110, 10], a)]]);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const n = Math.max(4, Math.round((w / h) * 4.5));
  const layers = [[[200, 30, 0], 1.0, 1.1, 0.55], [[255, 110, 10], 0.75, 0.9, 0.6], [[255, 220, 120], 0.45, 0.65, 0.65]];
  layers.forEach(([col, hmul, wmul, al], L) => {
    const g = ctx.createLinearGradient(0, h, 0, h * (1 - 0.95 * hmul * hk));
    g.addColorStop(0, rgba(col, al * a)); g.addColorStop(0.6, rgba(col, al * a * 0.6)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    const m = n + L;
    for (let i = 0; i < m; i++) {
      const k = i + L * 0.37 + seed * 0.13, u = (i + 0.5 + (L % 2) * 0.5 + (hash(k * 1.7) - 0.5) * 0.7) / m;
      const fh = h * hk * hmul * (0.35 + 0.6 * noise1(t * (1.6 + L * 0.5) + k * 3.7)) * (0.7 + 0.3 * Math.sin(t * 3 + k)) * (0.75 + 0.5 * hash(k * 2.9));
      const x0 = u * w + Math.sin(t * 1.3 + k) * w * 0.015, bw = (w / m) * 0.62 * wmul * (0.7 + 0.6 * hash(k * 4.1));
      const xt = x0 + (noise1(t * 2.2 + k * 1.9) - 0.5) * bw * 1.8;
      _flame(ctx, x0, h + h * 0.02, bw, fh, xt);
    }
    ctx.fill();
  });
  // flame balls that break off and rise while shrinking
  const blobs = Math.round(n * 1.5);
  for (let i = 0; i < blobs; i++) {
    const per = 0.9 + hash(i + seed) * 0.8, p = ((t / per + hash(i * 3.1 + seed)) % 1);
    const x = (hash(i * 7.3 + seed) * 1.1 - 0.05) * w + Math.sin(t * 2 + i) * w * 0.02;
    const y = h * (1 - hk * (0.45 + p * 0.65)), r = (w / n) * 0.18 * (1 - p);
    if (r > 0.5) glow(ctx, x, y, r * 2, p < 0.5 ? [255, 190, 60] : [255, 90, 10], 0.7 * a * (1 - p));
  }
  ctx.restore();
}

// Embers: sparks that rise spinning, cool (yellow → red) and leave a short trail
function drawEmbers(ctx, w, h, t, n, a, seed = 1) {
  if (a <= 0) return;
  const r = rng(seed), s = Math.max(1.5, h / 300);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x0 = r() * w, sp = 0.08 + r() * 0.15, ph = r(), sz = s * (1 + r() * 1.5), sw = 0.5 + r();
    const p = (ph + t * sp) % 1;
    const x = x0 + Math.sin(t * 2 * sw + i) * w * 0.02 + Math.sin(p * 9 + i) * h * 0.03, y = h * (1 - p);
    const vx = Math.cos(p * 9 + i) * 0.27 * h * sp * 9 + Math.cos(t * 2 * sw + i) * 0.04 * w * sw, vy = -h * sp;
    const tw = 0.6 + 0.4 * Math.sin(t * 17 + i * 5), al = a * (1 - p) * tw;
    const col = mix([255, 230, 120], [255, 60, 10], p);
    ctx.strokeStyle = rgba(col, al * 0.7); ctx.lineWidth = sz * 0.8;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - vx * 0.06, y - vy * 0.06); ctx.stroke();
    ctx.fillStyle = rgba(mix(col, [255, 255, 255], 0.4), al);
    ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
  }
  ctx.restore();
}

// ---------- characters ----------

// Ghost outline: round head, a skirt that opens and a bottom with lobes that ripple.
// lag(d) shifts in x according to depth d (0 head .. 1 bottom): the tail trails behind the body.
function _ghostPath(ctx, r, hem, t, amp, ph, lag, flare = 1.12) {
  const N = 5, xr = r * flare, l1 = lag(1);
  ctx.beginPath();
  ctx.moveTo(-r, 0);
  ctx.arc(0, 0, r, Math.PI, 0);
  ctx.bezierCurveTo(r * 1.02 + lag(0.3), hem * 0.35, xr + lag(0.75), hem * 0.7, xr + l1, hem);
  for (let i = 0; i < N; i++) {
    const k1 = (i + 1) / N, km = (i + 0.5) / N;
    const xa = lerp(xr, -xr, k1) + l1 + Math.sin(t * 2.3 + i * 2.1 + ph) * r * 0.04;
    const xm = lerp(xr, -xr, km) + l1 * 1.15;
    const tip = hem + r * amp * (0.75 + 0.45 * Math.sin(t * 4.2 - i * 1.25 + ph));
    const ya = i === N - 1 ? hem : hem - r * 0.1 * (0.6 + 0.4 * Math.sin(t * 3.1 + i + ph));
    ctx.quadraticCurveTo(xm, tip * 1.02 + r * 0.06, xa, ya);
  }
  ctx.bezierCurveTo(-xr + lag(0.75), hem * 0.7, -r * 1.02 + lag(0.3), hem * 0.35, -r, 0);
  ctx.closePath();
}

// Cold halo of the ghost as a sprite (quantized size and tint)
function _ghostHalo(hr, hc) {
  const R = _qsize(hr);
  return _sprite(`gh${R}:${hc.map(v => v | 0).join(',')}`, R * 2, R * 2, (c, w) => {
    c.fillStyle = radial(c, R, R, 0, R, [[0, rgba(mix(hc, [255, 255, 255], 0.4), 0.2)], [0.3, rgba(hc, 0.11)], [0.62, rgba(hc, 0.035)], [1, rgba(hc, 0)]]);
    c.fillRect(0, 0, w, w);
  });
}
// Ghost: (x, y) center of the head, s ≈ width. Options: alpha, tilt, arms, wave, lookX/lookY,
// seed, mouth 0..1, vx (flight direction -1..1, the tail stays behind), squash -1..1,
// color [r,g,b] (tint), mood 'happy' | 'scared' | 'boo' (mischievous, D-shaped mouth with little fangs), glow (0..1 halo intensity)
function drawGhost(ctx, x, y, s, t, o = {}) {
  const a = o.alpha ?? 1;
  if (a <= 0.01) return;
  const r = s / 2, seed = o.seed ?? 0, ph = seed * 1.7;
  const tint = o.color || [200, 225, 255];
  const breathe = Math.sin(t * 2.1 + ph);
  const sq = (o.squash ?? 0) + breathe * 0.035;
  const vx = clamp(o.vx ?? 0, -1, 1);
  // the tail follows the body with a delay (follow-through) and drags when flying
  const swayK = (-Math.sin(t * 1.3 - 0.9 + ph) * 0.24 - vx * 0.38) * r;
  const lag = d => swayK * d * d;
  const hem = s * 0.86;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.translate(x, y);
  ctx.rotate(o.tilt ?? Math.sin(t * 1.3 + ph) * 0.07 + vx * 0.12);
  ctx.scale(1 - sq * 0.5, 1 + sq);
  // soft cold halo (edge, not a wash: the dark background gives the contrast)
  const gk = o.glow ?? 1;
  if (gk > 0) {
    const hc = mix(tint, [110, 165, 255], 0.4), hx = lag(0.5) * 0.3, hy = r * 0.4, hr = s * 1.05;
    const ga = ctx.globalAlpha;
    ctx.globalAlpha = ga * clamp(gk);
    ctx.drawImage(_ghostHalo(hr, hc), hx - hr, hy - hr, hr * 2, hr * 2);
    ctx.globalAlpha = ga;
  }
  // rear veils: translucent tail in layers, each with its own phase
  for (const [k, al, sp, pp] of [[1.22, 0.3, 0.8, 2.2], [1.1, 0.45, 1.05, 1.1]]) {
    const wc = mix(tint, [150, 195, 255], 0.5), wg = ctx.createLinearGradient(0, hem * 0.45, 0, hem * k + r * 0.5);
    wg.addColorStop(0, rgba(wc, 0)); wg.addColorStop(0.55, rgba(wc, al)); wg.addColorStop(1, rgba(wc, 0));
    ctx.fillStyle = wg;
    _ghostPath(ctx, r * 0.98, hem * k, t * sp, 0.5, ph + pp, d => lag(d) * (1 + (k - 1) * 4) + Math.sin(t * 1.7 + pp) * r * 0.08 * d, 1.05 + (k - 1) * 0.6);
    ctx.fill();
  }
  // arms (behind the body): sway with a delay; with wave it waves
  if (o.arms !== false) {
    const armG = ctx.createLinearGradient(0, -r * 0.4, 0, r * 0.9);
    armG.addColorStop(0, '#ffffff'); armG.addColorStop(1, rgba(mix(tint, [255, 255, 255], 0.3)));
    ctx.fillStyle = armG;
    const sw = Math.sin(t * 2 - 0.6 + ph) * 0.22;
    // arm: a drop born inside the body that ends in a rounded tip
    const arm = () => {
      ctx.beginPath();
      ctx.moveTo(0, -r * 0.22);
      ctx.bezierCurveTo(r * 0.34, -r * 0.27, r * 0.6, -r * 0.14, r * 0.64, 0);
      ctx.bezierCurveTo(r * 0.66, r * 0.13, r * 0.34, r * 0.16, 0, r * 0.22);
      ctx.closePath(); ctx.fill();
    };
    ctx.save(); ctx.translate(-r * 0.78, r * 0.38); ctx.scale(-1, 1); ctx.rotate(0.6 - sw + vx * 0.3); arm(); ctx.restore();
    ctx.save();
    if (o.wave) { ctx.translate(r * 0.8, r * 0.2); ctx.rotate(-1.05 + Math.sin(t * 7.5) * 0.42); }
    else { ctx.translate(r * 0.78, r * 0.38); ctx.rotate(0.6 - sw - vx * 0.3); }
    arm(); ctx.restore();
  }
  // body: luminous, opaque almost down to the bottom (crisp silhouette), only the final edge becomes translucent
  const bg = ctx.createLinearGradient(0, -r, 0, hem + r * 0.4);
  bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.5, rgba(mix(tint, [255, 255, 255], 0.75)));
  bg.addColorStop(0.85, rgba(mix(tint, [255, 255, 255], 0.4))); bg.addColorStop(1, rgba(tint, 0.6));
  _ghostPath(ctx, r, hem, t, 0.3, ph, lag);
  ctx.fillStyle = bg; ctx.fill();
  // volume in a single radial: inner glow + cold shadow toward the edge; then a luminous edge (fresnel)
  ctx.fillStyle = radial(ctx, -r * 0.12, r * 0.1, 0, s * 1.2, [[0, 'rgba(255,255,255,0.5)'], [0.36, 'rgba(255,255,255,0)'], [0.62, rgba(mix(tint, [60, 90, 200], 0.6), 0.14)], [1, rgba(mix(tint, [40, 60, 170], 0.7), 0.45)]]);
  ctx.fill();
  ctx.lineWidth = r * 0.07; ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.stroke();
  // face (shifts toward where it looks: sense of volume)
  const lx = clamp(o.lookX ?? 0, -1.5, 1.5) * r * 0.2, ly = clamp(o.lookY ?? 0, -1.5, 1.5) * r * 0.12;
  const bc = (t * 0.31 + seed * 0.37) % 1, blink = bc < 0.045 ? 1 - Math.sin((bc / 0.045) * Math.PI) * 0.92 : 1;
  const mo = clamp(o.mouth ?? 0.3), scared = o.mood === 'scared', boo = o.mood === 'boo';
  const ex = r * 0.35, ey = -r * 0.04 + ly, erx = r * 0.15, ery = r * 0.21 * (scared ? 1.12 : 1) * (1 + mo * 0.12);
  // cheeks (invisible from afar on small ghosts)
  if (s >= 80) {
    for (const sx of [-1, 1]) {
      ctx.fillStyle = radial(ctx, sx * r * 0.6 + lx * 0.8, r * 0.25 + ly, 0, r * 0.2, [[0, 'rgba(255,120,165,0.55)'], [1, 'rgba(255,120,165,0)']]);
      ctx.fillRect(sx * r * 0.6 + lx * 0.8 - r * 0.2, r * 0.05 + ly, r * 0.4, r * 0.4);
    }
  }
  ctx.fillStyle = '#170c2c';
  for (const sx of [-1, 1]) {
    const exx = sx * ex + lx;
    if (blink < 0.3) {
      // closed eye: small smiling arc
      ctx.strokeStyle = '#170c2c'; ctx.lineWidth = r * 0.06; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(exx, ey + ery * 0.2, erx * 0.9, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    } else ell(ctx, exx, ey, erx, ery * blink);
  }
  if (blink >= 0.3) {
    // eye highlights: make them tender
    ctx.fillStyle = '#ffffff';
    for (const sx of [-1, 1]) {
      const exx = sx * ex + lx + clamp(o.lookX ?? 0, -1, 1) * erx * 0.25;
      ell(ctx, exx - erx * 0.32, ey - ery * 0.38 * blink, erx * 0.36, erx * 0.36 * blink);
      if (s >= 60) ell(ctx, exx + erx * 0.35, ey + ery * 0.4 * blink, erx * 0.16, erx * 0.16 * blink);
    }
  }
  if (scared || boo) {
    // eyebrows: worried (scared) or mischievous (boo)
    const k = scared ? 1 : -1;
    ctx.strokeStyle = '#170c2c'; ctx.lineWidth = r * 0.055; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-ex - erx + lx, ey - ery * (1.6 - 0.15 * k)); ctx.lineTo(-ex + erx * 0.85 + lx, ey - ery * (1.6 + 0.15 * k));
    ctx.moveTo(ex + erx + lx, ey - ery * (1.6 - 0.15 * k)); ctx.lineTo(ex - erx * 0.85 + lx, ey - ery * (1.6 + 0.15 * k));
    ctx.stroke();
  }
  // mouth: an "o" that opens; with the mouth wide open the tongue shows
  const mx = lx * 0.9, my = r * 0.42 + ly, mrx = r * (0.09 + 0.08 * mo), mry = r * (0.05 + 0.2 * mo);
  if (boo) {
    // very wide D-shaped mouth, tongue and two little fangs
    const bw = r * (0.16 + 0.1 * mo), bt = my - r * 0.06, bb = my + r * (0.08 + 0.22 * mo);
    ctx.beginPath();
    ctx.moveTo(mx - bw, bt); ctx.quadraticCurveTo(mx, bt - r * 0.04, mx + bw, bt);
    ctx.quadraticCurveTo(mx + bw * 0.95, bb, mx, bb); ctx.quadraticCurveTo(mx - bw * 0.95, bb, mx - bw, bt);
    ctx.fillStyle = '#170c2c'; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.fillStyle = '#ff6f96'; ell(ctx, mx + bw * 0.1, bb, bw * 0.6, (bb - bt) * 0.45);
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    for (const sx of [-1, 1]) tri(ctx, mx + sx * bw * 0.62, bt - r * 0.01, mx + sx * bw * 0.32, bt - r * 0.02, mx + sx * bw * 0.48, bt + r * 0.09);
  } else if (mo < 0.12 && !scared) {
    ctx.strokeStyle = '#170c2c'; ctx.lineWidth = r * 0.055; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(mx, my - r * 0.06, r * 0.11, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
  } else {
    ctx.fillStyle = '#170c2c'; ell(ctx, mx, my, mrx, mry);
    if (mo > 0.35) {
      // tongue: low ellipse inside the mouth (no clipping: it stays inside by geometry)
      ctx.fillStyle = '#ff6f96'; ell(ctx, mx, my + mry * 0.45, mrx * 0.62, mry * 0.42);
    }
  }
  ctx.restore();
}

// Pumpkin body (segments, glow and shadow) in a sprite: it is static, scaled with the squash.
// Reddish-orange and dark skin: the carved face (almost white) has to stand out at least 2.5× in value.
// dark = unlit version (no candle) to fade over depending on the light
function _pumpkinBody(r, variant, dark) {
  const R = _qsize(r), pad = 1.08, W = R * 2 * pad, H = R * 1.7 * pad;
  return _sprite(`pk3${R}:${variant}:${dark ? 1 : 0}`, W, H, (c, w, h) => {
    const rnd = rng(variant * 977 + 13), rx = R, ry = R * 0.8;
    c.translate(w / 2, h / 2);
    const hue = (rnd() - 0.5) * 18;
    const col = k => [lerp(175, 240, k), clamp(lerp(42, 112, k) + hue, 0, 255), lerp(0, 22, k)];
    const dk = dark ? 0.3 : 1, dc = v => [v[0] * dk, v[1] * dk * 0.8, v[2] * dk];
    // segments from outside in: the lower and darker sides (turn away from the audience)
    const lobes = [[-0.66, 0.36, 0.62, 0.8], [0.66, 0.36, 0.62, 0.8], [-0.46, 0.42, 0.78, 0.9], [0.46, 0.42, 0.78, 0.9], [-0.23, 0.46, 0.9, 0.97], [0.23, 0.46, 0.9, 0.97], [0, 0.46, 1, 1]];
    for (const [ox, sw, lit, hk] of lobes) {
      const gx = ox * rx + (rnd() - 0.5) * rx * 0.03, lry = ry * (hk + (rnd() - 0.5) * 0.03), lrx = rx * sw;
      // elliptical gradient: painted on a unit circle scaled to the segment
      c.save();
      c.translate(gx, (1 - hk) * ry * 0.3); c.scale(lrx, lry);
      const g = c.createRadialGradient(-0.25 - ox * 0.25, -0.4, 0.02, 0, 0.05, 1.04);
      g.addColorStop(0, rgba(dc(mix(col(1), [255, 205, 130], 0.3 * lit))));
      g.addColorStop(0.42, rgba(dc(mix(col(0.7), [0, 0, 0], 0.18 * (1 - lit)))));
      g.addColorStop(0.78, rgba(dc(mix(col(0.4), [90, 20, 0], 0.5 + 0.25 * (1 - lit)))));
      g.addColorStop(0.92, rgba(dc([92, 20, 0])));
      g.addColorStop(1, rgba(dc([38, 7, 0])));
      c.fillStyle = g;
      c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fill();
      c.restore();
    }
    // contact shadow below and darkened at the poles
    c.save();
    c.beginPath(); c.ellipse(0, 0, rx * 1.04, ry * 1.01, 0, 0, TAU); c.clip();
    const sh = c.createLinearGradient(0, -ry, 0, ry);
    sh.addColorStop(0, 'rgba(50,10,0,0.45)'); sh.addColorStop(0.2, 'rgba(50,10,0,0)');
    sh.addColorStop(0.65, 'rgba(30,5,0,0)'); sh.addColorStop(1, 'rgba(30,5,0,0.65)');
    c.fillStyle = sh; c.fillRect(-rx * 1.1, -ry * 1.1, rx * 2.2, ry * 2.2);
    c.restore();
  });
}

// Stem (and tendril) in a sprite; stem base at (0,0) of the sprite → drawn at (-bx, -by)
function _pumpkinStem(r, odd) {
  const R = _qsize(r), W = R * 1.3, H = R * 0.75, bx = W / 2, by = H * 0.78;
  const c = _sprite(`pks${R}:${odd}`, W, H, c => {
    const rx = R, ry = R * 0.8, sw = rx * 0.11, small = R < 40;
    c.translate(bx, by);
    // base that opens over the pumpkin
    c.fillStyle = radial(c, 0, ry * 0.02, 0, sw * 2.6, [[0, 'rgba(40,20,0,0.6)'], [1, 'rgba(40,20,0,0)']]);
    c.fillRect(-sw * 2.6, -sw * 1.2, sw * 5.2, sw * 2.6);
    const g = c.createLinearGradient(-sw, 0, sw, 0);
    g.addColorStop(0, '#2f3a10'); g.addColorStop(0.4, '#8a9c38'); g.addColorStop(0.7, '#5a6b20'); g.addColorStop(1, '#253008');
    c.fillStyle = g;
    const tip = -ry * 0.5, bend = rx * 0.14 * (odd ? 1 : -1);
    c.beginPath();
    c.moveTo(-sw * 1.6, ry * 0.06);
    c.quadraticCurveTo(-sw * 0.8, -ry * 0.05, -sw * 0.8, tip * 0.5);
    c.quadraticCurveTo(-sw * 0.7, tip * 0.9, bend - sw * 0.6, tip);
    c.lineTo(bend + sw * 0.75, tip + sw * 0.25);
    c.quadraticCurveTo(sw * 0.75, tip * 0.75, sw * 0.8, tip * 0.45);
    c.quadraticCurveTo(sw * 0.8, -ry * 0.05, sw * 1.6, ry * 0.06);
    c.closePath(); c.fill();
    c.fillStyle = '#c4c070';
    ell(c, bend + sw * 0.07, tip + sw * 0.12, sw * 0.7, sw * 0.32, 0.2);
    if (small) return;
    // ridges and curly tendril (only on big pumpkins: from afar they don't show)
    c.strokeStyle = 'rgba(30,40,8,0.7)'; c.lineWidth = Math.max(1, sw * 0.18);
    c.beginPath();
    c.moveTo(-sw * 0.2, ry * 0.02); c.quadraticCurveTo(-sw * 0.25, tip * 0.6, bend * 0.6, tip + sw * 0.2);
    c.moveTo(sw * 0.45, ry * 0.02); c.quadraticCurveTo(sw * 0.4, tip * 0.6, bend * 0.6 + sw * 0.6, tip + sw * 0.3);
    c.stroke();
    c.strokeStyle = '#6f8a26'; c.lineWidth = Math.max(1, sw * 0.28); c.lineCap = 'round';
    c.beginPath();
    c.moveTo(sw * 0.9, -ry * 0.02);
    c.bezierCurveTo(sw * 3, -ry * 0.12, sw * 4.5, ry * 0.02, sw * 3.6, ry * 0.12);
    c.bezierCurveTo(sw * 2.8, ry * 0.2, sw * 2.4, ry * 0.02, sw * 3.3, -ry * 0.02);
    c.stroke();
  });
  return { c, R, W, H, bx, by };
}

// Carved face holes (eyes, nose, mouth) as paths in pumpkin coordinates
function _pumpkinHoles(rx, ry, mo, expr) {
  const holes = [];
  const eyeTop = expr === 'angry' ? -ry * 0.36 : -ry * 0.48;
  holes.push(c => { c.moveTo(-rx * 0.36, eyeTop); c.quadraticCurveTo(-rx * 0.42, -ry * 0.2, -rx * 0.6, -ry * 0.04); c.quadraticCurveTo(-rx * 0.36, expr === 'angry' ? -ry * 0.16 : 0, -rx * 0.12, -ry * 0.04); c.quadraticCurveTo(-rx * 0.28, -ry * 0.22, -rx * 0.36, eyeTop); });
  holes.push(c => { c.moveTo(rx * 0.36, eyeTop); c.quadraticCurveTo(rx * 0.28, -ry * 0.22, rx * 0.12, -ry * 0.04); c.quadraticCurveTo(rx * 0.36, expr === 'angry' ? -ry * 0.16 : 0, rx * 0.6, -ry * 0.04); c.quadraticCurveTo(rx * 0.42, -ry * 0.2, rx * 0.36, eyeTop); });
  holes.push(c => { c.moveTo(0, ry * 0.04); c.lineTo(-rx * 0.1, ry * 0.21); c.quadraticCurveTo(0, ry * 0.24, rx * 0.1, ry * 0.21); c.closePath(); });
  // smile with two teeth on top and one below; mo opens the mouth
  const mw = rx * 0.66, cy = ry * 0.24, top = ry * 0.36, bot = ry * (0.52 + 0.34 * mo), th = (bot - top) * 0.36;
  const topY = k => lerp(cy, top, Math.sqrt(1 - k * k)), botY = k => lerp(cy, bot, (1 - k * k) ** 0.6);
  holes.push(c => {
    c.moveTo(-mw, cy - ry * 0.04);
    const seg = (k0, k1, f, dy) => { for (let i = 0; i <= 6; i++) { const k = lerp(k0, k1, i / 6); c.lineTo(k * mw, f(k) + dy); } };
    seg(-1, -0.46, topY, 0); seg(-0.46, -0.46, topY, th); seg(-0.46, -0.2, topY, th); seg(-0.2, -0.2, topY, 0);
    seg(-0.2, 0.2, topY, 0); seg(0.2, 0.2, topY, th); seg(0.2, 0.46, topY, th); seg(0.46, 0.46, topY, 0); seg(0.46, 1, topY, 0);
    c.lineTo(mw, cy - ry * 0.04);
    seg(1, 0.12, botY, 0); seg(0.12, 0.12, botY, -th * 1.1); seg(0.12, -0.12, botY, -th * 1.1); seg(-0.12, -0.12, botY, 0); seg(-0.12, -1, botY, 0);
    c.closePath();
  });
  return holes;
}

// Carved face in sprites (in coordinates without squash, centered in the sprite):
// layer 0 = unlit holes, 1 = lit (meat wall + almost white background), 2 = glow (for 'lighter').
// Box fitted to the face (fewer pixels to move): pumpkin center at (0.5 w, FACE_CY h)
const _FACE_W = 1.7, _FACE_H = 1.55, _FACE_CY = 0.6 / 1.55;
function _pumpkinFace(r, mq, expr, layer) {
  const R = _qsize(r), W = R * _FACE_W, H = R * _FACE_H;
  return _sprite(`pkf${R}:${mq}:${expr || ''}:${layer}`, W, H, (c, w, h) => {
    const rx = R, ry = R * 0.8, holes = _pumpkinHoles(rx, ry, mq / 7, expr);
    c.translate(w / 2, h * _FACE_CY);
    c.lineJoin = 'round';
    const all = () => { c.beginPath(); for (const hl of holes) hl(c); };
    if (layer === 0) {
      all(); c.fillStyle = '#2a0800'; c.fill();
      c.lineWidth = Math.max(1, R * 0.03); c.strokeStyle = 'rgba(20,4,0,0.9)'; c.stroke();
      return;
    }
    if (layer === 2) {
      // glow: holes fattened and blurred + light licking the skin around them
      c.fillStyle = radial(c, 0, ry * 0.15, 0, R * 0.95, [[0, 'rgba(255,150,50,0.22)'], [0.5, 'rgba(255,110,20,0.1)'], [1, 'rgba(255,100,10,0)']]);
      c.fillRect(-w / 2, -h * _FACE_CY, w, h);
      try { c.filter = `blur(${Math.max(1, R * 0.06).toFixed(1)}px)`; } catch { /* no filters */ }
      all(); c.lineWidth = R * 0.12; c.strokeStyle = 'rgba(255,170,60,0.35)'; c.stroke();
      c.fillStyle = 'rgba(255,190,90,0.35)'; c.fill();
      c.filter = 'none';
      return;
    }
    // meat wall (visible above each hole) and lit background shifted downward
    const wall = R * 0.08;
    all(); c.fillStyle = '#ff9426'; c.fill();
    c.save(); c.clip();
    c.translate(0, wall); all(); c.translate(0, -wall);
    c.fillStyle = radial(c, 0, ry * 0.1, R * 0.04, R * 0.95, [[0, '#fffef0'], [0.6, 'rgb(255,250,220)'], [0.82, 'rgb(255,226,140)'], [1, 'rgb(255,170,60)']]);
    c.fill();
    c.restore();
    all(); c.lineWidth = Math.max(1, R * 0.028); c.strokeStyle = 'rgba(60,10,0,0.9)'; c.stroke();
  });
}

// Shared auxiliary canvas to compose the whole pumpkin and apply alpha only once
let _pkTmp = null;
function _pkScratch(w, h) {
  w = Math.ceil(w); h = Math.ceil(h);
  if (!_pkTmp || _pkTmp.width < w || _pkTmp.height < h) {
    const W = Math.max(w, _pkTmp ? _pkTmp.width : 0), H = Math.max(h, _pkTmp ? _pkTmp.height : 0);
    if (typeof OffscreenCanvas !== 'undefined') _pkTmp = new OffscreenCanvas(W, H);
    else { _pkTmp = document.createElement('canvas'); _pkTmp.width = W; _pkTmp.height = H; }
  }
  const c = _pkTmp.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  c.clearRect(0, 0, w, h);
  return c;
}

// Pumpkin: (x, y) center, r radius. Options: squash -1..1, mouth 0..1, seed, light (interior light; 0 = off and dark),
// expr 'happy' | 'angry', glow 0..1 (outer halo), stem false to remove the stem,
// alpha 0..1 (applied only once to the composed pumpkin: the halo doesn't show through the body;
// a globalAlpha < 1 on the context is handled the same way)
function drawPumpkin(ctx, x, y, r, t, o = {}) {
  const sq = o.squash ?? 0, seed = o.seed ?? 0;
  const mq = Math.round(clamp(o.mouth ?? 0.4) * 7);
  const rx = r * (1 + sq * 0.12), ry = r * 0.8 * (1 - sq * 0.12);
  // f = light with flicker (halo and bloom); fk = how lit the face looks (the flicker barely turns it off)
  const L = Math.max(0, o.light ?? 1), fl = flicker(t, seed);
  const f = clamp(fl * L, 0, 1.3), fk = clamp(L);
  const A = clamp((o.alpha ?? 1) * ctx.globalAlpha);
  if (A <= 0.004) return;
  const gk = o.glow ?? 1;
  ctx.save();
  ctx.translate(x, y);
  // warm halo on the wall: grows with the square of the light (no light, no halo)
  if (gk > 0 && fk > 0.01) {
    const hr = r * 1.6, R = _qsize(hr);
    const halo = _sprite(`pkh${R}`, R * 2, R * 2, (c, w) => {
      c.fillStyle = radial(c, R, R, 0, R, [[0, 'rgba(255,160,50,0.42)'], [0.3, 'rgba(255,120,20,0.24)'], [0.6, 'rgba(255,100,10,0.07)'], [1, 'rgba(255,100,10,0)']]);
      c.fillRect(0, 0, w, w);
    });
    ctx.globalAlpha = clamp(A * gk * fk * (0.4 + 0.6 * f));
    ctx.drawImage(halo, -hr, ry * 0.12 - hr, hr * 2, hr * 2);
  }
  // body + stem + face: direct, or composed separately if there is transparency
  const variant = Math.abs(seed | 0) % 4;
  const bw = rx * 2 * 1.08, bh = ry * 2 * 1.0625 * 1.08;
  const sx = rx / _qsize(r), sy = ry / (0.8 * _qsize(r));
  const face = _pumpkinFace(r, mq, o.expr, 1), fw = face.width * sx, fh = face.height * sy;
  const paint = (c, ox, oy) => {
    if (o.stem !== false) {
      const st = _pumpkinStem(r, Math.abs(seed | 0) % 2);
      c.save();
      c.translate(ox, oy - ry * 0.82);
      c.rotate(sq * 0.25 + Math.sin(t * 1.7 + seed) * 0.04);
      c.drawImage(st.c, -st.bx * sx, -st.by * sy, st.W * sx, st.H * sy);
      c.restore();
    }
    c.drawImage(_pumpkinBody(r, variant), ox - bw / 2, oy - bh / 2, bw, bh);
    if (fk < 0.999) {
      // without a candle the skin goes out: fades the dark version over it
      c.globalAlpha = 0.85 * (1 - fk);
      c.drawImage(_pumpkinBody(r, variant, true), ox - bw / 2, oy - bh / 2, bw, bh);
      c.globalAlpha = 1;
      c.drawImage(_pumpkinFace(r, mq, o.expr, 0), ox - fw / 2, oy - fh * _FACE_CY, fw, fh);
      c.globalAlpha = fk;
    }
    if (fk > 0.001) c.drawImage(face, ox - fw / 2, oy - fh * _FACE_CY, fw, fh);
    c.globalAlpha = 1;
  };
  if (A >= 0.995) { ctx.globalAlpha = 1; paint(ctx, 0, 0); }
  else {
    const pw = rx * 2.4, ph = ry * 3.4, c = _pkScratch(pw, ph);
    paint(c, pw / 2, ph * 0.58);
    ctx.globalAlpha = A;
    ctx.drawImage(_pkTmp, 0, 0, Math.ceil(pw), Math.ceil(ph), -pw / 2, -ph * 0.58, Math.ceil(pw), Math.ceil(ph));
  }
  // bloom: light escaping through the holes (additive)
  if (fk > 0.01) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = clamp(A * fk * (0.6 + 0.5 * f));
    ctx.drawImage(_pumpkinFace(r, mq, o.expr, 2), -fw / 2, -fh * _FACE_CY, fw, fh);
  }
  ctx.restore();
}

// Right wing of the bat: arm to the wrist, three fingers and a scalloped membrane between them.
// wy (compat.) = elevation. It has a fixed dihedral (high wrist, drooping tips): it always reads as an M.
// Leaves the membrane path drawn; if bones is passed, it adds the bones [x0,y0,x1,y1] and the leading edge in bones.edge
function batWing(ctx, s, wy, bones) {
  const th = clamp(wy / (s * 0.6), -1.2, 1.2) * 0.75, fold = 1 - 0.28 * Math.max(0, -th / 0.75);
  const sx = s * 0.07, sy = -s * 0.03;
  const wa = -th * 0.85, wx = sx + Math.cos(wa) * s * 0.4, wyy = sy + Math.sin(wa) * s * 0.4 - s * 0.06;
  const ft = th - 0.22;
  const fingers = [[-ft - 0.12, 0.64], [-ft + 0.42 * fold, 0.52], [-ft + 0.95 * fold, 0.42]].map(([a, l]) => [wx + Math.cos(a) * s * l * fold ** 0.5, wyy + Math.sin(a) * s * l]);
  const tail = [s * 0.05, s * 0.2];
  const pts = [...fingers, tail];
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(lerp(sx, wx, 0.5), Math.min(sy, wyy) - s * 0.03, wx, wyy - s * 0.02);
  ctx.lineTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    ctx.quadraticCurveTo(lerp(mx, wx, 0.42), lerp(my, wyy, 0.42), b[0], b[1]);
  }
  ctx.closePath();
  if (bones) {
    bones.push([sx, sy, wx, wyy]); for (const fg of fingers) bones.push([wx, wyy, fg[0], fg[1]]); bones.push([wx, wyy, wx + s * 0.05, wyy - s * 0.06]);
    bones.edge = [sx, sy, lerp(sx, wx, 0.5), Math.min(sy, wyy) - s * 0.03, wx, wyy - s * 0.02, fingers[0][0], fingers[0][1]];
  }
}

// Bat: (x, y) center, s = half wingspan, flap -1..1 (up..down).
// Options: rim [r,g,b] (edge light to see it against a dark background; null removes it), eyes (false), bones (bone color),
// membrane true (fine backlight on the trailing edge; default no: a dark bat reads better cut out in black),
// edge false (removes the warm edge from the leading edge on dark bats), phase (flap phase in radians:
// if passed, it replaces flap with an asymmetric beat, fast downstroke and slow recovery)
function drawBat(ctx, x, y, s, flap, color = '#0a0612', o = {}) {
  if (o.phase !== undefined) flap = Math.sin(o.phase + 0.6 * Math.sin(o.phase));
  flap = clamp(Number(flap) || 0, -1, 1);
  // color: '#rrggbb', [r,g,b], 'rgb()/rgba()' or any CSS color; with a custom color no edge light is added unless requested
  const base = _rgbOf(color, null), css = Array.isArray(color) ? rgba(color) : String(color);
  const opaque = _alphaOf(color) >= 0.999;
  const rim = o.rim !== undefined ? o.rim : color === '#0a0612' ? [150, 110, 255] : null;
  ctx.save();
  // the body rises slightly when the wings go down
  ctx.translate(x, y + flap * s * 0.08);
  const wy = flap * s * 0.6, bones = [];
  // parts separately (wings, body, ears): the edge is painted before filling any
  const parts = [
    () => batWing(ctx, s, wy, bones.length ? null : bones),
    () => { ctx.save(); ctx.scale(-1, 1); batWing(ctx, s, wy); ctx.restore(); },
    () => { ctx.ellipse(0, s * 0.03, s * 0.1, s * 0.17, 0, 0, TAU); ctx.moveTo(s * 0.085, -s * 0.15); ctx.arc(0, -s * 0.15, s * 0.085, 0, TAU); },
    () => { for (const sd of [-1, 1]) { ctx.moveTo(sd * s * 0.075, -s * 0.18); ctx.lineTo(sd * s * 0.06, -s * 0.33); ctx.lineTo(sd * s * 0.02, -s * 0.21); ctx.closePath(); } },
  ];
  if (rim) {
    ctx.strokeStyle = rgba(rim, 0.45); ctx.lineWidth = Math.max(1, s * 0.05); ctx.lineJoin = 'round';
    for (const p of parts) { ctx.beginPath(); p(); ctx.stroke(); }
  }
  ctx.fillStyle = css;
  for (const p of parts) { ctx.beginPath(); p(); ctx.fill(); }
  const dark = base && opaque && base[0] + base[1] + base[2] < 150;
  const [, , wx, wyy] = bones[0];
  // optional backlit membrane: thin band only along the trailing edge
  if (o.membrane === true && s > 14) {
    const mc = o.membraneColor || [120, 60, 170];
    for (const sd of [1, -1]) {
      ctx.save(); ctx.scale(sd, 1);
      ctx.beginPath(); batWing(ctx, s, wy); ctx.clip();
      const g = ctx.createRadialGradient(wx, wyy, s * 0.05, wx, wyy + s * 0.08, s * 0.62);
      g.addColorStop(0, rgba(mc, 0)); g.addColorStop(0.75, rgba(mc, 0)); g.addColorStop(1, rgba(mix(mc, [200, 150, 255], 0.3), 0.2));
      ctx.fillStyle = g; ctx.fillRect(-s * 0.2, -s * 1.2, s * 1.5, s * 2.4);
      ctx.restore();
    }
  }
  // finger bones (only with an opaque color: on a translucent-edge silhouette they would show through)
  if (s > 10 && base && opaque) {
    const bc = o.bones || (dark ? mix(base, [70, 50, 100], 0.35) : mix(base, [120, 90, 160], 0.35));
    ctx.strokeStyle = rgba(bc); ctx.lineCap = 'round';
    for (let i = 0; i < bones.length; i++) {
      const [a, b, c, d] = bones[i];
      ctx.lineWidth = Math.max(1, s * (i === 0 ? 0.045 : 0.026));
      ctx.beginPath(); ctx.moveTo(a, b); ctx.lineTo(c, d); ctx.moveTo(-a, b); ctx.lineTo(-c, d); ctx.stroke();
    }
    // wrist knuckle
    ctx.fillStyle = rgba(bc); ell(ctx, wx, wyy, s * 0.03, s * 0.03); ell(ctx, -wx, wyy, s * 0.03, s * 0.03);
  }
  // warm edge on the leading edge: outlines the dark bat against a lit wall
  if (dark && o.edge !== false && bones.edge) {
    const [a, b, qx, qy, c, d, e, f2] = bones.edge;
    ctx.strokeStyle = 'rgba(255,190,120,0.55)'; ctx.lineWidth = Math.max(1, s * 0.035); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    for (const sd of [1, -1]) { ctx.moveTo(sd * a, b); ctx.quadraticCurveTo(sd * qx, qy, sd * c, d); ctx.lineTo(sd * e, f2); }
    ctx.stroke();
  }
  if (o.eyes !== false) {
    glow(ctx, 0, -s * 0.15, s * 0.08, [255, 40, 30], 0.6);
    if (s >= 25) {
      ctx.fillStyle = '#ff5a3c';
      ell(ctx, -s * 0.032, -s * 0.155, s * 0.018, s * 0.016);
      ell(ctx, s * 0.032, -s * 0.155, s * 0.018, s * 0.016);
    }
  }
  ctx.restore();
}

// Flock: asymmetric flapping (fast downstroke; drawBat raises the body when the wings go down) and tilts when turning
function drawBatFlock(ctx, w, h, t, n, seed = 5, o = {}) {
  for (let i = 0; i < n; i++) {
    const k = seed * 10 + i;
    const sp = (o.speed ?? 0.07) * (0.7 + 0.6 * hash(k));
    let p = ((t * sp + hash(k + 2)) % 1.3) - 0.15;
    const dir = hash(k + 1) < 0.5 ? -1 : 1;
    if (dir < 0) p = 1 - p;
    const fp = t * 13 * (0.85 + 0.3 * hash(k + 5)) + i * 2, flap = Math.sin(fp + 0.6 * Math.sin(fp));
    const s = Math.min(w, h) * (o.size ?? 0.06) * (0.7 + 0.6 * hash(k + 4));
    const y = h * ((o.y0 ?? 0.1) + (o.yr ?? 0.55) * hash(k + 3)) + Math.sin(t * 2 + i) * h * 0.04 + flap * s * 0.04;
    ctx.save();
    ctx.translate(p * w, y);
    ctx.rotate(Math.cos(t * 2 + i) * 0.25 * dir + dir * 0.08);
    drawBat(ctx, 0, 0, s, flap, o.color, o);
    ctx.restore();
  }
}

// '#rrggbb', 'rgb(...)', 'rgba(...)' or [r,g,b] → [r,g,b]
function _rgbOf(c, fb) {
  if (Array.isArray(c)) return c;
  if (typeof c === 'string') {
    if (/^#[0-9a-f]{6}$/i.test(c)) return [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
    const m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(c);
    if (m) return [+m[1], +m[2], +m[3]];
  }
  return fb;
}
// alpha of a simple CSS color (1 if unknown)
function _alphaOf(c) {
  if (Array.isArray(c)) return c.length > 3 ? c[3] : 1;
  const m = typeof c === 'string' && /^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\s*\)/i.exec(c);
  return m ? +m[1] : 1;
}

// Traces a symmetric outline: segs = right half from top to bottom [[c1x,c1y,c2x,c2y,x,y], ...]
// from (0, y0); the left half is traced mirrored and back
function _mirrorPath(ctx, s, y0, segs) {
  ctx.beginPath();
  ctx.moveTo(0, y0 * s);
  for (const q of segs) ctx.bezierCurveTo(q[0] * s, q[1] * s, q[2] * s, q[3] * s, q[4] * s, q[5] * s);
  const last = segs[segs.length - 1];
  ctx.lineTo(-last[4] * s, last[5] * s);
  for (let i = segs.length - 1; i >= 0; i--) {
    const q = segs[i], p = i ? segs[i - 1] : [0, 0, 0, 0, 0, y0];
    ctx.bezierCurveTo(-q[2] * s, q[3] * s, -q[0] * s, q[1] * s, -p[4] * s, p[5] * s);
  }
  ctx.closePath();
}

const _CRANIUM = [[0.3, -0.5, 0.5, -0.33, 0.5, -0.06], [0.5, 0.06, 0.44, 0.1, 0.42, 0.17], [0.46, 0.21, 0.45, 0.31, 0.36, 0.34], [0.3, 0.35, 0.26, 0.36, 0.25, 0.4], [0.25, 0.42, 0.245, 0.43, 0.24, 0.44]];
const _MANDIBLE = [[0.345, 0.26, 0.345, 0.26, 0.345, 0.26], [0.34, 0.36, 0.34, 0.46, 0.33, 0.5], [0.31, 0.6, 0.2, 0.66, 0, 0.68]];

// Row of teeth between x0..x1 (in s), from y0 to y1; up = root at the bottom (lower teeth)
function _teeth(ctx, s, n, x0, x1, y0, y1, bone, up) {
  const hi = mix(bone, [255, 255, 255], 0.5), lo = mix(bone, [110, 85, 60], 0.6);
  const g = ctx.createLinearGradient(0, y0 * s, 0, y1 * s);
  g.addColorStop(0, rgba(up ? hi : lo)); g.addColorStop(0.35, rgba(bone)); g.addColorStop(1, rgba(up ? lo : hi));
  const tw = (x1 - x0) / n;
  ctx.fillStyle = g;
  for (let i = 0; i < n; i++) {
    const c = Math.abs(i + 0.5 - n / 2) / (n / 2), shrink = 1 - c * 0.25;
    const tx = (x0 + i * tw + tw * 0.07) * s, th = (y1 - y0) * s * shrink, ty = up ? y1 * s - th : y0 * s;
    ctx.beginPath(); ctx.roundRect(tx, ty, tw * 0.86 * s, th, up ? [tw * s * 0.35, tw * s * 0.35, 1, 1] : [1, 1, tw * s * 0.35, tw * s * 0.35]); ctx.fill();
  }
}

// Skull: (x, y) skull center, s size. Options: jaw 0..1, color, eyeGlow, glowColor, crack
function drawSkull(ctx, x, y, s, o = {}) {
  const jaw = clamp(o.jaw ?? 0, 0, 1.3), bone = _rgbOf(o.color, [241, 234, 210]);
  const hi = mix(bone, [255, 255, 255], 0.65), lo = mix(bone, [120, 92, 66], 0.55), deep = [16, 5, 7];
  const jy = jaw * s * 0.26;
  ctx.save();
  ctx.translate(x, y);
  // mouth cavity (visible when the jaw opens)
  if (jy > 0.5) {
    ctx.fillStyle = rgba(deep);
    ctx.fillRect(-s * 0.23, s * 0.4, s * 0.46, s * 0.1 + jy);
  }
  // jaw: goes behind the skull and drops when opened
  ctx.save();
  ctx.translate(0, jy);
  ctx.beginPath();
  ctx.moveTo(-s * 0.2, s * 0.53);
  ctx.lineTo(-s * 0.26, s * 0.4);
  ctx.lineTo(-s * 0.345, s * 0.26);
  ctx.bezierCurveTo(-s * 0.34, s * 0.36, -s * 0.34, s * 0.46, -s * 0.33, s * 0.5);
  ctx.bezierCurveTo(-s * 0.31, s * 0.6, -s * 0.2, s * 0.66, 0, s * 0.68);
  ctx.bezierCurveTo(s * 0.2, s * 0.66, s * 0.31, s * 0.6, s * 0.33, s * 0.5);
  ctx.bezierCurveTo(s * 0.34, s * 0.46, s * 0.34, s * 0.36, s * 0.345, s * 0.26);
  ctx.lineTo(s * 0.26, s * 0.4);
  ctx.lineTo(s * 0.2, s * 0.53);
  ctx.closePath();
  const mg = ctx.createLinearGradient(0, s * 0.3, 0, s * 0.68);
  mg.addColorStop(0, rgba(lo)); mg.addColorStop(0.45, rgba(bone)); mg.addColorStop(1, rgba(mix(lo, deep, 0.25)));
  ctx.fillStyle = mg; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = radial(ctx, 0, s * 0.6, 0, s * 0.14, [[0, rgba(hi, 0.7)], [1, rgba(hi, 0)]]);
  ctx.fillRect(-s * 0.15, s * 0.46, s * 0.3, s * 0.24);
  ctx.restore();
  _teeth(ctx, s, 8, -0.205, 0.205, 0.462, 0.54, bone, true);
  ctx.restore();
  // skull with cheekbones and maxilla
  _mirrorPath(ctx, s, -0.5, _CRANIUM);
  ctx.fillStyle = radial(ctx, -s * 0.13, -s * 0.24, s * 0.02, s * 0.82, [[0, rgba(hi)], [0.4, rgba(bone)], [0.8, rgba(mix(bone, lo, 0.7))], [1, rgba(mix(lo, deep, 0.3))]]);
  ctx.fill();
  ctx.save();
  ctx.clip();
  // sunken temples and shadow under the cheekbones
  for (const sx of [-1, 1]) {
    ctx.fillStyle = radial(ctx, sx * s * 0.47, s * 0.08, 0, s * 0.16, [[0, rgba(lo, 0.85)], [1, rgba(lo, 0)]]);
    ctx.fillRect(sx * s * 0.47 - s * 0.16, -s * 0.08, s * 0.32, s * 0.32);
    ctx.fillStyle = radial(ctx, sx * s * 0.28, s * 0.36, 0, s * 0.12, [[0, rgba(lo, 0.8)], [1, rgba(lo, 0)]]);
    ctx.fillRect(sx * s * 0.28 - s * 0.12, s * 0.24, s * 0.24, s * 0.24);
    ctx.fillStyle = radial(ctx, sx * s * 0.34, s * 0.24, 0, s * 0.06, [[0, rgba(hi, 0.45)], [1, rgba(hi, 0)]]);
    ctx.fillRect(sx * s * 0.34 - s * 0.06, s * 0.18, s * 0.12, s * 0.12);
  }
  ctx.restore();
  // top teeth
  _teeth(ctx, s, 8, -0.215, 0.215, 0.375, 0.465, bone, false);
  ctx.fillStyle = rgba(lo, 0.9);
  ctx.fillRect(-s * 0.23, s * 0.368, s * 0.46, s * 0.016);
  // sockets: marked upper edge (brow arch), very dark floor
  for (const sx of [-1, 1]) {
    ctx.save();
    ctx.scale(sx, 1);
    ctx.beginPath();
    ctx.moveTo(s * 0.045, -s * 0.01);
    ctx.quadraticCurveTo(s * 0.18, -s * 0.11, s * 0.34, -s * 0.03);
    ctx.bezierCurveTo(s * 0.38, s * 0.08, s * 0.31, s * 0.21, s * 0.19, s * 0.21);
    ctx.bezierCurveTo(s * 0.08, s * 0.21, s * 0.03, s * 0.11, s * 0.045, -s * 0.01);
    ctx.closePath();
    ctx.fillStyle = radial(ctx, s * 0.19, s * 0.09, 0, s * 0.18, [[0, rgba(deep)], [0.7, rgba(deep)], [0.92, rgba(mix(deep, lo, 0.35))], [1, rgba(mix(deep, lo, 0.6))]]);
    ctx.fill();
    ctx.strokeStyle = rgba(hi, 0.75); ctx.lineWidth = s * 0.022; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(s * 0.06, -s * 0.03); ctx.quadraticCurveTo(s * 0.18, -s * 0.125, s * 0.33, -s * 0.05); ctx.stroke();
    ctx.restore();
  }
  // nose: inverted heart
  ctx.beginPath();
  ctx.moveTo(0, s * 0.17);
  ctx.bezierCurveTo(s * 0.035, s * 0.2, s * 0.085, s * 0.27, s * 0.055, s * 0.31);
  ctx.quadraticCurveTo(s * 0.02, s * 0.335, 0, s * 0.3);
  ctx.quadraticCurveTo(-s * 0.02, s * 0.335, -s * 0.055, s * 0.31);
  ctx.bezierCurveTo(-s * 0.085, s * 0.27, -s * 0.035, s * 0.2, 0, s * 0.17);
  ctx.fillStyle = rgba(mix(deep, lo, 0.15)); ctx.fill();
  if (o.crack) {
    ctx.strokeStyle = rgba(mix(deep, lo, 0.3), 0.9); ctx.lineWidth = s * 0.012; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(s * 0.06, -s * 0.49);
    for (const [px, py] of [[0.1, -0.4], [0.07, -0.33], [0.14, -0.25], [0.12, -0.18], [0.17, -0.1]]) ctx.lineTo(px * s, py * s);
    ctx.moveTo(s * 0.14, -s * 0.25); ctx.lineTo(s * 0.22, -s * 0.29);
    ctx.stroke();
  }
  if (o.eyeGlow) {
    const gc = o.glowColor || [255, 30, 20];
    for (const sx of [-1, 1]) {
      glow(ctx, sx * s * 0.19, s * 0.08, s * 0.2, gc, 0.95);
      ctx.fillStyle = rgba(mix(gc, [255, 255, 255], 0.75));
      ell(ctx, sx * s * 0.19, s * 0.08, s * 0.035, s * 0.035);
    }
  }
  ctx.restore();
}

// Dancing skeleton; (x, y) = feet, hgt = height, beat = time in music beats.
// Options: color [r,g,b] of the bone, glow [r,g,b] of the halo, eyeGlow
function drawSkeleton(ctx, x, y, hgt, beat, o = {}) {
  const u = hgt / 10.6, ph = beat * Math.PI, s1 = Math.sin(ph), c1 = Math.cos(ph);
  const bone = _rgbOf(o.color, [241, 234, 210]), line = mix(bone, [40, 20, 30], 0.85), halo = o.glow || [170, 200, 255];
  const boneCss = rgba(bone), lineCss = rgba(line);
  // body: squat on each beat, lateral sway and torso/head with a delay (overlapping action)
  const squat = c1 * c1, hipX = Math.sin(ph - 0.25) * 0.38 * u, hipY = -4.62 * u + squat * 0.45 * u;
  const lean = Math.sin(ph - 0.45) * 0.14, head = Math.sin(ph - 1.0) * 0.24 - lean * 0.4;
  const liftL = Math.max(0, s1) ** 1.6, liftR = Math.max(0, -s1) ** 1.6;
  // two-bone IK (knee outward: arched dance legs)
  const ik = (hx, hy, fx, fy, l1, l2, side) => {
    const dx = fx - hx, dy = fy - hy, d = Math.min(Math.hypot(dx, dy), (l1 + l2) * 0.999), a = Math.atan2(dy, dx);
    const k = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
    const ka = a + (side < 0 ? k : -k);
    return [hx + Math.cos(ka) * l1, hy + Math.sin(ka) * l1, hx + Math.cos(a) * d, hy + Math.sin(a) * d];
  };
  const legs = [-1, 1].map(sd => {
    const lift = sd < 0 ? liftL : liftR;
    const hx = hipX + sd * 0.42 * u, hy = hipY + 0.15 * u;
    const fx = sd * (0.85 * u + lift * 0.35 * u), fy = -0.32 * u - lift * 1.5 * u;
    return [hx, hy, ...ik(hx, hy, fx, fy, 2.25 * u, 2.15 * u, sd), sd, lift];
  });
  // arms (in the torso's frame): raise alternately, the forearm and hand arrive late (follow-through)
  const arms = [-1, 1].map(sd => {
    const p = sd < 0 ? ph : ph + Math.PI, up = 0.5 + 0.5 * Math.sin(p);
    const sx = sd * 1.25 * u, sy = -3.1 * u;
    const a1 = sd < 0 ? lerp(Math.PI * 0.62, Math.PI * 1.22, easeInOut(up)) : lerp(Math.PI * 0.38, -Math.PI * 0.22, easeInOut(up));
    const bend = (0.7 + 0.9 * (0.5 + 0.5 * Math.sin(p - 0.8))) * -sd;
    const a2 = a1 + bend, a3 = a2 + Math.sin(p - 1.5) * 0.7 * -sd;
    const ex = sx + Math.cos(a1) * 1.55 * u, ey = sy + Math.sin(a1) * 1.55 * u;
    const wx = ex + Math.cos(a2) * 1.45 * u, wy = ey + Math.sin(a2) * 1.45 * u;
    return [sx, sy, ex, ey, wx, wy, a3, p];
  });
  ctx.save();
  ctx.translate(x, y);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // each piece is painted in three passes: halo, dark outline and bone
  const bonePath = (x1, y1, x2, y2, w) => {
    const a = Math.atan2(y2 - y1, x2 - x1), nx = -Math.sin(a) * w * 0.24, ny = Math.cos(a) * w * 0.24;
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    for (const [px, py] of [[x1, y1], [x2, y2]]) {
      ctx.moveTo(px + nx + w * 0.42, py + ny); ctx.arc(px + nx, py + ny, w * 0.42, 0, TAU);
      ctx.moveTo(px - nx + w * 0.42, py - ny); ctx.arc(px - nx, py - ny, w * 0.42, 0, TAU);
    }
  };
  const paint = (build, w, pass, fill = true) => {
    ctx.beginPath(); build();
    if (pass === 0) { ctx.strokeStyle = rgba(halo, 0.22); ctx.lineWidth = w * 2.6; ctx.stroke(); return; }
    ctx.strokeStyle = lineCss; ctx.lineWidth = w + u * 0.12; ctx.stroke();
    if (fill) { ctx.fillStyle = lineCss; ctx.fill(); }
    ctx.strokeStyle = boneCss; ctx.lineWidth = w; ctx.stroke();
    if (fill) { ctx.fillStyle = boneCss; ctx.fill(); }
  };
  const wB = u * 0.3;
  const drawLegs = pass => {
    for (const [hx, hy, kx, ky, fx, fy, sd] of legs) {
      paint(() => bonePath(hx, hy, kx, ky, wB), wB, pass);
      paint(() => bonePath(kx, ky, fx, fy, wB * 0.85), wB * 0.85, pass);
      // foot: heel, instep and toes in a wedge (not a loose bone)
      paint(() => {
        ctx.moveTo(fx - sd * 0.16 * u, fy + 0.1 * u); ctx.lineTo(fx + sd * 0.06 * u, fy - 0.12 * u);
        ctx.quadraticCurveTo(fx + sd * 0.4 * u, fy - 0.02 * u, fx + sd * 0.66 * u, fy + 0.14 * u);
        ctx.lineTo(fx + sd * 0.68 * u, fy + 0.3 * u); ctx.lineTo(fx - sd * 0.18 * u, fy + 0.3 * u); ctx.closePath();
      }, u * 0.1, pass);
    }
  };
  const drawTorso = pass => {
    // pelvis in butterfly shape
    paint(() => {
      for (const sd of [-1, 1]) { ctx.moveTo(hipX, hipY - 0.1 * u); ctx.ellipse(hipX + sd * 0.42 * u, hipY - 0.15 * u, 0.48 * u, 0.3 * u, sd * 0.5, 0, TAU); }
    }, u * 0.12, pass);
    ctx.save();
    ctx.translate(hipX, hipY - 0.2 * u);
    ctx.rotate(lean);
    // spine (vertebrae), ribs, sternum and collarbones
    paint(() => { for (let i = 0; i < 7; i++) { const vy = -0.15 * u - i * 0.42 * u; ctx.moveTo(0.13 * u, vy); ctx.arc(0, vy, 0.13 * u, 0, TAU); } ctx.moveTo(0, 0); ctx.lineTo(0, -3.0 * u); }, u * 0.16, pass);
    paint(() => {
      [0.78, 0.98, 1.06, 1.0, 0.86].forEach((rw, i) => {
        const ry = -2.75 * u + i * 0.4 * u;
        for (const sd of [-1, 1]) { ctx.moveTo(sd * 0.1 * u, ry); ctx.bezierCurveTo(sd * rw * 0.7 * u, ry - 0.28 * u, sd * rw * u, ry - 0.05 * u, sd * rw * 0.92 * u, ry + 0.38 * u); }
      });
      ctx.moveTo(0, -2.85 * u); ctx.lineTo(0, -1.6 * u);
      ctx.moveTo(-1.25 * u, -3.1 * u); ctx.quadraticCurveTo(0, -2.75 * u, 1.25 * u, -3.1 * u);
    }, u * 0.19, pass, false);
    // arms with "jazz hands"
    for (const [sx, sy, ex, ey, wx, wy, a3, p] of arms) {
      paint(() => bonePath(sx, sy, ex, ey, wB * 0.85), wB * 0.85, pass);
      paint(() => bonePath(ex, ey, wx, wy, wB * 0.72), wB * 0.72, pass);
      paint(() => {
        const hx = wx + Math.cos(a3) * 0.28 * u, hy = wy + Math.sin(a3) * 0.28 * u;
        ctx.moveTo(wx, wy); ctx.lineTo(hx, hy);
        for (let f = -1.5; f <= 1.5; f++) {
          const fa = a3 + f * 0.38 + Math.sin(p * 2 + f) * 0.12;
          ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(fa) * 0.42 * u, hy + Math.sin(fa) * 0.42 * u);
        }
      }, u * 0.1, pass, false);
    }
    if (pass === 1) {
      // head: neck and skull with its own delay
      ctx.save();
      ctx.translate(0, -3.25 * u);
      ctx.rotate(head);
      drawSkull(ctx, 0, -1.05 * u, 1.75 * u, { jaw: 0.15 + 0.5 * Math.abs(Math.sin(ph * 2 - 0.6)), color: bone, eyeGlow: o.eyeGlow, glowColor: o.eyeGlowColor });
      ctx.restore();
    } else glow(ctx, 0, -4.3 * u, 1.6 * u, halo, 0.35);
    ctx.restore();
  };
  for (const pass of [0, 1]) { drawLegs(pass); drawTorso(pass); }
  ctx.restore();
}

// Iris as a sprite: radial fibers, collarette, crypts and dark limbal ring
function _irisSprite(R, ic) {
  R = _qsize(R);
  return _sprite(`iris${R}:${ic.join(',')}`, R * 2, R * 2, (c, w) => {
    const r = rng(R * 7 + ic[0] * 3 + ic[1]);
    c.translate(w / 2, w / 2);
    c.fillStyle = radial(c, 0, 0, R * 0.1, R, [[0, rgba(mix(ic, [255, 255, 210], 0.7))], [0.3, rgba(mix(ic, [255, 255, 200], 0.3))], [0.62, rgba(ic)], [0.88, rgba(mix(ic, [0, 0, 0], 0.55))], [1, rgba(mix(ic, [0, 0, 0], 0.85))]]);
    c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
    c.lineCap = 'round';
    for (const [col, al, lw] of [[mix(ic, [0, 0, 0], 0.6), 0.45, 0.028], [mix(ic, [255, 255, 230], 0.6), 0.4, 0.018]]) {
      c.strokeStyle = rgba(col, al); c.lineWidth = Math.max(0.6, R * lw);
      c.beginPath();
      for (let i = 0; i < 70; i++) {
        const a = (i / 70) * TAU + r() * 0.08, r0 = R * (0.24 + r() * 0.08), r1 = R * (0.62 + r() * 0.3), wob = (r() - 0.5) * 0.12;
        c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
        c.quadraticCurveTo(Math.cos(a + wob) * (r0 + r1) / 2, Math.sin(a + wob) * (r0 + r1) / 2, Math.cos(a) * r1, Math.sin(a) * r1);
      }
      c.stroke();
    }
    // wavy collarette
    c.strokeStyle = rgba(mix(ic, [255, 255, 220], 0.55), 0.55); c.lineWidth = Math.max(0.8, R * 0.035);
    c.beginPath();
    for (let i = 0; i <= 48; i++) { const a = (i / 48) * TAU, rr = R * (0.45 + 0.04 * Math.sin(a * 9 + 1.3)); i ? c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    c.stroke();
    c.fillStyle = rgba(mix(ic, [0, 0, 0], 0.7), 0.35);
    for (let i = 0; i < 9; i++) { const a = r() * TAU, rr = R * (0.5 + r() * 0.3); c.beginPath(); c.ellipse(Math.cos(a) * rr, Math.sin(a) * rr, R * 0.05, R * 0.025, a, 0, TAU); c.fill(); }
    c.strokeStyle = 'rgba(0,0,0,0.85)'; c.lineWidth = R * 0.07;
    c.beginPath(); c.arc(0, 0, R * 0.965, 0, TAU); c.stroke();
  });
}

// Scleral veins: branches from the edges toward the iris (computed once per eye)
const _VEINS = new Map();
function _eyeVeins(seed, ew, eh) {
  const key = `${seed}:${Math.round(ew)}:${Math.round(eh)}`;
  let v = _VEINS.get(key);
  if (!v) {
    const r = rng(seed * 31 + 5), segs = [];
    const grow = (x, y, a, len, wdt, depth) => {
      for (let k = 0; k < 6; k++) {
        a += (r() - 0.5) * 0.7;
        const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len * 0.8;
        segs.push([x, y, nx, ny, wdt]);
        x = nx; y = ny; len *= 0.88; wdt *= 0.8;
        if (depth < 2 && r() < 0.35) grow(x, y, a + (r() < 0.5 ? -0.8 : 0.8), len * 0.8, wdt * 0.8, depth + 1);
      }
    };
    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? 1 : -1, a = (r() - 0.5) * 1.6;
      const sx = side * ew * (0.92 - r() * 0.15), sy = Math.sin(a) * eh * 0.5;
      grow(sx, sy, side > 0 ? Math.PI + a * 0.6 : a * 0.6, ew * 0.09, 1, 0);
    }
    v = segs;
    if (_VEINS.size > 64) _VEINS.delete(_VEINS.keys().next().value);
    _VEINS.set(key, v);
  }
  return v;
}

// Eye that fills the whole zone. o.lx/o.ly: gaze -1..1; o.open: 0 closed .. 1 open
// Options: iris [r,g,b], slit (cat pupil), seed, dilate, skin [r,g,b], lashes (false removes them), glow (luminous iris 0..1)
function drawEye(ctx, w, h, o) {
  const cx = w / 2, cy = h / 2;
  const ew = w * 0.46, eh = Math.min(h * 0.4, ew * 0.62);
  const open = clamp(o.open ?? 1), sk = o.skin || [40, 12, 30], seed = o.seed || 1;
  const lx = clamp(o.lx ?? 0, -1, 1), ly = clamp(o.ly ?? 0, -1, 1);
  // skin: dark socket around it and warm light on the cheekbones
  ctx.fillStyle = rgba(sk); ctx.fillRect(0, 0, w, h);
  glow(ctx, cx, cy, Math.max(w, h) * 0.65, mix(sk, [255, 70, 70], 0.35), 0.55);
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, eh / ew);
  ctx.fillStyle = radial(ctx, 0, 0, ew * 0.85, ew * 1.35, [[0, rgba(mix(sk, [0, 0, 0], 0.6), 0.85)], [1, rgba(mix(sk, [0, 0, 0], 0.6), 0)]]);
  ctx.fillRect(-ew * 1.4, -ew * 1.4, ew * 2.8, ew * 2.8);
  ctx.restore();
  // the gaze drags the eyelids a little (the upper one rises when looking up)
  const closedY = cy + eh * 0.3;
  const topY = lerp(closedY, cy - eh * (1 + ly * -0.12), open), botY = lerp(closedY, cy + eh * (0.85 + ly * 0.08), open);
  const lid = () => {
    ctx.beginPath();
    ctx.moveTo(cx - ew, cy);
    ctx.quadraticCurveTo(cx, 2 * topY - cy, cx + ew, cy);
    ctx.quadraticCurveTo(cx, 2 * botY - cy, cx - ew, cy);
    ctx.closePath();
  };
  // fleshy upper eyelid: fold above, with a highlight on top
  const crease = lerp(cy - eh * 0.15, cy - eh * 1.3, open);
  ctx.beginPath();
  ctx.moveTo(cx - ew * 1.04, cy + eh * 0.02);
  ctx.quadraticCurveTo(cx, 2 * crease - cy, cx + ew * 1.04, cy + eh * 0.02);
  ctx.quadraticCurveTo(cx, 2 * topY - cy, cx - ew * 1.04, cy + eh * 0.02);
  const lg = ctx.createLinearGradient(0, crease - eh * 0.3, 0, topY);
  lg.addColorStop(0, rgba(mix(sk, [255, 140, 150], 0.25))); lg.addColorStop(1, rgba(mix(sk, [0, 0, 0], 0.35)));
  ctx.fillStyle = lg; ctx.fill();
  ctx.strokeStyle = rgba(mix(sk, [0, 0, 0], 0.65), 0.8); ctx.lineWidth = Math.max(1, eh * 0.05); ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx - ew * 0.85, cy - eh * 0.25 * open); ctx.quadraticCurveTo(cx, 2 * crease - cy - eh * 0.05, cx + ew * 0.85, cy - eh * 0.25 * open); ctx.stroke();
  // bag under the eye
  ctx.strokeStyle = rgba(mix(sk, [0, 0, 0], 0.6), 0.5); ctx.lineWidth = Math.max(1, eh * 0.035);
  ctx.beginPath(); ctx.moveTo(cx - ew * 0.6, cy + eh * 1.05); ctx.quadraticCurveTo(cx, cy + eh * 1.45, cx + ew * 0.7, cy + eh * 0.95); ctx.stroke();
  // eyeball
  ctx.save();
  lid(); ctx.clip();
  ctx.fillStyle = radial(ctx, cx + lx * ew * 0.2, cy - eh * 0.15, eh * 0.15, ew * 1.05, [[0, '#fffdf6'], [0.5, '#f6e6da'], [0.8, '#d99a92'], [1, '#8c3242']]);
  ctx.fillRect(cx - ew, cy - eh * 1.2, ew * 2, eh * 2.4);
  // veins
  ctx.lineCap = 'round';
  for (const [lo, hi, k] of [[0.5, 2, 1], [0, 0.5, 0.55]]) {
    ctx.strokeStyle = `rgba(185,20,35,${0.45 + 0.2 * k})`; ctx.lineWidth = Math.max(0.7, eh * 0.028 * k);
    ctx.beginPath();
    for (const [x1, y1, x2, y2, wd] of _eyeVeins(seed, ew, eh)) if (wd >= lo && wd < hi) { ctx.moveTo(cx + x1, cy + y1); ctx.lineTo(cx + x2, cy + y2); }
    ctx.stroke();
  }
  // caruncle in the inner corner
  const inner = seed % 2 ? 1 : -1;
  ctx.fillStyle = radial(ctx, cx + inner * ew * 0.93, cy + eh * 0.05, 0, eh * 0.28, [[0, 'rgba(230,90,110,0.95)'], [1, 'rgba(230,90,110,0)']]);
  ctx.fillRect(cx + inner * ew * 0.93 - eh * 0.3, cy - eh * 0.3, eh * 0.6, eh * 0.6);
  // iris (flattens when looking to the sides: foreshortening) and pupil
  const ir = eh * 0.62, ic = o.iris || [90, 200, 60];
  const ix = cx + lx * (ew - ir) * 0.75, iy = cy + ly * eh * 0.3;
  const fx = 1 - Math.abs(lx) * 0.22, fy = 1 - Math.abs(ly) * 0.12;
  ctx.fillStyle = 'rgba(40,0,10,0.35)';
  ell(ctx, ix, iy + ir * 0.06, ir * fx * 1.06, ir * fy * 1.06);
  ctx.drawImage(_irisSprite(ir, ic), ix - ir * fx, iy - ir * fy, ir * 2 * fx, ir * 2 * fy);
  const dil = clamp(o.dilate ?? 1, 0.2, 2);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, ix, iy, ir * 0.75, ic, 0.3 * (o.glow ?? 1));
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#050005';
  if (o.slit) {
    const pw = ir * 0.15 * dil * fx, plen = ir * 0.88 * fy;
    ctx.beginPath();
    ctx.moveTo(ix, iy - plen);
    ctx.quadraticCurveTo(ix + pw * 2, iy, ix, iy + plen);
    ctx.quadraticCurveTo(ix - pw * 2, iy, ix, iy - plen);
    ctx.fill();
  } else ell(ctx, ix, iy, ir * 0.36 * dil * fx, ir * 0.36 * dil * fy);
  // shadow of the eyelid on the globe
  const shG = ctx.createLinearGradient(0, topY - eh * 0.1, 0, topY + eh * 0.7);
  shG.addColorStop(0, 'rgba(40,0,10,0.85)'); shG.addColorStop(1, 'rgba(40,0,10,0)');
  ctx.fillStyle = shG; ctx.fillRect(cx - ew, topY - eh * 0.2, ew * 2, eh * 1.2);
  // wet highlight: large window + dot, almost fixed (the light doesn't move with the gaze)
  const hx = lerp(cx, ix, 0.6) - ir * 0.38, hy = lerp(cy, iy, 0.6) - ir * 0.42;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.beginPath(); ctx.roundRect(hx - ir * 0.17, hy - ir * 0.15, ir * 0.3, ir * 0.27, ir * 0.08); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ell(ctx, hx + ir * 0.62, hy + ir * 0.72, ir * 0.07, ir * 0.07);
  ctx.fillStyle = radial(ctx, hx, hy, 0, ir * 0.6, [[0, 'rgba(255,255,255,0.25)'], [1, 'rgba(255,255,255,0)']]);
  ctx.fillRect(hx - ir * 0.6, hy - ir * 0.6, ir * 1.2, ir * 1.2);
  ctx.restore();
  // eyelid edge: wet line below, marked dark outline
  ctx.strokeStyle = rgba(mix(sk, [0, 0, 0], 0.55)); ctx.lineWidth = eh * 0.1; ctx.lineJoin = 'round';
  lid(); ctx.stroke();
  if (open > 0.15) {
    ctx.strokeStyle = 'rgba(255,190,200,0.55)'; ctx.lineWidth = Math.max(1, eh * 0.025);
    const qb = 2 * botY - cy;
    ctx.beginPath();
    for (let i = 0; i <= 12; i++) {
      const k = 0.14 + (i / 12) * 0.72, px = lerp(lerp(cx - ew, cx, k), lerp(cx, cx + ew, k), k), py = lerp(lerp(cy, qb, k), lerp(qb, cy, k), k) - eh * 0.07;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  // lashes: follow the eyelid edge; when closing they point downward
  if (o.lashes !== false) {
    const lash = rgba(mix(sk, [0, 0, 0], 0.8));
    ctx.strokeStyle = lash; ctx.lineCap = 'round';
    const qy = 2 * topY - cy, dirY = lerp(0.85, -1, open);
    for (let i = 0; i < 9; i++) {
      const k = 0.1 + (i / 8) * 0.8, side = k < 0.5 ? -1 : 1;
      const px = lerp(lerp(cx - ew, cx, k), lerp(cx, cx + ew, k), k), py = lerp(lerp(cy, qy, k), lerp(qy, cy, k), k);
      const len = eh * (0.16 + 0.16 * Math.sin(k * Math.PI)), spread = (k - 0.5) * 1.4;
      ctx.lineWidth = Math.max(1, eh * 0.065 * (0.6 + 0.4 * Math.sin(k * Math.PI)));
      ctx.beginPath(); ctx.moveTo(px, py);
      ctx.quadraticCurveTo(px + spread * len * 0.5, py + dirY * len * 0.7, px + spread * len + side * len * 0.35, py + dirY * len * 0.8);
      ctx.stroke();
    }
    if (open > 0.3) {
      const qb = 2 * botY - cy;
      ctx.lineWidth = Math.max(1, eh * 0.03);
      ctx.beginPath();
      for (let i = 0; i < 7; i++) {
        const k = 0.2 + (i / 6) * 0.6, px = lerp(lerp(cx - ew, cx, k), lerp(cx, cx + ew, k), k), py = lerp(lerp(cy, qb, k), lerp(qb, cy, k), k);
        ctx.moveTo(px, py + eh * 0.04); ctx.lineTo(px + (k - 0.5) * eh * 0.25, py + eh * 0.17 * open);
      }
      ctx.stroke();
    }
  }
}

// Monster mouth (for the door); open 0..1. Options: t (time, default the show clock),
// throat [r,g,b] (brightness of the throat's back), seed
function drawMouth(ctx, w, h, open, o = {}) {
  open = clamp(open, 0, 1.2);
  const t = o.t ?? _clock(), seed = o.seed ?? 3, m = Math.min(w, h);
  const cx = w / 2, cy = h * 0.5, mw = w * 0.4, mh = Math.max(h * 0.025, h * 0.36 * open);
  // mouth edge: on top a soft "M", on the bottom a "U"; e = extra thickness outward
  const upY = (k, e) => cy - (mh + e) * (1 - k * k) ** 0.75 * (1 - 0.13 * Math.exp(-((k / 0.28) ** 2)) * clamp(open * 2)) - e * 0.15;
  const loY = (k, e) => cy + (mh + e) * (1 - k * k) ** 0.65 + e * 0.15;
  const shape = (e = 0) => {
    const xw = mw + e;
    ctx.beginPath();
    for (let i = 0; i <= 36; i++) { const k = -1 + (i / 36) * 2; i ? ctx.lineTo(cx + k * xw, upY(k, e)) : ctx.moveTo(cx + k * xw, upY(k, e)); }
    for (let i = 36; i >= 0; i--) { const k = -1 + (i / 36) * 2; ctx.lineTo(cx + k * xw, loY(k, e)); }
    ctx.closePath();
  };
  glow(ctx, cx, cy, Math.max(w, h) * 0.7, [190, 0, 30], 0.35 + 0.3 * open);
  // fleshy lips with a highlight on top
  const lip = m * 0.07 + mh * 0.06;
  shape(lip);
  ctx.fillStyle = radial(ctx, cx, cy - mh * 0.4, mh * 0.2, mw + lip * 2, [[0, '#e8405e'], [0.6, '#b01c3c'], [1, '#5a0718']]);
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,0,10,0.8)'; ctx.lineWidth = m * 0.012; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,200,215,0.55)'; ctx.lineWidth = lip * 0.28; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i <= 16; i++) { const k = -0.62 + (i / 16) * 1.24; i ? ctx.lineTo(cx + k * (mw + lip * 0.5), upY(k, lip * 0.55)) : ctx.moveTo(cx + k * (mw + lip * 0.5), upY(k, lip * 0.55)); }
  ctx.stroke();
  // interior: lit red walls, dark background and a furnace glow in the throat
  shape(0);
  ctx.fillStyle = radial(ctx, cx, cy + mh * 0.1, 0, Math.max(mw, mh) * 1.1, [[0, '#1a0004'], [0.55, '#2c0209'], [1, '#8e1830']]);
  ctx.fill();
  ctx.save();
  ctx.clip();
  const th = o.throat || [255, 70, 20];
  glow(ctx, cx, cy + mh * 0.05, mh * 0.75, th, 0.4 * clamp(open * 1.5) * (0.8 + 0.2 * Math.sin(t * 9)));
  // uvula
  if (open > 0.3) {
    const uy = cy - mh * 0.62, ul = mh * 0.38 * clamp((open - 0.3) * 3), sw = Math.sin(t * 3.1) * mh * 0.03;
    ctx.fillStyle = '#c23052';
    ctx.beginPath(); ctx.moveTo(cx - mw * 0.07, uy - mh * 0.2); ctx.quadraticCurveTo(cx - mw * 0.08, uy + ul * 0.6, cx + sw, uy + ul); ctx.quadraticCurveTo(cx + mw * 0.08, uy + ul * 0.6, cx + mw * 0.07, uy - mh * 0.2); ctx.fill();
  }
  // tongue: moves on its own
  const wag = Math.sin(t * 2.3 + seed) * mw * 0.1, ty = cy + mh * (0.95 - 0.25 * clamp(open)) + Math.sin(t * 3.7) * mh * 0.04;
  ctx.fillStyle = radial(ctx, cx + wag, ty - mh * 0.35, 0, mw * 0.75, [[0, '#ff8aa6'], [0.55, '#e0436a'], [1, '#7a1030']]);
  ell(ctx, cx + wag, ty, mw * 0.62, mh * 0.55 + m * 0.03);
  ctx.strokeStyle = 'rgba(110,10,40,0.6)'; ctx.lineWidth = m * 0.012;
  ctx.beginPath(); ctx.moveTo(cx + wag * 0.5, ty - mh * 0.45); ctx.quadraticCurveTo(cx + wag, ty - mh * 0.1, cx + wag * 1.2, ty + mh * 0.2); ctx.stroke();
  // scalloped gums
  const n = 8, gum = m * 0.035 + mh * 0.05, tl = m * 0.13 * (0.55 + 0.45 * clamp(open));
  for (const top of [true, false]) {
    const edge = top ? upY : loY, dir = top ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(cx - mw, cy);
    for (let i = 0; i <= 24; i++) { const k = -1 + (i / 24) * 2; ctx.lineTo(cx + k * mw, edge(k, 0)); }
    for (let i = n; i >= 0; i--) {
      const k = -0.92 + (i / n) * 1.84, km = -0.92 + ((i + 0.5) / n) * 1.84;
      if (i < n) ctx.quadraticCurveTo(cx + km * mw, edge(km, 0) + dir * gum * 1.6, cx + k * mw, edge(k, 0) + dir * gum * 0.7);
      else ctx.lineTo(cx + k * mw, edge(k, 0) + dir * gum * 0.7);
    }
    ctx.closePath();
    ctx.fillStyle = top ? '#ff6f8f' : '#f05a7e'; ctx.fill();
    // shaded conical teeth (two longer fangs on top)
    for (let i = 0; i < n; i++) {
      const k0 = -0.92 + (i / n) * 1.84, k1 = -0.92 + ((i + 1) / n) * 1.84, km = (k0 + k1) / 2;
      const fang = top && (i === 1 || i === n - 2) ? 1.75 : !top && (i === 2 || i === n - 3) ? 1.3 : 1;
      const x0 = cx + k0 * mw + mw * 0.02, x1 = cx + k1 * mw - mw * 0.02, xm = cx + km * mw;
      const y0 = edge(k0, 0) + dir * gum * 0.9, y1 = edge(k1, 0) + dir * gum * 0.9, ym = edge(km, 0) + dir * gum;
      const tip = ym + dir * tl * fang * (0.8 + 0.2 * Math.cos(km * 2));
      const tg = ctx.createLinearGradient(x0, 0, x1, 0);
      tg.addColorStop(0, '#b8a68c'); tg.addColorStop(0.4, '#fffbea'); tg.addColorStop(0.75, '#f2e8cc'); tg.addColorStop(1, '#a8957a');
      ctx.fillStyle = tg;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.quadraticCurveTo(x0 + (xm - x0) * 0.2, (y0 + tip) / 2, xm + (top ? 1 : -1) * mw * 0.01, tip);
      ctx.quadraticCurveTo(x1 - (x1 - xm) * 0.2, (y1 + tip) / 2, x1, y1);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(70,10,20,0.55)'; ctx.lineWidth = Math.max(1, m * 0.006); ctx.stroke();
    }
  }
  // strings of drool between top and bottom: stretch when opening and break into drops
  const r = rng(seed * 17 + 1), vis = smooth(0.1, 0.3, open);
  ctx.globalAlpha *= vis;
  for (let i = 0; i < (vis > 0 ? 5 : 0); i++) {
    const k = -0.6 + r() * 1.2, k2 = k + (r() - 0.5) * 0.25, brk = 0.45 + r() * 0.45;
    const x1 = cx + k * mw, y1 = upY(k, 0) + gum, x2 = cx + k2 * mw, y2 = loY(k2, 0) - gum;
    const span = y2 - y1, lw = m * (0.012 + r() * 0.01);
    ctx.strokeStyle = 'rgba(255,225,235,0.75)'; ctx.fillStyle = 'rgba(255,235,240,0.85)'; ctx.lineCap = 'round';
    if (open < brk) {
      const sag = span * (0.25 + 0.2 * Math.sin(t * 2 + i)) + m * 0.02, thin = 1 - open / brk;
      ctx.lineWidth = lw * (0.35 + 0.65 * thin);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2 + Math.sin(t * 1.7 + i) * mw * 0.04, (y1 + y2) / 2 + sag * 0.3, x2, y2); ctx.stroke();
      ell(ctx, (x1 + x2) / 2, (y1 + y2) / 2 + sag * 0.15, lw * 0.6, lw * 0.9);
    } else {
      // broken: a drop hanging from the ceiling that sways
      const len = span * 0.3 * (0.6 + 0.4 * Math.sin(t * 2.5 + i * 2)), sw = Math.sin(t * 3 + i) * mw * 0.02;
      ctx.lineWidth = lw * 0.7;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(x1, y1 + len * 0.6, x1 + sw, y1 + len); ctx.stroke();
      ell(ctx, x1 + sw, y1 + len, lw * 1.1, lw * 1.5);
    }
  }
  ctx.restore();
  // inner outline of the lips
  shape(0);
  ctx.strokeStyle = 'rgba(50,0,12,0.9)'; ctx.lineWidth = m * 0.016; ctx.lineJoin = 'round'; ctx.stroke();
}

// Person silhouette (appears in the windows with the lightning)
function drawFigure(ctx, w, h, x, color = '#000') {
  const s = h;
  ctx.fillStyle = color;
  ell(ctx, x, s * 0.4, s * 0.11, s * 0.13);
  ctx.beginPath();
  ctx.moveTo(x - s * 0.34, s);
  ctx.quadraticCurveTo(x - s * 0.32, s * 0.62, x - s * 0.08, s * 0.56);
  ctx.lineTo(x - s * 0.05, s * 0.5); ctx.lineTo(x + s * 0.05, s * 0.5);
  ctx.lineTo(x + s * 0.08, s * 0.56);
  ctx.quadraticCurveTo(x + s * 0.32, s * 0.62, x + s * 0.34, s);
  ctx.closePath(); ctx.fill();
}

// Witch on a broomstick with her cat: black silhouette with edge light, cape, hair and hat tip
// that wave with a delay, and a trail of magic dust. (x, y) seat, s scale, dir 1 → right, -1 ← left.
// Options: rim [r,g,b] (null removes it), color [r,g,b], trail (false removes the trail), cat (false removes the cat)
function drawWitch(ctx, x, y, s, t, dir = 1, o = {}) {
  const ink = rgba(_rgbOf(o.color, [6, 3, 12])), rim = o.rim === undefined ? [175, 150, 255] : o.rim;
  ctx.save();
  ctx.translate(x, y + Math.sin(t * 2) * s * 0.08);
  ctx.scale(dir * s, s);
  ctx.rotate(-0.08 + Math.sin(t * 2 - 0.6) * 0.04);
  // sparks trail behind the broom (in the witch's coordinates: emitted and left behind)
  if (o.trail !== false) {
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const a = (t * 0.9 + i / 26) % 1, h1 = hash(i * 3.7), h2 = hash(i * 5.3);
      const px = -1.05 - a * 2.4 - h1 * 0.2, py = 0.12 + (h2 - 0.5) * 0.25 + a * a * 0.5 + Math.sin(t * 3 + i) * 0.03;
      const sz = (0.035 + h1 * 0.03) * (1 - a), col = i % 3 ? [255, 210, 110] : [170, 255, 160];
      glow(ctx, px, py, sz * 3, col, 0.5 * (1 - a));
      ctx.fillStyle = rgba(mix(col, [255, 255, 255], 0.6), 1 - a);
      ctx.fillRect(px - sz * 0.3, py - sz * 0.3, sz * 0.6, sz * 0.6);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  const w1 = Math.sin(t * 6), w2 = Math.sin(t * 6 - 1.2), w3 = Math.sin(t * 6 - 2.4), w4 = Math.sin(t * 6 - 3.6);
  const parts = [
    // broom handle
    () => { ctx.moveTo(-0.8, 0.11); ctx.quadraticCurveTo(0, 0.06, 0.84, -0.05); ctx.lineTo(0.85, -0.01); ctx.quadraticCurveTo(0, 0.11, -0.8, 0.16); ctx.closePath(); },
    // straw bristles
    () => {
      ctx.moveTo(-0.62, 0.08); ctx.lineTo(-0.7, 0.07);
      ctx.quadraticCurveTo(-0.95, 0.0 + w2 * 0.02, -1.16, -0.06 + w3 * 0.03);
      ctx.lineTo(-1.1, 0.06); ctx.lineTo(-1.22, 0.14 + w3 * 0.02); ctx.lineTo(-1.12, 0.22);
      ctx.lineTo(-1.18, 0.34 + w4 * 0.03);
      ctx.quadraticCurveTo(-0.92, 0.26 + w2 * 0.02, -0.7, 0.19); ctx.lineTo(-0.62, 0.18); ctx.closePath();
    },
    // cape waving behind and upward (leaves a gap for the cat): jagged hem
    () => {
      ctx.moveTo(0.08, -0.36);
      ctx.quadraticCurveTo(-0.14, -0.44 + w1 * 0.02, -0.36, -0.42 + w2 * 0.04);
      ctx.quadraticCurveTo(-0.56, -0.42 + w3 * 0.06, -0.78, -0.36 + w4 * 0.08);
      ctx.lineTo(-0.66, -0.34 + w4 * 0.06); ctx.lineTo(-0.76, -0.3 + w4 * 0.07);
      ctx.lineTo(-0.6, -0.33 + w3 * 0.05); ctx.lineTo(-0.64, -0.27 + w3 * 0.05);
      ctx.quadraticCurveTo(-0.44, -0.36 + w2 * 0.03, -0.28, -0.3 + w2 * 0.02);
      ctx.quadraticCurveTo(-0.16, -0.2, -0.1, -0.06);
      ctx.closePath();
    },
    // long hair in the wind: locks in points
    () => {
      ctx.moveTo(0.1, -0.5);
      ctx.bezierCurveTo(-0.04, -0.54 + w1 * 0.02, -0.2, -0.5 + w2 * 0.04, -0.46, -0.52 + w3 * 0.07);
      ctx.lineTo(-0.3, -0.46 + w3 * 0.04);
      ctx.bezierCurveTo(-0.38, -0.44 + w3 * 0.05, -0.46, -0.42 + w4 * 0.06, -0.56, -0.44 + w4 * 0.08);
      ctx.lineTo(-0.36, -0.39 + w3 * 0.04);
      ctx.bezierCurveTo(-0.2, -0.38 + w2 * 0.03, -0.06, -0.38, 0.06, -0.38);
      ctx.closePath();
    },
    // body, skirt and boot
    () => {
      ctx.moveTo(0.02, -0.34);
      ctx.quadraticCurveTo(0.16, -0.38, 0.21, -0.24);
      ctx.quadraticCurveTo(0.24, -0.1, 0.28, 0.02);
      ctx.lineTo(0.34, 0.2 + w1 * 0.015); ctx.lineTo(0.27, 0.17);
      ctx.lineTo(0.31, 0.3); ctx.quadraticCurveTo(0.42, 0.33, 0.49, 0.26); ctx.quadraticCurveTo(0.44, 0.34, 0.33, 0.36); ctx.lineTo(0.24, 0.34);
      ctx.lineTo(0.2, 0.2); ctx.lineTo(0.12, 0.25 + w2 * 0.02); ctx.lineTo(0.04, 0.2); ctx.lineTo(-0.06, 0.27 + w3 * 0.025);
      ctx.lineTo(-0.1, 0.18); ctx.lineTo(-0.2, 0.22 + w4 * 0.03);
      ctx.quadraticCurveTo(-0.18, 0.04, -0.1, -0.05);
      ctx.quadraticCurveTo(-0.04, -0.25, 0.02, -0.34);
      ctx.closePath();
    },
    // arm toward the handle
    () => { ctx.moveTo(0.06, -0.3); ctx.quadraticCurveTo(0.26, -0.22, 0.4, -0.06); ctx.lineTo(0.46, -0.04); ctx.lineTo(0.44, 0.03); ctx.lineTo(0.36, 0.0); ctx.quadraticCurveTo(0.2, -0.12, 0.04, -0.18); ctx.closePath(); },
    // head in profile: hooked nose and chin
    () => {
      ctx.moveTo(0.08, -0.38);
      ctx.quadraticCurveTo(0.05, -0.52, 0.16, -0.54);
      ctx.quadraticCurveTo(0.23, -0.53, 0.24, -0.48);
      ctx.lineTo(0.34, -0.43); ctx.lineTo(0.25, -0.42);
      ctx.lineTo(0.26, -0.37); ctx.lineTo(0.22, -0.38); ctx.lineTo(0.25, -0.33);
      ctx.quadraticCurveTo(0.18, -0.33, 0.14, -0.36);
      ctx.closePath();
    },
    // hat: wide brim and cone with the tip bent that sways
    () => {
      const tip = Math.sin(t * 3.2 - 1) * 0.04;
      ctx.ellipse(0.14, -0.535, 0.27, 0.045, -0.17, 0, TAU);
      ctx.moveTo(0.02, -0.55);
      ctx.quadraticCurveTo(0.06, -0.72, 0.03, -0.84);
      ctx.quadraticCurveTo(-0.05, -0.92 + tip, -0.2, -0.88 + tip * 1.6);
      ctx.quadraticCurveTo(-0.06, -0.86, 0.1, -0.8);
      ctx.quadraticCurveTo(0.16, -0.66, 0.25, -0.58);
      ctx.closePath();
    },
  ];
  if (o.cat !== false) parts.push(() => {
    // cat sitting on the broom, separate from the witch: arched back, head and pointed ears
    const bob = Math.sin(t * 2 - 0.5) * 0.008;
    ctx.moveTo(-0.44, 0.1);
    ctx.bezierCurveTo(-0.42, 0.02, -0.44, -0.06, -0.47, -0.1 + bob);
    ctx.lineTo(-0.48, -0.12 + bob);
    ctx.bezierCurveTo(-0.56, -0.1 + bob, -0.62, -0.02, -0.6, 0.1);
    ctx.closePath();
    ctx.moveTo(-0.405, -0.16 + bob); ctx.ellipse(-0.465, -0.16 + bob, 0.062, 0.052, 0, 0, TAU);
    ctx.moveTo(-0.52, -0.18 + bob); ctx.lineTo(-0.53, -0.27 + bob); ctx.lineTo(-0.47, -0.2 + bob); ctx.closePath();
    ctx.moveTo(-0.45, -0.2 + bob); ctx.lineTo(-0.41, -0.28 + bob); ctx.lineTo(-0.405, -0.17 + bob); ctx.closePath();
  }, () => {
    // tail: goes out backward and curls upward
    const tw = Math.sin(t * 2.4) * 0.04;
    ctx.moveTo(-0.59, 0.08);
    ctx.bezierCurveTo(-0.7, 0.08, -0.74 + tw, -0.04, -0.7 + tw, -0.13);
    ctx.bezierCurveTo(-0.68 + tw, -0.18, -0.62 + tw * 1.4, -0.2, -0.62 + tw * 1.4, -0.15);
    ctx.lineTo(-0.645 + tw * 1.4, -0.155);
    ctx.bezierCurveTo(-0.65 + tw, -0.17, -0.68 + tw, -0.14, -0.68 + tw, -0.11);
    ctx.bezierCurveTo(-0.7 + tw, -0.03, -0.66, 0.04, -0.58, 0.04);
    ctx.closePath();
  });
  ctx.lineJoin = 'round';
  if (rim) {
    ctx.strokeStyle = rgba(rim, 0.55); ctx.lineWidth = 0.035;
    for (const p of parts) { ctx.beginPath(); p(); ctx.stroke(); }
  }
  ctx.fillStyle = ink;
  for (const p of parts) { ctx.beginPath(); p(); ctx.fill(); }
  // loose straws of the broom
  ctx.strokeStyle = ink; ctx.lineWidth = 0.014; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 7; i++) {
    const k = i / 6, yy = lerp(-0.04, 0.3, k);
    ctx.moveTo(-0.9, lerp(0.05, 0.22, k)); ctx.lineTo(-1.24 - hash(i) * 0.06, yy + Math.sin(t * 9 + i) * 0.015);
  }
  ctx.stroke();
  // colored details: hat buckle, witch's eye and cat's eyes
  ctx.fillStyle = '#ffcf4a';
  ctx.beginPath(); ctx.roundRect(0.075, -0.6, 0.05, 0.04, 0.008); ctx.fill();
  ctx.fillStyle = ink; ctx.fillRect(0.088, -0.59, 0.024, 0.02);
  glow(ctx, 0.2, -0.47, 0.05, [140, 255, 120], 0.8);
  if (o.cat !== false) {
    const blink = (t % 3.7) < 0.12 ? 0.2 : 1;
    const by = Math.sin(t * 2 - 0.5) * 0.008;
    glow(ctx, -0.44, -0.165 + by, 0.07, [255, 230, 60], 0.9);
    ctx.fillStyle = '#fff59a';
    ctx.beginPath(); ctx.ellipse(-0.455, -0.165 + by, 0.013, 0.013 * blink, 0, 0, TAU); ctx.ellipse(-0.42, -0.165 + by, 0.013, 0.013 * blink, 0, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

// Fan-shaped cobweb from (cx, cy) between angles a0..a1 (or full with o.full); p = progress
// (radii up to 0.5, then the spiral from outside in). Options: spokes, rings, color, lw, seed,
// t (time for the dew shimmer; default the show clock), dew (false removes the drops)
function drawWeb(ctx, cx, cy, r, a0, a1, p, o = {}) {
  if (p <= 0) return;
  const spokes = o.spokes || 7, rings = o.rings || 7, t = o.t ?? _clock();
  const seed = o.seed ?? Math.round(cx * 7 + cy * 13 + r * 3 + a0 * 100);
  const rnd = rng(seed), angles = [];
  if (o.full) for (let i = 0; i <= spokes; i++) angles.push(a0 + ((i % spokes) / spokes) * TAU + (i % spokes ? (rnd() - 0.5) * 0.12 : 0));
  else for (let i = 0; i < spokes; i++) angles.push(lerp(a0, a1, i / (spokes - 1)) + (i && i < spokes - 1 ? (rnd() - 0.5) * 0.1 : 0));
  if (o.full) angles[spokes] = angles[0] + TAU;
  const n = angles.length, jit = angles.map(() => 0.94 + rnd() * 0.12);
  const sp = easeOut(clamp(p * 2)), q = clamp(p * 2 - 1) * rings;
  const col = o.color || 'rgba(225,232,255,0.75)', lw = o.lw || Math.max(1, r * 0.006);
  const ringR = k => (r * (k + 1)) / (rings + 0.6);
  // path of the whole web (radii + partial spiral)
  const build = () => {
    ctx.beginPath();
    for (let i = 0; i < (o.full ? spokes : n); i++) { ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(angles[i]) * r * sp * jit[i], cy + Math.sin(angles[i]) * r * sp * jit[i]); }
    for (let j = 0; j < Math.ceil(q); j++) {
      const k = rings - 1 - j, rr = ringR(k), frac = clamp(q - j), segs = (n - 1) * frac;
      const pt = i => [cx + Math.cos(angles[i]) * rr * jit[i], cy + Math.sin(angles[i]) * rr * jit[i]];
      let [px, py] = pt(0);
      ctx.moveTo(px, py);
      for (let i = 1; i < n && i - 1 < segs; i++) {
        const [qx, qy] = pt(i), am = (angles[i - 1] + angles[i]) / 2, sag = rr * (0.8 + 0.06 * Math.sin(k * 3.1 + i));
        const f = Math.min(1, segs - (i - 1));
        const mx = cx + Math.cos(am) * sag, my = cy + Math.sin(am) * sag;
        if (f >= 1) ctx.quadraticCurveTo(mx, my, qx, qy);
        else ctx.quadraticCurveTo(lerp(px, mx, f), lerp(py, my, f), lerp(lerp(px, mx, f), lerp(mx, qx, f), f), lerp(lerp(py, my, f), lerp(my, qy, f), f));
        px = qx; py = qy;
      }
    }
  };
  ctx.save();
  ctx.lineCap = 'round';
  build();
  ctx.strokeStyle = 'rgba(170,190,255,0.12)'; ctx.lineWidth = lw * 3.5; ctx.stroke();
  ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.stroke();
  // dew drops at some junctions; now and then one flashes
  if (o.dew !== false && q > 0) {
    const dr = rng(seed + 99), ds = Math.max(1.2, lw * 1.6);
    ctx.fillStyle = 'rgba(235,245,255,0.85)';
    const sparks = [];
    for (let j = 0; j < Math.floor(q); j++) {
      const k = rings - 1 - j, rr = ringR(k);
      for (let i = 0; i < n; i++) {
        if (dr() > 0.3) continue;
        const along = dr() < 0.5 ? 0 : 0.5, ii = Math.min(n - 1, i + (along ? 1 : 0));
        const a = along ? (angles[i] + angles[ii]) / 2 : angles[i], rad = along ? rr * 0.82 : rr * jit[i];
        const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad, ph = dr() * TAU, rate = 0.6 + dr() * 0.9;
        ctx.beginPath(); ctx.arc(x, y, ds * (0.8 + dr() * 0.6), 0, TAU); ctx.fill();
        const tw = Math.max(0, Math.sin(t * rate + ph)) ** 14;
        if (tw > 0.05) sparks.push([x, y, tw]);
      }
    }
    for (const [x, y, tw] of sparks) {
      glow(ctx, x, y, ds * 9 * tw, [200, 225, 255], 0.7 * tw);
      ctx.strokeStyle = rgba([255, 255, 255], tw); ctx.lineWidth = Math.max(1, ds * 0.5);
      const L = ds * 7 * tw;
      ctx.beginPath(); ctx.moveTo(x - L, y); ctx.lineTo(x + L, y); ctx.moveTo(x, y - L); ctx.lineTo(x, y + L); ctx.stroke();
    }
  }
  ctx.restore();
}

// Spider: (x, y) center, s size; head toward +y (hangs from the thread). Options: thread (y where the thread starts),
// angle, walk (legs walking), color [r,g,b], rim [r,g,b] (edge light; null removes it), mark (false removes the hourglass)
function drawSpider(ctx, x, y, s, t, o = {}) {
  ctx.save();
  if (o.thread != null) {
    const g = ctx.createLinearGradient(0, o.thread, 0, y);
    g.addColorStop(0, 'rgba(230,235,255,0.25)'); g.addColorStop(1, 'rgba(240,245,255,0.85)');
    ctx.strokeStyle = g;
    ctx.lineWidth = Math.max(1, s * 0.025);
    ctx.beginPath(); ctx.moveTo(x, o.thread); ctx.lineTo(x, y - s * 0.5); ctx.stroke();
  }
  ctx.translate(x, y);
  ctx.rotate(o.angle || 0);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const body = _rgbOf(o.color, [16, 9, 20]), rim = o.rim === undefined ? [190, 130, 255] : o.rim;
  const hanging = o.thread != null && !o.walk;
  // legs: hip → knee (arc outward) → ankle → tip; alternating gait when walking
  const legs = [];
  const DIRS = [1.05, 0.38, -0.32, -1.0];
  for (const sd of [-1, 1]) for (let i = 0; i < 4; i++) {
    const gait = (i % 2 === 0) === (sd > 0) ? 0 : Math.PI;
    const ph = o.walk ? t * 9 + gait : t * 1.3 + i * 1.7 + (sd > 0 ? 2 : 0);
    const swing = o.walk ? Math.sin(ph) * 0.26 : Math.sin(ph) * 0.05 + Math.sin(t * 7 + i * 3 + sd) * 0.012;
    const lift = o.walk ? Math.max(0, Math.cos(ph)) : 0;
    const curl = hanging ? 0.82 + 0.05 * Math.sin(t * 0.9 + i) : 1;
    // angles of the right side; the left is mirrored in x
    const dir = DIRS[i] + swing + (hanging ? 0.22 : 0), kdir = dir - 0.5 - lift * 0.15;
    const ox = 0, oy = s * 0.18, reach = s * 0.98 * curl * (i === 0 || i === 3 ? 1.06 : 1);
    const kr = s * (0.52 + lift * 0.08) * (hanging ? 0.95 : 1);
    const hx = sd * s * 0.11, hy = oy + (1.5 - i) * s * 0.05;
    const kx = ox + sd * Math.cos(kdir) * kr, ky = oy + Math.sin(kdir) * kr;
    const ax = ox + sd * Math.cos(dir) * reach, ay = oy + Math.sin(dir) * reach;
    const tdir = dir + 0.55 * (hanging ? 1.3 : 1), tl = s * 0.24 * curl;
    const tx = ax + sd * Math.cos(tdir) * tl, ty = ay + Math.sin(tdir) * tl;
    legs.push([hx, hy, kx, ky, ax, ay, tx, ty]);
  }
  const seg = (k) => { ctx.beginPath(); for (const L of legs) { ctx.moveTo(L[k * 2], L[k * 2 + 1]); ctx.lineTo(L[k * 2 + 2], L[k * 2 + 3]); } };
  const W = [0.075, 0.06, 0.04];
  if (rim) {
    ctx.strokeStyle = rgba(rim, 0.32);
    for (let k = 0; k < 3; k++) { seg(k); ctx.lineWidth = s * W[k] * 1.8; ctx.stroke(); }
  }
  ctx.strokeStyle = rgba(body);
  for (let k = 0; k < 3; k++) { seg(k); ctx.lineWidth = s * W[k]; ctx.stroke(); }
  // hairs: short bristles tilted toward the tip
  if (s > 14) {
    ctx.lineWidth = Math.max(1, s * 0.012);
    ctx.beginPath();
    for (const L of legs) for (let k = 0; k < 2; k++) {
      const x1 = L[k * 2], y1 = L[k * 2 + 1], x2 = L[k * 2 + 2], y2 = L[k * 2 + 3];
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, hl = s * 0.07;
      for (let j = 1; j <= 5; j++) {
        const f = j / 6, px = x1 + dx * f, py = y1 + dy * f, sdd = j % 2 ? 1 : -1, off = s * W[k] * 0.45;
        ctx.moveTo(px - uy * off * sdd, py + ux * off * sdd);
        ctx.lineTo(px - uy * (off + hl) * sdd + ux * hl * 0.8, py + ux * (off + hl) * sdd + uy * hl * 0.8);
      }
    }
    ctx.stroke();
    // light on the marked segments and joints
    ctx.strokeStyle = rgba(mix(body, [200, 170, 255], 0.45), 0.6); ctx.lineWidth = Math.max(1, s * 0.014);
    seg(0); ctx.stroke();
    ctx.fillStyle = rgba(mix(body, [120, 90, 150], 0.35));
    for (const L of legs) { ell(ctx, L[2], L[3], s * 0.045, s * 0.045); ell(ctx, L[4], L[5], s * 0.035, s * 0.035); }
  }
  // hairy abdomen and cephalothorax
  const furPath = (cx0, cy0, rx, ry, n, len) => {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, c = Math.cos(a), sn = Math.sin(a), l = len * (0.6 + 0.4 * hash(i * 1.3 + rx));
      ctx.moveTo(cx0 + c * rx * 0.92, cy0 + sn * ry * 0.92); ctx.lineTo(cx0 + c * (rx + l), cy0 + sn * (ry + l));
    }
  };
  if (rim) {
    ctx.fillStyle = rgba(rim, 0.5);
    ell(ctx, 0, -s * 0.2, s * 0.33, s * 0.39); ell(ctx, 0, s * 0.2, s * 0.21, s * 0.2);
  }
  ctx.strokeStyle = rgba(body); ctx.lineWidth = Math.max(1, s * 0.022);
  ctx.beginPath(); furPath(0, -s * 0.2, s * 0.3, s * 0.36, 44, s * 0.06); furPath(0, s * 0.2, s * 0.18, s * 0.17, 24, s * 0.04); ctx.stroke();
  ctx.fillStyle = radial(ctx, -s * 0.1, -s * 0.33, s * 0.02, s * 0.42, [[0, rgba(mix(body, [150, 110, 200], 0.4))], [0.5, rgba(body)], [1, rgba(mix(body, [0, 0, 0], 0.5))]]);
  ell(ctx, 0, -s * 0.2, s * 0.3, s * 0.36);
  ctx.fillStyle = radial(ctx, -s * 0.05, s * 0.13, s * 0.01, s * 0.22, [[0, rgba(mix(body, [150, 110, 200], 0.35))], [1, rgba(body)]]);
  ell(ctx, 0, s * 0.2, s * 0.18, s * 0.17);
  // red hourglass
  if (o.mark !== false) {
    ctx.fillStyle = '#ff1a36';
    ctx.beginPath();
    ctx.moveTo(-s * 0.09, -s * 0.34); ctx.lineTo(s * 0.09, -s * 0.34); ctx.quadraticCurveTo(s * 0.01, -s * 0.27, 0, -s * 0.21);
    ctx.quadraticCurveTo(s * 0.01, -s * 0.15, s * 0.09, -s * 0.08); ctx.lineTo(-s * 0.09, -s * 0.08); ctx.quadraticCurveTo(-s * 0.01, -s * 0.15, 0, -s * 0.21);
    ctx.quadraticCurveTo(-s * 0.01, -s * 0.27, -s * 0.09, -s * 0.34);
    ctx.fill();
    glow(ctx, 0, -s * 0.21, s * 0.18, [255, 20, 40], 0.35);
  }
  // chelicerae with fangs
  ctx.fillStyle = rgba(mix(body, [60, 30, 70], 0.4));
  ell(ctx, -s * 0.06, s * 0.36, s * 0.05, s * 0.07); ell(ctx, s * 0.06, s * 0.36, s * 0.05, s * 0.07);
  ctx.strokeStyle = 'rgba(240,230,255,0.85)'; ctx.lineWidth = Math.max(1, s * 0.02);
  ctx.beginPath(); ctx.moveTo(-s * 0.06, s * 0.41); ctx.quadraticCurveTo(-s * 0.06, s * 0.47, -s * 0.02, s * 0.48); ctx.moveTo(s * 0.06, s * 0.41); ctx.quadraticCurveTo(s * 0.06, s * 0.47, s * 0.02, s * 0.48); ctx.stroke();
  // eight eyes: two large ones that shine
  glow(ctx, 0, s * 0.28, s * 0.16, [255, 30, 30], 0.6);
  ctx.fillStyle = '#ff3a2a';
  ell(ctx, -s * 0.055, s * 0.28, s * 0.04, s * 0.04); ell(ctx, s * 0.055, s * 0.28, s * 0.04, s * 0.04);
  ctx.fillStyle = '#d0202a';
  for (const [ex, ey, er] of [[-0.12, 0.25, 0.022], [0.12, 0.25, 0.022], [-0.035, 0.225, 0.018], [0.035, 0.225, 0.018], [-0.1, 0.31, 0.016], [0.1, 0.31, 0.016]]) ell(ctx, ex * s, ey * s, er * s, er * s);
  ctx.fillStyle = 'rgba(255,240,230,0.9)';
  ell(ctx, -s * 0.065, s * 0.267, s * 0.012, s * 0.012); ell(ctx, s * 0.045, s * 0.267, s * 0.012, s * 0.012);
  ctx.restore();
}

// ---------- lightning, cracks, bricks ----------

function makeBolt(x1, y1, x2, y2, seed) {
  const r = rng(seed);
  const mk = (ax, ay, bx, by, rough, depth) => {
    let pts = [[ax, ay], [bx, by]], off = Math.hypot(bx - ax, by - ay) * rough;
    for (let it = 0; it < depth; it++) {
      const n = [pts[0]];
      for (let i = 1; i < pts.length; i++) {
        const [px, py] = pts[i - 1], [qx, qy] = pts[i];
        const dx = qx - px, dy = qy - py, l = Math.hypot(dx, dy) || 1, d = (r() - 0.5) * off;
        n.push([(px + qx) / 2 - (dy / l) * d, (py + qy) / 2 + (dx / l) * d], pts[i]);
      }
      pts = n; off *= 0.55;
    }
    return pts;
  };
  const main = mk(x1, y1, x2, y2, 0.35, 6), branches = [], len = Math.hypot(x2 - x1, y2 - y1);
  for (let b = 0; b < 3; b++) {
    const [sx, sy] = main[8 + Math.floor(r() * (main.length - 20))];
    const ang = Math.atan2(y2 - y1, x2 - x1) + (r() < 0.5 ? -1 : 1) * (0.4 + r() * 0.5), l = len * (0.15 + r() * 0.25);
    branches.push(mk(sx, sy, sx + Math.cos(ang) * l, sy + Math.sin(ang) * l, 0.3, 4));
  }
  return { main, branches };
}

function drawBolt(ctx, bolt, lw, a = 1) {
  if (a <= 0) return;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const line = pts => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const q of pts) ctx.lineTo(q[0], q[1]); ctx.stroke(); };
  for (const [col, mul, al] of [[[140, 170, 255], 7, 0.15], [[170, 200, 255], 2.5, 0.5], [[255, 255, 255], 1, 1]]) {
    ctx.strokeStyle = rgba(col, al * a);
    ctx.lineWidth = lw * mul; line(bolt.main);
    ctx.lineWidth = lw * mul * 0.5; bolt.branches.forEach(line);
  }
  ctx.restore();
}

// Branched cracks: segments [x1, y1, x2, y2, moment 0..1, thickness 0..1]
function makeCracks(w, h, seed, o = {}) {
  const r = rng(seed), segs = [], step = Math.min(w, h) * (o.step || 0.035);
  const grow = (x, y, ang, steps, t, depth, width) => {
    for (let i = 0; i < steps; i++) {
      ang += (r() - 0.5) * 0.9;
      const nx = x + Math.cos(ang) * step, ny = y + Math.sin(ang) * step;
      segs.push([x, y, nx, ny, t, width]);
      x = nx; y = ny; t += 1; width *= 0.96;
      if (depth < 3 && r() < 0.12) grow(x, y, ang + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6), Math.floor(steps * 0.5), t, depth + 1, width * 0.7);
    }
  };
  for (let i = 0; i < (o.count || 4); i++) {
    const x = w * (0.2 + r() * 0.6), y = h * (0.2 + r() * 0.6), a = r() * TAU, steps = 18 + Math.floor(r() * 14);
    grow(x, y, a, steps, i * 4, 0, 1);
    grow(x, y, a + Math.PI, steps, i * 4, 0, 1);
  }
  const maxT = segs.reduce((m, s) => Math.max(m, s[4]), 0) + 1;
  for (const s of segs) s[4] /= maxT;
  return segs;
}

function drawCracks(ctx, segs, p, lw, a = 1, glowCol = [255, 110, 20], coreCol = [255, 230, 160]) {
  if (p <= 0 || a <= 0) return;
  ctx.save();
  ctx.lineCap = 'round';
  for (const [col, mul, al] of [[glowCol, 5, 0.15], [glowCol, 2, 0.55], [coreCol, 0.8, 1]]) {
    ctx.strokeStyle = rgba(col, al * a);
    for (const [lo, hi, k] of [[0.7, 2, 1], [0.4, 0.7, 0.55], [0, 0.4, 0.3]]) {
      ctx.lineWidth = Math.max(0.5, lw * mul * k);
      ctx.beginPath();
      for (const s of segs) if (s[4] <= p && s[5] >= lo && s[5] < hi) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
      ctx.stroke();
    }
  }
  ctx.restore();
}

function makeBricks(w, h, seed, fallStart) {
  const r = rng(seed), bh = Math.max(12, h / 16), bw = bh * 2.3, list = [];
  for (let row = 0, y = 0; y < h; row++, y += bh) {
    for (let x = -(row % 2) * bw / 2; x < w; x += bw) {
      const v = r() * 0.35;
      list.push({ x, y, w: bw, h: bh, gap: Math.max(1, bh * 0.07), css: rgba([150 - v * 80, 72 - v * 30, 52 - v * 20]), fall: fallStart + r() * 4.5, vx: (r() - 0.5) * w * 0.3, vr: (r() - 0.5) * 4 });
    }
  }
  return list;
}

function drawBricks(ctx, bricks, t, h, a = 1) {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha *= a;
  const g = h * 3;
  for (const b of bricks) {
    const ft = t - b.fall;
    if (ft > 0) {
      const dy = 0.5 * g * ft * ft;
      if (b.y + dy > h * 1.3) continue;
      ctx.save();
      ctx.translate(b.x + b.w / 2 + b.vx * ft, b.y + b.h / 2 + dy);
      ctx.rotate(b.vr * ft);
      ctx.fillStyle = b.css;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    } else {
      ctx.fillStyle = '#26211d';
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.css;
      ctx.fillRect(b.x + b.gap, b.y + b.gap, b.w - b.gap * 2, b.h - b.gap * 2);
    }
  }
  ctx.restore();
}

// ---------- text ----------

const _FONT = 'Creepster, Impact, "Arial Black", sans-serif';
// Has Creepster loaded yet? (if it changes, the letter sprites are redone)
function _fontReady(size) { try { return document.fonts ? document.fonts.check(`${Math.round(size)}px Creepster`) : false; } catch { return false; } }

// Drips of each letter (one or two, deterministic): [relative x 0..1, length 0..1, period s, phase]
function _dripsOf(ch, seed) { const r = rng(hashString(ch) + seed * 131), n = r() < 0.45 ? 1 : 2; return Array.from({ length: n }, () => [0.22 + 0.56 * r(), r(), 2.8 + r() * 2.5, r()]); }

// Sprite of one letter: extruded block, face with gradient, green slime on top and halo behind
function _letterSprite(ch, S, ready, seed) {
  const key = `ltr${ch}:${S}:${ready ? 1 : 0}:${seed}`;
  const old = _SPR.get(key);
  if (old) return old;
  const meas = (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(4, 4) : document.createElement('canvas')).getContext('2d');
  meas.font = `${S}px ${_FONT}`;
  const cw = meas.measureText(ch).width, pad = S * 0.24, W = cw + pad * 2, H = S * 1.2 + pad * 2;
  const bx = pad, by = pad + S * 0.95;
  const spr = _sprite(key, W, H, c => {
    c.font = `${S}px ${_FONT}`;
    c.textBaseline = 'alphabetic';
    const depth = Math.max(3, Math.round(S * 0.06)), dx = S * 0.012, dy = S * 0.014;
    // extrusion: offset copies, from dark (background) to less dark
    for (let k = depth; k >= 1; k--) {
      c.fillStyle = rgba(mix([60, 8, 30], [150, 40, 0], 1 - k / depth));
      c.fillText(ch, bx + dx * k, by + dy * k);
    }
    c.lineJoin = 'round';
    c.lineWidth = S * 0.06; c.strokeStyle = '#2a0838';
    c.strokeText(ch, bx, by);
    const g = c.createLinearGradient(0, by - S * 0.8, 0, by);
    g.addColorStop(0, '#fff07a'); g.addColorStop(0.45, '#ffb21e'); g.addColorStop(1, '#ff4d00');
    c.fillStyle = g;
    c.fillText(ch, bx, by);
    // slime on top (only over the letter): wavy bottom edge, with lobes where the drips start
    c.globalCompositeOperation = 'source-atop';
    const top = by - S * 0.82, drips = _dripsOf(ch, seed);
    c.beginPath();
    c.moveTo(0, 0); c.lineTo(W, 0);
    for (let i = 0; i <= 30; i++) {
      const xx = W - (i / 30) * W, rel = (xx - bx) / cw;
      let yy = top + S * (0.15 + 0.04 * Math.sin(xx * 0.09 + seed));
      for (const [dxr] of drips) yy += S * 0.12 * Math.exp(-((((rel - dxr) * cw) / (S * 0.08)) ** 2));
      c.lineTo(xx, yy);
    }
    c.closePath();
    const sg = c.createLinearGradient(0, top - S * 0.1, 0, top + S * 0.4);
    sg.addColorStop(0, '#e2ffad'); sg.addColorStop(0.3, '#7dff4a'); sg.addColorStop(1, '#2cbf20');
    c.fillStyle = sg; c.fill();
    c.strokeStyle = 'rgba(20,90,10,0.85)'; c.lineWidth = S * 0.025; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.4)';
    c.fillRect(0, top - S * 0.05, W, S * 0.05);
    // halo behind everything
    c.globalCompositeOperation = 'destination-over';
    c.shadowColor = 'rgba(255,110,0,0.9)'; c.shadowBlur = S * 0.14;
    c.fillStyle = 'rgba(140,40,0,0.9)';
    c.fillText(ch, bx + dx * depth, by + dy * depth);
  });
  spr._bx = bx; spr._by = by; spr._cw = cw;
  return spr;
}

// Text that appears letter by letter (falls, bounces and sways) covered in green slime that drips
// and drops blobs; then, every few seconds, a wave of little hops runs through the letters.
// Options: start, step (seconds between letters), seed, wave (wave period in s, 0 removes it), halo
function drawSlimeText(ctx, lines, w, h, t, o = {}) {
  ctx.save();
  let size = h / (lines.length * 1.25);
  ctx.font = `${size}px ${_FONT}`;
  const widest = Math.max(...lines.map(l => ctx.measureText(l).width)) || 1;
  size = Math.min(size, (size * w * 0.9) / widest);
  ctx.font = `${size}px ${_FONT}`;
  const lineH = size * 1.1, top = (h - lineH * lines.length) / 2;
  const seed = o.seed ?? 7, start = o.start ?? 0, step = o.step ?? 0.2, ready = _fontReady(size);
  const S = Math.max(8, Math.round(size)), sc0 = size / S, total = lines.reduce((n, l) => n + l.length, 0);
  const waveP = o.wave ?? 6, waveT0 = start + total * step + 2;
  // warm halo behind the text block (optional: each letter already has its own)
  const shown = o.halo ? clamp((t - start) / (step * 6 + 0.5)) : 0;
  if (shown > 0) {
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(1, Math.min(1, (lineH * lines.length) / (w * 0.9)));
    glow(ctx, 0, 0, w * 0.55, [255, 100, 0], 0.2 * shown);
    ctx.restore();
  }
  // positions and state of each letter
  const L = [];
  let ci = 0;
  lines.forEach((line, li) => {
    const base = top + lineH * (li + 0.82);
    let x = (w - ctx.measureText(line).width) / 2;
    for (const ch of line) {
      const cw = ctx.measureText(ch).width, lt = t - (start + ci * step);
      if (lt > 0 && ch !== ' ') {
        let hop = 0;
        if (waveP > 0 && t > waveT0) { const wt = ((t - waveT0) % waveP) - ci * 0.07; if (wt > 0 && wt < 0.5) hop = Math.sin((wt / 0.5) * Math.PI); }
        L.push({ ch, x, cw, base, lt, ci, hop, bob: -hop * size * 0.14 });
      }
      x += cw; ci++;
    }
  });
  // drips (behind the letters, peek out from below): all in a few fills
  const dw = size * 0.065, bodies = new Path2D(), shine = new Path2D(), drops = new Path2D();
  for (const l of L) {
    const grow = smooth(0.5, 4.5, l.lt);
    if (grow <= 0) continue;
    for (const [dxr, lr, per, ph] of _dripsOf(l.ch, seed + l.ci)) {
      const Ld = size * (0.05 + 0.34 * lr) * grow, cyc = (l.lt / per + ph) % 1;
      const len = Ld * (cyc < 0.85 ? 0.65 + 0.35 * easeInOut(cyc / 0.85) : 0.65);
      const dx = l.x + l.cw * dxr, y0 = l.base + l.bob * 0.5 - size * 0.2, y1 = l.base + l.bob * 0.3 + len;
      const neck = cyc > 0.7 && cyc < 0.85 ? 1 - ((cyc - 0.7) / 0.15) * 0.35 : 1;
      bodies.roundRect(dx - (dw / 2) * neck, y0, dw * neck, y1 - y0, dw / 2);
      bodies.moveTo(dx + dw * 0.9, y1); bodies.ellipse(dx, y1, dw * 0.9, dw * 1.1, 0, 0, TAU);
      shine.rect(dx - dw * 0.3, y0 + size * 0.04, dw * 0.2, (y1 - y0) * 0.9);
      shine.moveTo(dx - dw * 0.08, y1 - dw * 0.3); shine.ellipse(dx - dw * 0.3, y1 - dw * 0.3, dw * 0.22, dw * 0.3, 0, 0, TAU);
      if (cyc >= 0.85 && Ld > size * 0.08) {
        const ft = (cyc - 0.85) * per, fy = y1 + dw + 0.5 * h * 2.5 * ft * ft;
        if (fy < h + dw) { drops.moveTo(dx + dw * 0.65, fy); drops.ellipse(dx, fy, dw * 0.65, dw * (0.9 + ft), 0, 0, TAU); }
      }
    }
  }
  ctx.fillStyle = '#5ee83a'; ctx.fill(bodies);
  ctx.fillStyle = '#7dff4a'; ctx.fill(drops);
  ctx.fillStyle = 'rgba(230,255,200,0.85)'; ctx.fill(shine);
  // letters: fall with a bounce, squash on landing and damped wobble; when still they are copied without transform
  for (const l of L) {
    const spr = _letterSprite(l.ch, S, ready, seed + l.ci), cx = l.x + l.cw / 2;
    if (l.lt > 1.4 && !l.hop) { ctx.drawImage(spr, Math.round(cx - spr._bx - spr._cw / 2), Math.round(l.base - spr._by)); continue; }
    const k = clamp(l.lt / 0.45), sc = easeBack(k);
    const land = Math.exp(-Math.max(0, l.lt - 0.3) * 6);
    const squash = Math.sin(clamp((l.lt - 0.3) / 0.4) * Math.PI) * 0.12 * land + l.hop * -0.06;
    const wob = Math.sin(l.lt * 11) * Math.exp(-l.lt * 2.5) * 0.18 + l.hop * Math.sin(t * 9 + l.ci) * 0.06;
    ctx.save();
    ctx.translate(cx, l.base + l.bob - (1 - easeOut(k)) * size * 0.8);
    ctx.rotate(wob);
    ctx.scale(sc * (1 + squash) * sc0, sc * (1 - squash) * sc0);
    ctx.drawImage(spr, -spr._bx - spr._cw / 2, -spr._by);
    ctx.restore();
  }
  ctx.restore();
}
