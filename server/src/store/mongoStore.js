import { MongoClient } from 'mongodb';
import { config } from '../config.js';

// Presence documents use the legacy flat "2d" geospatial index, because avatar coordinates are
// pixels on a plane, not longitude/latitude. $near / $geoWithin work on it with plain x/y distances.
export class MongoGeoStore {
  kind = 'mongo';
  async init() {
    this.client = new MongoClient(config.mongoUrl, { maxPoolSize: 20 });
    await this.client.connect();
    this.db = this.client.db(config.mongoDb);
    this.presence = this.db.collection('presence');
    this.layouts = this.db.collection('layouts');
    await this.presence.createIndex({ pos: '2d', roomId: 1 }, { min: -10, max: 2000 });
    await this.presence.createIndex({ roomId: 1, userId: 1 }, { unique: true });
    await this.presence.createIndex({ updatedAt: 1 }, { expireAfterSeconds: config.presenceTtlSeconds });
  }
  _toUser(d) { return { id: d.userId, name: d.name, color: d.color, avatarId: d.avatarId ?? 'initials', x: d.pos[0], y: d.pos[1] }; }
  async upsert(roomId, u) {
    await this.presence.updateOne(
      { roomId, userId: u.id },
      { $set: { name: u.name, color: u.color, avatarId: u.avatarId ?? 'initials', pos: [u.x, u.y], updatedAt: new Date() } },
      { upsert: true },
    );
  }
  async moveMany(roomId, moves) {
    if (!moves.length) return;
    const now = new Date();
    await this.presence.bulkWrite(
      moves.map((m) => ({ updateOne: { filter: { roomId, userId: m.id }, update: { $set: { pos: [m.x, m.y], updatedAt: now } } } })),
      { ordered: false },
    );
  }
  async touch(roomId, ids) {
    if (ids.length) await this.presence.updateMany({ roomId, userId: { $in: ids } }, { $set: { updatedAt: new Date() } });
  }
  async remove(roomId, id) { await this.presence.deleteOne({ roomId, userId: id }); }
  async get(roomId, id) {
    const d = await this.presence.findOne({ roomId, userId: id });
    return d ? this._toUser(d) : null;
  }
  async all(roomId) { return (await this.presence.find({ roomId }).toArray()).map((d) => this._toUser(d)); }
  async count(roomId) { return this.presence.countDocuments({ roomId }); }
  async clearStalePresence(ttlSeconds) {
    await this.presence.deleteMany({ updatedAt: { $lt: new Date(Date.now() - ttlSeconds * 1000) } });
  }
  async near(roomId, x, y, radius, excludeId) {
    const docs = await this.presence
      .find({ roomId, pos: { $near: [x, y], $maxDistance: radius } })
      .limit(200)
      .toArray(); // $near returns results sorted by distance
    return docs
      .filter((d) => d.userId !== excludeId)
      .map((d) => ({ id: d.userId, x: d.pos[0], y: d.pos[1], distance: Math.hypot(d.pos[0] - x, d.pos[1] - y) }));
  }
  async withinBox(roomId, x1, y1, x2, y2) {
    const docs = await this.presence.find({ roomId, pos: { $geoWithin: { $box: [[x1, y1], [x2, y2]] } } }).toArray();
    return docs.map((d) => this._toUser(d));
  }
  async getLayout(roomId) { return (await this.layouts.findOne({ _id: roomId }))?.obstacles ?? null; }
  async saveLayout(roomId, obstacles) {
    await this.layouts.updateOne({ _id: roomId }, { $set: { obstacles, updatedAt: new Date() } }, { upsert: true });
  }
  async getRoomSettings(roomId) {
    const doc = await this.layouts.findOne({ _id: roomId }, { projection: { hearRadius: 1 } });
    return { hearRadius: doc?.hearRadius };
  }
  async saveRoomSettings(roomId, settings) {
    await this.layouts.updateOne({ _id: roomId }, { $set: { ...settings, updatedAt: new Date() } }, { upsert: true });
  }
  async close() { await this.client?.close(); }
}
