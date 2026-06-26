'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PermissionStatus } from './useGeolocation';
import { useGeolocation } from './useGeolocation';

const DISMISS_KEY = 'location_gate_dismissed_home';

export function useLocationPermissionBootstrap(): {
  gateVisible: boolean;
  gateMode: 'request' | 'denied';
  isGateBusy: boolean;
  dismissGate: () => void;
  retryGate: () => Promise<void>;
} {
  const {
    ensureLocationPermission,
    retryLocationPermission,
    checkPermission,
    getCurrentPosition,
  } = useGeolocation();
  const [gateVisible, setGateVisible] = useState(false);
  const [gateMode, setGateMode] = useState<'request' | 'denied'>('request');
  const [isGateBusy, setIsGateBusy] = useState(false);
  const bootstrappedRef = useRef(false);

  const dismissGate = useCallback(() => {
    setGateVisible(false);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // non-fatal
    }
  }, []);

  const applyStatus = useCallback((status: PermissionStatus) => {
    if (status === 'granted') {
      setGateVisible(false);
      void getCurrentPosition().catch(() => {});
      return;
    }
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return;
    } catch {
      // non-fatal
    }
    setGateMode(status === 'denied' ? 'denied' : 'request');
    setGateVisible(true);
  }, [getCurrentPosition]);

  const retryGate = useCallback(async () => {
    setIsGateBusy(true);
    try {
      const status = await retryLocationPermission();
      applyStatus(status);
    } finally {
      setIsGateBusy(false);
    }
  }, [retryLocationPermission, applyStatus]);

  useEffect(() => {
    if (bootstrappedRef.current) return;
    bootstrappedRef.current = true;

    void (async () => {
      const status = await ensureLocationPermission();
      applyStatus(status);
    })();
  }, [ensureLocationPermission, applyStatus]);

  useEffect(() => {
    if (!gateVisible) return;

    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      void checkPermission().then((status) => {
        if (status === 'granted') applyStatus('granted');
      });
    };

    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [gateVisible, checkPermission, applyStatus]);

  return {
    gateVisible,
    gateMode,
    isGateBusy,
    dismissGate,
    retryGate,
  };
}
