import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { openDb, recordRun, upsertDaily, upsertSession, upsertTokenEvent } from './db.mjs';
import { loadPricing } from './pricing.mjs';
import { collectableCollectors, collectorLabel, enabledCollectorIds } from './collector-registry.mjs';

const args = parseArgs(process.argv.slice(2));
const device = args.device || hostname();
const db = openDb(args.db);
const exportPayload = {
  device,
  collectedAt: new Date().toISOString(),
  daily: [],
  sessions: [],
  tokenEvents: [],
  runs: []
};

// Load official provider pricing once. Unknown models are intentionally unpriced.
const pricingCachePath = resolve(process.cwd(), 'data', 'official-pricing.json');
const pricingData = await loadPricing(pricingCachePath);

await collectLocal();

if (args.push) {
  await pushPayload(args.push, exportPayload, args.token);
}

db.close();

async function collectLocal() {
  let anyError = false;
  const enabled = enabledCollectors();
  const includeExperimental = Boolean(args.sources || args.collectors || args.experimental);
  const collectors = collectableCollectors({ includeExperimental }).filter(({ id }) => enabled.has(id));

  console.log(`[collect] enabled=${Array.from(enabled).join(',') || 'none'}`);

  for (const { module, label } of collectors) {
    let graphJson;
    let modelsJson;
    let tokenEvents;

    try {
      const { collect } = await import(module);
      ({ graphJson, modelsJson, tokenEvents } = await collect(pricingData));
    } catch (error) {
      const run = {
        device,
        source: label,
        status: 'error',
        message: error.message,
        collectedAt: exportPayload.collectedAt,
        command: `js-collector:${module}`
      };
      recordRun(db, run);
      exportPayload.runs.push(run);
      console.warn(`[${label}] ${error.message}`);
      anyError = true;
      continue;
    }

    const dailyRows = normalizeDailyRows(graphJson, device);
    runInTransaction(db, () => dailyRows.forEach((row) => upsertDaily(db, row)));
    exportPayload.daily.push(...dailyRows);

    const sessionRows = normalizeSessionRows(modelsJson, device);
    runInTransaction(db, () => sessionRows.forEach((row) => upsertSession(db, row)));
    exportPayload.sessions.push(...sessionRows);

    const eventRows = normalizeTokenEventRows(tokenEvents, device);
    runInTransaction(db, () => eventRows.forEach((row) => upsertTokenEvent(db, row)));
    exportPayload.tokenEvents.push(...eventRows);

    const run = {
      device,
      source: label,
      status: dailyRows.length || sessionRows.length ? 'ok' : 'empty',
      message: `daily=${dailyRows.length}, workspace_model=${sessionRows.length}, token_events=${eventRows.length}`,
      collectedAt: exportPayload.collectedAt,
      command: `js-collector:${module}`
    };
    recordRun(db, run);
    exportPayload.runs.push(run);
    console.log(`[${label}] daily=${dailyRows.length}, workspace_model=${sessionRows.length}, token_events=${eventRows.length}`);
  }

  if (anyError) process.exitCode = 1;
}

function enabledCollectors() {
  const sourceArg = args.sources || args.collectors;
  if (sourceArg) {
    return enabledCollectorIds({ includeExperimental: true, values: sourceArg });
  }
  return enabledCollectorIds({ includeExperimental: Boolean(args.experimental) });
}

