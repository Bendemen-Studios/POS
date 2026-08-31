const CACHE_NAME = 'bendemen-pos-v9';
const OFFLINE_URL = '/login';
const NAVIGATION_TIMEOUT = 3500;
const API_TIMEOUT = 4000;
const CHECKOUT_TIMEOUT = 10000;

const APP_SHELL = [
  '/',
  '/login',
  '/select-store',
  '/pickup',
  '/admin',
  '/manifest.json',
  '/favicon.ico',
];

// Alleen kleine, snel ladende GET-data valt terug op cache.
// Producten en afhaalorders mogen NIET door de 4s service-worker timeout,
// omdat deze endpoints batch/paginering gebruiken.
const CACHEABLE_API_PREFIXES = [
  '/api/auth/store-selection',
  '/api/woocommerce/customers',
  '/api/admin/users',
];

function timeoutFetch(request, timeout = NAVIGATION_TIMEOUT) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return fetch(request, { cache: 'no-store', signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function cacheResponse(cache, request, response) {
  if (response && response.ok && response.type !== 'opaqueredirect') {
    try { await cache.put(request, response.clone()); } catch (_) {}
  }
  return response;
}

function isCacheableApi(pathname) {
  return CACHEABLE_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}?`));
}

async function refreshApiCache(request) {
  try {
    const response = await timeoutFetch(request, API_TIMEOUT);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (_) {
    return null;
  }
}

async function handleServerStatusRequest(request) {
  try {
    return await timeoutFetch(request, 3000);
  } catch (_) {
    return new Response(
      JSON.stringify({ success: false, offline: true, error: 'POS-server offline of niet bereikbaar.' }),
      { status: 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
    );
  }
}

async function handleCheckoutRequest(request) {
  try {
    return await timeoutFetch(request, CHECKOUT_TIMEOUT);
  } catch (_) {
    return new Response(
      JSON.stringify({ success: false, offline: true, queued: true, error: 'POS-server offline of niet bereikbaar. De bestelling wordt lokaal opgeslagen.' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        await Promise.allSettled(APP_SHELL.map(async (url) => {
          try {
            const response = await timeoutFetch(url, 5000);
            if (response.ok) await cache.put(url, response);
          } catch (_) {}
        }));
      })
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (url.origin !== self.location.origin) return;

  // Status is altijd netwerk-only.
  if (request.method === 'GET' && url.pathname === '/api/admin/store') {
    event.respondWith(handleServerStatusRequest(request));
    return;
  }

  // Checkout is altijd netwerk-first en krijgt extra tijd.
  if (request.method === 'POST' && url.pathname === '/api/woocommerce/checkout') {
    event.respondWith(handleCheckoutRequest(request));
    return;
  }

  if (request.method !== 'GET') return;

  // Producten en pickup-orders vallen hier bewust NIET onder: laat hun echte
  // response volledig door, zodat batch/paginering langer dan 4s mag duren.
  if (url.pathname.startsWith('/api/')) {
    if (isCacheableApi(url.pathname)) {
      event.respondWith((async () => {
        const fresh = await refreshApiCache(request);
        if (fresh) return fresh;
        const cached = await caches.match(request);
        if (cached) return cached;
        return new Response(
          JSON.stringify({ success: false, offline: true, error: 'Offline en geen lokale cache beschikbaar.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      })());
      return;
    }
    event.respondWith(fetch(request));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then(async (response) => {
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
      try {
        const response = await timeoutFetch(request);
        if (response.ok && response.type !== 'opaqueredirect') await cache.put(request, response.clone());
        return response;
      } catch (_) {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        const pathCached = await caches.match(url.pathname, { ignoreSearch: true });
        if (pathCached) return pathCached;
        const rootCached = await caches.match('/');
        if (rootCached) return rootCached;
        const loginCached = await caches.match(OFFLINE_URL);
        if (loginCached) return loginCached;
        return new Response(
          '<!doctype html><html><body style="margin:0;background:#fff;display:flex;align-items:center;justify-content:center;height:100vh;font-family:Arial"><div style="text-align:center"><strong>BENDEMEN POS</strong><p>Offline modus wordt gestart...</p></div></body></html>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
      }
    })());
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then(async (response) => {
        const cache = await caches.open(CACHE_NAME);
        return cacheResponse(cache, request, response);
      });
    })
  );
});
