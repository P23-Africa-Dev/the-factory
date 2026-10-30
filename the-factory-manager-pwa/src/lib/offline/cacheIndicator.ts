'use client';

import { useEffect, useState } from 'react';

let showingCachedData = false;
const listeners = new Set<() => void>();

export function setShowingCachedData(value: boolean): void {
  if (showingCachedData === value) return;
  showingCachedData = value;
  listeners.forEach((listener) => listener());
}

export function getShowingCachedData(): boolean {
  return showingCachedData;
}

export function useShowingCachedData(): boolean {
  const [value, setValue] = useState(showingCachedData);

  useEffect(() => {
    const listener = () => setValue(showingCachedData);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return value;
}
