const DEFAULT_WINDOW_MINUTES = 15;

export function buildLiveSnapshot({
  sessions = [],
  tokenEvents = [],
  runs = [],
  now = new Date(),
  windowMinutes = DEFAULT_WINDOW_MINUTES
} = {}) {
  const nowMs = new Date(now).getTime();
  const windowMs = Math.max(1, Number(windowMinutes) || DEFAULT_WINDOW_MINUTES) * 60 * 1000;
  const sinceMs = nowMs - windowMs;
  const recentEvents = tokenEvents
    .map(normalizeEvent)
    .filter(event => event.timestampMs >= sinceMs && event.timestampMs <= nowMs);
  const recentSessions = sessions
    .map(normalizeSession)
    .filter(session => session.lastActivityMs >= sinceMs && session.lastActivityMs <= nowMs);

  const sourceRows = aggregate(recentEvents.length ? recentEvents : recentSessions, 'source');
  const modelRows = aggregate(recentEvents.length ? recentEvents : recentSessions, 'model');
  const activeSessions = recentSessions
    .sort((a, b) => b.lastActivityMs - a.lastActivityMs)
    .slice(0, 12)
    .map(session => ({
      device: session.device,
      source: session.source,
      sessionId: session.sessionId,
      model: session.model,
      projectPath: session.projectPath,
      lastActivity: session.lastActivity,
      totalTokens: session.totalTokens,
      costUSD: session.costUSD
    }));

  const totals = sumRows(recentEvents.length ? recentEvents : recentSessions);
  const cacheDenominator = totals.inputTokens + totals.cacheReadTokens + totals.cacheCreationTokens;

  return {
    generatedAt: new Date(nowMs).toISOString(),
    windowMinutes,
    status: activeSessions.length || recentEvents.length ? 'active' : 'idle',
    totals: {
      ...totals,
      burnRateTokensPerHour: Math.round((totals.totalTokens / windowMinutes) * 60),
      cacheHitRate: cacheDenominator ? (totals.cacheReadTokens / cacheDenominator) * 100 : 0
    },
    activeSessions,
    bySource: sourceRows,
    byModel: modelRows,
    recentEvents: recentEvents.slice(0, 25).map(stripRuntimeFields),
    latestRun: runs[0] || null
  };
}

function normalizeSession(session) {
  const lastActivity = session.lastActivity || session.last_activity || null;
  return {
    device: session.device || '',
    source: session.source || 'unknown',
    sessionId: session.sessionId || session.session_id || 'unknown-session',
    model: session.model || 'unknown',
    projectPath: session.projectPath || session.project_path || null,
    lastActivity,
    lastActivityMs: dateMs(lastActivity),
    inputTokens: number(session.inputTokens ?? session.input_tokens),
    outputTokens: number(session.outputTokens ?? session.output_tokens),
    cacheReadTokens: number(session.cacheReadTokens ?? session.cache_read_tokens),
    cacheCreationTokens: number(session.cacheCreationTokens ?? session.cache_creation_tokens),
    reasoningTokens: number(session.reasoningOutputTokens ?? session.reasoningTokens ?? session.reasoning_output_tokens),
    totalTokens: number(session.totalTokens ?? session.total_tokens),
    costUSD: number(session.costUSD ?? session.cost_usd)
  };
}

function normalizeEvent(event) {
  const timestamp = event.timestamp || event.createdAt || event.created_at || null;
  const inputTokens = number(event.inputTokens ?? event.input_tokens);
  const outputTokens = number(event.outputTokens ?? event.output_tokens);
  const cacheReadTokens = number(event.cacheReadTokens ?? event.cache_read_tokens);
  const cacheCreationTokens = number(event.cacheCreationTokens ?? event.cache_creation_tokens);
  const reasoningTokens = number(event.reasoningTokens ?? event.reasoning_tokens);
  return {
    eventId: event.eventId || event.event_id || null,
    device: event.device || '',
    source: event.source || 'unknown',
    sessionId: event.sessionId || event.session_id || 'unknown-session',
    timestamp,
    timestampMs: dateMs(timestamp),
    model: event.model || 'unknown',
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    reasoningTokens,
    totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens + reasoningTokens,
    costUSD: number(event.costUSD ?? event.cost_usd),
    toolCategory: event.toolCategory || event.tool_category || null,
    fileExtension: event.fileExtension || event.file_extension || null
  };
}

function aggregate(rows, field) {
  const byKey = new Map();
  for (const row of rows) {
    const key = row[field] || 'unknown';
    if (!byKey.has(key)) {
      byKey.set(key, { key, sessions: new Set(), totalTokens: 0, costUSD: 0 });
    }
    const target = byKey.get(key);
    target.sessions.add(row.sessionId);
    target.totalTokens += row.totalTokens;
    target.costUSD += row.costUSD;
  }
  return [...byKey.values()]
    .map(row => ({
      key: row.key,
      sessions: row.sessions.size,
      totalTokens: row.totalTokens,
      costUSD: row.costUSD
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens)
    .slice(0, 10);
}

function sumRows(rows) {
  return rows.reduce((sum, row) => ({
    inputTokens: sum.inputTokens + row.inputTokens,
    outputTokens: sum.outputTokens + row.outputTokens,
    cacheReadTokens: sum.cacheReadTokens + row.cacheReadTokens,
    cacheCreationTokens: sum.cacheCreationTokens + row.cacheCreationTokens,
    reasoningTokens: sum.reasoningTokens + row.reasoningTokens,
    totalTokens: sum.totalTokens + row.totalTokens,
    costUSD: sum.costUSD + row.costUSD
  }), {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    costUSD: 0
  });
}

function stripRuntimeFields(row) {
  const { timestampMs, ...rest } = row;
  return rest;
}

function dateMs(value) {
  const ms = new Date(value || 0).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function number(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
