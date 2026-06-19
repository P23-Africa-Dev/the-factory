'use client';

import { useEffect, useRef } from 'react';
import { resolveAvatarSrc } from '@/lib/avatar';
import { useAuth } from './useAuth';
import { useProfile } from '../queries';

export function useAgentIdentity(enabled = true) {
  const { user, updateUser, isSignedIn } = useAuth();
  const { data: profile, isLoading } = useProfile(isSignedIn && enabled);
  const syncedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    const identity = profile.identity;
    const perms = profile.permissions;
    const syncKey = JSON.stringify({
      name: identity?.name,
      avatar_url: identity?.avatar_url,
      access_role: perms?.access_role,
      internal_role: perms?.internal_role,
    });
    if (syncedRef.current === syncKey) return;
    syncedRef.current = syncKey;
    updateUser({
      name: identity?.name ?? user?.name,
      avatar_url: identity?.avatar_url ?? user?.avatar_url ?? null,
      access_role: perms?.access_role ?? user?.access_role,
      internal_role: perms?.internal_role ?? user?.internal_role,
    });
  }, [profile, updateUser, user?.name, user?.avatar_url, user?.access_role, user?.internal_role]);

  const displayName = profile?.identity?.name ?? user?.name ?? 'Agent';
  const firstName = displayName.split(' ')[0] || 'Agent';
  const avatarRaw = profile?.identity?.avatar_url ?? user?.avatar_url ?? null;
  const avatarSrc = resolveAvatarSrc(avatarRaw);
  const userRole =
    user?.access_role ??
    user?.internal_role ??
    profile?.permissions?.access_role ??
    profile?.permissions?.internal_role ??
    null;

  return {
    firstName,
    displayName,
    avatarSrc,
    userRole,
    isLoading: isLoading && !user?.name,
    profile,
  };
}
