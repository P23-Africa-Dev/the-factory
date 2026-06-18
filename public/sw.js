const STATIC_CACHE = "factory-dashboard-static-v1";
const API_CACHE = "factory-dashboard-api-v1";

const OFFLINE_FALLBACK = "/offline";
const STATIC_ASSETS = ["/", "/offline", "/manifest.webmanifest"];

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
          .filter((key) => key !== STATIC_CACHE && key !== API_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;

  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/backend/") ||
    url.hostname.includes("api.thefactory23.com")
  ) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (url.pathname.startsWith("/_next/") || url.pathname.startsWith("/fonts/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener("sync", (event) => {
  if (event.tag === "dashboard-offline-sync") {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) =>
          client.postMessage({
            type: "SYNC_REQUESTED",
            tag: event.tag,
          }),
        );
      }),
    );
  }
});

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
    return caches.match(OFFLINE_FALLBACK) || new Response("Offline", { status: 503 });
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
      new Response(JSON.stringify({ success: false, message: "Offline" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    );
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(STATIC_CACHE);
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(async () => cached);

  return cached || network;
}

