import { appStore } from '@/lib/storage/stores';
import type { AppMode, ManagerRole } from './appMode';

export const SESSION_KEYS = {
  token: 'auth_token',
  user: 'auth_user',
  mode: 'app_mode',
  managerRole: 'manager_role',
  sessionVersion: 'session_version',
  lastUserMode: 'last_user_mode',
} as const;

export const CURRENT_SESSION_VERSION = 2;

export type SessionSnapshot = {
  token: string | null;
  app_mode: AppMode | null;
  manager_role: ManagerRole | null;
  user: {
    id: number | string;
    email: string;
    name?: string;
    role?: string;
    company_id?: number;
  } | null;
};

export function getStoredAppMode(): AppMode | null {
  const mode = appStore.getString(SESSION_KEYS.mode);
  if (mode === 'agent' || mode === 'manager') return mode;
  return null;
}

export function setStoredAppMode(mode: AppMode): void {
  appStore.set(SESSION_KEYS.mode, mode);
  appStore.set(SESSION_KEYS.lastUserMode, mode);
}

export function getStoredManagerRole(): ManagerRole | null {
  const role = appStore.getString(SESSION_KEYS.managerRole);
  if (role === 'owner' || role === 'admin' || role === 'supervisor') return role;
  return null;
}

export function setStoredManagerRole(role: ManagerRole | null): void {
  if (role) {
    appStore.set(SESSION_KEYS.managerRole, role);
  } else {
    appStore.delete(SESSION_KEYS.managerRole);
  }
}

export function getStoredSessionVersion(): number {
  return appStore.getNumber(SESSION_KEYS.sessionVersion) ?? 0;
}

export function setStoredSessionVersion(version: number = CURRENT_SESSION_VERSION): void {
  appStore.set(SESSION_KEYS.sessionVersion, version);
}

export function clearSessionMeta(): void {
  appStore.delete(SESSION_KEYS.mode);
  appStore.delete(SESSION_KEYS.managerRole);
  appStore.delete(SESSION_KEYS.sessionVersion);
}

export function readSession(): SessionSnapshot | null {
  const token = appStore.getString(SESSION_KEYS.token);
  if (!token) return null;

  const mode = getStoredAppMode();
  const managerRole = getStoredManagerRole();

  let user: SessionSnapshot['user'] = null;
  try {
    const rawUser = appStore.getString(SESSION_KEYS.user);
    if (rawUser) {
      user = JSON.parse(rawUser);
    }
  } catch {
    // Non-fatal
  }

  return {
    token,
    app_mode: mode,
    manager_role: managerRole,
    user,
  };
}
