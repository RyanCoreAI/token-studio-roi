/* =============================================================
   /review — main app (real data via /api/data)
   ============================================================= */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { U } from '../shared/utils.js';
import { RU } from './utils.js';
import { HeroSection, ProjectSection, CalendarSection } from './sections-1.jsx';
import { ToolsSection, EfficiencySection, ClosureProgressSection, RoiEvidenceSection, RoiAdvisorSection, ModelStrategySection, InsightsSection } from './sections-2.jsx';
import { buildRoiAdvisor } from './roi-advisor.js';
import { buildMarkdownReviewReport, buildReviewReportFilename } from './markdown-report.js';
import { buildModelStrategy } from './model-strategy.js';
import { buildReviewClosureProgress } from './closure-progress.js';
import { buildRoiEvidence } from './roi-evidence.js';
import './styles.css';

export function ReviewApp() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/data')
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

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

  return <ReviewDashboard rawData={data}/>;
}

function ReviewDashboard({ rawData }) {
  const TODAY = new Date();
  TODAY.setHours(0, 0, 0, 0);

  const [periodId, setPeriodId] = useState('month');
  const [activePageIndex, setActivePageIndex] = useState(0);
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
  const markdownReport = useMemo(() =>
    buildMarkdownReviewReport({ period, daily, sessions, workItems: rawData.workItems || [], roiAdvice, insights })
  , [period, daily, sessions, rawData.workItems, roiAdvice, insights]);

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

  const reviewPages = useMemo(() => [
    {
      id: 'overview',
      label: '总览',
      className: 'page',
      content: <HeroSection period={period} totals={totals} prevTotals={prevTotals} stats={heroStats}/>
    },
    {
      id: 'evidence',
      label: 'ROI 证据',
      className: 'page',
      content: <RoiEvidenceSection evidence={roiEvidence}/>
    },
    {
      id: 'closure',
      label: '闭环',
      className: 'page',
      content: <ClosureProgressSection progress={closureProgress}/>
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
      id: 'advisor',
      label: 'ROI 建议',
      className: 'page',
      content: <RoiAdvisorSection suggestions={roiAdvice}/>
    },
    {
      id: 'strategy',
      label: '模型策略',
      className: 'page',
      content: <ModelStrategySection strategy={modelStrategy}/>
    },
    {
      id: 'insights',
      label: '洞察',
      className: 'page',
      content: <InsightsSection insights={insights}/>
    }
  ], [period, totals, prevTotals, heroStats, roiEvidence, closureProgress, daily, roiAdvice, modelStrategy, insights]);

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
            <button className="nav-btn primary" onClick={exportMarkdown}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                <path d="M6.5 1.5v6M4 5l2.5 2.5L9 5M2.5 10.5h8" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              导出报告
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

      <ReviewPageControls
        pages={reviewPages}
        activeIndex={activePageIndex}
        onPrevious={() => goToReviewPage(activePageIndex - 1)}
        onNext={() => goToReviewPage(activePageIndex + 1)}
        onJump={goToReviewPage}
      />

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
