/**
 * Service Worker — offline-first caching strategies.
 *
 * Cache strategies:
 * - Cache First: static assets (CSS, JS, images, fonts)
 * - Network First: API calls (/api/v1/*)
 * - Stale While Revalidate: Mapbox tiles + RSC payloads
 * - Navigation fallback: cached pages, then /offline.html shell
 *
 * Background Sync limitations (pure PWA):
 * - Auth token is mirrored into IndexedDB `syncMeta` by the app (SW cannot
 *   read localStorage). If credentials are missing, location upload falls
 *   back to postMessage when a client window is open.
 * - Proof blobs and offline action queue still require an open client
 *   (multipart / complex payloads).
 * - Android APK uses Capgo Capacitor + native FGS; this SW path is for
 *   installed PWA / browser tabs.
 */

const CACHE_NAME = "factory-agent-pwa-v10";
const STATIC_CACHE = "factory-static-v10";
const API_CACHE = "factory-api-v10";
const PAGE_CACHE = "factory-pages-v10";
const IDB_NAME = "factory-agent-pwa";
const LOCATION_BATCH_SIZE = 50;

const STATIC_ASSETS = [
  "/",
  "/offline.html",
  "/offline",
  "/manifest.json",
  "/tasks",
  "/map",
  "/meetings",
  "/crm",
  "/crm/leads",
  "/sync/queue",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key !== STATIC_CACHE &&
              key !== API_CACHE &&
              key !== CACHE_NAME &&
              key !== PAGE_CACHE,
          )
          .map((key) => caches.delete(key)),
      );
      // Best-effort: drain location queue if no client is open yet.
      try {
        await uploadQueuedLocationsFromIdb();
      } catch {
        // Non-fatal
      }
      await self.clients.claim();
    })(),
  );
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
    event.waitUntil(handleBackgroundSync(event.tag));
  }
});

async function handleBackgroundSync(tag) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

  if (clients.length > 0) {
    clients.forEach((client) => {
      client.postMessage({
        type: "SYNC_REQUESTED",
        tag,
      });
    });
    return;
  }

  // No open client — SW can still upload location points from IndexedDB.
  if (tag === "location-sync" || tag === "offline-action-sync") {
    await uploadQueuedLocationsFromIdb();
  }
  // Proof / offline-action multipart sync still requires an open client.
}

function openFactoryDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME);
    request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    request.onsuccess = () => resolve(request.result);
  });
}

function idbRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readSyncCredentials(db) {
  if (!db.objectStoreNames.contains("syncMeta")) return null;
  const tx = db.transaction("syncMeta", "readonly");
  const row = await idbRequest(tx.objectStore("syncMeta").get("credentials"));
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  if (!row || !row.token || !row.apiBaseUrl) return null;
  return row;
}

async function getPendingLocationRows(db) {
  if (!db.objectStoreNames.contains("locationQueue")) return [];
  const tx = db.transaction("locationQueue", "readonly");
  const store = tx.objectStore("locationQueue");
  let rows = [];
  if (store.indexNames.contains("by-synced")) {
    rows = await idbRequest(store.index("by-synced").getAll(0));
  } else {
    rows = await idbRequest(store.getAll());
    rows = rows.filter((r) => r && r.synced === 0);
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  const now = Date.now();
  return rows.filter((row) => {
    if (!row || row.inFlight === 1) return false;
    if (!row.nextAttemptAt) return true;
    return new Date(row.nextAttemptAt).getTime() <= now;
  });
}

async function markLocationRows(db, rows, patch) {
  if (!rows.length) return;
  const tx = db.transaction("locationQueue", "readwrite");
  const store = tx.objectStore("locationQueue");
  for (const row of rows) {
    if (row.id == null) continue;
    store.put({ ...row, ...patch });
  }
  await new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function postLocationBatch(apiBaseUrl, token, path, companyId, points) {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      company_id: companyId,
      points: points.map((r) => ({
        latitude: r.latitude,
        longitude: r.longitude,
        accuracy_meters: r.accuracyMeters ?? null,
        speed_mps: r.speedMps ?? null,
        heading_degrees: r.headingDegrees ?? null,
        recorded_at: r.recordedAt,
      })),
    }),
  });
  return response;
}

