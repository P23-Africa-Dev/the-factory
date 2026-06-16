'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useMeetingList, useCalendarStatus } from '../queries';
import { useMeetingNavigation } from '../navigation';
import { MeetingStatusBadge } from './MeetingStatusBadge';
import type { Meeting } from '../types';

interface MeetingWidgetProps {
  selectedDate: Date;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatWidgetTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-NG', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return new Date(iso).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
}

function formatWidgetDate(d: Date): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (isSameDay(d, today)) return 'Today';
  if (isSameDay(d, tomorrow)) return 'Tomorrow';
  return d.toLocaleDateString('en-NG', { weekday: 'short', month: 'short', day: 'numeric' });
}

export function MeetingWidget({ selectedDate }: MeetingWidgetProps): React.ReactElement {
  const nav = useMeetingNavigation();
  const { data: calendarStatus } = useCalendarStatus();
  const [localDate, setLocalDate] = useState(selectedDate);

  useEffect(() => {
    setLocalDate(selectedDate);
  }, [selectedDate]);

  const dateStr = localDate.toISOString().slice(0, 10);
  const { data, isLoading } = useMeetingList({ from: dateStr, to: dateStr });

  const dayMeetings = useMemo((): Meeting[] => {
    if (!data?.pages) return [];
    const all = data.pages.flatMap((p) => p.items);
    return all
      .filter((m) => isSameDay(new Date(m.startAt), localDate) && m.status !== 'cancelled')
      .slice(0, 2);
  }, [data, localDate]);

  const canCreate = calendarStatus?.connected && calendarStatus.status === 'active';

  const handlePrevDay = () => {
    const d = new Date(localDate);
    d.setDate(d.getDate() - 1);
    setLocalDate(d);
  };

  const handleNextDay = () => {
    const d = new Date(localDate);
    d.setDate(d.getDate() + 1);
    setLocalDate(d);
  };

  return (
    <div className="bg-[#0B3343]/80 border border-white/10 rounded-2xl p-4 shadow-lg select-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <button
          onClick={handlePrevDay}
          className="w-8 h-8 flex items-center justify-center text-xl font-bold text-white/75 hover:text-white rounded-full hover:bg-white/5 active:scale-95 transition-all"
        >
          ‹
        </button>
        <span className="flex-1 text-center text-sm font-bold text-white">
          {formatWidgetDate(localDate)}
        </span>
        <button
          onClick={handleNextDay}
          className="w-8 h-8 flex items-center justify-center text-xl font-bold text-white/75 hover:text-white rounded-full hover:bg-white/5 active:scale-95 transition-all"
        >
          ›
        </button>

        {canCreate && (
          <button
            onClick={nav.goToCreateMeeting}
            className="w-8 h-8 rounded-full bg-[#FD6046] hover:bg-[#E0533C] flex items-center justify-center text-white text-lg font-bold transition-all active:scale-90"
          >
            +
          </button>
        )}
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="flex justify-center items-center py-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#75ADAF] border-t-transparent" />
        </div>
      ) : dayMeetings.length === 0 ? (
        <p className="text-center text-xs text-white/40 py-4 font-medium">
          No meetings {formatWidgetDate(localDate).toLowerCase()}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {dayMeetings.map((meeting) => (
            <div
              key={meeting.id}
              onClick={() => nav.goToMeetingDetail(meeting.id)}
              className="flex items-center gap-3 bg-white/[0.04] hover:bg-white/[0.06] border border-white/5 rounded-xl p-3 cursor-pointer active:scale-98 transition-all"
            >
              <div className="w-1 h-8 bg-[#75ADAF] rounded-full" />
              <div className="flex-1 min-w-0">
                <h5 className="text-xs font-bold text-white truncate leading-tight">
                  {meeting.title}
                </h5>
                <span className="text-[10px] text-white/50 block mt-1">
                  {formatWidgetTime(meeting.startAt)} – {formatWidgetTime(meeting.endAt)}
                </span>
              </div>
              <MeetingStatusBadge status={meeting.status} />
            </div>
          ))}

          {/* View all button if there are pages */}
          {data?.pages?.[0]?.pagination?.next_page_url && (
            <button
              onClick={nav.goToMeetingsList}
              className="w-full text-center text-xs font-semibold text-[#75ADAF] hover:text-[#5DA1A3] mt-2 active:scale-95 transition-all"
            >
              View all meetings
            </button>
          )}
        </div>
      )}
    </div>
  );
}
