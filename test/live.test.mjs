import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLiveSnapshot } from '../src/live.mjs';

test('live snapshot uses recent token events for burn rate and cache hit', () => {
  const snapshot = buildLiveSnapshot({
    now: new Date('2026-06-17T02:15:00Z'),
    windowMinutes: 15,
    sessions: [{
      device: 'demo',
      source: 'Codex CLI',
      sessionId: 'old',
      lastActivity: '2026-06-17T01:00:00Z',
      totalTokens: 99999
    }],
    tokenEvents: [{
      eventId: 'e1',
      device: 'demo',
      source: 'Cursor',
      sessionId: 's1',
      timestamp: '2026-06-17T02:10:00Z',
      model: 'gpt-5.3-codex',
      inputTokens: 1000,
      outputTokens: 250,
      cacheReadTokens: 500
    }]
  });
  assert.equal(snapshot.status, 'active');
  assert.equal(snapshot.totals.totalTokens, 1750);
  assert.equal(snapshot.totals.burnRateTokensPerHour, 7000);
  assert.equal(snapshot.bySource[0].key, 'Cursor');
  assert.equal(snapshot.activeSessions.length, 0);
  assert.ok(snapshot.totals.cacheHitRate > 0);
});

test('live snapshot reports idle empty state', () => {
  const snapshot = buildLiveSnapshot({
    now: new Date('2026-06-17T02:15:00Z'),
    sessions: [],
    tokenEvents: []
  });
  assert.equal(snapshot.status, 'idle');
  assert.equal(snapshot.totals.totalTokens, 0);
  assert.deepEqual(snapshot.byModel, []);
});
