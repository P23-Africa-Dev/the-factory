'use client';

import { useMemo } from 'react';
import { resolveAvatarSrc } from '@/lib/avatar';
import { useAuth } from './useAuth';
import { useProfile } from '../queries';
import type { ManagerRole, Profile } from '../types';
import { resolveManagerRole } from '../context/AuthContext';

export type ManagerIdentity = {
  id: number | null;
  name: string;
  displayName: string;
  firstName: string;
  email: string;
  phone: string;
  avatarUrl: string | null;
  avatarSrc: string;
  userRole: string | null;
  role: ManagerRole;
  roleLabel: 'Owner' | 'Admin' | 'Supervisor';
  isOwner: boolean;
  isAdmin: boolean;
  isSupervisor: boolean;
  companyName: string | null;
  companyId: number | null;
  isLoading: boolean;
  profile: Profile | undefined;
};

export function useManagerIdentity(enabled = true): ManagerIdentity {
  const { user, isSignedIn } = useAuth();
  const { data: profile, isLoading } = useProfile(isSignedIn && enabled);

  return useMemo(() => {
    const identity = profile?.identity;
    const perms = profile?.permissions;
    const org = profile?.organization;

    const fullName =
      identity?.name ||
      user?.name ||
      'Manager';
    const firstName =
      fullName.split(' ')[0] ||
      'Manager';

    const avatarUrl = identity?.avatar_url || null;
    const avatarSrc = resolveAvatarSrc(avatarUrl);

    const internalRole =
      perms?.internal_role ||
      (typeof org?.internal_role === 'string' ? org.internal_role : null) ||
      user?.internalRole ||
      null;
    const accessRole =
      perms?.access_role ||
      user?.accessRole ||
      null;
    const userType =
      (typeof org?.user_type === 'string' ? org.user_type : null) ||
      user?.userType ||
      null;

    const role = resolveManagerRole({
      internalRole,
      accessRole,
      userType,
    });

    const roleLabel: 'Owner' | 'Admin' | 'Supervisor' =
      role === 'supervisor'
        ? 'Supervisor'
        : role === 'admin'
          ? 'Admin'
          : 'Owner';

    const companyName =
      org?.company_name ||
      (typeof org?.company?.name === 'string' ? org.company.name : null) ||
      (typeof org?.assigned_company?.name === 'string' ? org.assigned_company.name : null) ||
      null;

    const companyId =
      org?.company_id ||
      org?.company?.id ||
      org?.assigned_company?.id ||
      user?.companyId ||
      null;

    return {
      id: identity?.id ? Number(identity.id) : (user?.id ? Number(user.id) : null),
      name: fullName,
      displayName: fullName,
      firstName,
      email: identity?.email || user?.email || '',
      phone: identity?.phone || '',
      avatarUrl,
      avatarSrc,
      userRole: accessRole || internalRole || role,
      role,
      roleLabel,
      isOwner: role === 'owner',
      isAdmin: role === 'admin',
      isSupervisor: role === 'supervisor',
      companyName,
      companyId: companyId ? Number(companyId) : null,
      isLoading: isLoading && !user?.name,
      profile,
    };
  }, [profile, user, isLoading]);
}
