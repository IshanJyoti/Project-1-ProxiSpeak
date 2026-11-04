import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { config } from '../src/config.js';

function isPortOccupied(port) {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', (error) => {
      if (error.code === 'EADDRINUSE') resolve(true);
      else reject(error);
    });
    probe.listen(port, '::', () => {
      probe.close((error) => {
        if (error) reject(error);
        else resolve(false);
      });
    });
  });
}

async function isProxiSpeakApiRunning(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/healthz`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) return false;
    const health = await response.json();
    return health.status === 'ok' &&
      ['memory', 'mongo'].includes(health.store) &&
      typeof health.redis === 'boolean';
  } catch {
    return false;
  }
}

function waitForShutdown() {
  return new Promise((resolve) => {
    const keepAlive = setInterval(() => {}, 60_000);
    const stop = () => {
      clearInterval(keepAlive);
      process.off('SIGINT', stop);
      process.off('SIGTERM', stop);
      resolve();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
}

function runWatchedServer() {
  return new Promise((resolve, reject) => {
    const serverRoot = fileURLToPath(new URL('../', import.meta.url));
    const child = spawn(process.execPath, ['--watch-path=src', 'src/index.js'], {
      cwd: serverRoot,
      env: process.env,
      stdio: 'inherit',
    });
    let stopping = false;
    const forwardSignal = (signal) => {
      stopping = true;
      child.kill(signal);
    };
    const onSigint = () => forwardSignal('SIGINT');
    const onSigterm = () => forwardSignal('SIGTERM');
    process.once('SIGINT', onSigint);
    process.once('SIGTERM', onSigterm);
    child.once('error', (error) => {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      reject(error);
    });
    child.once('exit', (code) => {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      resolve(stopping ? 0 : (code ?? 1));
    });
  });
}

async function main() {
  if (await isPortOccupied(config.port)) {
    if (await isProxiSpeakApiRunning(config.port)) {
      console.log(`[server] reusing the ProxiSpeak API already running on :${config.port}`);
      await waitForShutdown();
      return 0;
    }
    throw new Error(`port ${config.port} is occupied by another service; stop it or set PORT to a free port`);
  }
  return runWatchedServer();
}

try {
  process.exitCode = await main();
} catch (error) {
  console.error(`[server] ${error.message}`);
  process.exitCode = 1;
}
