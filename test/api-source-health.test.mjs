import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { openDb, recordRun, upsertSession, upsertTokenEvent } from '../src/db.mjs';

test('source health API returns safe coverage metadata', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'token-studio-source-health-api-'));
  const dbPath = join(dir, 'usage.sqlite');
  const port = 6400 + Math.floor(Math.random() * 1000);
  seedDb(dbPath);

  const child = spawn(process.execPath, ['src/server.mjs'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: dbPath,
      SCHEDULED_COLLECT_ENABLED: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  try {
    await waitForApi(port);
    const health = await getJson(port, '/api/source-health');
    const codex = health.sources.find(row => row.id === 'codex');
    assert.equal(codex.health, 'has-data');
    assert.equal(codex.sessions, 1);
    assert.equal(codex.readsConversationContent, false);

    const ccusage = health.sources.find(row => row.id === 'ccusage');
    assert.equal(ccusage.coverageTier, 'ccusage import-bridge');
    assert.equal(ccusage.tokenEvents, 1);
    assert.match(ccusage.commandHint, /npx token-studio import-usage/);
    assert.doesNotMatch(JSON.stringify(health), /C:\\\\Users|prompt|response|transcript|diff/);

    const data = await getJson(port, '/api/data');
    assert.ok(data.meta.sourceHealth.some(row => row.id === 'codex'));
  } finally {
    await stopChild(child);
    rmSync(dir, { recursive: true, force: true });
  }
});

function seedDb(dbPath) {
  const db = openDb(dbPath);
  try {
    upsertSession(db, {
      device: 'devbox',
      source: 'Codex CLI',
      sessionId: 'codex-s1',
      lastActivity: '2026-06-17T02:00:00Z',
      model: 'gpt-5.3-codex',
      inputTokens: 100,
      outputTokens: 20,
      totalTokens: 120
    });
    upsertTokenEvent(db, {
      eventId: 'ccusage-import-e1',
      device: 'devbox',
      source: 'import:ccusage-cli',
      sessionId: 'import-s1',
      timestamp: '2026-06-17T03:00:00Z',
      model: 'claude-sonnet-4-5',
      inputTokens: 200,
      outputTokens: 40
    });
    recordRun(db, {
      device: 'devbox',
      source: 'import:ccusage-cli',
      status: 'ok',
      collectedAt: '2026-06-17T03:05:00Z'
    });
  } finally {
    db.close();
  }
}

async function waitForApi(port) {
  const start = Date.now();
  while (Date.now() - start < 5000) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/source-health`);
      if (response.ok) return;
    } catch {
      // Retry while the server starts.
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('server did not start in time');
}

async function getJson(port, path) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  if (!response.ok) assert.fail(await response.text());
  return response.json();
}

function stopChild(child) {
  if (child.exitCode != null) return Promise.resolve();
  return new Promise(resolve => {
    child.once('close', resolve);
    child.kill();
  });
}
