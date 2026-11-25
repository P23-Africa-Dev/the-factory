"use client";

import React, { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";
import {
  getFieldActivityAnalytics,
  getFieldActivitySettings,
  updateFieldActivitySettings,
} from "@/lib/api/field-activity";

function formatKm(m: number): string {
  return `${(m / 1000).toFixed(1)} km`;
}

function formatHours(s: number): string {
  return `${(s / 3600).toFixed(1)} h`;
}

const STOP_DWELL_OPTIONS = [3, 5, 10, 15, 20, 30].map((m) => ({ value: m * 60, label: `${m} minutes` }));
const REMINDER_OPTIONS = [2, 3, 4, 5, 6, 8, 10, 12].map((h) => ({ value: h * 3600, label: `${h} hours` }));
const AUTO_END_OPTIONS = [
  { value: 1800, label: "30 minutes" },
  { value: 3600, label: "1 hour" },
  { value: 7200, label: "2 hours" },
  { value: 10800, label: "3 hours" },
  { value: 14400, label: "4 hours" },
  { value: 21600, label: "6 hours" },
];

type TripSettingKey = "stop_dwell_seconds" | "trip_reminder_seconds" | "trip_auto_end_seconds";

/** Ensures the saved value shows even if it is not one of the presets. */
function withCurrent(options: { value: number; label: string }[], current: number | undefined) {
  if (current == null || options.some((o) => o.value === current)) return options;
  const label = current % 3600 === 0 ? `${current / 3600} hours` : `${Math.round(current / 60)} minutes`;
  return [...options, { value: current, label }].sort((a, b) => a.value - b.value);
}

export default function InsightPage() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

  const settingsQuery = useQuery({
    queryKey: ["field-activity-settings"],
    queryFn: async () => {
      const res = await getFieldActivitySettings(token);
      return res.data;
    },
    enabled: hasActiveApiSession(token),
  });

  const analyticsQuery = useQuery({
    queryKey: ["field-activity-analytics", from, to],
    queryFn: async () => {
      const res = await getFieldActivityAnalytics({ from, to }, token);
      return res.data;
    },
    enabled: hasActiveApiSession(token) && Boolean(settingsQuery.data?.enabled),
  });

  const toggleMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await updateFieldActivitySettings({ enabled }, token);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["field-activity-settings"] });
      queryClient.invalidateQueries({ queryKey: ["field-activity-analytics"] });
    },
  });

  const tripSettingMutation = useMutation({
    mutationFn: async (patch: Partial<Record<TripSettingKey, number>>) => {
      const res = await updateFieldActivitySettings(patch, token);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["field-activity-settings"] });
    },
  });

  const totals = analyticsQuery.data?.totals;
  const agents = analyticsQuery.data?.agents ?? [];

  const cards = useMemo(() => {
    if (!totals) return [];
    return [
      { label: "Distance", value: formatKm(totals.distance_meters) },
      { label: "Travel time", value: formatHours(totals.travel_seconds) },
      { label: "Visits", value: String(totals.visit_count) },
      { label: "Stops", value: String(totals.stop_count) },
      { label: "Unknown stops", value: String(totals.unknown_stop_count) },
      {
        label: "Travel efficiency",
        value:
          totals.travel_efficiency != null
            ? `${Math.round(totals.travel_efficiency * 100)}%`
            : "—",
      },
    ];
  }, [totals]);

  return (
    <div className="p-8 md:p-12 space-y-8">
      <header className="space-y-2">
        <h1 className="text-4xl font-bold tracking-tight">Field Activity Intelligence</h1>
        <p className="text-white/60 max-w-2xl">
          Track active field time, travel efficiency, visit coverage, and agent performance —
          and turn day tracking on or off for your organization.
        </p>
      </header>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Field Activity Intelligence</p>
          <p className="text-xs text-white/50 mt-1">
            {settingsQuery.data?.enabled
              ? "Enabled for this organization. Team members track routes and stops with Start Field Trip in the mobile app."
              : "Disabled — enable so team members can start field trips from the mobile app."}
          </p>
        </div>
        <button
          type="button"
          disabled={toggleMutation.isPending || settingsQuery.isLoading}
          onClick={() => toggleMutation.mutate(!(settingsQuery.data?.enabled ?? false))}
          className="rounded-full px-4 py-2 text-sm font-semibold bg-[#75ADAF] text-[#0B1E26] disabled:opacity-50"
        >
          {settingsQuery.data?.enabled ? "Disable" : "Enable"}
        </button>
      </section>

      {settingsQuery.data?.enabled && (
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold">Field trip rules</p>
            <p className="text-xs text-white/50 mt-1">Apply to every field trip in your organization.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {(
              [
                {
                  key: "stop_dwell_seconds",
                  title: "Stop detection",
                  hint: "Count a stop after this long in one place",
                  options: STOP_DWELL_OPTIONS,
                },
                {
                  key: "trip_reminder_seconds",
                  title: "Long-trip reminder",
                  hint: "Remind the person after this long (repeats)",
                  options: REMINDER_OPTIONS,
                },
                {
                  key: "trip_auto_end_seconds",
                  title: "Auto-end",
                  hint: "End a trip after this long with no location",
                  options: AUTO_END_OPTIONS,
                },
              ] as { key: TripSettingKey; title: string; hint: string; options: { value: number; label: string }[] }[]
            ).map((field) => {
              const current = settingsQuery.data?.[field.key];
              return (
                <label key={field.key} className="text-sm">
                  <span className="block font-medium">{field.title}</span>
                  <span className="block text-white/50 text-xs mb-1.5">{field.hint}</span>
                  <select
                    value={current ?? ""}
                    disabled={tripSettingMutation.isPending}
                    onChange={(e) => tripSettingMutation.mutate({ [field.key]: Number(e.target.value) })}
                    className="w-full rounded-lg bg-black/30 border border-white/10 px-3 py-2"
                  >
                    {withCurrent(field.options, current).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
          {tripSettingMutation.isError && (
            <p className="text-xs text-red-300">Could not save that setting. Please try again.</p>
          )}
        </section>
      )}

      {settingsQuery.data?.enabled && (
        <>
          <section className="flex flex-wrap gap-3 items-end">
            <label className="text-sm">
              <span className="block text-white/50 text-xs mb-1">From</span>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="rounded-lg bg-black/30 border border-white/10 px-3 py-2"
              />
            </label>
            <label className="text-sm">
              <span className="block text-white/50 text-xs mb-1">To</span>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="rounded-lg bg-black/30 border border-white/10 px-3 py-2"
              />
            </label>
          </section>

          <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {cards.map((card) => (
              <div key={card.label} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs text-white/50">{card.label}</p>
                <p className="mt-2 text-xl font-bold">{card.value}</p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10">
              <h2 className="font-semibold">Agents</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-white/50">
                  <tr>
                    <th className="px-5 py-3 font-medium">Agent</th>
                    <th className="px-5 py-3 font-medium">Distance</th>
                    <th className="px-5 py-3 font-medium">Travel</th>
                    <th className="px-5 py-3 font-medium">Visits</th>
                    <th className="px-5 py-3 font-medium">Stops</th>
                    <th className="px-5 py-3 font-medium">Unknown</th>
                    <th className="px-5 py-3 font-medium">Days</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((agent) => (
                    <tr key={agent.user_id} className="border-t border-white/5">
                      <td className="px-5 py-3">{agent.name ?? `#${agent.user_id}`}</td>
                      <td className="px-5 py-3">{formatKm(agent.distance_meters)}</td>
                      <td className="px-5 py-3">{formatHours(agent.travel_seconds)}</td>
                      <td className="px-5 py-3">{agent.visit_count}</td>
                      <td className="px-5 py-3">{agent.stop_count}</td>
                      <td className="px-5 py-3">{agent.unknown_stop_count}</td>
                      <td className="px-5 py-3">{agent.days}</td>
                    </tr>
                  ))}
                  {agents.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-white/40">
                        No field activity in this range yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="font-semibold mb-2">Territory heatmap points</h2>
            <p className="text-sm text-white/60">
              {analyticsQuery.data?.heatmap_points?.length ?? 0} stop centroids recorded for map heat
              overlays.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
