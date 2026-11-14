import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { applyCcusageImport, planCcusageImport } from '../src/ccusage-import.mjs';
import { openDb } from '../src/db.mjs';

const row = (overrides = {}) => ({ session: 'one', source: 'fixture', model: 'gpt-5.3-codex', inputTokens: 100,
  lastActivity: '2026-06-17T02:00:00Z', ...overrides });
const plan = data => planCcusageImport({ type: 'session', data }, { device: 'fixture' });

test('invalid token counts reject a reimport before stored snapshots are overwritten', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'ccusage-validation-')), 'usage.sqlite'));
  try {
    applyCcusageImport(db, plan([row()]));
    for (const invalid of [-1, 1.5, 'broken', 'Infinity', true, [], {}, 9007199254740992]) {
      assert.throws(() => applyCcusageImport(db, plan([row({ inputTokens: invalid })])), /non-negative safe integer/i,
        `must reject ${JSON.stringify(invalid)}`);
      assert.equal(db.prepare('SELECT total_tokens AS total FROM session_usage').get().total, 100);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM collection_runs').get().n, 1);
    }
  } finally { db.close(); }
});

test('explicit zero totals and aggregate overflow are rejected', () => {
  assert.throws(() => plan([row({ totalTokens: 0 })]), /does not match/i);
  assert.throws(() => plan([row({ inputTokens: Number.MAX_SAFE_INTEGER, outputTokens: 1 })]), /safe integer/i);
  assert.throws(() => plan([row({ inputTokens: Number.MAX_SAFE_INTEGER }), row({ inputTokens: 1 })]), /safe integer/i);
});

test('numeric strings and omitted buckets remain supported', () => {
  const result = plan([row({ inputTokens: '100', outputTokens: '20', totalTokens: '120' })]);
  assert.equal(result.sessions[0].totalTokens, 120);
  assert.equal(result.tokenEvents[0].cacheReadTokens, 0);
});

test('source and session identifiers containing delimiters do not collapse aggregates', () => {
  const db = openDb(join(mkdtempSync(join(tmpdir(), 'ccusage-delimiters-')), 'usage.sqlite'));
  try {
    const result = plan([row({ source: 'one::two', session: 'three' }), row({ source: 'one', session: 'two::three', inputTokens: 200 })]);
    assert.equal(result.sessions.length, 2);
    applyCcusageImport(db, result);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM session_usage').get().n, 2);
    assert.equal(db.prepare('SELECT SUM(total_tokens) AS n FROM session_usage').get().n, 300);
  } finally { db.close(); }
});
