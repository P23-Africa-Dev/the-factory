import type { ApiError } from '@/types';
import { client } from '@/lib/api/client';
import { getDb } from '@/lib/db/client';
import type {
  LocationQueueEntry,
  OfflineActionQueueEntry,
} from '@/lib/db/schema';
import {
  getRunnableOfflineActions,
  markOfflineActionRetry,
  markOfflineActionSynced,
  markOfflineActionSyncing,
  parseOfflinePayload,
  requestBackgroundSync,
  storeOfflineConflict,
} from '@/lib/offline/queue';
import { getActiveCompanyId, appStore } from '@/lib/storage/stores';
import { toast } from '@/lib/toast';

const MAX_BATCH_SIZE = 50;
const RETRY_DELAYS_MS = [0, 30_000, 120_000, 300_000, 900_000] as const;

let syncInFlight = false;

function getCurrentUserId(): string | null {
  try {
    const raw = appStore.getString('auth_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string | number };
    return parsed.id != null ? String(parsed.id) : null;
  } catch {
    return null;
  }
}

function canRunNow(nextAttemptAt?: string | null): boolean {
  if (!nextAttemptAt) return true;
  return new Date(nextAttemptAt).getTime() <= Date.now();
}

function buildNextAttemptIso(attempts: number): string {
  const delay = RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length - 1)];
  return new Date(Date.now() + delay).toISOString();
}

function isConflictError(err: ApiError): boolean {
  return err.status === 409;
}

function isPoorConnection(): boolean {
  if (typeof navigator === 'undefined' || !('connection' in navigator)) {
    return false;
  }
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string };
  }).connection;
  const quality = connection?.effectiveType;
  return quality === 'slow-2g';
}

async function syncLocationQueue(): Promise<void> {
  const companyId = getActiveCompanyId();
  if (!companyId) return;

  const db = await getDb();
  const pending = await db.getAllFromIndex('locationQueue', 'by-synced', 0);
  const runnable = pending.filter((item) => canRunNow(item.nextAttemptAt));
  if (runnable.length === 0) return;

  const byTask = runnable.reduce<Record<number, LocationQueueEntry[]>>((acc, row) => {
    const existing = acc[row.taskId];
    if (existing) existing.push(row);
    else acc[row.taskId] = [row];
    return acc;
  }, {});

  for (const [taskIdRaw, rows] of Object.entries(byTask)) {
    const taskId = Number(taskIdRaw);
    const batch = rows.slice(0, MAX_BATCH_SIZE);
    try {
      await client.post(`/agent/tasks/${taskId}/location`, {
        company_id: companyId,
        points: batch.map((r) => ({
          latitude: r.latitude,
          longitude: r.longitude,
          accuracy_meters: r.accuracyMeters ?? null,
          speed_mps: r.speedMps ?? null,
          heading_degrees: r.headingDegrees ?? null,
          recorded_at: r.recordedAt,
        })),
      });

      const tx = db.transaction('locationQueue', 'readwrite');
      for (const row of batch) {
        if (row.id != null) {
          await tx.store.put({
            ...row,
            synced: 1,
            attempts: 0,
            nextAttemptAt: null,
            lastError: null,
          });
        }
      }
      await tx.done;
    } catch (error) {
      const apiError = error as ApiError;
      const is422 = apiError.status === 422;

      const tx = db.transaction('locationQueue', 'readwrite');
      for (const row of batch) {
        if (row.id != null) {
          if (is422) {
            await tx.store.put({
              ...row,
              synced: 1,
              attempts: row.attempts ?? 0,
              nextAttemptAt: null,
              lastError: apiError.message ?? null,
            });
          } else {
            const attempts = (row.attempts ?? 0) + 1;
            await tx.store.put({
              ...row,
              attempts,
              nextAttemptAt: buildNextAttemptIso(attempts),
              lastError: apiError.message ?? 'Location sync failed',
            });
          }
        }
      }
      await tx.done;

      if (is422) {
        const msg =
          apiError.errors?.authorization?.[0] ??
          apiError.message ??
          'You can only track tasks currently assigned to you.';
        toast.error('Tracking Stopped', msg);
      }
    }
  }
}

