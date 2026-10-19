import { dist } from '../../../shared/geo.js';

// Same interface as MongoGeoStore. Used for dev without Mongo and for unit tests / benchmarks.
export class MemoryGeoStore {
  constructor() { this.rooms = new Map(); }
  kind = 'memory';
  async init() {}
  _room(roomId) {
    if (!this.rooms.has(roomId)) this.rooms.set(roomId, new Map());
    return this.rooms.get(roomId);
  }
  async upsert(roomId, user) { this._room(roomId).set(user.id, { ...user, avatarId: user.avatarId ?? 'initials' }); }
  async moveMany(roomId, moves) {
    const room = this._room(roomId);
    for (const m of moves) { const u = room.get(m.id); if (u) { u.x = m.x; u.y = m.y; } }
  }
  async updateVoiceStatus(roomId, id, muted) {
    const user = this._room(roomId).get(id);
    if (user) user.muted = muted;
  }
  async touch() {}
  async remove(roomId, id) { this._room(roomId).delete(id); }
  async get(roomId, id) { return this._room(roomId).get(id) ?? null; }
  async all(roomId) { return [...this._room(roomId).values()]; }
  async count(roomId) { return this._room(roomId).size; }
  // equivalent of { pos: { $near: [x, y], $maxDistance: r } }
  async near(roomId, x, y, radius, excludeId) {
    const out = [];
    for (const u of this._room(roomId).values()) {
      if (u.id === excludeId) continue;
      const d = dist(u, { x, y });
      if (d <= radius) out.push({ id: u.id, x: u.x, y: u.y, distance: d });
    }
    return out.sort((a, b) => a.distance - b.distance);
  }
  // equivalent of { pos: { $geoWithin: { $box: [[x1, y1], [x2, y2]] } } }
  async withinBox(roomId, x1, y1, x2, y2) {
    return [...this._room(roomId).values()].filter((u) => u.x >= x1 && u.x <= x2 && u.y >= y1 && u.y <= y2);
  }
  async close() {}
}
