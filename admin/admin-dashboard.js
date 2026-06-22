/* eslint-disable */
// Ripple Admin - Dashboard rendering module.

(function () {
  'use strict';

  function create(context) {
    const {
      state, ADMIN_MODULE_IDS, NAV, normalizeDashboard, normalizeAlertCounts, metricTile, auditPanel,
      icon, escapeHtml, formatNumber, formatDateShort, formatDateTime, roleBreakdown,
    } = context;

  function renderDashboard() {
    const d = normalizeDashboard(state.dashboard || {});
    const settings = state.settings || {};
    const env = settings.environment || d.environment || 'Seed';
    const metrics = [
      { label: 'Active users', value: formatNumber(d.activeUserCount), sub: roleBreakdown(d.activeUserCountByRole), icon: 'users' },
      { label: 'Data freshness', value: formatDateShort(d.dataFreshness.timestamp), sub: `${d.dataFreshness.status} - ${d.dataFreshness.source}`, icon: 'refresh-cw' },
      { label: 'KPI active/retired', value: `${formatNumber(d.kpiCatalogue.active)} / ${formatNumber(d.kpiCatalogue.retired)}`, sub: `${formatNumber(d.kpiCatalogue.total)} total KPIs`, icon: 'gauge-circle' },
      { label: 'Import queue depth', value: formatNumber(d.importQueueDepth), sub: d.failedImportCount ? `${formatNumber(d.failedImportCount)} failed imports` : 'No failed imports', icon: 'upload-cloud' },
      { label: 'Pending redemptions', value: formatNumber(d.pendingRewardApprovals), sub: 'Reward approvals', icon: 'gift' },
      { label: 'Open coaching', value: formatNumber(d.openCoachingRecords), sub: 'Active coaching records', icon: 'message-square-warning' },
    ];
    return `
      ${renderSystemHealthStrip(d, env)}
      <section class="mt-4 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
        ${metrics.map(metricTile).join('')}
      </section>
      <section class="mt-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1.35fr)_390px] gap-4">
        <div class="glass rounded-xl p-4 min-w-0">
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="label">Quick launch</div>
              <div class="font-display font-bold text-lg">Admin modules</div>
            </div>
            ${environmentBadge(env)}
          </div>
          <div class="grid sm:grid-cols-2 2xl:grid-cols-3 gap-2 mt-4">
            ${ADMIN_MODULE_IDS.map(id => quickLaunchCard(NAV.find(item => item.id === id), d)).join('')}
          </div>
        </div>
        <div class="space-y-4 min-w-0">
          ${renderAlertSeverity(d)}
          ${renderDataFreshness(d)}
        </div>
      </section>
      <section class="mt-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
        ${renderAlertList(d)}
        ${auditPanel('Recent admin writes', state.audit)}
      </section>`;
  }

  function renderSystemHealthStrip(d, env) {
    const health = d.systemHealth || {};
    const status = health.status || d.health || 'green';
    const checks = Array.isArray(health.checks) ? health.checks : [];
    return `
      <section class="glass rounded-xl p-4 border ${healthBorderClass(status)}">
        <div class="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div class="flex items-start gap-3 min-w-0">
            <div class="w-10 h-10 rounded-xl ${healthIconClass(status)} grid place-items-center shrink-0">${icon(healthIconName(status), 'text-[18px]')}</div>
            <div class="min-w-0">
              <div class="label">System health</div>
              <div class="font-display font-bold text-xl">${escapeHtml(health.label || 'Operational')}</div>
              <div class="text-[12px] text-arena-muted mt-1">Last check ${escapeHtml(formatDateTime(health.updatedAt))}</div>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            ${environmentBadge(env)}
            ${checks.map(check => `
              <div class="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 min-w-[132px]">
                <div class="flex items-center gap-2 text-[12px] font-semibold">
                  <span class="w-2 h-2 rounded-full ${statusDotClass(check.status)}"></span>
                  ${escapeHtml(check.label)}
                </div>
                <div class="text-[11px] text-arena-muted mt-0.5">${escapeHtml(check.detail || '')}</div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>`;
  }

  function renderAlertSeverity(d) {
    const counts = normalizeAlertCounts(d.alertCountBySeverity, d.alerts);
    const total = counts.Critical + counts.High + counts.Info;
    const criticalDeg = total ? Math.round((counts.Critical / total) * 360) : 0;
    const highDeg = total ? Math.round((counts.High / total) * 360) : 0;
    const style = total
      ? `background: conic-gradient(#ef4f6e 0 ${criticalDeg}deg, #f8b441 ${criticalDeg}deg ${criticalDeg + highDeg}deg, #3ad4ff ${criticalDeg + highDeg}deg 360deg);`
      : 'background: rgba(34,201,138,0.2);';
    return `
      <div class="glass rounded-xl p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="label">Alert severity</div>
            <div class="font-display font-bold text-lg">${formatNumber(total)} open alerts</div>
          </div>
          <div class="w-28 h-28 rounded-full grid place-items-center shrink-0" style="${style}">
            <div class="w-[68px] h-[68px] rounded-full bg-arena-card grid place-items-center text-center">
              <div class="hero-num text-xl leading-none">${formatNumber(total)}</div>
            </div>
          </div>
        </div>
        <div class="grid grid-cols-3 gap-2 mt-4">
          ${severityPill('Critical', counts.Critical, 'rag-bg-red')}
          ${severityPill('High', counts.High, 'rag-bg-amber')}
          ${severityPill('Info', counts.Info, 'border border-arena-cyan/30 bg-arena-cyan/10')}
        </div>
      </div>`;
  }

  function severityPill(label, count, cls) {
    return `
      <div class="rounded-lg ${cls} px-2.5 py-2">
        <div class="text-[10px] uppercase tracking-[0.12em] text-arena-muted font-bold">${escapeHtml(label)}</div>
        <div class="font-display font-bold text-lg">${formatNumber(count)}</div>
      </div>`;
  }

  function renderDataFreshness(d) {
    const freshness = d.dataFreshness || {};
    const timeline = Array.isArray(freshness.timeline) ? freshness.timeline : [];
    return `
      <div class="glass rounded-xl p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="label">Data freshness</div>
            <div class="font-display font-bold text-lg">${escapeHtml(formatDateTime(freshness.timestamp))}</div>
          </div>
          <div class="chip border border-white/10 bg-white/[0.04]">${escapeHtml(freshness.status || 'Unavailable')}</div>
        </div>
        <div class="mt-4 space-y-3">
          ${timeline.map(item => `
            <div class="flex items-start gap-3">
              <div class="mt-1 w-2.5 h-2.5 rounded-full ${item.timestamp ? 'bg-arena-emerald' : 'bg-arena-muted'}"></div>
              <div class="min-w-0">
                <div class="text-[12px] font-bold">${escapeHtml(item.label)}</div>
                <div class="text-[11px] text-arena-muted">${escapeHtml(item.source || '')} - ${escapeHtml(item.status || '')} - ${escapeHtml(formatDateTime(item.timestamp))}</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  function renderAlertList(d) {
    const alerts = d.alerts || [];
    return `
      <div class="glass rounded-xl p-4 overflow-hidden">
        <div class="label">Open alerts</div>
        <div class="font-display font-bold text-lg mb-3">Control Centre queue</div>
        <div class="grid gap-2">
          ${alerts.length ? alerts.map(alert => `
            <button data-admin-nav="${escapeHtml(alert.actionView || 'dashboard')}" class="rounded-xl border border-white/10 bg-white/[0.035] hover:bg-white/[0.06] px-3 py-3 text-left">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="chip ${severityChipClass(alert.severity)}">${escapeHtml(alert.severity || 'Info')}</span>
                    <span class="text-[13px] font-bold">${escapeHtml(alert.title)}</span>
                  </div>
                  <div class="text-[12px] text-arena-muted mt-1">${escapeHtml(alert.detail)}</div>
                </div>
                <div class="hero-num text-xl leading-none">${formatNumber(alert.count || 1)}</div>
              </div>
            </button>
          `).join('') : `<div class="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-4 text-[12px] text-arena-muted">No open alerts.</div>`}
        </div>
      </div>`;
  }

  function quickLaunchCard(item, d) {
    if (!item) return '';
    const meta = quickLaunchMeta(item.id, d);
    return `
      <button data-admin-nav="${item.id}" class="rounded-xl border border-white/10 bg-white/[0.035] hover:bg-white/[0.06] px-3 py-3 text-left min-h-[116px]">
        <div class="flex items-center justify-between gap-2">
          ${icon(item.icon, 'text-[18px] text-arena-gold')}
          <span class="chip border border-white/10 bg-white/[0.04]">${escapeHtml(meta.badge)}</span>
        </div>
        <div class="mt-3 text-[13px] font-bold">${escapeHtml(item.label)}</div>
        <div class="mt-1 text-[11px] text-arena-muted leading-snug">${escapeHtml(meta.detail)}</div>
      </button>`;
  }

  function quickLaunchMeta(id, d) {
    const map = {
      dataset: { badge: formatNumber(d.importQueueDepth), detail: 'Queue depth and import history' },
      kpis: { badge: `${formatNumber(d.kpiCatalogue.active)} active`, detail: `${formatNumber(d.kpiCatalogue.retired)} retired of ${formatNumber(d.kpiCatalogue.total)} total` },
      people: { badge: formatNumber(d.activeUserCount), detail: 'Active users and team structure' },
      gamification: { badge: formatNumber(d.pendingRewardApprovals), detail: 'Rewards, missions, challenges and approvals' },
      sla: { badge: d.systemHealth?.status || 'green', detail: 'Commercial SLA rules and publish readiness' },
      settings: { badge: d.environment || 'Seed', detail: 'Environment, feature flags and app config' },
    };
    return map[id] || { badge: 'Open', detail: 'Launch module' };
  }

  function environmentBadge(env) {
    const cls = env === 'Production' ? 'rag-bg-red' : 'rag-bg-green';
    return `<div class="chip ${cls}">${escapeHtml(env)}</div>`;
  }

  function healthBorderClass(status) {
    return status === 'red' ? 'border-arena-red/30' : status === 'amber' ? 'border-arena-amber/30' : 'border-arena-emerald/30';
  }

  function healthIconClass(status) {
    return status === 'red' ? 'red-bg' : status === 'amber' ? 'bg-arena-amber text-arena-ink' : 'bg-arena-emerald text-arena-ink';
  }

  function healthIconName(status) {
    return status === 'red' ? 'shield-alert' : status === 'amber' ? 'triangle-alert' : 'shield-check';
  }

  function statusDotClass(status) {
    return status === 'red' ? 'bg-arena-red' : status === 'amber' ? 'bg-arena-amber' : 'bg-arena-emerald';
  }

  function severityChipClass(severity) {
    if (severity === 'Critical') return 'rag-bg-red';
    if (severity === 'High') return 'rag-bg-amber';
    return 'border border-arena-cyan/30 bg-arena-cyan/10';
  }

    return { renderDashboard };
  }

  window.RippleAdminDashboard = { create };
})();
