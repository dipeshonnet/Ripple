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

test('dataset import validation and commit maintain import log', async () => {
  await withServer(async ({ baseUrl }) => {
    const token = await login(baseUrl, 'ADMIN001');
    const invalid = await request(baseUrl, '/api/imports/validate', {
      method: 'POST',
      token,
      body: { entity: 'Users', mode: 'upsert', filename: 'bad.xlsx', rows: [{ Name: 'Missing ID' }] },
    });
    assert.equal(invalid.status, 422);
    assert.equal(invalid.payload.data.validation.valid, false);
    assert.equal(invalid.payload.data.importLog.Status, 'ValidationFailed');

    const committed = await request(baseUrl, '/api/imports/commit', {
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
        }],
      },
    });
    assert.equal(committed.status, 201);
    assert.equal(committed.payload.data.importLog.Status, 'Committed');

    const imported = await request(baseUrl, '/api/entities/Users/AG_IMPORT', { token });
    assert.equal(imported.status, 200);
    assert.equal(imported.payload.data.Import_ID, committed.payload.data.importLog.Import_ID);
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
