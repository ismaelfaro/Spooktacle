// Scene registry. Each scene lives in js/scenes/NN-name.js and is registered with
// registerScene({...}); the show order is the load order in index.html.
//
// A scene is { name, duration, ambience, update?(S), draw(ctx, z, S), drawGlobal?(ctx, W, H, S) }:
// - draw draws each zone according to its type (z.kind: 'wall' facade/column/free, 'roof' roof,
//   'window' window, 'door' door/garage), in zone px (z.w × z.h), already warped to the mapping.
// - drawGlobal (optional) draws over the whole house in screen px (W × H), clipped to the union
//   of the zones: used for what crosses from one zone to another (bats, flying ghosts, lightning).
//   S.screenZones gives each zone in screen px: { id, kind, index, pts, cx, cy, x0, y0, x1, y1 }.
//
// S (shared per-frame state): S.t seconds into the scene, S.T global clock,
// S.dur duration, S.crossed(x) → true on the frame where S.t passes x, S.every(p) → every p seconds.

const SCENES = [];
let JUMPSCARE = null;

function registerScene(scene) { SCENES.push(scene); }
function registerJumpscare(scene) { JUMPSCARE = scene; }

// Shake shared by all zones
function shake(ctx, amount, t, seed) {
  if (amount > 0) ctx.translate(Math.sin(t * 53 + seed) * amount, Math.cos(t * 47 + seed * 0.7) * amount);
}
