'use client';

import React from 'react';
import type { MeetingStatus } from '../types';

const CONFIG: Record<MeetingStatus, { label: string; bg: string; text: string }> = {
  scheduled: { label: 'Scheduled', bg: 'rgba(16,185,129,0.15)', text: '#10B981' },
  cancelled: { label: 'Cancelled', bg: 'rgba(239,68,68,0.15)', text: '#EF4444' },
  completed: { label: 'Completed', bg: 'rgba(255,255,255,0.08)', text: 'rgba(255,255,255,0.6)' },
};

export function MeetingStatusBadge({ status }: { status: MeetingStatus }): React.ReactElement {
  const { label, bg, text } = CONFIG[status];
  return (
    <div
      className="inline-flex px-2 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase select-none"
      style={{ backgroundColor: bg, color: text }}
    >
      {label}
    </div>
  );
}
