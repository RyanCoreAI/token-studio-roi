/* =============================================================
   /review — main app (real data via /api/data)
   ============================================================= */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { U } from '../shared/utils.js';
import { RU } from './utils.js';
import { HeroSection, ProjectSection, CalendarSection } from './sections-1.jsx';
import { ToolsSection, EfficiencySection, ClosureProgressSection, EvidenceFlywheelSection, RoiEvidenceSection, SavingsSimulatorSection, RoiAdvisorSection, AdvisorActionSummarySection, ModelStrategySection, InsightsSection, ReviewTrustBanner } from './sections-2.jsx';
import { buildRoiAdvisor } from './roi-advisor.js';
import { buildMarkdownReviewReport, buildReviewReportFilename } from './markdown-report.js';
import { buildModelStrategy } from './model-strategy.js';
import { buildReviewClosureProgress } from './closure-progress.js';
import { buildRoiEvidence } from './roi-evidence.js';
import { buildSavingsSimulation } from './savings-simulator.js';
import { buildReviewTrustState } from './review-trust.js';
import { buildEvidenceZeroState, buildSavingsEmptyReason } from './review-empty-states.js';
import './styles.css';

function formatApiConnectionError(error, action = '请求') {
  const message = error?.message || '';
  if (message === 'Failed to fetch' || error?.name === 'TypeError') {
    return `${action}失败：本地 API 服务没有连上。请关闭旧页面，重新运行 npx token-studio，并打开终端输出的最新本地 URL。`;
  }
  return message || `${action}失败`;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return true;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  return true;
}

export function ReviewApp() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadData = useCallback(() => {
    setError(null);
    return fetch('/api/data')
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', flexDirection: 'column', gap: 16
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%',
          border: '3px solid var(--rule)', borderTopColor: 'var(--indigo)',
          animation: 'spin 0.8s linear infinite'
        }}/>
        <div style={{color: 'var(--ink-soft)', fontSize: 14}}>加载数据中…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100vh', flexDirection: 'column', gap: 12
      }}>
        <div style={{fontSize: 32}}>⚠️</div>
        <div style={{color: 'var(--ink)', fontWeight: 600}}>数据加载失败</div>
        <div style={{color: 'var(--ink-soft)', fontSize: 13}}>{error}</div>
        <button onClick={() => window.location.reload()} style={{
          marginTop: 8, padding: '8px 18px', borderRadius: 8,
          border: '1px solid var(--rule)', background: 'var(--paper-2)',
          cursor: 'pointer', fontSize: 13
        }}>重新加载</button>
      </div>
    );
  }

  return <ReviewDashboard rawData={data} onReloadData={loadData}/>;
}

