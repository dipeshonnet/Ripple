/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const SCHEMA = path.join(__dirname, 'schema.sql');
const DATA_JS = path.join(ROOT, 'data.js');

const CONTROL_ENTITIES = ['Import_Log', 'App_Config', 'Feature_Flags', 'Admin_Audit_Log'];
const EXPECTED_SOURCE_ENTITIES = [
  'Users', 'Teams', 'Processes', 'KPI_Master',
  'Performance_Data', 'Daily_Agent_Score', 'Agent_Current',
  'Leaderboard', 'Points_Ledger', 'XP_Ledger',
  'Missions', 'Mission_Assignments',
  'Challenges', 'Challenge_Participants', 'Challenge_Results',
  'Badges', 'Agent_Badges',
  'Rewards', 'Reward_Redemptions',
  'Communications', 'Communication_Status',
  'Learning_Modules', 'Learning_Assignments', 'Learning_Completion_Status',
  'PKT_Assessments', 'PKT_Questions', 'PKT_Attempts',
  'SLA_Commercial_Rules', 'Penalty_Reward_Slabs',
  'Commercial_Exposure', 'Commercial_Verification',
  'What_If_Scenarios',
  'Coaching', 'Recognition',
  'Learning_Points_Rules', 'TL_Manager_Verification',
];

const ACTIVE_FLAG_TABLES = [
  'users', 'teams', 'kpi_master',
  'missions', 'challenges', 'badges', 'rewards',
  'learning_modules', 'pkt_assessments',
  'sla_commercial_rules', 'penalty_reward_slabs',
  'learning_points_rules', 'app_config',
];

const REQUIRED_FKS = [
  ['users', 'team_id', 'teams'],
  ['users', 'process_id', 'processes'],
  ['users', 'manager_id', 'users'],
  ['teams', 'process_id', 'processes'],
  ['teams', 'team_lead_id', 'users'],
  ['teams', 'manager_id', 'users'],
  ['performance_data', 'user_id', 'users'],
  ['performance_data', 'team_id', 'teams'],
  ['performance_data', 'process_id', 'processes'],
  ['performance_data', 'kpi_id', 'kpi_master'],
  ['daily_agent_score', 'user_id', 'users'],
  ['agent_current', 'user_id', 'users'],
  ['leaderboard', 'user_id', 'users'],
  ['points_ledger', 'user_id', 'users'],
  ['xp_ledger', 'user_id', 'users'],
  ['missions', 'kpi_id', 'kpi_master'],
  ['mission_assignments', 'mission_id', 'missions'],
  ['mission_assignments', 'user_id', 'users'],
  ['challenges', 'kpi_id', 'kpi_master'],
  ['challenge_participants', 'challenge_id', 'challenges'],
  ['challenge_participants', 'user_id', 'users'],
  ['challenge_results', 'challenge_id', 'challenges'],
  ['agent_badges', 'badge_id', 'badges'],
  ['reward_redemptions', 'reward_id', 'rewards'],
  ['communications', 'published_by', 'users'],
  ['communication_status', 'communication_id', 'communications'],
  ['learning_assignments', 'module_id', 'learning_modules'],
  ['learning_completion_status', 'assignment_id', 'learning_assignments'],
  ['pkt_assessments', 'module_id', 'learning_modules'],
  ['pkt_questions', 'pkt_id', 'pkt_assessments'],
  ['pkt_attempts', 'pkt_id', 'pkt_assessments'],
  ['sla_commercial_rules', 'kpi_id', 'kpi_master'],
  ['penalty_reward_slabs', 'rule_id', 'sla_commercial_rules'],
  ['commercial_exposure', 'kpi_id', 'kpi_master'],
  ['commercial_verification', 'owner_id', 'users'],
  ['what_if_scenarios', 'recommended_team', 'teams'],
  ['coaching', 'assigned_by', 'users'],
  ['recognition', 'given_by', 'users'],
  ['tl_manager_verification', 'module_id', 'learning_modules'],
  ['import_log', 'uploaded_by', 'users'],
  ['feature_flags', 'scope_team_id', 'teams'],
  ['admin_audit_log', 'admin_user_id', 'users'],
];

function snake(name) {
  return name
    .replace(/%/g, 'Pct')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

function loadSeedEntities() {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(DATA_JS, 'utf8'), context, { filename: 'data.js' });
  return context.window.SEED_DATA || {};
}

