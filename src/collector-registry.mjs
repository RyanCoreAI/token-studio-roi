import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { configuredPath, configuredPaths, expandPath } from './collector-config.mjs';

const STABLE_FIELDS = [
  'date',
  'source',
  'session_id',
  'project',
  'model',
  'input_tokens',
  'output_tokens',
  'cache_tokens',
  'reasoning_tokens'
];

const EXPERIMENTAL_FIELDS = [
  'timestamp',
  'source',
  'session_id',
  'project_label',
  'model',
  'input_tokens',
  'output_tokens',
  'cache_tokens',
  'tool_category',
  'file_extension'
];

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
    module: './collectors/cursor.mjs',
    privacyLevel: 'metadata-only',
    roots: () => cursorRoots(),
    note: 'Experimental: only explicit local usage records with token fields are imported; chat content is ignored.'
  }),
  experimentalCollector('copilot', 'GitHub Copilot CLI', {
    module: './collectors/copilot.mjs',
    privacyLevel: 'metadata-only',
    roots: () => copilotRoots(),
    note: 'Experimental: local token rows are imported only when token fields are present.'
  }),
  experimentalCollector('qwen', 'Qwen Code', {
    module: './collectors/qwen.mjs',
    privacyLevel: 'metadata-only',
    roots: () => ['~/.qwen', '~/.qwen-code'].map(expandPath),
    note: 'Experimental: supports fixture-backed structured usage logs without transcript ingestion.'
  }),
  experimentalCollector('kimi', 'Kimi / Moonshot Coding CLI', {
    module: './collectors/kimi.mjs',
    privacyLevel: 'metadata-only',
    roots: () => ['~/.kimi', '~/.moonshot'].map(expandPath),
    note: 'Experimental: supports fixture-backed structured usage logs without transcript ingestion.'
  }),
  experimentalCollector('goose', 'Goose', {
    module: './collectors/goose.mjs',
    privacyLevel: 'metadata-only',
    roots: () => ['~/.config/goose', '~/.goose'].map(expandPath),
    note: 'Experimental: supports explicit token metadata only; no prompt or response text is imported.'
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

export function collectableCollectors({ includeExperimental = false } = {}) {
  return COLLECTOR_REGISTRY.filter(item =>
    item.module && (item.supportStatus === 'stable' || (includeExperimental && item.supportStatus === 'experimental'))
  );
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
      fixtures: item.fixtures || null,
      dataFields: item.dataFields || [],
      readsConversationContent: Boolean(item.readsConversationContent),
      tokenReliability: item.tokenReliability || 'unknown',
      fixtureBacked: Boolean(item.fixtures),
      note: item.note || null
    };
  });
}

export function enabledCollectorIds({ includeExperimental = false, values = null } = {}) {
  const envValue = process.env.TOKEN_STUDIO_COLLECTORS || process.env.AI_TOKEN_DASHBOARD_COLLECTORS;
  const configRoot = globalCollectorConfig();
  const rawValues = values != null
    ? String(values).split(',')
    : envValue ? envValue.split(',')
      : Array.isArray(configRoot.enabledCollectors) ? configRoot.enabledCollectors
      : stableCollectors().filter(item => item.defaultEnabled).map(item => item.id);

  const ids = rawValues.map(item => String(item).trim().toLowerCase()).filter(Boolean);
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
    dataFields: STABLE_FIELDS,
    readsConversationContent: false,
    tokenReliability: 'native-token-fields',
    roots: options.roots
  };
}

function experimentalCollector(id, label, options) {
  return {
    id,
    label,
    module: options.module || null,
    privacyLevel: options.privacyLevel,
    defaultEnabled: false,
    supportStatus: options.module ? 'experimental' : 'detected-only',
    fixtures: `test/fixtures/collectors/${id}`,
    dataFields: EXPERIMENTAL_FIELDS,
    readsConversationContent: false,
    tokenReliability: 'explicit-token-fields-only',
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
