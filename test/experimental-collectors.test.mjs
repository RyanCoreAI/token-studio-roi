import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { collectStructuredUsage, normalizeUsageRecord } from '../src/collectors/structured-usage.mjs';

const EXPERIMENTAL = ['cursor', 'copilot', 'qwen', 'kimi', 'goose'];

test('experimental collector fixtures contain no transcript or full path fields', () => {
  for (const id of EXPERIMENTAL) {
    const text = readFileSync(join('test', 'fixtures', 'collectors', id, 'usage.jsonl'), 'utf8');
    assert.equal(/prompt|response|content|diff|transcript|messages/i.test(text), false, `${id} fixture contains conversation-like fields`);
    assert.equal(/[A-Z]:[\\/]|\/Users\/|\/home\//.test(text), false, `${id} fixture contains full local paths`);
  }
});

test('experimental structured collector imports explicit token rows only', async () => {
  for (const id of EXPERIMENTAL) {
    const result = await collectStructuredUsage({
      clientKey: id,
      roots: [join(process.cwd(), 'test', 'fixtures', 'collectors', id)]
    });
    assert.equal(result.modelsJson.entries.length, 1, `${id} should skip missing-token fixture rows`);
    assert.equal(result.tokenEvents.length, 1, `${id} should emit one token event`);
    assert.equal(result.tokenEvents[0].source, id);
    assert.ok(result.tokenEvents[0].inputTokens + result.tokenEvents[0].outputTokens > 0);
  }
});

test('structured usage normalizer rejects conversation-shaped rows', () => {
  assert.deepEqual(normalizeUsageRecord({
    sessionId: 'unsafe',
    model: 'gpt-5.3-codex',
    prompt: 'do not ingest this',
    inputTokens: 100,
    outputTokens: 20
  }), []);
});
