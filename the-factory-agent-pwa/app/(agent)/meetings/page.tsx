'use client';

import React, { useState, useMemo } from 'react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import { useMeetingList, useCalendarStatus } from '@/features/meetings/queries';
import { useMeetingNavigation } from '@/features/meetings/navigation';
import { MeetingListItem } from '@/features/meetings/components/MeetingListItem';
import type { Meeting, MeetingStatus } from '@/features/meetings/types';

const FILTERS: Array<{ label: string; value: MeetingStatus | 'all' }> = [
  { label: 'All', value: 'all' },
  { label: 'Scheduled', value: 'scheduled' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

type Section = { title: string; items: Meeting[] };

function groupMeetings(meetings: Meeting[]): Section[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);

  const todayArr: Meeting[] = [];
  const tomorrowArr: Meeting[] = [];
  const thisWeekArr: Meeting[] = [];
  const laterArr: Meeting[] = [];

  for (const m of meetings) {
    const d = new Date(m.startAt);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) todayArr.push(m);
    else if (d.getTime() === tomorrow.getTime()) tomorrowArr.push(m);
    else if (d < nextWeek) thisWeekArr.push(m);
    else laterArr.push(m);
  }

  const groups: Array<{ title: string; items: Meeting[] }> = [
    { title: 'Today', items: todayArr },
    { title: 'Tomorrow', items: tomorrowArr },
    { title: 'This Week', items: thisWeekArr },
    { title: 'Later', items: laterArr },
  ];

  return groups.filter((g) => g.items.length > 0);
}

export default function MeetingsListPage() {
  const nav = useMeetingNavigation();
  const { data: calendarStatus } = useCalendarStatus();
  const [activeFilter, setActiveFilter] = useState<MeetingStatus | 'all'>('all');

  const filters = activeFilter !== 'all' ? { status: activeFilter } : undefined;
  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMeetingList(filters);

  const allMeetings = useMemo(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data]
  );

  const sections = useMemo(() => groupMeetings(allMeetings), [allMeetings]);

  const canCreate = calendarStatus?.connected && calendarStatus.status === 'active';

  return (
    <ScreenErrorBoundary screenName="MeetingsList">
      <div className="relative min-h-screen bg-[#0A1D25] text-white flex flex-col font-sans select-none overflow-hidden pb-16">
        {/* Header */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-6 mb-4">
          <h2 className="font-bold text-xl text-white">Meetings</h2>
          {canCreate && (
            <button
              onClick={nav.goToCreateMeeting}
              className="w-8 h-8 rounded-full bg-[#FD6046] hover:bg-[#E0533C] flex items-center justify-center text-white text-lg font-bold transition-all active:scale-90"
            >
              +
            </button>
          )}
        </div>

        {/* Filter Row */}
        <div className="relative z-10 flex px-5 gap-2 overflow-x-auto pb-3 mb-2 scrollbar-none">
          {FILTERS.map((f) => {
            const isActive = activeFilter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setActiveFilter(f.value)}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap active:scale-95 ${
                  isActive
                    ? 'bg-[#44AFCD] border-[#44AFCD] text-white'
                    : 'bg-white/[0.08] border-white/10 text-white/60 hover:text-white'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Scroll Content */}
        <div className="relative z-10 flex-1 px-5 overflow-y-auto pb-20">
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#44AFCD] border-t-transparent" />
            </div>
          ) : sections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-4 bg-white/[0.03] border border-white/5 rounded-2xl">
              <h4 className="text-sm font-semibold text-white">No meetings found</h4>
              <p className="text-xs text-white/40 leading-relaxed max-w-xs">
                {canCreate
                  ? 'Tap + to schedule your first meeting on Google Calendar.'
                  : 'Your organization calendar is not connected yet.'}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {sections.map((section) => (
                <div key={section.title} className="flex flex-col">
                  {/* Date section header */}
                  <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-3 pl-1">
                    {section.title}
                  </h3>

                  {/* Meeting list items */}
                  <div className="flex flex-col">
                    {section.items.map((meeting) => (
                      <MeetingListItem
                        key={meeting.id}
                        meeting={meeting}
                        onPress={(id) => nav.goToMeetingDetail(id)}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Load older button */}
              {hasNextPage && (
                <div className="py-4 text-center">
                  <button
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="text-xs font-semibold px-4 py-2 border border-white/10 hover:border-white/20 rounded-lg text-white/70 hover:text-white disabled:opacity-50"
                  >
                    {isFetchingNextPage ? 'Loading more...' : 'Load more meetings'}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* FAB */}
        {canCreate && (
          <button
            onClick={nav.goToCreateMeeting}
            className="fixed bottom-[130px] right-6 w-14 h-14 rounded-full bg-[#FD6046] hover:bg-[#E0533C] text-white flex items-center justify-center text-3xl font-light shadow-xl active:scale-95 hover:shadow-2xl transition-all z-30"
          >
            +
          </button>
        )}
      </div>
    </ScreenErrorBoundary>
  );
}
