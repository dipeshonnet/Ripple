const http = require('http');
const { URL } = require('url');
const { ArenaStore } = require('./store');
const {
  GAMIFICATION_ENTITIES,
  assignIdIfMissing,
  createId,
  getRecordId,
  normalizeEntityName,
} = require('./entity-metadata');

function createApi(options = {}) {
  const store = options.store || new ArenaStore(options);
  const sessions = new Map();

  async function handler(req, res) {
    setDefaultHeaders(res);
    if (req.method === 'OPTIONS') return send(res, 204, null);

    try {
      const parsed = new URL(req.url, 'http://localhost');
      const path = parsed.pathname.split('/').filter(Boolean);
      const query = Object.fromEntries(parsed.searchParams.entries());
      if (path[0] !== 'api') return fail(404, 'NOT_FOUND', 'Unknown API route.');

      if (req.method === 'GET' && path[1] === 'health') {
        return ok(res, {
          status: 'ok',
          service: 'performance-arena-api',
          persistence: store.persistEnabled ? 'local-json' : 'memory',
          timestamp: new Date().toISOString(),
        });
      }

      if (path[1] === 'pwa') {
        return handlePwa(req, res, path.slice(2), store);
      }

      if (path[1] === 'auth') {
        return await handleAuth(req, res, path.slice(2), sessions, store);
      }

      const session = requireSession(req, sessions, store);

      if (req.method === 'GET' && path[1] === 'role-scope') {
        return ok(res, store.roleScopeFor(session.user));
      }

      if (path[1] === 'entities') {
        return await handleEntities(req, res, path.slice(2), query, store, session);
      }

      if (path[1] === 'workflow') {
        return await handleWorkflow(req, res, path.slice(2), store, session);
      }

      if (path[1] === 'imports') {
        requireAdmin(session);
        return await handleImports(req, res, path.slice(2), query, store, session);
      }

      if (path[1] === 'admin') {
        requireAdmin(session);
        return await handleAdmin(req, res, path.slice(2), query, store, session);
      }

      return fail(404, 'NOT_FOUND', 'Unknown API route.');
    } catch (error) {
      return sendError(res, error);
    }
  }

  return { handler, store, sessions };
}

function createServer(options = {}) {
  const api = createApi(options);
  return { ...api, server: http.createServer(api.handler) };
}

async function handleAuth(req, res, path, sessions, store) {
  if (req.method === 'POST' && path[0] === 'session') {
    const body = await readJson(req);
    const userId = body.userId || body.UserID;
    const user = userId ? store.findActiveUser(userId) : store.findBootstrapUser(body.role || body.Role || 'Manager');
    if (!user) return fail(401, 'INVALID_CREDENTIALS', 'Active user was not found.');
    const token = createId('SESSION');
    const session = {
      token,
      user,
      scope: store.roleScopeFor(user),
      createdAt: new Date().toISOString(),
      expiresAt: null,
    };
    sessions.set(token, session);
    return ok(res, { token, user: publicUser(user), scope: session.scope });
  }

  if (req.method === 'GET' && path[0] === 'session') {
    const session = requireSession(req, sessions, store);
    return ok(res, { user: publicUser(session.user), scope: store.roleScopeFor(session.user) });
  }

  if (req.method === 'DELETE' && path[0] === 'session') {
    const token = bearerToken(req);
    if (token) sessions.delete(token);
    return ok(res, { ended: true });
  }

  if (req.method === 'GET' && path[0] === 'scope') {
    const session = requireSession(req, sessions, store);
    return ok(res, store.roleScopeFor(session.user));
  }

  return fail(404, 'NOT_FOUND', 'Unknown auth route.');
}

function handlePwa(req, res, path, store) {
  if (req.method === 'GET' && path[0] === 'manifest.webmanifest') {
    res.setHeader('content-type', 'application/manifest+json; charset=utf-8');
    return send(res, 200, buildPwaManifest(store));
  }

  if (req.method === 'GET' && path[0] === 'icons' && path[1]) {
    const match = String(path[1]).match(/^(\d+)\.png$/);
    const size = match ? Number(match[1]) : null;
    const icon = size ? pwaIconFromConfig(store, size) : null;
    if (!icon) return fail(404, 'PWA_ICON_NOT_FOUND', `Configured ${size || ''} PWA icon was not found.`);
    res.setHeader('cache-control', 'public, max-age=31536000, immutable');
    return sendBinary(res, 200, icon.buffer, 'image/png');
  }

  return fail(404, 'NOT_FOUND', 'Unknown PWA route.');
}

