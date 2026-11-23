/**
 * Single source of truth for "where does tapping this notification go?".
 *
 * Used by every notification surface so they all land on the same screen:
 * - In-app notification drawer (agent + manager)
 * - Web Push clicks in the installed PWA (service worker → /open-notification)
 * - FCM push taps in the Android APK (Capacitor PushNotifications)
 * - Local tray alerts raised by the app itself (Capacitor LocalNotifications / SW)
 *
 * Entity identifiers (task / lead / meeting ids from metadata or reference_*) win over
 * `action_url`, because many backend action URLs point at dashboard-only pages
 * (`/dashboard`, `/insight`, `/crm/leads`) even when the record id is known.
 */
import type { AppMode } from '@/session/appMode';
import { readSession } from '@/session/sessionStore';
import { resolveAgentDeepLink } from './resolveAgentDeepLink';

export type NotificationTargetSource = {
  type?: string | null;
  actionUrl?: string | null;
  actionRoute?: string | null;
  referenceType?: string | null;
  referenceId?: number | string | null;
  metadata?: Record<string, unknown> | null;
};

/** Wire format shared by push payloads, SW messages and the /open-notification URL. */
export type NotificationClickPayload = {
  notification_id?: number | string | null;
  type?: string | null;
  action_url?: string | null;
  raw_action_url?: string | null;
  action_route?: string | null;
  reference_type?: string | null;
  reference_id?: number | string | null;
  task_id?: number | string | null;
  lead_id?: number | string | null;
  meeting_id?: number | string | null;
  metadata?: Record<string, unknown> | string | null;
  /** Already-resolved in-app path (alerts raised locally by the app). */
  url?: string | null;
};

export const OPEN_NOTIFICATION_PATH = '/open-notification';

function positiveInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value.trim())) return Number(value.trim());
  return null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** `App\Models\Crm\Lead` → `lead` */
function referenceBaseName(referenceType: string | null | undefined): string {
  if (!referenceType) return '';
  const parts = referenceType.split(/[\\/.]/);
  return (parts[parts.length - 1] ?? '').toLowerCase();
}

function pathOf(url: string | null): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) {
    try {
      return new URL(url).pathname;
    } catch {
      return url;
    }
  }
  const path = url.split(/[?#]/)[0] ?? '';
  return path.startsWith('/') ? path : `/${path}`;
}

function resolveMode(mode?: AppMode): AppMode {
  if (mode) return mode;
  try {
    return readSession()?.app_mode === 'manager' ? 'manager' : 'agent';
  } catch {
    return 'agent';
  }
}

/**
 * Pick the dashboard-style path that best identifies the notification's source.
 * The result is then mapped onto real PWA routes by `resolveAgentDeepLink`.
 */
function sourcePath(source: NotificationTargetSource, mode: AppMode): string | null {
  const type = (source.type ?? '').toLowerCase();
  const meta = source.metadata ?? {};
  const ref = referenceBaseName(source.referenceType);
  const refId = positiveInt(source.referenceId);
  const actionUrl = nonEmpty(source.actionUrl) ?? (source.actionRoute?.trim().startsWith('/') ? source.actionRoute.trim() : null);
  const actionPath = pathOf(actionUrl).replace(/^\/(agent|management|manager)(?=\/|$)/, '');

  const taskId = positiveInt(meta.task_id) ?? (ref === 'task' ? refId : null);
  const leadId = positiveInt(meta.lead_id) ?? (ref === 'lead' ? refId : null);
  const meetingId = positiveInt(meta.meeting_id) ?? (ref === 'meeting' ? refId : null);
  const isDeleted = /(^|[._])(deleted|removed)$/.test(type);

  // Live-tracking alerts intentionally open the map focused on the task.
  if (actionPath === '/map' || actionPath.startsWith('/map/')) return actionUrl;

  // The notification type names its domain; ids only decide which record to open.
  const domain = type.startsWith('meeting.')
    ? 'meeting'
    : type.startsWith('crm.')
      ? 'crm'
      : type.startsWith('task.')
        ? 'task'
        : type.startsWith('field_activity.') || ref === 'fieldstop' || ref === 'fielddailysummary'
          ? 'field'
          : meetingId
            ? 'meeting'
            : leadId
              ? 'crm'
              : taskId
                ? 'task'
                : null;

  switch (domain) {
    case 'meeting':
      return meetingId && !isDeleted ? `/meetings/${meetingId}` : '/meetings';

    case 'crm':
      if (leadId && !isDeleted) return `/crm/leads/${leadId}`;
      return actionPath.startsWith('/crm') ? actionUrl : '/crm/leads';

    case 'task':
      if (type === 'task.reassignment_requested') {
        // Managers act on requests from the reassignment inbox; agents view the task.
        if (mode === 'manager') return '/tasks/reassignments';
        return taskId ? `/tasks/${taskId}` : '/tasks';
      }
      if (taskId) return isDeleted ? '/tasks' : `/tasks/${taskId}`;
      return actionUrl ?? '/tasks';

    case 'field':
      if (taskId) return `/tasks/${taskId}`;
      // Agent links carry `?inbox=1` for the pending-review pile.
      return actionPath.startsWith('/field-activity') ? actionUrl : '/field-activity';

    default:
      return actionUrl;
  }
}

/** Resolve the in-app route a notification should open for the given (or current) mode. */
export function resolveNotificationTarget(
  source: NotificationTargetSource,
  options: { mode?: AppMode } = {},
): string {
  const mode = resolveMode(options.mode);
  return resolveAgentDeepLink(sourcePath(source, mode), { mode, allowAbsolute: false });
}

function parseMetadata(raw: NotificationClickPayload['metadata']): Record<string, unknown> {
  if (raw && typeof raw === 'object') return raw;
  if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>;
    } catch {
      // ignore
    }
  }
  return {};
}

