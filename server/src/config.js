import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const envPath = fileURLToPath(new URL('../../.env', import.meta.url));
if (existsSync(envPath)) process.loadEnvFile(envPath);

export const config = {
  port: Number(process.env.PORT || 8080),
  mongoUrl: process.env.MONGO_URL || '',          // empty -> in-memory geo store (dev only)
  mongoDb: process.env.MONGO_DB || 'proxispeak',
  redisUrl: process.env.REDIS_URL || '',          // empty -> single-node Socket.io
  adminToken: process.env.ADMIN_TOKEN || '',      // protects PUT /layout when set
  moveFlushMs: 50,                                // coalesce avatar moves, flush to geo store
  heartbeatMs: 30_000,
  presenceTtlSeconds: 120,
  maxUsersPerRoom: 200,
  dataDir: process.env.DATA_DIR || new URL('../data/', import.meta.url).pathname,
};
