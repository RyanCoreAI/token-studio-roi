import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { configuredPath, configuredPaths, expandPath } from './collector-config.mjs';

export const COLLECTOR_REGISTRY = [
  stableCollector('claude', 'Claude Code', './collectors/claude-code.mjs', {
    privacyLevel: 'metadata-only',
    roots: () => configuredPaths('claude', 'roots', ['~/.config/claude', '~/.claude'])
  }),
  stableCollector('codex', 'Codex CLI', './collectors/codex.mjs', {
    privacyLevel: 'metadata-only',
    roots: () => configuredPaths('codex', 'homes', ['~/.codex'])
  }),
  stableCollector('gemini', 'Gemini CLI', './collectors/gemini.mjs', {
    privacyLevel: 'metadata-only',
    roots: () => [join(homedir(), '.gemini', 'tmp')]
  }),
  stableCollector('opencode', 'OpenCode', './collectors/opencode.mjs', {
    privacyLevel: 'metadata-only',
    roots: () => [configuredPath('opencode', 'dataDir', '~/.local/share/opencode')]
  }),
  stableCollector('openclaw', 'OpenClaw', './collectors/openclaw.mjs', {
    privacyLevel: 'metadata-only',
    roots: () => configuredPaths('openclaw', 'agentRoots', [
      '~/.openclaw/agents',
      '~/.clawdbot/agents',
      '~/.moltbot/agents',
      '~/.moldbot/agents'
    ])
  }),
  stableCollector('hermes', 'Hermes Agent', './collectors/hermes.mjs', {
    privacyLevel: 'metadata-only',
    roots: () => [configuredPath('hermes', 'dbPath', '~/.hermes/state.db')]
  }),
  experimentalCollector('cursor', 'Cursor', {
    privacyLevel: 'detected-only',
    roots: () => cursorRoots(),
    note: 'Cursor local token usage is not stable across installs; Token Studio detects it but does not invent usage rows.'
  }),
  experimentalCollector('copilot', 'GitHub Copilot CLI', {
    privacyLevel: 'detected-only',
    roots: () => copilotRoots(),
    note: 'Copilot local logs are detected only until a reliable token usage fixture is available.'
  }),
  experimentalCollector('qwen', 'Qwen Code', {
    privacyLevel: 'detected-only',
    roots: () => ['~/.qwen', '~/.qwen-code'].map(expandPath),
    note: 'Planned v4.1 source; disabled until token fixtures are verified.'
  }),
  experimentalCollector('kimi', 'Kimi / Moonshot Coding CLI', {
    privacyLevel: 'detected-only',
    roots: () => ['~/.kimi', '~/.moonshot'].map(expandPath),
    note: 'Planned v4.1 source; disabled until token fixtures are verified.'
  }),
  experimentalCollector('goose', 'Goose', {
    privacyLevel: 'detected-only',
    roots: () => ['~/.config/goose', '~/.goose'].map(expandPath),
    note: 'Preferred v4.1 candidate over Amp for local-first workflow coverage.'
  })
];

export function listCollectors() {
  return COLLECTOR_REGISTRY.map(({ detect, roots, ...entry }) => ({
    ...entry,
    configuredRoots: roots().filter(Boolean)
  }));
}

export function stableCollectors() {
  return COLLECTOR_REGISTRY.filter(item => item.supportStatus === 'stable');
}

export function collectorById(id) {
  return COLLECTOR_REGISTRY.find(item => item.id === id);
}

export function collectorLabel(id) {
  return collectorById(id)?.label || id || 'unknown';
}

export function detectCollectors() {
  return COLLECTOR_REGISTRY.map(item => {
    const roots = item.roots().filter(Boolean);
    const existingRoots = roots.filter(path => existsSync(path));
    return {
      id: item.id,
      label: item.label,
      supportStatus: item.supportStatus,
      privacyLevel: item.privacyLevel,
      defaultEnabled: item.defaultEnabled,
      detected: existingRoots.length > 0,
      configuredRoots: roots,
      existingRoots,
      module: item.module || null,
      note: item.note || null
    };
  });
}

export function enabledCollectorIds({ includeExperimental = false } = {}) {
  const envValue = process.env.TOKEN_STUDIO_COLLECTORS || process.env.AI_TOKEN_DASHBOARD_COLLECTORS;
  const configRoot = globalCollectorConfig();
  const values = envValue
    ? envValue.split(',')
    : Array.isArray(configRoot.enabledCollectors) ? configRoot.enabledCollectors
      : stableCollectors().filter(item => item.defaultEnabled).map(item => item.id);

  const ids = values.map(item => String(item).trim().toLowerCase()).filter(Boolean);
  const allowed = new Set(COLLECTOR_REGISTRY
    .filter(item => includeExperimental || item.supportStatus === 'stable')
    .map(item => item.id));
  return new Set(ids.filter(id => allowed.has(id)));
}

function stableCollector(id, label, module, options) {
  return {
    id,
    label,
    module,
    privacyLevel: options.privacyLevel,
    defaultEnabled: true,
    supportStatus: 'stable',
    fixtures: `test/fixtures/collectors/${id}`,
    roots: options.roots
  };
}

function experimentalCollector(id, label, options) {
  return {
    id,
    label,
    module: null,
    privacyLevel: options.privacyLevel,
    defaultEnabled: false,
    supportStatus: 'detected-only',
    fixtures: null,
    roots: options.roots,
    note: options.note
  };
}

function globalCollectorConfig() {
  try {
    const path = join(process.cwd(), 'config', 'collectors.json');
    if (!existsSync(path)) return {};
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

function cursorRoots() {
  const appData = process.env.APPDATA;
  const localAppData = process.env.LOCALAPPDATA;
  return [
    appData ? join(appData, 'Cursor') : null,
    localAppData ? join(localAppData, 'Programs', 'Cursor') : null,
    '~/.config/Cursor',
    '~/Library/Application Support/Cursor'
  ].map(expandPath).filter(Boolean);
}

function copilotRoots() {
  return [
    '~/.config/github-copilot',
    '~/.copilot',
    '~/Library/Application Support/github-copilot',
    process.env.APPDATA ? join(process.env.APPDATA, 'GitHub Copilot') : null
  ].map(expandPath).filter(Boolean);
}
