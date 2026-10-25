import test from 'node:test';
import assert from 'node:assert/strict';
import { attachRealtime } from '../src/realtime.js';
import { MemoryGeoStore } from '../src/store/memoryStore.js';

// Minimal fake Socket.io server/socket so the orchestration logic runs without any network.
function makeIo() {
  const log = [];
  const handlers = {};
  const io = {
    log,
    on: (ev, cb) => { handlers[ev] = cb; },
    to: (room) => ({ emit: (ev, data) => log.push({ room, ev, data }) }),
  };
  let n = 0;
  io.connect = () => {
    const sock = { id: `s${++n}`, data: {}, h: {}, out: [] };
    sock.on = (ev, cb) => { sock.h[ev] = cb; };
    sock.emit = (ev, data) => sock.out.push({ ev, data });
    sock.join = async () => {};
    sock.to = (room) => ({ emit: (ev, data) => log.push({ room, ev, data, from: sock.id }) });
    handlers.connection(sock);
    return sock;
  };
  return io;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const join = (sock, id, x, y, avatarId) => sock.h['room:join']({ roomId: 'main-office', participant: { id, displayName: id, color: '#aabbcc', x, y, avatarId } });
const move = (sock, x, y) => sock.h['avatar:move']({ roomId: 'main-office', x, y });
const events = (io, ev) => io.log.filter((l) => l.ev === ev);

test('server pairs avatars that walk into earshot and drops them with hysteresis', async () => {
  const io = makeIo();
  attachRealtime(io, { store: new MemoryGeoStore(), layouts: { get: async () => [] } });
  const a = io.connect();
  const b = io.connect();
  await join(a, 'user-a', 100, 300);
  await join(b, 'user-b', 600, 300); // far away
  assert.equal(events(io, 'peer:enter').length, 0);
  assert.ok(a.out.some((o) => o.ev === 'world:snapshot'));

  move(b, 200, 300); // 100px away -> inside HEAR_RADIUS
  await sleep(120);
  const enters = events(io, 'peer:enter');
  assert.ok(enters.some((e) => e.room === 'user:user-b' && e.data.id === 'user-a'));
  assert.ok(enters.some((e) => e.room === 'user:user-a' && e.data.id === 'user-b'));

  // signalling allowed while in range
  await a.h['rtc:signal']({ roomId: 'main-office', to: 'user-b', kind: 'offer', payload: { sdp: 'x' } });
  assert.equal(events(io, 'rtc:signal').length, 1);

  move(b, 100 + 120, 300); // 120px: past HEAR but within DROP -> still connected
  await sleep(120);
  assert.equal(events(io, 'peer:leave').length, 0);

  move(b, 100 + 140, 300); // 140px: beyond DROP_RADIUS
  await sleep(120);
  assert.ok(events(io, 'peer:leave').some((e) => e.room === 'user:user-a'));

  // signalling refused when out of range
  await a.h['rtc:signal']({ roomId: 'main-office', to: 'user-b', kind: 'offer', payload: { sdp: 'y' } });
  assert.equal(events(io, 'rtc:signal').length, 1);
});

test('leaving removes the avatar and notifies the room', async () => {
  const io = makeIo();
  const store = new MemoryGeoStore();
  attachRealtime(io, { store, layouts: { get: async () => [] } });
  const a = io.connect();
  await join(a, 'user-a', 100, 300);
  assert.equal(await store.count('main-office'), 1);
  a.h['disconnect']();
  await sleep(20);
  assert.equal(await store.count('main-office'), 0);
  assert.equal(events(io, 'user:leave').length, 1);
});

test('invalid join payloads are rejected', async () => {
  const io = makeIo();
  attachRealtime(io, { store: new MemoryGeoStore(), layouts: { get: async () => [] } });
  const a = io.connect();
  await a.h['room:join']({ roomId: 'main-office', participant: { id: 'x', displayName: '', color: 'red' } });
  assert.ok(a.out.some((o) => o.ev === 'room:error'));
});

test('selected avatars are shared with room members and restored in snapshots', async () => {
  const io = makeIo();
  const store = new MemoryGeoStore();
  attachRealtime(io, { store, layouts: { get: async () => [] } });
  const a = io.connect();
  const b = io.connect();

  await join(a, 'user-a', 100, 300, 'aman');
  assert.equal((await store.get('main-office', 'user-a')).avatarId, 'aman');
  assert.ok(events(io, 'user:join').some((event) => event.data.id === 'user-a' && event.data.avatarId === 'aman'));

  await join(b, 'user-b', 500, 300, 'fox');
  const snapshot = b.out.find((event) => event.ev === 'world:snapshot');
  assert.equal(snapshot.data.users.find((user) => user.id === 'user-a').avatarId, 'aman');
});

test('microphone mute state is shared and restored in room snapshots', async () => {
  const io = makeIo();
  const store = new MemoryGeoStore();
  attachRealtime(io, { store, layouts: { get: async () => [] } });
  const a = io.connect();
  const b = io.connect();

  await join(a, 'user-a', 100, 300);
  assert.equal((await store.get('main-office', 'user-a')).muted, true);
  await a.h['voice:status']({ muted: false });
  assert.equal((await store.get('main-office', 'user-a')).muted, false);
  assert.ok(events(io, 'voice:status').some((event) => event.data.id === 'user-a' && event.data.muted === false));

  await join(b, 'user-b', 500, 300);
  const snapshot = b.out.find((event) => event.ev === 'world:snapshot');
  assert.equal(snapshot.data.users.find((user) => user.id === 'user-a').muted, false);
});

test('server rejects unknown avatar selections', async () => {
  const io = makeIo();
  attachRealtime(io, { store: new MemoryGeoStore(), layouts: { get: async () => [] } });
  const a = io.connect();
  await join(a, 'user-a', 100, 300, 'untrusted-image-url');
  assert.ok(a.out.some((o) => o.ev === 'room:error'));
});

test('changing the room hearing range updates active peer connections', async () => {
  const io = makeIo();
  const realtime = attachRealtime(io, { store: new MemoryGeoStore(), layouts: { get: async () => [] } });
  const a = io.connect();
  const b = io.connect();
  await join(a, 'user-a', 100, 300);
  await join(b, 'user-b', 300, 300);
  assert.equal(events(io, 'peer:enter').length, 0);

  await realtime.setHearRadius('main-office', 250);
  assert.ok(events(io, 'peer:enter').some((e) => e.room === 'user:user-a' && e.data.id === 'user-b'));
  assert.ok(events(io, 'audio:settings').some((event) => event.data.hearRadius === 250));

  move(b, 390, 300); // beyond the updated drop radius
  await sleep(120);
  assert.ok(events(io, 'peer:leave').some((e) => e.room === 'user:user-a' && e.data.id === 'user-b'));
});
