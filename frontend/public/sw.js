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
  const req = event.request;

  // Only handle same-origin GET requests ourselves. Letting the browser
  // handle everything else natively (cross-origin CDN scripts/fonts,
  // POST/PUT/DELETE API calls, the AI chat SSE stream, etc.) avoids turning
  // requests the service worker can't safely re-fetch — like a streaming
  // response body, or a cross-origin request blocked for reasons outside our
  // control — into unhandled promise rejections logged as "Failed to fetch".
  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (req.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Bypass the HTTP cache as well — default fetch() can still serve a
  // stale api.js / page after a Docker rebuild (Last-Modified heuristics),
  // which left AI chat calling API.ai on an old client bundle. Fall back to
  // a normal fetch if the no-store request itself fails (e.g. transient
  // network hiccup) instead of failing the whole request.
  event.respondWith(
    fetch(req, { cache: 'no-store' }).catch(() => fetch(req))
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) {}
  const title = data.title || 'Personal Finance';
  const icon = new URL('/assets/icons/icon-192.png', self.location.origin).href;
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
