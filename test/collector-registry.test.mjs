import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectableCollectors,
  collectorLabel,
  detectCollectors,
  enabledCollectorIds,
  stableCollectors
} from '../src/collector-registry.mjs';

test('collector registry exposes six stable v4 sources', () => {
  const stable = stableCollectors().map(item => item.id).sort();
  assert.deepEqual(stable, ['claude', 'codex', 'gemini', 'hermes', 'openclaw', 'opencode']);
  assert.equal(collectorLabel('codex'), 'Codex CLI');
});

test('collector detection includes v4.1 experimental source metadata', () => {
  const rows = detectCollectors();
  const cursor = rows.find(item => item.id === 'cursor');
  const copilot = rows.find(item => item.id === 'copilot');
  assert.equal(cursor.supportStatus, 'experimental');
  assert.equal(copilot.defaultEnabled, false);
  assert.equal(cursor.readsConversationContent, false);
  assert.equal(cursor.tokenReliability, 'explicit-token-fields-only');
  assert.ok(cursor.dataFields.includes('input_tokens'));
});

test('enabled collectors ignore experimental ids by default', () => {
  const old = process.env.TOKEN_STUDIO_COLLECTORS;
  process.env.TOKEN_STUDIO_COLLECTORS = 'claude,cursor,codex';
  try {
    assert.deepEqual(Array.from(enabledCollectorIds()).sort(), ['claude', 'codex']);
    assert.deepEqual(Array.from(enabledCollectorIds({ includeExperimental: true })).sort(), ['claude', 'codex', 'cursor']);
  } finally {
    if (old == null) delete process.env.TOKEN_STUDIO_COLLECTORS;
    else process.env.TOKEN_STUDIO_COLLECTORS = old;
  }
});

test('collectable collectors include experimental modules only when requested', () => {
  assert.equal(collectableCollectors().some(item => item.id === 'cursor'), false);
  assert.equal(collectableCollectors({ includeExperimental: true }).some(item => item.id === 'cursor'), true);
});
