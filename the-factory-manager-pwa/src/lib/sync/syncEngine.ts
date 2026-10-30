import type { ApiError } from '@/types';
import { client } from '@/lib/api/client';
import { getDb } from '@/lib/db/client';
import type {
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
import { leadSchema } from '@/features/crm/schema';
import { putCachedLeadDetail, remapLeadId } from '@/features/crm/cache';
import { queryClient } from '@/lib/queryClient';
import { taskKeys } from '@/features/tasks/queryKeys';
import { meetingKeys } from '@/features/meetings/queryKeys';
import { crmKeys } from '@/features/crm/queryKeys';
import { locationKeys } from '@/features/locations/queryKeys';
import { setShowingCachedData } from '@/lib/offline/cacheIndicator';

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
    const id = appStore.getString('user_id');
    if (id) return id;
    const raw = appStore.getString('auth_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: string | number };
    return parsed.id != null ? String(parsed.id) : null;
  } catch {
    return null;
  }
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
  // Managers do not broadcast agent background GPS queues; no-op for API compatibility.
}

async function syncProofQueue(): Promise<void> {
  // Managers review proofs rather than uploading field completion photos; no-op for API compatibility.
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
        assigned_to_user_id?: number | null;
      }>(entry);
      await client.post(
        '/admin/tasks',
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
        `/admin/tasks/${payload.id}`,
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
      }>(entry);
      await client.patch(
        `/admin/tasks/${payload.taskId}`,
        {
          status: 'completed',
          company_id: payload.company_id ?? getActiveCompanyId() ?? undefined,
        },
        BACKGROUND_REQUEST,
      );
      return;
    }
    case 'project.create': {
      const payload = parseOfflinePayload<Record<string, unknown>>(entry);
      await client.post('/admin/projects', payload, BACKGROUND_REQUEST);
      return;
    }
    case 'project.update': {
      const payload = parseOfflinePayload<{ id: string | number; body: Record<string, unknown> }>(entry);
      await client.patch(`/admin/projects/${payload.id}`, payload.body, BACKGROUND_REQUEST);
      return;
    }
    case 'project.update_status': {
      const payload = parseOfflinePayload<{ id: string | number; status: string }>(entry);
      await client.patch(`/admin/projects/${payload.id}`, { status: payload.status }, BACKGROUND_REQUEST);
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
    case 'attendance.clock_in':
    case 'attendance.clock_out':
    case 'field_activity.classify_stop': {
      // Legacy agent-only offline actions — mark synced safely if any exist
      return;
    }
    case 'location.create': {
      const payload = parseOfflinePayload<Record<string, unknown>>(entry);
      await client.post(
        '/admin/locations',
        {
          ...payload,
          company_id: payload.company_id ?? getActiveCompanyId() ?? undefined,
        },
        BACKGROUND_REQUEST,
      );
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
      const response = await client.post('/admin/crm/leads', payload.body, BACKGROUND_REQUEST);
      const lead = leadSchema.parse(unwrapCrmLead(response.data));
      if (payload.tempId < 0) {
        await remapLeadId(entry.companyId, payload.tempId, lead);
      }
      return;
    }
    case 'crm.lead.update': {
      const payload = parseOfflinePayload<{ id: number | string; body: Record<string, unknown> }>(entry);
      const response = await client.patch(
        `/admin/crm/leads/${payload.id}`,
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

  if (pendingActions.length > 0 || failedActions.length > 0) {
    await requestBackgroundSync('offline-action-sync');
  }
}

async function hasRunnableSyncWork(): Promise<boolean> {
  const actions = await getRunnableOfflineActions();
  return actions.length > 0;
}

async function syncAll(): Promise<void> {
  if (syncInFlight) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;
  if (isPoorConnection()) return;

  setSyncInFlight(true);
  try {
    const hadWork = await hasRunnableSyncWork();
    await syncOfflineActionQueue();
    if (hadWork) {
      await invalidateSyncedQueries();
    }
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
  },
  syncAll,
  subscribeSyncStatus,
  getIsSyncing,
};
