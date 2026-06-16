const LOW_COST_PURPOSES = new Set(['测试验证', '技术调研', '上下文整理', '需求澄清']);
const HEAVY_VALUE_LEVELS = new Set(['高', '关键']);
const PRODUCTIVE_STATUSES = new Set(['已完成', '已发布']);

export function buildModelPolicy({ sessions = [], generatedAt = new Date() } = {}) {
  const rows = aggregateByPurposeStage(sessions);
  const rules = [
    {
      name: '测试验证和上下文整理默认轻量模型',
      when: 'workPurpose in 测试验证/技术调研/上下文整理/需求澄清',
      policy: '先用轻量模型完成验证、归纳和低风险试错，只有阻塞实现时再升级到中模型。',
      evidence: evidenceFor(rows, row => LOW_COST_PURPOSES.has(row.workPurpose))
    },
    {
      name: '复杂实现默认中模型',
      when: 'workStage in 实现/维护 and valueLevel not in 高/关键',
      policy: '功能实现和常规调试优先用中模型，避免在不确定任务上直接消耗重模型。',
      evidence: evidenceFor(rows, row => ['实现', '维护'].includes(row.workStage) && !HEAVY_VALUE_LEVELS.has(row.valueLevel))
    },
    {
      name: '高价值发布前再上重模型',
      when: 'valueLevel in 高/关键 or outputStatus in 已完成/已发布',
      policy: '重模型用于高价值产出、发布前审查和关键决策，不用于早期大范围探索。',
      evidence: evidenceFor(rows, row => HEAVY_VALUE_LEVELS.has(row.valueLevel) || PRODUCTIVE_STATUSES.has(row.outputStatus))
    }
  ];

  return {
    generatedAt: generatedAt.toISOString(),
    sessionCount: sessions.length,
    rules
  };
}

export function formatModelPolicyMarkdown(policy) {
  return [
    '# Token Studio Model Policy / 模型策略',
    '',
    `Generated at: ${policy.generatedAt}`,
    `Reviewed sessions: ${policy.sessionCount}`,
    '',
    '## Recommended Rules',
    '',
    ...policy.rules.flatMap((rule, index) => [
      `### ${index + 1}. ${rule.name}`,
      '',
      `- When: ${rule.when}`,
      `- Policy: ${rule.policy}`,
      `- Evidence: ${rule.evidence}`,
      ''
    ]),
    '## Scope Notes',
    '',
    '- This policy is generated from local structured metadata and annotations.',
    '- It does not read or export conversation content.',
    '- Cost is official public token-price conversion, not a provider invoice.'
  ].join('\n');
}

function aggregateByPurposeStage(sessions) {
  const rows = new Map();
  for (const session of sessions) {
    const key = [
      session.workPurpose || '未说明',
      session.workStage || '未说明',
      session.valueLevel || '未评估',
      session.outputStatus || '未标注'
    ].join('::');
    if (!rows.has(key)) {
      rows.set(key, {
        workPurpose: session.workPurpose || '未说明',
        workStage: session.workStage || '未说明',
        valueLevel: session.valueLevel || '未评估',
        outputStatus: session.outputStatus || '未标注',
        sessions: 0,
        tokens: 0,
        costUSD: 0
      });
    }
    const row = rows.get(key);
    row.sessions += 1;
    row.tokens += session.totalTokens || 0;
    row.costUSD += session.costUSD || 0;
  }
  return Array.from(rows.values());
}

function evidenceFor(rows, predicate) {
  const matched = rows.filter(predicate);
  const sessions = matched.reduce((sum, row) => sum + row.sessions, 0);
  const tokens = matched.reduce((sum, row) => sum + row.tokens, 0);
  if (!sessions) return 'No matching annotated sessions yet; keep this as the default operating policy.';
  return `${sessions} sessions, ${tokens.toLocaleString('en-US')} tokens in matching annotated work.`;
}