/** Convert a push / SW / URL payload (snake_case, string values allowed) into a target source. */
export function sourceFromPayload(payload: NotificationClickPayload | Record<string, unknown>): NotificationTargetSource {
  const p = payload as NotificationClickPayload;
  const metadata = { ...parseMetadata(p.metadata) };
  for (const key of ['task_id', 'lead_id', 'meeting_id'] as const) {
    if (metadata[key] == null && p[key] != null && p[key] !== '') metadata[key] = p[key];
  }
  return {
    type: nonEmpty(p.type),
    // Prefer the backend's original URL; `action_url` may be pre-mapped for agents only.
    actionUrl: nonEmpty(p.raw_action_url) ?? nonEmpty(p.action_url) ?? nonEmpty(p.url),
    actionRoute: nonEmpty(p.action_route),
    referenceType: nonEmpty(p.reference_type),
    referenceId: positiveInt(p.reference_id),
    metadata,
  };
}

export function resolveNotificationTargetFromPayload(
  payload: NotificationClickPayload | Record<string, unknown>,
  options: { mode?: AppMode } = {},
): string {
  return resolveNotificationTarget(sourceFromPayload(payload), options);
}

// ── Navigation plumbing ─────────────────────────────────────────────────────

type Navigator = (path: string) => void;

let navigator_: Navigator | null = null;

/** Registered by the agent / manager shells so taps use client-side routing. */
export function registerNotificationNavigator(fn: Navigator | null): void {
  navigator_ = fn;
}

const NAV_FLAG_KEY = 'f23:notification_nav_at';
const PENDING_KEY = 'f23:pending_notification';
const NAV_FLAG_TTL_MS = 15_000;

/** Tells route restoration not to override a notification deep link. */
export function markNotificationNavigation(): void {
  try {
    window.sessionStorage.setItem(NAV_FLAG_KEY, String(Date.now()));
  } catch {
    // ignore
  }
}

export function hasRecentNotificationNavigation(): boolean {
  try {
    const at = Number(window.sessionStorage.getItem(NAV_FLAG_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < NAV_FLAG_TTL_MS;
  } catch {
    return false;
  }
}

/** Navigate to an already-resolved in-app path. */
export function openNotificationTarget(path: string): void {
  if (typeof window === 'undefined') return;
  markNotificationNavigation();
  if (navigator_) {
    navigator_(path);
    return;
  }
  window.location.assign(path);
}

/** Keep a tapped notification until the user signs in, then open it. */
export function storePendingNotification(payload: NotificationClickPayload): void {
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function hasPendingNotification(): boolean {
  try {
    return window.sessionStorage.getItem(PENDING_KEY) != null;
  } catch {
    return false;
  }
}

export function takePendingNotification(): NotificationClickPayload | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(PENDING_KEY);
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as NotificationClickPayload) : null;
  } catch {
    return null;
  }
}

/** Encode a payload into the `/open-notification` URL used by the service worker. */
export function buildOpenNotificationUrl(payload: NotificationClickPayload): string {
  return `${OPEN_NOTIFICATION_PATH}?d=${encodeURIComponent(JSON.stringify(payload))}`;
}

export function parseOpenNotificationParam(raw: string | null): NotificationClickPayload | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as NotificationClickPayload) : null;
  } catch {
    return null;
  }
}
