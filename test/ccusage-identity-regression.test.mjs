import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { applyCcusageImport, planCcusageImport } from '../src/ccusage-import.mjs';
import { openDb, upsertSession, upsertTokenEvent } from '../src/db.mjs';

const row = (session, inputTokens, model = 'gpt-5.3-codex', timestamp = '2026-06-17T02:00:00Z') => ({ session, model, inputTokens, lastActivity: timestamp });
const sessionPlan = (data, device = 'fixture') => planCcusageImport({ type: 'session', data }, { device });
const fixtureDb = () => openDb(join(mkdtempSync(join(tmpdir(), 'ccusage-identity-')), 'usage.sqlite'));
const total = (db, table) => db.prepare(`SELECT SUM(${table === 'token_events' ? 'input_tokens + output_tokens + cache_read_tokens + cache_creation_tokens + reasoning_tokens' : 'total_tokens'}) AS tokens FROM ${table}`).get().tokens;

test('ccusage event identities include device and repeated imports stay idempotent', () => {
  const db = fixtureDb();
  try {
    for (const device of ['workstation-A', 'workstation-B']) {
      const plan = sessionPlan([row('same-session', 100)], device);
      applyCcusageImport(db, plan); applyCcusageImport(db, sessionPlan([row('same-session', 100)], device));
    }
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM token_events').get().n, 2);
    assert.equal(total(db, 'daily_usage'), 200);
    assert.equal(total(db, 'session_usage'), 200);
    assert.equal(total(db, 'token_events'), 200);
  } finally { db.close(); }
});

test('Chinese project names have distinct lossless session identities', () => {
  const plan = planCcusageImport({ projects: {
    'D:/项目/甲': [{ date: '2026-06-17', model: 'gpt-5.3-codex', inputTokens: 100 }],
    'D:/项目/乙': [{ date: '2026-06-17', model: 'gpt-5.3-codex', inputTokens: 200 }]
  } }, { device: 'fixture' });
  assert.equal(plan.sessions.length, 2);
  assert.equal(plan.tokenEvents.length, 2);
  assert.equal(new Set(plan.sessions.map(s => s.sessionId)).size, 2);
});

test('long project paths stay distinct and oversized device identities are rejected', () => {
  const prefix = 'D:/'+ '项目/'.repeat(100);
  const plan = planCcusageImport({ projects: {
    [prefix + '甲']: [{ date: '2026-06-17', model: 'gpt-5.3-codex', inputTokens: 100 }],
    [prefix + '乙']: [{ date: '2026-06-17', model: 'gpt-5.3-codex', inputTokens: 200 }]
  } }, { device: 'fixture' });
  assert.equal(plan.sessions.length, 2);
  assert.equal(plan.sessions[0].projectPath, prefix + '甲');
  assert.throws(() => sessionPlan([row('one', 100)], 'A'.repeat(121)), /identities cannot be truncated/i);
});

test('partial imports keep same-day sessions and different models reconciled', () => {
  const db = fixtureDb();
  try {
    applyCcusageImport(db, sessionPlan([row('session-A', 100)]));
    applyCcusageImport(db, sessionPlan([row('session-B', 200)]));
    applyCcusageImport(db, sessionPlan([row('session-A', 50, 'gpt-5.5')]));
    assert.equal(total(db, 'daily_usage'), 350);
    assert.equal(total(db, 'session_usage'), 350);
    assert.equal(total(db, 'token_events'), 350);
    assert.equal(db.prepare('SELECT total_tokens AS n FROM session_usage WHERE session_id = ?').get('session-A').n, 150);
  } finally { db.close(); }
});

