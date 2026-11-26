import { client } from '@/lib/api/client';
import { getActiveCompanyId } from '@/lib/storage/stores';
import type { FieldTripCurrent, FieldTripDto, FieldTripPointPayload, TripPosition } from './types';

function unwrap<T>(raw: unknown): T {
  const wrapped = raw as { data?: unknown };
  return (wrapped?.data === undefined ? raw : wrapped.data) as T;
}

function positionBody(position: TripPosition | null | undefined) {
  if (!position) return {};
  return {
    latitude: position.latitude,
    longitude: position.longitude,
    accuracy_meters: position.accuracyMeters ?? undefined,
    recorded_at: position.recordedAt,
  };
}

/** Shared endpoints for agents and managers; the server checks trip ownership. */
export const fieldTripApi = {
  current: async (): Promise<FieldTripCurrent> => {
    const res = await client.get('/field-trips/current', {
      // `_t` makes every status check unique, so no cache layer (an older
      // service worker on the phone, the WebView) can answer with a stale one.
      params: { company_id: getActiveCompanyId() ?? undefined, _t: Date.now() },
    });
    return unwrap<FieldTripCurrent>(res.data);
  },

  start: async (input: {
    clientTripId: string;
    startedAt: string;
    position: TripPosition | null;
  }): Promise<{ trip: FieldTripDto; created: boolean }> => {
    const res = await client.post('/field-trips', {
      company_id: getActiveCompanyId() ?? undefined,
      client_trip_id: input.clientTripId,
      ...positionBody(input.position),
      recorded_at: input.position?.recordedAt ?? input.startedAt,
    });
    return unwrap<{ trip: FieldTripDto; created: boolean }>(res.data);
  },

  end: async (
    tripId: number,
    input: { endedAt: string; position: TripPosition | null },
  ): Promise<{ trip: FieldTripDto }> => {
    const res = await client.post(`/field-trips/${tripId}/end`, {
      company_id: getActiveCompanyId() ?? undefined,
      ...positionBody(input.position),
      recorded_at: input.endedAt,
    });
    return unwrap<{ trip: FieldTripDto }>(res.data);
  },

  recordPoints: async (tripId: number, points: FieldTripPointPayload[]): Promise<void> => {
    await client.post(`/field-trips/${tripId}/points`, {
      company_id: getActiveCompanyId() ?? undefined,
      points: points.map((p) => ({
        latitude: p.latitude,
        longitude: p.longitude,
        accuracy_meters: p.accuracyMeters,
        speed_mps: p.speedMps,
        heading_degrees: p.headingDegrees,
        recorded_at: p.recordedAt,
        client_point_id: p.clientPointId,
      })),
    });
  },

  /** Tracking health report (shown to managers on the journey). */
  health: async (tripId: number, report: Record<string, unknown>): Promise<void> => {
    await client.post(`/field-trips/${tripId}/health`, { company_id: getActiveCompanyId() ?? undefined, ...report }, {
      suppressErrorToast: true,
    });
  },
};
