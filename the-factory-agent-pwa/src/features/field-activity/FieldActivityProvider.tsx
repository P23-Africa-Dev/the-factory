'use client';

import React, { useEffect } from 'react';
import { useFieldActivityToday } from './queries';
import { useFieldActivityReporter } from './hooks/useFieldActivityReporter';

/**
 * Starts day-level field GPS when attendance-linked session is active.
 * Mount once in the agent shell.
 */
export function FieldActivityProvider({ children }: { children: React.ReactNode }) {
  const { data } = useFieldActivityToday(true);
  const enabled = Boolean(data?.enabled);
  const session = data?.session;
  const isActive = enabled && session?.status === 'active' && session.id != null;

  useFieldActivityReporter({
    sessionId: isActive ? session!.id : null,
    active: Boolean(isActive),
    movingIntervalSeconds: data?.config?.moving_interval_seconds ?? 60,
    stationaryIntervalSeconds: data?.config?.stationary_interval_seconds ?? 300,
  });

  useEffect(() => {
    // Keep session warm after clock-in navigations.
  }, [isActive, session?.id]);

  return <>{children}</>;
}
