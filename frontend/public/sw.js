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
  // Bypass the HTTP cache as well — default fetch() can still serve a
  // stale api.js / page after a Docker rebuild (Last-Modified heuristics),
  // which left AI chat calling API.ai on an old client bundle.
  event.respondWith(fetch(event.request, { cache: 'no-store' }));
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = data.title || 'Personal Finance';
  const icon = new URL('/assets/icons/icon-192.svg', self.location.origin).href;
  const badge = new URL('/assets/icons/favicon.svg', self.location.origin).href;
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon,
    badge,
    tag: data.tag || undefined,
    timestamp: Date.now(),
    requireInteraction: false,
    data: { url: data.url || '/pages/dashboard.html' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/pages/dashboard.html';
  event.waitUntil(self.clients.openWindow(url));
});
