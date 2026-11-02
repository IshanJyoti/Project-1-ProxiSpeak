import test from 'node:test';
import assert from 'node:assert/strict';
import { createLayoutStore } from '../src/layoutStore.js';

test('layout settings migrate the previous default hearing radius to 100px', async () => {
  const layouts = createLayoutStore({
    getRoomSettings: async () => ({ hearRadius: 140 }),
  });

  assert.deepEqual(await layouts.getAudioSettings('main-office'), { hearRadius: 100 });
});

test('layout settings preserve explicitly configured hearing radii', async () => {
  const layouts = createLayoutStore({
    getRoomSettings: async () => ({ hearRadius: 250 }),
  });

  assert.deepEqual(await layouts.getAudioSettings('main-office'), { hearRadius: 250 });
});
