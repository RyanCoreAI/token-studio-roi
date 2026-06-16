import { copyFileSync, createReadStream, existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { URL } from 'node:url';
import {
  attachOfficialPricing,
  officialPricingMetadata
} from './pricing.mjs';
import {
  AUTO_ATTRIBUTION_THRESHOLD,
  buildAutoAttributionPlan
} from './auto-attribution.mjs';
import {
  ANNOTATION_SOURCES,
  DEFAULT_SESSION_ANNOTATION,
  OUTPUT_STATUSES,
  OUTPUT_TYPES,
  PROJECT_ALIAS_MATCH_TYPES,
  TASK_TYPES,
  VALUE_LEVELS,
  WORK_PURPOSES,
  WORK_STAGES,
  applyAutoSessionAnnotations,
  batchUpsertSessionAnnotations,
  defaultDbPath,
  deleteProjectAliasRule,
  deleteSessionAnnotation,
  deleteSessionOutput,
  exportAnnotationData,
  importAnnotationData,
  linkWorkItemSessions,
  listProjectAliasRules,
  listTokenEvents,
  listWorkItems,
  matchProjectAliasRule,
  openDb,
  recordRun,
  deleteWorkItem,
  undoAutoSessionAnnotations,
  upsertDaily,
  upsertProjectAliasRule,
  upsertSession,
  upsertSessionAnnotation,
  upsertSessionOutput,
  upsertWorkItem
} from './db.mjs';
import { loadCollectorConfig } from './collector-config.mjs';
import { detectCollectors } from './collector-registry.mjs';
import { runPrivacyCheck } from './privacy-check.mjs';
import { buildModelPolicy, formatModelPolicyMarkdown } from './model-policy.mjs';
import { buildLiveSnapshot } from './live.mjs';

const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || process.env.BIND_HOST || '127.0.0.1';
const staticDir = existsSync(resolve(process.cwd(), 'dist'))
  ? resolve(process.cwd(), 'dist')
  : resolve(process.cwd(), 'public');
const dbPath = process.env.DB_PATH || defaultDbPath;
const db = openDb(dbPath);
let activeCollection = null;
let collectionState = {
  status: 'idle',
  message: '尚未启动采集',
  startedAt: null,
  finishedAt: null,
  exitCode: null,
  stdout: '',
  stderr: '',
  backup: null
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, url, res);
    return;
  }
  serveStatic(url.pathname, res);
});

server.listen(port, host, () => {
  const displayHost = host === '0.0.0.0' || host === '::' ? 'localhost' : host;
  console.log(`Token Studio ROI: http://${displayHost}:${port} (listening on ${host})`);
  startScheduledCollect();
});

