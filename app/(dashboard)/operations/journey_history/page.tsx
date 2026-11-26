"use client";

import { useCallback, useMemo, useState, Suspense } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format, parse, parseISO } from "date-fns";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RefreshCw,
  Route,
  Search,
  Sparkles,
  Users,
  ArrowLeft,
} from "lucide-react";
import { useAgentJourneys } from "@/hooks/use-field-journeys";
import { useInternalUsers, useSupervisorCandidates } from "@/hooks/use-internal-users";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { resolveAvatarSrc } from "@/lib/avatar";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { getAgentJourneys, getJourneyDetail } from "@/lib/api/field-activity";
import {
  buildJourneysCsv,
  buildStopsCsv,
  downloadTextFile,
  fetchAllPages,
  fileSlug,
  mapWithConcurrency,
} from "@/lib/tracking/export-journeys-csv";
import {
  buildJourneyHistoryQuery,
  getPresetRange,
  JOURNEY_PRESET_LABELS,
  JOURNEY_PRESETS,
  parseJourneyHistoryParams,
  sortTripsNewestFirst,
  tripCountLabel,
  tripEndIso,
  tripStartIso,
  windowedPages,
  type JourneyHistoryUrlState,
  type JourneyPreset,
} from "@/lib/tracking/journey-history";

function formatKm(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "—";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Something went wrong.";
}

const PER_PAGE = 10;
/** Backend maximum for one journeys page; used to pull everything for export. */
const EXPORT_PAGE_SIZE = 60;

