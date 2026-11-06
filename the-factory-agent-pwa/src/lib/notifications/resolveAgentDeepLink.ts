/**
 * Maps backend / dashboard notification action URLs onto Unified PWA routes.
 *
 * Backend often emits dashboard paths (`/tasks/123`, `/agent/field-activity`, `/management/tasks`).
 * This resolver remaps them to the appropriate Agent or Manager PWA routes based on active mode.
 */
import { readSession } from '@/session/sessionStore';
import type { AppMode } from '@/session/appMode';

export type ResolveAgentDeepLinkOptions = {
  /** When true, absolute http(s) URLs are returned unchanged. */
  allowAbsolute?: boolean;
  mode?: AppMode;
};

function stripOrigin(url: string): string {
  if (!/^https?:\/\//i.test(url)) return url;
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return url;
  }
}

/**
 * Resolve a notification action_url / action_route to a navigable PWA path.
 * Always returns a path starting with `/` (never null) so OS notification taps
 * never land on an unknown route.
 */
export function resolveAgentDeepLink(
  rawUrl: string | null | undefined,
  options: ResolveAgentDeepLinkOptions = {},
): string {
  const allowAbsolute = options.allowAbsolute !== false;
  const input = typeof rawUrl === 'string' ? rawUrl.trim() : '';

  if (!input) {
    const currentMode = options.mode ?? readSession()?.app_mode;
    return currentMode === 'manager' ? '/manager' : '/';
  }

  if (allowAbsolute && /^https?:\/\//i.test(input)) {
    try {
      const parsed = new URL(input);
      // Same-origin absolute links → remap path; external stay absolute.
      if (
        typeof window !== 'undefined' &&
        parsed.origin === window.location.origin
      ) {
        return resolveAgentDeepLink(`${parsed.pathname}${parsed.search}${parsed.hash}`, {
          ...options,
          allowAbsolute: false,
        });
      }
      return input;
    } catch {
      // fall through and treat as path
    }
  }

  let path = stripOrigin(input);
  if (!path.startsWith('/')) path = `/${path}`;

  // Drop trailing slash except root
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  const [pathnamePart, query = ''] = path.split('?');
  let pathname = pathnamePart || '/';
  const search = query ? `?${query}` : '';

  // Detect explicit manager path
  const isManagerExplicit = pathname === '/manager' || pathname.startsWith('/manager/');
  const resolvedMode: AppMode =
    options.mode ?? (isManagerExplicit ? 'manager' : readSession()?.app_mode ?? 'agent');

  if (isManagerExplicit) {
    return `${pathname}${search}`;
  }

  // Strip dashboard `/agent` or `/management` prefix
  if (pathname === '/agent' || pathname === '/management') {
    pathname = '/';
  } else if (pathname.startsWith('/agent/')) {
    pathname = pathname.slice('/agent'.length);
  } else if (pathname.startsWith('/management/')) {
    pathname = pathname.slice('/management'.length);
  }

  if (resolvedMode === 'manager') {
    if (pathname === '/' || pathname === '/dashboard' || pathname === '/home') {
      return `/manager${search}`;
    }
    if (pathname.startsWith('/tasks') || pathname.startsWith('/task/')) {
      return `/manager/tasks${search}`;
    }
    if (pathname.startsWith('/crm')) {
      return `/manager${pathname}${search}`;
    }
    if (pathname.startsWith('/meetings')) {
      return `/manager${pathname}${search}`;
    }
    if (pathname.startsWith('/field-activity')) {
      return `/manager${pathname}${search}`;
    }
    if (pathname.startsWith('/map')) {
      return `/manager/map${search}`;
    }
    if (pathname.startsWith('/workforce')) {
      return `/manager/workforce${search}`;
    }
    if (pathname.startsWith('/payroll')) {
      return `/manager/payroll${search}`;
    }
    if (pathname.startsWith('/profile') || pathname === '/user/profile') {
      return `/manager/profile${search}`;
    }
    if (pathname.startsWith('/assistant')) {
      return `/manager/assistant${search}`;
    }
    return `/manager${search}`;
  }

  // Agent resolution logic
  // Task detail: /tasks/123 → /task/123
  const taskDetail = pathname.match(/^\/tasks\/(\d+)(?:\/.*)?$/);
  if (taskDetail) {
    return `/task/${taskDetail[1]}${search}`;
  }

  // Reassignment inbox → operations list
  if (pathname.startsWith('/tasks/reassignments')) {
    return `/tasks${search}`;
  }

  if (pathname === '/tasks') {
    return `/tasks${search}`;
  }

  // Meetings
  const meetingDetail = pathname.match(/^\/meetings\/(\d+)/);
  if (meetingDetail) {
    return `/meetings/${meetingDetail[1]}${search}`;
  }
  if (pathname.startsWith('/meetings')) {
    return `${pathname}${search}`;
  }

  // CRM leads
  const leadDetail = pathname.match(/^\/crm\/leads\/(\d+)/);
  if (leadDetail) {
    return `/crm/leads/${leadDetail[1]}${search}`;
  }
  if (pathname.startsWith('/crm')) {
    return `${pathname}${search}`;
  }

  // Field activity
  if (pathname.startsWith('/field-activity')) {
    return `${pathname}${search}`;
  }

  // Map (keep query e.g. ?taskId=)
  if (pathname === '/map' || pathname.startsWith('/map/')) {
    return `/map${search}`;
  }

  // Attendance / operations → home (clock UI lives on dashboard)
  if (
    pathname.startsWith('/operations/attendance') ||
    pathname === '/operations' ||
    pathname.startsWith('/operations/')
  ) {
    return '/';
  }

  // Profile
  if (pathname === '/user/profile' || pathname === '/profile') {
    return '/profile';
  }

  // Assistant
  if (pathname === '/assistant' || pathname.startsWith('/assistant/')) {
    return '/assistant';
  }

  // Dashboard / home aliases
  if (
    pathname === '/' ||
    pathname === '/dashboard' ||
    pathname === '/home' ||
    pathname === '/notifications' ||
    pathname === '/insight' ||
    pathname === '/payroll' ||
    pathname.startsWith('/projects/') ||
    pathname === '/subscribe' ||
    pathname.startsWith('/enterprise/') ||
    pathname.startsWith('/internal') ||
    pathname.startsWith('/auth/')
  ) {
    return '/';
  }

  const knownPrefixes = [
    '/task/',
    '/tasks',
    '/map',
    '/meetings',
    '/crm',
    '/field-activity',
    '/profile',
    '/assistant',
    '/sync',
    '/login',
  ];
  if (knownPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix))) {
    return `${pathname}${search}`;
  }

  return '/';
}
