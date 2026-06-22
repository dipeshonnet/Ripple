/* eslint-disable */
// Performance Arena - Team Lead + Manager shared view helpers.

(function () {
  const A = window.Arena;
  if (!A) { console.error('Arena core not loaded for lead/manager helpers'); return; }

  const Av = window.ArenaAgentViewHelpers || window.ArenaAgentViews; // for reused helpers
  const COMMERCIAL_CONFIG = {
    accountRewardPotential: Number(window.ARENA_COMMERCIAL_CONFIG?.accountRewardPotential ?? 66000),
  };

  const escapeHtml = Av.escapeHtml;
  const priorityChip = Av.priorityChip;
  const dueLabel = Av.dueLabel;
  const sparkline = Av.sparkline;

  function configuredAccountRewardPotential() {
    return Math.max(0, Number(COMMERCIAL_CONFIG.accountRewardPotential) || 66000);
  }

  function ragBadge(rag) {
    if (rag === 'Green' || rag === 'Healthy') return `<span class="chip rag-bg-green rag-green"><i data-lucide="circle-check" class="text-[10px]"></i> ${rag}</span>`;
    if (rag === 'Amber' || rag === 'Watch') return `<span class="chip rag-bg-amber rag-amber"><i data-lucide="circle-alert" class="text-[10px]"></i> ${rag}</span>`;
    if (rag === 'Red' || rag === 'Risk' || rag === 'High')   return `<span class="chip rag-bg-red rag-red"><i data-lucide="triangle-alert" class="text-[10px]"></i> ${rag}</span>`;
    return `<span class="chip bg-white/5 text-arena-muted border border-white/10">${rag || '—'}</span>`;
  }

  // Executive USD formatter — $25K · $150K · $1.2M
  function usd(amount) {
    if (amount == null) return '—';
    const a = Math.abs(amount);
    const sign = amount < 0 ? '-$' : '$';
    if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1)}M`;
    if (a >= 1e3) return `${sign}${Math.round(a / 1e3)}K`;
    return `${sign}${Math.round(a)}`;
  }
  function pct(num, den) { return den ? Math.round((num / den) * 1000) / 10 : 0; }

  function roleForScope(scope) {
    return scope === 'team' ? 'Team Lead' : 'Manager';
  }

  function configuredMetricIds(scope, group) {
    return A.kpiIdsForRole(roleForScope(scope), group ? { group } : {});
  }

  function kpiNameText(kpi) {
    return `${kpi?.KPI_Name || ''} ${kpi?.KPI_Type || ''} ${kpi?.Description || ''}`.toLowerCase();
  }

  function kpiIdsMatching(role, predicate) {
    return A.kpisForRole(role).filter(predicate).map(k => k.KPI_ID).filter(Boolean);
  }

  function outcomeDriverIds(role, bucket) {
    const matchers = {
      sales: /(conversion|applications? per day|production)/,
      quality: /(effectuation|fallout|quality)/,
      compliance: /(cms|ctm|soa|disclosure|call adherence|compliance)/,
      efficiency: /(handle time|schedule|utilization|shrinkage|eligible call|workforce|efficiency)/,
    };
    const rx = matchers[bucket] || /./;
    const ids = kpiIdsMatching(role, kpi => rx.test(kpiNameText(kpi)) && A.kpiMetricGroup(kpi) !== 'financial');
    return ids.length ? ids : configuredMetricIds(role === 'Team Lead' ? 'team' : 'account', bucket === 'efficiency' ? 'operational' : 'outcome');
  }

  function defaultActionKpiId(role) {
    return A.kpiIdsForRole(role, { group: 'outcome' })[0] || A.kpiIdsForRole(role, { group: 'operational' })[0] || A.kpiIdsForRole(role)[0] || '';
  }

  function isConfiguredSlaHealthKpi(kpiId, role) {
    const kpi = A.kpiById(kpiId);
    if (!A.kpiVisibleForRole(kpi, role)) return false;
    const linkedRule = (A.state.slaRules || []).some(r => r.KPI_ID === kpiId);
    return linkedRule && A.kpiMetricGroup(kpi) === 'operational';
  }


  function metricHelp(title, definition, formula, use, confidence) {
    return `
      <span class="metric-help-wrap" tabindex="0" aria-label="Metric definition: ${escapeHtml(title)}">
        <span class="metric-help-icon">?</span>
        <span class="metric-help-card">
          <span class="font-display font-bold text-[13px] text-arena-text block">${escapeHtml(title)}</span>
          <span class="text-[11px] text-arena-muted mt-1 block"><span class="text-arena-text font-semibold">Definition:</span> ${escapeHtml(definition)}</span>
          <span class="text-[11px] text-arena-muted mt-1 block"><span class="text-arena-text font-semibold">Formula / inputs:</span> ${escapeHtml(formula)}</span>
          <span class="text-[11px] text-arena-muted mt-1 block"><span class="text-arena-text font-semibold">How to use:</span> ${escapeHtml(use)}</span>
          <span class="text-[10px] text-arena-amber mt-2 block">Confidence: ${escapeHtml(confidence)} · Team/process indicator; not standalone individual-agent blame.</span>
        </span>
      </span>
    `;
  }

  function weekTrendForTeam(teamId) {
    const rows = A.state.dailyScore || [];
    const dates = [...new Set(rows.map(r => r.Date))].sort();
    const recent = dates.slice(-14);
    const first = recent.slice(0, 7), second = recent.slice(7);
    function avg(ds) {
      const x = rows.filter(r => ds.includes(r.Date) && (!teamId || r.TeamID === teamId));
      return x.length ? x.reduce((s, r) => s + (r.PerformanceScore || 0), 0) / x.length : 0;
    }
    const prev = avg(first), curr = avg(second);
    return { prev: Math.round(prev * 10) / 10, curr: Math.round(curr * 10) / 10, delta: Math.round((curr - prev) * 10) / 10 };
  }

  function latestRows(scope, teamId) {
    const rows = (A.state.performance || []).filter(r => scope === 'team' ? r.TeamID === teamId : true);
    const latest = [...new Set(rows.map(r => r.Date))].sort().slice(-1)[0];
    return rows.filter(r => r.Date === latest);
  }

  function kpiScore(scope, teamId, kpiId) {
    const rows = latestRows(scope, teamId).filter(r => r.KPI_ID === kpiId);
    if (!rows.length) return null;
    return rows.reduce((s, r) => s + (r.Score || 0), 0) / rows.length;
  }

  function outcomeScore(scope, teamId, drivers) {
    const vals = drivers.map(k => kpiScore(scope, teamId, k)).filter(v => v != null);
    if (!vals.length) return 0;
    return Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  }

  function outcomeRag(score) {
    if (score >= 100) return 'Green';
    if (score >= 92) return 'Amber';
    return 'Red';
  }

  function outcomeWow(scope, teamId, drivers) {
    const rows = (A.state.performance || []).filter(r => drivers.includes(r.KPI_ID) && (scope !== 'team' || r.TeamID === teamId));
    const dates = [...new Set(rows.map(r => r.Date))].sort();
    const recent = dates.slice(-14);
    const a = recent.slice(0, 7), b = recent.slice(7);
    function avg(ds) {
      const x = rows.filter(r => ds.includes(r.Date));
      return x.length ? x.reduce((s, r) => s + (r.Score || 0), 0) / x.length : 0;
    }
    const prev = avg(a), curr = avg(b);
    return { prev: Math.round(prev), curr: Math.round(curr), delta: Math.round(curr - prev) };
  }

  function clientOutcomeMetrics(scope, penaltyBase, agentCount) {
    const base = Math.max(1, penaltyBase || 0);
    const repeatContacts = Math.max(scope === 'account' ? 620 : 28, Math.round(base / (scope === 'account' ? 92 : 52)));
    const repeatCost = Math.round(repeatContacts * 8.5 / 1000) * 1000;
    const reworkCases = Math.max(scope === 'account' ? 80 : 8, Math.round(repeatContacts * 0.16));
    const reworkCost = Math.round(reworkCases * 42 / 1000) * 1000;
    const accessRisk = repeatContacts > (scope === 'account' ? 850 : 80) ? 'Watch' : 'Green';
    const expHealth = repeatContacts > (scope === 'account' ? 750 : 70) ? 'Watch' : 'Green';
    return { repeatContacts, repeatCost, reworkCases, reworkCost, accessRisk, expHealth, agentCount: agentCount || 0 };
  }

  function trendCard(title, trend, sub) {
    const up = trend.delta >= 0;
    const steady = Math.abs(trend.delta) < 1;
    return `<div class="glass rounded-2xl p-4 outcome-mini-card"><div class="text-[10px] uppercase tracking-wider text-arena-muted font-bold">${escapeHtml(title)}</div><div class="hero-num text-3xl mt-1 ${steady ? 'text-arena-text' : up ? 'rag-green' : 'rag-red'}">${steady ? '0' : (up ? '+' : '') + trend.delta}</div><div class="text-[10px] text-arena-muted">${escapeHtml(sub || 'WoW movement')} · ${trend.prev} → ${trend.curr}</div></div>`;
  }

  function impactRange(scope, outcomeId) {
    const ranges = {
      effort: scope === 'account' ? '$6K–$10K leakage reduction' : '2–4 pt risk improvement',
      experience: scope === 'account' ? '3–5 pt experience driver lift' : '3–5 pt quality behavior lift',
      access: scope === 'account' ? '10–18 sec access friction reduction' : 'peak interval stability',
      capacity: scope === 'account' ? '80–120 hours capacity released' : 'AHT/calls handled balance',
      commercial: scope === 'account' ? 'protect 1–2% of revenue exposure' : 'lower team exposure'
    };
    return ranges[outcomeId] || 'measurable trend improvement';
  }

  function driverTree(outcome) {
    return `
      <div class="driver-tree mt-3">
        ${(outcome.tree || []).map(node => `
          <div class="driver-node">
            <div class="driver-node-title">${escapeHtml(node.title)}</div>
            <div class="driver-node-children">${(node.children || []).map(c => `<span>${escapeHtml(c)}</span>`).join('')}</div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function rootCauseChips(causes) {
    return `<div class="flex flex-wrap gap-1.5 mt-2">${(causes || []).map(c => `<span class="chip bg-white/5 border border-white/10 text-arena-muted"><i data-lucide="dot" class="text-[10px]"></i> ${escapeHtml(c)}</span>`).join('')}</div>`;
  }

  window.ArenaLeadMgrViewHelpers = {
    escapeHtml,
    priorityChip,
    dueLabel,
    sparkline,
    configuredAccountRewardPotential,
    ragBadge,
    usd,
    pct,
    roleForScope,
    configuredMetricIds,
    kpiNameText,
    kpiIdsMatching,
    outcomeDriverIds,
    defaultActionKpiId,
    isConfiguredSlaHealthKpi,
    metricHelp,
    weekTrendForTeam,
    latestRows,
    kpiScore,
    outcomeScore,
    outcomeRag,
    outcomeWow,
    clientOutcomeMetrics,
    trendCard,
    impactRange,
    driverTree,
    rootCauseChips,
  };
})();
