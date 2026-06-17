import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolveViteBin } from '../src/runtime-paths.mjs';

test('resolveViteBin handles npm npx hoisted dependency layout', () => {
  const root = join(tmpdir(), `token-studio-runtime-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const packageRoot = join(root, 'node_modules', 'token-studio');
  const viteRoot = join(root, 'node_modules', 'vite');
  const viteBin = join(viteRoot, 'bin', 'vite.js');
  mkdirSync(join(packageRoot, 'src'), { recursive: true });
  mkdirSync(join(viteRoot, 'bin'), { recursive: true });
  writeFileSync(join(viteRoot, 'package.json'), '{"name":"vite"}\n');
  writeFileSync(viteBin, '#!/usr/bin/env node\n');

  try {
    const resolved = resolveViteBin({
      packageRoot,
      requireLike: {
        resolve(id) {
          assert.equal(id, 'vite/package.json');
          return join(viteRoot, 'package.json');
        }
      }
    });
    assert.equal(resolved, viteBin);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('resolveViteBin keeps local source checkout fallback', () => {
  const root = join(tmpdir(), `token-studio-runtime-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const packageRoot = join(root, 'token-studio');
  const viteBin = join(packageRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  mkdirSync(join(packageRoot, 'node_modules', 'vite', 'bin'), { recursive: true });
  writeFileSync(viteBin, '#!/usr/bin/env node\n');

  try {
    const resolved = resolveViteBin({
      packageRoot,
      requireLike: {
        resolve() {
          throw new Error('not found');
        }
      }
    });
    assert.equal(resolved, viteBin);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