test('updated cumulative session snapshots replace prior counts and dates', () => {
  const db = fixtureDb();
  try {
    applyCcusageImport(db, sessionPlan([row('growing-session', 100)]));
    applyCcusageImport(db, sessionPlan([row('growing-session', 180, 'gpt-5.3-codex', '2026-06-18T02:00:00Z')]));
    assert.equal(total(db, 'daily_usage'), 180);
    assert.equal(total(db, 'session_usage'), 180);
    assert.equal(total(db, 'token_events'), 180);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM token_events').get().n, 1);
    assert.equal(db.prepare('SELECT total_tokens AS n FROM daily_usage WHERE usage_date = ?').get('2026-06-17')?.n || 0, 0);
  } finally { db.close(); }
});

test('multiple same-identity rows reconcile their event buckets', () => {
  const plan = sessionPlan([row('session-A', 100), row('session-A', 200)]);
  assert.equal(plan.sessions[0].totalTokens, 300);
  assert.equal(plan.tokenEvents.reduce((sum, e) => sum + e.inputTokens, 0), 300);
});

test('model breakdowns never inherit parent token aggregates', () => {
  const plan = planCcusageImport({ daily: [{ date: '2026-06-17', inputTokens: 300, outputTokens: 30, totalTokens: 330,
    modelBreakdowns: [ { model: 'gpt-5.3-codex', inputTokens: 100 }, { model: 'gpt-5.5', inputTokens: 200, outputTokens: 30 } ] }] }, { device: 'fixture' });
  assert.equal(plan.daily.reduce((sum, r) => sum + r.totalTokens, 0), 330);
  assert.equal(plan.tokenEvents.reduce((sum, r) => sum + r.inputTokens + r.outputTokens, 0), 330);
});

test('overlapping report shapes are rejected atomically instead of counted twice', () => {
  const db = fixtureDb();
  try {
    applyCcusageImport(db, sessionPlan([row('session-A', 100)]));
    const plan = planCcusageImport({ daily: [{ date: '2026-06-17', model: 'gpt-5.3-codex', inputTokens: 100 }] }, { device: 'fixture' });
    const before = total(db, 'token_events');
    assert.throws(() => applyCcusageImport(db, plan), /overlap/i);
    assert.equal(total(db, 'token_events'), before);
    assert.equal(total(db, 'daily_usage'), before);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM collection_runs').get().n, 1);
  } finally { db.close(); }
});

test('one matching legacy event is reused before reimport', () => {
  const db = fixtureDb();
  try {
    const identity = { device: 'fixture', source: 'ccusage', sessionId: 'legacy-session' };
    upsertSession(db, { ...identity, inputTokens: 100, totalTokens: 100 });
    upsertTokenEvent(db, { ...identity, eventId: 'ccusage:session:legacy-id', model: 'gpt-5.3-codex', timestamp: '2026-06-17T02:00:00.000Z', inputTokens: 100 });
    applyCcusageImport(db, sessionPlan([row('legacy-session', 150)]));
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM token_events').get().n, 1);
    assert.equal(db.prepare('SELECT event_id AS id FROM token_events').get().id, 'ccusage:session:legacy-id');
    assert.equal(total(db, 'token_events'), 150);
  } finally { db.close(); }
});

test('ambiguous old project identity is rejected before any writes', () => {
  const db = fixtureDb();
  try {
    upsertSession(db, { device: 'fixture', source: 'ccusage', sessionId: 'ccusage:project-daily:d:2026-06-17:gpt-5.3-codex', projectPath: 'D:/项目/甲', totalTokens: 300 });
    const before = JSON.stringify(db.prepare('SELECT * FROM session_usage').all());
    const plan = planCcusageImport({ projects: { 'D:/项目/甲': [{ date: '2026-06-17', model: 'gpt-5.3-codex', inputTokens: 100 }] } }, { device: 'fixture' });
    assert.throws(() => applyCcusageImport(db, plan), /legacy.*review|review.*legacy/i);
    assert.equal(JSON.stringify(db.prepare('SELECT * FROM session_usage').all()), before);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM daily_usage').get().n, 0);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM collection_runs').get().n, 0);
  } finally { db.close(); }
});
