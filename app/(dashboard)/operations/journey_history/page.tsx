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
  Search,
  ArrowLeft
} from "lucide-react";
import { useAgentJourneys } from "@/hooks/use-field-journeys";
import { useInternalUsers } from "@/hooks/use-internal-users";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { resolveAvatarSrc } from "@/lib/avatar";

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

function SupervisorJourneyContent() {
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId } = getActiveCompanyContext(user);

  // States
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [preset, setPreset] = useState<PresetType>("last_30_days");
  const [page, setPage] = useState(1);
  const perPage = 10;

  // Fetch agents assigned to supervisor (automatically restricted on backend)
  const { data: agentsData, isLoading: agentsLoading } = useInternalUsers({
    company_id: apiCompanyId ?? undefined,
    role: "agent",
  });

  const agents = agentsData ?? [];
  const filteredAgents = agents.filter((agent) =>
    agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (agent.email && agent.email.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const selectedAgent = agents.find((a) => String(a.id) === selectedAgentId) ?? null;

  const { from, to } = getPresetDates(preset);

  // Fetch journeys for selected agent
  const { data: journeysData, isLoading: journeysLoading } = useAgentJourneys(
    selectedAgentId ?? undefined,
    {
      company_id: apiCompanyId ?? undefined,
      from,
      to,
      preset,
      page,
      per_page: perPage,
    }
  );

  const journeys = journeysData?.items ?? [];
  const summary = journeysData?.summary;
  const pagination = journeysData?.pagination;
  const totalPages = pagination?.last_page ?? 1;

  const handleAgentSelect = (agentId: string) => {
    setSelectedAgentId(agentId);
    setPage(1);
  };

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
      <div>
        <div className="flex items-center gap-2 mb-1.5 text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowLeft size={16} />
          <Link href="/operations" className="text-xs font-bold uppercase tracking-wider">
            Back to Workforce
          </Link>
        </div>
        <h1 className="text-2xl font-extrabold text-[#0B1215] tracking-tight">
          Journey History Dashboard
        </h1>
        <p className="text-sm text-gray-500 font-medium">
          Monitor and audit routes, travel paths, and client visits for agents under your supervision.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Left Column: Search & Agents List */}
        <div className="lg:col-span-1 flex flex-col gap-4 bg-white border border-gray-100 rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] h-[calc(100vh-250px)] min-h-[500px]">
          <h3 className="text-sm font-black text-[#0B1215] uppercase tracking-wider pb-1">
            Agents List
          </h3>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search agent name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-[#09232D]/10 focus:bg-white transition-all font-medium placeholder:text-gray-400"
            />
          </div>

          {/* Agent list */}
          <div className="flex-1 overflow-y-auto space-y-2 pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-100">
            {agentsLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2">
                <Loader2 size={24} className="animate-spin text-gray-300" />
                <p className="text-xs text-gray-400 font-bold">Loading agents...</p>
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="text-center py-20 px-4">
                <p className="text-xs text-gray-400 font-semibold">No agents found</p>
              </div>
            ) : (
              filteredAgents.map((agent) => {
                const isSelected = String(agent.id) === selectedAgentId;
                const avatar = resolveAvatarSrc(agent.avatar_url);

                return (
                  <button
                    key={agent.id}
                    onClick={() => handleAgentSelect(String(agent.id))}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? "bg-[#09232D] border-[#09232D] text-white shadow-sm"
                        : "bg-white hover:bg-gray-50 border-gray-100"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-gray-200">
                      <img src={avatar} alt={agent.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-black truncate ${isSelected ? "text-white" : "text-[#0B1215]"}`}>
                        {agent.name}
                      </p>
                      <p className={`text-[10px] truncate mt-0.5 ${isSelected ? "text-white/60" : "text-gray-400"}`}>
                        {agent.assigned_zone ?? "Unassigned Zone"}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Select Agent / Journey Logs details */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {!selectedAgent ? (
            <div className="flex-1 bg-white border border-gray-100 rounded-3xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col items-center justify-center text-center min-h-[500px]">
              <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 mb-3">
                <Users size={32} />
              </div>
              <h3 className="text-sm font-bold text-[#0B1215]">Select an Agent</h3>
              <p className="text-xs text-gray-400 max-w-xs mt-1.5 leading-relaxed">
                Choose an agent from the list on the left to view their journey log records, route totals, and visit histories.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Selector Profile Header */}
              <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border border-gray-200">
                    <img src={resolveAvatarSrc(selectedAgent.avatar_url)} alt={selectedAgent.name} className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-[#0B1215]">{selectedAgent.name}</h3>
                    <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                      {selectedAgent.assigned_zone ?? "Unassigned Zone"} · {selectedAgent.email}
                    </p>
                  </div>
                </div>

                {/* Preset Controls */}
                <div className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200/50">
                  {(Object.keys(presetLabels) as PresetType[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => handlePresetChange(p)}
                      className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
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

              {/* Stats Counters */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-28">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Days Logged</span>
                  <div>
                    <h4 className="text-xl font-black text-[#0B1215]">
                      {summary?.journey_count ?? 0} {summary?.journey_count === 1 ? "Day" : "Days"}
                    </h4>
                  </div>
                </div>
                <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-28">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Distance</span>
                  <div>
                    <h4 className="text-xl font-black text-[#0B1215]">
                      {formatKm(summary?.distance_meters ?? 0)}
                    </h4>
                  </div>
                </div>
                <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-28">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Visits</span>
                  <div>
                    <h4 className="text-xl font-black text-[#0B1215]">
                      {summary?.visit_count ?? 0} {summary?.visit_count === 1 ? "Visit" : "Visits"}
                    </h4>
                  </div>
                </div>
                <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-28">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Transit Duration</span>
                  <div>
                    <h4 className="text-xl font-black text-[#0B1215]">
                      {formatDuration(summary?.travel_seconds ?? 0)}
                    </h4>
                  </div>
                </div>
              </div>

              {/* Logs Content Card */}
              <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col min-h-80">
                <div className="border-b border-gray-100 pb-3 mb-5 flex justify-between items-center">
                  <h4 className="text-xs font-black text-[#0B1215] uppercase tracking-wider">Journey Logs</h4>
                  <div className="flex items-center gap-1.5 text-gray-400 text-xs font-bold">
                    <CalendarDays size={13} />
                    <span>{from === to ? from : `${from} to ${to}`}</span>
                  </div>
                </div>

                {journeysLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-16 gap-2">
                    <Loader2 size={24} className="animate-spin text-gray-300" />
                    <p className="text-xs text-gray-400 font-bold">Loading agent logs...</p>
                  </div>
                ) : journeys.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
                    <Route size={24} className="text-gray-300 mb-2" />
                    <p className="text-xs text-gray-400 font-bold">No journey logs found for this period</p>
                  </div>
                ) : (
                  <div className="space-y-6">
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
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider leading-none">
                              {dayLabel}
                            </p>
                            <p className="text-lg font-black text-[#0B1215] mt-1 leading-tight">{dayNum}</p>
                            <p className="text-[9px] text-gray-400 uppercase leading-none mt-0.5">{monthLabel}</p>
                          </div>

                          {/* Line */}
                          <div className="flex flex-col items-center gap-1 shrink-0">
                            <div
                              className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ring-4 ${
                                isActive
                                  ? "bg-sky-500 ring-sky-100"
                                  : "bg-[#09232D] ring-gray-100"
                              }`}
                            />
                            <div className="w-px flex-1 bg-gray-100 group-last:bg-transparent" />
                          </div>

                          {/* Card Content */}
                          <div className="flex-1 min-w-0 pb-2">
                            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.01)] group-hover:shadow-[0_4px_14px_rgba(0,0,0,0.05)] transition-all duration-300">
                              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                                <div className="flex items-center gap-2">
                                  {clockIn ? (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                      <span className="text-xs font-bold text-[#0B1215]">{clockIn}</span>
                                      {clockOut ? (
                                        <>
                                          <span className="text-xs text-gray-300">→</span>
                                          <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                          <span className="text-xs text-gray-500 font-medium">{clockOut}</span>
                                        </>
                                      ) : (
                                        isActive && (
                                          <span className="text-[9px] font-bold text-sky-600 bg-sky-50 px-2 py-0.5 rounded-full">
                                            Active
                                          </span>
                                        )
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-gray-400 italic">No check-in record</span>
                                  )}
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                    isActive
                                      ? "bg-sky-50 text-sky-700"
                                      : "bg-[#EEF4F4] text-[#094B5C]"
                                  }`}
                                >
                                  {isActive ? "Active" : "Completed"}
                                </span>
                              </div>

                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                                <div className="bg-gray-50/50 rounded-xl p-2.5">
                                  <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">Distance</p>
                                  <p className="text-xs font-black text-[#0B1215]">{formatKm(journey.distance_meters)}</p>
                                </div>
                                <div className="bg-gray-50/50 rounded-xl p-2.5">
                                  <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">Stops / Visits</p>
                                  <p className="text-xs font-black text-[#0B1215]">{journey.stop_count} stops · {journey.visit_count} visits</p>
                                </div>
                                <div className="bg-gray-50/50 rounded-xl p-2.5">
                                  <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">Duration</p>
                                  <p className="text-xs font-black text-[#0B1215]">{formatDuration(journey.active_seconds)}</p>
                                </div>
                                <div className="bg-gray-50/50 rounded-xl p-2.5">
                                  <p className="text-[9px] font-bold text-gray-400 uppercase mb-0.5">Efficiency</p>
                                  <p className="text-xs font-black text-[#0B1215]">
                                    {journey.travel_efficiency != null ? `${Math.round(journey.travel_efficiency * 100)}%` : "—"}
                                  </p>
                                </div>
                              </div>

                              {journey.narrative && (
                                <div className="bg-sky-50/30 rounded-xl p-3 flex items-start gap-2 mb-3">
                                  <Sparkles size={12} className="text-sky-500 mt-0.5 shrink-0" />
                                  <p className="text-[11px] text-gray-600 leading-relaxed italic">
                                    &ldquo;{journey.narrative}&rdquo;
                                  </p>
                                </div>
                              )}

                              <div className="flex justify-end">
                                <Link
                                  href={`/operations/journeys/${journey.id}`}
                                  className="px-4 py-2 bg-[#09232D] text-white rounded-xl text-[11px] font-bold hover:bg-[#133d4e] transition-all shadow-sm"
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

                {/* Pagination */}
                {!journeysLoading && totalPages > 1 && (
                  <div className="flex items-center justify-between pt-5 border-t border-gray-100 mt-5">
                    <p className="text-[10px] text-gray-400">
                      Page {page} of {totalPages} ({pagination?.total ?? 0} records)
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="flex items-center justify-center w-7 h-7 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronLeft size={12} />
                      </button>
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={`w-7 h-7 rounded-full text-[11px] font-bold transition-all ${
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
                        className="flex items-center justify-center w-7 h-7 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SupervisorJourneyPage() {
  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <Suspense
        fallback={
          <div className="min-h-[50vh] flex items-center justify-center text-gray-400 font-bold text-sm">
            <Loader2 className="animate-spin text-gray-300 mr-2" size={20} />
            Loading Journeys Overview...
          </div>
        }
      >
        <SupervisorJourneyContent />
      </Suspense>
    </div>
  );
}
