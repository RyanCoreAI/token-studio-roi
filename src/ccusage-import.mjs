import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { calculateOfficialCost } from './pricing.mjs';
import { recordRun, upsertDaily, upsertSession, upsertTokenEvent } from './db.mjs';
import { prepareImportHistory, rebuildImportAggregates } from './ccusage-import-history.mjs';
import { tokenCount, addTokenCounts } from './ccusage-validation.mjs';

const UNSAFE_KEYS = new Set([
  'prompt',
  'response',
  'messages',
  'message',
  'transcript',
  'conversation',
  'diff',
  'patch',
  'content',
  'text'
]);
const TOKEN_FIELDS = new Set(['inputTokens', 'input_tokens', 'input', 'outputTokens', 'output_tokens', 'output',
  'cacheCreationTokens', 'cacheCreationInputTokens', 'cache_creation_tokens', 'cacheWriteTokens',
  'cacheReadTokens', 'cacheReadInputTokens', 'cache_read_tokens', 'cachedInputTokens',
  'reasoningTokens', 'reasoningOutputTokens', 'reasoning_output_tokens', 'totalTokens', 'total_tokens', 'costUSD', 'totalCost']);

export function readCcusageImportInput(file) {
  if (!file || file === '-') {
    return readFileSync(0, 'utf8');
  }
  return readFileSync(file, 'utf8');
}

export function parseCcusageJsonText(text) {
  let payload;
  try {
    payload = JSON.parse(String(text || ''));
  } catch (error) {
    throw new Error(`Invalid ccusage JSON: ${error.message}`);
  }
  const unsafePath = firstUnsafeKeyPath(payload);
  if (unsafePath) {
    throw new Error(`ccusage JSON contains conversation-like field: ${unsafePath}`);
  }
  return payload;
}

