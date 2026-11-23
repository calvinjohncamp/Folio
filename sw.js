// Retire the old Folio editor's offline cache while retaining browser documents.
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => /^folio-v[0-9]+$/.test(name)).map(name => caches.delete(name)));
    await self.registration.unregister();
    await self.clients.claim();
  })());
});
