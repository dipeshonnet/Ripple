const SOURCE_ENTITIES = [
  'Users',
  'Teams',
  'Processes',
  'KPI_Master',
  'Performance_Data',
  'Daily_Agent_Score',
  'Agent_Current',
  'Leaderboard',
  'Points_Ledger',
  'XP_Ledger',
  'Missions',
  'Mission_Assignments',
  'Challenges',
  'Challenge_Participants',
  'Challenge_Results',
  'Badges',
  'Agent_Badges',
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
  'SLA_Commercial_Rules',
  'Penalty_Reward_Slabs',
  'Commercial_Exposure',
  'Commercial_Verification',
  'What_If_Scenarios',
  'Coaching',
  'Recognition',
  'Learning_Points_Rules',
  'TL_Manager_Verification',
];

const CONTROL_ENTITIES = [
  'Import_Log',
  'App_Config',
  'Feature_Flags',
  'Admin_Audit_Log',
];

const IMPORTABLE_ENTITIES = [
  ...SOURCE_ENTITIES,
  'App_Config',
  'Feature_Flags',
];

const ALL_ENTITIES = [...SOURCE_ENTITIES, ...CONTROL_ENTITIES];

const CONTROL_ENTITY_COLUMNS = {
  Import_Log: [
    'Import_ID',
    'Entity_Name',
    'Filename',
    'Uploaded_By',
    'Upload_Date',
    'Row_Count',
    'Mode',
    'Status',
    'Validation_Error_Count',
    'Commit_Timestamp',
    'Reverted_From_Import_ID',
  ],
  App_Config: [
    'Config_ID',
    'Config_Key',
    'Config_Value',
    'Value_Type',
    'Description',
    'Version',
    'Is_Active',
    'Last_Modified_By',
    'Last_Modified_Date',
  ],
  Feature_Flags: [
    'Flag_ID',
    'Flag_Key',
    'Flag_Label',
    'Enabled',
    'Scope',
    'Scope_Role',
    'Scope_Team_ID',
    'Modified_By',
    'Modified_Date',
  ],
  Admin_Audit_Log: [
    'Log_ID',
    'Admin_UserID',
    'Action_Type',
    'Entity_Affected',
    'Record_ID',
    'Before_Snapshot',
    'After_Snapshot',
    'Timestamp',
    'IP_Address',
  ],
};

const PRIMARY_KEYS = {
  Users: ['UserID'],
  Teams: ['TeamID'],
  Processes: ['ProcessID'],
  KPI_Master: ['KPI_ID'],
  Performance_Data: ['Date', 'UserID', 'TeamID', 'ProcessID', 'KPI_ID'],
  Daily_Agent_Score: ['Date', 'UserID'],
  Agent_Current: ['UserID'],
  Leaderboard: ['Leaderboard_ID'],
  Points_Ledger: ['Ledger_ID'],
  XP_Ledger: ['Ledger_ID'],
  Missions: ['Mission_ID'],
  Mission_Assignments: ['Assignment_ID'],
  Challenges: ['Challenge_ID'],
  Challenge_Participants: ['Participant_ID'],
  Challenge_Results: ['Result_ID'],
  Badges: ['Badge_ID'],
  Agent_Badges: ['Agent_Badge_ID'],
  Rewards: ['Reward_ID'],
  Reward_Redemptions: ['Redemption_ID'],
  Communications: ['Communication_ID'],
  Communication_Status: ['Communication_ID', 'UserID'],
  Learning_Modules: ['Module_ID'],
  Learning_Assignments: ['Assignment_ID'],
  Learning_Completion_Status: ['Assignment_ID'],
  PKT_Assessments: ['PKT_ID'],
  PKT_Questions: ['Question_ID'],
  PKT_Attempts: ['Attempt_ID'],
  SLA_Commercial_Rules: ['Rule_ID'],
  Penalty_Reward_Slabs: ['Slab_ID'],
  Commercial_Exposure: ['Snapshot_Date', 'Entity_ID', 'KPI_ID'],
  Commercial_Verification: ['Snapshot_Date', 'Entity_ID', 'KPI_ID', 'Owner_ID'],
  What_If_Scenarios: ['Scenario_ID'],
  Coaching: ['Coaching_ID'],
  Recognition: ['Recognition_ID'],
  Learning_Points_Rules: ['Activity', 'Module_Type'],
  TL_Manager_Verification: ['Owner_ID', 'TeamID', 'Module_ID'],
  Import_Log: ['Import_ID'],
  App_Config: ['Config_ID'],
  Feature_Flags: ['Flag_ID'],
  Admin_Audit_Log: ['Log_ID'],
};

