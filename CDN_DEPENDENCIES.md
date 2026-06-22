# CDN Dependencies

The prototype is a no-build static app per the BRD runtime requirement. The following CDN assets are production dependencies and are cached by `service-worker.js` in the versioned CDN cache:

- Tailwind runtime: `https://cdn.tailwindcss.com`
- Lucide icons: `https://unpkg.com/lucide@latest/dist/umd/lucide.js`
- Admin Excel import/export: `https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js`
- Google Fonts CSS and font files from `fonts.googleapis.com` and `fonts.gstatic.com`

The app shell remains usable offline after first successful load. CDN caching is best-effort during service-worker install and refreshed with a stale-while-revalidate strategy at runtime.
