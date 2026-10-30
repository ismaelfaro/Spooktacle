// Mapping editor: with the projector on, drag the corners of each zone
// until they match the real window, door or wall.

const $ = id => document.getElementById(id);
const overlay = $('overlay');
const octx = overlay.getContext('2d');
const refImg = $('ref');
const REF_KEY = 'hallowin.ref.v1';
const DEFAULT_REF = 'assets/home_picture.jpg';
const HANDLE_R = 14;

// Grid + diagonals + circle: if the circle looks round on the house, the zone is correct
function drawTestPattern(ctx, z, selected) {
  const { w, h } = z, m = Math.min(w, h);
  const hue = { wall: 210, roof: 280, window: 45, door: 130 }[z.kind] ?? 0;
  ctx.fillStyle = `hsl(${hue} 55% ${selected ? 32 : 20}%)`;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = Math.max(1, m / 250);
  ctx.beginPath();
  for (let i = 1; i < 8; i++) {
    ctx.moveTo((w * i) / 8, 0); ctx.lineTo((w * i) / 8, h);
    ctx.moveTo(0, (h * i) / 8); ctx.lineTo(w, (h * i) / 8);
  }
  ctx.moveTo(0, 0); ctx.lineTo(w, h);
  ctx.moveTo(w, 0); ctx.lineTo(0, h);
  ctx.stroke();
  ctx.beginPath(); ctx.ellipse(w / 2, h / 2, m * 0.3, m * 0.3, 0, 0, TAU); ctx.stroke();
  ctx.strokeStyle = selected ? '#ffd400' : '#fff';
  ctx.lineWidth = Math.max(3, m / 40);
  tracePath(ctx, shapeOf(z)); ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.max(10, m * 0.14)}px system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(z.name, w / 2, h / 2);
}

