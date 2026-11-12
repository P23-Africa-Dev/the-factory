'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/features/auth';
import { client } from '@/lib/api/client';
import { toast } from 'sonner';

const REVALIDATION_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

type MobileSessionResponse = {
  data: {
    app_mode: 'agent' | 'manager' | 'legacy_mobile_agent' | 'unknown';
    home_path: string;
    user_type: string | null;
    access_role: string | null;
    internal_role: string | null;
    companies: Array<{ id: number; company_id: string; name: string; role: string }>;
    user: Record<string, unknown>;
  };
};

export function useSessionRevalidation(): void {
  const { isSignedIn, token, user, logout, updateUser } = useAuth();
  const checkingRef = useRef(false);

  useEffect(() => {
    if (!isSignedIn || !token) return;

    const performRevalidation = async () => {
      if (checkingRef.current) return;
      checkingRef.current = true;

      try {
        const res = await client.get<MobileSessionResponse>('/mobile/session');
        const session = res.data.data;

        if (session.app_mode === 'legacy_mobile_agent') {
          toast.info('Factory 23 now includes a dedicated Manager experience. Please sign in again.');
          logout();
          return;
        }

        if (session.app_mode !== 'agent' && session.app_mode !== 'manager') {
          return;
        }

        if (user?.app_mode && session.app_mode !== user.app_mode) {
          toast.info('Your permissions have changed. Please sign in again.');
          logout();
          return;
        }

        updateUser({
          app_mode: session.app_mode,
          user_type: session.user_type ?? user?.user_type,
          companies: session.companies,
          access_role: session.access_role ?? user?.access_role,
          internal_role: session.internal_role ?? user?.internal_role,
        });
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        if (status === 401) {
          // Handled by 401 interceptor
        }
      } finally {
        checkingRef.current = false;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void performRevalidation();
      }
    };

    const interval = setInterval(() => {
      void performRevalidation();
    }, REVALIDATION_INTERVAL_MS);

    document.addEventListener('visibilitychange', handleVisibility);

    // Initial check on mount
    void performRevalidation();

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isSignedIn, token, user?.app_mode, logout, updateUser]);
}

