import { client } from '@/lib/api/client';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { queueOfflineAction } from '@/lib/offline/queue';
import type {
  ClassifyStopPayload,
  FieldActivityToday,
  PendingReviewPayload,
  FieldPointPayload,
  FieldStop,
  JourneyHistoryResponse,
} from './types';

function unwrapData(raw: unknown): unknown {
  const wrapped = raw as { data?: unknown };
  if (wrapped?.data === undefined) return raw;
  return wrapped.data;
}

export const fieldActivityApi = {
  today: async (): Promise<FieldActivityToday> => {
    const companyId = getActiveCompanyId();
    const res = await client.get('/agent/field-activity/today', {
      params: { company_id: companyId ?? undefined },
    });
    return unwrapData(res.data) as FieldActivityToday;
  },

  dailySummary: async (): Promise<{
    summary: FieldActivityToday['summary'];
    session: FieldActivityToday['session'];
    stops: FieldActivityToday['stops'];
  }> => {
    const companyId = getActiveCompanyId();
    const res = await client.get('/agent/field-activity/daily-summary', {
      params: { company_id: companyId ?? undefined },
    });
    return unwrapData(res.data) as {
      summary: FieldActivityToday['summary'];
      session: FieldActivityToday['session'];
      stops: FieldActivityToday['stops'];
    };
  },

  pendingReview: async (): Promise<PendingReviewPayload> => {
    const companyId = getActiveCompanyId();
    const res = await client.get('/agent/field-activity/pending-review', {
      params: { company_id: companyId ?? undefined },
    });
    return unwrapData(res.data) as PendingReviewPayload;
  },

  recordPoints: async (
    sessionId: number,
    points: FieldPointPayload[],
  ): Promise<{ persisted_count: number; session: unknown }> => {
    const companyId = getActiveCompanyId();
    const res = await client.post(`/agent/field-activity/sessions/${sessionId}/points`, {
      company_id: companyId ?? undefined,
      points: points.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy_meters: p.accuracyMeters ?? null,
        speed_mps: p.speedMps ?? null,
        heading_degrees: p.headingDegrees ?? null,
        recorded_at: p.recordedAt,
        task_id: p.taskId ?? null,
        task_tracking_session_id: p.taskTrackingSessionId ?? null,
      })),
    });
    return unwrapData(res.data) as { persisted_count: number; session: unknown };
  },

  classifyStop: async (stopId: number, payload: ClassifyStopPayload): Promise<FieldStop> => {
    const companyId = getActiveCompanyId();
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await queueOfflineAction({
        actionType: 'field_activity.classify_stop',
        payload: { stop_id: stopId, company_id: companyId ?? undefined, ...payload },
        companyId,
      });
      return {
        id: stopId,
        field_activity_session_id: 0,
        arrived_at: null,
        departed_at: null,
        latitude: 0,
        longitude: 0,
        address: null,
        duration_seconds: 0,
        confidence: 1,
        match_type: null,
        classification: payload.classification,
        classified_by: 'agent',
        classified_at: new Date().toISOString(),
        company_location_id: payload.company_location_id ?? null,
        lead_id: payload.lead_id ?? null,
        meeting_id: null,
        task_id: null,
        reminder_sent: false,
      };
    }

    const res = await client.post(`/agent/field-activity/stops/${stopId}/classify`, {
      company_id: companyId ?? undefined,
      classification: payload.classification,
      lead_id: payload.lead_id,
      company_location_id: payload.company_location_id,
      note: payload.note,
      source: payload.source ?? 'agent',
    });
    const data = unwrapData(res.data) as { stop: FieldStop };
    return data.stop;
  },

  journeys: async (params?: {
    from?: string;
    to?: string;
    preset?: string;
    per_page?: number;
    page?: number;
  }): Promise<JourneyHistoryResponse> => {
    const companyId = getActiveCompanyId();
    const res = await client.get('/agent/field-activity/journeys', {
      params: {
        company_id: companyId ?? undefined,
        preset: params?.preset ?? 'last_30_days',
        from: params?.from,
        to: params?.to,
        per_page: params?.per_page ?? 30,
        page: params?.page,
      },
    });
    return unwrapData(res.data) as JourneyHistoryResponse;
  },

  journeyDetail: async (sessionId: number): Promise<{
    journey: { id: number; date: string | null; distance_meters: number };
    stats: Record<string, unknown>;
    timeline: Array<{
      id: string;
      type: string;
      label: string;
      occurred_at: string | null;
      duration_seconds?: number;
      color: string;
    }>;
    navigation: {
      previous_id: number | null;
      next_id: number | null;
    };
  }> => {
    const companyId = getActiveCompanyId();
    const res = await client.get(`/agent/field-activity/journeys/${sessionId}`, {
      params: {
        company_id: companyId ?? undefined,
        include_route: false,
        include_timeline: true,
      },
    });
    return unwrapData(res.data) as {
      journey: { id: number; date: string | null; distance_meters: number };
      stats: Record<string, unknown>;
      timeline: Array<{
        id: string;
        type: string;
        label: string;
        occurred_at: string | null;
        duration_seconds?: number;
        color: string;
      }>;
      navigation: {
        previous_id: number | null;
        next_id: number | null;
      };
    };
  },
};
