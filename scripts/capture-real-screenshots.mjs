import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const assetDir = resolve(packageRoot, 'docs/assets');
const dbPath = resolve(packageRoot, 'data/usage.sqlite');

const pages = [
  { name: 'dashboard', path: '/', scrollY: 1180 },
  { name: 'trust', path: '/trust', scrollY: 420 },
  { name: 'review', path: '/review', scrollY: 0 },
  { name: 'live', path: '/live', scrollY: 0 }
];

try {
  if (!existsSync(dbPath)) {
    throw new Error(`real SQLite database not found at ${dbPath}`);
  }
  mkdirSync(assetDir, { recursive: true });
  const apiPort = await freePort(4470);
  const uiPort = await freePort(5470);
  const app = spawn(process.execPath, [
    resolve(packageRoot, 'src/cli.mjs'),
    'start',
    '--db', dbPath,
    '--api-port', String(apiPort),
    '--ui-port', String(uiPort),
    '--no-open'
  ], {
    cwd: packageRoot,
    env: {
      ...process.env,
      NODE_OPTIONS: [process.env.NODE_OPTIONS, '--no-warnings'].filter(Boolean).join(' ')
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  let stdout = '';
  let stderr = '';
  let closed = false;
  app.stdout.setEncoding('utf8');
  app.stderr.setEncoding('utf8');
  app.stdout.on('data', chunk => { stdout += chunk; });
  app.stderr.on('data', chunk => { stderr += chunk; });
  app.on('close', () => { closed = true; });
  app.on('error', error => {
    stderr += error.stack || error.message;
    closed = true;
  });

  try {
    const data = await waitForJson(`http://127.0.0.1:${apiPort}/api/data`, {
      childState: () => ({ closed, stdout, stderr })
    });
    console.log(JSON.stringify({
      dataMode: data.meta?.dataMode?.id,
      sessions: data.sessions?.length || 0,
      tokenEvents: data.meta?.runtime?.counts?.tokenEventRows || 0
    }, null, 2));
    const browser = findBrowser();
    if (!browser) {
      throw new Error('No Chromium-compatible browser found. Set CHROME_PATH or TOKEN_STUDIO_BROWSER.');
    }
    await capturePages(browser, uiPort);
  } finally {
    await stopChild(app);
  }
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
}

async function capturePages(browser, uiPort) {
  const debugPort = await freePort(9322);
  const profileDir = join(tmpdir(), `token-studio-screenshot-${Date.now()}`);
  const chrome = spawn(browser, [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profileDir}`,
    'about:blank'
  ], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });

  try {
    await waitForJson(`http://127.0.0.1:${debugPort}/json/version`, { timeoutMs: 30000 });
    const targetResponse = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
    const target = await targetResponse.json();
    const cdp = await connectCdp(target.webSocketDebuggerUrl);
    try {
      await cdp.send('Page.enable');
      await cdp.send('Runtime.enable');
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: 1600,
        height: 1000,
        deviceScaleFactor: 1,
        mobile: false
      });
      for (const { name, path, scrollY } of pages) {
        const url = `http://127.0.0.1:${uiPort}${path}`;
        await cdp.send('Page.navigate', { url });
        await waitForVisibleContent(cdp, name);
        if (scrollY) {
          await cdp.send('Runtime.evaluate', {
            expression: `window.scrollTo(0, ${Number(scrollY)})`
          });
        }
        await sleep(1800);
        const screenshot = await cdp.send('Page.captureScreenshot', {
          format: 'png',
          fromSurface: true,
          captureBeyondViewport: false
        });
        const out = resolve(assetDir, `token-studio-v591-real-${name}.png`);
        writeFileSync(out, Buffer.from(screenshot.result.data, 'base64'));
        console.log(out);
      }
    } finally {
      cdp.close();
    }
  } finally {
    await stopChild(chrome);
  }
}

async function waitForVisibleContent(cdp, label) {
  const started = Date.now();
  let lastState = null;
  while (Date.now() - started < 30000) {
    const state = await cdp.send('Runtime.evaluate', {
      expression: `(() => ({
        title: document.title,
        text: (document.body?.innerText || '').slice(0, 1000),
        length: document.body?.innerText?.length || 0
      }))()`,
      returnByValue: true
    });
    lastState = state.result?.result?.value || null;
    if (Number(lastState?.length || 0) > 80) return;
    await sleep(500);
  }
  throw new Error(`Page ${label} did not render visible content: ${JSON.stringify(lastState)}`);
}

function connectCdp(wsUrl) {
  return new Promise((resolveConnection, rejectConnection) => {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map();
    ws.addEventListener('open', () => {
      resolveConnection({
        send(method, params = {}) {
          const id = nextId++;
          ws.send(JSON.stringify({ id, method, params }));
          return new Promise((resolveSend, rejectSend) => {
            pending.set(id, { resolve: resolveSend, reject: rejectSend });
          });
        },
        close() {
          ws.close();
        }
      });
    });
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const { resolve: resolvePending, reject: rejectPending } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rejectPending(new Error(message.error.message || JSON.stringify(message.error)));
      else resolvePending(message);
    });
    ws.addEventListener('error', () => rejectConnection(new Error('Failed to connect to Chrome DevTools Protocol')));
  });
}

function findBrowser() {
  const envBrowser = process.env.TOKEN_STUDIO_BROWSER || process.env.CHROME_PATH || process.env.CHROME;
  if (envBrowser) return envBrowser;
  const candidates = process.platform === 'win32'
    ? [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
      ]
    : process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'
        ]
      : [
          which('google-chrome-stable'),
          which('google-chrome'),
          which('chromium-browser'),
          which('chromium'),
          which('microsoft-edge')
        ];
  return candidates.find(candidate => candidate && (process.platform === 'linux' || existsSync(candidate))) || '';
}

function which(command) {
  const result = spawnSync('which', [command], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : '';
}

async function waitForJson(url, { timeoutMs = 30000, childState } = {}) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    if (childState?.().closed) {
      const state = childState();
      throw new Error(`child exited before ${url}\nstdout=${state.stdout}\nstderr=${state.stderr}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(500);
  }
  throw new Error(`Timed out waiting for ${url}: ${lastError?.message || 'unknown error'}`);
}

function freePort(start) {
  return new Promise(resolveFree => {
    const server = createServer();
    server.listen(start, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolveFree(port));
    });
    server.on('error', () => resolveFree(freePort(start + 1)));
  });
}

async function stopChild(child) {
  if (!child || child.killed) return;
  child.kill();
  await sleep(500);
  if (!child.killed) child.kill('SIGKILL');
}

function sleep(ms) {
  return new Promise(resolveSleep => setTimeout(resolveSleep, ms));
}
