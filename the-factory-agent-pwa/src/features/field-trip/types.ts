/** Field Trips: on-demand field tracking ("Start Field Trip" / "End Field Trip"). */

export type FieldTripServerStatus = 'active' | 'completed' | 'auto_closed';

export type FieldTripEndReason = 'user' | 'auto_no_signal' | 'auto_legacy' | null;

export interface FieldTripDto {
  id: number;
  source: 'field_trip' | 'attendance';
  client_trip_id: string | null;
  status: FieldTripServerStatus;
  started_at: string | null;
  ended_at: string | null;
  end_reason: FieldTripEndReason;
  distance_meters: number;
  stop_count: number;
  visit_count: number;
  elapsed_seconds: number;
  last_recorded_at: string | null;
  open_stop?: boolean;
  /** Trip report: 'due' after a trip with stops ends, until it is submitted. */
  report_status?: 'none' | 'due' | 'submitted';
}

export interface FieldTripReportDue {
  trip_id: number;
  pending_stop_count: number;
  due_count: number;
  ended_at: string | null;
}

export interface FieldTripCurrent {
  enabled: boolean;
  can_manage_settings: boolean;
  trip: FieldTripDto | null;
  today: { trip_count: number; distance_meters: number; stop_count: number };
  settings: {
    stop_dwell_seconds: number;
    trip_reminder_seconds: number;
    trip_auto_end_seconds: number;
    moving_interval_seconds: number;
    stationary_interval_seconds: number;
    trip_report_policy?: 'required' | 'optional';
  };
  /** The newest trip whose report is still due (home banner / Start gate). */
  report_due?: FieldTripReportDue | null;
}

export interface TripPosition {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  recordedAt: string;
}

/**
 * The trip as this device knows it. Persisted so a reload, app restart or
 * offline start never loses the trip. `serverId` is null until the start has
 * reached the server (offline start).
 */
export interface LocalTrip {
  clientTripId: string;
  serverId: number | null;
  startedAt: string;
  startPosition: TripPosition | null;
  phase: 'active' | 'ending';
  endRequestedAt: string | null;
  endPosition: TripPosition | null;
}

export type GpsHealth = 'waiting' | 'good' | 'weak' | 'lost';

export interface FieldTripPointPayload {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedMps: number | null;
  headingDegrees: number | null;
  recordedAt: string;
  clientPointId: string;
}
