/**
 * Maps backend / dashboard notification action URLs onto Unified PWA routes.
 *
 * The backend emits dashboard paths (`/tasks/123`, `/agent/field-activity`, `/insight`,
 * `/operations/attendance`, …). This resolver remaps them onto routes that actually exist
 * in the PWA for the active mode (agent routes at the root, manager routes under `/manager`).
 *
 * Every result is a whitelisted route — unknown paths fall back to the mode's nearest
 * section or home instead of producing a 404.
 */
import { readSession } from '@/session/sessionStore';
import type { AppMode } from '@/session/appMode';

export type ResolveAgentDeepLinkOptions = {
  /**
   * When true, absolute http(s) URLs on a foreign origin are returned unchanged.
   * Notification routing passes `false` so dashboard URLs are mapped into the app
   * instead of navigating the WebView away to another site.
   */
  allowAbsolute?: boolean;
  mode?: AppMode;
};

const ID = '([1-9]\\d*)';

function currentMode(explicit?: AppMode): AppMode {
  if (explicit) return explicit;
  try {
    return readSession()?.app_mode === 'manager' ? 'manager' : 'agent';
  } catch {
    return 'agent';
  }
}

function splitPath(input: string): { pathname: string; search: string } {
  let path = input;
  if (/^https?:\/\//i.test(path)) {
    try {
      const parsed = new URL(path);
      path = `${parsed.pathname}${parsed.search}`;
    } catch {
      // keep raw
    }
  }
  // Drop hash fragments — PWA routes never use them for navigation state.
  path = path.split('#')[0] ?? '';
  if (!path.startsWith('/')) path = `/${path}`;

  const queryIndex = path.indexOf('?');
  let pathname = queryIndex === -1 ? path : path.slice(0, queryIndex);
  const query = queryIndex === -1 ? '' : path.slice(queryIndex + 1);

  pathname = pathname.replace(/\/{2,}/g, '/');
  if (pathname.length > 1 && pathname.endsWith('/')) pathname = pathname.replace(/\/+$/, '');
  return { pathname: pathname || '/', search: query ? `?${query}` : '' };
}

function match(pathname: string, pattern: string): RegExpMatchArray | null {
  return pathname.match(new RegExp(`^${pattern}$`));
}

/** Routes that exist under `app/(agent)` (root-level agent PWA). */
function resolveAgentPath(pathname: string, search: string): string {
  let m: RegExpMatchArray | null;

  // Tasks
  if ((m = match(pathname, `/tasks?/${ID}/(complete|tracking)`))) return `/task/${m[1]}/${m[2]}${search}`;
  if ((m = match(pathname, `/tasks?/${ID}(?:/.*)?`))) return `/task/${m[1]}${search}`;
  if (pathname === '/tasks') return `/tasks${search}`;
  if (pathname.startsWith('/tasks/')) return '/tasks';

  // Meetings
  if (pathname === '/meetings' || pathname === '/meetings/new') return `${pathname}${search}`;
  if ((m = match(pathname, `/meetings/${ID}/edit`))) return `/meetings/${m[1]}/edit${search}`;
  if ((m = match(pathname, `/meetings/${ID}(?:/.*)?`))) return `/meetings/${m[1]}${search}`;
  if (pathname.startsWith('/meetings/')) return '/meetings';

  // CRM
  if ((m = match(pathname, `/crm/leads/${ID}(?:/.*)?`))) return `/crm/leads/${m[1]}${search}`;
  if (pathname === '/crm/leads') return `/crm/leads${search}`;
  if (pathname === '/crm') return `/crm${search}`;
  if (pathname.startsWith('/crm/')) return '/crm';

  // Field activity
  if ((m = match(pathname, `/field-activity/journeys/${ID}`))) return `/field-activity/journeys/${m[1]}${search}`;
  if (pathname === '/field-activity/journeys') return `/field-activity/journeys${search}`;
  if (pathname === '/field-activity') return `/field-activity${search}`;
  if (pathname.startsWith('/field-activity/')) return '/field-activity';

  // Map (keeps ?taskId= deep links)
  if (pathname === '/map' || pathname.startsWith('/map/')) return `/map${search}`;

  // Sync
  if (pathname === '/sync/queue' || pathname === '/sync/conflicts') return pathname;
  if (pathname === '/sync' || pathname.startsWith('/sync/')) return '/sync/queue';

  // Profile & assistant
  if (pathname === '/profile' || pathname === '/user/profile' || pathname.startsWith('/user/profile/')) {
    return '/profile';
  }
  if (pathname === '/assistant' || pathname.startsWith('/assistant/')) return '/assistant';

  // Attendance (clock-in card), payroll, dashboard-only pages → home.
  return '/';
}

