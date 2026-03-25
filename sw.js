const CACHE = 'folio-v111';

self.addEventListener('install', event => {
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

  // Niemals cachen: app7.js, style6.css, index.html — immer frisch vom Server
  if (
    url.pathname.endsWith('/app7.js') ||
    url.pathname.endsWith('/style6.css') ||
    url.pathname.endsWith('/index.html') ||
    url.pathname === '/' ||
    url.pathname.includes('app7.js?v=') ||
    url.pathname.includes('style6.css?v=')
  ) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  // Für alles andere: network first, fallback cache
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