async function syncProofQueue(): Promise<void> {
  const db = await getDb();
  const pending = await db.getAllFromIndex('proofQueue', 'by-uploaded', 0);
  const runnable = pending.filter((item) => canRunNow(item.nextAttemptAt));
  if (runnable.length === 0) return;

  for (const proof of runnable) {
    try {
      const formData = new FormData();
      formData.append(
        'photo',
        new File([proof.fileBlob], proof.fileName, { type: proof.mimeType }),
      );

      await client.post(`/agent/tasks/${proof.taskId}/proofs`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (proof.id != null) {
        await db.put('proofQueue', {
          ...proof,
          uploaded: 1,
          attempts: 0,
          nextAttemptAt: null,
          lastError: null,
        });
      }
    } catch (error) {
      if (proof.id != null) {
        const attempts = (proof.attempts ?? 0) + 1;
        await db.put('proofQueue', {
          ...proof,
          attempts,
          nextAttemptAt: buildNextAttemptIso(attempts),
          lastError: (error as ApiError).message ?? 'Proof upload failed',
        });
      }
    }
  }
}

async function executeOfflineAction(entry: OfflineActionQueueEntry): Promise<void> {
  switch (entry.actionType) {
    case 'task.update_status': {
      const payload = parseOfflinePayload<{ id: string | number; status: string; company_id?: number }>(entry);
      await client.patch(`/agent/tasks/${payload.id}/status`, {
        status: payload.status,
        company_id: payload.company_id ?? getActiveCompanyId() ?? undefined,
      });
      return;
    }
    case 'task.complete': {
      const payload = parseOfflinePayload<{
        taskId: number;
        company_id?: number;
        notes?: string;
      }>(entry);
      const formData = new FormData();
      if (payload.company_id != null) {
        formData.append('company_id', String(payload.company_id));
      }
      formData.append('notes', payload.notes ?? '');
      await client.post(`/agent/tasks/${payload.taskId}/complete`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return;
    }
    case 'project.create': {
      const payload = parseOfflinePayload<Record<string, unknown>>(entry);
      await client.post('/projects', payload);
      return;
    }
    case 'project.update': {
      const payload = parseOfflinePayload<{ id: string | number; body: Record<string, unknown> }>(entry);
      await client.patch(`/projects/${payload.id}`, payload.body);
      return;
    }
    case 'project.update_status': {
      const payload = parseOfflinePayload<{ id: string | number; status: string }>(entry);
      await client.patch(`/projects/${payload.id}`, { status: payload.status });
      return;
    }
    case 'meeting.create': {
      const payload = parseOfflinePayload<Record<string, unknown>>(entry);
      await client.post('/meetings', payload);
      return;
    }
    case 'meeting.update': {
      const payload = parseOfflinePayload<{ id: string | number; body: Record<string, unknown> }>(entry);
      await client.patch(`/meetings/${payload.id}`, payload.body);
      return;
    }
    case 'meeting.cancel': {
      const payload = parseOfflinePayload<{ id: string | number; company_id?: number }>(entry);
      await client.post(`/meetings/${payload.id}/cancel`, {
        company_id: payload.company_id,
      });
      return;
    }
    case 'attendance.clock_in': {
      const payload = parseOfflinePayload<Record<string, unknown>>(entry);
      await client.post('/agent/attendance/clock-in', payload);
      return;
    }
    case 'attendance.clock_out': {
      const payload = parseOfflinePayload<Record<string, unknown>>(entry);
      await client.post('/agent/attendance/clock-out', payload);
      return;
    }
  }
}

async function syncOfflineActionQueue(): Promise<void> {
  const runnable = await getRunnableOfflineActions();
  if (runnable.length === 0) return;

  const userId = getCurrentUserId();
  if (!userId) return;

  for (const entry of runnable) {
    if (entry.id == null) continue;
    await markOfflineActionSyncing(entry.id);

    try {
      await executeOfflineAction(entry);
      await markOfflineActionSynced(entry.id);
    } catch (error) {
      const apiError = error as ApiError;

      if (isConflictError(apiError)) {
        await storeOfflineConflict({
          actionQueueId: entry.id,
          actionType: entry.actionType,
          companyId: entry.companyId,
          userId: entry.userId,
          localPayloadJson: entry.payloadJson,
          serverPayloadJson: null,
          message: apiError.message ?? 'Conflict detected while syncing offline action.',
        });
        await markOfflineActionRetry(entry.id, entry.attempts, 'failed', apiError.message ?? 'Conflict');
        toast.warning(
          'Sync conflict detected',
          'Choose Keep Local, Keep Server, or Merge from the conflict center.',
        );
        continue;
      }

      const nextStatus: 'pending' | 'failed' =
        entry.attempts + 1 >= RETRY_DELAYS_MS.length ? 'failed' : 'pending';
      await markOfflineActionRetry(
        entry.id,
        entry.attempts,
        nextStatus,
        apiError.message ?? 'Offline action sync failed',
      );
    }
  }
}

async function scheduleNextSyncIfNeeded(): Promise<void> {
  const db = await getDb();
  const pendingActions = await db.getAllFromIndex('offlineActionQueue', 'by-status', 'pending');
  const failedActions = await db.getAllFromIndex('offlineActionQueue', 'by-status', 'failed');
  const pendingUploads = await db.getAllFromIndex('proofQueue', 'by-uploaded', 0);
  const pendingLocations = await db.getAllFromIndex('locationQueue', 'by-synced', 0);

  if (
    pendingActions.length > 0 ||
    failedActions.length > 0 ||
    pendingUploads.length > 0 ||
    pendingLocations.length > 0
  ) {
    await requestBackgroundSync('offline-action-sync');
    await requestBackgroundSync('location-sync');
    await requestBackgroundSync('proof-sync');
  }
}

async function syncAll(): Promise<void> {
  if (syncInFlight) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (isPoorConnection()) return;

  syncInFlight = true;
  try {
    await syncProofQueue();
    await syncOfflineActionQueue();
    await syncLocationQueue();
  } finally {
    syncInFlight = false;
    await scheduleNextSyncIfNeeded();
  }
}

export const syncEngine = {
  syncLocationQueue,
  syncProofQueue,
  syncOfflineActionQueue,
  scheduleSync: async (): Promise<void> => {
    await requestBackgroundSync('offline-action-sync');
    await requestBackgroundSync('location-sync');
    await requestBackgroundSync('proof-sync');
  },
  syncAll,
};