async function handleEntities(req, res, path, query, store, session) {
  if (!path.length && req.method === 'GET') {
    return ok(res, store.listEntities(session));
  }

  const entity = normalizeEntityName(path[0]);
  const id = decodeId(path[1]);

  if (req.method === 'GET' && !id) {
    const rows = store.getRows(entity, { query, session });
    return ok(res, rows, {
      entity,
      count: rows.length,
      limit: query.limit || null,
      offset: query.offset || 0,
      versionMap: store.recordVersionMap(entity, rows),
    });
  }

  if (req.method === 'GET' && id) {
    const record = store.getRecord(entity, id, { session });
    if (!record) return fail(404, 'NOT_FOUND', `Record not found in ${entity}: ${id}`);
    return ok(res, record, { entity, id, versionMap: store.recordVersionMap(entity, [record]) });
  }

  requireAdmin(session);

  if (req.method === 'POST' && !id) {
    const record = store.createRecord(entity, await readJson(req), adminWriteContext(req, session));
    return ok(res, record, { entity, id: getRecordId(entity, record) }, 201);
  }

  if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
    const record = store.updateRecord(entity, id, await readJson(req), adminWriteContext(req, session));
    return ok(res, record, { entity, id });
  }

  if (req.method === 'DELETE' && id) {
    const record = store.deleteRecord(entity, id, adminWriteContext(req, session));
    return ok(res, record, { entity, id });
  }

  return fail(405, 'METHOD_NOT_ALLOWED', 'Unsupported entity operation.');
}

async function handleWorkflow(req, res, path, store, session) {
  if (path[0] === 'mutations' && req.method === 'POST') {
    const result = store.applyWorkflowSnapshot(await readJson(req), workflowWriteContext(req, session));
    return ok(res, result);
  }
  return fail(404, 'NOT_FOUND', 'Unknown workflow route.');
}

async function handleImports(req, res, path, query, store, session) {
  if (req.method === 'GET' && !path.length) {
    return ok(res, store.getRows('Import_Log', { query, session }));
  }

  if (req.method === 'POST' && path[0] === 'validate') {
    const payload = await readJson(req);
    const validation = store.validateImport(payload);
    const importLog = store.recordImportAttempt(payload, validation, adminWriteContext(req, session));
    return ok(res, { importLog, validation }, {}, validation.valid ? 200 : 422);
  }

  if (req.method === 'POST' && path[0] === 'commit') {
    return ok(res, store.commitImport(await readJson(req), adminWriteContext(req, session)), {}, 201);
  }

  const importId = decodeId(path[0]);
  if (req.method === 'GET' && importId) {
    const record = store.getRecord('Import_Log', importId, { session });
    if (!record) return fail(404, 'NOT_FOUND', `Import not found: ${importId}`);
    return ok(res, record);
  }

  if (req.method === 'POST' && importId && path[1] === 'revert') {
    return ok(res, store.revertImport(importId, adminWriteContext(req, session)));
  }

  return fail(404, 'NOT_FOUND', 'Unknown import route.');
}

async function handleAdmin(req, res, path, query, store, session) {
  if (req.method === 'GET' && path[0] === 'dashboard') {
    return ok(res, store.dashboard());
  }

  if (path[0] === 'kpis') return handleKpis(req, res, path.slice(1), query, store, session);
  if (path[0] === 'users') return handleManagedEntity('Users', req, res, path.slice(1), query, store, session);
  if (path[0] === 'teams') return handleManagedEntity('Teams', req, res, path.slice(1), query, store, session);
  if (path[0] === 'gamification') return handleGamification(req, res, path.slice(1), query, store, session);
  if (path[0] === 'sla-rules' || path[0] === 'commercial-rules') return handleSla(req, res, path.slice(1), query, store, session);
  if (path[0] === 'settings') return handleSettings(req, res, path.slice(1), query, store, session);
  if (path[0] === 'feature-flags') return handleFeatureFlags(req, res, path.slice(1), query, store, session);
  if (path[0] === 'audit-log') return handleAuditLog(req, res, query, store, session);

  return fail(404, 'NOT_FOUND', 'Unknown admin route.');
}

