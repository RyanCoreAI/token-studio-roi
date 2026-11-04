import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb, upsertSession, upsertTokenEvent, upsertSessionAnnotation } from '../src/db.mjs';
import { priceSessionRows } from '../src/session-pricing.mjs';
import { calculateOfficialCost } from '../src/pricing.mjs';
import { normalizeTokens as normalizeStructuredTokens, normalizeUsageRecord } from '../src/collectors/structured-usage.mjs';
import { createHash } from 'node:crypto';

const firstUsage = { input_tokens: 1000, output_tokens: 200, cached_input_tokens: 0, reasoning_output_tokens: 100, total_tokens: 1200 };
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'token-accounting-'));
  const home = join(dir, 'codex');
  const claudeHome = join(dir, 'claude');
  mkdirSync(join(home, 'sessions'), { recursive: true });
  mkdirSync(join(claudeHome, 'projects', 'fixture'), { recursive: true });
  const config = join(dir, 'collectors.json');
  writeFileSync(config, JSON.stringify({ collectors: { codex: { homes: [home], sessionSubdirs: ['sessions'], headlessRoots: [] }, claude: { roots: [claudeHome], includeDesktopLocalAgent: false } } }));
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !['CODEX_HOME', 'CLAUDE_CONFIG_DIR', 'TOKEN_STUDIO_HEADLESS_DIR', 'AI_TOKEN_DASHBOARD_HEADLESS_DIR'].includes(key)));
  env.TOKEN_STUDIO_CONFIG = config;
  env.NODE_OPTIONS = '--no-warnings';
  const lines = [{ type: 'session_meta', payload: { id: 'fixture-session', cwd: '/fixture/repo' } }];
  const file = join(home, 'sessions', 'fixture.jsonl');
  const add = (model, usage, timestamp) => {
    lines.push({ type: 'turn_context', payload: { model } });
    lines.push({ type: 'event_msg', timestamp, payload: { type: 'token_count', info: { last_token_usage: usage } } });
    writeFileSync(file, lines.map(JSON.stringify).join('\n') + '\n');
  };
  const claudeLines = [];
  const addClaude = (model, usage, timestamp) => {
    claudeLines.push({ type: 'assistant', timestamp, message: { id: `msg-${claudeLines.length}`, model, usage } });
    writeFileSync(join(claudeHome, 'projects', 'fixture', 'fixture-session.jsonl'), claudeLines.map(JSON.stringify).join('\n') + '\n');
  };
  return { dir, env, add, addClaude, dbPath: join(dir, 'usage.sqlite'), close: () => rmSync(dir, { recursive: true, force: true }) };
}
function apply(f, source = 'codex') {
  return spawnSync(process.execPath, ['src/collect.mjs', `--sources=${source}`, '--apply', '--yes', '--device=fixture', '--db', f.dbPath, '--json'], { env: f.env, encoding: 'utf8', windowsHide: true });
}
function rows(db, table) { return db.prepare(`SELECT * FROM ${table}`).all(); }

test('Codex reasoning is a subset, and repeated collection survives a model change without changing history identities', () => {
  const f = fixture();
  try {
    f.add('gpt-5.3-codex', firstUsage, '2026-06-17T01:00:00Z');
    const initial = apply(f); assert.equal(initial.status, 0, initial.stderr);
    let db = openDb(f.dbPath);
    const first = rows(db, 'token_events')[0];
    const sessionId = rows(db, 'session_usage')[0].session_id;
    assert.equal(first.output_tokens, 100);
    assert.equal(first.reasoning_tokens, 100);
    assert.equal(rows(db, 'session_usage')[0].total_tokens, 1200);
    assert.ok(Math.abs(rows(db, 'session_usage')[0].cost_usd - 0.00455) < 1e-12);
    db.close();

    f.add('gpt-5.5', { input_tokens: 5000, output_tokens: 0, total_tokens: 5000 }, '2026-06-17T01:00:01Z');
    for (let run = 0; run < 2; run += 1) {
      const result = apply(f); assert.equal(result.status, 0, result.stderr);
      db = openDb(f.dbPath);
      assert.equal(rows(db, 'session_usage').length, 1);
      assert.equal(rows(db, 'token_events').length, 2);
      assert.equal(rows(db, 'session_usage')[0].session_id, sessionId);
      assert.ok(rows(db, 'token_events').some(row => row.event_id === first.event_id));
      assert.equal(rows(db, 'session_usage')[0].total_tokens, 6200);
      const priced = priceSessionRows(db, [{ device: 'fixture', source: 'Codex CLI', sessionId, totalTokens: 6200 }])[0];
      assert.equal(priced.model, 'mixed');
      assert.ok(Math.abs(priced.costUSD - 0.02955) < 1e-12);
      assert.ok(Math.abs(priced.costUSD - rows(db, 'session_usage')[0].cost_usd) < 1e-12);
      db.close();
    }
  } finally { f.close(); }
});

