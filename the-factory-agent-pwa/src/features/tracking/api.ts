import { client } from '@/lib/api/client';
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

export const trackingApi = {
  startTask: async (taskId: number, payload: StartTaskPayload): Promise<StartTaskResponse> => {
    const res = await client.post(`/agent/tasks/${taskId}/start`, {
      company_id: payload.companyId,
      location_permission_granted: true,
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracy_meters: payload.accuracyMeters,
      recorded_at: payload.recordedAt,
    });
    return parseStartTaskResponse(res.data);
  },

  recordLocation: async (
    taskId: number,
    payload: RecordLocationPayload,
  ): Promise<RecordLocationResponse> => {
    const res = await client.post(`/agent/tasks/${taskId}/location`, {
      company_id: payload.companyId,
      points: payload.points.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy_meters: p.accuracyMeters,
        speed_mps: p.speedMps,
        heading_degrees: p.headingDegrees,
        recorded_at: p.recordedAt,
      })),
    });
    return parseRecordLocationResponse(res.data);
  },

  getTaskRoute: async (taskId: number, companyId: number): Promise<TaskRoute> => {
    const res = await client.get(`/agent/tasks/${taskId}/route`, {
      params: { company_id: companyId, include_points: true, limit: 500 },
    });
    return parseTaskRouteResponse(res.data);
  },
};
