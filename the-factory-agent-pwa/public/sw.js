/**
 * Service Worker — offline-first caching strategies.
 *
 * Cache strategies:
 * - Cache First: static assets (CSS, JS, images, fonts)
 * -                Network First: API calls (/api/v1/*)
 * - Stale While Revalidate: Mapbox tiles + RSC payloads
 * - Navigation fallback: cached pages, then /offline shell
 */

const CACHE_NAME = "factory-agent-pwa-v4";
const STATIC_CACHE = "factory-static-v4";
const API_CACHE = "factory-api-v4";
const PAGE_CACHE = "factory-pages-v4";

const STATIC_ASSETS = ["/", "/offline", "/manifest.json"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(
            (key) =>
              key !== STATIC_CACHE &&
              key !== API_CACHE &&
              key !== CACHE_NAME &&
              key !== PAGE_CACHE,
          )
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  if (
    url.pathname.startsWith("/api/") ||
    (url.hostname.includes("thefactory23.com") && url.origin !== self.location.origin)
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.hostname.includes("mapbox.com") || url.hostname.includes("tiles.mapbox.com")) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
    return;
  }

  const isRscRequest =
    request.headers.get("RSC") === "1" ||
    request.headers.get("Next-Router-Prefetch") === "1" ||
    request.headers.get("Next-Router-State-Tree") != null;

  if (url.pathname.startsWith("/_next/") || isRscRequest) {
    event.respondWith(staleWhileRevalidate(request, STATIC_CACHE));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, PAGE_CACHE));
});

self.addEventListener("sync", (event) => {
  if (
    event.tag === "location-sync" ||
    event.tag === "proof-sync" ||
    event.tag === "offline-action-sync"
  ) {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({
            type: "SYNC_REQUESTED",
            tag: event.tag,
          });
        });
      }),
    );
  }
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const options = {
      body: data.message || data.body || "",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-72x72.png",
      tag: data.tag || "factory-notification",
      data: {
        url: data.action_url || "/",
      },
    };

    event.waitUntil(
      self.registration.showNotification(data.title || "Factory 23", options),
    );
  } catch {
    // Malformed push — ignore
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(url) && "focus" in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});

async function handleNavigation(request) {
  const cache = await caches.open(PAGE_CACHE);

  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    const offlinePage = await caches.match("/offline");
    if (offlinePage) return offlinePage;

    const shell = await caches.match("/");
    return shell || new Response("Offline", { status: 503 });
  }
}

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
    return (
      caches.match("/offline") ||
      caches.match("/") ||
      new Response("Offline", { status: 503 })
    );
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
    return (
      cached ||
      new Response(JSON.stringify({ error: "Offline" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    );
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cached = await caches.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        caches.open(cacheName).then((c) => c.put(request, response.clone()));
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}
