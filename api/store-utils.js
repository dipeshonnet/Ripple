const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');

const {
  CONTROL_ENTITY_COLUMNS,
  createId,
  getPrimaryKeyFields,
  getRecordId,
  recordMatchesId,
} = require('./entity-metadata');

const SYSTEM_IMPORT_FIELDS = new Set(['Import_ID', 'Source_Row_Number', 'Source_Hash', 'created_at', 'updated_at']);

function loadSeedData(seedFile) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(seedFile, 'utf8'), context, { filename: seedFile });
  return context.window.SEED_DATA || {};
}

function storeCanonicalKey(name) {
  return String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

function storeFieldValue(row, names) {
  if (!row) return undefined;
  const wanted = new Set([].concat(names || []).map(storeCanonicalKey));
  const match = Object.keys(row).find((key) => wanted.has(storeCanonicalKey(key)));
  return match ? row[match] : undefined;
}

function storeParseFlag(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (value == null || value === '') return null;
  const text = String(value).trim().toLowerCase();
  if (['true', 'yes', 'y', '1', 'active', 'enabled', 'visible'].includes(text)) return true;
  if (['false', 'no', 'n', '0', 'inactive', 'disabled', 'hidden'].includes(text)) return false;
  return null;
}

function storeNormalizeRole(role) {
  const text = String(role || '').toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (text === 'tl' || text === 'team lead' || text === 'team leader') return 'Team Lead';
  if (text === 'manager' || text === 'mgr') return 'Manager';
  if (text === 'agent' || text === 'advisor') return 'Agent';
  if (text === 'admin' || text === 'administrator') return 'Admin';
  return role || '';
}

function storeKpiText(kpi) {
  return [
    storeFieldValue(kpi, ['KPI_Name', 'Name', 'Metric_Name']),
    storeFieldValue(kpi, ['KPI_Type', 'Metric_Type', 'Category']),
    storeFieldValue(kpi, ['Description', 'Definition', 'Business_Definition']),
  ].filter(Boolean).join(' ').toLowerCase();
}

function storeIsActiveKpi(kpi) {
  const active = storeParseFlag(storeFieldValue(kpi, ['Active', 'Is_Active', 'Enabled', 'Status']));
  return active !== false && String(storeFieldValue(kpi, ['Status']) || '').toLowerCase() !== 'retired';
}

function storeIsFinancialKpi(kpi) {
  const text = storeKpiText(kpi);
  return /financial|commercial|revenue|cost|expense|savings|penalty|reward|margin|billable|rate card|gross cost|cost per|acquisition/.test(text);
}

function storeIsAgentOwnedKpi(kpi) {
  if (!kpi || !storeIsActiveKpi(kpi) || storeIsFinancialKpi(kpi)) return false;
  const text = storeKpiText(kpi);
  return !/(program|account|executive|manager|back office|back-office|claims|asa|abandon|shrinkage|per 1,000|per 1000|ctm rate|rate \/ 1,000)/.test(text);
}

function storeKpiVisibleFlag(kpi, role) {
  const normalized = storeNormalizeRole(role);
  const namesByRole = {
    Agent: ['Visible_Agent', 'Agent_Visible', 'Show_Agent', 'Agent', 'Visible_To_Agent'],
    'Team Lead': ['Visible_TL', 'Visible_Team_Lead', 'TL_Visible', 'Team_Lead_Visible', 'Show_TL', 'Show_Team_Lead', 'Visible_To_TL'],
    Manager: ['Visible_Manager', 'Manager_Visible', 'Show_Manager', 'Visible_To_Manager'],
  };
  for (const name of namesByRole[normalized] || []) {
    const parsed = storeParseFlag(storeFieldValue(kpi, [name]));
    if (parsed !== null) return parsed;
  }
  return null;
}

function storeKpiVisibleForRole(kpi, role) {
  if (!storeIsActiveKpi(kpi)) return false;
  const normalized = storeNormalizeRole(role);
  if (normalized === 'Admin') return true;
  const explicit = storeKpiVisibleFlag(kpi, normalized);
  if (explicit !== null) return explicit && (normalized !== 'Agent' || storeIsAgentOwnedKpi(kpi));
  if (normalized === 'Agent') return storeIsAgentOwnedKpi(kpi);
  return normalized === 'Team Lead' || normalized === 'Manager';
}

function storeKpiMap(state) {
  const map = new Map();
  for (const kpi of state?.KPI_Master || []) {
    if (kpi?.KPI_ID) map.set(kpi.KPI_ID, kpi);
  }
  return map;
}

function commercialEntityMatchesTeam(row, teamId) {
  return row.Entity_Level === 'Team' && row.Entity_ID === teamId;
}

function rowKpiVisible(row, role, kpiMap) {
  if (!row?.KPI_ID) return true;
  return storeKpiVisibleForRole(kpiMap.get(row.KPI_ID) || row, role);
}

function applyRoleScope(entity, rows, session, state = {}) {
  if (!session || !session.user || session.user.Role === 'Admin') return rows;
  const user = session.user;
  const role = storeNormalizeRole(user.Role);
  const kpiMap = storeKpiMap(state);

  if (entity === 'Users') {
    if (role === 'Agent') return rows.filter((row) => row.UserID === user.UserID);
    if (role === 'Team Lead') {
      return rows.filter((row) => row.UserID === user.UserID || row.TeamID === user.TeamID);
    }
    if (role === 'Manager') {
      return rows.filter((row) => row.UserID === user.UserID || row.ManagerID === user.UserID || row.Role === 'Team Lead');
    }
  }
  if (entity === 'Teams') {
    if (role === 'Agent' || role === 'Team Lead') return rows.filter((row) => row.TeamID === user.TeamID);
    if (role === 'Manager') return rows.filter((row) => row.ManagerID === user.UserID);
  }
  if (entity === 'Processes') {
    if (role === 'Agent' || role === 'Team Lead') return rows.filter((row) => row.ProcessID === user.ProcessID);
    return rows;
  }
  if (entity === 'KPI_Master') {
    return rows.filter((row) => storeKpiVisibleForRole(row, role));
  }
  if (entity === 'Admin_Audit_Log' || entity === 'Import_Log' || entity === 'App_Config' || entity === 'Feature_Flags') {
    return [];
  }

  if (entity === 'Performance_Data') {
    if (role === 'Agent') return rows.filter((row) => row.UserID === user.UserID && rowKpiVisible(row, role, kpiMap));
    if (role === 'Team Lead') return rows.filter((row) => row.TeamID === user.TeamID && rowKpiVisible(row, role, kpiMap));
    if (role === 'Manager') return rows.filter((row) => rowKpiVisible(row, role, kpiMap));
  }

  if (entity === 'Daily_Agent_Score' || entity === 'Agent_Current') {
    if (role === 'Agent') return rows.filter((row) => row.UserID === user.UserID);
    if (role === 'Team Lead') return rows.filter((row) => row.TeamID === user.TeamID);
    return rows;
  }

  if (entity === 'Leaderboard') {
    if (role === 'Agent' || role === 'Team Lead') return rows.filter((row) => row.TeamID === user.TeamID);
    return rows;
  }

  if (entity === 'Points_Ledger' || entity === 'XP_Ledger' || entity === 'Agent_Badges') {
    if (role === 'Agent') return rows.filter((row) => row.UserID === user.UserID);
    if (role === 'Team Lead') return rows.filter((row) => row.TeamID === user.TeamID || row.Owner_ID === user.UserID);
    return rows;
  }

  if (entity === 'Commercial_Exposure' || entity === 'Commercial_Verification') {
    if (role === 'Agent') return [];
    if (role === 'Team Lead') return rows.filter((row) => commercialEntityMatchesTeam(row, user.TeamID) && rowKpiVisible(row, role, kpiMap));
    return rows.filter((row) => rowKpiVisible(row, role, kpiMap));
  }

  if (entity === 'What_If_Scenarios') {
    if (role === 'Agent' || role === 'Team Lead') return [];
    return rows.filter((row) => rowKpiVisible(row, role, kpiMap));
  }

  if (entity === 'SLA_Commercial_Rules') {
    if (role === 'Agent') return [];
    return rows.filter((row) => rowKpiVisible(row, role, kpiMap));
  }

  if (entity === 'Penalty_Reward_Slabs') {
    if (role === 'Agent') return [];
    return rows;
  }

  if (role === 'Agent') {
    return rows.filter((row) => row.UserID === user.UserID || row.Owner_ID === user.UserID || row.Audience_ID === user.TeamID);
  }
  if (role === 'Team Lead') {
    return rows.filter((row) => {
      return row.UserID === user.UserID || row.Owner_ID === user.UserID || row.TeamID === user.TeamID || row.Audience_ID === user.TeamID;
    });
  }
  if (role === 'Manager') {
    return rows;
  }
  return rows;
}

function applyQueryFilters(rows, query) {
  const ignored = new Set(['limit', 'offset', 'format', 'q']);
  let result = rows;
  for (const [key, value] of Object.entries(query || {})) {
    if (ignored.has(key) || value == null || value === '') continue;
    result = result.filter((row) => String(row[key] == null ? '' : row[key]) === String(value));
  }
  if (query && query.q) {
    const term = String(query.q).toLowerCase();
    result = result.filter((row) => JSON.stringify(row).toLowerCase().includes(term));
  }
  return result;
}

function configRow(key, value, valueType, description) {
  const now = nowIso();
  return {
    Config_ID: createId('CFG'),
    Config_Key: key,
    Config_Value: value,
    Value_Type: valueType,
    Description: description,
    Version: 1,
    Is_Active: true,
    Last_Modified_By: 'SYSTEM',
    Last_Modified_Date: now,
    created_at: now,
    updated_at: now,
  };
}

function flagRow(key, label, enabled, scope, role = null, teamId = null) {
  const now = nowIso();
  return {
    Flag_ID: createId('FLAG'),
    Flag_Key: key,
    Flag_Label: label,
    Enabled: enabled,
    Scope: scope,
    Scope_Role: role,
    Scope_Team_ID: teamId,
    Modified_By: 'SYSTEM',
    Modified_Date: now,
    created_at: now,
    updated_at: now,
  };
}

function validatePwaIconUpload(payload = {}) {
  const size = Number(payload.size || payload.slot);
  if (![192, 512].includes(size)) {
    validationError('PWA icon slot must be 192 or 512.', 'PWA_ICON_SLOT_INVALID');
  }
  const width = Number(payload.width);
  const height = Number(payload.height);
  if (width !== size || height !== size) {
    validationError(`PWA icon must be exactly ${size} x ${size} px.`, 'PWA_ICON_DIMENSIONS_INVALID', {
      expected: { width: size, height: size },
      actual: { width, height },
    });
  }
  const mimeType = String(payload.mimeType || payload.type || '').toLowerCase();
  if (mimeType !== 'image/png') {
    validationError('PWA icon upload must be a PNG image.', 'PWA_ICON_TYPE_INVALID');
  }
  const dataUrl = String(payload.dataUrl || payload.src || '');
  if (!dataUrl.startsWith('data:image/png;base64,')) {
    validationError('PWA icon upload must include a PNG data URL.', 'PWA_ICON_DATA_INVALID');
  }
  return {
    size,
    width,
    height,
    mimeType,
    dataUrl,
    filename: String(payload.filename || `icon-${size}.png`).slice(0, 160),
  };
}

function normalizeFeatureFlagPatch(row, state) {
  const scope = normalizeFlagScope(row.Scope);
  const normalized = {
    Flag_Key: row.Flag_Key,
    Flag_Label: row.Flag_Label,
    Enabled: toBooleanFlag(row.Enabled),
    Scope: scope,
    Scope_Role: null,
    Scope_Team_ID: null,
  };
  if (scope === 'Role') {
    const role = String(row.Scope_Role || '').trim();
    if (!['Agent', 'TL', 'Manager', 'Admin'].includes(role)) {
      validationError('Role-scoped feature flags require Scope_Role.', 'FEATURE_FLAG_ROLE_REQUIRED');
    }
    normalized.Scope_Role = role;
  }
  if (scope === 'Team') {
    const teamId = String(row.Scope_Team_ID || '').trim();
    if (!teamId) validationError('Team-scoped feature flags require Scope_Team_ID.', 'FEATURE_FLAG_TEAM_REQUIRED');
    const teamExists = (state.Teams || []).some((team) => String(team.TeamID) === teamId);
    if (!teamExists) validationError(`Unknown feature flag team scope: ${teamId}`, 'FEATURE_FLAG_TEAM_UNKNOWN');
    normalized.Scope_Team_ID = teamId;
  }
  return normalized;
}

function normalizeFlagScope(value) {
  const scope = String(value || 'All').trim().toLowerCase();
  if (scope === 'role') return 'Role';
  if (scope === 'team') return 'Team';
  if (scope === 'all') return 'All';
  validationError('Feature flag Scope must be All, Role, or Team.', 'FEATURE_FLAG_SCOPE_INVALID');
}

function toBooleanFlag(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value || '').trim().toLowerCase();
  return ['true', '1', 'yes', 'on', 'enabled'].includes(text);
}

