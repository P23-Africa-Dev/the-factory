import { client } from '@/lib/api/client';
import { getDb } from '@/lib/db/client';
import type { StopAttachmentQueueEntry } from '@/lib/db/schema';
import { queueOfflineAction } from '@/lib/offline/queue';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { compressImage } from '@/lib/media/compressImage';
import type { ApiError } from '@/types';
import type { ManualStopInput, ReportStop, StopAttachment, StopRecordInput, TripReport } from './types';

function unwrap<T>(raw: unknown): T {
  const wrapped = raw as { data?: unknown };
  return (wrapped?.data === undefined ? raw : wrapped.data) as T;
}

/** Offline, or the server could not be reached: keep it on the phone and sync later. */
export function isOfflineError(error: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true;
  const status = (error as ApiError)?.status;
  return status === 0 || status === undefined || status >= 500;
}

const company = () => getActiveCompanyId() ?? undefined;

export const tripReportApi = {
  get: async (tripId: number): Promise<TripReport> => {
    const res = await client.get(`/field-trips/${tripId}/report`, { params: { company_id: company(), _t: Date.now() } });
    return unwrap<TripReport>(res.data);
  },

  due: async (): Promise<{ policy: 'required' | 'optional'; trips: Array<{ id: number; pending_stop_count: number; ended_at: string | null }> }> => {
    const res = await client.get('/field-trips/reports/due', { params: { company_id: company(), _t: Date.now() } });
    return unwrap(res.data);
  },

  /** Save a stop's record. Offline → queued (returns null; the caller keeps its optimistic copy). */
  record: async (stopId: number, input: StopRecordInput): Promise<ReportStop | null> => {
    try {
      const res = await client.put(`/field-trips/stops/${stopId}/record`, { company_id: company(), ...input });
      return unwrap<{ stop: ReportStop }>(res.data).stop;
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      await queueOfflineAction({ actionType: 'field_trip.record_stop', payload: { stop_id: stopId, company_id: company(), ...input } });
      return null;
    }
  },

  /** A stop the system missed (with its record). Offline → queued; idempotent on client_stop_id. */
  addStop: async (tripId: number, input: ManualStopInput): Promise<ReportStop | null> => {
    try {
      const res = await client.post(`/field-trips/${tripId}/stops`, { company_id: company(), ...input });
      return unwrap<{ stop: ReportStop }>(res.data).stop;
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      await queueOfflineAction({ actionType: 'field_trip.add_stop', payload: { trip_id: tripId, company_id: company(), ...input } });
      return null;
    }
  },

  deleteStop: async (stopId: number): Promise<void> => {
    try {
      await client.delete(`/field-trips/stops/${stopId}`, { params: { company_id: company() } });
    } catch (error) {
      if (!isOfflineError(error)) throw error;
      await queueOfflineAction({ actionType: 'field_trip.delete_stop', payload: { stop_id: stopId, company_id: company() } });
    }
  },

  submit: async (tripId: number): Promise<TripReport> => {
    const res = await client.post(`/field-trips/${tripId}/report/submit`, { company_id: company() });
    return unwrap<TripReport>(res.data);
  },

  deleteAttachment: async (attachmentId: number): Promise<void> => {
    await client.delete(`/field-trips/attachments/${attachmentId}`, { params: { company_id: company() } });
  },

  /** Authenticated download (no public URLs) → blob for previews / opening. */
  attachmentBlob: async (attachmentId: number): Promise<Blob> => {
    const res = await client.get(`/field-trips/attachments/${attachmentId}`, {
      params: { company_id: company() },
      responseType: 'blob',
    });
    return res.data as Blob;
  },
};

// ── Attachments: always saved on the phone first, then uploaded ────────────

