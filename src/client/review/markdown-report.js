import {
  buildProjectRoiRows,
  buildReviewUnattributedSessions,
  buildRiskDistribution,
  buildUnattributedSessions,
  sessionProjectLabel
} from '../dashboard/attribution.js';
import { buildRoiEvidence } from './roi-evidence.js';

const PRODUCTIVE_STATUSES = new Set(['已完成', '已发布']);

export function buildMarkdownReviewReport({
  period,
  daily = [],
  sessions = [],
  workItems = [],
  roiAdvice = [],
  insights = [],
  generatedAt = new Date()
} = {}) {
  const totals = aggregateDaily(daily);
  const projectRows = buildProjectRoiRows(sessions).slice(0, 8);
  const modelRows = buildModelRows(daily).slice(0, 8);
  const outputRows = buildOutputRows(sessions).slice(0, 12);
  const riskRows = buildRiskDistribution(sessions);
  const attributionGapRows = buildAttributionGapRows(sessions).slice(0, 10);
  const attributionBreakdown = buildAttributionBreakdown(sessions);
  const roiEvidence = buildRoiEvidence({ sessions, workItems });
  const actionItems = buildActionItems({ roiAdvice, sessions, outputRows });

  return [
    '# Token Studio Weekly Review',
    '',
    `- 生成时间：${safeText(formatDateTime(generatedAt))}`,
    `- 复盘周期：${safeText(period?.pretty || `${period?.start || ''} - ${period?.end || ''}` || '当前筛选周期')}`,
    `- 数据口径：本地结构化用量、人工标注、自动归因和产出链接；不包含对话正文。`,
    '',
    '## 1. 本期总览',
    '',
    table(
      ['指标', '数值'],
      [
        ['Session 数', formatInt(sessions.length)],
        ['总 tokens', compactCN(totals.totalTokens)],
        ['输入 tokens', compactCN(totals.inputTokens)],
        ['输出 tokens', compactCN(totals.outputTokens)],
        ['Cache read tokens', compactCN(totals.cacheReadTokens)],
        ['官方价换算', money(totals.costUSD)],
        ['未归因 session', formatInt(buildUnattributedSessions(sessions).length)],
        ['人工确认归因', formatInt(attributionBreakdown.manual)],
        ['自动高置信归因', formatInt(attributionBreakdown.autoHigh)],
        ['自动低置信 / 待确认', formatInt(attributionBreakdown.autoLow + attributionBreakdown.missing)],
        ['ROI 证据完整度', `${roiEvidence.evidenceScore}/100`],
        ['Work items', formatInt(roiEvidence.workItemCount)]
      ]
    ),
    '',
    '## 2. 成本最高项目',
    '',
    projectRows.length ? table(
      ['项目', 'Sessions', 'Tokens', '官方价', '完成/发布占比', '风险占比'],
      projectRows.map(row => [
        row.project,
        row.sessionCount,
        compactCN(row.totalTokens),
        money(row.costUSD),
        pct(row.productiveShare),
        pct(row.riskShare)
      ])
    ) : '本期没有项目数据。',
    '',
    '## 3. 模型使用分布',
    '',
    modelRows.length ? table(
      ['模型', '来源', 'Tokens', '官方价', '占比'],
      modelRows.map(row => [
        row.model,
        row.source,
        compactCN(row.totalTokens),
        row.costUSD > 0 ? money(row.costUSD) : '未定价/无官方价',
        pct(row.share)
      ])
    ) : '本期没有模型数据。',
    '',
    '## 4. 已完成 / 已发布产出',
    '',
    outputRows.length ? table(
      ['状态', '类型', '标签', '项目', '链接'],
      outputRows.map(row => [
        row.outputStatus,
        row.outputType || '未分类',
        row.outputLabel || row.outputUrl || row.sessionId,
        sessionProjectLabel(row),
        markdownLink(row.outputLabel || row.outputUrl || '产出链接', row.outputUrl)
      ])
    ) : '本期没有已完成/已发布的产出链接。建议先给高价值 session 补 PR、commit、文章、部署、文档或截图链接。',
    '',
    '## 5. 风险成本',
    '',
    riskRows.length ? table(
      ['风险类型', 'Sessions', 'Tokens', '官方价', '占比'],
      riskRows.map(row => [
        row.label,
        row.sessionCount,
        compactCN(row.totalTokens),
        money(row.costUSD),
        pct(row.share)
      ])
    ) : '本期没有明显风险成本。',
    '',
    '### 高成本待补齐归因',
    '',
    attributionGapRows.length ? table(
      ['优先级', '项目', 'Session', '缺失字段', '归因来源', 'Tokens', '官方价', '最后活动'],
      attributionGapRows.map((row, index) => [
        index + 1,
        row.project,
        row.sessionId,
        row.missingFields.join('、'),
        row.attributionLabel,
        compactCN(row.totalTokens),
        row.costUSD > 0 ? money(row.costUSD) : '未定价/无官方价',
        row.lastActivity || ''
      ])
    ) : '本期没有待补齐的高成本归因 session。',
    '',
    '## 6. ROI Advisor 建议',
    '',
    roiAdvice.length ? roiAdvice.map((item, index) => [
      `### ${index + 1}. ${safeText(item.title)}`,
      '',
      `- 建议分类：${safeText(item.category || '未分类')}`,
      `- 影响级别：${safeText(item.impact || '未标注')}`,
      `- 建议：${safeText(item.recommendation)}`,
      `- 原因：${safeText(item.reason)}`,
      `- 证据：${safeText(item.evidence)}`,
      `- 建议动作：${safeText(item.action)}`
    ].join('\n')).join('\n\n') : '本期没有触发 ROI Advisor 建议。',
    '',
    '## 7. 下周行动清单',
    '',
    actionItems.length ? actionItems.map(item => `- ${safeText(item)}`).join('\n') : '- 保持当前模型和上下文使用策略，继续补充真实产出链接。',
    '',
    '## 8. 口径说明',
    '',
    '- 金额为官方公开 token 单价换算，不是供应商账单或财务对账结果。',
    '- ChatGPT 套餐额度、企业折扣、税费、区域价、Batch/Flex/Priority 和特殊长上下文计费不会自动套用。',
    '- 未公开官方美元价的模型保持“未定价”，不会按 $0 参与成本决策。',
    '- 自动归因是基于结构化元数据的规则推断，不等同人工确认；高成本自动项建议抽查。',
    '- 报告只使用本地结构化用量、人工标注、自动归因和产出链接，不读取、不导出对话正文。',
    '- 产出链接只记录 URL、标签和类型；Token Studio 不抓取链接内容。'
  ].join('\n');
}

