/* eslint-disable */
(function () {
  'use strict';

  const state = {
    deferredInstallPrompt: null,
    reloadingForUpdate: false,
    registration: null,
    statusKind: navigator.onLine ? 'ready' : 'offline',
  };

  function serviceWorkerUrl() {
    return window.location.pathname.includes('/admin/')
      ? '../service-worker.js'
      : './service-worker.js';
  }

  function ensureRoot() {
    let root = document.getElementById('pwa-status-root');
    if (root) return root;
    root = document.createElement('div');
    root.id = 'pwa-status-root';
    root.className = 'pwa-status-root';
    root.setAttribute('aria-live', 'polite');
    root.innerHTML = `
      <div class="pwa-status-chip" data-pwa-status-kind="ready">
        <span class="pwa-status-dot" aria-hidden="true"></span>
        <span data-pwa-status-label>Online</span>
      </div>
      <button type="button" class="pwa-action pwa-install-action" data-pwa-action="install" hidden>
        <span>Install</span>
      </button>
      <button type="button" class="pwa-action pwa-update-action" data-pwa-action="update" hidden>
        <span>Update</span>
      </button>
    `;
    document.body.appendChild(root);
    root.addEventListener('click', onActionClick);
    refreshIcons();
    return root;
  }

  function setStatus(kind, label) {
    state.statusKind = kind || state.statusKind;
    const root = ensureRoot();
    const chip = root.querySelector('.pwa-status-chip');
    const text = root.querySelector('[data-pwa-status-label]');
    if (chip) chip.dataset.pwaStatusKind = state.statusKind;
    if (text) text.textContent = label || statusLabel(state.statusKind);
  }

  function statusLabel(kind) {
    if (kind === 'offline') return 'Offline';
    if (kind === 'cached') return 'Cached';
    if (kind === 'syncing') return 'Syncing';
    if (kind === 'conflict') return 'Conflict';
    if (kind === 'update') return 'Update ready';
    return 'Online';
  }

  function showInstallAction(show) {
    const btn = ensureRoot().querySelector('[data-pwa-action="install"]');
    if (btn) btn.hidden = !show;
  }

  function showUpdateAction(registration) {
    state.registration = registration || state.registration;
    const btn = ensureRoot().querySelector('[data-pwa-action="update"]');
    if (btn) btn.hidden = false;
    setStatus('update', 'Update ready');
  }

  async function onActionClick(event) {
    const action = event.target.closest('[data-pwa-action]')?.dataset?.pwaAction;
    if (!action) return;
    if (action === 'install') {
      await promptInstall();
      return;
    }
    if (action === 'update') {
      applyUpdate();
    }
  }

  async function promptInstall() {
    const prompt = state.deferredInstallPrompt;
    if (!prompt) return;
    state.deferredInstallPrompt = null;
    showInstallAction(false);
    try {
      prompt.prompt();
      await prompt.userChoice;
    } catch (error) {
      // Browser install prompts can be dismissed or unavailable after a route change.
    }
  }

  function applyUpdate() {
    const waiting = state.registration && state.registration.waiting;
    if (waiting) {
      waiting.postMessage({ type: 'SKIP_WAITING' });
      return;
    }
    window.location.reload();
  }

  function isInstalledDisplay() {
    return window.matchMedia?.('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
  }

  function wireInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      state.deferredInstallPrompt = event;
      if (!isInstalledDisplay()) showInstallAction(true);
    });
    window.addEventListener('appinstalled', () => {
      state.deferredInstallPrompt = null;
      showInstallAction(false);
      setStatus(navigator.onLine ? 'ready' : 'offline', navigator.onLine ? 'Installed' : 'Offline');
    });
  }

  function wireNetworkStatus() {
    window.addEventListener('online', () => setStatus('ready', 'Online'));
    window.addEventListener('offline', () => setStatus('offline', 'Offline'));
    setStatus(navigator.onLine ? 'ready' : 'offline', navigator.onLine ? 'Online' : 'Offline');
  }

  function wireDataStatus() {
    window.addEventListener('arena:data-status', (event) => {
      const detail = event.detail || {};
      const status = String(detail.status || '').toLowerCase();
      const source = String(detail.source || '').toLowerCase();
      if (status === 'pending') setStatus('syncing', 'Sync pending');
      else if (status === 'conflict') setStatus('conflict', 'Sync conflict');
      else if (status === 'cached' || source === 'indexeddb') setStatus('cached', 'Cached');
      else if (status === 'fallback') setStatus('cached', 'Seed fallback');
      else if (status === 'synced' || status === 'ready') setStatus(navigator.onLine ? 'ready' : 'offline', navigator.onLine ? 'Synced' : 'Offline');
    });
    window.addEventListener('arena:data-synced', () => setStatus(navigator.onLine ? 'ready' : 'offline', navigator.onLine ? 'Synced' : 'Offline'));
    window.addEventListener('arena:data-conflict', () => setStatus('conflict', 'Sync conflict'));
  }

  async function wireManifestFallback() {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link || !link.href.includes('/api/pwa/manifest.webmanifest')) return;
    try {
      const response = await fetch(link.href, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const contentType = response.headers.get('content-type') || '';
      if (!/json|manifest/i.test(contentType)) await response.clone().json();
    } catch (error) {
      link.href = window.location.pathname.includes('/admin/')
        ? '../manifest.webmanifest'
        : './manifest.webmanifest';
    }
  }

  async function hydrateDataStatus() {
    const service = window.ArenaDataService;
    if (!service || typeof service.getAllSyncStatuses !== 'function') return;
    try {
      const rows = await service.getAllSyncStatuses();
      const workflow = (rows || []).find((row) => row.key === 'workflow');
      if (workflow) {
        window.dispatchEvent(new CustomEvent('arena:data-status', { detail: workflow }));
      }
    } catch (error) {
      // Status hydration is non-critical; the live data-service events keep updating.
    }
  }

  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    try {
      const registration = await navigator.serviceWorker.register(serviceWorkerUrl());
      state.registration = registration;
      if (registration.waiting && navigator.serviceWorker.controller) showUpdateAction(registration);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateAction(registration);
          }
        });
      });
    } catch (error) {
      console.warn('Ripple service worker registration failed', error);
    }

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (state.reloadingForUpdate) return;
      state.reloadingForUpdate = true;
      window.location.reload();
    });
  }

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.8 } });
  }

  function boot() {
    ensureRoot();
    wireNetworkStatus();
    wireInstallPrompt();
    wireDataStatus();
    wireManifestFallback();
    registerServiceWorker();
    setTimeout(hydrateDataStatus, 600);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  window.RipplePwaRuntime = {
    get registration() { return state.registration; },
    get statusKind() { return state.statusKind; },
    setStatus,
  };
})();
