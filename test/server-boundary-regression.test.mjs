import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('private APIs reject non-loopback Host and lookalike loopback Origins', async () => {
  const fixture = await startFixture();
  try {
    for (const host of ['attacker.example', '127.attacker.example', 'localhost.attacker.example']) {
      assert.equal((await fixture.get('/api/summary', { Host: `${host}:${fixture.port}` })).status, 403, host);
    }
    for (const origin of ['https://127.attacker.example', 'http://localhost.attacker.example', 'file://localhost']) {
      assert.equal((await fixture.get('/api/summary', { Origin: origin })).status, 403, origin);
    }
    for (const host of ['localhost', '127.0.0.1', '[::1]', '[::ffff:127.0.0.1]']) {
      assert.equal((await fixture.get('/api/summary', { Host: `${host}:${fixture.port}` })).status, 200, host);
    }
  } finally { await fixture.stop(); }
});

test('static directory requests return 404 and leave the server usable', async () => {
  const fixture = await startFixture();
  try {
    assert.equal((await fixture.get('/assets')).status, 404);
    assert.equal((await fixture.get('/')).status, 200);
    assert.equal((await fixture.get('/api/summary')).status, 200);
    assert.equal(fixture.child.exitCode, null);
  } finally { await fixture.stop(); }
});

async function startFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'token-boundary-'));
  mkdirSync(join(dir, 'public/assets'), { recursive: true });
  writeFileSync(join(dir, 'public/index.html'), 'Token Studio fixture');
  const socket = createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = socket.address().port; await new Promise(resolve => socket.close(resolve));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../src/server.mjs', import.meta.url))], {
    cwd: dir, windowsHide: true, env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), DB_PATH: join(dir, 'usage.sqlite'), SCHEDULED_COLLECT_ENABLED: '0' }, stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = ''; child.stdout.on('data', b => output += b); child.stderr.on('data', b => output += b);
  for (let i = 0; i < 70 && !output.includes('listening'); i++) {
    if (child.exitCode !== null) throw new Error(output);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!output.includes('listening')) { child.kill(); throw new Error(`Startup timed out: ${output}`); }
  return { child, port, get(route, headers = {}) {
    return new Promise((resolve, reject) => { const req = request({ host: '127.0.0.1', port, path: route, headers }, res => { let body = ''; res.on('data', b => body += b); res.on('end', () => resolve({ status: res.statusCode, body })); }); req.on('error', reject); req.end(); });
  }, async stop() { if (child.exitCode === null) { child.kill(); await once(child, 'exit'); } } };
}
