const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

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

const SYSTEM_IMPORT_FIELDS = new Set(['Import_ID', 'Source_Row_Number', 'Source_Hash', 'created_at', 'updated_at']);

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

function normalizeSlaRuleForSave(state, payload, existing) {
  const incoming = clone(payload || {});
  if (existing && incoming.Rule_ID != null && String(incoming.Rule_ID) !== String(existing.Rule_ID)) {
    conflict('Rule_ID is system-generated and immutable after creation.');
  }
  const next = { ...(existing || {}), ...incoming };
  if (!next.KPI_ID) validationError('SLA rules must be linked to KPI_Master via KPI_ID.', 'SLA_KPI_REQUIRED');
  const kpi = (state.KPI_Master || []).find((row) => row.KPI_ID === next.KPI_ID);
  if (!kpi) notFound(`KPI not found for SLA rule: ${next.KPI_ID}`);
  const target = toFiniteNumber(next.Target, toFiniteNumber(kpi.Target, null));
  if (!Number.isFinite(target)) validationError('SLA rule Target must be numeric.', 'SLA_TARGET_REQUIRED');
  const status = incoming.Status || (existing ? 'Draft' : 'Draft');
  return {
    ...next,
    Rule_ID: existing ? existing.Rule_ID : next.Rule_ID,
    Account_ID: next.Account_ID || 'HCA001',
    KPI_ID: kpi.KPI_ID,
    KPI_Name: next.KPI_Name || kpi.KPI_Name || kpi.KPI_ID,
    Target: target,
    Measurement_Period: next.Measurement_Period || 'Monthly',
    Direction: String(next.Direction || kpi.Direction || 'Higher').toLowerCase() === 'lower' ? 'Lower' : 'Higher',
    Currency: next.Currency || 'USD',
    Max_Penalty: toFiniteNumber(next.Max_Penalty, null),
    Max_Reward: toFiniteNumber(next.Max_Reward, null),
    Status: status,
    Recompute_Status: existing ? 'Pending Publish' : (next.Recompute_Status || 'Pending Publish'),
  };
}

function assertValidSlaSlabs(ruleId, rows) {
  const errors = validateSlabBandsForRows(ruleId, rows);
  if (errors.length) {
    const error = new Error('SLA slab validation failed.');
    error.status = 422;
    error.code = 'SLA_SLAB_OVERLAP';
    error.details = errors;
    throw error;
  }
}

function validateSlabBandsForRows(ruleId, rows) {
  const slabs = (rows || [])
    .filter((slab) => slab.Rule_ID === ruleId)
    .map((slab) => ({
      slabId: slab.Slab_ID,
      from: Number(slab.Variance_From),
      to: Number(slab.Variance_To),
    }))
    .sort((a, b) => a.from - b.from || String(a.slabId || '').localeCompare(String(b.slabId || '')));
  const errors = [];
  for (let i = 0; i < slabs.length; i += 1) {
    const slab = slabs[i];
    if (!Number.isFinite(slab.from) || !Number.isFinite(slab.to) || slab.from > slab.to) {
      errors.push({ slabId: slab.slabId, message: 'Slab variance range is invalid.' });
    }
    const previous = slabs[i - 1];
    if (previous && Number.isFinite(slab.from) && Number.isFinite(previous.to) && slab.from <= previous.to) {
      errors.push({ slabId: slab.slabId, message: `Slab overlaps ${previous.slabId}.` });
    }
  }
  return errors;
}

function commercialPublishState(state, ruleId) {
  const rule = (state.SLA_Commercial_Rules || []).find((row) => row.Rule_ID === ruleId);
  const kpiId = rule && rule.KPI_ID;
  return {
    rule: rule ? clone(rule) : null,
    slabs: clone((state.Penalty_Reward_Slabs || []).filter((row) => row.Rule_ID === ruleId)),
    exposure: clone((state.Commercial_Exposure || []).filter((row) => row.KPI_ID === kpiId)),
    whatIf: clone((state.What_If_Scenarios || []).filter((row) => row.Rule_ID === ruleId || (!row.Rule_ID && row.KPI_ID === kpiId))),
  };
}

function slaPublishSnapshot(rule, slabs, publishedAt, publishedBy) {
  return {
    publishedAt,
    publishedBy: publishedBy || null,
    rule: sanitizeSlaRuleSnapshot(rule),
    slabs: clone(slabs || []).map(sanitizeSlabSnapshot),
  };
}

function sanitizeSlaRuleSnapshot(rule) {
  const copy = clone(rule || {});
  delete copy.Published_Config_Snapshot;
  delete copy.Previous_Published_Config;
  return copy;
}

function sanitizeSlabSnapshot(slab) {
  return clone(slab || {});
}

