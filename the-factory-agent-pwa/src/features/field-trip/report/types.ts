/** Trip report: what the person did at each stop of a field trip. */

export type StopActivity = 'customer_visit' | 'lead_visit' | 'org_visit' | 'personal' | 'ignore';
export type StopOutcome = 'successful' | 'follow_up' | 'nobody_available' | 'not_interested' | 'other';
export type LocationStatus = 'unconfirmed' | 'confirmed' | 'corrected';

export interface StopAttachment {
  id: number;
  client_attachment_id: string | null;
  field_stop_id: number;
  mime_type: string | null;
  size_bytes: number;
  original_name: string | null;
  caption: string | null;
  is_image: boolean;
  captured_at: string | null;
  url: string;
  /** Only on the phone: queued, not uploaded yet. */
  pending?: boolean;
  /** Only on the phone: object URL of the queued file (preview). */
  localUrl?: string;
}

export interface ReportStop {
  id: number;
  field_activity_session_id: number;
  arrived_at: string | null;
  departed_at: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  duration_seconds: number;
  classification: StopActivity | 'pending';
  match_type: string | null;
  lead_id: number | null;
  company_location_id: number | null;
  meeting_id: number | null;
  task_id: number | null;
  source: 'detected' | 'manual';
  client_stop_id?: string | null;
  outcome: StopOutcome | null;
  notes: string | null;
  follow_up_at: string | null;
  record_status: 'pending' | 'recorded';
  recorded_at: string | null;
  recorded_via: 'live' | 'review' | 'web' | null;
  location_status: LocationStatus;
  original_latitude: number | null;
  original_longitude: number | null;
  original_address: string | null;
  lead_name: string | null;
  location_name: string | null;
  added_by_user: boolean;
  off_route: boolean;
  attachments: StopAttachment[];
}

export interface Completeness {
  total: number;
  recorded: number;
  pending: number;
  pending_ids: number[];
}

export interface TripAiSummary {
  summary: string;
  highlights: string[];
  follow_ups: Array<{ who: string; what: string; when: string | null }>;
  concerns: string[];
  source: 'ai' | 'fallback';
  generated_at?: string;
}

export interface TripReport {
  trip: {
    id: number;
    status: string;
    started_at: string | null;
    ended_at: string | null;
    end_reason: string | null;
    distance_meters: number;
    stop_count: number;
    report_status: 'none' | 'due' | 'submitted';
    report_submitted_at: string | null;
    ai_summary: TripAiSummary | null;
  };
  stops: ReportStop[];
  completeness: Completeness;
  policy: 'required' | 'optional';
  limits: { max_attachments_per_stop: number; max_file_mb: number };
}

/** What the stop form sends (PUT /field-trips/stops/{id}/record). */
export interface StopRecordInput {
  activity: StopActivity;
  lead_id?: number | null;
  company_location_id?: number | null;
  outcome?: StopOutcome | null;
  notes?: string | null;
  follow_up_at?: string | null;
  via?: 'live' | 'review';
  location?:
    | { action: 'confirm' }
    | { action: 'correct'; latitude: number; longitude: number; address?: string | null };
}

export interface ManualStopInput extends Partial<StopRecordInput> {
  client_stop_id: string;
  latitude: number;
  longitude: number;
  address?: string | null;
  arrived_at: string;
  departed_at: string;
}

export const ACTIVITY_OPTIONS: Array<{ value: StopActivity; label: string; hint: string }> = [
  { value: 'customer_visit', label: 'Customer visit', hint: 'An existing customer' },
  { value: 'lead_visit', label: 'Lead / prospect', hint: 'A lead or new prospect' },
  { value: 'org_visit', label: 'Company site', hint: 'Office, branch or warehouse' },
  { value: 'personal', label: 'Personal / break', hint: 'Lunch, rest, errands' },
  { value: 'ignore', label: 'Not a stop', hint: 'Traffic, waiting' },
];

export const OUTCOME_OPTIONS: Array<{ value: StopOutcome; label: string }> = [
  { value: 'successful', label: 'Successful' },
  { value: 'follow_up', label: 'Follow-up needed' },
  { value: 'nobody_available', label: 'Nobody available' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'other', label: 'Other' },
];

export const ATTACHMENT_ACCEPT =
  'image/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
