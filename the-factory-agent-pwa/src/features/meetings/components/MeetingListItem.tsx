'use client';

import React from 'react';
import { MeetingStatusBadge } from './MeetingStatusBadge';
import type { Meeting } from '../types';

interface MeetingListItemProps {
  meeting: Meeting;
  onPress: (id: number | string) => void;
}

function formatTime(iso: string, timezone: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-NG', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: timezone,
      hour12: true,
    });
  } catch {
    return new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
}

export function MeetingListItem({ meeting, onPress }: MeetingListItemProps): React.ReactElement {
  const startTime = formatTime(meeting.startAt, meeting.timezone);
  const endTime = formatTime(meeting.endAt, meeting.timezone);

  return (
    <div
      onClick={() => onPress(meeting.id)}
      className="flex items-center bg-[#0B3343] hover:bg-[#0D3B4E] border border-white/10 rounded-[18px] p-4 mb-3 transition-all duration-150 active:scale-98 cursor-pointer gap-3 select-none"
    >
      {/* Time column */}
      <div className="flex flex-col items-end w-14 flex-shrink-0">
        <span className="text-xs font-bold text-white leading-tight">{startTime}</span>
        <span className="text-[10px] text-white/50">{endTime}</span>
      </div>

      {/* Vertical divider */}
      <div className="w-0.5 h-10 bg-[#75ADAF] rounded-full flex-shrink-0" />

      {/* Content */}
      <div className="flex-1 flex flex-col gap-1 min-w-0">
        <h4 className="text-sm font-bold text-white truncate leading-tight">
          {meeting.title}
        </h4>
        {meeting.location && (
          <p className="text-[11px] text-white/60 truncate flex items-center gap-1">
            <span>📍</span> <span>{meeting.location}</span>
          </p>
        )}
        <div className="flex items-center gap-2 flex-wrap mt-1">
          <MeetingStatusBadge status={meeting.status} />
          {meeting.attendees.length > 0 && (
            <span className="text-[10px] text-white/40">
              {meeting.attendees.length} attendee{meeting.attendees.length !== 1 ? 's' : ''}
            </span>
          )}
          {meeting.googleMeetUrl && (
            <div className="bg-[#6366F1]/20 border border-[#6366F1]/30 rounded px-1.5 py-0.5 text-[9px] font-bold text-[#818CF8]">
              Meet
            </div>
          )}
        </div>
      </div>

      {/* Chevron */}
      <span className="text-white/30 text-lg pr-1">›</span>
    </div>
  );
}
