const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const {
  ALL_ENTITIES,
  CONTROL_ENTITIES,
  SOURCE_ENTITIES,
  assignIdIfMissing,
  createId,
  getPrimaryKeyFields,
  getRecordId,
  normalizeEntityName,
  recordMatchesId,
} = require('./entity-metadata');

const ADMIN_USER = {
  UserID: 'ADMIN001',
  Name: 'Platform Admin',
  Role: 'Admin',
  TeamID: null,
  ProcessID: null,
  Location: 'Control Centre',
  ManagerID: null,
  Avatar: 'avatar_admin',
  Level: 'Admin',
  XP: 0,
  ArenaPoints: 0,
  Status: 'Active',
};

class ArenaStore {
  constructor(options = {}) {
    this.seedFile = options.seedFile || path.resolve(__dirname, '..', 'data.js');
    this.storeFile = options.storeFile || path.resolve(__dirname, '.local-store.json');
    this.persistEnabled = Boolean(options.persist);
    this.state = this.loadInitialState();
  }

  loadInitialState() {
    if (this.persistEnabled && fs.existsSync(this.storeFile)) {
      return JSON.parse(fs.readFileSync(this.storeFile, 'utf8'));
    }
    const seed = loadSeedData(this.seedFile);
    const state = {};
    for (const entity of SOURCE_ENTITIES) state[entity] = clone(seed[entity] || []);
    for (const entity of CONTROL_ENTITIES) state[entity] = [];

    if (!state.Users.some((user) => user.Role === 'Admin')) {
      state.Users.push(clone(ADMIN_USER));
    }

    state.App_Config = [
      configRow('app.name', 'Performance Arena', 'string', 'Displayed application name.'),
      configRow('environment', 'Seed', 'string', 'Runtime environment mode.'),
      configRow('api.baseUrl', '/api', 'string', 'REST API base URL used by the PWA.'),
      configRow('imports.allowedEntities', SOURCE_ENTITIES, 'json', 'Entities available in Admin Dataset Manager.'),
      configRow('timezone', 'Asia/Calcutta', 'string', 'Operational reporting timezone.'),
    ];
    state.Feature_Flags = [
      flagRow('challenges', 'Challenges', true, 'All'),
      flagRow('what_if_planner', 'What-If Planner', true, 'Role', 'Manager'),
      flagRow('commercial_screens', 'Commercial Screens', true, 'Role', 'Manager'),
      flagRow('legacy_kpi_console', 'Legacy KPI Console', true, 'All'),
    ];
    return state;
  }

  save() {
    if (!this.persistEnabled) return;
    fs.mkdirSync(path.dirname(this.storeFile), { recursive: true });
    fs.writeFileSync(this.storeFile, JSON.stringify(this.state, null, 2));
  }

  listEntities(session) {
    return ALL_ENTITIES.map((entity) => ({
      entity,
      primaryKey: getPrimaryKeyFields(entity, this.state[entity] || []),
      rowCount: this.getRows(entity, { session }).length,
      controlEntity: CONTROL_ENTITIES.includes(entity),
    }));
  }

  getRows(entityName, options = {}) {
    const entity = normalizeEntityName(entityName);
    const rows = clone(this.state[entity] || []);
    const scoped = applyRoleScope(entity, rows, options.session);
    const filtered = applyQueryFilters(scoped, options.query || {});
    const offset = toNonNegativeInteger(options.query && options.query.offset, 0);
    const limit = toNonNegativeInteger(options.query && options.query.limit, filtered.length);
    return filtered.slice(offset, offset + limit);
  }

  getRecord(entityName, id, options = {}) {
    const rows = this.getRows(entityName, options);
    return rows.find((row) => recordMatchesId(normalizeEntityName(entityName), row, id)) || null;
  }

