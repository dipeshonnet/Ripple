/* eslint-disable */
// Performance Arena data service
// Runtime reads prefer REST entities and fall back to the generated seed bundle during migration.

(function (global) {
  'use strict';

  const MIGRATED_ENTITIES = ['Users', 'Teams', 'KPI_Master', 'Agent_Current'];
  const DB_NAME = 'ripple_arena_data_v1';
  const DB_VERSION = 1;
  const STORE_NAMES = ['entityCache', 'pendingMutations', 'appConfig', 'syncStatus'];
  const DEFAULT_CONFIG = {
    apiBaseUrl: '/api',
    bootstrapUserId: 'MGR001',
    requestTimeoutMs: 1200,
  };

  let dbPromise = null;
  let sessionPromise = null;

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

  async function readConfigValue(key, fallback) {
    const row = await getFromStore('appConfig', key);
    return row ? row.value : fallback;
  }

  async function writeSyncStatus(key, value) {
    return putInStore('syncStatus', Object.assign({ key, updatedAt: nowIso() }, value));
  }

  async function readCachedEntity(entity) {
    const cached = await getFromStore('entityCache', entity);
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

  function withTimeout(ms) {
    if (!global.AbortController) return {};
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
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      if (!payload || payload.ok === false) {
        throw new Error(payload?.error?.message || 'API request failed');
      }
      return payload;
    } finally {
      if (timeout.timeoutId) global.clearTimeout(timeout.timeoutId);
    }
  }

  async function sessionToken() {
    if (sessionPromise) return sessionPromise;

    sessionPromise = requestJson('/auth/session', {
      method: 'POST',
      body: JSON.stringify({ userId: config().bootstrapUserId }),
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
    return {
      rows: Array.isArray(payload.data) ? payload.data : [],
      meta: payload.meta || {},
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
      await writeCachedEntity(entity, fallbackRows, 'seed', { fallback: true });
      await writeSyncStatus(entity, { status: 'fallback', source: 'seed', error: String(error.message || error) });
      return fallbackRows;
    }
  }

  async function init() {
    const db = await openDb();
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

  global.ArenaDataService = {
    MIGRATED_ENTITIES: MIGRATED_ENTITIES.slice(),
    INDEXEDDB_STORES: STORE_NAMES.slice(),
    init,
    loadBootstrapData,
    getEntity,
    queueMutation,
    getSyncStatus: (key) => getFromStore('syncStatus', key),
  };
})(typeof window !== 'undefined' ? window : globalThis);
