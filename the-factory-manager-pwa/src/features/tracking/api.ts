/**
 * Management Fleet & Task Tracking API (`/admin/agents/locations`, `/admin/tracking/health`, `/admin/territories`, `/admin/tasks/{id}/route`)
 */
import { useQuery } from '@tanstack/react-query';
import { client } from '@/lib/api/client';
import { appStore, getActiveCompanyId } from '@/lib/storage/stores';
import type { TaskStatus } from '@/features/tasks';
import {
  parseStartTaskResponse,
  parseRecordLocationResponse,
  parseTaskRouteResponse,
} from './schema';
import type {
  StartTaskPayload,
  RecordLocationPayload,
  StartTaskResponse,
  TaskRoute,
  RecordLocationResponse,
} from './types';

function unwrap<T>(raw: unknown): T {
  if (raw && typeof raw === 'object' && 'data' in raw) {
    return (raw as { data: T }).data;
  }
  return raw as T;
}

export type FleetAgentSnapshot = {
  user_id: number;
  agent_id: number;
  name: string;
  email?: string;
  phone?: string | null;
  avatar_url?: string | null;
  role?: string;
  is_online: boolean;
  status?: string;
  operational_status:
    | 'available'
    | 'en_route'
    | 'near_destination'
    | 'destination_reached'
    | 'completed'
    | 'delayed'
    | 'offline'
    | string;
  latitude: number | null;
  longitude: number | null;
  accuracy_meters?: number | null;
  speed_mps?: number | null;
  heading_degrees?: number | null;
  last_seen_at: string | null;
  active_task_id?: number | null;
  active_task_title?: string | null;
  active_task?: {
    id: number;
    title: string;
    status: string;
    priority?: string;
    address?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    eta_minutes?: number | null;
    distance_remaining_meters?: number | null;
  } | null;
};

export type FleetAgentLocation = FleetAgentSnapshot;

export type FleetLocationsOverview = {
  agents: FleetAgentSnapshot[];
  counts: {
    total: number;
    online: number;
    en_route: number;
    near_destination: number;
    destination_reached: number;
    delayed: number;
    offline: number;
  };
};

export type TerritoryItem = {
  id?: number;
  user_id: number;
  agent_name?: string;
  name?: string;
  color?: string;
  boundary?: unknown;
  radius_meters?: number | null;
  center_latitude?: number | null;
  center_longitude?: number | null;
};

function normalizeAgentSnapshot(raw: Record<string, unknown>): FleetAgentSnapshot {
  const userObj = (raw.user ?? raw.agent ?? {}) as Record<string, unknown>;
  const locObj = (raw.location ?? raw.last_location ?? raw) as Record<string, unknown>;
  const taskObj = (raw.active_task ?? raw.current_task ?? raw.task ?? null) as Record<string, unknown> | null;

  const latRaw = locObj.latitude ?? locObj.lat ?? raw.latitude ?? raw.lat;
  const lngRaw = locObj.longitude ?? locObj.lng ?? raw.longitude ?? raw.lng;
  const lat = latRaw != null && Number.isFinite(Number(latRaw)) ? Number(latRaw) : null;
  const lng = lngRaw != null && Number.isFinite(Number(lngRaw)) ? Number(lngRaw) : null;

  const opStatus = String(
    raw.operational_status ??
      raw.tracking_status ??
      raw.status ??
      (raw.is_online ? 'available' : 'offline'),
  );

  const isOnline =
    typeof raw.is_online === 'boolean'
      ? raw.is_online
      : opStatus !== 'offline';

  const userId = Number(raw.user_id ?? raw.agent_id ?? userObj.id ?? raw.id ?? 0);
  const activeTaskId = taskObj ? Number(taskObj.id ?? 0) : null;
  const activeTaskTitle = taskObj ? String(taskObj.title ?? 'Assigned Task') : null;

  return {
    user_id: userId,
    agent_id: userId,
    name: String(raw.name ?? raw.agent_name ?? userObj.name ?? 'Agent'),
    email: (raw.email ?? userObj.email) as string | undefined,
    phone: ((raw.phone ?? userObj.phone) as string | null) ?? null,
    avatar_url: ((raw.avatar_url ?? userObj.avatar_url ?? userObj.avatar) as string | null) ?? null,
    role: ((raw.role ?? userObj.internal_role) as string | undefined) ?? 'agent',
    is_online: isOnline,
    status: opStatus,
    operational_status: opStatus,
    latitude: lat,
    longitude: lng,
    accuracy_meters:
      locObj.accuracy_meters != null ? Number(locObj.accuracy_meters) : null,
    speed_mps: locObj.speed_mps != null ? Number(locObj.speed_mps) : null,
    heading_degrees:
      locObj.heading_degrees != null ? Number(locObj.heading_degrees) : null,
    last_seen_at:
      ((locObj.recorded_at ?? locObj.updated_at ?? raw.last_seen_at ?? raw.updated_at) as string | null) ??
      null,
    active_task_id: activeTaskId,
    active_task_title: activeTaskTitle,
    active_task: taskObj
      ? {
          id: Number(taskObj.id ?? 0),
          title: String(taskObj.title ?? 'Assigned Task'),
          status: String(taskObj.status ?? 'in_progress'),
          priority: (taskObj.priority as string | undefined) ?? undefined,
          address: ((taskObj.address ?? taskObj.location) as string | null) ?? null,
          latitude:
            taskObj.latitude != null && Number.isFinite(Number(taskObj.latitude))
              ? Number(taskObj.latitude)
              : null,
          longitude:
            taskObj.longitude != null && Number.isFinite(Number(taskObj.longitude))
              ? Number(taskObj.longitude)
              : null,
          eta_minutes:
            taskObj.eta_minutes != null ? Number(taskObj.eta_minutes) : null,
          distance_remaining_meters:
            taskObj.distance_remaining_meters != null
              ? Number(taskObj.distance_remaining_meters)
              : null,
        }
      : null,
  };
}

