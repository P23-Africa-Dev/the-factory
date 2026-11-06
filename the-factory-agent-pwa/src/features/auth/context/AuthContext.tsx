'use client';

import React, {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { appStore, trackingStore, setActiveCompanyId } from '@/lib/storage/stores';
import { clearSavedRoute } from '@/lib/pwa/routeRestoration';
import {
  type AppMode,
  type ManagerRole,
  getStoredAppMode,
  setStoredAppMode,
  getStoredManagerRole,
  setStoredManagerRole,
  getStoredSessionVersion,
  setStoredSessionVersion,
  clearSessionMeta,
  syncSessionCookie,
  clearSessionCookie,
} from '@/session';
import type { LoginResponse, UserCompany } from '../types';

export type AuthUser = {
  id: number | string;
  email: string;
  name?: string;
  company_id?: number;
  companyId?: number | null;
  access_role?: string;
  accessRole?: string | null;
  internal_role?: string;
  internalRole?: string | null;
  avatar_url?: string | null;
  role?: string;
  app_mode?: AppMode;
  manager_role?: ManagerRole;
  user_type?: string;
  userType?: string | null;
  companies?: UserCompany[];
};

export function resolveManagerRole(input: {
  internalRole?: string | null;
  accessRole?: string | null;
  userType?: string | null;
}): ManagerRole {
  const internal = (input.internalRole || '').toLowerCase();
  const access = (input.accessRole || '').toLowerCase();
  if (internal === 'supervisor' || access === 'supervisor') {
    return 'supervisor';
  }
  if (internal === 'admin' || access === 'admin') {
    return 'admin';
  }
  return 'owner';
}

function normalizeUserFields(user: AuthUser): AuthUser {
  const cid = user.company_id ?? (user.companyId != null ? Number(user.companyId) : undefined);
  const internal = user.internal_role ?? (user.internalRole ?? undefined);
  const access = user.access_role ?? (user.accessRole ?? undefined);
  const uType = user.user_type ?? (user.userType ?? undefined);
  const role = user.role ?? user.manager_role ?? internal;

  return {
    ...user,
    company_id: cid,
    companyId: cid,
    internal_role: internal,
    internalRole: internal,
    access_role: access,
    accessRole: access,
    user_type: uType,
    userType: uType,
    role,
  };
}

export type AuthContextType = {
  token: string | null;
  user: AuthUser | null;
  isSignedIn: boolean;
  isLoading: boolean;
  appMode: AppMode | null;
  mode: AppMode | null;
  managerRole: ManagerRole | null;
  login: (tokenOrResponse: string | LoginResponse, user?: AuthUser) => void;
  signIn: (response: LoginResponse) => void;
  updateUser: (partial: Partial<AuthUser>) => void;
  logout: () => void;
  signOut: () => void;
};

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    try {
      const storedToken = appStore.getString('auth_token') || null;
      const storedUserRaw = appStore.getString('auth_user');
      let storedUser: AuthUser | null = storedUserRaw
        ? JSON.parse(storedUserRaw)
        : null;

      const storedMode = getStoredAppMode();
      const storedVersion = getStoredSessionVersion();

      if (storedToken && storedUser) {
        storedUser = normalizeUserFields(storedUser);

        // v1 -> v2 Migration check
        if (storedVersion < 2) {
          if (storedUser.internal_role === 'agent') {
            storedUser.app_mode = 'agent';
            setStoredAppMode('agent');
            setStoredSessionVersion(2);
          } else {
            // Legacy management session holding mobile-agent token -> clean purge
            appStore.clearAll();
            trackingStore.clearAll();
            clearSessionMeta();
            clearSavedRoute();
            setToken(null);
            setUser(null);
            setIsLoading(false);
            return;
          }
        } else if (storedMode) {
          storedUser.app_mode = storedMode;
          storedUser.manager_role = getStoredManagerRole() ?? undefined;
        }

        if (storedUser.company_id && typeof storedUser.company_id === 'number') {
          setActiveCompanyId(storedUser.company_id);
        }

        setToken(storedToken);
        setUser(storedUser);

        void import('@/lib/offline/syncCredentials')
          .then((m) => m.writeSyncCredentials(storedToken, storedUser?.app_mode))
          .catch(() => {});

        void syncSessionCookie(storedToken);
      }
    } catch (err) {
      console.error('[Auth] Hydration error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = useCallback((tokenOrResponse: string | LoginResponse, newUser?: AuthUser) => {
    try {
      let authToken: string;
      let resolvedUser: AuthUser | null = null;
      let appMode: AppMode = 'agent';
      let managerRole: ManagerRole | undefined;

      if (typeof tokenOrResponse === 'string') {
        authToken = tokenOrResponse;
        if (newUser) {
          resolvedUser = normalizeUserFields(newUser);
          appMode = resolvedUser.app_mode || (resolvedUser.internal_role === 'agent' ? 'agent' : 'manager');
          resolvedUser.app_mode = appMode;
          if (appMode === 'manager') {
            managerRole = resolveManagerRole({
              internalRole: resolvedUser.internal_role,
              accessRole: resolvedUser.access_role,
              userType: resolvedUser.user_type,
            });
            resolvedUser.manager_role = managerRole;
            resolvedUser.role = managerRole;
          }
        }
      } else {
        const resp = tokenOrResponse;
        authToken = resp.token;
        appMode = resp.app_mode || (resp.internal_role === 'agent' ? 'agent' : 'manager');

        if (appMode === 'manager') {
          managerRole = resolveManagerRole({
            internalRole: resp.internal_role || resp.user?.internal_role,
            accessRole: resp.access_role,
            userType: resp.user_type || resp.user?.user_type,
          });
        }

        const resolvedCompanyId =
          resp.user?.company_id ??
          (resp.companies?.[0]?.id ? Number(resp.companies[0].id) : undefined);

        resolvedUser = normalizeUserFields({
          id: resp.user?.id ?? 0,
          email: resp.user?.email ?? '',
          name: resp.user?.name,
          company_id: resolvedCompanyId,
          companyId: resolvedCompanyId,
          access_role: resp.access_role,
          accessRole: resp.access_role,
          internal_role: resp.internal_role || resp.user?.internal_role,
          internalRole: resp.internal_role || resp.user?.internal_role,
          avatar_url: resp.user?.avatar_url ?? resp.user?.avatar,
          app_mode: appMode,
          manager_role: managerRole,
          role: managerRole || resp.internal_role || resp.user?.internal_role,
          user_type: resp.user_type || resp.user?.user_type,
          userType: resp.user_type || resp.user?.user_type,
          companies: resp.companies,
        });
      }

      appStore.set('auth_token', authToken);
      setStoredAppMode(appMode);
      setStoredSessionVersion(2);
      if (managerRole) {
        setStoredManagerRole(managerRole);
      } else {
        setStoredManagerRole(null);
      }

      if (resolvedUser) {
        appStore.set('auth_user', JSON.stringify(resolvedUser));
        if (typeof resolvedUser.company_id === 'number') {
          setActiveCompanyId(resolvedUser.company_id);
        }
      } else {
        appStore.delete('auth_user');
      }

      setToken(authToken);
      setUser(resolvedUser);

      void import('@/lib/offline/syncCredentials')
        .then((m) => m.writeSyncCredentials(authToken, appMode))
        .catch(() => {});

      void syncSessionCookie(authToken);
    } catch (err) {
      console.error('[Auth] Login error:', err);
    }
  }, []);

  const signIn = useCallback((response: LoginResponse) => {
    login(response);
  }, [login]);

  const updateUser = useCallback((partial: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = normalizeUserFields({ ...prev, ...partial });
      const changed = (Object.keys(partial) as Array<keyof AuthUser>).some(
        (key) => prev[key] !== next[key],
      );
      if (!changed) return prev;

      try {
        appStore.set('auth_user', JSON.stringify(next));
        if (typeof next.company_id === 'number') {
          setActiveCompanyId(next.company_id);
        }
      } catch (err) {
        console.error('[Auth] Failed to persist user update:', err);
      }
      return next;
    });
  }, []);

  const logout = useCallback(() => {
    try {
      void clearSessionCookie();

      // Broadcast logout so background sync/tracking loops terminate immediately
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('factory-auth-channel');
        bc.postMessage({ type: 'LOGOUT' });
        bc.close();
      }

      // Tell Service Worker to drop background tasks and sync meta
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'TERMINATE_SYNC' });
        navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_SYNC_META' });
      }

      // Best effort backend revoking
      const currentToken = appStore.getString('auth_token');
      if (currentToken) {
        import('@/lib/api/client')
          .then(({ client }) => {
            try {
              return client.post('/auth/logout');
            } catch {
              // ignore
            }
          })
          .catch(() => {});
      }

      // 1. Clear app and tracking stores
      appStore.clearAll();
      trackingStore.clearAll();
      clearSessionMeta();
      clearSavedRoute();

      // 2. Clear local and session storage
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

      // 4. Clear IndexedDB databases (both agent and manager)
      if (typeof indexedDB !== 'undefined') {
        try {
          indexedDB.deleteDatabase('factory-agent-pwa');
          indexedDB.deleteDatabase('factory-manager-pwa-db');
        } catch (dbErr) {
          console.warn('[Auth] IndexedDB deletion failed:', dbErr);
        }
      }

      // 5. Clear Cache Storage
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

      // 7. Hard redirect to /login to completely flush memory
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    } catch (err) {
      console.error('[Auth] Logout error:', err);
    }
  }, []);

  const value = useMemo(
    () => ({
      token,
      user,
      isSignedIn: !!token,
      isLoading,
      appMode: user?.app_mode ?? getStoredAppMode(),
      mode: user?.app_mode ?? getStoredAppMode(),
      managerRole: user?.manager_role ?? getStoredManagerRole(),
      login,
      signIn,
      updateUser,
      logout,
      signOut: logout,
    }),
    [token, user, isLoading, login, signIn, updateUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
