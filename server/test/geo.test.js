import test from 'node:test';
import assert from 'node:assert/strict';
import { segmentHitsRect, occlusion, attenuation, pan, clusters, validObstacle, validHearRadius, HEAR_RADIUS } from '../../shared/geo.js';
import { defaultObstacles } from '../../shared/defaultLayout.js';
import { MemoryGeoStore } from '../src/store/memoryStore.js';
import { diffPeers, Metrics } from '../src/proximity.js';

test('segment/rect intersection', () => {
  const wall = { x: 50, y: 0, w: 10, h: 100 };
  assert.equal(segmentHitsRect(0, 50, 100, 50, wall), true);
  assert.equal(segmentHitsRect(0, 50, 40, 50, wall), false);
  assert.equal(segmentHitsRect(0, 150, 100, 150, wall), false);
  assert.equal(segmentHitsRect(0, 0, 100, 100, wall), true);
});

test('occlusion multiplies transmit of each obstacle crossed', () => {
  const a = { x: 0, y: 50 }, b = { x: 100, y: 50 };
  assert.equal(occlusion(a, b, []), 1);
  const walls = [{ x: 30, y: 0, w: 5, h: 100, transmit: 0.5 }, { x: 60, y: 0, w: 5, h: 100, transmit: 0.5 }];
  assert.equal(occlusion(a, b, walls), 0.25);
});

test('attenuation falls off with distance and occlusion', () => {
  assert.equal(attenuation(0), 1);
  assert.equal(attenuation(HEAR_RADIUS), 0);
  assert.ok(attenuation(40) > attenuation(80));
  assert.ok(attenuation(60, 0.1) < attenuation(60, 1));
});

test('pan is signed and clamped', () => {
  assert.ok(pan(50) > 0 && pan(-50) < 0);
  assert.equal(pan(10_000), 1);
});

test('clusters group transitive neighbours', () => {
  const users = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 100, y: 0 }, { id: 'c', x: 200, y: 0 }, { id: 'd', x: 900, y: 500 }];
  const groups = clusters(users, 120).map((g) => g.sort());
  assert.deepEqual(groups.find((g) => g.includes('a')), ['a', 'b', 'c']);
  assert.deepEqual(groups.find((g) => g.includes('d')), ['d']);
});

test('default layout is valid and the office wall blocks sound', () => {
  assert.ok(defaultObstacles.every(validObstacle));
  const inOffice = { x: 330, y: 100 }; // inside first private office, in front of a solid wall segment
  const outside = { x: 330, y: 300 };  // open area just below it
  assert.ok(occlusion(inOffice, outside, defaultObstacles) < 0.2);
  const sameRoom = { x: 380, y: 300 }, nearby = { x: 450, y: 300 };
  assert.equal(occlusion(sameRoom, nearby, defaultObstacles), 1);
});

test('memory store near() is sorted, radius-limited and excludes self', async () => {
  const s = new MemoryGeoStore();
  for (const [id, x, y] of [['u1', 100, 100], ['u2', 130, 100], ['u3', 300, 100], ['u4', 110, 100]]) await s.upsert('r', { id, name: id, color: '#000000', x, y });
  const res = await s.near('r', 100, 100, 100, 'u1');
  assert.deepEqual(res.map((r) => r.id), ['u4', 'u2']);
  assert.equal((await s.withinBox('r', 0, 0, 120, 120)).length, 2);
});

test('diffPeers applies hysteresis', () => {
  const near = (id, distance) => ({ id, distance });
  let r = diffPeers(new Set(), [near('a', 100), near('b', 160)]);
  assert.deepEqual(r.entered, ['a']);            // b is outside HEAR_RADIUS, not entered
  r = diffPeers(new Set(['a', 'b']), [near('a', 160), near('b', 175)]);
  assert.deepEqual(r.left, ['b']);               // a kept (<= DROP_RADIUS), b dropped
  assert.deepEqual([...r.next], ['a']);
});

test('listening range can be changed while preserving hysteresis', () => {
  const near = (id, distance) => ({ id, distance });
  assert.equal(validHearRadius(50), true);
  assert.equal(validHearRadius(500), true);
  assert.equal(validHearRadius(45), false);
  assert.equal(validHearRadius(501), false);
  assert.equal(validHearRadius(140.5), false);

  const first = diffPeers(new Set(), [near('a', 200)], 250, 280);
  assert.deepEqual(first.entered, ['a']);
  const held = diffPeers(first.next, [near('a', 270)], 250, 280);
  assert.deepEqual([...held.next], ['a']);
  const dropped = diffPeers(held.next, [near('a', 281)], 250, 280);
  assert.deepEqual(dropped.left, ['a']);
});

test('metrics percentiles', () => {
  const m = new Metrics();
  for (let i = 1; i <= 100; i++) m.record(i);
  assert.equal(m.summary().p50, 51);
  assert.ok(m.summary().p95 >= 95);
});
