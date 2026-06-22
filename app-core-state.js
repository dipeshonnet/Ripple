/* eslint-disable */
// Performance Arena - core state bootstrap helpers.

(function () {
  'use strict';

  const DATA_SERVICE = window.ArenaDataService || null;
  const SERVICE_ENTITIES = DATA_SERVICE?.MIGRATED_ENTITIES || ['Users', 'Teams', 'KPI_Master', 'Agent_Current'];
  const WORKFLOW_ENTITIES = DATA_SERVICE?.WORKFLOW_ENTITIES || [
    'Users',
    'Agent_Current',
    'Missions',
    'Mission_Assignments',
    'Challenges',
    'Challenge_Participants',
    'Challenge_Results',
    'Rewards',
    'Reward_Redemptions',
    'Communications',
    'Communication_Status',
    'Learning_Modules',
    'Learning_Assignments',
    'Learning_Completion_Status',
    'PKT_Assessments',
    'PKT_Questions',
    'PKT_Attempts',
    'Coaching',
    'Recognition',
    'Commercial_Verification',
    'TL_Manager_Verification',
    'Points_Ledger',
    'XP_Ledger',
  ];
  const SERVICE_STATE_KEYS = {
    Users: 'users',
    Teams: 'teams',
    Processes: 'processes',
    KPI_Master: 'kpis',
    Performance_Data: 'performance',
    Daily_Agent_Score: 'dailyScore',
    Agent_Current: 'agentCurrent',
    Leaderboard: 'leaderboard',
    Badges: 'badges',
    Agent_Badges: 'agentBadges',
    SLA_Commercial_Rules: 'slaRules',
    Penalty_Reward_Slabs: 'slabs',
    Commercial_Exposure: 'exposure',
    What_If_Scenarios: 'whatIf',
    Learning_Points_Rules: 'pointsRules',
    Points_Ledger: 'pointsLedger',
    XP_Ledger: 'xpLedger',
    Missions: 'missions',
    Mission_Assignments: 'missionAssignments',
    Challenges: 'challenges',
    Challenge_Participants: 'challengeParticipants',
    Challenge_Results: 'challengeResults',
    Rewards: 'rewards',
    Reward_Redemptions: 'redemptions',
    Communications: 'communications',
    Communication_Status: 'communicationStatus',
    Learning_Modules: 'modules',
    Learning_Assignments: 'assignments',
    Learning_Completion_Status: 'completion',
    PKT_Assessments: 'pkts',
    PKT_Questions: 'pktQuestions',
    PKT_Attempts: 'pktAttempts',
    Coaching: 'coaching',
    Recognition: 'recognition',
    Commercial_Verification: 'verification',
    TL_Manager_Verification: 'tlVerification',
  };
  const UI_STATE_KEYS = [
    'role', 'activeUserId', 'page', 'drillModule', 'drillKpi', 'whatIfRule',
    'filters', 'challengeBucket', 'challengeTheme', 'missionFilter', 'storeCategory',
    'lbFilter', 'lbKpi', 'mgrWhatIfKpi', 'mgrWhatIfImprove',
  ];
  const LS_KEY = 'arena_state_clover_medicare_v1';
  const STORAGE_VERSION = 8;
  // Wipe any legacy state from earlier prototype iterations.
  ['arena_training_state_v1', 'arena_state_v2', 'arena_state_v3', 'arena_state_v4', 'arena_state_v5', 'arena_state_v6'].forEach(k => {
    try { localStorage.removeItem(k); } catch (e) { /**/ }
  });

  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function uid(prefix) { return `${prefix}${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 9999).toString(36).toUpperCase()}`; }
  function todayStr() { return new Date().toISOString().slice(0, 10); }
  function addDays(n, base) { const d = base ? new Date(base) : new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

  // ---- Bootstrap ----------------------------------------------------------
  function rowsFrom(snapshot, entity) {
    return clone((snapshot && snapshot[entity]) || []);
  }

  function overlayServiceEntities(existing, snapshot) {
    const next = Object.assign({}, existing);
    for (const entity of SERVICE_ENTITIES) {
      const key = SERVICE_STATE_KEYS[entity];
      if (key && Array.isArray(snapshot?.[entity])) next[key] = rowsFrom(snapshot, entity);
    }
    return next;
  }

  function readStoredUiState() {
    try {
      const cached = localStorage.getItem(LS_KEY);
      if (!cached) return null;
      const parsed = JSON.parse(cached);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function applyStoredUiState(base, stored) {
    if (!stored) return base;
    const next = Object.assign({}, base);
    for (const key of UI_STATE_KEYS) {
      if (stored[key] !== undefined) next[key] = clone(stored[key]);
    }
    next.__v = STORAGE_VERSION;
    return next;
  }

  function bootstrapState(snapshot, isActiveUserRecord) {
    const base = {
      __v: STORAGE_VERSION,
      role: 'Agent',
      activeUserId: null,
      page: 'home',

      // identity & org
      users: rowsFrom(snapshot, 'Users'),
      teams: rowsFrom(snapshot, 'Teams'),
      processes: rowsFrom(snapshot, 'Processes'),

      // KPI & performance
      kpis: rowsFrom(snapshot, 'KPI_Master'),
      performance: rowsFrom(snapshot, 'Performance_Data'),
      dailyScore: rowsFrom(snapshot, 'Daily_Agent_Score'),
      agentCurrent: rowsFrom(snapshot, 'Agent_Current'),
      leaderboard: rowsFrom(snapshot, 'Leaderboard'),

      // ledgers
      pointsLedger: rowsFrom(snapshot, 'Points_Ledger'),
      xpLedger: rowsFrom(snapshot, 'XP_Ledger'),

      // missions / challenges
      missions: rowsFrom(snapshot, 'Missions'),
      missionAssignments: rowsFrom(snapshot, 'Mission_Assignments'),
      challenges: rowsFrom(snapshot, 'Challenges'),
      challengeParticipants: rowsFrom(snapshot, 'Challenge_Participants'),
      challengeResults: rowsFrom(snapshot, 'Challenge_Results'),

      // badges & rewards
      badges: rowsFrom(snapshot, 'Badges'),
      agentBadges: rowsFrom(snapshot, 'Agent_Badges'),
      rewards: rowsFrom(snapshot, 'Rewards'),
      redemptions: rowsFrom(snapshot, 'Reward_Redemptions'),

      // commercial
      slaRules: rowsFrom(snapshot, 'SLA_Commercial_Rules'),
      slabs: rowsFrom(snapshot, 'Penalty_Reward_Slabs'),
      exposure: rowsFrom(snapshot, 'Commercial_Exposure'),
      verification: rowsFrom(snapshot, 'Commercial_Verification'),
      whatIf: rowsFrom(snapshot, 'What_If_Scenarios'),

      // training & PKT
      modules: rowsFrom(snapshot, 'Learning_Modules'),
      assignments: rowsFrom(snapshot, 'Learning_Assignments'),
      completion: rowsFrom(snapshot, 'Learning_Completion_Status'),
      pkts: rowsFrom(snapshot, 'PKT_Assessments'),
      pktQuestions: rowsFrom(snapshot, 'PKT_Questions'),
      pktAttempts: rowsFrom(snapshot, 'PKT_Attempts'),
      pointsRules: rowsFrom(snapshot, 'Learning_Points_Rules'),
      tlVerification: rowsFrom(snapshot, 'TL_Manager_Verification'),

      // communications
      communications: rowsFrom(snapshot, 'Communications'),
      communicationStatus: rowsFrom(snapshot, 'Communication_Status'),

      // people-ops
      coaching: rowsFrom(snapshot, 'Coaching'),
      recognition: rowsFrom(snapshot, 'Recognition'),

      // simulation-only fields
      missionProgress: {},
      challengeStatus: {},
      activity: [],
      drillModule: null,
      drillKpi: null,
      whatIfRule: null,
      filters: { moduleType: 'all', search: '', team: 'all' },

      // challenge arena view state
      challengeBucket: 'active', // active | received | sent | completed | all
      challengeTheme: 'all',     // all | "Conversion Sprint" | ...

      // missions view state
      missionFilter: 'all',      // all | Daily | Weekly | "SLA Recovery" | ...

      // arena store view state
      storeCategory: 'all',      // all | Instant Perks | Recognition Rewards | Work-Life Rewards | Learning Rewards | Team Rewards

      // leaderboard view state
      lbFilter: 'team',          // team | process | kpi | weekly | monthly | challenge
      lbKpi: null,               // selected configurable KPI when lbFilter === 'kpi'

      // manager command center state
      mgrWhatIfKpi: null,        // active configurable KPI for the inline what-if widget
      mgrWhatIfImprove: 1.0,     // selected improvement assumption for Manager What-If
    };
    const firstAgent = base.users.find(u => u.Role === 'Agent' && isActiveUserRecord(u)) || base.users.find(isActiveUserRecord);
    if (firstAgent) {
      base.role = firstAgent.Role || base.role;
      base.activeUserId = firstAgent.UserID;
    }
    return applyStoredUiState(base, readStoredUiState());
  }

  window.ArenaCoreState = {
    DATA_SERVICE, SERVICE_ENTITIES, WORKFLOW_ENTITIES, SERVICE_STATE_KEYS, UI_STATE_KEYS,
    LS_KEY, STORAGE_VERSION, clone, uid, todayStr, addDays, rowsFrom,
    overlayServiceEntities, readStoredUiState, applyStoredUiState, bootstrapState,
  };
})();
