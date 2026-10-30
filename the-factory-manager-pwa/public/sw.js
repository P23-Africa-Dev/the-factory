/**
 * Service Worker — Factory 23 Manager PWA offline-first caching & Web Push.
 */

const CACHE_NAME = "factory-manager-pwa-v1";
const STATIC_CACHE = "factory-manager-static-v1";
const API_CACHE = "factory-manager-api-v1";
const PAGE_CACHE = "factory-manager-pages-v1";

/** Keep in sync with src/lib/notifications/pwaNotificationIcons.ts */
const PWA_NOTIFICATION_ICON = "/icons/icon-192x192.png";
const PWA_NOTIFICATION_BADGE = "/icons/notification-badge.png";

/**
 * Keep in sync with src/lib/notifications/resolveAgentDeepLink.ts
 */
function resolveAgentDeepLink(rawUrl) {
  const input = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!input) return "/";

  if (/^https?:\/\//i.test(input)) {
    try {
      const parsed = new URL(input);
      if (parsed.origin === self.location.origin) {
        return resolveAgentDeepLink(`${parsed.pathname}${parsed.search}${parsed.hash}`);
      }
      return input;
    } catch {
      // fall through
    }
  }

  let path = input;
  if (/^https?:\/\//i.test(path)) {
    try {
      const parsed = new URL(path);
      path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      // keep
    }
  }
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  const parts = path.split("?");
  let pathname = parts[0] || "/";
  const search = parts[1] ? `?${parts[1]}` : "";

  if (pathname === "/agent" || pathname === "/admin") {
    pathname = "/";
  } else if (pathname.startsWith("/agent/")) {
    pathname = pathname.slice("/agent".length);
  } else if (pathname.startsWith("/admin/")) {
    pathname = pathname.slice("/admin".length);
  }

  const taskDetail = pathname.match(/^\/tasks\/(\d+)(?:\/.*)?$/);
  if (taskDetail) return `/task/${taskDetail[1]}${search}`;
  if (pathname.startsWith("/tasks/reassignments")) return `/tasks?tab=reassignments`;
  if (pathname === "/tasks" || pathname === "/kpis") return `/tasks${search}`;

  const meetingDetail = pathname.match(/^\/meetings\/(\d+)/);
  if (meetingDetail) return `/meetings/${meetingDetail[1]}${search}`;
  if (pathname.startsWith("/meetings")) return `${pathname}${search}`;

  const leadDetail = pathname.match(/^\/crm\/leads\/(\d+)/);
  if (leadDetail) return `/crm/leads/${leadDetail[1]}${search}`;
  if (pathname.startsWith("/crm")) return `${pathname}${search}`;

  if (pathname.startsWith("/field-activity")) return `${pathname}${search}`;
  if (pathname === "/map" || pathname.startsWith("/map/")) return `/map${search}`;

  if (
    pathname.startsWith("/operations/attendance") ||
    pathname.startsWith("/workforce") ||
    pathname.startsWith("/internal")
  ) {
    return `/workforce${search}`;
  }

  if (pathname === "/payroll" || pathname.startsWith("/payroll/")) {
    return `/payroll${search}`;
  }

  if (pathname === "/user/profile" || pathname === "/profile") return "/profile";
  if (pathname === "/assistant" || pathname.startsWith("/assistant/")) return "/assistant";

  const knownPrefixes = [
    "/task/",
    "/tasks",
    "/map",
    "/meetings",
    "/crm",
    "/field-activity",
    "/workforce",
    "/payroll",
    "/profile",
    "/assistant",
    "/sync",
    "/login",
  ];
  if (knownPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) {
    return `${pathname}${search}`;
  }

  return "/";
}

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
  "/workforce",
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

  if (url.pathname.startsWith("/_next/static/")) {
    return;
  }

  if (url.pathname.startsWith("/_next/") || isRscRequest) {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request, PAGE_CACHE));
});

self.addEventListener("sync", (event) => {
  if (event.tag === "offline-action-sync") {
    event.waitUntil(handleBackgroundSync(event.tag));
  }
});

async function handleBackgroundSync(tag) {
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  clients.forEach((client) => {
    client.postMessage({
      type: "SYNC_REQUESTED",
      tag,
    });
  });
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

      const title = data.title || "Factory 23 Manager";
      const body = data.message || data.body || "";
      const url = resolveAgentDeepLink(data.action_url || data.url || "/");
      const tag = data.tag || `factory-manager-notification-${data.notification_id || Date.now()}`;

      await self.registration.showNotification(title, {
        body,
        icon: PWA_NOTIFICATION_ICON,
        badge: PWA_NOTIFICATION_BADGE,
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
      icon: PWA_NOTIFICATION_ICON,
      badge: PWA_NOTIFICATION_BADGE,
      tag: data.tag || "factory-manager-notification",
      data: {
        url: resolveAgentDeepLink(data.url || "/"),
      },
    };

    event.waitUntil(
      self.registration.showNotification(data.title || "Factory 23 Manager", options),
    );
    return;
  }

  if (data.type === "CACHE_ROUTES" && Array.isArray(data.routes)) {
    event.waitUntil(cacheRoutes(data.routes));
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const rawUrl = event.notification.data?.url || "/";
  const resolvedPath = resolveAgentDeepLink(rawUrl);
  const targetUrl = /^https?:\/\//i.test(resolvedPath)
    ? resolvedPath
    : new URL(resolvedPath, self.location.origin).href;

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
      const response = await fetch(route, { cache: "force-cache" });
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
