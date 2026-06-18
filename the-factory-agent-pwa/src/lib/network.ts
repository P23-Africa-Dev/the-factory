/**
 * Network status hook — replaces @react-native-community/netinfo.
 * Uses navigator.onLine + online/offline event listeners (client only).
 */
'use client';

import { useState, useEffect } from 'react';

function getBrowserOnlineStatus(): boolean {
  if (typeof window === 'undefined') return true;
  return navigator.onLine;
}

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true);
  const [isClientReady, setIsClientReady] = useState(false);

  useEffect(() => {
    setIsClientReady(true);
    setIsConnected(getBrowserOnlineStatus());

    const handleOnline = () => setIsConnected(true);
    const handleOffline = () => setIsConnected(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isConnected: isClientReady ? isConnected : true };
}

/**
 * Subscribe to network changes (non-hook version for use outside React).
 * Returns an unsubscribe function, mirroring NetInfo.addEventListener pattern.
 */
export function onNetworkChange(
  callback: (state: { isConnected: boolean }) => void,
): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const handleOnline = () => callback({ isConnected: true });
  const handleOffline = () => callback({ isConnected: false });

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
