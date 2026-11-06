import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { createRoomSettingsRouter } from '../src/roomSettings.js';

async function withSettingsApi(options, run) {
  const app = express();
  app.use(express.json());
  app.use(createRoomSettingsRouter(options));
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();

  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}

function makeSettings() {
  const saved = new Map();
  const active = [];
  return {
    saved,
    active,
    layouts: {
      getAudioSettings: async (roomId) => ({ hearRadius: saved.get(roomId) ?? 100 }),
      saveHearRadius: async (roomId, hearRadius) => saved.set(roomId, hearRadius),
    },
    setHearRadius: async (roomId, hearRadius) => active.push({ roomId, hearRadius }),
  };
}

test('GET room settings returns the room hearing radius', async () => {
  const state = makeSettings();
  state.saved.set('main-office', 250);

  await withSettingsApi(state, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/rooms/main-office/settings`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { roomId: 'main-office', hearRadius: 250 });
  });
});

test('PUT room settings saves and applies valid minimum and maximum radii', async () => {
  const state = makeSettings();

  await withSettingsApi(state, async (baseUrl) => {
    for (const hearRadius of [50, 500]) {
      const response = await fetch(`${baseUrl}/api/rooms/main-office/settings`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hearRadius }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { roomId: 'main-office', hearRadius });
    }
  });

  assert.equal(state.saved.get('main-office'), 500);
  assert.deepEqual(state.active, [
    { roomId: 'main-office', hearRadius: 50 },
    { roomId: 'main-office', hearRadius: 500 },
  ]);
});

test('PUT room settings rejects missing, non-integer, and out-of-range radii', async () => {
  const state = makeSettings();
  const invalidBodies = [{}, { hearRadius: 49 }, { hearRadius: 501 }, { hearRadius: 100.5 }, { hearRadius: '100' }];

  await withSettingsApi(state, async (baseUrl) => {
    for (const body of invalidBodies) {
      const response = await fetch(`${baseUrl}/api/rooms/main-office/settings`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), {
        error: 'hearRadius must be an integer from 50 to 500',
      });
    }
  });

  assert.equal(state.saved.size, 0);
  assert.deepEqual(state.active, []);
});

test('room settings reject invalid room ids', async () => {
  const state = makeSettings();

  await withSettingsApi(state, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/rooms/bad%20room/settings`);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'bad room id' });
  });
});

test('PUT room settings requires the configured admin token', async () => {
  const state = makeSettings();

  await withSettingsApi({ ...state, adminToken: 'secret' }, async (baseUrl) => {
    const url = `${baseUrl}/api/rooms/main-office/settings`;
    const unauthorized = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hearRadius: 200 }),
    });
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { error: 'unauthorized' });

    const authorized = await fetch(url, {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'x-admin-token': 'secret' },
      body: JSON.stringify({ hearRadius: 200 }),
    });
    assert.equal(authorized.status, 200);
    assert.deepEqual(await authorized.json(), { roomId: 'main-office', hearRadius: 200 });
  });

  assert.equal(state.saved.get('main-office'), 200);
  assert.deepEqual(state.active, [{ roomId: 'main-office', hearRadius: 200 }]);
});
