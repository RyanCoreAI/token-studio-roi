#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { hostname } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { seedDemoDatabase } from './demo-seed.mjs';
import { auditExperimentalCollectors, detectCollectors } from './collector-registry.mjs';
import { CCUSAGE_CLI_REPORTS, ccusageInvocation, runCcusageCliImportPlan } from './ccusage-bridge.mjs';
import { applyCcusageImport, parseCcusageJsonText, planCcusageImport, readCcusageImportInput } from './ccusage-import.mjs';
import { createSqliteBackup, defaultDbPath, deleteBudgetProfile, listBudgetProfiles, openDb, openReadOnlyDb, upsertBudgetProfile } from './db.mjs';
import { formatPrivacyCheckReport, runPrivacyCheck } from './privacy-check.mjs';
import { buildTerminalReport, formatTerminalReport } from './terminal-report.mjs';
import { buildEmptyStatuslineSnapshot, buildStatuslineSnapshot, formatStatuslineText } from './statusline.mjs';
import { buildModelPolicy, formatModelPolicy } from './model-policy.mjs';
import { resolveViteBin } from './runtime-paths.mjs';

const command = process.argv[2] || 'help';
const args = parseArgs(process.argv.slice(3));
const SOURCE_DIR = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(SOURCE_DIR, '..');
const USER_CWD = process.cwd();
const requireFromCli = createRequire(import.meta.url);

try {
  if (command === 'start') {
    await startCommand({ demo: false });
  } else if (command === 'open') {
    await startCommand({ demo: false, openBrowser: true });
  } else if (command === 'demo') {
    await demoCommand();
  } else if (command === 'live') {
    await startCommand({ demo: false, route: '/live' });
  } else if (command === 'statusline') {
    await statuslineCommand();
  } else if (command === 'collect') {
    await collectCommand();
  } else if (command === 'collectors') {
    await collectorsCommand();
  } else if (command === 'import-usage') {
    await importUsageCommand();
  } else if (command === 'budget') {
    await budgetCommand();
  } else if (command === 'report') {
    await reportCommand();
  } else if (command === 'policy') {
    await policyCommand();
  } else if (command === 'doctor') {
    await doctorCommand();
  } else if (command === 'privacy-check') {
    await privacyCheckCommand();
  } else {
    printHelp();
    process.exit(command === 'help' || command === '--help' || command === '-h' ? 0 : 1);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

async function demoCommand() {
  const dbPath = resolve(USER_CWD, args.db || 'data/demo.sqlite');
  const result = seedDemoDatabase({
    dbPath,
    demoPath: resolve(PACKAGE_ROOT, 'docs', 'demo-data', 'token-studio-v2-demo.json')
  });
  console.log(`[demo] seeded ${result.sessions} sessions and ${result.daily} daily rows into ${result.dbPath}`);
  if (args.seedOnly) return;
  await startCommand({ demo: true, dbPath });
}

async function startCommand({ demo = false, dbPath = null, route = '/', openBrowser = false } = {}) {
  const apiPort = Number(args.apiPort || args.port || await freePort(4173));
  const uiPort = Number(args.uiPort || await freePort(5173));
  const env = {
    ...process.env,
    PORT: String(apiPort),
    API_PORT: String(apiPort),
    DB_PATH: dbPath || resolve(USER_CWD, args.db || process.env.DB_PATH || 'data/usage.sqlite'),
    TOKEN_STUDIO_DEMO_MODE: demo ? '1' : process.env.TOKEN_STUDIO_DEMO_MODE || ''
  };
  const viteBin = resolveViteBin({ packageRoot: PACKAGE_ROOT, requireLike: requireFromCli });
  const server = spawn(process.execPath, [resolve(SOURCE_DIR, 'server.mjs')], {
    cwd: PACKAGE_ROOT,
    env,
    stdio: 'inherit',
    windowsHide: true
  });
  const client = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(uiPort)], {
    cwd: PACKAGE_ROOT,
    env,
    stdio: 'inherit',
    windowsHide: true
  });
  const uiUrl = `http://127.0.0.1:${uiPort}${route}`;
  console.log(`[token-studio] UI  ${uiUrl}${demo ? '  (Demo Mode)' : ''}`);
  console.log(`[token-studio] API http://127.0.0.1:${apiPort}`);
  if (openBrowser) {
    setTimeout(() => openUrl(uiUrl), 900).unref?.();
  }
  await waitForChildren([server, client]);
}

