'use client';

import React from 'react';
import type { AppNotification, NotificationCategory } from '../types';

interface NotificationItemProps {
  notification: AppNotification;
  onPress: (n: AppNotification) => void;
  onDelete: (id: number) => void;
}

const CATEGORY_COLOR: Record<NotificationCategory, string> = {
  task: '#6366F1',
  tracking: '#10B981',
  project: '#F59E0B',
  payroll: '#14B8A6',
  crm: '#2563EB',
  auth: '#8B5CF6',
  onboarding: '#EC4899',
  workforce: '#F97316',
  profile: '#64748B',
  attendance: '#0EA5E9',
  system: '#64748B',
};

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  task: 'Task',
  tracking: 'Tracking',
  project: 'Project',
  payroll: 'Payroll',
  crm: 'CRM',
  auth: 'Auth',
  onboarding: 'Onboarding',
  workforce: 'Workforce',
  profile: 'Profile',
  attendance: 'Attendance',
  system: 'System',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export function NotificationItem({ notification: n, onPress, onDelete }: NotificationItemProps): React.ReactElement {
  const color = CATEGORY_COLOR[n.category] ?? '#64748B';
  const isHighPriority = n.priority === 'critical' || n.priority === 'high';

  return (
    <div
      onClick={() => onPress(n)}
      className={`flex items-start p-4 border-b border-white/5 gap-3 transition-colors duration-150 cursor-pointer ${
        !n.isRead ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'
      }`}
    >
      {/* Category color indicator strip */}
      <div className="w-1 self-stretch rounded" style={{ backgroundColor: color }} />

      <div className="flex-1 flex flex-col gap-1 min-w-0">
        {/* Header row */}
        <div className="flex items-center gap-2">
          <div
            className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider"
            style={{ backgroundColor: `${color}22`, color }}
          >
            {CATEGORY_LABEL[n.category] ?? 'System'}
          </div>
          {isHighPriority && (
            <div
              className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${
                n.priority === 'critical' ? 'bg-red-500' : 'bg-amber-500'
              }`}
            >
              {n.priority === 'critical' ? '!!' : '!'}
            </div>
          )}
          <span className="ml-auto text-xs text-white/40">{timeAgo(n.createdAt)}</span>
        </div>

        {/* Title */}
        <h4 className={`text-sm leading-snug truncate ${!n.isRead ? 'text-white font-semibold' : 'text-white/80 font-medium'}`}>
          {n.title}
        </h4>
        {/* Message */}
        <p className="text-xs text-white/50 leading-relaxed line-clamp-2">
          {n.message}
        </p>
      </div>

      {/* Action / Delete row */}
      <div className="flex flex-col items-center justify-between self-stretch pl-1">
        {!n.isRead && <div className="w-2.5 h-2.5 rounded-full bg-[#6366F1]" />}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete(n.id);
          }}
          className="text-white/30 hover:text-white/60 p-1 text-sm mt-auto"
          aria-label="Delete notification"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
