const CACHE = 'folio-v87';
const APP_SHELL = ['/', '/index.html', '/sw.js'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  if (req.method !== 'GET') return;

  // Niemals app7.js / style6.css cachen
  if (
    url.pathname.endsWith('/app7.js') ||
    url.pathname.endsWith('/style6.css') ||
    url.pathname.includes('app7.js?v=') ||
    url.pathname.includes('style6.css?v=')
  ) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  // Navigation: network first
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(resp => {
          const copy = resp.clone();
          caches.open(CACHE).then(cache => cache.put('/index.html', copy));
          return resp;
        })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Für den kleinen Rest: network first, fallback cache
  event.respondWith(
    fetch(req)
      .then(resp => {
        if (resp && resp.status === 200 && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE).then(cache => cache.put(req, copy));
        }
        return resp;
      })
      .catch(() => caches.match(req))
  );
});
