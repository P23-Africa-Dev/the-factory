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
import { buildCompleteFormData } from '@/features/tracking/completeTaskForm';
import { leadSchema } from '@/features/crm/schema';
import { putCachedLeadDetail, remapLeadId } from '@/features/crm/cache';
import { queryClient } from '@/lib/queryClient';
import { taskKeys } from '@/features/tasks/queryKeys';
import { meetingKeys } from '@/features/meetings/queryKeys';
import { crmKeys } from '@/features/crm/queryKeys';
import { locationKeys } from '@/features/locations/queryKeys';
import { setShowingCachedData } from '@/lib/offline/cacheIndicator';

const MAX_BATCH_SIZE = 50;
const RETRY_DELAYS_MS = [0, 30_000, 120_000, 300_000, 900_000] as const;
const BACKGROUND_REQUEST = { suppressErrorToast: true };

let syncInFlight = false;
type SyncStatusListener = (syncing: boolean) => void;
const syncStatusListeners = new Set<SyncStatusListener>();

function setSyncInFlight(value: boolean): void {
  syncInFlight = value;
  syncStatusListeners.forEach((listener) => listener(value));
}

function unwrapCrmLead(raw: unknown): unknown {
  const wrapped = raw as Record<string, unknown>;
  const data = (wrapped?.data as Record<string, unknown>) ?? wrapped;
  return data?.lead ?? data;
}

