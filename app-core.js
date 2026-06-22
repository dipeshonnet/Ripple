/* eslint-disable */
// Performance Arena — Core
// State, helpers, mutators, layout shell, dispatch.
// Exposes window.Arena.* used by the view modules.

(function () {
  'use strict';

  const CoreState = window.ArenaCoreState;
  if (!CoreState) { console.error('Arena core state module not loaded'); return; }

  const {
    DATA_SERVICE, SERVICE_ENTITIES, WORKFLOW_ENTITIES, SERVICE_STATE_KEYS, UI_STATE_KEYS,
    LS_KEY, STORAGE_VERSION, clone, uid, todayStr, addDays, overlayServiceEntities, readStoredUiState,
  } = CoreState;

  function bootstrapState(snapshot) {
    return CoreState.bootstrapState(snapshot, isActiveUserRecord);
  }

  let state = bootstrapState(window.SEED_DATA || {});
  let lastWorkflowFingerprint = '';

  // Derive render-only maps from persisted assignment/participant rows.
  function hydrateSimulationFromSeed() {
    state.missionProgress = {};
    for (const ma of state.missionAssignments || []) {
      if (!state.missionProgress[ma.Mission_ID]) state.missionProgress[ma.Mission_ID] = {};
      state.missionProgress[ma.Mission_ID][ma.UserID] = {
        progress: ma.Progress || 0,
        status: ma.Status || 'Active',
        joined: ma.Joined_Date,
      };
    }
    state.challengeStatus = {};
    for (const cp of state.challengeParticipants || []) {
      if (!state.challengeStatus[cp.Challenge_ID]) state.challengeStatus[cp.Challenge_ID] = { status: 'Active', acceptedBy: [], rejectedBy: [], winnerId: null };
      const cs = state.challengeStatus[cp.Challenge_ID];
      const status = String(cp.Status || '').toLowerCase();
      if (status === 'accepted' || status === 'completed') cs.acceptedBy.push(cp.UserID);
      else if (status === 'declined') cs.rejectedBy.push(cp.UserID);
    }
    for (const cr of state.challengeResults || []) {
      const cs = state.challengeStatus[cr.Challenge_ID] || (state.challengeStatus[cr.Challenge_ID] = { status: 'Active', acceptedBy: [], rejectedBy: [], winnerId: null });
      cs.status = 'Settled';
      cs.winnerId = cr.Winner_UserID;
    }
  }
  function uiStateSnapshot() {
    const payload = { __v: STORAGE_VERSION };
    for (const key of UI_STATE_KEYS) payload[key] = clone(state[key]);
    return payload;
  }

  function workflowSnapshot() {
    const snapshot = {};
    for (const entity of WORKFLOW_ENTITIES) {
      const key = SERVICE_STATE_KEYS[entity];
      if (key && Array.isArray(state?.[key])) snapshot[entity] = clone(state[key]);
    }
    return snapshot;
  }

  function setWorkflowBaseline() {
    lastWorkflowFingerprint = state ? JSON.stringify(workflowSnapshot()) : '';
  }

  function persistWorkflowIfChanged(reason) {
    if (!state || !DATA_SERVICE?.persistWorkflowState) return;
    const snapshot = workflowSnapshot();
    const fingerprint = JSON.stringify(snapshot);
    if (fingerprint === lastWorkflowFingerprint) return;
    lastWorkflowFingerprint = fingerprint;
    DATA_SERVICE.persistWorkflowState(snapshot, {
      actorUserId: state.activeUserId,
      reason: reason || 'app-state-mutation',
    }).catch((error) => {
      console.warn('Ripple workflow persistence failed', error);
      toast('Workflow changes are queued locally and will retry when sync is available.', 'warn', { icon: 'cloud-off' });
    });
  }

  function persist(reason) {
    if (!state) return;
    try { localStorage.setItem(LS_KEY, JSON.stringify(uiStateSnapshot())); } catch (e) { /**/ }
    persistWorkflowIfChanged(reason);
  }

  hydrateSimulationFromSeed();
  setWorkflowBaseline();

  // ---- Lookups ------------------------------------------------------------
  function userById(id) { return state.users.find(u => u.UserID === id); }
  function teamById(id) { return state.teams.find(t => t.TeamID === id); }
  function processById(id) { return state.processes.find(p => p.ProcessID === id); }
  function kpiById(id) { return state.kpis.find(k => k.KPI_ID === id); }
  function moduleById(id) { return state.modules.find(m => m.Module_ID === id); }
  function missionById(id) { return state.missions.find(m => m.Mission_ID === id); }
  function challengeById(id) { return state.challenges.find(c => c.Challenge_ID === id); }
  function badgeByName(name) { return state.badges.find(b => b.Badge_Name === name); }
  function agentSnapshot(userId) { return state.agentCurrent.find(a => a.UserID === userId); }
  function pktForModule(moduleId) { return state.pkts.find(p => p.Module_ID === moduleId); }
  function questionsForPkt(pktId) { return state.pktQuestions.filter(q => q.PKT_ID === pktId); }

  function canonicalDataKey(key) {
    return String(key || '')
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^A-Za-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  function fieldValue(row, candidates) {
    if (!row) return undefined;
    for (const key of candidates) {
      if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    }
    const wanted = new Set(candidates.map(canonicalDataKey));
    const actual = Object.keys(row).find((key) => wanted.has(canonicalDataKey(key)));
    return actual ? row[actual] : undefined;
  }

  function parseBooleanFlag(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    const text = String(value).trim().toLowerCase();
    if (['true', 'yes', 'y', '1', 'visible', 'enabled', 'active'].includes(text)) return true;
    if (['false', 'no', 'n', '0', 'hidden', 'disabled', 'inactive', 'retired'].includes(text)) return false;
    return null;
  }

  function normalizeRoleName(role) {
    const text = String(role || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
    if (text === 'tl' || text === 'team lead' || text === 'teamlead') return 'Team Lead';
    if (text === 'manager' || text === 'mgr') return 'Manager';
    if (text === 'admin') return 'Admin';
    return 'Agent';
  }

  function isActiveKpi(kpi) {
    if (!kpi) return false;
    const active = parseBooleanFlag(fieldValue(kpi, ['Is_Active', 'Active', 'is_active']));
    if (active === false) return false;
    const status = String(fieldValue(kpi, ['Status', 'KPI_Status']) || '').trim().toLowerCase();
    return !['inactive', 'disabled', 'retired', 'archived'].includes(status);
  }

  function kpiText(kpi) {
    return [
      fieldValue(kpi, ['KPI_Name', 'kpi_name']),
      fieldValue(kpi, ['KPI_Type', 'kpi_type']),
      fieldValue(kpi, ['Description', 'KPI_Description', 'Business_Definition']),
      fieldValue(kpi, ['Unit', 'unit']),
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function isFinancialKpi(kpi) {
    const type = String(fieldValue(kpi, ['KPI_Type', 'kpi_type']) || '').toLowerCase();
    const name = String(fieldValue(kpi, ['KPI_Name', 'kpi_name']) || '').toLowerCase();
    const unit = String(fieldValue(kpi, ['Unit', 'unit']) || '').trim();
    return type.includes('financial')
      || unit === '$'
      || /\b(cost|cpa|acquisition|commercial|penalty|reward)\b/.test(name)
      || /\benrollment value\b/.test(name);
  }

  function isAgentOwnedKpi(kpi) {
    if (!kpi || isFinancialKpi(kpi)) return false;
    const text = kpiText(kpi);
    if (/program-level|account-level|executive/.test(text)) return false;
    if (/ctm rate|per 1,000|shrinkage/.test(text)) return false;
    return true;
  }

  function kpiVisibleFlag(kpi, role) {
    const roleName = normalizeRoleName(role);
    const fields = roleName === 'Agent'
      ? ['Visible_Agent', 'Agent_Visible', 'Agent', 'visible_agent']
      : roleName === 'Team Lead'
        ? ['Visible_TL', 'Visible_Team_Lead', 'Visible_TeamLead', 'TL_Visible', 'Team_Lead_Visible', 'TeamLead_Visible', 'TL', 'visible_team_lead']
        : roleName === 'Manager'
          ? ['Visible_Manager', 'Manager_Visible', 'Manager', 'visible_manager']
          : [];
    for (const key of fields) {
      const parsed = parseBooleanFlag(fieldValue(kpi, [key]));
      if (parsed !== null) return parsed;
    }
    return null;
  }

  function kpiAppliesToProcess(kpi, processId) {
    const raw = fieldValue(kpi, ['Applicability', 'Process_Applicability', 'ProcessID', 'Process_ID']);
    if (!raw || String(raw).trim().toLowerCase() === 'all') return true;
    if (!processId) return true;
    const proc = processById(processId);
    const accepted = String(raw).split(/[|,;/]+/).map((part) => part.trim().toLowerCase()).filter(Boolean);
    const candidates = [processId, proc?.ProcessID, proc?.ProcessName, proc?.ProcessType]
      .filter(Boolean)
      .map((value) => String(value).trim().toLowerCase());
    return accepted.some((value) => candidates.includes(value));
  }

  function kpiVisibleForRole(kpiOrId, role, options) {
    const kpi = typeof kpiOrId === 'string' ? kpiById(kpiOrId) : kpiOrId;
    const roleName = normalizeRoleName(role);
    if (!isActiveKpi(kpi) || !kpiAppliesToProcess(kpi, options?.processId)) return false;
    if (roleName === 'Agent' && !isAgentOwnedKpi(kpi)) return false;
    const configured = kpiVisibleFlag(kpi, roleName);
    if (configured !== null) return configured;
    return roleName !== 'Agent' || isAgentOwnedKpi(kpi);
  }

  function kpiMetricGroup(kpiOrId) {
    const kpi = typeof kpiOrId === 'string' ? kpiById(kpiOrId) : kpiOrId;
    if (!kpi) return 'outcome';
    if (isFinancialKpi(kpi)) return 'financial';
    const type = String(fieldValue(kpi, ['KPI_Type', 'kpi_type']) || '').toLowerCase();
    const name = String(fieldValue(kpi, ['KPI_Name', 'kpi_name']) || '').toLowerCase();
    if (/(sales|revenue quality|production|call effectiveness)/.test(type)) return 'outcome';
    if (/ctm|complaint/.test(name)) return 'outcome';
    if (/(quality|workforce|compliance|operational|adherence|utilization|handle time)/.test(type + ' ' + name)) return 'operational';
    return 'outcome';
  }

  function numericField(row, candidates, fallback) {
    const value = Number(fieldValue(row, candidates));
    return Number.isFinite(value) ? value : fallback;
  }

  function kpiDisplayRank(kpi) {
    const explicit = numericField(kpi, ['Display_Order', 'Sort_Order', 'Sequence', 'KPI_Order', 'Priority_Order'], null);
    if (explicit != null) return explicit;
    const groupRank = { operational: 100, outcome: 200, financial: 300 }[kpiMetricGroup(kpi)] || 400;
    const weight = numericField(kpi, ['Weightage', 'Weight', 'weightage'], 0);
    return groupRank - weight;
  }

  function sortKpisForDisplay(rows) {
    return (rows || []).slice().sort((a, b) => {
      const rank = kpiDisplayRank(a) - kpiDisplayRank(b);
      if (rank) return rank;
      return String(fieldValue(a, ['KPI_Name', 'KPI_ID']) || '').localeCompare(String(fieldValue(b, ['KPI_Name', 'KPI_ID']) || ''));
    });
  }

  function kpisForRole(role, options) {
    const opts = options || {};
    return sortKpisForDisplay((state.kpis || []).filter((kpi) => {
      if (!kpiVisibleForRole(kpi, role, opts)) return false;
      return !opts.group || kpiMetricGroup(kpi) === opts.group;
    }));
  }

  function kpiIdsForRole(role, options) {
    return kpisForRole(role, options).map((kpi) => kpi.KPI_ID).filter(Boolean);
  }

  function sortKpiRowsForDisplay(rows) {
    return (rows || []).slice().sort((a, b) => {
      const ka = kpiById(a.KPI_ID) || {};
      const kb = kpiById(b.KPI_ID) || {};
      const rank = kpiDisplayRank(ka) - kpiDisplayRank(kb);
      if (rank) return rank;
      return String(a.KPI_ID || '').localeCompare(String(b.KPI_ID || ''));
    });
  }

  function visibleKpiRowsForRole(rows, role, options) {
    return sortKpiRowsForDisplay((rows || []).filter((row) => kpiVisibleForRole(row.KPI_ID, role, options)));
  }

  function isActiveUserRecord(user) {
    const status = String(user?.Status || '').trim().toLowerCase();
    return user && user.Active !== false && user.Is_Active !== false && user.is_active !== false
      && !['inactive', 'disabled', 'deactivated'].includes(status);
  }
  function activeUsersForRole(role) { return state.users.filter(u => u.Role === role && isActiveUserRecord(u)); }
  function firstActiveUserForRole(role) { return activeUsersForRole(role)[0] || state.users.find(isActiveUserRecord) || null; }
  function teamMembers(teamId) { return state.users.filter(u => u.Role === 'Agent' && isActiveUserRecord(u) && u.TeamID === teamId); }
  function processMembers(processId) { return state.users.filter(u => u.Role === 'Agent' && isActiveUserRecord(u) && u.ProcessID === processId); }
  function allAgents() { return state.users.filter(u => u.Role === 'Agent' && isActiveUserRecord(u)); }

  function audienceAgents(audienceType, audienceId) {
    if (audienceType === 'Account') return allAgents();
    if (audienceType === 'Team') return teamMembers(audienceId);
    if (audienceType === 'Process') return processMembers(audienceId);
    return allAgents();
  }
  function describeAudience(t, id) {
    if (t === 'Account') return 'Account · Clover Medicare';
    if (t === 'Team') { const x = teamById(id); return x ? `Team · ${x.TeamName}` : `Team · ${id}`; }
    if (t === 'Process') { const x = processById(id); return x ? `Process · ${x.ProcessName}` : `Process · ${id}`; }
    if (t === 'Role') return 'All Agents';
    return t;
  }

  // ---- Domain helpers -----------------------------------------------------
  function performanceByUser(userId) {
    return state.performance.filter(p => p.UserID === userId);
  }
  function performanceByUserKpi(userId, kpiId) {
    return state.performance.filter(p => p.UserID === userId && p.KPI_ID === kpiId).sort((a, b) => a.Date < b.Date ? -1 : 1);
  }
  function todaysRowsForUser(userId) {
    const rows = performanceByUser(userId);
    if (!rows.length) return [];
    const dates = [...new Set(rows.map(r => r.Date))].sort();
    const latest = dates[dates.length - 1];
    return rows.filter(r => r.Date === latest);
  }

  function levelInfo(xp) {
    const tiers = [
      { name: 'Bronze',  min: 0,    next: 5000 },
      { name: 'Silver',  min: 5000, next: 8000 },
      { name: 'Gold',    min: 8000, next: 12000 },
      { name: 'Platinum',min: 12000, next: 18000 },
      { name: 'Diamond', min: 18000, next: 26000 },
      { name: 'Champion',min: 26000, next: 36000 },
      { name: 'Legend',  min: 36000, next: 50000 },
    ];
    let tier = tiers[0];
    for (const t of tiers) if (xp >= t.min) tier = t;
    const pctIn = Math.min(100, Math.round(((xp - tier.min) / (tier.next - tier.min)) * 100));
    const lvl = tiers.indexOf(tier) + 1;
    return { name: tier.name, level: lvl, into: xp - tier.min, span: tier.next - tier.min, pct: pctIn };
  }

  function streakForUser(userId) {
    // count consecutive days where user had Score >= 100 (Green) using performance data
    const rows = performanceByUser(userId);
    if (!rows.length) return 0;
    const byDate = {};
    rows.forEach(r => {
      if (!byDate[r.Date]) byDate[r.Date] = [];
      byDate[r.Date].push(r);
    });
    const dates = Object.keys(byDate).sort().reverse();
    let streak = 0;
    for (const d of dates) {
      const dayRows = byDate[d];
      const allGreen = dayRows.every(r => (r.Status || '').toLowerCase() === 'green');
      if (allGreen) streak += 1; else break;
    }
    return streak;
  }

  function leaderboardForTeam(teamId) {
    return state.agentCurrent
      .filter(a => a.TeamID === teamId)
      .sort((a, b) => (b.PerformanceScore || 0) - (a.PerformanceScore || 0));
  }
  function leaderboardForProcess(processId) {
    return state.agentCurrent
      .filter(a => a.ProcessID === processId)
      .sort((a, b) => (b.PerformanceScore || 0) - (a.PerformanceScore || 0));
  }
  function leaderboardAccount() {
    return clone(state.agentCurrent).sort((a, b) => (b.PerformanceScore || 0) - (a.PerformanceScore || 0));
  }

  function teamScoreForUser(userId) {
    const u = userById(userId);
    if (!u) return null;
    const board = leaderboardForTeam(u.TeamID);
    const rank = board.findIndex(b => b.UserID === userId) + 1 || null;
    const me = agentSnapshot(userId);
    return { rank, me, board, teamSize: board.length };
  }

  // ---- Activity feed ------------------------------------------------------
  function logActivity(text, by, kind) {
    state.activity.unshift({ id: uid('A'), at: new Date().toISOString(), by, text, kind: kind || 'info' });
    state.activity = state.activity.slice(0, 80);
  }

  // ---- Toasts -------------------------------------------------------------
  function toast(msg, kind, opts) {
    const root = document.getElementById('toast-root'); if (!root) return;
    const palette = {
      success: { bg: 'rgba(34,201,138,0.12)', border: 'rgba(34,201,138,0.45)', color: '#5fe5b6' },
      info:    { bg: 'rgba(58,212,255,0.12)', border: 'rgba(58,212,255,0.45)', color: '#7fdcff' },
      warn:    { bg: 'rgba(248,180,65,0.12)', border: 'rgba(248,180,65,0.45)', color: '#ffd07a' },
      error:   { bg: 'rgba(239,79,110,0.12)', border: 'rgba(239,79,110,0.45)', color: '#ff8aa1' },
      gold:    { bg: 'rgba(245,201,90,0.12)', border: 'rgba(245,201,90,0.5)',  color: '#ffe28a' },
      violet:  { bg: 'rgba(124,92,255,0.14)', border: 'rgba(124,92,255,0.5)',  color: '#b8a8ff' },
    };
    const p = palette[kind] || palette.info;
    const el = document.createElement('div');
    el.className = 'toast rounded-xl px-4 py-3 max-w-sm text-sm font-semibold shadow-glass flex items-start gap-2';
    el.style.background = p.bg; el.style.border = `1px solid ${p.border}`; el.style.color = p.color;
    el.style.backdropFilter = 'blur(10px)';
    el.innerHTML = `${opts && opts.icon ? `<i data-lucide="${opts.icon}" class="text-[16px] mt-0.5"></i>` : ''}<div>${msg}</div>`;
    root.appendChild(el);
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 2 } });
    setTimeout(() => el.remove(), 4200);
  }

  // ---- Confetti -----------------------------------------------------------
  function confetti(count) {
    const root = document.getElementById('confetti-root'); if (!root) return;
    const colors = ['#f5c95a', '#22c98a', '#7c5cff', '#3ad4ff', '#ef4f6e', '#ff5c8a'];
    for (let i = 0; i < (count || 36); i++) {
      const piece = document.createElement('div');
      piece.className = 'confetti-piece';
      piece.style.left = Math.random() * 100 + 'vw';
      piece.style.background = colors[Math.floor(Math.random() * colors.length)];
      piece.style.animationDelay = (Math.random() * 0.5) + 's';
      piece.style.transform = `rotate(${Math.random() * 360}deg)`;
      root.appendChild(piece);
      setTimeout(() => piece.remove(), 3000);
    }
  }

  // ---- Modals -------------------------------------------------------------
  function openModal(html, opts) {
    const root = document.getElementById('modal-root');
    root.innerHTML = `
      <div class="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 modal-mask fade-in" data-modal>
        <div class="glass-strong w-full sm:max-w-2xl ${opts && opts.size === 'lg' ? 'sm:max-w-4xl' : ''} rounded-t-2xl sm:rounded-2xl max-h-[92vh] overflow-hidden flex flex-col slide-up">
          ${html}
        </div>
      </div>`;
    document.body.style.overflow = 'hidden';
    root.querySelector('[data-modal]').addEventListener('mousedown', e => {
      if (e.target.matches('[data-modal]')) closeModal();
    });
    if (opts && opts.onMount) opts.onMount(root);
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.6 } });
  }
  function closeModal() {
    const root = document.getElementById('modal-root');
    root.innerHTML = '';
    document.body.style.overflow = '';
  }
  function modalHeader(title, subtitle, icon, color) {
    const accent = color || 'gold-bg';
    return `
      <div class="flex items-start justify-between p-5 border-b border-white/5">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl ${accent} grid place-items-center"><i data-lucide="${icon}" class="text-[18px]"></i></div>
          <div>
            <div class="text-lg font-bold leading-tight font-display">${title}</div>
            <div class="text-[12px] text-arena-muted">${subtitle || ''}</div>
          </div>
        </div>
        <button data-action="close-modal" class="icon-btn">
          <i data-lucide="x" class="text-[14px]"></i>
        </button>
      </div>
    `;
  }

  // ---- Mutators -----------------------------------------------------------
  function applyPointsToUser(userId, pts, xp) {
    const u = userById(userId);
    if (u) {
      u.ArenaPoints = (u.ArenaPoints || 0) + (pts || 0);
      u.XP = (u.XP || 0) + (xp || 0);
    }
    const ac = agentSnapshot(userId);
    if (ac) {
      ac.ArenaPointsBalance = (ac.ArenaPointsBalance || 0) + (pts || 0);
      ac.XP = (ac.XP || 0) + (xp || 0);
      ac.PointsEarnedToday = (ac.PointsEarnedToday || 0) + (pts || 0);
    }
  }

  function deductPointsFromUser(userId, pts) {
    const u = userById(userId);
    if (u) u.ArenaPoints = Math.max(0, (u.ArenaPoints || 0) - pts);
    const ac = agentSnapshot(userId);
    if (ac) ac.ArenaPointsBalance = Math.max(0, (ac.ArenaPointsBalance || 0) - pts);
  }

  // missions
  function missionAssignmentFor(missionId, userId) {
    return (state.missionAssignments || []).find(ma => ma.Mission_ID === missionId && ma.UserID === userId);
  }

  function ensureMissionAssignment(missionId, userId) {
    state.missionAssignments = state.missionAssignments || [];
    let assignment = missionAssignmentFor(missionId, userId);
    if (assignment) return assignment;
    const u = userById(userId);
    assignment = {
      Assignment_ID: uid('MA'),
      Mission_ID: missionId,
      UserID: userId,
      TeamID: u?.TeamID || null,
      Joined_Date: todayStr(),
      Progress: 0,
      Status: 'Active',
      Points_Earned: 0,
    };
    state.missionAssignments.unshift(assignment);
    return assignment;
  }

  function joinMission(missionId, userId) {
    const m = missionById(missionId); if (!m) return;
    if (!state.missionProgress[missionId]) state.missionProgress[missionId] = {};
    if (state.missionProgress[missionId][userId]?.status === 'Active') return toast('Already on this mission', 'info');
    const assignment = ensureMissionAssignment(missionId, userId);
    assignment.Progress = Math.max(assignment.Progress || 0, 0.05);
    assignment.Status = 'Active';
    assignment.Joined_Date = assignment.Joined_Date || todayStr();
    state.missionProgress[missionId][userId] = { progress: assignment.Progress, status: assignment.Status, joined: assignment.Joined_Date };
    logActivity(`Joined mission "${m.Mission_Name}"`, userById(userId)?.Name, 'mission');
    toast(`Joined "${m.Mission_Name}"`, 'violet', { icon: 'flag' });
    persist('mission-join');
  }

  function progressMission(missionId, userId, delta) {
    const m = missionById(missionId); if (!m) return;
    const slot = state.missionProgress[missionId]?.[userId];
    if (!slot) return joinMission(missionId, userId);
    const assignment = ensureMissionAssignment(missionId, userId);
    slot.progress = Math.min(1, (slot.progress || 0) + (delta || 0.2));
    assignment.Progress = slot.progress;
    assignment.Status = slot.status || assignment.Status || 'Active';
    if (slot.progress >= 1 && slot.status !== 'Completed') {
      slot.status = 'Completed';
      assignment.Status = 'Completed';
      assignment.Completed_Date = todayStr();
      const pts = m.Reward_Points || 200;
      const xp = (m.XP_Reward != null && m.XP_Reward !== '') ? Number(m.XP_Reward) : Math.round(pts * 0.5);
      assignment.Points_Earned = pts;
      assignment.XP_Earned = xp;
      applyPointsToUser(userId, pts, xp);
      const badge = state.badges.find(b => b.Badge_ID === m.Badge_ID);
      logActivity(`Completed mission "${m.Mission_Name}" — +${pts} pts · +${xp} progress${badge ? ` · ${badge.Badge_Name}` : ''}`, userById(userId)?.Name, 'mission');
      toast(`🏁 Mission complete · +${pts} pts · +${xp} progress${badge ? ` · ${badge.Badge_Name}` : ''}`, 'gold', { icon: 'flag-triangle-right' });
      confetti(40);
    } else {
      toast(`Progress +${Math.round((delta || 0.2) * 100)}% — ${Math.round(slot.progress * 100)}% complete`, 'info', { icon: 'trending-up' });
    }
    persist('mission-progress');
  }

  // challenges
  function ensureChallengeStatus(c) {
    if (!state.challengeStatus[c.Challenge_ID]) {
      state.challengeStatus[c.Challenge_ID] = { status: c.Status || 'Active', acceptedBy: [], rejectedBy: [], winnerId: c.Winner_ID || null };
    }
    return state.challengeStatus[c.Challenge_ID];
  }

  function challengeParticipantFor(challengeId, userId) {
    return (state.challengeParticipants || []).find(p => p.Challenge_ID === challengeId && p.UserID === userId);
  }

  function ensureChallengeParticipant(c, userId) {
    state.challengeParticipants = state.challengeParticipants || [];
    let participant = challengeParticipantFor(c.Challenge_ID, userId);
    if (participant) return participant;
    const side = c.Participant_One === userId ? 'A' : c.Participant_Two === userId ? 'B' : 'Participant';
    participant = {
      Participant_ID: uid('CP'),
      Challenge_ID: c.Challenge_ID,
      UserID: userId,
      Side: side,
      Joined_Date: todayStr(),
      Status: 'Pending',
      Entry_Paid: 0,
    };
    state.challengeParticipants.push(participant);
    return participant;
  }

  function acceptChallenge(challengeId, userId) {
    const c = challengeById(challengeId); if (!c) return;
    const cs = ensureChallengeStatus(c);
    const participant = ensureChallengeParticipant(c, userId);
    const alreadyAccepted = cs.acceptedBy.includes(userId) || String(participant.Status || '').toLowerCase() === 'accepted';
    if (!cs.acceptedBy.includes(userId)) cs.acceptedBy.push(userId);
    cs.rejectedBy = cs.rejectedBy.filter(x => x !== userId);
    cs.status = 'Active';
    participant.Status = 'Accepted';
    participant.Joined_Date = participant.Joined_Date || todayStr();
    if (!alreadyAccepted) {
      participant.Entry_Paid = c.Entry_Points || 0;
      deductPointsFromUser(userId, c.Entry_Points || 0);
    }
    logActivity(`Accepted challenge "${c.Challenge_Name}"`, userById(userId)?.Name, 'challenge');
    toast(`Challenge accepted — entry ${c.Entry_Points} pts contributed · reward pool ${c.Reward_Pool} pts`, 'violet', { icon: 'swords' });
    persist('challenge-accept');
  }
  function rejectChallenge(challengeId, userId) {
    const c = challengeById(challengeId); if (!c) return;
    const cs = ensureChallengeStatus(c);
    const participant = ensureChallengeParticipant(c, userId);
    if (!cs.rejectedBy.includes(userId)) cs.rejectedBy.push(userId);
    cs.acceptedBy = cs.acceptedBy.filter(x => x !== userId);
    if (c.Participant_One === userId || c.Participant_Two === userId) cs.status = 'Declined';
    participant.Status = 'Declined';
    logActivity(`Declined challenge "${c.Challenge_Name}"`, userById(userId)?.Name, 'challenge');
    toast(`Challenge declined`, 'warn', { icon: 'shield-off' });
    persist('challenge-reject');
  }
  function settleChallenge(challengeId, winnerId) {
    const c = challengeById(challengeId); if (!c) return;
    const cs = ensureChallengeStatus(c);
    cs.status = 'Pending Validation';
    cs.winnerId = winnerId;
    c.Winner_ID = winnerId;
    c.Status = 'Pending Validation';
    const u = userById(winnerId);
    logActivity(`Challenge "${c.Challenge_Name}" submitted for TL validation — claimed winner ${u?.Name || winnerId}`, userById(state.activeUserId)?.Name, 'challenge');
    toast(`Win submitted to TL for validation · ${u?.Name || winnerId}`, 'violet', { icon: 'shield-check' });
    persist('challenge-submit-result');
  }

  function validateChallenge(challengeId, approved) {
    const c = challengeById(challengeId); if (!c) return;
    const cs = ensureChallengeStatus(c);
    const winnerId = cs.winnerId || c.Winner_ID;
    if (!winnerId) return toast('No claimed winner to validate', 'warn', { icon: 'shield-alert' });
    if (approved) {
      cs.status = 'Settled'; c.Status = 'Settled'; c.Winner_ID = winnerId;
      applyPointsToUser(winnerId, c.Reward_Pool || 0, 0); // Challenges award spendable Pts only after TL validation.
      state.challengeResults = state.challengeResults || [];
      if (!state.challengeResults.some(r => r.Challenge_ID === challengeId)) {
        state.challengeResults.unshift({ Result_ID: uid('CR'), Challenge_ID: challengeId, Winner_UserID: winnerId, Settlement_Date: todayStr(), Points_Awarded: c.Reward_Pool || 0, Validated_By: state.activeUserId });
      }
      logActivity(`Validated challenge "${c.Challenge_Name}" — winner ${userById(winnerId)?.Name || winnerId}`, userById(state.activeUserId)?.Name, 'challenge');
      toast(`Challenge validated · ${userById(winnerId)?.Name || winnerId} awarded ${c.Reward_Pool || 0} pts`, 'gold', { icon: 'shield-check' });
      confetti(50);
    } else {
      cs.status = 'Declined'; c.Status = 'Declined';
      logActivity(`Rejected challenge result "${c.Challenge_Name}"`, userById(state.activeUserId)?.Name, 'challenge');
      toast('Challenge result rejected', 'warn', { icon: 'shield-x' });
    }
    persist('challenge-validation');
  }

  function createChallenge({ name, type, p1, p2, kpiId, end, entry, pool }) {
    const id = uid('CH');
    const creator = state.activeUserId;
    const c = {
      Challenge_ID: id, Challenge_Name: name, Challenge_Type: type,
      Participant_One: p1, Participant_Two: p2, KPI_ID: kpiId,
      Start_Date: todayStr(), End_Date: end, Entry_Points: entry || 0,
      Reward_Pool: pool || 0, Min_Volume: 20, Status: 'Pending',
      Winner_ID: null, Result_Notes: null,
      Created_By: creator,
    };
    state.challenges.unshift(c);

    // Participant statuses:
    //   - Side A: 'Accepted' if creator IS p1 (peer self-issued), else 'Assigned' (TL/Manager-issued)
    //   - Side B: 'Pending' until they accept/decline
    state.challengeParticipants = state.challengeParticipants || [];
    const p1Status = (creator === p1) ? 'Accepted' : 'Assigned';
    if (p1) state.challengeParticipants.push({
      Participant_ID: uid('CP'), Challenge_ID: id, UserID: p1, Side: 'A',
      Joined_Date: todayStr(), Status: p1Status,
      Entry_Paid: (creator === p1) ? (entry || 0) : 0,
    });
    if (p2) state.challengeParticipants.push({
      Participant_ID: uid('CP'), Challenge_ID: id, UserID: p2, Side: 'B',
      Joined_Date: todayStr(), Status: 'Pending', Entry_Paid: 0,
    });

    // challengeStatus: only auto-accept if creator is the peer participant (p1)
    state.challengeStatus[id] = {
      status: 'Pending',
      acceptedBy: (creator === p1 && p1) ? [p1] : [],
      rejectedBy: [],
      winnerId: null,
    };

    logActivity(`Created challenge "${name}"`, userById(creator)?.Name, 'challenge');
    toast(`Challenge created · awaiting opponent`, 'violet', { icon: 'swords' });
    persist('challenge-create');
    return c;
  }

  // rewards
  function redeemReward(rewardId, userId, opts) {
    const r = state.rewards.find(x => x.Reward_ID === rewardId); if (!r) return null;
    const u = userById(userId);
    const balance = (agentSnapshot(userId)?.ArenaPointsBalance) || (u?.ArenaPoints || 0);
    if (balance < r.Points_Required) { toast(`Need ${r.Points_Required - balance} more points`, 'warn', { icon: 'wallet' }); return null; }
    if (r.Stock <= 0) { toast('Out of stock', 'warn', { icon: 'package-x' }); return null; }

    deductPointsFromUser(userId, r.Points_Required);
    r.Stock = Math.max(0, r.Stock - 1);

    // Route to the redeeming agent's actual TeamLead — fall back to the agent's ManagerID, then null.
    const team = u && u.TeamID ? state.teams.find(t => t.TeamID === u.TeamID) : null;
    const owner = team?.TeamLeadID || u?.ManagerID || null;
    const status = r.Approval_Required === 'Yes' ? 'Pending Approval' : 'Fulfilled';
    const redemption = {
      Redemption_ID: uid('RD'),
      Reward_ID: rewardId,
      UserID: userId,
      Redemption_Date: todayStr(),
      Points_Spent: r.Points_Required,
      Status: status,
      Fulfilment_Owner: owner || firstActiveUserForRole('Team Lead')?.UserID || null,
    };
    state.redemptions.unshift(redemption);

    // Points_Ledger entry — negative spend
    state.pointsLedger = state.pointsLedger || [];
    state.pointsLedger.unshift({
      Ledger_ID: uid('PL'),
      UserID: userId,
      Timestamp: new Date().toISOString(),
      Source_Type: 'Reward_Redemption',
      Source_ID: redemption.Redemption_ID,
      Points_Delta: -r.Points_Required,
      Balance_After: (agentSnapshot(userId)?.ArenaPointsBalance) || 0,
      Description: `Redeemed ${r.Reward_Name}`,
    });

    logActivity(`Redeemed "${r.Reward_Name}" — ${r.Points_Required} pts${status === 'Pending Approval' ? ' (pending)' : ''}`, u?.Name, 'reward');

    // Suppress small toast if a richer modal will show — opts.silent=true means caller will open the modal
    if (!opts?.silent) {
      toast(`Redeemed ${r.Reward_Name}${status === 'Pending Approval' ? ' · pending approval' : ' · instant'}`, 'gold', { icon: 'gift' });
      confetti(28);
    }
    persist('reward-redeem');
    return redemption;
  }

  function approveRedemption(redemptionId) {
    const rd = state.redemptions.find(x => x.Redemption_ID === redemptionId); if (!rd) return;
    if (rd.Status !== 'Pending Approval') return;
    rd.Status = 'Fulfilled';
    rd.Approved_By = state.activeUserId;
    rd.Approved_Date = todayStr();
    const r = state.rewards.find(x => x.Reward_ID === rd.Reward_ID);
    const u = userById(rd.UserID);
    logActivity(`Approved reward "${r?.Reward_Name}" for ${u?.Name}`, userById(state.activeUserId)?.Name, 'reward');
    toast(`Approved · ${r?.Reward_Name} for ${u?.Name}`, 'success', { icon: 'check-check' });
    persist('reward-approve');
  }

  function rejectRedemption(redemptionId) {
    const rd = state.redemptions.find(x => x.Redemption_ID === redemptionId); if (!rd) return;
    if (rd.Status !== 'Pending Approval') return;
    const r = state.rewards.find(x => x.Reward_ID === rd.Reward_ID);
    if (!r) return;
    // Refund points to user
    applyPointsToUser(rd.UserID, rd.Points_Spent || 0, 0);
    // Restore stock
    r.Stock = (r.Stock || 0) + 1;
    rd.Status = 'Rejected';
    rd.Rejected_By = state.activeUserId;
    rd.Rejected_Date = todayStr();
    // Refund ledger entry
    state.pointsLedger.unshift({
      Ledger_ID: uid('PL'),
      UserID: rd.UserID,
      Timestamp: new Date().toISOString(),
      Source_Type: 'Reward_Refund',
      Source_ID: rd.Redemption_ID,
      Points_Delta: rd.Points_Spent || 0,
      Balance_After: (agentSnapshot(rd.UserID)?.ArenaPointsBalance) || 0,
      Description: `Refund · ${r.Reward_Name} (rejected)`,
    });
    const u = userById(rd.UserID);
    logActivity(`Rejected reward "${r.Reward_Name}" for ${u?.Name} · ${rd.Points_Spent} pts refunded`, userById(state.activeUserId)?.Name, 'reward');
    toast(`Rejected · ${rd.Points_Spent} pts refunded to ${u?.Name}`, 'warn', { icon: 'rotate-ccw' });
    persist('reward-reject');
  }

  // training (existing module — kept compatible)
  function findCompletion(assignmentId) { return state.completion.find(c => c.Assignment_ID === assignmentId); }
  function findAssignment(assignmentId) { return state.assignments.find(a => a.Assignment_ID === assignmentId); }

  function createModule(opts) {
    const me = userById(state.activeUserId);
    const moduleId = uid('LM');
    state.modules.unshift({
      Module_ID: moduleId,
      Module_Type: opts.moduleType,
      Title: opts.title,
      Priority: opts.priority,
      Audience_Type: opts.audienceType,
      Audience_ID: opts.audienceId || 'CLOVER_MA',
      Published_By: me?.UserID || firstActiveUserForRole('Manager')?.UserID || null,
      Content_Format: opts.contentFormat,
      Description: opts.description,
      Content_Link: opts.contentLink || '',
      Published_Date: todayStr(),
      Due_Date: opts.dueDate,
      Requires_Ack: opts.requiresAck ? 'Yes' : 'No',
      Requires_Completion: 'Yes',
      Has_PKT: opts.hasPkt ? 'Yes' : 'No',
      Points_On_Completion: opts.pointsOnCompletion,
      XP_On_Completion: opts.xpOnCompletion,
      Badge_Unlock: opts.badgeUnlock || '',
      Status: 'Active',
    });
    const targets = audienceAgents(opts.audienceType, opts.audienceId);
    for (const u of targets) {
      const aid = uid('ASN');
      state.assignments.push({
        Assignment_ID: aid,
        Module_ID: moduleId,
        UserID: u.UserID, Agent_Name: u.Name,
        TeamID: u.TeamID, ProcessID: u.ProcessID,
        Audience_Type: opts.audienceType, Audience_ID: opts.audienceId || 'CLOVER_MA',
        Assigned_Date: todayStr(), Due_Date: opts.dueDate,
        Assignment_Status: 'Not Started', Overdue: 'No',
      });
      state.completion.push({
        Assignment_ID: aid, Module_ID: moduleId, UserID: u.UserID,
        Viewed: 'No', Acknowledged: 'No', Completed: 'No', Completion_Date: null,
        Status: 'Not Started', Points_Earned: 0, XP_Earned: 0, Badge_Earned: '', Overdue: 'No',
      });
    }
    if (opts.hasPkt && opts.pktConfig) {
      const pktId = uid('PKT');
      state.pkts.push({
        PKT_ID: pktId, Module_ID: moduleId,
        PKT_Title: opts.pktConfig.title || `${opts.title} — PKT`,
        Pass_Score: opts.pktConfig.passScore,
        Max_Attempts: opts.pktConfig.maxAttempts,
        Question_Count: opts.pktConfig.questions.length,
        Points_On_Pass: opts.pktConfig.pointsOnPass,
        XP_On_Pass: opts.pktConfig.xpOnPass,
        First_Attempt_Bonus: opts.pktConfig.firstAttemptBonus,
        Status: 'Active',
      });
      opts.pktConfig.questions.forEach((q, i) => {
        state.pktQuestions.push({
          Question_ID: uid('Q'), PKT_ID: pktId, Question_No: i + 1,
          Question_Text: q.text, Options: q.options.join('|'),
          Correct_Answer: q.correct, Points: 10, Status: 'Active',
        });
      });
    }
    logActivity(`${opts.moduleType} "${opts.title}" assigned to ${targets.length} agent(s)`, me?.Name, 'training');
    toast(`${opts.moduleType} published · ${targets.length} agent${targets.length === 1 ? '' : 's'}`, 'success', { icon: 'send' });
    persist('learning-module-create');
  }

  function markViewed(assignmentId) {
    const c = findCompletion(assignmentId); if (!c || c.Viewed === 'Yes') return;
    c.Viewed = 'Yes'; c.Status = c.Status === 'Not Started' ? 'In Progress' : c.Status;
    const a = findAssignment(assignmentId); if (a) a.Assignment_Status = 'In Progress';
    toast('Module opened', 'info', { icon: 'eye' }); persist('learning-view');
  }
  function acknowledgeAssignment(assignmentId) {
    const c = findCompletion(assignmentId); if (!c || c.Acknowledged === 'Yes') return;
    const a = findAssignment(assignmentId); const m = a ? moduleById(a.Module_ID) : null;
    c.Acknowledged = 'Yes'; c.Viewed = 'Yes'; c.Completion_Date = todayStr(); c.Status = 'Acknowledged';
    const pts = m ? Math.round((m.Points_On_Completion || 50) * 0.5) : 25;
    const xp = m ? Math.round((m.XP_On_Completion || 25) * 0.5) : 15;
    c.Points_Earned += pts; c.XP_Earned += xp;
    if (a) a.Assignment_Status = 'Acknowledged';
    applyPointsToUser(c.UserID, pts, xp);
    toast(`Acknowledged · +${pts} pts`, 'gold', { icon: 'check-check' });
    logActivity(`Acknowledged "${m?.Title}"`, userById(c.UserID)?.Name, 'training');
    persist('learning-acknowledge');
  }
  function completeAssignment(assignmentId) {
    const c = findCompletion(assignmentId); if (!c || c.Completed === 'Yes') return;
    const a = findAssignment(assignmentId); const m = a ? moduleById(a.Module_ID) : null;
    c.Completed = 'Yes'; c.Viewed = 'Yes'; c.Acknowledged = 'Yes'; c.Completion_Date = todayStr(); c.Status = 'Completed';
    const pts = m?.Points_On_Completion || 100; const xp = m?.XP_On_Completion || 50;
    c.Points_Earned = pts; c.XP_Earned = xp;
    c.Badge_Earned = m?.Badge_Unlock || c.Badge_Earned;
    if (a) a.Assignment_Status = 'Completed';
    applyPointsToUser(c.UserID, pts, xp);
    toast(`Training complete · +${pts} pts · +${xp} progress${m?.Badge_Unlock ? ` · ${m.Badge_Unlock}` : ''}`, 'gold', { icon: 'graduation-cap' });
    confetti(20);
    logActivity(`Completed "${m?.Title}"`, userById(c.UserID)?.Name, 'training');
    persist('learning-complete');
  }

  function submitPktAttempt(moduleId, userId, answers) {
    const pkt = pktForModule(moduleId); if (!pkt) return;
    const qs = questionsForPkt(pkt.PKT_ID);
    let correct = 0;
    qs.forEach((q, i) => { if ((answers[i] || '') === q.Correct_Answer) correct += 1; });
    const score = Math.round((correct / qs.length) * 100);
    const result = score >= pkt.Pass_Score ? 'Pass' : 'Fail';
    const previous = state.pktAttempts.filter(a => a.PKT_ID === pkt.PKT_ID && a.UserID === userId);
    const attemptNo = previous.length + 1;
    const firstAttempt = attemptNo === 1 && result === 'Pass';
    let pts = 0, xp = 0;
    if (result === 'Pass') { pts = pkt.Points_On_Pass + (firstAttempt ? pkt.First_Attempt_Bonus : 0); xp = pkt.XP_On_Pass; }
    state.pktAttempts.push({
      Attempt_ID: uid('ATT'), PKT_ID: pkt.PKT_ID, Module_ID: moduleId,
      UserID: userId, Agent_Name: userById(userId)?.Name || userId,
      Attempt_No: attemptNo, Attempt_Date: todayStr(),
      Score: score, Pass_Score: pkt.Pass_Score, Result: result,
      Points_Earned: pts, XP_Earned: xp, First_Attempt_Pass: firstAttempt ? 'Yes' : 'No',
    });
    const assignment = state.assignments.find(a => a.Module_ID === moduleId && a.UserID === userId);
    if (assignment) {
      const c = findCompletion(assignment.Assignment_ID);
      if (c) {
        c.Viewed = 'Yes';
        if (result === 'Pass') {
          c.Completed = 'Yes'; c.Acknowledged = 'Yes'; c.Completion_Date = todayStr(); c.Status = 'Completed';
          c.Points_Earned = (c.Points_Earned || 0) + pts; c.XP_Earned = (c.XP_Earned || 0) + xp;
          const m = moduleById(moduleId); if (m?.Badge_Unlock) c.Badge_Earned = m.Badge_Unlock;
          assignment.Assignment_Status = 'Completed';
        } else {
          c.Status = 'In Progress'; assignment.Assignment_Status = 'In Progress';
        }
      }
    }
    applyPointsToUser(userId, pts, xp);
    if (result === 'Pass') {
      toast(`PKT Passed · ${score}% · +${pts} pts${firstAttempt ? ' · First-attempt bonus!' : ''}`, 'gold', { icon: 'graduation-cap' });
      confetti(40);
    } else {
      toast(`PKT ${score}% · need ${pkt.Pass_Score}% to pass`, 'warn', { icon: 'graduation-cap' });
    }
    logActivity(`PKT attempt ${attemptNo} on "${moduleById(moduleId)?.Title}" — ${result} (${score}%)`, userById(userId)?.Name, 'training');
    persist('pkt-attempt');
  }

  function sendReminder(moduleId, userId) {
    const m = moduleById(moduleId); const u = userById(userId);
    logActivity(`Reminder sent for "${m?.Title}" → ${u?.Name}`, userById(state.activeUserId)?.Name, 'reminder');
    toast(`Reminder → ${u?.Name}`, 'info', { icon: 'bell-ring' });
    persist('training-reminder');
  }
  function bulkRemindOverdue(moduleId) {
    const targets = state.assignments.filter(a => a.Module_ID === moduleId).filter(a => {
      const c = findCompletion(a.Assignment_ID);
      return c && c.Status !== 'Completed';
    });
    if (!targets.length) return toast('Everyone is on track', 'success', { icon: 'check-check' });
    targets.forEach(t => sendReminder(moduleId, t.UserID));
    toast(`${targets.length} reminders sent`, 'info', { icon: 'bell-ring' });
  }

  // verification
  function setVerificationStatus(rowKey, status, comments) {
    const row = state.verification.find(v => `${v.Entity_ID}|${v.KPI_ID}|${v.Verifier_Role}` === rowKey);
    if (!row) return;
    row.Verification_Status = status;
    row.Verified_By = userById(state.activeUserId)?.UserID || row.Verified_By;
    if (comments) row.Comments = comments;
    logActivity(`Verification → ${status} for ${row.Entity_Name} · ${row.KPI_Name}`, userById(state.activeUserId)?.Name, 'verification');
    toast(`Marked ${status}`, status === 'Verified' ? 'success' : 'info', { icon: 'shield-check' });
    persist('verification-update');
  }

  // ---- Layout shell -------------------------------------------------------

  function navByRole() {
    if (state.role === 'Agent') {
      const desktop = [
        { id: 'home',        label: 'Arena Home',  icon: 'gamepad-2' },
        { id: 'scorecard',   label: 'Scorecard',   icon: 'gauge-circle' },
        { id: 'challenges',  label: 'Challenges',  icon: 'swords' },
        { id: 'missions',    label: 'Missions',    icon: 'flag' },
        { id: 'leaderboard', label: 'Leaderboard', icon: 'trophy' },
        { id: 'store',       label: 'Arena Store', icon: 'gift' },
        { id: 'broadcasts',  label: 'Broadcasts',  icon: 'megaphone' },
        { id: 'training',    label: 'Training',    icon: 'graduation-cap' },
        { id: 'profile',     label: 'My Profile',  icon: 'user-round' },
      ];
      const mobile = [
        { id: 'home',       label: 'Home',       icon: 'gamepad-2' },
        { id: 'scorecard',  label: 'Score',      icon: 'gauge-circle' },
        { id: 'challenges', label: 'Challenges', icon: 'swords' },
        { id: 'store',      label: 'Store',      icon: 'gift' },
        { id: 'profile',    label: 'Profile',    icon: 'user-round' },
      ];
      return { desktop, mobile };
    }
    if (state.role === 'Team Lead') {
      const list = [
        { id: 'lead-outcomes',    label: 'Team Console',          icon: 'activity' },
        { id: 'lead-rca',         label: 'Outcome Drivers',       icon: 'git-branch' },
        { id: 'lead-trends',      label: 'SLA/KPI Trends',        icon: 'line-chart' },
        { id: 'lead-console',     label: 'Coach Console',         icon: 'shield' },
        { id: 'lead-team',        label: 'Team Pulse',            icon: 'users' },
        { id: 'lead-commercial',  label: 'Commercial',            icon: 'badge-dollar-sign' },
        { id: 'lead-missions',    label: 'Missions & Challenges', icon: 'swords' },
        { id: 'training-console', label: 'Training Console',      icon: 'graduation-cap' },
        { id: 'lead-coaching',    label: 'Coaching Queue',        icon: 'message-square-heart' },
        { id: 'lead-recognition', label: 'Recognition',           icon: 'medal' },
      ];
      return { desktop: list, mobile: list.slice(0, 5) };
    }
    const list = [
      { id: 'mgr-outcomes',     label: 'Account Command',     icon: 'activity' },
      { id: 'mgr-trends',       label: 'SLA/KPI Trends',        icon: 'line-chart' },
      { id: 'mgr-rca',          label: 'Outcome Drivers',       icon: 'git-branch' },
      { id: 'mgr-commercial',   label: 'Revenue & Commercial',  icon: 'badge-dollar-sign' },
      { id: 'mgr-whatif',       label: 'What-If / Action Planner', icon: 'split' },
      { id: 'mgr-teams',        label: 'Team Comparison',       icon: 'columns-3' },
      { id: 'mgr-adoption',     label: 'Adoption',              icon: 'zap' },
      { id: 'mgr-command',      label: 'Legacy KPI Console', icon: 'radar' },
      { id: 'mgr-sla',          label: 'SLA Health',            icon: 'gauge-circle' },
      { id: 'training-console', label: 'Training Console',      icon: 'graduation-cap' },
    ];
    return { desktop: list, mobile: list.slice(0, 5) };
  }

  function renderShell() {
    const me = userById(state.activeUserId);
    const team = me?.TeamID ? teamById(me.TeamID) : null;
    const nav = navByRole();
    const desktopNav = nav.desktop;
    const mobileTabs = nav.mobile;
    return `
      <aside class="desktop-sidebar">
        <div class="flex items-center gap-2.5 mb-4 px-1">
          <div class="w-9 h-9 rounded-xl gold-bg grid place-items-center shadow-gold">
            <i data-lucide="trophy" class="text-[16px]"></i>
          </div>
          <div class="brand-lockup">
            <div class="brand-name font-display font-bold text-[15px]">Ripple™</div>
            <div class="brand-tagline text-[9px] text-arena-muted uppercase tracking-[0.14em]">Every action. Every insight. Every outcome.</div>
          </div>
        </div>

        <div class="flex flex-col gap-1 mt-1 overflow-y-auto scrollbar-thin">
          ${desktopNav.map(n => `
            <button data-nav="${n.id}" class="nav-item ${state.page === n.id ? 'active' : ''} flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-semibold text-arena-muted hover:text-arena-text">
              <i data-lucide="${n.icon}" class="text-[16px]"></i> <span>${n.label}</span>
            </button>
          `).join('')}
        </div>

        <div class="mt-auto">
          <div class="glass rounded-xl p-2.5">
            <div class="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-0.5 mb-2">
              ${['Agent', 'Team Lead', 'Manager'].map(r => `
                <button data-role="${r}" class="flex-1 px-2 py-1.5 rounded-md text-[10.5px] font-bold tracking-wide ${state.role === r ? 'gold-bg' : 'text-arena-muted hover:text-arena-text'}">${r === 'Team Lead' ? 'TL' : r}</button>
              `).join('')}
            </div>
            <select id="user-picker" class="!text-[12px] !py-1.5">
              ${activeUsersForRole(state.role).map(u => `<option value="${u.UserID}" ${u.UserID === state.activeUserId ? 'selected' : ''}>${u.Name}</option>`).join('')}
            </select>
            <div class="flex items-center gap-2 mt-2 text-[10px] text-arena-muted">
              <i data-lucide="map-pin" class="text-[10px]"></i> ${me?.Location || ''} · ${me?.UserID || ''}
            </div>
            <button data-action="reset-data" class="mt-2 w-full text-[10.5px] text-arena-muted hover:text-arena-red flex items-center justify-center gap-1 py-1 rounded-md border border-white/8 hover:border-arena-red/40">
              <i data-lucide="rotate-ccw" class="text-[11px]"></i> Reset prototype state
            </button>
            <div class="mt-2 text-center text-[9px] uppercase tracking-[0.18em] text-arena-muted/70 flex items-center justify-center gap-1">
              <i data-lucide="flask-conical" class="text-[9px]"></i>
              <span>Prototype · Fictional data</span>
            </div>
          </div>
        </div>
      </aside>

      <header class="mobile-header mobile-header-iphone16">
        <div class="mobile-brand-row compact">
          <div class="mobile-ripple-mark" aria-hidden="true">R</div>
          <div class="brand-lockup flex-1 min-w-0">
            <div class="brand-name font-display font-bold">Ripple™</div>
            <div class="brand-tagline text-arena-muted uppercase">Every action. Every insight. Every outcome.</div>
          </div>
          <button data-action="open-mobile-menu" class="mobile-icon-menu" aria-label="Open page menu">
            <i data-lucide="menu" class="text-[17px]"></i>
          </button>
        </div>
        <div class="mobile-profile-controls" aria-label="Active profile controls">
          <div class="mobile-role-pills" aria-label="Switch role">
            ${['Agent', 'Team Lead', 'Manager'].map(r => `
              <button data-role="${r}" class="mobile-role-pill ${state.role === r ? 'is-active' : ''}" aria-pressed="${state.role === r ? 'true' : 'false'}">${r === 'Team Lead' ? 'TL' : r}</button>
            `).join('')}
          </div>
          <select id="mobile-user-picker" class="mobile-user-select" aria-label="Select active profile">
            ${activeUsersForRole(state.role).map(u => `<option value="${u.UserID}" ${u.UserID === state.activeUserId ? 'selected' : ''}>${u.Name}${u.TeamID ? ` · ${teamById(u.TeamID)?.TeamName || u.TeamID}` : ''}</option>`).join('')}
          </select>
        </div>
      </header>

      <main id="main-content" class="px-4 sm:px-6 pt-4 pb-6 max-w-[1400px] mx-auto">
        ${renderPage()}
      </main>

      <nav class="mobile-bottom-nav" aria-label="Primary mobile navigation">
        ${mobileTabs.map(n => {
          const active = state.page === n.id;
          return `
          <button data-nav="${n.id}" aria-label="${n.label}" aria-current="${active ? 'page' : 'false'}" class="${active ? 'active text-arena-gold' : 'text-arena-muted'} flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-xl">
            <i data-lucide="${n.icon}" class="text-[18px]"></i>
            <span class="text-[10px] font-semibold">${n.label.split(' ')[0]}</span>
          </button>`;
        }).join('')}
      </nav>
    `;
  }

  function renderPage() {
    const A = window.ArenaAgentViews || {};
    const L = window.ArenaLeadMgrViews || {};
    if (state.role === 'Agent') {
      switch (state.page) {
        case 'home':         return A.renderHome();
        case 'scorecard':    return A.renderScorecard();
        case 'missions':     return A.renderMissions();
        case 'challenges':   return A.renderChallenges();
        case 'leaderboard':  return A.renderLeaderboard();
        case 'broadcasts':   return A.renderBroadcasts();
        case 'training':     return A.renderTraining();
        case 'store':        return A.renderStore();
        case 'profile':      return A.renderProfile();
        default:             return A.renderHome();
      }
    }
    if (state.role === 'Team Lead') {
      switch (state.page) {
        case 'lead-console':     return L.renderLeadConsole();
        case 'lead-team':        return L.renderLeadTeam();
        case 'lead-commercial':  return L.renderLeadCommercial();
        case 'lead-outcomes':    return L.renderLeadOutcomes();
        case 'lead-rca':         return L.renderLeadRca();
        case 'lead-trends':      return L.renderLeadTrends();
        case 'lead-missions':    return L.renderLeadMissions();
        case 'training-console': return L.renderTrainingConsole();
        case 'lead-coaching':    return L.renderLeadCoaching();
        case 'lead-recognition': return L.renderLeadRecognition();
        default:                 return L.renderLeadOutcomes();
      }
    }
    switch (state.page) {
      case 'mgr-command':       return L.renderMgrCommand();
      case 'mgr-sla':           return L.renderMgrSla();
      case 'mgr-commercial':    return L.renderMgrCommercial();
      case 'mgr-outcomes':      return L.renderMgrOutcomes();
      case 'mgr-rca':           return L.renderMgrRca();
      case 'mgr-trends':        return L.renderMgrTrends();
      case 'mgr-whatif':        return L.renderMgrWhatIf();
      case 'mgr-adoption':      return L.renderMgrAdoption();
      case 'mgr-teams':         return L.renderMgrTeams();
      case 'training-console':  return L.renderTrainingConsole();
      default:                  return L.renderMgrOutcomes();
    }
  }

  function refreshIcons() { if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.6 } }); }

  function animateCounters(root) {
    const els = (root || document).querySelectorAll('[data-counter]');
    els.forEach(el => {
      const target = Number(el.dataset.counter);
      if (!isFinite(target)) return;
      const decimals = Number(el.dataset.counterDecimals || 0);
      const duration = 850;
      const start = performance.now();
      const startVal = 0;
      function step(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const v = startVal + (target - startVal) * eased;
        el.textContent = decimals ? v.toFixed(decimals) : Math.round(v).toLocaleString();
        if (t < 1) requestAnimationFrame(step);
        else el.textContent = decimals ? target.toFixed(decimals) : target.toLocaleString();
      }
      requestAnimationFrame(step);
    });
  }

  function render() {
    const app = document.getElementById('app');
    if (!app) return;
    if (!state) {
      app.innerHTML = '<main class="min-h-screen grid place-items-center px-6"><div class="glass rounded-2xl p-5 text-sm text-arena-muted">Loading data...</div></main>';
      return;
    }
    app.innerHTML = renderShell();
    refreshIcons();
    bindGlobalHandlers();
    animateCounters(app);
    startCountdownTicker();
  }

  let _countdownTimer = null;
  function startCountdownTicker() {
    if (_countdownTimer) clearInterval(_countdownTimer);
    const tick = () => {
      const els = document.querySelectorAll('[data-countdown-end]');
      if (!els.length) { clearInterval(_countdownTimer); _countdownTimer = null; return; }
      els.forEach(el => { el.textContent = countdownText(el.dataset.countdownEnd); });
    };
    tick();
    _countdownTimer = setInterval(tick, 30000);
  }

  function countdownText(endIso) {
    if (!endIso) return '—';
    const end = new Date(`${endIso}T23:59:59`).getTime();
    const now = Date.now();
    const diff = end - now;
    if (diff <= 0) return 'Ended';
    const days = Math.floor(diff / 86400000);
    const hrs = Math.floor((diff % 86400000) / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (days >= 1) return `${days}d ${hrs}h`;
    if (hrs >= 1) return `${hrs}h ${mins}m`;
    return `${mins}m`;
  }

  // ---- Event delegation ---------------------------------------------------
  let _bound = false;
  function bindGlobalHandlers() {
    if (_bound) return;
    _bound = true;
    document.body.addEventListener('click', onClick);
    document.body.addEventListener('change', onChange);
    document.body.addEventListener('input', onInput);
    document.body.addEventListener('submit', e => e.preventDefault());
  }

  async function onClick(e) {
    if (!state) return;
    const navBtn = e.target.closest('[data-nav]');
    if (navBtn) {
      state.page = navBtn.dataset.nav;
      if ('ragFilter' in navBtn.dataset) state.ragFilter = navBtn.dataset.ragFilter || 'all';
      else if (!navBtn.dataset.keepFilter) state.ragFilter = 'all';
      state.drillModule = null; state.drillKpi = null;
      persist(); render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const ragBtn = e.target.closest('[data-rag-filter]');
    if (ragBtn) {
      state.ragFilter = ragBtn.dataset.ragFilter || 'all';
      persist(); render();
      return;
    }
    const roleBtn = e.target.closest('[data-role]');
    if (roleBtn) {
      const newRole = roleBtn.dataset.role;
      if (newRole !== state.role) {
        state.role = newRole;
        const first = activeUsersForRole(newRole)[0];
        if (first) state.activeUserId = first.UserID;
        // sensible default page
        if (newRole === 'Agent') state.page = 'home';
        else if (newRole === 'Team Lead') state.page = 'lead-outcomes';
        else state.page = 'mgr-outcomes';
        state.drillModule = null;
        persist(); render();
      }
      return;
    }

    const action = e.target.closest('[data-action]')?.dataset?.action;
    if (!action) return;
    const data = e.target.closest('[data-action]').dataset;

    const m = window.ArenaModals || {};
    const A = window.ArenaAgentViews || {};
    const L = window.ArenaLeadMgrViews || {};

    switch (action) {
      case 'close-modal': closeModal(); return;
      case 'close-modal-and-earn': closeModal(); state.page = 'missions'; persist(); render(); return;
      case 'reset-data': {
        if (confirm('Reset all simulation state to seed?')) {
          localStorage.removeItem(LS_KEY);
          await bootApp({ forceRefresh: true });
          toast('Reset to seed', 'info', { icon: 'rotate-ccw' });
        }
        return;
      }
      case 'open-mobile-menu': {
        m.openMobileMenu && m.openMobileMenu();
        return;
      }
      case 'switch-user': {
        state.activeUserId = data.user;
        if (data.role) state.role = data.role;
        closeModal(); persist(); render();
        return;
      }
      // Agent actions
      case 'agent-view':     markViewed(data.assignment); render(); return;
      case 'agent-ack':      acknowledgeAssignment(data.assignment); render(); return;
      case 'agent-complete': completeAssignment(data.assignment); render(); return;
      case 'agent-pkt':      m.openTakePkt && m.openTakePkt(data.module, state.activeUserId); return;
      case 'agent-join-mission':     joinMission(data.mission, state.activeUserId); render(); return;
      case 'agent-progress-mission': progressMission(data.mission, state.activeUserId); render(); return;
      case 'agent-accept-challenge': acceptChallenge(data.challenge, state.activeUserId); render(); return;
      case 'agent-reject-challenge': rejectChallenge(data.challenge, state.activeUserId); render(); return;
      case 'agent-redeem': {
        const rd = redeemReward(data.reward, state.activeUserId, { silent: true });
        if (rd) { m.openRewardUnlocked && m.openRewardUnlocked(rd); render(); }
        return;
      }
      case 'tl-approve-reward': approveRedemption(data.redemption); render(); return;
      case 'tl-reject-reward':  rejectRedemption(data.redemption);  render(); return;
      case 'set-store-category': state.storeCategory = data.category; render(); return;
      case 'set-lb-filter': state.lbFilter = data.filter; render(); return;
      case 'set-lb-kpi':    state.lbKpi = data.kpi; render(); return;
      case 'set-mgr-whatif-kpi': state.mgrWhatIfKpi = data.kpi; render(); return;
      case 'set-mgr-whatif-improve': state.mgrWhatIfImprove = Number(data.improve || 1); render(); return;
      case 'mgr-create-recovery':
        m.openCreateMission && m.openCreateMission({ presetType: 'SLA Recovery', kpiId: data.kpi || state.mgrWhatIfKpi, audienceId: data.team || 'CLOVER_MA', namePrefix: 'Account Recovery' });
        return;
      case 'agent-create-challenge': m.openCreateChallenge && m.openCreateChallenge('Peer'); return;
      case 'submit-challenge': m.submitCreateChallenge && m.submitCreateChallenge(); return;
      // TL/Mgr actions
      case 'new-broadcast':  m.openCreateBroadcast && m.openCreateBroadcast(); return;
      case 'new-training':   m.openCreateTraining && m.openCreateTraining(); return;
      case 'new-pkt':        m.openCreatePkt && m.openCreatePkt(); return;
      case 'new-mission':    m.openCreateMission && m.openCreateMission(); return;
      case 'new-challenge':  m.openCreateChallenge && m.openCreateChallenge('Team Lead Issued'); return;
      case 'submit-broadcast': m.submitBroadcast && m.submitBroadcast(); return;
      case 'submit-training': m.submitTraining && m.submitTraining(); return;
      case 'submit-pkt':      m.submitPkt && m.submitPkt(); return;
      case 'submit-pkt-attempt': m.submitTakePkt && m.submitTakePkt(); return;
      case 'submit-mission':  m.submitMission && m.submitMission(); return;
      case 'pkt-add-question': m.pktAddQuestion && m.pktAddQuestion(); return;
      case 'pkt-del-question': m.pktDelQuestion && m.pktDelQuestion(Number(data.q)); return;
      case 'open-drill':       state.drillModule = data.module; state.page = 'training-console'; render(); return;
      case 'close-drill':      state.drillModule = null; render(); return;
      case 'bulk-remind':      bulkRemindOverdue(data.module); render(); return;
      case 'reminder':         sendReminder(data.module, data.user); render(); return;
      case 'verify-row':       m.openVerifyRow && m.openVerifyRow(data.row); return;
      case 'submit-verify':    m.submitVerify && m.submitVerify(data.row); return;
      case 'whatif-rule':      state.whatIfRule = data.rule; render(); return;
      case 'settle-challenge': settleChallenge(data.challenge, data.winner); render(); return;
      case 'tl-validate-challenge': validateChallenge(data.challenge, true); render(); return;
      case 'tl-reject-challenge-result': validateChallenge(data.challenge, false); render(); return;
      case 'set-challenge-bucket': state.challengeBucket = data.bucket; render(); return;
      case 'set-challenge-theme':  state.challengeTheme = data.theme; render(); return;
      case 'set-mission-filter':   state.missionFilter = data.filter; render(); return;
      case 'challenge-back': m.openCreateChallenge && m.openCreateChallenge('Peer', { againstUser: data.user, kpiId: data.kpi }); return;
      case 'ch-preset': m.applyChallengePreset && m.applyChallengePreset(data.preset); return;
      case 'force-mission-progress': progressMission(data.mission, data.user); render(); return;
      case 'recognize-agent':  recognizeAgent(data.user); render(); return;
      case 'tl-create-sla-recovery': m.openCreateMission && m.openCreateMission({ presetType: 'SLA Recovery', kpiId: data.kpi, audienceId: data.team, namePrefix: 'SLA Recovery' }); return;
      case 'tl-add-coaching-note':   m.openCoachingNote   && m.openCoachingNote({ userId: data.user, kpiId: data.kpi }); return;
      case 'submit-coaching-note':   m.submitCoachingNote && m.submitCoachingNote(); return;
      case 'tl-resolve-coaching':    resolveCoaching(data.coaching); render(); return;
      default: return;
    }
  }

  function recognizeAgent(userId, opts) {
    const u = userById(userId); if (!u) return;
    const pts = opts?.points || 250;
    const xp = opts?.xp || 100;
    applyPointsToUser(userId, pts, xp);
    // also append to recognition state for visibility
    state.recognition = state.recognition || [];
    state.recognition.unshift({
      Recognition_ID: uid('REC'),
      UserID: userId,
      Given_By: state.activeUserId,
      Given_Date: todayStr(),
      Title: opts?.title || 'Team Lead Recognition',
      Category: opts?.category || 'Team',
      Reason: opts?.reason || `Outstanding contribution this shift.`,
      Points_Awarded: pts,
      XP_Awarded: xp,
      Public: 'Yes',
    });
    logActivity(`Recognized ${u.Name} — +${pts} pts · +${xp} progress`, userById(state.activeUserId)?.Name, 'recognition');
    toast(`👏 Recognition · ${u.Name} · +${pts} pts`, 'gold', { icon: 'medal' });
    confetti(20); persist('recognition-create');
  }

  function createCoachingNote({ userId, kpiId, triggerReason, note, dueDate }) {
    const tl = userById(state.activeUserId);
    const u = userById(userId);
    if (!u) return;
    const co = {
      Coaching_ID: uid('CO'),
      UserID: userId,
      KPI_ID: kpiId,
      Trigger_Reason: triggerReason || 'Performance trend',
      Coaching_Note: note,
      Assigned_By: tl?.UserID || state.activeUserId,
      Assigned_Date: todayStr(),
      Due_Date: dueDate || addDays(5),
      Status: 'Open',
    };
    state.coaching.unshift(co);
    logActivity(`Coaching note added for ${u.Name} (${kpiById(kpiId)?.KPI_Name || kpiId})`, tl?.Name, 'coaching');
    toast(`Coaching note saved for ${u.Name}`, 'violet', { icon: 'message-square-heart' });
    persist('coaching-create');
  }

  function resolveCoaching(coachingId) {
    const co = state.coaching.find(c => c.Coaching_ID === coachingId);
    if (!co) return;
    co.Status = 'Resolved';
    co.Resolved_Date = todayStr();
    const u = userById(co.UserID);
    logActivity(`Coaching resolved for ${u?.Name}`, userById(state.activeUserId)?.Name, 'coaching');
    toast(`Coaching resolved · ${u?.Name}`, 'success', { icon: 'check-check' });
    persist('coaching-resolve');
  }

  function onChange(e) {
    if (e.target.id === 'user-picker' || e.target.id === 'mobile-user-picker') {
      state.activeUserId = e.target.value; persist(); render(); return;
    }
    if (e.target.id === 'vc-type') {
      state.filters.moduleType = e.target.value;
      const L = window.ArenaLeadMgrViews; if (L) document.getElementById('main-content').innerHTML = L.renderTrainingConsole();
      refreshIcons();
      return;
    }
    if (e.target.classList?.contains('pkt-q-correct')) {
      const m = window.ArenaModals; m && m.pktSetCorrect && m.pktSetCorrect(Number(e.target.dataset.q), Number(e.target.dataset.opt));
      return;
    }
  }

  function onInput(e) {
    if (e.target.id === 'vc-search') {
      state.filters.search = e.target.value;
      requestAnimationFrame(() => {
        const L = window.ArenaLeadMgrViews; if (L) {
          document.getElementById('main-content').innerHTML = L.renderTrainingConsole();
          refreshIcons();
          const inp = document.getElementById('vc-search'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
        }
      });
    }
  }

  async function loadStateFromDataService(options) {
    const opts = options || {};
    const loader = DATA_SERVICE?.loadBootstrapData;
    const snapshot = loader
      ? await loader({ entities: SERVICE_ENTITIES, forceRefresh: opts.forceRefresh === true })
      : {};
    state = bootstrapState(snapshot);
    hydrateSimulationFromSeed();
    setWorkflowBaseline();
    return state;
  }

  let workflowRefreshInFlight = false;
  let lastWorkflowRefreshAt = 0;

  async function refreshWorkflowFromDataService(options) {
    const opts = options || {};
    if (!state || !DATA_SERVICE?.refreshEntities || workflowRefreshInFlight) return;
    const now = Date.now();
    if (!opts.force && now - lastWorkflowRefreshAt < 15000) return;
    workflowRefreshInFlight = true;
    try {
      const snapshot = await DATA_SERVICE.refreshEntities(SERVICE_ENTITIES, { forceRefresh: true, source: opts.source || 'refresh' });
      state = overlayServiceEntities(state, snapshot);
      hydrateSimulationFromSeed();
      ensureActiveProfile();
      setWorkflowBaseline();
      lastWorkflowRefreshAt = Date.now();
      render();
      if (!opts.silent) toast('Workflow data refreshed from the shared API state.', 'info', { icon: 'refresh-cw' });
    } catch (error) {
      console.warn('Ripple workflow refresh failed', error);
    } finally {
      workflowRefreshInFlight = false;
    }
  }

  function installWorkflowRefreshHandlers() {
    if (!window.addEventListener) return;
    window.addEventListener('arena:data-conflict', (event) => {
      const detail = event.detail || {};
      toast(detail.message || 'Workflow conflict detected. Refresh before saving again.', 'warn', { icon: 'git-compare-arrows' });
    });
    window.addEventListener('arena:data-refresh-needed', (event) => {
      refreshWorkflowFromDataService({ force: true, source: event.detail?.source || 'cross-session' });
    });
    window.addEventListener('focus', () => {
      refreshWorkflowFromDataService({ silent: true, source: 'window-focus' });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshWorkflowFromDataService({ silent: true, source: 'visibility' });
    });
  }

  function ensureActiveProfile() {
    const current = userById(state.activeUserId);
    if (current && current.Role === state.role && isActiveUserRecord(current)) return;
    const replacement = activeUsersForRole(state.role)[0] || state.users.find(isActiveUserRecord);
    if (!replacement) return;
    state.role = replacement.Role || state.role;
    state.activeUserId = replacement.UserID;
    if (state.role === 'Agent') state.page = 'home';
    else if (state.role === 'Team Lead') state.page = 'lead-outcomes';
    else if (state.role === 'Manager') state.page = 'mgr-account';
  }

  async function bootApp(options) {
    const hadCachedState = !!readStoredUiState();
    render();
    try {
      await loadStateFromDataService(options);
    } catch (error) {
      console.warn('Ripple data service boot failed', error);
      state = bootstrapState({});
      hydrateSimulationFromSeed();
    }

    if (!hadCachedState) {
      const firstAgent = activeUsersForRole('Agent')[0] || state.users.find(isActiveUserRecord);
      state.role = firstAgent?.Role || 'Agent';
      state.activeUserId = firstAgent?.UserID || null;
      state.page = state.role === 'Agent' ? 'home'
        : state.role === 'Team Lead' ? 'lead-outcomes'
        : state.role === 'Manager' ? 'mgr-account'
        : 'home';
    }
    ensureActiveProfile();
    render();
    return state;
  }

  installWorkflowRefreshHandlers();

  // ---- Public API ---------------------------------------------------------
  window.Arena = {
    // state access
    get state() { return state || {}; },
    persist, render, refreshIcons, countdownText,
    // helpers
    clone, uid, todayStr, addDays,
    userById, teamById, processById, kpiById, moduleById, missionById, challengeById, badgeByName,
    agentSnapshot, pktForModule, questionsForPkt,
    teamMembers, processMembers, allAgents, audienceAgents, describeAudience,
    normalizeRoleName, isActiveKpi, isAgentOwnedKpi, isFinancialKpi, kpiVisibleForRole,
    kpiMetricGroup, kpisForRole, kpiIdsForRole, sortKpisForDisplay, sortKpiRowsForDisplay, visibleKpiRowsForRole,
    performanceByUser, performanceByUserKpi, todaysRowsForUser,
    levelInfo, streakForUser,
    leaderboardForTeam, leaderboardForProcess, leaderboardAccount, teamScoreForUser,
    findCompletion, findAssignment, ensureChallengeStatus,
    // ui
    toast, openModal, closeModal, modalHeader, confetti,
    // mutators
    applyPointsToUser, deductPointsFromUser,
    joinMission, progressMission, acceptChallenge, rejectChallenge, settleChallenge, validateChallenge, createChallenge,
    redeemReward, approveRedemption, rejectRedemption, createModule, markViewed, acknowledgeAssignment, completeAssignment, submitPktAttempt,
    sendReminder, bulkRemindOverdue, setVerificationStatus, recognizeAgent,
    createCoachingNote, resolveCoaching, logActivity,
    // boot
    boot() {
      return bootApp();
    }
  };
})();