const ID_PREFIX = {
  Users: 'USR',
  Teams: 'TEAM',
  Processes: 'PROC',
  KPI_Master: 'KPI',
  Missions: 'MIS',
  Challenges: 'CH',
  Badges: 'BADGE',
  Rewards: 'REW',
  SLA_Commercial_Rules: 'SLA',
  Penalty_Reward_Slabs: 'SLAB',
  Import_Log: 'IMP',
  App_Config: 'CFG',
  Feature_Flags: 'FLAG',
  Admin_Audit_Log: 'AUD',
};

const GAMIFICATION_ENTITIES = {
  missions: 'Missions',
  mission_assignments: 'Mission_Assignments',
  challenges: 'Challenges',
  challenge_participants: 'Challenge_Participants',
  badges: 'Badges',
  rewards: 'Rewards',
  reward_redemptions: 'Reward_Redemptions',
  learning_points_rules: 'Learning_Points_Rules',
  points_ledger: 'Points_Ledger',
  xp_ledger: 'XP_Ledger',
};

function canonicalKey(name) {
  return String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

const ENTITY_LOOKUP = new Map();
for (const entity of ALL_ENTITIES) {
  ENTITY_LOOKUP.set(canonicalKey(entity), entity);
  ENTITY_LOOKUP.set(entity.toLowerCase(), entity);
}
ENTITY_LOOKUP.set('kpis', 'KPI_Master');
ENTITY_LOOKUP.set('kpi', 'KPI_Master');
ENTITY_LOOKUP.set('users', 'Users');
ENTITY_LOOKUP.set('teams', 'Teams');
ENTITY_LOOKUP.set('sla_rules', 'SLA_Commercial_Rules');
ENTITY_LOOKUP.set('commercial_rules', 'SLA_Commercial_Rules');
ENTITY_LOOKUP.set('slabs', 'Penalty_Reward_Slabs');
ENTITY_LOOKUP.set('feature_flags', 'Feature_Flags');
ENTITY_LOOKUP.set('settings', 'App_Config');
ENTITY_LOOKUP.set('audit_log', 'Admin_Audit_Log');
ENTITY_LOOKUP.set('imports', 'Import_Log');

function normalizeEntityName(name) {
  const entity = ENTITY_LOOKUP.get(canonicalKey(name));
  if (!entity) {
    const error = new Error(`Unknown entity: ${name}`);
    error.status = 404;
    error.code = 'ENTITY_NOT_FOUND';
    throw error;
  }
  return entity;
}

function getPrimaryKeyFields(entity, rows = []) {
  if (PRIMARY_KEYS[entity]) return PRIMARY_KEYS[entity];
  const sample = rows.find(Boolean) || {};
  const idField = Object.keys(sample).find((key) => /(^|_)id$/i.test(key));
  return idField ? [idField] : Object.keys(sample).slice(0, 1);
}

function getRecordId(entity, record) {
  return getPrimaryKeyFields(entity, [record])
    .map((field) => record && record[field] != null ? String(record[field]) : '')
    .join('|');
}

function recordMatchesId(entity, record, id) {
  return getRecordId(entity, record) === String(id);
}

function assignIdIfMissing(entity, record) {
  const keys = getPrimaryKeyFields(entity, [record]);
  if (keys.length !== 1) return record;
  const key = keys[0];
  if (record[key] != null && record[key] !== '') return record;
  return { ...record, [key]: createId(ID_PREFIX[entity] || canonicalKey(entity).slice(0, 6).toUpperCase()) };
}

function createId(prefix) {
  const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`.toUpperCase();
  return `${prefix}_${suffix}`;
}

module.exports = {
  ALL_ENTITIES,
  CONTROL_ENTITIES,
  CONTROL_ENTITY_COLUMNS,
  IMPORTABLE_ENTITIES,
  SOURCE_ENTITIES,
  GAMIFICATION_ENTITIES,
  PRIMARY_KEYS,
  assignIdIfMissing,
  canonicalKey,
  createId,
  getPrimaryKeyFields,
  getRecordId,
  normalizeEntityName,
  recordMatchesId,
};
