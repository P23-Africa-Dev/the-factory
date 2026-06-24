/**
 * Auth context — ported from mobile app.
 * Uses localStorage (via appStore) instead of MMKV/SecureStore.
 */
'use client';

import React, { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { appStore, trackingStore, setActiveCompanyId } from '@/lib/storage/stores';
import { clearSavedRoute } from '@/lib/pwa/routeRestoration';

export type AuthUser = {
  id: number | string;
  email: string;
  name?: string;
  company_id?: number;
  access_role?: string;
  internal_role?: string;
  avatar_url?: string | null;
};

type AuthContextType = {
  token: string | null;
  user: AuthUser | null;
  isSignedIn: boolean;
  isLoading: boolean;
  login: (token: string, user?: AuthUser) => void;
  updateUser: (partial: Partial<AuthUser>) => void;
  logout: () => void;
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
      const storedUser: AuthUser | null = storedUserRaw
        ? JSON.parse(storedUserRaw)
        : null;
      if (storedUser?.company_id && typeof storedUser.company_id === 'number') {
        setActiveCompanyId(storedUser.company_id);
      }
      setTimeout(() => setToken(storedToken), 0);
      setTimeout(() => setUser(storedUser), 0);
    } catch (err) {
      console.error('[Auth] Hydration error:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const login = (newToken: string, newUser?: AuthUser) => {
    try {
      appStore.set('auth_token', newToken);
      if (newUser) {
        appStore.set('auth_user', JSON.stringify(newUser));
        if (typeof newUser.company_id === 'number') {
          setActiveCompanyId(newUser.company_id);
        }
      } else {
        appStore.delete('auth_user');
      }
      setToken(newToken);
      setUser(newUser ?? null);
    } catch (err) {
      console.error('[Auth] Login error:', err);
    }
  };

  const updateUser = useCallback((partial: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      const changed = (Object.keys(partial) as Array<keyof AuthUser>).some(
        (key) => prev[key] !== next[key],
      );
      if (!changed) return prev;
      try {
        appStore.set('auth_user', JSON.stringify(next));
      } catch (err) {
        console.error('[Auth] updateUser error:', err);
      }
      return next;
    });
  }, []);

  const logout = () => {
    try {
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

      // 7. Hard redirect to login page to completely clear JS memory space (React Query, etc.)
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    } catch (err) {
      console.error('[Auth] Logout error:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{ token, user, isSignedIn: !!token, isLoading, login, updateUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};