function tableBlock(sql, table) {
  const re = new RegExp(`CREATE\\s+TABLE\\s+${table}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i');
  const match = sql.match(re);
  return match ? match[1] : null;
}

function hasCreateTable(sql, table) {
  return new RegExp(`CREATE\\s+TABLE\\s+${table}\\s*\\(`, 'i').test(sql);
}

function hasColumn(block, column) {
  return new RegExp(`(^|\\n)\\s*${column}\\s+`, 'i').test(block);
}

function hasFk(sql, table, column, target) {
  const re = new RegExp(
    `ALTER\\s+TABLE\\s+${table}\\s+ADD\\s+CONSTRAINT\\s+\\S+\\s+FOREIGN\\s+KEY\\s*\\(\\s*${column}\\s*\\)\\s+REFERENCES\\s+${target}\\s*\\(`,
    'i',
  );
  return re.test(sql);
}

function hasIndex(sql, name) {
  return new RegExp(`CREATE\\s+INDEX\\s+${name}\\s+ON`, 'i').test(sql);
}

const sql = fs.readFileSync(SCHEMA, 'utf8');
const seedData = loadSeedEntities();
const seedEntities = Object.keys(seedData);

assert(seedEntities.length === 36, `expected data.js to expose 36 entities, found ${seedEntities.length}`);
for (const entity of EXPECTED_SOURCE_ENTITIES) {
  assert(seedEntities.includes(entity), `data.js missing expected entity ${entity}`);
}

const expectedTables = [...EXPECTED_SOURCE_ENTITIES, ...CONTROL_ENTITIES].map(snake);
for (const table of expectedTables) {
  assert(hasCreateTable(sql, table), `schema missing CREATE TABLE ${table}`);
  const block = tableBlock(sql, table);
  assert(block, `could not parse table block for ${table}`);
  assert(/PRIMARY\s+KEY/i.test(block), `${table} missing primary key`);
  assert(hasColumn(block, 'created_at'), `${table} missing created_at`);
  assert(hasColumn(block, 'updated_at'), `${table} missing updated_at`);
}

const SOURCE_COLUMN_OVERRIDES = {
  Performance_Data: { Date: 'performance_date' },
  Daily_Agent_Score: { Date: 'score_date' },
  Points_Ledger: { Timestamp: 'ledger_timestamp' },
  XP_Ledger: { Timestamp: 'ledger_timestamp' },
};

for (const entity of EXPECTED_SOURCE_ENTITIES) {
  const table = snake(entity);
  const block = tableBlock(sql, table);
  const columns = new Set();
  for (const row of seedData[entity]) {
    for (const sourceColumn of Object.keys(row)) {
      columns.add(sourceColumn);
    }
  }
  for (const sourceColumn of columns) {
    const mapped = (SOURCE_COLUMN_OVERRIDES[entity] && SOURCE_COLUMN_OVERRIDES[entity][sourceColumn]) || snake(sourceColumn);
    assert(hasColumn(block, mapped), `${table} missing mapped source column ${sourceColumn} -> ${mapped}`);
  }
}

for (const table of EXPECTED_SOURCE_ENTITIES.map(snake)) {
  const block = tableBlock(sql, table);
  assert(hasColumn(block, 'import_id'), `${table} missing import_id for import lineage`);
  assert(hasColumn(block, 'source_row_number'), `${table} missing source_row_number`);
  assert(hasColumn(block, 'source_hash'), `${table} missing source_hash`);
  assert(hasFk(sql, table, 'import_id', 'import_log'), `${table} missing import_log foreign key`);
}

for (const table of ACTIVE_FLAG_TABLES) {
  const block = tableBlock(sql, table);
  assert(block && hasColumn(block, 'is_active'), `${table} missing BRD lifecycle is_active flag`);
}

const featureFlags = tableBlock(sql, 'feature_flags');
assert(featureFlags && hasColumn(featureFlags, 'enabled'), 'feature_flags missing enabled toggle');
assert(/scope\s+TEXT[\s\S]*CHECK\s*\(\s*scope\s+IN\s*\('All',\s*'Role',\s*'Team'\)/i.test(featureFlags), 'feature_flags missing All/Role/Team scope check');

const audit = tableBlock(sql, 'admin_audit_log');
assert(audit && hasColumn(audit, 'before_snapshot'), 'admin_audit_log missing before_snapshot');
assert(audit && hasColumn(audit, 'after_snapshot'), 'admin_audit_log missing after_snapshot');

const importLog = tableBlock(sql, 'import_log');
assert(importLog && hasColumn(importLog, 'validation_error_count'), 'import_log missing validation_error_count');
assert(importLog && hasColumn(importLog, 'commit_timestamp'), 'import_log missing commit_timestamp');

for (const [table, column, target] of REQUIRED_FKS) {
  assert(hasFk(sql, table, column, target), `${table}.${column} missing foreign key to ${target}`);
}

for (const indexName of [
  'idx_users_role_active',
  'idx_users_team_process_active',
  'idx_performance_team_scope',
  'idx_leaderboard_scope_rank',
  'idx_missions_audience_active',
  'idx_learning_assignments_team_status',
  'idx_commercial_exposure_scope',
  'idx_import_log_entity_status',
  'idx_feature_flags_scope_enabled',
  'idx_admin_audit_entity_time',
]) {
  assert(hasIndex(sql, indexName), `missing scoped read index ${indexName}`);
}

console.log('SCHEMA VALIDATION PASSED');
console.log(`Tables: ${expectedTables.length} (${EXPECTED_SOURCE_ENTITIES.length} source + ${CONTROL_ENTITIES.length} control)`);
console.log(`Required foreign keys checked: ${REQUIRED_FKS.length}`);
