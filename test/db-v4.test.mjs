import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  linkWorkItemSessions,
  listTokenEvents,
  listWorkItems,
  openDb,
  upsertSession,
  upsertTokenEvent,
  upsertWorkItem
} from '../src/db.mjs';

function tempDb() {
  const dir = mkdtempSync(join(tmpdir(), 'token-studio-roi-v4-'));
  return openDb(join(dir, 'usage.sqlite'));
}

test('token_events upsert is idempotent and privacy bounded', () => {
  const db = tempDb();
  upsertTokenEvent(db, {
    eventId: 'evt-1',
    device: 'demo',
    source: 'Codex CLI',
    sessionId: 's1',
    timestamp: '2026-06-17T00:00:00Z',
    model: 'codex-mini',
    inputTokens: 10,
    outputTokens: 3,
    toolCategory: 'edit',
    fileExtension: '.js',
    repoPathHash: 'abc',
    privacyLevel: 'hashed'
  });
  upsertTokenEvent(db, {
    eventId: 'evt-1',
    device: 'demo',
    source: 'Codex CLI',
    sessionId: 's1',
    timestamp: '2026-06-17T00:00:00Z',
    model: 'codex-mini',
    inputTokens: 20,
    outputTokens: 5,
    privacyLevel: 'safe'
  });
  const rows = listTokenEvents(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].inputTokens, 20);
  assert.equal(rows[0].privacyLevel, 'safe');
  db.close();
});

test('work items can be created and linked to sessions', () => {
  const db = tempDb();
  upsertSession(db, {
    device: 'demo',
    source: 'Codex CLI',
    sessionId: 's1',
    lastActivity: '2026-06-17',
    totalTokens: 100
  });
  const item = upsertWorkItem(db, {
    title: 'Ship Token Studio ROI',
    projectAlias: 'Token Studio ROI',
    workType: '功能开发',
    status: '已发布',
    valueLevel: '高',
    outputUrl: 'https://example.com/pr/1',
    outputType: 'PR'
  });
  const linked = linkWorkItemSessions(db, {
    workItemId: item.id,
    sessions: [{ device: 'demo', source: 'Codex CLI', sessionId: 's1' }]
  });
  assert.equal(linked.linked, 1);
  const items = listWorkItems(db);
  assert.equal(items.length, 1);
  assert.equal(items[0].sessions.length, 1);
  db.close();
});
