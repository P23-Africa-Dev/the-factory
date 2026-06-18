'use client';

import React, { useState, useMemo } from 'react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import { useMeetingList, useCalendarStatus } from '@/features/meetings/queries';
import { useMeetingNavigation } from '@/features/meetings/navigation';
import { MeetingListItem } from '@/features/meetings/components/MeetingListItem';
import { CreateMeetingModal } from '@/features/meetings/components/CreateMeetingModal';
import type { Meeting } from '@/features/meetings/types';

type TimeFilter = 'upcoming' | 'today' | 'tomorrow' | 'past';

const FILTERS: Array<{ label: string; value: TimeFilter }> = [
  { label: 'Upcoming', value: 'upcoming' },
  { label: 'Today', value: 'today' },
  { label: 'Tomorrow', value: 'tomorrow' },
  { label: 'Past', value: 'past' },
];

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function filterAndSortMeetings(meetings: Meeting[], filter: TimeFilter, now: number): Meeting[] {
  const today = startOfDay(new Date());
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const active = meetings.filter((m) => m.status !== 'cancelled');

  let filtered: Meeting[];
  switch (filter) {
    case 'today':
      filtered = active.filter((m) => isSameDay(new Date(m.startAt), today));
      break;
    case 'tomorrow':
      filtered = active.filter((m) => isSameDay(new Date(m.startAt), tomorrow));
      break;
    case 'past':
      filtered = active.filter((m) => new Date(m.startAt).getTime() < now);
      return filtered.sort((a, b) => new Date(b.startAt).getTime() - new Date(a.startAt).getTime());
    case 'upcoming':
    default:
      filtered = active.filter((m) => {
        const start = new Date(m.startAt).getTime();
        return m.status === 'scheduled' && !Number.isNaN(start) && start >= now;
      });
      return filtered.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }

  return filtered.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}

export default function MeetingsListPage() {
  const nav = useMeetingNavigation();
  const { data: calendarStatus } = useCalendarStatus();
  const [activeFilter, setActiveFilter] = useState<TimeFilter>('upcoming');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [now] = useState(() => Date.now());

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useMeetingList({ per_page: 100 });

  const filteredMeetings = useMemo(() => {
    const allMeetings = data?.pages.flatMap((p) => p.items) ?? [];
    return filterAndSortMeetings(allMeetings, activeFilter, now);
  }, [data, activeFilter, now]);

  const canCreate = calendarStatus?.connected && calendarStatus.status === 'active';

  return (
    <ScreenErrorBoundary screenName="MeetingsList">
      <div className="relative min-h-screen bg-[#0A1D25] text-white flex flex-col font-sans select-none overflow-hidden pb-16">
        <div className="relative z-10 flex items-center justify-between px-5 pt-6 mb-4">
          <h2 className="font-bold text-xl text-white">Meetings</h2>
          {canCreate && (
            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="w-8 h-8 rounded-full bg-[#FD6046] hover:bg-[#E0533C] flex items-center justify-center text-white text-lg font-bold transition-all active:scale-90"
            >
              +
            </button>
          )}
        </div>

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

        <div className="relative z-10 flex-1 px-5 overflow-y-auto pb-20">
          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#44AFCD] border-t-transparent" />
            </div>
          ) : filteredMeetings.length === 0 ? (
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
              <div className="flex flex-col">
                {filteredMeetings.map((meeting) => (
                  <MeetingListItem
                    key={meeting.id}
                    meeting={meeting}
                    onPress={(id) => nav.goToMeetingDetail(id)}
                  />
                ))}
              </div>

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

        {canCreate && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="fixed bottom-[130px] right-6 w-14 h-14 rounded-full bg-[#FD6046] hover:bg-[#E0533C] text-white flex items-center justify-center text-3xl font-light shadow-xl active:scale-95 hover:shadow-2xl transition-all z-30"
          >
            +
          </button>
        )}

        <CreateMeetingModal
          open={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
        />
      </div>
    </ScreenErrorBoundary>
  );
}