export const trackingApi = {
  async getFleetLocations(params?: {
    status?: string;
    search?: string;
  }): Promise<FleetLocationsOverview> {
    const companyId = getActiveCompanyId();
    const { data } = await client.get('/admin/agents/locations', {
      params: { ...params, company_id: companyId ?? undefined },
    });
    const raw = unwrap<unknown>(data);
    let rawList: unknown[] = [];
    let rawCounts: Record<string, unknown> = {};

    if (Array.isArray(raw)) {
      rawList = raw;
    } else if (raw && typeof raw === 'object') {
      const obj = raw as Record<string, unknown>;
      rawList = (obj.agents ?? obj.locations ?? obj.items ?? obj.data ?? []) as unknown[];
      rawCounts = (obj.counts ?? obj.summary ?? {}) as Record<string, unknown>;
    }

    const agents = (Array.isArray(rawList) ? rawList : [])
      .map((item) => normalizeAgentSnapshot((item ?? {}) as Record<string, unknown>))
      .filter((a) => a.user_id > 0);

    const online = agents.filter((a) => a.is_online).length;
    const enRoute = agents.filter((a) => a.operational_status === 'en_route').length;
    const nearDest = agents.filter((a) => a.operational_status === 'near_destination').length;
    const reached = agents.filter((a) => a.operational_status === 'destination_reached').length;
    const delayed = agents.filter((a) => a.operational_status === 'delayed').length;

    return {
      agents,
      counts: {
        total: Number(rawCounts.total ?? agents.length),
        online: Number(rawCounts.online ?? online),
        en_route: Number(rawCounts.en_route ?? enRoute),
        near_destination: Number(rawCounts.near_destination ?? nearDest),
        destination_reached: Number(rawCounts.destination_reached ?? reached),
        delayed: Number(rawCounts.delayed ?? delayed),
        offline: Number(rawCounts.offline ?? Math.max(0, agents.length - online)),
      },
    };
  },

  async getAgentLocation(userId: number | string): Promise<FleetAgentSnapshot> {
    const { data } = await client.get(`/admin/agents/${userId}/location`);
    const raw = unwrap<Record<string, unknown>>(data);
    return normalizeAgentSnapshot(raw);
  },

  async getTrackingHealth(): Promise<Record<string, unknown>> {
    const { data } = await client.get('/admin/tracking/health');
    return unwrap<Record<string, unknown>>(data);
  },

  async listTerritories(): Promise<TerritoryItem[]> {
    const { data } = await client.get('/admin/territories');
    const raw = unwrap<unknown>(data);
    if (Array.isArray(raw)) return raw as TerritoryItem[];
    const obj = (raw ?? {}) as Record<string, unknown>;
    const list = (obj.territories ?? obj.data ?? []) as TerritoryItem[];
    return Array.isArray(list) ? list : [];
  },

  startTask: async (taskId: number, payload: StartTaskPayload): Promise<StartTaskResponse> => {
    await client.patch(`/admin/tasks/${taskId}/status`, {
      status: 'in_progress' satisfies TaskStatus,
      company_id: payload.companyId,
    });
    return parseStartTaskResponse({
      data: {
        status: 'in_progress',
        started_at: payload.recordedAt ?? new Date().toISOString(),
      },
    });
  },

  recordLocation: async (
    _taskId: number,
    payload: RecordLocationPayload,
  ): Promise<RecordLocationResponse> => {
    return parseRecordLocationResponse({
      data: {
        accepted: payload.points.length,
        operational_status: 'en_route',
      },
    });
  },

  getTaskRoute: async (taskId: number, companyId?: number): Promise<TaskRoute> => {
    const resolvedCompanyId = companyId ?? getActiveCompanyId() ?? undefined;
    const res = await client.get(`/admin/tasks/${taskId}/route`, {
      params: { company_id: resolvedCompanyId, include_points: true, limit: 500 },
    });
    return parseTaskRouteResponse(res.data);
  },
};

export function useFleetAgentLocations(
  params?: { status?: string; search?: string },
  enabled = true,
) {
  const isAuthenticated =
    typeof window !== 'undefined' && Boolean(appStore.getString('auth_token'));
  return useQuery({
    queryKey: ['admin-fleet-locations', params],
    queryFn: async () => {
      const overview = await trackingApi.getFleetLocations(params);
      return overview.agents;
    },
    enabled: isAuthenticated && enabled,
    staleTime: 15_000,
    refetchInterval: 20_000,
  });
}

export function useTrackingHealth(enabled = true) {
  const isAuthenticated =
    typeof window !== 'undefined' && Boolean(appStore.getString('auth_token'));
  return useQuery({
    queryKey: ['admin-tracking-health'],
    queryFn: () => trackingApi.getTrackingHealth(),
    enabled: isAuthenticated && enabled,
    staleTime: 60_000,
  });
}

export function useTerritories(enabled = true) {
  const isAuthenticated =
    typeof window !== 'undefined' && Boolean(appStore.getString('auth_token'));
  return useQuery({
    queryKey: ['admin-territories'],
    queryFn: () => trackingApi.listTerritories(),
    enabled: isAuthenticated && enabled,
    staleTime: 120_000,
  });
}
