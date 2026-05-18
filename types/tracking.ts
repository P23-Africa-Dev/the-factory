export type TrackingEventType =
  | "tracking.task.started"
  | "tracking.location.updated"
  | "tracking.task.arrived"
  | "tracking.task.completed"
  | "tracking.agent.location.updated";

export interface LiveTaskState {
  taskId: number;
  trackingSessionId: number;
  userId: number;
  agentName: string;
  agentAvatarUrl?: string;
  taskTitle: string;
  taskAddress?: string;
  status: "in_progress" | "arrived" | "completed";
  destination?: { lat: number; lng: number; radiusM?: number };
  lastPosition: [number, number]; // [lng, lat] — Mapbox convention
  polyline: [number, number][]; // capped at 2000 pts
  trackingStartedAt?: string;
  lastEventAt: string; // ISO — used for staleness check
  arrivedAt?: string;
}

export interface TrackingEnvelope {
  type: TrackingEventType;
  channel: string;
  payload: {
    task_id: number;
    tracking_session_id: number;
    user_id: number;
    company_id: number;
    occurred_at: string;
    data?: {
      latitude?: number;
      longitude?: number;
      accuracy_meters?: number;
      speed_mps?: number;
      heading_degrees?: number;
      event_type?: string;
      arrived?: boolean;
      task_status?: string;
      arrival_recorded_at?: string;
      destination?: {
        latitude?: number;
        longitude?: number;
        radius_meters?: number;
      };
      task?: {
        id?: number;
        title?: string | null;
        status?: string | null;
        address?: string | null;
        location?: string | null;
        destination_latitude?: number | null;
        destination_longitude?: number | null;
      };
      agent?: {
        id?: number;
        name?: string | null;
        internal_role?: string | null;
        avatar_url?: string | null;
      };
      location?: {
        latitude?: number;
        longitude?: number;
        accuracy_meters?: number | null;
        speed_mps?: number | null;
        heading_degrees?: number | null;
        event_type?: string | null;
        recorded_at?: string | null;
      };
      status?: {
        is_online?: boolean;
        is_stale?: boolean;
        last_seen_at?: string | null;
        stale_after_seconds?: number;
        age_seconds?: number | null;
      };
    };
  };
}

export interface AgentLocationSnapshotItem {
  agent: {
    id: number;
    name: string | null;
    email?: string | null;
    avatar?: string | null;
    avatar_url?: string | null;
    internal_role?: string | null;
  };
  task: {
    id: number | null;
    title?: string | null;
    status?: string | null;
    tracking_session_id?: number | null;
    address?: string | null;
    location?: string | null;
    destination_latitude?: number | null;
    destination_longitude?: number | null;
  };
  location: {
    latitude: number;
    longitude: number;
    accuracy_meters?: number | null;
    speed_mps?: number | null;
    heading_degrees?: number | null;
    event_type?: string | null;
    arrived?: boolean;
    recorded_at?: string | null;
  };
  status: {
    is_online: boolean;
    is_stale: boolean;
    stale_after_seconds?: number;
    age_seconds?: number | null;
    last_seen_at?: string | null;
  };
  updated_at?: string | null;
}

export interface AgentLocationsListData {
  items: AgentLocationSnapshotItem[];
  meta: {
    company_id: number;
    stale_after_seconds: number;
    generated_at: string;
  };
}

export interface TrackingSession {
  id: number;
  task_id: number;
  started_by_user_id: number;
  start_latitude: number;
  start_longitude: number;
  arrival_detected_at: string | null;
  end_recorded_at: string | null;
}

export interface LocationPoint {
  latitude: number;
  longitude: number;
  accuracy_meters?: number;
  speed_mps?: number;
  heading_degrees?: number;
  event_type: "movement" | "start" | "arrival" | "complete";
  is_checkpoint: boolean;
  recorded_at: string;
}

export interface TaskRoute {
  task_id: number;
  company_id: number;
  status: string;
  destination: { latitude: number; longitude: number; radius_meters: number };
  start: { latitude: number; longitude: number; recorded_at: string };
  arrival: { latitude: number; longitude: number; recorded_at: string } | null;
  end: { latitude: number; longitude: number; recorded_at: string } | null;
  summary: { points_count: number; total_distance_meters: number };
  points: LocationPoint[];
  polyline: [number, number][];
}

export interface GeoReading {
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedMps: number | null;
  headingDegrees: number | null;
  recordedAt: string;
}

export interface StartTrackingPayload {
  company_id: number | string;
  location_permission_granted: true;
  latitude: number;
  longitude: number;
  accuracy_meters?: number | null;
  recorded_at?: string;
}

export interface RecordLocationPayload {
  company_id: number | string;
  // single point fields
  latitude?: number;
  longitude?: number;
  accuracy_meters?: number | null;
  speed_mps?: number | null;
  heading_degrees?: number | null;
  recorded_at?: string;
  // batch
  points?: Array<{
    latitude: number;
    longitude: number;
    accuracy_meters?: number | null;
    speed_mps?: number | null;
    heading_degrees?: number | null;
    recorded_at: string;
  }>;
}

export interface RecordLocationResponse {
  received_points: number;
  persisted_points: number;
  arrived: boolean;
}