function buildBaseExposureRows(state, rule, timestamp) {
  const date = timestamp.slice(0, 10);
  const teams = state.Teams || [];
  const performance = latestPerformanceRows(state.Performance_Data || [], rule.KPI_ID);
  const accountTemplate = (state.Commercial_Exposure || []).find((row) => row.Entity_Level === 'Account') || {};
  const teamTemplate = (state.Commercial_Exposure || []).find((row) => row.Entity_Level === 'Team') || {};
  const accountActual = average(performance.map((row) => toFiniteNumber(row.Actual, null)).filter(Number.isFinite));
  const accountForecast = Number.isFinite(accountActual) ? accountActual : toFiniteNumber(rule.Target, 0);
  const accountRow = {
    Snapshot_Date: date,
    Account_ID: accountTemplate.Account_ID || 'CLOVER_MA',
    Account_Name: accountTemplate.Account_Name || 'Clover Health Medicare Advantage Telesales',
    Entity_Level: 'Account',
    Entity_ID: rule.Account_ID || 'HCA001',
    Entity_Name: accountTemplate.Entity_Name || 'Clover Health Medicare Advantage Telesales',
    KPI_ID: rule.KPI_ID,
    KPI_Name: rule.KPI_Name,
    Target: rule.Target,
    Actual_MTD: roundDecimal(accountActual, 2),
    Forecast_EOM: roundDecimal(accountForecast, 2),
    Revenue_MTD: toFiniteNumber(accountTemplate.Revenue_MTD, 0),
    Rate_Card_Per_Call: toFiniteNumber(accountTemplate.Rate_Card_Per_Call, 72),
    Billable_Calls_MTD: toFiniteNumber(accountTemplate.Billable_Calls_MTD, 0),
  };
  const teamRows = teams.map((team) => {
    const rows = performance.filter((row) => row.TeamID === team.TeamID);
    const actual = average(rows.map((row) => toFiniteNumber(row.Actual, null)).filter(Number.isFinite));
    const forecast = Number.isFinite(actual) ? actual : toFiniteNumber(rule.Target, 0);
    return {
      Snapshot_Date: date,
      Account_ID: accountRow.Account_ID,
      Account_Name: accountRow.Account_Name,
      Entity_Level: 'Team',
      Entity_ID: team.TeamID,
      Entity_Name: team.TeamName || team.TeamID,
      KPI_ID: rule.KPI_ID,
      KPI_Name: rule.KPI_Name,
      Target: rule.Target,
      Actual_MTD: roundDecimal(actual, 2),
      Forecast_EOM: roundDecimal(forecast, 2),
      Revenue_MTD: toFiniteNumber(teamTemplate.Revenue_MTD, 0),
      Rate_Card_Per_Call: toFiniteNumber(teamTemplate.Rate_Card_Per_Call, 72),
      Billable_Calls_MTD: toFiniteNumber(teamTemplate.Billable_Calls_MTD, 0),
    };
  });
  return [accountRow, ...teamRows];
}

function latestPerformanceRows(rows, kpiId) {
  const scoped = (rows || []).filter((row) => row.KPI_ID === kpiId);
  const latest = scoped.map((row) => row.Date).filter(Boolean).sort().slice(-1)[0];
  return latest ? scoped.filter((row) => row.Date === latest) : scoped;
}

function recomputeExposureRow(rule, slabs, row, timestamp) {
  const forecast = toFiniteNumber(row.Forecast_EOM, toFiniteNumber(row.Actual_MTD, rule.Target));
  const impact = commercialImpact(rule, slabs, forecast);
  return {
    ...row,
    Snapshot_Date: timestamp.slice(0, 10),
    Rule_ID: rule.Rule_ID,
    KPI_ID: rule.KPI_ID,
    KPI_Name: rule.KPI_Name,
    Target: rule.Target,
    Variance_to_Target: impact.variance,
    Forecast_Penalty: impact.penalty,
    Forecast_Reward: impact.reward,
    Net_Impact: impact.net,
    Recovery_Required: impact.recoveryRequired,
    Risk_Level: impact.riskLevel,
    Impact_Type: impact.impactType,
    Recomputed_At: timestamp,
  };
}