async function collectCommand() {
  const sources = args.sources || args.collectors || 'claude,codex';
  const confirmed = args.yes || process.env.TOKEN_STUDIO_COLLECT_CONFIRMED === '1'
    || await confirmCollect(sources);
  if (!confirmed) {
    throw new Error('Collection cancelled. No local AI logs were scanned.');
  }
  const collectArgs = ['src/collect.mjs', '--sources', sources];
  if (args.db) collectArgs.push('--db', args.db);
  const child = spawn(process.execPath, collectArgs, {
    cwd: PACKAGE_ROOT,
    env: {
      ...process.env,
      TOKEN_STUDIO_COLLECTORS: sources
    },
    stdio: 'inherit',
    windowsHide: true
  });
  const code = await childExitCode(child);
  process.exitCode = code;
}

async function doctorCommand() {
  const collectors = detectCollectors();
  console.log('Token Studio Doctor');
  console.log(`node=${process.version}`);
  console.log(`cwd=${process.cwd()}`);
  console.log(`db=${args.db || process.env.DB_PATH || 'data/usage.sqlite'}`);
  console.log('');
  console.log('Collectors');
  for (const item of collectors) {
    console.log(`- ${item.id}: ${item.supportStatus}, detected=${item.detected ? 'yes' : 'no'}, privacy=${item.privacyLevel}`);
    if (item.existingRoots.length) console.log(`  roots=${item.existingRoots.join('; ')}`);
    if (item.note) console.log(`  note=${item.note}`);
  }
}

async function collectorsCommand() {
  if (args.audit) {
    const audit = await auditExperimentalCollectors();
    if (args.json) {
      console.log(JSON.stringify(audit, null, 2));
      return;
    }
    console.log('Token Studio Collector Audit');
    console.log(`auditedAt=${audit.auditedAt}`);
    console.log(`totals: files=${audit.totals.candidateFiles}, usable=${audit.totals.usableTokenRecords}, noToken=${audit.totals.skippedNoTokenRecords}, unsafe=${audit.totals.skippedConversationLikeRecords}, oversized=${audit.totals.skippedOversizedFiles}, parseErrors=${audit.totals.parseErrors}`);
    for (const item of audit.collectors) {
      const s = item.summary;
      console.log(`- ${item.id}: detected=${item.detected ? 'yes' : 'no'}, files=${s.candidateFiles}, usable=${s.usableTokenRecords}, noToken=${s.skippedNoTokenRecords}, unsafe=${s.skippedConversationLikeRecords}, oversized=${s.skippedOversizedFiles}, parseErrors=${s.parseErrors}`);
    }
    return;
  }

  const collectors = detectCollectors();
  if (args.json) {
    console.log(JSON.stringify({ collectors }, null, 2));
    return;
  }

  console.log('Token Studio Collectors');
  for (const item of collectors) {
    console.log(`- ${item.id}: ${item.label}`);
    console.log(`  status=${item.supportStatus}, default=${item.defaultEnabled ? 'yes' : 'no'}, detected=${item.detected ? 'yes' : 'no'}`);
    console.log(`  privacy=${item.privacyLevel}, readsConversationContent=${item.readsConversationContent ? 'yes' : 'no'}, tokenReliability=${item.tokenReliability}`);
    console.log(`  fields=${item.dataFields.join(',') || 'none'}`);
    if (item.note) console.log(`  note=${item.note}`);
  }
}

