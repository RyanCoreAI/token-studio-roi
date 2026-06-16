/* =============================================================
   Review-page sections — Tools, Efficiency, Insights
   ============================================================= */

import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import { U } from '../shared/utils.js';
import { RU } from './utils.js';

// ───────────────────────────────────────────────────────────────
// Closure progress — real data acceptance gate
// ───────────────────────────────────────────────────────────────
function ClosureProgressSection({ progress }) {
  if (!progress) return null;
  const pct = Math.round(progress.completionShare * 100);

  return (
    <section className="story closure-section">
      <div className="section-label">01 · 闭环</div>
      <h2 className="section-title">真实数据闭环还差什么</h2>
      <p className="section-sub">这里按双轨口径检查当前周期：人工确认仍是最高可信；自动高置信完整归因用于懒人模式先跑通复盘，但不等同人工事实。</p>

      <div className={`closure-hero ${progress.status === 'complete' ? 'complete' : 'needs-work'}`}>
        <div>
          <span>验收进度</span>
          <strong>{pct}%</strong>
          <p>{progress.completedChecks} / {progress.totalChecks} 项已满足 · {progress.totals.sessionCount} 个 session · {U.compactCN(progress.totals.totalTokens)} tokens</p>
        </div>
        <div className="closure-meter" aria-hidden="true">
          <span style={{width: `${pct}%`}}/>
        </div>
      </div>

      <div className="closure-grid">
        {progress.checks.map(check => (
          <article key={check.id} className={`closure-card ${check.complete ? 'done' : 'todo'}`}>
            <div className="closure-card-head">
              <span>{check.complete ? '已满足' : '待完成'}</span>
              <b>{check.current} / {check.target}</b>
            </div>
            <h3>{check.label}</h3>
            <p>{check.detail}</p>
            {!check.complete && <strong>{check.action}</strong>}
          </article>
        ))}
      </div>

      {progress.topGaps.length > 0 && (
        <div className="closure-gaps">
          <div className="closure-gaps-head">
            <h3>优先补齐的真实 session</h3>
            <span>按官方价和 token 降序，只列结构化字段缺口</span>
          </div>
          <div className="closure-gap-list">
            {progress.topGaps.slice(0, 3).map((row, index) => (
              <div key={`${row.sessionId}:${index}`} className="closure-gap-row">
                <div className="closure-gap-rank">{String(index + 1).padStart(2, '0')}</div>
                <div>
                  <strong>{row.project}</strong>
                  <span>{row.sessionId || '未命名 session'} · 缺 {row.missingFields.join('、')}</span>
                </div>
                <div>
                  <b>{U.compactCN(row.totalTokens)}</b>
                  <span>{row.costUSD > 0 ? U.fmtUS.format(row.costUSD) : '未定价/无官方价'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {progress.nextActions.length > 0 && (
        <div className="closure-actions">
          <h3>下一步</h3>
          {progress.nextActions.slice(0, 3).map(action => (
            <p key={action}>{action}</p>
          ))}
        </div>
      )}
    </section>
  );
}

function RoiEvidenceSection({ evidence }) {
  if (!evidence) return null;
  return (
    <section className="story evidence-section">
      <div className="section-label">02 · 证据</div>
      <h2 className="section-title">这些 Token 是否足够支撑 ROI 判断</h2>
      <p className="section-sub">Token Studio ROI 不只统计消耗，还检查项目、任务、目的、阶段、价值、产出和人工确认是否完整。</p>

      <div className="evidence-hero">
        <div>
          <span>ROI Evidence Score</span>
          <strong>{evidence.evidenceScore}</strong>
          <p>{evidence.complete} / {evidence.sessionCount} 个 session 证据完整 · {evidence.workItemCount} 个 work item</p>
        </div>
        <div className="evidence-meter" aria-hidden="true">
          <span style={{width: `${Math.max(0, Math.min(100, evidence.evidenceScore))}%`}}/>
        </div>
      </div>

      <div className="evidence-grid">
        <EvidenceStat label="人工确认" value={`${evidence.manualConfirmed}`} note={`${evidence.autoOrMissing} 个仍是自动或缺失`} />
        <EvidenceStat label="有产出链接" value={`${evidence.withOutput}`} note="只保存 URL、标签、类型" />
        <EvidenceStat label="未完成证据成本" value={evidence.incompleteCostUSD > 0 ? U.fmtUS.format(evidence.incompleteCostUSD) : '—'} note="官方价换算，不是账单" />
      </div>

      {evidence.highCostGaps.length > 0 && (
        <div className="evidence-gaps">
          {evidence.highCostGaps.slice(0, 3).map((row, index) => (
            <div key={`${row.sessionId}:${index}`} className="evidence-gap-row">
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{row.project}</strong>
                <p>缺 {row.missing.join('、')} · {U.compactCN(row.totalTokens)} tokens</p>
              </div>
              <b>{row.costUSD > 0 ? U.fmtUS.format(row.costUSD) : '未定价'}</b>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function EvidenceStat({ label, value, note }) {
  return (
    <article className="evidence-stat">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

// ───────────────────────────────────────────────────────────────
// Tools donut + per-tool list
// ───────────────────────────────────────────────────────────────
function ToolsSection({ daily, totalTokens }) {
  const tools = useMemo(() => {
    const list = RU.aggregateBy(daily, 'source').sort((a, b) => b.totalTokens - a.totalTokens);
    return list.map(t => ({
      ...t,
      topModel: RU.topModelFor(daily, r => r.source === t.key),
      share: (t.totalTokens / (totalTokens || 1)) * 100
    }));
  }, [daily, totalTokens]);

  const donutRef = useRef(null);
  const donutChart = useRef(null);

  useEffect(() => {
    if (!donutRef.current) return;
    if (!donutChart.current) {
      donutChart.current = echarts.init(donutRef.current, null, { renderer: 'canvas' });
    }
    donutChart.current.setOption({
      backgroundColor: 'transparent',
      animation: true,
      tooltip: {
        trigger: 'item',
        backgroundColor: 'oklch(0.16 0.010 60)',
        borderColor: 'transparent',
        textStyle: { color: 'oklch(0.97 0.008 80)', fontSize: 12 },
        extraCssText: 'border-radius: 8px; box-shadow: 0 8px 24px -8px rgb(0 0 0 / 0.3);',
        formatter: p => `<div style="font-weight:600">${p.name}</div>
          <div style="font-size:13px;margin-top:4px;font-feature-settings:'tnum'">${U.compactCN(p.value)} tokens · ${(p.percent || 0).toFixed(1)}%</div>`
      },
      series: [{
        type: 'pie',
        radius: ['60%', '92%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        label: { show: false },
        labelLine: { show: false },
        itemStyle: { borderColor: 'oklch(0.97 0.008 80)', borderWidth: 4 },
        data: tools.map(t => ({
          name: t.key,
          value: t.totalTokens,
          itemStyle: { color: U.getSourceColor(t.key) }
        }))
      }]
    }, true);
    const onResize = () => donutChart.current?.resize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [tools]);

  if (!tools.length) return null;
  const top = tools[0];

  return (
    <section className="story">
      <div className="section-label">04 · 工具</div>
      <h2 className="section-title">你是怎么用这些工具的</h2>
      <p className="section-sub">每个工具背后挑选了不同模型、有不同的官方价结构。这是它们各自的份额与组合。</p>

      <div className="tools-split">
        <div style={{display: 'flex', justifyContent: 'center'}}>
          <div className="donut-wrap">
            <div ref={donutRef} style={{width: 280, height: 280}}/>
            <div className="donut-center">
              <div>
                <div className="l">主导工具</div>
                <div className="v">{top.share.toFixed(0)}%</div>
                <div className="s">{top.key}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="tool-list">
          {tools.map(t => (
            <div key={t.key} className="tool-card">
              <span className="tool-dot" style={{background: U.getSourceColor(t.key)}}/>
              <div className="tool-info">
                <h3 className="tool-name">{t.key}</h3>
                <div className="tool-model">
                  常用模型 · {t.topModel}
                </div>
              </div>
              <div className="tool-stats">
                <div>
                  <div className="tokens">{U.compactCN(t.totalTokens)}</div>
                  <div className="cost">{t.costUSD > 0 ? U.fmtUS.format(t.costUSD) : '—'}</div>
                </div>
                <span className="tool-badge" title="Cache hit rate">
                  <svg viewBox="0 0 12 12" fill="none">
                    <ellipse cx="6" cy="3.5" rx="4.5" ry="1.8" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M1.5 3.5v3c0 1 2 1.8 4.5 1.8s4.5-.8 4.5-1.8v-3" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M1.5 6.5v3c0 1 2 1.8 4.5 1.8s4.5-.8 4.5-1.8v-3" stroke="currentColor" strokeWidth="1.2"/>
                  </svg>
                  {t.cacheHitRate.toFixed(0)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ───────────────────────────────────────────────────────────────
// Efficiency analysis cards
// ───────────────────────────────────────────────────────────────
function EfficiencySection({ daily, period }) {
  const totals = useMemo(() => ({
    total: RU.sumField(daily, 'totalTokens'),
    input: RU.sumField(daily, 'inputTokens'),
    output: RU.sumField(daily, 'outputTokens'),
    cacheRead: RU.sumField(daily, 'cacheReadTokens'),
    reasoning: RU.sumField(daily, 'reasoningOutputTokens')
  }), [daily]);

  const cacheRate = totals.total ? (totals.cacheRead / totals.total) * 100 : 0;
  const ioRatio   = totals.output ? totals.input / totals.output : 0;
  const reasonPct = totals.total ? (totals.reasoning / totals.total) * 100 : 0;

  // sparklines for each metric over daily
  const daysArr = useMemo(() => RU.dailyTotals(daily, period), [daily, period]);

  const cacheSeries = useMemo(() => {
    const m = new Map();
    for (const r of daily) {
      const x = m.get(r.usageDate) || { tot: 0, cr: 0 };
      x.tot += r.totalTokens; x.cr += r.cacheReadTokens;
      m.set(r.usageDate, x);
    }
    return daysArr.map(d => {
      const x = m.get(d.date);
      return x && x.tot ? (x.cr / x.tot) * 100 : 0;
    });
  }, [daily, daysArr]);

  const ioSeries = useMemo(() => {
    const m = new Map();
    for (const r of daily) {
      const x = m.get(r.usageDate) || { i: 0, o: 0 };
      x.i += r.inputTokens; x.o += r.outputTokens;
      m.set(r.usageDate, x);
    }
    return daysArr.map(d => {
      const x = m.get(d.date);
      return x && x.o ? x.i / x.o : 0;
    });
  }, [daily, daysArr]);

  const reasonSeries = useMemo(() => {
    const m = new Map();
    for (const r of daily) {
      const x = m.get(r.usageDate) || { r: 0, t: 0 };
      x.r += r.reasoningOutputTokens; x.t += r.totalTokens;
      m.set(r.usageDate, x);
    }
    return daysArr.map(d => {
      const x = m.get(d.date);
      return x && x.t ? (x.r / x.t) * 100 : 0;
    });
  }, [daily, daysArr]);

  return (
    <section className="story">
      <div className="section-label">05 · 效率</div>
      <h2 className="section-title">你的 Token 用得高效吗</h2>
      <p className="section-sub">从三个角度看 token 的"性价比"——重复利用率、信息密度、推理强度。</p>

      <div className="eff-grid">
        <EffCard
          label="Cache 命中率"
          value={cacheRate.toFixed(1)}
          unit="%"
          note={`每命中一次 cache，官方价约为普通输入价的一部分。本期一共节省 ${U.compactCN(totals.cacheRead)} tokens 的重复计算。`}
          spark={cacheSeries}
          color="oklch(0.55 0.16 265)"/>
        <EffCard
          label="Input / Output 比"
          value={ioRatio.toFixed(1)}
          unit=":1"
          note={`平均喂给模型 ${ioRatio.toFixed(1)} 个 token，模型生成 1 个。比值越低说明指令越紧凑、生成越密集。`}
          spark={ioSeries}
          color="oklch(0.65 0.11 200)"/>
        <EffCard
          label="Reasoning 占比"
          value={reasonPct.toFixed(1)}
          unit="%"
          note={`推理 token 比例越高，说明你交给模型的任务越复杂——通常对应代码重构、调试或多步规划。`}
          spark={reasonSeries}
          color="oklch(0.65 0.12 150)"/>
      </div>
    </section>
  );
}

function EffCard({ label, value, unit, note, spark, color }) {
  return (
    <div className="eff-card">
      <div className="eff-label">{label}</div>
      <div className="eff-value">
        {value}<span className="unit">{unit}</span>
      </div>
      <p className="eff-note">{note}</p>
      {spark && spark.length > 0 && (
        <div className="eff-spark">
          <MiniSpark values={spark} color={color}/>
        </div>
      )}
    </div>
  );
}

function MiniSpark({ values, color }) {
  if (!values || values.length === 0) return null;
  const w = 200, h = 32;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / Math.max(1, values.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    return [x, y];
  });
  const d = pts.map((p, i) => (i === 0 ? `M${p[0]},${p[1]}` : `L${p[0]},${p[1]}`)).join(' ');
  const dArea = d + ` L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{width: '100%', height: h, display: 'block'}}>
      <path d={dArea} fill={color} opacity="0.14"/>
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
    </svg>
  );
}

// ───────────────────────────────────────────────────────────────
// ROI Advisor — local rule based recommendations
// ───────────────────────────────────────────────────────────────
function RoiAdvisorSection({ suggestions }) {
  const [copiedId, setCopiedId] = useState(null);
  const copyAdvisor = async (item, mode) => {
    const text = mode === 'action'
      ? item.action
      : [
        item.title,
        `建议分类：${item.category || '未分类'}`,
        `影响级别：${item.impact}`,
        `建议：${item.recommendation}`,
        `原因：${item.reason}`,
        `证据：${item.evidence}`,
        `建议动作：${item.action}`
      ].join('\n');
    await copyText(text);
    const id = `${item.id}:${mode}`;
    setCopiedId(id);
    window.setTimeout(() => setCopiedId(null), 1400);
  };

  if (!suggestions.length) {
    return (
      <section className="story roi-advisor-section">
        <div className="section-label">06 · ROI 建议</div>
        <h2 className="section-title">当前没有明显的 ROI 风险</h2>
        <div className="no-data">本期没有触发模型选择、归因缺口或上下文效率建议。</div>
      </section>
    );
  }

  return (
    <section className="story roi-advisor-section">
      <div className="section-label">06 · ROI 建议</div>
      <h2 className="section-title">用有限 token 做更高 ROI 的事</h2>
      <p className="section-sub">这些建议只基于本地结构化数据和规则，不调用模型，不读取对话正文。</p>

      <div className="advisor-list">
        {suggestions.map((item, index) => (
          <article key={item.id} className={`advisor-card advisor-${item.tone}`}>
            <div className="advisor-rank">{String(index + 1).padStart(2, '0')}</div>
            <div className="advisor-body">
              <div className="advisor-head">
                <div>
                  <div className="advisor-meta">
                    <span className="advisor-category">{item.category || '未分类'}</span>
                    <span className="advisor-impact">{item.impact}影响</span>
                  </div>
                  <h3>{item.title}</h3>
                </div>
                <span className="advisor-tone">{toneLabel(item.tone)}</span>
              </div>
              <p className="advisor-recommendation">{item.recommendation}</p>
              <div className="advisor-grid">
                <div>
                  <span>原因</span>
                  <p>{item.reason}</p>
                </div>
                <div>
                  <span>证据</span>
                  <p>{item.evidence}</p>
                </div>
              </div>
              <div className="advisor-action">
                <span>建议动作</span>
                <strong>{item.action}</strong>
              </div>
              <div className="advisor-actions">
                <button type="button" onClick={() => copyAdvisor(item, 'full')}>
                  {copiedId === `${item.id}:full` ? '已复制' : '复制建议'}
                </button>
                <button type="button" onClick={() => copyAdvisor(item, 'action')}>
                  {copiedId === `${item.id}:action` ? '已复制' : '复制行动项'}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function toneLabel(tone) {
  if (tone === 'risk') return '先处理';
  if (tone === 'optimize') return '可优化';
  if (tone === 'good') return '可复用';
  return '需留意';
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the hidden-textarea fallback for restricted contexts.
    }
  }
  const el = document.createElement('textarea');
  el.value = text;
  el.setAttribute('readonly', '');
  el.style.position = 'fixed';
  el.style.left = '-9999px';
  document.body.appendChild(el);
  el.select();
  document.execCommand('copy');
  document.body.removeChild(el);
}

// ───────────────────────────────────────────────────────────────
// Model Strategy — what model should be used for which work
// ───────────────────────────────────────────────────────────────
function ModelStrategySection({ strategy }) {
  if (!strategy) return null;
  const coverage = strategy.coverage;
  const taskRows = strategy.byTaskType.slice(0, 4);
  const stageRows = strategy.byStage.slice(0, 4);
  const valueRows = strategy.byValue.slice(0, 4);

  return (
    <section className="story model-strategy-section">
      <div className="section-label">07 · 模型策略</div>
      <h2 className="section-title">什么任务该用什么模型</h2>
      <p className="section-sub">按任务类型、工作阶段和产出价值观察模型使用效果。这里不读取正文，只使用你手动标注后的结构化字段。</p>

      <div className="strategy-coverage">
        <div>
          <span>策略样本覆盖</span>
          <strong>{(coverage.annotatedShare * 100).toFixed(0)}%</strong>
          <p>{coverage.annotatedSessionCount} / {coverage.sessionCount} 个 session 已有任务、阶段或价值标注</p>
        </div>
        <div>
          <span>已归因 tokens</span>
          <strong>{U.compactCN(coverage.annotatedTokens)}</strong>
          <p>占本期 {coverage.totalTokens ? ((coverage.annotatedTokenShare) * 100).toFixed(1) : '0.0'}%</p>
        </div>
      </div>

      <div className="strategy-playbook">
        {strategy.playbook.map(row => (
          <article key={row.id} className={`strategy-policy strategy-policy-${row.targetTier}`}>
            <div className="strategy-policy-head">
              <span>{row.label}</span>
              <b>{row.evidenceState}</b>
            </div>
            <h3>{row.title}</h3>
            <p>{row.action}</p>
            <div className="strategy-policy-evidence">
              <div>
                <span>样本</span>
                <strong>{row.sessionCount} sessions</strong>
              </div>
              <div>
                <span>Tokens</span>
                <strong>{U.compactCN(row.totalTokens)}</strong>
              </div>
              <div>
                <span>常用模型</span>
                <strong>{row.topModel}</strong>
              </div>
              <div>
                <span>官方价</span>
                <strong>{row.costUSD > 0 ? U.fmtUS.format(row.costUSD) : '—'}</strong>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="strategy-grid">
        <StrategyPanel title="按任务类型" rows={taskRows} empty="先给 session 标注任务类型，才能看到不同任务的模型策略。"/>
        <StrategyPanel title="按工作阶段" rows={stageRows} empty="先标注探索、实现、验证、发布等阶段，才能判断模型切换时机。"/>
        <StrategyPanel title="按价值等级" rows={valueRows} empty="先标注产出价值，才能识别高价值低成本的可复用模型组合。"/>
      </div>

      {strategy.riskModels.length > 0 && (
        <div className="strategy-risk">
          <h3>低价值 / 废弃成本集中在哪些模型</h3>
          <div className="strategy-risk-list">
            {strategy.riskModels.map(row => (
              <div key={row.model} className="strategy-risk-row">
                <div>
                  <strong>{row.model}</strong>
                  <span>{tierLabel(row.tier)} · {row.sessionCount} sessions</span>
                </div>
                <div>
                  <b>{U.compactCN(row.totalTokens)}</b>
                  <span>{row.costUSD > 0 ? U.fmtUS.format(row.costUSD) : '未定价/无官方价'}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="strategy-recommendations">
        {strategy.recommendations.map(item => (
          <article key={item.id}>
            <h3>{item.title}</h3>
            <p>{item.detail}</p>
            <strong>{item.action}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function StrategyPanel({ title, rows, empty }) {
  return (
    <div className="strategy-panel">
      <h3>{title}</h3>
      {rows.length ? rows.map(row => (
        <div key={row.key} className="strategy-row">
          <div>
            <strong>{row.key}</strong>
            <span>{row.sessionCount} sessions · 常用 {row.topModel}</span>
          </div>
          <div>
            <b>{U.compactCN(row.totalTokens)}</b>
            <span>{row.costUSD > 0 ? U.fmtUS.format(row.costUSD) : '—'}</span>
          </div>
        </div>
      )) : <p className="strategy-empty">{empty}</p>}
    </div>
  );
}

function tierLabel(tier) {
  if (tier === 'heavy') return '重模型';
  if (tier === 'mid') return '中模型';
  if (tier === 'light') return '轻量模型';
  if (tier === 'unpriced') return '未定价';
  return '未分层';
}

// ───────────────────────────────────────────────────────────────
// Insights — expandable cards
// ───────────────────────────────────────────────────────────────
function InsightsSection({ insights }) {
  const [openIdx, setOpenIdx] = useState(null);

  if (!insights.length) {
    return (
      <section className="story">
        <div className="section-label">08 · 复盘</div>
        <h2 className="section-title">几件值得复盘的小事</h2>
        <div className="no-data">本期没有明显的异常或趋势变化。</div>
      </section>
    );
  }

  return (
      <section className="story">
      <div className="section-label">08 · 复盘</div>
      <h2 className="section-title">几件值得复盘的小事</h2>
      <p className="section-sub">基于你本期与上一周期的对比，自动挑出最值得关注的几条。点击展开看支撑数据。</p>

      <div className="insights">
        {insights.map((ins, i) => (
          <div key={i} className={`insight ${openIdx === i ? 'open' : ''}`}
            onClick={() => setOpenIdx(openIdx === i ? null : i)}>
            <div className="insight-head">
              <div className={`insight-emoji ${ins.kind}`}>{ins.emoji}</div>
              <div className="insight-text">{ins.headline}</div>
              <svg className="insight-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M3 5l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div className="insight-body">
              <div className="insight-detail">
                {ins.detail.map((d, di) => (
                  <div key={di}>
                    <div className="k">{d.k}</div>
                    <div className="v">{d.v}</div>
                  </div>
                ))}
              </div>
              <p className="insight-narrative">{ins.narrative}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export { ToolsSection, EfficiencySection, ClosureProgressSection, RoiEvidenceSection, RoiAdvisorSection, ModelStrategySection, InsightsSection };
