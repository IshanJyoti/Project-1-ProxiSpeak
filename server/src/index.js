import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { config } from './config.js';
import { MemoryGeoStore } from './store/memoryStore.js';
import { createLayoutStore } from './layoutStore.js';
import { attachRealtime } from './realtime.js';
import { clusters, validObstacle, HEAR_RADIUS_MIN, HEAR_RADIUS_MAX, validHearRadius } from '../../shared/geo.js';

const store = config.mongoUrl ? new (await import('./store/mongoStore.js')).MongoGeoStore() : new MemoryGeoStore();
await store.init();
if (!config.redisUrl && store.clearStalePresence) {
  await store.clearStalePresence(config.presenceTtlSeconds);
  console.log('[store] cleared expired presence for single-node startup');
}
if (store.kind === 'memory') console.warn('[store] MONGO_URL not set -> in-memory geo store (single node, dev only)');
const layouts = createLayoutStore(store);

const app = express();
app.use(cors());
app.use(express.json({ limit: '256kb' }));
const httpServer = createServer(app);
const io = new Server(httpServer, { path: '/api/socket.io', cors: { origin: true }, transports: ['websocket', 'polling'] });

if (config.redisUrl) {
  // Redis Pub/Sub adapter: lets several Node instances share rooms, user:<id> channels and broadcasts.
  const [{ default: Redis }, { createAdapter }] = await Promise.all([import('ioredis'), import('@socket.io/redis-adapter')]);
  const pub = new Redis(config.redisUrl);
  const sub = pub.duplicate();
  io.adapter(createAdapter(pub, sub));
  console.log('[redis] Socket.io Redis adapter enabled');
}

const { metrics, setHearRadius } = attachRealtime(io, { store, layouts });
const ROOM_RE = /^[a-z0-9-]{1,48}$/i;
const roomParam = (req, res) => (ROOM_RE.test(req.params.roomId) ? req.params.roomId : (res.status(400).json({ error: 'bad room id' }), null));

app.get('/api/healthz', (_req, res) => res.json({ status: 'ok', store: store.kind, redis: Boolean(config.redisUrl) }));
app.get('/api/metrics', (_req, res) => res.json({ proximityQueryMs: metrics.summary(), store: store.kind }));

app.get('/api/rooms/:roomId/presence', async (req, res) => {
  const roomId = roomParam(req, res); if (!roomId) return;
  const users = await store.all(roomId);
  res.json({ roomId, participants: users.map((u) => ({ id: u.id, displayName: u.name, x: u.x, y: u.y, color: u.color, avatarId: u.avatarId })) });
});

// Proximity clusters = groups of avatars that can hear each other (connected components within earshot).
app.get('/api/rooms/:roomId/clusters', async (req, res) => {
  const roomId = roomParam(req, res); if (!roomId) return;
  const { hearRadius } = await layouts.getAudioSettings(roomId);
  res.json({ roomId, radius: hearRadius, clusters: clusters(await store.all(roomId), hearRadius) });
});

app.get('/api/rooms/:roomId/settings', async (req, res) => {
  const roomId = roomParam(req, res); if (!roomId) return;
  res.json({ roomId, ...(await layouts.getAudioSettings(roomId)) });
});

app.put('/api/rooms/:roomId/settings', async (req, res) => {
  const roomId = roomParam(req, res); if (!roomId) return;
  if (config.adminToken && req.get('x-admin-token') !== config.adminToken) return res.status(401).json({ error: 'unauthorized' });
  const { hearRadius } = req.body ?? {};
  if (!validHearRadius(hearRadius)) {
    return res.status(400).json({ error: `hearRadius must be an integer from ${HEAR_RADIUS_MIN} to ${HEAR_RADIUS_MAX}` });
  }
  await layouts.saveHearRadius(roomId, hearRadius);
  await setHearRadius(roomId, hearRadius);
  res.json({ roomId, hearRadius });
});

// $geoWithin demo: who is inside a rectangular area (e.g. a meeting room)?
app.get('/api/rooms/:roomId/area', async (req, res) => {
  const roomId = roomParam(req, res); if (!roomId) return;
  const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((k) => Number(req.query[k]));
  if ([x1, y1, x2, y2].some((v) => !Number.isFinite(v))) return res.status(400).json({ error: 'x1,y1,x2,y2 required' });
  res.json({ roomId, users: await store.withinBox(roomId, x1, y1, x2, y2) });
});

app.get('/api/rooms/:roomId/layout', async (req, res) => {
  const roomId = roomParam(req, res); if (!roomId) return;
  res.json({ roomId, obstacles: await layouts.get(roomId) });
});

app.put('/api/rooms/:roomId/layout', async (req, res) => {
  const roomId = roomParam(req, res); if (!roomId) return;
  if (config.adminToken && req.get('x-admin-token') !== config.adminToken) return res.status(401).json({ error: 'unauthorized' });
  const obstacles = req.body?.obstacles;
  if (!Array.isArray(obstacles) || obstacles.length > 500 || !obstacles.every(validObstacle)) {
    return res.status(400).json({ error: 'obstacles must be an array (max 500) of {x,y,w,h,transmit?} inside the world' });
  }
  const clean = obstacles.map(({ x, y, w, h, kind, transmit }) => ({ x, y, w, h, kind: String(kind ?? 'wall').slice(0, 16), transmit: transmit ?? 0.2 }));
  await layouts.save(roomId, clean);
  io.to(roomId).emit('layout:update', { roomId, obstacles: clean });
  res.json({ roomId, obstacles: clean });
});

httpServer.listen(config.port, () => console.log(`[server] listening on :${config.port}`));
const shutdown = async () => { io.close(); await store.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
