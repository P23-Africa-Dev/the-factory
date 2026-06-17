/**
 * Service Worker — offline-first caching strategies.
 *
 * Cache strategies:
 * - Cache First: static assets (CSS, JS, images, fonts)
 * - Network First: API calls (/api/v1/*)
 * - Stale While Revalidate: Mapbox tiles
 * - Offline Fallback: serve cached shell when offline
 *
 * Background Sync:
 * - location-sync: batch upload pending GPS coordinates
 * - proof-sync: upload pending proof photos
 */

const CACHE_NAME = 'factory-agent-pwa-v1';
const STATIC_CACHE = 'factory-static-v1';
const API_CACHE = 'factory-api-v1';

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
];

// Install: pre-cache critical assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== API_CACHE && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch: route requests to appropriate cache strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') return;

  // API calls: Network First
  if (url.pathname.startsWith('/api/') || url.hostname.includes('thefactory23.com')) {
    event.respondWith(networkFirst(request));
    return;
  }

  // Mapbox tiles: Stale While Revalidate
  if (url.hostname.includes('mapbox.com') || url.hostname.includes('tiles.mapbox.com')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Everything else: Cache First (static assets)
  event.respondWith(cacheFirst(request));
});

// Background Sync events
self.addEventListener('sync', (event) => {
  if (event.tag === 'location-sync' || event.tag === 'proof-sync') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: 'SYNC_REQUESTED',
            tag: event.tag,
          });
        });
      })
    );
  }
});

// Push notification support
self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.message || data.body || '',
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: data.tag || 'factory-notification',
      data: {
        url: data.action_url || '/',
      },
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Factory 23', options)
    );
  } catch {
    // Malformed push — ignore
  }
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      // Focus existing tab if available
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab
      return self.clients.openWindow(url);
    })
  );
});

// --- Cache strategy implementations ---

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline fallback
    return caches.match('/') || new Response('Offline', { status: 503 });
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response(JSON.stringify({ error: 'Offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const fetchPromise = fetch(request).then((response) => {
    if (response.ok) {
      const cache = caches.open(STATIC_CACHE);
      cache.then((c) => c.put(request, response.clone()));
    }
    return response;
  }).catch(() => cached);

  return cached || fetchPromise;
}
