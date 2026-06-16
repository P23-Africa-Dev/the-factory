'use client';

import React from 'react';
import { sessionEvents } from '@/lib/auth/sessionEvents';
import { useAuth } from '@/features/auth';

const COUNTDOWN_START = 4;

/**
 * Listens for 401 session-expiry events emitted by the Axios interceptor.
 * Shows a full-screen glassmorphism modal with a countdown, then calls logout().
 */
export function SessionExpiredModal(): React.ReactElement | null {
  const { logout, isSignedIn } = useAuth();
  const [visible, setVisible] = React.useState(false);
  const [count, setCount] = React.useState(COUNTDOWN_START);

  React.useEffect(() => {
    const off = sessionEvents.on(() => {
      if (!isSignedIn) return;
      setCount(COUNTDOWN_START);
      setVisible(true);
    });
    return off;
  }, [isSignedIn]);

  React.useEffect(() => {
    if (!visible) return;

    let remaining = COUNTDOWN_START;
    const interval = setInterval(() => {
      remaining -= 1;
      setCount(remaining);
      if (remaining <= 0) {
        clearInterval(interval);
        setVisible(false);
        logout();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [visible, logout]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#051014]/90 backdrop-blur-md px-6">
      <div className="w-full max-w-sm rounded-[28px] border border-white/10 bg-[#0B2330] p-8 text-center shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Lock icon */}
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#FD6046]/15 text-3xl">
          🔒
        </div>

        <h3 className="mb-2 text-xl font-bold text-white font-sans">Session Expired</h3>
        <p className="mb-6 text-sm leading-relaxed text-white/60 font-sans">
          Your session has expired or you were logged out from another device.
          You will be redirected to the login screen.
        </p>

        {/* Countdown ring */}
        <div className="relative mx-auto mb-4 flex h-20 w-20 items-center justify-center">
          <svg className="absolute inset-0 h-full w-full -rotate-90">
            <circle
              cx="40"
              cy="40"
              r="34"
              className="stroke-white/10 fill-none"
              strokeWidth="5"
            />
            <circle
              cx="40"
              cy="40"
              r="34"
              className="stroke-[#FD6046] fill-none transition-all duration-1000 ease-linear"
              strokeWidth="5"
              strokeDasharray={2 * Math.PI * 34}
              strokeDashoffset={((COUNTDOWN_START - count) / COUNTDOWN_START) * (2 * Math.PI * 34)}
            />
          </svg>
          <span className="text-2xl font-bold text-[#FD6046] font-sans">{count}</span>
        </div>

        <p className="text-xs tracking-wide text-white/40 font-sans">
          Redirecting in {count}s…
        </p>
      </div>
    </div>
  );
}
