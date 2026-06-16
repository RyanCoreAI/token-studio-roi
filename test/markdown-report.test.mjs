import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildMarkdownReviewReport,
  buildModelRows,
  buildReviewReportFilename
} from '../src/client/review/markdown-report.js';

const period = {
  pretty: '2026 年 6 月',
  start: '2026-06-01',
  end: '2026-06-12'
};

test('buildMarkdownReviewReport renders the fixed weekly review structure', () => {
  const report = buildMarkdownReviewReport({
    period,
    daily: [],
    sessions: [],
    roiAdvice: [],
    generatedAt: new Date(2026, 5, 12, 9, 30)
  });

  assert.match(report, /^# Token Studio Weekly Review/);
  assert.match(report, /## 1\. 本期总览/);
  assert.match(report, /## 8\. 口径说明/);
  assert.match(report, /官方公开 token 单价换算，不是供应商账单/);
  assert.match(report, /不读取、不导出对话正文/);
});

test('buildMarkdownReviewReport includes unattributed work and advisor actions', () => {
  const report = buildMarkdownReviewReport({
    period,
    daily: [{
      usageDate: '2026-06-10',
      source: 'Codex CLI',
      model: 'gpt-5.5',
      totalTokens: 1000,
      inputTokens: 800,
      outputTokens: 100,
      cacheReadTokens: 50,
      costUSD: 1
    }],
    sessions: [{
      sessionId: 's1',
      projectPath: 'D:\\AIResume',
      taskType: '未分类',
      outputStatus: '未标注',
      totalTokens: 1000,
      costUSD: 1
    }],
    roiAdvice: [{
      title: '先补齐高成本会话',
      category: '补标注',
      impact: '高',
      recommendation: '补用途和价值',
      reason: '缺少归因字段',
      evidence: '1 个 session 未归因',
      action: '先标注最高成本 session'
    }],
    generatedAt: new Date(2026, 5, 12, 9, 30)
  });

  assert.match(report, /未归因 session \| 1/);
  assert.match(report, /建议分类：补标注/);
  assert.match(report, /先标注最高成本 session/);
  assert.match(report, /补齐 D:\\AIResume 的 session 标注/);
});

test('buildMarkdownReviewReport lists highest-cost review attribution gaps first', () => {
  const report = buildMarkdownReviewReport({
    period,
    daily: [],
    sessions: [
      {
        sessionId: 'low-cost-gap',
        projectAlias: 'Low Cost',
        taskType: '未分类',
        outputStatus: '未标注',
        totalTokens: 100,
        costUSD: 0.02,
        lastActivity: '2026-06-09'
      },
      {
        sessionId: 'high-cost-gap',
        projectAlias: 'Token Studio',
        taskType: '功能开发',
        outputStatus: '已完成',
        workPurpose: '未说明',
        workStage: '未说明',
        valueLevel: '未评估',
        totalTokens: 5000,
        costUSD: 2.5,
        lastActivity: '2026-06-12'
      }
    ]
  });

  const highIndex = report.indexOf('high-cost-gap');
  const lowIndex = report.indexOf('low-cost-gap');
  assert.match(report, /### 高成本待补齐归因/);
  assert.ok(highIndex > -1);
  assert.ok(lowIndex > -1);
  assert.ok(highIndex < lowIndex);
  assert.match(report, /工作目的、工作阶段、产出价值/);
  assert.match(report, /Token Studio \| high-cost-gap \| 工作目的、工作阶段、产出价值 \| missing \| 5,000 \| \$2\.50 \| 2026-06-12/);
});

test('buildMarkdownReviewReport includes published output links without fetching content', () => {
  const report = buildMarkdownReviewReport({
    period,
    daily: [],
    sessions: [{
      sessionId: 'published',
      projectAlias: 'Token Studio',
      taskType: '功能开发',
      outputStatus: '已发布',
      outputType: 'PR',
      outputLabel: 'v3.1 PR',
      outputUrl: 'https://example.com/pr/1',
      totalTokens: 100,
      costUSD: 0.1
    }]
  });

  assert.match(report, /已发布 \| PR \| v3\.1 PR \| Token Studio \| \[v3\.1 PR\]\(https:\/\/example.com\/pr\/1\)/);
});

test('buildMarkdownReviewReport keeps unpriced model wording and escapes spreadsheet formula prefixes', () => {
  const report = buildMarkdownReviewReport({
    period,
    daily: [{
      usageDate: '2026-06-10',
      source: 'Codex CLI',
      model: '=IMPORTXML("https://example.com")',
      totalTokens: 100,
      inputTokens: 80,
      outputTokens: 20,
      cacheReadTokens: 0,
      costUSD: 0
    }],
    sessions: [{
      sessionId: 's1',
      projectAlias: '+cmd|danger',
      taskType: '功能开发',
      outputStatus: '已完成',
      totalTokens: 100,
      costUSD: 0
    }]
  });

  assert.match(report, /未定价\/无官方价/);
  assert.match(report, /'\=IMPORTXML/);
  assert.match(report, /'\+cmd\\\|danger/);
});

test('buildModelRows aggregates by model and source', () => {
  const rows = buildModelRows([
    { source: 'Codex CLI', model: 'gpt-5.5', totalTokens: 100, costUSD: 1 },
    { source: 'Codex CLI', model: 'gpt-5.5', totalTokens: 50, costUSD: 0.5 },
    { source: 'Claude Code', model: 'claude-sonnet', totalTokens: 25, costUSD: 0.1 }
  ]);

  assert.equal(rows[0].model, 'gpt-5.5');
  assert.equal(rows[0].totalTokens, 150);
  assert.equal(rows[0].share, 150 / 175);
});

test('buildReviewReportFilename uses the active period end date', () => {
  assert.equal(buildReviewReportFilename(period), 'token-studio-review-2026-06-12.md');
});
