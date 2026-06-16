'use client';

import { useEffect, useState, useRef } from 'react';

export function usePwaInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const deferredPrompt = useRef<any>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Check if already in standalone mode (installed)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (navigator as any).standalone 
      || document.referrer.includes('android-app://');
    
    setIsInstalled(isStandalone);

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent standard browser install prompts
      e.preventDefault();
      // Store event
      deferredPrompt.current = e;
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setCanInstall(false);
      deferredPrompt.current = null;
    };

    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (!deferredPrompt.current) return false;
    
    try {
      deferredPrompt.current.prompt();
      const { outcome } = await deferredPrompt.current.userChoice;
      deferredPrompt.current = null;
      setCanInstall(false);
      return outcome === 'accepted';
    } catch {
      return false;
    }
  };

  return { canInstall, promptInstall, isInstalled };
}