async function handleKpis(req, res, path, query, store, session) {
  if (!path.length && req.method === 'GET') {
    return ok(res, store.getRows('KPI_Master', { query, session }));
  }
  if (!path.length && req.method === 'POST') {
    const record = store.createRecord('KPI_Master', normalizeKpiCreate(await readJson(req)), adminWriteContext(req, session, {
      recompute: 'pending_publish',
    }));
    return ok(res, record, {}, 201);
  }
  if (path[0] === 'publish' && req.method === 'POST') {
    const before = store.getRows('KPI_Master', { session });
    const queuedAt = new Date().toISOString();
    for (const row of store.state.KPI_Master || []) {
      row.RAG_Recompute_Status = 'Queued';
      row.RAG_Recompute_Queue = 'Queued';
      row.RAG_Recompute_Queued_At = queuedAt;
      row.Last_Published_At = queuedAt;
      row.Published_By = session.user.UserID;
      row.updated_at = queuedAt;
    }
    const rows = store.getRows('KPI_Master', { session });
    store.auditAdminWrite('KPI_PUBLISH', 'KPI_Master', 'bulk', before, {
      status: 'published',
      recompute: 'queued',
      queuedAt,
      rows,
    }, adminWriteContext(req, session, { recompute: 'queued' }));
    store.save();
    return ok(res, { published: true, recomputation: 'queued', queuedAt, rows });
  }
  const id = decodeId(path[0]);
  if (path[1] === 'retire' && req.method === 'POST') {
    return ok(res, store.updateRecord('KPI_Master', id, {
      Active: false,
      Status: 'Retired',
      RAG_Recompute_Status: 'Pending Publish',
      RAG_Recompute_Queue: 'Pending Publish',
    }, adminWriteContext(req, session, {
      recompute: 'pending_publish',
      performanceDataRetention: 'historical_rows_retained',
    })));
  }
  if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
    return ok(res, store.updateRecord('KPI_Master', id, normalizeKpiPatch(id, await readJson(req)), adminWriteContext(req, session, {
      recompute: 'pending_publish',
    })));
  }
  if (req.method === 'GET' && id) {
    const record = store.getRecord('KPI_Master', id, { session });
    if (!record) return fail(404, 'NOT_FOUND', `KPI not found: ${id}`);
    return ok(res, record);
  }
  return fail(404, 'NOT_FOUND', 'Unknown KPI route.');
}

function normalizeKpiCreate(body) {
  const payload = { ...(body || {}) };
  delete payload.KPI_ID;
  if (payload.Active == null) payload.Active = true;
  if (!payload.Status) payload.Status = payload.Active === false ? 'Retired' : 'Active';
  if (!payload.RAG_Recompute_Status) payload.RAG_Recompute_Status = 'Pending Publish';
  if (!payload.RAG_Recompute_Queue) payload.RAG_Recompute_Queue = 'Pending Publish';
  return assignIdIfMissing('KPI_Master', payload);
}

function normalizeKpiPatch(id, body) {
  const payload = { ...(body || {}) };
  if (payload.KPI_ID != null && String(payload.KPI_ID) !== String(id)) {
    return fail(409, 'KPI_ID_IMMUTABLE', 'KPI_ID is system-generated and immutable after creation.');
  }
  delete payload.KPI_ID;
  if (!payload.RAG_Recompute_Status) payload.RAG_Recompute_Status = 'Pending Publish';
  if (!payload.RAG_Recompute_Queue) payload.RAG_Recompute_Queue = 'Pending Publish';
  return payload;
}

