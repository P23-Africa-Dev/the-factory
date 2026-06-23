'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type BottomNavVisibilityContextValue = {
  isHidden: boolean;
  hide: () => void;
  show: () => void;
};

const BottomNavVisibilityContext = createContext<BottomNavVisibilityContextValue | null>(null);

export function BottomNavVisibilityProvider({ children }: { children: ReactNode }) {
  const [hiddenCount, setHiddenCount] = useState(0);

  const hide = useCallback(() => {
    setHiddenCount((count) => count + 1);
  }, []);

  const show = useCallback(() => {
    setHiddenCount((count) => Math.max(0, count - 1));
  }, []);

  const value = useMemo(
    () => ({
      isHidden: hiddenCount > 0,
      hide,
      show,
    }),
    [hiddenCount, hide, show],
  );

  return (
    <BottomNavVisibilityContext.Provider value={value}>
      {children}
    </BottomNavVisibilityContext.Provider>
  );
}

export function useBottomNavVisibility(): BottomNavVisibilityContextValue {
  const context = useContext(BottomNavVisibilityContext);
  if (!context) {
    throw new Error('useBottomNavVisibility must be used within BottomNavVisibilityProvider');
  }
  return context;
}
