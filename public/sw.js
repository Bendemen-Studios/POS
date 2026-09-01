const CACHE_NAME = 'bendemen-pos-v16';
const OFFLINE_URL = '/login';
const NAVIGATION_TIMEOUT = 2500;
const API_TIMEOUT = 8000;
const PRODUCT_API_TIMEOUT = 5000;
const CHECKOUT_TIMEOUT = 10000;

// Alleen browser/PWA-cache. Geen preload of permanente cache op de VPS.
const APP_SHELL = ['/', '/login', '/select-store', '/pickup', '/admin', '/manifest.json', '/favicon.ico'];

const CACHEABLE_API_PREFIXES = [
  '/api/auth/store-selection',
  '/api/admin/users',
  '/api/woocommerce/products',
  '/api/woocommerce/customers',
  '/api/woocommerce/orders',
  '/api/woocommerce/pickup-order',
];

const STALE_WHILE_REVALIDATE_API = new Set([
  '/api/admin/users',
  '/api/woocommerce/customers',
  '/api/woocommerce/orders',
  '/api/woocommerce/pickup-order',
]);

function timeoutFetch(request, timeout = NAVIGATION_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(request, { cache: 'no-store', signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function cacheResponse(cache, request, response) {
  if (response && response.ok && response.type !== 'opaqueredirect') {
    try { await cache.put(request, response.clone()); } catch (_) {}
  }
  return response;
}

function isCacheableApi(pathname) {
  return CACHEABLE_API_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}?`));
}

async function refreshApiCache(request, timeout = API_TIMEOUT) {
  try {
    const response = await timeoutFetch(request, timeout);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return null;
  }
}

// ONLINE-FIRST: probeer altijd eerst de server. Alleen bij timeout/offline gebruiken we cache.
async function onlineFirstApi(request, timeout = API_TIMEOUT) {
  const fresh = await refreshApiCache(request, timeout);
  if (fresh) return fresh;

  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  return new Response(JSON.stringify({ success: false, offline: true, error: 'Server niet bereikbaar en geen lokale cache beschikbaar.' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

async function handleProductRequest(request) {
  // Online-first: nieuwe WooCommerce-productdata heeft altijd voorrang.
  const fresh = await refreshApiCache(request, PRODUCT_API_TIMEOUT);
  if (fresh) {
    const cache = await caches.open(CACHE_NAME);
    try { await cache.put('/api/woocommerce/products', fresh.clone()); } catch (_) {}
    return fresh;
  }

  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match('/api/woocommerce/products') || await cache.match(request);
  if (cached) return cached;

  return new Response(JSON.stringify({ success: false, offline: true, error: 'Server niet bereikbaar en geen lokale productcache beschikbaar.' }), {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

async function handleStaleApiRequest(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  // Deze minder kritieke datasets blijven snel beschikbaar; de server wordt tegelijk bijgewerkt.
  if (cached) {
    refreshApiCache(request, API_TIMEOUT).catch(() => {});
    return cached;
  }

  return onlineFirstApi(request, API_TIMEOUT);
}

async function handleServerStatusRequest(request) {
  try {
    return await timeoutFetch(request, 2500);
  } catch (_) {
    return new Response(JSON.stringify({ success: false, offline: true, error: 'POS-server offline of niet bereikbaar.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
    });
  }
}

async function handleCheckoutRequest(request) {
  try {
    return await timeoutFetch(request, CHECKOUT_TIMEOUT);
  } catch (_) {
    return new Response(JSON.stringify({ success: false, offline: true, queued: true, error: 'POS-server offline of niet bereikbaar. De bestelling wordt lokaal opgeslagen.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async cache => {
        // Alleen de noodzakelijke PWA-shell lokaal beschikbaar maken.
        // Er wordt niets op de VPS voorgepreload.
        await Promise.allSettled(APP_SHELL.map(async url => {
          try {
            const response = await timeoutFetch(url, 4000);
            if (response.ok) await cache.put(url, response);
          } catch (_) {}
        }));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.method === 'GET' && url.pathname === '/api/admin/store') {
    event.respondWith(handleServerStatusRequest(request));
    return;
  }

  if (request.method === 'GET' && url.pathname === '/api/woocommerce/products') {
    event.respondWith(handleProductRequest(request));
    return;
  }

  if (request.method === 'GET' && STALE_WHILE_REVALIDATE_API.has(url.pathname)) {
    event.respondWith(handleStaleApiRequest(request));
    return;
  }

  if (request.method === 'POST' && url.pathname === '/api/woocommerce/checkout') {
    event.respondWith(handleCheckoutRequest(request));
    return;
  }

  if (request.method !== 'GET') return;

  if (url.pathname.startsWith('/api/') && isCacheableApi(url.pathname)) {
    event.respondWith(onlineFirstApi(request, API_TIMEOUT));
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(cached => {
        if (cached) return cached;
        return fetch(request).then(async response => {
          const cache = await caches.open(CACHE_NAME);
          return cacheResponse(cache, request, response);
        });
      })
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request, { ignoreSearch: true }) || await cache.match(url.pathname, { ignoreSearch: true });

      // ONLINE-FIRST navigatie: de actuele site/VPS krijgt altijd voorrang.
      try {
        const response = await timeoutFetch(request, NAVIGATION_TIMEOUT);
        if (response.ok && response.type !== 'opaqueredirect') await cache.put(request, response.clone());
        return response;
      } catch (_) {
        // Alleen wanneer de server/site niet bereikbaar is, terugvallen op lokale PWA-cache.
        if (cached) return cached;
        const rootCached = await cache.match('/');
        if (rootCached) return rootCached;
        const loginCached = await cache.match(OFFLINE_URL);
        if (loginCached) return loginCached;
        return new Response('<!doctype html><html><body style="margin:0;background:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:Arial"><div style="text-align:center"><strong>BENDEMEN POS</strong><p>Offline modus wordt gestart...</p></div></body></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached;
      return fetch(request).then(async response => {
        const cache = await caches.open(CACHE_NAME);
        return cacheResponse(cache, request, response);
      });
    })
  );
});
