const CACHE_NAME = 'pf-cache-v2'; // Updated version to force cache refresh
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/assets/css/app.css',
  '/assets/css/custom.css',
  '/js/utils.js',
  '/js/api.js',
  '/js/auth.js',
  '/js/pages/login.js',
  '/js/pages/import.js', // Added import.js
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
  
  // For HTML navigation, try network first
  if (event.request.mode === 'navigate' || (event.request.method === 'GET' && event.request.headers.get('accept') && event.request.headers.get('accept').includes('text/html'))) {
    event.respondWith(
      fetch(event.request).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return resp;
      }).catch(() => caches.match('/offline.html'))
    );
    return;
  }
  
  // For everything else (CSS, images, etc.), use cache-first
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request).catch(() => cached))
  );
});
