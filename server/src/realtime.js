import { config } from './config.js';
import { WORLD, HEAR_RADIUS, HEAR_HYSTERESIS, dist, validHearRadius } from '../../shared/geo.js';
import { SPAWN } from '../../shared/defaultLayout.js';
import { diffPeers, Metrics } from './proximity.js';

const ROOM_RE = /^[a-z0-9-]{1,48}$/i;
const ID_RE = /^[a-zA-Z0-9_-]{5,64}$/;
const COLOR_RE = /^#[0-9a-f]{6}$/i;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const num = (v) => typeof v === 'number' && Number.isFinite(v);

export function attachRealtime(io, { store, layouts }) {
  const metrics = new Metrics();
  const local = new Map();   // roomId -> Map<userId, { socketId, peers:Set<string> }>
  const hearRanges = new Map();
  const pending = new Map(); // roomId -> Map<userId, { id, x, y }>  (coalesced moves)
  let ticking = false;

  const localRoom = (roomId) => {
    if (!local.has(roomId)) local.set(roomId, new Map());
    return local.get(roomId);
  };
  const hearRadiusFor = (roomId) => hearRanges.get(roomId) ?? HEAR_RADIUS;

  async function runProximity(roomId, userId, x, y) {
    const entry = local.get(roomId)?.get(userId);
    if (!entry) return;
    const t0 = performance.now();
    const hearRadius = hearRadiusFor(roomId);
    const dropRadius = hearRadius + HEAR_HYSTERESIS;
    const neighbors = await store.near(roomId, x, y, dropRadius, userId); // MongoDB $near
    metrics.record(performance.now() - t0);
    const { next, entered, left } = diffPeers(entry.peers, neighbors, hearRadius, dropRadius);
    entry.peers = next;
    // Symmetric notifications; clients ignore duplicates. user:<id> rooms work across Node instances via the Redis adapter.
    for (const id of entered) {
      io.to(`user:${userId}`).emit('peer:enter', { id });
      io.to(`user:${id}`).emit('peer:enter', { id: userId });
    }
    for (const id of left) {
      io.to(`user:${userId}`).emit('peer:leave', { id });
      io.to(`user:${id}`).emit('peer:leave', { id: userId });
    }
  }

  async function applyHearRadius(roomId, hearRadius, broadcast = false) {
    hearRanges.set(roomId, hearRadius);
    if (broadcast) io.to(roomId).emit('audio:settings', { roomId, hearRadius });
    const users = local.get(roomId);
    if (!users) return;
    await Promise.all([...users.keys()].map(async (userId) => {
      const user = await store.get(roomId, userId);
      if (user) await runProximity(roomId, userId, user.x, user.y);
    }));
  }

  if (config.redisUrl) {
    io.on('audio:settings:update', ({ roomId, hearRadius } = {}) => {
      if (ROOM_RE.test(roomId ?? '') && validHearRadius(hearRadius)) {
        applyHearRadius(roomId, hearRadius).catch((err) => console.error('[audio:settings:update]', err));
      }
    });
  }

  async function setHearRadius(roomId, hearRadius) {
    await applyHearRadius(roomId, hearRadius, true);
    if (config.redisUrl) io.serverSideEmit('audio:settings:update', { roomId, hearRadius });
  }

  async function tick() {
    if (ticking) return;
    ticking = true;
    try {
      for (const [roomId, moves] of pending) {
        pending.delete(roomId);
        const list = [...moves.values()];
        await store.moveMany(roomId, list);
        io.to(roomId).emit('world:delta', { roomId, moves: list.map((m) => [m.id, m.x, m.y]) });
        await Promise.all(list.map((m) => runProximity(roomId, m.id, m.x, m.y)));
      }
    } catch (err) {
      console.error('[tick]', err);
    } finally {
      ticking = false;
    }
  }
  setInterval(tick, config.moveFlushMs).unref();

  setInterval(() => {
    for (const [roomId, users] of local) store.touch(roomId, [...users.keys()]).catch(() => {});
  }, config.heartbeatMs).unref();

  async function leave(socket) {
    const { roomId, userId } = socket.data;
    if (!roomId || !userId) return;
    socket.data.roomId = socket.data.userId = undefined;
    const room = local.get(roomId);
    const entry = room?.get(userId);
    if (!entry || entry.socketId !== socket.id) return;
    room.delete(userId);
    if (!room.size) local.delete(roomId);
    pending.get(roomId)?.delete(userId);
    for (const id of entry.peers) io.to(`user:${id}`).emit('peer:leave', { id: userId });
    await store.remove(roomId, userId).catch(() => {});
    io.to(roomId).emit('user:leave', { id: userId });
  }

  io.on('connection', (socket) => {
    socket.on('room:join', async (payload) => {
      try {
        const p = payload?.participant;
        if (!ROOM_RE.test(payload?.roomId ?? '') || !p || !ID_RE.test(p.id) || typeof p.displayName !== 'string' ||
            !p.displayName.trim() || p.displayName.trim().length > 32 || !COLOR_RE.test(p.color ?? '')) {
          return socket.emit('room:error', { message: 'Invalid room or participant details.' });
        }
        await leave(socket);
        const roomId = payload.roomId;
        const settings = await layouts.getAudioSettings?.(roomId);
        if (settings?.hearRadius) hearRanges.set(roomId, settings.hearRadius);
        if ((await store.count(roomId)) >= config.maxUsersPerRoom && !(await store.get(roomId, p.id))) {
          return socket.emit('room:error', { message: 'This room is full.' });
        }
        const user = {
          id: p.id, name: p.displayName.trim(), color: p.color,
          x: clamp(num(p.x) ? p.x : SPAWN.x, 0, WORLD.width),
          y: clamp(num(p.y) ? p.y : SPAWN.y, 0, WORLD.height),
        };
        await store.upsert(roomId, user);
        localRoom(roomId).set(user.id, { socketId: socket.id, peers: new Set() });
        Object.assign(socket.data, { roomId, userId: user.id, lastMoveAt: 0 });
        await socket.join([roomId, `user:${user.id}`]);
        socket.emit('layout:update', { roomId, obstacles: await layouts.get(roomId), hearRadius: hearRadiusFor(roomId) });
        socket.emit('world:snapshot', { roomId, you: user.id, users: await store.all(roomId) });
        socket.to(roomId).emit('user:join', user);
        await runProximity(roomId, user.id, user.x, user.y);
      } catch (err) {
        console.error('[room:join]', err);
        socket.emit('room:error', { message: 'Could not join the room.' });
      }
    });

    socket.on('avatar:move', (m) => {
      const { roomId, userId } = socket.data;
      if (!roomId || !userId || m?.roomId !== roomId || !num(m.x) || !num(m.y)) return;
      const now = Date.now();
      if (now - socket.data.lastMoveAt < 30) return; // per-socket rate limit (~30 Hz)
      socket.data.lastMoveAt = now;
      if (!pending.has(roomId)) pending.set(roomId, new Map());
      pending.get(roomId).set(userId, { id: userId, x: clamp(m.x, 0, WORLD.width), y: clamp(m.y, 0, WORLD.height) });
    });

    // WebRTC handshake relay, only allowed between avatars that are within earshot.
    socket.on('rtc:signal', async (s) => {
      try {
        const { roomId, userId } = socket.data;
        if (!roomId || !userId || s?.roomId !== roomId || !ID_RE.test(s.to ?? '') || !['offer', 'answer', 'ice'].includes(s.kind) ||
            !s.payload || typeof s.payload !== 'object' || JSON.stringify(s.payload).length > 40_000) return;
        const [a, b] = await Promise.all([store.get(roomId, userId), store.get(roomId, s.to)]);
        if (!a || !b || dist(a, b) > hearRadiusFor(roomId) + HEAR_HYSTERESIS) return;
        io.to(`user:${s.to}`).emit('rtc:signal', { roomId, to: s.to, from: userId, kind: s.kind, payload: s.payload });
      } catch (err) {
        console.error('[rtc:signal]', err);
      }
    });

    socket.on('presence:ping', () => {
      const { roomId, userId } = socket.data;
      if (roomId && userId) store.touch(roomId, [userId]).catch(() => {});
    });
    socket.on('room:leave', () => void leave(socket));
    socket.on('disconnect', () => void leave(socket));
  });

  return { metrics, hearRadius: HEAR_RADIUS, setHearRadius };
}
