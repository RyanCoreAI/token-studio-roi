export const CCUSAGE_BRIDGE_REPORTS = ['daily', 'weekly', 'monthly', 'session', 'blocks'];

export const BUDGET_TEMPLATES = [
  { id: 'claude-5h', label: 'Claude 5h', source: 'Claude Code', windowType: 'fixed', windowMinutes: 300, warningThreshold: 0.75 },
  { id: 'claude-weekly', label: 'Claude weekly', source: 'Claude Code', windowType: 'fixed', windowMinutes: 10080, warningThreshold: 0.75 },
  { id: 'codex-5h', label: 'Codex 5h', source: 'Codex CLI', windowType: 'fixed', windowMinutes: 300, warningThreshold: 0.75 },
  { id: 'copilot-weekly', label: 'Copilot weekly', source: 'GitHub Copilot CLI', windowType: 'fixed', windowMinutes: 10080, warningThreshold: 0.75 }
];

export function buildCcusageBridgeCommand({ report = 'session', apply = false } = {}) {
  const normalized = CCUSAGE_BRIDGE_REPORTS.includes(String(report).toLowerCase())
    ? String(report).toLowerCase()
    : 'session';
  return [
    'node src/cli.mjs import-usage',
    '--format=ccusage-cli',
    `--report=${normalized}`,
    apply ? '--apply' : '--dry-run',
    '--yes'
  ].join(' ');
}

export function defaultResetAnchor(now = new Date()) {
  const date = new Date(now);
  date.setSeconds(0, 0);
  return date.toISOString().slice(0, 16);
}

export function applyBudgetTemplate(current = {}, template = {}, now = new Date()) {
  return {
    ...current,
    source: template.source || current.source || '',
    label: template.label || current.label || '',
    windowType: template.windowType || current.windowType || 'rolling',
    windowMinutes: template.windowMinutes || current.windowMinutes || 60,
    warningThreshold: template.warningThreshold ?? current.warningThreshold ?? 0.75,
    resetAnchor: template.windowType === 'fixed'
      ? current.resetAnchor || defaultResetAnchor(now)
      : current.resetAnchor || ''
  };
}
