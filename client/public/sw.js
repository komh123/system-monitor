// Service Worker for System Monitor PWA
const CACHE_VERSION = 'v2.33.4';
const CACHE_NAME = `system-monitor-${CACHE_VERSION}`;

// Only cache truly static assets (icons, manifest) — NOT index.html
// index.html references hashed JS/CSS bundles that change on every build,
// so caching it causes white screen when a new version is deployed.
const STATIC_ASSETS = [
  '/manifest.json',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png'
];

// Runtime cache for API responses
const API_CACHE_NAME = `system-monitor-api-${CACHE_VERSION}`;

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing service worker version:', CACHE_VERSION);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[SW] Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating service worker version:', CACHE_VERSION);

  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name.startsWith('system-monitor-') && name !== CACHE_NAME && name !== API_CACHE_NAME)
            .map((name) => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }

  // API requests - network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful GET requests
          if (request.method === 'GET' && response.ok) {
            const responseClone = response.clone();
            caches.open(API_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request)
            .then((cachedResponse) => {
              if (cachedResponse) {
                return cachedResponse;
              }
              return new Response(
                JSON.stringify({ error: 'Offline', offline: true }),
                { status: 503, headers: { 'Content-Type': 'application/json' } }
              );
            });
        })
    );
    return;
  }

  // Navigation requests (HTML pages) — ALWAYS network-first
  // This prevents white screen from stale cached index.html
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Hashed assets (/assets/index-XXXX.js, /assets/index-XXXX.css) — cache-first
  // These filenames contain content hashes, so cached versions are always correct
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request)
        .then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return fetch(request).then((networkResponse) => {
            if (networkResponse.ok) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
            }
            return networkResponse;
          });
        })
    );
    return;
  }

  // Other static assets (icons, manifest) — stale-while-revalidate
  event.respondWith(
    caches.match(request)
      .then((cachedResponse) => {
        const fetchPromise = fetch(request).then((networkResponse) => {
          if (networkResponse.ok) {
            caches.open(CACHE_NAME).then((cache) => cache.put(request, networkResponse.clone()));
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
  );
});

// Handle messages from clients
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data && event.data.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(cacheNames.map((name) => caches.delete(name)));
      })
    );
  }
});

// Background sync placeholder
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-messages') {
    event.waitUntil(Promise.resolve());
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'System Monitor';
  const options = {
    body: data.body || 'New notification',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    data: data.url || '/'
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(clients.openWindow(event.notification.data || '/'));
});
