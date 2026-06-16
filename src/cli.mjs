#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { seedDemoDatabase } from './demo-seed.mjs';
import { detectCollectors } from './collector-registry.mjs';
import { formatPrivacyCheckReport, runPrivacyCheck } from './privacy-check.mjs';

const command = process.argv[2] || 'help';
const args = parseArgs(process.argv.slice(3));

try {
  if (command === 'start') {
    await startCommand({ demo: false });
  } else if (command === 'demo') {
    await demoCommand();
  } else if (command === 'live') {
    await startCommand({ demo: false, route: '/live' });
  } else if (command === 'collect') {
    await collectCommand();
  } else if (command === 'collectors') {
    await collectorsCommand();
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
  const dbPath = resolve(process.cwd(), args.db || 'data/demo.sqlite');
  const result = seedDemoDatabase({ dbPath });
  console.log(`[demo] seeded ${result.sessions} sessions and ${result.daily} daily rows into ${result.dbPath}`);
  if (args.seedOnly) return;
  await startCommand({ demo: true, dbPath });
}

async function startCommand({ demo = false, dbPath = null, route = '/' } = {}) {
  const apiPort = Number(args.apiPort || args.port || await freePort(4173));
  const uiPort = Number(args.uiPort || await freePort(5173));
  const env = {
    ...process.env,
    PORT: String(apiPort),
    API_PORT: String(apiPort),
    DB_PATH: dbPath || args.db || process.env.DB_PATH || resolve(process.cwd(), 'data', 'usage.sqlite'),
    TOKEN_STUDIO_DEMO_MODE: demo ? '1' : process.env.TOKEN_STUDIO_DEMO_MODE || ''
  };
  const viteBin = resolve(process.cwd(), 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(viteBin)) {
    throw new Error('Vite is not installed. Run npm install first, then retry token-studio start.');
  }
  const server = spawn(process.execPath, ['src/server.mjs'], {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    windowsHide: true
  });
  const client = spawn(process.execPath, [viteBin, '--host', '127.0.0.1', '--port', String(uiPort)], {
    cwd: process.cwd(),
    env,
    stdio: 'inherit',
    windowsHide: true
  });
  console.log(`[token-studio] UI  http://127.0.0.1:${uiPort}${route}${demo ? '  (Demo Mode)' : ''}`);
  console.log(`[token-studio] API http://127.0.0.1:${apiPort}`);
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
    cwd: process.cwd(),
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

async function privacyCheckCommand() {
  const result = runPrivacyCheck({ includeUntracked: Boolean(args.includeUntracked) });
  console.log(formatPrivacyCheckReport(result));
  if (!result.ok) process.exitCode = 2;
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

async function freePort(start) {
  for (let port = Number(start); port < Number(start) + 80; port += 1) {
    if (await canListen(port)) return port;
  }
  throw new Error(`No free port found near ${start}`);
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

function parseArgs(argv) {
  const parsed = {};
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
    '  token-studio live [--db data/usage.sqlite]',
    '  token-studio collectors [--json]',
    '  token-studio collect --sources claude,codex [--yes]',
    '  token-studio doctor',
    '  token-studio privacy-check [--include-untracked]'
  ].join('\n'));
}
