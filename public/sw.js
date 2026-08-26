const CACHE_NAME = 'bendemen-pos-v3';
const OFFLINE_URL = '/login';
const NAVIGATION_TIMEOUT = 2500;

const APP_SHELL = [
  '/',
  '/login',
  '/select-store',
  '/pickup',
  '/admin',
  '/manifest.json',
  '/favicon.ico',
];

function timeoutFetch(request, timeout = NAVIGATION_TIMEOUT) {
  return Promise.race([
    fetch(request, { cache: 'no-store' }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('NETWORK_TIMEOUT')), timeout)
    ),
  ]);
}

async function cacheResponse(cache, request, response) {
  if (response && response.ok && response.type !== 'opaqueredirect') {
    try {
      await cache.put(request, response.clone());
    } catch (_) {}
  }
  return response;
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
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => cacheResponse(caches.open(CACHE_NAME), request, response));
      })
    );
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);

      try {
        const response = await timeoutFetch(request);
        if (response.ok && response.type !== 'opaqueredirect') {
          await cache.put(request, response.clone());
        }
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
      return fetch(request).then((response) => cacheResponse(caches.open(CACHE_NAME), request, response));
    })
  );
});
