// Service Worker disabled for development
// No caching - always fetch fresh content

self.addEventListener('install', event => {
  // Skip waiting immediately
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Delete all old caches
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // Always fetch from network, never cache
  // This ensures you always get the latest files during development
  event.respondWith(fetch(event.request));
});