export function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `c-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Compress (photos), store in IndexedDB and try to upload right away. Returns
 * the queued entry so the form can show it immediately, even offline.
 */
export async function queueStopAttachment(input: {
  tripId: number;
  stopId: number | null;
  clientStopId?: string | null;
  file: File;
  caption?: string | null;
}): Promise<StopAttachmentQueueEntry> {
  const file = await compressImage(input.file);
  const entry: StopAttachmentQueueEntry = {
    companyId: getActiveCompanyId() ?? null,
    tripId: input.tripId,
    stopId: input.stopId,
    clientStopId: input.clientStopId ?? null,
    clientAttachmentId: newClientId(),
    fileBlob: file,
    fileName: file.name || 'attachment',
    mimeType: file.type || 'application/octet-stream',
    caption: input.caption ?? null,
    capturedAt: new Date().toISOString(),
    uploaded: 0,
    createdAt: new Date().toISOString(),
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
  };
  const db = await getDb();
  entry.id = (await db.add('stopAttachmentQueue', entry)) as number;
  void uploadQueuedStopAttachments().catch(() => {});
  return entry;
}

export async function pendingAttachmentsFor(tripId: number): Promise<StopAttachmentQueueEntry[]> {
  const db = await getDb();
  return (await db.getAllFromIndex('stopAttachmentQueue', 'by-trip', tripId)).filter((e) => e.uploaded === 0);
}

export async function removeQueuedAttachment(id: number): Promise<void> {
  const db = await getDb();
  await db.delete('stopAttachmentQueue', id);
}

/** A stop added on the phone was saved: upload its files now instead of waiting for the retry delay. */
export async function retryAttachmentsFor(clientStopId: string): Promise<void> {
  const db = await getDb();
  const all = await db.getAllFromIndex('stopAttachmentQueue', 'by-uploaded', 0);
  for (const e of all) {
    if (e.clientStopId === clientStopId && e.nextAttemptAt) await db.put('stopAttachmentQueue', { ...e, nextAttemptAt: null });
  }
  await uploadQueuedStopAttachments();
}

const RETRY_MS = [0, 30_000, 120_000, 600_000, 1_800_000];
let uploading = false;
let rerunRequested = false;

/** Upload everything queued (called after saving, on reconnect and by the sync engine). */
export async function uploadQueuedStopAttachments(): Promise<number> {
  if (uploading) {
    rerunRequested = true;
    return 0;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) return 0;
  uploading = true;
  let done = 0;
  try {
    const db = await getDb();
    const pending = (await db.getAllFromIndex('stopAttachmentQueue', 'by-uploaded', 0)).filter(
      (e) => !e.nextAttemptAt || Date.parse(e.nextAttemptAt) <= Date.now(),
    );
    const stopIdsByClient = new Map<string, number>();
    for (const entry of pending) {
      try {
        let stopId = entry.stopId;
        if (!stopId && entry.clientStopId) {
          // The stop was added offline: find its server id once it has synced.
          if (!stopIdsByClient.has(entry.clientStopId)) {
            const report = await tripReportApi.get(entry.tripId);
            report.stops.forEach((s) => s.client_stop_id && stopIdsByClient.set(s.client_stop_id, s.id));
          }
          stopId = stopIdsByClient.get(entry.clientStopId) ?? null;
          if (!stopId) throw Object.assign(new Error('Stop not synced yet'), { status: 0 });
        }
        const form = new FormData();
        const cid = entry.companyId ?? getActiveCompanyId();
        if (cid) form.append('company_id', String(cid));
        form.append('file', new File([entry.fileBlob], entry.fileName, { type: entry.mimeType }));
        form.append('client_attachment_id', entry.clientAttachmentId);
        form.append('captured_at', entry.capturedAt);
        if (entry.caption) form.append('caption', entry.caption);
        await client.post(`/field-trips/stops/${stopId}/attachments`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 120_000,
          suppressErrorToast: true,
        });
        // Uploaded: drop the blob from the phone.
        await db.delete('stopAttachmentQueue', entry.id as number);
        done++;
      } catch (error) {
        const attempts = (entry.attempts ?? 0) + 1;
        const status = (error as ApiError)?.status;
        if (status === 422 || status === 404) {
          // Refused for good (wrong type, too many files, stop removed): keep the
          // error visible on the stop instead of retrying forever.
          await db.put('stopAttachmentQueue', { ...entry, attempts, lastError: (error as ApiError)?.message ?? 'Rejected', nextAttemptAt: new Date(Date.now() + 86_400_000).toISOString() });
          continue;
        }
        await db.put('stopAttachmentQueue', {
          ...entry,
          attempts,
          lastError: (error as Error)?.message ?? 'Upload failed',
          nextAttemptAt: new Date(Date.now() + RETRY_MS[Math.min(attempts, RETRY_MS.length - 1)]).toISOString(),
        });
      }
    }
  } finally {
    uploading = false;
  }
  // Files added while this run was uploading: send them now, not at the next sync.
  if (rerunRequested) {
    rerunRequested = false;
    done += await uploadQueuedStopAttachments();
  }
  return done;
}

/** A queued entry as the form shows it. */
export function queuedToAttachment(entry: StopAttachmentQueueEntry): StopAttachment {
  return {
    id: -(entry.id ?? 0),
    client_attachment_id: entry.clientAttachmentId,
    field_stop_id: entry.stopId ?? 0,
    mime_type: entry.mimeType,
    size_bytes: entry.fileBlob.size,
    original_name: entry.fileName,
    caption: entry.caption,
    is_image: entry.mimeType.startsWith('image/'),
    captured_at: entry.capturedAt,
    url: '',
    pending: true,
    localUrl: typeof URL !== 'undefined' && URL.createObjectURL ? URL.createObjectURL(entry.fileBlob) : undefined,
  };
}