test('ordinary Codex re-collection preserves legacy session/event identities and manual annotations', () => {
  const f = fixture();
  try {
    f.add('gpt-5.3-codex', firstUsage, '2026-06-17T01:00:00Z');
    const sessionId = 'local:codex:fixture-session:gpt-5.3-codex';
    let db = openDb(f.dbPath);
    upsertSession(db, { device: 'fixture', source: 'Codex CLI', sessionId, totalTokens: 1300 });
    upsertSessionAnnotation(db, { device: 'fixture', source: 'Codex CLI', sessionId, note: 'keep this annotation' });
    upsertTokenEvent(db, { eventId: 'legacy-event', device: 'fixture', source: 'Codex CLI', sessionId, timestamp: '2026-06-17T01:00:00Z', model: 'gpt-5.3-codex', inputTokens: 1000, outputTokens: 200, reasoningTokens: 100 });
    db.close();
    const result = apply(f); assert.equal(result.status, 0, result.stderr);
    db = openDb(f.dbPath);
    assert.equal(rows(db, 'session_usage').length, 1);
    assert.equal(rows(db, 'session_usage')[0].session_id, sessionId);
    assert.equal(rows(db, 'session_usage')[0].total_tokens, 1200);
    assert.equal(rows(db, 'token_events').length, 1);
    assert.equal(rows(db, 'token_events')[0].event_id, 'legacy-event');
    assert.equal(rows(db, 'token_events')[0].output_tokens, 100);
    assert.equal(rows(db, 'session_annotations')[0].note, 'keep this annotation');
    db.close();
  } finally { f.close(); }
});

test('ambiguous legacy Codex duplicates block collection instead of deleting or duplicating history', () => {
  const f = fixture();
  try {
    f.add('gpt-5.3-codex', firstUsage, '2026-06-17T01:00:00Z');
    let db = openDb(f.dbPath);
    for (const model of ['gpt-5.3-codex', 'gpt-5.5']) upsertSession(db, { device: 'fixture', source: 'Codex CLI', sessionId: `local:codex:fixture-session:${model}`, totalTokens: 42 });
    db.close();
    const result = apply(f);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /multiple identities/);
    db = openDb(f.dbPath);
    assert.equal(rows(db, 'session_usage').length, 2);
    assert.ok(rows(db, 'session_usage').every(row => row.total_tokens === 42));
    assert.equal(rows(db, 'token_events').length, 0);
    assert.equal(rows(db, 'daily_usage').length, 0);
    db.close();
  } finally { f.close(); }
});

test('session repricing requires complete history and sums each model, never a dominant-model estimate', () => {
  const db = openDb(':memory:');
  try {
    const identity = { device: 'fixture', source: 'Codex CLI', sessionId: 'mixed-session' };
    upsertTokenEvent(db, { ...identity, eventId: 'a', timestamp: '2026-06-17T01:00:00Z', model: 'gpt-5.5', inputTokens: 2000 });
    upsertTokenEvent(db, { ...identity, eventId: 'b', timestamp: '2026-06-17T01:00:01Z', model: 'gpt-5.3-codex', inputTokens: 1000 });
    const priced = priceSessionRows(db, [{ ...identity, totalTokens: 3000, costUSD: 999 }])[0];
    assert.ok(Math.abs(priced.costUSD - 0.01175) < 1e-12);
    assert.equal(priced.model, 'mixed');
    assert.equal(priced.pricingStatus, 'priced');
    const incomplete = priceSessionRows(db, [{ ...identity, totalTokens: 4000, costUSD: 0.02 }])[0];
    assert.equal(incomplete.costUSD, 0.02);
    assert.equal(incomplete.pricingStatus, 'unverified-aggregate');
    const unknown = priceSessionRows(db, [{ ...identity, sessionId: 'no-events', totalTokens: 3000, costUSD: 0.01 }])[0];
    assert.equal(unknown.costUSD, 0.01);
    assert.equal(unknown.pricingStatus, 'unverified-aggregate');
  } finally { db.close(); }
});