function buildWhatIfRows(rule, slabs, exposureRows, timestamp) {
  const account = exposureRows.find((row) => row.Entity_Level === 'Account') || exposureRows[0];
  if (!account) return [];
  const current = commercialImpact(rule, slabs, toFiniteNumber(account.Forecast_EOM, rule.Target));
  const assumptions = [0.5, 1, 2, 3];
  return assumptions.map((assumption) => {
    const projectedForecast = projectedForecastFor(rule, account.Forecast_EOM, assumption);
    const projected = commercialImpact(rule, slabs, projectedForecast);
    return {
      Scenario_ID: `WI_${rule.Rule_ID}_${String(assumption).replace('.', '_')}`,
      Rule_ID: rule.Rule_ID,
      Scenario_Variance: assumption,
      KPI_ID: rule.KPI_ID,
      KPI_Name: rule.KPI_Name,
      Current_Forecast: roundDecimal(account.Forecast_EOM, 2),
      Improvement_Assumption: assumption,
      Projected_Forecast: roundDecimal(projectedForecast, 2),
      Current_Penalty: current.penalty,
      Projected_Penalty: projected.penalty,
      Current_Reward: current.reward,
      Projected_Reward: projected.reward,
      Net_Improvement: roundMoney(projected.net - current.net),
      Net_Impact: projected.net,
      Recommended_Team: recommendedTeam(exposureRows),
      Revenue_MTD: toFiniteNumber(account.Revenue_MTD, 0),
      Recomputed_At: timestamp,
    };
  });
}

function commercialImpact(rule, slabs, forecast) {
  const target = toFiniteNumber(rule.Target, 0);
  const variance = directionalVariance(rule.Direction, target, forecast);
  const slab = slabForVariance(slabs, variance);
  const rawPenalty = Math.max(0, toFiniteNumber(slab && slab.Penalty_Amount, 0));
  const rawReward = Math.max(0, toFiniteNumber(slab && slab.Reward_Amount, 0));
  const penaltyCap = toFiniteNumber(rule.Max_Penalty, Infinity);
  const rewardCap = toFiniteNumber(rule.Max_Reward, Infinity);
  const penalty = roundMoney(Math.min(rawPenalty, penaltyCap));
  const reward = roundMoney(Math.min(rawReward, rewardCap));
  const impactType = slab ? (slab.Impact_Type || impactTypeForAmounts(penalty, reward, variance)) : impactTypeForAmounts(penalty, reward, variance);
  return {
    variance,
    penalty,
    reward,
    net: roundMoney(reward - penalty),
    recoveryRequired: penalty > 0 ? Math.abs(Math.min(variance, 0)) : 0,
    riskLevel: riskLevelForImpact(penalty, reward, variance),
    impactType,
  };
}

function slabForVariance(slabs, variance) {
  return (slabs || []).find((slab) => {
    const from = Number(slab.Variance_From);
    const to = Number(slab.Variance_To);
    return Number.isFinite(from) && Number.isFinite(to) && variance >= from && variance <= to;
  }) || null;
}

function directionalVariance(direction, target, actualOrForecast) {
  const forecast = toFiniteNumber(actualOrForecast, target);
  if (!Number.isFinite(target) || !Number.isFinite(forecast)) return 0;
  const delta = String(direction || '').toLowerCase() === 'lower'
    ? target - forecast
    : forecast - target;
  return roundDecimal(delta, 2);
}

function projectedForecastFor(rule, forecast, assumption) {
  const current = toFiniteNumber(forecast, toFiniteNumber(rule.Target, 0));
  const multiplier = Math.abs(toFiniteNumber(assumption, 0)) / 100;
  if (String(rule.Direction || '').toLowerCase() === 'lower') {
    return current * (1 - multiplier);
  }
  return current * (1 + multiplier);
}

function recommendedTeam(exposureRows) {
  const teams = (exposureRows || []).filter((row) => row.Entity_Level === 'Team');
  if (!teams.length) return null;
  const ranked = teams.slice().sort((a, b) => {
    const penaltyDelta = toFiniteNumber(b.Forecast_Penalty, 0) - toFiniteNumber(a.Forecast_Penalty, 0);
    if (penaltyDelta) return penaltyDelta;
    return toFiniteNumber(a.Net_Impact, 0) - toFiniteNumber(b.Net_Impact, 0);
  });
  return ranked[0].Entity_ID || null;
}

function impactTypeForAmounts(penalty, reward, variance) {
  if (penalty > 0) return 'Penalty';
  if (reward > 0) return 'Reward';
  return variance < 0 ? 'Penalty' : 'Neutral';
}

function riskLevelForImpact(penalty, reward, variance) {
  if (penalty > 0) return Math.abs(variance) >= 2 ? 'Critical' : 'High';
  if (variance < 0) return 'Watch';
  if (reward > 0) return 'Green';
  return 'Green';
}

function average(values) {
  const nums = (values || []).filter(Number.isFinite);
  if (!nums.length) return null;
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
}

function roundDecimal(value, digits) {
  const parsed = toFiniteNumber(value, 0);
  const factor = 10 ** (digits || 0);
  return Math.round(parsed * factor) / factor;
}

function roundMoney(value) {
  return Math.round(toFiniteNumber(value, 0) * 100) / 100;
}

function toFiniteNumber(value, fallback) {
  if (value == null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

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
  ADMIN_USER,
  ArenaStore,
};