async function handleManagedEntity(entity, req, res, path, query, store, session) {
  const id = decodeId(path[0]);
  if (!path.length && req.method === 'GET') return ok(res, store.getRows(entity, { query, session }));
  if (!path.length && req.method === 'POST') return ok(res, store.createRecord(entity, await readJson(req), adminWriteContext(req, session)), {}, 201);
  if (path[1] === 'deactivate' && req.method === 'POST') {
    return ok(res, store.updateRecord(entity, id, { Active: false, is_active: false, Status: 'Inactive' }, adminWriteContext(req, session)));
  }
  if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
    return ok(res, store.updateRecord(entity, id, await readJson(req), adminWriteContext(req, session)));
  }
  if (req.method === 'GET' && id) {
    const record = store.getRecord(entity, id, { session });
    if (!record) return fail(404, 'NOT_FOUND', `Record not found: ${id}`);
    return ok(res, record);
  }
  return fail(404, 'NOT_FOUND', `Unknown ${entity} route.`);
}

async function handleGamification(req, res, path, query, store, session) {
  if (!path.length && req.method === 'GET') {
    return ok(res, {
      Missions: store.getRows('Missions', { query, session }),
      Mission_Assignments: store.getRows('Mission_Assignments', { query, session }),
      Challenges: store.getRows('Challenges', { query, session }),
      Challenge_Participants: store.getRows('Challenge_Participants', { query, session }),
      Challenge_Results: store.getRows('Challenge_Results', { query, session }),
      Badges: store.getRows('Badges', { query, session }),
      Agent_Badges: store.getRows('Agent_Badges', { query, session }),
      Rewards: store.getRows('Rewards', { query, session }),
      Learning_Points_Rules: store.getRows('Learning_Points_Rules', { query, session }),
      Reward_Redemptions: store.getRows('Reward_Redemptions', { query, session }),
      Points_Ledger: store.getRows('Points_Ledger', { query, session }),
      XP_Ledger: store.getRows('XP_Ledger', { query, session }),
    });
  }
  if (path[0] === 'publish' && req.method === 'POST') {
    const before = gamificationSnapshot(store, query, session);
    const publishRequest = await readJson(req);
    store.auditAdminWrite('GAMIFICATION_PUBLISH', 'Gamification_Config', 'bulk', before, {
      status: 'published',
      publishRequest,
      rows: gamificationSnapshot(store, query, session),
    }, adminWriteContext(req, session));
    store.save();
    return ok(res, { published: true });
  }
  const entityKey = gamificationEntityKey(path[0]);
  if (entityKey === 'reward_redemptions' && path[2] && req.method === 'POST') {
    const decision = path[2] === 'approve' ? 'approve' : path[2] === 'reject' ? 'reject' : null;
    if (!decision) return fail(404, 'NOT_FOUND', 'Unknown reward redemption action.');
    return ok(res, store.settleRewardRedemption(decodeId(path[1]), decision, adminWriteContext(req, session)));
  }
  const entity = GAMIFICATION_ENTITIES[entityKey];
  if (!entity) return fail(404, 'NOT_FOUND', 'Unknown gamification entity.');
  if (path[2] === 'deactivate' && req.method === 'POST') {
    return ok(res, store.deactivateGamificationConfig(entity, decodeId(path[1]), adminWriteContext(req, session)));
  }
  if ((req.method === 'PATCH' || req.method === 'PUT') && path[1]) {
    const patch = await readJson(req);
    const metadata = {};
    if (entityKey === 'learning_points_rules') metadata.nonRetroactive = 'points_xp_ledger_retained';
    if (entityKey === 'badges') metadata.nonRetroactive = 'earned_badges_retained';
    const context = adminWriteContext(req, session, metadata);
    if (payloadIndicatesDeactivation(patch)) {
      return ok(res, store.deactivateGamificationConfig(entity, decodeId(path[1]), context, patch));
    }
    return ok(res, store.updateRecord(entity, decodeId(path[1]), patch, context));
  }
  return handleManagedEntity(entity, req, res, path.slice(1), query, store, session);
}

function gamificationEntityKey(raw) {
  return String(raw || '').replace(/-/g, '_');
}

function payloadIndicatesDeactivation(payload) {
  if (!payload) return false;
  if (payload.Active === false || payload.Is_Active === false || payload.is_active === false) return true;
  const status = String(payload.Status || '').trim().toLowerCase();
  return ['inactive', 'deactivated', 'retired', 'closed'].includes(status);
}

