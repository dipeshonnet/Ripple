# Schema Validation Notes

This folder implements the BRD v2 production database schema only. It does not add UI or runtime data access.

## Source Alignment

- Controlling BRD: `Performance_Arena_Clover_Medicare_BRD_Screen_By_Screen_v2.docx`
- Current source package: `data.js`
- Operational entities covered: all 36 entities exposed by `window.SEED_DATA`
- Control entities covered: `Import_Log`, `App_Config`, `Feature_Flags`, `Admin_Audit_Log`

The SQL uses PostgreSQL lower_snake_case identifiers. Import templates should keep the BRD/source entity and column labels, then map them to these database columns during validation/commit.

Two learning fields in the current source use badge names rather than badge IDs: `Learning_Modules.Badge_Unlock` and `Learning_Completion_Status.Badge_Earned`. The schema keeps those columns importable by enforcing them against unique `badges.badge_name`; ID-based badge award relationships still use `badge_id`.

## Import Validation Contract

Before any entity rows are written, the Dataset Manager/API should validate:

- worksheet/entity name is allowed by `App_Config`
- mandatory columns exist for the target entity
- primary key columns are present and unique within the upload
- value types match the schema
- foreign-key values exist or are in the same transaction batch
- status, role, RAG, scope, direction, and boolean values match CHECK constraints
- BRD guardrails such as active-user/team scoping, non-overlapping SLA slabs, and no partial commit on failure

Every upload attempt, including validation failures, must insert an `import_log` row. Successful commits should stamp changed rows with `import_id`, `source_row_number`, and `source_hash`.

## Lifecycle Columns

The schema includes explicit `is_active` flags where BRD v2 requires deactivation, retirement, or active/inactive filtering:

- `users`, `teams`
- `kpi_master`
- `missions`, `challenges`, `badges`, `rewards`, `learning_points_rules`
- `learning_modules`, `pkt_assessments`
- `sla_commercial_rules`, `penalty_reward_slabs`
- `app_config`

Feature flags use `enabled` instead of `is_active` because the BRD names the toggle as `Enabled`.

## Automated Checks

Run:

```cmd
node database\schema_validation.test.js
```

The test checks that all source entities and control entities exist in `schema.sql`, that each table has a primary key, timestamp support, expected lifecycle columns, key foreign keys, import/audit support, and role/scoped indexes.
