/* eslint-disable */
// Performance Arena data service
// Runtime reads prefer REST entities and fall back to the generated seed bundle during migration.

(function (global) {
  'use strict';

  const WORKFLOW_ENTITIES = [
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
  const MIGRATED_ENTITIES = unique([
    'Users',
    'Teams',
    'Processes',
    'KPI_Master',
    'Performance_Data',
    'Daily_Agent_Score',
    'Agent_Current',
    'Leaderboard',
    'Badges',
    'Agent_Badges',
    'SLA_Commercial_Rules',
    'Penalty_Reward_Slabs',
    'Commercial_Exposure',
    'What_If_Scenarios',
    'Learning_Points_Rules',
    ...WORKFLOW_ENTITIES,
  ]);
  const ENTITY_KEYS = {
    Users: ['UserID'],
    Teams: ['TeamID'],
    Processes: ['ProcessID'],
    KPI_Master: ['KPI_ID'],
    Performance_Data: ['Date', 'UserID', 'TeamID', 'ProcessID', 'KPI_ID'],
    Daily_Agent_Score: ['Date', 'UserID'],
    Agent_Current: ['UserID'],
    Leaderboard: ['Leaderboard_ID'],
    Badges: ['Badge_ID'],
    Agent_Badges: ['Agent_Badge_ID'],
    SLA_Commercial_Rules: ['Rule_ID'],
    Penalty_Reward_Slabs: ['Slab_ID'],
    Commercial_Exposure: ['Snapshot_Date', 'Entity_ID', 'KPI_ID'],
    What_If_Scenarios: ['Scenario_ID'],
    Learning_Points_Rules: ['Activity', 'Module_Type'],
    Points_Ledger: ['Ledger_ID'],
    XP_Ledger: ['Ledger_ID'],
    Missions: ['Mission_ID'],
    Mission_Assignments: ['Assignment_ID'],
    Challenges: ['Challenge_ID'],
    Challenge_Participants: ['Participant_ID'],
    Challenge_Results: ['Result_ID'],
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
    Coaching: ['Coaching_ID'],
    Recognition: ['Recognition_ID'],
    Commercial_Verification: ['Snapshot_Date', 'Entity_ID', 'KPI_ID', 'Owner_ID'],
    TL_Manager_Verification: ['Owner_ID', 'TeamID', 'Module_ID'],
  };
  const DB_NAME = 'ripple_arena_data_v1';
  const DB_VERSION = 2;
  const STORE_NAMES = ['entityCache', 'pendingMutations', 'appConfig', 'syncStatus'];
  const WORKFLOW_MUTATION_ID = 'WORKFLOW_STATE_SNAPSHOT';
  const REFRESH_CHANNEL = 'ripple-arena-workflow-refresh';
  const REFRESH_SIGNAL_KEY = 'arena_workflow_refresh_signal_v1';
  const DEFAULT_CONFIG = {
    apiBaseUrl: '/api',
    bootstrapUserId: null,
    bootstrapRole: 'Manager',
    requestTimeoutMs: 1200,
  };

  let dbPromise = null;
  let sessionPromise = null;
  let flushTimer = null;
  let flushInFlight = false;
  let memoryPendingMutation = null;
  let refreshChannel = null;
  let listenersReady = false;
  const instanceId = `DS${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const entityVersions = {};

  function unique(values) {
    return Array.from(new Set(values));
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value == null ? null : value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function config() {
    return Object.assign({}, DEFAULT_CONFIG, global.ARENA_DATA_CONFIG || {});
  }

  function seedData() {
    return global.SEED_DATA || {};
  }

  function seedRows(entity) {
    return clone(seedData()[entity] || []);
  }

  function supportsIndexedDb() {
    return Boolean(global.indexedDB);
  }

  function openDb() {
    if (!supportsIndexedDb()) return Promise.resolve(null);
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve) => {
      let request;
      try {
        request = global.indexedDB.open(DB_NAME, DB_VERSION);
      } catch (error) {
        console.warn('Ripple data cache unavailable', error);
        resolve(null);
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('entityCache')) {
          const store = db.createObjectStore('entityCache', { keyPath: 'entity' });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('pendingMutations')) {
          const store = db.createObjectStore('pendingMutations', { keyPath: 'mutationId' });
          store.createIndex('entity', 'entity', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
        if (!db.objectStoreNames.contains('appConfig')) {
          db.createObjectStore('appConfig', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('syncStatus')) {
          db.createObjectStore('syncStatus', { keyPath: 'key' });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        console.warn('Ripple data cache unavailable', request.error);
        resolve(null);
      };
      request.onblocked = () => {
        console.warn('Ripple data cache upgrade blocked');
        resolve(null);
      };
    });

    return dbPromise;
  }

  function txStore(db, storeName, mode) {
    if (!db) return null;
    return db.transaction(storeName, mode).objectStore(storeName);
  }

  async function getFromStore(storeName, key) {
    const db = await openDb();
    const store = txStore(db, storeName, 'readonly');
    if (!store) return null;

    return new Promise((resolve) => {
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => resolve(null);
    });
  }

  async function getAllFromStore(storeName) {
    const db = await openDb();
    const store = txStore(db, storeName, 'readonly');
    if (!store) return memoryPendingMutation ? [memoryPendingMutation] : [];

    return new Promise((resolve) => {
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve(memoryPendingMutation ? [memoryPendingMutation] : []);
    });
  }

  async function putInStore(storeName, value) {
    const db = await openDb();
    const store = txStore(db, storeName, 'readwrite');
    if (!store) return null;

    return new Promise((resolve) => {
      const request = store.put(value);
      request.onsuccess = () => resolve(value);
      request.onerror = () => resolve(null);
    });
  }

  async function deleteFromStore(storeName, key) {
    const db = await openDb();
    const store = txStore(db, storeName, 'readwrite');
    if (!store) return null;

    return new Promise((resolve) => {
      const request = store.delete(key);
      request.onsuccess = () => resolve(true);
      request.onerror = () => resolve(false);
    });
  }

  async function readConfigValue(key, fallback) {
    const row = await getFromStore('appConfig', key);
    return row ? row.value : fallback;
  }

  async function writeSyncStatus(key, value) {
    const row = Object.assign({ key, updatedAt: nowIso() }, value);
    const saved = await putInStore('syncStatus', row);
    dispatch('arena:data-status', saved || row);
    return saved;
  }

  async function readCachedPayload(entity) {
    return getFromStore('entityCache', entity);
  }

  async function readCachedEntity(entity) {
    const cached = await readCachedPayload(entity);
    if (cached && cached.meta && cached.meta.baseVersions) entityVersions[entity] = clone(cached.meta.baseVersions);
    return cached && Array.isArray(cached.rows) ? clone(cached.rows) : null;
  }

  async function writeCachedEntity(entity, rows, source, meta) {
    const payload = {
      entity,
      rows: clone(rows || []),
      source,
      meta: meta || {},
      updatedAt: nowIso(),
    };
    await putInStore('entityCache', payload);
    return payload.rows;
  }

  function entityId(entity, row) {
    const keys = ENTITY_KEYS[entity] || Object.keys(row || {}).filter((key) => /(^|_)id$/i.test(key)).slice(0, 1);
    return keys.map((key) => row && row[key] != null ? String(row[key]) : '').join('|');
  }

  function versionMap(entity, rows) {
    return (rows || []).reduce((acc, row) => {
      const id = entityId(entity, row);
      if (id) acc[id] = row && row.updated_at ? row.updated_at : null;
      return acc;
    }, {});
  }

  function withTimeout(ms) {
    if (!global.AbortController || !global.setTimeout) return {};
    const controller = new global.AbortController();
    const timeoutId = global.setTimeout(() => controller.abort(), ms);
    return { controller, timeoutId, signal: controller.signal };
  }

  async function requestJson(path, options) {
    if (!global.fetch) throw new Error('Fetch API unavailable');

    const cfg = config();
    const baseUrl = await readConfigValue('api.baseUrl', cfg.apiBaseUrl);
    const timeout = withTimeout(cfg.requestTimeoutMs);
    const requestOptions = Object.assign({}, options || {}, {
      headers: Object.assign(
        { 'Content-Type': 'application/json' },
        (options && options.headers) || {}
      ),
      signal: timeout.signal,
    });

    try {
      const response = await global.fetch(`${baseUrl}${path}`, requestOptions);
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || payload.ok === false) {
        const error = new Error(payload?.error?.message || `HTTP ${response.status}`);
        error.status = response.status;
        error.code = payload?.error?.code || 'API_REQUEST_FAILED';
        error.details = payload?.error?.details || null;
        throw error;
      }
      return payload;
    } finally {
      if (timeout.timeoutId) global.clearTimeout(timeout.timeoutId);
    }
  }

  async function sessionToken() {
    if (sessionPromise) return sessionPromise;

    const cfg = config();
    const body = {};
    if (cfg.bootstrapUserId) body.userId = cfg.bootstrapUserId;
    else if (cfg.bootstrapRole) body.role = cfg.bootstrapRole;

    sessionPromise = requestJson('/auth/session', {
      method: 'POST',
      body: JSON.stringify(body),
    }).then((payload) => payload.data && payload.data.token)
      .catch((error) => {
        sessionPromise = null;
        throw error;
      });

    return sessionPromise;
  }

  async function fetchEntity(entity) {
    const token = await sessionToken();
    const payload = await requestJson(`/entities/${encodeURIComponent(entity)}`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const rows = Array.isArray(payload.data) ? payload.data : [];
    const baseVersions = payload.meta?.versionMap || versionMap(entity, rows);
    entityVersions[entity] = clone(baseVersions);
    return {
      rows,
      meta: Object.assign({}, payload.meta || {}, { baseVersions }),
    };
  }

  async function getEntity(entity, options) {
    const opts = options || {};
    if (!MIGRATED_ENTITIES.includes(entity)) return seedRows(entity);

    try {
      const fromApi = await fetchEntity(entity);
      await writeCachedEntity(entity, fromApi.rows, 'api', fromApi.meta);
      await writeSyncStatus(entity, { status: 'synced', source: 'api', error: null });
      return clone(fromApi.rows);
    } catch (error) {
      const cached = opts.skipCache ? null : await readCachedEntity(entity);
      if (cached) {
        await writeSyncStatus(entity, { status: 'cached', source: 'indexeddb', error: String(error.message || error) });
        return cached;
      }

      const fallbackRows = seedRows(entity);
      entityVersions[entity] = versionMap(entity, fallbackRows);
      await writeCachedEntity(entity, fallbackRows, 'seed', { fallback: true, baseVersions: entityVersions[entity] });
      await writeSyncStatus(entity, { status: 'fallback', source: 'seed', error: String(error.message || error) });
      return fallbackRows;
    }
  }

  async function init() {
    const db = await openDb();
    setupRefreshListeners();
    if (db) {
      const cfg = config();
      await putInStore('appConfig', { key: 'api.baseUrl', value: cfg.apiBaseUrl, updatedAt: nowIso() });
      await putInStore('syncStatus', {
        key: 'service',
        status: 'ready',
        source: supportsIndexedDb() ? 'indexeddb' : 'memory',
        stores: STORE_NAMES.slice(),
        updatedAt: nowIso(),
      });
    }
    return { dbName: DB_NAME, dbVersion: DB_VERSION, stores: STORE_NAMES.slice() };
  }

  async function loadBootstrapData(options) {
    const opts = options || {};
    const entities = opts.entities || MIGRATED_ENTITIES;
    const snapshot = clone(seedData() || {});

    await init();
    for (const entity of entities) {
      snapshot[entity] = await getEntity(entity, { skipCache: opts.forceRefresh === true });
    }

    return snapshot;
  }

  async function refreshEntities(entities, options) {
    const opts = options || {};
    const snapshot = {};
    await init();
    for (const entity of (entities || MIGRATED_ENTITIES)) {
      snapshot[entity] = await getEntity(entity, { skipCache: opts.forceRefresh === true });
    }
    dispatch('arena:data-refreshed', { entities: Object.keys(snapshot), source: opts.source || 'api' });
    return snapshot;
  }

  async function queueMutation(entity, operation, payload) {
    const mutation = {
      mutationId: `MUT${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 9999).toString(36).toUpperCase()}`,
      entity,
      operation,
      payload: clone(payload || {}),
      status: 'pending',
      createdAt: nowIso(),
    };
    await putInStore('pendingMutations', mutation);
    await writeSyncStatus('pendingMutations', { status: 'pending', source: 'indexeddb', error: null });
    return mutation;
  }

  async function persistWorkflowState(snapshot, options) {
    const opts = options || {};
    const entities = {};
    const baseVersions = {};

    await init();
    for (const entity of WORKFLOW_ENTITIES) {
      if (!Array.isArray(snapshot?.[entity])) continue;
      entities[entity] = clone(snapshot[entity]);
      baseVersions[entity] = clone(entityVersions[entity] || versionMap(entity, entities[entity]));
      await writeCachedEntity(entity, entities[entity], 'optimistic', {
        baseVersions: baseVersions[entity],
        dirty: true,
        actorUserId: opts.actorUserId || null,
        reason: opts.reason || 'workflow-mutation',
      });
    }

    if (!Object.keys(entities).length) return null;

    const mutation = {
      mutationId: WORKFLOW_MUTATION_ID,
      entity: 'Workflow_State',
      operation: 'snapshot',
      payload: {
        mutationId: WORKFLOW_MUTATION_ID,
        actorUserId: opts.actorUserId || null,
        reason: opts.reason || 'workflow-mutation',
        entities,
        baseVersions,
      },
      status: 'pending',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    memoryPendingMutation = mutation;
    await putInStore('pendingMutations', mutation);
    await writeSyncStatus('workflow', { status: 'pending', source: 'indexeddb', error: null });
    scheduleFlush();
    return mutation;
  }

  function scheduleFlush() {
    if (flushTimer || flushInFlight) return;
    if (!global.setTimeout) {
      flushPendingMutations();
      return;
    }
    flushTimer = global.setTimeout(() => {
      flushTimer = null;
      flushPendingMutations();
    }, 50);
  }

  async function flushPendingMutations() {
    if (flushInFlight) return;
    if (flushTimer && global.clearTimeout) {
      global.clearTimeout(flushTimer);
      flushTimer = null;
    }
    flushInFlight = true;
    try {
      const mutations = (await getAllFromStore('pendingMutations'))
        .filter((mutation) => mutation && mutation.status !== 'conflict');

      for (const mutation of mutations) {
        if (mutation.operation !== 'snapshot' || mutation.entity !== 'Workflow_State') continue;
        try {
          const result = await sendWorkflowSnapshot(mutation);
          await applyWorkflowResult(result, mutation);
          await deleteFromStore('pendingMutations', mutation.mutationId);
          if (memoryPendingMutation?.mutationId === mutation.mutationId) memoryPendingMutation = null;
        } catch (error) {
          const status = error.code === 'WORKFLOW_CONFLICT' || error.status === 409 ? 'conflict' : 'pending';
          const updated = Object.assign({}, mutation, {
            status,
            lastError: String(error.message || error),
            errorCode: error.code || null,
            conflictDetails: error.details || null,
            updatedAt: nowIso(),
          });
          memoryPendingMutation = updated;
          await putInStore('pendingMutations', updated);
          await writeSyncStatus('workflow', {
            status,
            source: 'api',
            error: updated.lastError,
            details: updated.conflictDetails,
          });
          if (status === 'conflict') {
            dispatch('arena:data-conflict', {
              message: updated.lastError,
              details: updated.conflictDetails,
              mutationId: mutation.mutationId,
            });
          }
          break;
        }
      }
    } finally {
      flushInFlight = false;
    }
  }

  async function sendWorkflowSnapshot(mutation) {
    const token = await sessionToken();
    const payload = await requestJson('/workflow/mutations', {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: JSON.stringify(mutation.payload),
    });
    return payload.data;
  }

  async function applyWorkflowResult(result, mutation) {
    const entities = result?.entities || {};
    const versions = result?.versions || {};
    for (const [entity, rows] of Object.entries(entities)) {
      const baseVersions = versions[entity] || versionMap(entity, rows);
      entityVersions[entity] = clone(baseVersions);
      await writeCachedEntity(entity, rows, 'api', {
        baseVersions,
        dirty: false,
        mutationId: mutation.mutationId,
        appliedAt: result.appliedAt || nowIso(),
      });
    }
    await writeSyncStatus('workflow', { status: 'synced', source: 'api', error: null, appliedAt: result?.appliedAt || nowIso() });
    dispatch('arena:data-synced', { mutationId: mutation.mutationId, entities: Object.keys(entities), appliedAt: result?.appliedAt || nowIso() });
    broadcastRefresh({ mutationId: mutation.mutationId, entities: Object.keys(entities), appliedAt: result?.appliedAt || nowIso() });
  }

  function setupRefreshListeners() {
    if (listenersReady) return;
    listenersReady = true;

    if (global.BroadcastChannel) {
      try {
        refreshChannel = new global.BroadcastChannel(REFRESH_CHANNEL);
        refreshChannel.onmessage = (event) => {
          const detail = event && event.data;
          if (detail && detail.source !== instanceId) {
            dispatch('arena:data-refresh-needed', Object.assign({ source: 'broadcast-channel' }, detail));
          }
        };
      } catch (error) {
        refreshChannel = null;
      }
    }

    if (global.addEventListener) {
      global.addEventListener('online', () => {
        writeSyncStatus('network', { status: 'online', source: 'browser', error: null });
        flushPendingMutations();
      });
      global.addEventListener('offline', () => {
        writeSyncStatus('network', { status: 'offline', source: 'browser', error: null });
      });
      global.addEventListener('storage', (event) => {
        if (event && event.key === REFRESH_SIGNAL_KEY && event.newValue) {
          try {
            const detail = JSON.parse(event.newValue);
            if (detail.source !== instanceId) dispatch('arena:data-refresh-needed', Object.assign({ source: 'storage-event' }, detail));
          } catch (error) {
            dispatch('arena:data-refresh-needed', { source: 'storage-event' });
          }
        }
      });
    }
  }

  function broadcastRefresh(detail) {
    const payload = Object.assign({ type: 'workflow-synced', source: instanceId, at: nowIso() }, detail || {});
    if (refreshChannel) {
      try { refreshChannel.postMessage(payload); } catch (error) { /**/ }
    }
    try {
      if (global.localStorage) global.localStorage.setItem(REFRESH_SIGNAL_KEY, JSON.stringify(payload));
    } catch (error) {
      // localStorage is only a cross-tab signal here; IndexedDB remains the optimistic cache.
    }
  }

  function dispatch(name, detail) {
    if (!global.dispatchEvent) return;
    try {
      if (typeof global.CustomEvent === 'function') {
        global.dispatchEvent(new global.CustomEvent(name, { detail }));
      } else if (typeof global.Event === 'function') {
        const event = new global.Event(name);
        event.detail = detail;
        global.dispatchEvent(event);
      }
    } catch (error) {
      // Non-browser test contexts may not accept DOM events.
    }
  }

  global.ArenaDataService = {
    MIGRATED_ENTITIES: MIGRATED_ENTITIES.slice(),
    WORKFLOW_ENTITIES: WORKFLOW_ENTITIES.slice(),
    INDEXEDDB_STORES: STORE_NAMES.slice(),
    init,
    loadBootstrapData,
    refreshEntities,
    getEntity,
    persistWorkflowState,
    flushPendingMutations,
    queueMutation,
    getSyncStatus: (key) => getFromStore('syncStatus', key),
    getAllSyncStatuses: () => getAllFromStore('syncStatus'),
  };
})(typeof window !== 'undefined' ? window : globalThis);
