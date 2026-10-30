# ProxiSpeak - Geospatial Proximity Audio Ecosystem

A 2D virtual office (your `room.png` floor plan) where voice volume depends on how close avatars are.
Walk toward a group and their WebRTC audio fades in; walls and furniture muffle it.

## Local setup

### Requirements

- Node.js 20.6 or newer and npm.
- Docker Desktop only if you want to run MongoDB and Redis locally.

### Quick start (in-memory, no Docker required)

From the project root, install the server and client dependencies:

```bash
npm run install:all
```

Start both the API server and the Vite client:

```bash
npm run dev
```

Open <http://localhost:5173>. The API listens on <http://localhost:8080>; Vite forwards
`/api` requests to it. Press Ctrl+C in the terminal to stop both processes.

The app runs without a database using an in-memory store. This is suitable for local
development, but presence and saved room layouts will not persist when the server restarts.

### Optional: persistent local MongoDB and Redis

Start the local services with Docker:

```bash
docker compose up -d
```

In the project root, create `.env` and add:

```dotenv
MONGO_URL=mongodb://localhost:27017
MONGO_DB=proxispeak
REDIS_URL=redis://localhost:6379
```

Restart the server after changing `.env`. The server loads this root-level file automatically.
Keep `.env` private; it is gitignored. To use MongoDB Atlas instead, set `MONGO_URL` to your
Atlas connection URI and retain `MONGO_DB=proxispeak`. Redis is optional; without it,
Socket.io runs as a single server instance.

On Windows PowerShell, create the file with `New-Item .env -ItemType File` and edit it in
VS Code. If you prefer separate terminals, run `npm run dev:server` in one and
`npm run dev:client` in the other instead of `npm run dev`.

### Try the app

Open the client in two separate browser profiles (for example, a regular window and a private window), use different names, join with the microphone, and walk the avatars together.
Use headphones, otherwise you will hear echo. Browsers allow the microphone on `localhost` or HTTPS only.
If Edge blocks microphone access, allow Microphone in the site permissions beside the address bar. You can join in listen-only mode and retry from Quick controls.
Each browser profile can have one active ProxiSpeak tab per participant; opening a second tab for that same participant signs out the first tab to prevent duplicate avatars and self-audio loops.
Refreshing an active tab restores your name and last office position. The session resumes in listen-only mode; enable the microphone again from Quick controls.
Before joining, choose an avatar from the gallery; the selected avatar is shared with everyone in the room. Aman’s photo is served from `client/public/avatars/aman-avatar.png`.
For reliable voice between friends on different networks, configure a reachable TURN server using `VITE_ICE_SERVERS` as shown in `.env.example`; STUN alone cannot traverse every firewall or carrier network. Microphone permission must also be allowed separately by each browser and operating system.

Without `MONGO_URL` / `REDIS_URL` the server falls back to an in-memory geo store and single-node Socket.io (dev only).
When MongoDB is used without Redis, startup clears presence records older than the configured presence TTL.

### Scale-out check (Week 3)
```bash
PORT=8080 npm run dev:server &  PORT=8081 npm --prefix server start &
```
Both nodes share rooms through the Redis adapter, so two users connected to different nodes still get `peer:enter`
and can complete the WebRTC handshake. (Point a second client at :8081 by changing the proxy target in `client/vite.config.js`.)

## Architecture mapped to the brief

| Module | Where |
|---|---|
| Geospatial engine (`$near`, `$geoWithin`) | `server/src/store/mongoStore.js` - flat `2d` index on `pos`, `$near` + `$maxDistance`, `$geoWithin $box` (`GET /api/rooms/:id/area`) |
| Proximity clusters | `shared/geo.js#clusters`, `GET /api/rooms/:id/clusters` |
| Signaling server (Socket.io) | `server/src/realtime.js` - join/move, `peer:enter`/`peer:leave`, `rtc:signal` relay gated by distance |
| Redis Pub/Sub scaling | `server/src/index.js` (`@socket.io/redis-adapter`); per-user rooms `user:<id>` work across nodes |
| Spatial audio mixer (Web Audio) | `client/src/audio/SpatialMixer.js` - Gain (distance x occlusion) -> StereoPanner (left/right ear) |
| WebRTC mesh | `client/src/rtc/PeerManager.js` - one connection per avatar in earshot, lower id offers, ICE queueing, hysteresis |
| 2D world (React + Canvas) | `client/src/world/WorldCanvas.jsx` - rAF loop, interpolation, FPS meter in the top bar |
| Obstacles that block sound | `shared/defaultLayout.js` (traced from `room.png`) + `shared/geo.js#occlusion` (segment vs rectangle) |
| Room persistence | `GET/PUT /api/rooms/:id/layout` -> Mongo `layouts` collection (JSON file fallback); live `layout:update` broadcast |

### How it behaves
* Earshot defaults to **100 px**, with a **30 px** hysteresis margin. In the app, adjust **Listening distance**
  (50-500 px) in the **Within earshot** panel and save it. The room-wide range is stored with the MongoDB
  layout settings and applied to proximity queries and spatial audio. The defaults are in `shared/geo.js`.
* Volume: `attenuation()` = quadratic drop-off to 0 at the configured hearing radius (100 px by default), multiplied by the occlusion factor of each wall (0.12) or furniture piece (0.6) crossing the line between the two avatars.
* Moves are coalesced and flushed to Mongo every 50 ms (`bulkWrite`), then one `$near` per mover; deltas are broadcast at 20 Hz.
* Select **Show layout** or press **O** in the client to see the obstacle overlay.

### Edit the layout (Week 4)
```bash
curl -X PUT localhost:8080/api/rooms/main-office/layout -H 'content-type: application/json' -H 'x-admin-token: change-me' \
  -d '{"obstacles":[{"x":400,"y":200,"w":10,"h":120,"kind":"wall","transmit":0.12}]}'
```
(`x-admin-token` is only checked when `ADMIN_TOKEN` is set. Connected clients update instantly.)

## Review checklist
* **Spatial audit (<20 ms):** `npm run bench` (add `MONGO_URL=...` to measure real `$near`; `USERS=500` for a stress run). Live numbers: `GET /api/metrics`.
* **Audio check:** two browsers, join, walk together, confirm voice; walk apart, confirm fade; put a wall between you, confirm muffling.
* **Tests:** `npm test` - geometry, occlusion, hysteresis, store queries, and the full join/move/pair/signal-gating flow against a fake Socket.io.
