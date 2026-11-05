import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLD } from '../../shared/geo.js';
import { AVATAR_RADIUS, createWorld, stepSelf } from '../../client/src/world/world.js';

test('keyboard movement is frame-rate independent across cardinal and diagonal directions', () => {
  const cardinal = createWorld();
  cardinal.keys.add('d');
  assert.equal(stepSelf(cardinal, 0.5), true);
  assert.equal(cardinal.self.x, 200 + 95);
  assert.equal(cardinal.self.y, 300 * (WORLD.height / 540));

  const diagonal = createWorld();
  diagonal.keys.add('d');
  diagonal.keys.add('s');
  assert.equal(stepSelf(diagonal, 0.5), true);
  assert.ok(Math.abs(Math.hypot(diagonal.self.x - 200, diagonal.self.y - 300 * (WORLD.height / 540)) - 95) < 1e-10);
});

test('sprint increases movement speed by the expected factor', () => {
  const world = createWorld();
  world.keys.add('d');
  world.keys.add('shift');

  assert.equal(stepSelf(world, 0.5), true);
  assert.equal(world.self.x, 200 + 95 * 1.8);
});

test('movement stays within world bounds and slides along obstacles', () => {
  const bounded = createWorld();
  bounded.self.x = WORLD.width - AVATAR_RADIUS - 2;
  bounded.keys.add('d');
  assert.equal(stepSelf(bounded, 0.1), true);
  assert.equal(bounded.self.x, WORLD.width - AVATAR_RADIUS);

  const sliding = createWorld();
  sliding.self = { x: 50, y: 50 };
  sliding.obstacles = [{ x: 60, y: 40, w: 20, h: 100 }];
  sliding.keys.add('d');
  sliding.keys.add('s');
  assert.equal(stepSelf(sliding, 0.1), true);
  assert.equal(sliding.self.x, 50);
  assert.ok(sliding.self.y > 50);
});

test('click-to-walk reaches its target and clears it', () => {
  const world = createWorld();
  world.self = { x: 100, y: 100 };
  world.target = { x: 140, y: 100 };

  assert.equal(stepSelf(world, 0.1), true);
  assert.equal(world.self.x, 119);
  assert.equal(world.self.y, 100);
  assert.deepEqual(world.target, { x: 140, y: 100 });

  world.self.x = 138;
  assert.equal(stepSelf(world, 0.1), false);
  assert.equal(world.target, null);
});
