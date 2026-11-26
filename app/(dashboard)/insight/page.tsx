"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { hasActiveApiSession } from "@/lib/auth/support-session";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useAuthStore } from "@/store/auth";
import {
  getFieldActivityAnalytics,
  getFieldActivitySettings,
  updateFieldActivitySettings,
  type FieldActivitySettings,
} from "@/lib/api/field-activity";

function formatKm(m: number): string {
  return `${(m / 1000).toFixed(1)} km`;
}

function formatHours(s: number): string {
  return `${(s / 3600).toFixed(1)} h`;
}

function errorText(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Please try again.";
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

const TRIP_FIELDS: { key: TripSettingKey; title: string; hint: string; options: { value: number; label: string }[] }[] = [
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
];

/** Ensures the saved value shows even if it is not one of the presets. */
function withCurrent(options: { value: number; label: string }[], current: number | undefined) {
  if (current == null || options.some((o) => o.value === current)) return options;
  const label = current % 3600 === 0 ? `${current / 3600} hours` : `${Math.round(current / 60)} minutes`;
  return [...options, { value: current, label }].sort((a, b) => a.value - b.value);
}

const DAY = "yyyy-MM-dd";

export default function InsightPage() {
  const queryClient = useQueryClient();
  const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId } = getActiveCompanyContext(user);
  // The settings API takes a numeric id; the context may hold it as a string.
  const numericCompanyId = apiCompanyId != null ? Number(apiCompanyId) : NaN;
  const companyId = Number.isFinite(numericCompanyId) ? numericCompanyId : undefined;
  // Local calendar days (toISOString() would use UTC and can be off by a day).
  const [from, setFrom] = useState(() => format(subDays(new Date(), 7), DAY));
  const [to, setTo] = useState(() => format(new Date(), DAY));
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!notice) return;
    const id = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(id);
  }, [notice]);

  const settingsKey = ["field-activity-settings", companyId] as const;
  const settingsQuery = useQuery({
    queryKey: settingsKey,
    queryFn: async () => {
      const res = await getFieldActivitySettings(token, companyId);
      return res.data;
    },
    enabled: hasActiveApiSession(token) && companyId != null,
  });
  const enabled = Boolean(settingsQuery.data?.enabled);
  const rangeValid = from <= to;

  const analyticsQuery = useQuery({
    queryKey: ["field-activity-analytics", companyId, from, to],
    queryFn: async () => {
      const res = await getFieldActivityAnalytics({ from, to, company_id: companyId }, token);
      return res.data;
    },
    enabled: hasActiveApiSession(token) && companyId != null && enabled && rangeValid,
  });

  const applySettings = (data: FieldActivitySettings) => {
    queryClient.setQueryData(settingsKey, data);
    void queryClient.invalidateQueries({ queryKey: ["field-activity-settings", companyId] });
  };

  const toggleMutation = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await updateFieldActivitySettings({ enabled: next, company_id: companyId }, token);
      return res.data;
    },
    onSuccess: (data, next) => {
      applySettings(data);
      void queryClient.invalidateQueries({ queryKey: ["field-activity-analytics", companyId] });
      setConfirmDisable(false);
      setNotice(next ? "Field trips are on for your organization." : "Field trips are off. No new trips can be started.");
    },
  });

  const tripSettingMutation = useMutation({
    mutationFn: async (patch: Partial<Record<TripSettingKey, number>>) => {
      const res = await updateFieldActivitySettings({ ...patch, company_id: companyId }, token);
      return res.data;
    },
    onSuccess: (data) => {
      applySettings(data);
      setNotice("Saved.");
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

  const card = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";

  return (
    <div className="p-6 md:p-10 space-y-6 bg-[#F4F7F9] min-h-full text-slate-900">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-[#0B1215]">Field Activity Intelligence</h1>
        <p className="text-slate-600 max-w-2xl text-sm">
          Track field trips, travel efficiency, visit coverage and team performance — and turn field
          trips on or off for your organization.
        </p>
      </header>

      {notice && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-800"
        >
          <CheckCircle2 size={16} /> {notice}
        </p>
      )}

      {settingsQuery.isLoading ? (
        <section className={`${card} flex items-center gap-2 text-sm text-slate-500`}>
          <Loader2 size={16} className="animate-spin" /> Loading settings…
        </section>
      ) : settingsQuery.isError ? (
        <section className={`${card} flex flex-wrap items-center justify-between gap-3`} role="alert">
          <p className="flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle size={16} /> Couldn&apos;t load field activity settings. {errorText(settingsQuery.error)}
          </p>
          <button
            type="button"
            onClick={() => void settingsQuery.refetch()}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#0B1E26] px-4 py-2 text-sm font-semibold text-white"
          >
            <RefreshCw size={14} /> Try again
          </button>
        </section>
      ) : (
        <section className={`${card} space-y-4`}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">
                Field trips are {enabled ? "on" : "off"}
              </p>
              <p className="text-xs text-slate-600 mt-1 max-w-xl">
                {enabled
                  ? "Team members track routes and stops with Start Field Trip in the mobile app."
                  : "Turn on so team members can start field trips from the mobile app."}
              </p>
            </div>
            {!confirmDisable && (
              <button
                type="button"
                disabled={toggleMutation.isPending}
                onClick={() => {
                  if (enabled) setConfirmDisable(true);
                  else toggleMutation.mutate(true);
                }}
                className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                  enabled
                    ? "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
                    : "bg-[#0B1E26] text-white hover:bg-[#13303c]"
                }`}
              >
                {toggleMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                {enabled ? "Turn off" : "Turn on"}
              </button>
            )}
          </div>

          {confirmDisable && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3" role="alertdialog" aria-labelledby="disable-title">
              <p id="disable-title" className="text-sm font-semibold text-amber-900">
                Turn off field trips for everyone?
              </p>
              <p className="text-xs text-amber-800">
                Nobody will be able to start a new field trip and the live map will stop showing new
                trips. Existing journey history is kept.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={toggleMutation.isPending}
                  onClick={() => toggleMutation.mutate(false)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {toggleMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                  Yes, turn off
                </button>
                <button
                  type="button"
                  disabled={toggleMutation.isPending}
                  onClick={() => setConfirmDisable(false)}
                  className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {toggleMutation.isError && (
            <p className="text-xs text-red-700" role="alert">
              Couldn&apos;t change this setting. {errorText(toggleMutation.error)}
            </p>
          )}
        </section>
      )}

      {enabled && (
        <section className={`${card} space-y-4`}>
          <div>
            <p className="text-sm font-semibold text-slate-900">Field trip rules</p>
            <p className="text-xs text-slate-600 mt-1">Apply to every field trip in your organization.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {TRIP_FIELDS.map((field) => {
              const current = settingsQuery.data?.[field.key];
              return (
                <label key={field.key} className="text-sm">
                  <span className="block font-medium text-slate-900">{field.title}</span>
                  <span className="block text-slate-500 text-xs mb-1.5">{field.hint}</span>
                  <select
                    value={current ?? ""}
                    disabled={tripSettingMutation.isPending}
                    onChange={(e) => tripSettingMutation.mutate({ [field.key]: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 disabled:opacity-60"
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
          {tripSettingMutation.isPending && (
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <Loader2 size={12} className="animate-spin" /> Saving…
            </p>
          )}
          {tripSettingMutation.isError && (
            <p className="text-xs text-red-700" role="alert">
              Could not save that setting. {errorText(tripSettingMutation.error)}
            </p>
          )}
        </section>
      )}

      {enabled && (
        <>
          <section className="flex flex-wrap gap-3 items-end">
            <label className="text-sm">
              <span className="block text-slate-600 text-xs mb-1">From</span>
              <input
                type="date"
                value={from}
                max={to}
                onChange={(e) => e.target.value && setFrom(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              />
            </label>
            <label className="text-sm">
              <span className="block text-slate-600 text-xs mb-1">To</span>
              <input
                type="date"
                value={to}
                min={from}
                onChange={(e) => e.target.value && setTo(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              />
            </label>
            {!rangeValid && (
              <p className="text-xs text-red-700 pb-2">&ldquo;From&rdquo; must be on or before &ldquo;To&rdquo;.</p>
            )}
          </section>

          {analyticsQuery.isLoading ? (
            <section className={`${card} flex items-center gap-2 text-sm text-slate-500`}>
              <Loader2 size={16} className="animate-spin" /> Loading activity…
            </section>
          ) : analyticsQuery.isError ? (
            <section className={`${card} flex flex-wrap items-center justify-between gap-3`} role="alert">
              <p className="flex items-center gap-2 text-sm text-red-700">
                <AlertTriangle size={16} /> Couldn&apos;t load activity for this range. {errorText(analyticsQuery.error)}
              </p>
              <button
                type="button"
                onClick={() => void analyticsQuery.refetch()}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#0B1E26] px-4 py-2 text-sm font-semibold text-white"
              >
                <RefreshCw size={14} /> Try again
              </button>
            </section>
          ) : (
            <>
              <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {cards.map((c) => (
                  <div key={c.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-xs text-slate-500">{c.label}</p>
                    <p className="mt-2 text-xl font-bold text-slate-900">{c.value}</p>
                  </div>
                ))}
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200">
                  <h2 className="font-semibold text-slate-900">Team</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-slate-500 bg-slate-50">
                      <tr>
                        <th scope="col" className="px-5 py-3 font-medium">Person</th>
                        <th scope="col" className="px-5 py-3 font-medium">Distance</th>
                        <th scope="col" className="px-5 py-3 font-medium">Travel</th>
                        <th scope="col" className="px-5 py-3 font-medium">Visits</th>
                        <th scope="col" className="px-5 py-3 font-medium">Stops</th>
                        <th scope="col" className="px-5 py-3 font-medium">Unknown</th>
                        <th scope="col" className="px-5 py-3 font-medium">Days</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-800">
                      {agents.map((agent) => (
                        <tr key={agent.user_id} className="border-t border-slate-100">
                          <td className="px-5 py-3 font-medium">{agent.name ?? `#${agent.user_id}`}</td>
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
                          <td colSpan={7} className="px-5 py-8 text-slate-500">
                            No field activity in this range yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className={card}>
                <h2 className="font-semibold mb-2 text-slate-900">Territory heatmap points</h2>
                <p className="text-sm text-slate-600">
                  {analyticsQuery.data?.heatmap_points?.length ?? 0} stop centroids recorded for map heat
                  overlays.
                </p>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
