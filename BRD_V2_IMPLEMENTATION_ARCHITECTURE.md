# BRD v2 Implementation Architecture

Status: Accepted for implementation planning

Controlling source: `Performance_Arena_Clover_Medicare_BRD_Screen_By_Screen_v2.docx`

Scope: architecture decisions and task map only. No code changes are part of this document.

## ADR

### Context

The current package is a no-build static prototype with `index.html`, vanilla JavaScript modules, `data.js` seed data, a web manifest, and a service worker. Runtime mutations currently live in browser storage.

BRD v2 changes the implementation target:

- All entity data must be configurable through the Admin Control Centre.
- Offline-first browser state must use IndexedDB.
- Production persistence must use a REST API backed by PostgreSQL.
- Admin functions must be reachable from a dedicated `/admin` route.
- Import, configuration, feature-flag, and audit entities are first-class data.

### Decision 1: Keep the frontend no-build and static

The frontend remains a static PWA using plain HTML, CSS, and JavaScript. There is no bundler, framework migration, or compile step in the BRD v2 implementation path.

Implementation implications:

- Preserve direct browser-loadable files.
- Keep CDN dependencies only where they already fit the static model.
- Use browser-native modules or existing script loading patterns.
- Require static-host fallback routing so `/admin` serves the admin entry point.

### Decision 2: Use IndexedDB for offline cache and local state

IndexedDB becomes the browser persistence layer for entity cache, mutation queue, import drafts, and user session-adjacent app state. `localStorage` should be limited to small non-authoritative preferences or retired where feasible.

IndexedDB stores should cover:

- Entity snapshots for all BRD Section 4 datasets.
- Pending mutations and sync metadata.
- Import draft workbooks, validation results, and commit previews.
- App configuration and feature flags needed before API sync completes.
- Audit events queued while offline.

Conflict policy:

- PostgreSQL is the production source of truth.
- IndexedDB records carry server version, updated timestamp, dirty flag, and last sync status.
- Offline writes are queued and reconciled through the REST API.
- Admin configuration writes require server confirmation before being treated as published.

### Decision 3: Use REST API plus PostgreSQL for production persistence

The production backend is a REST API backed by PostgreSQL. The static PWA never writes directly to PostgreSQL.

API responsibilities:

- Authenticate users and enforce role-based access.
- Read/write BRD entities.
- Validate and commit imports transactionally.
- Publish configuration and feature flags.
- Record admin audit events with before/after snapshots.
- Expose health and freshness endpoints for the Admin Control Centre.

PostgreSQL responsibilities:

- Store normalized operational entities.
- Enforce primary keys, required fields, unique keys, foreign keys, and status constraints.
- Maintain import history, config versions, feature flags, and audit log.
- Support rollback/revert for imports and settings where BRD v2 requires reversibility.

### Decision 4: Add a dedicated `/admin` route

Admin functionality is separated from agent, team lead, and manager navigation under `/admin`.

Route behavior:

- Unauthenticated access redirects to login.
- Non-admin users are blocked from admin modules.
- Admin users land on the Control Centre Dashboard.
- Deep links under `/admin` map to Admin Control Centre modules.

Static hosting requirement:

- `/admin` and `/admin/*` must resolve to the admin PWA entry point or to the shared app shell with admin route bootstrap.

### Decision 5: Implement Admin Control Centre modules from BRD v2

The Admin Control Centre contains these modules:

- Control Centre Dashboard: platform health, data freshness, import queue depth, KPI count, alerts, pending approvals, and quick-launch cards.
- Dataset Manager: entity tab strip, Excel upload, schema validation, diff preview, commit/cancel, template download, import history, and version revert.
- KPI Manager: KPI definition, thresholds, targets, direction, role visibility, effective dates, retire/publish, and impact preview.
- User & Team Management: users, roles, teams, reporting lines, activation status, roster import/export.
- Gamification Configuration: missions, challenges, badges, rewards, points, levels, redemption rules, and publish workflow.
- SLA & Commercial Rules: SLA rules, commercial slabs, non-overlap validation, recomputation triggers, and publish audit.
- System Settings: app identity, PWA settings, feature flags, API endpoints, environment toggle, API health checks, and audit export.

### Decision 6: Treat control entities as first-class production tables

`Import_Log`

- Fields: `Import_ID`, `Entity_Name`, `Filename`, `Uploaded_By`, `Upload_Date`, `Row_Count`, `Mode`, `Status`, `Validation_Error_Count`, `Commit_Timestamp`.
- Records every upload attempt, including failed validation.
- Links to validation details and import version metadata.
- Supports replace/upsert modes and revert workflow.

`App_Config`

- Fields: `Config_ID`, `Config_Key`, `Config_Value`, `Value_Type`, `Description`, `Last_Modified_By`, `Last_Modified_Date`.
- Stores typed settings for app identity, PWA settings, API endpoints, environment, allowed import entities, and operational settings.
- Requires versioning/reversibility for published settings changes.

