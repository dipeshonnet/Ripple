const assert = require('assert');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const vm = require('vm');

const SERVICE_PATH = path.resolve(__dirname, 'data-service.js');
const SERVICE_CODE = fs.readFileSync(SERVICE_PATH, 'utf8');

const seed = {
  Users: [{ UserID: 'SEED_USER', Name: 'Seed User', Role: 'Agent' }],
  Teams: [{ TeamID: 'SEED_TEAM', TeamName: 'Seed Team' }],
  KPI_Master: [{ KPI_ID: 'SEED_KPI', KPI_Name: 'Seed KPI' }],
  Agent_Current: [{ UserID: 'SEED_USER', PerformanceScore: 50 }],
  Processes: [{ ProcessID: 'SEED_PROCESS' }],
};

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  };
}

function normalize(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadService(overrides = {}) {
  const window = Object.assign({
    SEED_DATA: seed,
    ARENA_DATA_CONFIG: { apiBaseUrl: '/api', requestTimeoutMs: 50 },
    console,
    encodeURIComponent,
    setTimeout,
    clearTimeout,
  }, overrides);
  vm.runInNewContext(SERVICE_CODE, { window });
  return window.ArenaDataService;
}

test('loadBootstrapData overlays migrated entities from REST API', async () => {
  const apiRows = {
    Users: [{ UserID: 'API_USER', Name: 'API User', Role: 'Manager' }],
    Teams: [{ TeamID: 'API_TEAM', TeamName: 'API Team' }],
    KPI_Master: [{ KPI_ID: 'API_KPI', KPI_Name: 'API KPI' }],
    Agent_Current: [{ UserID: 'API_USER', PerformanceScore: 99 }],
  };
  const calls = [];
  const service = loadService({
    fetch: async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET' });
      if (url === '/api/auth/session') return jsonResponse({ ok: true, data: { token: 'TOKEN' } });
      const entity = decodeURIComponent(url.replace('/api/entities/', ''));
      return jsonResponse({ ok: true, data: apiRows[entity], meta: { entity, count: apiRows[entity].length } });
    },
  });

  const snapshot = await service.loadBootstrapData({ entities: ['Users', 'Teams', 'KPI_Master', 'Agent_Current'] });

  assert.deepStrictEqual(normalize(snapshot.Users), apiRows.Users);
  assert.deepStrictEqual(normalize(snapshot.Teams), apiRows.Teams);
  assert.deepStrictEqual(normalize(snapshot.KPI_Master), apiRows.KPI_Master);
  assert.deepStrictEqual(normalize(snapshot.Agent_Current), apiRows.Agent_Current);
  assert.deepStrictEqual(normalize(snapshot.Processes), seed.Processes);
  assert.deepStrictEqual(calls.map((call) => call.url), [
    '/api/auth/session',
    '/api/entities/Users',
    '/api/entities/Teams',
    '/api/entities/KPI_Master',
    '/api/entities/Agent_Current',
  ]);
});

test('loadBootstrapData falls back to seed rows when REST API is unavailable', async () => {
  const service = loadService({
    fetch: async () => {
      throw new Error('network unavailable');
    },
  });

  const snapshot = await service.loadBootstrapData({ entities: ['Users', 'Teams', 'KPI_Master', 'Agent_Current'] });

  assert.deepStrictEqual(normalize(snapshot.Users), seed.Users);
  assert.deepStrictEqual(normalize(snapshot.Teams), seed.Teams);
  assert.deepStrictEqual(normalize(snapshot.KPI_Master), seed.KPI_Master);
  assert.deepStrictEqual(normalize(snapshot.Agent_Current), seed.Agent_Current);
  assert.deepStrictEqual(normalize(service.INDEXEDDB_STORES), ['entityCache', 'pendingMutations', 'appConfig', 'syncStatus']);
});

test('IndexedDB fallback emits sync status events for the PWA indicator', async () => {
  const events = [];
  class TestCustomEvent {
    constructor(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    }
  }
  const service = loadService({
    fetch: async () => {
      throw new Error('network unavailable');
    },
    CustomEvent: TestCustomEvent,
    dispatchEvent: (event) => events.push(event),
    addEventListener: () => {},
  });

  await service.loadBootstrapData({ entities: ['Users'] });

  const status = events.find((event) => event.type === 'arena:data-status' && event.detail?.key === 'Users');
  assert.ok(status);
  assert.equal(status.detail.status, 'fallback');
});

test('persistWorkflowState posts optimistic workflow snapshot to REST API', async () => {
  const calls = [];
  const service = loadService({
    fetch: async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET', body: options.body ? JSON.parse(options.body) : null });
      if (url === '/api/auth/session') return jsonResponse({ ok: true, data: { token: 'TOKEN' } });
      if (url === '/api/workflow/mutations') {
        return jsonResponse({
          ok: true,
          data: {
            mutationId: options.body ? JSON.parse(options.body).mutationId : null,
            applied: 1,
            touched: ['Users'],
            entities: { Users: [{ UserID: 'API_USER', Name: 'API User', updated_at: '2026-06-21T00:00:00.000Z' }] },
            versions: { Users: { API_USER: '2026-06-21T00:00:00.000Z' } },
            appliedAt: '2026-06-21T00:00:00.000Z',
          },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    },
  });

  const mutation = await service.persistWorkflowState({
    Users: [{ UserID: 'API_USER', Name: 'API User' }],
  }, { actorUserId: 'AG001', reason: 'unit-test' });
  await service.flushPendingMutations();

  assert.equal(mutation.operation, 'snapshot');
  assert.deepStrictEqual(calls.map((call) => call.url), ['/api/auth/session', '/api/workflow/mutations']);
  assert.equal(calls[1].body.actorUserId, 'AG001');
  assert.deepStrictEqual(normalize(calls[1].body.entities.Users), [{ UserID: 'API_USER', Name: 'API User' }]);
});