async function importUsageCommand() {
  if (args.help) {
    printImportUsageHelp();
    return;
  }
  const format = args.format || 'ccusage-json';
  if (args.apply && args.dryRun) {
    throw new Error('Choose either --apply or --dry-run, not both.');
  }
  const { plan, bridge } = await buildImportUsagePlan(format);
  const summary = {
    ok: true,
    format,
    mode: args.apply ? 'apply' : 'dry-run',
    detectedShape: plan.detectedShape,
    daily: plan.daily.length,
    sessions: plan.sessions.length,
    tokenEvents: plan.tokenEvents.length,
    warnings: plan.warnings,
    bridge: bridge || null
  };

  if (args.apply) {
    const dbPath = cliDbPath();
    const db = openDb(dbPath);
    try {
      summary.backup = createSqliteBackup(db, dbPath, { reason: format === 'ccusage-cli' ? 'ccusage-cli-import' : 'ccusage-json-import' });
      summary.applied = applyCcusageImport(db, plan);
    } finally {
      db.close();
    }
  }

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  const source = bridge ? `ccusage CLI ${bridge.report}` : 'ccusage JSON';
  console.log(`${source} ${summary.mode}: shape=${summary.detectedShape}, daily=${summary.daily}, sessions=${summary.sessions}, token_events=${summary.tokenEvents}`);
  if (summary.backup) console.log(`backup=${summary.backup.path}`);
  for (const warning of summary.warnings.slice(0, 5)) {
    console.log(`warning: ${warning.model || 'unknown'} — ${warning.reason}`);
  }
}

async function buildImportUsagePlan(format) {
  if (format === 'ccusage-json') {
    if (!args.file) {
      throw new Error('import-usage requires --file <path|-> for --format=ccusage-json.');
    }
    const payload = parseCcusageJsonText(readCcusageImportInput(args.file));
    return {
      plan: planCcusageImport(payload, {
        device: args.device || hostname()
      }),
      bridge: null
    };
  }

  if (format === 'ccusage-cli') {
    const report = String(args.report || 'session').toLowerCase();
    const invocation = ccusageInvocation({ report, ccusageBin: args.ccusageBin });
    await ensureCcusageBridgeConfirmed({ report, commandLabel: invocation.commandLabel });
    const { plan } = await runCcusageCliImportPlan({
      report,
      ccusageBin: args.ccusageBin,
      device: args.device || hostname()
    });
    return {
      plan,
      bridge: {
        report,
        command: invocation.commandLabel
      }
    };
  }

  throw new Error('import-usage supports --format=ccusage-json or --format=ccusage-cli.');
}

async function ensureCcusageBridgeConfirmed({ report, commandLabel }) {
  if (args.yes || process.env.TOKEN_STUDIO_CCUSAGE_BRIDGE_CONFIRMED === '1') return;
  if (!process.stdin.isTTY) {
    throw new Error('ccusage CLI bridge requires --yes in non-interactive shells because it runs an external local scanner.');
  }
  const confirmed = await confirmCcusageBridge({ report, commandLabel });
  if (!confirmed) {
    throw new Error('ccusage CLI bridge cancelled. No external scanner was run.');
  }
}

