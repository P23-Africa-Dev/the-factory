/**
 * Management Field Activity & Journeys API (`/admin/field-activity/*`)
 */
import { client } from '@/lib/api/client';
import type {
  ClassifyStopPayload,
  FieldActivityToday,
  FieldPointPayload,
  FieldStop,
  JourneyHistoryResponse,
  PendingReviewPayload,
} from './types';

function unwrap<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'data' in raw) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

export type FieldActivityAnalyticsAgent = {
  user_id: number;
  name: string;
  email?: string;
  avatar_url?: string | null;
  session_count: number;
  active_sessions?: number;
  distance_meters: number;
  travel_seconds: number;
  stationary_seconds?: number;
  stop_count: number;
  visit_count: number;
  unknown_stop_count: number;
  travel_efficiency?: number | null;
  last_recorded_at?: string | null;
};

export type FieldActivityAnalytics = {
  enabled?: boolean;
  from?: string;
  to?: string;
  active_sessions: number;
  distance_meters: number;
  travel_seconds: number;
  stationary_seconds: number;
  stop_count: number;
  visit_count: number;
  unknown_stop_count: number;
  travel_efficiency: number | null;
  agents: FieldActivityAnalyticsAgent[];
  heatmap_points?: Array<{ latitude: number; longitude: number; weight?: number }>;
};

export type LiveFieldSession = {
  session_id: number;
  user_id: number;
  agent_name: string;
  avatar_url?: string | null;
  status: string;
  movement_state: string | null;
  latitude: number | null;
  longitude: number | null;
  last_recorded_at: string | null;
  distance_meters: number;
  travel_seconds: number;
  stop_count: number;
  visit_count: number;
  unknown_stop_count: number;
  points?: Array<{ latitude: number; longitude: number; recorded_at?: string }>;
  stops?: FieldStop[];
};

export type FieldActivitySettings = {
  enabled: boolean;
  moving_interval_seconds?: number;
  stationary_interval_seconds?: number;
  stop_dwell_seconds?: number;
  anomaly_alerts_enabled?: boolean;
};