  createRecord(entityName, payload, context = {}) {
    const entity = normalizeEntityName(entityName);
    const record = stampMutation(assignIdIfMissing(entity, clone(payload)));
    const id = getRecordId(entity, record);
    if (!id || this.state[entity].some((row) => recordMatchesId(entity, row, id))) {
      conflict(`Record already exists in ${entity}: ${id}`);
    }
    this.state[entity].push(record);
    this.auditAdminWrite('CREATE', entity, id, null, record, context);
    this.save();
    return clone(record);
  }

  updateRecord(entityName, id, patch, context = {}) {
    const entity = normalizeEntityName(entityName);
    const rows = this.state[entity] || [];
    const index = rows.findIndex((row) => recordMatchesId(entity, row, id));
    if (index === -1) notFound(`Record not found in ${entity}: ${id}`);
    const before = clone(rows[index]);
    const merged = stampMutation({ ...rows[index], ...clone(patch) });
    rows[index] = merged;
    this.auditAdminWrite('UPDATE', entity, id, before, merged, context);
    this.save();
    return clone(merged);
  }

  deleteRecord(entityName, id, context = {}) {
    const entity = normalizeEntityName(entityName);
    const rows = this.state[entity] || [];
    const index = rows.findIndex((row) => recordMatchesId(entity, row, id));
    if (index === -1) notFound(`Record not found in ${entity}: ${id}`);
    const [removed] = rows.splice(index, 1);
    this.auditAdminWrite('DELETE', entity, id, removed, null, context);
    this.save();
    return clone(removed);
  }

  findActiveUser(userId) {
    return (this.state.Users || []).find((user) => {
      return user.UserID === userId && user.Status !== 'Inactive' && user.Active !== false && user.is_active !== false;
    }) || null;
  }

  roleScopeFor(user) {
    if (!user) return null;
    const role = user.Role;
    const scope = {
      userId: user.UserID,
      role,
      teamId: user.TeamID || null,
      processId: user.ProcessID || null,
      managerId: role === 'Manager' ? user.UserID : user.ManagerID || null,
      canAdmin: role === 'Admin',
      entityAccess: {
        read: role === 'Admin' ? 'all' : 'role-scoped',
        write: role === 'Admin' ? 'all-admin-modules' : 'none',
      },
    };
    if (role === 'Manager') {
      scope.teamIds = this.state.Teams.filter((team) => team.ManagerID === user.UserID).map((team) => team.TeamID);
    } else if (role === 'Team Lead') {
      scope.teamIds = user.TeamID ? [user.TeamID] : [];
    } else if (role === 'Agent') {
      scope.teamIds = user.TeamID ? [user.TeamID] : [];
    } else {
      scope.teamIds = this.state.Teams.map((team) => team.TeamID);
    }
    return scope;
  }

  dashboard() {
    const users = this.state.Users || [];
    const kpis = this.state.KPI_Master || [];
    const imports = this.state.Import_Log || [];
    const redemptions = this.state.Reward_Redemptions || [];
    const coaching = this.state.Coaching || [];
    return {
      activeUserCount: users.filter((user) => user.Status !== 'Inactive' && user.Active !== false).length,
      activeUserCountByRole: groupCount(users.filter((user) => user.Status !== 'Inactive'), 'Role'),
      dataLoadTimestamp: latestTimestamp(imports, 'Commit_Timestamp') || latestTimestamp(imports, 'Upload_Date') || null,
      kpiCatalogue: {
        total: kpis.length,
        active: kpis.filter((kpi) => kpi.Active !== false && kpi.Status !== 'Retired' && kpi.is_active !== false).length,
      },
      importQueueDepth: imports.filter((entry) => ['Queued', 'Validated', 'Pending'].includes(entry.Status)).length,
      pendingRewardApprovals: redemptions.filter((row) => row.Status === 'Pending').length,
      openCoachingRecords: coaching.filter((row) => row.Status !== 'Closed').length,
      alertCountBySeverity: { Critical: 0, High: 0, Info: 0 },
      environment: this.getConfigValue('environment') || 'Seed',
      health: 'green',
    };
  }

