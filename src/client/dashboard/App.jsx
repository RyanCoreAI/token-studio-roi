/* =============================================================
   Main App — real data from /api/data
   ============================================================= */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { U } from '../shared/utils.js';
import {
  attachAutoSuggestions,
  autoAttributionIdentity,
  buildAutoAttributionPlan
} from '../../auto-attribution.mjs';
import { Topbar, FilterBar, KPI } from './components-top.jsx';
import { TrendChart, SourceDonut, TopModels, Gauge, GrowthPanel, Heatmap } from './components-charts.jsx';
import { BatchAnnotationModal, TablePanel, DrillDrawer } from './components-tables.jsx';
import {
  aggregateSessions,
  buildAttributionStatusSummary,
  buildPendingConfirmationSessions,
  buildProjectRoiRows,
  buildRiskDistribution,
  buildWeeklyReview
} from './attribution.js';
import {
  buildModelUsageRows,
  filterSessionsByDashboardFilters,
  sessionModel
} from './model-usage.js';
import { buildFirstRunState } from './onboarding.js';
import './styles.css';

function summarizeCollectOutput(stdout) {
  return stdout
    ? stdout.split('\n').filter(Boolean).slice(-5).join(' · ')
    : '采集完成';
}

export function App() {
  const [M, setM] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [collecting, setCollecting] = useState(false);
  const [collectStatus, setCollectStatus] = useState(null);
  const [collectConfirmOpen, setCollectConfirmOpen] = useState(false);

  // ───── Load data from API ─────
  const loadData = useCallback(() => {
    setRefreshing(true);
    return fetch('/api/data')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        // Assign colors to sources dynamically
        const sourceNames = [...new Set(data.daily.map(r => r.source))];
        const SOURCES = sourceNames.map((name, i) => ({
          name,
          color: U.getSourceColor(name)
        }));

        // Standard hourly pattern (normalized)
        const rawHourly = [
          0.005, 0.003, 0.002, 0.001, 0.001, 0.003,
          0.008, 0.025, 0.045, 0.075, 0.092, 0.082,
          0.055, 0.078, 0.092, 0.088, 0.080, 0.060,
          0.045, 0.038, 0.045, 0.040, 0.025, 0.012
        ];
        const hsum = rawHourly.reduce((a, b) => a + b, 0);
        const HOURLY = rawHourly.map(v => v / hsum);

        setM({
          ...data,
          SOURCES,
          HOURLY,
          today: U.daysAgo(0)
        });
        setLoadError(null);
      })
      .catch(err => setLoadError(err.message))
      .finally(() => setRefreshing(false));
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const syncCollectStatus = useCallback((options = {}) => {
    return fetch('/api/collect/status')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        if (data.status === 'running') {
          setCollecting(true);
          setCollectStatus({ type: 'running', message: data.message || '正在采集本机用量…' });
        } else if (data.status === 'ok') {
          setCollecting(false);
          setCollectStatus({ type: 'ok', message: summarizeCollectOutput(data.stdout) });
          if (options.refreshOnDone) loadData();
        } else if (data.status === 'error') {
          setCollecting(false);
          setCollectStatus({ type: 'error', message: data.stderr || data.message || '采集失败' });
        } else {
          setCollecting(false);
        }
        return data;
      });
  }, [loadData]);

  const waitForCollectDone = useCallback(async () => {
    for (;;) {
      await new Promise(resolve => setTimeout(resolve, 1500));
      const data = await syncCollectStatus({ refreshOnDone: true });
      if (data.status !== 'running') return data;
    }
  }, [syncCollectStatus]);

  useEffect(() => {
    let cancelled = false;
    syncCollectStatus()
      .then(data => {
        if (!cancelled && data.status === 'running') waitForCollectDone();
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [syncCollectStatus, waitForCollectDone]);

  const runCollect = useCallback(() => {
    setCollecting(true);
    setCollectStatus({ type: 'running', message: '正在采集本机用量…' });
    fetch('/api/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok && r.status !== 202) {
          throw new Error(data.error || data.stderr || `HTTP ${r.status}`);
        }
        setCollectStatus({ type: 'running', message: data.message || '正在采集本机用量…' });
        return waitForCollectDone();
      })
      .catch(err => {
        setCollecting(false);
        setCollectStatus({ type: 'error', message: err.message || '采集失败' });
      });
  }, [waitForCollectDone]);

  const requestCollect = useCallback(() => {
    setCollectConfirmOpen(true);
  }, []);

  const saveSessionAnnotation = useCallback((payload) => {
    return fetch('/api/session-annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        await loadData();
        return data.annotation;
      });
  }, [loadData]);

  const batchSaveSessionAnnotations = useCallback((payload) => {
    return fetch('/api/session-annotations/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        await loadData();
        return data.updated;
      });
  }, [loadData]);

  const deleteSessionAnnotation = useCallback((payload) => {
    return fetch('/api/session-annotations', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        await loadData();
        return data.deleted;
      });
  }, [loadData]);

  const saveSessionOutput = useCallback((payload) => {
    return fetch('/api/session-outputs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        await loadData();
        return data.output;
      });
  }, [loadData]);

  const deleteSessionOutput = useCallback((payload) => {
    return fetch('/api/session-outputs', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        await loadData();
        return data.deleted;
      });
  }, [loadData]);

  const saveProjectAliasRule = useCallback((payload) => {
    return fetch('/api/project-alias-rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        await loadData();
        return data.rule;
      });
  }, [loadData]);

  const deleteProjectAliasRule = useCallback((payload) => {
    return fetch('/api/project-alias-rules', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        await loadData();
        return data.deleted;
      });
  }, [loadData]);

  const createBackup = useCallback(() => {
    return fetch('/api/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        return data.backup;
      });
  }, []);

  const exportAnnotations = useCallback(() => {
    return fetch('/api/export/annotations')
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `token-studio-annotations-${U.daysAgo(0)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return data;
      });
  }, []);

  const importAnnotations = useCallback((file) => {
    return file.text()
      .then(text => JSON.parse(text))
      .then(payload => fetch('/api/import/annotations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }))
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        await loadData();
        return data.imported;
      });
  }, [loadData]);

  const importCcusageJson = useCallback((payload) => {
    return fetch('/api/import/ccusage-json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        if (payload.apply) await loadData();
        return data;
      });
  }, [loadData]);

  const saveBudgetProfile = useCallback((payload) => {
    return fetch('/api/budget-profiles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        await loadData();
        return data.profile;
      });
  }, [loadData]);

  const deleteBudgetProfile = useCallback((payload) => {
    return fetch('/api/budget-profiles', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        await loadData();
        return data.deleted;
      });
  }, [loadData]);

  const applyAutoAttribution = useCallback((payload) => {
    return fetch('/api/auto-attribution/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        await loadData();
        return data;
      });
  }, [loadData]);

  const undoAutoAttribution = useCallback((payload) => {
    return fetch('/api/auto-attribution/undo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {})
    })
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
        await loadData();
        return data;
      });
  }, [loadData]);

  // ───── Loading / error screens ─────
  if (loadError) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', gap: 16,
        color: 'var(--text-2)', fontFamily: 'var(--font)'
      }}>
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="18" stroke="oklch(0.65 0.16 25)" strokeWidth="2"/>
          <path d="M20 12v10M20 28v2" stroke="oklch(0.65 0.16 25)" strokeWidth="2.5" strokeLinecap="round"/>
        </svg>
        <p style={{fontSize: 15, margin: 0}}>加载失败：{loadError}</p>
        <button className="btn btn-primary" onClick={loadData}>重试</button>
      </div>
    );
  }

  if (!M) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', height: '100vh', gap: 14,
        color: 'var(--text-2)', fontFamily: 'var(--font)'
      }}>
        <svg className="spin" width="32" height="32" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="13" stroke="var(--c-indigo)" strokeWidth="2.5"
            strokeDasharray="60" strokeDashoffset="20" strokeLinecap="round"/>
        </svg>
        <p style={{fontSize: 14, margin: 0}}>正在加载数据…</p>
      </div>
    );
  }

  return (
    <>
      <Dashboard
        M={M}
        refreshing={refreshing}
        collecting={collecting}
        collectStatus={collectStatus}
        onRefresh={loadData}
        onCollect={requestCollect}
        onSaveAnnotation={saveSessionAnnotation}
        onBatchSaveAnnotations={batchSaveSessionAnnotations}
        onDeleteAnnotation={deleteSessionAnnotation}
        onSaveOutput={saveSessionOutput}
        onDeleteOutput={deleteSessionOutput}
        onSaveProjectAliasRule={saveProjectAliasRule}
        onDeleteProjectAliasRule={deleteProjectAliasRule}
        onCreateBackup={createBackup}
        onExportAnnotations={exportAnnotations}
        onImportAnnotations={importAnnotations}
        onImportCcusageJson={importCcusageJson}
        onSaveBudgetProfile={saveBudgetProfile}
        onDeleteBudgetProfile={deleteBudgetProfile}
        onApplyAutoAttribution={applyAutoAttribution}
        onUndoAutoAttribution={undoAutoAttribution} />
      {collectConfirmOpen && (
        <CollectConfirmModal
          busy={collecting}
          onClose={() => setCollectConfirmOpen(false)}
          onConfirm={() => {
            setCollectConfirmOpen(false);
            runCollect();
          }} />
      )}
    </>
  );
}

/* =============================================================
   Dashboard (extracted so App stays clean)
   ============================================================= */
function Dashboard({
  M,
  refreshing,
  collecting,
  collectStatus,
  onRefresh,
  onCollect,
  onSaveAnnotation,
  onBatchSaveAnnotations,
  onDeleteAnnotation,
  onSaveOutput,
  onDeleteOutput,
  onSaveProjectAliasRule,
  onDeleteProjectAliasRule,
  onCreateBackup,
  onExportAnnotations,
  onImportAnnotations,
  onImportCcusageJson,
  onSaveBudgetProfile,
  onDeleteBudgetProfile,
  onApplyAutoAttribution,
  onUndoAutoAttribution
}) {
  // ───── Filter state ─────
  const [filters, setFilters] = useState(() => ({
    rangeId: '30d',
    startDate: U.daysAgo(29),
    endDate: U.daysAgo(0),
    sources: new Set(),
    devices: new Set(),
    models: new Set(),
    compare: true
  }));

  const [trendMode, setTrendMode] = useState('stacked');
  const [drill, setDrill] = useState(null);
  const [focusedSource, setFocusedSource] = useState(null);
  const [quickAttributionOpen, setQuickAttributionOpen] = useState(false);
  const [quickAttributionBusy, setQuickAttributionBusy] = useState(false);
  const [quickAttributionError, setQuickAttributionError] = useState(null);
  const [autoAttributionBusy, setAutoAttributionBusy] = useState(false);
  const [autoAttributionMessage, setAutoAttributionMessage] = useState(null);
  const [lastAutoRunId, setLastAutoRunId] = useState(null);
  const [importBudgetOpen, setImportBudgetOpen] = useState(false);

  // Build option lists
  const allSources = useMemo(() => Array.from(new Set(M.daily.map(r => r.source))), [M.daily]);
  const allDevices = useMemo(() => Array.from(new Set(M.daily.map(r => r.device))), [M.daily]);
  const allModels  = useMemo(() => Array.from(new Set([
    ...M.daily.map(r => r.model),
    ...M.sessions.map(sessionModel)
  ])).filter(Boolean), [M.daily, M.sessions]);
  const availableRange = useMemo(() => {
    const dates = M.daily.map(r => r.usageDate).filter(Boolean).sort();
    return {
      startDate: dates[0] || U.daysAgo(0),
      endDate: dates[dates.length - 1] || U.daysAgo(0)
    };
  }, [M.daily]);
  const taskTypes = M.meta?.taskTypes || ['未分类', '功能开发', '问题修复', '代码审查', '技术调研', '内容创作', '运维配置', '其他'];
  const outputStatuses = M.meta?.outputStatuses || ['未标注', '进行中', '已完成', '已发布', '已废弃'];
  const workPurposes = M.meta?.workPurposes || ['未说明', '需求澄清', '方案设计', '功能开发', '调试修复', '测试验证', '代码审查', '技术调研', '文档内容', '部署运维', '上下文整理', '其他'];
  const workStages = M.meta?.workStages || ['未说明', '探索', '实现', '验证', '发布', '维护'];
  const valueLevels = M.meta?.valueLevels || ['未评估', '低', '中', '高', '关键'];
  const outputTypes = M.meta?.outputTypes || ['未分类', 'PR', 'commit', '文章', '部署', '文档', '截图', '其他'];
  const effectiveFilters = useMemo(() => {
    if (!focusedSource) return filters;
    return { ...filters, sources: new Set([focusedSource]) };
  }, [filters, focusedSource]);
  const modelScopeFilters = useMemo(() => ({
    ...effectiveFilters,
    models: new Set()
  }), [effectiveFilters]);

  // ───── Filtered data ─────
  const filtered = useMemo(() => {
    return U.filterDaily(M.daily, effectiveFilters);
  }, [effectiveFilters, M.daily]);

  const totals = useMemo(() => U.aggregateTotals(filtered), [filtered]);

  const dates = useMemo(() => U.rangeDates(filters.startDate, filters.endDate), [filters.startDate, filters.endDate]);
  const presentSources = useMemo(() => {
    const set = effectiveFilters.sources.size ? effectiveFilters.sources : new Set(allSources);
    return Array.from(set);
  }, [effectiveFilters.sources, allSources]);

  // ───── Comparison period ─────
  const compareData = useMemo(() => {
    if (!effectiveFilters.compare) return { rows: null, dates: null, totals: null };
    const days = dates.length;
    const endStr = U.addDays(filters.startDate, -1);
    const startStr = U.addDays(endStr, -(days - 1));
    const rows  = U.filterDaily(M.daily, { ...effectiveFilters, startDate: startStr, endDate: endStr });
    const cDates = U.rangeDates(startStr, endStr);
    return { rows, dates: cDates, totals: U.aggregateTotals(rows) };
  }, [effectiveFilters, filters.startDate, dates.length, M.daily]);

  // ───── Sparklines ─────
  const dailyTotalsByDay = useMemo(() => {
    const m = new Map();
    for (const r of filtered) m.set(r.usageDate, (m.get(r.usageDate) || 0) + r.totalTokens);
    return m;
  }, [filtered]);

  const sparkValues = useMemo(() => dates.map(d => dailyTotalsByDay.get(d) || 0), [dates, dailyTotalsByDay]);

  const sparkBy = useMemo(() => (key) => {
    const m = new Map();
    for (const r of filtered) m.set(r.usageDate, (m.get(r.usageDate) || 0) + (r[key] || 0));
    return dates.map(d => m.get(d) || 0);
  }, [filtered, dates]);

  // ───── Sessions filtered ─────
  const filteredSessions = useMemo(() => {
    return filterSessionsByDashboardFilters(M.sessions, effectiveFilters)
      .sort((a, b) => b.totalTokens - a.totalTokens);
  }, [effectiveFilters, M.sessions]);

  const modelScopeDaily = useMemo(() => U.filterDaily(M.daily, modelScopeFilters), [M.daily, modelScopeFilters]);
  const modelScopeSessions = useMemo(() => filterSessionsByDashboardFilters(M.sessions, modelScopeFilters), [M.sessions, modelScopeFilters]);
  const modelUsageRows = useMemo(() => buildModelUsageRows(modelScopeDaily, modelScopeSessions), [modelScopeDaily, modelScopeSessions]);

  const autoAttributionPlan = useMemo(() => buildAutoAttributionPlan({
    sessions: filteredSessions,
    projectAliasRules: M.meta?.projectAliasRules || []
  }), [filteredSessions, M.meta?.projectAliasRules]);
  const filteredSessionsWithAutoSuggestions = useMemo(() =>
    attachAutoSuggestions(filteredSessions, autoAttributionPlan.suggestions)
  , [filteredSessions, autoAttributionPlan]);

  const sessionTotals = useMemo(() => aggregateSessions(filteredSessions), [filteredSessions]);
  const attributionStatusSummary = useMemo(() => buildAttributionStatusSummary(filteredSessions), [filteredSessions]);
  const riskDistribution = useMemo(() => buildRiskDistribution(filteredSessions), [filteredSessions]);
  const projectRoiRows = useMemo(() => buildProjectRoiRows(filteredSessions), [filteredSessions]);
  const weeklyReview = useMemo(() => buildWeeklyReview(M.sessions, { today: M.today }), [M.sessions, M.today]);
  const unattributedSessions = useMemo(() =>
    buildPendingConfirmationSessions(filteredSessionsWithAutoSuggestions)
  , [filteredSessionsWithAutoSuggestions]);
  const firstRunState = useMemo(() => buildFirstRunState(M), [M]);

  const filteredRuns = useMemo(() => {
    return M.runs.filter(r =>
      (effectiveFilters.sources.size === 0 || effectiveFilters.sources.has(r.source)) &&
      (effectiveFilters.devices.size === 0 || effectiveFilters.devices.has(r.device))
    );
  }, [effectiveFilters.sources, effectiveFilters.devices, M.runs]);

  const toggleModelFilter = useCallback((model) => {
    setFilters(prev => {
      const next = new Set(prev.models);
      if (next.has(model)) next.delete(model); else next.add(model);
      return { ...prev, models: next };
    });
  }, []);

  const clearModelFilter = useCallback(() => {
    setFilters(prev => ({ ...prev, models: new Set() }));
  }, []);

  const saveQuickAttribution = async (values) => {
    setQuickAttributionBusy(true);
    setQuickAttributionError(null);
    try {
      const payloadValues = {};
      if (values.projectAlias) payloadValues.projectAlias = values.projectAlias;
      if (values.taskType) payloadValues.taskType = values.taskType;
      if (values.outputStatus) payloadValues.outputStatus = values.outputStatus;
      if (values.workPurpose) payloadValues.workPurpose = values.workPurpose;
      if (values.workStage) payloadValues.workStage = values.workStage;
      if (values.valueLevel) payloadValues.valueLevel = values.valueLevel;
      if (values.note) payloadValues.note = values.note;
      if (Object.keys(payloadValues).length === 0) throw new Error('至少选择一个要批量更新的字段');
      await onBatchSaveAnnotations({
        sessions: unattributedSessions.map(sessionIdentity),
        values: payloadValues
      });
      setQuickAttributionOpen(false);
    } catch (error) {
      setQuickAttributionError(error.message || '批量归因失败');
    } finally {
      setQuickAttributionBusy(false);
    }
  };

  const applyHighConfidenceAutoAttribution = async () => {
    setAutoAttributionBusy(true);
    setAutoAttributionMessage(null);
    try {
      const rows = autoAttributionPlan.suggestions.filter(item => item.canApply);
      const result = await onApplyAutoAttribution({
        threshold: autoAttributionPlan.threshold,
        sessions: rows.map(autoAttributionIdentity)
      });
      setLastAutoRunId(result.runId || null);
      setAutoAttributionMessage({ type: 'ok', text: `已自动归因 ${result.applied || 0} 个 session` });
    } catch (error) {
      setAutoAttributionMessage({ type: 'error', text: error.message || '自动归因失败' });
    } finally {
      setAutoAttributionBusy(false);
    }
  };

  const undoLastAutoAttribution = async () => {
    if (!lastAutoRunId) return;
    setAutoAttributionBusy(true);
    setAutoAttributionMessage(null);
    try {
      const result = await onUndoAutoAttribution({ runId: lastAutoRunId });
      setLastAutoRunId(null);
      setAutoAttributionMessage({ type: 'ok', text: `已撤销 ${result.deleted || 0} 个自动归因` });
    } catch (error) {
      setAutoAttributionMessage({ type: 'error', text: error.message || '撤销失败' });
    } finally {
      setAutoAttributionBusy(false);
    }
  };

  // ───── Export ─────
  const onExportAll = () => {
    U.downloadCSV(`tokens-daily-${filters.startDate}-${filters.endDate}.csv`, filtered, [
      { title: 'date',             field: 'usageDate' },
      { title: 'source',           field: 'source' },
      { title: 'device',           field: 'device' },
      { title: 'model',            field: 'model' },
      { title: 'input',            field: 'inputTokens' },
      { title: 'output',           field: 'outputTokens' },
      { title: 'cache_read',       field: 'cacheReadTokens' },
      { title: 'cache_creation',   field: 'cacheCreationTokens' },
      { title: 'reasoning',        field: 'reasoningOutputTokens' },
      { title: 'total',            field: 'totalTokens' },
      { title: 'official_price_usd', field: 'costUSD' },
      { title: 'pricing_status',     field: 'pricingStatus' },
      { title: 'pricing_model',      field: 'pricingModel' },
      { title: 'pricing_source',     field: 'pricingSource' }
    ]);
  };

  const onExportTrend = () => {
    const rows = dates.map(d => {
      const r = { date: d };
      for (const s of presentSources) {
        let v = 0;
        for (const x of filtered) if (x.usageDate === d && x.source === s) v += x.totalTokens;
        r[s] = v;
      }
      return r;
    });
    U.downloadCSV(`trend-${filters.startDate}-${filters.endDate}.csv`,
      rows,
      [{ title: 'date', field: 'date' }, ...presentSources.map(s => ({ title: s, field: s }))]
    );
  };

  const lastSync = M.runs[0] ? U.formatTs(M.runs[0].collectedAt.replace(' ', 'T')) : '—';

  return (
    <div className="app">
      <Topbar
        lastSync={lastSync}
        onRefresh={onRefresh}
        refreshing={refreshing}
        onCollect={onCollect}
        collecting={collecting}
        collectStatus={collectStatus}
        demoMode={M.meta?.demoMode}
        onOpenImportBudget={() => setImportBudgetOpen(true)} />

      <FilterBar
        f={filters}
        setF={setFilters}
        allSources={allSources}
        allDevices={allDevices}
        allModels={allModels}
        availableRange={availableRange}
        onExport={onExportAll} />

      {focusedSource && (
        <div style={{
          margin: '0 0 12px',
          padding: '10px 14px',
          background: 'oklch(0.97 0.02 265)',
          border: '1px solid oklch(0.85 0.04 265)',
          borderRadius: 10,
          display: 'flex', alignItems: 'center', gap: 10,
          fontSize: 12.5
        }}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 7l3 3 5-6" stroke="var(--c-indigo)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span>聚焦中：<b style={{ color: 'var(--c-indigo)' }}>{focusedSource}</b> · 所有图表已联动</span>
          <button className="btn" style={{ marginLeft: 'auto', height: 24, fontSize: 11.5 }}
            onClick={() => setFocusedSource(null)}>取消聚焦</button>
        </div>
      )}

      <FirstRunPanel
        state={firstRunState}
        onOpenImportBudget={() => setImportBudgetOpen(true)} />

      {/* KPI row */}
      <div className="kpi-row">
        <KPI label="总 Token" value={U.compactCN(totals.totalTokens)}
          sub="vs 上周期"
          delta={U.deltaPct(totals.totalTokens, compareData.totals?.totalTokens)}
          sparkValues={sparkValues} sparkColor="oklch(0.55 0.16 265)" />
        <KPI label="Input" value={U.compactCN(totals.inputTokens)}
          sub="输入"
          delta={U.deltaPct(totals.inputTokens, compareData.totals?.inputTokens)}
          sparkValues={sparkBy('inputTokens')} sparkColor="oklch(0.62 0.13 240)" />
        <KPI label="Output" value={U.compactCN(totals.outputTokens)}
          sub="生成"
          delta={U.deltaPct(totals.outputTokens, compareData.totals?.outputTokens)}
          sparkValues={sparkBy('outputTokens')} sparkColor="oklch(0.60 0.15 295)" />
        <KPI label="Cache" value={U.compactCN(totals.cacheTokens)}
          sub={`命中 ${totals.cacheHitRate.toFixed(0)}%`}
          delta={U.deltaPct(totals.cacheTokens, compareData.totals?.cacheTokens)}
          sparkValues={sparkBy('cacheReadTokens')} sparkColor="oklch(0.65 0.11 200)" />
        <KPI label="Reasoning" value={U.compactCN(totals.reasoningTokens)}
          sub="推理"
          delta={U.deltaPct(totals.reasoningTokens, compareData.totals?.reasoningTokens)}
          sparkValues={sparkBy('reasoningOutputTokens')} sparkColor="oklch(0.65 0.12 150)" />
        <KPI label="官方价账单" value={U.fmtUS.format(totals.costUSD)}
          sub="按官网单价"
          delta={U.deltaPct(totals.costUSD, compareData.totals?.costUSD)}
          sparkValues={sparkBy('costUSD')} sparkColor="oklch(0.72 0.14 75)" />
      </div>

      <OfficialPricingNotice meta={M.meta?.officialPricing} visibleCostUSD={totals.costUSD} />
      <ModelUsageOverview
        rows={modelUsageRows}
        selectedModels={filters.models}
        onToggleModel={toggleModelFilter}
        onClearModels={clearModelFilter} />
      <AutoAttributionPanel
        plan={autoAttributionPlan}
        busy={autoAttributionBusy}
        message={autoAttributionMessage}
        lastRunId={lastAutoRunId}
        onApply={applyHighConfidenceAutoAttribution}
        onUndo={undoLastAutoAttribution} />
      <AttributionOverview
        rows={attributionStatusSummary}
        totalTokens={sessionTotals.totalTokens}
        totalSessions={sessionTotals.sessionCount}
        onQuickAttribute={() => {
          setQuickAttributionError(null);
          setQuickAttributionOpen(true);
        }} />
      <RoiReview
        riskRows={riskDistribution}
        projectRows={projectRoiRows}
        weeklyReview={weeklyReview}
        totalTokens={sessionTotals.totalTokens} />

      {/* Charts grid */}
      <div className="grid">
        <div className="col-8">
          <TrendChart
            rows={filtered}
            dates={dates}
            sources={presentSources}
            compareRows={compareData.rows}
            compareDates={compareData.dates}
            mode={trendMode}
            onModeChange={setTrendMode}
            totals={totals}
            onExport={onExportTrend} />
        </div>
        <div className="col-4">
          <SourceDonut
            rows={filtered}
            sources={Array.from(new Set(filtered.map(r => r.source)))}
            total={totals.totalTokens}
            focused={focusedSource}
            onFocusSource={setFocusedSource} />
        </div>

        <div className="col-6">
          <TopModels rows={filtered} onDrillModel={r => setDrill({ kind: 'model', row: r })} />
        </div>
        <div className="col-3" style={{ gridColumn: 'span 3' }}>
          <Gauge
            rate={totals.cacheHitRate}
            cacheRead={totals.cacheReadTokens}
            cacheCreation={totals.cacheCreationTokens}
            total={totals.totalTokens}
            prevRate={compareData.totals?.cacheHitRate} />
        </div>
        <div className="col-3" style={{ gridColumn: 'span 3' }}>
          <GrowthPanel totalsByDay={dailyTotalsByDay} />
        </div>

        <div className="col-12">
          <Heatmap rows={filtered} dates={dates} hourlyPattern={M.HOURLY} />
        </div>

        <div className="col-12">
          <TablePanel
            daily={filtered}
            sessions={filteredSessionsWithAutoSuggestions}
            unattributedSessions={unattributedSessions}
            runs={filteredRuns}
            taskTypes={taskTypes}
            outputStatuses={outputStatuses}
            workPurposes={workPurposes}
            workStages={workStages}
            valueLevels={valueLevels}
            outputTypes={outputTypes}
            projectAliasRules={M.meta?.projectAliasRules || []}
            projectAliasMatchTypes={M.meta?.projectAliasMatchTypes || ['prefix']}
            sources={presentSources}
            totalTokens={totals.totalTokens}
            sessionTotalTokens={sessionTotals.totalTokens}
            onSaveAnnotation={onSaveAnnotation}
            onBatchSaveAnnotations={onBatchSaveAnnotations}
            onDeleteAnnotation={onDeleteAnnotation}
            onSaveOutput={onSaveOutput}
            onDeleteOutput={onDeleteOutput}
            onSaveProjectAliasRule={onSaveProjectAliasRule}
            onDeleteProjectAliasRule={onDeleteProjectAliasRule}
            onCreateBackup={onCreateBackup}
            onExportAnnotations={onExportAnnotations}
            onImportAnnotations={onImportAnnotations}
            onDrill={setDrill} />
        </div>
      </div>

      <DrillDrawer drill={drill} daily={M.daily} onClose={() => setDrill(null)} />
      {quickAttributionOpen && (
        <BatchAnnotationModal
          count={unattributedSessions.length}
          taskTypes={taskTypes}
          outputStatuses={outputStatuses}
          workPurposes={workPurposes}
          workStages={workStages}
          valueLevels={valueLevels}
          busy={quickAttributionBusy}
          error={quickAttributionError}
          onSave={saveQuickAttribution}
          onClose={() => {
            if (!quickAttributionBusy) {
              setQuickAttributionOpen(false);
              setQuickAttributionError(null);
            }
          }} />
      )}
      {importBudgetOpen && (
        <ImportBudgetModal
          sources={allSources}
          budgetProfiles={M.budgetProfiles || []}
          onImportCcusageJson={onImportCcusageJson}
          onSaveBudgetProfile={onSaveBudgetProfile}
          onDeleteBudgetProfile={onDeleteBudgetProfile}
          onClose={() => setImportBudgetOpen(false)} />
      )}
    </div>
  );
}

function FirstRunPanel({ state, onOpenImportBudget }) {
  if (!state?.shouldShow) return null;
  const primaryNotice = state.notices[0] || null;

  const runAction = (notice) => {
    if (!notice) return;
    if (notice.id === 'no-data') {
      onOpenImportBudget();
    } else if (notice.id === 'no-actions') {
      window.location.href = '/review';
    } else if (notice.id === 'budget-no-live-events') {
      window.location.href = '/live';
    }
  };

  return (
    <section className="first-run-panel" aria-label="首次使用引导">
      <div className="first-run-main">
        <div>
          <div className="eyebrow">首次使用</div>
          <h2>{primaryNotice?.title || '5 分钟跑通 Token Studio ROI'}</h2>
          <p>{primaryNotice?.detail || '按顺序准备数据、设置预算，再把 ROI 建议加入行动清单。'}</p>
        </div>
        <div className="first-run-actions">
          {primaryNotice && (
            <button className="btn btn-primary" onClick={() => runAction(primaryNotice)}>
              {primaryNotice.action}
            </button>
          )}
          <a className="btn" href="/review">打开 /review</a>
          <a className="btn" href="/live">打开 /live</a>
        </div>
      </div>
      <div className="first-run-steps">
        {state.steps.map(step => (
          <article key={step.id} className={`first-run-step ${step.status}`}>
            <span>{step.status === 'done' ? 'Done' : 'Todo'}</span>
            <strong>{step.title}</strong>
            <p>{step.detail}</p>
          </article>
        ))}
      </div>
      {state.notices.length > 1 && (
        <div className="first-run-notices">
          {state.notices.slice(1).map(notice => (
            <button key={notice.id} type="button" onClick={() => runAction(notice)}>
              <strong>{notice.title}</strong>
              <span>{notice.action}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function CollectConfirmModal({ busy, onClose, onConfirm }) {
  return (
    <>
      <div className="modal-backdrop open" onClick={onClose}/>
      <div className="annotation-modal collect-confirm-modal" role="dialog" aria-modal="true" aria-label="确认真实采集">
        <div className="annotation-modal-header">
          <div>
            <div className="eyebrow">真实采集确认</div>
            <h3>扫描本机 Claude / Codex 用量日志</h3>
          </div>
          <button className="drawer-close" onClick={onClose} disabled={busy}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M3 3l7 7M10 3l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className="annotation-modal-body">
          <div className="notice-list">
            <div>本次采集会扫描本机 `.claude` / `.codex` 等已启用采集器的本地日志目录。</div>
            <div>采集器只统计 token、模型、时间、项目路径等用量字段，不读取或展示对话正文。</div>
            <div>服务端会在写入前自动复制当前 SQLite 到 `data/backups/`。</div>
          </div>
        </div>
        <div className="annotation-modal-actions">
          <button className="btn" onClick={onClose} disabled={busy}>取消</button>
          <span className="form-spacer"/>
          <button className="btn btn-primary" onClick={onConfirm} disabled={busy}>
            {busy ? '采集中' : '确认采集'}
          </button>
        </div>
      </div>
    </>
  );
}

function ImportBudgetModal({
  sources,
  budgetProfiles,
  onImportCcusageJson,
  onSaveBudgetProfile,
  onDeleteBudgetProfile,
  onClose
}) {
  const [importText, setImportText] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const [budgetBusy, setBudgetBusy] = useState(false);
  const [budgetError, setBudgetError] = useState(null);
  const [budgetForm, setBudgetForm] = useState(() => ({
    source: sources[0] || 'Codex CLI',
    label: '',
    windowMinutes: 60,
    tokenBudget: '',
    costBudgetUSD: '',
    enabled: true
  }));

  const runImport = async (apply) => {
    setImportBusy(true);
    setImportError(null);
    try {
      const result = await onImportCcusageJson({ text: importText, apply });
      setImportResult(result);
    } catch (error) {
      setImportError(error.message || 'ccusage JSON 导入失败');
    } finally {
      setImportBusy(false);
    }
  };

  const readImportFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setImportText(await file.text());
    setImportResult(null);
    setImportError(null);
  };

  const saveBudget = async () => {
    setBudgetBusy(true);
    setBudgetError(null);
    try {
      await onSaveBudgetProfile({
        source: budgetForm.source.trim(),
        label: budgetForm.label.trim() || `${budgetForm.source.trim()} custom budget`,
        windowMinutes: Number(budgetForm.windowMinutes) || 60,
        tokenBudget: budgetForm.tokenBudget === '' ? 0 : Number(budgetForm.tokenBudget),
        costBudgetUSD: budgetForm.costBudgetUSD === '' ? 0 : Number(budgetForm.costBudgetUSD),
        enabled: budgetForm.enabled
      });
      setBudgetForm(current => ({
        ...current,
        label: '',
        tokenBudget: '',
        costBudgetUSD: ''
      }));
    } catch (error) {
      setBudgetError(error.message || '保存预算失败');
    } finally {
      setBudgetBusy(false);
    }
  };

  const deleteBudget = async (profile) => {
    setBudgetBusy(true);
    setBudgetError(null);
    try {
      await onDeleteBudgetProfile({ id: profile.id });
    } catch (error) {
      setBudgetError(error.message || '删除预算失败');
    } finally {
      setBudgetBusy(false);
    }
  };

  const canDryRun = importText.trim().length > 0 && !importBusy;
  const canApply = canDryRun && importResult?.mode === 'dry-run' && !importResult.error;

  return (
    <>
      <div className="modal-backdrop open" onClick={onClose}/>
      <div className="annotation-modal import-budget-modal" role="dialog" aria-modal="true" aria-label="导入与预算">
        <div className="annotation-modal-header">
          <div>
            <div className="eyebrow">导入与预算</div>
            <h3>把 ccusage JSON 和自定义预算接入 ROI 复盘</h3>
          </div>
          <button className="drawer-close" onClick={onClose} disabled={importBusy || budgetBusy}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M3 3l7 7M10 3l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="annotation-modal-body import-budget-body">
          <section className="import-budget-section">
            <div className="import-budget-section-head">
              <div>
                <h4>ccusage Import Wizard</h4>
                <p>只接受结构化 token/model/session/time/cache 字段；发现 prompt、response、transcript、diff、content 等正文风险字段会拒绝。</p>
              </div>
              <span className="tag tag-soft">默认 dry-run</span>
            </div>
            <div className="form-grid">
              <label className="form-field form-field-wide">
                <span>粘贴 ccusage JSON</span>
                <textarea
                  value={importText}
                  onChange={(event) => {
                    setImportText(event.target.value);
                    setImportResult(null);
                    setImportError(null);
                  }}
                  placeholder='{"daily":[{"date":"2026-06-17","model":"claude-sonnet-4-5","inputTokens":1200,"outputTokens":300}]}'
                />
              </label>
              <label className="form-field">
                <span>或选择本地 JSON 文件</span>
                <input type="file" accept="application/json,.json" onChange={readImportFile}/>
              </label>
              <div className="import-budget-actions">
                <button className="btn" onClick={() => runImport(false)} disabled={!canDryRun}>
                  {importBusy ? '预检中' : 'Dry-run 预检'}
                </button>
                <button className="btn btn-primary" onClick={() => runImport(true)} disabled={!canApply}>
                  {importBusy ? '写入中' : 'Apply 写入 SQLite'}
                </button>
              </div>
            </div>

            {importError && <div className="form-error">{importError}</div>}
            {importResult && (
              <ImportPreview result={importResult}/>
            )}
          </section>

          <section className="import-budget-section">
            <div className="import-budget-section-head">
              <div>
                <h4>Budget Wizard</h4>
                <p>只创建你自己的 source 级预算窗口，不内置或声称知道 Claude/Codex/Cursor 的真实套餐额度。</p>
              </div>
              <a className="btn" href="/live">打开 /live</a>
            </div>
            <div className="form-grid form-grid-3">
              <label className="form-field">
                <span>Source</span>
                <input
                  list="budget-source-options"
                  value={budgetForm.source}
                  onChange={(event) => setBudgetForm({ ...budgetForm, source: event.target.value })}
                />
                <datalist id="budget-source-options">
                  {sources.map(source => <option key={source} value={source}/>)}
                </datalist>
              </label>
              <label className="form-field">
                <span>名称</span>
                <input
                  value={budgetForm.label}
                  placeholder="Codex 15m budget"
                  onChange={(event) => setBudgetForm({ ...budgetForm, label: event.target.value })}
                />
              </label>
              <label className="form-field">
                <span>窗口分钟</span>
                <input
                  type="number"
                  min="1"
                  value={budgetForm.windowMinutes}
                  onChange={(event) => setBudgetForm({ ...budgetForm, windowMinutes: event.target.value })}
                />
              </label>
              <label className="form-field">
                <span>Token 预算</span>
                <input
                  type="number"
                  min="0"
                  value={budgetForm.tokenBudget}
                  placeholder="500000"
                  onChange={(event) => setBudgetForm({ ...budgetForm, tokenBudget: event.target.value })}
                />
              </label>
              <label className="form-field">
                <span>官方价预算 USD</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={budgetForm.costBudgetUSD}
                  placeholder="25"
                  onChange={(event) => setBudgetForm({ ...budgetForm, costBudgetUSD: event.target.value })}
                />
              </label>
              <label className="form-field import-budget-toggle">
                <span>启用</span>
                <input
                  type="checkbox"
                  checked={budgetForm.enabled}
                  onChange={(event) => setBudgetForm({ ...budgetForm, enabled: event.target.checked })}
                />
              </label>
            </div>
            {budgetError && <div className="form-error">{budgetError}</div>}
            <div className="import-budget-actions">
              <button className="btn btn-primary" onClick={saveBudget} disabled={budgetBusy || !budgetForm.source.trim() || (!budgetForm.tokenBudget && !budgetForm.costBudgetUSD)}>
                {budgetBusy ? '保存中' : '保存预算'}
              </button>
            </div>
            <BudgetProfileList profiles={budgetProfiles} busy={budgetBusy} onDelete={deleteBudget}/>
          </section>
        </div>

        <div className="annotation-modal-actions">
          <span className="muted">写入前会由服务端创建 SQLite 备份；导入完成后去 `/review` 查看 ROI 变化。</span>
          <span className="form-spacer"/>
          <button className="btn btn-primary" onClick={onClose} disabled={importBusy || budgetBusy}>完成</button>
        </div>
      </div>
    </>
  );
}

function ImportPreview({ result }) {
  const backupName = result.backup?.fileName || result.backup?.path?.split(/[\\/]/).pop();
  return (
    <div className={`import-preview import-preview-${result.mode}`}>
      <div className="import-preview-grid">
        <div><span>模式</span><strong>{result.mode}</strong></div>
        <div><span>JSON shape</span><strong>{result.detectedShape}</strong></div>
        <div><span>Daily</span><strong>{result.daily}</strong></div>
        <div><span>Sessions</span><strong>{result.sessions}</strong></div>
        <div><span>Events</span><strong>{result.tokenEvents}</strong></div>
        <div><span>写入</span><strong>{result.applied ? '已写入' : '未写入'}</strong></div>
      </div>
      {backupName && <p>备份：{backupName}</p>}
      {result.warnings?.length > 0 && (
        <div className="import-warning-list">
          {result.warnings.slice(0, 4).map((warning, index) => (
            <div key={`${warning.type}:${warning.model}:${index}`}>
              <strong>{warning.type}</strong>
              <span>{warning.model || 'unknown'} · {warning.reason}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BudgetProfileList({ profiles, busy, onDelete }) {
  if (!profiles.length) {
    return <div className="empty compact-empty">还没有预算窗口。先给常用 source 建一个自定义 token 或官方价预算。</div>;
  }
  return (
    <div className="budget-profile-list">
      {profiles.map(profile => (
        <article key={profile.id} className={`budget-profile-row ${profile.enabled ? 'enabled' : 'disabled'}`}>
          <div>
            <strong>{profile.label}</strong>
            <span>{profile.source} · {profile.windowMinutes} min · {profile.enabled ? '生效中' : '已停用'}</span>
          </div>
          <div>
            <b>{profile.tokenBudget ? `${U.compactCN(profile.tokenBudget)} tokens` : '— tokens'}</b>
            <span>{profile.costBudgetUSD ? U.fmtUS.format(profile.costBudgetUSD) : '— USD'}</span>
          </div>
          <button className="btn btn-mini" onClick={() => onDelete(profile)} disabled={busy}>删除</button>
        </article>
      ))}
    </div>
  );
}

function OfficialPricingNotice({ meta, visibleCostUSD }) {
  if (!meta) return null;
  const unpriced = (meta.unpricedModels || []).filter(item => (item.totalTokens || 0) > 0);
  const pricedPct = ((meta.pricedShare ?? 1) * 100).toFixed(1);
  const visible = Number.isFinite(visibleCostUSD) ? visibleCostUSD : 0;

  return (
    <section className="pricing-notice" aria-label="官方价格口径">
      <div>
        <div className="eyebrow">官方价格口径</div>
        <strong>当前筛选官方价合计 {U.fmtUS.format(visible)}</strong>
        <span>
          按官网公开的 USD / 1M token 单价换算，覆盖 {pricedPct}% token；
          未包含订阅额度、折扣、税费、Batch/Flex/Priority、区域加价或未公开价格模型。
        </span>
      </div>
      {unpriced.length > 0 && (
        <div className="pricing-unpriced">
          <span>未定价</span>
          {unpriced.slice(0, 4).map(item => (
            <b key={item.model} title={item.reason}>{item.model} · {U.compactCN(item.totalTokens)}</b>
          ))}
        </div>
      )}
    </section>
  );
}

function ModelUsageOverview({ rows, selectedModels, onToggleModel, onClearModels }) {
  const selectedCount = selectedModels?.size || 0;
  const visibleRows = rows;
  return (
    <section className="model-overview" aria-label="模型使用概览">
      <div className="model-overview-head">
        <div>
          <div className="eyebrow">模型使用看板</div>
          <h2>按模型筛选 Token 与官方价</h2>
        </div>
        <div className="model-overview-actions">
          {selectedCount > 0 && <button className="btn" onClick={onClearModels}>全部模型</button>}
          <span>{selectedCount > 0 ? `${selectedCount} 个模型已筛选` : `${rows.length} 个模型`}</span>
        </div>
      </div>
      <div className="model-card-grid">
        {visibleRows.length === 0 && <div className="empty compact-empty">当前筛选下无模型数据</div>}
        {visibleRows.map(row => {
          const active = selectedModels?.has(row.model);
          return (
            <button
              key={row.model}
              type="button"
              className={`model-card ${active ? 'active' : ''}`}
              onClick={() => onToggleModel(row.model)}
              title={row.model}>
              <div className="model-card-top">
                <strong className="mono">{row.model}</strong>
                <span>{row.pricingStatus}</span>
              </div>
              <div className="model-card-value">{U.compactCN(row.totalTokens)}</div>
              <div className="model-card-meta">
                <span>{row.sessionCount} sessions</span>
                <span>{U.fmtUS4.format(row.costUSD || 0)}</span>
              </div>
              <div className="model-card-sub">
                <span>{row.dayCount} 天</span>
                <span>{row.sources.join(' / ') || '—'}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function AutoAttributionPanel({ plan, busy, message, lastRunId, onApply, onUndo }) {
  if (!plan) return null;
  const reduction = Math.max(0, Math.min(1, plan.estimatedReductionShare || 0));
  return (
    <section className="auto-attribution-panel" aria-label="懒人自动归因">
      <div className="auto-attribution-main">
        <div>
          <div className="eyebrow">懒人自动归因</div>
          <h2>先自动填高置信度，人工只处理例外</h2>
          <p>
            只使用项目路径、来源、模型、token 结构、时间、别名规则和产出链接；
            不读取对话正文，不调用 LLM。
          </p>
        </div>
        <div className="auto-attribution-actions">
          <button className="btn btn-primary" onClick={onApply} disabled={busy || plan.highConfidenceCount === 0}>
            {busy ? '处理中' : `一键自动填 ${plan.highConfidenceCount} 条`}
          </button>
          <button className="btn" onClick={onUndo} disabled={busy || !lastRunId}>撤销上次自动归因</button>
        </div>
      </div>
      <div className="auto-attribution-stats">
        <div>
          <span>高置信可写</span>
          <strong>{plan.highConfidenceCount}</strong>
        </div>
        <div>
          <span>待确认建议</span>
          <strong>{plan.lowConfidenceCount}</strong>
        </div>
        <div>
          <span>预计减少未归因</span>
          <strong>{(reduction * 100).toFixed(0)}%</strong>
        </div>
        <div>
          <span>规则版本</span>
          <strong>{plan.version}</strong>
        </div>
      </div>
      {message && <div className={`auto-attribution-message auto-attribution-message-${message.type}`}>{message.text}</div>}
    </section>
  );
}

function AttributionOverview({ rows, totalTokens, totalSessions, onQuickAttribute }) {
  const unattributed = rows.find(row => row.id === 'unattributed');
  const unattributedCount = unattributed?.sessionCount || 0;
  const allUnattributed = totalSessions > 0 && unattributedCount === totalSessions;
  return (
    <section className="attribution-overview" aria-label="归因概览">
      <div className="attribution-overview-head">
        <div>
          <div className="eyebrow">归因概览</div>
          <h2>产出状态与官方价成本</h2>
        </div>
        <div className="attribution-overview-side">
          <div className="attribution-overview-total">
            <span>会话 Token</span>
            <strong>{U.compactCN(totalTokens)}</strong>
          </div>
          {unattributedCount > 0 && (
            <button className="btn btn-primary" onClick={onQuickAttribute}>批量归因当前筛选</button>
          )}
        </div>
      </div>
      {allUnattributed && (
        <div className="attribution-callout">
          当前筛选还没有人工任务/状态标注。先按模型、来源或项目缩小范围，再批量归因。
        </div>
      )}
      <div className="attribution-card-grid">
        {rows.map(row => {
          const pct = row.share * 100;
          return (
            <article key={row.id} className={`attribution-card attribution-card-${row.tone}`}>
              <div className="attribution-card-top">
                <span>{row.label}</span>
                <strong>{pct.toFixed(1)}%</strong>
              </div>
              <div className="attribution-card-value">{U.compactCN(row.totalTokens)}</div>
              <div className="attribution-card-meta">
                <span>{row.sessionCount} 个 session</span>
                <span>{U.fmtUS4.format(row.costUSD || 0)}</span>
              </div>
              <div className="attribution-meter">
                <span style={{ width: `${Math.min(100, pct)}%` }} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function sessionIdentity(session) {
  return {
    device: session.device,
    source: session.source,
    sessionId: session.sessionId
  };
}

function RoiReview({ riskRows, projectRows, weeklyReview, totalTokens }) {
  const topProjects = projectRows.slice(0, 5);
  return (
    <section className="roi-review" aria-label="ROI 复盘">
      <div className="roi-panel risk-panel">
        <div className="panel-header compact">
          <div>
            <div className="eyebrow">风险分布</div>
            <h3 className="panel-title">需要复盘的官方价成本</h3>
          </div>
          <span className="muted">{U.compactCN(totalTokens)} tokens</span>
        </div>
        <div className="risk-list">
          {riskRows.map(row => {
            const pct = row.share * 100;
            return (
              <div key={row.id} className={`risk-row risk-${row.tone}`}>
                <div>
                  <strong>{row.label}</strong>
                  <span>{row.sessionCount} sessions · {U.fmtUS4.format(row.costUSD || 0)}</span>
                </div>
                <div className="risk-meter">
                  <span style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
                <b>{pct.toFixed(1)}%</b>
              </div>
            );
          })}
        </div>
      </div>

      <div className="roi-panel project-roi-panel">
        <div className="panel-header compact">
          <div>
            <div className="eyebrow">项目 ROI 排行</div>
            <h3 className="panel-title">按项目查看官方价成本</h3>
          </div>
        </div>
        <div className="project-roi-list">
          {topProjects.length === 0 && <div className="empty compact-empty">暂无项目会话</div>}
          {topProjects.map(row => (
            <article key={row.project} className="project-roi-row">
              <div className="project-roi-main">
                <strong className="mono">{row.project}</strong>
                <span>{row.sessionCount} sessions · {U.fmtUS4.format(row.costUSD || 0)}</span>
              </div>
              <div className="project-roi-bars">
                <span className="roi-published" style={{ width: pctWidth(row.publishedTokens, row.totalTokens) }} title="已发布"/>
                <span className="roi-completed" style={{ width: pctWidth(row.completedTokens, row.totalTokens) }} title="已完成"/>
                <span className="roi-discarded" style={{ width: pctWidth(row.discardedTokens, row.totalTokens) }} title="已废弃"/>
                <span className="roi-unattributed" style={{ width: pctWidth(row.unattributedTokens, row.totalTokens) }} title="未归因"/>
              </div>
              <div className="project-roi-meta">
                <span>产出 {(row.productiveShare * 100).toFixed(0)}%</span>
                <span>风险 {(row.riskShare * 100).toFixed(0)}%</span>
                <span>{U.compactCN(row.totalTokens)}</span>
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="roi-panel weekly-panel">
        <div className="panel-header compact">
          <div>
            <div className="eyebrow">本周复盘</div>
            <h3 className="panel-title">{weeklyReview.startDate} 至 {weeklyReview.endDate}</h3>
          </div>
          <span className="muted">{U.fmtUS4.format(weeklyReview.totals.costUSD || 0)}</span>
        </div>
        <div className="weekly-grid">
          <div>
            <span className="weekly-label">高成本项目</span>
            <strong>{weeklyReview.highCostProjects[0]?.project || '暂无'}</strong>
          </div>
          <div>
            <span className="weekly-label">废弃成本</span>
            <strong>{U.fmtUS4.format(weeklyReview.discarded.costUSD || 0)}</strong>
          </div>
          <div>
            <span className="weekly-label">未归因队列</span>
            <strong>{weeklyReview.unattributedQueue.length}</strong>
          </div>
          <div>
            <span className="weekly-label">已发布产出</span>
            <strong>{weeklyReview.publishedOutputs.length}</strong>
          </div>
        </div>
        <div className="weekly-output-list">
          {weeklyReview.publishedOutputs.slice(0, 3).map(session => (
            <a key={session.sessionId} href={session.outputUrl} target="_blank" rel="noreferrer">
              {session.outputLabel || session.outputUrl}
            </a>
          ))}
          {weeklyReview.publishedOutputs.length === 0 && <span className="muted">暂无已发布产出链接</span>}
        </div>
      </div>
    </section>
  );
}

function pctWidth(value, total) {
  return `${Math.max(0, Math.min(100, total ? (value / total) * 100 : 0))}%`;
}
