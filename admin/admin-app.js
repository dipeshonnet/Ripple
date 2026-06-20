/* eslint-disable */
(function () {
  'use strict';

  const API_BASE = '/api';
  const SESSION_KEY = 'ripple_admin_session_v1';
  const NAV = [
    { id: 'dashboard', label: 'Dashboard', icon: 'layout-dashboard' },
    { id: 'kpis', label: 'KPI Manager', icon: 'gauge-circle' },
    { id: 'people', label: 'Users & Teams', icon: 'users' },
    { id: 'settings', label: 'Settings', icon: 'sliders-horizontal' },
    { id: 'audit', label: 'Audit Log', icon: 'shield-check' },
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
    users: [],
    teams: [],
    settings: null,
    audit: [],
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

  async function loadView(view) {
    state.view = view || state.view || 'dashboard';
    state.loading = true;
    state.error = '';
    renderShell();
    try {
      if (state.view === 'dashboard') {
        state.dashboard = await requestJson('/admin/dashboard');
        state.settings = await requestJson('/admin/settings');
        state.audit = await requestJson('/admin/audit-log?limit=8');
      } else if (state.view === 'kpis') {
        state.kpis = await requestJson('/admin/kpis?limit=12');
        state.audit = await requestJson('/admin/audit-log?entity=KPI_Master&limit=8');
      } else if (state.view === 'people') {
        state.users = await requestJson('/admin/users?limit=12');
        state.teams = await requestJson('/admin/teams?limit=8');
      } else if (state.view === 'settings') {
        state.settings = await requestJson('/admin/settings');
        state.audit = await requestJson('/admin/audit-log?entity=App_Config&limit=8');
      } else if (state.view === 'audit') {
        state.audit = await requestJson('/admin/audit-log?limit=30');
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
          <nav class="mt-5 grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-1 gap-1.5">
            ${NAV.map(item => `
              <button data-admin-nav="${item.id}" class="nav-item ${state.view === item.id ? 'active' : ''} flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] font-semibold text-arena-muted hover:text-arena-text">
                ${icon(item.icon, 'text-[15px]')} <span>${escapeHtml(item.label)}</span>
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
    if (state.view === 'kpis') return renderKpis();
    if (state.view === 'people') return renderPeople();
    if (state.view === 'settings') return renderSettings();
    if (state.view === 'audit') return renderAudit();
    return renderDashboard();
  }

  function renderDashboard() {
    const d = state.dashboard || {};
    const settings = state.settings || {};
    const env = settings.environment || d.environment || 'Seed';
    const metrics = [
      ['Active users', d.activeUserCount],
      ['Active KPIs', d.kpiCatalogue?.active],
      ['Import queue', d.importQueueDepth],
      ['Reward approvals', d.pendingRewardApprovals],
      ['Open coaching', d.openCoachingRecords],
      ['Environment', env],
    ];
    return `
      <section class="grid grid-cols-2 lg:grid-cols-6 gap-3">
        ${metrics.map(([label, value]) => metricTile(label, value)).join('')}
      </section>
      <section class="mt-4 grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4">
        <div class="glass rounded-xl p-4">
          <div class="flex items-center justify-between gap-2">
            <div>
              <div class="label">Quick launch</div>
              <div class="font-display font-bold text-lg">Admin modules</div>
            </div>
            <div class="chip ${env === 'Production' ? 'rag-red-bg' : 'rag-green-bg'}">${escapeHtml(env)}</div>
          </div>
          <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 mt-4">
            ${NAV.filter(item => item.id !== 'dashboard').map(item => `
              <button data-admin-nav="${item.id}" class="rounded-xl border border-white/10 bg-white/[0.035] hover:bg-white/[0.06] px-3 py-3 text-left">
                ${icon(item.icon, 'text-[17px] text-arena-gold')}
                <div class="mt-2 text-[13px] font-bold">${escapeHtml(item.label)}</div>
              </button>
            `).join('')}
          </div>
        </div>
        ${auditPanel('Recent admin writes', state.audit)}
      </section>`;
  }

  function metricTile(label, value) {
    return `
      <div class="glass rounded-xl p-3 min-h-[86px]">
        <div class="label">${escapeHtml(label)}</div>
        <div class="hero-num text-2xl mt-1">${escapeHtml(value == null ? '-' : value)}</div>
      </div>`;
  }

  function renderKpis() {
    return `
      <section class="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4">
        <div class="glass rounded-xl p-4 overflow-hidden">
          <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <div class="label">KPI_Master</div>
              <div class="font-display font-bold text-lg">KPI catalogue</div>
            </div>
            <button data-action="publish-kpis" class="btn-primary text-[12px]">${icon('send', 'text-[13px]')} Publish</button>
          </div>
          ${table(['KPI_ID', 'KPI_Name', 'Target', 'Direction', 'Active'], state.kpis, row => [
            row.KPI_ID,
            row.KPI_Name,
            row.Target,
            row.Direction,
            row.Active === false || row.Status === 'Retired' ? 'No' : 'Yes',
          ])}
        </div>
        ${auditPanel('KPI audit trail', state.audit)}
      </section>`;
  }

  function renderPeople() {
    return `
      <section class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div class="glass rounded-xl p-4 overflow-hidden">
          <div class="label">Users</div>
          <div class="font-display font-bold text-lg mb-3">Roster</div>
          ${table(['UserID', 'Name', 'Role', 'TeamID', 'Status'], state.users, row => [
            row.UserID,
            row.Name,
            row.Role,
            row.TeamID || '-',
            row.Status || (row.Active === false ? 'Inactive' : 'Active'),
          ])}
        </div>
        <div class="glass rounded-xl p-4 overflow-hidden">
          <div class="label">Teams</div>
          <div class="font-display font-bold text-lg mb-3">Team structure</div>
          ${table(['TeamID', 'TeamName', 'ProcessID', 'ManagerID', 'TL_UserID'], state.teams, row => [
            row.TeamID,
            row.TeamName,
            row.ProcessID,
            row.ManagerID,
            row.TL_UserID || row.TeamLeadID || '-',
          ])}
        </div>
      </section>`;
  }

  function renderSettings() {
    const settings = state.settings || {};
    const config = settings.appConfig || [];
    const flags = settings.featureFlags || [];
    const env = settings.environment || 'Seed';
    return `
      <section class="grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-4">
        <div class="space-y-4">
          <div class="glass rounded-xl p-4">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div class="label">Environment</div>
                <div class="font-display font-bold text-lg">${escapeHtml(env)}</div>
              </div>
              <div class="flex flex-wrap gap-2">
                <button data-action="set-environment" data-env="Seed" class="btn-secondary text-[12px]">${icon('database', 'text-[13px]')} Seed</button>
                <button data-action="set-environment" data-env="Production" class="btn-primary text-[12px]">${icon('shield-alert', 'text-[13px]')} Production</button>
              </div>
            </div>
          </div>
          <div class="glass rounded-xl p-4 overflow-hidden">
            <div class="label">App_Config</div>
            <div class="font-display font-bold text-lg mb-3">Configuration values</div>
            ${table(['Config_Key', 'Config_Value', 'Value_Type', 'Version'], config, row => [
              row.Config_Key,
              typeof row.Config_Value === 'object' ? JSON.stringify(row.Config_Value) : row.Config_Value,
              row.Value_Type,
              row.Version,
            ])}
          </div>
          <div class="glass rounded-xl p-4 overflow-hidden">
            <div class="label">Feature_Flags</div>
            <div class="font-display font-bold text-lg mb-3">Feature scope</div>
            ${table(['Flag_Key', 'Enabled', 'Scope', 'Scope_Role'], flags, row => [
              row.Flag_Key,
              row.Enabled ? 'Yes' : 'No',
              row.Scope,
              row.Scope_Role || '-',
            ])}
          </div>
        </div>
        ${auditPanel('Settings audit trail', state.audit)}
      </section>`;
  }

  function renderAudit() {
    return `
      <section class="glass rounded-xl p-4 overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div>
            <div class="label">Admin_Audit_Log</div>
            <div class="font-display font-bold text-lg">Last 90 days</div>
          </div>
          <button data-action="export-audit" class="btn-secondary text-[12px]">${icon('download', 'text-[13px]')} CSV</button>
        </div>
        ${auditTable(state.audit)}
      </section>`;
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

  async function publishKpis() {
    state.notice = '';
    await requestJson('/admin/kpis/publish', { method: 'POST', body: {} });
    state.notice = 'KPI publish queued and audited.';
    await loadView('kpis');
  }

  async function setEnvironment(env) {
    state.notice = '';
    const body = { environment: env };
    if (env === 'Production') {
      const code = window.prompt('Two-factor code');
      if (!code) return;
      body.twoFactorCode = code;
    }
    await requestJson('/admin/settings/environment', { method: 'POST', body });
    state.notice = `Environment set to ${env}.`;
    await loadView('settings');
  }

  async function exportAudit() {
    const response = await fetch(`${API_BASE}/admin/audit-log?format=csv`, {
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

  function bindEvents() {
    document.body.addEventListener('submit', async (event) => {
      if (event.target.id !== 'admin-login-form') return;
      event.preventDefault();
      const input = document.getElementById('admin-user-id');
      await login((input?.value || '').trim());
    });

    document.body.addEventListener('click', async (event) => {
      const nav = event.target.closest('[data-admin-nav]');
      if (nav) {
        state.notice = '';
        await loadView(nav.dataset.adminNav);
        return;
      }

      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      try {
        if (action === 'logout') await logout();
        else if (action === 'refresh-view') await loadView(state.view);
        else if (action === 'publish-kpis') await publishKpis();
        else if (action === 'set-environment') await setEnvironment(button.dataset.env);
        else if (action === 'export-audit') await exportAudit();
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
  }

  window.RippleAdmin = {
    boot() {
      bindEvents();
      return verifyStoredSession();
    },
  };
})();
