"use client";

import Link from "next/link";
import { ChevronDown, Eye, EyeOff, MapPin, Radio, Route, Users } from "lucide-react";
import { useMemo } from "react";
import { format } from "date-fns";

import { AgentAvatar } from "@/components/map/agent-avatar";
import {
  FIELD_TRIP_STATE_LABEL,
  formatDistanceMeters,
  formatElapsed,
  parseTimeMs,
  resolveFieldTripLiveState,
} from "@/lib/tracking/field-trip-live";
import {
  liveAgentDistanceMeters,
  useFieldActivityLiveStore,
} from "@/store/field-activity-live";
import {
  OPERATIONAL_STATUS_META,
  resolveOperationalStatusFromTask,
} from "@/lib/tracking/operational-status";
import {
  countLiveTasksByAgent,
  formatRelativeLastSeen,
  splitLiveFeedTasks,
  taskMatchesSearch,
  TRACKING_STALE_MS,
} from "@/lib/tracking/live-feed-groups";
import type { LiveTaskState } from "@/types/tracking";
import type { FieldActivityLiveAgent } from "@/store/field-activity-live";

function formatMetricDistance(meters: number | null | undefined): string {
  if (meters == null || Number.isNaN(meters)) return "--";
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatSpeed(speedMps: number | null | undefined): string {
  if (speedMps == null || Number.isNaN(speedMps)) return "--";
  return `${(speedMps * 3.6).toFixed(1)} km/h`;
}

function formatEta(etaSeconds: number | null | undefined): string {
  if (etaSeconds == null || etaSeconds < 0) return "--";
  if (etaSeconds < 60) return "<1 min";
  const minutes = Math.round(etaSeconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

interface LiveFeedsPanelProps {
  tasks: LiveTaskState[];
  nowMs: number;
  selectedTaskId: number | null;
  isInitialHydrating: boolean;
  followAllActive: boolean;
  showHistory: boolean;
  searchQuery?: string;
  onToggleHistory: () => void;
  onToggleFollowAll: () => void;
  onSelectTask: (taskId: number) => void;
  /** Opens route history for a completed / stale feed task. */
  onViewHistoryTask?: (task: LiveTaskState) => void;
  /** Selected/followed person on a field trip (Start Field Trip in the app). */
  selectedFieldUserId?: number | null;
  /** The user panned away: still selected, camera no longer follows. */
  fieldFollowPaused?: boolean;
  onSelectFieldAgent?: (userId: number) => void;
  /** Focus mode hides this panel so only the followed person is in view. */
  focusMode?: boolean;
  onToggleFocusMode?: () => void;
  /** Base path for a trip's journey page, e.g. "/operations/journeys". */
  journeyHrefBase?: string | null;
}

const FIELD_STATE_BADGE = {
  moving: "bg-[#FFF1EE] text-[#C2412B] border border-[#FFD9D1]",
  stationary: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  signal_lost: "bg-amber-50 text-amber-700 border border-amber-200",
  ended: "bg-slate-100 text-slate-600 border border-slate-200",
} as const;

function formatStartClock(iso: string | null | undefined): string {
  const ms = parseTimeMs(iso);
  return ms == null ? "--" : format(new Date(ms), "h:mm a");
}

/** One line of field-trip stats: started, duration, distance, stops. */
function fieldTripSummary(agent: FieldActivityLiveAgent, nowMs: number): string {
  const started = parseTimeMs(agent.startedAt);
  const end = parseTimeMs(agent.endedAt) ?? nowMs;
  const duration = started != null ? formatElapsed(end - started) : "--";
  const stops = agent.stops.length;
  return `Started ${formatStartClock(agent.startedAt)} · ${duration} · ${formatDistanceMeters(
    liveAgentDistanceMeters(agent),
  )} · ${stops} ${stops === 1 ? "stop" : "stops"}`;
}

/** A person on a field trip (not tied to a task). */
function FieldTripFeedCard({
  agent,
  isSelected,
  isFollowing,
  nowMs,
  onSelect,
  journeyHref,
}: {
  agent: FieldActivityLiveAgent;
  isSelected: boolean;
  isFollowing: boolean;
  nowMs: number;
  onSelect: () => void;
  journeyHref: string | null;
}) {
  const lastSeen = formatRelativeLastSeen(agent.lastRecordedAt ?? undefined, nowMs);
  const state = resolveFieldTripLiveState(agent, nowMs);
  const live = state === "moving" || state === "stationary";

  return (
    <div
      className={`w-full flex items-center gap-3 px-4 py-3.5 transition-all rounded-[20px] ${
        isSelected ? "bg-[#0A192F]" : "bg-[#F8FAFC] hover:bg-gray-100"
      } ${state === "ended" ? "opacity-70" : ""}`}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={isSelected}
        aria-label={`${isFollowing ? "Following" : "Follow"} ${agent.name || "team member"} on the map`}
        className="flex flex-1 min-w-0 items-center gap-4 text-left"
      >
        <div className="relative shrink-0">
          <AgentAvatar name={agent.name} avatarUrl={agent.avatarUrl ?? undefined} sizeClassName="w-12 h-12" />
          {live && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#FD6046] animate-pulse" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className={`text-[14px] font-bold truncate ${isSelected ? "text-white" : "text-dash-dark"}`}>
              {agent.name || "Team member"}
            </p>
            <span
              className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isSelected ? "bg-white/15 text-white border border-white/20" : FIELD_STATE_BADGE[state]
              }`}
            >
              {FIELD_TRIP_STATE_LABEL[state]}
            </span>
          </div>
          <p className={`text-[12px] truncate mt-0.5 flex items-center gap-1 ${isSelected ? "text-gray-300" : "text-gray-500"}`}>
            <MapPin size={11} className="shrink-0" />
            {isSelected ? (isFollowing ? "Following on map" : "Selected — tap to follow") : "On field trip"}
          </p>
          <p className={`text-[10px] mt-1 ${isSelected ? "text-slate-300" : "text-slate-500"}`}>
            {fieldTripSummary(agent, nowMs)}
          </p>
          <p className={`text-[10px] ${isSelected ? "text-slate-400" : "text-slate-400"}`}>
            Last seen {lastSeen}
          </p>
        </div>
      </button>
      {journeyHref ? (
        <Link
          href={journeyHref}
          title="View journey"
          aria-label={`View ${agent.name || "team member"}'s journey`}
          className={`shrink-0 rounded-full p-2 transition-colors ${
            isSelected ? "text-white/70 hover:bg-white/10" : "text-slate-400 hover:bg-slate-200 hover:text-slate-600"
          }`}
        >
          <Route size={18} />
        </Link>
      ) : null}
    </div>
  );
}

function LoadingFeedCard() {
  return (
    <div className="w-full rounded-[20px] bg-[#F8FAFC] px-4 py-3.5 animate-pulse">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-slate-200 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <div className="h-4 w-28 rounded-full bg-slate-200" />
            <div className="h-5 w-16 rounded-full bg-slate-200" />
          </div>
          <div className="mt-2 h-3 w-40 rounded-full bg-slate-200" />
          <div className="mt-2 h-3 w-32 rounded-full bg-slate-200" />
        </div>
        <div className="w-5 h-5 rounded-full bg-slate-200 shrink-0" />
      </div>
    </div>
  );
}

function FeedCard({
  task,
  isSelected,
  nowMs,
  liveTaskCount = 1,
  fieldTrip = null,
  onSelect,
}: {
  task: LiveTaskState;
  isSelected: boolean;
  nowMs: number;
  liveTaskCount?: number;
  /** Same person is also on a field trip: shown on this card, not a second one. */
  fieldTrip?: FieldActivityLiveAgent | null;
  onSelect: () => void;
}) {
  const operationalStatus = resolveOperationalStatusFromTask(task, nowMs, TRACKING_STALE_MS);
  const statusMeta = OPERATIONAL_STATUS_META[operationalStatus];
  const lastSeen = formatRelativeLastSeen(task.lastEventAt, nowMs);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full flex items-center gap-4 px-4 py-3.5 text-left transition-all rounded-[20px] ${
        isSelected ? "bg-[#0A192F]" : "bg-[#F8FAFC] hover:bg-gray-100"
      }`}
    >
      <div className="relative shrink-0">
        <AgentAvatar
          key={`${task.taskId}-${task.agentAvatarUrl ?? ""}`}
          name={task.agentName}
          avatarUrl={task.agentAvatarUrl}
          sizeClassName="w-12 h-12"
        />
        {liveTaskCount > 1 && (
          <span
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white"
            title={`${liveTaskCount} live tasks`}
          >
            {liveTaskCount > 9 ? "9+" : liveTaskCount}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p
            className={`text-[14px] font-bold truncate ${
              isSelected ? "text-white" : "text-dash-dark"
            }`}
          >
            {task.agentName || "Agent"}
          </p>
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isSelected
                ? "bg-white/15 text-white border border-white/20"
                : statusMeta.badgeClassName
            }`}
          >
            {statusMeta.label}
          </span>
        </div>
        <p
          className={`text-[12px] truncate mt-0.5 ${
            isSelected ? "text-gray-300" : "text-gray-500"
          }`}
        >
          {task.taskAddress ?? task.taskTitle ?? `Task #${task.taskId}`}
        </p>
        {(task.projectName ?? "").length > 0 && (
          <p
            className={`text-[10px] mt-1 truncate ${
              isSelected ? "text-slate-300" : "text-slate-500"
            }`}
          >
            Project {task.projectName}
          </p>
        )}
        <p
          className={`text-[10px] mt-1 ${
            isSelected ? "text-slate-300" : "text-slate-500"
          }`}
        >
          Last seen {lastSeen} · ETA {formatEta(task.etaSeconds)} · Speed{" "}
          {formatSpeed(task.speedMps)} · Left {formatMetricDistance(task.distanceRemainingMeters)}
        </p>
        {fieldTrip && (
          <p
            className={`text-[10px] mt-1 flex items-center gap-1 ${
              isSelected ? "text-slate-300" : "text-slate-500"
            }`}
          >
            <span
              className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${
                isSelected ? "bg-white/15 text-white" : "bg-[#FFF1EE] text-[#C2412B]"
              }`}
            >
              Field trip
            </span>
            <span className="truncate">{fieldTripSummary(fieldTrip, nowMs)}</span>
          </p>
        )}
      </div>
    </button>
  );
}

export function LiveFeedsPanel({
  tasks,
  nowMs,
  selectedTaskId,
  isInitialHydrating,
  followAllActive,
  showHistory,
  searchQuery = "",
  onToggleHistory,
  onToggleFollowAll,
  onSelectTask,
  onViewHistoryTask,
  selectedFieldUserId = null,
  fieldFollowPaused = false,
  onSelectFieldAgent,
  focusMode = false,
  onToggleFocusMode,
  journeyHrefBase = "/operations/journeys",
}: LiveFeedsPanelProps) {
  const needle = searchQuery.trim();
  // Subscribed here (not in the map page) so new points only re-render the list.
  const fieldAgentsMap = useFieldActivityLiveStore((s) => s.agents);
  const { active, history } = splitLiveFeedTasks(tasks, nowMs, TRACKING_STALE_MS);
  const agentTaskCounts = useMemo(() => countLiveTasksByAgent(tasks), [tasks]);
  // People on a task already have a card: their field trip shows on it.
  const fieldByUser = useMemo(() => {
    const map = new Map<number, FieldActivityLiveAgent>();
    for (const agent of Object.values(fieldAgentsMap)) map.set(agent.userId, agent);
    return map;
  }, [fieldAgentsMap]);
  const taskUserIds = useMemo(
    () => new Set(active.filter((t) => t.userId > 0).map((t) => t.userId)),
    [active],
  );
  const fieldMatches = useMemo(() => {
    const q = needle.toLowerCase();
    const list = Object.values(fieldAgentsMap)
      .filter((a) => !taskUserIds.has(a.userId))
      .sort(
        (a, b) =>
          (parseTimeMs(b.lastRecordedAt ?? b.startedAt) ?? 0) -
          (parseTimeMs(a.lastRecordedAt ?? a.startedAt) ?? 0),
      );
    return q ? list.filter((a) => (a.name ?? "").toLowerCase().includes(q)) : list;
  }, [fieldAgentsMap, needle, taskUserIds]);
  // "Active" counts people, not cards: one person on two tasks + a trip is one.
  const activePeopleCount = useMemo(() => {
    const people = new Set<string>();
    for (const task of active) people.add(task.userId > 0 ? `u${task.userId}` : `t${task.taskId}`);
    for (const agent of Object.values(fieldAgentsMap)) {
      if (!agent.endedAt) people.add(`u${agent.userId}`);
    }
    return people.size;
  }, [active, fieldAgentsMap]);
  const renderFieldAgents = () =>
    fieldMatches.map((agent) => (
      <FieldTripFeedCard
        key={`field-${agent.userId}`}
        agent={agent}
        isSelected={selectedFieldUserId === agent.userId}
        isFollowing={selectedFieldUserId === agent.userId && !fieldFollowPaused}
        nowMs={nowMs}
        onSelect={() => onSelectFieldAgent?.(agent.userId)}
        journeyHref={journeyHrefBase && agent.sessionId > 0 ? `${journeyHrefBase}/${agent.sessionId}` : null}
      />
    ));
  const selectedFieldAgent =
    selectedFieldUserId != null ? fieldAgentsMap[selectedFieldUserId] ?? null : null;

  const selectHistoryTask = (task: LiveTaskState) => {
    onSelectTask(task.taskId);
    // Route history slide-in disabled — see docs/map-route-history-panel.md
    // onViewHistoryTask?.(task);
  };

  const searchResults = useMemo(() => {
    if (!needle) return [];
    return [...active, ...history]
      .filter((task) => taskMatchesSearch(task, needle))
      .slice(0, 12);
  }, [active, history, needle]);

  if (needle) {
    return (
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2 space-y-2">
        {isInitialHydrating ? (
          <>
            <LoadingFeedCard />
            <LoadingFeedCard />
          </>
        ) : searchResults.length === 0 && fieldMatches.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2">
            <Radio size={24} className="text-gray-200" />
            <p className="text-[12px] text-gray-400">No matching agents</p>
          </div>
        ) : (
          [...renderFieldAgents(), ...searchResults.map((task) => (
            <FeedCard
              key={task.taskId}
              task={task}
              isSelected={selectedTaskId === task.taskId}
              nowMs={nowMs}
              liveTaskCount={agentTaskCounts.get(task.userId) ?? 1}
              fieldTrip={fieldByUser.get(task.userId) ?? null}
              onSelect={() => onSelectTask(task.taskId)}
            />
          ))]
        )}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 pb-4 pt-2 flex flex-col gap-2 min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0 pb-1">
        <span className="inline-flex items-center rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 text-[11px] font-semibold">
          {isInitialHydrating ? "Active (Loading...)" : `Active (${activePeopleCount})`}
        </span>
        <div className="flex items-center gap-1.5">
          {selectedFieldAgent && onToggleFocusMode ? (
            <button
              type="button"
              onClick={onToggleFocusMode}
              aria-pressed={focusMode}
              title="Hide this panel and keep only the map in view"
              className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-200"
            >
              {focusMode ? <EyeOff size={13} /> : <Eye size={13} />}
              Focus
            </button>
          ) : null}
          <button
            type="button"
            onClick={onToggleFollowAll}
            aria-pressed={followAllActive}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              followAllActive
                ? "bg-[#0A192F] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            <Users size={13} />
            {followAllActive ? "Following all" : "Follow all"}
          </button>
        </div>
      </div>

      {isInitialHydrating ? (
        <>
          <LoadingFeedCard />
          <LoadingFeedCard />
        </>
      ) : active.length === 0 && fieldMatches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 gap-2">
          <Radio size={24} className="text-gray-200" />
          <p className="text-[12px] text-gray-400 text-center">
            No agents actively tracking
          </p>
        </div>
      ) : (
        [...renderFieldAgents(), ...active.map((task) => (
          <FeedCard
            key={task.taskId}
            task={task}
            isSelected={selectedTaskId === task.taskId}
            nowMs={nowMs}
            liveTaskCount={agentTaskCounts.get(task.userId) ?? 1}
            fieldTrip={fieldByUser.get(task.userId) ?? null}
            onSelect={() => onSelectTask(task.taskId)}
          />
        ))]
      )}

      {history.length > 0 && (
        <div className="mt-2 border-t border-slate-100 pt-2 shrink-0">
          <button
            type="button"
            onClick={onToggleHistory}
            className="w-full flex items-center justify-between gap-2 px-1 py-2 text-left text-[12px] font-semibold text-slate-600 hover:text-slate-800"
          >
            <span>Tracking history ({history.length})</span>
            <ChevronDown
              size={16}
              className={`transition-transform ${showHistory ? "rotate-180" : ""}`}
            />
          </button>
          {showHistory && (
            <div className="space-y-2 mt-1">
              {history.map((task) => (
                <FeedCard
                  key={task.taskId}
                  task={task}
                  isSelected={selectedTaskId === task.taskId}
                  nowMs={nowMs}
                  liveTaskCount={agentTaskCounts.get(task.userId) ?? 1}
                  onSelect={() => onSelectTask(task.taskId)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
