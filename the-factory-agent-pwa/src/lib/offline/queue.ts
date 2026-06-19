import { getDb } from '@/lib/db/client';
import type { OfflineActionQueueEntry, OfflineActionType } from '@/lib/db/schema';
import { appStore, getActiveCompanyId } from '@/lib/storage/stores';

export const SYNC_RETRY_DELAYS_MS = [0, 30_000, 120_000, 300_000, 900_000] as const;

type SyncCapableRegistration = ServiceWorkerRegistration & {
  sync?: { register: (tag: string) => Promise<void> };
};

function getCurrentUserId(): string | null {
  try {
    const raw = appStore.getString('auth_user');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: number | string };
    if (parsed.id == null) return null;
    return String(parsed.id);
  } catch {
    return null;
  }
}

function nextAttemptAtFromAttempts(attempts: number): string {
  const delay = SYNC_RETRY_DELAYS_MS[Math.min(attempts, SYNC_RETRY_DELAYS_MS.length - 1)];
  return new Date(Date.now() + delay).toISOString();
}

export type QueueOfflineActionInput = {
  actionType: OfflineActionType;
  payload: unknown;
  companyId?: number | null;
};

export async function queueOfflineAction({
  actionType,
  payload,
  companyId,
}: QueueOfflineActionInput): Promise<number | null> {
  const resolvedCompanyId = companyId ?? getActiveCompanyId();
  const userId = getCurrentUserId();
  if (!resolvedCompanyId || !userId) {
    return null;
  }

  const now = new Date().toISOString();
  const entry: OfflineActionQueueEntry = {
    actionType,
    payloadJson: JSON.stringify(payload ?? {}),
    companyId: resolvedCompanyId,
    userId,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
    clientMutationId: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };

  const db = await getDb();
  const id = await db.add('offlineActionQueue', entry);

  await requestBackgroundSync('offline-action-sync');
  return id;
}

export async function requestBackgroundSync(tag: string): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const registration = (await navigator.serviceWorker.ready) as SyncCapableRegistration;
    if (registration.sync) {
      await registration.sync.register(tag);
    }
  } catch {
    // No-op: background sync is best-effort.
  }
}

export type OfflineQueueStats = {
  pendingActions: number;
  pendingUploads: number;
  pendingLocations: number;
  pendingConflicts: number;
};

export async function getOfflineQueueStats(): Promise<OfflineQueueStats> {
  const resolvedCompanyId = getActiveCompanyId();
  const userId = getCurrentUserId();
  if (!resolvedCompanyId || !userId) {
    return {
      pendingActions: 0,
      pendingUploads: 0,
      pendingLocations: 0,
      pendingConflicts: 0,
    };
  }

  const db = await getDb();
  const actionRows = await db.getAllFromIndex(
    'offlineActionQueue',
    'by-company-user-status',
    [resolvedCompanyId, userId, 'pending'],
  );
  const failedRows = await db.getAllFromIndex(
    'offlineActionQueue',
    'by-company-user-status',
    [resolvedCompanyId, userId, 'failed'],
  );
  const syncingRows = await db.getAllFromIndex(
    'offlineActionQueue',
    'by-company-user-status',
    [resolvedCompanyId, userId, 'syncing'],
  );
  const uploadRows = await db.getAllFromIndex('proofQueue', 'by-uploaded', 0);
  const locationRows = await db.getAllFromIndex('locationQueue', 'by-synced', 0);
  const conflicts = await db.getAllFromIndex(
    'offlineConflicts',
    'by-company-user-resolution',
    [resolvedCompanyId, userId, 'pending'],
  );

  return {
    pendingActions: actionRows.length + failedRows.length + syncingRows.length,
    pendingUploads: uploadRows.length,
    pendingLocations: locationRows.length,
    pendingConflicts: conflicts.length,
  };
}

export function parseOfflinePayload<TPayload>(entry: OfflineActionQueueEntry): TPayload {
  return JSON.parse(entry.payloadJson) as TPayload;
}

export async function markOfflineActionSynced(id: number): Promise<void> {
  const db = await getDb();
  const existing = await db.get('offlineActionQueue', id);
  if (!existing) return;
  await db.put('offlineActionQueue', {
    ...existing,
    status: 'synced',
    updatedAt: new Date().toISOString(),
    lastError: null,
  });
}

export async function markOfflineActionRetry(
  id: number,
  previousAttempts: number,
  status: 'pending' | 'failed',
  lastError: string | null,
): Promise<void> {
  const db = await getDb();
  const existing = await db.get('offlineActionQueue', id);
  if (!existing) return;
  const attempts = previousAttempts + 1;
  await db.put('offlineActionQueue', {
    ...existing,
    status,
    attempts,
    nextAttemptAt: nextAttemptAtFromAttempts(attempts),
    lastError,
    updatedAt: new Date().toISOString(),
  });
}

export async function markOfflineActionSyncing(id: number): Promise<void> {
  const db = await getDb();
  const existing = await db.get('offlineActionQueue', id);
  if (!existing) return;
  await db.put('offlineActionQueue', {
    ...existing,
    status: 'syncing',
    updatedAt: new Date().toISOString(),
  });
}

