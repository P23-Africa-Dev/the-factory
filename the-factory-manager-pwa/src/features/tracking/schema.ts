import { z } from 'zod';

export const proximityStateSchema = z.enum([
  'in_progress',
  'near_destination',
  'arrived',
  'completed',
]);

/** Matches TaskTrackingController::trackingSessionPayload (nested start/arrival/end). */
const trackingCoordPayloadSchema = z
  .object({
    latitude: z.number().nullable().optional(),
    longitude: z.number().nullable().optional(),
    accuracy_meters: z.number().nullable().optional(),
    recorded_at: z.string().nullable().optional(),
  })
  .passthrough();

export const trackingSessionSchema = z
  .object({
    id: z.coerce.number(),
    task_id: z.coerce.number(),
    company_id: z.coerce.number().optional(),
    start: trackingCoordPayloadSchema.optional(),
    arrival: trackingCoordPayloadSchema.optional(),
    near: trackingCoordPayloadSchema.optional(),
    end: trackingCoordPayloadSchema.optional(),
    destination: z
      .object({
        latitude: z.number().nullable().optional(),
        longitude: z.number().nullable().optional(),
        radius_meters: z.number().nullable().optional(),
      })
      .passthrough()
      .optional(),
    updated_at: z.string().nullable().optional(),
  })
  .passthrough();

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

const proximityFieldsSchema = z.object({
  near_destination: z.boolean().optional(),
  arrived: z.boolean(),
  proximity_state: proximityStateSchema.optional(),
  distance_to_destination_meters: z.number().nullable().optional(),
  distance_remaining_meters: z.number().nullable().optional(),
  movement_started: z.boolean().optional(),
  demo_simulation_active: z.boolean().optional(),
});

export const startTaskResponseSchema = z
  .object({
    tracking: trackingSessionSchema,
    arrived: z.boolean(),
  })
  .merge(proximityFieldsSchema);

export const recordLocationResponseSchema = z
  .object({
    received_points: z.number(),
    persisted_points: z.number(),
    arrived: z.boolean(),
  })
  .merge(proximityFieldsSchema);

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

function unwrapTrackingData(raw: unknown): unknown {
  const wrapped = raw as Record<string, unknown>;
  return wrapped?.data ?? raw;
}

export function parseStartTaskResponse(raw: unknown) {
  return startTaskResponseSchema.parse(unwrapTrackingData(raw));
}

export function parseRecordLocationResponse(raw: unknown) {
  return recordLocationResponseSchema.parse(unwrapTrackingData(raw));
}

export function parseTaskRouteResponse(raw: unknown) {
  return taskRouteSchema.parse(unwrapTrackingData(raw));
}
