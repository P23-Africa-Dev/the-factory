'use client';

import { useEffect, useState, useRef } from 'react';
import { isStandaloneMode } from '@/lib/pwa/standalone';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    setIsInstalled(isStandaloneMode());

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();

      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      setCanInstall(true);

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

        void triggerInstall(promptEvent);
      }
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
      setCanInstall(false);
      sessionStorage.removeItem('pwa-auto-install');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('install') === 'true') {
      sessionStorage.setItem('pwa-auto-install', 'true');
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = async (
    promptEvent: BeforeInstallPromptEvent | null = deferredPrompt,
  ) => {
    if (!promptEvent) return false;

    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      setDeferredPrompt(null);
      setCanInstall(false);
      return outcome === 'accepted';
    } catch {
      return false;
    }
  };

  const install = () => {
    if (deferredPrompt) {
      return triggerInstall(deferredPrompt);
    }
    return Promise.resolve(false);
  };

  return { canInstall, isInstalled, install, deferredPrompt };
}
