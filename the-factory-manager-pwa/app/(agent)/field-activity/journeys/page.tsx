'use client';

import React, { useState, useMemo, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { format, parseISO, subDays, startOfWeek, endOfWeek } from 'date-fns';
import {
  CalendarDays,
  Clock,
  Loader2,
  MapPin,
  Navigation,
  Route,
  Users,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ArrowLeft,
} from 'lucide-react';
import { useMyJourneys, useAgentJourneys } from '@/features/field-activity/queries';
import { useCrmAssignees } from '@/features/crm';

type PresetType = 'today' | 'this_week' | 'last_week' | 'last_30_days' | 'last_90_days';

function formatKm(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return '—';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function getPresetDates(preset: PresetType): { from: string; to: string } {
  const now = new Date();
  let fromDate = now;
  let toDate = now;

  switch (preset) {
    case 'today':
      fromDate = now;
      toDate = now;
      break;
    case 'this_week':
      fromDate = startOfWeek(now, { weekStartsOn: 1 });
      toDate = now;
      break;
    case 'last_week': {
      const prevWeek = subDays(now, 7);
      fromDate = startOfWeek(prevWeek, { weekStartsOn: 1 });
      toDate = endOfWeek(prevWeek, { weekStartsOn: 1 });
      break;
    }
    case 'last_30_days':
      fromDate = subDays(now, 29);
      toDate = now;
      break;
    case 'last_90_days':
      fromDate = subDays(now, 89);
      toDate = now;
      break;
  }

  return {
    from: format(fromDate, 'yyyy-MM-dd'),
    to: format(toDate, 'yyyy-MM-dd'),
  };
}

function JourneyHistoryContent(): React.ReactElement {
  const searchParams = useSearchParams();
  const userIdParam = searchParams.get('userId');

  const { data: assignees = [] } = useCrmAssignees();
  const [selectedUserId, setSelectedUserId] = useState<number | null>(
    userIdParam ? Number(userIdParam) : null,
  );
  const [preset, setPreset] = useState<PresetType>('last_30_days');
  const [page, setPage] = useState(1);
  const perPage = 10;

  useEffect(() => {
    if (userIdParam) {
      const parsed = Number(userIdParam);
      if (Number.isFinite(parsed)) setSelectedUserId(parsed);
    } else if (!selectedUserId && assignees.length > 0) {
      setSelectedUserId(assignees[0].id);
    }
  }, [userIdParam, assignees, selectedUserId]);

  const { from, to } = useMemo(() => getPresetDates(preset), [preset]);

  const agentJourneysQuery = useAgentJourneys(selectedUserId, {
    from,
    to,
    preset,
    page,
    per_page: perPage,
  });

  const teamFallbackQuery = useMyJourneys({
    from,
    to,
    preset,
    page,
    per_page: perPage,
  });

  const activeData = selectedUserId ? agentJourneysQuery.data : teamFallbackQuery.data;
  const isLoading = selectedUserId ? agentJourneysQuery.isLoading : teamFallbackQuery.isLoading;

  const journeys = activeData?.items ?? [];
  const summary = activeData?.summary;
  const pagination = activeData?.pagination;
  const totalPages = pagination?.last_page ?? 1;

  const handlePresetChange = (newPreset: PresetType) => {
    setPreset(newPreset);
    setPage(1);
  };

  const presetLabels: Record<PresetType, string> = {
    today: 'Today',
    this_week: 'This Week',
    last_week: 'Last Week',
    last_30_days: 'Last 30 Days',
    last_90_days: 'Last 90 Days',
  };

  return (
    <main className="min-h-screen bg-[#0A1D25] text-white flex flex-col font-sans select-none overflow-x-hidden pb-16 pt-[calc(env(safe-area-inset-top,0px)+16px)]">
      {/* Header */}
      <header className="px-5 mb-4">
        <div className="flex items-center gap-2 mb-2 text-[#75ADAF] hover:text-white transition-colors">
          <ArrowLeft size={16} />
          <Link href="/field-activity" className="text-xs font-bold uppercase tracking-wider">
            Back to Field Activity
          </Link>
        </div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">
          Agent Journey History
        </h1>
        <p className="text-xs text-[#8F9098] font-medium mt-1">
          Inspect daily field routes, stops, visits, and travel efficiency by agent.
        </p>
      </header>

      {/* Agent Selector */}
      <div className="px-5 mb-4">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-[#75ADAF] mb-1.5">
          Select Field Agent
        </label>
        <select
          value={selectedUserId ?? ''}
          onChange={(e) => {
            setSelectedUserId(e.target.value ? Number(e.target.value) : null);
            setPage(1);
          }}
          className="w-full h-11 rounded-xl bg-[#0B3343] border border-white/15 px-3.5 text-xs font-bold text-white focus:outline-none"
        >
          <option value="">All Team Overview</option>
          {assignees.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name} ({agent.email})
            </option>
          ))}
        </select>
      </div>

      {/* Date Filters scrollable strip */}
      <div className="px-5 mb-6">
        <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
          {(Object.keys(presetLabels) as PresetType[]).map((p) => (
            <button
              key={p}
              onClick={() => handlePresetChange(p)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-bold transition-all ${
                preset === p
                  ? 'bg-[#7BB6B8] text-white shadow-md'
                  : 'bg-white/5 border border-white/10 text-[#8F9098] hover:text-white'
              }`}
            >
              {presetLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Overview stats 2x2 grid */}
      <section className="px-5 mb-6 grid grid-cols-2 gap-3.5">
        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between min-h-[96px] shadow-md relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-sky-500" />
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Days Tracked</span>
            <Route size={16} className="text-sky-400" />
          </div>
          <div className="mt-3">
            <h2 className="text-xl font-black text-white">
              {summary?.journey_count ?? 0} {summary?.journey_count === 1 ? 'Day' : 'Days'}
            </h2>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between min-h-[96px] shadow-md relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-emerald-500" />
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Total Distance</span>
            <Navigation size={16} className="text-emerald-400" />
          </div>
          <div className="mt-3">
            <h2 className="text-xl font-black text-white">
              {formatKm(summary?.distance_meters ?? 0)}
            </h2>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between min-h-[96px] shadow-md relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-orange-500" />
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Client Visits</span>
            <Users size={16} className="text-orange-400" />
          </div>
          <div className="mt-3">
            <h2 className="text-xl font-black text-white">
              {summary?.visit_count ?? 0} {summary?.visit_count === 1 ? 'Visit' : 'Visits'}
            </h2>
          </div>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col justify-between min-h-[96px] shadow-md relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-purple-500" />
          <div className="flex justify-between items-start">
            <span className="text-[9px] font-bold text-white/50 uppercase tracking-wider">Travel Time</span>
            <Clock size={16} className="text-purple-400" />
          </div>
          <div className="mt-3">
            <h2 className="text-xl font-black text-white">
              {formatDuration(summary?.travel_seconds ?? 0)}
            </h2>
          </div>
        </div>
      </section>

      {/* Journeys Log List Section */}
      <section className="px-5 mb-6 flex flex-col gap-4">
        <div className="flex justify-between items-center pb-2 border-b border-white/10">
          <div>
            <h3 className="text-sm font-bold text-white">Journeys Log</h3>
            <p className="text-[10px] text-[#8F9098] mt-0.5 font-medium">
              Showing records for {presetLabels[preset]}
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 px-3 py-1 rounded-full text-white/60">
            <CalendarDays size={12} className="text-white/40" />
            <span className="text-[9px] font-bold">
              {from === to ? from : `${from} to ${to}`}
            </span>
          </div>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 size={24} className="animate-spin text-white/20" />
            <p className="text-xs font-semibold text-[#8F9098]">Loading journeys...</p>
          </div>
        ) : journeys.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3 text-center px-4">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-white/20">
              <Route size={24} />
            </div>
            <h4 className="text-xs font-bold text-white mt-1">No journey logs found</h4>
            <p className="text-[10px] text-[#8F9098] max-w-[240px] leading-relaxed">
              Select another agent or date range to inspect recorded field routes.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {journeys.map((journey) => {
              const date = journey.date ? parseISO(journey.date) : null;
              const dayLabel = date ? format(date, 'EEE') : '—';
              const dayNum = date ? format(date, 'd') : '—';
              const monthLabel = date ? format(date, 'MMM') : '';
              const clockIn = journey.clock_in_at
                ? format(parseISO(journey.clock_in_at), 'h:mma')
                : null;
              const clockOut = journey.clock_out_at
                ? format(parseISO(journey.clock_out_at), 'h:mma')
                : null;
              const isActive = journey.status === 'active';

              return (
                <div key={journey.id} className="flex items-stretch gap-3 group text-left">
                  <div className="flex flex-col items-center w-10 shrink-0 pt-1">
                    <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider leading-none">
                      {dayLabel}
                    </p>
                    <p className="text-lg font-black text-white mt-0.5 leading-tight">{dayNum}</p>
                    <p className="text-[9px] text-white/40 uppercase leading-none mt-0.5">{monthLabel}</p>
                  </div>

                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div
                      className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ring-4 ${
                        isActive ? 'bg-sky-500 ring-sky-500/20' : 'bg-[#7BB6B8] ring-white/5'
                      }`}
                    />
                    <div className="w-px flex-1 bg-white/10 group-last:bg-transparent" />
                  </div>

                  <div className="flex-1 min-w-0 pb-2">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 shadow-sm hover:border-white/20 transition-all">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        <div>
                          {clockIn ? (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                              <span className="text-[10px] font-bold text-white">{clockIn}</span>
                              {clockOut ? (
                                <>
                                  <span className="text-white/30 text-[9px]">→</span>
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                                  <span className="text-[10px] text-white/60 font-medium">{clockOut}</span>
                                </>
                              ) : (
                                isActive && (
                                  <span className="text-[8px] font-bold text-sky-400 bg-sky-500/10 px-1.5 py-0.5 rounded-full animate-pulse ml-1">
                                    Live
                                  </span>
                                )
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-white/40 italic">No check in record</span>
                          )}
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider ${
                            isActive
                              ? 'bg-sky-500/10 text-sky-400'
                              : 'bg-[#EEF4F4]/10 text-[#7BB6B8]'
                          }`}
                        >
                          {isActive ? 'Active' : 'Completed'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-2 flex flex-col">
                          <span className="text-[8px] font-bold text-white/40 uppercase tracking-wider mb-0.5">Distance</span>
                          <span className="text-xs font-black text-white">{formatKm(journey.distance_meters)}</span>
                        </div>
                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-2 flex flex-col">
                          <span className="text-[8px] font-bold text-white/40 uppercase tracking-wider mb-0.5">Stops &amp; Visits</span>
                          <span className="text-xs font-black text-white">
                            {journey.stop_count} stops · {journey.visit_count} visits
                          </span>
                        </div>
                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-2 flex flex-col">
                          <span className="text-[8px] font-bold text-white/40 uppercase tracking-wider mb-0.5">Active Duration</span>
                          <span className="text-xs font-black text-white">{formatDuration(journey.active_seconds)}</span>
                        </div>
                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-2 flex flex-col">
                          <span className="text-[8px] font-bold text-white/40 uppercase tracking-wider mb-0.5">Efficiency</span>
                          <span className="text-xs font-black text-white">
                            {journey.travel_efficiency != null
                              ? `${Math.round(journey.travel_efficiency * 100)}%`
                              : '—'}
                          </span>
                        </div>
                      </div>

                      {journey.narrative && (
                        <div className="bg-sky-500/5 rounded-xl p-3 border border-sky-500/10 flex items-start gap-2 mb-3">
                          <Sparkles size={12} className="text-sky-400 mt-0.5 shrink-0" />
                          <p className="text-[10px] text-white/80 leading-relaxed italic">
                            &ldquo;{journey.narrative}&rdquo;
                          </p>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <Link
                          href={`/field-activity/journeys/${journey.id}`}
                          className="w-full text-center py-2 rounded-xl bg-[#7BB6B8] hover:bg-[#7BB6B8]/90 text-white text-xs font-bold transition-all shadow-sm block"
                        >
                          View Journey Map
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between pt-4 border-t border-white/10 mt-2">
            <p className="text-[10px] text-[#8F9098]">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center justify-center w-7 h-7 rounded-full border border-white/10 text-[#8F9098] hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center justify-center w-7 h-7 rounded-full border border-white/10 text-[#8F9098] hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="px-5 mb-6">
        <div className="bg-white/5 border border-white/10 rounded-3xl p-5 shadow-sm">
          <h3 className="text-sm font-bold text-white mb-3">Period Insights</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-2xl">
              <div>
                <p className="text-[9px] font-bold text-[#8F9098] uppercase tracking-wider">Avg Daily Distance</p>
                <p className="text-xs font-black text-white mt-0.5">
                  {summary?.journey_count && summary.journey_count > 0
                    ? formatKm(summary.distance_meters / summary.journey_count)
                    : '0 m'}
                </p>
              </div>
              <Navigation size={14} className="text-emerald-400" />
            </div>

            <div className="flex items-center justify-between gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-2xl">
              <div>
                <p className="text-[9px] font-bold text-[#8F9098] uppercase tracking-wider">Avg Daily Stops</p>
                <p className="text-xs font-black text-white mt-0.5">
                  {summary?.journey_count && summary.journey_count > 0
                    ? (summary.stop_count / summary.journey_count).toFixed(1)
                    : '0'}{' '}
                  stops
                </p>
              </div>
              <MapPin size={14} className="text-sky-400" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export default function JourneyHistoryPage(): React.ReactElement {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#0A1D25] flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-[#75ADAF]" />
        </div>
      }
    >
      <JourneyHistoryContent />
    </Suspense>
  );
}
