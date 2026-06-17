import { useEffect, useMemo, useState } from 'react';
import './styles.css';

const REFRESH_MS = 7000;

export function LiveApp() {
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const response = await fetch('/api/live');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (alive) {
          setSnapshot(data);
          setError(null);
        }
      } catch (err) {
        if (alive) setError(err.message);
      }
    }
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  const totals = snapshot?.totals || {};
  const generated = useMemo(() => snapshot?.generatedAt
    ? new Date(snapshot.generatedAt).toLocaleTimeString()
    : 'waiting'
  , [snapshot]);

  return (
    <main className="live-shell">
      <nav className="live-nav">
        <div>
          <span className="live-dot"/>
          <strong>Token Studio Live</strong>
        </div>
        <div className="live-links">
          <a href="/">看板</a>
          <a href="/review">复盘</a>
          <span>{generated}</span>
        </div>
      </nav>

      <section className="live-hero">
        <div>
          <p className="live-kicker">Local metadata only · no transcript access</p>
          <h1>今天的 token 是否正在失控</h1>
          <p>每 5-10 秒读取本地 SQLite 中的结构化 token 元数据，观察最近 {snapshot?.windowMinutes || 15} 分钟的活跃 session、模型和 cache 情况。</p>
        </div>
        <div className={`live-status ${snapshot?.status === 'active' ? 'active' : ''}`}>
          {error ? 'error' : snapshot?.status || 'loading'}
        </div>
      </section>

      {error && <div className="live-error">实时数据加载失败：{error}</div>}

      {snapshot?.warnings?.length > 0 && (
        <section className="live-warnings" aria-label="实时用量预警">
          {snapshot.warnings.map(warning => (
            <article key={warning.type} className={`live-warning ${warning.level || 'medium'}`}>
              <div>
                <span>{warning.level || 'medium'}</span>
                <strong>{warning.message}</strong>
                <p>{warning.evidence}</p>
              </div>
              <b>{warning.action}</b>
            </article>
          ))}
        </section>
      )}

      {snapshot?.budgetWindows?.length > 0 && (
        <section className="budget-windows" aria-label="预算窗口">
          {snapshot.budgetWindows.map(window => (
            <article key={window.id || window.label} className={`budget-window status-${window.status}`}>
              <div className="budget-window-head">
                <div>
                  <span>{window.source || 'all sources'} · {window.windowMinutes}m rolling</span>
                  <strong>{window.label}</strong>
                </div>
                <b>{budgetStatusLabel(window.status)}</b>
              </div>
              <div className="budget-meter" aria-hidden="true">
                <span style={{width: `${Math.min(100, Math.max(window.tokenShare || 0, window.costShare || 0) * 100)}%`}}/>
              </div>
              <div className="budget-window-grid">
                <BudgetMetric label="Tokens" value={`${formatNumber(window.totalTokens)} / ${window.tokenBudget ? formatNumber(window.tokenBudget) : '—'}`} />
                <BudgetMetric label="官方价" value={`$${formatMoney(window.costUSD)} / ${window.costBudgetUSD ? `$${formatMoney(window.costBudgetUSD)}` : '—'}`} />
                <BudgetMetric label="预计 Tokens" value={formatNumber(window.projectedTokens)} />
                <BudgetMetric label="Burn Rate" value={`${formatNumber(window.burnRateTokensPerHour)}/h`} />
              </div>
            </article>
          ))}
        </section>
      )}

      {snapshot?.budgetWindows?.length > 0 && Number(totals.totalTokens || 0) === 0 && (
        <section className="live-first-run-note" aria-label="预算窗口说明">
          <strong>预算窗口已配置，但最近窗口没有事件级 token 数据。</strong>
          <span>
            `/live` 只读取最近 {snapshot?.windowMinutes || 15} 分钟的 token_events。
            如果当前库只有 daily/session 聚合数据，预算配置仍会保留，但实时 burn rate 和窗口消耗会显示为空。
          </span>
        </section>
      )}

      <section className="live-grid">
        <MetricCard label="最近 Token" value={formatNumber(totals.totalTokens)} />
        <MetricCard label="Burn Rate / hour" value={formatNumber(totals.burnRateTokensPerHour)} />
        <MetricCard label="Cache Hit" value={`${formatPercent(totals.cacheHitRate)}%`} />
        <MetricCard label="官方价换算" value={`$${formatMoney(totals.costUSD)}`} />
      </section>

      <section className="live-panels">
        <LivePanel title="活跃 Sessions">
          {snapshot?.activeSessions?.length ? snapshot.activeSessions.map(session => (
            <div className="live-row" key={`${session.device}:${session.source}:${session.sessionId}`}>
              <div>
                <strong>{session.projectPath || session.sessionId}</strong>
                <span>{session.source} · {session.model || 'unknown'} · {session.lastActivity}</span>
              </div>
              <b>{formatNumber(session.totalTokens)}</b>
            </div>
          )) : <EmptyState text="最近窗口内没有活跃 session。" />}
        </LivePanel>

        <LivePanel title="来源分布">
          {snapshot?.bySource?.length ? snapshot.bySource.map(row => (
            <div className="live-row compact" key={row.key}>
              <div>
                <strong>{row.key}</strong>
                <span>{row.sessions} sessions</span>
              </div>
              <b>{formatNumber(row.totalTokens)}</b>
            </div>
          )) : <EmptyState text="暂无来源分布。" />}
        </LivePanel>

        <LivePanel title="模型分布">
          {snapshot?.byModel?.length ? snapshot.byModel.map(row => (
            <div className="live-row compact" key={row.key}>
              <div>
                <strong>{row.key}</strong>
                <span>{row.sessions} sessions</span>
              </div>
              <b>{formatNumber(row.totalTokens)}</b>
            </div>
          )) : <EmptyState text="暂无模型分布。" />}
        </LivePanel>
      </section>
    </main>
  );
}

function MetricCard({ label, value }) {
  return (
    <div className="live-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function LivePanel({ title, children }) {
  return (
    <section className="live-panel">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function EmptyState({ text }) {
  return <div className="live-empty">{text}</div>;
}

function BudgetMetric({ label, value }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function budgetStatusLabel(status) {
  if (status === 'exceeded') return '已超预算';
  if (status === 'over-pace') return '会超预算';
  if (status === 'near-limit') return '接近预算';
  return '正常';
}

function formatNumber(value) {
  return Math.round(Number(value || 0)).toLocaleString('en-US');
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function formatPercent(value) {
  return Number(value || 0).toFixed(1);
}
