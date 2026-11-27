'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { create } from 'zustand';
import { toast } from '@/lib/toast';
import { flattenApiError } from '@/lib/api/errors';
import { pendingAttachmentsFor, queuedToAttachment, tripReportApi } from './api';
import type { ManualStopInput, ReportStop, StopRecordInput, TripReport } from './types';

export const reportKeys = {
  report: (tripId: number) => ['field-trip', 'report', tripId] as const,
  due: ['field-trip', 'reports-due'] as const,
};

/** The trip report, with attachments still waiting on the phone merged in. */
export function useTripReport(tripId: number | null | undefined, options: { live?: boolean } = {}) {
  return useQuery({
    queryKey: reportKeys.report(tripId ?? 0),
    enabled: !!tripId,
    queryFn: async (): Promise<TripReport> => {
      const report = await tripReportApi.get(tripId as number);
      const queued = await pendingAttachmentsFor(tripId as number).catch(() => []);
      if (queued.length === 0) return report;
      return {
        ...report,
        stops: report.stops.map((s) => ({
          ...s,
          attachments: [
            ...s.attachments,
            ...queued
              .filter((q) => q.stopId === s.id || (!!q.clientStopId && q.clientStopId === s.client_stop_id))
              .filter((q) => !s.attachments.some((a) => a.client_attachment_id === q.clientAttachmentId))
              .map(queuedToAttachment),
          ],
        })),
      };
    },
    // During a trip new stops appear; afterwards it only changes when the person edits.
    refetchInterval: options.live ? 45_000 : false,
    staleTime: 10_000,
  });
}

function applyLocally(stop: ReportStop, input: StopRecordInput): ReportStop {
  const corrected = input.location?.action === 'correct' ? input.location : null;
  return {
    ...stop,
    classification: input.activity,
    lead_id: input.lead_id ?? null,
    company_location_id: input.company_location_id ?? null,
    outcome: input.outcome ?? null,
    follow_up_at: input.follow_up_at ?? null,
    notes: input.notes ?? null,
    record_status: 'recorded',
    recorded_via: input.via ?? 'review',
    location_status: corrected ? 'corrected' : stop.location_status === 'corrected' ? 'corrected' : 'confirmed',
    latitude: corrected ? corrected.latitude : stop.latitude,
    longitude: corrected ? corrected.longitude : stop.longitude,
    address: corrected ? (corrected.address ?? stop.address) : stop.address,
  };
}

function withCompleteness(report: TripReport): TripReport {
  const pending = report.stops.filter((s) => s.record_status !== 'recorded').map((s) => s.id);
  return {
    ...report,
    completeness: { total: report.stops.length, recorded: report.stops.length - pending.length, pending: pending.length, pending_ids: pending },
  };
}

/** Save a stop: shown as done at once (optimistic), synced in the background or later offline. */
export function useRecordStop(tripId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ stopId, input }: { stopId: number; input: StopRecordInput; leadName?: string | null }) =>
      tripReportApi.record(stopId, input),
    onMutate: async ({ stopId, input, leadName }) => {
      await qc.cancelQueries({ queryKey: reportKeys.report(tripId) });
      const previous = qc.getQueryData<TripReport>(reportKeys.report(tripId));
      if (previous) {
        qc.setQueryData<TripReport>(reportKeys.report(tripId), withCompleteness({
          ...previous,
          stops: previous.stops.map((s) => (s.id === stopId ? { ...applyLocally(s, input), lead_name: leadName ?? s.lead_name } : s)),
        }));
      }
      return { previous };
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(reportKeys.report(tripId), ctx.previous);
      toast.error('Could not save this stop', flattenApiError(error));
    },
    onSuccess: (saved) => {
      if (!saved) {
        toast.info('Saved on this phone', 'It will sync when you are back online.');
        return;
      }
      qc.setQueryData<TripReport>(reportKeys.report(tripId), (prev) =>
        prev ? withCompleteness({ ...prev, stops: prev.stops.map((s) => (s.id === saved.id ? { ...saved, attachments: s.attachments } : s)) }) : prev,
      );
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['field-trip', 'current'] });
    },
  });
}

export function useAddStop(tripId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ManualStopInput) => tripReportApi.addStop(tripId, input),
    onSuccess: (saved, input) => {
      if (!saved) {
        toast.info('Stop saved on this phone', 'It will sync when you are back online.');
        // Show it straight away as a local stop.
        qc.setQueryData<TripReport>(reportKeys.report(tripId), (prev) =>
          prev ? withCompleteness({ ...prev, stops: [...prev.stops, localManualStop(tripId, input)] }) : prev,
        );
        return;
      }
      void qc.invalidateQueries({ queryKey: reportKeys.report(tripId) });
    },
    onError: (error) => toast.error('Could not add the stop', flattenApiError(error)),
  });
}

export function useDeleteStop(tripId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (stopId: number) => tripReportApi.deleteStop(stopId),
    onSuccess: (_r, stopId) => {
      qc.setQueryData<TripReport>(reportKeys.report(tripId), (prev) =>
        prev ? withCompleteness({ ...prev, stops: prev.stops.filter((s) => s.id !== stopId) }) : prev,
      );
      void qc.invalidateQueries({ queryKey: reportKeys.report(tripId) });
    },
    onError: (error) => toast.error('Could not remove the stop', flattenApiError(error)),
  });
}

export function useSubmitReport(tripId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => tripReportApi.submit(tripId),
    onSuccess: (report) => {
      qc.setQueryData(reportKeys.report(tripId), report);
      void qc.invalidateQueries({ queryKey: ['field-trip', 'current'] });
      void qc.invalidateQueries({ queryKey: ['field-activity'] });
    },
  });
}

function localManualStop(tripId: number, input: ManualStopInput): ReportStop {
  return {
    id: -Math.floor(Math.random() * 1e9),
    field_activity_session_id: tripId,
    arrived_at: input.arrived_at,
    departed_at: input.departed_at,
    latitude: input.latitude,
    longitude: input.longitude,
    address: input.address ?? null,
    duration_seconds: Math.max(0, (Date.parse(input.departed_at) - Date.parse(input.arrived_at)) / 1000),
    classification: input.activity ?? 'pending',
    match_type: null,
    lead_id: input.lead_id ?? null,
    company_location_id: input.company_location_id ?? null,
    meeting_id: null,
    task_id: null,
    source: 'manual',
    client_stop_id: input.client_stop_id,
    outcome: input.outcome ?? null,
    notes: input.notes ?? null,
    follow_up_at: input.follow_up_at ?? null,
    record_status: input.activity ? 'recorded' : 'pending',
    recorded_at: null,
    recorded_via: 'review',
    location_status: 'confirmed',
    original_latitude: null,
    original_longitude: null,
    original_address: null,
    lead_name: null,
    location_name: null,
    added_by_user: true,
    off_route: false,
    attachments: [],
  };
}

// ── Live prompt: "You've stopped — what are you doing here?" ─────────────

interface StopPromptState {
  /** The stop the quick card is showing (from the websocket, a push tap or the strip). */
  stopId: number | null;
  tripId: number | null;
  /** Stops the person dismissed with "Later" during this trip (no re-prompt). */
  later: number[];
  open: (tripId: number, stopId: number) => void;
  dismiss: (later?: boolean) => void;
}

export const useStopPrompt = create<StopPromptState>((set) => ({
  stopId: null,
  tripId: null,
  later: [],
  open: (tripId, stopId) => set({ tripId, stopId }),
  dismiss: (later = false) =>
    set((s) => ({ stopId: null, later: later && s.stopId != null ? [...s.later, s.stopId] : s.later })),
}));
