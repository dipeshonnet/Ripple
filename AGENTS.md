# Repository Guide

## Working Directory

Use this nested project as the Git repository root:

`C:\Users\dipeshd\Downloads\VSCode\Ripple\ripple-clover-medicare-v5-tl-manager-fix-full-source`

The parent `Ripple` folder can contain BRD documents, rendered output, and a non-functional root `.git`; do not treat it as the application repo.

## Application Shape

- Main PWA entrypoint: `index.html`
- Admin entrypoint: `admin/index.html`
- API server entrypoint: `api/server.js`
- Core browser globals: `app-core.js`, `app-views-agent.js`, `app-views-lead-mgr.js`, `app-modals.js`
- Admin browser globals: `admin/admin-app.js`
- REST API implementation: `api/app.js`, `api/store.js`, `api/entity-metadata.js`
- Browser data access layer: `data-service.js`
- PWA support: `pwa-runtime.js`, `service-worker.js`, `manifest.webmanifest`

This is a script-tag based app with browser globals, not a bundled npm/Vite project. Prefer small, targeted changes that preserve the current load order unless a broader migration is explicitly requested.

## Large File Guidance

Avoid opening these files wholesale in agent context:

- `data.js` is multi-megabyte seed/runtime data.
- `data.before_excel_roundtrip.js` is a large backup data snapshot.
- `Performance_Arena_Dataset.xlsx` is a binary workbook source.

Use `rg`, targeted line reads, schema docs, or focused scripts when investigating data behavior. Do not manually edit generated or bulk data files unless the task specifically requires it.

## Useful Commands

Run from the nested repo root:

```powershell
node test_prototype.js
node --test api/api.smoke.test.js
node --test data-service.test.js
node api\server.js
```

The batch files `test.bat` and `test_app.bat` wrap `node test_prototype.js`.

## Git Hygiene

- Check `git status -sb --untracked-files=all` before editing.
- Preserve unrelated user changes; do not revert dirty files unless the user explicitly asks.
- Stage explicit paths when the working tree is mixed.
- Keep generated runtime state out of commits; `api/.local-store.json`, caches, logs, and build output are ignored.
- Watch for line-ending churn. Git may warn that LF will be replaced by CRLF on touched files.