function auditSearchText(row) {
  return [
    row.Log_ID,
    row.Admin_UserID,
    row.Action_Type,
    row.Entity_Affected,
    row.Record_ID,
    row.Timestamp,
    row.IP_Address,
    JSON.stringify(row.Before_Snapshot || {}),
    JSON.stringify(row.After_Snapshot || {}),
  ].join(' ').toLowerCase();
}

function inferColumns(entity, rows, primaryKey) {
  const ordered = [];
  const seen = new Set();
  const add = (name) => {
    if (!name || seen.has(name) || SYSTEM_IMPORT_FIELDS.has(name)) return;
    seen.add(name);
    ordered.push(name);
  };
  for (const key of primaryKey || []) add(key);
  for (const name of CONTROL_ENTITY_COLUMNS[entity] || []) add(name);
  for (const row of rows || []) {
    for (const name of Object.keys(row || {})) add(name);
  }
  return ordered;
}

function inferColumnType(name, values) {
  if (/(_date|date$|timestamp|_at$)/i.test(name)) return 'date';
  if (/^(active|enabled|is_|has_)/i.test(name) || /_(active|enabled)$/i.test(name)) return 'boolean';
  if (/snapshot|metadata/i.test(name)) return 'json';
  const nonBlank = (values || []).filter((value) => !isBlank(value));
  if (!nonBlank.length) return 'string';
  if (nonBlank.every(isBooleanLike)) return 'boolean';
  if (nonBlank.every(isNumberLike)) return 'number';
  if (nonBlank.every(isDateLike)) return 'date';
  if (nonBlank.every(isJsonLike)) return 'json';
  return 'string';
}

