"use client";

import { useState, Suspense } from "react";
import Link from "next/link";
import { format, parseISO, subDays, startOfWeek, endOfWeek } from "date-fns";
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
} from "lucide-react";
import { useMyJourneys } from "@/hooks/use-field-journeys";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";

// Helper functions for formatters
function formatKm(meters: number): string {
  if (meters < 1000) return `${meters} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

type PresetType = "today" | "this_week" | "last_week" | "last_30_days" | "last_90_days";

function getPresetDates(preset: PresetType): { from: string; to: string } {
  const now = new Date();
  let fromDate = now;
  let toDate = now;

  switch (preset) {
    case "today":
      fromDate = now;
      toDate = now;
      break;
    case "this_week":
      fromDate = startOfWeek(now, { weekStartsOn: 1 });
      toDate = now;
      break;
    case "last_week":
      const prevWeek = subDays(now, 7);
      fromDate = startOfWeek(prevWeek, { weekStartsOn: 1 });
      toDate = endOfWeek(prevWeek, { weekStartsOn: 1 });
      break;
    case "last_30_days":
      fromDate = subDays(now, 29);
      toDate = now;
      break;
    case "last_90_days":
      fromDate = subDays(now, 89);
      toDate = now;
      break;
  }

  return {
    from: format(fromDate, "yyyy-MM-dd"),
    to: format(toDate, "yyyy-MM-dd"),
  };
}

function JourneyHistoryContent() {
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId } = getActiveCompanyContext(user);

  const [preset, setPreset] = useState<PresetType>("last_30_days");
  const [page, setPage] = useState(1);
  const perPage = 10;

  const { from, to } = getPresetDates(preset);

  const { data, isLoading } = useMyJourneys({
    company_id: apiCompanyId ?? undefined,
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
    today: "Today",
    this_week: "This Week",
    last_week: "Last Week",
    last_30_days: "Last 30 Days",
    last_90_days: "Last 90 Days",
  };

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5 text-gray-500 hover:text-gray-900 transition-colors">
            <ArrowLeft size={16} />
            <Link href="/agent/operations" className="text-xs font-bold uppercase tracking-wider">
              Back to Operations
            </Link>
          </div>
          <h1 className="text-2xl font-extrabold text-[#0B1215] tracking-tight">
            Journey History
          </h1>
          <p className="text-sm text-gray-500 font-medium">
            Review your field movements, visits, and tracking metrics.
          </p>
        </div>

        {/* Date Filters */}
        <div className="flex flex-wrap gap-1.5 bg-gray-100 p-1.5 rounded-2xl border border-gray-200/50 self-start md:self-auto">
          {(Object.keys(presetLabels) as PresetType[]).map((p) => (
            <button
              key={p}
              onClick={() => handlePresetChange(p)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                preset === p
                  ? "bg-[#09232D] text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-900 hover:bg-gray-200/50"
              }`}
            >
              {presetLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Overview Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-32 transition-all hover:shadow-md">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Days Tracked</span>
            <div className="p-2 bg-sky-50 rounded-xl text-sky-600">
              <Route size={18} />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#0B1215]">
              {summary?.journey_count ?? 0} {summary?.journey_count === 1 ? "Day" : "Days"}
            </h2>
            <p className="text-[11px] text-gray-400 mt-1 font-medium">Days with active field paths</p>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-32 transition-all hover:shadow-md">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Distance</span>
            <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
              <Navigation size={18} />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#0B1215]">
              {formatKm(summary?.distance_meters ?? 0)}
            </h2>
            <p className="text-[11px] text-gray-400 mt-1 font-medium">Accumulated distance</p>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-32 transition-all hover:shadow-md">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Client Visits</span>
            <div className="p-2 bg-orange-50 rounded-xl text-orange-600">
              <Users size={18} />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#0B1215]">
              {summary?.visit_count ?? 0} {summary?.visit_count === 1 ? "Visit" : "Visits"}
            </h2>
            <p className="text-[11px] text-gray-400 mt-1 font-medium">Completed customer meetings</p>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-32 transition-all hover:shadow-md">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Travel Time</span>
            <div className="p-2 bg-purple-50 rounded-xl text-purple-600">
              <Clock size={18} />
            </div>
          </div>
          <div>
            <h2 className="text-2xl font-black text-[#0B1215]">
              {formatDuration(summary?.travel_seconds ?? 0)}
            </h2>
            <p className="text-[11px] text-gray-400 mt-1 font-medium">Time spent in transit</p>
          </div>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Journey List Timeline */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col min-h-96">
            <div className="flex justify-between items-center border-b border-gray-100 pb-4 mb-6">
              <div>
                <h3 className="text-base font-bold text-[#0B1215]">Journeys Log</h3>
                <p className="text-xs text-gray-400 mt-0.5 font-medium">
                  Showing records for {presetLabels[preset]}
                </p>
              </div>
              <div className="flex items-center gap-1.5 bg-gray-50 border border-gray-100 px-3.5 py-1.5 rounded-full text-gray-500">
                <CalendarDays size={14} />
                <span className="text-xs font-bold">
                  {from === to ? from : `${from} to ${to}`}
                </span>
              </div>
            </div>

            {isLoading ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 size={32} className="animate-spin text-gray-300" />
                <p className="text-sm font-semibold text-gray-400">Loading journeys...</p>
              </div>
            ) : journeys.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3 text-center px-4">
                <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center text-gray-300">
                  <Route size={32} />
                </div>
                <h4 className="text-sm font-bold text-[#0B1215] mt-2">No journey logs found</h4>
                <p className="text-xs text-gray-400 max-w-sm">
                  Active journey history is recorded when you clock in on working days with location access enabled.
                </p>
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-6">
                {journeys.map((journey) => {
                  const date = journey.date ? parseISO(journey.date) : null;
                  const dayLabel = date ? format(date, "EEE") : "—";
                  const dayNum = date ? format(date, "d") : "—";
                  const monthLabel = date ? format(date, "MMM") : "";
                  const clockIn = journey.clock_in_at
                    ? format(parseISO(journey.clock_in_at), "h:mma")
                    : null;
                  const clockOut = journey.clock_out_at
                    ? format(parseISO(journey.clock_out_at), "h:mma")
                    : null;
                  const isActive = journey.status === "active";

                  return (
                    <div key={journey.id} className="flex items-stretch gap-4 group">
                      {/* Date Block */}
                      <div className="flex flex-col items-center w-12 shrink-0 pt-1">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-none">
                          {dayLabel}
                        </p>
                        <p className="text-xl font-black text-[#0B1215] mt-1 leading-tight">{dayNum}</p>
                        <p className="text-[10px] text-gray-400 uppercase leading-none mt-0.5">{monthLabel}</p>
                      </div>

                      {/* Timeline dot & line */}
                      <div className="flex flex-col items-center gap-1 shrink-0">
                        <div
                          className={`w-3.5 h-3.5 rounded-full mt-1.5 shrink-0 ring-4 ${
                            isActive
                              ? "bg-sky-500 ring-sky-100"
                              : "bg-[#09232D] ring-gray-100"
                          }`}
                        />
                        <div className="w-px flex-1 bg-gray-100 group-last:bg-transparent" />
                      </div>

                      {/* Journey Card Detail */}
                      <div className="flex-1 min-w-0 pb-4">
                        <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-[0_1px_4px_rgba(0,0,0,0.02)] group-hover:shadow-[0_4px_16px_rgba(0,0,0,0.06)] transition-all duration-300">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                            {/* Clock Times */}
                            <div className="flex items-center gap-2">
                              {clockIn ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                    <span className="text-xs font-bold text-[#0B1215]">{clockIn}</span>
                                  </div>
                                  {clockOut ? (
                                    <>
                                      <span className="text-xs text-gray-300">→</span>
                                      <div className="flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                        <span className="text-xs text-gray-500 font-medium">{clockOut}</span>
                                      </div>
                                    </>
                                  ) : (
                                    isActive && (
                                      <span className="text-[10px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full animate-pulse">
                                        Live
                                      </span>
                                    )
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-400 italic">No check-in record</span>
                              )}
                            </div>

                            {/* Status badge */}
                            <span
                              className={`self-start sm:self-auto px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                isActive
                                  ? "bg-sky-50 text-sky-700"
                                  : "bg-[#EEF4F4] text-[#094B5C]"
                              }`}
                            >
                              {isActive ? "Active" : "Completed"}
                            </span>
                          </div>

                          {/* Grid metrics */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                            <div className="bg-gray-50/50 rounded-2xl p-3 flex flex-col">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Distance</span>
                              <span className="text-sm font-black text-[#0B1215]">
                                {formatKm(journey.distance_meters)}
                              </span>
                            </div>
                            <div className="bg-gray-50/50 rounded-2xl p-3 flex flex-col">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Stops & Visits</span>
                              <span className="text-sm font-black text-[#0B1215]">
                                {journey.stop_count} stops · {journey.visit_count} visits
                              </span>
                            </div>
                            <div className="bg-gray-50/50 rounded-2xl p-3 flex flex-col">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Active Duration</span>
                              <span className="text-sm font-black text-[#0B1215]">
                                {formatDuration(journey.active_seconds)}
                              </span>
                            </div>
                            <div className="bg-gray-50/50 rounded-2xl p-3 flex flex-col">
                              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Efficiency</span>
                              <span className="text-sm font-black text-[#0B1215]">
                                {journey.travel_efficiency != null
                                  ? `${Math.round(journey.travel_efficiency * 100)}%`
                                  : "—"}
                              </span>
                            </div>
                          </div>

                          {/* Narrative description if any */}
                          {journey.narrative && (
                            <div className="bg-sky-50/30 rounded-2xl p-3.5 border border-sky-100/30 flex items-start gap-2.5 mb-4">
                              <Sparkles size={14} className="text-sky-500 mt-0.5 shrink-0" />
                              <p className="text-xs text-gray-600 leading-relaxed italic">
                                &ldquo;{journey.narrative}&rdquo;
                              </p>
                            </div>
                          )}

                          {/* CTA View Details */}
                          <div className="flex justify-end">
                            <Link
                              href={`/agent/operations/journeys/${journey.id}`}
                              className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-[#09232D] text-white text-xs font-bold hover:bg-[#123e4f] transition-all shadow-sm"
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
              <div className="flex items-center justify-between pt-6 border-t border-gray-100 mt-6">
                <p className="text-xs text-gray-400">
                  Showing Page {page} of {totalPages} ({pagination?.total ?? 0} total records)
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-8 h-8 rounded-full text-xs font-bold transition-all ${
                        p === page
                          ? "bg-[#09232D] text-white shadow-sm"
                          : "text-gray-400 hover:bg-gray-100"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="flex items-center justify-center w-8 h-8 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Sidebar Insights & Documentation */}
        <div className="lg:col-span-1 flex flex-col gap-6">
          {/* Performance Insight Card */}
          <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)]">
            <h3 className="text-base font-bold text-[#0B1215] mb-4">
              Period Insights
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-2xl">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Avg Daily Distance</p>
                  <p className="text-sm font-black text-[#0B1215] mt-0.5">
                    {summary?.journey_count && summary.journey_count > 0
                      ? formatKm(summary.distance_meters / summary.journey_count)
                      : "0 m"}
                  </p>
                </div>
                <div className="p-2 bg-emerald-50 rounded-xl text-emerald-600">
                  <Navigation size={15} />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-2xl">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Avg Daily Stops</p>
                  <p className="text-sm font-black text-[#0B1215] mt-0.5">
                    {summary?.journey_count && summary.journey_count > 0
                      ? (summary.stop_count / summary.journey_count).toFixed(1)
                      : "0"} stops
                  </p>
                </div>
                <div className="p-2 bg-sky-50 rounded-xl text-sky-600">
                  <MapPin size={15} />
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 p-3 bg-gray-50 rounded-2xl">
                <div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Avg Daily Travel Time</p>
                  <p className="text-sm font-black text-[#0B1215] mt-0.5">
                    {summary?.journey_count && summary.journey_count > 0
                      ? formatDuration(summary.travel_seconds / summary.journey_count)
                      : "—"}
                  </p>
                </div>
                <div className="p-2 bg-purple-50 rounded-xl text-purple-600">
                  <Clock size={15} />
                </div>
              </div>
            </div>
          </div>

          {/* Tracking FAQ Card */}
          <div className="bg-[#09232D] text-white border border-[#0d2d3a] rounded-3xl p-6 shadow-[0_4px_14px_rgba(9,35,45,0.1)]">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-4">
              <Info size={16} className="text-sky-400" />
              <h3 className="text-sm font-bold tracking-tight">How Journeys are Tracked</h3>
            </div>
            <ul className="space-y-4 text-xs font-medium text-white/70">
              <li className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 bg-sky-400 rounded-full mt-1.5 shrink-0" />
                <span>
                  <strong className="text-white block font-bold mb-0.5">Clock In To Start</strong>
                  Journeys record automatically once you clock in from the Attendance tab.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 bg-sky-400 rounded-full mt-1.5 shrink-0" />
                <span>
                  <strong className="text-white block font-bold mb-0.5">Location Access</strong>
                  Ensure background location permission is granted for accuracy on active routes.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="w-1.5 h-1.5 bg-sky-400 rounded-full mt-1.5 shrink-0" />
                <span>
                  <strong className="text-white block font-bold mb-0.5">Auto-Pause</strong>
                  Tracking pauses automatically when you stop or clock out to save device battery.
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function JourneyHistoryPage() {
  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <Suspense
        fallback={
          <div className="min-h-[50vh] flex items-center justify-center text-gray-400 font-bold text-sm">
            <Loader2 className="animate-spin text-gray-300 mr-2" size={20} />
            Loading Journey History...
          </div>
        }
      >
        <JourneyHistoryContent />
      </Suspense>
    </div>
  );
}
