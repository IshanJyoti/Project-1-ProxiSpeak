import { WORLD } from '../../../shared/geo.js';
import { SPAWN } from '../../../shared/defaultLayout.js';

export const AVATAR_RADIUS = 10;
const SPEED = 190; // px / second

// Mutable world state shared between the render loop, the network layer and the audio mixer.
// It lives outside React state on purpose: it changes 60 times a second.
export function createWorld() {
  return {
    selfId: null,
    selfName: 'You',
    self: { x: SPAWN.x, y: SPAWN.y },
    users: new Map(),      // id -> { id, name, color, x, y, rx, ry }  (x,y = server truth, rx,ry = rendered)
    obstacles: [],
    keys: new Set(),
    target: null,          // click-to-walk destination
    connected: new Set(),  // peer ids with a live WebRTC audio link
    showDebug: false,
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function blocked(x, y, obstacles) {
  for (const o of obstacles) {
    const cx = clamp(x, o.x, o.x + o.w);
    const cy = clamp(y, o.y, o.y + o.h);
    if ((x - cx) ** 2 + (y - cy) ** 2 < AVATAR_RADIUS * AVATAR_RADIUS) return true;
  }
  return false;
}

// Advance the local avatar. Returns true if it moved. Axes are resolved separately so you slide along walls.
export function stepSelf(world, dt) {
  const k = world.keys;
  let dx = (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0);
  let dy = (k.has('s') || k.has('arrowdown') ? 1 : 0) - (k.has('w') || k.has('arrowup') ? 1 : 0);
  if (dx || dy) world.target = null;
  else if (world.target) {
    const tx = world.target.x - world.self.x;
    const ty = world.target.y - world.self.y;
    if (Math.hypot(tx, ty) < 4) { world.target = null; return false; }
    dx = tx; dy = ty;
  }
  if (!dx && !dy) return false;
  const len = Math.hypot(dx, dy);
  const step = SPEED * dt * (k.has('shift') ? 1.8 : 1);
  const nx = world.self.x + (dx / len) * step;
  const ny = world.self.y + (dy / len) * step;
  let moved = false;
  const fx = clamp(nx, AVATAR_RADIUS, WORLD.width - AVATAR_RADIUS);
  if (!blocked(fx, world.self.y, world.obstacles)) { if (fx !== world.self.x) moved = true; world.self.x = fx; }
  const fy = clamp(ny, AVATAR_RADIUS, WORLD.height - AVATAR_RADIUS);
  if (!blocked(world.self.x, fy, world.obstacles)) { if (fy !== world.self.y) moved = true; world.self.y = fy; }
  if (!moved && world.target) world.target = null; // walked into a wall
  return moved;
}

export function initials(name) {
  return name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';
}

export function colorFor(id) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  const c = (n) => Math.round(n * 255).toString(16).padStart(2, '0');
  // HSL(h, 60%, 62%) -> hex
  const s = 0.6, l = 0.62, a = s * Math.min(l, 1 - l);
  const f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return `#${c(f(0))}${c(f(8))}${c(f(4))}`;
}
