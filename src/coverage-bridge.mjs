const TRUSTED_NATIVE_STATUSES = new Set(['stable']);
const IMPORT_BRIDGE_STATUSES = new Set(['import-only']);
const DETECTED_ONLY_STATUSES = new Set(['detected-only', 'experimental']);

export function buildCoverageBridge({ sourceHealth = [] } = {}) {
  const rows = sourceHealth.map(row => {
    const status = bridgeStatus(row);
    const hasUsage = Number(row.sessions || 0) > 0
      || Number(row.tokenEvents || 0) > 0
      || Number(row.dailyRows || 0) > 0;
    return {
      id: row.id,
      label: row.label,
      status,
      statusLabel: statusLabel(status),
      detected: Boolean(row.detected),
      hasUsage,
      sessions: Number(row.sessions || 0),
      tokenEvents: Number(row.tokenEvents || 0),
      totalTokens: Number(row.totalTokens || 0),
      tokenReliability: row.tokenReliability || 'unknown',
      commandHint: row.commandHint || commandForStatus(status, row.id),
      recommendedAction: bridgeRecommendation(row, status),
      privacy: row.readsConversationContent ? '需要审计内容风险' : '不读取正文',
      lastSeenAt: row.lastSeenAt || row.lastRunAt || null,
      health: row.health || 'unknown'
    };
  });
  const summary = {
    totalSources: rows.length,
    nativeTrusted: rows.filter(row => row.status === 'native-trusted').length,
    importable: rows.filter(row => row.status === 'ccusage-importable').length,
    detectedOnly: rows.filter(row => row.status === 'detected-only').length,
    unsupported: rows.filter(row => row.status === 'unsupported').length,
    sourcesWithUsage: rows.filter(row => row.hasUsage).length,
    totalTokens: rows.reduce((sum, row) => sum + row.totalTokens, 0)
  };

  return {
    generatedAt: new Date().toISOString(),
    summary,
    rows: rows.sort(compareBridgeRows),
    note: 'Coverage Bridge explains support and import paths. Detected-only sources are not counted as successful token collection.'
  };
}

function bridgeStatus(row = {}) {
  if (TRUSTED_NATIVE_STATUSES.has(row.supportStatus) && row.tokenReliability === 'native-token-fields') {
    return 'native-trusted';
  }
  if (IMPORT_BRIDGE_STATUSES.has(row.supportStatus) || row.id === 'ccusage') {
    return 'ccusage-importable';
  }
  if (row.detected || DETECTED_ONLY_STATUSES.has(row.supportStatus)) {
    return 'detected-only';
  }
  return 'unsupported';
}

function statusLabel(status) {
  return ({
    'native-trusted': '原生可信采集',
    'ccusage-importable': 'ccusage 可导入',
    'detected-only': '仅检测到',
    unsupported: '不支持 / 无 token 字段'
  })[status] || '未知状态';
}

function bridgeRecommendation(row, status) {
  if (status === 'native-trusted') {
    return row.hasUsage
      ? '已有原生结构化 token 数据；如需补齐其他工具，可再导入 ccusage JSON。'
      : `运行 ${row.commandHint || commandForStatus(status, row.id)} 做 dry-run，确认后再 apply。`;
  }
  if (status === 'ccusage-importable') {
    return '用 ccusage CLI 或保存的 JSON 导入结构化 token；Token Studio 会重算官方价并拒绝正文风险字段。';
  }
  if (status === 'detected-only') {
    return '检测到工具痕迹但没有可靠 token 字段；不要把它当作已覆盖，优先用 ccusage bridge 补数据。';
  }
  return '当前没有可靠 token 字段或本机未检测到数据；等待上游记录 token 字段后再升级支持。';
}

function commandForStatus(status, id) {
  if (status === 'native-trusted') return `npx token-studio collect --dry-run --sources=${id}`;
  if (status === 'ccusage-importable') return 'npx token-studio import-usage --format=ccusage-cli --report=session --dry-run --yes';
  return 'npx token-studio collectors --json';
}

function compareBridgeRows(a, b) {
  const rank = {
    'native-trusted': 0,
    'ccusage-importable': 1,
    'detected-only': 2,
    unsupported: 3
  };
  return (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
    || Number(b.hasUsage) - Number(a.hasUsage)
    || b.totalTokens - a.totalTokens
    || String(a.label || '').localeCompare(String(b.label || ''));
}