export async function storeOfflineConflict(params: {
  actionQueueId: number;
  actionType: OfflineActionType;
  companyId: number;
  userId: string;
  localPayloadJson: string;
  serverPayloadJson?: string | null;
  message: string;
}): Promise<void> {
  const db = await getDb();
  await db.add('offlineConflicts', {
    actionQueueId: params.actionQueueId,
    actionType: params.actionType,
    companyId: params.companyId,
    userId: params.userId,
    localPayloadJson: params.localPayloadJson,
    serverPayloadJson: params.serverPayloadJson ?? null,
    message: params.message,
    resolution: 'pending',
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  });
}

export async function getRunnableOfflineActions(): Promise<OfflineActionQueueEntry[]> {
  const resolvedCompanyId = getActiveCompanyId();
  const userId = getCurrentUserId();
  if (!resolvedCompanyId || !userId) {
    return [];
  }

  const db = await getDb();
  const pendingRows = await db.getAllFromIndex(
    'offlineActionQueue',
    'by-company-user-status',
    [resolvedCompanyId, userId, 'pending'],
  );
  const failedRows = await db.getAllFromIndex(
    'offlineActionQueue',
    'by-company-user-status',
    [resolvedCompanyId, userId, 'failed'],
  );

  const now = Date.now();
  return [...pendingRows, ...failedRows]
    .filter((entry) => {
      if (!entry.nextAttemptAt) return true;
      return new Date(entry.nextAttemptAt).getTime() <= now;
    })
    .sort((a, b) => {
      if (a.createdAt === b.createdAt) return (a.id ?? 0) - (b.id ?? 0);
      return a.createdAt.localeCompare(b.createdAt);
    });
}

export type OfflineQueueListItem = OfflineActionQueueEntry & { id: number };

export async function listOfflineActionQueue(): Promise<OfflineQueueListItem[]> {
  const resolvedCompanyId = getActiveCompanyId();
  const userId = getCurrentUserId();
  if (!resolvedCompanyId || !userId) return [];

  const db = await getDb();
  const statuses = ['pending', 'syncing', 'failed', 'synced'] as const;
  const rows = await Promise.all(
    statuses.map((status) =>
      db.getAllFromIndex('offlineActionQueue', 'by-company-user-status', [
        resolvedCompanyId,
        userId,
        status,
      ]),
    ),
  );

  return rows
    .flat()
    .filter((entry): entry is OfflineQueueListItem => entry.id != null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function retryOfflineAction(id: number): Promise<void> {
  const db = await getDb();
  const row = await db.get('offlineActionQueue', id);
  if (!row) return;

  const now = new Date().toISOString();
  await db.put('offlineActionQueue', {
    ...row,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
    updatedAt: now,
  });

  await requestBackgroundSync('offline-action-sync');
}

export function describeOfflineAction(entry: OfflineActionQueueEntry): string {
  switch (entry.actionType) {
    case 'task.update_status':
      return 'Update task status';
    case 'task.complete':
      return 'Complete task';
    case 'project.create':
      return 'Create project';
    case 'project.update':
      return 'Edit project';
    case 'project.update_status':
      return 'Update project status';
    case 'meeting.create':
      return 'Schedule meeting';
    case 'meeting.update':
      return 'Edit meeting';
    case 'meeting.cancel':
      return 'Cancel meeting';
    case 'attendance.clock_in':
      return 'Clock in';
    case 'attendance.clock_out':
      return 'Clock out';
    case 'location.create':
      return 'Save location';
    case 'location.update':
      return 'Edit location';
    case 'location.delete':
      return 'Delete location';
    default:
      return entry.actionType;
  }
}

export async function listPendingConflicts() {
  const resolvedCompanyId = getActiveCompanyId();
  const userId = getCurrentUserId();
  if (!resolvedCompanyId || !userId) return [];

  const db = await getDb();
  return db.getAllFromIndex(
    'offlineConflicts',
    'by-company-user-resolution',
    [resolvedCompanyId, userId, 'pending'],
  );
}

export async function resolveOfflineConflict(
  conflictId: number,
  resolution: 'keep_local' | 'keep_server' | 'merged',
): Promise<void> {
  const db = await getDb();
  const conflict = await db.get('offlineConflicts', conflictId);
  if (!conflict) return;

  const action = await db.get('offlineActionQueue', conflict.actionQueueId);
  const now = new Date().toISOString();

  if (action) {
    if (resolution === 'keep_server') {
      await db.put('offlineActionQueue', {
        ...action,
        status: 'synced',
        nextAttemptAt: null,
        lastError: 'Conflict resolved by keeping server version.',
        updatedAt: now,
      });
    } else {
      await db.put('offlineActionQueue', {
        ...action,
        status: 'pending',
        attempts: 0,
        nextAttemptAt: now,
        lastError:
          resolution === 'merged'
            ? 'Conflict marked as merged. Pending replay.'
            : 'Conflict resolved by keeping local version.',
        updatedAt: now,
      });
    }
  }

  await db.put('offlineConflicts', {
    ...conflict,
    resolution,
    resolvedAt: now,
  });
}