  getConfigValue(key) {
    const row = (this.state.App_Config || []).find((config) => config.Config_Key === key);
    return row ? row.Config_Value : undefined;
  }

  setConfigValues(values, context = {}) {
    const changed = [];
    for (const [key, value] of Object.entries(values || {})) {
      const rows = this.state.App_Config;
      const index = rows.findIndex((config) => config.Config_Key === key);
      const before = index >= 0 ? clone(rows[index]) : null;
      const after = stampMutation({
        ...(before || configRow(key, null, Array.isArray(value) || typeof value === 'object' ? 'json' : typeof value, 'Runtime setting.')),
        Config_Value: value,
        Last_Modified_By: context.session && context.session.user.UserID,
        Last_Modified_Date: nowIso(),
        Version: before ? Number(before.Version || 1) + 1 : 1,
      });
      if (index >= 0) rows[index] = after;
      else rows.push(after);
      this.auditAdminWrite('CONFIG_UPDATE', 'App_Config', after.Config_ID, before, after, context);
      changed.push(clone(after));
    }
    this.save();
    return changed;
  }

  validateImport(payload) {
    const entity = normalizeEntityName(payload.entity);
    const mode = payload.mode || 'upsert';
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const errors = [];
    const allowed = this.getConfigValue('imports.allowedEntities') || SOURCE_ENTITIES;
    if (!allowed.includes(entity)) {
      errors.push({ row: null, column: 'entity', message: `${entity} is not allowed for import.` });
    }
    if (!['replace', 'upsert'].includes(mode)) {
      errors.push({ row: null, column: 'mode', message: 'Mode must be replace or upsert.' });
    }
    if (!rows.length) {
      errors.push({ row: null, column: 'rows', message: 'At least one row is required.' });
    }
    const keys = getPrimaryKeyFields(entity, this.state[entity] || rows);
    rows.forEach((row, index) => {
      for (const key of keys) {
        if (row[key] == null || row[key] === '') {
          errors.push({ row: index + 1, column: key, message: `${key} is mandatory.` });
        }
      }
    });
    const seen = new Set();
    rows.forEach((row, index) => {
      const id = getRecordId(entity, row);
      if (!id) return;
      if (seen.has(id)) {
        errors.push({ row: index + 1, column: keys.join('|'), message: `Duplicate primary key ${id}.` });
      }
      seen.add(id);
    });
    return {
      entity,
      mode,
      rowCount: rows.length,
      valid: errors.length === 0,
      errors,
      diff: this.diffRows(entity, rows, mode),
    };
  }

  recordImportAttempt(payload, validation, context = {}) {
    const uploadDate = nowIso();
    const record = {
      Import_ID: createId('IMP'),
      Entity_Name: validation.entity,
      Filename: payload.filename || `${validation.entity}.json`,
      Uploaded_By: context.session && context.session.user.UserID,
      Upload_Date: uploadDate,
      Row_Count: validation.rowCount,
      Mode: validation.mode,
      Status: validation.valid ? 'Validated' : 'ValidationFailed',
      Validation_Error_Count: validation.errors.length,
      Commit_Timestamp: null,
      Validation_Errors: validation.errors,
      Diff: validation.diff,
      created_at: uploadDate,
      updated_at: uploadDate,
    };
    this.state.Import_Log.push(record);
    this.auditAdminWrite('IMPORT_VALIDATE', 'Import_Log', record.Import_ID, null, record, context);
    this.save();
    return clone(record);
  }