export function planCcusageImport(payload, options = {}) {
  const device = identityText(options.device, 'device', 120) || hostname();
  const now = options.now || new Date();
  const importSource = cleanText(options.importSource, 80) || 'import:ccusage-json';
  const command = cleanText(options.command, 240) || 'import-usage --format=ccusage-json';
  const toolCategory = cleanText(options.toolCategory, 80) || importSource;
  const detectedShape = detectShape(payload);
  const rows = extractUsageRows(payload, detectedShape);
  if (!rows.length) {
    throw new Error('No supported ccusage usage rows found');
  }

  const dailyByKey = new Map();
  const sessionsByKey = new Map();
  const eventsByKey = new Map();
  const warnings = [];

  for (const row of rows) {
    const parts = expandModelBreakdowns(row);
    for (const part of parts) {
      const source = sourceFromRow(part);
      const usageDate = usageDateFromRow(part);
      const timestamp = timestampFromRow(part, usageDate, now);
      const model = identityText(part.model, 'model', 120) || '<unknown>';
      const projectPath = identityText(part.projectPath || part.project || part.projectName, 'projectPath', 4096) || null;
      const sessionId = sessionIdFromRow(part, detectedShape, usageDate, model, projectPath);
      const tokens = tokenFields(part);
      const cost = calculateOfficialCost(model, {
        input: tokens.inputTokens,
        output: tokens.outputTokens,
        cacheRead: tokens.cacheReadTokens,
        cacheWrite: tokens.cacheCreationTokens,
        reasoning: tokens.reasoningOutputTokens
      }, { provider: providerFromSource(source) });

      if (!cost.priced && number(part.costUSD ?? part.totalCost) > 0) {
        warnings.push({
          type: 'ignored-imported-cost',
          model,
          reason: 'ccusage cost was present but Token Studio keeps official-price conversion only.'
        });
      }

      const usageRow = {
        device,
        source,
        usageDate,
        model,
        ...tokens,
        totalTokens: tokens.totalTokens,
        costUSD: cost.totalUSD
      };
      const dailyKey = JSON.stringify([usageRow.device, usageRow.source, usageRow.usageDate, usageRow.model]);
      mergeUsageRow(dailyByKey, dailyKey, usageRow);

      const sessionRow = {
        device,
        source,
        sessionId,
        lastActivity: timestamp,
        projectPath,
        ...tokens,
        totalTokens: tokens.totalTokens,
        costUSD: cost.totalUSD
      };
      const rawSessionId = part.session || part.sessionId || part.session_id || part.id;
      if (!rawSessionId) {
        sessionRow.legacySessionId = `ccusage:${detectedShape}:${projectPath ? hashable(projectPath) : 'all'}:${usageDate}:${hashable(model)}`;
      } else if (String(rawSessionId).trim().length > 240) {
        sessionRow.legacySessionId = cleanText(rawSessionId, 240);
      }
      const sessionKey = JSON.stringify([sessionRow.device, sessionRow.source, sessionRow.sessionId]);
      mergeSessionRow(sessionsByKey, sessionKey, sessionRow);

      const eventRow = {
        eventId: eventIdFor({ detectedShape, device, source, usageDate, sessionId, model, timestamp, part }),
        importShape: detectedShape,
        device,
        source,
        sessionId,
        timestamp,
        model,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens,
        cacheReadTokens: tokens.cacheReadTokens,
        cacheCreationTokens: tokens.cacheCreationTokens,
        reasoningTokens: tokens.reasoningOutputTokens,
        toolCategory,
        privacyLevel: 'safe'
      };
      const previous = eventsByKey.get(eventRow.eventId);
      if (!previous) eventsByKey.set(eventRow.eventId, eventRow);
      else {
        for (const key of ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheCreationTokens', 'reasoningTokens']) previous[key] = addTokenCounts(previous[key], eventRow[key]);
        if (eventRow.timestamp > previous.timestamp) previous.timestamp = eventRow.timestamp;
      }
    }
  }

  return {
    detectedShape,
    device,
    daily: [...dailyByKey.values()],
    sessions: [...sessionsByKey.values()],
    tokenEvents: [...eventsByKey.values()],
    warnings: dedupeWarnings(warnings),
    run: {
      device,
      source: importSource,
      status: 'ok',
      message: `shape=${detectedShape}, daily=${dailyByKey.size}, sessions=${sessionsByKey.size}, token_events=${eventsByKey.size}`,
      collectedAt: new Date(now).toISOString(),
      command
    }
  };
}

export function applyCcusageImport(db, plan) {
  db.exec('BEGIN');
  try {
    // Resolve old identities before the first write. Ambiguous historical data
    // requires review instead of an implicit migration or duplicate insertion.
    const history = prepareImportHistory(db, plan);
    for (const row of history.events) upsertTokenEvent(db, row);
    rebuildImportAggregates(db, plan, history, { upsertDaily, upsertSession });
    recordRun(db, plan.run);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return {
    daily: plan.daily.length,
    sessions: plan.sessions.length,
    tokenEvents: plan.tokenEvents.length,
    warnings: plan.warnings.length
  };
}

function detectShape(payload) {
  if (Array.isArray(payload?.daily)) return 'daily';
  if (payload?.projects && typeof payload.projects === 'object' && !Array.isArray(payload.projects)) return 'project-daily';
  if (Array.isArray(payload?.data) && payload.type) {
    const type = String(payload.type).toLowerCase();
    if (['daily', 'weekly', 'session', 'blocks', 'monthly'].includes(type)) return type;
  }
  throw new Error('Unsupported ccusage JSON shape. Expected daily, project daily, weekly, session, blocks, or monthly output.');
}

function extractUsageRows(payload, shape) {
  if (shape === 'daily') return payload.daily.map(row => ({ ...row }));
  if (shape === 'project-daily') {
    const rows = [];
    for (const [project, entries] of Object.entries(payload.projects || {})) {
      if (!Array.isArray(entries)) continue;
      for (const row of entries) rows.push({ ...row, projectPath: project });
    }
    return rows;
  }
  return (payload.data || []).map(row => ({ ...row }));
}

function expandModelBreakdowns(row) {
  const breakdown = row.modelBreakdowns || row.modelBreakdown || row.breakdowns;
  if (!breakdown) {
    return [{ ...row, model: primaryModel(row) }];
  }
  // Parent token fields describe the complete row. A model breakdown must not
  // inherit those totals or absent buckets from its parent aggregate.
  const context = Object.fromEntries(Object.entries(row).filter(([key]) => !TOKEN_FIELDS.has(key)));

  if (Array.isArray(breakdown)) {
    const usable = breakdown.filter(item => item && typeof item === 'object' && hasTokenField(item));
    if (!usable.length) return [{ ...row, model: primaryModel(row) }];
    return usable.map((item, index) => ({
      ...context,
      ...item,
      model: item.model || item.modelName || primaryModel(row, index)
    }));
  }

  if (typeof breakdown === 'object') {
    const usable = Object.entries(breakdown)
      .filter(([, item]) => item && typeof item === 'object' && hasTokenField(item));
    if (!usable.length) return [{ ...row, model: primaryModel(row) }];
    return usable.map(([model, item]) => ({
      ...context,
      ...item,
      model
    }));
  }

  return [{ ...row, model: primaryModel(row) }];
}

function primaryModel(row, index = 0) {
  const models = row.modelsUsed || row.models || row.model;
  if (Array.isArray(models)) return models[index] || models[0] || '<unknown>';
  return models || row.modelName || '<unknown>';
}

function tokenFields(row) {
  const inputTokens = tokenCount(row.inputTokens ?? row.input_tokens ?? row.input);
  const outputTokens = tokenCount(row.outputTokens ?? row.output_tokens ?? row.output);
  const cacheCreationTokens = tokenCount(
    row.cacheCreationTokens
    ?? row.cacheCreationInputTokens
    ?? row.cache_creation_tokens
    ?? row.cacheWriteTokens
  );
  const cacheReadTokens = tokenCount(
    row.cacheReadTokens
    ?? row.cacheReadInputTokens
    ?? row.cache_read_tokens
    ?? row.cachedInputTokens
  );
  const reasoningOutputTokens = tokenCount(row.reasoningTokens ?? row.reasoningOutputTokens ?? row.reasoning_output_tokens);
  const rawTotal = row.totalTokens ?? row.total_tokens;
  const explicitTotal = tokenCount(rawTotal);
  const computedTotal = addTokenCounts(inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, reasoningOutputTokens);
  if (rawTotal != null && explicitTotal !== computedTotal) throw new Error('ccusage totalTokens does not match its token breakdown; review the source report before importing.');
  return {
    inputTokens,
    outputTokens,
    cacheCreationTokens,
    cacheReadTokens,
    cachedInputTokens: 0,
    reasoningOutputTokens,
    totalTokens: explicitTotal || computedTotal
  };
}

function hasTokenField(row) {
  return [
    'inputTokens',
    'input_tokens',
    'outputTokens',
    'output_tokens',
    'cacheCreationTokens',
    'cacheCreationInputTokens',
    'cacheReadTokens',
    'cacheReadInputTokens',
    'reasoningTokens',
    'totalTokens',
    'total_tokens'
  ].some(key => row[key] != null);
}

function sourceFromRow(row) {
  return identityText(row.source || row.tool || row.instance || row.provider, 'source', 80) || 'ccusage';
}

function usageDateFromRow(row) {
  const raw = row.date || row.usageDate || row.week || row.weekStart || row.startDate || row.month || row.blockStart || row.firstActivity || row.lastActivity;
  const date = parseDate(raw);
  if (!date) throw new Error('ccusage row is missing a usable date/month/activity field');
  return formatDate(date);
}

function timestampFromRow(row, usageDate, now) {
  const raw = row.lastActivity || row.blockEnd || row.firstActivity || row.blockStart || row.date || row.week || row.weekStart || row.startDate || row.month;
  const date = parseDate(raw) || parseDate(usageDate) || new Date(now);
  return date.toISOString();
}

function sessionIdFromRow(row, shape, usageDate, model, projectPath) {
  const raw = row.session || row.sessionId || row.session_id || row.id || null;
  if (raw) return String(raw).trim().length <= 240 ? String(raw).trim() : `ccusage:v2:session:${identityDigest(String(raw).trim())}`;
  // Retain old identities only when the old slug was already lossless. This
  // keeps ordinary daily reimports compatible without trusting colliding paths.
  if ((!projectPath || hashable(projectPath) === projectPath) && hashable(model) === model) {
    return `ccusage:${shape}:${projectPath || 'all'}:${usageDate}:${model}`;
  }
  return `ccusage:v2:${shape}:${identityDigest([projectPath, usageDate, model])}`;
}

function eventIdFor({ detectedShape, device, source, usageDate, sessionId, model, timestamp, part }) {
  // A session report is a cumulative snapshot. Its timestamp can advance when
  // re-exported; that must update the existing snapshot rather than add it twice.
  const period = detectedShape === 'session' ? null
    : detectedShape === 'blocks' ? String(part.blockStart || part.firstActivity || part.id || timestamp)
      : usageDate;
  return `ccusage:v2:${detectedShape}:${identityDigest([detectedShape, device, source, sessionId, model, period])}`;
}

function identityDigest(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function mergeUsageRow(map, key, row) {
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { ...row });
    return;
  }
  addTokenFields(existing, row);
  existing.costUSD += row.costUSD || 0;
}

function mergeSessionRow(map, key, row) {
  const existing = map.get(key);
  if (!existing) {
    map.set(key, { ...row });
    return;
  }
  addTokenFields(existing, row);
  existing.costUSD += row.costUSD || 0;
  if (row.lastActivity && (!existing.lastActivity || row.lastActivity > existing.lastActivity)) {
    existing.lastActivity = row.lastActivity;
  }
  if (!existing.projectPath && row.projectPath) existing.projectPath = row.projectPath;
}

function addTokenFields(target, row) {
  for (const key of ['inputTokens', 'outputTokens', 'cacheCreationTokens', 'cacheReadTokens',
    'cachedInputTokens', 'reasoningOutputTokens', 'totalTokens']) {
    target[key] = addTokenCounts(target[key], row[key]);
  }
}

function firstUnsafeKeyPath(value, path = '$') {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = firstUnsafeKeyPath(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  for (const [key, child] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(String(key).toLowerCase())) return `${path}.${key}`;
    const found = firstUnsafeKeyPath(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

function parseDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const normalized = /^\d{4}-\d{2}$/.test(text) ? `${text}-01` : text;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDate(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0')
  ].join('-');
}

function cleanText(value, maxLength) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

function identityText(value, field, maxLength) {
  const text = String(value ?? '').trim();
  if (text.length > maxLength) throw new Error(`ccusage ${field} exceeds ${maxLength} characters; identities cannot be truncated safely.`);
  return text;
}

function number(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function hashable(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'unknown';
}

function providerFromSource(source) {
  const value = String(source || '').toLowerCase();
  if (value.includes('codex') || value.includes('openai')) return 'openai';
  if (value.includes('claude') || value.includes('anthropic')) return 'anthropic';
  if (value.includes('deepseek')) return 'deepseek';
  if (value.includes('mimo') || value.includes('xiaomi')) return 'xiaomi';
  return null;
}

function dedupeWarnings(warnings) {
  const seen = new Set();
  return warnings.filter(warning => {
    const key = `${warning.type}:${warning.model}:${warning.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