function handleApi(req, url, res) {
  if (url.pathname === '/api/summary') {
    sendJson(res, {
      totals: one(`
        SELECT
          COALESCE(SUM(total_tokens), 0) AS totalTokens,
          COALESCE(SUM(input_tokens), 0) AS inputTokens,
          COALESCE(SUM(output_tokens), 0) AS outputTokens,
          COALESCE(SUM(cache_creation_tokens + cache_read_tokens + cached_input_tokens), 0) AS cacheTokens,
          COALESCE(SUM(reasoning_output_tokens), 0) AS reasoningTokens,
          COALESCE(SUM(cost_usd), 0) AS costUSD
        FROM daily_usage
      `),
      bySource: all(`
        SELECT source, device,
          SUM(total_tokens) AS totalTokens,
          SUM(input_tokens) AS inputTokens,
          SUM(output_tokens) AS outputTokens,
          SUM(cost_usd) AS costUSD
        FROM daily_usage
        GROUP BY source, device
        ORDER BY totalTokens DESC
      `),
      byDay: all(`
        SELECT usage_date AS date, source, SUM(total_tokens) AS totalTokens, SUM(cost_usd) AS costUSD
        FROM daily_usage
        GROUP BY usage_date, source
        ORDER BY usage_date
      `),
      byModel: all(`
        SELECT source, model, SUM(total_tokens) AS totalTokens, SUM(cost_usd) AS costUSD
        FROM daily_usage
        WHERE model != ''
        GROUP BY source, model
        ORDER BY totalTokens DESC
        LIMIT 20
      `),
      topSessions: all(`
        SELECT device, source, session_id AS sessionId, last_activity AS lastActivity,
          project_path AS projectPath, total_tokens AS totalTokens, cost_usd AS costUSD
        FROM session_usage
        ORDER BY total_tokens DESC
        LIMIT 30
      `),
      runs: all(`
        SELECT device, source, status, message, collected_at AS collectedAt
        FROM collection_runs
        ORDER BY id DESC
        LIMIT 20
      `)
    });
    return;
  }
  if (url.pathname === '/api/data') {
    const aliasRules = listProjectAliasRules(db);
    const enabledAliasRules = aliasRules.filter(rule => rule.enabled);
    const rawSessions = all(`
      SELECT s.device, s.source,
        s.session_id AS sessionId,
        s.last_activity AS lastActivity,
        s.project_path AS projectPath,
        s.input_tokens AS inputTokens,
        s.output_tokens AS outputTokens,
        s.cache_creation_tokens AS cacheCreationTokens,
        s.cache_read_tokens AS cacheReadTokens,
        s.cached_input_tokens AS cachedInputTokens,
        s.reasoning_output_tokens AS reasoningOutputTokens,
        s.total_tokens AS totalTokens,
        s.cost_usd AS costUSD,
        a.project_alias AS manualProjectAlias,
        COALESCE(a.task_type, '未分类') AS taskType,
        COALESCE(a.output_status, '未标注') AS outputStatus,
        COALESCE(a.work_purpose, '未说明') AS workPurpose,
        COALESCE(a.work_stage, '未说明') AS workStage,
        COALESCE(a.value_level, '未评估') AS valueLevel,
        a.note,
        a.annotation_source AS annotationSource,
        a.annotation_confidence AS annotationConfidence,
        a.annotation_reason AS annotationReason,
        a.auto_version AS autoVersion,
        a.auto_run_id AS autoRunId,
        a.auto_updated_at AS autoUpdatedAt,
        a.updated_at AS annotationUpdatedAt,
        o.output_url AS outputUrl,
        o.output_label AS outputLabel,
        COALESCE(o.output_type, '未分类') AS outputType,
        o.updated_at AS outputUpdatedAt
      FROM session_usage s
      LEFT JOIN session_annotations a
        ON a.device = s.device
        AND a.source = s.source
        AND a.session_id = s.session_id
      LEFT JOIN session_outputs o
        ON o.device = s.device
        AND o.source = s.source
        AND o.session_id = s.session_id
      ORDER BY s.total_tokens DESC
    `);
    const rawRuns = all(`
      SELECT id, device, source, status, message,
        collected_at AS collectedAt
      FROM collection_runs
      ORDER BY id DESC
    `);

    // Normalize sessions
    const sessions = rawSessions.map(s => {
      const projectPath = (s.projectPath && s.projectPath !== 'Unknown Project')
        ? s.projectPath
        : (s.sessionId ? s.sessionId.split('/').slice(-1)[0] || s.sessionId : null);
      const ruleProjectAlias = matchProjectAliasRule(projectPath, enabledAliasRules);
      const manualProjectAlias = s.manualProjectAlias || null;
      const model = modelFromSessionId(s.sessionId);
      return {
        ...s,
        ...DEFAULT_SESSION_ANNOTATION,
        model,
        lastActivity: s.lastActivity ? s.lastActivity.slice(0, 10) : null,
        projectPath,
        projectAlias: manualProjectAlias || ruleProjectAlias || null,
        manualProjectAlias,
        ruleProjectAlias,
        taskType: s.taskType || DEFAULT_SESSION_ANNOTATION.taskType,
        outputStatus: s.outputStatus || DEFAULT_SESSION_ANNOTATION.outputStatus,
        workPurpose: s.workPurpose || DEFAULT_SESSION_ANNOTATION.workPurpose,
        workStage: s.workStage || DEFAULT_SESSION_ANNOTATION.workStage,
        valueLevel: s.valueLevel || DEFAULT_SESSION_ANNOTATION.valueLevel,
        note: s.note || null,
        annotationSource: s.annotationSource || null,
        annotationConfidence: s.annotationConfidence == null ? null : Number(s.annotationConfidence),
        annotationReason: s.annotationReason || null,
        autoVersion: s.autoVersion || null,
        autoRunId: s.autoRunId || null,
        autoUpdatedAt: s.autoUpdatedAt || null,
        attributionQuality: attributionQuality(s.annotationSource, s.annotationConfidence, s.annotationUpdatedAt),
        annotationUpdatedAt: s.annotationUpdatedAt || null,
        outputUrl: s.outputUrl || null,
        outputLabel: s.outputLabel || null,
        outputType: s.outputType || DEFAULT_SESSION_ANNOTATION.outputType,
        outputUpdatedAt: s.outputUpdatedAt || null
      };
    });

    // Build (device, source) -> projectPath map for enriching daily rows
    // Use the project with the most tokens for each (device, source) pair
    const projMap = new Map();
    for (const s of rawSessions) {
      const proj = (s.projectPath && s.projectPath !== 'Unknown Project')
        ? s.projectPath
        : (s.sessionId ? s.sessionId.split('/').slice(-1)[0] || s.sessionId : null);
      if (!proj) continue;
      const key = `${s.device}::${s.source}`;
      const cur = projMap.get(key);
      if (!cur || s.totalTokens > cur.tokens) {
        projMap.set(key, { project: proj, tokens: s.totalTokens });
      }
    }

    const rawDaily = all(`
      SELECT rowid AS id, device, source,
        usage_date AS usageDate, model,
        input_tokens AS inputTokens,
        output_tokens AS outputTokens,
        cache_creation_tokens AS cacheCreationTokens,
        cache_read_tokens AS cacheReadTokens,
        cached_input_tokens AS cachedInputTokens,
        reasoning_output_tokens AS reasoningOutputTokens,
        total_tokens AS totalTokens,
        cost_usd AS costUSD
      FROM daily_usage
      ORDER BY usage_date DESC
    `);
    const daily = rawDaily.map(d => attachOfficialPricing({
      ...d,
      projectPath: projMap.get(`${d.device}::${d.source}`)?.project || null
    }, d.model, providerFromSource(d.source)));
    const pricedSessions = sessions.map(s => attachOfficialPricing(
      s,
      s.model,
      providerFromSource(s.source)
    ));

    sendJson(res, {
      meta: {
        taskTypes: TASK_TYPES,
        outputStatuses: OUTPUT_STATUSES,
        workPurposes: WORK_PURPOSES,
        workStages: WORK_STAGES,
        valueLevels: VALUE_LEVELS,
        annotationSources: ANNOTATION_SOURCES,
        outputTypes: OUTPUT_TYPES,
        projectAliasMatchTypes: PROJECT_ALIAS_MATCH_TYPES,
        projectAliasRules: aliasRules,
        demoMode: process.env.TOKEN_STUDIO_DEMO_MODE === '1',
        officialPricing: officialPricingMetadata(daily)
      },
      daily,
      sessions: pricedSessions,
      workItems: listWorkItems(db),
      tokenEvents: listTokenEvents(db, { limit: 1000 }),
      // Normalize runs: strip newlines from messages, shorten device names
      runs: rawRuns.map(r => ({
        ...r,
        message: r.message ? r.message.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim() : '',
        device: r.device ? r.device.replace(/\.local$/, '').replace(/^(.{30}).+$/, '$1…') : r.device
      }))
    });
    return;
  }
  if (url.pathname === '/api/collectors' && req.method === 'GET') {
    sendJson(res, { collectors: detectCollectors() });
    return;
  }
  if (url.pathname === '/api/live' && req.method === 'GET') {
    if (!validateLocalRead(req, res, '实时监控接口')) return;
    sendJson(res, buildLiveSnapshot({
      sessions: liveSessions(),
      tokenEvents: liveTokenEvents(),
      runs: all(`
        SELECT device, source, status, message, collected_at AS collectedAt
        FROM collection_runs
        ORDER BY id DESC
        LIMIT 5
      `),
      windowMinutes: Number(url.searchParams.get('windowMinutes') || 15)
    }));
    return;
  }
  if (url.pathname === '/api/privacy-check' && req.method === 'GET') {
    if (!validateLocalRead(req, res, '隐私检查接口')) return;
    sendJson(res, runPrivacyCheck());
    return;
  }
  if (url.pathname === '/api/model-policy.md' && req.method === 'GET') {
    if (!validateLocalRead(req, res, '模型策略接口')) return;
    const { sessions } = buildAutoAttributionContext();
    sendText(res, formatModelPolicyMarkdown(buildModelPolicy({ sessions })), 'text/markdown; charset=utf-8');
    return;
  }
  if (url.pathname === '/api/work-items' && req.method === 'GET') {
    sendJson(res, { workItems: listWorkItems(db) });
    return;
  }
  if (url.pathname === '/api/work-items' && req.method === 'POST') {
    handleWorkItemUpsert(req, res);
    return;
  }
  if (url.pathname === '/api/work-items/link-sessions' && req.method === 'POST') {
    handleWorkItemLinkSessions(req, res);
    return;
  }
  if (url.pathname.startsWith('/api/work-items/') && req.method === 'DELETE') {
    handleWorkItemDelete(req, url, res);
    return;
  }
  if (url.pathname === '/api/project-alias-rules' && req.method === 'GET') {
    sendJson(res, { rules: listProjectAliasRules(db), matchTypes: PROJECT_ALIAS_MATCH_TYPES });
    return;
  }
  if (url.pathname === '/api/auto-attribution/suggestions' && req.method === 'GET') {
    handleAutoAttributionSuggestions(req, url, res);
    return;
  }
  if (url.pathname === '/api/auto-attribution/apply' && req.method === 'POST') {
    handleAutoAttributionApply(req, res);
    return;
  }
  if (url.pathname === '/api/auto-attribution/undo' && req.method === 'POST') {
    handleAutoAttributionUndo(req, res);
    return;
  }
  if (url.pathname === '/api/project-alias-rules' && req.method === 'POST') {
    handleProjectAliasRuleUpsert(req, res);
    return;
  }
  if (url.pathname === '/api/project-alias-rules' && req.method === 'DELETE') {
    handleProjectAliasRuleDelete(req, url, res);
    return;
  }
  if (url.pathname === '/api/session-annotations/batch' && req.method === 'POST') {
    handleSessionAnnotationBatch(req, res);
    return;
  }
  if (url.pathname === '/api/session-annotations' && req.method === 'POST') {
    handleSessionAnnotationUpsert(req, res);
    return;
  }
  if (url.pathname === '/api/session-annotations' && req.method === 'DELETE') {
    handleSessionAnnotationDelete(req, url, res);
    return;
  }
  if (url.pathname === '/api/session-outputs' && req.method === 'POST') {
    handleSessionOutputUpsert(req, res);
    return;
  }
  if (url.pathname === '/api/session-outputs' && req.method === 'DELETE') {
    handleSessionOutputDelete(req, url, res);
    return;
  }
  if (url.pathname === '/api/backup' && req.method === 'POST') {
    handleBackup(req, res);
    return;
  }
  if (url.pathname === '/api/export/annotations' && req.method === 'GET') {
    handleExportAnnotations(req, res);
    return;
  }
  if (url.pathname === '/api/import/annotations' && req.method === 'POST') {
    handleImportAnnotations(req, res);
    return;
  }
  if (url.pathname === '/api/ingest' && req.method === 'POST') {
    handleIngest(req, res);
    return;
  }
  if (url.pathname === '/api/collect' && req.method === 'POST') {
    handleCollect(req, res);
    return;
  }
  if (url.pathname === '/api/collect/status') {
    sendJson(res, collectionState);
    return;
  }
  sendJson(res, { error: 'Not found' }, 404);
}

