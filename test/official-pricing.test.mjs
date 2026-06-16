import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateCost,
  calculateOfficialCost,
  resolveOfficialPricing
} from '../src/pricing.mjs';

test('calculates OpenAI API standard USD price from official per-token rates', () => {
  const cost = calculateOfficialCost('gpt-5.5', {
    input: 1_000_000,
    cacheRead: 1_000_000,
    output: 1_000_000
  });

  assert.equal(cost.priced, true);
  assert.equal(cost.provider, 'openai');
  assert.equal(cost.totalUSD, 35.5);
  assert.equal(cost.ratesPerMTok.input, 5);
  assert.equal(cost.ratesPerMTok.cachedInput, 0.5);
  assert.equal(cost.ratesPerMTok.output, 30);
});

test('calculates Claude prompt-cache cost with official 5-minute cache write default', () => {
  const cost = calculateOfficialCost('claude-opus-4-7', {
    input: 1_000_000,
    cacheWrite: 1_000_000,
    cacheRead: 1_000_000,
    output: 1_000_000
  });

  assert.equal(cost.priced, true);
  assert.equal(cost.provider, 'anthropic');
  assert.equal(cost.totalUSD, 36.75);
  assert.equal(cost.ratesPerMTok.cacheWrite, 6.25);
});

test('supports official DeepSeek and Xiaomi cache-hit pricing', () => {
  const deepseek = calculateOfficialCost('deepseek-v4-pro', {
    input: 1_000_000,
    cacheRead: 1_000_000,
    output: 1_000_000
  });
  const mimo = calculateOfficialCost('mimo-v2.5-pro', {
    input: 1_000_000,
    cacheRead: 1_000_000,
    output: 1_000_000
  });

  assert.equal(deepseek.totalUSD, 1.308625);
  assert.equal(mimo.totalUSD, 1.3086);
});

test('does not invent prices for research-preview or unknown models', () => {
  const spark = calculateOfficialCost('gpt-5.3-codex-spark', {
    input: 1_000_000,
    output: 1_000_000
  });
  const unknown = calculateCost('made-up-model', { input: 1_000_000, output: 1_000_000 });

  assert.equal(spark.priced, false);
  assert.equal(spark.totalUSD, 0);
  assert.match(spark.reason, /research preview/);
  assert.equal(unknown, 0);
});

test('resolves dated provider aliases without falling through to shorter model names', () => {
  assert.equal(resolveOfficialPricing('openai/gpt-5.3-codex-spark').priced, false);
  assert.equal(resolveOfficialPricing('claude-opus-4.7-20260420').model, 'claude-opus-4-7');
});
