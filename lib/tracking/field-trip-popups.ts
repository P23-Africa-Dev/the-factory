import { format } from "date-fns";
import {
  FIELD_TRIP_STATE_LABEL,
  formatDistanceMeters,
  formatElapsed,
  parseTimeMs,
  type FieldTripLiveState,
} from "@/lib/tracking/field-trip-live";

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatClock(iso: string | null | undefined): string {
  const ms = parseTimeMs(iso);
  return ms == null ? "--" : format(new Date(ms), "h:mm a");
}

const WRAP =
  "min-width:200px;max-width:260px;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;color:#0F172A;";

const STATE_COLOR: Record<FieldTripLiveState, string> = {
  moving: "#C2412B",
  stationary: "#0F766E",
  signal_lost: "#B45309",
  ended: "#475569",
};

export function buildFieldTripAgentPopupHtml(params: {
  name: string;
  state: FieldTripLiveState;
  startedAt?: string | null;
  endedAt?: string | null;
  lastRecordedAt?: string | null;
  distanceMeters?: number | null;
  stopCount: number;
  nowMs: number;
  journeyHref?: string | null;
}): string {
  const started = parseTimeMs(params.startedAt);
  const end = parseTimeMs(params.endedAt) ?? params.nowMs;
  const duration = started != null ? formatElapsed(end - started) : "--";
  const link = params.journeyHref
    ? `<a href="${escapeHtml(params.journeyHref)}" style="display:inline-block;margin-top:8px;font-size:12px;font-weight:700;color:#2F5E71;text-decoration:underline;">View journey</a>`
    : "";

  return `<div style="${WRAP}">
    <div style="font-size:14px;font-weight:800;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(params.name || "Team member")}</div>
    <div style="margin-top:4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.02em;color:${STATE_COLOR[params.state]};">${FIELD_TRIP_STATE_LABEL[params.state]}</div>
    <div style="margin-top:6px;font-size:12px;line-height:1.5;color:#334155;">
      Started ${escapeHtml(formatClock(params.startedAt))} · ${escapeHtml(duration)}<br/>
      ${escapeHtml(formatDistanceMeters(params.distanceMeters))} · ${params.stopCount} ${params.stopCount === 1 ? "stop" : "stops"}<br/>
      Last update ${escapeHtml(formatClock(params.lastRecordedAt))}
    </div>
    ${link}
  </div>`;
}

const STOP_ACTIVITY: Record<string, string> = {
  customer_visit: "Customer visit",
  lead_visit: "Lead / prospect visit",
  org_visit: "Company site",
  personal: "Personal / break",
  ignore: "Not a stop",
};
const STOP_OUTCOME: Record<string, string> = {
  successful: "Successful",
  follow_up: "Follow-up needed",
  nobody_available: "Nobody available",
  not_interested: "Not interested",
  other: "Other",
};

export function buildFieldTripStopPopupHtml(params: {
  kind: "start" | "stop";
  label?: string | null;
  classification?: string | null;
  arrivedAt?: string | null;
  durationSeconds?: number | null;
  agentName?: string | null;
  recordStatus?: "pending" | "recorded" | null;
  outcome?: string | null;
}): string {
  if (params.kind === "start") {
    return `<div style="${WRAP}">
      <div style="font-size:13px;font-weight:800;">Trip start</div>
      ${params.agentName ? `<div style="margin-top:2px;font-size:12px;color:#475569;">${escapeHtml(params.agentName)}</div>` : ""}
      ${params.arrivedAt ? `<div style="margin-top:4px;font-size:12px;color:#334155;">${escapeHtml(formatClock(params.arrivedAt))}</div>` : ""}
    </div>`;
  }
  const classification =
    params.recordStatus === "pending" || (params.classification ?? "pending") === "pending"
      ? "Not recorded yet"
      : `${STOP_ACTIVITY[params.classification ?? ""] ?? (params.classification ?? "").replace(/_/g, " ")}${
          params.outcome ? ` · ${STOP_OUTCOME[params.outcome] ?? params.outcome.replace(/_/g, " ")}` : ""
        }`;
  const duration =
    params.durationSeconds != null ? formatElapsed(params.durationSeconds * 1000) : "--";
  return `<div style="${WRAP}">
    <div style="font-size:13px;font-weight:800;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(params.label || "Stop")}</div>
    ${params.agentName ? `<div style="margin-top:2px;font-size:12px;color:#475569;">${escapeHtml(params.agentName)}</div>` : ""}
    <div style="margin-top:4px;font-size:12px;line-height:1.5;color:#334155;">
      Arrived ${escapeHtml(formatClock(params.arrivedAt))} · ${escapeHtml(duration)}<br/>
      <span>${escapeHtml(classification)}</span>
    </div>
  </div>`;
}
