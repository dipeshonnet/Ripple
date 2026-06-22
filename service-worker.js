/* eslint-disable */
const APP_VERSION = '2026-06-22-module-split';
const CACHE_PREFIX = 'ripple-clover-medicare';
const STATIC_CACHE = `${CACHE_PREFIX}-static-${APP_VERSION}`;
const RUNTIME_CACHE = `${CACHE_PREFIX}-runtime-${APP_VERSION}`;
const CDN_CACHE = `${CACHE_PREFIX}-cdn-${APP_VERSION}`;

const ADMIN_SHELL = './admin/index.html';
const MAIN_SHELL = './index.html';
const STATIC_MANIFEST = './manifest.webmanifest';
const PWA_MANIFEST = '/api/pwa/manifest.webmanifest';

const APP_SHELL = [
  './',
  MAIN_SHELL,
  './styles.css',
  './data.js',
  './data-service.js',
  './pwa-runtime.js',
  './app-core-state.js',
  './app-core.js',
  './app-views-agent-helpers.js',
  './app-views-agent-home.js',
  './app-views-agent.js',
  './app-views-lead-mgr-helpers.js',
  './app-views-lead-mgr.js',
  './app-modals.js',
  ADMIN_SHELL,
  './admin/admin-dashboard.js',
  './admin/admin-app.js',
  STATIC_MANIFEST,
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

const CDN_ASSETS = [
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest/dist/umd/lucide.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Space+Grotesk:wght@500;600;700&display=swap',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const staticCache = await caches.open(STATIC_CACHE);
    await staticCache.addAll(APP_SHELL);

    const cdnCache = await caches.open(CDN_CACHE);
    await Promise.allSettled(CDN_ASSETS.map((url) => fetchAndCache(cdnCache, url)));
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && ![STATIC_CACHE, RUNTIME_CACHE, CDN_CACHE].includes(key))
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin && url.pathname === PWA_MANIFEST) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE, STATIC_MANIFEST));
    return;
  }

  if (url.origin === self.location.origin && /^\/api\/pwa\/icons\/\d+\.png$/.test(url.pathname)) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE, staticIconFallback(url.pathname)));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(navigationResponse(request));
    return;
  }

  if (isDocumentedCdn(url)) {
    event.respondWith(staleWhileRevalidate(request, CDN_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  }
});

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    return await caches.match(shellForUrl(new URL(request.url)));
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    return await caches.match(shellForUrl(new URL(request.url)));
  }
}

async function networkFirst(request, cacheName, fallbackUrl) {
  try {
    const response = await fetch(request);
    if (isCacheable(response)) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (error) {
    return await caches.match(request) || await caches.match(fallbackUrl);
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const update = fetchAndCache(cache, request);
  if (cached) {
    update.catch(() => {});
    return cached;
  }
  return update;
}

async function fetchAndCache(cache, request) {
  const response = await fetch(request);
  if (isCacheable(response)) {
    cache.put(request, response.clone()).catch(() => {});
  }
  return response;
}

function isCacheable(response) {
  return response && (response.ok || response.type === 'opaque');
}

function shellForUrl(url) {
  return url.pathname.startsWith('/admin') ? ADMIN_SHELL : './index.html';
}

function staticIconFallback(pathname) {
  return pathname.includes('/512.png') ? './icons/icon-512.png' : './icons/icon-192.png';
}

function isDocumentedCdn(url) {
  return url.hostname === 'cdn.tailwindcss.com'
    || url.hostname === 'unpkg.com'
    || url.hostname === 'cdn.jsdelivr.net'
    || url.hostname === 'fonts.googleapis.com'
    || url.hostname === 'fonts.gstatic.com';
}