async function handleSla(req, res, path, query, store, session) {
  if (!path.length && req.method === 'GET') {
    const rules = store.getRows('SLA_Commercial_Rules', { query, session });
    const slabs = store.getRows('Penalty_Reward_Slabs', { session });
    return ok(res, rules.map((rule) => ({
      ...rule,
      Slabs: slabs.filter((slab) => slab.Rule_ID === rule.Rule_ID),
    })));
  }
  if (!path.length && req.method === 'POST') {
    return ok(res, store.createSlaRule(await readJson(req), adminWriteContext(req, session)), {}, 201);
  }
  const ruleId = decodeId(path[0]);
  if (path[1] === 'publish' && req.method === 'POST') {
    return ok(res, store.publishSlaRule(ruleId, adminWriteContext(req, session)));
  }
  if (path[1] === 'revert' && req.method === 'POST') {
    return ok(res, store.revertSlaRule(ruleId, adminWriteContext(req, session)));
  }
  if (path[1] === 'slabs') {
    if (req.method === 'GET' && path.length === 2) {
      return ok(res, store.getRows('Penalty_Reward_Slabs', { query: { ...query, Rule_ID: ruleId }, session }));
    }
    if (req.method === 'POST' && path.length === 2) {
      return ok(res, store.createSlaSlab(ruleId, await readJson(req), adminWriteContext(req, session)), {}, 201);
    }
    const slabId = decodeId(path[2]);
    if ((req.method === 'PATCH' || req.method === 'PUT') && slabId) {
      return ok(res, store.updateSlaSlab(ruleId, slabId, await readJson(req), adminWriteContext(req, session)));
    }
    if (req.method === 'DELETE' && slabId) {
      return ok(res, store.deleteSlaSlab(ruleId, slabId, adminWriteContext(req, session)));
    }
  }
  if ((req.method === 'PATCH' || req.method === 'PUT') && ruleId) {
    return ok(res, store.updateSlaRule(ruleId, await readJson(req), adminWriteContext(req, session)));
  }
  return fail(404, 'NOT_FOUND', 'Unknown SLA route.');
}

async function handleSettings(req, res, path, query, store, session) {
  if (!path.length && req.method === 'GET') {
    return ok(res, {
      appConfig: store.getRows('App_Config', { query, session }),
      featureFlags: store.getRows('Feature_Flags', { session }),
      environment: store.getConfigValue('environment') || 'Seed',
      settingVersions: store.getConfigVersions(query.key || null),
    });
  }
  if (!path.length && (req.method === 'PATCH' || req.method === 'PUT')) {
    const body = await readJson(req);
    return ok(res, store.setConfigValues(body.config || body, adminWriteContext(req, session)));
  }
  if (path[0] === 'versions' && req.method === 'GET') {
    return ok(res, store.getConfigVersions(query.key || null));
  }
  if (path[0] === 'revert' && req.method === 'POST') {
    const body = await readJson(req);
    return ok(res, store.revertConfigValue(body.key || body.Config_Key, body.version || body.Version, adminWriteContext(req, session)));
  }
  if (path[0] === 'icons' && req.method === 'POST') {
    return ok(res, store.savePwaIcon(await readJson(req), adminWriteContext(req, session)));
  }
  if (path[0] === 'health-check' && req.method === 'POST') {
    const settings = store.getRows('App_Config', { session });
    return ok(res, buildEndpointHealth(settings));
  }
  if (path[0] === 'environment' && req.method === 'POST') {
    const body = await readJson(req);
    if (!['Seed', 'Production'].includes(body.environment)) {
      return fail(422, 'ENVIRONMENT_INVALID', 'Environment must be Seed or Production.');
    }
    if (body.environment === 'Production' && !body.twoFactorCode) {
      return fail(400, 'TWO_FACTOR_REQUIRED', 'Production environment switch requires two-factor confirmation.');
    }
    return ok(res, store.setConfigValues(
      { environment: body.environment || 'Seed' },
      adminWriteContext(req, session, { twoFactorConfirmed: Boolean(body.twoFactorCode) })
    )[0]);
  }
  return fail(404, 'NOT_FOUND', 'Unknown settings route.');
}

