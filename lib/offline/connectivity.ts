"use client";

import { useEffect, useState } from "react";

export function getBrowserOnlineStatus(): boolean {
  // SSR / RSC: never treat the app as offline (Node may expose navigator.onLine=false).
  if (typeof window === "undefined") return true;
  return navigator.onLine;
}

export function subscribeConnectivity(
  listener: (isOnline: boolean) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleOnline = () => listener(true);
  const handleOffline = () => listener(false);

  window.addEventListener("online", handleOnline);
  window.addEventListener("offline", handleOffline);

  return () => {
    window.removeEventListener("online", handleOnline);
    window.removeEventListener("offline", handleOffline);
  };
}

export function useConnectivityStatus() {
  const [isOnline, setIsOnline] = useState(() =>
    typeof window !== "undefined" ? getBrowserOnlineStatus() : true
  );
  const [isClientReady] = useState(() => typeof window !== "undefined");

  useEffect(() => {
    const unsubscribe = subscribeConnectivity((online) => {
      setIsOnline(online);
    });
    return unsubscribe;
  }, []);

  const isOffline = isClientReady && !isOnline;

  return { isOnline, isOffline, isClientReady };
}
