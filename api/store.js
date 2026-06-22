const fs = require('fs');
const path = require('path');

const {
  ALL_ENTITIES,
  CONTROL_ENTITIES,
  CONTROL_ENTITY_COLUMNS,
  IMPORTABLE_ENTITIES,
  SOURCE_ENTITIES,
  assignIdIfMissing,
  createId,
  getPrimaryKeyFields,
  getRecordId,
  normalizeEntityName,
  recordMatchesId,
} = require('./entity-metadata');

const {
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
} = require('./store-utils');

const {
  normalizeSlaRuleForSave,
  assertValidSlaSlabs,
  commercialPublishState,
  slaPublishSnapshot,
  sanitizeSlaRuleSnapshot,
  sanitizeSlabSnapshot,
  buildBaseExposureRows,
  recomputeExposureRow,
  buildWhatIfRows,
} = require('./store-sla');

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

const WORKFLOW_ENTITIES = new Set([
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
]);

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
      configRow('app.name', 'Ripple for Clover Medicare Advantage', 'string', 'Displayed application name.'),
      configRow('app.logo', null, 'asset', 'Uploaded application logo data URL.'),
      configRow('theme.primaryColor', '#7c5cff', 'string', 'Primary theme colour used by admin and PWA surfaces.'),
      configRow('timezone', 'Asia/Calcutta', 'string', 'Operational reporting timezone.'),
      configRow('environment', 'Seed', 'string', 'Runtime environment mode.'),
      configRow('manifest.name', 'Ripple for Clover Medicare Advantage', 'string', 'PWA manifest name.'),
      configRow('manifest.short_name', 'Ripple Clover', 'string', 'PWA manifest short_name.'),
      configRow('manifest.display', 'standalone', 'string', 'PWA display mode.'),
      configRow('manifest.start_url', './index.html', 'string', 'PWA manifest start_url.'),
      configRow('manifest.theme_color', '#05060a', 'string', 'PWA manifest theme_color.'),
      configRow('manifest.background_color', '#05060a', 'string', 'PWA manifest background_color.'),
      configRow('pwa.icon.192', null, 'asset', 'Validated 192 x 192 PWA icon upload.'),
      configRow('pwa.icon.512', null, 'asset', 'Validated 512 x 512 PWA icon upload.'),
      configRow('api.baseUrl', '/api', 'string', 'REST API base URL used by the PWA.'),
      configRow('integrations.authProviderUrl', '', 'string', 'Authentication provider endpoint.'),
      configRow('integrations.wfmFeedUrl', '', 'string', 'WFM feed endpoint.'),
      configRow('integrations.crmFeedUrl', '', 'string', 'CRM feed endpoint.'),
      configRow('integrations.qaFeedUrl', '', 'string', 'QA feed endpoint.'),
      configRow('integrations.financeFeedUrl', '', 'string', 'Finance feed endpoint.'),
      configRow('imports.allowedEntities', IMPORTABLE_ENTITIES, 'json', 'Entities available in Admin Dataset Manager.'),
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
      importable: this.importableEntities().includes(entity),
      schema: this.entitySchema(entity),
      lastImport: this.latestImportForEntity(entity),
    }));
  }

  getRows(entityName, options = {}) {
    const entity = normalizeEntityName(entityName);
    const rows = clone(this.state[entity] || []);
    const scoped = applyRoleScope(entity, rows, options.session, this.state);
    const filtered = applyQueryFilters(scoped, options.query || {});
    const offset = toNonNegativeInteger(options.query && options.query.offset, 0);
    const limit = toNonNegativeInteger(options.query && options.query.limit, filtered.length);
    return filtered.slice(offset, offset + limit);
  }

  getRecord(entityName, id, options = {}) {
    const rows = this.getRows(entityName, options);
    return rows.find((row) => recordMatchesId(normalizeEntityName(entityName), row, id)) || null;
  }

  recordVersionMap(entityName, rows = null) {
    const entity = normalizeEntityName(entityName);
    return recordVersionMap(entity, rows || this.state[entity] || []);
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

  deactivateGamificationConfig(entityName, id, context = {}, patch = {}) {
    const entity = normalizeEntityName(entityName);
    if (entity === 'Missions') {
      const assignments = this.activeMissionAssignments(id);
      if (assignments.length) {
        blocked(
          `Mission ${id} has ${assignments.length} in-progress assignment(s).`,
          'MISSION_IN_PROGRESS',
          { participantCount: assignments.length, assignmentIds: assignments.map((row) => row.Assignment_ID).filter(Boolean) }
        );
      }
      return this.updateRecord('Missions', id, { ...clone(patch), Active: false, is_active: false, Status: 'Inactive' }, {
        ...context,
        metadata: {
          ...(context.metadata || {}),
          guardrail: 'no_in_progress_assignments',
          participantCount: 0,
        },
      });
    }
    if (entity === 'Challenges') {
      const participants = this.activeChallengeParticipants(id);
      if (participants.length) {
        blocked(
          `Challenge ${id} has ${participants.length} in-progress participant(s).`,
          'CHALLENGE_IN_PROGRESS',
          { participantCount: participants.length, participantIds: participants.map((row) => row.Participant_ID).filter(Boolean) }
        );
      }
      return this.updateRecord('Challenges', id, { ...clone(patch), Active: false, is_active: false, Status: 'Closed' }, {
        ...context,
        metadata: {
          ...(context.metadata || {}),
          guardrail: 'no_in_progress_participants',
          participantCount: 0,
        },
      });
    }
    return this.updateRecord(entity, id, { ...clone(patch), Active: false, is_active: false, Status: 'Retired' }, {
      ...context,
      metadata: {
        ...(context.metadata || {}),
        nonRetroactive: entity === 'Badges' ? 'earned_badges_retained' : undefined,
      },
    });
  }

  activeMissionAssignments(missionId) {
    return (this.state.Mission_Assignments || []).filter((row) => {
      return row.Mission_ID === missionId && ['active', 'behind', 'in progress', 'pending'].includes(canonicalStatus(row));
    });
  }

  activeChallengeParticipants(challengeId) {
    return (this.state.Challenge_Participants || []).filter((row) => {
      return row.Challenge_ID === challengeId && ['accepted', 'pending', 'active', 'in progress'].includes(canonicalStatus(row));
    });
  }

  settleRewardRedemption(redemptionId, decision, context = {}) {
    const redemptions = this.state.Reward_Redemptions || [];
    const redemptionIndex = redemptions.findIndex((row) => recordMatchesId('Reward_Redemptions', row, redemptionId));
    if (redemptionIndex === -1) notFound(`Record not found in Reward_Redemptions: ${redemptionId}`);
    const redemption = redemptions[redemptionIndex];
    if (!isPendingRedemption(redemption)) {
      blocked(`Redemption ${redemptionId} is not pending approval.`, 'REDEMPTION_NOT_PENDING', {
        status: redemption.Status || null,
      });
    }

    const before = {
      redemption: clone(redemption),
      reward: null,
    };

    const now = nowIso();
    if (decision === 'reject') {
      const updatedRedemption = stampMutation({
        ...redemption,
        Status: 'Rejected',
        Approved_By: context.session?.user?.UserID || null,
        Approval_Date: now,
      });
      redemptions[redemptionIndex] = updatedRedemption;
      this.auditAdminWrite('REWARD_REDEMPTION_REJECT', 'Reward_Redemptions', redemptionId, before, {
        redemption: updatedRedemption,
        reward: null,
      }, {
        ...context,
        metadata: {
          ...(context.metadata || {}),
          stockDeducted: false,
        },
      });
      this.save();
      return { redemption: clone(updatedRedemption), reward: null };
    }

    const rewards = this.state.Rewards || [];
    const rewardIndex = rewards.findIndex((row) => recordMatchesId('Rewards', row, redemption.Reward_ID));
    if (rewardIndex === -1) notFound(`Reward not found for redemption ${redemptionId}: ${redemption.Reward_ID}`);
    const reward = rewards[rewardIndex];
    const stock = Number(reward.Stock);
    if (!Number.isFinite(stock) || stock <= 0) {
      blocked(`Reward ${reward.Reward_ID} has no available stock.`, 'REWARD_OUT_OF_STOCK', {
        rewardId: reward.Reward_ID,
        stock: Number.isFinite(stock) ? stock : reward.Stock,
      });
    }

    before.reward = clone(reward);
    const updatedReward = stampMutation({ ...reward, Stock: stock - 1 });
    const updatedRedemption = stampMutation({
      ...redemption,
      Status: 'Fulfilled',
      Fulfilment_Owner: redemption.Fulfilment_Owner || context.session?.user?.UserID || null,
      Approved_By: context.session?.user?.UserID || null,
      Approval_Date: now,
    });
    rewards[rewardIndex] = updatedReward;
    redemptions[redemptionIndex] = updatedRedemption;
    this.auditAdminWrite('REWARD_REDEMPTION_APPROVE', 'Reward_Redemptions', redemptionId, before, {
      redemption: updatedRedemption,
      reward: updatedReward,
    }, {
      ...context,
      metadata: {
        ...(context.metadata || {}),
        stockDeducted: true,
        stockBefore: stock,
        stockAfter: stock - 1,
      },
    });
    this.save();
    return { redemption: clone(updatedRedemption), reward: clone(updatedReward) };
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

  applyWorkflowSnapshot(payload = {}, context = {}) {
    const incomingEntities = payload.entities || {};
    const baseVersions = payload.baseVersions || {};
    const operations = [];
    const conflicts = [];

    for (const [rawEntity, incomingRows] of Object.entries(incomingEntities)) {
      const entity = normalizeEntityName(rawEntity);
      if (!WORKFLOW_ENTITIES.has(entity)) {
        validationError(`Workflow persistence is not enabled for ${entity}.`, 'WORKFLOW_ENTITY_NOT_ALLOWED', { entity });
      }
      if (!Array.isArray(incomingRows)) {
        validationError(`Workflow payload for ${entity} must be an array.`, 'WORKFLOW_ENTITY_ROWS_INVALID', { entity });
      }

      const rows = this.state[entity] || (this.state[entity] = []);
      const expectedMap = baseVersions[entity] || {};
      for (const incoming of incomingRows) {
        const record = assignIdIfMissing(entity, clone(incoming || {}));
        const id = getRecordId(entity, record);
        if (!id) validationError(`Workflow record in ${entity} is missing its primary key.`, 'WORKFLOW_RECORD_ID_REQUIRED', { entity });

        const index = rows.findIndex((row) => recordMatchesId(entity, row, id));
        if (index === -1) {
          operations.push({ type: 'create', entity, id, record });
          continue;
        }

        const current = rows[index];
        const merged = { ...current, ...record };
        if (comparableHash(current) === comparableHash(merged)) continue;

        const expectedVersion = Object.prototype.hasOwnProperty.call(expectedMap, id) ? expectedMap[id] : undefined;
        const currentVersion = current.updated_at || null;
        if (expectedVersion !== undefined && normalizeVersion(expectedVersion) !== currentVersion) {
          conflicts.push({ entity, id, expectedVersion: normalizeVersion(expectedVersion), currentVersion });
          continue;
        }
        if (expectedVersion === undefined && currentVersion && record.updated_at !== currentVersion) {
          conflicts.push({ entity, id, expectedVersion: null, currentVersion });
          continue;
        }
        operations.push({ type: 'update', entity, id, index, before: current, record: merged });
      }
    }

    if (conflicts.length) {
      workflowConflict('Workflow data changed in another session. Refresh before saving again.', conflicts);
    }

    const touched = new Set();
    for (const operation of operations) {
      const rows = this.state[operation.entity] || (this.state[operation.entity] = []);
      if (operation.type === 'create') {
        const created = stampMutation(operation.record);
        rows.push(created);
        this.audit('WORKFLOW_CREATE', operation.entity, operation.id, null, created, context.session || context, workflowMetadata(context, payload));
      } else {
        const before = clone(operation.before);
        const updated = stampMutation(operation.record);
        rows[operation.index] = updated;
        this.audit('WORKFLOW_UPDATE', operation.entity, operation.id, before, updated, context.session || context, workflowMetadata(context, payload));
      }
      touched.add(operation.entity);
    }

    if (operations.length) this.save();

    const entities = {};
    const versions = {};
    for (const rawEntity of Object.keys(incomingEntities)) {
      const entity = normalizeEntityName(rawEntity);
      entities[entity] = this.getRows(entity, { session: context.session || context });
      versions[entity] = this.recordVersionMap(entity, entities[entity]);
    }

    return {
      mutationId: payload.mutationId || null,
      applied: operations.length,
      touched: Array.from(touched),
      entities,
      versions,
      appliedAt: nowIso(),
    };
  }

  findActiveUser(userId) {
    return (this.state.Users || []).find((user) => {
      return user.UserID === userId && user.Status !== 'Inactive' && user.Active !== false && user.is_active !== false;
    }) || null;
  }

  findBootstrapUser(preferredRole = 'Manager') {
    const active = (this.state.Users || []).filter((user) => user.Status !== 'Inactive' && user.Active !== false && user.is_active !== false);
    const preferred = storeNormalizeRole(preferredRole);
    return active.find((user) => storeNormalizeRole(user.Role) === preferred)
      || active.find((user) => storeNormalizeRole(user.Role) === 'Manager')
      || active.find((user) => storeNormalizeRole(user.Role) === 'Admin')
      || active[0]
      || null;
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
    return buildDashboardSummary(this.state, this.getConfigValue('environment') || 'Seed');
  }

  getConfigValue(key) {
    const row = (this.state.App_Config || []).find((config) => config.Config_Key === key);
    return row ? row.Config_Value : undefined;
  }

  importableEntities() {
    const configured = this.getConfigValue('imports.allowedEntities') || IMPORTABLE_ENTITIES;
    return (Array.isArray(configured) ? configured : IMPORTABLE_ENTITIES)
      .map((name) => {
        try {
          return normalizeEntityName(name);
        } catch (error) {
          return null;
        }
      })
      .filter(Boolean)
      .filter((entity) => entity !== 'Import_Log' && entity !== 'Admin_Audit_Log');
  }

  entitySchema(entityName) {
    const entity = normalizeEntityName(entityName);
    const rows = this.state[entity] || [];
    const primaryKey = getPrimaryKeyFields(entity, rows);
    const columnNames = inferColumns(entity, rows, primaryKey);
    const columns = columnNames.map((name) => {
      const values = rows.map((row) => row && row[name]).filter((value) => !isBlank(value));
      return {
        name,
        type: inferColumnType(name, values),
        required: primaryKey.includes(name),
      };
    });
    return {
      entity,
      primaryKey,
      requiredFields: primaryKey,
      columns,
    };
  }

  latestImportForEntity(entityName) {
    const entity = normalizeEntityName(entityName);
    const imports = (this.state.Import_Log || []).filter((row) => row.Entity_Name === entity);
    const latest = latestRecordTimestamp(imports, ['Commit_Timestamp', 'Upload_Date', 'updated_at', 'created_at']);
    if (!latest) return null;
    const row = latest.row;
    return {
      Import_ID: row.Import_ID,
      Status: row.Status,
      Uploaded_By: row.Uploaded_By || null,
      Upload_Date: row.Upload_Date || null,
      Commit_Timestamp: row.Commit_Timestamp || null,
      Row_Count: row.Row_Count || 0,
      Mode: row.Mode || null,
    };
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

  getConfigVersions(key = null) {
    const snapshots = [];
    const pushSnapshot = (row, source, log = null) => {
      if (!row || !row.Config_Key) return;
      if (key && row.Config_Key !== key) return;
      snapshots.push({
        ...clone(row),
        Source: source,
        Log_ID: log && log.Log_ID ? log.Log_ID : null,
        Timestamp: log && log.Timestamp ? log.Timestamp : (row.Last_Modified_Date || row.updated_at || row.created_at || null),
      });
    };

    for (const row of this.state.App_Config || []) pushSnapshot(row, 'current');
    for (const log of this.state.Admin_Audit_Log || []) {
      if (log.Entity_Affected !== 'App_Config') continue;
      pushSnapshot(log.Before_Snapshot, 'audit_before', log);
      pushSnapshot(log.After_Snapshot, 'audit_after', log);
    }

    const seen = new Set();
    return snapshots
      .filter((row) => {
        const identity = `${row.Config_Key}|${row.Version || 1}|${JSON.stringify(row.Config_Value)}`;
        if (seen.has(identity)) return false;
        seen.add(identity);
        return true;
      })
      .sort((a, b) => {
        const keyCompare = String(a.Config_Key).localeCompare(String(b.Config_Key));
        if (keyCompare) return keyCompare;
        return Number(b.Version || 0) - Number(a.Version || 0);
      });
  }

  revertConfigValue(key, version, context = {}) {
    if (!key) validationError('Config_Key is required for settings version revert.', 'CONFIG_KEY_REQUIRED');
    const targetVersion = Number(version);
    if (!Number.isFinite(targetVersion)) validationError('Version is required for settings version revert.', 'CONFIG_VERSION_REQUIRED');

    const rows = this.state.App_Config || [];
    const index = rows.findIndex((config) => config.Config_Key === key);
    if (index === -1) notFound(`Config key not found: ${key}`);
    const before = clone(rows[index]);
    const target = this.getConfigVersions(key).find((row) => Number(row.Version || 1) === targetVersion);
    if (!target) notFound(`Version ${targetVersion} was not found for ${key}`);

    const after = stampMutation({
      ...before,
      Config_Value: target.Config_Value === undefined ? null : clone(target.Config_Value),
      Value_Type: target.Value_Type || before.Value_Type,
      Description: target.Description || before.Description,
      Last_Modified_By: context.session && context.session.user.UserID,
      Last_Modified_Date: nowIso(),
      Version: Number(before.Version || 1) + 1,
      Reverted_From_Version: targetVersion,
    });
    rows[index] = after;
    this.auditAdminWrite('CONFIG_REVERT', 'App_Config', after.Config_ID, before, after, {
      ...context,
      metadata: {
        ...(context.metadata || {}),
        Config_Key: key,
        revertedFromVersion: targetVersion,
      },
    });
    this.save();
    return clone(after);
  }

  savePwaIcon(payload, context = {}) {
    const normalized = validatePwaIconUpload(payload);
    const key = `pwa.icon.${normalized.size}`;
    const value = {
      src: normalized.dataUrl,
      filename: normalized.filename,
      type: normalized.mimeType,
      sizes: `${normalized.size}x${normalized.size}`,
      width: normalized.size,
      height: normalized.size,
      uploadedAt: nowIso(),
    };
    return this.setConfigValues({ [key]: value }, context)[0];
  }

  updateFeatureFlag(id, patch, context = {}) {
    const rows = this.state.Feature_Flags || [];
    const index = rows.findIndex((row) => recordMatchesId('Feature_Flags', row, id));
    if (index === -1) notFound(`Feature flag not found: ${id}`);
    const before = clone(rows[index]);
    const normalized = normalizeFeatureFlagPatch({ ...rows[index], ...clone(patch) }, this.state);
    const timestamp = nowIso();
    const merged = stampMutation({
      ...rows[index],
      ...normalized,
      Modified_By: context.session && context.session.user.UserID,
      Modified_Date: timestamp,
    });
    rows[index] = merged;
    this.auditAdminWrite('UPDATE', 'Feature_Flags', id, before, merged, context);
    this.save();
    return clone(merged);
  }

  searchAuditLog(query = {}, session = null) {
    const rows = applyRoleScope('Admin_Audit_Log', clone(this.state.Admin_Audit_Log || []), session, this.state);
    const now = Date.now();
    const defaultFrom = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString();
    const from = query.all ? null : (query.from || query.dateFrom || defaultFrom);
    const to = query.to || query.dateTo || null;
    const search = String(query.search || query.q || '').trim().toLowerCase();
    const entity = query.entity || query.Entity_Affected || null;
    const action = query.action || query.Action_Type || null;
    const adminUser = query.adminUser || query.Admin_UserID || null;

    const filtered = rows.filter((row) => {
      const timestamp = row.Timestamp || row.created_at || '';
      if (from && timestamp && timestamp < from) return false;
      if (to && timestamp && timestamp > to) return false;
      if (entity && row.Entity_Affected !== entity) return false;
      if (action && row.Action_Type !== action) return false;
      if (adminUser && row.Admin_UserID !== adminUser) return false;
      if (search && !auditSearchText(row).includes(search)) return false;
      return true;
    }).sort((a, b) => String(b.Timestamp || '').localeCompare(String(a.Timestamp || '')));

    const offset = toNonNegativeInteger(query.offset, 0);
    const limit = toNonNegativeInteger(query.limit, 30);
    return filtered.slice(offset, offset + limit);
  }

  validateImport(payload) {
    const entity = normalizeEntityName(payload.entity);
    const mode = payload.mode || 'upsert';
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const errors = [];
    const allowed = this.importableEntities();
    if (!allowed.includes(entity)) {
      errors.push({ row: null, column: 'entity', message: `${entity} is not allowed for import.` });
    }
    if (!['replace', 'upsert'].includes(mode)) {
      errors.push({ row: null, column: 'mode', message: 'Mode must be replace or upsert.' });
    }
    if (payload.filename && !/\.xlsx$/i.test(payload.filename)) {
      errors.push({ row: null, column: 'filename', message: 'Upload file must be .xlsx.' });
    }
    if (!rows.length) {
      errors.push({ row: null, column: 'rows', message: 'At least one row is required.' });
    }
    const schema = this.entitySchema(entity);
    const keys = schema.primaryKey;
    const schemaByName = new Map(schema.columns.map((column) => [column.name, column]));
    const knownColumns = new Set(schema.columns.map((column) => column.name));
    const uploadedColumns = new Set();
    rows.forEach((row) => {
      for (const column of Object.keys(row || {})) {
        if (!SYSTEM_IMPORT_FIELDS.has(column)) uploadedColumns.add(column);
      }
    });
    for (const key of schema.requiredFields) {
      if (!uploadedColumns.has(key)) {
        errors.push({ row: null, column: key, message: `Missing mandatory column ${key}.` });
      }
    }
    for (const column of uploadedColumns) {
      if (!knownColumns.has(column)) {
        errors.push({ row: null, column, message: `${column} is not in the ${entity} schema.` });
      }
    }
    rows.forEach((row, index) => {
      for (const key of keys) {
        if (row[key] == null || row[key] === '') {
          errors.push({ row: index + 1, column: key, message: `${key} is mandatory.` });
        }
      }
      for (const [column, value] of Object.entries(row || {})) {
        if (SYSTEM_IMPORT_FIELDS.has(column) || !schemaByName.has(column) || isBlank(value)) continue;
        const expected = schemaByName.get(column).type;
        if (!valueMatchesType(value, expected)) {
          errors.push({
            row: index + 1,
            column,
            expectedType: expected,
            message: `${column} must be ${expected}.`,
          });
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
      schema,
      diff: this.diffRows(entity, rows, mode),
    };
  }

  recordImportAttempt(payload, validation, context = {}) {
    const uploadDate = nowIso();
    const record = {
      Import_ID: createId('IMP'),
      Entity_Name: validation.entity,
      Filename: payload.filename || `${validation.entity}.xlsx`,
      Uploaded_By: context.session && context.session.user.UserID,
      Upload_Date: uploadDate,
      Row_Count: validation.rowCount,
      Mode: validation.mode,
      Status: validation.valid ? 'Validated' : 'ValidationFailed',
      Validation_Error_Count: validation.errors.length,
      Commit_Timestamp: null,
      Validation_Errors: validation.errors,
      Diff: validation.diff,
      Schema: validation.schema,
      Pending_Rows: validation.valid ? clone(payload.rows || []) : null,
      created_at: uploadDate,
      updated_at: uploadDate,
    };
    this.state.Import_Log.push(record);
    this.auditAdminWrite('IMPORT_VALIDATE', 'Import_Log', record.Import_ID, null, record, context);
    this.save();
    return clone(record);
  }

  commitImport(payload, context = {}) {
    if (payload && payload.importId) {
      return this.commitValidatedImport(payload.importId, context);
    }
    const validation = this.validateImport(payload);
    const importLog = this.recordImportAttempt(payload, validation, context);
    if (!validation.valid) {
      const error = new Error('Import validation failed.');
      error.status = 422;
      error.code = 'IMPORT_VALIDATION_FAILED';
      error.details = { importLog, errors: validation.errors };
      throw error;
    }

    return this.applyImport(importLog, validation, payload.rows, context);
  }

  commitValidatedImport(importId, context = {}) {
    const index = this.state.Import_Log.findIndex((row) => row.Import_ID === importId);
    if (index === -1) notFound(`Import not found: ${importId}`);
    const importLog = this.state.Import_Log[index];
    if (canonicalStatus(importLog) !== 'validated') {
      conflict(`Import ${importId} is not ready to commit.`);
    }
    const payload = {
      entity: importLog.Entity_Name,
      mode: importLog.Mode,
      filename: importLog.Filename,
      rows: clone(importLog.Pending_Rows || []),
    };
    const validation = this.validateImport(payload);
    if (!validation.valid) {
      const beforeLog = clone(importLog);
      this.state.Import_Log[index] = stampMutation({
        ...importLog,
        Status: 'ValidationFailed',
        Validation_Error_Count: validation.errors.length,
        Validation_Errors: validation.errors,
        Diff: validation.diff,
        Schema: validation.schema,
      });
      this.auditAdminWrite('IMPORT_VALIDATE', 'Import_Log', importLog.Import_ID, beforeLog, this.state.Import_Log[index], context);
      this.save();
      const error = new Error('Import validation failed.');
      error.status = 422;
      error.code = 'IMPORT_VALIDATION_FAILED';
      error.details = { importLog: clone(this.state.Import_Log[index]), errors: validation.errors };
      throw error;
    }
    return this.applyImport(importLog, validation, payload.rows, context);
  }

  applyImport(importLog, validation, sourceRows, context = {}) {
    const normalizedRows = (sourceRows || []).map((row) => normalizeImportRow(row, validation.schema));
    const rows = normalizedRows.map((row, index) => stampMutation({
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
      Row_Count: validation.rowCount,
      Validation_Error_Count: 0,
      Validation_Errors: [],
      Diff: validation.diff,
      Schema: validation.schema,
      Previous_Rows: before,
      Committed_Rows: clone(this.state[validation.entity] || []),
      Pending_Rows: null,
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
    const entity = normalizeEntityName(this.state.Import_Log[index].Entity_Name);
    const previousRows = this.state.Import_Log[index].Previous_Rows;
    if (!Array.isArray(previousRows)) {
      conflict(`Import ${importId} does not have a restorable previous version.`);
    }
    const before = clone(this.state.Import_Log[index]);
    const beforeRows = clone(this.state[entity] || []);
    this.state[entity] = clone(previousRows);
    this.state.Import_Log[index] = stampMutation({
      ...this.state.Import_Log[index],
      Status: 'Reverted',
      Reverted_By: context.session && context.session.user.UserID,
      Reverted_At: nowIso(),
      Revert_Diff: this.diffRows(entity, previousRows, 'replace'),
    });
    const revertRecord = stampMutation({
      Import_ID: createId('IMP'),
      Entity_Name: entity,
      Filename: `revert-${importId}.xlsx`,
      Uploaded_By: context.session && context.session.user.UserID,
      Upload_Date: nowIso(),
      Row_Count: previousRows.length,
      Mode: 'revert',
      Status: 'Committed',
      Validation_Error_Count: 0,
      Commit_Timestamp: nowIso(),
      Reverted_From_Import_ID: importId,
      Previous_Rows: beforeRows,
      Committed_Rows: clone(previousRows),
      Diff: this.diffRows(entity, previousRows, 'replace'),
    });
    this.state.Import_Log.push(revertRecord);
    this.auditAdminWrite('IMPORT_REVERT', 'Import_Log', importId, before, this.state.Import_Log[index], context);
    this.auditAdminWrite('IMPORT_COMMIT', entity, revertRecord.Import_ID, beforeRows, this.state[entity], context);
    this.save();
    return { reverted: clone(this.state.Import_Log[index]), importLog: clone(revertRecord) };
  }

  diffRows(entity, rows, mode) {
    const current = this.state[entity] || [];
    const currentById = new Map(current.map((row) => [getRecordId(entity, row), row]));
    const currentIds = new Set(currentById.keys());
    const incomingIds = new Set(rows.map((row) => getRecordId(entity, row)));
    let added = 0;
    let modified = 0;
    for (const row of rows) {
      const id = getRecordId(entity, row);
      if (!currentIds.has(id)) {
        added += 1;
      } else if (comparableHash(currentById.get(id)) !== comparableHash(row)) {
        modified += 1;
      }
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
    if (index >= 0) rows[index] = stampMutation({ ...rows[index], ...row });
    else rows.push(row);
  }

  createSlaRule(payload, context = {}) {
    const record = normalizeSlaRuleForSave(this.state, payload, null);
    return this.createRecord('SLA_Commercial_Rules', record, context);
  }

  updateSlaRule(ruleId, payload, context = {}) {
    const existing = (this.state.SLA_Commercial_Rules || []).find((row) => row.Rule_ID === ruleId);
    if (!existing) notFound(`SLA rule not found: ${ruleId}`);
    const patch = normalizeSlaRuleForSave(this.state, payload, existing);
    return this.updateRecord('SLA_Commercial_Rules', ruleId, patch, context);
  }

  createSlaSlab(ruleId, payload, context = {}) {
    this.requireSlaRule(ruleId);
    const record = stampMutation(assignIdIfMissing('Penalty_Reward_Slabs', {
      ...clone(payload || {}),
      Rule_ID: ruleId,
    }));
    const id = getRecordId('Penalty_Reward_Slabs', record);
    if (!id || (this.state.Penalty_Reward_Slabs || []).some((row) => recordMatchesId('Penalty_Reward_Slabs', row, id))) {
      conflict(`Record already exists in Penalty_Reward_Slabs: ${id}`);
    }
    const candidateRows = [...(this.state.Penalty_Reward_Slabs || []), record];
    assertValidSlaSlabs(ruleId, candidateRows);
    this.state.Penalty_Reward_Slabs.push(record);
    this.markSlaRulePendingPublish(ruleId);
    this.auditAdminWrite('CREATE', 'Penalty_Reward_Slabs', id, null, record, context);
    this.save();
    return clone(record);
  }

  updateSlaSlab(ruleId, slabId, payload, context = {}) {
    this.requireSlaRule(ruleId);
    const rows = this.state.Penalty_Reward_Slabs || [];
    const index = rows.findIndex((row) => recordMatchesId('Penalty_Reward_Slabs', row, slabId) && row.Rule_ID === ruleId);
    if (index === -1) notFound(`SLA slab not found: ${slabId}`);
    const before = clone(rows[index]);
    const merged = stampMutation({
      ...rows[index],
      ...clone(payload || {}),
      Slab_ID: before.Slab_ID,
      Rule_ID: ruleId,
    });
    const candidateRows = rows.map((row, rowIndex) => (rowIndex === index ? merged : row));
    assertValidSlaSlabs(ruleId, candidateRows);
    rows[index] = merged;
    this.markSlaRulePendingPublish(ruleId);
    this.auditAdminWrite('UPDATE', 'Penalty_Reward_Slabs', slabId, before, merged, context);
    this.save();
    return clone(merged);
  }

  deleteSlaSlab(ruleId, slabId, context = {}) {
    this.requireSlaRule(ruleId);
    const row = (this.state.Penalty_Reward_Slabs || []).find((slab) => recordMatchesId('Penalty_Reward_Slabs', slab, slabId) && slab.Rule_ID === ruleId);
    if (!row) notFound(`SLA slab not found: ${slabId}`);
    const removed = this.deleteRecord('Penalty_Reward_Slabs', slabId, context);
    this.markSlaRulePendingPublish(ruleId);
    this.save();
    return removed;
  }

  requireSlaRule(ruleId) {
    const rule = (this.state.SLA_Commercial_Rules || []).find((row) => row.Rule_ID === ruleId);
    if (!rule) notFound(`SLA rule not found: ${ruleId}`);
    return rule;
  }

  markSlaRulePendingPublish(ruleId) {
    const rule = (this.state.SLA_Commercial_Rules || []).find((row) => row.Rule_ID === ruleId);
    if (!rule) return;
    Object.assign(rule, stampMutation({
      ...rule,
      Status: 'Draft',
      Recompute_Status: 'Pending Publish',
    }));
  }

  validateSlabBands(ruleId) {
    return validateSlabBandsForRows(ruleId, this.state.Penalty_Reward_Slabs || []);
  }

  publishSlaRule(ruleId, context = {}) {
    const ruleIndex = (this.state.SLA_Commercial_Rules || []).findIndex((row) => row.Rule_ID === ruleId);
    if (ruleIndex === -1) notFound(`SLA rule not found: ${ruleId}`);
    assertValidSlaSlabs(ruleId, this.state.Penalty_Reward_Slabs || []);

    const rule = this.state.SLA_Commercial_Rules[ruleIndex];
    const publishedAt = nowIso();
    const publishedBy = context.session && context.session.user.UserID;
    const before = commercialPublishState(this.state, ruleId);
    const currentPublished = rule.Published_Config_Snapshot || null;
    const recomputation = this.recomputeSlaCommercial(ruleId, publishedAt);
    const updatedRule = stampMutation({
      ...rule,
      Status: 'Published',
      Published_By: publishedBy,
      Published_At: publishedAt,
      Last_Published_At: publishedAt,
      Recompute_Status: 'Complete',
      Recompute_Completed_At: publishedAt,
      Previous_Published_Config: currentPublished,
    });
    updatedRule.Published_Config_Snapshot = slaPublishSnapshot(updatedRule, this.currentSlaSlabs(ruleId), publishedAt, publishedBy);
    this.state.SLA_Commercial_Rules[ruleIndex] = updatedRule;

    const after = commercialPublishState(this.state, ruleId);
    after.recomputation = recomputation;
    this.auditAdminWrite('SLA_PUBLISH', 'SLA_Commercial_Rules', ruleId, before, after, {
      ...context,
      metadata: {
        ...(context.metadata || {}),
        publishAction: 'publish',
        recompute: ['Commercial_Exposure', 'What_If_Scenarios'],
        recomputation,
      },
    });
    this.save();
    return {
      rule: clone(updatedRule),
      slabs: this.currentSlaSlabs(ruleId),
      recomputation,
    };
  }

  revertSlaRule(ruleId, context = {}) {
    const ruleIndex = (this.state.SLA_Commercial_Rules || []).findIndex((row) => row.Rule_ID === ruleId);
    if (ruleIndex === -1) notFound(`SLA rule not found: ${ruleId}`);
    const rule = this.state.SLA_Commercial_Rules[ruleIndex];
    const snapshot = rule.Previous_Published_Config;
    if (!snapshot || !snapshot.rule || !Array.isArray(snapshot.slabs)) {
      blocked(`SLA rule ${ruleId} does not have a previous published version.`, 'SLA_REVERT_UNAVAILABLE');
    }

    const revertedAt = nowIso();
    const revertedBy = context.session && context.session.user.UserID;
    const before = commercialPublishState(this.state, ruleId);
    const currentPublished = rule.Published_Config_Snapshot || slaPublishSnapshot(rule, this.currentSlaSlabs(ruleId), rule.Published_At || revertedAt, rule.Published_By || null);
    const restoredRule = stampMutation({
      ...sanitizeSlaRuleSnapshot(snapshot.rule),
      Rule_ID: ruleId,
      Status: 'Published',
      Published_By: revertedBy,
      Published_At: revertedAt,
      Last_Published_At: revertedAt,
      Reverted_By: revertedBy,
      Reverted_At: revertedAt,
      Recompute_Status: 'Complete',
      Recompute_Completed_At: revertedAt,
      Previous_Published_Config: currentPublished,
    });
    restoredRule.Published_Config_Snapshot = slaPublishSnapshot(restoredRule, snapshot.slabs, revertedAt, revertedBy);
    this.state.SLA_Commercial_Rules[ruleIndex] = restoredRule;
    this.state.Penalty_Reward_Slabs = (this.state.Penalty_Reward_Slabs || [])
      .filter((slab) => slab.Rule_ID !== ruleId)
      .concat(snapshot.slabs.map((slab) => stampMutation({ ...sanitizeSlabSnapshot(slab), Rule_ID: ruleId })));
    const recomputation = this.recomputeSlaCommercial(ruleId, revertedAt);

    const after = commercialPublishState(this.state, ruleId);
    after.recomputation = recomputation;
    this.auditAdminWrite('SLA_PUBLISH_REVERT', 'SLA_Commercial_Rules', ruleId, before, after, {
      ...context,
      metadata: {
        ...(context.metadata || {}),
        publishAction: 'revert_previous',
        recompute: ['Commercial_Exposure', 'What_If_Scenarios'],
        recomputation,
      },
    });
    this.save();
    return {
      rule: clone(restoredRule),
      slabs: this.currentSlaSlabs(ruleId),
      recomputation,
      revertedFrom: currentPublished,
    };
  }

  currentSlaSlabs(ruleId) {
    return clone((this.state.Penalty_Reward_Slabs || [])
      .filter((slab) => slab.Rule_ID === ruleId)
      .sort((a, b) => Number(a.Variance_From) - Number(b.Variance_From)));
  }

  recomputeSlaCommercial(ruleId, timestamp = nowIso()) {
    const rule = this.requireSlaRule(ruleId);
    const slabs = this.currentSlaSlabs(ruleId);
    const kpiId = rule.KPI_ID;
    const beforeExposure = clone(this.state.Commercial_Exposure || []).filter((row) => row.KPI_ID === kpiId);
    const beforeWhatIf = clone(this.state.What_If_Scenarios || []).filter((row) => row.Rule_ID === ruleId || (!row.Rule_ID && row.KPI_ID === kpiId));
    const baseRows = beforeExposure.length ? beforeExposure : buildBaseExposureRows(this.state, rule, timestamp);
    const afterExposure = baseRows.map((row) => stampMutation(recomputeExposureRow(rule, slabs, row, timestamp)));
    const afterWhatIf = buildWhatIfRows(rule, slabs, afterExposure, timestamp).map(stampMutation);

    this.state.Commercial_Exposure = (this.state.Commercial_Exposure || [])
      .filter((row) => row.KPI_ID !== kpiId)
      .concat(afterExposure);
    this.state.What_If_Scenarios = (this.state.What_If_Scenarios || [])
      .filter((row) => !(row.Rule_ID === ruleId || (!row.Rule_ID && row.KPI_ID === kpiId)))
      .concat(afterWhatIf);

    return {
      status: 'complete',
      completedAt: timestamp,
      Commercial_Exposure: {
        before: beforeExposure.length,
        after: afterExposure.length,
      },
      What_If_Scenarios: {
        before: beforeWhatIf.length,
        after: afterWhatIf.length,
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

module.exports = {
  ADMIN_USER,
  ArenaStore,
};
