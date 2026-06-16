/**
 * Network status hook — replaces @react-native-community/netinfo.
 * Uses navigator.onLine + online/offline event listeners.
 */
'use client';

import { useState, useEffect, useCallback } from 'react';

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );

  useEffect(() => {
    const handleOnline = () => setIsConnected(true);
    const handleOffline = () => setIsConnected(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isConnected };
}

/**
 * Subscribe to network changes (non-hook version for use outside React).
 * Returns an unsubscribe function, mirroring NetInfo.addEventListener pattern.
 */
export function onNetworkChange(
  callback: (state: { isConnected: boolean }) => void,
): () => void {
  const handleOnline = () => callback({ isConnected: true });
  const handleOffline = () => callback({ isConnected: false });

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}