function SupervisorJourneyContent() {
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId } = getActiveCompanyContext(user);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Selection lives in the URL (?user=&preset=&page=&from=&to=) so it survives
  // reloads and can be linked to from the map and notifications.
  const urlState = useMemo(() => parseJourneyHistoryParams(searchParams), [searchParams]);
  const { userId: selectedAgentId, preset, page } = urlState;
  const updateUrl = useCallback(
    (patch: Partial<JourneyHistoryUrlState>) => {
      const qs = buildJourneyHistoryQuery({ ...urlState, ...patch });
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, urlState],
  );

  const [searchQuery, setSearchQuery] = useState("");
  const [exporting, setExporting] = useState<"trips" | "stops" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  // Fetch agents assigned to supervisor (automatically restricted on backend)
  const agentsQuery = useInternalUsers({
    company_id: apiCompanyId ?? undefined,
    role: "agent",
  });

  // Managers go on field trips too: list owners/admins/supervisors (a supervisor
  // sees only themselves here) alongside the agents.
  const managersQuery = useSupervisorCandidates(apiCompanyId ?? undefined);
  const agents = useMemo(() => {
    const roleLabel: Record<string, string> = { owner: "Owner", admin: "Admin", supervisor: "Supervisor" };
    return [
      ...(managersQuery.data ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email ?? null,
        avatar_url: m.avatar_url ?? null,
        assigned_zone: roleLabel[m.role] ?? m.role,
      })),
      ...(agentsQuery.data ?? []).map((a) => ({
        id: a.id,
        name: a.name,
        email: a.email ?? null,
        avatar_url: a.avatar_url ?? null,
        assigned_zone: a.assigned_zone ?? null,
      })),
    ].filter((person, idx, all) => all.findIndex((p) => p.id === person.id) === idx);
  }, [agentsQuery.data, managersQuery.data]);
  const needle = searchQuery.trim().toLowerCase();
  const filteredAgents = agents.filter(
    (agent) =>
      agent.name.toLowerCase().includes(needle) ||
      (agent.email && agent.email.toLowerCase().includes(needle)),
  );
  const agentsLoading = agentsQuery.isLoading;
  const anyListError = agentsQuery.isError || managersQuery.isError;
  // Nothing to show at all → full error; partial list → small banner + retry.
  const agentsError = anyListError && agents.length === 0;
  const retryAgents = () => {
    if (agentsQuery.isError) void agentsQuery.refetch();
    if (managersQuery.isError) void managersQuery.refetch();
  };

  const selectedAgent = agents.find((a) => String(a.id) === selectedAgentId) ?? null;

  const { from, to } = getPresetRange(preset, new Date(), { from: urlState.from, to: urlState.to });
  const listParams = {
    company_id: apiCompanyId ?? undefined,
    from,
    to,
    preset,
    page,
    per_page: PER_PAGE,
  };

  const journeysQuery = useAgentJourneys(selectedAgentId ?? undefined, listParams);
  const journeysData = journeysQuery.data;
  const journeysLoading = journeysQuery.isLoading;

  const journeys = useMemo(() => sortTripsNewestFirst(journeysData?.items ?? []), [journeysData]);
  const summary = journeysData?.summary;
  const pagination = journeysData?.pagination;
  const totalPages = pagination?.last_page ?? 1;

  const handleAgentSelect = (agentId: string) => {
    setExportError(null);
    updateUrl({ userId: agentId, page: 1 });
  };

  const handlePresetChange = (next: JourneyPreset) => {
    if (next === "custom") {
      // Start the custom range from what is on screen now.
      updateUrl({ preset: next, page: 1, from, to });
      return;
    }
    updateUrl({ preset: next, page: 1, from: null, to: null });
  };

  const handleExport = async (kind: "trips" | "stops") => {
    if (!selectedAgentId || !selectedAgent || exporting) return;
    setExporting(kind);
    setExportError(null);
    try {
      const token = getAuthTokenFromDocument();
      const all = sortTripsNewestFirst(
        await fetchAllPages(async (p) => {
          const res = await getAgentJourneys(
            selectedAgentId,
            { ...listParams, page: p, per_page: EXPORT_PAGE_SIZE },
            token,
          );
          return res.data;
        }),
      );
      const stamp = `${from}_to_${to}`;
      const who = fileSlug(selectedAgent.name);
      if (kind === "trips") {
        downloadTextFile(`trips-${who}-${stamp}.csv`, buildJourneysCsv(all, selectedAgent.name));
      } else {
        const withStops = await mapWithConcurrency(
          all.filter((trip) => trip.stop_count > 0),
          4,
          async (trip) => {
            const res = await getJourneyDetail(
              trip.id,
              { company_id: apiCompanyId ?? undefined, include_route: false, include_timeline: false },
              token,
            );
            return { journey: trip, stops: res.data.stops ?? [] };
          },
        );
        downloadTextFile(`trip-stops-${who}-${stamp}.csv`, buildStopsCsv(withStops, selectedAgent.name));
      }
    } catch (error) {
      setExportError(`Export failed: ${errorMessage(error)}`);
    } finally {
      setExporting(null);
    }
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
          Journey History
        </h1>
        <p className="text-sm text-gray-500 font-medium">
          Review field trips: routes, stops and client visits for the people you manage.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Left Column: Search & People List */}
        <div className="lg:col-span-1 flex flex-col gap-4 bg-white border border-gray-100 rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] h-[calc(100vh-250px)] min-h-[500px]">
          <h2 className="text-sm font-black text-[#0B1215] uppercase tracking-wider pb-1">
            Team
          </h2>

          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search by name or email..."
              aria-label="Search team members"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-2xl pl-10 pr-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-[#09232D]/10 focus:bg-white transition-all font-medium placeholder:text-gray-400"
            />
          </div>

          {anyListError && !agentsError && (
            <div role="alert" className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
              <span>Part of your team list didn&apos;t load.</span>
              <button type="button" onClick={retryAgents} className="inline-flex items-center gap-1 underline">
                <RefreshCw size={11} /> Retry
              </button>
            </div>
          )}

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-100">
            {agentsLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2">
                <Loader2 size={24} className="animate-spin text-gray-300" />
                <p className="text-xs text-gray-400 font-bold">Loading team...</p>
              </div>
            ) : agentsError ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 gap-3 text-center" role="alert">
                <AlertTriangle size={22} className="text-amber-500" />
                <p className="text-xs text-gray-500 font-semibold">We couldn&apos;t load your team.</p>
                <button
                  type="button"
                  onClick={retryAgents}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#09232D] px-3 py-1.5 text-[11px] font-bold text-white"
                >
                  <RefreshCw size={12} /> Try again
                </button>
              </div>
            ) : filteredAgents.length === 0 ? (
              <div className="text-center py-20 px-4">
                <p className="text-xs text-gray-400 font-semibold">No one found</p>
              </div>
            ) : (
              filteredAgents.map((agent) => {
                const isSelected = String(agent.id) === selectedAgentId;
                const avatar = resolveAvatarSrc(agent.avatar_url);

                return (
                  <button
                    key={agent.id}
                    type="button"
                    onClick={() => handleAgentSelect(String(agent.id))}
                    aria-pressed={isSelected}
                    className={`w-full flex items-center gap-3 p-3 rounded-2xl border text-left transition-all ${
                      isSelected
                        ? "bg-[#09232D] border-[#09232D] text-white shadow-sm"
                        : "bg-white hover:bg-gray-50 border-gray-100"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-gray-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={avatar} alt="" className="w-full h-full object-cover" />
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

        {/* Right Column */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          {!selectedAgent ? (
            <div className="flex-1 bg-white border border-gray-100 rounded-3xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col items-center justify-center text-center min-h-[500px]">
              <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center text-gray-300 mb-3">
                <Users size={32} />
              </div>
              <h3 className="text-sm font-bold text-[#0B1215]">
                {selectedAgentId && agentsLoading ? "Loading…" : "Select a team member"}
              </h3>
              <p className="text-xs text-gray-400 max-w-xs mt-1.5 leading-relaxed">
                {selectedAgentId && !agentsLoading && !agentsError
                  ? "This person isn't in your team list. Pick someone on the left."
                  : "Choose someone on the left to see their field trips, distance and visits."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              {/* Person header + range controls */}
              <div className="bg-white border border-gray-100 rounded-3xl p-5 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col gap-4">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border border-gray-200">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={resolveAvatarSrc(selectedAgent.avatar_url)} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-[#0B1215]">{selectedAgent.name}</h3>
                      <p className="text-[10px] text-gray-400 font-medium mt-0.5">
                        {selectedAgent.assigned_zone ?? "Unassigned Zone"}
                        {selectedAgent.email ? ` · ${selectedAgent.email}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleExport("trips")}
                      disabled={exporting != null || journeysLoading || (summary?.journey_count ?? 0) === 0}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                      title="Download every trip in this period as CSV"
                    >
                      {exporting === "trips" ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                      Export trips
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleExport("stops")}
                      disabled={exporting != null || journeysLoading || (summary?.stop_count ?? 0) === 0}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                      title="Download every stop in this period as CSV"
                    >
                      {exporting === "stops" ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                      Export stops
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div
                    className="flex flex-wrap gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200/50"
                    role="group"
                    aria-label="Date range"
                  >
                    {JOURNEY_PRESETS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handlePresetChange(p)}
                        aria-pressed={preset === p}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                          preset === p
                            ? "bg-[#09232D] text-white shadow-sm"
                            : "text-gray-500 hover:text-gray-900 hover:bg-gray-200/50"
                        }`}
                      >
                        {JOURNEY_PRESET_LABELS[p]}
                      </button>
                    ))}
                  </div>
                  {preset === "custom" && (
                    <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold text-gray-600">
                      <label className="flex items-center gap-1.5">
                        From
                        <input
                          type="date"
                          value={from}
                          max={to}
                          onChange={(e) => e.target.value && updateUrl({ from: e.target.value, page: 1 })}
                          className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-gray-800"
                        />
                      </label>
                      <label className="flex items-center gap-1.5">
                        To
                        <input
                          type="date"
                          value={to}
                          min={from}
                          onChange={(e) => e.target.value && updateUrl({ to: e.target.value, page: 1 })}
                          className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-gray-800"
                        />
                      </label>
                    </div>
                  )}
                </div>

                {exportError && (
                  <p role="alert" className="text-[11px] font-semibold text-red-600 bg-red-50 rounded-lg px-3 py-2">
                    {exportError}
                  </p>
                )}
              </div>

              {/* Stats Counters */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-28">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Trips</span>
                  <h4 className="text-xl font-black text-[#0B1215]">
                    {tripCountLabel(summary?.journey_count ?? 0)}
                  </h4>
                </div>
                <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-28">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Distance</span>
                  <h4 className="text-xl font-black text-[#0B1215]">
                    {formatKm(summary?.distance_meters ?? 0)}
                  </h4>
                </div>
                <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-28">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Visits</span>
                  <h4 className="text-xl font-black text-[#0B1215]">
                    {summary?.visit_count ?? 0} {summary?.visit_count === 1 ? "Visit" : "Visits"}
                  </h4>
                </div>
                <div className="bg-white border border-gray-100 rounded-3xl p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col justify-between min-h-28">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Travel Time</span>
                  <h4 className="text-xl font-black text-[#0B1215]">
                    {formatDuration(summary?.travel_seconds ?? 0)}
                  </h4>
                </div>
              </div>

              {/* Trip list */}
              <div className="bg-white border border-gray-100 rounded-3xl p-6 shadow-[0_2px_12px_rgba(0,0,0,0.03)] flex flex-col min-h-80">
                <div className="border-b border-gray-100 pb-3 mb-5 flex justify-between items-center">
                  <h4 className="text-xs font-black text-[#0B1215] uppercase tracking-wider">Trips</h4>
                  <div className="flex items-center gap-1.5 text-gray-400 text-xs font-bold">
                    <CalendarDays size={13} />
                    <span>
                      {from === to
                        ? format(parse(from, "yyyy-MM-dd", new Date()), "d MMM yyyy")
                        : `${format(parse(from, "yyyy-MM-dd", new Date()), "d MMM")} – ${format(parse(to, "yyyy-MM-dd", new Date()), "d MMM yyyy")}`}
                    </span>
                  </div>
                </div>

                {journeysLoading ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-16 gap-2">
                    <Loader2 size={24} className="animate-spin text-gray-300" />
                    <p className="text-xs text-gray-400 font-bold">Loading trips...</p>
                  </div>
                ) : journeysQuery.isError ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-16 gap-3 text-center" role="alert">
                    <AlertTriangle size={22} className="text-amber-500" />
                    <p className="text-xs text-gray-500 font-semibold">
                      We couldn&apos;t load trips. {errorMessage(journeysQuery.error)}
                    </p>
                    <button
                      type="button"
                      onClick={() => void journeysQuery.refetch()}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#09232D] px-3 py-1.5 text-[11px] font-bold text-white"
                    >
                      <RefreshCw size={12} /> Try again
                    </button>
                  </div>
                ) : journeys.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center py-16 text-center">
                    <Route size={24} className="text-gray-300 mb-2" />
                    <p className="text-xs text-gray-400 font-bold">No trips in this period</p>
                  </div>
                ) : (
                  <ol className="space-y-6">
                    {journeys.map((journey) => {
                      const startIso = tripStartIso(journey);
                      const endIso = tripEndIso(journey);
                      const dayIso = startIso ?? journey.date;
                      const date = dayIso ? parseISO(dayIso) : null;
                      const dayLabel = date ? format(date, "EEE") : "—";
                      const dayNum = date ? format(date, "d") : "—";
                      const monthLabel = date ? format(date, "MMM") : "";
                      const isTrip = journey.source === "field_trip";
                      const clockIn = startIso ? format(parseISO(startIso), "h:mma") : null;
                      const clockOut = endIso ? format(parseISO(endIso), "h:mma") : null;
                      const isActive = journey.status === "active";
                      const autoEnded = journey.end_reason === "auto_no_signal";

                      return (
                        <li key={journey.id} className="flex items-stretch gap-4 group">
                          <div className="flex flex-col items-center w-12 shrink-0 pt-1">
                            <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider leading-none">
                              {dayLabel}
                            </p>
                            <p className="text-lg font-black text-[#0B1215] mt-1 leading-tight">{dayNum}</p>
                            <p className="text-[9px] text-gray-400 uppercase leading-none mt-0.5">{monthLabel}</p>
                          </div>

                          <div className="flex flex-col items-center gap-1 shrink-0" aria-hidden="true">
                            <div
                              className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ring-4 ${
                                isActive ? "bg-sky-500 ring-sky-100" : "bg-[#09232D] ring-gray-100"
                              }`}
                            />
                            <div className="w-px flex-1 bg-gray-100 group-last:bg-transparent" />
                          </div>

                          <div className="flex-1 min-w-0 pb-2">
                            <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-[0_1px_3px_rgba(0,0,0,0.01)] group-hover:shadow-[0_4px_14px_rgba(0,0,0,0.05)] transition-all duration-300">
                              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                      isTrip ? "bg-[#FFF1EE] text-[#C2412B]" : "bg-gray-100 text-gray-500"
                                    }`}
                                  >
                                    {isTrip ? "Field Trip" : "Clock-in day"}
                                  </span>
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
                                      ) : null}
                                    </div>
                                  ) : (
                                    <span className="text-xs text-gray-400 italic">No start time recorded</span>
                                  )}
                                </div>
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${
                                    isActive
                                      ? "bg-sky-50 text-sky-700"
                                      : autoEnded
                                        ? "bg-amber-50 text-amber-700"
                                        : "bg-[#EEF4F4] text-[#094B5C]"
                                  }`}
                                >
                                  {isActive ? "● Live" : autoEnded ? "Auto-ended" : "Completed"}
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
                                  {isTrip ? "View Trip Map" : "View Journey Map"}
                                </Link>
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {/* Pagination (windowed) */}
                {!journeysLoading && !journeysQuery.isError && totalPages > 1 && (
                  <nav
                    aria-label="Trip pages"
                    className="flex items-center justify-between pt-5 border-t border-gray-100 mt-5 flex-wrap gap-2"
                  >
                    <p className="text-[10px] text-gray-400">
                      Page {page} of {totalPages} ({pagination?.total ?? 0} trips)
                    </p>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateUrl({ page: Math.max(1, page - 1) })}
                        disabled={page <= 1}
                        aria-label="Previous page"
                        className="flex items-center justify-center w-7 h-7 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronLeft size={12} />
                      </button>
                      {windowedPages(page, totalPages).map((p, index) =>
                        p === "gap" ? (
                          <span key={`gap-${index}`} className="w-7 text-center text-[11px] text-gray-300">…</span>
                        ) : (
                          <button
                            key={p}
                            type="button"
                            onClick={() => updateUrl({ page: p })}
                            aria-current={p === page ? "page" : undefined}
                            className={`w-7 h-7 rounded-full text-[11px] font-bold transition-all ${
                              p === page ? "bg-[#09232D] text-white shadow-sm" : "text-gray-400 hover:bg-gray-100"
                            }`}
                          >
                            {p}
                          </button>
                        ),
                      )}
                      <button
                        type="button"
                        onClick={() => updateUrl({ page: Math.min(totalPages, page + 1) })}
                        disabled={page >= totalPages}
                        aria-label="Next page"
                        className="flex items-center justify-center w-7 h-7 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronRight size={12} />
                      </button>
                    </div>
                  </nav>
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
            Loading Journey History...
          </div>
        }
      >
        <SupervisorJourneyContent />
      </Suspense>
    </div>
  );
}
