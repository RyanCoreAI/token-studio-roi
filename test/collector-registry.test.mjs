import test from 'node:test';
import assert from 'node:assert/strict';
import {
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

test('collector detection includes experimental sources as detected-only', () => {
  const rows = detectCollectors();
  const cursor = rows.find(item => item.id === 'cursor');
  const copilot = rows.find(item => item.id === 'copilot');
  assert.equal(cursor.supportStatus, 'detected-only');
  assert.equal(copilot.defaultEnabled, false);
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
