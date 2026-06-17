import type { z } from 'zod';
import type {
  trackingSessionSchema,
  locationPointSchema,
  taskRouteSchema,
  startTaskResponseSchema,
  recordLocationResponseSchema,
  locationQueueItemSchema,
} from './schema';

export type TrackingSession = z.infer<typeof trackingSessionSchema>;
export type LocationPoint = z.infer<typeof locationPointSchema>;
export type TaskRoute = z.infer<typeof taskRouteSchema>;
export type StartTaskResponse = z.infer<typeof startTaskResponseSchema>;
export type RecordLocationResponse = z.infer<typeof recordLocationResponseSchema>;
export type LocationQueueItem = z.infer<typeof locationQueueItemSchema>;

export type TrackingStatus = 'idle' | 'tracking' | 'arrived' | 'completed';

export interface ActiveTrackingSession {
  taskId: number;
  sessionId: number;
  destination: {
    latitude: number;
    longitude: number;
    radiusMeters: number;
  };
  startedAt: string;
  status: TrackingStatus;
  arrivedAt: string | null;
}

export interface StartTaskPayload {
  companyId: number;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  recordedAt: string;
}

export interface RecordLocationPayload {
  companyId: number;
  points: Omit<LocationQueueItem, 'taskId' | 'companyId'>[];
}