export function buildReviewReportFilename(period, today = new Date()) {
  const suffix = period?.end || formatDate(today);
  return `token-studio-review-${suffix}.md`;
}

export function buildModelRows(daily = []) {
  const rows = new Map();
  const totalTokens = daily.reduce((sum, row) => sum + (row.totalTokens || 0), 0);
  for (const row of daily) {
    const model = row.model || '<unknown>';
    const source = row.source || 'unknown';
    const key = `${model}::${source}`;
    if (!rows.has(key)) {
      rows.set(key, { model, source, totalTokens: 0, costUSD: 0 });
    }
    const acc = rows.get(key);
    acc.totalTokens += row.totalTokens || 0;
    acc.costUSD += row.costUSD || 0;
  }
  return Array.from(rows.values())
    .map(row => ({
      ...row,
      share: totalTokens ? row.totalTokens / totalTokens : 0
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);
}

function buildOutputRows(sessions = []) {
  return sessions
    .filter(session => PRODUCTIVE_STATUSES.has(session.outputStatus) && session.outputUrl)
    .sort((a, b) => (b.totalTokens || 0) - (a.totalTokens || 0));
}

function buildAttributionGapRows(sessions = []) {
  return buildReviewUnattributedSessions(sessions).map(session => ({
    project: sessionProjectLabel(session),
    sessionId: session.sessionId || '',
    missingFields: missingAttributionFields(session),
    attributionLabel: attributionLabel(session),
    totalTokens: session.totalTokens || 0,
    costUSD: session.costUSD || 0,
    lastActivity: session.lastActivity || session.lastSeenAt || session.updatedAt || ''
  }));
}

function buildAttributionBreakdown(sessions = []) {
  return sessions.reduce((acc, session) => {
    if (session.annotationSource === 'auto') {
      if (Number(session.annotationConfidence || 0) >= 80) acc.autoHigh += 1;
      else acc.autoLow += 1;
    } else if (session.annotationSource === 'manual' || session.annotationSource === 'imported') {
      acc.manual += 1;
    } else {
      acc.missing += 1;
    }
    return acc;
  }, { manual: 0, autoHigh: 0, autoLow: 0, missing: 0 });
}

function attributionLabel(session = {}) {
  if (session.annotationSource === 'auto') return `auto ${Number(session.annotationConfidence || 0)}%`;
  if (session.annotationSource === 'manual') return 'manual';
  if (session.annotationSource === 'imported') return 'imported';
  return 'missing';
}

function missingAttributionFields(session = {}) {
  const fields = [];
  if ((session.taskType || '未分类') === '未分类') fields.push('任务类型');
  if ((session.outputStatus || '未标注') === '未标注') fields.push('产出状态');
  if ((session.workPurpose || '未说明') === '未说明') fields.push('工作目的');
  if ((session.workStage || '未说明') === '未说明') fields.push('工作阶段');
  if ((session.valueLevel || '未评估') === '未评估') fields.push('产出价值');
  return fields;
}

function buildActionItems({ roiAdvice = [], sessions = [], outputRows = [] }) {
  const items = roiAdvice.slice(0, 3).map(item => item.action).filter(Boolean);
  const unattributed = buildUnattributedSessions(sessions).slice(0, 3);
  for (const session of unattributed) {
    items.push(`补齐 ${sessionProjectLabel(session)} 的 session 标注：任务、目的、阶段、价值和产出状态。`);
  }
  if (!outputRows.length) {
    items.push('给已完成或已发布的高价值 session 补充 PR、commit、文章、部署、文档或截图链接。');
  }
  return Array.from(new Set(items)).slice(0, 8);
}

function aggregateDaily(daily = []) {
  return daily.reduce((acc, row) => {
    acc.totalTokens += row.totalTokens || 0;
    acc.inputTokens += row.inputTokens || 0;
    acc.outputTokens += row.outputTokens || 0;
    acc.cacheReadTokens += row.cacheReadTokens || 0;
    acc.cacheCreationTokens += row.cacheCreationTokens || 0;
    acc.reasoningOutputTokens += row.reasoningOutputTokens || 0;
    acc.costUSD += row.costUSD || 0;
    return acc;
  }, {
    totalTokens: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    reasoningOutputTokens: 0,
    costUSD: 0
  });
}

function table(headers, rows) {
  return [
    `| ${headers.map(safeCell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.map(safeCell).join(' | ')} |`)
  ].join('\n');
}

function safeCell(value) {
  const text = safeText(value);
  const formulaSafe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return formulaSafe.replace(/\|/g, '\\|');
}

function safeText(value) {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function markdownLink(label, url) {
  const text = safeText(label || url || '链接');
  const href = safeText(url);
  if (!/^https?:\/\//i.test(href)) return text || '—';
  return `[${text.replace(/[[\]]/g, '')}](${href.replace(/[()]/g, encodeURIComponent)})`;
}

function compactCN(value) {
  const v = Number(value || 0);
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${(v / 1e8).toFixed(2).replace(/\.?0+$/, '')} 亿`;
  if (abs >= 1e4) return `${(v / 1e4).toFixed(1).replace(/\.0$/, '')} 万`;
  return formatInt(v);
}

function formatInt(value) {
  return new Intl.NumberFormat('zh-CN').format(Math.round(Number(value || 0)));
}

function money(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number(value || 0));
}

function pct(value) {
  return `${(Number(value || 0) * 100).toFixed(1)}%`;
}

function formatDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

function formatDateTime(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${formatDate(d)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