async function budgetCommand() {
  if (args.help) {
    printBudgetHelp();
    return;
  }
  const action = args._[0] || 'list';
  const db = openCliDb();
  try {
    if (action === 'list') {
      const profiles = listBudgetProfiles(db);
      if (args.json) {
        console.log(JSON.stringify({ profiles }, null, 2));
        return;
      }
      console.log('Token Studio Budget Profiles');
      if (!profiles.length) {
        console.log('- none');
        return;
      }
      for (const profile of profiles) {
        console.log(`- #${profile.id} ${profile.label}: source=${profile.source || '*'}, window=${profile.windowType || 'rolling'}:${profile.windowMinutes}m, reset=${profile.resetAnchor || '-'}, warn=${Math.round(Number(profile.warningThreshold || 0.75) * 100)}%, tokenBudget=${profile.tokenBudget || '-'}, costBudgetUSD=${profile.costBudgetUSD || '-'}, enabled=${profile.enabled ? 'yes' : 'no'}`);
      }
      return;
    }
    if (action === 'set') {
      const profile = upsertBudgetProfile(db, {
        id: args.id,
        source: args.source || '',
        label: args.label,
        windowType: args.windowType || 'rolling',
        windowMinutes: args.windowMinutes,
        resetAnchor: args.resetAnchor || null,
        warningThreshold: args.warningThreshold ?? 0.75,
        tokenBudget: args.tokenBudget || 0,
        costBudgetUSD: args.costBudgetUsd ?? args.costBudgetUSD ?? 0,
        enabled: args.enabled ?? true
      });
      console.log(args.json ? JSON.stringify({ ok: true, profile }, null, 2) : `saved budget #${profile.id}: ${profile.label}`);
      return;
    }
    if (action === 'delete') {
      const deleted = deleteBudgetProfile(db, { id: args.id });
      console.log(args.json ? JSON.stringify({ ok: true, deleted }, null, 2) : `deleted=${deleted}`);
      return;
    }
    throw new Error('Unknown budget command. Use budget list, budget set, or budget delete.');
  } finally {
    db.close();
  }
}

async function reportCommand() {
  const format = args.format || 'table';
  if (!['table', 'markdown', 'json'].includes(format)) {
    throw new Error('report --format must be table, markdown, or json.');
  }
  const db = openCliDb();
  try {
    const report = buildTerminalReport(db, { period: args.period || 'week' });
    console.log(formatTerminalReport(report, format));
  } finally {
    db.close();
  }
}

async function statuslineCommand() {
  if (args.help) {
    printStatuslineHelp();
    return;
  }
  const format = args.format || 'text';
  if (!['text', 'json'].includes(format)) {
    throw new Error('statusline --format must be text or json.');
  }
  const windowMinutes = Number(args.windowMinutes || 15);
  if (!Number.isFinite(windowMinutes) || windowMinutes <= 0) {
    throw new Error('statusline --window-minutes must be a positive number.');
  }
  const snapshotOptions = {
    windowMinutes,
    source: args.source || 'all'
  };
  let db;
  let snapshot;
  try {
    db = openCliReadOnlyDb();
    snapshot = buildStatuslineSnapshot(db, snapshotOptions);
  } catch (error) {
    if (!/SQLite database not found/i.test(error.message)) throw error;
    snapshot = buildEmptyStatuslineSnapshot({
      ...snapshotOptions,
      warning: 'Local SQLite database not found.'
    });
  } finally {
    db?.close();
  }
  if (format === 'json') {
    console.log(JSON.stringify(snapshot, null, 2));
    return;
  }
  console.log(formatStatuslineText(snapshot, {
    maxWidth: args.maxWidth || 100
  }));
}

async function privacyCheckCommand() {
  const result = runPrivacyCheck({ includeUntracked: Boolean(args.includeUntracked) });
  console.log(formatPrivacyCheckReport(result));
  if (!result.ok) process.exitCode = 2;
}

async function policyCommand() {
  const format = args.format || 'markdown';
  if (!['markdown', 'claude-md', 'agents-md'].includes(format)) {
    throw new Error('policy --format must be markdown, claude-md, or agents-md.');
  }
  let db;
  let sessions = [];
  try {
    db = openCliReadOnlyDb();
    sessions = loadPolicySessions(db);
  } catch (error) {
    if (!/SQLite database not found/i.test(error.message)) throw error;
  } finally {
    db?.close();
  }
  const policy = buildModelPolicy({ sessions });
  console.log(formatModelPolicy(policy, format));
}

async function confirmCollect(sources) {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input, output });
  try {
    console.log('This will scan local AI coding logs for structured token usage only.');
    console.log(`Sources: ${sources}`);
    console.log('It will not read or display conversation content, but it may access local metadata directories.');
    const answer = await rl.question('Type COLLECT to continue: ');
    return answer.trim() === 'COLLECT';
  } finally {
    rl.close();
  }
}

