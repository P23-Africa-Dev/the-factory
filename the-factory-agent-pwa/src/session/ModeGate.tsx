'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/features/auth';
import type { AppMode } from './appMode';
import { homeFor } from './appMode';
import { syncSessionCookie } from './sessionCookie';

interface ModeGateProps {
  mode: AppMode;
  children: React.ReactNode;
}

export function ModeGate({ mode, children }: ModeGateProps): React.JSX.Element {
  const { isSignedIn, isLoading, user, token } = useAuth();
  const router = useRouter();

  const userMode = user?.app_mode;

  useEffect(() => {
    if (isLoading) return;

    if (!isSignedIn || !user) {
      router.replace('/login');
      return;
    }

    if (userMode && userMode !== mode) {
      console.warn(`[ModeGate] Cross-mode navigation blocked: expected ${mode}, current user mode is ${userMode}`);
      router.replace(homeFor(userMode));
      return;
    }

    // Self-heal session cookie in background if needed
    if (token) {
      void syncSessionCookie(token);
    }
  }, [isLoading, isSignedIn, user, userMode, mode, router, token]);

  if (isLoading || !isSignedIn || !user) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen bg-[#0A1D25]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
      </div>
    );
  }

  // Guard against flash of unauthorized mode UI
  if (userMode && userMode !== mode) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen bg-[#0A1D25]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}

