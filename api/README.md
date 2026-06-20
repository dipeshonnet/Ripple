# Performance Arena REST API Skeleton

This folder adds the BRD v2 backend surface without changing the static PWA runtime.

Run locally:

```cmd
node api\server.js
```

Useful smoke endpoints:

- `GET /api/health`
- `POST /api/auth/session` with `{ "userId": "ADMIN001" }`
- `GET /api/role-scope`
- `GET /api/entities`
- `GET /api/entities/Users`
- `POST /api/imports/validate`
- `POST /api/imports/commit`
- `GET /api/admin/dashboard`
- `GET /api/admin/kpis`
- `GET /api/admin/users`
- `GET /api/admin/teams`
- `GET /api/admin/gamification`
- `GET /api/admin/sla-rules`
- `GET /api/admin/settings`
- `GET /api/admin/audit-log`

Responses use `{ ok, data, meta }` and errors use `{ ok: false, error: { code, message, details } }`.
The default server persists to `api/.local-store.json`; tests use memory-only state.