async function handleProjectAliasRuleUpsert(req, res) {
  if (!validateLocalJsonWrite(req, res, '项目别名规则接口')) return;

  try {
    const rule = upsertProjectAliasRule(db, await readJson(req, 64 * 1024));
    sendJson(res, { ok: true, rule: { ...rule, enabled: Boolean(rule.enabled) } });
  } catch (error) {
    sendJson(res, { error: error.message }, 400);
  }
}

async function handleWorkItemUpsert(req, res) {
  if (!validateLocalJsonWrite(req, res, '工作项接口')) return;

  try {
    const workItem = upsertWorkItem(db, await readJson(req, 128 * 1024));
    sendJson(res, { ok: true, workItem });
  } catch (error) {
    sendJson(res, { error: error.message }, 400);
  }
}

async function handleWorkItemLinkSessions(req, res) {
  if (!validateLocalJsonWrite(req, res, '工作项绑定接口')) return;

  try {
    const result = linkWorkItemSessions(db, await readJson(req, 256 * 1024));
    sendJson(res, { ok: true, ...result });
  } catch (error) {
    sendJson(res, { error: error.message }, 400);
  }
}

async function handleWorkItemDelete(req, url, res) {
  if (!validateLocalJsonWrite(req, res, '工作项接口')) return;

  try {
    const id = url.pathname.split('/').pop();
    const deleted = deleteWorkItem(db, { id });
    sendJson(res, { ok: true, deleted });
  } catch (error) {
    sendJson(res, { error: error.message }, 400);
  }
}

