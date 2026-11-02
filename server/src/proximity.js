import { HEAR_RADIUS, HEAR_HYSTERESIS } from '../../shared/geo.js';

// Pure helper: given who was in earshot before and the geo-query result now, work out who entered/left.
// Hysteresis: a peer enters at HEAR_RADIUS but is only dropped past DROP_RADIUS, so people standing at
// the edge of earshot do not cause WebRTC connections to flap.
export function diffPeers(previous, neighbors, hearRadius = HEAR_RADIUS, dropRadius = hearRadius + HEAR_HYSTERESIS) {
  const next = new Set();
  for (const n of neighbors) {
    if (n.distance <= hearRadius || (previous.has(n.id) && n.distance <= dropRadius)) next.add(n.id);
  }
  const entered = [...next].filter((id) => !previous.has(id));
  const left = [...previous].filter((id) => !next.has(id));
  return { next, entered, left };
}

export class Metrics {
  constructor(size = 1000) { this.size = size; this.samples = []; }
  record(ms) { this.samples.push(ms); if (this.samples.length > this.size) this.samples.shift(); }
  summary() {
    const s = [...this.samples].sort((a, b) => a - b);
    const q = (p) => (s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : 0);
    return { count: s.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1] ?? 0 };
  }
}