async function handleFeatureFlags(req, res, path, query, store, session) {
  if (!path.length && req.method === 'GET') {
    return ok(res, store.getRows('Feature_Flags', { query, session }));
  }
  const id = decodeId(path[0]);
  if ((req.method === 'PATCH' || req.method === 'PUT') && id) {
    return ok(res, store.updateFeatureFlag(id, await readJson(req), adminWriteContext(req, session)));
  }
  return handleManagedEntity('Feature_Flags', req, res, path, query, store, session);
}

async function handleAuditLog(req, res, query, store, session) {
  const rows = store.searchAuditLog({
    ...query,
    limit: query.format === 'csv' ? (query.limit || 5000) : query.limit,
  }, session);
  if (query.format === 'csv') {
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', 'attachment; filename="admin-audit-log.csv"');
    return send(res, 200, toCsv(rows), false);
  }
  return ok(res, rows);
}

function adminWriteContext(req, session, metadata = {}) {
  return {
    session,
    metadata: {
      ...metadata,
      ipAddress: clientIp(req),
      method: req.method,
      route: req.url,
    },
  };
}

function workflowWriteContext(req, session, metadata = {}) {
  return {
    session,
    metadata: {
      ...metadata,
      ipAddress: clientIp(req),
      method: req.method,
      route: req.url,
    },
  };
}

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) return String(forwarded).split(',')[0].trim();
  return req.socket?.remoteAddress || null;
}

function gamificationSnapshot(store, query, session) {
  return {
    Missions: store.getRows('Missions', { query, session }),
    Mission_Assignments: store.getRows('Mission_Assignments', { query, session }),
    Challenges: store.getRows('Challenges', { query, session }),
    Challenge_Participants: store.getRows('Challenge_Participants', { query, session }),
    Challenge_Results: store.getRows('Challenge_Results', { query, session }),
    Badges: store.getRows('Badges', { query, session }),
    Agent_Badges: store.getRows('Agent_Badges', { query, session }),
    Rewards: store.getRows('Rewards', { query, session }),
    Learning_Points_Rules: store.getRows('Learning_Points_Rules', { query, session }),
    Reward_Redemptions: store.getRows('Reward_Redemptions', { query, session }),
    Points_Ledger: store.getRows('Points_Ledger', { query, session }),
    XP_Ledger: store.getRows('XP_Ledger', { query, session }),
  };
}

function requireSession(req, sessions, store) {
  const token = bearerToken(req);
  if (!token || !sessions.has(token)) {
    const error = new Error('Authentication is required.');
    error.status = 401;
    error.code = 'AUTH_REQUIRED';
    throw error;
  }
  const session = sessions.get(token);
  const user = store.findActiveUser(session.user.UserID);
  if (!user) {
    sessions.delete(token);
    const error = new Error('Session user is no longer active.');
    error.status = 401;
    error.code = 'SESSION_REVOKED';
    throw error;
  }
  session.user = user;
  session.scope = store.roleScopeFor(user);
  return session;
}

function requireAdmin(session) {
  if (!session || !session.user || session.user.Role !== 'Admin') {
    const error = new Error('Admin role is required.');
    error.status = 403;
    error.code = 'ADMIN_REQUIRED';
    throw error;
  }
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

function publicUser(user) {
  return {
    UserID: user.UserID,
    Name: user.Name,
    Role: user.Role,
    TeamID: user.TeamID || null,
    ProcessID: user.ProcessID || null,
    ManagerID: user.ManagerID || null,
    Status: user.Status,
  };
}

function decodeId(id) {
  return id ? decodeURIComponent(id) : null;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (error) {
    error.status = 400;
    error.code = 'INVALID_JSON';
    error.message = 'Request body must be valid JSON.';
    throw error;
  }
}

function ok(res, data, meta = {}, status = 200) {
  return send(res, status, { ok: true, data, meta });
}

function fail(status, code, message, details) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.details = details;
  throw error;
}