  commitImport(payload, context = {}) {
    const validation = this.validateImport(payload);
    const importLog = this.recordImportAttempt(payload, validation, context);
    if (!validation.valid) {
      const error = new Error('Import validation failed.');
      error.status = 422;
      error.code = 'IMPORT_VALIDATION_FAILED';
      error.details = { importLog, errors: validation.errors };
      throw error;
    }

    const rows = payload.rows.map((row, index) => stampMutation({
      ...clone(row),
      Import_ID: importLog.Import_ID,
      Source_Row_Number: index + 1,
      Source_Hash: sourceHash(row),
    }));
    const before = clone(this.state[validation.entity] || []);
    if (validation.mode === 'replace') {
      this.state[validation.entity] = rows;
    } else {
      for (const row of rows) this.upsertRaw(validation.entity, row);
    }
    const committed = {
      ...importLog,
      Status: 'Committed',
      Commit_Timestamp: nowIso(),
      updated_at: nowIso(),
    };
    const logIndex = this.state.Import_Log.findIndex((row) => row.Import_ID === importLog.Import_ID);
    this.state.Import_Log[logIndex] = committed;
    this.auditAdminWrite('IMPORT_COMMIT', validation.entity, importLog.Import_ID, before, this.state[validation.entity], context);
    this.save();
    return { importLog: clone(committed), validation };
  }

  revertImport(importId, context = {}) {
    const index = this.state.Import_Log.findIndex((row) => row.Import_ID === importId);
    if (index === -1) notFound(`Import not found: ${importId}`);
    const before = clone(this.state.Import_Log[index]);
    this.state.Import_Log[index] = stampMutation({
      ...this.state.Import_Log[index],
      Status: 'Reverted',
      Reverted_By: context.session && context.session.user.UserID,
      Reverted_At: nowIso(),
    });
    this.auditAdminWrite('IMPORT_REVERT', 'Import_Log', importId, before, this.state.Import_Log[index], context);
    this.save();
    return clone(this.state.Import_Log[index]);
  }

  diffRows(entity, rows, mode) {
    const current = this.state[entity] || [];
    const currentIds = new Set(current.map((row) => getRecordId(entity, row)));
    const incomingIds = new Set(rows.map((row) => getRecordId(entity, row)));
    let added = 0;
    let modified = 0;
    for (const row of rows) {
      if (currentIds.has(getRecordId(entity, row))) modified += 1;
      else added += 1;
    }
    return {
      added,
      modified,
      deleted: mode === 'replace' ? current.filter((row) => !incomingIds.has(getRecordId(entity, row))).length : 0,
    };
  }

  upsertRaw(entity, row) {
    const rows = this.state[entity] || (this.state[entity] = []);
    const id = getRecordId(entity, row);
    const index = rows.findIndex((existing) => getRecordId(entity, existing) === id);
    if (index >= 0) rows[index] = row;
    else rows.push(row);
  }

  validateSlabBands(ruleId) {
    const slabs = (this.state.Penalty_Reward_Slabs || [])
      .filter((slab) => slab.Rule_ID === ruleId)
      .map((slab) => ({
        slabId: slab.Slab_ID,
        from: Number(slab.Variance_From),
        to: Number(slab.Variance_To),
      }))
      .sort((a, b) => a.from - b.from);
    const errors = [];
    for (let i = 0; i < slabs.length; i += 1) {
      const slab = slabs[i];
      if (!Number.isFinite(slab.from) || !Number.isFinite(slab.to) || slab.from > slab.to) {
        errors.push({ slabId: slab.slabId, message: 'Slab variance range is invalid.' });
      }
      const previous = slabs[i - 1];
      if (previous && slab.from <= previous.to) {
        errors.push({ slabId: slab.slabId, message: `Slab overlaps ${previous.slabId}.` });
      }
    }
    return errors;
  }

