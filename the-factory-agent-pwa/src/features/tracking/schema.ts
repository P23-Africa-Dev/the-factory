import { z } from 'zod';

export const trackingSessionSchema = z.object({
  id: z.number(),
  task_id: z.number(),
  started_by_user_id: z.number(),
  start_latitude: z.number(),
  start_longitude: z.number(),
  arrival_detected_at: z.string().nullable(),
  end_recorded_at: z.string().nullable(),
});

export const locationPointSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  accuracy_meters: z.number().nullable().optional(),
  speed_mps: z.number().nullable().optional(),
  heading_degrees: z.number().nullable().optional(),
  event_type: z.enum(['movement', 'start', 'arrival', 'complete']),
  is_checkpoint: z.boolean(),
  recorded_at: z.string(),
});

export const taskRouteSchema = z.object({
  task_id: z.number(),
  company_id: z.number(),
  status: z.string(),
  destination: z.object({
    latitude: z.number(),
    longitude: z.number(),
    radius_meters: z.number(),
  }),
  start: z.object({
    latitude: z.number(),
    longitude: z.number(),
    recorded_at: z.string(),
  }).nullable(),
  arrival: z.object({
    latitude: z.number(),
    longitude: z.number(),
    recorded_at: z.string(),
  }).nullable(),
  end: z.object({
    latitude: z.number(),
    longitude: z.number(),
    recorded_at: z.string(),
  }).nullable(),
  summary: z.object({
    points_count: z.number(),
    total_distance_meters: z.number(),
  }),
  points: z.array(locationPointSchema),
  polyline: z.array(z.tuple([z.number(), z.number()])),
});

export const startTaskResponseSchema = z.object({
  tracking: trackingSessionSchema,
  arrived: z.boolean(),
});

export const recordLocationResponseSchema = z.object({
  received_points: z.number(),
  persisted_points: z.number(),
  arrived: z.boolean(),
});

export const locationQueueItemSchema = z.object({
  taskId: z.number(),
  companyId: z.number(),
  latitude: z.number(),
  longitude: z.number(),
  accuracyMeters: z.number().nullable(),
  speedMps: z.number().nullable(),
  headingDegrees: z.number().nullable(),
  recordedAt: z.string(),
});
