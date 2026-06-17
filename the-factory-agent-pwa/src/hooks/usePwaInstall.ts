'use client';

import { useEffect, useState, useRef } from 'react';

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

    // Detect if already running in standalone mode (PWA installed and opened)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (navigator as any).standalone 
      || document.referrer.includes('android-app://');

    setIsInstalled(isStandalone);

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent browser default installation prompt mini-infobar
      e.preventDefault();
      
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
      setCanInstall(true);

      // Check if we came from a redirect asking for auto-install
      const urlParams = new URLSearchParams(window.location.search);
      const shouldAutoInstall = urlParams.get('install') === 'true' || sessionStorage.getItem('pwa-auto-install') === 'true';

      if (shouldAutoInstall) {
        // Clear the state/query param to avoid triggering it repeatedly on reload
        sessionStorage.removeItem('pwa-auto-install');
        
        // Strip install=true from URL for clean copy-paste/sharing
        const cleanUrl = window.location.pathname + window.location.search.replace(/[?&]install=true/, '').replace(/^&/, '?');
        window.history.replaceState({}, '', cleanUrl);

        // Attempt automatic install
        triggerInstall(promptEvent);
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

    // Save auto-install request in sessionStorage if event has not fired yet
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('install') === 'true') {
      sessionStorage.setItem('pwa-auto-install', 'true');
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const triggerInstall = async (promptEvent: BeforeInstallPromptEvent | null = deferredPrompt) => {
    if (!promptEvent) return false;

    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      console.log(`PWA Installation Choice: ${outcome}`);
      setDeferredPrompt(null);
      setCanInstall(false);
      return outcome === 'accepted';
    } catch (err) {
      console.warn('PWA auto-install prompt failed or was blocked by browser security rules:', err);
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