  publishSlaRule(ruleId, context = {}) {
    const rule = this.state.SLA_Commercial_Rules.find((row) => row.Rule_ID === ruleId);
    if (!rule) notFound(`SLA rule not found: ${ruleId}`);
    const errors = this.validateSlabBands(ruleId);
    if (errors.length) {
      const error = new Error('SLA slab validation failed.');
      error.status = 422;
      error.code = 'SLA_SLAB_OVERLAP';
      error.details = errors;
      throw error;
    }
    const updated = this.updateRecord('SLA_Commercial_Rules', ruleId, {
      Status: 'Published',
      Published_By: context.session && context.session.user.UserID,
      Published_At: nowIso(),
      Recompute_Status: 'Queued',
    }, context);
    this.auditAdminWrite('SLA_PUBLISH', 'SLA_Commercial_Rules', ruleId, rule, updated, {
      ...context,
      metadata: {
        ...(context.metadata || {}),
        recompute: ['Commercial_Exposure', 'What_If_Scenarios'],
      },
    });
    return {
      rule: updated,
      recomputation: {
        Commercial_Exposure: 'queued',
        What_If_Scenarios: 'queued',
      },
    };
  }

  auditAdminWrite(actionType, entity, recordId, before, after, context = {}) {
    const session = context.session || context;
    const metadata = context.metadata || {};
    if (!session || !session.user || session.user.Role !== 'Admin') {
      adminRequired('Admin role is required for audited writes.');
    }
    return this.audit(actionType, entity, recordId, before, after, session, metadata);
  }

  audit(actionType, entity, recordId, before, after, session, metadata = {}) {
    const userId = session && session.user ? session.user.UserID : 'SYSTEM';
    const timestamp = nowIso();
    const record = {
      Log_ID: createId('AUD'),
      Admin_UserID: userId,
      Action_Type: actionType,
      Entity_Affected: entity,
      Record_ID: recordId || null,
      Before_Snapshot: before == null ? null : clone(before),
      After_Snapshot: after == null ? null : clone(after),
      Timestamp: timestamp,
      IP_Address: metadata.ipAddress || null,
      Metadata: metadata,
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.state.Admin_Audit_Log.push(record);
    return record;
  }
}

function loadSeedData(seedFile) {
  const context = { window: {} };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(seedFile, 'utf8'), context, { filename: seedFile });
  return context.window.SEED_DATA || {};
}

function applyRoleScope(entity, rows, session) {
  if (!session || !session.user || session.user.Role === 'Admin') return rows;
  const user = session.user;
  if (entity === 'Users') {
    if (user.Role === 'Agent') return rows.filter((row) => row.UserID === user.UserID);
    if (user.Role === 'Team Lead') {
      return rows.filter((row) => row.UserID === user.UserID || row.TeamID === user.TeamID);
    }
    if (user.Role === 'Manager') {
      return rows.filter((row) => row.UserID === user.UserID || row.ManagerID === user.UserID || row.Role === 'Team Lead');
    }
  }
  if (entity === 'Teams') {
    if (user.Role === 'Agent' || user.Role === 'Team Lead') return rows.filter((row) => row.TeamID === user.TeamID);
    if (user.Role === 'Manager') return rows.filter((row) => row.ManagerID === user.UserID);
  }
  if (entity === 'Admin_Audit_Log' || entity === 'Import_Log' || entity === 'App_Config' || entity === 'Feature_Flags') {
    return [];
  }
  if (user.Role === 'Agent') {
    return rows.filter((row) => row.UserID === user.UserID || row.Owner_ID === user.UserID || row.TeamID === user.TeamID || row.Audience_ID === user.TeamID);
  }
  if (user.Role === 'Team Lead') {
    return rows.filter((row) => {
      return row.UserID === user.UserID || row.Owner_ID === user.UserID || row.TeamID === user.TeamID || row.Audience_ID === user.TeamID;
    });
  }
  if (user.Role === 'Manager') {
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

function groupCount(rows, field) {
  return rows.reduce((acc, row) => {
    const key = row[field] || 'Unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function latestTimestamp(rows, field) {
  return rows.map((row) => row[field]).filter(Boolean).sort().at(-1);
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

function adminRequired(message) {
  const error = new Error(message);
  error.status = 403;
  error.code = 'ADMIN_REQUIRED';
  throw error;
}

module.exports = {
  ADMIN_USER,
  ArenaStore,
};