`Feature_Flags`

- Fields: `Flag_ID`, `Flag_Key`, `Flag_Label`, `Enabled`, `Scope`, `Modified_By`, `Modified_Date`.
- Supports `All`, `Role`, and `Team` scope.
- Controls feature availability without deployment.
- Every change is audited.

`Admin_Audit_Log`

- Fields: `Log_ID`, `Admin_UserID`, `Action_Type`, `Entity_Affected`, `Record_ID`, `Before_Snapshot`, `After_Snapshot`, `Timestamp`, `IP_Address`.
- Captures all admin publish, import, configuration, feature flag, environment, and revert actions.
- Must support search, filter, and CSV export from System Settings.

### Decision 7: Import workflow is transactional

The Dataset Manager import flow is:

1. Select entity or workbook.
2. Upload `.xlsx`.
3. Parse workbook and map worksheet/entity.
4. Validate required columns, types, references, uniqueness, and entity-specific business rules.
5. Write `Import_Log` attempt before commit outcome is final.
6. Show validation errors and diff preview.
7. Commit as one transaction or cancel with no entity writes.
8. Write final import status, row counts, validation error count, and commit timestamp.
9. Queue/sync IndexedDB cache refresh.

Failures never partially update production entities.

### Decision 8: Admin changes are audited and guarded

All admin mutations must be role-checked and auditable.

Minimum controls:

- Admin role required for `/admin`.
- Publish actions require server-side authorization.
- Production environment toggle requires two-factor admin confirmation.
- Feature flag and config changes write before/after snapshots.
- SLA rule publish validates non-overlapping slabs before save.
- PWA icon uploads validate required dimensions before publish.

## Target Runtime Shape

```text
Static PWA
  index.html
  /admin
  service-worker.js
  manifest.webmanifest
        |
        v
Browser services
  IndexedDB entity cache
  IndexedDB mutation queue
  IndexedDB import drafts
        |
        v
REST API
  auth/session
  entities
  imports
  config
  feature-flags
  audit
  health
        |
        v
PostgreSQL
  BRD entities
  Import_Log
  App_Config
  Feature_Flags
  Admin_Audit_Log
```

## Task Map For Later Prompts

1. Current-state audit
   - Inventory existing routes, state writes, seed entities, service worker cache behavior, and test coverage.
   - Output a minimal migration checklist from `localStorage`/`data.js` toward IndexedDB plus API-backed data.

2. IndexedDB foundation
   - Add an IndexedDB adapter for entity snapshots, app state, sync queue, import drafts, and audit queue.
   - Migrate current browser mutation state behind a storage service without changing visible behavior.
   - Add tests for schema creation, read/write, migration, and reset.

3. Static routing and `/admin` shell
   - Add `/admin` static route support and admin bootstrap without introducing a build step.
   - Add role guard placeholders and admin navigation frame.
   - Verify direct `/admin` load, refresh, and deep-link behavior.

4. Admin Control Centre Dashboard
   - Build dashboard cards for user count, freshness, KPI count, import queue, alerts, coaching, and pending redemptions.
   - Source data from the storage service first, with API-ready seams.

5. Control entity data model
   - Add frontend entity definitions for `Import_Log`, `App_Config`, `Feature_Flags`, and `Admin_Audit_Log`.
   - Define validation metadata, primary keys, labels, and admin grid columns.

6. REST API contract
   - Specify endpoints, request/response shapes, error model, pagination, auth assumptions, and sync semantics.
   - Cover entities, imports, config, feature flags, audit, health, and authentication.

7. PostgreSQL schema plan
   - Create migration design for BRD entities plus control tables.
   - Include keys, constraints, indexes, JSON snapshot fields, import versioning, and audit retention.

8. Dataset Manager
   - Implement entity tabs, `.xlsx` upload, schema validation, diff preview, commit/cancel, template download, import history, and revert.
   - Ensure failed uploads still create `Import_Log` entries.

9. Admin configuration modules
   - Implement KPI Manager, User & Team Management, Gamification Configuration, SLA & Commercial Rules, and System Settings.
   - Enforce publish validation and audit logging for each module.

10. Sync and production mode
    - Add API client, sync queue processing, freshness metadata, health checks, and environment switch behavior.
    - Keep offline IndexedDB behavior usable when API is unavailable.

11. Security and audit hardening
    - Add auth integration, admin role enforcement, two-factor confirmation hook, IP capture contract, and audit export.
    - Add negative-path tests for unauthorized admin access and audit omissions.

12. Regression and acceptance
    - Extend the existing test harness for IndexedDB, admin route, admin modules, import validation, feature flags, audit log, and API-client failure modes.
    - Add PWA smoke checks for service worker, manifest, offline launch, and `/admin` route refresh.
