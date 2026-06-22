/* eslint-disable no-console */
const assert = require('assert');
const http = require('http');
const test = require('node:test');

const { createApi } = require('./app');

async function withServer(fn) {
  const api = createApi({ persist: false });
  const server = http.createServer(api.handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await fn({ baseUrl, api });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function request(baseUrl, path, options = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : null;
  return { status: res.status, payload };
}

async function login(baseUrl, userId) {
  const res = await request(baseUrl, '/api/auth/session', { method: 'POST', body: { userId } });
  assert.equal(res.status, 200);
  assert.equal(res.payload.ok, true);
  return res.payload.data.token;
}

test('health and auth session expose role scope', async () => {
  await withServer(async ({ baseUrl }) => {
    const health = await request(baseUrl, '/api/health');
    assert.equal(health.status, 200);
    assert.equal(health.payload.data.status, 'ok');

    const token = await login(baseUrl, 'MGR001');
    const scope = await request(baseUrl, '/api/auth/scope', { token });
    assert.equal(scope.status, 200);
    assert.equal(scope.payload.data.role, 'Manager');
    assert.ok(Array.isArray(scope.payload.data.teamIds));

    const roleScope = await request(baseUrl, '/api/role-scope', { token });
    assert.equal(roleScope.status, 200);
    assert.equal(roleScope.payload.data.userId, 'MGR001');
  });
});

test('PWA manifest is served from App_Config and exposes uploaded icons', async () => {
  await withServer(async ({ baseUrl }) => {
    const manifest = await request(baseUrl, '/api/pwa/manifest.webmanifest');
    assert.equal(manifest.status, 200);
    assert.equal(manifest.payload.name, 'Ripple for Clover Medicare Advantage');
    assert.equal(manifest.payload.display, 'standalone');
    assert.ok(manifest.payload.icons.some((row) => row.src === '/icons/icon-192.png'));

    const token = await login(baseUrl, 'ADMIN001');
    const configUpdate = await request(baseUrl, '/api/admin/settings', {
      method: 'PATCH',
      token,
      body: { config: { 'manifest.short_name': 'Ripple QA' } },
    });
    assert.equal(configUpdate.status, 200);
    const iconUpload = await request(baseUrl, '/api/admin/settings/icons', {
      method: 'POST',
      token,
      body: { size: 192, filename: 'qa-icon-192.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AAAA', width: 192, height: 192 },
    });
    assert.equal(iconUpload.status, 200);

    const updated = await request(baseUrl, '/api/pwa/manifest.webmanifest');
    assert.equal(updated.status, 200);
    assert.equal(updated.payload.short_name, 'Ripple QA');
    assert.ok(updated.payload.icons.some((row) => row.src.startsWith('/api/pwa/icons/192.png')));

    const icon = await fetch(`${baseUrl}/api/pwa/icons/192.png`);
    assert.equal(icon.status, 200);
    assert.match(icon.headers.get('content-type'), /image\/png/);
  });
});

test('role-scoped entity reads preserve BRD v2 KPI and commercial guardrails', async () => {
  await withServer(async ({ baseUrl }) => {
    const agentToken = await login(baseUrl, 'AG001');
    const tlToken = await login(baseUrl, 'TL001');
    const managerToken = await login(baseUrl, 'MGR001');

    const agentPerformance = await request(baseUrl, '/api/entities/Performance_Data', { token: agentToken });
    assert.equal(agentPerformance.status, 200);
    assert.ok(agentPerformance.payload.data.length > 0);
    assert.ok(agentPerformance.payload.data.every((row) => row.UserID === 'AG001'));

    const agentKpis = await request(baseUrl, '/api/entities/KPI_Master', { token: agentToken });
    assert.equal(agentKpis.status, 200);
    assert.ok(agentKpis.payload.data.length > 0);
    assert.ok(agentKpis.payload.data.every((row) => !/financial|commercial|revenue|cost|savings|penalty|reward|shrinkage|asa|abandon|per 1,000|per 1000/i.test(`${row.KPI_Name} ${row.KPI_Type} ${row.Description}`)));

    const agentCommercial = await request(baseUrl, '/api/entities/Commercial_Exposure', { token: agentToken });
    assert.equal(agentCommercial.status, 200);
    assert.deepEqual(agentCommercial.payload.data, []);

    const tlPerformance = await request(baseUrl, '/api/entities/Performance_Data', { token: tlToken });
    assert.equal(tlPerformance.status, 200);
    assert.ok(tlPerformance.payload.data.length > 0);
    assert.ok(tlPerformance.payload.data.every((row) => row.TeamID === 'T001'));

    const tlCommercial = await request(baseUrl, '/api/entities/Commercial_Exposure', { token: tlToken });
    assert.equal(tlCommercial.status, 200);
    assert.ok(tlCommercial.payload.data.length > 0);
    assert.ok(tlCommercial.payload.data.every((row) => row.Entity_Level === 'Team' && row.Entity_ID === 'T001'));

    const managerCommercial = await request(baseUrl, '/api/entities/Commercial_Exposure', { token: managerToken });
    assert.equal(managerCommercial.status, 200);
    assert.ok(managerCommercial.payload.data.some((row) => row.Entity_Level === 'Account'));
    assert.ok(managerCommercial.payload.data.some((row) => row.Entity_Level === 'Team'));
  });
});

test('admin guard blocks manager mutations', async () => {
  await withServer(async ({ baseUrl }) => {
    const unauthenticated = await request(baseUrl, '/api/admin/dashboard');
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.payload.error.code, 'AUTH_REQUIRED');

    const token = await login(baseUrl, 'MGR001');
    const res = await request(baseUrl, '/api/admin/kpis', {
      method: 'POST',
      token,
      body: { KPI_Name: 'Blocked KPI' },
    });
    assert.equal(res.status, 403);
    assert.equal(res.payload.error.code, 'ADMIN_REQUIRED');
  });
});

test('workflow mutations persist business rows and report stale-version conflicts', async () => {
  await withServer(async ({ baseUrl }) => {
    const token = await login(baseUrl, 'MGR001');
    const current = await request(baseUrl, '/api/entities/Agent_Current/AG001', { token });
    assert.equal(current.status, 200);

    const row = current.payload.data;
    const baseVersion = current.payload.meta.versionMap.AG001;
    const firstBalance = Number(row.ArenaPointsBalance || 0) + 25;
    const saved = await request(baseUrl, '/api/workflow/mutations', {
      method: 'POST',
      token,
      body: {
        mutationId: 'WF_SMOKE_1',
        actorUserId: 'AG001',
        reason: 'smoke-test',
        entities: {
          Agent_Current: [{ ...row, ArenaPointsBalance: firstBalance }],
        },
        baseVersions: {
          Agent_Current: { AG001: baseVersion },
        },
      },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.payload.data.applied, 1);
    assert.equal(saved.payload.data.entities.Agent_Current.find((item) => item.UserID === 'AG001').ArenaPointsBalance, firstBalance);

    const stale = await request(baseUrl, '/api/workflow/mutations', {
      method: 'POST',
      token,
      body: {
        mutationId: 'WF_SMOKE_2',
        actorUserId: 'AG001',
        reason: 'stale-smoke-test',
        entities: {
          Agent_Current: [{ ...row, ArenaPointsBalance: firstBalance + 25 }],
        },
        baseVersions: {
          Agent_Current: { AG001: baseVersion },
        },
      },
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.payload.error.code, 'WORKFLOW_CONFLICT');
  });
});

test('admin dashboard exposes BRD v2 Control Centre metrics', async () => {
  await withServer(async ({ baseUrl }) => {
    const token = await login(baseUrl, 'ADMIN001');
    const res = await request(baseUrl, '/api/admin/dashboard', { token });
    assert.equal(res.status, 200);

    const d = res.payload.data;
    assert.ok(d.activeUserCount >= 1);
    assert.equal(d.kpiCatalogue.total, 21);
    assert.equal(d.kpiCatalogue.active, 21);
    assert.equal(d.kpiCatalogue.retired, 0);
    assert.equal(d.importQueueDepth, 0);
    assert.equal(d.pendingRewardApprovals, 2);
    assert.equal(d.openCoachingRecords, 15);
    assert.ok(d.dataFreshness.timestamp);
    assert.ok(Array.isArray(d.dataFreshness.timeline));
    assert.ok(d.alertCountBySeverity.High >= d.pendingRewardApprovals + d.openCoachingRecords);
    assert.ok(['green', 'amber', 'red'].includes(d.health));
    assert.ok(Array.isArray(d.systemHealth.checks));
  });
});

test('entity CRUD works for admin and writes audit rows', async () => {
  await withServer(async ({ baseUrl }) => {
    const token = await login(baseUrl, 'ADMIN001');
    const created = await request(baseUrl, '/api/entities/Users', {
      method: 'POST',
      token,
      body: {
        UserID: 'AG_SMOKE',
        Name: 'Smoke Agent',
        Role: 'Agent',
        TeamID: 'T001',
        ProcessID: 'P001',
        Status: 'Active',
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.payload.data.UserID, 'AG_SMOKE');

    const updated = await request(baseUrl, '/api/entities/Users/AG_SMOKE', {
      method: 'PATCH',
      token,
      body: { Location: 'Smoke Lab' },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.payload.data.Location, 'Smoke Lab');

    const audit = await request(baseUrl, '/api/admin/audit-log?entity=Users', { token });
    assert.equal(audit.status, 200);
    assert.ok(audit.payload.data.length >= 2);

    const createAudit = audit.payload.data.find((row) => row.Action_Type === 'CREATE' && row.Record_ID === 'AG_SMOKE');
    const updateAudit = audit.payload.data.find((row) => row.Action_Type === 'UPDATE' && row.Record_ID === 'AG_SMOKE');
    assert.equal(createAudit.Before_Snapshot, null);
    assert.equal(createAudit.After_Snapshot.UserID, 'AG_SMOKE');
    assert.equal(updateAudit.Before_Snapshot.UserID, 'AG_SMOKE');
    assert.equal(updateAudit.After_Snapshot.Location, 'Smoke Lab');
    assert.equal(updateAudit.Admin_UserID, 'ADMIN001');
    assert.ok(Object.prototype.hasOwnProperty.call(updateAudit, 'IP_Address'));
  });
});

test('admin publish actions write before and after audit snapshots', async () => {
  await withServer(async ({ baseUrl }) => {
    const token = await login(baseUrl, 'ADMIN001');
    const publish = await request(baseUrl, '/api/admin/kpis/publish', {
      method: 'POST',
      token,
      body: {},
    });
    assert.equal(publish.status, 200);

    const audit = await request(baseUrl, '/api/admin/audit-log?entity=KPI_Master', { token });
    assert.equal(audit.status, 200);
    const row = audit.payload.data.find((entry) => entry.Action_Type === 'KPI_PUBLISH');
    assert.ok(row, 'missing KPI_PUBLISH audit row');
    assert.ok(Array.isArray(row.Before_Snapshot));
    assert.equal(row.After_Snapshot.status, 'published');
    assert.ok(Array.isArray(row.After_Snapshot.rows));
  });
});

test('admin KPI lifecycle generates immutable IDs and retains historical performance data', async () => {
  await withServer(async ({ baseUrl, api }) => {
    const token = await login(baseUrl, 'ADMIN001');
    const performanceRowsBefore = api.store.state.Performance_Data.length;

    const created = await request(baseUrl, '/api/admin/kpis', {
      method: 'POST',
      token,
      body: {
        KPI_ID: 'MANUAL_KPI',
        KPI_Name: 'Smoke KPI',
        KPI_Type: 'Compliance',
        Unit: '%',
        Direction: 'Higher',
        Target: 95,
        Green_Threshold: 95,
        Amber_Threshold: 90,
        Red_Threshold: 85,
        Weightage: 0.05,
        Visible_Agent: true,
        Visible_TL: true,
        Visible_Manager: false,
        Active: true,
      },
    });
    assert.equal(created.status, 201);
    const kpiId = created.payload.data.KPI_ID;
    assert.ok(kpiId.startsWith('KPI_'));
    assert.notEqual(kpiId, 'MANUAL_KPI');

    const idPatch = await request(baseUrl, `/api/admin/kpis/${encodeURIComponent(kpiId)}`, {
      method: 'PATCH',
      token,
      body: { KPI_ID: 'OTHER_KPI', Target: 96 },
    });
    assert.equal(idPatch.status, 409);
    assert.equal(idPatch.payload.error.code, 'KPI_ID_IMMUTABLE');

    const updated = await request(baseUrl, `/api/admin/kpis/${encodeURIComponent(kpiId)}`, {
      method: 'PATCH',
      token,
      body: { Target: 96 },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.payload.data.KPI_ID, kpiId);
    assert.equal(updated.payload.data.Target, 96);
    assert.equal(updated.payload.data.RAG_Recompute_Status, 'Pending Publish');

    const retired = await request(baseUrl, `/api/admin/kpis/${encodeURIComponent(kpiId)}/retire`, {
      method: 'POST',
      token,
      body: {},
    });
    assert.equal(retired.status, 200);
    assert.equal(retired.payload.data.Active, false);
    assert.equal(api.store.state.Performance_Data.length, performanceRowsBefore);
    assert.ok(api.store.state.KPI_Master.some((row) => row.KPI_ID === kpiId));

    const publish = await request(baseUrl, '/api/admin/kpis/publish', { method: 'POST', token, body: {} });
    assert.equal(publish.status, 200);
    assert.equal(publish.payload.data.recomputation, 'queued');
    const publishedRow = api.store.state.KPI_Master.find((row) => row.KPI_ID === kpiId);
    assert.equal(publishedRow.RAG_Recompute_Status, 'Queued');
    assert.ok(publishedRow.RAG_Recompute_Queued_At);
  });
});

test('dataset import validation and commit maintain import log', async () => {
  await withServer(async ({ baseUrl }) => {
    const token = await login(baseUrl, 'ADMIN001');
    const entities = await request(baseUrl, '/api/entities', { token });
    assert.equal(entities.status, 200);
    const usersEntity = entities.payload.data.find((row) => row.entity === 'Users');
    const importLogEntity = entities.payload.data.find((row) => row.entity === 'Import_Log');
    assert.ok(usersEntity.importable);
    assert.ok(Array.isArray(usersEntity.schema.columns));
    assert.ok(usersEntity.schema.columns.some((column) => column.name === 'XP' && column.type === 'number'));
    assert.equal(importLogEntity.controlEntity, true);

    const invalid = await request(baseUrl, '/api/imports/validate', {
      method: 'POST',
      token,
      body: { entity: 'Users', mode: 'upsert', filename: 'bad.xlsx', rows: [{ Name: 'Missing ID' }] },
    });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.payload.data.validation.valid, false);
    assert.equal(invalid.payload.data.importLog.Status, 'ValidationFailed');
    assert.ok(invalid.payload.data.validation.errors.some((row) => row.column === 'UserID'));

    const typeMismatch = await request(baseUrl, '/api/imports/validate', {
      method: 'POST',
      token,
      body: { entity: 'Users', mode: 'upsert', filename: 'bad-type.xlsx', rows: [{ UserID: 'AG_BAD_TYPE', XP: 'not-a-number' }] },
    });
    assert.equal(typeMismatch.status, 422);
    assert.ok(typeMismatch.payload.data.validation.errors.some((row) => row.column === 'XP' && row.expectedType === 'number'));

    const validated = await request(baseUrl, '/api/imports/validate', {
      method: 'POST',
      token,
      body: {
        entity: 'Users',
        mode: 'upsert',
        filename: 'users.xlsx',
        rows: [{
          UserID: 'AG_IMPORT',
          Name: 'Imported Agent',
          Role: 'Agent',
          TeamID: 'T001',
          ProcessID: 'P001',
          Status: 'Active',
          XP: '10',
        }],
      },
    });
    assert.equal(validated.status, 200);
    assert.equal(validated.payload.data.importLog.Status, 'Validated');
    assert.equal(validated.payload.data.validation.diff.added, 1);
    const importId = validated.payload.data.importLog.Import_ID;

    const committed = await request(baseUrl, '/api/imports/commit', {
      method: 'POST',
      token,
      body: { importId },
    });
    assert.equal(committed.status, 201);
    assert.equal(committed.payload.data.importLog.Import_ID, importId);
    assert.equal(committed.payload.data.importLog.Status, 'Committed');
    assert.equal(committed.payload.data.importLog.Previous_Rows.length, 107);

    const imported = await request(baseUrl, '/api/entities/Users/AG_IMPORT', { token });
    assert.equal(imported.status, 200);
    assert.equal(imported.payload.data.Import_ID, committed.payload.data.importLog.Import_ID);
    assert.equal(imported.payload.data.XP, 10);

    const imports = await request(baseUrl, '/api/imports?Entity_Name=Users', { token });
    assert.equal(imports.status, 200);
    assert.equal(imports.payload.data.filter((row) => row.Import_ID === importId).length, 1);
    assert.ok(imports.payload.data.some((row) => row.Status === 'ValidationFailed'));

    const revert = await request(baseUrl, `/api/imports/${importId}/revert`, {
      method: 'POST',
      token,
      body: {},
    });
    assert.equal(revert.status, 200);
    assert.equal(revert.payload.data.reverted.Status, 'Reverted');
    assert.equal(revert.payload.data.importLog.Reverted_From_Import_ID, importId);

    const revertedUser = await request(baseUrl, '/api/entities/Users/AG_IMPORT', { token });
    assert.equal(revertedUser.status, 404);

    const audit = await request(baseUrl, '/api/admin/audit-log?entity=Import_Log', { token });
    assert.equal(audit.status, 200);
    assert.ok(audit.payload.data.some((row) => row.Action_Type === 'IMPORT_VALIDATE'));
    assert.ok(audit.payload.data.some((row) => row.Action_Type === 'IMPORT_REVERT'));
  });
});

test('admin managers expose KPI, gamification, settings, and SLA validation', async () => {
  await withServer(async ({ baseUrl, api }) => {
    const token = await login(baseUrl, 'ADMIN001');

    const kpis = await request(baseUrl, '/api/admin/kpis?limit=1', { token });
    assert.equal(kpis.status, 200);
    assert.ok(kpis.payload.data.length >= 1);

    const gamification = await request(baseUrl, '/api/admin/gamification', { token });
    assert.equal(gamification.status, 200);
    assert.ok(Array.isArray(gamification.payload.data.Missions));

    const settings = await request(baseUrl, '/api/admin/settings', { token });
    assert.equal(settings.status, 200);
    assert.equal(settings.payload.data.environment, 'Seed');
    assert.ok(settings.payload.data.appConfig.some((row) => row.Config_Key === 'manifest.short_name'));
    assert.ok(settings.payload.data.featureFlags.some((row) => row.Scope === 'All' || row.Scope === 'Role'));

    const blockedProduction = await request(baseUrl, '/api/admin/settings/environment', {
      method: 'POST',
      token,
      body: { environment: 'Production' },
    });
    assert.equal(blockedProduction.status, 400);
    assert.equal(blockedProduction.payload.error.code, 'TWO_FACTOR_REQUIRED');

    const production = await request(baseUrl, '/api/admin/settings/environment', {
      method: 'POST',
      token,
      body: { environment: 'Production', twoFactorCode: '123456' },
    });
    assert.equal(production.status, 200);
    assert.equal(production.payload.data.Config_Value, 'Production');

    const configUpdate = await request(baseUrl, '/api/admin/settings', {
      method: 'PATCH',
      token,
      body: { config: { 'app.name': 'Ripple QA Arena', 'integrations.crmFeedUrl': 'https://crm.example.test/feed' } },
    });
    assert.equal(configUpdate.status, 200);
    assert.ok(configUpdate.payload.data.some((row) => row.Config_Key === 'app.name' && row.Version === 2));

    const versions = await request(baseUrl, '/api/admin/settings/versions?key=app.name', { token });
    assert.equal(versions.status, 200);
    assert.ok(versions.payload.data.some((row) => row.Config_Key === 'app.name' && row.Version === 1));

    const revert = await request(baseUrl, '/api/admin/settings/revert', {
      method: 'POST',
      token,
      body: { key: 'app.name', version: 1 },
    });
    assert.equal(revert.status, 200);
    assert.equal(revert.payload.data.Config_Value, 'Ripple for Clover Medicare Advantage');
    assert.equal(revert.payload.data.Reverted_From_Version, 1);

    const invalidIcon = await request(baseUrl, '/api/admin/settings/icons', {
      method: 'POST',
      token,
      body: { size: 192, filename: 'bad.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AAAA', width: 128, height: 128 },
    });
    assert.equal(invalidIcon.status, 422);
    assert.equal(invalidIcon.payload.error.code, 'PWA_ICON_DIMENSIONS_INVALID');

    const validIcon = await request(baseUrl, '/api/admin/settings/icons', {
      method: 'POST',
      token,
      body: { size: 192, filename: 'icon-192.png', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AAAA', width: 192, height: 192 },
    });
    assert.equal(validIcon.status, 200);
    assert.equal(validIcon.payload.data.Config_Key, 'pwa.icon.192');

    const flag = settings.payload.data.featureFlags[0];
    const teamId = api.store.state.Teams[0].TeamID;
    const flagUpdate = await request(baseUrl, `/api/admin/feature-flags/${flag.Flag_ID}`, {
      method: 'PATCH',
      token,
      body: { Enabled: false, Scope: 'Team', Scope_Team_ID: teamId },
    });
    assert.equal(flagUpdate.status, 200);
    assert.equal(flagUpdate.payload.data.Scope, 'Team');
    assert.equal(flagUpdate.payload.data.Scope_Team_ID, teamId);

    const healthCheck = await request(baseUrl, '/api/admin/settings/health-check', {
      method: 'POST',
      token,
      body: {},
    });
    assert.equal(healthCheck.status, 200);
    assert.ok(healthCheck.payload.data.some((row) => row.key === 'api.baseUrl' && row.status === 'green'));

    const auditSearch = await request(baseUrl, '/api/admin/audit-log?search=CONFIG_REVERT&limit=10', { token });
    assert.equal(auditSearch.status, 200);
    assert.ok(auditSearch.payload.data.some((row) => row.Action_Type === 'CONFIG_REVERT'));

    const csvResponse = await fetch(`${baseUrl}/api/admin/audit-log?format=csv&search=CONFIG_REVERT`, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(csvResponse.status, 200);
    const csv = await csvResponse.text();
    assert.match(csv, /Before_Snapshot/);
    assert.match(csv, /CONFIG_REVERT/);

    api.store.state.SLA_Commercial_Rules.push({
      Rule_ID: 'SLA_SMOKE',
      Account_ID: 'HCA001',
      KPI_ID: 'KPI001',
      Target: 90,
      Direction: 'Higher',
      Status: 'Draft',
    });
    api.store.state.Penalty_Reward_Slabs.push(
      { Slab_ID: 'SLAB_A', Rule_ID: 'SLA_SMOKE', Variance_From: -10, Variance_To: -1, Impact_Type: 'Penalty' },
      { Slab_ID: 'SLAB_B', Rule_ID: 'SLA_SMOKE', Variance_From: -5, Variance_To: 0, Impact_Type: 'Penalty' },
    );

    const publish = await request(baseUrl, '/api/admin/sla-rules/SLA_SMOKE/publish', {
      method: 'POST',
      token,
      body: {},
    });
    assert.equal(publish.status, 422);
    assert.equal(publish.payload.error.code, 'SLA_SLAB_OVERLAP');
  });
});

test('admin SLA rules validate slabs, publish recomputes commercial models, and revert previous published config', async () => {
  await withServer(async ({ baseUrl, api }) => {
    const token = await login(baseUrl, 'ADMIN001');

    const overlappingSave = await request(baseUrl, '/api/admin/sla-rules/CR001/slabs', {
      method: 'POST',
      token,
      body: {
        Variance_From: -0.75,
        Variance_To: -0.25,
        Impact_Type: 'Penalty',
        Penalty_Amount: 777,
        Reward_Amount: 0,
      },
    });
    assert.equal(overlappingSave.status, 422);
    assert.equal(overlappingSave.payload.error.code, 'SLA_SLAB_OVERLAP');

    const firstPublish = await request(baseUrl, '/api/admin/sla-rules/CR001/publish', {
      method: 'POST',
      token,
      body: {},
    });
    assert.equal(firstPublish.status, 200);
    assert.equal(firstPublish.payload.data.recomputation.status, 'complete');
    assert.ok(firstPublish.payload.data.recomputation.Commercial_Exposure.after >= 1);
    assert.ok(firstPublish.payload.data.recomputation.What_If_Scenarios.after >= 1);
    assert.ok(api.store.state.Commercial_Exposure.some((row) => row.Rule_ID === 'CR001'));
    assert.ok(api.store.state.What_If_Scenarios.some((row) => row.Rule_ID === 'CR001' && row.Scenario_Variance === 1));

    const baselineSlab = api.store.state.Penalty_Reward_Slabs.find((row) => row.Slab_ID === 'CR001-P0_5');
    assert.equal(baselineSlab.Reward_Amount, 1250);

    const changedSlab = await request(baseUrl, '/api/admin/sla-rules/CR001/slabs/CR001-P0_5', {
      method: 'PATCH',
      token,
      body: { Reward_Amount: 98765 },
    });
    assert.equal(changedSlab.status, 200);
    assert.equal(changedSlab.payload.data.Reward_Amount, 98765);

    const secondPublish = await request(baseUrl, '/api/admin/sla-rules/CR001/publish', {
      method: 'POST',
      token,
      body: {},
    });
    assert.equal(secondPublish.status, 200);
    assert.ok(secondPublish.payload.data.rule.Previous_Published_Config);

    const revert = await request(baseUrl, '/api/admin/sla-rules/CR001/revert', {
      method: 'POST',
      token,
      body: {},
    });
    assert.equal(revert.status, 200);
    const restoredSlab = api.store.state.Penalty_Reward_Slabs.find((row) => row.Slab_ID === 'CR001-P0_5');
    assert.equal(restoredSlab.Reward_Amount, 1250);

    const audit = await request(baseUrl, '/api/admin/audit-log?entity=SLA_Commercial_Rules', { token });
    assert.equal(audit.status, 200);
    assert.ok(audit.payload.data.some((row) => row.Action_Type === 'SLA_PUBLISH' && row.Record_ID === 'CR001'));
    assert.ok(audit.payload.data.some((row) => row.Action_Type === 'SLA_PUBLISH_REVERT' && row.Record_ID === 'CR001'));
  });
});

test('admin gamification configuration enforces approval and history guardrails', async () => {
  await withServer(async ({ baseUrl, api }) => {
    const token = await login(baseUrl, 'ADMIN001');

    const createdMission = await request(baseUrl, '/api/admin/gamification/missions', {
      method: 'POST',
      token,
      body: {
        Mission_Name: 'Smoke Mission',
        Mission_Type: 'Quality Shield',
        Audience_Type: 'Targeted',
        Audience_ID: 'MULTI',
        Audience_Roles: ['Agent'],
        Audience_Team_IDs: ['T001'],
        Audience_Process_IDs: ['P001'],
        Audience_Target_Count: 20,
        KPI_ID: 'KPI001',
        Reward_Points: 100,
        XP_Reward: 50,
        Status: 'Active',
        Active: true,
      },
    });
    assert.equal(createdMission.status, 201);
    assert.ok(createdMission.payload.data.Mission_ID.startsWith('MIS_'));
    assert.deepEqual(createdMission.payload.data.Audience_Roles, ['Agent']);

    const blockedMission = await request(baseUrl, '/api/admin/gamification/missions/MIS001/deactivate', {
      method: 'POST',
      token,
      body: {},
    });
    assert.equal(blockedMission.status, 409);
    assert.equal(blockedMission.payload.error.code, 'MISSION_IN_PROGRESS');
    assert.ok(blockedMission.payload.error.details.participantCount > 0);

    const blockedChallenge = await request(baseUrl, '/api/admin/gamification/challenges/CH001/deactivate', {
      method: 'POST',
      token,
      body: {},
    });
    assert.equal(blockedChallenge.status, 409);
    assert.equal(blockedChallenge.payload.error.code, 'CHALLENGE_IN_PROGRESS');

    const pending = api.store.state.Reward_Redemptions.find((row) => row.Status === 'Pending Approval');
    assert.ok(pending);
    const reward = api.store.state.Rewards.find((row) => row.Reward_ID === pending.Reward_ID);
    const stockBefore = reward.Stock;
    const approved = await request(baseUrl, `/api/admin/gamification/reward-redemptions/${pending.Redemption_ID}/approve`, {
      method: 'POST',
      token,
      body: {},
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.payload.data.redemption.Status, 'Fulfilled');
    assert.equal(approved.payload.data.reward.Stock, stockBefore - 1);

    const duplicateApproval = await request(baseUrl, `/api/admin/gamification/reward-redemptions/${pending.Redemption_ID}/approve`, {
      method: 'POST',
      token,
      body: {},
    });
    assert.equal(duplicateApproval.status, 409);
    assert.equal(duplicateApproval.payload.error.code, 'REDEMPTION_NOT_PENDING');

    const pointsLedgerBefore = JSON.stringify(api.store.state.Points_Ledger);
    const xpLedgerBefore = JSON.stringify(api.store.state.XP_Ledger);
    const rule = api.store.state.Learning_Points_Rules[0];
    const ruleId = encodeURIComponent(`${rule.Activity}|${rule.Module_Type}`);
    const ruleUpdate = await request(baseUrl, `/api/admin/gamification/learning-points-rules/${ruleId}`, {
      method: 'PATCH',
      token,
      body: { Arena_Points: rule.Arena_Points + 25, XP: rule.XP + 10 },
    });
    assert.equal(ruleUpdate.status, 200);
    assert.equal(ruleUpdate.payload.data.Arena_Points, rule.Arena_Points + 25);
    assert.equal(JSON.stringify(api.store.state.Points_Ledger), pointsLedgerBefore);
    assert.equal(JSON.stringify(api.store.state.XP_Ledger), xpLedgerBefore);

    const earnedBadgesBefore = api.store.state.Agent_Badges.filter((row) => row.Badge_ID === 'B001').length;
    const badgeUpdate = await request(baseUrl, '/api/admin/gamification/badges/B001', {
      method: 'PATCH',
      token,
      body: { Criteria: 'Smoke criteria update' },
    });
    assert.equal(badgeUpdate.status, 200);
    assert.equal(api.store.state.Agent_Badges.filter((row) => row.Badge_ID === 'B001').length, earnedBadgesBefore);
  });
});
