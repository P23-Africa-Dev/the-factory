/**
 * Auth context — ported from mobile app.
 * Uses localStorage (via appStore) instead of MMKV/SecureStore.
 */
'use client';

import React, { createContext, useState, useEffect, type ReactNode } from 'react';
import { appStore, setActiveCompanyId } from '@/lib/storage/stores';

export type AuthUser = {
  id: number | string;
  email: string;
  name?: string;
  company_id?: number;
  access_role?: string;
  internal_role?: string;
};

type AuthContextType = {
  token: string | null;
  user: AuthUser | null;
  isSignedIn: boolean;
  isLoading: boolean;
  login: (token: string, user?: AuthUser) => void;
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

  const logout = () => {
    try {
      appStore.delete('auth_token');
      appStore.delete('auth_user');
      setToken(null);
      setUser(null);
    } catch (err) {
      console.error('[Auth] Logout error:', err);
    }
  };

  return (
    <AuthContext.Provider
      value={{ token, user, isSignedIn: !!token, isLoading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
};
