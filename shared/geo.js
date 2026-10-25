// Shared by server and client so both sides agree on distance, occlusion and gain.
export const WORLD = { width: 1000, height: 540 };
export const HEAR_RADIUS = 100; // within this distance a peer is audible / handshake allowed
export const HEAR_RADIUS_MIN = 50;
export const HEAR_RADIUS_MAX = 500;
export const HEAR_RADIUS_STEP = 10;
export const HEAR_HYSTERESIS = 30;
export const DROP_RADIUS = HEAR_RADIUS + HEAR_HYSTERESIS; // default connection drop distance

export const validHearRadius = (radius) =>
  Number.isInteger(radius) && radius >= HEAR_RADIUS_MIN && radius <= HEAR_RADIUS_MAX;

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Liang–Barsky segment vs axis-aligned rectangle test.
export function segmentHitsRect(ax, ay, bx, by, r) {
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dy = by - ay;
  const p = [-dx, dx, -dy, dy];
  const q = [ax - r.x, r.x + r.w - ax, ay - r.y, r.y + r.h - ay];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
    }
  }
  return true;
}

// Product of the `transmit` factor of every obstacle between two points (1 = clear line, 0 = fully blocked).
export function occlusion(a, b, obstacles = []) {
  let factor = 1;
  for (const o of obstacles) {
    if (segmentHitsRect(a.x, a.y, b.x, b.y, o)) factor *= o.transmit ?? 0.2;
  }
  return factor;
}

// Volume drop-off: smooth quadratic falloff to 0 at `radius`, multiplied by obstacle occlusion.
export function attenuation(distance, occ = 1, radius = HEAR_RADIUS) {
  if (distance >= radius) return 0;
  const s = 1 - Math.max(0, distance - 24) / (radius - 24); // full volume inside 24px
  return Math.min(1, s * s) * occ;
}

// Stereo pan in [-1, 1]; positive = peer is to the right.
export const pan = (dx, radius = HEAR_RADIUS) => Math.max(-1, Math.min(1, dx / radius));

// Group users into conversation clusters (connected components of the "within radius" graph).
export function clusters(users, radius = HEAR_RADIUS) {
  const parent = new Map(users.map((u) => [u.id, u.id]));
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      if (dist(users[i], users[j]) <= radius) parent.set(find(users[i].id), find(users[j].id));
    }
  }
  const groups = new Map();
  for (const u of users) {
    const root = find(u.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(u.id);
  }
  return [...groups.values()];
}

export function validObstacle(o) {
  return (
    o && ['x', 'y', 'w', 'h'].every((k) => Number.isFinite(o[k])) &&
    o.w > 0 && o.h > 0 && o.x >= 0 && o.y >= 0 &&
    o.x + o.w <= WORLD.width && o.y + o.h <= WORLD.height &&
    (o.transmit === undefined || (o.transmit >= 0 && o.transmit <= 1))
  );
}
