"use client";

import { useCallback, useState } from "react";
import { describeTrackingHealth, type TrackingHealth } from "@/lib/tracking/tracking-health";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format, parse, parseISO } from "date-fns";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Download,
  Loader2,
  MapPin,
  RefreshCw,
  Route,
  Users,
} from "lucide-react";
import { useJourneyDetail } from "@/hooks/use-field-journeys";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useAuthStore } from "@/store/auth";
import { RoutePlaybackControls } from "@/components/operations/route-playback-controls";
import {
  EVENT_COLORS,
  formatJourneyDuration as formatDuration,
  formatStopWindow,
  JourneyMap,
  stopMarkerColor,
} from "@/components/operations/journey-map";
import {
  ACTIVITY_LABELS,
  ReportStatusBadge,
  StopRecordPanel,
  TripSummaryPanel,
} from "@/components/operations/stop-record-panel";
import {
  buildJourneysCsv,
  buildStopsCsv,
  downloadTextFile,
  fileSlug,
} from "@/lib/tracking/export-journeys-csv";

function formatKm(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// Stable empties so memoised map data doesn't change identity every render.
const EMPTY_TIMELINE: never[] = [];
const EMPTY_STOPS: never[] = [];
const EMPTY_COORDS: [number, number][] = [];

type JourneyViewProps = {
  sessionId: string;
  asAgent?: boolean;
  backHref?: string;
  journeyBasePath?: string;
};

function TrackingHealthCard({ health }: { health: TrackingHealth }) {
  const summary = describeTrackingHealth(health);
  const good = summary.status === "good";
  return (
    <div
      className={`rounded-xl border px-3 py-3 space-y-2 ${
        good ? "border-emerald-100 bg-emerald-50/60" : "border-amber-200 bg-amber-50"
      }`}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Tracking health</p>
      <p className={`text-[12px] font-bold ${good ? "text-emerald-700" : "text-amber-800"}`}>
        {good ? "Recorded normally" : "Tracking problems on the phone"}
      </p>
      {summary.issues.length > 0 && (
        <ul className="list-disc pl-4 space-y-1">
          {summary.issues.map((issue) => (
            <li key={issue} className="text-[11px] text-amber-900 leading-snug">
              {issue}
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-1">
        {summary.facts.map((f) => (
          <div key={f.label} className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-gray-500">{f.label}</span>
            <span className="text-[11px] font-bold text-[#0B1215]">{f.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function JourneyView({
  sessionId,
  asAgent = false,
  backHref = "/operations/journey_history",
  journeyBasePath = "/operations/journeys",
}: JourneyViewProps) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const companyId = getActiveCompanyContext(user)?.apiCompanyId ?? undefined;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [playbackIndex, setPlaybackIndex] = useState(0);

  const { data, isLoading, isError, refetch, isFetching } = useJourneyDetail(sessionId, {
    company_id: companyId,
    asAgent,
  });

  const journey = data?.journey;
  const stats = data?.stats;
  const timeline = data?.timeline ?? EMPTY_TIMELINE;
  const stops = data?.stops ?? EMPTY_STOPS;
  const route = data?.route;
  const navigation = data?.navigation;
  const coordinates = (route?.coordinates ?? EMPTY_COORDS) as [number, number][];
  const isTrip = journey?.source === "field_trip";
  const isLive = journey?.status === "active";

  // Reset playback and selection when moving to another trip — not when a
  // live trip's refetch adds points.
  const [prevSessionId, setPrevSessionId] = useState(sessionId);
  if (sessionId !== prevSessionId) {
    setPrevSessionId(sessionId);
    setPlaybackIndex(0);
    setSelectedId(null);
  }

  const selectedEvent = timeline.find((e) => e.id === selectedId) ?? null;
  const selectedStop = stops.find((s) => `stop_${s.id}` === selectedId) ?? null;
  const handleSelect = useCallback((id: string) => setSelectedId(id), []);

  // Manager view: go back to this person's history, not an empty page.
  const resolvedBackHref =
    !asAgent && data?.agent?.id && backHref.endsWith("/journey_history")
      ? `${backHref}?user=${data.agent.id}`
      : backHref;
  const backLabel = backHref.includes("journey_history") ? "Back to Journey History" : "Back";
  const csvBase = journey
    ? `${isTrip ? "trip" : "journey"}-${journey.id}-${fileSlug(data?.agent?.name ?? "person")}`
    : "trip";

  const handleExportTrip = () => {
    if (!journey) return;
    const csv = buildJourneysCsv([journey], data?.agent?.name ?? undefined);
    downloadTextFile(`${csvBase}.csv`, csv);
  };

  const handleExportStops = () => {
    if (!journey) return;
    const csv = buildStopsCsv([{ journey, stops }], data?.agent?.name ?? undefined);
    downloadTextFile(`${csvBase}-stops.csv`, csv);
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#F4F6F7] flex flex-col">
      <div className="shrink-0 border-b border-gray-200 bg-white px-4 sm:px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={resolvedBackHref}
              aria-label={backLabel}
              title={backLabel}
              className="flex items-center justify-center w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <ChevronLeft size={18} className="text-[#0B1215]" />
            </Link>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {isTrip
                  ? journey?.end_reason === "auto_no_signal"
                    ? "Field Trip · Auto-ended (no location)"
                    : isLive
                      ? "Field Trip · Live"
                      : "Field Trip"
                  : "Clock-in day"}
                {isLive && isFetching ? " · updating…" : ""}
                {isTrip && journey ? (
                  <span className="ml-2 normal-case tracking-normal align-middle">
                    <ReportStatusBadge journey={journey} />
                  </span>
                ) : null}
              </p>
              <h1 className="text-[18px] font-black text-[#0B1215] truncate">
                {data?.agent?.name ?? "Agent"}
                {journey?.date ? (
                  <span className="text-gray-400 font-bold">
                    {" "}
                    · {format(parse(journey.date, "yyyy-MM-dd", new Date()), "EEE, MMM d yyyy")}
                  </span>
                ) : null}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportTrip}
              disabled={!journey}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-[#0B1215] disabled:opacity-40"
            >
              <Download size={14} />
              {isTrip ? "Export trip" : "Export day"}
            </button>
            <button
              type="button"
              onClick={handleExportStops}
              disabled={!journey || stops.length === 0}
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-[#0B1215] disabled:opacity-40"
            >
              <Download size={14} />
              Export stops
            </button>
            <button
              type="button"
              disabled={!navigation?.previous_id}
              onClick={() =>
                navigation?.previous_id &&
                router.push(`${journeyBasePath}/${navigation.previous_id}`)
              }
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-[#0B1215] disabled:opacity-40"
            >
              <ChevronLeft size={14} />
              Previous
            </button>
            <button
              type="button"
              disabled={!navigation?.next_id}
              onClick={() =>
                navigation?.next_id &&
                router.push(`${journeyBasePath}/${navigation.next_id}`)
              }
              className="inline-flex items-center gap-1 rounded-full border border-gray-200 px-3 py-1.5 text-[11px] font-bold text-[#0B1215] disabled:opacity-40"
            >
              Next
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="animate-spin text-gray-300" size={28} />
        </div>
      ) : isError || !data ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 p-8">
          <Route className="text-gray-300" size={32} />
          <p className="text-sm text-gray-500 font-medium" role="alert">
            Unable to load this {isTrip ? "trip" : "journey"}.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void refetch()}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#0B1215] px-3 py-1.5 text-[11px] font-bold text-white"
            >
              <RefreshCw size={12} /> Try again
            </button>
            <Link href={resolvedBackHref} className="text-[12px] font-bold text-[#2F5E71]">
              {backLabel}
            </Link>
          </div>
        </div>
      ) : (
        <div className="flex-1 grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_260px] gap-3 p-3 sm:p-4 min-h-0">
          {/* Timeline */}
          <aside className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col max-h-[42vh] xl:max-h-none">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                Timeline
              </p>
              <p className="text-[13px] font-bold text-[#0B1215] mt-0.5">
                {timeline.length} events
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {timeline.map((event) => {
                const time = event.occurred_at
                  ? format(parseISO(event.occurred_at), "h:mm a")
                  : "—";
                const active = selectedId === event.id;
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={() => setSelectedId(event.id)}
                    aria-pressed={active}
                    className={`w-full text-left rounded-xl px-3 py-2.5 transition-colors ${
                      active ? "bg-[#EEF4F4]" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span
                        className="mt-1.5 w-2.5 h-2.5 rounded-full shrink-0"
                        style={{
                          background: EVENT_COLORS[event.color] ?? "#9CA3AF",
                        }}
                      />
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold text-gray-400">{time}</p>
                        <p className="text-[12px] font-bold text-[#0B1215] truncate">
                          {event.label}
                        </p>
                        {event.duration_seconds != null && event.duration_seconds > 0 && (
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            {formatDuration(event.duration_seconds)}
                          </p>
                        )}
                        {event.address ? (
                          <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2">
                            {event.address}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* Map */}
          <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden min-h-[320px] xl:min-h-0 flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                  Route
                </p>
                <p className="text-[13px] font-bold text-[#0B1215]">
                  {formatKm(stats?.distance_meters ?? 0)} travelled
                </p>
              </div>
              {(selectedEvent || selectedStop) && (
                <div className="text-right max-w-[50%]">
                  <p className="text-[10px] font-bold text-gray-400 truncate">
                    Selected
                  </p>
                  <p className="text-[12px] font-bold text-[#0B1215] truncate">
                    {selectedEvent?.label ??
                      (selectedStop
                        ? selectedStop.address || `Stop ${stops.indexOf(selectedStop) + 1}`
                        : "")}
                  </p>
                </div>
              )}
            </div>
            <div className="flex-1 min-h-[280px] p-2 flex flex-col gap-2">
              {route && (route.raw_point_count ?? 0) === 0 ? (
                <div className="h-full w-full rounded-2xl border border-dashed border-gray-200 bg-[#F8F9FA] flex flex-col items-center justify-center gap-2">
                  <Route className="text-gray-300" size={26} />
                  <p className="text-[12px] font-semibold text-gray-500">
                    {isLive
                      ? "Waiting for the first location from the phone…"
                      : isTrip
                        ? "This trip was recorded, but no route points were captured."
                        : "Session was recorded, but no route points were captured."}
                  </p>
                  <p className="text-[11px] text-gray-400 text-center max-w-[320px]">
                    {isLive
                      ? "The route appears here as soon as the phone sends its location."
                      : isTrip
                        ? "This usually means location was switched off or the app was stopped during the trip."
                        : "This usually means background location collection was interrupted for that day."}
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-h-[240px]">
                    <JourneyMap
                      coordinates={coordinates}
                      timeline={timeline}
                      stops={stops}
                      selectedId={selectedId}
                      onSelect={handleSelect}
                      clockIn={route?.clock_in ?? null}
                      clockOut={route?.clock_out ?? null}
                      bounds={route?.bounds ?? null}
                      playbackIndex={playbackIndex}
                      isTrip={isTrip}
                      fitKey={sessionId}
                    />
                  </div>
                  <RoutePlaybackControls
                    pointCount={coordinates.length}
                    index={playbackIndex}
                    onIndexChange={setPlaybackIndex}
                  />
                </>
              )}
            </div>
          </section>

          {/* Stats */}
          <aside className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                {isTrip ? "Trip Stats" : "Journey Stats"}
              </p>
              <p className="text-[13px] font-bold text-[#0B1215] mt-0.5">
                {isTrip ? "Trip summary" : "Day summary"}
              </p>
            </div>
            <div className="p-4 space-y-3 overflow-y-auto">
              {isTrip && journey?.ai_summary ? <TripSummaryPanel summary={journey.ai_summary} /> : null}
              {isTrip && selectedStop ? (
                <StopRecordPanel stop={selectedStop} index={stops.indexOf(selectedStop)} companyId={companyId} />
              ) : null}
              {stops.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    Stops
                  </p>
                  {stops.map((stop, index) => {
                    const active = selectedId === `stop_${stop.id}`;
                    return (
                      <button
                        key={stop.id}
                        type="button"
                        onClick={() => setSelectedId(`stop_${stop.id}`)}
                        aria-pressed={active}
                        className={`w-full text-left rounded-xl px-3 py-2.5 border transition-colors ${
                          active
                            ? "border-[#F97316]/40 bg-orange-50"
                            : "border-gray-100 bg-[#F8F9FA] hover:border-gray-200"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white"
                            style={{ background: stopMarkerColor(stop.classification) }}
                          >
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11px] font-bold text-[#0B1215] truncate">
                              {stop.address || `Stop ${index + 1}`}
                            </p>
                            <p className="text-[10px] text-gray-500 mt-0.5">
                              {formatStopWindow(stop.arrived_at, stop.departed_at) ?? "Time unavailable"}
                              {stop.duration_seconds > 0
                                ? ` · ${formatDuration(stop.duration_seconds)}`
                                : ""}
                            </p>
                            <p className="text-[10px] text-gray-400 mt-0.5">
                              {isTrip
                                ? stop.record_status === "recorded"
                                  ? (ACTIVITY_LABELS[stop.classification ?? ""] ?? "Recorded") +
                                    (stop.attachments?.length ? ` · ${stop.attachments.length} file${stop.attachments.length > 1 ? "s" : ""}` : "")
                                  : "Not recorded"
                                : (stop.classification ?? "pending").replaceAll("_", " ")}
                              {stop.source === "manual" ? " · added by agent" : ""}
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
              {[
                {
                  icon: Route,
                  label: "Distance",
                  value: formatKm(stats?.distance_meters ?? 0),
                },
                {
                  icon: Clock,
                  label: "Travel time",
                  value: formatDuration(stats?.travel_seconds ?? 0),
                },
                {
                  icon: Clock,
                  label: "Active time",
                  value: formatDuration(stats?.active_seconds ?? 0),
                },
                {
                  icon: MapPin,
                  label: "Stops",
                  value: String(stats?.stop_count ?? 0),
                },
                {
                  icon: Users,
                  label: "Customer visits",
                  value: String(stats?.visit_count ?? 0),
                },
                {
                  icon: MapPin,
                  label: "Unknown stops",
                  value: String(stats?.unknown_stop_count ?? 0),
                },
                {
                  icon: Clock,
                  label: "Tasks",
                  value: String(stats?.task_count ?? 0),
                },
                {
                  icon: Users,
                  label: "Meetings",
                  value: String(stats?.meeting_count ?? 0),
                },
              ].map((row) => (
                <div
                  key={row.label}
                  className="flex items-center justify-between gap-2 rounded-xl bg-[#F8F9FA] px-3 py-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <row.icon size={13} className="text-gray-400 shrink-0" />
                    <span className="text-[11px] font-medium text-gray-500">
                      {row.label}
                    </span>
                  </div>
                  <span className="text-[12px] font-bold text-[#0B1215]">{row.value}</span>
                </div>
              ))}

              <div className="rounded-xl border border-gray-100 px-3 py-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">Travel efficiency</span>
                  <span className="text-[12px] font-bold text-[#0B1215]">
                    {stats?.travel_efficiency != null
                      ? `${Math.round(stats.travel_efficiency * 100)}%`
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">Productivity</span>
                  <span className="text-[12px] font-bold text-[#0B1215]">
                    {stats?.productivity_score ?? 0}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">Avg speed</span>
                  <span className="text-[12px] font-bold text-[#0B1215]">
                    {stats?.average_speed_kmh != null
                      ? `${stats.average_speed_kmh} km/h`
                      : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500">Max speed</span>
                  <span className="text-[12px] font-bold text-[#0B1215]">
                    {stats?.maximum_speed_kmh != null
                      ? `${stats.maximum_speed_kmh} km/h`
                      : "—"}
                  </span>
                </div>
              </div>

              {/* The day narrative is for clock-in days; trips have their own summary. */}
              {!isTrip && stats?.narrative && (
                <p className="text-[11px] text-gray-500 leading-relaxed">
                  {stats.narrative}
                </p>
              )}

              {isTrip && journey?.tracking_health ? (
                <TrackingHealthCard health={journey.tracking_health} />
              ) : null}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
