// Mid-project "Spatial Audit": proves proximity queries for 50+ users complete in < 20 ms.
//   node scripts/bench-spatial.js                       (in-memory store)
//   MONGO_URL=mongodb://localhost:27017 node scripts/bench-spatial.js   (real MongoDB $near)
import { MemoryGeoStore } from '../src/store/memoryStore.js';
import { DROP_RADIUS, WORLD } from '../../shared/geo.js';

const USERS = Number(process.env.USERS || 50);
const QUERIES = Number(process.env.QUERIES || 2000);
const store = process.env.MONGO_URL ? new (await import('../src/store/mongoStore.js')).MongoGeoStore() : new MemoryGeoStore();
await store.init();
const room = `bench-${Date.now()}`;
const rnd = (n) => Math.random() * n;
for (let i = 0; i < USERS; i++) await store.upsert(room, { id: `user-${i}`, name: `U${i}`, color: '#aabbcc', x: rnd(WORLD.width), y: rnd(WORLD.height) });

const times = [];
for (let i = 0; i < QUERIES; i++) {
  const u = `user-${i % USERS}`;
  const me = await store.get(room, u);
  const t0 = performance.now();
  await store.near(room, me.x, me.y, DROP_RADIUS, u);
  times.push(performance.now() - t0);
}
times.sort((a, b) => a - b);
const q = (p) => times[Math.floor(p * times.length)].toFixed(3);
console.log(`store=${store.kind} users=${USERS} queries=${QUERIES}`);
console.log(`p50=${q(0.5)}ms p95=${q(0.95)}ms p99=${q(0.99)}ms max=${times.at(-1).toFixed(3)}ms`);
const ok = times[Math.floor(0.95 * times.length)] < 20;
console.log(ok ? 'PASS: p95 < 20 ms' : 'FAIL: p95 >= 20 ms');
if (store.presence) await store.presence.deleteMany({ roomId: room });
await store.close();
process.exit(ok ? 0 : 1);