const Editor = {
  selectedId: null,
  corner: -1,
  drag: null,
  mouse: null,
  undoStack: [],
  nudging: 0,
  dpr: 1,

  init() {
    const fill = (sel, entries) => sel.replaceChildren(...entries.map(([v, label]) => new Option(label, v)));
    fill($('z-role'), Object.entries(ROLES));
    fill($('z-shape'), Object.entries(SHAPES));
    fill($('scene-select'), SCENES.map((s, i) => [i, `${i + 1}. ${s.name}`]));

    $('btn-add').onclick = () => this.add();
    $('btn-dup').onclick = () => this.duplicate();
    $('btn-del').onclick = () => this.remove();
    $('btn-collapse').onclick = () => $('panel').classList.toggle('collapsed');
    $('btn-export').onclick = () => this.exportJSON();
    $('btn-show').onclick = () => setMode('show');
    $('import-file').onchange = e => { const f = e.target.files[0]; if (f) this.importJSON(f); e.target.value = ''; };
    $('btn-reset').onclick = () => {
      if (!confirm('Reset to the default zones? (Ctrl+Z undoes)')) return;
      this.pushUndo();
      setZones(defaultZones());
      saveMapping(App.zones);
      this.select(null);
    };
    $('ref-file').onchange = e => { const f = e.target.files[0]; if (f) this.loadRef(f); e.target.value = ''; };
    $('btn-ref-clear').onclick = () => { this.setRef(null); try { localStorage.setItem(REF_KEY, 'none'); } catch {} };
    $('ref-mix').oninput = e => { App.refMix = +e.target.value; };
    $('ref-mix').onchange = e => e.target.blur();
    $('view-mode').onchange = e => { this.setView(e.target.value); e.target.blur(); };
    $('volume').value = Sound.volume;
    $('volume').oninput = e => Sound.setVolume(+e.target.value);
    $('volume').onchange = e => e.target.blur();
    fill($('sfx-select'), Object.keys(SFX).sort().map(n => [n, n]));
    $('sfx-select').onchange = e => e.target.blur();
    $('btn-sfx').onclick = () => this.playSfx($('sfx-select').value);
    $('scene-select').onchange = e => { goScene(+e.target.value); this.setView('anim'); e.target.blur(); };

    const name = $('z-name');
    name.onfocus = () => this.pushUndo();
    name.oninput = () => {
      const z = this.selected();
      if (!z) return;
      z.name = name.value;
      saveMapping(App.zones);
      this.renderList();
    };
    $('z-role').onchange = e => this.setProp('role', e.target.value);
    $('z-shape').onchange = e => this.setProp('shape', e.target.value);
    // so that Space / arrows do not "press" the last button used again
    $('panel').addEventListener('click', e => e.target.closest('button')?.blur());

    overlay.addEventListener('pointerdown', e => this.onDown(e));
    overlay.addEventListener('pointermove', e => this.onMove(e));
    overlay.addEventListener('pointerup', () => this.onUp());
    overlay.addEventListener('pointercancel', () => this.onUp());
    overlay.addEventListener('dblclick', e => { if (!this.hitTest(e.clientX, e.clientY)) this.add([e.clientX / innerWidth, e.clientY / innerHeight]); });

    let ref = null;
    try { ref = localStorage.getItem(REF_KEY); } catch {}
    this.setRef(ref === 'none' ? null : ref || DEFAULT_REF);
    this.resizeOverlay();
  },

  resizeOverlay() {
    this.dpr = devicePixelRatio || 1;
    overlay.width = Math.round(innerWidth * this.dpr);
    overlay.height = Math.round(innerHeight * this.dpr);
  },

  selected() { return App.zones.find(z => z.id === this.selectedId) || null; },
  select(id, corner = -1) { this.selectedId = id; this.corner = corner; this.refreshPanel(); },
  setView(v) { App.view = v; $('view-mode').value = v; },
  syncScene() { $('scene-select').value = App.scene; },

  pushUndo() {
    this.undoStack.push(JSON.stringify(App.zones.map(serializeZone)));
    if (this.undoStack.length > 80) this.undoStack.shift();
  },
  undo() {
    const snap = this.undoStack.pop();
    if (!snap) return toast('Nothing to undo');
    setZones(JSON.parse(snap));
    saveMapping(App.zones);
    this.refreshPanel();
    toast('Undone');
  },
  // Save after changing geometry or properties
  commit() { refreshZones(); saveMapping(App.zones); this.refreshPanel(); },

  setProp(key, value) {
    const z = this.selected();
    if (!z) return;
    this.pushUndo();
    z[key] = value;
    z.cache = {};
    this.commit();
    document.activeElement?.blur();
  },
  add(at) {
    this.pushUndo();
    const [cx, cy] = at || [0.5, 0.5];
    const z = createZone({ name: `Zona ${App.zones.length + 1}`, role: 'ventana', shape: 'rect', pts: rectPts(cx - 0.05, cy - 0.06, cx + 0.05, cy + 0.06) });
    App.zones.push(z);
    this.selectedId = z.id;
    this.commit();
  },
  duplicate() {
    const s = this.selected();
    if (!s) return toast('Select a zone');
    this.pushUndo();
    const z = createZone({ ...serializeZone(s), id: undefined, name: `${s.name} copia`, pts: s.pts.map(([x, y]) => [x + 0.03, y + 0.03]) });
    App.zones.push(z);
    this.selectedId = z.id;
    this.commit();
  },
  remove() {
    const s = this.selected();
    if (!s) return toast('Select a zone');
    this.pushUndo();
    App.zones = App.zones.filter(z => z !== s);
    this.selectedId = null;
    this.corner = -1;
    this.commit();
  },

  refreshPanel() {
    if (App.mode !== 'edit') return;
    this.renderList();
    const z = this.selected();
    $('zone-props').classList.toggle('disabled', !z);
    $('z-name').value = z ? z.name : '';
    $('z-role').value = z ? z.role : 'ventana';
    $('z-shape').value = z ? z.shape : 'rect';
    $('view-mode').value = App.view;
    this.syncScene();
  },
  renderList() {
    $('zone-list').replaceChildren(...App.zones.map(z => {
      const li = document.createElement('li');
      li.className = z.id === this.selectedId ? 'sel' : '';
      const dot = document.createElement('span');
      dot.className = `dot ${zoneKind(z.role)}`;
      const nm = document.createElement('span');
      nm.textContent = z.name;
      const role = document.createElement('span');
      role.className = 'role';
      role.textContent = ROLES[z.role];
      li.append(dot, nm, role);
      li.onclick = () => this.select(z.id);
      return li;
    }));
  },

  // Corners first (the selected zone takes priority), then interiors from top to bottom
  hitTest(x, y) {
    const W = innerWidth, H = innerHeight;
    const top = [...App.zones].reverse().sort((a, b) => LAYER[b.role] - LAYER[a.role]);
    const sel = this.selected();
    for (const z of sel ? [sel, ...top] : top)
      for (let i = 0; i < 4; i++) if (Math.hypot(z.pts[i][0] * W - x, z.pts[i][1] * H - y) < HANDLE_R) return { z, corner: i };
    for (const z of top) if (pointInPoly([x / W, y / H], z.pts)) return { z, corner: -1 };
    return null;
  },
  onDown(e) {
    if (e.button !== 0) return;
    const hit = this.hitTest(e.clientX, e.clientY);
    if (!hit) return this.select(null);
    this.select(hit.z.id, hit.corner);
    this.pushUndo();
    this.drag = { z: hit.z, corner: hit.corner, x: e.clientX, y: e.clientY, orig: hit.z.pts.map(p => [...p]), moved: false };
    overlay.setPointerCapture(e.pointerId);
  },
  onMove(e) {
    this.mouse = [e.clientX, e.clientY];
    const d = this.drag;
    if (!d) return;
    const dx = (e.clientX - d.x) / innerWidth, dy = (e.clientY - d.y) / innerHeight;
    if (dx || dy) d.moved = true;
    d.z.pts = d.orig.map(([x, y], i) => (d.corner < 0 || d.corner === i ? [x + dx, y + dy] : [x, y]));
    layoutZone(d.z, false);
  },
  onUp() {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    if (!d.moved) this.undoStack.pop();
    else this.commit();
  },

  handleKey(e) {
    const k = e.key;
    if ((e.metaKey || e.ctrlKey) && k.toLowerCase() === 'z') { this.undo(); return true; }
    if (k === 'g' || k === 'G') {
      this.setView(App.view === 'test' ? 'anim' : 'test');
      toast(App.view === 'test' ? 'Test pattern' : 'Animation');
      return true;
    }
    const z = this.selected();
    if (!z) return false;
    if (k.startsWith('Arrow')) {
      const step = e.shiftKey ? 10 : 1;
      const dx = (k === 'ArrowRight' ? step : k === 'ArrowLeft' ? -step : 0) / innerWidth;
      const dy = (k === 'ArrowDown' ? step : k === 'ArrowUp' ? -step : 0) / innerHeight;
      // a key press followed by arrows = a single undo step
      if (!this.nudging) this.pushUndo();
      clearTimeout(this.nudging);
      this.nudging = setTimeout(() => { this.nudging = 0; refreshZones(); }, 800);
      z.pts = z.pts.map((p, i) => (this.corner < 0 || this.corner === i ? [p[0] + dx, p[1] + dy] : p));
      layoutZone(z);
      saveMapping(App.zones);
      return true;
    }
    if (k === 'Tab') { this.corner = this.corner < 0 ? 0 : (this.corner + (e.shiftKey ? 3 : 1)) % 4; return true; }
    if (k === 'Escape') { if (this.corner >= 0) this.corner = -1; else this.select(null); return true; }
    if (k === 'Delete' || k === 'Backspace') { this.remove(); return true; }
    return false;
  },

  // the first click starts the audio; wait until it is ready before launching the effect
  async playSfx(name) {
    Sound.unlock();
    for (let i = 0; i < 20 && !Sound.started; i++) await new Promise(r => setTimeout(r, 50));
    if (!Sound.started) return toast('The browser has not allowed audio to start yet');
    Sound.play(name);
  },

  exportJSON() {
    const data = JSON.stringify({ version: 1, zones: App.zones.map(serializeZone) }, null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
    a.download = 'spooktacle-mapping.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  async importJSON(file) {
    try {
      const data = JSON.parse(await file.text());
      const zones = sanitizeZones(data.zones ?? data);
      if (!zones.length) throw new Error('sin zonas');
      this.pushUndo();
      setZones(zones);
      saveMapping(App.zones);
      this.select(null);
      toast(`Mapping imported: ${zones.length} zones`);
    } catch {
      toast('Invalid mapping file');
    }
  },

  // The photo is scaled down to 1920 px so it fits in localStorage
  loadRef(file) {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1920 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      const src = c.toDataURL('image/jpeg', 0.85);
      this.setRef(src);
      try { localStorage.setItem(REF_KEY, src); } catch { toast('Photo loaded (it cannot be remembered for next time)'); }
    };
    img.onerror = () => toast('Could not read the image (use JPG or PNG)');
    img.src = URL.createObjectURL(file);
  },
  setRef(src) {
    App.hasRef = !!src;
    for (const img of [refImg, $('ambient')]) {
      if (src) img.src = src; else img.removeAttribute('src');
    }
    document.body.classList.toggle('has-ref', App.hasRef);
  },

  drawOverlay() {
    const W = innerWidth, H = innerHeight, ctx = octx, sel = this.selected();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (const z of App.zones) {
      const q = z.pts.map(([x, y]) => [x * W, y * H]), isSel = z === sel;
      ctx.beginPath();
      q.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.closePath();
      ctx.setLineDash(isSel ? [] : [6, 5]);
      ctx.lineWidth = isSel ? 2 : 1;
      ctx.strokeStyle = isSel ? '#ffd400' : 'rgba(255,255,255,0.6)';
      ctx.stroke();
      ctx.setLineDash([]);
      q.forEach(([x, y], i) => {
        ctx.beginPath();
        ctx.arc(x, y, isSel ? 9 : 5, 0, TAU);
        ctx.fillStyle = isSel && i === this.corner ? '#ffd400' : 'rgba(0,0,0,0.6)';
        ctx.fill();
        ctx.strokeStyle = isSel ? '#ffd400' : '#fff';
        ctx.stroke();
      });
      if (App.view === 'anim' || isSel) {
        ctx.font = '12px system-ui, sans-serif';
        ctx.fillStyle = isSel ? '#ffd400' : '#fff';
        ctx.fillText(z.name, q[0][0] + 6, q[0][1] - 6);
      }
    }
    // guide cross while dragging
    if (this.drag && this.mouse) {
      const [mx, my] = this.mouse;
      ctx.strokeStyle = 'rgba(0,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, my + 0.5); ctx.lineTo(W, my + 0.5);
      ctx.moveTo(mx + 0.5, 0); ctx.lineTo(mx + 0.5, H);
      ctx.stroke();
    }
  },
};
