'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { isPwaOnlyModeEnabled, isInstallPath } from '@/lib/pwa/access';
import { isStandaloneMode } from '@/lib/pwa/standalone';
import { isDesktopDevice } from '@/lib/pwa/device';
import { getInstallRedirectPathForClient } from '@/lib/pwa/access';

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

  useEffect(() => {
    if (!isPwaOnlyModeEnabled()) {
      setAllowed(true);
      return;
    }

    if (isInstallPath(pathname)) {
      setAllowed(true);
      return;
    }

    if (isStandaloneMode()) {
      setAllowed(true);
      return;
    }

    setAllowed(false);
    router.replace(getInstallRedirectPathForClient());
  }, [pathname, router]);

  if (allowed === null) {
    return <InstallRedirectSpinner />;
  }

  if (!allowed) {
    return <InstallRedirectSpinner />;
  }

  return <>{children}</>;
}

export function useShouldShowInstallBanner(): boolean {
  const pathname = usePathname();
  return !isInstallPath(pathname);
}