async function handleProjectAliasRuleDelete(req, url, res) {
  if (!validateLocalJsonWrite(req, res, '项目别名规则接口')) return;

  try {
    const payload = req.headers['content-length'] === '0'
      ? Object.fromEntries(url.searchParams.entries())
      : { ...Object.fromEntries(url.searchParams.entries()), ...await readJson(req, 64 * 1024) };
    const deleted = deleteProjectAliasRule(db, payload);
    sendJson(res, { ok: true, deleted });
  } catch (error) {
    sendJson(res, { error: error.message }, 400);
  }
}

function handleAutoAttributionSuggestions(req, url, res) {
  if (!validateLocalRead(req, res, '自动归因建议接口')) return;

  const threshold = parseThreshold(url.searchParams.get('threshold'));
  const { sessions, projectAliasRules } = buildAutoAttributionContext();
  const plan = buildAutoAttributionPlan({ sessions, projectAliasRules, threshold });
  sendJson(res, { ok: true, plan });
}

async function handleAutoAttributionApply(req, res) {
  if (!validateLocalJsonWrite(req, res, '自动归因接口')) return;

  try {
    const payload = await readJson(req, 256 * 1024);
    const threshold = parseThreshold(payload.threshold);
    const requested = identitySet(payload.sessions);
    const { sessions, projectAliasRules } = buildAutoAttributionContext();
    const plan = buildAutoAttributionPlan({ sessions, projectAliasRules, threshold });
    const suggestions = plan.suggestions.filter(item =>
      item.canApply && (!requested || requested.has(identityKey(item)))
    );
    if (!suggestions.length) {
      sendJson(res, { ok: true, applied: 0, skippedLowConfidence: plan.lowConfidenceCount, skippedProtected: 0, runId: null, backup: null, plan });
      return;
    }
    const backup = createDbBackup({ reason: 'auto-attribution' });
    const result = applyAutoSessionAnnotations(db, suggestions, {
      threshold,
      runId: payload.runId || undefined
    });
    sendJson(res, { ok: true, ...result, backup, plan });
  } catch (error) {
    sendJson(res, { error: error.message }, 400);
  }
}

