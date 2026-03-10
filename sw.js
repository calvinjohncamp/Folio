const CACHE = 'folio-v36';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/app2.js',
  '/sw.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  // Network-first: always try network, fall back to cache
  e.respondWith(
    fetch(e.request).then(resp => {
      if(resp && resp.status === 200 && resp.type === 'basic'){
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
      }
      return resp;
    }).catch(() => caches.match(e.request).then(c => c || caches.match('/')))
  );
});