function runInTransaction(database, work) {
  database.exec('BEGIN');
  try {
    work();
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

function normalizeDailyRows(json, deviceName) {
  const days = Array.isArray(json.contributions) ? json.contributions : [];
  return days.flatMap((day) => {
    const clients = Array.isArray(day.clients) ? day.clients : [];
    return clients.map((entry) => {
      const tokens = normalizeTokens(entry.tokens);
      return {
        device: deviceName,
        source: sourceLabel(entry.client),
        usageDate: day.date,
        model: entry.modelId || entry.model_id || 'unknown',
        inputTokens: tokens.input,
        outputTokens: tokens.output,
        cacheCreationTokens: tokens.cacheWrite,
        cacheReadTokens: tokens.cacheRead,
        reasoningOutputTokens: tokens.reasoning,
        totalTokens: tokenTotal(tokens),
        costUSD: entry.cost || 0
      };
    });
  });
}

function normalizeSessionRows(json, deviceName) {
  const entries = Array.isArray(json.entries) ? json.entries : [];
  return entries.map((entry) => {
    const tokens = {
      input: positiveNumber(entry.input),
      output: positiveNumber(entry.output),
      cacheRead: positiveNumber(entry.cacheRead),
      cacheWrite: positiveNumber(entry.cacheWrite),
      reasoning: positiveNumber(entry.reasoning)
    };
    const source = sourceLabel(entry.client);
    const workspace = entry.workspaceLabel || entry.workspaceKey || '';
    const model = entry.model || 'unknown';
    return {
      device: deviceName,
      source,
      sessionId: ['local', entry.client || 'unknown', workspace || 'no-workspace', model].join(':'),
      lastActivity: exportPayload.collectedAt,
      projectPath: workspace || null,
      inputTokens: tokens.input,
      outputTokens: tokens.output,
      cacheCreationTokens: tokens.cacheWrite,
      cacheReadTokens: tokens.cacheRead,
      reasoningOutputTokens: tokens.reasoning,
      totalTokens: tokenTotal(tokens),
      costUSD: entry.cost || 0
    };
  });
}

function normalizeTokenEventRows(events, deviceName) {
  if (!Array.isArray(events)) return [];
  return events.map((event) => ({
    device: deviceName,
    source: sourceLabel(event.source || event.client),
    sessionId: event.sessionId || event.session_id || 'unknown-session',
    timestamp: event.timestamp || exportPayload.collectedAt,
    model: event.model || 'unknown',
    inputTokens: positiveNumber(event.inputTokens ?? event.input_tokens),
    outputTokens: positiveNumber(event.outputTokens ?? event.output_tokens),
    cacheReadTokens: positiveNumber(event.cacheReadTokens ?? event.cache_read_tokens),
    cacheCreationTokens: positiveNumber(event.cacheCreationTokens ?? event.cache_creation_tokens),
    reasoningTokens: positiveNumber(event.reasoningTokens ?? event.reasoning_tokens),
    toolCategory: event.toolCategory ?? event.tool_category ?? null,
    fileExtension: event.fileExtension ?? event.file_extension ?? null,
    repoPathHash: event.repoPathHash ?? event.repo_path_hash ?? null,
    privacyLevel: event.privacyLevel ?? event.privacy_level ?? 'safe',
    eventId: event.eventId ?? event.event_id ?? null
  }));
}

function normalizeTokens(tokens = {}) {
  return {
    input: positiveNumber(tokens.input),
    output: positiveNumber(tokens.output),
    cacheRead: positiveNumber(tokens.cacheRead ?? tokens.cache_read),
    cacheWrite: positiveNumber(tokens.cacheWrite ?? tokens.cache_write),
    reasoning: positiveNumber(tokens.reasoning)
  };
}

function tokenTotal(tokens) {
  return tokens.input + tokens.output + tokens.cacheRead + tokens.cacheWrite + tokens.reasoning;
}

function positiveNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function sourceLabel(client) {
  return collectorLabel(client) || client || 'unknown';
}

// ---------------------------------------------------------------------------
// CLI argument parser
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--device') {
      parsed.device = argv[++i];
    } else if (arg === '--db') {
      parsed.db = argv[++i];
    } else if (arg === '--push') {
      parsed.push = argv[++i];
    } else if (arg === '--token') {
      parsed.token = argv[++i];
    } else if (arg === '--sources' || arg === '--collectors') {
      parsed.sources = argv[++i];
    }
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// Remote push helper
// ---------------------------------------------------------------------------

async function pushPayload(url, payload, token) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`上报失败：HTTP ${response.status} ${await response.text()}`);
  }
  console.log(`[push] ${url}`);
}
