'use client';

import React, { useLayoutEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { resolvePwaAccess, isInstallPath } from '@/lib/pwa/access';
import { isStandaloneMode } from '@/lib/pwa/standalone';
import { getAppLaunchPath } from '@/lib/pwa/launch';

function InstallRedirectSpinner() {
  return (
    <div className="flex flex-1 items-center justify-center min-h-screen bg-[#0A1D25]">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
    </div>
  );
}

export function PwaAccessGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    const result = resolvePwaAccess(pathname);

    if (
      result.bypassReason === 'localhost_dev_bypass' &&
      isInstallPath(pathname) &&
      typeof window !== 'undefined'
    ) {
      const hasInstallIntent = new URLSearchParams(window.location.search).get('install') === 'true';
      if (!hasInstallIntent) {
        setAllowed(false);
        router.replace(getAppLaunchPath());
        return;
      }
    }

    if (result.redirect && result.redirect !== pathname) {
      setAllowed(false);
      router.replace(result.redirect);
      return;
    }

    setAllowed(result.allowed);
  }, [pathname, router]);

  if (allowed === null || !allowed) {
    return <InstallRedirectSpinner />;
  }

  return <>{children}</>;
}

export function useShouldShowInstallBanner(): boolean {
  const pathname = usePathname();
  if (isStandaloneMode()) return false;
  return !isInstallPath(pathname);
}
