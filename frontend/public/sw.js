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
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow('/pages/dashboard.html'));
});