test('canonical exclusive buckets preserve total/cost invariants over a range of reasoning splits', () => {
  for (const output of [0, 1, 200, 10000]) {
    for (const reasoning of [0, Math.floor(output / 2), output]) {
      const cost = calculateOfficialCost('gpt-5.3-codex', { input: 1000, output: output - reasoning, reasoning });
      assert.ok(Math.abs(cost.totalUSD - (1000 * 1.75 + output * 14) / 1e6) < 1e-12);
    }
  }
});

test('raw structured API usage is normalized once while canonical component payloads are unchanged', () => {
  const canonical = { input: 800, output: 100, cacheRead: 200, cacheWrite: 0, reasoning: 100 };
  const raw = { usage: { input_tokens: 1000, output_tokens: 200, input_tokens_details: { cached_tokens: 200 }, output_tokens_details: { reasoning_tokens: 100 } } };
  assert.deepEqual(normalizeStructuredTokens(raw), canonical);
  assert.deepEqual(normalizeStructuredTokens({ tokens: canonical }), canonical);
  assert.equal(Object.values(normalizeStructuredTokens(raw)).reduce((sum, value) => sum + value, 0), 1200);
  const claude = normalizeStructuredTokens({ usage: { input_tokens: 1000, cache_read_input_tokens: 200, output_tokens: 200, output_tokens_details: { thinking_tokens: 100 } } });
  assert.equal(claude.input, 1000);
  assert.equal(claude.cacheRead, 200);
  assert.equal(claude.output + claude.reasoning, 200);
  const timestamp = '2026-06-17T01:00:00.000Z';
  const row = { ...raw, sessionId: 'raw-usage-session', timestamp, model: 'gpt-5.3-codex' };
  const oldId = createHash('sha256').update(JSON.stringify({ sessionId: row.sessionId, timestamp, model: row.model,
    tokens: { input: 1000, output: 200, cacheRead: 0, cacheWrite: 0, reasoning: 0 }, index: 0
  })).digest('hex').slice(0, 32);
  assert.equal(normalizeUsageRecord(row, { index: 0 })[0].eventId, oldId);
});

test('Claude thinking stays inside billed output, and legacy identity/annotation survives model changes', () => {
  const f = fixture();
  try {
    f.addClaude('claude-sonnet-4-6', { input_tokens: 1000, output_tokens: 200, output_tokens_details: { thinking_tokens: 100 } }, '2026-06-17T01:00:00Z');
    const sessionId = 'local:claude:fixture-session:claude-sonnet-4-6';
    let db = openDb(f.dbPath);
    upsertSession(db, { device: 'fixture', source: 'Claude Code', sessionId, totalTokens: 1200 });
    upsertSessionAnnotation(db, { device: 'fixture', source: 'Claude Code', sessionId, note: 'preserve Claude annotation' });
    upsertTokenEvent(db, { eventId: 'legacy-claude-event', device: 'fixture', source: 'Claude Code', sessionId, timestamp: '2026-06-17T01:00:00Z', model: 'claude-sonnet-4-6', inputTokens: 1000, outputTokens: 200 });
    db.close();
    // The old collector did not read nested thinking details, so an explicit
    // compatibility match must preserve the event while splitting its output.
    const first = apply(f, 'claude'); assert.equal(first.status, 0, first.stderr);
    db = openDb(f.dbPath);
    const event = rows(db, 'token_events')[0];
    assert.equal(event.event_id, 'legacy-claude-event');
    assert.equal(event.output_tokens, 100);
    assert.equal(event.reasoning_tokens, 100);
    assert.equal(rows(db, 'session_usage')[0].total_tokens, 1200);
    assert.ok(Math.abs(rows(db, 'session_usage')[0].cost_usd - 0.006) < 1e-12);
    db.close();
    f.addClaude('claude-opus-4-7', { input_tokens: 5000, output_tokens: 0 }, '2026-06-17T01:00:01Z');
    for (let run = 0; run < 2; run += 1) {
      const next = apply(f, 'claude'); assert.equal(next.status, 0, next.stderr);
      db = openDb(f.dbPath);
      assert.equal(rows(db, 'session_usage').length, 1);
      assert.equal(rows(db, 'session_usage')[0].session_id, sessionId);
      assert.equal(rows(db, 'token_events').length, 2);
      assert.equal(rows(db, 'session_annotations')[0].note, 'preserve Claude annotation');
      db.close();
    }
  } finally { f.close(); }
});
