// Mapping zones. Each zone is a quadrilateral (4 corners) in 0..1 coordinates of the
// projector screen, in order: top-left, top-right, bottom-right, bottom-left.
// Its content is drawn on its own canvas, which is warped with a homography (CSS matrix3d).

const STORAGE_KEY = 'hallowin.mapping.v1';
const MAX_TEXTURE = 2048;

const ROLES = { fachada: 'Facade', tejado: 'Roof / gable', ventana: 'Window', puerta: 'Door', garaje: 'Garage', columna: 'Column', libre: 'Free' };
const SHAPES = { rect: 'Rectangle', arco: 'Arch', triangulo: 'Triangle', elipse: 'Ellipse' };
// Draw layer: higher layers cover lower ones (windows above the facade)
const LAYER = { fachada: 0, columna: 1, libre: 1, tejado: 1, garaje: 2, puerta: 2, ventana: 2 };

function zoneKind(role) {
  if (role === 'ventana') return 'window';
  if (role === 'puerta' || role === 'garaje') return 'door';
  if (role === 'tejado') return 'roof';
  return 'wall';
}

const rectPts = (x1, y1, x2, y2) => [[x1, y1], [x2, y1], [x2, y2], [x1, y2]];

// Coordinates measured on the reference photo (4:3), converted to a 16:9 screen
// as the photo looks centered in the editor (object-fit: contain).
const PHOTO_ASPECT = 4 / 3, SCREEN_ASPECT = 16 / 9;
const fromPhoto = pts => pts.map(([x, y]) => [0.5 + (x - 0.5) * (PHOTO_ASPECT / SCREEN_ASPECT), y]);

// First approximation for the placeholder reference image (assets/home_picture.jpg); fine-tune with the projector on
function defaultZones() {
  return [
    { name: 'Central facade', role: 'fachada', shape: 'rect', pts: fromPhoto([[0.257, 0.305], [0.507, 0.300], [0.507, 0.572], [0.257, 0.575]]) },
    { name: 'Right wing', role: 'fachada', shape: 'rect', pts: fromPhoto([[0.600, 0.318], [0.953, 0.318], [0.953, 0.580], [0.600, 0.580]]) },
    { name: 'Left wing', role: 'fachada', shape: 'rect', pts: fromPhoto([[0.082, 0.330], [0.250, 0.330], [0.250, 0.600], [0.085, 0.600]]) },
    { name: 'Gable', role: 'tejado', shape: 'triangulo', pts: fromPhoto([[0.400, 0.164], [0.452, 0.164], [0.630, 0.293], [0.223, 0.305]]) },
    { name: 'Large window', role: 'ventana', shape: 'rect', pts: fromPhoto([[0.321, 0.330], [0.438, 0.330], [0.438, 0.429], [0.321, 0.429]]) },
    { name: 'Lower window', role: 'ventana', shape: 'rect', pts: fromPhoto([[0.335, 0.497], [0.429, 0.497], [0.429, 0.562], [0.335, 0.562]]) },
    { name: 'Right window', role: 'ventana', shape: 'rect', pts: fromPhoto([[0.696, 0.356], [0.832, 0.356], [0.832, 0.441], [0.696, 0.441]]) },
    { name: 'Balcony window', role: 'ventana', shape: 'rect', pts: fromPhoto([[0.145, 0.357], [0.227, 0.357], [0.227, 0.411], [0.145, 0.411]]) },
    { name: 'Door', role: 'puerta', shape: 'rect', pts: fromPhoto([[0.529, 0.360], [0.571, 0.360], [0.571, 0.478], [0.529, 0.478]]) },
  ];
}

function sanitizeZones(list) {
  if (!Array.isArray(list)) return [];
  const okPts = pts => Array.isArray(pts) && pts.length === 4 && pts.every(p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite));
  return list.filter(d => d && okPts(d.pts)).map(d => ({
    id: typeof d.id === 'string' ? d.id : undefined,
    name: String(d.name ?? 'Zona').slice(0, 40),
    role: Object.hasOwn(ROLES, d.role) ? d.role : 'libre',
    shape: Object.hasOwn(SHAPES, d.shape) ? d.shape : 'rect',
    pts: d.pts.map(p => [p[0], p[1]]),
  }));
}