function ReviewDashboard({ rawData, onReloadData }) {
  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);

  const [periodId, setPeriodId] = useState('month');
  const [activePageIndex, setActivePageIndex] = useState(0);
  const [advisorActions, setAdvisorActions] = useState(rawData.advisorActions || []);
  const [lazyAttributionState, setLazyAttributionState] = useState({ busy: false, message: '', error: '' });
  const [evidenceAutopilotState, setEvidenceAutopilotState] = useState({
    busy: false,
    applyingId: '',
    message: '',
    error: '',
    plan: null,
    dismissedIds: []
  });
  const pageRefs = useRef([]);
  const period = useMemo(() => RU.getPeriod(periodId, TODAY, rawData.daily), [periodId, rawData.daily]);
  const prevPeriod = useMemo(() => period.prev
    ? { start: period.prev.start, end: period.prev.end }
    : null, [period]);

  const daily = useMemo(() => RU.filterByPeriod(rawData.daily, period), [rawData, period]);
  const sessions = useMemo(() =>
    rawData.sessions.filter(session =>
      !session.lastActivity || (session.lastActivity >= period.start && session.lastActivity <= period.end)
    )
  , [rawData, period]);
  const prevDaily = useMemo(() =>
    prevPeriod ? RU.filterByPeriod(rawData.daily, prevPeriod) : []
  , [rawData, prevPeriod]);

  // Aggregate totals
  const totals = useMemo(() => {
    const total = RU.sumField(daily, 'totalTokens');
    const input = RU.sumField(daily, 'inputTokens');
    const output = RU.sumField(daily, 'outputTokens');
    const cacheRead = RU.sumField(daily, 'cacheReadTokens');
    const cacheCreation = RU.sumField(daily, 'cacheCreationTokens');
    const reasoning = RU.sumField(daily, 'reasoningOutputTokens');
    const cost = RU.sumField(daily, 'costUSD');
    return {
      total, input, output, cacheRead, cacheCreation, reasoning, cost,
      cacheHitRate: total ? (cacheRead / total) * 100 : 0
    };
  }, [daily]);

  const prevTotals = useMemo(() => prevDaily.length ? ({
    total: RU.sumField(prevDaily, 'totalTokens'),
    cost:  RU.sumField(prevDaily, 'costUSD')
  }) : null, [prevDaily]);

  // Hero stat strip
  const heroStats = useMemo(() => {
    const days = RU.dailyTotals(daily, period);
    const active = days.filter(d => d.total > 0);
    const peak = active.length ? [...active].sort((a, b) => b.total - a.total)[0] : null;
    const tools = RU.aggregateBy(daily, 'source').sort((a, b) => b.totalTokens - a.totalTokens);
    const projects = RU.aggregateBy(daily, 'projectPath').filter(p => p.key);
    const topTool = tools[0];
    return {
      activeDays: active.length,
      projectCount: projects.length,
      sourceCount: tools.length,
      peakDay: peak,
      topTool: topTool ? {
        key: topTool.key,
        short: topTool.key.replace(/ CLI| Code/, ''),
        totalTokens: topTool.totalTokens,
        share: (topTool.totalTokens / (totals.total || 1)) * 100
      } : null,
      avgDailyCost: active.length ? totals.cost / active.length : 0
    };
  }, [daily, period, totals]);

  // Insights
  const insights = useMemo(() =>
    RU.buildInsights(daily, period, prevDaily)
  , [daily, period, prevDaily]);
  const roiAdvice = useMemo(() =>
    buildRoiAdvisor({ sessions, daily })
  , [sessions, daily]);
  const modelStrategy = useMemo(() =>
    buildModelStrategy({ sessions })
  , [sessions]);
  const closureProgress = useMemo(() =>
    buildReviewClosureProgress({ sessions, roiAdvice })
  , [sessions, roiAdvice]);
  const roiEvidence = useMemo(() =>
    buildRoiEvidence({ sessions, workItems: rawData.workItems || [] })
  , [sessions, rawData.workItems]);
  const savingsSimulation = useMemo(() =>
    buildSavingsSimulation({ sessions, daily, pricingMeta: rawData.meta?.officialPricing || null })
  , [sessions, daily, rawData.meta]);
  const trustState = useMemo(() =>
    buildReviewTrustState(rawData.meta || {})
  , [rawData.meta]);
  const evidenceZeroState = useMemo(() =>
    buildEvidenceZeroState(roiEvidence, rawData.meta?.projectCoverage || {})
  , [roiEvidence, rawData.meta]);
  const savingsEmptyReason = useMemo(() =>
    buildSavingsEmptyReason({ simulation: savingsSimulation, sessions })
  , [savingsSimulation, sessions]);
  const evidenceFlywheel = rawData.meta?.evidenceFlywheel || null;
  const coverageBridge = rawData.meta?.coverageBridge || null;
  const markdownReport = useMemo(() =>
    buildMarkdownReviewReport({
      period,
      daily,
      sessions,
      workItems: rawData.workItems || [],
      roiAdvice,
      insights,
      savingsSimulation,
      advisorActions,
      coverageBridge,
      evidenceFlywheel
    })
  , [period, daily, sessions, rawData.workItems, roiAdvice, insights, savingsSimulation, advisorActions, coverageBridge, evidenceFlywheel]);

  useEffect(() => {
    setAdvisorActions(rawData.advisorActions || []);
  }, [rawData.advisorActions]);

  const actionsByRule = useMemo(() => {
    const map = new Map();
    for (const action of advisorActions) {
      if (action.periodStart === period.start && action.periodEnd === period.end && action.sourceRule) {
        map.set(action.sourceRule, action);
      }
    }
    return map;
  }, [advisorActions, period]);
  const periodAdvisorActions = useMemo(() =>
    advisorActions.filter(action => action.periodStart === period.start && action.periodEnd === period.end)
  , [advisorActions, period]);

  const persistAdvisorAction = useCallback(async (payload) => {
    const response = await fetch('/api/advisor-actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        periodStart: period.start,
        periodEnd: period.end,
        ...payload
      })
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    const data = await response.json();
    setAdvisorActions(current => {
      const next = current.filter(item => item.id !== data.action.id);
      next.unshift(data.action);
      return next;
    });
    return data.action;
  }, [period]);

  const addAdvisorAction = useCallback((payload) =>
    persistAdvisorAction({ ...payload, status: 'open' })
  , [persistAdvisorAction]);

  const setAdvisorActionStatus = useCallback((action, status) =>
    persistAdvisorAction({ ...action, status })
  , [persistAdvisorAction]);

  const applyLazyAttribution = useCallback(async () => {
    setLazyAttributionState({ busy: true, message: '', error: '' });
    try {
      const response = await fetch('/api/auto-attribution/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `HTTP ${response.status}`);
      }
      const result = await response.json();
      setLazyAttributionState({
        busy: false,
        message: `已应用 ${result.applied ?? 0} 条高置信自动归因；自动推断不等同人工确认。`,
        error: ''
      });
      await onReloadData?.();
    } catch (error) {
      setLazyAttributionState({
        busy: false,
        message: '',
        error: formatApiConnectionError(error, '自动归因')
      });
    }
  }, [onReloadData]);

  const loadEvidenceAutopilotPlan = useCallback(async () => {
    const response = await fetch(`/api/evidence-suggestions?period=${encodeURIComponent(periodId)}`);
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    const payload = await response.json();
    return payload.plan || null;
  }, [periodId]);

  const runEvidenceAutopilot = useCallback(async () => {
    setEvidenceAutopilotState(current => ({
      ...current,
      busy: true,
      applyingId: '',
      message: '',
      error: ''
    }));
    try {
      const plan = await loadEvidenceAutopilotPlan();
      const suggestionIds = plan?.summary?.canApplyIds || [];
      if (!suggestionIds.length) {
        setEvidenceAutopilotState(current => ({
          ...current,
          busy: false,
          plan,
          message: '已生成待确认队列；当前没有可直接写入的高置信证据。',
          error: ''
        }));
        return;
      }
      const response = await fetch('/api/evidence-suggestions/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: periodId, suggestionIds })
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `HTTP ${response.status}`);
      }
      const result = await response.json();
      let refreshedPlan = result.plan || plan;
      try {
        refreshedPlan = await loadEvidenceAutopilotPlan();
      } catch {
        // Keep the apply result visible if the follow-up read fails.
      }
      setEvidenceAutopilotState(current => ({
        ...current,
        busy: false,
        plan: refreshedPlan,
        message: `已应用 ${result.appliedAnnotations || 0} 条归因证据、${result.appliedOutputs || 0} 条产出链接；自动证据不等同人工确认。`,
        error: ''
      }));
      await onReloadData?.();
    } catch (error) {
      setEvidenceAutopilotState(current => ({
        ...current,
        busy: false,
        message: '',
        error: formatApiConnectionError(error, '生成复盘证据')
      }));
    }
  }, [loadEvidenceAutopilotPlan, onReloadData, periodId]);

  const applyEvidenceSuggestion = useCallback(async (suggestionId) => {
    if (!suggestionId) return;
    setEvidenceAutopilotState(current => ({ ...current, applyingId: suggestionId, error: '', message: '' }));
    try {
      const response = await fetch('/api/evidence-suggestions/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period: periodId, suggestionIds: [suggestionId] })
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || `HTTP ${response.status}`);
      }
      const result = await response.json();
      let refreshedPlan = result.plan;
      try {
        refreshedPlan = await loadEvidenceAutopilotPlan();
      } catch {
        // Keep the apply result visible if the follow-up read fails.
      }
      setEvidenceAutopilotState(current => ({
        ...current,
        applyingId: '',
        plan: refreshedPlan || current.plan,
        message: `已应用 ${result.appliedAnnotations || 0} 条归因证据、${result.appliedOutputs || 0} 条产出链接。`,
        error: ''
      }));
      await onReloadData?.();
    } catch (error) {
      setEvidenceAutopilotState(current => ({
        ...current,
        applyingId: '',
        error: formatApiConnectionError(error, '应用复盘证据')
      }));
    }
  }, [onReloadData, periodId]);

  const dismissEvidenceSuggestion = useCallback((suggestionId) => {
    if (!suggestionId) return;
    setEvidenceAutopilotState(current => ({
      ...current,
      dismissedIds: Array.from(new Set([...(current.dismissedIds || []), suggestionId]))
    }));
  }, []);

  // Period nav
  const ORDER = ['week', 'month', 'prev', '90d', 'all'];
  const idx = ORDER.indexOf(periodId);
  const prevId = idx > 0 ? ORDER[idx - 1] : null;
  const nextId = idx < ORDER.length - 1 ? ORDER[idx + 1] : null;

  const exportCSV = () => {
    U.downloadCSV(`token-review-${period.start}-${period.end}.csv`, daily, [
      { title: 'date', field: 'usageDate' },
      { title: 'source', field: 'source' },
      { title: 'device', field: 'device' },
      { title: 'model', field: 'model' },
      { title: 'project', field: 'projectPath' },
      { title: 'input', field: 'inputTokens' },
      { title: 'output', field: 'outputTokens' },
      { title: 'cache_read', field: 'cacheReadTokens' },
      { title: 'cache_creation', field: 'cacheCreationTokens' },
      { title: 'reasoning', field: 'reasoningOutputTokens' },
      { title: 'total', field: 'totalTokens' },
      { title: 'official_price_usd', field: 'costUSD' }
    ]);
  };

  const exportMarkdown = () => {
    U.downloadText(
      buildReviewReportFilename(period),
      markdownReport,
      'text/markdown;charset=utf-8'
    );
  };

  const copyBlogMaterial = () => copyText(
    [
      `Token Studio ROI ${period.pretty || ''} 复盘：本期记录 ${sessions.length} 个 session、${U.compactCN(totals.total)} tokens，官方价换算 ${U.fmtUS.format(totals.cost)}。`,
      `Coverage Bridge 显示 ${coverageBridge?.summary?.nativeTrusted || 0} 个来源可原生可信采集、${coverageBridge?.summary?.importable || 0} 个来源可通过 ccusage 导入；detected-only 不会被伪造成用量。`,
      `Evidence Flywheel 当前 ${evidenceFlywheel?.completedSteps || 0}/${evidenceFlywheel?.totalSteps || 6} 步完成，下一步是：${evidenceFlywheel?.nextAction || '继续补齐项目、任务、产出和模型策略证据'}。`,
      '所有成本都是官方公开 token 价格换算，不是供应商账单；报告不读取 prompt、response、transcript、diff 或完整路径。'
    ].join('\n\n')
  );

  const copyResumeMaterial = () => copyText(
    [
      '- Built Token Studio ROI, a local-first AI coding ROI review tool with event-level token collection, official-price cost conversion, privacy gates, and evidence-based review workflows.',
      '- Designed Coverage Bridge to distinguish native trusted collectors, ccusage import paths, detected-only tools, and unsupported sources without fabricating token usage.',
      '- Added Evidence Flywheel and rule-based Autopilot to turn local structured metadata into project attribution, output evidence, model policy samples, and weekly review actions without reading conversation content.'
    ].join('\n')
  );

  const reviewPages = useMemo(() => [
    {
      id: 'overview',
      label: '总览',
      className: 'page',
      content: (
        <>
          <HeroSection period={period} totals={totals} prevTotals={prevTotals} stats={heroStats}/>
          <ReviewTrustBanner state={trustState}/>
        </>
      )
    },
    {
      id: 'closure',
      label: '闭环',
      className: 'page',
      content: <ClosureProgressSection
        progress={closureProgress}
        trustState={trustState}
        projectCoverage={rawData.meta?.projectCoverage}
        lazyState={lazyAttributionState}
        onLazyAttribution={applyLazyAttribution}
      />
    },
    {
      id: 'flywheel',
      label: '证据飞轮',
      className: 'page',
      content: <EvidenceFlywheelSection
        flywheel={evidenceFlywheel}
        autopilotState={evidenceAutopilotState}
        onRunAutopilot={runEvidenceAutopilot}
        onApplyEvidenceSuggestion={applyEvidenceSuggestion}
        onDismissEvidenceSuggestion={dismissEvidenceSuggestion}
      />
    },
    {
      id: 'evidence',
      label: 'ROI 证据',
      className: 'page',
      content: <RoiEvidenceSection
        evidence={roiEvidence}
        zeroState={evidenceZeroState}
        lazyState={lazyAttributionState}
        onLazyAttribution={applyLazyAttribution}
        autopilotState={evidenceAutopilotState}
        onRunAutopilot={runEvidenceAutopilot}
        onApplyEvidenceSuggestion={applyEvidenceSuggestion}
        onDismissEvidenceSuggestion={dismissEvidenceSuggestion}
      />
    },
    {
      id: 'projects',
      label: '项目',
      className: 'page',
      content: <ProjectSection daily={daily} totalTokens={totals.total}/>
    },
    {
      id: 'calendar',
      label: '日历',
      className: 'page-wide',
      innerClassName: 'review-page-narrow',
      content: <CalendarSection daily={daily} period={period}/>
    },
    {
      id: 'tools',
      label: '工具',
      className: 'page-wide',
      innerClassName: 'review-page-narrow',
      content: <ToolsSection daily={daily} totalTokens={totals.total}/>
    },
    {
      id: 'efficiency',
      label: '效率',
      className: 'page',
      content: <EfficiencySection daily={daily} period={period}/>
    },
    {
      id: 'savings',
      label: '节省模拟',
      className: 'page',
      content: <SavingsSimulatorSection
        simulation={savingsSimulation}
        emptyReason={savingsEmptyReason}
        lazyState={lazyAttributionState}
        actionsByRule={actionsByRule}
        onAddAction={addAdvisorAction}
        onSetActionStatus={setAdvisorActionStatus}
        onLazyAttribution={applyLazyAttribution}
        autopilotState={evidenceAutopilotState}
        onRunAutopilot={runEvidenceAutopilot}
        onApplyEvidenceSuggestion={applyEvidenceSuggestion}
        onDismissEvidenceSuggestion={dismissEvidenceSuggestion}
      />
    },
    {
      id: 'advisor',
      label: 'ROI 建议',
      className: 'page',
      content: <RoiAdvisorSection
        suggestions={roiAdvice}
        actionsByRule={actionsByRule}
        onAddAction={addAdvisorAction}
        onSetActionStatus={setAdvisorActionStatus}
      />
    },
    {
      id: 'actions',
      label: '行动清单',
      className: 'page',
      content: <AdvisorActionSummarySection
        actions={periodAdvisorActions}
        period={period}
        onSetActionStatus={setAdvisorActionStatus}
      />
    },
    {
      id: 'strategy',
      label: '模型策略',
      className: 'page',
      content: <ModelStrategySection
        strategy={modelStrategy}
        lazyState={lazyAttributionState}
        onLazyAttribution={applyLazyAttribution}
        autopilotState={evidenceAutopilotState}
        onRunAutopilot={runEvidenceAutopilot}
        onApplyEvidenceSuggestion={applyEvidenceSuggestion}
        onDismissEvidenceSuggestion={dismissEvidenceSuggestion}
      />
    },
    {
      id: 'insights',
      label: '洞察',
      className: 'page',
      content: <InsightsSection insights={insights}/>
    }
  ], [period, totals, prevTotals, heroStats, trustState, evidenceFlywheel, roiEvidence, evidenceZeroState, lazyAttributionState, applyLazyAttribution, evidenceAutopilotState, runEvidenceAutopilot, applyEvidenceSuggestion, dismissEvidenceSuggestion, closureProgress, rawData.meta, daily, roiAdvice, savingsSimulation, savingsEmptyReason, modelStrategy, insights, actionsByRule, periodAdvisorActions, addAdvisorAction, setAdvisorActionStatus]);

  const goToReviewPage = useCallback((index) => {
    const nextIndex = Math.max(0, Math.min(reviewPages.length - 1, index));
    const reducedMotion = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    setActivePageIndex(nextIndex);
    pageRefs.current[nextIndex]?.scrollIntoView({
      behavior: reducedMotion ? 'auto' : 'smooth',
      block: 'start'
    });
  }, [reviewPages.length]);

  useEffect(() => {
    pageRefs.current = pageRefs.current.slice(0, reviewPages.length);
  }, [reviewPages.length]);

  useEffect(() => {
    const nodes = pageRefs.current.filter(Boolean);
    if (!nodes.length || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

      if (!visible) return;
      const nextIndex = Number(visible.target.dataset.reviewPageIndex);
      if (Number.isInteger(nextIndex)) setActivePageIndex(nextIndex);
    }, {
      root: null,
      rootMargin: '-32% 0px -48% 0px',
      threshold: [0.2, 0.4, 0.6]
    });

    nodes.forEach(node => observer.observe(node));
    return () => observer.disconnect();
  }, [reviewPages.length]);

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <nav className="review-nav">
        <div className="review-nav-inner">
          <div className="brand-line">
            <span className="brand-dot"/>
            <span className="brand-name">Token Studio</span>
            <div className="page-switch">
              <a href="/" className="page-chip">看板</a>
              <span className="page-chip active">复盘</span>
              <a href="/live" className="page-chip">实时</a>
            </div>
          </div>
          <div className="period-switch">
            {ORDER.map(id => (
              <button key={id}
                className={`period-chip ${periodId === id ? 'active' : ''}`}
                onClick={() => setPeriodId(id)}>
                {RU.PERIOD_LABELS[id]}
              </button>
            ))}
          </div>
          <div className="nav-actions">
            <button className="nav-btn primary" onClick={runEvidenceAutopilot} disabled={evidenceAutopilotState.busy}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1.5l1.1 3.2 3.4 1-3.4 1-1.1 3.3-1.1-3.3-3.4-1 3.4-1 1.1-3.2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
              </svg>
              {evidenceAutopilotState.busy ? '生成中' : '生成复盘证据'}
            </button>
            <button className="nav-btn primary" onClick={exportMarkdown}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1.5v6M4 5l2.5 2.5L9 5M2.5 10.5h8" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              导出报告
            </button>
            <button className="nav-btn" onClick={copyBlogMaterial}>
              复制博客素材
            </button>
            <button className="nav-btn" onClick={copyResumeMaterial}>
              复制简历描述
            </button>
            <button className="nav-btn" onClick={() => window.print()}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <rect x="2.5" y="4.5" width="8" height="6" rx="1" stroke="currentColor" strokeWidth="1.3"/>
                <path d="M4 4.5V2h5v2.5M4 8.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
              打印
            </button>
          </div>
        </div>
      </nav>

      <ReviewPageControls
        pages={reviewPages}
        activeIndex={activePageIndex}
        onPrevious={() => goToReviewPage(activePageIndex - 1)}
        onNext={() => goToReviewPage(activePageIndex + 1)}
        onJump={goToReviewPage}
      />

      {reviewPages.map((page, index) => {
        const content = page.innerClassName
          ? <div className={page.innerClassName}>{page.content}</div>
          : page.content;
        return (
          <div
            key={page.id}
            ref={(node) => { pageRefs.current[index] = node; }}
            data-review-page-index={index}
            className={`${page.className} review-page ${activePageIndex === index ? 'active' : ''}`}
          >
            {content}
          </div>
        );
      })}

      <footer className="review-footer">
        <div className="review-footer-inner">
          <div className="period-jump">
            <button disabled={!prevId} onClick={() => prevId && setPeriodId(prevId)}>
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M8 2l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {prevId ? RU.PERIOD_LABELS[prevId] : '更早'}
            </button>
            <div className="period-current">{period.pretty}</div>
            <button disabled={!nextId} onClick={() => nextId && setPeriodId(nextId)}>
              {nextId ? RU.PERIOD_LABELS[nextId] : '更晚'}
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M4 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          <button className="export-btn" onClick={exportCSV}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v8M4 6l3 3 3-3M2 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            导出 CSV
          </button>
          <button className="export-btn" onClick={exportMarkdown}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v8M4 6l3 3 3-3M2 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            导出复盘报告
          </button>
        </div>
      </footer>
    </>
  );
}

function ReviewPageControls({ pages, activeIndex, onPrevious, onNext, onJump }) {
  const current = pages[activeIndex] || pages[0];
  return (
    <div className="review-page-controls" aria-label="复盘页面导航">
      <button
        type="button"
        className="review-page-btn"
        disabled={activeIndex <= 0}
        onClick={onPrevious}
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M8.5 2.5l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        上一页
      </button>
      <div className="review-page-current">
        <strong>{activeIndex + 1}/{pages.length}</strong>
        <span>{current?.label || '复盘'}</span>
      </div>
      <div className="review-page-dots" aria-label="复盘章节">
        {pages.map((page, index) => (
          <button
            key={page.id}
            type="button"
            className={`review-page-dot ${index === activeIndex ? 'active' : ''}`}
            aria-label={`跳到${page.label}`}
            aria-current={index === activeIndex ? 'step' : undefined}
            onClick={() => onJump(index)}
          />
        ))}
      </div>
      <button
        type="button"
        className="review-page-btn primary"
        disabled={activeIndex >= pages.length - 1}
        onClick={onNext}
      >
        下一页
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
          <path d="M4.5 2.5l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
}
