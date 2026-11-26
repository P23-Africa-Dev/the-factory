/**
 * IndexedDB schema types — mirrors mobile app's drizzle schema.
 */

export interface LocationQueueEntry {
  id?: number; // Auto-incremented by IndexedDB
  taskId: number;
  /** Company that owns the task/session — preferred over active company at sync time. */
  companyId?: number | null;
  /** When set, point belongs to a field trip session (not a task). */
  fieldActivitySessionId?: number | null;
  /**
   * Field trip started offline: the server id is not known yet. Rows carry the
   * trip's client id and are back-filled with fieldActivitySessionId once the
   * start syncs (taskId is 0, so task sync skips them meanwhile).
   */
  fieldTripClientId?: string | null;
  /** Stable per-point id; the server ignores duplicates (offline replays). */
  clientPointId?: string | null;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedMps: number | null;
  headingDegrees: number | null;
  recordedAt: string;
  synced: 0 | 1; // 0 = pending, 1 = sent
  /** 1 while a memory flush or syncEngine POST is in flight for this row. */
  inFlight?: 0 | 1;
  attempts?: number;
  nextAttemptAt?: string | null;
  lastError?: string | null;
}

/** Auth mirror for service-worker background location upload (SW cannot read localStorage). */
export interface SyncMetaEntry {
  id: string;
  token: string;
  apiBaseUrl: string;
  companyId: number | null;
  updatedAt: string;
}

export interface ProofQueueEntry {
  id?: number;
  taskId: number;
  fileBlob: Blob; // IndexedDB can store Blobs directly (unlike SQLite file URIs)
  fileName: string;
  mimeType: string;
  uploaded: 0 | 1; // 0 = pending, 1 = uploaded
  createdAt: string;
  attempts?: number;
  nextAttemptAt?: string | null;
  lastError?: string | null;
}

/** A photo/document for a field-trip stop, waiting to upload (works offline). */
export interface StopAttachmentQueueEntry {
  id?: number;
  companyId: number | null;
  tripId: number;
  /** Server id of the stop, or null for a stop added offline (see clientStopId). */
  stopId: number | null;
  clientStopId: string | null;
  clientAttachmentId: string;
  fileBlob: Blob;
  fileName: string;
  mimeType: string;
  caption: string | null;
  capturedAt: string;
  uploaded: 0 | 1;
  createdAt: string;
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
}

export interface TaskDestinationCacheEntry {
  id?: number;
  taskId: number;
  destinationLatitude: number;
  destinationLongitude: number;
  radiusMeters: number;
  cachedAt: number;
}

export interface SavedLocationCacheEntry {
  id: number; // server id, or a negative temp id for offline-created rows
  companyId: number;
  name: string;
  type: string | null;
  description: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  contactNumber: string | null;
  email: string | null;
  isActive: boolean;
  createdByName: string | null;
  createdAt: string | null;
  pending?: 0 | 1; // 1 = created/updated offline, awaiting sync
  cachedAt: string;
}

export type OfflineActionType =
  | 'task.update_status'
  | 'task.complete'
  | 'task.create_self'
  | 'project.create'
  | 'project.update'
  | 'project.update_status'
  | 'meeting.create'
  | 'meeting.update'
  | 'meeting.cancel'
  | 'attendance.clock_in'
  | 'attendance.clock_out'
  | 'field_activity.classify_stop'
  | 'field_trip.record_stop'
  | 'field_trip.add_stop'
  | 'field_trip.delete_stop'
  | 'location.create'
  | 'location.update'
  | 'location.delete'
  | 'crm.lead.create'
  | 'crm.lead.update';

export interface TasksListCacheEntry {
  id: string;
  companyId: number;
  filterKey: string;
  payloadJson: string;
  cachedAt: string;
}

export interface TaskDetailCacheEntry {
  id: string;
  companyId: number;
  taskId: string;
  payloadJson: string;
  cachedAt: string;
}

export interface MeetingsListCacheEntry {
  id: string;
  companyId: number;
  pageKey: string;
  payloadJson: string;
  cachedAt: string;
}

export interface MeetingDetailCacheEntry {
  id: string;
  companyId: number;
  meetingId: number;
  payloadJson: string;
  cachedAt: string;
}

export interface LeadsListCacheEntry {
  id: string;
  companyId: number;
  filterKey: string;
  payloadJson: string;
  cachedAt: string;
}

export interface LeadDetailCacheEntry {
  id: string;
  companyId: number;
  leadId: number;
  payloadJson: string;
  pending?: 0 | 1;
  cachedAt: string;
}

export interface CrmMetaCacheEntry {
  id: string;
  companyId: number;
  metaType: 'labels' | 'pipelines';
  payloadJson: string;
  cachedAt: string;
}

export interface OfflineActionQueueEntry {
  id?: number;
  actionType: OfflineActionType;
  payloadJson: string;
  companyId: number;
  userId: string;
  status: 'pending' | 'syncing' | 'failed' | 'conflict' | 'synced';
  attempts: number;
  nextAttemptAt: string | null;
  lastError: string | null;
  clientMutationId: string;
  createdAt: string;
  updatedAt: string;
}

export interface OfflineConflictEntry {
  id?: number;
  actionQueueId: number;
  actionType: OfflineActionType;
  companyId: number;
  userId: string;
  localPayloadJson: string;
  serverPayloadJson: string | null;
  message: string;
  resolution: 'pending' | 'keep_local' | 'keep_server' | 'merged';
  createdAt: string;
  resolvedAt: string | null;
}