async function invalidateSyncedQueries(): Promise<void> {
  setShowingCachedData(false);
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: taskKeys.all }),
    queryClient.invalidateQueries({ queryKey: meetingKeys.all }),
    queryClient.invalidateQueries({ queryKey: crmKeys.all }),
    queryClient.invalidateQueries({ queryKey: locationKeys.lists() }),
  ]);
}

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
      await client.post(
        `/agent/tasks/${taskId}/location`,
        {
          company_id: companyId,
          points: batch.map((r) => ({
            latitude: r.latitude,
            longitude: r.longitude,
            accuracy_meters: r.accuracyMeters ?? null,
            speed_mps: r.speedMps ?? null,
            heading_degrees: r.headingDegrees ?? null,
            recorded_at: r.recordedAt,
          })),
        },
        BACKGROUND_REQUEST,
      );

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
        ...BACKGROUND_REQUEST,
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
    case 'task.create_self': {
      const payload = parseOfflinePayload<{
        company_id?: number;
        title: string;
        type?: string;
        description?: string;
        location?: string;
        address?: string;
        latitude?: number;
        longitude?: number;
        due_date?: string;
        required_actions?: string[];
        priority?: string;
        minimum_photos_required?: number;
        visit_verification_required?: boolean;
      }>(entry);
      await client.post(
        '/agent/tasks/self',
        {
          ...payload,
          company_id: payload.company_id ?? getActiveCompanyId() ?? undefined,
        },
        BACKGROUND_REQUEST,
      );
      return;
    }
    case 'task.update_status': {
      const payload = parseOfflinePayload<{ id: string | number; status: string; company_id?: number }>(entry);
      await client.patch(
        `/agent/tasks/${payload.id}/status`,
        {
          status: payload.status,
          company_id: payload.company_id ?? getActiveCompanyId() ?? undefined,
        },
        BACKGROUND_REQUEST,
      );
      return;
    }
    case 'task.complete': {
      const payload = parseOfflinePayload<{
        taskId: number;
        company_id?: number;
        notes?: string;
        latitude: number;
        longitude: number;
        accuracy_meters?: number | null;
        recorded_at?: string;
      }>(entry);
      const db = await getDb();
      const pendingProofs = await db.getAllFromIndex('proofQueue', 'by-uploaded', 0);
      const taskProofs = pendingProofs.filter((p) => p.taskId === payload.taskId);
      const files = taskProofs.map(
        (p) => new File([p.fileBlob], p.fileName, { type: p.mimeType }),
      );
      if (files.length === 0) {
        throw new Error('Proof photos required to complete task offline sync.');
      }
      const formData = buildCompleteFormData({
        companyId: payload.company_id ?? getActiveCompanyId() ?? 0,
        files,
        notes: payload.notes,
        position: {
          latitude: payload.latitude,
          longitude: payload.longitude,
          accuracyMeters: payload.accuracy_meters,
          recordedAt: payload.recorded_at,
        },
      });
      await client.post(`/agent/tasks/${payload.taskId}/complete`, formData, {
        ...BACKGROUND_REQUEST,
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      for (const proof of taskProofs) {
        if (proof.id != null) {
          await db.put('proofQueue', {
            ...proof,
            uploaded: 1,
            attempts: 0,
            nextAttemptAt: null,
            lastError: null,
          });
        }
      }
      return;
    }
    case 'project.create': {
      const payload = parseOfflinePayload<Record<string, unknown>>(entry);
      await client.post('/projects', payload, BACKGROUND_REQUEST);
      return;
    }
    case 'project.update': {
      const payload = parseOfflinePayload<{ id: string | number; body: Record<string, unknown> }>(entry);
      await client.patch(`/projects/${payload.id}`, payload.body, BACKGROUND_REQUEST);
      return;
    }
    case 'project.update_status': {
      const payload = parseOfflinePayload<{ id: string | number; status: string }>(entry);
      await client.patch(`/projects/${payload.id}`, { status: payload.status }, BACKGROUND_REQUEST);
      return;
    }
    case 'meeting.create': {
      const payload = parseOfflinePayload<Record<string, unknown>>(entry);
      await client.post('/meetings', payload, BACKGROUND_REQUEST);
      return;
    }
    case 'meeting.update': {
      const payload = parseOfflinePayload<{ id: string | number; body: Record<string, unknown> }>(entry);
      await client.patch(`/meetings/${payload.id}`, payload.body, BACKGROUND_REQUEST);
      return;
    }
    case 'meeting.cancel': {
      const payload = parseOfflinePayload<{ id: string | number; company_id?: number }>(entry);
      await client.post(
        `/meetings/${payload.id}/cancel`,
        { company_id: payload.company_id },
        BACKGROUND_REQUEST,
      );
      return;
    }
    case 'attendance.clock_in': {
      const payload = parseOfflinePayload<Record<string, unknown>>(entry);
      await client.post('/agent/attendance/clock-in', payload, BACKGROUND_REQUEST);
      return;
    }
    case 'attendance.clock_out': {
      const payload = parseOfflinePayload<Record<string, unknown>>(entry);
      await client.post('/agent/attendance/clock-out', payload, BACKGROUND_REQUEST);
      return;
    }
    case 'location.create': {
      const payload = parseOfflinePayload<Record<string, unknown>>(entry);
      await client.post(
        '/agent/locations',
        {
          ...payload,
          company_id: payload.company_id ?? getActiveCompanyId() ?? undefined,
        },
        BACKGROUND_REQUEST,
      );
      // Drop optimistic offline rows; the next list fetch repopulates from server.
      const companyId = entry.companyId ?? getActiveCompanyId();
      if (companyId != null) {
        try {
          const db = await getDb();
          const pending = await db.getAllFromIndex('savedLocationsCache', 'by-company', companyId);
          const tx = db.transaction('savedLocationsCache', 'readwrite');
          for (const row of pending) {
            if (row.pending === 1 && row.id != null) {
              await tx.store.delete(row.id);
            }
          }
          await tx.done;
        } catch {
          // Cache cleanup is best-effort.
        }
      }
      return;
    }
    case 'location.update': {
      const payload = parseOfflinePayload<{ id: number; body: Record<string, unknown> }>(entry);
      await client.put(
        `/admin/locations/${payload.id}`,
        {
          ...payload.body,
          company_id: payload.body.company_id ?? getActiveCompanyId() ?? undefined,
        },
        BACKGROUND_REQUEST,
      );
      return;
    }
    case 'location.delete': {
      const payload = parseOfflinePayload<{ id: number; company_id?: number }>(entry);
      await client.delete(`/admin/locations/${payload.id}`, {
        ...BACKGROUND_REQUEST,
        params: { company_id: payload.company_id ?? getActiveCompanyId() ?? undefined },
      });
      return;
    }
    case 'crm.lead.create': {
      const payload = parseOfflinePayload<{ tempId: number; body: Record<string, unknown> }>(entry);
      const response = await client.post('/agent/crm/leads', payload.body, BACKGROUND_REQUEST);
      const lead = leadSchema.parse(unwrapCrmLead(response.data));
      if (payload.tempId < 0) {
        await remapLeadId(entry.companyId, payload.tempId, lead);
      }
      return;
    }
    case 'crm.lead.update': {
      const payload = parseOfflinePayload<{ id: number | string; body: Record<string, unknown> }>(entry);
      const response = await client.patch(
        `/agent/crm/leads/${payload.id}`,
        payload.body,
        BACKGROUND_REQUEST,
      );
      const lead = leadSchema.parse(unwrapCrmLead(response.data));
      await putCachedLeadDetail(entry.companyId, lead, 0);
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

  setSyncInFlight(true);
  try {
    await syncProofQueue();
    await syncOfflineActionQueue();
    await syncLocationQueue();
    await invalidateSyncedQueries();
  } finally {
    setSyncInFlight(false);
    await scheduleNextSyncIfNeeded();
  }
}

export function subscribeSyncStatus(listener: SyncStatusListener): () => void {
  syncStatusListeners.add(listener);
  listener(syncInFlight);
  return () => {
    syncStatusListeners.delete(listener);
  };
}

export function getIsSyncing(): boolean {
  return syncInFlight;
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
  subscribeSyncStatus,
  getIsSyncing,
};