/** Routes that exist under `app/manager`. */
function resolveManagerPath(pathname: string, search: string): string {
  let m: RegExpMatchArray | null;

  // Tasks
  if ((m = match(pathname, `/tasks?/${ID}/(complete|tracking)`))) return `/manager/task/${m[1]}/${m[2]}${search}`;
  if ((m = match(pathname, `/tasks?/${ID}(?:/.*)?`))) return `/manager/task/${m[1]}${search}`;
  if (pathname.startsWith('/tasks/reassignments')) return '/manager/tasks?tab=reassignments';
  if (pathname === '/projects' || pathname.startsWith('/projects/')) return '/manager/tasks?tab=projects';
  if (pathname === '/tasks') return `/manager/tasks${search}`;
  if (pathname.startsWith('/tasks/')) return '/manager/tasks';

  // Meetings
  if (pathname === '/meetings' || pathname === '/meetings/new') return `/manager${pathname}${search}`;
  if ((m = match(pathname, `/meetings/${ID}/edit`))) return `/manager/meetings/${m[1]}/edit${search}`;
  if ((m = match(pathname, `/meetings/${ID}(?:/.*)?`))) return `/manager/meetings/${m[1]}${search}`;
  if (pathname.startsWith('/meetings/')) return '/manager/meetings';

  // CRM
  if ((m = match(pathname, `/crm/leads/${ID}(?:/.*)?`))) return `/manager/crm/leads/${m[1]}${search}`;
  if (pathname === '/crm/leads') return `/manager/crm/leads${search}`;
  if (pathname === '/crm') return `/manager/crm${search}`;
  if (pathname.startsWith('/crm/')) return '/manager/crm';

  // Field activity & insight
  if ((m = match(pathname, `/field-activity/journeys/${ID}`))) return `/manager/field-activity/journeys/${m[1]}${search}`;
  if (pathname === '/field-activity/journeys') return `/manager/field-activity/journeys${search}`;
  if (pathname === '/field-activity' || pathname.startsWith('/field-activity/') || pathname === '/insight') {
    return '/manager/field-activity';
  }

  if (pathname === '/map' || pathname.startsWith('/map/')) return `/manager/map${search}`;

  // Workforce / attendance / payroll
  if (
    pathname === '/workforce' ||
    pathname.startsWith('/workforce/') ||
    pathname === '/operations' ||
    pathname.startsWith('/operations/')
  ) {
    return '/manager/workforce';
  }
  if (pathname === '/payroll' || pathname.startsWith('/payroll/')) return '/manager/payroll';

  if (pathname === '/sync/queue' || pathname === '/sync/conflicts') return `/manager${pathname}`;
  if (pathname === '/sync' || pathname.startsWith('/sync/')) return '/manager/sync/queue';

  if (pathname === '/profile' || pathname === '/user/profile' || pathname.startsWith('/user/profile/')) {
    return '/manager/profile';
  }
  if (pathname === '/assistant' || pathname.startsWith('/assistant/')) return '/manager/assistant';

  return '/manager';
}

/**
 * Resolve a notification action_url / action_route to a navigable PWA path.
 * Always returns a path starting with `/` (or an external absolute URL when
 * `allowAbsolute` is true) so taps never land on an unknown route.
 */
export function resolveAgentDeepLink(
  rawUrl: string | null | undefined,
  options: ResolveAgentDeepLinkOptions = {},
): string {
  const allowAbsolute = options.allowAbsolute !== false;
  const input = typeof rawUrl === 'string' ? rawUrl.trim() : '';
  const mode = currentMode(options.mode);
  const home = mode === 'manager' ? '/manager' : '/';

  if (!input) return home;

  if (allowAbsolute && /^https?:\/\//i.test(input)) {
    try {
      const parsed = new URL(input);
      const sameOrigin =
        typeof window !== 'undefined' && parsed.origin === window.location.origin;
      if (!sameOrigin) return input;
    } catch {
      // fall through and treat as path
    }
  }

  const split = splitPath(input);
  const { search } = split;
  let { pathname } = split;

  // Explicit manager paths: re-resolve the remainder so it is validated too.
  if (pathname === '/manager' || pathname.startsWith('/manager/')) {
    if (mode !== 'manager') {
      pathname = pathname.slice('/manager'.length) || '/';
    } else {
      const rest = pathname.slice('/manager'.length) || '/';
      if (rest === '/') return `/manager${search}`;
      // `/manager/task/5` → treat `/task/5` as the dashboard-style path.
      pathname = rest;
    }
  }

  // Strip dashboard `/agent` or `/management` prefixes.
  if (pathname === '/agent' || pathname === '/management') {
    pathname = '/';
  } else if (pathname.startsWith('/agent/')) {
    pathname = pathname.slice('/agent'.length);
  } else if (pathname.startsWith('/management/')) {
    pathname = pathname.slice('/management'.length);
  }

  if (pathname === '/' || pathname === '/dashboard' || pathname === '/home') {
    return mode === 'manager' ? `/manager${search}` : `/${search}`;
  }

  return mode === 'manager'
    ? resolveManagerPath(pathname, search)
    : resolveAgentPath(pathname, search);
}