function sendError(res, error) {
  return send(res, error.status || 500, {
    ok: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message || 'Unexpected API error.',
      details: error.details || null,
    },
  });
}

function send(res, status, payload, asJson = true) {
  res.statusCode = status;
  if (payload == null) return res.end();
  if (!asJson) return res.end(payload);
  if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json; charset=utf-8');
  return res.end(JSON.stringify(payload));
}

function sendBinary(res, status, buffer, contentType) {
  res.statusCode = status;
  res.setHeader('content-type', contentType || 'application/octet-stream');
  return res.end(buffer);
}

function setDefaultHeaders(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type, authorization');
  res.setHeader('cache-control', 'no-store');
}

function buildPwaManifest(store) {
  return {
    name: configText(store, 'manifest.name', 'Ripple for Clover Medicare Advantage'),
    short_name: configText(store, 'manifest.short_name', 'Ripple Clover'),
    start_url: configText(store, 'manifest.start_url', './index.html'),
    scope: '/',
    id: '/index.html',
    display: configDisplay(store, 'manifest.display', 'standalone'),
    background_color: configText(store, 'manifest.background_color', '#05060a'),
    theme_color: configText(store, 'manifest.theme_color', '#05060a'),
    description: 'Ripple performance arena for Clover Health Medicare Advantage telesales and enrollment.',
    icons: [
      manifestIcon(store, 192, '/icons/icon-192.png'),
      manifestIcon(store, 512, '/icons/icon-512.png'),
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

function configText(store, key, fallback) {
  const value = store.getConfigValue(key);
  const text = value == null ? '' : String(value).trim();
  return text || fallback;
}

function configDisplay(store, key, fallback) {
  const display = configText(store, key, fallback);
  return ['fullscreen', 'standalone', 'minimal-ui', 'browser'].includes(display) ? display : fallback;
}

function manifestIcon(store, size, fallbackSrc) {
  const configured = pwaIconMetadata(store, size);
  return {
    src: configured ? `/api/pwa/icons/${size}.png?v=${encodeURIComponent(configured.version)}` : fallbackSrc,
    sizes: `${size}x${size}`,
    type: 'image/png',
    purpose: 'any',
  };
}

function pwaIconMetadata(store, size) {
  const value = store.getConfigValue(`pwa.icon.${size}`);
  if (!value || typeof value !== 'object' || !value.src) return null;
  return {
    src: String(value.src),
    version: value.uploadedAt || value.filename || size,
  };
}

function pwaIconFromConfig(store, size) {
  const metadata = pwaIconMetadata(store, size);
  if (!metadata) return null;
  const match = metadata.src.match(/^data:image\/png;base64,(.+)$/);
  if (!match) return null;
  return { buffer: Buffer.from(match[1], 'base64') };
}

function buildEndpointHealth(settings) {
  const checkedAt = new Date().toISOString();
  return settings
    .filter((row) => row.Config_Key === 'api.baseUrl' || /^integrations\./.test(row.Config_Key))
    .map((row) => {
      const value = typeof row.Config_Value === 'string' ? row.Config_Value.trim() : '';
      const valid = isUsableEndpoint(value);
      return {
        key: row.Config_Key,
        label: endpointLabel(row.Config_Key),
        url: value,
        status: valid ? 'green' : 'red',
        checkedAt,
        message: valid ? 'Endpoint format accepted' : 'Missing or invalid endpoint URL',
      };
    });
}

function isUsableEndpoint(value) {
  if (!value) return false;
  if (value.startsWith('/')) return true;
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch (error) {
    return false;
  }
}

function endpointLabel(key) {
  return String(key)
    .replace(/^api\./, 'API ')
    .replace(/^integrations\./, '')
    .replace(/Url$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toCsv(rows) {
  const columns = ['Log_ID', 'Admin_UserID', 'Action_Type', 'Entity_Affected', 'Record_ID', 'Timestamp', 'IP_Address', 'Before_Snapshot', 'After_Snapshot'];
  const lines = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function csvCell(value) {
  const text = value == null ? '' : (typeof value === 'object' ? JSON.stringify(value) : String(value));
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

module.exports = {
  createApi,
  createServer,
};