async function handleAutoAttributionUndo(req, res) {
  if (!validateLocalJsonWrite(req, res, '自动归因撤销接口')) return;

  try {
    const payload = await readJson(req, 64 * 1024);
    const backup = createDbBackup({ reason: 'auto-attribution-undo' });
    const deleted = undoAutoSessionAnnotations(db, payload);
    sendJson(res, { ok: true, deleted, runId: payload.runId || payload.autoRunId || payload.auto_run_id, backup });
  } catch (error) {
    sendJson(res, { error: error.message }, 400);
  }
}

async function handleSessionAnnotationBatch(req, res) {
  if (!validateLocalJsonWrite(req, res, '批量标注接口')) return;

  try {
    const result = batchUpsertSessionAnnotations(db, await readJson(req, 512 * 1024));
    sendJson(res, { ok: true, ...result });
  } catch (error) {
    sendJson(res, { error: error.message }, 400);
  }
}

async function handleSessionAnnotationUpsert(req, res) {
  if (!validateLocalJsonWrite(req, res, '标注接口')) return;

  try {
    const annotation = upsertSessionAnnotation(db, await readJson(req, 64 * 1024));
    sendJson(res, { ok: true, annotation });
  } catch (error) {
    sendJson(res, { error: error.message }, 400);
  }
}

async function handleSessionAnnotationDelete(req, url, res) {
  if (!validateLocalJsonWrite(req, res, '标注接口')) return;

  try {
    const payload = req.headers['content-length'] === '0'
      ? Object.fromEntries(url.searchParams.entries())
      : { ...Object.fromEntries(url.searchParams.entries()), ...await readJson(req, 64 * 1024) };
    const deleted = deleteSessionAnnotation(db, payload);
    sendJson(res, { ok: true, deleted });
  } catch (error) {
    sendJson(res, { error: error.message }, 400);
  }
}

async function handleSessionOutputUpsert(req, res) {
  if (!validateLocalJsonWrite(req, res, '产出链接接口')) return;

  try {
    const output = upsertSessionOutput(db, await readJson(req, 64 * 1024));
    sendJson(res, { ok: true, output });
  } catch (error) {
    sendJson(res, { error: error.message }, 400);
  }
}

async function handleSessionOutputDelete(req, url, res) {
  if (!validateLocalJsonWrite(req, res, '产出链接接口')) return;

  try {
    const payload = req.headers['content-length'] === '0'
      ? Object.fromEntries(url.searchParams.entries())
      : { ...Object.fromEntries(url.searchParams.entries()), ...await readJson(req, 64 * 1024) };
    const deleted = deleteSessionOutput(db, payload);
    sendJson(res, { ok: true, deleted });
  } catch (error) {
    sendJson(res, { error: error.message }, 400);
  }
}

async function handleBackup(req, res) {
  if (!validateLocalJsonWrite(req, res, '备份接口')) return;

  try {
    await readJson(req, 64 * 1024);
    const backup = createDbBackup({ reason: 'manual' });
    sendJson(res, { ok: true, backup });
  } catch (error) {
    sendJson(res, { error: error.message }, 500);
  }
}

function handleExportAnnotations(req, res) {
  if (!validateLocalRead(req, res, '导出接口')) return;
  sendJson(res, exportAnnotationData(db));
}

async function handleImportAnnotations(req, res) {
  if (!validateLocalJsonWrite(req, res, '导入接口')) return;

  try {
    const result = importAnnotationData(db, await readJson(req, 5 * 1024 * 1024));
    sendJson(res, { ok: true, imported: result });
  } catch (error) {
    sendJson(res, { error: error.message }, 400);
  }
}

function handleCollect(req, res) {
  if (!validateLocalJsonWrite(req, res, '采集接口')) return;

  try {
    const started = startCollection({ reason: 'manual', requireBackup: true });
    if (!started) {
      sendJson(res, { ...collectionState, error: '采集正在运行' }, 409);
      return;
    }
    sendJson(res, collectionState, 202);
  } catch (error) {
    sendJson(res, { error: error.message }, 500);
  }
}

