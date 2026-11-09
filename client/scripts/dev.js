import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const apiHealthUrl = 'http://127.0.0.1:8080/api/healthz';
const startupTimeoutMs = 90_000;

async function waitForApi() {
  const deadline = Date.now() + startupTimeoutMs;
  console.log('[client] waiting for the API to become ready...');

  while (Date.now() < deadline) {
    try {
      const response = await fetch(apiHealthUrl, { signal: AbortSignal.timeout(1000) });
      if (response.ok) {
        const health = await response.json();
        if (health.status === 'ok' && ['memory', 'mongo'].includes(health.store)) return;
      }
    } catch {
      // The server is still starting or restarting.
    }
    await delay(500);
  }

  throw new Error(`API did not become ready within ${startupTimeoutMs / 1000} seconds. Start it with "npm run dev:server" and retry.`);
}

async function runVite() {
  const viteCli = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
  const vite = spawn(process.execPath, [viteCli], { stdio: 'inherit', env: process.env });
  let stopping = false;
  const stop = (signal) => {
    stopping = true;
    vite.kill(signal);
  };
  const onSigint = () => stop('SIGINT');
  const onSigterm = () => stop('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  try {
    return await new Promise((resolve, reject) => {
      vite.once('error', reject);
      vite.once('exit', (code) => resolve(stopping ? 0 : (code ?? 1)));
    });
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
}

try {
  await waitForApi();
  process.exitCode = await runVite();
} catch (error) {
  console.error(`[client] ${error.message}`);
  process.exitCode = 1;
}
