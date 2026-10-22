/** Core agent routes precached for offline navigation. */
export const CORE_AGENT_ROUTES = [
  '/',
  '/tasks',
  '/map',
  '/meetings',
  '/crm',
  '/crm/leads',
  '/sync/queue',
] as const;

/**
 * Warm navigation caches while online so bottom-nav routes work offline.
 * Fetches shell pages and asks the service worker to store them in PAGE_CACHE.
 */
export async function warmAgentRoutes(routes: readonly string[] = CORE_AGENT_ROUTES): Promise<void> {
  if (typeof window === 'undefined' || !navigator.onLine) return;

  try {
    const registration = await navigator.serviceWorker?.ready;
    registration?.active?.postMessage({
      type: 'CACHE_ROUTES',
      routes: [...routes],
    });
  } catch {
    // Best-effort SW messaging.
  }

  await Promise.allSettled(
    routes.map((route) =>
      fetch(route, { credentials: 'include', cache: 'force-cache' }).catch(() => undefined),
    ),
  );
}

/** Warm routes after first paint so startup API calls are not competing for bandwidth. */
export function scheduleWarmAgentRoutes(
  routes: readonly string[] = CORE_AGENT_ROUTES,
): void {
  if (typeof window === 'undefined' || !navigator.onLine) return;

  const run = () => {
    void warmAgentRoutes(routes);
  };

  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 5_000 });
    return;
  }

  window.setTimeout(run, 2_500);
}
