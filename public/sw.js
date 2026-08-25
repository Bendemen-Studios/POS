const CACHE_NAME = 'bendemen-pos-v2';
const OFFLINE_URL = '/login';

// Pages that must be available for POS navigation, including the first
// navigation after an offline restart. Pages are cached when the user visits
// them and the shell is warmed during service-worker installation.
const APP_SHELL = [
  '/',
  '/login',
  '/select-store',
  '/pickup',
  '/admin',
  '/manifest.json',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(async (cache) => {
        // Do not fail the complete SW installation because one dynamic page
        // cannot be precached. Each page will still be cached on first visit.
        await Promise.allSettled(APP_SHELL.map(async (url) => {
          try {
            const response = await fetch(url, { cache: 'no-store' });
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

  // Never cache API calls. Offline data/synchronisation is handled by the app.
  if (url.pathname.startsWith('/api/')) return;

  // Next.js static assets can safely use cache-first. This also prevents a
  // transient network failure from breaking an already loaded POS shell.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }))
    );
    return;
  }

  // HTML navigation: network first so deployments are picked up immediately;
  // cache the successful document for offline navigation. If the network is
  // unavailable, use the exact cached route before falling back to login.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' })
        .then((response) => {
          if (response.ok && response.type !== 'opaqueredirect') {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request, { ignoreSearch: true });
          if (cached) return cached;

          const pathCached = await caches.match(url.pathname, { ignoreSearch: true });
          if (pathCached) return pathCached;

          return caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  // Other same-origin resources: cache-first with network fallback.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
