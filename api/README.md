# Performance Arena REST API Skeleton

This folder adds the BRD v2 backend surface without changing the static PWA runtime.

Run the full local app, including the Admin Control Centre:

```cmd
node api\server.js
```

Then open:

- Main arena: `http://127.0.0.1:5174/`
- Admin Control Centre: `http://127.0.0.1:5174/admin`

The desktop launchers set `PORT=5173` and use this same server when Node.js is available.
The older Python static server can still load the main arena, but it cannot handle `/api/*`
and admin login will fail in static-only mode.

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
