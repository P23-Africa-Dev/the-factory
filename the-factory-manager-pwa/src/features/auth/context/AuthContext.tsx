'use client';

import React, { createContext, useCallback, useEffect, useState } from 'react';
import { appStore, setActiveCompanyId } from '@/lib/storage/stores';
import { clearSavedRoute } from '@/lib/pwa/routeRestoration';
import { clearSyncCredentials, writeSyncCredentials } from '@/lib/offline/syncCredentials';
import type { LoginResponse, ManagerRole } from '../types';

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  companyId: number | null;
  role: ManagerRole;
  internalRole: string | null;
  accessRole: string | null;
  internal_role?: string | null;
  access_role?: string | null;
  userType: string | null;
};

type AuthContextValue = {
  isSignedIn: boolean;
  isLoading: boolean;
  user: AuthUser | null;
  signIn: (response: LoginResponse) => void;
  signOut: () => void;
  logout: () => void;
};

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const USER_KEYS = {
  token: 'auth_token',
  id: 'user_id',
  email: 'user_email',
  name: 'user_name',
  companyId: 'company_id',
  role: 'manager_role',
  internalRole: 'internal_role',
  accessRole: 'access_role',
  userType: 'user_type',
} as const;

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
  if (internal === 'admin') {
    return 'admin';
  }
  return 'owner';
}

function readStoredUser(): AuthUser | null {
  try {
    const id = appStore.getString(USER_KEYS.id);
    if (!id) return null;
    const internalRole = appStore.getString(USER_KEYS.internalRole) ?? null;
    const accessRole = appStore.getString(USER_KEYS.accessRole) ?? null;
    const userType = appStore.getString(USER_KEYS.userType) ?? null;
    const storedRole = appStore.getString(USER_KEYS.role) as ManagerRole | undefined;
    return {
      id,
      email: appStore.getString(USER_KEYS.email) ?? '',
      name: appStore.getString(USER_KEYS.name) ?? '',
      companyId: appStore.getNumber(USER_KEYS.companyId) ?? null,
      role: storedRole || resolveManagerRole({ internalRole, accessRole, userType }),
      internalRole,
      accessRole,
      internal_role: internalRole,
      access_role: accessRole,
      userType,
    };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    try {
      const token = appStore.getString(USER_KEYS.token);
      if (token) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsSignedIn(true);
        setUser(readStoredUser());
        void writeSyncCredentials(token);
      }
    } catch {
      // Storage unavailable
    } finally {
      setIsLoading(false);
    }
  }, []);

  const signIn = useCallback((response: LoginResponse) => {
    const internalRole = response.internal_role ?? response.user?.internal_role ?? null;
    const accessRole = response.access_role ?? null;
    const userType = response.user_type ?? response.user?.user_type ?? null;

    if (internalRole === 'agent' || accessRole === 'agent') {
      throw new Error(
        'This app is exclusively for Factory 23 Managers (Owners, Admins, and Supervisors). Please sign in using the Factory 23 Agent app.',
      );
    }

    const role = resolveManagerRole({ internalRole, accessRole, userType });
    const resolvedCompanyId =
      response.user?.company_id ??
      response.user?.companies?.[0]?.id ??
      null;

    try {
      appStore.set(USER_KEYS.token, response.token);
      appStore.set(USER_KEYS.role, role);
      if (internalRole) appStore.set(USER_KEYS.internalRole, internalRole);
      else appStore.delete(USER_KEYS.internalRole);

      if (accessRole) appStore.set(USER_KEYS.accessRole, accessRole);
      else appStore.delete(USER_KEYS.accessRole);

      if (userType) appStore.set(USER_KEYS.userType, userType);
      else appStore.delete(USER_KEYS.userType);

      if (response.user) {
        appStore.set(USER_KEYS.id, String(response.user.id));
        appStore.set(USER_KEYS.email, response.user.email);
        appStore.set(USER_KEYS.name, response.user.name);
      }
      if (resolvedCompanyId != null && Number(resolvedCompanyId) > 0) {
        setActiveCompanyId(Number(resolvedCompanyId));
      }
      void writeSyncCredentials(response.token);
    } catch {
      // Non-fatal
    }

    setUser(
      response.user
        ? {
            id: String(response.user.id),
            email: response.user.email,
            name: response.user.name,
            companyId: resolvedCompanyId ? Number(resolvedCompanyId) : null,
            role,
            internalRole,
            accessRole,
            internal_role: internalRole,
            access_role: accessRole,
            userType,
          }
        : null,
    );
    setIsSignedIn(true);
  }, []);

  const signOut = useCallback(() => {
    try {
      Object.values(USER_KEYS).forEach((k) => appStore.delete(k));
      clearSavedRoute();
      void clearSyncCredentials();
    } catch {
      // Non-fatal
    }
    setUser(null);
    setIsSignedIn(false);
  }, []);

  return (
    <AuthContext.Provider value={{ isSignedIn, isLoading, user, signIn, signOut, logout: signOut }}>
      {children}
    </AuthContext.Provider>
  );
}