function valueMatchesType(value, expected) {
  if (expected === 'number') return isNumberLike(value);
  if (expected === 'boolean') return isBooleanLike(value);
  if (expected === 'date') return isDateLike(value);
  if (expected === 'json') return isJsonLike(value);
  return true;
}

function normalizeImportRow(row, schema) {
  const columnTypes = new Map((schema?.columns || []).map((column) => [column.name, column.type]));
  const normalized = {};
  for (const [key, value] of Object.entries(row || {})) {
    if (isBlank(value)) {
      normalized[key] = value;
      continue;
    }
    const type = columnTypes.get(key);
    if (type === 'number' && isNumberLike(value)) {
      normalized[key] = Number(value);
    } else if (type === 'boolean' && isBooleanLike(value)) {
      normalized[key] = toBoolean(value);
    } else if (type === 'json' && typeof value === 'string' && isJsonLike(value)) {
      normalized[key] = JSON.parse(value);
    } else {
      normalized[key] = value;
    }
  }
  return normalized;
}

function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  return ['true', 'yes', 'y', '1'].includes(String(value).trim().toLowerCase());
}

function isBlank(value) {
  return value == null || (typeof value === 'string' && value.trim() === '');
}

function isNumberLike(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'string') return false;
  const text = value.trim();
  return text !== '' && Number.isFinite(Number(text));
}