function startCollection({ reason = 'manual', requireBackup = false } = {}) {
  if (activeCollection) {
    return false;
  }

  const backup = requireBackup ? createDbBackup({ reason: reason === 'scheduled' ? 'scheduled-collect' : 'collect' }) : null;
  const args = ['src/collect.mjs'];
  const device = collectionDevice();
  if (device) args.push('--device', device);
  if (process.env.DB_PATH) args.push('--db', process.env.DB_PATH);

  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: process.env,
    windowsHide: true
  });

  activeCollection = child;
  let stdout = '';
  let stderr = '';
  const startedAt = new Date().toISOString();
  collectionState = {
    status: 'running',
    message: reason === 'scheduled' ? '正在定时采集本机用量' : '正在采集本机用量',
    startedAt,
    finishedAt: null,
    exitCode: null,
    stdout: '',
    stderr: '',
    backup
  };

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });

  child.on('error', error => {
    activeCollection = null;
    collectionState = {
      ...collectionState,
      status: 'error',
      message: error.message,
      finishedAt: new Date().toISOString(),
      stderr: error.message,
      backup
    };
  });

  child.on('close', code => {
    activeCollection = null;
    collectionState = {
      status: code === 0 ? 'ok' : 'error',
      message: code === 0 ? '采集完成' : '采集失败',
      exitCode: code,
      startedAt,
      finishedAt: new Date().toISOString(),
      stdout: trimOutput(stdout),
      stderr: trimOutput(stderr),
      backup
    };
  });

  return true;
}

function startScheduledCollect() {
  const schedule = scheduledCollectConfig();
  if (!schedule.enabled) return;

  console.log(`[collect:schedule] enabled interval=${schedule.intervalSeconds}s runOnStart=${schedule.runOnStart}`);

  const run = () => {
    try {
      const started = startCollection({ reason: 'scheduled', requireBackup: true });
      if (!started) console.log('[collect:schedule] skipped because a collection is already running');
    } catch (error) {
      console.log(`[collect:schedule] skipped because backup failed: ${error.message}`);
    }
  };

  if (schedule.runOnStart) {
    setTimeout(run, 1000);
  }

  setInterval(run, schedule.intervalSeconds * 1000);
}

function scheduledCollectConfig() {
  const config = loadCollectorConfig().scheduledCollect || {};
  const enabled = envBool('SCHEDULED_COLLECT_ENABLED', config.enabled ?? false);
  const intervalSeconds = Math.max(
    10,
    envNumber('SCHEDULED_COLLECT_INTERVAL_SECONDS',
      envNumber('COLLECT_INTERVAL_SECONDS', config.intervalSeconds ?? 300))
  );
  const runOnStart = envBool('SCHEDULED_COLLECT_RUN_ON_START', config.runOnStart ?? false);
  return { enabled, intervalSeconds, runOnStart };
}

function collectionDevice() {
  const config = loadCollectorConfig().scheduledCollect || {};
  return process.env.COLLECT_DEVICE || process.env.SCHEDULED_COLLECT_DEVICE || config.device || null;
}

function envBool(name, fallback) {
  const value = process.env[name];
  if (value == null || value === '') return Boolean(fallback);
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : Number(fallback);
}

