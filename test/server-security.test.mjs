import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const guardedGetPaths = [
  '/api/data',
  '/api/summary',
  '/api/collectors',
  '/api/work-items',
  '/api/project-alias-rules',
  '/api/collect/status'
];

test('non-public GET APIs reject non-local Origin', async () => {
  const server = await startServer();
  try {
    for (const path of guardedGetPaths) {
      const response = await fetch(`http://127.0.0.1:${server.port}${path}`, {
        headers: { Origin: 'https://example.invalid' }
      });
      assert.equal(response.status, 403, `${path} should reject non-local Origin`);
    }
  } finally {
    await server.stop();
  }
});

test('loopback GET APIs allow missing or local Origin', async () => {
  const server = await startServer();
  try {
    const withoutOrigin = await fetch(`http://127.0.0.1:${server.port}/api/data`);
    assert.equal(withoutOrigin.status, 200);

    const withLocalOrigin = await fetch(`http://127.0.0.1:${server.port}/api/data`, {
      headers: { Origin: `http://127.0.0.1:${server.port}` }
    });
    assert.equal(withLocalOrigin.status, 200);
  } finally {
    await server.stop();
  }
});

test('non-loopback HOST is refused unless explicitly enabled', async () => {
  const denied = await runServerUntilExit({
    HOST: '0.0.0.0',
    TOKEN_STUDIO_ALLOW_REMOTE: '',
    INGEST_TOKEN: ''
  });
  assert.notEqual(denied.code, 0);
  assert.match(denied.output, /Refusing to listen on non-loopback host/);

  const missingToken = await runServerUntilExit({
    HOST: '0.0.0.0',
    TOKEN_STUDIO_ALLOW_REMOTE: '1',
    INGEST_TOKEN: ''
  });
  assert.notEqual(missingToken.code, 0);
  assert.match(missingToken.output, /INGEST_TOKEN/);
});

test('explicit remote ingest mode can bind while Dashboard APIs stay local-Origin guarded', async () => {
  const server = await startServer({
    HOST: '0.0.0.0',
    TOKEN_STUDIO_ALLOW_REMOTE: '1',
    INGEST_TOKEN: 'test-ingest-token'
  });
  try {
    const loopback = await fetch(`http://127.0.0.1:${server.port}/api/data`);
    assert.equal(loopback.status, 200);

    const badOrigin = await fetch(`http://127.0.0.1:${server.port}/api/data`, {
      headers: { Origin: 'https://example.invalid' }
    });
    assert.equal(badOrigin.status, 403);
  } finally {
    await server.stop();
  }
});

async function startServer(extraEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'token-studio-security-'));
  const port = 7600 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      HOST: '127.0.0.1',
      PORT: String(port),
      DB_PATH: join(dir, 'usage.sqlite'),
      SCHEDULED_COLLECT_ENABLED: 'false',
      ...extraEnv
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  let output = '';
  child.stdout.on('data', chunk => {
    output += chunk.toString();
  });
  child.stderr.on('data', chunk => {
    output += chunk.toString();
  });

  try {
    await waitForApi(port, child, () => output);
  } catch (error) {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
    throw error;
  }

  return {
    port,
    child,
    output: () => output,
    async stop() {
      child.kill();
      await new Promise(resolve => child.once('exit', resolve));
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

async function runServerUntilExit(extraEnv = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'token-studio-security-denied-'));
  const port = 8600 + Math.floor(Math.random() * 1000);
  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: join(dir, 'usage.sqlite'),
      SCHEDULED_COLLECT_ENABLED: 'false',
      ...extraEnv
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  let output = '';
  child.stdout.on('data', chunk => {
    output += chunk.toString();
  });
  child.stderr.on('data', chunk => {
    output += chunk.toString();
  });

  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`server did not exit; output=${output}`));
    }, 5000);
    child.once('exit', exitCode => {
      clearTimeout(timer);
      resolve(exitCode);
    });
  });

  rmSync(dir, { recursive: true, force: true });
  return { code, output };
}

async function waitForApi(port, child, getOutput) {
  const start = Date.now();
  while (Date.now() - start < 7000) {
    if (child.exitCode !== null) {
      throw new Error(`server exited early; output=${getOutput()}`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/data`);
      if (response.ok) return;
    } catch {
      // Retry while the server binds.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`server did not start; output=${getOutput()}`);
}