function isBooleanLike(value) {
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return value === 0 || value === 1;
  if (typeof value !== 'string') return false;
  return ['true', 'false', 'yes', 'no', 'y', 'n', '1', '0'].includes(value.trim().toLowerCase());
}

function isDateLike(value) {
  if (value instanceof Date) return Number.isFinite(value.getTime());
  if (typeof value === 'number') return value > 20000 && value < 80000;
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!text) return false;
  return Number.isFinite(Date.parse(text));
}

function isJsonLike(value) {
  if (Array.isArray(value) || (value && typeof value === 'object')) return true;
  if (typeof value !== 'string') return false;
  const text = value.trim();
  if (!text) return false;
  if (!/^[\[{]/.test(text)) return false;
  try {
    JSON.parse(text);
    return true;
  } catch (error) {
    return false;
  }
}

function stampMutation(record) {
  const now = nowIso();
  return {
    ...record,
    updated_at: now,
    created_at: record.created_at || now,
  };
}

function sourceHash(row) {
  return crypto.createHash('sha256').update(JSON.stringify(row)).digest('hex');
}

function comparableHash(row) {
  const normalized = {};
  for (const key of Object.keys(row || {}).sort()) {
    if (SYSTEM_IMPORT_FIELDS.has(key)) continue;
    normalized[key] = row[key];
  }
  return sourceHash(normalized);
}

function groupCount(rows, field) {
  return rows.reduce((acc, row) => {
    const key = row[field] || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildDashboardSummary(rawState, environment) {
  const state = rawState || {};
  const users = Array.isArray(state.Users) ? state.Users : [];
  const kpis = Array.isArray(state.KPI_Master) ? state.KPI_Master : [];
  const imports = Array.isArray(state.Import_Log) ? state.Import_Log : [];
  const redemptions = Array.isArray(state.Reward_Redemptions) ? state.Reward_Redemptions : [];
  const coaching = Array.isArray(state.Coaching) ? state.Coaching : [];

  const activeUsers = users.filter(isActiveUser);
  const activeKpis = kpis.filter(isActiveKpi);
  const retiredKpis = kpis.filter((kpi) => !isActiveKpi(kpi));
  const queuedImports = imports.filter(isQueuedImport);
  const failedImports = imports.filter(isFailedImport);
  const pendingRedemptions = redemptions.filter(isPendingRedemption);
  const openCoaching = coaching.filter(isOpenCoaching);
  const dataFreshness = buildDataFreshness(state, imports);

  const baseSummary = {
    activeUserCount: activeUsers.length,
    activeUserCountByRole: groupCount(activeUsers, 'Role'),
    dataLoadTimestamp: dataFreshness.timestamp,
    dataFreshness,
    kpiCatalogue: {
      total: kpis.length,
      active: activeKpis.length,
      retired: retiredKpis.length,
    },
    importQueueDepth: queuedImports.length,
    failedImportCount: failedImports.length,
    pendingRewardApprovals: pendingRedemptions.length,
    openCoachingRecords: openCoaching.length,
    environment,
  };

  const alerts = buildDashboardAlerts(baseSummary, dataFreshness);
  const alertCountBySeverity = countAlertsBySeverity(alerts);
  const systemHealth = buildSystemHealth(baseSummary, alertCountBySeverity);

  return {
    ...baseSummary,
    alertCountBySeverity,
    alerts,
    systemHealth,
    health: systemHealth.status,
  };
}

function buildDataFreshness(state, imports) {
  const committedImport = latestRecordTimestamp(
    imports.filter((row) => canonicalStatus(row) === 'committed'),
    ['Commit_Timestamp', 'Upload_Date', 'updated_at', 'created_at']
  );
  const latestImport = committedImport || latestRecordTimestamp(imports, ['Commit_Timestamp', 'Upload_Date', 'updated_at', 'created_at']);
  const latestPerformance = latestRecordTimestamp(state.Performance_Data || [], ['Snapshot_Date', 'Date', 'updated_at', 'created_at']);
  const latestConfig = latestRecordTimestamp(state.App_Config || [], ['Last_Modified_Date', 'updated_at', 'created_at']);

  const selected = latestImport || latestPerformance || latestConfig || null;
  const source = latestImport ? 'Import_Log' : latestPerformance ? 'Performance_Data' : latestConfig ? 'App_Config' : 'Unavailable';
  const status = latestImport ? 'Synced' : latestPerformance ? 'Seed fallback' : latestConfig ? 'Config baseline' : 'Unavailable';

  return {
    timestamp: selected ? selected.timestamp : null,
    source,
    status,
    timeline: [
      timelineEntry('Latest committed import', latestImport, latestImport ? canonicalStatus(latestImport.row) || 'recorded' : 'none', 'Import_Log'),
      timelineEntry('Latest performance snapshot', latestPerformance, latestPerformance ? 'available' : 'not loaded', 'Performance_Data'),
      timelineEntry('App configuration update', latestConfig, latestConfig ? 'available' : 'not loaded', 'App_Config'),
    ],
  };
}

function timelineEntry(label, match, status, source) {
  return {
    label,
    timestamp: match ? match.timestamp : null,
    status,
    source,
  };
}

function buildDashboardAlerts(summary, dataFreshness) {
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

function countAlertsBySeverity(alerts) {
  return alerts.reduce((acc, alert) => {
    const severity = alert.severity || 'Info';
    acc[severity] = (acc[severity] || 0) + Number(alert.count || 1);
    return acc;
  }, { Critical: 0, High: 0, Info: 0 });
}

function buildSystemHealth(summary, alertCountBySeverity) {
  const status = alertCountBySeverity.Critical > 0 ? 'red' : alertCountBySeverity.High > 0 ? 'amber' : 'green';
  const dataStatus = summary.dataFreshness.timestamp
    ? summary.dataFreshness.source === 'Import_Log' ? 'green' : 'amber'
    : 'red';
  return {
    status,
    label: status === 'red' ? 'Critical action required' : status === 'amber' ? 'Attention needed' : 'Operational',
    updatedAt: nowIso(),
    checks: [
      { label: 'API service', status: 'green', detail: 'Dashboard endpoint responding' },
      { label: 'Data freshness', status: dataStatus, detail: summary.dataFreshness.status },
      { label: 'Import queue', status: summary.importQueueDepth > 0 ? 'amber' : 'green', detail: `${summary.importQueueDepth} queued` },
      { label: 'Approvals', status: summary.pendingRewardApprovals > 0 ? 'amber' : 'green', detail: `${summary.pendingRewardApprovals} pending` },
      { label: 'Coaching', status: summary.openCoachingRecords > 0 ? 'amber' : 'green', detail: `${summary.openCoachingRecords} open` },
    ],
  };
}

function isActiveUser(user) {
  const status = canonicalStatus(user);
  return user.Active !== false
    && user.is_active !== false
    && user.Is_Active !== false
    && !['inactive', 'disabled', 'deactivated'].includes(status);
}

function isActiveKpi(kpi) {
  const status = canonicalStatus(kpi);
  return kpi.Active !== false
    && kpi.is_active !== false
    && kpi.Is_Active !== false
    && !['retired', 'inactive', 'disabled'].includes(status);
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

function canonicalStatus(row) {
  return String(row && (row.Status || row.status || row.State || row.state) || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function latestRecordTimestamp(rows, fields) {
  let latest = null;
  for (const row of rows || []) {
    for (const field of fields) {
      const timestamp = normalizeTimestamp(row && row[field]);
      if (!timestamp) continue;
      const millis = Date.parse(timestamp);
      if (!Number.isFinite(millis)) continue;
      if (!latest || millis > latest.millis) {
        latest = { timestamp, millis, row, field };
      }
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

function toNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function recordVersionMap(entity, rows) {
  return (rows || []).reduce((acc, row) => {
    const id = getRecordId(entity, row);
    if (id) acc[id] = row && row.updated_at ? row.updated_at : null;
    return acc;
  }, {});
}

function normalizeVersion(value) {
  return value == null || value === '' ? null : String(value);
}

function workflowMetadata(context = {}, payload = {}) {
  return {
    ...(context.metadata || {}),
    actorUserId: payload.actorUserId || context.session?.user?.UserID || null,
    reason: payload.reason || 'workflow-sync',
    mutationId: payload.mutationId || null,
  };
}

function notFound(message) {
  const error = new Error(message);
  error.status = 404;
  error.code = 'NOT_FOUND';
  throw error;
}

function conflict(message) {
  const error = new Error(message);
  error.status = 409;
  error.code = 'CONFLICT';
  throw error;
}

function workflowConflict(message, details) {
  const error = new Error(message);
  error.status = 409;
  error.code = 'WORKFLOW_CONFLICT';
  error.details = details || null;
  throw error;
}

function validationError(message, code, details) {
  const error = new Error(message);
  error.status = 422;
  error.code = code || 'VALIDATION_ERROR';
  error.details = details || null;
  throw error;
}

function blocked(message, code, details) {
  const error = new Error(message);
  error.status = 409;
  error.code = code || 'CONFIG_BLOCKED';
  error.details = details || null;
  throw error;
}

function adminRequired(message) {
  const error = new Error(message);
  error.status = 403;
  error.code = 'ADMIN_REQUIRED';
  throw error;
}

module.exports = {
  SYSTEM_IMPORT_FIELDS,
  loadSeedData,
  storeNormalizeRole,
  applyRoleScope,
  applyQueryFilters,
  configRow,
  flagRow,
  validatePwaIconUpload,
  normalizeFeatureFlagPatch,
  inferColumns,
  inferColumnType,
  normalizeImportRow,
  stampMutation,
  sourceHash,
  comparableHash,
  buildDashboardSummary,
  isPendingRedemption,
  auditSearchText,
  canonicalStatus,
  isBlank,
  valueMatchesType,
  latestRecordTimestamp,
  toNonNegativeInteger,
  nowIso,
  clone,
  recordVersionMap,
  normalizeVersion,
  workflowMetadata,
  notFound,
  conflict,
  workflowConflict,
  validationError,
  blocked,
  adminRequired,
};
