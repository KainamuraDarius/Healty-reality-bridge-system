// Service worker: lets the app open and work with NO internet after the first visit.
//
// App files: tried on the network first (so a new upload is picked up straight away), but if
// the network has not answered within 4 seconds, or there is no internet, the saved copy is used.
// After one slow or failed answer, the saved copies are used straight away for the next minute
// (and quietly refreshed in the background), so a weak connection costs 4 seconds once, not per file.
// Fonts: saved the first time they load, then used from the copy.
// The API (api/...) is never cached - the sync talks to the server directly.
//
// When you add, rename or remove a file: update PRECACHE below AND bump CACHE_NAME.
const CACHE_NAME = 'rhb-cache-v24';
const FONT_CACHE = 'rhb-fonts-v1';
const NETWORK_TIMEOUT_MS = 4000;
const SLOW_MODE_MS = 60 * 1000;
let slowUntil = 0; // while Date.now() < slowUntil, saved copies are served first

// Every file the app needs to open offline (keep in sync with index.html).
const PRECACHE = [
  './',
  './index.html',
  './manifest.json',
  './config.js',
  './assets/img/logo.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './css/tokens.css',
  './css/base.css',
  './css/components.css',
  './css/layout.css',
  './css/pages.css',
  './css/landing.css',
  './css/print.css',
  './js/theme-boot.js',
  './js/core/brand.js',
  './js/vendor/dexie.min.js',
  './js/core/crypto.js',
  './js/core/utils.js',
  './js/core/localdb.js',
  './js/core/storage.js',
  './js/core/state.js',
  './js/core/ipno.js',
  './js/ui/icons.js',
  './js/ui/blocks.js',
  './js/ui/chrome.js',
  './js/ui/toast.js',
  './js/ui/modal.js',
  './js/ui/password-field.js',
  './js/ui/combobox.js',
  './js/domain/accounts.js',
  './js/domain/stock.js',
  './js/domain/finance.js',
  './js/domain/catalog.js',
  './js/domain/facility.js',
  './js/services/google-drive.js',
  './js/services/backup.js',
  './js/services/sync.js',
  './js/services/public-info.js',
  './js/services/registration.js',
  './js/services/license.js',
  './js/services/payments.js',
  './js/components/packages-pay.js',
  './js/components/facility-docs.js',
  './js/components/receipts.js',
  './js/components/sales-search.js',
  './js/pages/landing.js',
  './js/pages/auth.js',
  './js/pages/facility-setup.js',
  './js/pages/lock-screens.js',
  './js/pages/dashboard.js',
  './js/pages/stock-in.js',
  './js/pages/sell.js',
  './js/pages/inventory.js',
  './js/pages/sales-log.js',
  './js/pages/expiry.js',
  './js/pages/reports.js',
  './js/pages/team.js',
  './js/pages/finance.js',
  './js/pages/system.js',
  './js/pages/settings.js',
  './js/app/shell.js',
  './js/main.js'
];

self.addEventListener('install', (e) => {
  // Save each file on its own, so one missing file cannot stop the rest from being saved.
  e.waitUntil(caches.open(CACHE_NAME).then((c) =>
    Promise.all(PRECACHE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch((err) => console.warn('Not cached:', u, err))))
  ));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== FONT_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function fromNetworkWithTimeout(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('slow network')), NETWORK_TIMEOUT_MS);
    fetch(request).then((res) => { clearTimeout(timer); resolve(res); }, (err) => { clearTimeout(timer); reject(err); });
  });
}

async function appFile(request, isPage) {
  const cache = await caches.open(CACHE_NAME);
  const key = isPage ? './index.html' : request;
  const savedCopy = async () => isPage
    ? (await cache.match('./index.html')) || (await cache.match('./'))
    : (await cache.match(request, { ignoreSearch: true }));
  const refresh = () => fetch(request).then((res) => {
    if (res && res.ok) { cache.put(key, res.clone()).catch(() => {}); slowUntil = 0; }
    return res;
  });

  if (Date.now() < slowUntil) {                 // connection known to be slow/offline right now
    const saved = await savedCopy();
    if (saved) { refresh().catch(() => {}); return saved; }
  }
  try {
    const res = await fromNetworkWithTimeout(request);
    if (res && res.ok) cache.put(key, res.clone()).catch(() => {});
    return res;
  } catch (err) {
    slowUntil = Date.now() + SLOW_MODE_MS;
    const saved = await savedCopy();
    if (saved) return saved;
    // Nothing saved yet and the network is slow: keep waiting for it instead of failing.
    return fetch(request);
  }
}

async function fontFile(request) {
  const cache = await caches.open(FONT_CACHE);
  const saved = await cache.match(request);
  if (saved) return saved;
  const res = await fetch(request);
  if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()).catch(() => {});
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(fontFile(req));
    return;
  }
  if (url.origin !== location.origin) return;                 // Google sign-in etc.: browser handles it
  const scopePath = new URL(self.registration.scope).pathname;
  const rel = url.pathname.slice(scopePath.length);
  if (rel.startsWith('api/') || url.pathname.startsWith('/.netlify/')) return; // server calls: never cached

  const isPage = req.mode === 'navigate';
  e.respondWith(appFile(req, isPage));
});
