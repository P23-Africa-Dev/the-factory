'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
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
  Info,
  Sparkles,
  ArrowLeft
} from 'lucide-react';
import { useMyJourneys } from '@/features/field-activity/queries';

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
    case 'last_week':
      const prevWeek = subDays(now, 7);
      fromDate = startOfWeek(prevWeek, { weekStartsOn: 1 });
      toDate = endOfWeek(prevWeek, { weekStartsOn: 1 });
      break;
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

export default function JourneyHistoryPage(): React.ReactElement {
  const [preset, setPreset] = useState<PresetType>('last_30_days');
  const [page, setPage] = useState(1);
  const perPage = 10;

  const { from, to } = useMemo(() => getPresetDates(preset), [preset]);

  const { data, isLoading } = useMyJourneys({
    from,
    to,
    preset,
    page,
    per_page: perPage,
  });

  const journeys = data?.items ?? [];
  const summary = data?.summary;
  const pagination = data?.pagination;
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
    <main className="min-h-screen bg-[#0A1D25] text-white flex flex-col font-sans select-none overflow-x-hidden pb-8 pt-[calc(env(safe-area-inset-top,0px)+16px)]">
      {/* Header */}
      <header className="px-5 mb-5">
        <div className="flex items-center gap-2 mb-2 text-[#75ADAF] hover:text-white transition-colors">
          <ArrowLeft size={16} />
          <Link href="/" className="text-xs font-bold uppercase tracking-wider">
            Back to Dashboard
          </Link>
        </div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight">
          Journey History
        </h1>
        <p className="text-xs text-[#8F9098] font-medium mt-1">
          Review your field movements, visits, and tracking metrics.
        </p>
      </header>

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
              Active journey history is recorded when you clock in on working days with location access enabled.
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
                  {/* Date Block */}
                  <div className="flex flex-col items-center w-10 shrink-0 pt-1">
                    <p className="text-[9px] font-bold text-white/40 uppercase tracking-wider leading-none">
                      {dayLabel}
                    </p>
                    <p className="text-lg font-black text-white mt-0.5 leading-tight">{dayNum}</p>
                    <p className="text-[9px] text-white/40 uppercase leading-none mt-0.5">{monthLabel}</p>
                  </div>

                  {/* Timeline dot & line */}
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div
                      className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ring-4 ${
                        isActive
                          ? 'bg-sky-500 ring-sky-500/20'
                          : 'bg-[#7BB6B8] ring-white/5'
                      }`}
                    />
                    <div className="w-px flex-1 bg-white/10 group-last:bg-transparent" />
                  </div>

                  {/* Journey details card */}
                  <div className="flex-1 min-w-0 pb-2">
                    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 shadow-sm hover:border-white/20 transition-all">
                      <div className="flex items-center justify-between gap-3 mb-3">
                        {/* Clock Times */}
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
                            <span className="text-[10px] text-white/40 italic">No check-in record</span>
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

                      {/* Metrics */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-2 flex flex-col">
                          <span className="text-[8px] font-bold text-white/40 uppercase tracking-wider mb-0.5">Distance</span>
                          <span className="text-xs font-black text-white">{formatKm(journey.distance_meters)}</span>
                        </div>
                        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-2 flex flex-col">
                          <span className="text-[8px] font-bold text-white/40 uppercase tracking-wider mb-0.5">Stops & Visits</span>
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

                      {/* AI Narrative */}
                      {journey.narrative && (
                        <div className="bg-sky-500/5 rounded-xl p-3 border border-sky-500/10 flex items-start gap-2 mb-3">
                          <Sparkles size={12} className="text-sky-400 mt-0.5 shrink-0" />
                          <p className="text-[10px] text-white/80 leading-relaxed italic">
                            &ldquo;{journey.narrative}&rdquo;
                          </p>
                        </div>
                      )}

                      {/* Link to detail Map */}
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

        {/* Pagination controls */}
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
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-7 h-7 rounded-full text-xs font-bold transition-all ${
                    p === page
                      ? 'bg-[#7BB6B8] text-white shadow-sm'
                      : 'text-[#8F9098] hover:bg-white/5'
                  }`}
                >
                  {p}
                </button>
              ))}
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

      {/* Period Insights section */}
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

            <div className="flex items-center justify-between gap-3 p-3 bg-white/[0.02] border border-white/5 rounded-2xl">
              <div>
                <p className="text-[9px] font-bold text-[#8F9098] uppercase tracking-wider">Avg Daily Travel Time</p>
                <p className="text-xs font-black text-white mt-0.5">
                  {summary?.journey_count && summary.journey_count > 0
                    ? formatDuration(summary.travel_seconds / summary.journey_count)
                    : '—'}
                </p>
              </div>
              <Clock size={14} className="text-purple-400" />
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Guide Section */}
      <section className="px-5 mb-8">
        <div className="bg-[#0B3343] border border-white/10 rounded-3xl p-5 shadow-md">
          <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-3">
            <Info size={14} className="text-sky-400" />
            <h3 className="text-xs font-bold text-white tracking-wide">How Journeys are Tracked</h3>
          </div>
          <ul className="space-y-3.5 text-[10px] text-white/70">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 bg-sky-400 rounded-full mt-1.5 shrink-0" />
              <span>
                <strong className="text-white block font-semibold mb-0.5">Clock In To Start</strong>
                Journeys record automatically once you clock in from the Attendance card on the dashboard.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 bg-sky-400 rounded-full mt-1.5 shrink-0" />
              <span>
                <strong className="text-white block font-semibold mb-0.5">Location Access</strong>
                Ensure background location permission is granted for accuracy on active routes.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 bg-sky-400 rounded-full mt-1.5 shrink-0" />
              <span>
                <strong className="text-white block font-semibold mb-0.5">Auto-Pause</strong>
                Tracking pauses automatically when you stop or clock out to save device battery.
              </span>
            </li>
          </ul>
        </div>
      </section>
    </main>
  );
}