export const fieldActivityApi = {
  async getAnalytics(params?: {
    preset?: string;
    from?: string;
    to?: string;
    agent_id?: number;
  }): Promise<FieldActivityAnalytics> {
    const { data } = await client.get('/admin/field-activity/analytics', { params });
    const raw = unwrap<Record<string, unknown>>(data);
    const totals = (raw?.totals ?? raw?.summary ?? raw ?? {}) as Record<string, unknown>;
    const agents = (raw?.agents ?? raw?.by_agent ?? []) as FieldActivityAnalyticsAgent[];
    return {
      enabled: raw?.enabled !== false,
      from: (raw?.from as string) ?? undefined,
      to: (raw?.to as string) ?? undefined,
      active_sessions: Number(totals.active_sessions ?? raw?.active_sessions ?? 0),
      distance_meters: Number(totals.distance_meters ?? raw?.distance_meters ?? 0),
      travel_seconds: Number(totals.travel_seconds ?? raw?.travel_seconds ?? 0),
      stationary_seconds: Number(totals.stationary_seconds ?? raw?.stationary_seconds ?? 0),
      stop_count: Number(totals.stop_count ?? raw?.stop_count ?? 0),
      visit_count: Number(totals.visit_count ?? raw?.visit_count ?? 0),
      unknown_stop_count: Number(totals.unknown_stop_count ?? raw?.unknown_stop_count ?? 0),
      travel_efficiency:
        totals.travel_efficiency != null ? Number(totals.travel_efficiency) : null,
      agents: Array.isArray(agents) ? agents : [],
      heatmap_points: Array.isArray(raw?.heatmap_points)
        ? (raw.heatmap_points as Array<{ latitude: number; longitude: number; weight?: number }>)
        : [],
    };
  },

  async getLive(): Promise<LiveFieldSession[]> {
    const { data } = await client.get('/admin/field-activity/live');
    const raw = unwrap<unknown>(data);
    if (Array.isArray(raw)) return raw as LiveFieldSession[];
    const obj = (raw ?? {}) as Record<string, unknown>;
    const list = (obj.sessions ?? obj.agents ?? obj.data ?? []) as LiveFieldSession[];
    return Array.isArray(list) ? list : [];
  },

  async getAgentJourneys(
    agentId: number | string,
    params?: {
      preset?: string;
      from?: string;
      to?: string;
      per_page?: number;
      page?: number;
    },
  ): Promise<JourneyHistoryResponse> {
    const { data } = await client.get(`/admin/field-activity/agents/${agentId}/journeys`, {
      params,
    });
    return unwrap<JourneyHistoryResponse>(data);
  },

  async journeyDetail(sessionId: number): Promise<{
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
  }> {
    const { data } = await client.get(`/admin/field-activity/journeys/${sessionId}`);
    return unwrap(data);
  },

  async getSettings(): Promise<FieldActivitySettings> {
    const { data } = await client.get('/admin/field-activity/settings');
    return unwrap<FieldActivitySettings>(data);
  },

  async updateSettings(payload: Partial<FieldActivitySettings>): Promise<FieldActivitySettings> {
    const { data } = await client.put('/admin/field-activity/settings', payload);
    return unwrap<FieldActivitySettings>(data);
  },

  async scanAlerts(): Promise<Record<string, unknown>> {
    const { data } = await client.post('/admin/field-activity/alerts/scan');
    return unwrap<Record<string, unknown>>(data);
  },

  // Compatibility adapters for shared components
  async today(): Promise<FieldActivityToday> {
    const analytics = await fieldActivityApi.getAnalytics({ preset: 'today' });
    return {
      enabled: analytics.enabled !== false,
      session: null,
      summary: {
        id: 0,
        summary_date: new Date().toISOString().slice(0, 10),
        distance_meters: analytics.distance_meters,
        travel_seconds: analytics.travel_seconds,
        stationary_seconds: analytics.stationary_seconds,
        stop_count: analytics.stop_count,
        visit_count: analytics.visit_count,
        unknown_stop_count: analytics.unknown_stop_count,
        personal_stop_count: 0,
        ignored_stop_count: 0,
        narrative:
          analytics.active_sessions > 0
            ? `${analytics.active_sessions} agent session(s) active in the field right now.`
            : 'Monitor your field workforce journeys, visits, and stops across the day.',
        metrics: null,
        generated_at: new Date().toISOString(),
      },
      stops: [],
      config: {
        moving_interval_seconds: 30,
        stationary_interval_seconds: 120,
        stop_dwell_seconds: 300,
      },
    };
  },

  async pendingReview(): Promise<PendingReviewPayload> {
    return {
      pending_stop_count: 0,
      pending_session_count: 0,
      oldest_pending_date: null,
      sessions: [],
    };
  },

  async journeys(params?: {
    agent_id?: number;
    preset?: string;
    from?: string;
    to?: string;
    per_page?: number;
    page?: number;
  }): Promise<JourneyHistoryResponse> {
    if (params?.agent_id) {
      return fieldActivityApi.getAgentJourneys(params.agent_id, params);
    }
    const analytics = await fieldActivityApi.getAnalytics(params);
    if (analytics.agents.length > 0) {
      return fieldActivityApi.getAgentJourneys(analytics.agents[0].user_id, params);
    }
    return {
      items: [],
      summary: {
        journey_count: 0,
        distance_meters: analytics.distance_meters,
        stop_count: analytics.stop_count,
        visit_count: analytics.visit_count,
        unknown_stop_count: analytics.unknown_stop_count,
        travel_seconds: analytics.travel_seconds,
        from: analytics.from ?? '',
        to: analytics.to ?? '',
      },
    };
  },

  async recordPoints(_sessionId: number, _points: FieldPointPayload[]) {
    return { recorded: 0, stops_detected: 0, session: null };
  },

  async classifyStop(_stopId: number, _payload: ClassifyStopPayload) {
    return {} as FieldStop;
  },
};
