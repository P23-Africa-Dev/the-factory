'use client';

import React from 'react';
import type { CalendarStatus } from '../types';

interface CalendarStatusNoticeProps {
  calendarStatus: CalendarStatus;
}

export function CalendarStatusNotice({ calendarStatus }: CalendarStatusNoticeProps): React.ReactElement | null {
  if (calendarStatus.connected && calendarStatus.status === 'active') return null;

  const message =
    !calendarStatus.connected
      ? "Meeting creation is currently unavailable because your organization's Google Calendar account has not been connected yet. Please contact your organization's Owner or Administrator to complete the calendar setup."
      : 'Google Calendar connection requires attention. Please contact your administrator.';

  return (
    <div className="flex bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 gap-3 items-start mb-4 text-amber-400 select-none">
      <span className="text-lg leading-none mt-0.5">📅</span>
      <p className="flex-1 text-xs font-semibold leading-relaxed">
        {message}
      </p>
    </div>
  );
}
