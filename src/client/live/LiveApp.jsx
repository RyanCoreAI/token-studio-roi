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

function formatNumber(value) {
  return Math.round(Number(value || 0)).toLocaleString('en-US');
}

function formatMoney(value) {
  return Number(value || 0).toFixed(2);
}

function formatPercent(value) {
  return Number(value || 0).toFixed(1);
}