async function confirmCcusageBridge({ report, commandLabel }) {
  const rl = createInterface({ input, output });
  try {
    console.log('This will run ccusage as an external local scanner and pass structured JSON to Token Studio.');
    console.log(`Report: ${report}`);
    console.log(`Command: ${commandLabel}`);
    console.log('Token Studio rejects conversation-like fields and recomputes cost with its official-price table.');
    const answer = await rl.question('Type CCUSAGE to continue: ');
    return answer.trim() === 'CCUSAGE';
  } finally {
    rl.close();
  }
}

async function freePort(start) {
  for (let port = Number(start); port < Number(start) + 80; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error(`No free port found near ${start}`);
}

function openCliDb() {
  return openDb(cliDbPath());
}

function openCliReadOnlyDb() {
  return openReadOnlyDb(cliDbPath());
}

function cliDbPath() {
  return resolve(USER_CWD, args.db || process.env.DB_PATH || defaultDbPath);
}

function canListen(port) {
  return new Promise(resolvePort => {
    const server = createServer();
    server.once('error', () => resolvePort(false));
    server.once('listening', () => server.close(() => resolvePort(true)));
    server.listen(port, '127.0.0.1');
  });
}

function waitForChildren(children) {
  return new Promise(resolveRun => {
    let done = false;
    const stop = (code = 0) => {
      if (done) return;
      done = true;
      for (const child of children) {
        if (!child.killed) child.kill();
      }
      resolveRun(code);
    };
    for (const child of children) {
      child.on('exit', code => stop(code ?? 0));
      child.on('error', error => {
        console.error(error.message);
        stop(1);
      });
    }
    process.on('SIGINT', () => stop(0));
    process.on('SIGTERM', () => stop(0));
  });
}

function childExitCode(child) {
  return new Promise(resolveRun => {
    child.on('exit', code => resolveRun(code ?? 0));
    child.on('error', () => resolveRun(1));
  });
}

function openUrl(url) {
  let launcher;
  let launcherArgs;
  if (process.platform === 'win32') {
    launcher = 'cmd';
    launcherArgs = ['/c', 'start', '""', url];
  } else if (process.platform === 'darwin') {
    launcher = 'open';
    launcherArgs = [url];
  } else {
    launcher = 'xdg-open';
    launcherArgs = [url];
  }
  const child = spawn(launcher, launcherArgs, {
    stdio: 'ignore',
    detached: true,
    windowsHide: true
  });
  child.unref();
}

function parseArgs(argv) {
  const parsed = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg.startsWith('--') && arg.includes('=')) {
      const [key, value] = arg.slice(2).split(/=(.*)/s);
      parsed[toCamel(key)] = value;
    } else if (arg.startsWith('--')) {
      const key = toCamel(arg.slice(2));
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        parsed[key] = true;
      } else {
        parsed[key] = next;
        i += 1;
      }
    } else {
      parsed._.push(arg);
    }
  }
  return parsed;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function printHelp() {
  console.log([
    'Token Studio ROI',
    '',
    'Commands:',
    '  token-studio demo [--seed-only] [--db data/demo.sqlite]',
    '  token-studio start [--db data/usage.sqlite] [--api-port 4173] [--ui-port 5173]',
    '  token-studio open [--db data/usage.sqlite] [--api-port 4173] [--ui-port 5173]',
    '  token-studio live [--db data/usage.sqlite]',
    '  token-studio statusline [--db data/usage.sqlite] [--window-minutes 15] [--format text|json]',
    '  token-studio collectors [--json]',
    '  token-studio collectors --audit [--json]',
    '  token-studio import-usage --format=ccusage-json --file <path|-> [--dry-run|--apply]',
    '  token-studio import-usage --format=ccusage-cli --report=<daily|weekly|monthly|session|blocks> [--dry-run|--apply] [--yes]',
    '  token-studio budget list|set|delete',
    '  token-studio report --period=week --format=table|markdown|json',
    '  token-studio policy --format=markdown|claude-md|agents-md',
    '  token-studio collect --sources claude,codex [--yes]',
    '  token-studio doctor',
    '  token-studio privacy-check [--include-untracked]'
  ].join('\n'));
}

