"use client";

import { useEffect, useState } from "react";

export function getBrowserOnlineStatus(): boolean {
  if (typeof navigator === "undefined") return true;
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
  const [isOnline, setIsOnline] = useState(getBrowserOnlineStatus);

  useEffect(() => subscribeConnectivity(setIsOnline), []);

  return { isOnline, isOffline: !isOnline };
}
