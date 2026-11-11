/**
 * Auth context — ported from mobile app.
 * Uses localStorage (via appStore) instead of MMKV/SecureStore.
 */
'use client';

import React, {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { appStore, trackingStore, setActiveCompanyId } from '@/lib/storage/stores';
import { clearSavedRoute } from '@/lib/pwa/routeRestoration';
import type { AppMode, ManagerRole } from '@/session/appMode';
import { setStoredAppMode, setStoredManagerRole, getStoredAppMode, getStoredManagerRole } from '@/session/sessionStore';
import { clearSessionCookie } from '@/session/sessionCookie';
import type { UserCompany } from '../types';

export type AuthUser = {
  id: number | string;
  email: string;
  name?: string;
  company_id?: number;
  access_role?: string;
  internal_role?: string;
  avatar_url?: string | null;
  app_mode?: AppMode;
  manager_role?: ManagerRole;
  user_type?: string;
  companies?: UserCompany[];
};

export function resolveManagerRole(input: {
  internalRole?: string | null;
  accessRole?: string | null;
  userType?: string | null;
  companyRole?: string | null;
}): ManagerRole {
  const internalRole = input.internalRole ?? null;
  const accessRole = input.accessRole ?? null;
  const companyRole = input.companyRole ?? null;
  const userType = input.userType ?? null;

  if (internalRole === 'supervisor' || accessRole === 'supervisor' || companyRole === 'supervisor') {
    return 'supervisor';
  }

  if (
    accessRole === 'owner' ||
    companyRole === 'owner' ||
    userType === 'self-serve' ||
    userType === 'enterprise'
  ) {
    return 'owner';
  }

  return 'admin';
}

export type AuthContextType = {
  token: string | null;
  user: AuthUser | null;
  appMode: AppMode | null;
  isSignedIn: boolean;
  isLoading: boolean;
  login: (token: string, user?: AuthUser) => void;
  updateUser: (partial: Partial<AuthUser>) => void;
  logout: () => void;
};

function companyRoleOf(user?: AuthUser | null): string | null {
  const role = user?.companies?.find((company) =>
    company.role === 'owner' || company.role === 'admin' || company.role === 'supervisor',
  )?.role;
  return role ?? null;
}

function withResolvedMode(user?: AuthUser | null): AuthUser | null {
  if (!user) return null;
  const appMode = user.app_mode ?? getStoredAppMode() ?? undefined;
  if (appMode !== 'agent' && appMode !== 'manager') return user;
  const managerRole =
    appMode === 'manager'
      ? user.manager_role ??
        resolveManagerRole({
          internalRole: user.internal_role,
          accessRole: user.access_role,
          userType: user.user_type,
          companyRole: companyRoleOf(user),
        })
      : undefined;
  return { ...user, app_mode: appMode, manager_role: managerRole };
}

function persistSessionMode(user?: AuthUser | null): void {
  if (user?.app_mode === 'agent' || user?.app_mode === 'manager') {
    setStoredAppMode(user.app_mode);
  }
  setStoredManagerRole(user?.app_mode === 'manager' ? (user.manager_role ?? getStoredManagerRole()) : null);
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const hydrate = setTimeout(() => {
      try {
        const storedToken = appStore.getString('auth_token') || null;
        const storedUserRaw = appStore.getString('auth_user');
        const storedUser: AuthUser | null = storedUserRaw
          ? JSON.parse(storedUserRaw)
          : null;
        const resolvedUser = withResolvedMode(storedUser);
        if (resolvedUser?.company_id && typeof resolvedUser.company_id === 'number') {
          setActiveCompanyId(resolvedUser.company_id);
        }
        persistSessionMode(resolvedUser);
        // Apply token and user in the same turn as isLoading so the shell
        // never sees "loaded but signed out" and bounces to /login.
        setToken(storedToken);
        setUser(resolvedUser);
        if (storedToken) {
          void import('@/lib/offline/syncCredentials')
            .then((m) => m.writeSyncCredentials(storedToken))
            .catch(() => {});
        }
      } catch (err) {
        console.error('[Auth] Hydration error:', err);
      } finally {
        setIsLoading(false);
      }
    }, 0);
    return () => clearTimeout(hydrate);
  }, []);

  const login = useCallback((newToken: string, newUser?: AuthUser) => {
    try {
      const resolvedUser = withResolvedMode(newUser ?? null);
      appStore.set('auth_token', newToken);
      if (resolvedUser) {
        appStore.set('auth_user', JSON.stringify(resolvedUser));
        persistSessionMode(resolvedUser);
        if (typeof resolvedUser.company_id === 'number') {
          setActiveCompanyId(resolvedUser.company_id);
        }
      } else {
        appStore.delete('auth_user');
        setStoredManagerRole(null);
      }
      setToken(newToken);
      setUser(resolvedUser);
      void import('@/lib/offline/syncCredentials')
        .then((m) => m.writeSyncCredentials(newToken))
        .catch(() => {});
    } catch (err) {
      console.error('[Auth] Login error:', err);
    }
  }, []);

  const updateUser = useCallback((partial: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = withResolvedMode({ ...prev, ...partial }) ?? prev;
      const changed = (Object.keys(partial) as Array<keyof AuthUser>).some(
        (key) => prev[key] !== next[key],
      );
      if (!changed) return prev;
      try {
        appStore.set('auth_user', JSON.stringify(next));
        persistSessionMode(next);
        if (typeof next.company_id === 'number') {
          setActiveCompanyId(next.company_id);
        }
        const storedToken = appStore.getString('auth_token');
        if (storedToken) {
          void import('@/lib/offline/syncCredentials')
            .then((m) => m.writeSyncCredentials(storedToken))
            .catch(() => {});
        }
      } catch (err) {
        console.error('[Auth] updateUser error:', err);
      }
      return next;
    });
  }, []);

  const logout = useCallback(async () => {
    try {
      // Best-effort: deactivate FCM / clear native push listeners before wiping auth.
      void import('@/features/tracking/native/nativePushNotifications')
        .then((m) => m.unregisterNativePush())
        .catch(() => {});

      // Best-effort: unsubscribe Web Push so this device stops receiving pushes.
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        void navigator.serviceWorker.ready
          .then((reg) => reg.pushManager?.getSubscription())
          .then(async (sub) => {
            if (!sub) return;
            try {
              const { client } = await import('@/lib/api/client');
              await client.delete('/notifications/push-subscriptions', {
                data: { device_token: sub.endpoint },
              });
            } catch {
              // ignore
            }
            try {
              await sub.unsubscribe();
            } catch {
              // ignore
            }
          })
          .catch(() => {});
      }

      // 1. Clear PWA appStore and trackingStore
      appStore.clearAll();
      trackingStore.clearAll();
      clearSavedRoute();

      // 2. Clear all local and session storage
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
      if (typeof sessionStorage !== 'undefined') {
        sessionStorage.clear();
      }

      // 3. Clear all cookies
      if (typeof document !== 'undefined') {
        const cookies = document.cookie.split(';');
        for (const cookie of cookies) {
          const eqPos = cookie.indexOf('=');
          const name = eqPos > -1 ? cookie.substring(0, eqPos).trim() : cookie.trim();
          document.cookie = `${name}=; Path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
        }
      }

      // 4. Clear IndexedDB database
      if (typeof indexedDB !== 'undefined') {
        try {
          indexedDB.deleteDatabase('factory-agent-pwa');
        } catch (dbErr) {
          console.warn('[Auth] IndexedDB deletion failed:', dbErr);
        }
      }

      // 5. Clear Cache Storage (Cache API)
      if (typeof window !== 'undefined' && 'caches' in window) {
        caches.keys().then((names) => {
          for (const name of names) {
            caches.delete(name);
          }
        }).catch(() => {});
      }

      // 6. Reset React states
      setToken(null);
      setUser(null);

      // The mode cookie is HttpOnly, so the browser will not drop it with document.cookie.
      await clearSessionCookie();

      // 7. Hard redirect to login page to completely clear JS memory space (React Query, etc.)
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    } catch (err) {
      console.error('[Auth] Logout error:', err);
    }
  }, []);

  const appMode = user?.app_mode ?? null;

  const value = useMemo(
    () => ({
      token,
      user,
      appMode,
      isSignedIn: !!token,
      isLoading,
      login,
      updateUser,
      logout,
    }),
    [token, user, appMode, isLoading, login, updateUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
