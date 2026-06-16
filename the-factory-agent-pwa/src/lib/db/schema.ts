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
}

export interface ProofQueueEntry {
  id?: number;
  taskId: number;
  fileBlob: Blob; // IndexedDB can store Blobs directly (unlike SQLite file URIs)
  fileName: string;
  mimeType: string;
  uploaded: 0 | 1; // 0 = pending, 1 = uploaded
  createdAt: string;
}

export interface TaskDestinationCacheEntry {
  id?: number;
  taskId: number;
  destinationLatitude: number;
  destinationLongitude: number;
  radiusMeters: number;
  cachedAt: number;
}