function printBudgetHelp() {
  console.log([
    'Token Studio Budget Profiles',
    '',
    'Budgets are local custom guardrails. They are not provider subscription quotas.',
    '',
    'Examples:',
    '  token-studio budget list',
    '  token-studio budget set --source "Codex CLI" --label "Codex 15m" --window-minutes 15 --token-budget 50000',
    '  token-studio budget set --source "Claude Code" --label "Claude 5h" --window-type fixed --window-minutes 300 --reset-anchor 2026-06-17T09:00:00Z --warning-threshold 0.75 --token-budget 500000',
    '  token-studio budget delete --id 1',
    '',
    'Options:',
    '  --window-type rolling|fixed',
    '  --reset-anchor <ISO datetime>    fixed windows only',
    '  --warning-threshold <0-1>        default 0.75'
  ].join('\n'));
}

function printStatuslineHelp() {
  console.log([
    'Token Studio Statusline Guardrails',
    '',
    'Read-only SQLite statusline for terminal prompts, tmux, scripts, or Claude Code statusline.',
    '',
    'Examples:',
    '  token-studio statusline --format=text --window-minutes=15 --max-width=100',
    '  token-studio statusline --format=json --window-minutes=15',
    '',
    'Claude Code statusline command:',
    '  npx token-studio statusline --format=text --window-minutes=15 --max-width=100',
    '',
    'tmux:',
    '  set -g status-right "#(npx token-studio statusline --format=text --max-width=80)"',
    '',
    'PowerShell prompt:',
    '  function prompt { "$(npx token-studio statusline --format=text --max-width=80) PS $($PWD)> " }',
    '',
    'Privacy:',
    '  statusline only reads local SQLite. It does not scan logs, run ccusage, or start a background process.'
  ].join('\n'));
}

function printImportUsageHelp() {
  console.log([
    'Token Studio ccusage Import',
    '',
    'Default mode is dry-run. It validates shape and counts rows without writing SQLite.',
    '',
    'Examples:',
    '  token-studio import-usage --format=ccusage-json --file ccusage.json --dry-run',
    '  token-studio import-usage --format=ccusage-json --file ccusage.json --apply',
    '  ccusage daily --json | token-studio import-usage --format=ccusage-json --file - --dry-run',
    '  token-studio import-usage --format=ccusage-cli --report=session --dry-run --yes',
    '  token-studio import-usage --format=ccusage-cli --report=blocks --apply --yes',
    '  token-studio import-usage --format=ccusage-cli --report=daily --ccusage-bin ccusage --dry-run',
    '',
    'Supported shapes:',
    '  daily, project daily, weekly, session, blocks, monthly',
    '',
    'ccusage CLI bridge reports:',
    `  ${CCUSAGE_CLI_REPORTS.join(', ')}`,
    '',
    'Privacy:',
    '  prompt, response, messages, transcript, diff, content, and text fields are rejected.',
    '  ccusage-cli runs an external local scanner only after interactive confirmation or --yes.',
    '  Imported cost fields are ignored; Token Studio recomputes official-price conversion.'
  ].join('\n'));
}

function loadPolicySessions(db) {
  return db.prepare(`
    SELECT
      COALESCE(a.work_purpose, '未说明') AS workPurpose,
      COALESCE(a.work_stage, '未说明') AS workStage,
      COALESCE(a.value_level, '未评估') AS valueLevel,
      COALESCE(a.output_status, '未标注') AS outputStatus,
      s.total_tokens AS totalTokens,
      s.cost_usd AS costUSD
    FROM session_usage s
    LEFT JOIN session_annotations a
      ON a.device = s.device
      AND a.source = s.source
      AND a.session_id = s.session_id
    ORDER BY s.total_tokens DESC
  `).all();
}
