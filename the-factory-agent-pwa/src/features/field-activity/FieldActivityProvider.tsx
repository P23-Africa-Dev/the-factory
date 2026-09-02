'use client';

import React, { useEffect } from 'react';
import { useFieldActivityToday } from './queries';
import { useFieldActivityReporter } from './hooks/useFieldActivityReporter';
import { registerFieldActivityFlush } from './flushRegistry';

/**
 * Starts day-level field GPS when attendance-linked session is active.
 * Mount once in the agent shell.
 */
export function FieldActivityProvider({ children }: { children: React.ReactNode }) {
  const { data } = useFieldActivityToday(true);
  const enabled = Boolean(data?.enabled);
  const session = data?.session;
  const isActive = enabled && session?.status === 'active' && session.id != null;

  const { flush } = useFieldActivityReporter({
    sessionId: isActive ? session!.id : null,
    active: Boolean(isActive),
    movingIntervalSeconds: data?.config?.moving_interval_seconds ?? 30,
    stationaryIntervalSeconds: data?.config?.stationary_interval_seconds ?? 60,
  });

  useEffect(() => {
    // Expose flush so clock-out can push the final leg before the session closes.
    registerFieldActivityFlush(flush);
    return () => registerFieldActivityFlush(null);
  }, [flush]);

  return <>{children}</>;
}
