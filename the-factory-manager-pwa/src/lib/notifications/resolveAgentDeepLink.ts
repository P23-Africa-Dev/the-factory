/**
 * Maps backend / dashboard notification action URLs onto Manager PWA routes.
 */

export type ResolveAgentDeepLinkOptions = {
  /** When true, absolute http(s) URLs are returned unchanged. */
  allowAbsolute?: boolean;
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

export function resolveAgentDeepLink(
  rawUrl: string | null | undefined,
  options: ResolveAgentDeepLinkOptions = {},
): string {
  const allowAbsolute = options.allowAbsolute !== false;
  const input = typeof rawUrl === 'string' ? rawUrl.trim() : '';

  if (!input) return '/';

  if (allowAbsolute && /^https?:\/\//i.test(input)) {
    try {
      const parsed = new URL(input);
      if (
        typeof window !== 'undefined' &&
        parsed.origin === window.location.origin
      ) {
        return resolveAgentDeepLink(`${parsed.pathname}${parsed.search}${parsed.hash}`, {
          allowAbsolute: false,
        });
      }
      return input;
    } catch {
      // fall through
    }
  }

  let path = stripOrigin(input);
  if (!path.startsWith('/')) path = `/${path}`;

  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }

  const [pathnamePart, query = ''] = path.split('?');
  let pathname = pathnamePart || '/';
  const search = query ? `?${query}` : '';

  if (pathname === '/agent' || pathname === '/admin') {
    pathname = '/';
  } else if (pathname.startsWith('/agent/')) {
    pathname = pathname.slice('/agent'.length);
  } else if (pathname.startsWith('/admin/')) {
    pathname = pathname.slice('/admin'.length);
  }

  // Task detail: /tasks/123 -> /task/123
  const taskDetail = pathname.match(/^\/tasks\/(\d+)(?:\/.*)?$/);
  if (taskDetail) {
    return `/task/${taskDetail[1]}${search}`;
  }

  // Reassignment inbox -> operations reassignments tab
  if (pathname.startsWith('/tasks/reassignments')) {
    return `/tasks?tab=reassignments`;
  }

  if (pathname === '/tasks' || pathname === '/kpis' || pathname.startsWith('/projects')) {
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

  // Map
  if (pathname === '/map' || pathname.startsWith('/map/')) {
    return `/map${search}`;
  }

  // Attendance / internal users -> workforce page
  if (
    pathname.startsWith('/operations/attendance') ||
    pathname.startsWith('/workforce') ||
    pathname.startsWith('/internal')
  ) {
    return `/workforce${search}`;
  }

  // Payroll
  if (pathname === '/payroll' || pathname.startsWith('/payroll/')) {
    return `/payroll${search}`;
  }

  // Profile
  if (pathname === '/user/profile' || pathname === '/profile') {
    return '/profile';
  }

  // Assistant
  if (pathname === '/assistant' || pathname.startsWith('/assistant/')) {
    return '/assistant';
  }

  const knownPrefixes = [
    '/task/',
    '/tasks',
    '/map',
    '/meetings',
    '/crm',
    '/field-activity',
    '/workforce',
    '/payroll',
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

export const resolveManagerDeepLink = resolveAgentDeepLink;