let zoneCounter = 0;
function createZone(d) {
  const canvas = document.createElement('canvas');
  const id = d.id || `z${Date.now().toString(36)}${(zoneCounter++).toString(36)}`;
  return {
    id, name: d.name, role: d.role, shape: d.shape, pts: d.pts.map(p => [...p]),
    canvas, ctx: canvas.getContext('2d'), w: 0, h: 0, cssW: 0, cssH: 0, cache: {},
    seed: hashString(id) % 10007,
  };
}

const serializeZone = z => ({ id: z.id, name: z.name, role: z.role, shape: z.shape, pts: z.pts.map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]) });

// Sets the canvas size to what it occupies on screen and applies the homography.
// exact=false (while dragging) only resizes the canvas if the size changes a lot.
function layoutZone(z, exact = true) {
  const W = innerWidth, H = innerHeight;
  const q = z.pts.map(([x, y]) => [x * W, y * H]);
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const cw = Math.max(8, Math.round(Math.max(d(q[0], q[1]), d(q[3], q[2]))));
  const ch = Math.max(8, Math.round(Math.max(d(q[0], q[3]), d(q[1], q[2]))));
  const changed = !z.cssW || (exact ? cw !== z.cssW || ch !== z.cssH : Math.abs(cw / z.cssW - 1) > 0.25 || Math.abs(ch / z.cssH - 1) > 0.25);
  if (changed) {
    // real resolution (Retina / 4K screens), capped so it does not run slowly
    const s = Math.min(devicePixelRatio || 1, 2, MAX_TEXTURE / Math.max(cw, ch));
    z.canvas.width = z.w = Math.max(8, Math.round(cw * s));
    z.canvas.height = z.h = Math.max(8, Math.round(ch * s));
    z.canvas.style.width = cw + 'px';
    z.canvas.style.height = ch + 'px';
    z.cssW = cw; z.cssH = ch;
    z.cache = {};
  }
  z.canvas.style.transform = quadMatrix3d(z.cssW, z.cssH, q) || 'scale(0)';
}

// Type, index within its type (left to right), global order, center and area
function indexZones(zones) {
  const W = innerWidth, H = innerHeight, byKind = {};
  for (const z of zones) {
    z.kind = zoneKind(z.role);
    z.cx = z.pts.reduce((s, p) => s + p[0], 0) / 4;
    z.cy = z.pts.reduce((s, p) => s + p[1], 0) / 4;
    let a = 0;
    for (let i = 0; i < 4; i++) { const p = z.pts[i], n = z.pts[(i + 1) % 4]; a += p[0] * W * n[1] * H - n[0] * W * p[1] * H; }
    z.area = Math.abs(a) / 2;
    (byKind[z.kind] ||= []).push(z);
  }
  for (const list of Object.values(byKind)) {
    list.sort((a, b) => a.cx - b.cx || a.cy - b.cy);
    list.forEach((z, i) => { z.index = i; z.count = list.length; });
  }
  [...zones].sort((a, b) => LAYER[a.role] - LAYER[b.role] || a.cx - b.cx).forEach((z, i) => { z.order = i; });
  return byKind;
}

// Outline of each shape as a list of points in px of the zone (starts bottom-left)
function shapePoints(shape, w, h) {
  const pts = [];
  const arc = (cx, cy, rx, ry, a0, a1, n) => {
    for (let i = 0; i <= n; i++) { const a = lerp(a0, a1, i / n); pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  };
  if (shape === 'elipse') arc(w / 2, h / 2, w / 2, h / 2, Math.PI, Math.PI + TAU, 64);
  else if (shape === 'triangulo') pts.push([0, h], [w / 2, 0], [w, h]);
  else if (shape === 'arco') {
    const ry = Math.min(w / 2, h / 2);
    pts.push([0, h]);
    arc(w / 2, ry, w / 2, ry, Math.PI, TAU, 32);
    pts.push([w, h]);
  } else pts.push([0, h], [0, 0], [w, 0], [w, h]);
  return pts;
}

const shapeOf = z => (z.cache.shape ??= shapePoints(z.shape, z.w, z.h));
const cached = (z, key, make) => (z.cache[key] ??= make());

function saveMapping(zones) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, zones: zones.map(serializeZone) })); } catch {}
}

function loadMapping() {
  try {
    const zones = sanitizeZones(JSON.parse(localStorage.getItem(STORAGE_KEY))?.zones);
    if (zones.length) return zones;
  } catch {}
  return null;
}
