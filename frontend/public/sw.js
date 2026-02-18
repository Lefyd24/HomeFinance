const CACHE_NAME = 'pf-cache-v3'; // Bumped version to force cache refresh
const PRECACHE_URLS = [
  // Removed all HTML pages from precache - they should not be cached
  // Only keeping static assets
  '/assets/css/app.css',
  '/assets/css/custom.css',
  '/js/utils.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/pages/login.js',
  '/js/pages/import.js',
  '/js/pwa.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  
  // For JavaScript files, use network-first strategy (always try fresh version first)
  if (url.pathname.endsWith('.js')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // Cache the fresh version
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => {
          // Fallback to cache if network fails
          return caches.match(event.request);
        })
    );
    return;
  }
  
  // For HTML pages and navigation - NEVER CACHE
  // Always fetch from network, no caching
  if (event.request.mode === 'navigate' || (event.request.method === 'GET' && event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(event.request).catch(() => {
        // Only show offline page if network fails completely
        return caches.match('/offline.html').catch(() => {
          // If offline.html isn't cached either, return a basic offline response
          return new Response('You are offline. Please check your connection.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: { 'Content-Type': 'text/plain' }
          });
        });
      })
    );
    return;
  }
  
  // For CSS and images, use cache-first (these don't change often)
  if (url.pathname.match(/\.(css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) {
          // Return cached version but also fetch fresh version in background
          fetch(event.request).then(response => {
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, response));
          }).catch(() => {});
          return cached;
        }
        // Not in cache, fetch and cache
        return fetch(event.request).then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        });
      }).catch(() => fetch(event.request))
    );
    return;
  }
  
  // For everything else, just fetch from network (no caching)
  event.respondWith(fetch(event.request));
});
