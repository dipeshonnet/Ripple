/* eslint-disable */
(function () {
  'use strict';

  const API_BASE = '/api';
  const SESSION_KEY = 'ripple_admin_session_v1';
  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
    { id: 'dataset', label: 'Dataset Manager', icon: 'database' },
    { id: 'kpis', label: 'KPI Manager', icon: 'gauge-circle' },
    { id: 'people', label: 'User & Team Management', icon: 'users' },
    { id: 'gamification', label: 'Gamification Configuration', icon: 'trophy' },
    { id: 'sla', label: 'SLA & Commercial Rules', icon: 'file-check-2' },
    { id: 'settings', label: 'System Settings', icon: 'sliders-horizontal' },
    { id: 'audit', label: 'Audit Log', icon: 'shield-check' },
  ];
  const ADMIN_MODULE_IDS = ['dataset', 'kpis', 'people', 'gamification', 'sla', 'settings'];
  const GAMIFICATION_TABS = [
    { id: 'missions', label: 'Missions', icon: 'flag', entity: 'Missions', api: 'missions', key: 'Mission_ID', name: 'Mission_Name' },
    { id: 'challenges', label: 'Challenges', icon: 'swords', entity: 'Challenges', api: 'challenges', key: 'Challenge_ID', name: 'Challenge_Name' },
    { id: 'badges', label: 'Badges', icon: 'award', entity: 'Badges', api: 'badges', key: 'Badge_ID', name: 'Badge_Name' },
    { id: 'rewards', label: 'Rewards', icon: 'gift', entity: 'Rewards', api: 'rewards', key: 'Reward_ID', name: 'Reward_Name' },
    { id: 'points-rules', label: 'Points & XP Rules', icon: 'sparkles', entity: 'Learning_Points_Rules', api: 'learning-points-rules', key: null, name: 'Activity' },
  ];

  const state = {
    token: null,
    user: null,
    scope: null,
    view: 'dashboard',
    loading: false,
    error: '',
    notice: '',
    dashboard: null,
    kpis: [],
    kpiPanel: { mode: 'new', id: null },
    kpiDependencies: { sla: [], missions: [] },
    kpiPublish: { recomputation: null, timestamp: null },
    users: [],
    teams: [],
    processes: [],
    coaching: [],
    missionAssignments: [],
    assignments: [],
    people: {
      filters: { role: 'all', team: 'all', process: 'all', location: 'all', active: 'active' },
    },
    gamificationUi: {
      tab: 'missions',
      panel: { entity: 'missions', mode: 'new', id: null },
    },
    entities: [],
    imports: [],
    dataset: {
      selectedEntity: null,
      rows: [],
      mode: 'upsert',
      pendingUpload: null,
      validation: null,
      importLog: null,
      historyStatus: 'all',
    },
    gamification: null,
    slaRules: [],
    commercialExposure: [],
    whatIfScenarios: [],
    settings: null,
    settingsUi: {
      versionKey: 'app.name',
      endpointHealth: [],
      iconMessage: '',
    },
    audit: [],
    auditFilters: {
      search: '',
      entity: 'all',
      action: 'all',
      adminUser: 'all',
      from: '',
      to: '',
    },
  };

  function appRoot() {
    return document.getElementById('admin-app');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function icon(name, cls) {
    return `<i data-lucide="${name}" class="${cls || 'text-[16px]'}"></i>`;
  }

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.6 } });
  }

  function readStoredSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function writeStoredSession(payload) {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
    } catch (error) {
      // Session storage can be unavailable in locked-down browser contexts.
    }
  }

  function clearStoredSession() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (error) {
      // Ignore storage cleanup failures.
    }
    state.token = null;
    state.user = null;
    state.scope = null;
  }

  async function requestJson(path, options) {
    const opts = options || {};
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      state.token ? { Authorization: `Bearer ${state.token}` } : {},
      opts.headers || {}
    );
    const response = await fetch(`${API_BASE}${path}`, {
      method: opts.method || 'GET',
      headers,
      body: opts.body == null ? undefined : JSON.stringify(opts.body),
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok || (payload && payload.ok === false)) {
      const err = new Error(payload?.error?.message || `HTTP ${response.status}`);
      err.status = response.status;
      err.code = payload?.error?.code || null;
      err.details = payload?.error?.details || null;
      err.data = payload?.data || null;
      throw err;
    }
    return payload ? payload.data : null;
  }

  function isAdminSession(data) {
    return data && data.user && data.user.Role === 'Admin' && data.scope && data.scope.canAdmin === true;
  }

  async function login(userId) {
    state.loading = true;
    state.error = '';
    renderLogin();
    try {
      const data = await requestJson('/auth/session', {
        method: 'POST',
        body: { userId },
      });
      if (!isAdminSession(data)) {
        clearStoredSession();
        renderAccessDenied(data?.user || null);
        return;
      }
      state.token = data.token;
      state.user = data.user;
      state.scope = data.scope;
      writeStoredSession({ token: state.token });
      await loadView('dashboard');
    } catch (error) {
      state.loading = false;
      state.error = error.code === 'INVALID_CREDENTIALS'
        ? 'Active admin user was not found.'
        : String(error.message || error);
      renderLogin();
    }
  }

  async function verifyStoredSession() {
    const stored = readStoredSession();
    if (!stored || !stored.token) {
      renderLogin();
      return;
    }
    state.token = stored.token;
    state.loading = true;
    renderGate('Checking admin session...');
    try {
      const data = await requestJson('/auth/session');
      if (!isAdminSession(data)) {
        clearStoredSession();
        renderAccessDenied(data?.user || null);
        return;
      }
      state.user = data.user;
      state.scope = data.scope;
      await loadView('dashboard');
    } catch (error) {
      clearStoredSession();
      state.error = error.status === 401 ? 'Admin sign-in required.' : String(error.message || error);
      renderLogin();
    }
  }

  async function logout() {
    try {
      if (state.token) await requestJson('/auth/session', { method: 'DELETE' });
    } catch (error) {
      // Token cleanup is best-effort.
    }
    clearStoredSession();
    state.notice = '';
    renderLogin();
  }

  function isAuthError(error) {
    return error && (error.status === 401 || error.status === 403);
  }

  async function requestOptional(path, fallback) {
    try {
      return await requestJson(path);
    } catch (error) {
      if (isAuthError(error)) throw error;
      return fallback;
    }
  }

  async function loadDashboardData() {
    try {
      return normalizeDashboard(await requestJson('/admin/dashboard'));
    } catch (error) {
      if (isAuthError(error)) throw error;
      const fallback = await buildDashboardFallback(error);
      return normalizeDashboard(fallback);
    }
  }

  async function buildDashboardFallback(sourceError) {
    const users = await requestOptional('/admin/users?limit=5000', []);
    const kpis = await requestOptional('/admin/kpis?limit=5000', []);
    const imports = await requestOptional('/imports?limit=1000', []);
    const gamification = await requestOptional('/admin/gamification', {});
    const coaching = await requestOptional('/entities/Coaching?limit=5000', []);
    const settings = await requestOptional('/admin/settings', null);
    const redemptions = Array.isArray(gamification?.Reward_Redemptions) ? gamification.Reward_Redemptions : [];
    const activeUsers = users.filter(isActiveUser);
    const activeKpis = kpis.filter(isActiveKpi);
    const dataFreshness = buildClientDataFreshness(imports, settings);
    const summary = {
      activeUserCount: activeUsers.length,
      activeUserCountByRole: groupCount(activeUsers, 'Role'),
      dataLoadTimestamp: dataFreshness.timestamp,
      dataFreshness,
      kpiCatalogue: {
        total: kpis.length,
        active: activeKpis.length,
        retired: Math.max(kpis.length - activeKpis.length, 0),
      },
      importQueueDepth: imports.filter(isQueuedImport).length,
      failedImportCount: imports.filter(isFailedImport).length,
      pendingRewardApprovals: redemptions.filter(isPendingRedemption).length,
      openCoachingRecords: coaching.filter(isOpenCoaching).length,
      environment: settings?.environment || 'Seed',
      dashboardSource: 'fallback',
      fallbackReason: String(sourceError?.message || sourceError || 'Dashboard endpoint unavailable'),
    };
    const alerts = buildClientAlerts(summary, dataFreshness);
    const alertCountBySeverity = countAlertsBySeverity(alerts);
    return {
      ...summary,
      alerts,
      alertCountBySeverity,
      systemHealth: buildClientSystemHealth(summary, alertCountBySeverity),
    };
  }

  function normalizeDashboard(raw) {
    const d = raw || {};
    const catalogue = d.kpiCatalogue || {};
    const total = toNumber(catalogue.total, toNumber(catalogue.active, 0) + toNumber(catalogue.retired, 0));
    const active = toNumber(catalogue.active, total);
    const retired = catalogue.retired == null ? Math.max(total - active, 0) : toNumber(catalogue.retired, 0);
    const dataFreshness = normalizeDataFreshness(d);
    const normalized = {
      ...d,
      activeUserCount: toNumber(d.activeUserCount, 0),
      activeUserCountByRole: d.activeUserCountByRole || {},
      dataLoadTimestamp: dataFreshness.timestamp,
      dataFreshness,
      kpiCatalogue: { total, active, retired },
      importQueueDepth: toNumber(d.importQueueDepth, 0),
      failedImportCount: toNumber(d.failedImportCount, 0),
      pendingRewardApprovals: toNumber(d.pendingRewardApprovals, 0),
      openCoachingRecords: toNumber(d.openCoachingRecords, 0),
      environment: d.environment || state.settings?.environment || 'Seed',
    };
    const alerts = Array.isArray(d.alerts) ? d.alerts : buildClientAlerts(normalized, dataFreshness);
    const alertCountBySeverity = normalizeAlertCounts(d.alertCountBySeverity, alerts);
    return {
      ...normalized,
      alerts,
      alertCountBySeverity,
      systemHealth: d.systemHealth || buildClientSystemHealth(normalized, alertCountBySeverity),
      health: d.health || (d.systemHealth && d.systemHealth.status) || buildClientSystemHealth(normalized, alertCountBySeverity).status,
    };
  }

  function normalizeDataFreshness(d) {
    const raw = d.dataFreshness || {};
    const timestamp = raw.timestamp || d.dataLoadTimestamp || null;
    return {
      timestamp,
      source: raw.source || (timestamp ? 'Live service' : 'Unavailable'),
      status: raw.status || (timestamp ? 'Synced' : 'Unavailable'),
      timeline: Array.isArray(raw.timeline) && raw.timeline.length
        ? raw.timeline
        : [
          { label: 'Latest committed import', timestamp, status: timestamp ? 'available' : 'none', source: 'Import_Log' },
          { label: 'Latest performance snapshot', timestamp: null, status: 'not loaded', source: 'Performance_Data' },
          { label: 'App configuration update', timestamp: null, status: 'not loaded', source: 'App_Config' },
        ],
    };
  }

  function buildClientDataFreshness(imports, settings) {
    const latestImport = latestRecordTimestamp(imports, ['Commit_Timestamp', 'Upload_Date', 'updated_at', 'created_at']);
    const latestConfig = latestRecordTimestamp(settings?.appConfig || [], ['Last_Modified_Date', 'updated_at', 'created_at']);
    const selected = latestImport || latestConfig || null;
    const source = latestImport ? 'Import_Log' : latestConfig ? 'App_Config' : 'Unavailable';
    const status = latestImport ? 'Synced' : latestConfig ? 'Config baseline' : 'Unavailable';
    return {
      timestamp: selected ? selected.timestamp : null,
      source,
      status,
      timeline: [
        { label: 'Latest committed import', timestamp: latestImport?.timestamp || null, status: latestImport ? statusLabel(latestImport.row) : 'none', source: 'Import_Log' },
        { label: 'Latest performance snapshot', timestamp: null, status: 'not loaded', source: 'Performance_Data' },
        { label: 'App configuration update', timestamp: latestConfig?.timestamp || null, status: latestConfig ? 'available' : 'not loaded', source: 'App_Config' },
      ],
    };
  }

  function buildClientAlerts(summary, dataFreshness) {
    const alerts = [];
    addAlert(alerts, 'Critical', summary.failedImportCount, 'Import failures', 'Failed or validation-failed uploads need review.', 'dataset');
    addAlert(alerts, 'High', summary.importQueueDepth, 'Import queue', 'Excel uploads are waiting for validation or commit.', 'dataset');
    addAlert(alerts, 'High', summary.pendingRewardApprovals, 'Reward approvals', 'Reward redemptions are waiting for operational approval.', 'gamification');
    addAlert(alerts, 'High', summary.openCoachingRecords, 'Open coaching', 'Coaching records are still open or in progress.', 'people');
    if (summary.environment === 'Production' && dataFreshness.source !== 'Import_Log') {
      addAlert(alerts, 'Critical', 1, 'Production data source', 'Production mode is not backed by a committed import yet.', 'settings');
    } else if (dataFreshness.source !== 'Import_Log') {
      addAlert(alerts, 'Info', 1, 'Fallback data source', `${dataFreshness.status} is populating the dashboard during migration.`, 'settings');
    }
    if (summary.environment !== 'Production') {
      addAlert(alerts, 'Info', 1, 'Seed environment', 'The Control Centre is running in seed mode.', 'settings');
    }
    return alerts;
  }

  function addAlert(alerts, severity, count, title, detail, actionView) {
    if (!count) return;
    alerts.push({ severity, count, title, detail, actionView });
  }

  function normalizeAlertCounts(counts, alerts) {
    return Object.assign({ Critical: 0, High: 0, Info: 0 }, counts || countAlertsBySeverity(alerts));
  }

  function countAlertsBySeverity(alerts) {
    return (alerts || []).reduce((acc, alert) => {
      const severity = alert.severity || 'Info';
      acc[severity] = (acc[severity] || 0) + toNumber(alert.count, 1);
      return acc;
    }, { Critical: 0, High: 0, Info: 0 });
  }

  function buildClientSystemHealth(summary, alertCountBySeverity) {
    const status = alertCountBySeverity.Critical > 0 ? 'red' : alertCountBySeverity.High > 0 ? 'amber' : 'green';
    const dataStatus = summary.dataFreshness?.timestamp
      ? summary.dataFreshness.source === 'Import_Log' ? 'green' : 'amber'
      : 'red';
    return {
      status,
      label: status === 'red' ? 'Critical action required' : status === 'amber' ? 'Attention needed' : 'Operational',
      updatedAt: new Date().toISOString(),
      checks: [
        { label: 'API service', status: 'green', detail: 'Dashboard route responding' },
        { label: 'Data freshness', status: dataStatus, detail: summary.dataFreshness?.status || 'Unavailable' },
        { label: 'Import queue', status: summary.importQueueDepth > 0 ? 'amber' : 'green', detail: `${summary.importQueueDepth} queued` },
        { label: 'Approvals', status: summary.pendingRewardApprovals > 0 ? 'amber' : 'green', detail: `${summary.pendingRewardApprovals} pending` },
        { label: 'Coaching', status: summary.openCoachingRecords > 0 ? 'amber' : 'green', detail: `${summary.openCoachingRecords} open` },
      ],
    };
  }

  function groupCount(rows, field) {
    return (rows || []).reduce((acc, row) => {
      const key = row[field] || 'Unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }

  function isActiveUser(user) {
    const status = canonicalStatus(user);
    return user.Active !== false && user.is_active !== false && user.Is_Active !== false
      && !['inactive', 'disabled', 'deactivated'].includes(status);
  }

  function isActiveKpi(kpi) {
    const status = canonicalStatus(kpi);
    return kpi.Active !== false && kpi.is_active !== false && kpi.Is_Active !== false
      && !['retired', 'inactive', 'disabled'].includes(status);
  }

  function isActiveLinkedRecord(row) {
    const status = canonicalStatus(row);
    return row && row.Active !== false && row.Is_Active !== false && row.is_active !== false
      && !['retired', 'inactive', 'disabled', 'closed', 'complete', 'completed', 'cancelled', 'canceled'].includes(status);
  }

  function buildKpiDependencies() {
    const sla = (state.slaRules || []).filter(row => row.KPI_ID && isActiveLinkedRecord(row));
    const missions = ((state.gamification && state.gamification.Missions) || []).filter(row => row.KPI_ID && isActiveLinkedRecord(row));
    return { sla, missions };
  }

  function kpiDependenciesFor(kpiId) {
    if (!kpiId) return { sla: [], missions: [] };
    const deps = state.kpiDependencies || {};
    return {
      sla: (deps.sla || []).filter(row => row.KPI_ID === kpiId),
      missions: (deps.missions || []).filter(row => row.KPI_ID === kpiId),
    };
  }

  function dependencyCount(kpiId) {
    const deps = kpiDependenciesFor(kpiId);
    return deps.sla.length + deps.missions.length;
  }

  function kpiField(row, names, fallback) {
    const source = row || {};
    for (const name of Array.isArray(names) ? names : [names]) {
      if (source[name] != null && source[name] !== '') return source[name];
    }
    return fallback;
  }

  function kpiWeight(row) {
    return kpiField(row, ['Weight', 'Weightage'], '');
  }

  function kpiEffectiveDate(row) {
    return kpiField(row, ['Effective_Date', 'EffectiveDate', 'Effective_From', 'effective_date'], '');
  }

  function roleVisibility(row) {
    const value = row || {};
    const raw = value.Role_Visibility || value.Visibility || value.Applicability;
    const explicit = {
      Agent: value.Visible_Agent ?? value.Agent_Visible ?? value.Agent,
      TL: value.Visible_TL ?? value.TL_Visible ?? value.TeamLead_Visible ?? value.Team_Lead,
      Manager: value.Visible_Manager ?? value.Manager_Visible ?? value.Manager,
    };
    const rawText = typeof raw === 'string' ? raw.toLowerCase() : '';
    const all = raw == null || raw === '' || rawText === 'all';
    return {
      Agent: explicit.Agent == null ? (all || rawText.includes('agent')) : Boolean(explicit.Agent),
      TL: explicit.TL == null ? (all || rawText.includes('tl') || rawText.includes('team lead')) : Boolean(explicit.TL),
      Manager: explicit.Manager == null ? (all || rawText.includes('manager')) : Boolean(explicit.Manager),
    };
  }

  function roleVisibilityLabel(row) {
    const visibility = roleVisibility(row);
    const roles = ['Agent', 'TL', 'Manager'].filter(role => visibility[role]);
    return roles.length === 3 ? 'All' : roles.length ? roles.join(', ') : 'None';
  }

  function kpiActiveLabel(row) {
    return isActiveKpi(row) ? 'Active' : 'Retired';
  }

  function kpiTypes() {
    const defaults = ['Sales Conversion', 'Production', 'Revenue Quality', 'Compliance', 'Workforce Efficiency', 'Financial Efficiency', 'Customer Experience'];
    const found = (state.kpis || []).map(row => row.KPI_Type).filter(Boolean);
    return Array.from(new Set([...defaults, ...found])).sort((a, b) => a.localeCompare(b));
  }

  function ragStatusForValue(row, actualValue) {
    const direction = String(kpiField(row, 'Direction', 'Higher')).toLowerCase();
    const actual = nullableNumber(actualValue);
    const green = nullableNumber(kpiField(row, 'Green_Threshold', null));
    const amber = nullableNumber(kpiField(row, 'Amber_Threshold', null));
    if (actual == null || green == null || amber == null) return 'Amber';
    if (direction === 'lower') {
      if (actual <= green) return 'Green';
      if (actual <= amber) return 'Amber';
      return 'Red';
    }
    if (actual >= green) return 'Green';
    if (actual >= amber) return 'Amber';
    return 'Red';
  }

  function kpiRagClass(status) {
    if (status === 'Green') return 'bg-emerald-400/20 text-emerald-100 border-emerald-300/30';
    if (status === 'Red') return 'bg-rose-400/20 text-rose-100 border-rose-300/30';
    return 'bg-amber-300/20 text-amber-100 border-amber-300/30';
  }

  function renderKpiRagPreview(row) {
    const preview = row || {};
    const direction = String(kpiField(preview, 'Direction', 'Higher'));
    const target = kpiField(preview, 'Target', '');
    const green = kpiField(preview, 'Green_Threshold', '');
    const amber = kpiField(preview, 'Amber_Threshold', '');
    const red = kpiField(preview, 'Red_Threshold', '');
    const targetStatus = ragStatusForValue(preview, target);
    const orderedBands = direction.toLowerCase() === 'lower'
      ? [
        { label: `Green <= ${green || '-'}`, cls: 'bg-emerald-400' },
        { label: `Amber <= ${amber || '-'}`, cls: 'bg-amber-300' },
        { label: `Red >= ${red || amber || '-'}`, cls: 'bg-rose-400' },
      ]
      : [
        { label: `Red <= ${red || amber || '-'}`, cls: 'bg-rose-400' },
        { label: `Amber >= ${amber || '-'}`, cls: 'bg-amber-300' },
        { label: `Green >= ${green || '-'}`, cls: 'bg-emerald-400' },
      ];
    return `
      <div class="rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="label">RAG threshold preview</div>
          <span class="chip border ${kpiRagClass(targetStatus)}">Target: ${escapeHtml(targetStatus)}</span>
        </div>
        <div class="grid grid-cols-3 overflow-hidden rounded-md border border-white/10 h-8">
          ${orderedBands.map(band => `<div class="${band.cls} text-[10px] font-semibold text-slate-950 flex items-center justify-center px-1 text-center">${escapeHtml(band.label)}</div>`).join('')}
        </div>
        <div class="mt-2 text-[11px] text-arena-muted">${escapeHtml(direction)} is better; sample actual uses the configured target ${escapeHtml(target || '-')}.</div>
      </div>`;
  }

  function formatKpiThresholds(row) {
    return `G ${kpiField(row, 'Green_Threshold', '-')} / A ${kpiField(row, 'Amber_Threshold', '-')} / R ${kpiField(row, 'Red_Threshold', '-')}`;
  }

  function isQueuedImport(row) {
    return ['queued', 'validated', 'pending', 'pending validation', 'processing', 'in progress'].includes(canonicalStatus(row));
  }

  function isFailedImport(row) {
    return ['validationfailed', 'validation failed', 'failed', 'error'].includes(canonicalStatus(row));
  }

  function isPendingRedemption(row) {
    return ['pending', 'pending approval', 'awaiting approval', 'approval pending'].includes(canonicalStatus(row));
  }

  function isOpenCoaching(row) {
    return !['closed', 'resolved', 'complete', 'completed', 'cancelled', 'canceled'].includes(canonicalStatus(row));
  }

  function isActiveTeam(team) {
    const status = canonicalStatus(team);
    return team && team.Active !== false && team.is_active !== false && team.Is_Active !== false
      && !['inactive', 'disabled', 'deactivated', 'retired'].includes(status);
  }

  function userById(id) {
    return (state.users || []).find(user => user.UserID === id) || null;
  }

  function teamById(id) {
    return (state.teams || []).find(team => team.TeamID === id) || null;
  }

  function processById(id) {
    return (state.processes || []).find(process => process.ProcessID === id) || null;
  }

  function teamLeadId(team) {
    return team?.TeamLeadID || team?.TL_UserID || '';
  }

  function activeUsers() {
    return (state.users || []).filter(isActiveUser);
  }

  function activeTeams() {
    return (state.teams || []).filter(isActiveTeam);
  }

  function managers() {
    return activeUsers().filter(user => user.Role === 'Manager');
  }

  function teamLeads() {
    return activeUsers().filter(user => user.Role === 'Team Lead' || user.Role === 'TL');
  }

  function agents() {
    return activeUsers().filter(user => user.Role === 'Agent');
  }

  function roleLabel(role) {
    return role === 'TL' ? 'Team Lead' : role || '-';
  }

  function isAgentRole(role) {
    return roleLabel(role) === 'Agent';
  }

  function userTeamName(user) {
    const team = teamById(user?.TeamID);
    return team ? team.TeamName : (user?.TeamID || '-');
  }

  function userProcessName(user) {
    const process = processById(user?.ProcessID);
    return process ? process.ProcessName : (user?.ProcessID || '-');
  }

  function uniqueValues(rows, field) {
    return [...new Set((rows || []).map(row => row && row[field]).filter(value => value != null && String(value).trim() !== ''))]
      .sort((a, b) => String(a).localeCompare(String(b)));
  }

  function optionHtml(value, label, selected) {
    return `<option value="${escapeHtml(value)}" ${String(value) === String(selected) ? 'selected' : ''}>${escapeHtml(label == null ? value : label)}</option>`;
  }

  function roleOptions(selected, includeAll) {
    const roles = ['Agent', 'Team Lead', 'Manager', 'Admin'];
    return `${includeAll ? optionHtml('all', 'All roles', selected) : ''}${roles.map(role => optionHtml(role, role, selected)).join('')}`;
  }

  function teamOptions(selected, includeAll, includeBlank) {
    const rows = activeTeams();
    return `${includeAll ? optionHtml('all', 'All teams', selected) : ''}${includeBlank ? optionHtml('', 'Unassigned', selected) : ''}${rows.map(team => optionHtml(team.TeamID, `${team.TeamID} - ${team.TeamName}`, selected)).join('')}`;
  }

  function processOptions(selected, includeAll, includeBlank) {
    const rows = state.processes || [];
    return `${includeAll ? optionHtml('all', 'All processes', selected) : ''}${includeBlank ? optionHtml('', 'Unassigned', selected) : ''}${rows.map(process => optionHtml(process.ProcessID, `${process.ProcessID} - ${process.ProcessName || process.ProcessID}`, selected)).join('')}`;
  }

  function managerOptions(selected, includeBlank) {
    return `${includeBlank ? optionHtml('', 'Unassigned', selected) : ''}${managers().map(user => optionHtml(user.UserID, `${user.UserID} - ${user.Name}`, selected)).join('')}`;
  }

  function teamLeadOptions(selected, includeBlank) {
    return `${includeBlank ? optionHtml('', 'No TL assigned', selected) : ''}${teamLeads().map(user => optionHtml(user.UserID, `${user.UserID} - ${user.Name}`, selected)).join('')}`;
  }

  function locationOptions(selected, includeAll) {
    const locations = uniqueValues([...(state.users || []), ...(state.teams || [])], 'Location');
    return `${includeAll ? optionHtml('all', 'All locations', selected) : ''}${locations.map(location => optionHtml(location, location, selected)).join('')}`;
  }

  function peopleFilters() {
    return state.people?.filters || { role: 'all', team: 'all', process: 'all', location: 'all', active: 'active' };
  }

  function filteredPeopleUsers() {
    const filters = peopleFilters();
    return (state.users || []).filter(user => {
      if (filters.role !== 'all' && roleLabel(user.Role) !== filters.role) return false;
      if (filters.team !== 'all' && String(user.TeamID || '') !== String(filters.team)) return false;
      if (filters.process !== 'all' && String(user.ProcessID || '') !== String(filters.process)) return false;
      if (filters.location !== 'all' && String(user.Location || '') !== String(filters.location)) return false;
      if (filters.active === 'active' && !isActiveUser(user)) return false;
      if (filters.active === 'inactive' && isActiveUser(user)) return false;
      return true;
    }).sort((a, b) => {
      const activeDelta = Number(isActiveUser(b)) - Number(isActiveUser(a));
      if (activeDelta) return activeDelta;
      return String(a.UserID || '').localeCompare(String(b.UserID || ''));
    });
  }

  function teamHeadcount(teamId) {
    return agents().filter(user => user.TeamID === teamId).length;
  }

  function usersForTeam(teamId) {
    return activeUsers().filter(user => user.TeamID === teamId);
  }

  function peopleMetrics() {
    const active = activeUsers();
    const byRole = groupCount(active, 'Role');
    const activeAgentCount = agents().length;
    const unassignedAgents = agents().filter(user => !user.TeamID || !user.ProcessID || !teamById(user.TeamID) || !processById(user.ProcessID)).length;
    const teamsNoTl = activeTeams().filter(team => !teamLeadId(team) || !isActiveUser(userById(teamLeadId(team)))).length;
    return {
      activeUsers: active.length,
      activeAgentCount,
      roleBreakdown: roleBreakdown(byRole),
      teams: activeTeams().length,
      unassignedAgents,
      teamsNoTl,
    };
  }

  function activeRecordCount(rows, predicate) {
    return (rows || []).filter(row => predicate(row) && isActiveLinkedRecord(row)).length;
  }

  function cascadeImpactForUser(userId) {
    const user = userById(userId);
    const teamIds = new Set((state.teams || []).filter(team => teamLeadId(team) === userId || team.ManagerID === userId).map(team => team.TeamID));
    return {
      user,
      teamsLed: (state.teams || []).filter(team => teamLeadId(team) === userId && isActiveTeam(team)),
      teamsManaged: (state.teams || []).filter(team => team.ManagerID === userId && isActiveTeam(team)),
      openCoaching: activeRecordCount(state.coaching, row => row.UserID === userId || row.Assigned_By === userId),
      activeMissionAssignments: activeRecordCount(state.missionAssignments, row => row.UserID === userId || teamIds.has(row.TeamID)),
      learningAssignments: activeRecordCount(state.assignments, row => row.UserID === userId || teamIds.has(row.TeamID)),
    };
  }

  function cascadeImpactForTeam(teamId) {
    const team = teamById(teamId);
    const userIds = new Set(usersForTeam(teamId).map(user => user.UserID));
    return {
      team,
      activeMembers: usersForTeam(teamId).length,
      openCoaching: activeRecordCount(state.coaching, row => userIds.has(row.UserID)),
      activeMissionAssignments: activeRecordCount(state.missionAssignments, row => row.TeamID === teamId || userIds.has(row.UserID)),
      learningAssignments: activeRecordCount(state.assignments, row => row.TeamID === teamId || userIds.has(row.UserID)),
    };
  }

  function impactLines(impact) {
    const lines = [];
    if (impact.teamsLed?.length) lines.push(`${impact.teamsLed.length} team(s) still assigned to this TL`);
    if (impact.teamsManaged?.length) lines.push(`${impact.teamsManaged.length} team(s) managed by this user`);
    if (impact.activeMembers) lines.push(`${impact.activeMembers} active team member(s)`);
    if (impact.openCoaching) lines.push(`${impact.openCoaching} open coaching record(s)`);
    if (impact.activeMissionAssignments) lines.push(`${impact.activeMissionAssignments} active mission assignment(s)`);
    if (impact.learningAssignments) lines.push(`${impact.learningAssignments} learning assignment(s)`);
    return lines;
  }

  function requireCascadeConfirmation(title, impact) {
    const lines = impactLines(impact);
    if (!lines.length) return true;
    return window.confirm(`${title}\n\nCascade impact:\n- ${lines.join('\n- ')}\n\nContinue?`);
  }

  function enforceTlReassignmentBeforeDeactivate(user, impact) {
    if (roleLabel(user?.Role) === 'Team Lead' && impact.teamsLed && impact.teamsLed.length) {
      const teams = impact.teamsLed.map(team => `${team.TeamID} ${team.TeamName || ''}`.trim()).join(', ');
      throw new Error(`Reassign TL ownership before deactivating ${user.Name || user.UserID}. Active team(s): ${teams}.`);
    }
  }

  function validateUserPayload(payload, existing) {
    const next = { ...(existing || {}), ...(payload || {}) };
    if (!String(next.Name || '').trim()) throw new Error('User name is required.');
    if (!String(next.Role || '').trim()) throw new Error('User role is required.');
    if (isActiveUser(next) && isAgentRole(next.Role)) {
      if (!next.TeamID || !teamById(next.TeamID)) throw new Error('Every active agent must have a valid TeamID.');
      if (!next.ProcessID || !processById(next.ProcessID)) throw new Error('Every active agent must have a valid ProcessID.');
    }
  }

  function validateTeamPayload(payload, existing) {
    const next = { ...(existing || {}), ...(payload || {}) };
    if (!String(next.TeamName || '').trim()) throw new Error('Team name is required.');
    if (!String(next.ProcessID || '').trim()) throw new Error('Team ProcessID is required.');
    if (next.TeamLeadID && !userById(next.TeamLeadID)) throw new Error('Selected TL does not exist.');
    if (next.ManagerID && !userById(next.ManagerID)) throw new Error('Selected manager does not exist.');
  }

  function canonicalStatus(row) {
    return String(row && (row.Status || row.status || row.State || row.state) || '')
      .trim()
      .toLowerCase()
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ');
  }

  function statusLabel(row) {
    return canonicalStatus(row) || 'recorded';
  }

  function latestRecordTimestamp(rows, fields) {
    let latest = null;
    for (const row of rows || []) {
      for (const field of fields) {
        const timestamp = normalizeTimestamp(row && row[field]);
        if (!timestamp) continue;
        const millis = Date.parse(timestamp);
        if (!Number.isFinite(millis)) continue;
        if (!latest || millis > latest.millis) latest = { timestamp, millis, row, field };
      }
    }
    return latest;
  }

  function normalizeTimestamp(value) {
    if (!value) return null;
    const text = String(value).trim();
    if (!text) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T23:59:59.000Z`;
    const millis = Date.parse(text);
    return Number.isFinite(millis) ? new Date(millis).toISOString() : null;
  }

  function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  async function loadView(view) {
    state.view = view || state.view || 'dashboard';
    state.loading = true;
    state.error = '';
    renderShell();
    try {
      if (state.view === 'dashboard') {
        state.dashboard = await loadDashboardData();
        state.settings = await requestOptional('/admin/settings', state.settings || null);
        state.audit = await requestOptional('/admin/audit-log?limit=8', []);
      } else if (state.view === 'dataset') {
        state.entities = await requestJson('/entities');
        if (!state.dataset.selectedEntity && state.entities.length) {
          const firstImportable = state.entities.find(row => row.importable) || state.entities[0];
          state.dataset.selectedEntity = firstImportable.entity;
        }
        await loadDatasetSelection();
      } else if (state.view === 'kpis') {
        state.kpis = await requestJson('/admin/kpis?limit=5000');
        state.slaRules = await requestOptional('/admin/sla-rules?limit=5000', []);
        state.gamification = await requestOptional('/admin/gamification', state.gamification || {});
        state.kpiDependencies = buildKpiDependencies();
        if (state.kpiPanel.id && !state.kpis.some(kpi => kpi.KPI_ID === state.kpiPanel.id)) {
          state.kpiPanel = { mode: 'new', id: null };
        }
        state.audit = await requestJson('/admin/audit-log?entity=KPI_Master&limit=8');
      } else if (state.view === 'people') {
        state.users = await requestJson('/admin/users?limit=5000');
        state.teams = await requestJson('/admin/teams?limit=5000');
        state.processes = await requestOptional('/entities/Processes?limit=5000', []);
        state.coaching = await requestOptional('/entities/Coaching?limit=5000', []);
        state.missionAssignments = await requestOptional('/entities/Mission_Assignments?limit=5000', []);
        state.assignments = await requestOptional('/entities/Learning_Assignments?limit=5000', []);
        state.audit = await requestOptional('/admin/audit-log?limit=8', []);
      } else if (state.view === 'gamification') {
        state.gamification = await requestJson('/admin/gamification');
        state.kpis = await requestJson('/admin/kpis?limit=5000');
        state.users = await requestJson('/admin/users?limit=5000');
        state.teams = await requestJson('/admin/teams?limit=5000');
        state.processes = await requestOptional('/entities/Processes?limit=5000', []);
        state.audit = await requestOptional('/admin/audit-log?limit=8', []);
      } else if (state.view === 'sla') {
        state.slaRules = await requestJson('/admin/sla-rules?limit=5000');
        state.kpis = await requestJson('/admin/kpis?limit=5000');
        state.commercialExposure = await requestOptional('/entities/Commercial_Exposure?limit=5000', []);
        state.whatIfScenarios = await requestOptional('/entities/What_If_Scenarios?limit=5000', []);
        state.audit = await requestOptional('/admin/audit-log?entity=SLA_Commercial_Rules&limit=8', []);
      } else if (state.view === 'settings') {
        state.settings = await requestJson('/admin/settings');
        state.teams = await requestJson('/admin/teams?limit=5000');
        state.audit = await requestJson('/admin/audit-log?search=App_Config&limit=8');
      } else if (state.view === 'audit') {
        state.audit = await requestJson(`/admin/audit-log?${auditQueryString(30)}`);
      }
      state.loading = false;
      renderShell();
    } catch (error) {
      state.loading = false;
      if (error.status === 401) {
        clearStoredSession();
        state.error = 'Admin sign-in required.';
        renderLogin();
        return;
      }
      if (error.status === 403) {
        clearStoredSession();
        renderAccessDenied(state.user);
        return;
      }
      state.error = String(error.message || error);
      renderShell();
    }
  }

  async function loadDatasetSelection() {
    const entity = state.dataset.selectedEntity;
    state.imports = await requestJson('/imports?limit=500');
    state.dataset.rows = entity ? await requestJson(`/entities/${encodeURIComponent(entity)}?limit=20`) : [];
  }

  function renderGate(message) {
    appRoot().innerHTML = `
      <main class="min-h-screen grid place-items-center px-6">
        <div class="glass rounded-xl p-5 text-sm text-arena-muted flex items-center gap-2">
          ${icon('loader-circle', 'text-[16px] animate-spin')} ${escapeHtml(message)}
        </div>
      </main>`;
    refreshIcons();
  }

  function renderLogin() {
    appRoot().innerHTML = `
      <main class="min-h-screen grid place-items-center px-5">
        <section class="w-full max-w-[430px] glass rounded-xl p-5">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl gold-bg grid place-items-center shadow-gold">${icon('shield-check', 'text-[18px]')}</div>
            <div>
              <div class="font-display font-bold text-xl">Admin Control Centre</div>
              <div class="text-[11px] uppercase tracking-[0.16em] text-arena-muted">Ripple Clover Medicare</div>
            </div>
          </div>
          ${state.error ? `<div class="mt-4 rounded-lg border border-arena-red/30 bg-arena-red/10 px-3 py-2 text-[12px] text-arena-red">${escapeHtml(state.error)}</div>` : ''}
          <form id="admin-login-form" class="mt-5 space-y-3">
            <label class="block">
              <span class="label">Admin User ID</span>
              <input id="admin-user-id" class="mt-1" autocomplete="username" placeholder="ADMIN001" ${state.loading ? 'disabled' : ''} />
            </label>
            <button class="btn-primary w-full justify-center" type="submit" ${state.loading ? 'disabled' : ''}>
              ${state.loading ? icon('loader-circle', 'text-[14px] animate-spin') : icon('log-in', 'text-[14px]')}
              Sign in
            </button>
          </form>
          <button data-action="go-main" class="mt-3 w-full btn-secondary justify-center text-[12px]">
            ${icon('arrow-left', 'text-[13px]')} Main arena
          </button>
        </section>
      </main>`;
    refreshIcons();
  }

  function renderAccessDenied(user) {
    const role = user?.Role || 'Unauthenticated';
    appRoot().innerHTML = `
      <main class="min-h-screen grid place-items-center px-5">
        <section class="w-full max-w-[520px] glass rounded-xl p-5">
          <div class="flex items-start gap-3">
            <div class="w-10 h-10 rounded-xl red-bg grid place-items-center">${icon('lock-keyhole', 'text-[18px]')}</div>
            <div>
              <div class="font-display font-bold text-xl">Access denied</div>
              <div class="text-sm text-arena-muted mt-1">Role detected: ${escapeHtml(role)}. Admin role is required for this route.</div>
            </div>
          </div>
          <div class="mt-5 flex flex-wrap gap-2">
            <button data-action="try-admin-login" class="btn-primary">${icon('log-in', 'text-[14px]')} Admin sign in</button>
            <button data-action="go-main" class="btn-secondary">${icon('arrow-left', 'text-[14px]')} Main arena</button>
          </div>
        </section>
      </main>`;
    refreshIcons();
  }

  function renderShell() {
    appRoot().innerHTML = `
      <div class="min-h-screen grid grid-cols-1 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside class="border-b lg:border-b-0 lg:border-r border-white/10 bg-arena-base/80 px-4 py-4 lg:min-h-screen">
          <div class="flex items-center gap-2.5">
            <div class="w-9 h-9 rounded-xl gold-bg grid place-items-center shadow-gold">${icon('shield-check', 'text-[16px]')}</div>
            <div class="min-w-0">
              <div class="brand-name font-display font-bold text-[15px]">Ripple Admin</div>
              <div class="text-[9px] uppercase tracking-[0.14em] text-arena-muted">Control Centre</div>
            </div>
          </div>
          <nav class="mt-5 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-1 gap-1.5">
            ${NAV.map(item => `
              <button data-admin-nav="${item.id}" class="nav-item ${state.view === item.id ? 'active' : ''} flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-semibold text-arena-muted hover:text-arena-text">
                ${icon(item.icon, 'text-[15px] shrink-0')} <span class="min-w-0 text-left leading-tight">${escapeHtml(item.label)}</span>
              </button>
            `).join('')}
          </nav>
          <div class="mt-5 glass rounded-xl p-3 text-[11px] text-arena-muted">
            <div class="font-semibold text-arena-text">${escapeHtml(state.user?.Name || '')}</div>
            <div>${escapeHtml(state.user?.UserID || '')} - Admin</div>
            <button data-action="logout" class="mt-3 btn-secondary w-full justify-center text-[12px]">${icon('log-out', 'text-[13px]')} Sign out</button>
          </div>
        </aside>
        <main class="px-4 sm:px-6 py-5 max-w-[1280px] w-full mx-auto">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <div class="label">Admin route</div>
              <h1 class="font-display font-bold text-2xl tracking-tight">${escapeHtml(activeTitle())}</h1>
            </div>
            <button data-action="refresh-view" class="btn-secondary text-[12px]">${icon('refresh-cw', 'text-[13px]')} Refresh</button>
          </div>
          ${state.notice ? `<div class="mb-4 rounded-lg border border-arena-emerald/30 bg-arena-emerald/10 px-3 py-2 text-[12px] text-arena-emerald">${escapeHtml(state.notice)}</div>` : ''}
          ${state.error ? `<div class="mb-4 rounded-lg border border-arena-red/30 bg-arena-red/10 px-3 py-2 text-[12px] text-arena-red">${escapeHtml(state.error)}</div>` : ''}
          ${state.loading ? loadingBlock() : renderActiveView()}
        </main>
      </div>`;
    refreshIcons();
  }

  function activeTitle() {
    return (NAV.find(item => item.id === state.view) || NAV[0]).label;
  }

  function loadingBlock() {
    return `<div class="glass rounded-xl p-5 text-sm text-arena-muted flex items-center gap-2">${icon('loader-circle', 'text-[16px] animate-spin')} Loading...</div>`;
  }

  function renderActiveView() {
    if (state.view === 'dataset') return renderDataset();
    if (state.view === 'kpis') return renderKpis();
    if (state.view === 'people') return renderPeople();
    if (state.view === 'gamification') return renderGamification();
    if (state.view === 'sla') return renderSla();
    if (state.view === 'settings') return renderSettings();
    if (state.view === 'audit') return renderAudit();
    return renderDashboard();
  }

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

  function metricTile(metric) {
    return `
      <div class="glass rounded-xl p-3 min-h-[110px]">
        <div class="flex items-center justify-between gap-2">
          <div class="label">${escapeHtml(metric.label)}</div>
          ${icon(metric.icon || 'activity', 'text-[15px] text-arena-gold')}
        </div>
        <div class="hero-num text-2xl mt-2 leading-none">${escapeHtml(metric.value == null ? '-' : metric.value)}</div>
        <div class="text-[11px] text-arena-muted mt-2 leading-snug">${escapeHtml(metric.sub || '')}</div>
      </div>`;
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

  function roleBreakdown(counts) {
    const entries = Object.entries(counts || {});
    if (!entries.length) return 'No role split available';
    return entries.map(([role, count]) => `${role}: ${count}`).join(' | ');
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('en-US');
  }

  function formatCell(value) {
    if (value == null || value === '') return '-';
    if (typeof value === 'object') return JSON.stringify(value).slice(0, 120);
    return String(value);
  }

  function formatDateShort(value) {
    if (!value) return 'No sync';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatDateTime(value) {
    if (!value) return 'No timestamp';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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

  function renderDataset() {
    const entities = state.entities || [];
    const selected = selectedDatasetEntity();
    const imports = filteredDatasetImports();
    const schema = selected?.schema || { columns: [], primaryKey: [] };
    const previewColumns = datasetPreviewColumns(selected, state.dataset.rows);
    const upload = state.dataset.pendingUpload;
    const validation = state.dataset.validation;
    const sourceCount = entities.filter(row => !row.controlEntity).length;
    const controlCount = entities.filter(row => row.controlEntity).length;
    const queueDepth = (state.imports || []).filter(isQueuedImport).length;
    const last = selected?.lastImport || null;
    return `
      <section class="space-y-4">
        <div class="glass rounded-xl p-4 overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="label">Dataset Manager</div>
              <div class="font-display font-bold text-lg">Entity catalogue</div>
            </div>
            <div class="flex flex-wrap gap-2">
              <div class="chip border border-white/10 bg-white/[0.04]">${formatNumber(sourceCount)} source</div>
              <div class="chip border border-white/10 bg-white/[0.04]">${formatNumber(controlCount)} control</div>
              <div class="chip border border-white/10 bg-white/[0.04]">${formatNumber(queueDepth)} pending</div>
            </div>
          </div>
          <div class="mt-4 flex gap-2 overflow-x-auto pb-1">
            ${entities.map(row => datasetTab(row)).join('')}
          </div>
        </div>

        <section class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_430px] gap-4">
          <div class="glass rounded-xl p-4 overflow-hidden">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="label">${escapeHtml(selected?.controlEntity ? 'Control entity' : 'Source entity')}</div>
                <div class="font-display font-bold text-xl">${escapeHtml(selected?.entity || 'No entity selected')}</div>
                <div class="text-[12px] text-arena-muted mt-1">
                  ${formatNumber(selected?.rowCount || 0)} rows - PK ${escapeHtml((schema.primaryKey || []).join(', ') || '-')}
                </div>
              </div>
              <div class="text-right text-[11px] text-arena-muted">
                <div class="font-semibold text-arena-text">${escapeHtml(last?.Uploaded_By || 'No uploader')}</div>
                <div>${escapeHtml(formatDateTime(last?.Commit_Timestamp || last?.Upload_Date))}</div>
                <div>${escapeHtml(last?.Status || 'No import')}</div>
              </div>
            </div>
            <div class="mt-4">
              ${table(previewColumns, state.dataset.rows || [], row => previewColumns.map(column => formatCell(row[column])))}
            </div>
          </div>

          <aside class="space-y-4">
            <div class="glass rounded-xl p-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <div class="label">Schema</div>
                  <div class="font-display font-bold text-lg">${formatNumber(schema.columns.length)} columns</div>
                </div>
                <button data-action="download-template" class="btn-secondary text-[12px]">${icon('download', 'text-[13px]')} Template</button>
              </div>
              <div class="mt-3 flex flex-wrap gap-1.5">
                ${(schema.columns || []).slice(0, 18).map(column => `
                  <span class="chip border border-white/10 bg-white/[0.04]">${escapeHtml(column.name)}:${escapeHtml(column.type)}${column.required ? '*' : ''}</span>
                `).join('')}
                ${(schema.columns || []).length > 18 ? `<span class="chip border border-white/10 bg-white/[0.04]">+${formatNumber(schema.columns.length - 18)}</span>` : ''}
              </div>
            </div>

            <div class="glass rounded-xl p-4">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div class="label">Upload</div>
                  <div class="font-display font-bold text-lg">Import workbook</div>
                </div>
                <select id="dataset-mode" class="max-w-[140px]" ${selected?.importable ? '' : 'disabled'}>
                  <option value="upsert" ${state.dataset.mode === 'upsert' ? 'selected' : ''}>Upsert</option>
                  <option value="replace" ${state.dataset.mode === 'replace' ? 'selected' : ''}>Replace</option>
                </select>
              </div>
              <input id="dataset-file-input" class="hidden" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
              <div class="mt-4 flex flex-wrap gap-2">
                <button data-action="choose-dataset-file" class="btn-primary text-[12px]" ${selected?.importable ? '' : 'disabled'}>${icon('upload-cloud', 'text-[13px]')} Upload .xlsx</button>
                <button data-action="commit-import" class="btn-secondary text-[12px]" ${validation?.valid && state.dataset.importLog ? '' : 'disabled'}>${icon('check-circle-2', 'text-[13px]')} Commit</button>
                <button data-action="clear-import" class="btn-secondary text-[12px]" ${upload || validation ? '' : 'disabled'}>${icon('x', 'text-[13px]')} Clear</button>
              </div>
              ${upload ? `<div class="mt-3 text-[12px] text-arena-muted">${escapeHtml(upload.filename)} - ${formatNumber(upload.rows.length)} parsed rows</div>` : ''}
              ${renderDiffSummary(validation?.diff)}
              ${renderValidationReport(validation)}
            </div>
          </aside>
        </section>

        <div class="glass rounded-xl p-4 overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <div class="label">Import_Log</div>
              <div class="font-display font-bold text-lg">Import history</div>
            </div>
            <select id="dataset-history-status" class="max-w-[180px]">
              ${historyStatusOptions().map(status => `<option value="${escapeHtml(status)}" ${state.dataset.historyStatus === status ? 'selected' : ''}>${escapeHtml(status === 'all' ? 'All statuses' : status)}</option>`).join('')}
            </select>
          </div>
          ${datasetHistoryTable(imports)}
        </div>
      </section>`;
  }

  function selectedDatasetEntity() {
    return (state.entities || []).find(row => row.entity === state.dataset.selectedEntity) || (state.entities || [])[0] || null;
  }

  function datasetTab(row) {
    const active = row.entity === state.dataset.selectedEntity;
    const last = row.lastImport || {};
    return `
      <button data-dataset-entity="${escapeHtml(row.entity)}" class="shrink-0 min-w-[190px] rounded-xl border ${active ? 'border-arena-gold/40 bg-arena-gold/10 text-arena-text' : 'border-white/10 bg-white/[0.035] text-arena-muted hover:text-arena-text'} px-3 py-2 text-left">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[12px] font-bold">${escapeHtml(row.entity)}</span>
          <span class="chip border border-white/10 bg-white/[0.04]">${formatNumber(row.rowCount)}</span>
        </div>
        <div class="mt-1 text-[10px] uppercase tracking-[0.12em]">${escapeHtml(row.importable ? 'Importable' : row.controlEntity ? 'Control' : 'Read only')}</div>
        <div class="mt-1 text-[11px] truncate">${escapeHtml(last.Uploaded_By || 'No upload')} - ${escapeHtml(formatDateShort(last.Commit_Timestamp || last.Upload_Date))}</div>
      </button>`;
  }

  function datasetPreviewColumns(entity, rows) {
    const schemaColumns = (entity?.schema?.columns || []).map(column => column.name);
    const rowColumns = Object.keys((rows || [])[0] || {});
    const columns = [...new Set([...schemaColumns, ...rowColumns])].filter(Boolean).slice(0, 8);
    return columns.length ? columns : ['No columns'];
  }

  function renderDiffSummary(diff) {
    const d = diff || { added: 0, modified: 0, deleted: 0 };
    return `
      <div class="grid grid-cols-3 gap-2 mt-4">
        ${miniStat('Added', d.added, 'plus')}
        ${miniStat('Modified', d.modified, 'pencil')}
        ${miniStat('Deleted', d.deleted, 'trash-2')}
      </div>`;
  }

  function miniStat(label, value, iconName) {
    return `
      <div class="rounded-lg border border-white/10 bg-white/[0.035] px-2.5 py-2">
        <div class="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.12em] text-arena-muted font-bold">
          ${escapeHtml(label)} ${icon(iconName, 'text-[12px]')}
        </div>
        <div class="font-display font-bold text-lg">${formatNumber(value)}</div>
      </div>`;
  }

  function renderValidationReport(validation) {
    if (!validation) {
      return `<div class="mt-4 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3 text-[12px] text-arena-muted">No pending validation.</div>`;
    }
    if (validation.valid) {
      return `<div class="mt-4 rounded-lg border border-arena-emerald/30 bg-arena-emerald/10 px-3 py-3 text-[12px] text-arena-emerald">Validation passed. Import_ID ${escapeHtml(state.dataset.importLog?.Import_ID || '-')} is ready to commit.</div>`;
    }
    return `
      <div class="mt-4 rounded-lg border border-arena-red/30 bg-arena-red/10 px-3 py-3 text-[12px] text-arena-red">
        ${formatNumber(validation.errors.length)} validation errors
      </div>
      <div class="mt-3">
        ${table(['Row', 'Column', 'Issue'], validation.errors || [], row => [
          row.row == null ? '-' : row.row,
          row.column || '-',
          row.message || '-',
        ])}
      </div>`;
  }

  function historyStatusOptions() {
    const statuses = new Set(['all']);
    for (const row of state.imports || []) statuses.add(row.Status || 'Unknown');
    return Array.from(statuses);
  }

  function filteredDatasetImports() {
    const entity = state.dataset.selectedEntity;
    const status = state.dataset.historyStatus;
    return (state.imports || [])
      .filter(row => !entity || row.Entity_Name === entity)
      .filter(row => status === 'all' || row.Status === status);
  }

  function datasetHistoryTable(rows) {
    const body = (rows || []).map(row => {
      const diff = row.Diff || {};
      const canRevert = canonicalStatus(row) === 'committed' && !row.Reverted_From_Import_ID;
      return `
        <tr>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(row.Import_ID)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(row.Status)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(row.Mode || '-')}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${formatNumber(row.Row_Count)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(row.Uploaded_By || '-')}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(formatDateTime(row.Commit_Timestamp || row.Upload_Date))}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">+${formatNumber(diff.added)} / ~${formatNumber(diff.modified)} / -${formatNumber(diff.deleted)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">
            <button data-action="revert-import" data-import-id="${escapeHtml(row.Import_ID)}" class="btn-secondary text-[11px]" ${canRevert ? '' : 'disabled'}>${icon('rotate-ccw', 'text-[12px]')} Revert</button>
          </td>
        </tr>`;
    }).join('');
    return `
      <div class="overflow-x-auto">
        <table class="w-full min-w-[860px] border-separate border-spacing-0">
          <thead>
            <tr>${['Import_ID', 'Status', 'Mode', 'Rows', 'Owner', 'Timestamp', 'Diff', 'Action'].map(head => `<th class="px-3 py-2 text-left text-[10px] uppercase tracking-[0.14em] text-arena-muted">${escapeHtml(head)}</th>`).join('')}</tr>
          </thead>
          <tbody>${body || `<tr><td colspan="8" class="px-3 py-4 border-t border-white/8 text-[12px] text-arena-muted">No imports for this filter.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  function renderKpis() {
    const rows = (state.kpis || []).slice().sort((a, b) => {
      const activeDelta = Number(isActiveKpi(b)) - Number(isActiveKpi(a));
      if (activeDelta) return activeDelta;
      return String(a.KPI_ID || '').localeCompare(String(b.KPI_ID || ''));
    });
    const active = rows.filter(isActiveKpi).length;
    const retired = Math.max(rows.length - active, 0);
    const visibleAgent = rows.filter(row => roleVisibility(row).Agent).length;
    const visibleTl = rows.filter(row => roleVisibility(row).TL).length;
    const visibleManager = rows.filter(row => roleVisibility(row).Manager).length;
    const pending = rows.filter(row => /pending|queued/i.test(String(row.RAG_Recompute_Status || row.RAG_Recompute_Queue || ''))).length;
    const recompute = state.kpiPublish?.recomputation;
    return `
      <section class="space-y-4">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          ${metricTile({ label: 'KPI catalogue', value: formatNumber(rows.length), sub: `${formatNumber(active)} active / ${formatNumber(retired)} retired`, icon: 'gauge-circle' })}
          ${metricTile({ label: 'Visible by role', value: `${formatNumber(visibleAgent)} / ${formatNumber(visibleTl)} / ${formatNumber(visibleManager)}`, sub: 'Agent / TL / Manager', icon: 'eye' })}
          ${metricTile({ label: 'Dependency links', value: formatNumber(rows.reduce((sum, row) => sum + dependencyCount(row.KPI_ID), 0)), sub: 'Active SLA and mission references', icon: 'git-branch' })}
          ${metricTile({ label: 'RAG queue marker', value: recompute || (pending ? 'Pending' : 'Clear'), sub: pending ? `${formatNumber(pending)} KPI changes pending publish` : 'No unpublished threshold markers', icon: 'refresh-cw' })}
        </div>
        <section class="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_460px] gap-4">
          <div class="glass rounded-xl p-4 overflow-hidden">
            <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <div class="label">KPI_Master</div>
                <div class="font-display font-bold text-lg">KPI catalogue</div>
              </div>
              <div class="flex flex-wrap gap-2">
                <button data-action="add-kpi" class="btn-secondary text-[12px]">${icon('plus', 'text-[13px]')} Add KPI</button>
                <button data-action="publish-kpis" class="btn-primary text-[12px]">${icon('send', 'text-[13px]')} Publish</button>
              </div>
            </div>
            ${recompute ? `<div class="mb-3 rounded-lg border border-emerald-300/25 bg-emerald-400/[0.08] p-3 text-[12px] text-emerald-100">${icon('refresh-cw', 'text-[13px]')} RAG recomputation queued for the next Performance_Data load${state.kpiPublish.timestamp ? ` at ${escapeHtml(formatDateTime(state.kpiPublish.timestamp))}` : ''}.</div>` : ''}
            ${kpiTable(rows)}
          </div>
          ${renderKpiPanel()}
        </section>
        <section class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
          ${renderKpiDependencyPanel(rows)}
          ${auditPanel('KPI audit trail', state.audit)}
        </section>
      </section>`;
  }

  function kpiTable(rows) {
    const body = (rows || []).map(row => {
      const deps = dependencyCount(row.KPI_ID);
      const selected = state.kpiPanel.id === row.KPI_ID;
      const queue = row.RAG_Recompute_Status || row.RAG_Recompute_Queue || '-';
      return `
        <tr class="${selected ? 'bg-white/[0.05]' : ''}">
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top font-semibold">${escapeHtml(row.KPI_ID)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">
            <div class="font-semibold text-arena-text">${escapeHtml(row.KPI_Name)}</div>
            <div class="text-[11px] text-arena-muted">${escapeHtml(row.KPI_Type || '-')}</div>
          </td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(row.Unit || '-')}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(row.Direction || '-')}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(row.Target ?? '-')}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(formatKpiThresholds(row))}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(roleVisibilityLabel(row))}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(kpiWeight(row) || '-')}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">
            <span class="chip border ${isActiveKpi(row) ? 'border-emerald-300/25 bg-emerald-400/[0.08] text-emerald-100' : 'border-rose-300/25 bg-rose-400/[0.08] text-rose-100'}">${escapeHtml(kpiActiveLabel(row))}</span>
          </td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(kpiEffectiveDate(row) || '-')}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${deps ? `<span class="chip border border-amber-300/25 bg-amber-300/[0.08] text-amber-100">${deps}</span>` : '-'}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(queue)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">
            <div class="flex flex-wrap gap-1">
              <button data-action="edit-kpi" data-kpi-id="${escapeHtml(row.KPI_ID)}" class="btn-secondary text-[11px]">${icon('pencil', 'text-[12px]')} Edit</button>
              ${isActiveKpi(row) ? `<button data-action="retire-kpi" data-kpi-id="${escapeHtml(row.KPI_ID)}" class="btn-secondary text-[11px]">${icon('archive', 'text-[12px]')} Retire</button>` : ''}
            </div>
          </td>
        </tr>`;
    }).join('');
    const headers = ['KPI_ID', 'KPI', 'Unit', 'Direction', 'Target', 'Thresholds', 'Roles', 'Weight', 'Active', 'Effective', 'Deps', 'RAG Queue', 'Actions'];
    return `
      <div class="overflow-x-auto">
        <table class="w-full min-w-[1180px] border-separate border-spacing-0">
          <thead>
            <tr>${headers.map(head => `<th class="px-3 py-2 text-left text-[10px] uppercase tracking-[0.14em] text-arena-muted">${escapeHtml(head)}</th>`).join('')}</tr>
          </thead>
          <tbody>${body || `<tr><td colspan="${headers.length}" class="px-3 py-4 border-t border-white/8 text-[12px] text-arena-muted">No KPI definitions.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  function renderKpiPanel() {
    const editing = state.kpiPanel.mode === 'edit' && state.kpiPanel.id;
    const row = editing ? (state.kpis || []).find(kpi => kpi.KPI_ID === state.kpiPanel.id) : null;
    const kpi = row || {
      KPI_ID: '',
      KPI_Name: '',
      KPI_Type: kpiTypes()[0] || 'Sales Conversion',
      Unit: '%',
      Direction: 'Higher',
      Target: '',
      Green_Threshold: '',
      Amber_Threshold: '',
      Red_Threshold: '',
      Weightage: '',
      Applicability: 'All',
      Active: true,
      Status: 'Active',
      Effective_Date: new Date().toISOString().slice(0, 10),
      Description: '',
    };
    const visibility = roleVisibility(kpi);
    const deps = row ? kpiDependenciesFor(row.KPI_ID) : { sla: [], missions: [] };
    const depTotal = deps.sla.length + deps.missions.length;
    return `
      <aside class="glass rounded-xl p-4 overflow-hidden">
        <div class="flex items-start justify-between gap-2 mb-3">
          <div>
            <div class="label">${editing ? 'Edit KPI' : 'Add KPI'}</div>
            <div class="font-display font-bold text-lg">${editing ? escapeHtml(kpi.KPI_Name || kpi.KPI_ID) : 'New KPI definition'}</div>
          </div>
          ${editing ? `<button data-action="add-kpi" class="btn-secondary text-[11px]">${icon('plus', 'text-[12px]')} New</button>` : ''}
        </div>
        <form id="kpi-form" class="space-y-3">
          <div class="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div class="label">KPI_ID</div>
            <div class="font-display font-bold text-base">${editing ? escapeHtml(kpi.KPI_ID) : 'Generated on save'}</div>
            <div class="text-[11px] text-arena-muted mt-1">System-generated and immutable after creation.</div>
          </div>
          ${depTotal ? renderKpiDependencyWarning(kpi, deps) : ''}
          <label class="block">
            <span class="label">KPI_Name</span>
            <input name="KPI_Name" value="${escapeHtml(kpi.KPI_Name || '')}" required class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60" />
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block">
              <span class="label">KPI_Type</span>
              <select name="KPI_Type" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">
                ${kpiTypes().map(type => `<option value="${escapeHtml(type)}" ${type === kpi.KPI_Type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('')}
              </select>
            </label>
            <label class="block">
              <span class="label">Unit</span>
              <input name="Unit" value="${escapeHtml(kpi.Unit || '')}" class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60" />
            </label>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block">
              <span class="label">Direction</span>
              <select name="Direction" data-kpi-preview-field class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">
                ${['Higher', 'Lower'].map(direction => `<option value="${direction}" ${String(kpi.Direction || 'Higher') === direction ? 'selected' : ''}>${direction}</option>`).join('')}
              </select>
            </label>
            <label class="block">
              <span class="label">Weight</span>
              <input name="Weightage" type="number" step="0.01" min="0" value="${escapeHtml(kpiWeight(kpi) || '')}" class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60" />
            </label>
          </div>
          <div class="grid grid-cols-2 gap-3">
            ${['Target', 'Green_Threshold', 'Amber_Threshold', 'Red_Threshold'].map(name => `
              <label class="block">
                <span class="label">${escapeHtml(name.replace(/_/g, ' '))}</span>
                <input name="${name}" data-kpi-preview-field type="number" step="any" value="${escapeHtml(kpiField(kpi, name, ''))}" class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60" />
              </label>`).join('')}
          </div>
          <div id="kpi-rag-preview">${renderKpiRagPreview(kpi)}</div>
          <div class="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <div class="label mb-2">Role visibility</div>
            <div class="grid grid-cols-3 gap-2">
              ${['Agent', 'TL', 'Manager'].map(role => `
                <label class="flex items-center justify-between gap-2 rounded-lg border border-white/10 px-2 py-2 text-[12px]">
                  <span>${escapeHtml(role)}</span>
                  <input type="checkbox" name="Visible_${role}" ${visibility[role] ? 'checked' : ''} />
                </label>`).join('')}
            </div>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block">
              <span class="label">Effective date</span>
              <input name="Effective_Date" type="date" value="${escapeHtml(kpiEffectiveDate(kpi) || '')}" class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60" />
            </label>
            <label class="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 mt-5 text-[12px]">
              <span>Active status</span>
              <input type="checkbox" name="Active" ${isActiveKpi(kpi) ? 'checked' : ''} />
            </label>
          </div>
          <label class="block">
            <span class="label">Description</span>
            <textarea name="Description" rows="3" class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">${escapeHtml(kpi.Description || '')}</textarea>
          </label>
          <div class="flex flex-wrap justify-between gap-2 pt-1">
            <button type="submit" class="btn-primary text-[12px]">${icon('save', 'text-[13px]')} ${editing ? 'Save changes' : 'Create KPI'}</button>
            <div class="flex gap-2">
              ${editing && isActiveKpi(kpi) ? `<button type="button" data-action="retire-kpi" data-kpi-id="${escapeHtml(kpi.KPI_ID)}" class="btn-secondary text-[12px]">${icon('archive', 'text-[13px]')} Retire</button>` : ''}
              <button type="button" data-action="add-kpi" class="btn-secondary text-[12px]">${icon('x', 'text-[13px]')} Clear</button>
            </div>
          </div>
        </form>
      </aside>`;
  }

  function renderKpiDependencyWarning(kpi, deps) {
    return `
      <div class="rounded-lg border border-amber-300/25 bg-amber-300/[0.08] p-3 text-[12px] text-amber-100">
        <div class="font-semibold mb-1">${icon('triangle-alert', 'text-[13px]')} Dependency warning</div>
        <div>${escapeHtml(kpi.KPI_ID)} is linked to ${formatNumber(deps.sla.length)} active SLA rule(s) and ${formatNumber(deps.missions.length)} active mission(s). Retire or visibility changes may remove it from active scorecards, leaderboards, SLA views, and missions after publish.</div>
      </div>`;
  }

  function renderKpiDependencyPanel(rows) {
    const linked = (rows || []).map(row => ({ row, deps: kpiDependenciesFor(row.KPI_ID) }))
      .filter(item => item.deps.sla.length || item.deps.missions.length);
    const body = linked.map(item => `
      <tr>
        <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(item.row.KPI_ID)}</td>
        <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(item.row.KPI_Name)}</td>
        <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${formatNumber(item.deps.sla.length)}</td>
        <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${formatNumber(item.deps.missions.length)}</td>
      </tr>`).join('');
    return `
      <div class="glass rounded-xl p-4 overflow-hidden">
        <div class="label">Dependency warnings</div>
        <div class="font-display font-bold text-lg mb-3">SLA and mission links</div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[560px] border-separate border-spacing-0">
            <thead>
              <tr>${['KPI_ID', 'KPI', 'SLA rules', 'Missions'].map(head => `<th class="px-3 py-2 text-left text-[10px] uppercase tracking-[0.14em] text-arena-muted">${escapeHtml(head)}</th>`).join('')}</tr>
            </thead>
            <tbody>${body || `<tr><td colspan="4" class="px-3 py-4 border-t border-white/8 text-[12px] text-arena-muted">No active SLA or mission dependencies for the current KPI catalogue.</td></tr>`}</tbody>
          </table>
        </div>
      </div>`;
  }

  function renderGamification() {
    const g = state.gamification || {};
    const missions = g.Missions || [];
    const challenges = g.Challenges || [];
    const badges = g.Badges || [];
    const rewards = g.Rewards || [];
    const rules = g.Learning_Points_Rules || [];
    const redemptions = g.Reward_Redemptions || [];
    const activeMissionCount = missions.filter(isActiveGamificationRecord).length;
    const activeChallengeCount = challenges.filter(isActiveGamificationRecord).length;
    const pending = redemptions.filter(isPendingRedemption);
    const stock = rewards.reduce((sum, row) => sum + toNumber(row.Stock, 0), 0);
    const pointsMtd = ledgerAwardedMtd(g.Points_Ledger || [], 'Points_Delta');
    const xpMtd = ledgerAwardedMtd(g.XP_Ledger || [], 'XP_Delta');
    return `
      <section class="space-y-4">
        <div class="grid grid-cols-2 xl:grid-cols-6 gap-3">
          ${metricTile({ label: 'Active missions', value: formatNumber(activeMissionCount), sub: `${formatNumber(missions.length)} configured`, icon: 'flag' })}
          ${metricTile({ label: 'Active challenges', value: formatNumber(activeChallengeCount), sub: `${formatNumber(challenges.length)} configured`, icon: 'swords' })}
          ${metricTile({ label: 'Badges', value: formatNumber(badges.length), sub: 'Catalogue size', icon: 'award' })}
          ${metricTile({ label: 'Reward stock', value: formatNumber(stock), sub: `${formatNumber(rewards.length)} rewards`, icon: 'gift' })}
          ${metricTile({ label: 'Points MTD', value: formatNumber(pointsMtd), sub: 'Awarded from ledger', icon: 'coins' })}
          ${metricTile({ label: 'XP MTD', value: formatNumber(xpMtd), sub: `${formatNumber(pending.length)} approvals pending`, icon: 'sparkles' })}
        </div>
        ${renderGamificationTabs()}
        <section class="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_460px] gap-4">
          ${renderGamificationCatalogue()}
          ${renderGamificationPanel()}
        </section>
        <section class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
          ${renderRewardApprovalQueue(pending)}
          ${renderPointsEconomicsSummary(rules, rewards)}
        </section>
      </section>`;
  }

  function renderGamificationTabs() {
    const tab = activeGamificationTab();
    return `
      <div class="glass rounded-xl p-2 overflow-x-auto">
        <div class="flex min-w-max gap-2">
          ${GAMIFICATION_TABS.map(item => `
            <button data-action="set-gamification-tab" data-gamification-tab="${escapeHtml(item.id)}" class="${item.id === tab.id ? 'btn-primary' : 'btn-secondary'} text-[12px]">
              ${icon(item.icon, 'text-[13px]')} ${escapeHtml(item.label)}
            </button>`).join('')}
        </div>
      </div>`;
  }

  function renderGamificationCatalogue() {
    const tab = activeGamificationTab();
    const rows = gamificationRows(tab.id).slice().sort((a, b) => {
      const activeDelta = Number(isActiveGamificationRecord(b)) - Number(isActiveGamificationRecord(a));
      if (activeDelta) return activeDelta;
      return String(gamificationRecordName(tab, a)).localeCompare(String(gamificationRecordName(tab, b)));
    });
    return `
      <div class="glass rounded-xl p-4 overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <div class="label">${escapeHtml(tab.entity)}</div>
            <div class="font-display font-bold text-lg">${escapeHtml(tab.label)}</div>
          </div>
          <button data-action="add-gamification" data-gamification-entity="${escapeHtml(tab.id)}" class="btn-secondary text-[12px]">${icon('plus', 'text-[13px]')} Add</button>
        </div>
        ${gamificationCatalogueTable(tab, rows)}
      </div>`;
  }

  function gamificationCatalogueTable(tab, rows) {
    if (tab.id === 'missions') return missionCatalogueTable(tab, rows);
    if (tab.id === 'challenges') return challengeCatalogueTable(tab, rows);
    if (tab.id === 'badges') return badgeCatalogueTable(tab, rows);
    if (tab.id === 'rewards') return rewardCatalogueTable(tab, rows);
    return pointsRulesCatalogueTable(tab, rows);
  }

  function missionCatalogueTable(tab, rows) {
    const headers = ['ID', 'Mission', 'Audience', 'KPI', 'Reward', 'Window', 'Assignments', 'Status', 'Actions'];
    const body = rows.map(row => {
      const id = gamificationRecordId(tab, row);
      return `
        <tr class="${state.gamificationUi.panel.id === id ? 'bg-white/[0.05]' : ''}">
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top font-semibold">${escapeHtml(row.Mission_ID)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">
            <div class="font-semibold text-arena-text">${escapeHtml(row.Mission_Name)}</div>
            <div class="text-[11px] text-arena-muted">${escapeHtml(row.Mission_Type || '-')}</div>
          </td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(audienceLabel(row))}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(kpiName(row.KPI_ID))}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${formatNumber(row.Reward_Points || 0)} pts / ${formatNumber(row.XP_Reward || 0)} XP</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(dateRangeLabel(row.Start_Date, row.End_Date))}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${formatNumber(missionAssignmentCount(row.Mission_ID))}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${statusChip(row)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${gamificationActionButtons(tab, row)}</td>
        </tr>`;
    }).join('');
    return gamificationTable(headers, body);
  }

  function challengeCatalogueTable(tab, rows) {
    const headers = ['ID', 'Challenge', 'Audience', 'KPI', 'Entry', 'Pool', 'Participants', 'Status', 'Actions'];
    const body = rows.map(row => {
      const id = gamificationRecordId(tab, row);
      return `
        <tr class="${state.gamificationUi.panel.id === id ? 'bg-white/[0.05]' : ''}">
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top font-semibold">${escapeHtml(row.Challenge_ID)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">
            <div class="font-semibold text-arena-text">${escapeHtml(row.Challenge_Name)}</div>
            <div class="text-[11px] text-arena-muted">${escapeHtml(row.Challenge_Type || '-')}</div>
          </td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(audienceLabel(row))}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(kpiName(row.KPI_ID))}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${formatNumber(row.Entry_Points || 0)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${formatNumber(row.Reward_Pool || 0)} pts / ${formatNumber(row.XP_Reward || 0)} XP</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${formatNumber(challengeParticipantCount(row.Challenge_ID))}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${statusChip(row)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${gamificationActionButtons(tab, row)}</td>
        </tr>`;
    }).join('');
    return gamificationTable(headers, body);
  }

  function badgeCatalogueTable(tab, rows) {
    const headers = ['ID', 'Badge', 'Tier', 'Criteria', 'Bonus', 'Earned', 'Status', 'Actions'];
    const body = rows.map(row => {
      const id = gamificationRecordId(tab, row);
      return `
        <tr class="${state.gamificationUi.panel.id === id ? 'bg-white/[0.05]' : ''}">
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top font-semibold">${escapeHtml(row.Badge_ID)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">
            <div class="font-semibold text-arena-text">${escapeHtml(row.Badge_Name)}</div>
            <div class="text-[11px] text-arena-muted">${escapeHtml(row.Badge_Category || '-')}</div>
          </td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(row.Tier || '-')}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(row.Criteria || '-')}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${formatNumber(row.Points_Bonus || 0)} pts / ${formatNumber(row.XP_Bonus || 0)} XP</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${formatNumber(agentBadgeCount(row.Badge_ID))}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${statusChip(row)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${gamificationActionButtons(tab, row)}</td>
        </tr>`;
    }).join('');
    return gamificationTable(headers, body);
  }

  function rewardCatalogueTable(tab, rows) {
    const headers = ['ID', 'Reward', 'Category', 'Points', 'Stock', 'Approval', 'Status', 'Actions'];
    const body = rows.map(row => {
      const id = gamificationRecordId(tab, row);
      return `
        <tr class="${state.gamificationUi.panel.id === id ? 'bg-white/[0.05]' : ''}">
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top font-semibold">${escapeHtml(row.Reward_ID)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">
            <div class="font-semibold text-arena-text">${escapeHtml(row.Reward_Name)}</div>
            <div class="text-[11px] text-arena-muted">${escapeHtml(row.Tier || '-')}</div>
          </td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(row.Category || '-')}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${formatNumber(row.Points_Required || 0)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${stockChip(row.Stock)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(yesNo(row.Approval_Required))}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${statusChip(row)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${gamificationActionButtons(tab, row)}</td>
        </tr>`;
    }).join('');
    return gamificationTable(headers, body);
  }

  function pointsRulesCatalogueTable(tab, rows) {
    const headers = ['Activity', 'Module', 'Points', 'XP', 'Badge', 'Status', 'Actions'];
    const body = rows.map(row => {
      const id = gamificationRecordId(tab, row);
      return `
        <tr class="${state.gamificationUi.panel.id === id ? 'bg-white/[0.05]' : ''}">
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top font-semibold">${escapeHtml(row.Activity)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(row.Module_Type || '-')}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${formatNumber(row.Arena_Points || 0)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${formatNumber(row.XP || 0)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(row.Badge_Eligibility || '-')}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${statusChip(row)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${gamificationActionButtons(tab, row)}</td>
        </tr>`;
    }).join('');
    return gamificationTable(headers, body);
  }

  function gamificationTable(headers, body) {
    return `
      <div class="overflow-x-auto">
        <table class="w-full min-w-[980px] border-separate border-spacing-0">
          <thead>
            <tr>${headers.map(head => `<th class="px-3 py-2 text-left text-[10px] uppercase tracking-[0.14em] text-arena-muted">${escapeHtml(head)}</th>`).join('')}</tr>
          </thead>
          <tbody>${body || `<tr><td colspan="${headers.length}" class="px-3 py-4 border-t border-white/8 text-[12px] text-arena-muted">No records.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  function gamificationActionButtons(tab, row) {
    const id = gamificationRecordId(tab, row);
    return `
      <div class="flex flex-wrap gap-1">
        <button data-action="edit-gamification" data-gamification-entity="${escapeHtml(tab.id)}" data-record-id="${escapeHtml(id)}" class="btn-secondary text-[11px]">${icon('pencil', 'text-[12px]')} Edit</button>
        ${isActiveGamificationRecord(row) ? `<button data-action="deactivate-gamification" data-gamification-entity="${escapeHtml(tab.id)}" data-record-id="${escapeHtml(id)}" class="btn-secondary text-[11px]">${icon('archive', 'text-[12px]')} Deactivate</button>` : ''}
      </div>`;
  }

  function renderGamificationPanel() {
    const tab = activeGamificationTab();
    const panel = state.gamificationUi.panel || {};
    const editing = panel.entity === tab.id && panel.mode === 'edit' && panel.id;
    const row = editing ? gamificationRows(tab.id).find(item => gamificationRecordId(tab, item) === panel.id) : null;
    const record = row || defaultGamificationRecord(tab);
    return `
      <aside class="glass rounded-xl p-4 overflow-hidden">
        <div class="flex items-start justify-between gap-2 mb-3">
          <div>
            <div class="label">${editing ? `Edit ${tab.label}` : `Add ${tab.label}`}</div>
            <div class="font-display font-bold text-lg">${escapeHtml(editing ? gamificationRecordName(tab, record) : `New ${tab.label}`)}</div>
          </div>
          ${editing ? `<button data-action="add-gamification" data-gamification-entity="${escapeHtml(tab.id)}" class="btn-secondary text-[11px]">${icon('plus', 'text-[12px]')} New</button>` : ''}
        </div>
        <form id="gamification-form" data-gamification-entity="${escapeHtml(tab.id)}" class="space-y-3">
          ${gamificationFormBody(tab, record, Boolean(editing))}
          <div class="flex flex-wrap justify-between gap-2 pt-1">
            <button type="submit" class="btn-primary text-[12px]">${icon('save', 'text-[13px]')} ${editing ? 'Save changes' : 'Create'}</button>
            <div class="flex gap-2">
              ${editing && isActiveGamificationRecord(record) ? `<button type="button" data-action="deactivate-gamification" data-gamification-entity="${escapeHtml(tab.id)}" data-record-id="${escapeHtml(gamificationRecordId(tab, record))}" class="btn-secondary text-[12px]">${icon('archive', 'text-[13px]')} Deactivate</button>` : ''}
              <button type="button" data-action="add-gamification" data-gamification-entity="${escapeHtml(tab.id)}" class="btn-secondary text-[12px]">${icon('x', 'text-[13px]')} Clear</button>
            </div>
          </div>
        </form>
      </aside>`;
  }

  function gamificationFormBody(tab, record, editing) {
    if (tab.id === 'missions') return missionForm(record, editing);
    if (tab.id === 'challenges') return challengeForm(record, editing);
    if (tab.id === 'badges') return badgeForm(record, editing);
    if (tab.id === 'rewards') return rewardForm(record, editing);
    return pointsRuleForm(record, editing);
  }

  function missionForm(row, editing) {
    return `
      ${idPanel('Mission_ID', row.Mission_ID, editing)}
      ${textInput('Mission_Name', row.Mission_Name, true)}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${textInput('Mission_Type', row.Mission_Type)}
        ${kpiSelect(row.KPI_ID)}
      </div>
      ${audienceTargetingFields(row)}
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        ${numberInput('Target_Value', row.Target_Value)}
        ${numberInput('Reward_Points', row.Reward_Points)}
        ${numberInput('XP_Reward', row.XP_Reward)}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${badgeSelect(row.Badge_ID)}
        ${textInput('Linked_Module_ID', row.Linked_Module_ID)}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${dateInput('Start_Date', row.Start_Date)}
        ${dateInput('End_Date', row.End_Date)}
      </div>
      ${textArea('Description', row.Description)}
      ${activeToggle(row, 'Mission status')}`;
  }

  function challengeForm(row, editing) {
    return `
      ${idPanel('Challenge_ID', row.Challenge_ID, editing)}
      ${textInput('Challenge_Name', row.Challenge_Name, true)}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${textInput('Challenge_Type', row.Challenge_Type)}
        ${kpiSelect(row.KPI_ID)}
      </div>
      ${audienceTargetingFields(row)}
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        ${numberInput('Entry_Points', row.Entry_Points)}
        ${numberInput('Reward_Pool', row.Reward_Pool)}
        ${numberInput('XP_Reward', row.XP_Reward)}
        ${numberInput('Min_Volume', row.Min_Volume)}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${dateInput('Start_Date', row.Start_Date)}
        ${dateInput('End_Date', row.End_Date)}
      </div>
      ${textArea('Description', row.Description)}
      ${activeToggle(row, 'Challenge status')}`;
  }

  function badgeForm(row, editing) {
    return `
      ${idPanel('Badge_ID', row.Badge_ID, editing)}
      ${textInput('Badge_Name', row.Badge_Name, true)}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${textInput('Badge_Category', row.Badge_Category)}
        ${textInput('Tier', row.Tier)}
      </div>
      ${textInput('Icon', row.Icon)}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${numberInput('Points_Bonus', row.Points_Bonus)}
        ${numberInput('XP_Bonus', row.XP_Bonus)}
      </div>
      ${textArea('Criteria', row.Criteria, true)}
      ${activeToggle(row, 'Badge status')}`;
  }

  function rewardForm(row, editing) {
    return `
      ${idPanel('Reward_ID', row.Reward_ID, editing)}
      ${textInput('Reward_Name', row.Reward_Name, true)}
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${textInput('Category', row.Category)}
        ${textInput('Tier', row.Tier)}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${numberInput('Points_Required', row.Points_Required)}
        ${numberInput('Stock', row.Stock)}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${selectInput('Approval_Required', yesNo(row.Approval_Required), ['Yes', 'No'])}
        ${dateInput('Expiry_Date', row.Expiry_Date)}
      </div>
      ${textInput('Icon', row.Icon)}
      ${textArea('Description', row.Description)}
      ${textArea('Eligibility_Rule', row.Eligibility_Rule)}
      ${activeToggle(row, 'Reward status')}`;
  }

  function pointsRuleForm(row, editing) {
    return `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${textInput('Activity', row.Activity, true, editing)}
        ${textInput('Module_Type', row.Module_Type, true, editing)}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${numberInput('Arena_Points', row.Arena_Points)}
        ${numberInput('XP', row.XP)}
      </div>
      ${textInput('Badge_Eligibility', row.Badge_Eligibility)}
      ${textArea('Rule_Description', row.Rule_Description)}
      ${activeToggle(row, 'Rule status')}`;
  }

  function renderRewardApprovalQueue(pending) {
    const rows = (pending || []).map(row => {
      const reward = rewardById(row.Reward_ID);
      const stock = reward ? reward.Stock : null;
      return `
        <tr>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top font-semibold">${escapeHtml(row.Redemption_ID)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(userName(row.UserID))}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(reward?.Reward_Name || row.Reward_ID)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${formatNumber(row.Points_Spent || reward?.Points_Required || 0)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${stockChip(stock)}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(row.Fulfilment_Owner || '-')}</td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">
            <div class="flex flex-wrap gap-1">
              <button data-action="approve-redemption" data-redemption-id="${escapeHtml(row.Redemption_ID)}" class="btn-secondary text-[11px]" ${toNumber(stock, 0) <= 0 ? 'disabled' : ''}>${icon('check', 'text-[12px]')} Approve</button>
              <button data-action="reject-redemption" data-redemption-id="${escapeHtml(row.Redemption_ID)}" class="btn-secondary text-[11px]">${icon('x', 'text-[12px]')} Reject</button>
            </div>
          </td>
        </tr>`;
    }).join('');
    return `
      <div class="glass rounded-xl p-4 overflow-hidden">
        <div class="label">Reward_Redemptions</div>
        <div class="font-display font-bold text-lg mb-3">Approval queue</div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[760px] border-separate border-spacing-0">
            <thead>
              <tr>${['Redemption', 'User', 'Reward', 'Points', 'Stock', 'Owner', 'Actions'].map(head => `<th class="px-3 py-2 text-left text-[10px] uppercase tracking-[0.14em] text-arena-muted">${escapeHtml(head)}</th>`).join('')}</tr>
            </thead>
            <tbody>${rows || `<tr><td colspan="7" class="px-3 py-4 border-t border-white/8 text-[12px] text-arena-muted">No pending redemptions.</td></tr>`}</tbody>
          </table>
        </div>
      </div>`;
  }

  function renderPointsEconomicsSummary(rules, rewards) {
    const activeRules = (rules || []).filter(isActiveGamificationRecord);
    const avgPoints = activeRules.length ? Math.round(activeRules.reduce((sum, row) => sum + toNumber(row.Arena_Points, 0), 0) / activeRules.length) : 0;
    const avgXp = activeRules.length ? Math.round(activeRules.reduce((sum, row) => sum + toNumber(row.XP, 0), 0) / activeRules.length) : 0;
    const lowStock = (rewards || []).filter(row => isActiveGamificationRecord(row) && toNumber(row.Stock, 0) <= 5).length;
    return `
      <div class="glass rounded-xl p-4">
        <div class="label">Economy</div>
        <div class="font-display font-bold text-lg mb-3">Points and XP rules</div>
        <div class="grid grid-cols-2 gap-2">
          ${summaryCell('Active rules', formatNumber(activeRules.length))}
          ${summaryCell('Low stock', formatNumber(lowStock))}
          ${summaryCell('Avg points', formatNumber(avgPoints))}
          ${summaryCell('Avg XP', formatNumber(avgXp))}
        </div>
        <div class="mt-3 rounded-lg border border-white/10 bg-white/[0.03] p-3 text-[12px] text-arena-muted">
          Ledger balances are retained when rules change; new award amounts apply to future activities.
        </div>
      </div>`;
  }

  function activeGamificationTab() {
    const id = state.gamificationUi?.tab || 'missions';
    return GAMIFICATION_TABS.find(tab => tab.id === id) || GAMIFICATION_TABS[0];
  }

  function gamificationTabById(id) {
    return GAMIFICATION_TABS.find(tab => tab.id === id) || GAMIFICATION_TABS[0];
  }

  function gamificationRows(tabId) {
    const tab = gamificationTabById(tabId);
    const g = state.gamification || {};
    return Array.isArray(g[tab.entity]) ? g[tab.entity] : [];
  }

  function gamificationRecordId(tab, row) {
    if (!row) return '';
    if (tab.key) return String(row[tab.key] || '');
    return `${row.Activity || ''}|${row.Module_Type || ''}`;
  }

  function gamificationRecordName(tab, row) {
    if (!row) return '';
    return row[tab.name] || gamificationRecordId(tab, row);
  }

  function isActiveGamificationRecord(row) {
    const status = canonicalStatus(row);
    return row && row.Active !== false && row.Is_Active !== false && row.is_active !== false
      && !['inactive', 'deactivated', 'retired', 'closed', 'complete', 'completed', 'cancelled', 'canceled'].includes(status);
  }

  function ledgerAwardedMtd(rows, field) {
    const normalized = (rows || []).map(row => ({
      row,
      timestamp: normalizeTimestamp(row.Timestamp || row.Date || row.created_at),
    })).filter(item => item.timestamp);
    if (!normalized.length) return 0;
    const month = normalized.map(item => item.timestamp.slice(0, 7)).sort().at(-1);
    return normalized
      .filter(item => item.timestamp.slice(0, 7) === month)
      .reduce((sum, item) => {
        const value = toNumber(item.row[field], 0);
        return value > 0 ? sum + value : sum;
      }, 0);
  }

  function missionAssignmentCount(missionId) {
    return ((state.gamification || {}).Mission_Assignments || []).filter(row => row.Mission_ID === missionId).length;
  }

  function activeMissionAssignmentCount(missionId) {
    return ((state.gamification || {}).Mission_Assignments || []).filter(row => {
      return row.Mission_ID === missionId && ['active', 'behind', 'in progress', 'pending'].includes(canonicalStatus(row));
    }).length;
  }

  function challengeParticipantCount(challengeId) {
    return ((state.gamification || {}).Challenge_Participants || []).filter(row => row.Challenge_ID === challengeId).length;
  }

  function activeChallengeParticipantCount(challengeId) {
    return ((state.gamification || {}).Challenge_Participants || []).filter(row => {
      return row.Challenge_ID === challengeId && ['accepted', 'pending', 'active', 'in progress'].includes(canonicalStatus(row));
    }).length;
  }

  function agentBadgeCount(badgeId) {
    return ((state.gamification || {}).Agent_Badges || []).filter(row => row.Badge_ID === badgeId).length;
  }

  function rewardById(rewardId) {
    return ((state.gamification || {}).Rewards || []).find(row => row.Reward_ID === rewardId) || null;
  }

  function kpiName(kpiId) {
    const kpi = (state.kpis || []).find(row => row.KPI_ID === kpiId);
    return kpi ? `${kpi.KPI_ID} - ${kpi.KPI_Name}` : (kpiId || '-');
  }

  function userName(userId) {
    const user = userById(userId);
    return user ? `${user.Name} (${user.UserID})` : (userId || '-');
  }

  function dateRangeLabel(start, end) {
    return `${formatDateShort(start)} - ${formatDateShort(end)}`;
  }

  function yesNo(value) {
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    const text = String(value == null ? '' : value).trim().toLowerCase();
    if (['yes', 'true', '1', 'y'].includes(text)) return 'Yes';
    if (['no', 'false', '0', 'n'].includes(text)) return 'No';
    return value ? String(value) : 'No';
  }

  function statusChip(row) {
    const active = isActiveGamificationRecord(row);
    const label = row?.Status || (active ? 'Active' : 'Inactive');
    const cls = active
      ? 'border-emerald-300/25 bg-emerald-400/[0.08] text-emerald-100'
      : 'border-rose-300/25 bg-rose-400/[0.08] text-rose-100';
    return `<span class="chip border ${cls}">${escapeHtml(label)}</span>`;
  }

  function stockChip(stock) {
    const value = toNumber(stock, 0);
    const cls = value <= 0
      ? 'border-rose-300/25 bg-rose-400/[0.08] text-rose-100'
      : value <= 5
        ? 'border-amber-300/25 bg-amber-300/[0.08] text-amber-100'
        : 'border-emerald-300/25 bg-emerald-400/[0.08] text-emerald-100';
    return `<span class="chip border ${cls}">${formatNumber(value)}</span>`;
  }

  function summaryCell(label, value) {
    return `
      <div class="rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <div class="label">${escapeHtml(label)}</div>
        <div class="font-display font-bold text-lg mt-1">${escapeHtml(value)}</div>
      </div>`;
  }

  function idPanel(label, value, editing) {
    return `
      <div class="rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <div class="label">${escapeHtml(label)}</div>
        <div class="font-display font-bold text-base">${editing ? escapeHtml(value || '-') : 'Generated on save'}</div>
      </div>`;
  }

  function textInput(name, value, required = false, readonly = false) {
    return `
      <label class="block">
        <span class="label">${escapeHtml(name.replace(/_/g, ' '))}</span>
        <input name="${escapeHtml(name)}" value="${escapeHtml(value || '')}" ${required ? 'required' : ''} ${readonly ? 'readonly' : ''} class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60 ${readonly ? 'opacity-70' : ''}" />
      </label>`;
  }

  function numberInput(name, value) {
    return `
      <label class="block">
        <span class="label">${escapeHtml(name.replace(/_/g, ' '))}</span>
        <input name="${escapeHtml(name)}" type="number" step="any" value="${escapeHtml(value == null ? '' : value)}" class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60" />
      </label>`;
  }

  function dateInput(name, value) {
    return `
      <label class="block">
        <span class="label">${escapeHtml(name.replace(/_/g, ' '))}</span>
        <input name="${escapeHtml(name)}" type="date" value="${escapeHtml(dateValue(value))}" class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60" />
      </label>`;
  }

  function dateValue(value) {
    if (!value) return '';
    return String(value).slice(0, 10);
  }

  function selectInput(name, value, options) {
    return `
      <label class="block">
        <span class="label">${escapeHtml(name.replace(/_/g, ' '))}</span>
        <select name="${escapeHtml(name)}" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">
          ${(options || []).map(option => `<option value="${escapeHtml(option)}" ${String(value || '') === String(option) ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}
        </select>
      </label>`;
  }

  function textArea(name, value, required = false) {
    return `
      <label class="block">
        <span class="label">${escapeHtml(name.replace(/_/g, ' '))}</span>
        <textarea name="${escapeHtml(name)}" rows="3" ${required ? 'required' : ''} class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">${escapeHtml(value || '')}</textarea>
      </label>`;
  }

  function kpiSelect(value) {
    const options = (state.kpis || []).filter(isActiveKpi);
    return `
      <label class="block">
        <span class="label">KPI</span>
        <select name="KPI_ID" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">
          <option value="">None</option>
          ${options.map(kpi => `<option value="${escapeHtml(kpi.KPI_ID)}" ${kpi.KPI_ID === value ? 'selected' : ''}>${escapeHtml(kpi.KPI_ID)} - ${escapeHtml(kpi.KPI_Name || '')}</option>`).join('')}
        </select>
      </label>`;
  }

  function badgeSelect(value) {
    const options = ((state.gamification || {}).Badges || []).filter(isActiveGamificationRecord);
    return `
      <label class="block">
        <span class="label">Badge</span>
        <select name="Badge_ID" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">
          <option value="">None</option>
          ${options.map(badge => `<option value="${escapeHtml(badge.Badge_ID)}" ${badge.Badge_ID === value ? 'selected' : ''}>${escapeHtml(badge.Badge_ID)} - ${escapeHtml(badge.Badge_Name || '')}</option>`).join('')}
        </select>
      </label>`;
  }

  function activeToggle(row, label) {
    return `
      <label class="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px]">
        <span>${escapeHtml(label)}</span>
        <input type="checkbox" name="Active" ${isActiveGamificationRecord(row) ? 'checked' : ''} />
      </label>`;
  }

  function audienceTargetingFields(row) {
    const selected = selectedAudience(row);
    const targetCount = targetedAudienceUsers(selected.roles, selected.teamIds, selected.processIds).length;
    return `
      <div class="rounded-lg border border-white/10 bg-white/[0.03] p-3">
        <div class="flex items-center justify-between gap-2 mb-2">
          <div class="label">Audience targeting</div>
          <span class="chip border border-white/10 bg-white/[0.04]">${formatNumber(targetCount)} users</span>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          ${multiSelect('Audience_Roles', 'Roles', roleOptions(), selected.roles)}
          ${multiSelect('Audience_Team_IDs', 'Teams', activeTeams().map(team => ({ value: team.TeamID, label: `${team.TeamID} - ${team.TeamName}` })), selected.teamIds)}
          ${multiSelect('Audience_Process_IDs', 'Processes', (state.processes || []).map(process => ({ value: process.ProcessID, label: `${process.ProcessID} - ${process.ProcessName || process.ProcessID}` })), selected.processIds)}
        </div>
      </div>`;
  }

  function multiSelect(name, label, options, selected) {
    const values = new Set(selected || []);
    return `
      <label class="block">
        <span class="label">${escapeHtml(label)}</span>
        <select name="${escapeHtml(name)}" multiple size="4" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">
          ${(options || []).map(option => `<option value="${escapeHtml(option.value)}" ${values.has(option.value) ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('')}
        </select>
      </label>`;
  }

  function roleOptions() {
    const found = Array.from(new Set((state.users || []).map(user => roleLabel(user.Role)).filter(Boolean)));
    return ['Agent', 'Team Lead', 'Manager']
      .concat(found.filter(role => !['Agent', 'Team Lead', 'Manager', 'Admin'].includes(role)))
      .map(role => ({ value: role, label: role }));
  }

  function selectedAudience(row) {
    const roles = toArray(row.Audience_Roles || row.Role_Targeting || row.Roles);
    const teamIds = toArray(row.Audience_Team_IDs || row.Team_Targeting || row.TeamIDs);
    const processIds = toArray(row.Audience_Process_IDs || row.Process_Targeting || row.ProcessIDs);
    if (row.Audience_Type === 'Role' && row.Audience_ID && !roles.length) roles.push(roleLabel(row.Audience_ID));
    if (row.Audience_Type === 'Team' && row.Audience_ID && !teamIds.length) teamIds.push(row.Audience_ID);
    if (row.Audience_Type === 'Process' && row.Audience_ID && !processIds.length) processIds.push(row.Audience_ID);
    return { roles, teamIds, processIds };
  }

  function toArray(value) {
    if (Array.isArray(value)) return value.map(item => String(item)).filter(Boolean);
    if (value == null || value === '') return [];
    if (typeof value === 'string' && /^[\[{]/.test(value.trim())) {
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed)) return parsed.map(item => String(item)).filter(Boolean);
      } catch (error) {
        return [];
      }
    }
    return String(value).split(/[;,|]/).map(item => item.trim()).filter(Boolean);
  }

  function targetedAudienceUsers(roles, teamIds, processIds) {
    let rows = activeUsers();
    const roleSet = new Set((roles || []).map(roleLabel));
    const teamSet = new Set(teamIds || []);
    const processSet = new Set(processIds || []);
    if (roleSet.size) rows = rows.filter(user => roleSet.has(roleLabel(user.Role)));
    if (teamSet.size) rows = rows.filter(user => teamSet.has(user.TeamID));
    if (processSet.size) rows = rows.filter(user => processSet.has(user.ProcessID));
    return rows;
  }

  function audienceLabel(row) {
    const selected = selectedAudience(row);
    const count = targetedAudienceUsers(selected.roles, selected.teamIds, selected.processIds).length;
    if (selected.roles.length || selected.teamIds.length || selected.processIds.length) {
      const parts = [];
      if (selected.roles.length) parts.push(`${selected.roles.length} role`);
      if (selected.teamIds.length) parts.push(`${selected.teamIds.length} team`);
      if (selected.processIds.length) parts.push(`${selected.processIds.length} process`);
      return `${parts.join(' / ')} - ${formatNumber(count)} users`;
    }
    if (row.Audience_Type === 'Team') return `${teamById(row.Audience_ID)?.TeamName || row.Audience_ID} - ${formatNumber(count)} users`;
    if (row.Audience_Type === 'Process') return `${processById(row.Audience_ID)?.ProcessName || row.Audience_ID} - ${formatNumber(count)} users`;
    if (row.Audience_Type === 'Role') return `Role - ${formatNumber(count)} users`;
    return `All active users - ${formatNumber(count)} users`;
  }

  function defaultGamificationRecord(tab) {
    const today = new Date().toISOString().slice(0, 10);
    if (tab.id === 'missions') {
      return { Mission_Name: '', Mission_Type: 'Quality Shield', KPI_ID: '', Target_Value: '', Reward_Points: 0, XP_Reward: 0, Badge_ID: '', Start_Date: today, End_Date: today, Status: 'Active', Active: true, Description: '' };
    }
    if (tab.id === 'challenges') {
      return { Challenge_Name: '', Challenge_Type: 'Team', KPI_ID: '', Entry_Points: 0, Reward_Pool: 0, XP_Reward: 0, Min_Volume: 0, Start_Date: today, End_Date: today, Status: 'Active', Active: true, Description: '' };
    }
    if (tab.id === 'badges') {
      return { Badge_Name: '', Badge_Category: 'Quality', Tier: 'Bronze', Criteria: '', Icon: 'award', Points_Bonus: 0, XP_Bonus: 0, Status: 'Active', Active: true };
    }
    if (tab.id === 'rewards') {
      return { Reward_Name: '', Category: 'Instant Perks', Icon: 'gift', Points_Required: 0, Stock: 0, Approval_Required: 'No', Eligibility_Rule: 'Active agents', Status: 'Active', Active: true, Expiry_Date: '', Tier: 'Everyday', Description: '' };
    }
    return { Activity: '', Module_Type: '', Arena_Points: 0, XP: 0, Badge_Eligibility: '', Rule_Description: '', Status: 'Active', Active: true };
  }

  function openGamificationTab(tabId) {
    const tab = gamificationTabById(tabId);
    state.gamificationUi.tab = tab.id;
    if (!state.gamificationUi.panel || state.gamificationUi.panel.entity !== tab.id) {
      state.gamificationUi.panel = { entity: tab.id, mode: 'new', id: null };
    }
    state.error = '';
    renderShell();
  }

  function openGamificationPanel(entity, mode, id) {
    const tab = gamificationTabById(entity);
    state.gamificationUi.tab = tab.id;
    state.gamificationUi.panel = {
      entity: tab.id,
      mode: mode === 'edit' ? 'edit' : 'new',
      id: mode === 'edit' ? id : null,
    };
    state.error = '';
    renderShell();
  }

  function collectGamificationFormPayload(form) {
    const tab = gamificationTabById(form.dataset.gamificationEntity);
    const formData = new FormData(form);
    const active = formData.get('Active') === 'on';
    const status = active ? 'Active' : inactiveStatusFor(tab.id);
    const payload = { Active: active, Status: status };

    if (tab.id === 'missions') {
      Object.assign(payload, {
        Mission_Name: formText(formData, 'Mission_Name'),
        Mission_Type: formText(formData, 'Mission_Type'),
        Description: formText(formData, 'Description'),
        KPI_ID: formText(formData, 'KPI_ID') || null,
        Target_Value: nullableNumber(formData.get('Target_Value')),
        Reward_Points: nullableNumber(formData.get('Reward_Points')) || 0,
        XP_Reward: nullableNumber(formData.get('XP_Reward')) || 0,
        Badge_ID: formText(formData, 'Badge_ID') || null,
        Start_Date: formText(formData, 'Start_Date') || null,
        End_Date: formText(formData, 'End_Date') || null,
        Linked_Module_ID: formText(formData, 'Linked_Module_ID') || null,
        Created_By: state.user?.UserID || 'ADMIN001',
        Commercial_Linkage: 'Linked to Clover Medicare sales, effectuation or compliance outcome',
      }, collectAudiencePayload(formData));
      if (!payload.Mission_Name) throw new Error('Mission_Name is required.');
    } else if (tab.id === 'challenges') {
      Object.assign(payload, {
        Challenge_Name: formText(formData, 'Challenge_Name'),
        Challenge_Type: formText(formData, 'Challenge_Type'),
        Description: formText(formData, 'Description'),
        KPI_ID: formText(formData, 'KPI_ID') || null,
        Entry_Points: nullableNumber(formData.get('Entry_Points')) || 0,
        Reward_Pool: nullableNumber(formData.get('Reward_Pool')) || 0,
        XP_Reward: nullableNumber(formData.get('XP_Reward')) || 0,
        Min_Volume: nullableNumber(formData.get('Min_Volume')) || 0,
        Start_Date: formText(formData, 'Start_Date') || null,
        End_Date: formText(formData, 'End_Date') || null,
        Created_By: state.user?.UserID || 'ADMIN001',
        Commercial_Linkage: 'Challenge tied to sales conversion, enrollment quality or CMS compliance.',
      }, collectAudiencePayload(formData));
      if (!payload.Challenge_Name) throw new Error('Challenge_Name is required.');
    } else if (tab.id === 'badges') {
      Object.assign(payload, {
        Badge_Name: formText(formData, 'Badge_Name'),
        Badge_Category: formText(formData, 'Badge_Category'),
        Tier: formText(formData, 'Tier'),
        Criteria: formText(formData, 'Criteria'),
        Icon: formText(formData, 'Icon') || 'award',
        Points_Bonus: nullableNumber(formData.get('Points_Bonus')) || 0,
        XP_Bonus: nullableNumber(formData.get('XP_Bonus')) || 0,
      });
      if (!payload.Badge_Name) throw new Error('Badge_Name is required.');
      if (!payload.Criteria) throw new Error('Criteria is required.');
    } else if (tab.id === 'rewards') {
      Object.assign(payload, {
        Reward_Name: formText(formData, 'Reward_Name'),
        Category: formText(formData, 'Category'),
        Tier: formText(formData, 'Tier'),
        Icon: formText(formData, 'Icon') || 'gift',
        Description: formText(formData, 'Description'),
        Points_Required: nullableNumber(formData.get('Points_Required')) || 0,
        Stock: nullableNumber(formData.get('Stock')) || 0,
        Approval_Required: formText(formData, 'Approval_Required') || 'No',
        Eligibility_Rule: formText(formData, 'Eligibility_Rule'),
        Expiry_Date: formText(formData, 'Expiry_Date') || null,
      });
      if (!payload.Reward_Name) throw new Error('Reward_Name is required.');
    } else {
      Object.assign(payload, {
        Activity: formText(formData, 'Activity'),
        Module_Type: formText(formData, 'Module_Type'),
        Arena_Points: nullableNumber(formData.get('Arena_Points')) || 0,
        XP: nullableNumber(formData.get('XP')) || 0,
        Badge_Eligibility: formText(formData, 'Badge_Eligibility') || null,
        Rule_Description: formText(formData, 'Rule_Description'),
      });
      if (!payload.Activity) throw new Error('Activity is required.');
      if (!payload.Module_Type) throw new Error('Module_Type is required.');
    }
    return { tab, payload };
  }

  function collectAudiencePayload(formData) {
    const roles = formData.getAll('Audience_Roles').map(roleLabel).filter(Boolean);
    const teamIds = formData.getAll('Audience_Team_IDs').filter(Boolean);
    const processIds = formData.getAll('Audience_Process_IDs').filter(Boolean);
    const targetCount = targetedAudienceUsers(roles, teamIds, processIds).length;
    let audienceType = 'Account';
    let audienceId = 'CLOVER_MA';
    if (roles.length === 1 && !teamIds.length && !processIds.length) {
      audienceType = 'Role';
      audienceId = roles[0];
    } else if (teamIds.length === 1 && !roles.length && !processIds.length) {
      audienceType = 'Team';
      audienceId = teamIds[0];
    } else if (processIds.length === 1 && !roles.length && !teamIds.length) {
      audienceType = 'Process';
      audienceId = processIds[0];
    } else if (roles.length || teamIds.length || processIds.length) {
      audienceType = 'Targeted';
      audienceId = 'MULTI';
    }
    return {
      Audience_Type: audienceType,
      Audience_ID: audienceId,
      Audience_Roles: roles,
      Audience_Team_IDs: teamIds,
      Audience_Process_IDs: processIds,
      Audience_Target_Count: targetCount,
      Audience_Label: audienceLabel({
        Audience_Type: audienceType,
        Audience_ID: audienceId,
        Audience_Roles: roles,
        Audience_Team_IDs: teamIds,
        Audience_Process_IDs: processIds,
      }),
    };
  }

  function inactiveStatusFor(tabId) {
    if (tabId === 'challenges') return 'Closed';
    if (tabId === 'missions') return 'Inactive';
    return 'Retired';
  }

  async function saveGamificationForm(form) {
    const { tab, payload } = collectGamificationFormPayload(form);
    const panel = state.gamificationUi.panel || {};
    const editingId = panel.entity === tab.id && panel.mode === 'edit' ? panel.id : null;
    const before = editingId ? gamificationRows(tab.id).find(row => gamificationRecordId(tab, row) === editingId) : null;
    if (tab.id === 'points-rules' && before) {
      payload.Version = toNumber(before.Version, 1) + 1;
      payload.Effective_Date = new Date().toISOString().slice(0, 10);
    }
    state.notice = '';
    const saved = editingId
      ? await requestJson(`/admin/gamification/${tab.api}/${encodeURIComponent(editingId)}`, { method: 'PATCH', body: payload })
      : await requestJson(`/admin/gamification/${tab.api}`, { method: 'POST', body: payload });
    const savedId = gamificationRecordId(tab, saved);
    state.gamificationUi = { tab: tab.id, panel: { entity: tab.id, mode: 'edit', id: savedId } };
    state.notice = editingId
      ? `${tab.label} ${savedId} updated. Existing points, XP, badges and redemptions were retained.`
      : `${tab.label} ${savedId} created.`;
    await loadView('gamification');
  }

  async function deactivateGamificationRecord(entity, recordId) {
    const tab = gamificationTabById(entity);
    if (!recordId) return;
    const row = gamificationRows(tab.id).find(item => gamificationRecordId(tab, item) === recordId);
    if (!row) return;
    const blockedCount = tab.id === 'missions'
      ? activeMissionAssignmentCount(recordId)
      : tab.id === 'challenges'
        ? activeChallengeParticipantCount(recordId)
        : 0;
    if (blockedCount) {
      window.alert(`${gamificationRecordName(tab, row)} has ${blockedCount} in-progress ${tab.id === 'missions' ? 'assignment' : 'participant'} record(s).`);
      return;
    }
    if (!window.confirm(`Deactivate ${gamificationRecordName(tab, row)}?`)) return;
    state.notice = '';
    await requestJson(`/admin/gamification/${tab.api}/${encodeURIComponent(recordId)}/deactivate`, { method: 'POST', body: {} });
    state.gamificationUi = { tab: tab.id, panel: { entity: tab.id, mode: 'edit', id: recordId } };
    state.notice = `${tab.label} ${recordId} deactivated. Historical records were retained.`;
    await loadView('gamification');
  }

  async function settleRewardRedemption(redemptionId, decision) {
    if (!redemptionId) return;
    const verb = decision === 'approve' ? 'Approve' : 'Reject';
    if (!window.confirm(`${verb} reward redemption ${redemptionId}?`)) return;
    state.notice = '';
    const result = await requestJson(`/admin/gamification/reward-redemptions/${encodeURIComponent(redemptionId)}/${decision}`, {
      method: 'POST',
      body: {},
    });
    const reward = result?.reward;
    state.notice = decision === 'approve'
      ? `Redemption ${redemptionId} fulfilled. Reward stock is now ${formatNumber(reward?.Stock || 0)}.`
      : `Redemption ${redemptionId} rejected.`;
    await loadView('gamification');
  }

  function renderSla() {
    const rules = state.slaRules || [];
    const slabs = rules.flatMap(rule => rule.Slabs || []);
    const exposure = state.commercialExposure || [];
    const published = rules.filter(row => canonicalStatus(row) === 'published').length;
    const draft = rules.length - published;
    const penalty = exposure.reduce((sum, row) => sum + toNumber(row.Forecast_Penalty, 0), 0);
    const reward = exposure.reduce((sum, row) => sum + toNumber(row.Forecast_Reward, 0), 0);
    const net = reward - penalty;
    return `
      <section class="space-y-4">
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          ${metricTile({ label: 'SLA rules', value: formatNumber(rules.length), sub: 'Commercial rule catalogue', icon: 'file-check-2' })}
          ${metricTile({ label: 'Slabs', value: formatNumber(slabs.length), sub: 'Penalty / reward bands', icon: 'layers' })}
          ${metricTile({ label: 'Published', value: formatNumber(published), sub: `${formatNumber(draft)} pending publish`, icon: 'shield-check' })}
          ${metricTile({ label: 'Penalty exposure', value: formatMoney(penalty), sub: 'Commercial_Exposure', icon: 'badge-dollar-sign' })}
          ${metricTile({ label: 'Net impact', value: formatMoney(net), sub: `${formatMoney(reward)} reward opportunity`, icon: net >= 0 ? 'trending-up' : 'trending-down' })}
        </div>
        <div class="glass rounded-xl p-4">
          <div class="flex flex-wrap items-start justify-between gap-3 mb-3">
            <div>
              <div class="label">SLA_Commercial_Rules</div>
              <div class="font-display font-bold text-lg">Commercial rule configuration</div>
              <div class="text-[12px] text-arena-muted mt-1">KPI-linked SLA rules with nested non-overlapping penalty and reward slabs.</div>
            </div>
            <button data-action="export-sla-config" class="btn-secondary text-[12px]">${icon('download', 'text-[13px]')} Excel</button>
          </div>
          ${renderPenaltyRewardBalance(penalty, reward)}
        </div>
        ${renderNewSlaRuleForm()}
        <div class="space-y-3">
          ${rules.map(renderSlaRuleEditor).join('') || emptySlaState()}
        </div>
        ${auditPanel('SLA publish audit trail', state.audit)}
      </section>`;
  }

  function emptySlaState() {
    return `
      <div class="glass rounded-xl p-4 text-[12px] text-arena-muted">
        No SLA rules are configured. Add a KPI-linked rule to start commercial modelling.
      </div>`;
  }

  function renderNewSlaRuleForm() {
    return `
      <form id="sla-new-rule-form" class="glass rounded-xl p-4 space-y-3">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div class="label">Add rule</div>
            <div class="font-display font-bold text-base">New KPI-linked SLA rule</div>
          </div>
          <button type="submit" class="btn-primary text-[12px]">${icon('plus', 'text-[13px]')} Add rule</button>
        </div>
        ${renderSlaRuleFields(defaultSlaRule(), true)}
      </form>`;
  }

  function renderSlaRuleEditor(rule) {
    const slabs = sortedSlabs(rule);
    const exposure = slaExposureRows(rule);
    const penalty = exposure.reduce((sum, row) => sum + toNumber(row.Forecast_Penalty, 0), 0);
    const reward = exposure.reduce((sum, row) => sum + toNumber(row.Forecast_Reward, 0), 0);
    const canRevert = Boolean(rule.Previous_Published_Config);
    return `
      <article class="glass rounded-xl p-4 overflow-hidden">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div class="label">${escapeHtml(rule.Rule_ID)}</div>
            <div class="font-display font-bold text-lg">${escapeHtml(rule.KPI_Name || rule.KPI_ID || 'SLA rule')}</div>
            <div class="flex flex-wrap gap-2 mt-2">
              ${kpiLinkChip(rule)}
              ${slaStatusChip(rule)}
              ${renderSlaRecomputeIndicator(rule)}
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" data-action="publish-sla-rule" data-rule-id="${escapeHtml(rule.Rule_ID)}" class="btn-primary text-[12px]">${icon('send', 'text-[13px]')} Publish</button>
            <button type="button" data-action="revert-sla-rule" data-rule-id="${escapeHtml(rule.Rule_ID)}" class="btn-secondary text-[12px]" ${canRevert ? '' : 'disabled'}>${icon('rotate-ccw', 'text-[13px]')} Revert</button>
          </div>
        </div>
        <form data-sla-rule-form="true" data-rule-id="${escapeHtml(rule.Rule_ID)}" class="mt-4 space-y-3">
          ${renderSlaRuleFields(rule, false)}
          <div class="flex justify-end">
            <button type="submit" class="btn-secondary text-[12px]">${icon('save', 'text-[13px]')} Save rule</button>
          </div>
        </form>
        <div class="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-3 mt-4">
          <div class="rounded-lg border border-white/10 bg-white/[0.025] p-3 overflow-hidden">
            <div class="flex items-center justify-between gap-2 mb-3">
              <div>
                <div class="label">Penalty_Reward_Slabs</div>
                <div class="font-display font-bold text-base">${formatNumber(slabs.length)} nested slabs</div>
              </div>
              <span class="chip border border-white/10 bg-white/[0.04]">${escapeHtml(rule.Measurement_Period || 'Monthly')}</span>
            </div>
            ${renderSlaSlabEditor(rule)}
          </div>
          <div class="rounded-lg border border-white/10 bg-white/[0.025] p-3">
            <div class="label">Recomputed exposure</div>
            <div class="font-display font-bold text-base mt-1">${formatMoney(reward - penalty)}</div>
            <div class="grid grid-cols-2 gap-2 mt-3">
              ${summaryCell('Penalty', formatMoney(penalty))}
              ${summaryCell('Reward', formatMoney(reward))}
            </div>
            <div class="text-[11px] text-arena-muted mt-3">${formatNumber(exposure.length)} Commercial_Exposure row(s); ${formatNumber(slaWhatIfRows(rule).length)} What_If_Scenarios row(s).</div>
          </div>
        </div>
      </article>`;
  }

  function renderSlaRuleFields(rule, isNew) {
    return `
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        ${isNew ? '' : textInput('Rule_ID', rule.Rule_ID, false, true)}
        ${slaKpiSelect(rule.KPI_ID)}
        ${textInput('Account_ID', rule.Account_ID || 'HCA001')}
        ${numberInput('Target', rule.Target)}
        ${selectInput('Measurement_Period', rule.Measurement_Period || 'Monthly', ['Daily', 'Weekly', 'Monthly', 'Quarterly'])}
        ${selectInput('Direction', rule.Direction || 'Higher', ['Higher', 'Lower'])}
        ${selectInput('Currency', rule.Currency || 'USD', ['USD'])}
        ${numberInput('Max_Penalty', rule.Max_Penalty)}
        ${numberInput('Max_Reward', rule.Max_Reward)}
      </div>
      ${textArea('Description', rule.Description || '')}`;
  }

  function renderSlaSlabEditor(rule) {
    const slabs = sortedSlabs(rule);
    const rows = slabs.map(slab => `
      <form data-sla-slab-form="true" data-rule-id="${escapeHtml(rule.Rule_ID)}" data-slab-id="${escapeHtml(slab.Slab_ID)}" class="grid grid-cols-1 md:grid-cols-[1.1fr_0.7fr_0.7fr_0.9fr_0.9fr_0.9fr_minmax(160px,1.4fr)_auto] gap-2 items-end py-2 border-t border-white/8">
        <label class="block">
          <span class="label">Slab ID</span>
          <input name="Slab_ID" value="${escapeHtml(slab.Slab_ID || '')}" readonly class="w-full mt-1 rounded-lg bg-white/[0.03] border border-white/10 px-2 py-1.5 text-[12px] opacity-75" />
        </label>
        ${compactNumberInput('Variance_From', slab.Variance_From)}
        ${compactNumberInput('Variance_To', slab.Variance_To)}
        ${compactSelectInput('Impact_Type', slab.Impact_Type || 'Neutral', ['Penalty', 'Neutral', 'Reward'])}
        ${compactNumberInput('Penalty_Amount', slab.Penalty_Amount)}
        ${compactNumberInput('Reward_Amount', slab.Reward_Amount)}
        ${compactTextInput('Description', slab.Description || '')}
        <div class="flex gap-1 justify-end">
          <button type="submit" class="btn-secondary text-[11px] !px-2">${icon('save', 'text-[12px]')}</button>
          <button type="button" data-action="delete-sla-slab" data-rule-id="${escapeHtml(rule.Rule_ID)}" data-slab-id="${escapeHtml(slab.Slab_ID)}" class="btn-secondary text-[11px] !px-2">${icon('trash-2', 'text-[12px]')}</button>
        </div>
      </form>`).join('');
    return `
      <div class="space-y-1">${rows || `<div class="text-[12px] text-arena-muted py-3 border-t border-white/8">No slabs configured for this rule.</div>`}</div>
      <form data-sla-slab-form="true" data-rule-id="${escapeHtml(rule.Rule_ID)}" class="grid grid-cols-1 md:grid-cols-[0.7fr_0.7fr_0.9fr_0.9fr_0.9fr_minmax(160px,1.4fr)_auto] gap-2 items-end pt-3 mt-2 border-t border-white/10">
        ${compactNumberInput('Variance_From', '')}
        ${compactNumberInput('Variance_To', '')}
        ${compactSelectInput('Impact_Type', 'Neutral', ['Penalty', 'Neutral', 'Reward'])}
        ${compactNumberInput('Penalty_Amount', 0)}
        ${compactNumberInput('Reward_Amount', 0)}
        ${compactTextInput('Description', '')}
        <button type="submit" class="btn-secondary text-[11px]">${icon('plus', 'text-[12px]')} Add</button>
      </form>`;
  }

  function defaultSlaRule() {
    const kpi = (state.kpis || []).find(isActiveKpi) || {};
    return {
      KPI_ID: kpi.KPI_ID || '',
      Account_ID: 'HCA001',
      Target: kpi.Target || '',
      Measurement_Period: 'Monthly',
      Direction: kpi.Direction || 'Higher',
      Currency: 'USD',
      Max_Penalty: '',
      Max_Reward: '',
      Description: '',
    };
  }

  function slaKpiSelect(value) {
    const options = (state.kpis || []).filter(isActiveKpi);
    return `
      <label class="block">
        <span class="label">KPI</span>
        <select name="KPI_ID" required class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">
          <option value="">Select KPI</option>
          ${options.map(kpi => `<option value="${escapeHtml(kpi.KPI_ID)}" ${kpi.KPI_ID === value ? 'selected' : ''}>${escapeHtml(kpi.KPI_ID)} - ${escapeHtml(kpi.KPI_Name || '')}</option>`).join('')}
        </select>
      </label>`;
  }

  function compactNumberInput(name, value) {
    return `
      <label class="block">
        <span class="label">${escapeHtml(name.replace(/_/g, ' '))}</span>
        <input name="${escapeHtml(name)}" type="number" step="any" value="${escapeHtml(value == null ? '' : value)}" class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1.5 text-[12px] outline-none focus:border-arena-gold/60" />
      </label>`;
  }

  function compactTextInput(name, value) {
    return `
      <label class="block">
        <span class="label">${escapeHtml(name.replace(/_/g, ' '))}</span>
        <input name="${escapeHtml(name)}" value="${escapeHtml(value || '')}" class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1.5 text-[12px] outline-none focus:border-arena-gold/60" />
      </label>`;
  }

  function compactSelectInput(name, value, options) {
    return `
      <label class="block">
        <span class="label">${escapeHtml(name.replace(/_/g, ' '))}</span>
        <select name="${escapeHtml(name)}" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-2 py-1.5 text-[12px] outline-none focus:border-arena-gold/60">
          ${(options || []).map(option => `<option value="${escapeHtml(option)}" ${String(value || '') === String(option) ? 'selected' : ''}>${escapeHtml(option)}</option>`).join('')}
        </select>
      </label>`;
  }

  function sortedSlabs(rule) {
    return (rule.Slabs || []).slice().sort((a, b) => toNumber(a.Variance_From, 0) - toNumber(b.Variance_From, 0));
  }

  function slaExposureRows(rule) {
    return (state.commercialExposure || []).filter(row => row.KPI_ID === rule.KPI_ID || row.Rule_ID === rule.Rule_ID);
  }

  function slaWhatIfRows(rule) {
    return (state.whatIfScenarios || []).filter(row => row.KPI_ID === rule.KPI_ID || row.Rule_ID === rule.Rule_ID);
  }

  function kpiLinkChip(rule) {
    return `<span class="chip border border-arena-cyan/25 bg-arena-cyan/10 text-arena-cyan">${escapeHtml(rule.KPI_ID || '-')}</span>`;
  }

  function slaStatusChip(rule) {
    const status = canonicalStatus(rule);
    const label = rule.Status || (status === 'published' ? 'Published' : 'Draft');
    const cls = status === 'published'
      ? 'border-emerald-300/25 bg-emerald-400/[0.08] text-emerald-100'
      : 'border-amber-300/25 bg-amber-300/[0.08] text-amber-100';
    return `<span class="chip border ${cls}">${escapeHtml(label)}</span>`;
  }

  function renderSlaRecomputeIndicator(rule) {
    const status = String(rule.Recompute_Status || 'Pending Publish');
    const complete = status.toLowerCase() === 'complete';
    const cls = complete ? 'border-emerald-300/25 bg-emerald-400/[0.08] text-emerald-100' : 'border-amber-300/25 bg-amber-300/[0.08] text-amber-100';
    const at = rule.Recompute_Completed_At ? ` · ${formatDateTime(rule.Recompute_Completed_At)}` : '';
    return `<span class="chip border ${cls}">${escapeHtml(status)}${escapeHtml(at)}</span>`;
  }

  function renderPenaltyRewardBalance(penalty, reward) {
    const total = Math.max(1, Math.abs(penalty) + Math.abs(reward));
    const penaltyWidth = Math.round((Math.abs(penalty) / total) * 100);
    const rewardWidth = Math.round((Math.abs(reward) / total) * 100);
    return `
      <div>
        <div class="flex items-center justify-between text-[11px] text-arena-muted mb-1">
          <span>Penalty ${formatMoney(penalty)}</span>
          <span>Reward ${formatMoney(reward)}</span>
        </div>
        <div class="h-2 rounded-full bg-white/[0.06] overflow-hidden flex">
          <div class="bg-arena-red/80" style="width:${penaltyWidth}%"></div>
          <div class="bg-arena-emerald/80" style="width:${rewardWidth}%"></div>
        </div>
      </div>`;
  }

  function formatMoney(value) {
    const amount = toNumber(value, 0);
    const sign = amount < 0 ? '-' : '';
    const abs = Math.abs(amount);
    if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${sign}$${Math.round(abs / 1000)}K`;
    return `${sign}$${Math.round(abs).toLocaleString('en-US')}`;
  }

  function renderPeople() {
    const metrics = peopleMetrics();
    const rows = filteredPeopleUsers();
    return `
      <section class="space-y-4">
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
          ${metricTile({ label: 'Active users', value: formatNumber(metrics.activeUsers), sub: metrics.roleBreakdown, icon: 'users' })}
          ${metricTile({ label: 'Active agents', value: formatNumber(metrics.activeAgentCount), sub: 'Agents visible on role screens', icon: 'headset' })}
          ${metricTile({ label: 'Teams', value: formatNumber(metrics.teams), sub: `${formatNumber(metrics.teamsNoTl)} without active TL`, icon: 'network' })}
          ${metricTile({ label: 'Unassigned agents', value: formatNumber(metrics.unassignedAgents), sub: 'Missing valid TeamID or ProcessID', icon: 'user-x' })}
        </div>
        ${renderPeopleImportBanner()}
        <section class="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
          <div class="glass rounded-xl p-4 overflow-hidden">
            <div class="flex flex-wrap items-start justify-between gap-3 mb-3">
              <div>
                <div class="label">Users</div>
                <div class="font-display font-bold text-lg">Roster</div>
                <div class="text-[12px] text-arena-muted mt-1">${formatNumber(rows.length)} users match current filters</div>
              </div>
              <div class="flex flex-wrap gap-2">
                <button data-action="export-roster" class="btn-secondary text-[12px]">${icon('download', 'text-[13px]')} Export roster</button>
              </div>
            </div>
            ${renderPeopleFilters()}
            ${renderUsersTable(rows)}
          </div>
          ${renderAddUserPanel()}
        </section>
        <section class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
          ${renderTeamConfiguration()}
          ${renderAddTeamPanel()}
        </section>
        <section class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-4">
          ${renderOrgTree()}
          ${auditPanel('People audit trail', state.audit)}
        </section>
      </section>`;
  }

  function renderPeopleImportBanner() {
    return `
      <div class="glass rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="label">Bulk import</div>
          <div class="font-display font-bold text-base">Users and Teams can also be maintained through Dataset Manager</div>
          <div class="text-[12px] text-arena-muted mt-1">Inline changes are audited immediately; workbook uploads use the Users and Teams entity tabs.</div>
        </div>
        <div class="flex flex-wrap gap-2">
          <button data-action="people-open-import" data-entity="Users" class="btn-secondary text-[12px]">${icon('upload-cloud', 'text-[13px]')} Users import</button>
          <button data-action="people-open-import" data-entity="Teams" class="btn-secondary text-[12px]">${icon('upload-cloud', 'text-[13px]')} Teams import</button>
        </div>
      </div>`;
  }

  function renderPeopleFilters() {
    const filters = peopleFilters();
    return `
      <div class="grid grid-cols-1 md:grid-cols-5 gap-2 mb-3">
        <label class="block">
          <span class="label">Role</span>
          <select data-people-filter="role" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">
            ${roleOptions(filters.role, true)}
          </select>
        </label>
        <label class="block">
          <span class="label">Team</span>
          <select data-people-filter="team" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">
            ${teamOptions(filters.team, true, false)}
          </select>
        </label>
        <label class="block">
          <span class="label">Process</span>
          <select data-people-filter="process" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">
            ${processOptions(filters.process, true, false)}
          </select>
        </label>
        <label class="block">
          <span class="label">Location</span>
          <select data-people-filter="location" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">
            ${locationOptions(filters.location, true)}
          </select>
        </label>
        <label class="block">
          <span class="label">Active</span>
          <select data-people-filter="active" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">
            ${optionHtml('active', 'Active only', filters.active)}
            ${optionHtml('inactive', 'Inactive only', filters.active)}
            ${optionHtml('all', 'All statuses', filters.active)}
          </select>
        </label>
      </div>`;
  }

  function renderUsersTable(rows) {
    const body = (rows || []).map(user => {
      const active = isActiveUser(user);
      const role = roleLabel(user.Role);
      const impact = cascadeImpactForUser(user.UserID);
      const impactText = impactLines(impact).join('; ');
      return `
        <tr class="${active ? '' : 'opacity-70'}">
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top font-semibold">${escapeHtml(user.UserID)}</td>
          <td class="px-3 py-2 border-t border-white/8 align-top min-w-[180px]">
            <input data-user-id="${escapeHtml(user.UserID)}" data-user-field="Name" value="${escapeHtml(user.Name || '')}" class="w-full rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1.5 text-[12px] outline-none focus:border-arena-gold/60" />
            <div class="text-[10px] text-arena-muted mt-1">${escapeHtml(impactText || 'No active dependency flags')}</div>
          </td>
          <td class="px-3 py-2 border-t border-white/8 align-top min-w-[132px]">
            <select data-user-id="${escapeHtml(user.UserID)}" data-user-field="Role" class="w-full rounded-lg bg-slate-950 border border-white/10 px-2 py-1.5 text-[12px] outline-none focus:border-arena-gold/60">
              ${roleOptions(role, false)}
            </select>
          </td>
          <td class="px-3 py-2 border-t border-white/8 align-top min-w-[170px]">
            <select data-user-id="${escapeHtml(user.UserID)}" data-user-field="TeamID" class="w-full rounded-lg bg-slate-950 border border-white/10 px-2 py-1.5 text-[12px] outline-none focus:border-arena-gold/60">
              ${teamOptions(user.TeamID || '', false, true)}
            </select>
          </td>
          <td class="px-3 py-2 border-t border-white/8 align-top min-w-[170px]">
            <select data-user-id="${escapeHtml(user.UserID)}" data-user-field="ProcessID" class="w-full rounded-lg bg-slate-950 border border-white/10 px-2 py-1.5 text-[12px] outline-none focus:border-arena-gold/60">
              ${processOptions(user.ProcessID || '', false, true)}
            </select>
          </td>
          <td class="px-3 py-2 border-t border-white/8 align-top min-w-[150px]">
            <input data-user-id="${escapeHtml(user.UserID)}" data-user-field="Location" value="${escapeHtml(user.Location || '')}" class="w-full rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1.5 text-[12px] outline-none focus:border-arena-gold/60" />
          </td>
          <td class="px-3 py-2 border-t border-white/8 align-top min-w-[170px]">
            <select data-user-id="${escapeHtml(user.UserID)}" data-user-field="ManagerID" class="w-full rounded-lg bg-slate-950 border border-white/10 px-2 py-1.5 text-[12px] outline-none focus:border-arena-gold/60">
              ${managerOptions(user.ManagerID || '', true)}
            </select>
          </td>
          <td class="px-3 py-2 border-t border-white/8 align-top min-w-[130px]">
            <input data-user-id="${escapeHtml(user.UserID)}" data-user-field="Avatar" value="${escapeHtml(user.Avatar || '')}" class="w-full rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1.5 text-[12px] outline-none focus:border-arena-gold/60" />
          </td>
          <td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">
            <label class="inline-flex items-center gap-2">
              <input data-user-id="${escapeHtml(user.UserID)}" data-user-field="Active" type="checkbox" ${active ? 'checked' : ''} />
              <span class="chip border ${active ? 'border-emerald-300/25 bg-emerald-400/[0.08] text-emerald-100' : 'border-rose-300/25 bg-rose-400/[0.08] text-rose-100'}">${active ? 'Active' : 'Inactive'}</span>
            </label>
          </td>
          <td class="px-3 py-2 border-t border-white/8 align-top">
            <button data-action="deactivate-user" data-user-id="${escapeHtml(user.UserID)}" class="btn-secondary text-[11px]" ${active ? '' : 'disabled'}>${icon('user-x', 'text-[12px]')} Deactivate</button>
          </td>
        </tr>`;
    }).join('');
    const headers = ['UserID', 'Name', 'Role', 'TeamID', 'ProcessID', 'Location', 'ManagerID', 'Avatar', 'Active', 'Action'];
    return `
      <div class="overflow-x-auto">
        <table class="w-full min-w-[1320px] border-separate border-spacing-0">
          <thead>
            <tr>${headers.map(head => `<th class="px-3 py-2 text-left text-[10px] uppercase tracking-[0.14em] text-arena-muted">${escapeHtml(head)}</th>`).join('')}</tr>
          </thead>
          <tbody>${body || `<tr><td colspan="${headers.length}" class="px-3 py-4 border-t border-white/8 text-[12px] text-arena-muted">No users match these filters.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  function renderAddUserPanel() {
    return `
      <aside class="glass rounded-xl p-4 overflow-hidden">
        <div class="label">Add User</div>
        <div class="font-display font-bold text-lg mb-3">New roster record</div>
        <form id="people-add-user-form" class="space-y-3">
          <label class="block">
            <span class="label">UserID</span>
            <input name="UserID" required placeholder="AG101" class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60" />
          </label>
          <label class="block">
            <span class="label">Name</span>
            <input name="Name" required class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60" />
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block">
              <span class="label">Role</span>
              <select name="Role" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">${roleOptions('Agent', false)}</select>
            </label>
            <label class="block">
              <span class="label">Location</span>
              <input name="Location" value="${escapeHtml(uniqueValues(state.users, 'Location')[0] || '')}" class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60" />
            </label>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block">
              <span class="label">TeamID</span>
              <select name="TeamID" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">${teamOptions('', false, true)}</select>
            </label>
            <label class="block">
              <span class="label">ProcessID</span>
              <select name="ProcessID" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">${processOptions('', false, true)}</select>
            </label>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block">
              <span class="label">ManagerID</span>
              <select name="ManagerID" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">${managerOptions('MGR001', true)}</select>
            </label>
            <label class="block">
              <span class="label">Avatar</span>
              <input name="Avatar" placeholder="avatar_ag_new" class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60" />
            </label>
          </div>
          <label class="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px]">
            <span>Active status</span>
            <input type="checkbox" name="Active" checked />
          </label>
          <button type="submit" class="btn-primary text-[12px] w-full justify-center">${icon('user-plus', 'text-[13px]')} Add user</button>
        </form>
      </aside>`;
  }

  function renderTeamConfiguration() {
    const cards = (state.teams || []).slice().sort((a, b) => String(a.TeamID || '').localeCompare(String(b.TeamID || ''))).map(team => {
      const active = isActiveTeam(team);
      const lead = userById(teamLeadId(team));
      const manager = userById(team.ManagerID);
      const impact = cascadeImpactForTeam(team.TeamID);
      return `
        <article class="rounded-xl border ${active ? 'border-white/10 bg-white/[0.035]' : 'border-rose-300/20 bg-rose-400/[0.05]'} p-3">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div class="label">${escapeHtml(team.TeamID)}</div>
              <input data-team-id="${escapeHtml(team.TeamID)}" data-team-field="TeamName" value="${escapeHtml(team.TeamName || '')}" class="mt-1 w-full rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1.5 text-sm font-semibold outline-none focus:border-arena-gold/60" />
              <div class="text-[11px] text-arena-muted mt-1">${formatNumber(teamHeadcount(team.TeamID))} active agents</div>
            </div>
            <label class="inline-flex items-center gap-2 text-[12px]">
              <input data-team-id="${escapeHtml(team.TeamID)}" data-team-field="Active" type="checkbox" ${active ? 'checked' : ''} />
              <span class="chip border ${active ? 'border-emerald-300/25 bg-emerald-400/[0.08] text-emerald-100' : 'border-rose-300/25 bg-rose-400/[0.08] text-rose-100'}">${active ? 'Active' : 'Inactive'}</span>
            </label>
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
            <label class="block">
              <span class="label">ProcessID</span>
              <select data-team-id="${escapeHtml(team.TeamID)}" data-team-field="ProcessID" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-2 py-1.5 text-[12px] outline-none focus:border-arena-gold/60">${processOptions(team.ProcessID || '', false, false)}</select>
            </label>
            <label class="block">
              <span class="label">Location</span>
              <input data-team-id="${escapeHtml(team.TeamID)}" data-team-field="Location" value="${escapeHtml(team.Location || '')}" class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1.5 text-[12px] outline-none focus:border-arena-gold/60" />
            </label>
            <label class="block">
              <span class="label">Shift</span>
              <input data-team-id="${escapeHtml(team.TeamID)}" data-team-field="Shift" value="${escapeHtml(team.Shift || '')}" class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-2 py-1.5 text-[12px] outline-none focus:border-arena-gold/60" />
            </label>
            <label class="block">
              <span class="label">Manager</span>
              <select data-team-id="${escapeHtml(team.TeamID)}" data-team-field="ManagerID" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-2 py-1.5 text-[12px] outline-none focus:border-arena-gold/60">${managerOptions(team.ManagerID || '', true)}</select>
            </label>
            <label class="block md:col-span-2">
              <span class="label">Team Lead</span>
              <select data-team-id="${escapeHtml(team.TeamID)}" data-team-field="TeamLeadID" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-2 py-1.5 text-[12px] outline-none focus:border-arena-gold/60">${teamLeadOptions(teamLeadId(team), true)}</select>
            </label>
          </div>
          <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-arena-muted">
            <span>TL ${escapeHtml(lead?.Name || 'Unassigned')} · Manager ${escapeHtml(manager?.Name || 'Unassigned')}</span>
            <button data-action="deactivate-team" data-team-id="${escapeHtml(team.TeamID)}" class="btn-secondary text-[11px]" ${active ? '' : 'disabled'}>${icon('archive', 'text-[12px]')} Deactivate team</button>
          </div>
          <div class="mt-2 text-[11px] text-amber-100">${escapeHtml(impactLines(impact).join('; ') || 'No active cascade flags')}</div>
        </article>`;
    }).join('');
    return `
      <div class="glass rounded-xl p-4 overflow-hidden">
        <div class="label">Teams</div>
        <div class="font-display font-bold text-lg mb-3">Team configuration</div>
        <div class="grid grid-cols-1 2xl:grid-cols-2 gap-3">${cards || '<div class="text-[12px] text-arena-muted">No teams configured.</div>'}</div>
      </div>`;
  }

  function renderAddTeamPanel() {
    return `
      <aside class="glass rounded-xl p-4 overflow-hidden">
        <div class="label">Add Team</div>
        <div class="font-display font-bold text-lg mb-3">New team configuration</div>
        <form id="people-add-team-form" class="space-y-3">
          <label class="block">
            <span class="label">TeamID</span>
            <input name="TeamID" required placeholder="T006" class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60" />
          </label>
          <label class="block">
            <span class="label">TeamName</span>
            <input name="TeamName" required placeholder="Squad Horizon" class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60" />
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block">
              <span class="label">ProcessID</span>
              <select name="ProcessID" required class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">${processOptions('', false, true)}</select>
            </label>
            <label class="block">
              <span class="label">Shift</span>
              <input name="Shift" placeholder="Morning" class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60" />
            </label>
          </div>
          <label class="block">
            <span class="label">Location</span>
            <input name="Location" placeholder="Bangalore" class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60" />
          </label>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label class="block">
              <span class="label">Team Lead</span>
              <select name="TeamLeadID" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">${teamLeadOptions('', true)}</select>
            </label>
            <label class="block">
              <span class="label">Manager</span>
              <select name="ManagerID" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">${managerOptions('MGR001', true)}</select>
            </label>
          </div>
          <label class="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[12px]">
            <span>Active status</span>
            <input type="checkbox" name="Active" checked />
          </label>
          <button type="submit" class="btn-primary text-[12px] w-full justify-center">${icon('plus', 'text-[13px]')} Add team</button>
        </form>
      </aside>`;
  }

  function renderOrgTree() {
    const managerRows = managers();
    const tree = managerRows.map(manager => {
      const ownedTeams = activeTeams().filter(team => team.ManagerID === manager.UserID);
      return `
        <article class="rounded-xl border border-white/10 bg-white/[0.035] p-3">
          <div class="flex items-center gap-2">
            <div class="w-9 h-9 rounded-lg gold-bg grid place-items-center">${icon('briefcase-business', 'text-[15px]')}</div>
            <div>
              <div class="font-semibold">${escapeHtml(manager.Name)}</div>
              <div class="text-[11px] text-arena-muted">${escapeHtml(manager.UserID)} · Manager</div>
            </div>
          </div>
          <div class="mt-3 space-y-2">
            ${ownedTeams.map(team => renderOrgTeamNode(team)).join('') || '<div class="text-[12px] text-arena-muted">No active teams assigned.</div>'}
          </div>
        </article>`;
    }).join('');
    return `
      <div class="glass rounded-xl p-4 overflow-hidden">
        <div class="label">Org tree</div>
        <div class="font-display font-bold text-lg mb-3">Manager -> TL -> Agents</div>
        <div class="grid grid-cols-1 2xl:grid-cols-2 gap-3">${tree || '<div class="text-[12px] text-arena-muted">No active managers configured.</div>'}</div>
      </div>`;
  }

  function renderOrgTeamNode(team) {
    const lead = userById(teamLeadId(team));
    const teamAgents = agents().filter(user => user.TeamID === team.TeamID);
    return `
      <div class="rounded-lg border border-white/10 bg-black/10 p-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div class="font-semibold text-[13px]">${escapeHtml(team.TeamName || team.TeamID)}</div>
            <div class="text-[11px] text-arena-muted">${escapeHtml(team.TeamID)} · ${escapeHtml(team.ProcessID || '-')} · ${escapeHtml(team.Location || '-')}</div>
          </div>
          <div class="chip border border-cyan-300/25 bg-cyan-400/[0.08] text-cyan-100">${formatNumber(teamAgents.length)} agents</div>
        </div>
        <div class="mt-2 rounded-lg border border-white/8 bg-white/[0.025] p-2">
          <div class="text-[11px] text-arena-muted">TL</div>
          <div class="text-[12px] font-semibold">${escapeHtml(lead ? `${lead.Name} (${lead.UserID})` : 'Unassigned')}</div>
        </div>
        <div class="mt-2 flex flex-wrap gap-1.5">
          ${teamAgents.slice(0, 14).map(user => `<span class="chip border border-white/10 bg-white/[0.04] text-[10.5px]">${escapeHtml(user.Name)}</span>`).join('')}
          ${teamAgents.length > 14 ? `<span class="chip border border-white/10 bg-white/[0.04] text-[10.5px]">+${formatNumber(teamAgents.length - 14)} more</span>` : ''}
        </div>
      </div>`;
  }

  function renderSettings() {
    const settings = state.settings || {};
    const config = settings.appConfig || [];
    const flags = settings.featureFlags || [];
    const env = settings.environment || 'Seed';
    const cfg = configByKey(config);
    const enabledCount = flags.filter(flag => flag.Enabled).length;
    const endpoints = endpointConfigRows(config);
    const lastConfig = latestRecordTimestamp(config, ['Last_Modified_Date', 'updated_at', 'created_at']);
    return `
      <section class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          ${settingsMetric('Environment', env, env === 'Production' ? 'Live guarded mode' : 'Seed data mode', 'server-cog')}
          ${settingsMetric('Feature flags', `${formatNumber(enabledCount)} / ${formatNumber(flags.length)}`, 'Enabled flags', 'toggle-right')}
          ${settingsMetric('Endpoint health', `${formatNumber(healthyEndpointCount())} / ${formatNumber(endpoints.length)}`, 'Last check status', 'activity')}
          ${settingsMetric('Last publish', lastConfig ? formatDateTime(lastConfig.timestamp) : '-', 'Config version timestamp', 'history')}
        </div>
        <div class="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_430px] gap-4">
          <div class="space-y-4">
            ${renderEnvironmentPanel(env)}
            ${renderAppIdentityPanel(cfg)}
            ${renderPwaManifestPanel(cfg)}
            ${renderFeatureFlagsPanel(flags)}
          </div>
          <div class="space-y-4">
            ${renderIntegrationPanel(cfg)}
            ${renderSettingsVersions(config, settings.settingVersions || [])}
            ${auditPanel('Settings audit trail', state.audit)}
          </div>
        </div>
      </section>`;
  }

  function renderAudit() {
    const filters = state.auditFilters || {};
    return `
      <section class="glass rounded-xl p-4 overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <div class="label">Admin_Audit_Log</div>
            <div class="font-display font-bold text-lg">Last 90 days</div>
          </div>
          <button data-action="export-audit" class="btn-secondary text-[12px]">${icon('download', 'text-[13px]')} CSV</button>
        </div>
        <form id="audit-filter-form" class="grid grid-cols-1 md:grid-cols-6 gap-2 mb-4">
          <input name="search" value="${escapeHtml(filters.search || '')}" placeholder="Search snapshots" class="md:col-span-2 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60" />
          <select name="entity" class="rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">
            ${auditEntityOptions(filters.entity)}
          </select>
          <select name="action" class="rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">
            ${auditActionOptions(filters.action)}
          </select>
          <input name="from" type="date" value="${escapeHtml(filters.from || '')}" class="rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60" />
          <button type="submit" class="btn-primary text-[12px]">${icon('search', 'text-[13px]')} Apply</button>
        </form>
        ${auditTable(state.audit)}
      </section>`;
  }

  function settingsMetric(label, value, sub, iconName) {
    return `
      <div class="glass rounded-xl p-3 border border-white/8">
        <div class="flex items-center justify-between gap-2">
          <div>
            <div class="label">${escapeHtml(label)}</div>
            <div class="font-display font-bold text-lg">${escapeHtml(value)}</div>
            <div class="text-[11px] text-arena-muted mt-1">${escapeHtml(sub)}</div>
          </div>
          <div class="w-9 h-9 rounded-lg bg-white/[0.05] border border-white/10 grid place-items-center text-arena-gold">${icon(iconName, 'text-[16px]')}</div>
        </div>
      </div>`;
  }

  function renderEnvironmentPanel(env) {
    return `
      <div class="glass rounded-xl p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div class="label">Environment</div>
            <div class="font-display font-bold text-lg">${escapeHtml(env)}</div>
            <div class="text-[12px] text-arena-muted mt-1">Production switch requires admin two-factor confirmation.</div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button data-action="set-environment" data-env="Seed" class="btn-secondary text-[12px]" ${env === 'Seed' ? 'disabled' : ''}>${icon('database', 'text-[13px]')} Seed</button>
            <button data-action="set-environment" data-env="Production" class="btn-primary text-[12px]" ${env === 'Production' ? 'disabled' : ''}>${icon('shield-alert', 'text-[13px]')} Production</button>
          </div>
        </div>
      </div>`;
  }

  function renderAppIdentityPanel(cfg) {
    const logo = configValue(cfg, 'app.logo', null);
    const logoSrc = logo && typeof logo === 'object' ? logo.src : null;
    return `
      <form id="settings-identity-form" class="glass rounded-xl p-4">
        <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div class="label">App Settings</div>
            <div class="font-display font-bold text-lg">Identity, theme, timezone</div>
          </div>
          <button type="submit" class="btn-primary text-[12px]">${icon('save', 'text-[13px]')} Save</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-[110px_minmax(0,1fr)] gap-4">
          <div>
            <div class="w-[88px] h-[88px] rounded-xl bg-white/[0.04] border border-white/10 grid place-items-center overflow-hidden">
              ${logoSrc ? `<img src="${escapeHtml(logoSrc)}" alt="App logo preview" class="w-full h-full object-contain p-2" />` : icon('image', 'text-[24px] text-arena-muted')}
            </div>
            <input id="app-logo-file" type="file" accept="image/png,image/svg+xml" class="mt-2 text-[11px] w-full" />
          </div>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            ${settingsTextInput('app.name', 'App name', configValue(cfg, 'app.name', ''))}
            ${settingsTextInput('theme.primaryColor', 'Theme primary colour', configValue(cfg, 'theme.primaryColor', '#7c5cff'), 'color')}
            ${settingsTextInput('timezone', 'Timezone', configValue(cfg, 'timezone', 'Asia/Calcutta'))}
          </div>
        </div>
      </form>`;
  }

  function renderPwaManifestPanel(cfg) {
    return `
      <form id="settings-pwa-form" class="glass rounded-xl p-4">
        <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div class="label">PWA Settings</div>
            <div class="font-display font-bold text-lg">Manifest fields and validated icons</div>
          </div>
          <button type="submit" class="btn-primary text-[12px]">${icon('save', 'text-[13px]')} Save</button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          ${settingsTextInput('manifest.name', 'Manifest name', configValue(cfg, 'manifest.name', ''))}
          ${settingsTextInput('manifest.short_name', 'Short name', configValue(cfg, 'manifest.short_name', ''))}
          ${settingsSelect('manifest.display', 'Display mode', configValue(cfg, 'manifest.display', 'standalone'), ['standalone', 'fullscreen', 'minimal-ui', 'browser'])}
          ${settingsTextInput('manifest.start_url', 'Start URL', configValue(cfg, 'manifest.start_url', './index.html'))}
          ${settingsTextInput('manifest.theme_color', 'Theme colour', configValue(cfg, 'manifest.theme_color', '#05060a'), 'color')}
          ${settingsTextInput('manifest.background_color', 'Background colour', configValue(cfg, 'manifest.background_color', '#05060a'), 'color')}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
          ${renderPwaIconSlot(192, cfg)}
          ${renderPwaIconSlot(512, cfg)}
        </div>
        ${state.settingsUi.iconMessage ? `<div class="mt-3 text-[12px] text-arena-muted">${escapeHtml(state.settingsUi.iconMessage)}</div>` : ''}
      </form>`;
  }

  function renderPwaIconSlot(size, cfg) {
    const value = configValue(cfg, `pwa.icon.${size}`, null);
    const uploaded = value && typeof value === 'object' && value.src;
    return `
      <div class="rounded-xl border border-white/10 bg-white/[0.025] p-3">
        <div class="flex items-center gap-3">
          <div class="w-14 h-14 rounded-lg bg-white/[0.04] border border-white/10 grid place-items-center overflow-hidden">
            ${uploaded ? `<img src="${escapeHtml(value.src)}" alt="${size} icon preview" class="w-full h-full object-contain" />` : icon('image-up', 'text-[18px] text-arena-muted')}
          </div>
          <div class="min-w-0 flex-1">
            <div class="font-semibold text-[13px]">${size} x ${size} icon</div>
            <div class="text-[11px] text-arena-muted truncate">${escapeHtml(uploaded ? (value.filename || value.sizes) : 'PNG required')}</div>
            <input data-pwa-icon-size="${size}" type="file" accept="image/png" class="mt-2 text-[11px] w-full" />
          </div>
        </div>
      </div>`;
  }

  function renderFeatureFlagsPanel(flags) {
    const rows = (flags || []).map(flag => `
      <tr data-flag-row="${escapeHtml(flag.Flag_ID)}">
        <td class="px-3 py-2 border-t border-white/8 align-top">
          <div class="font-semibold text-[12px]">${escapeHtml(flag.Flag_Label || flag.Flag_Key)}</div>
          <div class="text-[11px] text-arena-muted">${escapeHtml(flag.Flag_Key)}</div>
        </td>
        <td class="px-3 py-2 border-t border-white/8 align-top">
          <input data-flag-id="${escapeHtml(flag.Flag_ID)}" data-flag-field="Enabled" type="checkbox" ${flag.Enabled ? 'checked' : ''} />
        </td>
        <td class="px-3 py-2 border-t border-white/8 align-top">
          <select data-flag-id="${escapeHtml(flag.Flag_ID)}" data-flag-field="Scope" class="w-full min-w-[110px] rounded-lg bg-slate-950 border border-white/10 px-2 py-1.5 text-[12px] outline-none focus:border-arena-gold/60">
            ${['All', 'Role', 'Team'].map(scope => optionHtml(scope, scope, flag.Scope || 'All')).join('')}
          </select>
        </td>
        <td class="px-3 py-2 border-t border-white/8 align-top">
          <select data-flag-id="${escapeHtml(flag.Flag_ID)}" data-flag-field="Scope_Role" class="w-full min-w-[120px] rounded-lg bg-slate-950 border border-white/10 px-2 py-1.5 text-[12px] outline-none focus:border-arena-gold/60" ${flag.Scope === 'Role' ? '' : 'disabled'}>
            ${settingsRoleOptions(flag.Scope_Role || '')}
          </select>
        </td>
        <td class="px-3 py-2 border-t border-white/8 align-top">
          <select data-flag-id="${escapeHtml(flag.Flag_ID)}" data-flag-field="Scope_Team_ID" class="w-full min-w-[170px] rounded-lg bg-slate-950 border border-white/10 px-2 py-1.5 text-[12px] outline-none focus:border-arena-gold/60" ${flag.Scope === 'Team' ? '' : 'disabled'}>
            ${settingsTeamOptions(flag.Scope_Team_ID || '')}
          </select>
        </td>
        <td class="px-3 py-2 border-t border-white/8 align-top text-[12px] text-arena-muted">${escapeHtml(formatDateShort(flag.Modified_Date))}</td>
      </tr>`).join('');
    return `
      <div class="glass rounded-xl p-4 overflow-hidden">
        <div class="label">Feature_Flags</div>
        <div class="font-display font-bold text-lg mb-3">Feature scope</div>
        <div class="overflow-x-auto">
          <table class="w-full min-w-[820px] border-separate border-spacing-0">
            <thead>
              <tr>${['Feature', 'Enabled', 'Scope', 'Role', 'Team', 'Modified'].map(head => `<th class="px-3 py-2 text-left text-[10px] uppercase tracking-[0.14em] text-arena-muted">${escapeHtml(head)}</th>`).join('')}</tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="6" class="px-3 py-4 border-t border-white/8 text-[12px] text-arena-muted">No feature flags.</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
  }

  function renderIntegrationPanel(cfg) {
    const health = state.settingsUi.endpointHealth || [];
    return `
      <form id="settings-integration-form" class="glass rounded-xl p-4">
        <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div class="label">Integration Endpoints</div>
            <div class="font-display font-bold text-lg">API and feed health</div>
          </div>
          <div class="flex flex-wrap gap-2">
            <button type="button" data-action="run-health-check" class="btn-secondary text-[12px]">${icon('activity', 'text-[13px]')} Health check</button>
            <button type="submit" class="btn-primary text-[12px]">${icon('save', 'text-[13px]')} Save</button>
          </div>
        </div>
        <div class="space-y-3">
          ${settingsTextInput('api.baseUrl', 'REST API base URL', configValue(cfg, 'api.baseUrl', '/api'))}
          ${settingsTextInput('integrations.authProviderUrl', 'Auth-provider endpoint', configValue(cfg, 'integrations.authProviderUrl', ''))}
          ${settingsTextInput('integrations.wfmFeedUrl', 'WFM feed URL', configValue(cfg, 'integrations.wfmFeedUrl', ''))}
          ${settingsTextInput('integrations.crmFeedUrl', 'CRM feed URL', configValue(cfg, 'integrations.crmFeedUrl', ''))}
          ${settingsTextInput('integrations.qaFeedUrl', 'QA feed URL', configValue(cfg, 'integrations.qaFeedUrl', ''))}
          ${settingsTextInput('integrations.financeFeedUrl', 'Finance feed URL', configValue(cfg, 'integrations.financeFeedUrl', ''))}
        </div>
        <div class="mt-4 space-y-2">
          ${health.length ? health.map(renderEndpointHealthRow).join('') : '<div class="text-[12px] text-arena-muted">Run a health check to validate configured endpoint URLs.</div>'}
        </div>
      </form>`;
  }

  function renderEndpointHealthRow(row) {
    const good = row.status === 'green';
    return `
      <div class="flex items-start justify-between gap-3 rounded-lg border ${good ? 'border-emerald-300/20 bg-emerald-400/[0.05]' : 'border-red-300/20 bg-red-400/[0.05]'} p-2">
        <div class="min-w-0">
          <div class="font-semibold text-[12px]">${escapeHtml(row.label || row.key)}</div>
          <div class="text-[11px] text-arena-muted truncate">${escapeHtml(row.url || 'Not configured')}</div>
        </div>
        <div class="chip border ${good ? 'border-emerald-300/25 text-emerald-100' : 'border-red-300/25 text-red-100'}">${escapeHtml(good ? 'green' : 'red')}</div>
      </div>`;
  }

  function renderSettingsVersions(config, versions) {
    const keys = (config || []).map(row => row.Config_Key).sort();
    const selected = keys.includes(state.settingsUi.versionKey) ? state.settingsUi.versionKey : (keys[0] || '');
    const current = (config || []).find(row => row.Config_Key === selected);
    const rows = (versions || [])
      .filter(row => row.Config_Key === selected)
      .sort((a, b) => Number(b.Version || 0) - Number(a.Version || 0))
      .slice(0, 8);
    return `
      <div class="glass rounded-xl p-4 overflow-hidden">
        <div class="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <div class="label">Settings Versions</div>
            <div class="font-display font-bold text-lg">Reversible config history</div>
          </div>
          <select id="settings-version-key" class="max-w-[220px] rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">
            ${keys.map(key => optionHtml(key, key, selected)).join('')}
          </select>
        </div>
        <div class="space-y-2">
          ${rows.map(row => {
            const isCurrent = current && Number(current.Version || 1) === Number(row.Version || 1);
            return `
              <div class="rounded-lg border border-white/10 bg-white/[0.025] p-2">
                <div class="flex items-center justify-between gap-2">
                  <div class="min-w-0">
                    <div class="font-semibold text-[12px]">Version ${escapeHtml(row.Version || 1)} ${isCurrent ? '(current)' : ''}</div>
                    <div class="text-[11px] text-arena-muted truncate">${escapeHtml(settingValuePreview(row.Config_Value))}</div>
                  </div>
                  <button data-action="revert-setting-version" data-config-key="${escapeHtml(row.Config_Key)}" data-version="${escapeHtml(row.Version || 1)}" class="btn-secondary text-[11px]" ${isCurrent ? 'disabled' : ''}>${icon('rotate-ccw', 'text-[12px]')} Revert</button>
                </div>
              </div>`;
          }).join('') || '<div class="text-[12px] text-arena-muted">No versions for this setting.</div>'}
        </div>
      </div>`;
  }

  function settingsTextInput(name, label, value, type = 'text') {
    return `
      <label class="block">
        <span class="label">${escapeHtml(label)}</span>
        <input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value == null ? '' : value)}" class="w-full mt-1 rounded-lg bg-white/[0.04] border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60" />
      </label>`;
  }

  function settingsSelect(name, label, value, options) {
    return `
      <label class="block">
        <span class="label">${escapeHtml(label)}</span>
        <select name="${escapeHtml(name)}" class="w-full mt-1 rounded-lg bg-slate-950 border border-white/10 px-3 py-2 text-sm outline-none focus:border-arena-gold/60">
          ${(options || []).map(option => optionHtml(option, option, value)).join('')}
        </select>
      </label>`;
  }

  function configByKey(rows) {
    return (rows || []).reduce((map, row) => {
      map[row.Config_Key] = row;
      return map;
    }, {});
  }

  function configValue(cfg, key, fallback) {
    return cfg && cfg[key] ? cfg[key].Config_Value : fallback;
  }

  function endpointConfigRows(config) {
    return (config || []).filter(row => row.Config_Key === 'api.baseUrl' || /^integrations\./.test(row.Config_Key));
  }

  function healthyEndpointCount() {
    return (state.settingsUi.endpointHealth || []).filter(row => row.status === 'green').length;
  }

  function settingsRoleOptions(selected) {
    return optionHtml('', 'Select role', selected) + ['Agent', 'TL', 'Manager', 'Admin'].map(role => optionHtml(role, role, selected)).join('');
  }

  function settingsTeamOptions(selected) {
    return optionHtml('', 'Select team', selected) + (state.teams || []).map(team => optionHtml(team.TeamID, `${team.TeamID} - ${team.TeamName || team.TeamID}`, selected)).join('');
  }

  function settingValuePreview(value) {
    if (value == null || value === '') return 'empty';
    if (typeof value === 'object') return JSON.stringify(value).slice(0, 120);
    return String(value).slice(0, 120);
  }

  function auditEntityOptions(selected) {
    const values = ['all', ...Array.from(new Set((state.audit || []).map(row => row.Entity_Affected).filter(Boolean))).sort()];
    return values.map(value => optionHtml(value, value === 'all' ? 'All entities' : value, selected || 'all')).join('');
  }

  function auditActionOptions(selected) {
    const defaults = ['CONFIG_UPDATE', 'CONFIG_REVERT', 'UPDATE', 'CREATE', 'DELETE', 'IMPORT_VALIDATE', 'IMPORT_COMMIT', 'IMPORT_REVERT', 'KPI_PUBLISH', 'SLA_PUBLISH'];
    const values = ['all', ...Array.from(new Set(defaults.concat((state.audit || []).map(row => row.Action_Type).filter(Boolean)))).sort()];
    return values.map(value => optionHtml(value, value === 'all' ? 'All actions' : value, selected || 'all')).join('');
  }

  function auditQueryString(limit) {
    const filters = state.auditFilters || {};
    const params = new URLSearchParams();
    params.set('limit', String(limit || 30));
    if (filters.search) params.set('search', filters.search);
    if (filters.entity && filters.entity !== 'all') params.set('entity', filters.entity);
    if (filters.action && filters.action !== 'all') params.set('action', filters.action);
    if (filters.adminUser && filters.adminUser !== 'all') params.set('adminUser', filters.adminUser);
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    return params.toString();
  }

  function auditPanel(title, rows) {
    return `
      <aside class="glass rounded-xl p-4 overflow-hidden">
        <div class="label">Admin_Audit_Log</div>
        <div class="font-display font-bold text-lg mb-3">${escapeHtml(title)}</div>
        ${auditTable(rows || [])}
      </aside>`;
  }

  function auditTable(rows) {
    return table(['Timestamp', 'Action', 'Entity', 'Record', 'Snapshot'], rows || [], row => [
      row.Timestamp ? row.Timestamp.replace('T', ' ').slice(0, 19) : '-',
      row.Action_Type,
      row.Entity_Affected,
      row.Record_ID || '-',
      snapshotLabel(row),
    ]);
  }

  function snapshotLabel(row) {
    const before = row.Before_Snapshot == null ? 'none' : 'before';
    const after = row.After_Snapshot == null ? 'none' : 'after';
    return `${before}/${after}`;
  }

  function table(headers, rows, mapRow) {
    const body = (rows || []).map(row => {
      const cells = mapRow(row);
      return `<tr>${cells.map(cell => `<td class="px-3 py-2 border-t border-white/8 text-[12px] align-top">${escapeHtml(cell)}</td>`).join('')}</tr>`;
    }).join('');
    return `
      <div class="overflow-x-auto">
        <table class="w-full min-w-[620px] border-separate border-spacing-0">
          <thead>
            <tr>${headers.map(head => `<th class="px-3 py-2 text-left text-[10px] uppercase tracking-[0.14em] text-arena-muted">${escapeHtml(head)}</th>`).join('')}</tr>
          </thead>
          <tbody>${body || `<tr><td colspan="${headers.length}" class="px-3 py-4 border-t border-white/8 text-[12px] text-arena-muted">No records.</td></tr>`}</tbody>
        </table>
      </div>`;
  }

  function openKpiPanel(mode, id) {
    state.kpiPanel = { mode: mode === 'edit' ? 'edit' : 'new', id: mode === 'edit' ? id : null };
    state.error = '';
    renderShell();
  }

  function nullableNumber(value) {
    const text = String(value == null ? '' : value).trim();
    if (!text) return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function collectKpiFormPayload(form) {
    const formData = new FormData(form);
    const roles = {
      Agent: formData.get('Visible_Agent') === 'on',
      TL: formData.get('Visible_TL') === 'on',
      Manager: formData.get('Visible_Manager') === 'on',
    };
    const visibleRoles = Object.keys(roles).filter(role => roles[role]);
    const active = formData.get('Active') === 'on';
    const weight = nullableNumber(formData.get('Weightage'));
    const payload = {
      KPI_Name: String(formData.get('KPI_Name') || '').trim(),
      KPI_Type: String(formData.get('KPI_Type') || '').trim(),
      Unit: String(formData.get('Unit') || '').trim(),
      Direction: String(formData.get('Direction') || 'Higher').trim() === 'Lower' ? 'Lower' : 'Higher',
      Target: nullableNumber(formData.get('Target')),
      Green_Threshold: nullableNumber(formData.get('Green_Threshold')),
      Amber_Threshold: nullableNumber(formData.get('Amber_Threshold')),
      Red_Threshold: nullableNumber(formData.get('Red_Threshold')),
      Weight: weight,
      Weightage: weight,
      Role_Visibility: roles,
      Visible_Agent: roles.Agent,
      Visible_TL: roles.TL,
      Visible_Manager: roles.Manager,
      Applicability: visibleRoles.length === 3 ? 'All' : visibleRoles.join(', '),
      Active: active,
      Status: active ? 'Active' : 'Retired',
      Effective_Date: String(formData.get('Effective_Date') || '').trim(),
      Description: String(formData.get('Description') || '').trim(),
      RAG_Recompute_Status: 'Pending Publish',
      RAG_Recompute_Queue: 'Pending Publish',
    };
    if (!payload.KPI_Name) throw new Error('KPI_Name is required.');
    return payload;
  }

  function collectKpiPreviewPayload(form) {
    const formData = new FormData(form);
    return {
      Direction: String(formData.get('Direction') || 'Higher'),
      Target: formData.get('Target'),
      Green_Threshold: formData.get('Green_Threshold'),
      Amber_Threshold: formData.get('Amber_Threshold'),
      Red_Threshold: formData.get('Red_Threshold'),
    };
  }

  function updateKpiPreview(form) {
    const target = document.getElementById('kpi-rag-preview');
    if (!target || !form) return;
    target.innerHTML = renderKpiRagPreview(collectKpiPreviewPayload(form));
  }

  function dependencyConfirmMessage(kpiId) {
    const deps = kpiDependenciesFor(kpiId);
    if (!deps.sla.length && !deps.missions.length) return '';
    const slaNames = deps.sla.slice(0, 4).map(row => row.Rule_ID || row.Rule_Name || row.KPI_Name).filter(Boolean).join(', ');
    const missionNames = deps.missions.slice(0, 4).map(row => row.Mission_ID || row.Mission_Name).filter(Boolean).join(', ');
    return [
      `${kpiId} is linked to ${deps.sla.length} active SLA rule(s) and ${deps.missions.length} active mission(s).`,
      slaNames ? `SLA: ${slaNames}` : '',
      missionNames ? `Missions: ${missionNames}` : '',
      'Retirement keeps historical Performance_Data intact but removes the KPI from active scorecards and leaderboards after publish.',
      'Continue?',
    ].filter(Boolean).join('\n');
  }

  async function saveKpiForm(form) {
    const editingId = state.kpiPanel.mode === 'edit' ? state.kpiPanel.id : null;
    const before = editingId ? (state.kpis || []).find(row => row.KPI_ID === editingId) : null;
    const payload = collectKpiFormPayload(form);
    if (before && isActiveKpi(before) && payload.Active === false) {
      const message = dependencyConfirmMessage(editingId);
      if (message && !window.confirm(message)) return;
    }
    state.notice = '';
    const saved = editingId
      ? await requestJson(`/admin/kpis/${encodeURIComponent(editingId)}`, { method: 'PATCH', body: payload })
      : await requestJson('/admin/kpis', { method: 'POST', body: payload });
    state.kpiPanel = { mode: 'edit', id: saved.KPI_ID };
    state.kpiPublish = { recomputation: 'Pending Publish', timestamp: new Date().toISOString() };
    state.notice = editingId ? `KPI ${saved.KPI_ID} updated. Publish to queue RAG recomputation.` : `KPI ${saved.KPI_ID} created. Publish to queue RAG recomputation.`;
    await loadView('kpis');
  }

  async function retireKpi(kpiId) {
    if (!kpiId) return;
    const message = dependencyConfirmMessage(kpiId) || `Retire KPI ${kpiId}? Historical Performance_Data rows will be retained.`;
    if (!window.confirm(message)) return;
    state.notice = '';
    await requestJson(`/admin/kpis/${encodeURIComponent(kpiId)}/retire`, { method: 'POST', body: {} });
    state.kpiPanel = { mode: 'edit', id: kpiId };
    state.kpiPublish = { recomputation: 'Pending Publish', timestamp: new Date().toISOString() };
    state.notice = `KPI ${kpiId} retired. Historical Performance_Data retained; publish to queue RAG recomputation.`;
    await loadView('kpis');
  }

  async function publishKpis() {
    state.notice = '';
    const result = await requestJson('/admin/kpis/publish', { method: 'POST', body: {} });
    state.kpiPublish = {
      recomputation: result?.recomputation || 'queued',
      timestamp: result?.queuedAt || new Date().toISOString(),
    };
    state.notice = 'KPI publish queued RAG recomputation and wrote audit snapshots.';
    await loadView('kpis');
  }

  async function setEnvironment(env) {
    state.notice = '';
    const body = { environment: env };
    if (env === 'Production') {
      const confirmed = window.confirm('Switch to Production environment? Admin two-factor confirmation is required.');
      if (!confirmed) return;
      const code = window.prompt('Two-factor code');
      if (!code) return;
      body.twoFactorCode = code;
    }
    await requestJson('/admin/settings/environment', { method: 'POST', body });
    state.notice = `Environment set to ${env}.`;
    await loadView('settings');
  }

  async function saveSettingsForm(form) {
    const config = collectSettingsConfig(form);
    await requestJson('/admin/settings', { method: 'PATCH', body: { config } });
    state.notice = 'Settings saved with a new reversible version.';
    await loadView('settings');
  }

  function collectSettingsConfig(form) {
    const formData = new FormData(form);
    const config = {};
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) continue;
      config[key] = String(value || '').trim();
    }
    return config;
  }

  async function saveLogoFile(file) {
    if (!file) return;
    if (!['image/png', 'image/svg+xml'].includes(file.type)) {
      throw new Error('App logo upload must be PNG or SVG.');
    }
    const dataUrl = await readFileAsDataUrl(file);
    await requestJson('/admin/settings', {
      method: 'PATCH',
      body: {
        config: {
          'app.logo': {
            src: dataUrl,
            filename: file.name,
            type: file.type,
            uploadedAt: new Date().toISOString(),
          },
        },
      },
    });
    state.notice = 'App logo uploaded.';
    await loadView('settings');
  }

  async function savePwaIconFile(file, size) {
    if (!file) return;
    const expected = Number(size);
    if (file.type !== 'image/png') throw new Error('PWA icons must be PNG files.');
    const dataUrl = await readFileAsDataUrl(file);
    const dimensions = await readImageDimensions(dataUrl);
    if (dimensions.width !== expected || dimensions.height !== expected) {
      throw new Error(`PWA icon must be exactly ${expected} x ${expected} px. Uploaded file is ${dimensions.width} x ${dimensions.height} px.`);
    }
    await requestJson('/admin/settings/icons', {
      method: 'POST',
      body: {
        size: expected,
        filename: file.name,
        mimeType: file.type,
        dataUrl,
        width: dimensions.width,
        height: dimensions.height,
      },
    });
    state.settingsUi.iconMessage = `${expected} x ${expected} icon uploaded and validated.`;
    await loadView('settings');
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('File read failed.'));
      reader.readAsDataURL(file);
    });
  }

  function readImageDimensions(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error('Image dimensions could not be read.'));
      image.src = dataUrl;
    });
  }

  async function runHealthCheck() {
    state.settingsUi.endpointHealth = await requestJson('/admin/settings/health-check', { method: 'POST', body: {} });
    state.notice = 'Endpoint health check completed.';
    renderShell();
  }

  async function saveFeatureFlagInline(target) {
    const flagId = target.dataset.flagId;
    const payload = collectFeatureFlagPayload(flagId);
    await requestJson(`/admin/feature-flags/${encodeURIComponent(flagId)}`, { method: 'PATCH', body: payload });
    state.notice = 'Feature flag scope saved and audited.';
    await loadView('settings');
  }

  function updateFlagScopeControls(target) {
    const row = target.closest('[data-flag-row]');
    if (!row) return;
    const scope = target.value || 'All';
    const role = row.querySelector('[data-flag-field="Scope_Role"]');
    const team = row.querySelector('[data-flag-field="Scope_Team_ID"]');
    if (role) {
      role.disabled = scope !== 'Role';
      if (scope === 'Role' && !role.value) role.value = 'Manager';
    }
    if (team) {
      team.disabled = scope !== 'Team';
      if (scope === 'Team' && !team.value) team.value = (state.teams && state.teams[0] && state.teams[0].TeamID) || '';
    }
  }

  function collectFeatureFlagPayload(flagId) {
    const row = Array.from(document.querySelectorAll('[data-flag-row]')).find(candidate => candidate.dataset.flagRow === flagId);
    if (!row) throw new Error('Feature flag row was not found.');
    const enabled = row.querySelector('[data-flag-field="Enabled"]')?.checked || false;
    const scope = row.querySelector('[data-flag-field="Scope"]')?.value || 'All';
    const role = row.querySelector('[data-flag-field="Scope_Role"]')?.value || '';
    const team = row.querySelector('[data-flag-field="Scope_Team_ID"]')?.value || '';
    return {
      Enabled: enabled,
      Scope: scope,
      Scope_Role: scope === 'Role' ? role : null,
      Scope_Team_ID: scope === 'Team' ? team : null,
    };
  }

  async function revertSettingVersion(key, version) {
    const confirmed = window.confirm(`Revert ${key} to version ${version}? A new audited version will be created.`);
    if (!confirmed) return;
    await requestJson('/admin/settings/revert', {
      method: 'POST',
      body: { key, version: Number(version) },
    });
    state.notice = `${key} reverted to version ${version}.`;
    await loadView('settings');
  }

  async function applyAuditFilters(form) {
    const formData = new FormData(form);
    state.auditFilters = {
      ...state.auditFilters,
      search: String(formData.get('search') || '').trim(),
      entity: String(formData.get('entity') || 'all'),
      action: String(formData.get('action') || 'all'),
      from: String(formData.get('from') || ''),
    };
    state.audit = await requestJson(`/admin/audit-log?${auditQueryString(30)}`);
    renderShell();
  }

  async function exportAudit() {
    const response = await fetch(`${API_BASE}/admin/audit-log?${auditQueryString(5000)}&format=csv`, {
      headers: state.token ? { Authorization: `Bearer ${state.token}` } : {},
    });
    if (!response.ok) throw new Error(`CSV export failed: HTTP ${response.status}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'admin-audit-log.csv';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function collectSlaRulePayload(form) {
    const formData = new FormData(form);
    const payload = {
      KPI_ID: formText(formData, 'KPI_ID'),
      Account_ID: formText(formData, 'Account_ID') || 'HCA001',
      Target: nullableNumber(formData.get('Target')),
      Measurement_Period: formText(formData, 'Measurement_Period') || 'Monthly',
      Direction: formText(formData, 'Direction') === 'Lower' ? 'Lower' : 'Higher',
      Currency: formText(formData, 'Currency') || 'USD',
      Max_Penalty: nullableNumber(formData.get('Max_Penalty')),
      Max_Reward: nullableNumber(formData.get('Max_Reward')),
      Description: formText(formData, 'Description'),
    };
    if (!payload.KPI_ID) throw new Error('SLA rule must be linked to a KPI.');
    if (payload.Target == null) throw new Error('SLA rule Target is required.');
    return payload;
  }

  function collectSlaSlabPayload(form) {
    const formData = new FormData(form);
    const payload = {
      Variance_From: nullableNumber(formData.get('Variance_From')),
      Variance_To: nullableNumber(formData.get('Variance_To')),
      Impact_Type: formText(formData, 'Impact_Type') || 'Neutral',
      Penalty_Amount: nullableNumber(formData.get('Penalty_Amount')) || 0,
      Reward_Amount: nullableNumber(formData.get('Reward_Amount')) || 0,
      Description: formText(formData, 'Description'),
    };
    const slabId = formText(formData, 'Slab_ID');
    if (slabId) payload.Slab_ID = slabId;
    if (payload.Variance_From == null || payload.Variance_To == null) throw new Error('Slab variance range is required.');
    if (payload.Variance_From > payload.Variance_To) throw new Error('Slab Variance_From cannot be greater than Variance_To.');
    return payload;
  }

  function validateSlaSlabNonOverlap(ruleId, slabId, payload) {
    const rule = (state.slaRules || []).find(row => row.Rule_ID === ruleId);
    if (!rule) return;
    const candidateId = slabId || `new-${Date.now()}`;
    const rows = (rule.Slabs || [])
      .filter(row => !slabId || row.Slab_ID !== slabId)
      .concat({ ...(payload || {}), Slab_ID: candidateId, Rule_ID: ruleId })
      .map(row => ({
        slabId: row.Slab_ID,
        from: Number(row.Variance_From),
        to: Number(row.Variance_To),
      }))
      .sort((a, b) => a.from - b.from);
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!Number.isFinite(row.from) || !Number.isFinite(row.to) || row.from > row.to) {
        throw new Error(`Slab ${row.slabId} has an invalid variance range.`);
      }
      const previous = rows[index - 1];
      if (previous && row.from <= previous.to) {
        throw new Error(`Slab ${row.slabId} overlaps ${previous.slabId}.`);
      }
    }
  }

  async function saveSlaRule(form) {
    const ruleId = form.dataset.ruleId;
    const payload = collectSlaRulePayload(form);
    const saved = ruleId
      ? await requestJson(`/admin/sla-rules/${encodeURIComponent(ruleId)}`, { method: 'PATCH', body: payload })
      : await requestJson('/admin/sla-rules', { method: 'POST', body: payload });
    state.notice = `SLA rule ${saved.Rule_ID} saved. Publish to recompute commercial exposure.`;
    await loadView('sla');
  }

  async function saveSlaSlab(form) {
    const ruleId = form.dataset.ruleId;
    const slabId = form.dataset.slabId;
    const payload = collectSlaSlabPayload(form);
    validateSlaSlabNonOverlap(ruleId, slabId, payload);
    const saved = slabId
      ? await requestJson(`/admin/sla-rules/${encodeURIComponent(ruleId)}/slabs/${encodeURIComponent(slabId)}`, { method: 'PATCH', body: payload })
      : await requestJson(`/admin/sla-rules/${encodeURIComponent(ruleId)}/slabs`, { method: 'POST', body: payload });
    state.notice = `SLA slab ${saved.Slab_ID} saved. Publish ${ruleId} to recompute exposure.`;
    await loadView('sla');
  }

  async function deleteSlaSlab(ruleId, slabId) {
    if (!ruleId || !slabId) return;
    if (!window.confirm(`Delete slab ${slabId}?`)) return;
    await requestJson(`/admin/sla-rules/${encodeURIComponent(ruleId)}/slabs/${encodeURIComponent(slabId)}`, { method: 'DELETE', body: {} });
    state.notice = `SLA slab ${slabId} deleted. Publish ${ruleId} to recompute exposure.`;
    await loadView('sla');
  }

  async function publishSlaRule(ruleId) {
    if (!ruleId) return;
    const confirmed = window.confirm(`Publish ${ruleId} and recompute Commercial_Exposure and What_If_Scenarios?`);
    if (!confirmed) return;
    const result = await requestJson(`/admin/sla-rules/${encodeURIComponent(ruleId)}/publish`, { method: 'POST', body: {} });
    const recompute = result?.recomputation;
    state.notice = `SLA rule ${ruleId} published. Commercial_Exposure ${recompute?.Commercial_Exposure?.after || 0} row(s), What_If_Scenarios ${recompute?.What_If_Scenarios?.after || 0} row(s) recomputed.`;
    await loadView('sla');
  }

  async function revertSlaRule(ruleId) {
    if (!ruleId) return;
    const confirmed = window.confirm(`Revert ${ruleId} to the previous published version and recompute commercial models?`);
    if (!confirmed) return;
    await requestJson(`/admin/sla-rules/${encodeURIComponent(ruleId)}/revert`, { method: 'POST', body: {} });
    state.notice = `SLA rule ${ruleId} reverted to the previous published version.`;
    await loadView('sla');
  }

  function exportSlaConfig() {
    if (!window.XLSX) throw new Error('XLSX writer is unavailable.');
    const rules = (state.slaRules || []).map(rule => {
      const row = {};
      for (const [key, value] of Object.entries(rule || {})) {
        if (key === 'Slabs' || key === 'Published_Config_Snapshot' || key === 'Previous_Published_Config') continue;
        row[key] = value && typeof value === 'object' ? JSON.stringify(value) : value;
      }
      row.Previous_Published_Config_Available = rule.Previous_Published_Config ? 'Yes' : 'No';
      return row;
    });
    const slabs = (state.slaRules || []).flatMap(rule => (rule.Slabs || []).map(slab => ({ ...slab })));
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(rules), safeSheetName('SLA_Commercial_Rules'));
    window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(slabs), safeSheetName('Penalty_Reward_Slabs'));
    window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(state.commercialExposure || []), safeSheetName('Commercial_Exposure'));
    window.XLSX.utils.book_append_sheet(workbook, window.XLSX.utils.json_to_sheet(state.whatIfScenarios || []), safeSheetName('What_If_Scenarios'));
    window.XLSX.writeFile(workbook, 'ripple-sla-commercial-config.xlsx');
  }

  function formText(formData, name) {
    return String(formData.get(name) || '').trim();
  }

  function collectUserFormPayload(form) {
    const formData = new FormData(form);
    const active = formData.get('Active') === 'on';
    const team = teamById(formText(formData, 'TeamID'));
    const payload = {
      UserID: formText(formData, 'UserID'),
      Name: formText(formData, 'Name'),
      Role: roleLabel(formText(formData, 'Role')),
      TeamID: formText(formData, 'TeamID') || null,
      ProcessID: formText(formData, 'ProcessID') || team?.ProcessID || null,
      Location: formText(formData, 'Location') || team?.Location || null,
      ManagerID: formText(formData, 'ManagerID') || team?.ManagerID || null,
      Avatar: formText(formData, 'Avatar') || null,
      Active: active,
      Status: active ? 'Active' : 'Deactivated',
    };
    validateUserPayload(payload, null);
    return payload;
  }

  function collectTeamFormPayload(form) {
    const formData = new FormData(form);
    const active = formData.get('Active') === 'on';
    const payload = {
      TeamID: formText(formData, 'TeamID'),
      TeamName: formText(formData, 'TeamName'),
      ProcessID: formText(formData, 'ProcessID'),
      Shift: formText(formData, 'Shift') || null,
      Location: formText(formData, 'Location') || null,
      TeamLeadID: formText(formData, 'TeamLeadID') || null,
      TL_UserID: formText(formData, 'TeamLeadID') || null,
      ManagerID: formText(formData, 'ManagerID') || null,
      Active: active,
      Status: active ? 'Active' : 'Deactivated',
    };
    validateTeamPayload(payload, null);
    return payload;
  }

  async function addUser(form) {
    const payload = collectUserFormPayload(form);
    state.notice = '';
    await requestJson('/admin/users', { method: 'POST', body: payload });
    state.notice = `User ${payload.UserID} added.`;
    await loadView('people');
  }

  async function saveUserInline(control) {
    const userId = control.dataset.userId;
    const field = control.dataset.userField;
    const user = userById(userId);
    if (!user || !field) return;

    let value = control.type === 'checkbox' ? control.checked : control.value;
    const patch = {};
    if (field === 'Active') {
      patch.Active = Boolean(value);
      patch.Status = value ? 'Active' : 'Deactivated';
      if (!value) {
        const impact = cascadeImpactForUser(userId);
        enforceTlReassignmentBeforeDeactivate(user, impact);
        if (!requireCascadeConfirmation(`Deactivate ${user.Name || user.UserID}?`, impact)) return;
      }
    } else if (field === 'Role') {
      patch.Role = roleLabel(value);
    } else if (field === 'TeamID') {
      const team = teamById(value);
      patch.TeamID = value || null;
      if (team) {
        patch.ProcessID = team.ProcessID || user.ProcessID || null;
        patch.Location = user.Location || team.Location || null;
        patch.ManagerID = team.ManagerID || user.ManagerID || null;
      }
    } else {
      patch[field] = String(value || '').trim() || null;
    }

    validateUserPayload(patch, user);
    await requestJson(`/admin/users/${encodeURIComponent(userId)}`, { method: 'PATCH', body: patch });
    state.notice = `User ${userId} updated.`;
    await loadView('people');
  }

  async function deactivateUser(userId) {
    const user = userById(userId);
    if (!user) return;
    if (user.UserID === state.user?.UserID) throw new Error('You cannot deactivate the active admin session user.');
    const impact = cascadeImpactForUser(userId);
    enforceTlReassignmentBeforeDeactivate(user, impact);
    if (!requireCascadeConfirmation(`Deactivate ${user.Name || user.UserID}?`, impact)) return;
    await requestJson(`/admin/users/${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: { Active: false, Status: 'Deactivated' },
    });
    state.notice = `User ${userId} deactivated. They will no longer appear on role screens after sync.`;
    await loadView('people');
  }

  async function addTeam(form) {
    const payload = collectTeamFormPayload(form);
    state.notice = '';
    const saved = await requestJson('/admin/teams', { method: 'POST', body: payload });
    await syncTeamUserAssignments(null, saved);
    state.notice = `Team ${payload.TeamID} added.`;
    await loadView('people');
  }

  async function saveTeamInline(control) {
    const teamId = control.dataset.teamId;
    const field = control.dataset.teamField;
    const team = teamById(teamId);
    if (!team || !field) return;

    const patch = {};
    if (field === 'Active') {
      const active = control.checked;
      patch.Active = active;
      patch.Status = active ? 'Active' : 'Deactivated';
      if (!active && !requireCascadeConfirmation(`Deactivate team ${team.TeamName || team.TeamID}?`, cascadeImpactForTeam(teamId))) return;
    } else if (field === 'TeamLeadID') {
      patch.TeamLeadID = control.value || null;
      patch.TL_UserID = control.value || null;
    } else {
      patch[field] = String(control.value || '').trim() || null;
    }

    validateTeamPayload(patch, team);
    const before = { ...team };
    const saved = await requestJson(`/admin/teams/${encodeURIComponent(teamId)}`, { method: 'PATCH', body: patch });
    await syncTeamUserAssignments(before, saved);
    state.notice = `Team ${teamId} updated.`;
    await loadView('people');
  }

  async function deactivateTeam(teamId) {
    const team = teamById(teamId);
    if (!team) return;
    if (!requireCascadeConfirmation(`Deactivate team ${team.TeamName || team.TeamID}?`, cascadeImpactForTeam(teamId))) return;
    const saved = await requestJson(`/admin/teams/${encodeURIComponent(teamId)}`, {
      method: 'PATCH',
      body: { Active: false, Status: 'Deactivated' },
    });
    await syncTeamUserAssignments(team, saved);
    state.notice = `Team ${teamId} deactivated.`;
    await loadView('people');
  }

  async function syncTeamUserAssignments(beforeTeam, team) {
    if (!team?.TeamID) return;
    const updates = [];
    const teamId = team.TeamID;
    const oldLead = beforeTeam ? teamLeadId(beforeTeam) : null;
    const newLead = teamLeadId(team);
    const managerChanged = beforeTeam && beforeTeam.ManagerID !== team.ManagerID;
    const processChanged = beforeTeam && beforeTeam.ProcessID !== team.ProcessID;
    const leadChanged = beforeTeam ? oldLead !== newLead : Boolean(newLead);

    if (managerChanged || processChanged) {
      for (const user of usersForTeam(teamId)) {
        const patch = {};
        if (managerChanged) patch.ManagerID = team.ManagerID || null;
        if (processChanged) patch.ProcessID = team.ProcessID || null;
        if (Object.keys(patch).length) updates.push(requestJson(`/admin/users/${encodeURIComponent(user.UserID)}`, { method: 'PATCH', body: patch }));
      }
    }

    if (leadChanged && newLead) {
      for (const otherTeam of (state.teams || []).filter(row => row.TeamID !== teamId && teamLeadId(row) === newLead)) {
        updates.push(requestJson(`/admin/teams/${encodeURIComponent(otherTeam.TeamID)}`, {
          method: 'PATCH',
          body: { TeamLeadID: null, TL_UserID: null },
        }));
      }
      updates.push(requestJson(`/admin/users/${encodeURIComponent(newLead)}`, {
        method: 'PATCH',
        body: {
          Role: 'Team Lead',
          TeamID: teamId,
          ProcessID: team.ProcessID || null,
          Location: team.Location || userById(newLead)?.Location || null,
          ManagerID: team.ManagerID || null,
          Active: true,
          Status: 'Active',
        },
      }));
    }

    if (leadChanged && oldLead && oldLead !== newLead) {
      const oldLeadUser = userById(oldLead);
      if (oldLeadUser && oldLeadUser.TeamID === teamId) {
        updates.push(requestJson(`/admin/users/${encodeURIComponent(oldLead)}`, {
          method: 'PATCH',
          body: { TeamID: null, ProcessID: null },
        }));
      }
    }

    if (updates.length) await Promise.all(updates);
  }

  async function openPeopleImport(entity) {
    state.dataset.selectedEntity = entity;
    state.dataset.mode = 'upsert';
    await loadView('dataset');
  }

  function exportRoster() {
    const rows = filteredPeopleUsers().map(user => ({
      UserID: user.UserID,
      Name: user.Name,
      Role: roleLabel(user.Role),
      TeamID: user.TeamID || '',
      TeamName: userTeamName(user),
      ProcessID: user.ProcessID || '',
      ProcessName: userProcessName(user),
      Location: user.Location || '',
      ManagerID: user.ManagerID || '',
      ManagerName: userById(user.ManagerID)?.Name || '',
      Avatar: user.Avatar || '',
      Active: isActiveUser(user) ? 'Yes' : 'No',
      Status: user.Status || (isActiveUser(user) ? 'Active' : 'Inactive'),
    }));
    if (!rows.length) throw new Error('No roster rows match the current filters.');
    if (window.XLSX) {
      const worksheet = window.XLSX.utils.json_to_sheet(rows);
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, worksheet, 'Roster');
      window.XLSX.writeFile(workbook, 'ripple-user-roster.xlsx');
      return;
    }
    downloadCsv('ripple-user-roster.csv', rows);
  }

  function downloadCsv(filename, rows) {
    const headers = Object.keys(rows[0] || {});
    const csv = [
      headers.join(','),
      ...rows.map(row => headers.map(header => csvValue(row[header])).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function csvValue(value) {
    const text = String(value == null ? '' : value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  async function selectDatasetEntity(entity) {
    state.dataset.selectedEntity = entity;
    clearDatasetImport(false);
    state.error = '';
    state.loading = true;
    renderShell();
    try {
      await loadDatasetSelection();
      state.loading = false;
      renderShell();
    } catch (error) {
      state.loading = false;
      state.error = String(error.message || error);
      renderShell();
    }
  }

  function clearDatasetImport(shouldRender = true) {
    state.dataset.pendingUpload = null;
    state.dataset.validation = null;
    state.dataset.importLog = null;
    const input = document.getElementById('dataset-file-input');
    if (input) input.value = '';
    if (shouldRender) renderShell();
  }

  async function handleDatasetFile(file) {
    const selected = selectedDatasetEntity();
    if (!selected?.importable) throw new Error(`${selected?.entity || 'Selected entity'} is not enabled for direct import.`);
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) throw new Error('Upload file must be .xlsx.');
    if (!window.XLSX) throw new Error('XLSX parser is unavailable.');

    state.notice = '';
    state.error = '';
    const rows = await readWorkbookRows(file, selected.entity);
    const pendingUpload = { filename: file.name, rows };
    state.dataset.pendingUpload = pendingUpload;
    state.dataset.validation = null;
    state.dataset.importLog = null;
    renderShell();

    const payload = {
      entity: selected.entity,
      mode: state.dataset.mode,
      filename: file.name,
      rows,
    };
    try {
      const result = await requestJson('/imports/validate', { method: 'POST', body: payload });
      state.dataset.validation = result.validation;
      state.dataset.importLog = result.importLog;
    } catch (error) {
      if (error.status === 422 && error.data?.validation) {
        state.dataset.validation = error.data.validation;
        state.dataset.importLog = error.data.importLog;
      } else {
        throw error;
      }
    }
    state.imports = await requestJson('/imports?limit=500');
    renderShell();
  }

  async function readWorkbookRows(file, entity) {
    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: 'array', cellDates: false });
    const sheetName = workbook.SheetNames.find(name => name.toLowerCase() === entity.toLowerCase()) || workbook.SheetNames[0];
    if (!sheetName) throw new Error('Workbook has no worksheets.');
    const worksheet = workbook.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false })
      .map(cleanWorkbookRow)
      .filter(row => Object.keys(row).length && !Object.values(row).every(value => value == null || String(value).trim() === ''));
    if (!rows.length) throw new Error(`Worksheet ${sheetName} has no data rows.`);
    return rows;
  }

  function cleanWorkbookRow(row) {
    const cleaned = {};
    for (const [key, value] of Object.entries(row || {})) {
      const name = String(key || '').trim();
      if (!name) continue;
      cleaned[name] = typeof value === 'string' ? value.trim() : value;
    }
    return cleaned;
  }

  async function commitDatasetImport() {
    if (!state.dataset.importLog?.Import_ID || !state.dataset.validation?.valid) return;
    state.notice = '';
    await requestJson('/imports/commit', {
      method: 'POST',
      body: { importId: state.dataset.importLog.Import_ID },
    });
    state.notice = `Import ${state.dataset.importLog.Import_ID} committed.`;
    clearDatasetImport(false);
    state.entities = await requestJson('/entities');
    await loadDatasetSelection();
    renderShell();
  }

  async function revertDatasetImport(importId) {
    if (!importId) return;
    const confirmed = window.confirm(`Revert import ${importId}?`);
    if (!confirmed) return;
    state.notice = '';
    await requestJson(`/imports/${encodeURIComponent(importId)}/revert`, { method: 'POST', body: {} });
    state.notice = `Import ${importId} reverted.`;
    state.entities = await requestJson('/entities');
    await loadDatasetSelection();
    renderShell();
  }

  function downloadDatasetTemplate() {
    const selected = selectedDatasetEntity();
    const columns = selected?.schema?.columns || [];
    if (!selected || !columns.length) throw new Error('No schema is available for the selected entity.');
    if (!window.XLSX) throw new Error('XLSX writer is unavailable.');
    const headers = columns.map(column => column.name);
    const worksheet = window.XLSX.utils.aoa_to_sheet([headers]);
    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(selected.entity));
    window.XLSX.writeFile(workbook, `${selected.entity}_template.xlsx`);
  }

  function safeSheetName(name) {
    return String(name || 'Template').replace(/[\\/?*[\]:]/g, '_').slice(0, 31) || 'Template';
  }

  function bindEvents() {
    document.body.addEventListener('submit', async (event) => {
      if (event.target.id === 'admin-login-form') {
        event.preventDefault();
        const input = document.getElementById('admin-user-id');
        await login((input?.value || '').trim());
        return;
      }
      if (event.target.id === 'kpi-form') {
        event.preventDefault();
        try {
          await saveKpiForm(event.target);
        } catch (error) {
          state.error = String(error.message || error);
          renderShell();
        }
      }
      if (event.target.id === 'settings-identity-form' || event.target.id === 'settings-pwa-form' || event.target.id === 'settings-integration-form') {
        event.preventDefault();
        try {
          await saveSettingsForm(event.target);
        } catch (error) {
          state.error = String(error.message || error);
          renderShell();
        }
      }
      if (event.target.id === 'audit-filter-form') {
        event.preventDefault();
        try {
          await applyAuditFilters(event.target);
        } catch (error) {
          state.error = String(error.message || error);
          renderShell();
        }
      }
      if (event.target.id === 'people-add-user-form') {
        event.preventDefault();
        try {
          await addUser(event.target);
        } catch (error) {
          state.error = String(error.message || error);
          renderShell();
        }
      }
      if (event.target.id === 'people-add-team-form') {
        event.preventDefault();
        try {
          await addTeam(event.target);
        } catch (error) {
          state.error = String(error.message || error);
          renderShell();
        }
      }
      if (event.target.id === 'gamification-form') {
        event.preventDefault();
        try {
          await saveGamificationForm(event.target);
        } catch (error) {
          state.error = String(error.message || error);
          renderShell();
        }
      }
      if (event.target.id === 'sla-new-rule-form' || event.target.dataset.slaRuleForm) {
        event.preventDefault();
        try {
          await saveSlaRule(event.target);
        } catch (error) {
          state.error = String(error.message || error);
          renderShell();
        }
      }
      if (event.target.dataset.slaSlabForm) {
        event.preventDefault();
        try {
          await saveSlaSlab(event.target);
        } catch (error) {
          state.error = String(error.message || error);
          renderShell();
        }
      }
    });

    document.body.addEventListener('click', async (event) => {
      const nav = event.target.closest('[data-admin-nav]');
      if (nav) {
        state.notice = '';
        await loadView(nav.dataset.adminNav);
        return;
      }

      const datasetEntity = event.target.closest('[data-dataset-entity]');
      if (datasetEntity) {
        await selectDatasetEntity(datasetEntity.dataset.datasetEntity);
        return;
      }

      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      try {
        if (action === 'logout') await logout();
        else if (action === 'refresh-view') await loadView(state.view);
        else if (action === 'add-kpi') openKpiPanel('new');
        else if (action === 'edit-kpi') openKpiPanel('edit', button.dataset.kpiId);
        else if (action === 'retire-kpi') await retireKpi(button.dataset.kpiId);
        else if (action === 'publish-kpis') await publishKpis();
        else if (action === 'set-environment') await setEnvironment(button.dataset.env);
        else if (action === 'run-health-check') await runHealthCheck();
        else if (action === 'revert-setting-version') await revertSettingVersion(button.dataset.configKey, button.dataset.version);
        else if (action === 'export-audit') await exportAudit();
        else if (action === 'export-roster') exportRoster();
        else if (action === 'deactivate-user') await deactivateUser(button.dataset.userId);
        else if (action === 'deactivate-team') await deactivateTeam(button.dataset.teamId);
        else if (action === 'people-open-import') await openPeopleImport(button.dataset.entity);
        else if (action === 'choose-dataset-file') document.getElementById('dataset-file-input')?.click();
        else if (action === 'download-template') downloadDatasetTemplate();
        else if (action === 'commit-import') await commitDatasetImport();
        else if (action === 'clear-import') clearDatasetImport();
        else if (action === 'revert-import') await revertDatasetImport(button.dataset.importId);
        else if (action === 'set-gamification-tab') openGamificationTab(button.dataset.gamificationTab);
        else if (action === 'add-gamification') openGamificationPanel(button.dataset.gamificationEntity, 'new');
        else if (action === 'edit-gamification') openGamificationPanel(button.dataset.gamificationEntity, 'edit', button.dataset.recordId);
        else if (action === 'deactivate-gamification') await deactivateGamificationRecord(button.dataset.gamificationEntity, button.dataset.recordId);
        else if (action === 'approve-redemption') await settleRewardRedemption(button.dataset.redemptionId, 'approve');
        else if (action === 'reject-redemption') await settleRewardRedemption(button.dataset.redemptionId, 'reject');
        else if (action === 'publish-sla-rule') await publishSlaRule(button.dataset.ruleId);
        else if (action === 'revert-sla-rule') await revertSlaRule(button.dataset.ruleId);
        else if (action === 'delete-sla-slab') await deleteSlaSlab(button.dataset.ruleId, button.dataset.slabId);
        else if (action === 'export-sla-config') exportSlaConfig();
        else if (action === 'try-admin-login') {
          clearStoredSession();
          renderLogin();
        } else if (action === 'go-main') {
          window.location.href = '../';
        }
      } catch (error) {
        state.error = String(error.message || error);
        renderShell();
      }
    });

    document.body.addEventListener('change', async (event) => {
      try {
        if (event.target.id === 'dataset-mode') {
          state.dataset.mode = event.target.value;
          clearDatasetImport(false);
          renderShell();
        } else if (event.target.id === 'dataset-history-status') {
          state.dataset.historyStatus = event.target.value;
          renderShell();
        } else if (event.target.dataset.peopleFilter) {
          const key = event.target.dataset.peopleFilter;
          state.people.filters[key] = event.target.value;
          renderShell();
        } else if (event.target.id === 'settings-version-key') {
          state.settingsUi.versionKey = event.target.value;
          renderShell();
        } else if (event.target.id === 'app-logo-file') {
          await saveLogoFile(event.target.files && event.target.files[0]);
        } else if (event.target.dataset.pwaIconSize) {
          await savePwaIconFile(event.target.files && event.target.files[0], event.target.dataset.pwaIconSize);
        } else if (event.target.dataset.flagField) {
          if (event.target.dataset.flagField === 'Scope') updateFlagScopeControls(event.target);
          await saveFeatureFlagInline(event.target);
        } else if (event.target.id === 'dataset-file-input') {
          await handleDatasetFile(event.target.files && event.target.files[0]);
        } else if (event.target.dataset.userField) {
          await saveUserInline(event.target);
        } else if (event.target.dataset.teamField) {
          await saveTeamInline(event.target);
        } else if (event.target.closest('#kpi-form')) {
          updateKpiPreview(event.target.form);
        }
      } catch (error) {
        state.error = String(error.message || error);
        renderShell();
      }
    });

    document.body.addEventListener('input', (event) => {
      const form = event.target.closest('#kpi-form');
      if (form && event.target.hasAttribute('data-kpi-preview-field')) updateKpiPreview(form);
    });
  }

  window.RippleAdmin = {
    boot() {
      bindEvents();
      return verifyStoredSession();
    },
  };
})();
