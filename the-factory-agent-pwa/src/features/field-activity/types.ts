export type FieldMovementState = 'moving' | 'slow' | 'stopped';

export type FieldStopClassification =
  | 'customer_visit'
  | 'lead_visit'
  | 'org_visit'
  | 'personal'
  | 'ignore'
  | 'pending';

export interface FieldActivitySession {
  id: number;
  company_id: number;
  user_id: number;
  attendance_record_id: number;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  distance_meters: number;
  travel_seconds: number;
  stationary_seconds: number;
  stop_count: number;
  visit_count: number;
  unknown_stop_count: number;
  last_latitude: number | null;
  last_longitude: number | null;
  last_movement_state: FieldMovementState | null;
  last_recorded_at: string | null;
}

export interface FieldStop {
  id: number;
  field_activity_session_id: number;
  arrived_at: string | null;
  departed_at: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  duration_seconds: number;
  confidence: number;
  match_type: string | null;
  classification: FieldStopClassification;
  classified_by: string | null;
  classified_at: string | null;
  company_location_id: number | null;
  lead_id: number | null;
  meeting_id: number | null;
  task_id: number | null;
  reminder_sent: boolean;
  meta?: Record<string, unknown> | null;
}

export interface FieldDailySummary {
  id: number;
  summary_date: string | null;
  distance_meters: number;
  travel_seconds: number;
  stationary_seconds: number;
  stop_count: number;
  visit_count: number;
  unknown_stop_count: number;
  personal_stop_count: number;
  ignored_stop_count: number;
  narrative: string | null;
  metrics: Record<string, unknown> | null;
  generated_at: string | null;
}

export interface PendingReviewSession {
  session_id: number;
  started_at: string | null;
  ended_at: string | null;
  status: string | null;
  pending_stop_count: number;
  stops: FieldStop[];
}

export interface PendingReviewPayload {
  pending_stop_count: number;
  pending_session_count: number;
  oldest_pending_date: string | null;
  sessions: PendingReviewSession[];
}

export interface FieldActivityToday {
  enabled: boolean;
  session: FieldActivitySession | null;
  summary: FieldDailySummary | null;
  stops: FieldStop[];
  pending_review?: PendingReviewPayload;
  config: {
    moving_interval_seconds: number;
    stationary_interval_seconds: number;
    stop_dwell_seconds: number;
  };
}

export interface ClassifyStopPayload {
  classification: Exclude<FieldStopClassification, 'pending'>;
  lead_id?: number;
  company_location_id?: number;
  note?: string;
  source?: 'agent' | 'reminder';
}

export interface FieldPointPayload {
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  speedMps?: number | null;
  headingDegrees?: number | null;
  recordedAt: string;
  taskId?: number | null;
  taskTrackingSessionId?: number | null;
}
