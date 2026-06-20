const CACHE_NAME = 'ripple-clover-medicare-v5-admin';
const ADMIN_SHELL = './admin/index.html';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './data.js',
  './data-service.js',
  './app-core.js',
  './app-views-agent.js',
  './app-views-lead-mgr.js',
  './app-modals.js',
  ADMIN_SHELL,
  './admin/admin-app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;
  if (url.origin === self.location.origin && req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(response => {
        const copy = response.clone();
        if (response && response.status === 200) {
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return response;
      }).catch(() => caches.match(url.pathname.startsWith('/admin') ? ADMIN_SHELL : './index.html'))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(response => {
        const copy = response.clone();
        if (response && response.status === 200 && url.origin === self.location.origin) {
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
        }
        return response;
      }).catch(() => caches.match(url.pathname.startsWith('/admin') ? ADMIN_SHELL : './index.html'));
    })
  );
});