async function uploadQueuedLocationsFromIdb() {
  let db;
  try {
    db = await openFactoryDb();
  } catch {
    return;
  }

  try {
    const credentials = await readSyncCredentials(db);
    if (!credentials) return;

    const pending = await getPendingLocationRows(db);
    if (pending.length === 0) return;

    const fallbackCompanyId = credentials.companyId;
    const fieldRows = pending.filter(
      (row) => row.fieldActivitySessionId != null && row.fieldActivitySessionId > 0,
    );
    const taskRows = pending.filter((row) => !row.fieldActivitySessionId);

    const byField = {};
    for (const row of fieldRows) {
      const sid = Number(row.fieldActivitySessionId);
      if (!byField[sid]) byField[sid] = [];
      byField[sid].push(row);
    }

    for (const [sessionIdRaw, rows] of Object.entries(byField)) {
      const batch = rows.slice(0, LOCATION_BATCH_SIZE);
      const companyId = batch[0].companyId || fallbackCompanyId;
      if (!companyId) continue;

      await markLocationRows(db, batch, { inFlight: 1 });
      try {
        const res = await postLocationBatch(
          credentials.apiBaseUrl,
          credentials.token,
          `/agent/field-activity/sessions/${sessionIdRaw}/points`,
          companyId,
          batch,
        );
        if (res.ok) {
          await markLocationRows(db, batch, {
            synced: 1,
            inFlight: 0,
            attempts: 0,
            nextAttemptAt: null,
            lastError: null,
          });
        } else if (res.status === 422) {
          await markLocationRows(db, batch, {
            synced: 1,
            inFlight: 0,
            nextAttemptAt: null,
            lastError: `HTTP ${res.status}`,
          });
        } else {
          await markLocationRows(db, batch, {
            inFlight: 0,
            attempts: (batch[0].attempts || 0) + 1,
            lastError: `HTTP ${res.status}`,
          });
        }
      } catch (err) {
        await markLocationRows(db, batch, {
          inFlight: 0,
          lastError: err && err.message ? err.message : "SW upload failed",
        });
      }
    }

    const byTask = {};
    for (const row of taskRows) {
      const tid = Number(row.taskId);
      if (!tid) continue;
      if (!byTask[tid]) byTask[tid] = [];
      byTask[tid].push(row);
    }

    for (const [taskIdRaw, rows] of Object.entries(byTask)) {
      const batch = rows.slice(0, LOCATION_BATCH_SIZE);
      const companyId = batch[0].companyId || fallbackCompanyId;
      if (!companyId) continue;

      await markLocationRows(db, batch, { inFlight: 1 });
      try {
        const res = await postLocationBatch(
          credentials.apiBaseUrl,
          credentials.token,
          `/agent/tasks/${taskIdRaw}/location`,
          companyId,
          batch,
        );
        if (res.ok) {
          await markLocationRows(db, batch, {
            synced: 1,
            inFlight: 0,
            attempts: 0,
            nextAttemptAt: null,
            lastError: null,
          });
        } else if (res.status === 422) {
          await markLocationRows(db, batch, {
            synced: 1,
            inFlight: 0,
            nextAttemptAt: null,
            lastError: `HTTP ${res.status}`,
          });
        } else {
          await markLocationRows(db, batch, {
            inFlight: 0,
            attempts: (batch[0].attempts || 0) + 1,
            lastError: `HTTP ${res.status}`,
          });
        }
      } catch (err) {
        await markLocationRows(db, batch, {
          inFlight: 0,
          lastError: err && err.message ? err.message : "SW upload failed",
        });
      }
    }
  } finally {
    try {
      db.close();
    } catch {
      // ignore
    }
  }
}

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let data = {};
      try {
        data = event.data ? event.data.json() : {};
      } catch {
        try {
          const text = event.data ? event.data.text() : "";
          data = text ? { body: text } : {};
        } catch {
          data = {};
        }
      }

      const title = data.title || "Factory 23 Agent";
      const body = data.message || data.body || "";
      const url = data.action_url || data.url || "/";
      const tag = data.tag || `factory-notification-${data.notification_id || Date.now()}`;

      await self.registration.showNotification(title, {
        body,
        icon: "/icons/icon-192x192.png",
        badge: "/icons/icon-72x72.png",
        tag,
        renotify: true,
        requireInteraction: false,
        vibrate: [120, 60, 120],
        data: {
          url,
          notification_id: data.notification_id || null,
          type: data.type || null,
          category: data.category || null,
        },
      });
    })(),
  );
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || !data.type) return;

  if (data.type === "SHOW_NOTIFICATION") {
    const options = {
      body: data.body || "",
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-72x72.png",
      tag: data.tag || "factory-notification",
      data: {
        url: data.url || "/",
      },
    };

    event.waitUntil(
      self.registration.showNotification(data.title || "Factory 23", options),
    );
    return;
  }

  if (data.type === "CACHE_ROUTES" && Array.isArray(data.routes)) {
    event.waitUntil(cacheRoutes(data.routes));
  }

  if (data.type === "SYNC_LOCATIONS_NOW") {
    event.waitUntil(uploadQueuedLocationsFromIdb());
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url || "/";
  const targetUrl = rawUrl.startsWith("http")
    ? rawUrl
    : new URL(rawUrl.startsWith("/") ? rawUrl : `/${rawUrl}`, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          if ("navigate" in client) {
            return client.focus().then(() => client.navigate(targetUrl));
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});

async function cacheRoutes(routes) {
  const cache = await caches.open(PAGE_CACHE);

  for (const route of routes) {
    if (typeof route !== "string" || !route.startsWith("/")) continue;

    try {
      const response = await fetch(route);
      if (response.ok) {
        const cloned = response.clone();
        await cache.put(route, cloned);
      }
    } catch {
      // Skip routes that fail to fetch.
    }
  }
}

function shouldCacheNavigationResponse(request, response) {
  if (!response.ok) return false;

  const requestUrl = new URL(request.url);
  const responseUrl = new URL(response.url);

  if (requestUrl.pathname.startsWith("/install")) return false;
  if (responseUrl.pathname.startsWith("/install")) return false;
  if (responseUrl.pathname !== requestUrl.pathname) return false;

  return true;
}

async function handleNavigation(request) {
  const requestUrl = new URL(request.url);

  if (requestUrl.pathname.startsWith("/install")) {
    return fetch(request);
  }

  const cache = await caches.open(PAGE_CACHE);

  try {
    const response = await fetch(request);
    if (shouldCacheNavigationResponse(request, response)) {
      const cloned = response.clone();
      cache.put(request, cloned);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;

    const offlinePage = await caches.match("/offline.html");
    if (offlinePage) return offlinePage;

    const legacyOffline = await caches.match("/offline");
    if (legacyOffline) return legacyOffline;

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
      const cloned = response.clone();
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, cloned);
    }
    return response;
  } catch {
    return (
      caches.match("/offline.html") ||
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
      const cloned = response.clone();
      const cache = await caches.open(API_CACHE);
      await cache.put(request, cloned);
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
        const cloned = response.clone();
        caches.open(cacheName).then((c) => c.put(request, cloned));
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}
