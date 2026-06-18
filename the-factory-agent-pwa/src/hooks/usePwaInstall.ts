'use client';

import { useEffect, useState, useCallback } from 'react';
import { getStandaloneSignals, isStandaloneMode } from '@/lib/pwa/standalone';
import {
  getCapturedInstallPrompt,
  subscribeInstallPrompt,
  clearCapturedInstallPrompt,
  type BeforeInstallPromptEvent,
} from '@/lib/pwa/installPromptStore';

export type { BeforeInstallPromptEvent };

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isPlatformInstalled, setIsPlatformInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  const triggerInstall = useCallback(async (promptEvent: BeforeInstallPromptEvent | null) => {
    if (!promptEvent || isStandaloneMode()) return false;

    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      clearCapturedInstallPrompt();
      setDeferredPrompt(null);
      setCanInstall(false);
      return outcome === 'accepted';
    } catch {
      return false;
    }
  }, []);

  const applyPrompt = useCallback(
    (prompt: BeforeInstallPromptEvent | null) => {
      if (isStandaloneMode()) return;
      setDeferredPrompt(prompt);
      setCanInstall(Boolean(prompt));

      if (!prompt) return;

      const urlParams = new URLSearchParams(window.location.search);
      const shouldAutoInstall =
        urlParams.get('install') === 'true' ||
        sessionStorage.getItem('pwa-auto-install') === 'true';

      if (shouldAutoInstall) {
        sessionStorage.removeItem('pwa-auto-install');
        const cleanUrl =
          window.location.pathname +
          window.location.search.replace(/[?&]install=true/, '').replace(/^&/, '?');
        window.history.replaceState({}, '', cleanUrl);
        void triggerInstall(prompt);
      }
    },
    [triggerInstall],
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standalone = getStandaloneSignals().standalone;
    setIsInstalled(standalone);

    if (standalone) return;

    const unsubscribe = subscribeInstallPrompt(applyPrompt);

    void (async () => {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.ready;
      }

      if ('getInstalledRelatedApps' in navigator) {
        try {
          const related = await (
            navigator as Navigator & {
              getInstalledRelatedApps?: () => Promise<Array<{ platform?: string }>>;
            }
          ).getInstalledRelatedApps?.();
          setIsPlatformInstalled(Boolean(related && related.length > 0));
        } catch {
          // Unsupported or blocked
        }
      }

      if (getCapturedInstallPrompt()) {
        applyPrompt(getCapturedInstallPrompt());
      }
    })();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('install') === 'true') {
      sessionStorage.setItem('pwa-auto-install', 'true');
    }

    return unsubscribe;
  }, [applyPrompt]);

  const install = () => {
    if (deferredPrompt) {
      return triggerInstall(deferredPrompt);
    }
    return Promise.resolve(false);
  };

  return { canInstall, isInstalled, isPlatformInstalled, install, deferredPrompt };
}