async function handleIngest(req, res) {
  if (!isJsonRequest(req)) {
    sendJson(res, { error: 'Content-Type must be application/json' }, 415);
    return;
  }

  const expectedToken = process.env.INGEST_TOKEN;
  if (expectedToken) {
    const actualToken = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (actualToken !== expectedToken) {
      sendJson(res, { error: 'Unauthorized' }, 401);
      return;
    }
  }

  try {
    const payload = await readJson(req);
    const dailyRows = Array.isArray(payload.daily) ? payload.daily : [];
    const sessionRows = Array.isArray(payload.sessions) ? payload.sessions : [];
    const runRows = Array.isArray(payload.runs) ? payload.runs : [];

    db.exec('BEGIN');
    try {
      dailyRows.forEach((row) => upsertDaily(db, row));
      sessionRows.forEach((row) => upsertSession(db, row));
      runRows.forEach((row) => recordRun(db, row));
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    sendJson(res, { ok: true, daily: dailyRows.length, sessions: sessionRows.length, runs: runRows.length });
  } catch (error) {
    sendJson(res, { error: error.message }, 400);
  }
}

function serveStatic(pathname, res) {
  const filePath = pathname === '/' ? join(staticDir, 'index.html')
    : pathname === '/review' ? join(staticDir, 'index.html')
      : pathname === '/live' ? join(staticDir, 'index.html')
    : join(staticDir, pathname);
  if (!filePath.startsWith(staticDir) || !existsSync(filePath)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }
  res.writeHead(200, { 'content-type': contentType(filePath) });
  createReadStream(filePath).pipe(res);
}

function one(sql) {
  return db.prepare(sql).get();
}

function all(sql) {
  return db.prepare(sql).all();
}

function liveSessions() {
  return all(`
    SELECT device, source, session_id AS sessionId, last_activity AS lastActivity,
      project_path AS projectPath,
      input_tokens AS inputTokens,
      output_tokens AS outputTokens,
      cache_creation_tokens AS cacheCreationTokens,
      cache_read_tokens AS cacheReadTokens,
      cached_input_tokens AS cachedInputTokens,
      reasoning_output_tokens AS reasoningOutputTokens,
      total_tokens AS totalTokens,
      cost_usd AS costUSD
    FROM session_usage
    ORDER BY last_activity DESC
    LIMIT 100
  `).map(session => ({
    ...session,
    model: modelFromSessionId(session.sessionId),
    cacheReadTokens: Number(session.cacheReadTokens || 0) + Number(session.cachedInputTokens || 0)
  }));
}

function liveTokenEvents() {
  return all(`
    SELECT event_id AS eventId, device, source, session_id AS sessionId,
      timestamp, model,
      input_tokens AS inputTokens,
      output_tokens AS outputTokens,
      cache_read_tokens AS cacheReadTokens,
      cache_creation_tokens AS cacheCreationTokens,
      reasoning_tokens AS reasoningTokens,
      tool_category AS toolCategory,
      file_extension AS fileExtension
    FROM token_events
    ORDER BY timestamp DESC
    LIMIT 500
  `);
}

function buildAutoAttributionContext() {
  const aliasRules = listProjectAliasRules(db);
  const enabledAliasRules = aliasRules.filter(rule => rule.enabled);
  const rawSessions = all(`
    SELECT s.device, s.source,
      s.session_id AS sessionId,
      s.last_activity AS lastActivity,
      s.project_path AS projectPath,
      s.input_tokens AS inputTokens,
      s.output_tokens AS outputTokens,
      s.cache_creation_tokens AS cacheCreationTokens,
      s.cache_read_tokens AS cacheReadTokens,
      s.cached_input_tokens AS cachedInputTokens,
      s.reasoning_output_tokens AS reasoningOutputTokens,
      s.total_tokens AS totalTokens,
      s.cost_usd AS costUSD,
      a.project_alias AS manualProjectAlias,
      COALESCE(a.task_type, '未分类') AS taskType,
      COALESCE(a.output_status, '未标注') AS outputStatus,
      COALESCE(a.work_purpose, '未说明') AS workPurpose,
      COALESCE(a.work_stage, '未说明') AS workStage,
      COALESCE(a.value_level, '未评估') AS valueLevel,
      a.note,
      a.annotation_source AS annotationSource,
      a.annotation_confidence AS annotationConfidence,
      a.annotation_reason AS annotationReason,
      a.auto_version AS autoVersion,
      a.auto_run_id AS autoRunId,
      a.auto_updated_at AS autoUpdatedAt,
      a.updated_at AS annotationUpdatedAt,
      o.output_url AS outputUrl,
      o.output_label AS outputLabel,
      COALESCE(o.output_type, '未分类') AS outputType,
      o.updated_at AS outputUpdatedAt
    FROM session_usage s
    LEFT JOIN session_annotations a
      ON a.device = s.device
      AND a.source = s.source
      AND a.session_id = s.session_id
    LEFT JOIN session_outputs o
      ON o.device = s.device
      AND o.source = s.source
      AND o.session_id = s.session_id
    ORDER BY s.total_tokens DESC
  `);
  const sessions = rawSessions.map(s => {
    const projectPath = normalizeProjectPath(s.projectPath, s.sessionId);
    const ruleProjectAlias = matchProjectAliasRule(projectPath, enabledAliasRules);
    const model = modelFromSessionId(s.sessionId);
    return attachOfficialPricing({
      ...s,
      ...DEFAULT_SESSION_ANNOTATION,
      model,
      lastActivity: s.lastActivity ? s.lastActivity.slice(0, 10) : null,
      projectPath,
      projectAlias: s.manualProjectAlias || ruleProjectAlias || null,
      manualProjectAlias: s.manualProjectAlias || null,
      ruleProjectAlias,
      taskType: s.taskType || DEFAULT_SESSION_ANNOTATION.taskType,
      outputStatus: s.outputStatus || DEFAULT_SESSION_ANNOTATION.outputStatus,
      workPurpose: s.workPurpose || DEFAULT_SESSION_ANNOTATION.workPurpose,
      workStage: s.workStage || DEFAULT_SESSION_ANNOTATION.workStage,
      valueLevel: s.valueLevel || DEFAULT_SESSION_ANNOTATION.valueLevel,
      note: s.note || null,
      annotationSource: s.annotationSource || null,
      annotationConfidence: s.annotationConfidence == null ? null : Number(s.annotationConfidence),
      annotationReason: s.annotationReason || null,
      autoVersion: s.autoVersion || null,
      autoRunId: s.autoRunId || null,
      autoUpdatedAt: s.autoUpdatedAt || null,
      attributionQuality: attributionQuality(s.annotationSource, s.annotationConfidence, s.annotationUpdatedAt),
      annotationUpdatedAt: s.annotationUpdatedAt || null,
      outputUrl: s.outputUrl || null,
      outputLabel: s.outputLabel || null,
      outputType: s.outputType || DEFAULT_SESSION_ANNOTATION.outputType,
      outputUpdatedAt: s.outputUpdatedAt || null
    }, model, providerFromSource(s.source));
  });
  return { sessions, projectAliasRules: aliasRules };
}

function normalizeProjectPath(projectPath, sessionId) {
  return (projectPath && projectPath !== 'Unknown Project')
    ? projectPath
    : (sessionId ? sessionId.split('/').slice(-1)[0] || sessionId : null);
}

function attributionQuality(source, confidence, updatedAt) {
  if (!updatedAt) return 'missing';
  if (source === 'auto') return Number(confidence || 0) >= AUTO_ATTRIBUTION_THRESHOLD ? 'auto-high' : 'auto-low';
  return 'manual';
}

function parseThreshold(value) {
  const parsed = Number(value ?? AUTO_ATTRIBUTION_THRESHOLD);
  if (!Number.isFinite(parsed)) return AUTO_ATTRIBUTION_THRESHOLD;
  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function identitySet(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return new Set(rows.map(identityKey));
}

function identityKey(row = {}) {
  return `${row.device || ''}::${row.source || ''}::${row.sessionId || row.session_id || ''}`;
}

function providerFromSource(source) {
  const value = String(source || '').toLowerCase();
  if (value.includes('codex') || value.includes('openai')) return 'openai';
  if (value.includes('claude') || value.includes('anthropic')) return 'anthropic';
  if (value.includes('deepseek')) return 'deepseek';
  if (value.includes('mimo') || value.includes('xiaomi')) return 'xiaomi';
  return null;
}

function modelFromSessionId(sessionId) {
  const text = String(sessionId || '').trim();
  if (!text) return null;
  if (text.startsWith('local:')) return text.split(':').at(-1) || null;
  return null;
}

function sendJson(res, value, status = 200) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

function sendText(res, value, contentType = 'text/plain; charset=utf-8', status = 200) {
  res.writeHead(status, { 'content-type': contentType });
  res.end(value);
}

function createDbBackup({ reason = 'manual' } = {}) {
  const createdAt = new Date().toISOString();
  const stamp = createdAt.replace(/[:.]/g, '-');
  const safeReason = String(reason || 'manual').replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const backupDir = process.env.BACKUP_DIR || join(dirname(dbPath), 'backups');
  mkdirSync(backupDir, { recursive: true });
  db.exec('PRAGMA wal_checkpoint(FULL)');
  const fileName = `usage-${stamp}-${safeReason}.sqlite`;
  const backupPath = join(backupDir, fileName);
  copyFileSync(dbPath, backupPath);
  return { createdAt, path: backupPath, fileName };
}

function trimOutput(value) {
  const text = String(value || '').trim();
  return text.length > 12000 ? `${text.slice(-12000)}` : text;
}

function isLoopback(address = '') {
  const value = String(address || '').toLowerCase().replace(/^\[/, '').replace(/\]$/, '');
  return value.startsWith('127.')
    || value === '::1'
    || value.startsWith('::ffff:127.')
    || value === 'localhost';
}

function validateLocalJsonWrite(req, res, label) {
  if (!validateLocalRead(req, res, label)) return false;
  if (!isJsonRequest(req)) {
    sendJson(res, { error: 'Content-Type must be application/json' }, 415);
    return false;
  }
  return true;
}

function validateLocalRead(req, res, label) {
  if (!isLoopback(req.socket.remoteAddress)) {
    sendJson(res, { error: `${label}仅允许本机访问` }, 403);
    return false;
  }
  if (!isLocalOrigin(req.headers.origin)) {
    sendJson(res, { error: `${label}仅允许来自本机页面` }, 403);
    return false;
  }
  return true;
}

function isLocalOrigin(origin) {
  if (!origin) return true;
  try {
    const { hostname } = new URL(origin);
    return isLoopback(hostname);
  } catch {
    return false;
  }
}

function isJsonRequest(req) {
  const contentType = req.headers['content-type'] || '';
  return /^application\/json(?:\s*;|$)/i.test(contentType);
}

function readJson(req, maxBytes = 50 * 1024 * 1024) {
  return new Promise((resolveRequest, rejectRequest) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > maxBytes) {
        rejectRequest(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolveRequest(JSON.parse(body || '{}'));
      } catch (error) {
        rejectRequest(error);
      }
    });
    req.on('error', rejectRequest);
  });
}

function contentType(filePath) {
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.jsx': 'application/javascript; charset=utf-8'
  };
  return types[extname(filePath)] || 'application/octet-stream';
}
