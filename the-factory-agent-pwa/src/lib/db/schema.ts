/**
 * IndexedDB schema types — mirrors mobile app's drizzle schema.
 */

export interface LocationQueueEntry {
  id?: number; // Auto-incremented by IndexedDB
  taskId: number;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  speedMps: number | null;
  headingDegrees: number | null;
  recordedAt: string;
  synced: 0 | 1; // 0 = pending, 1 = sent
  attempts?: number;
  nextAttemptAt?: string | null;
  lastError?: string | null;
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

export interface TaskDestinationCacheEntry {
  id?: number;
  taskId: number;
  destinationLatitude: number;
  destinationLongitude: number;
  radiusMeters: number;
  cachedAt: number;
}

export type OfflineActionType =
  | 'task.update_status'
  | 'task.complete'
  | 'project.create'
  | 'project.update'
  | 'project.update_status'
  | 'meeting.create'
  | 'meeting.update'
  | 'meeting.cancel'
  | 'attendance.clock_in'
  | 'attendance.clock_out';

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
