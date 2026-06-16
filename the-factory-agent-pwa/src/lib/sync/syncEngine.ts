/**
 * Sync engine — all background sync logic lives here.
 * Ported from mobile app's src/lib/sync/syncEngine.ts.
 *
 * Key changes:
 * - drizzle ORM queries → IndexedDB transactions via `idb`
 * - Sentry → console.error (TODO: replace with @sentry/nextjs)
 * - FormData uses Blob instead of file URI
 */
import { getDb } from '@/lib/db/client';
import type { LocationQueueEntry, ProofQueueEntry } from '@/lib/db/schema';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { toast } from '@/lib/toast';
import { client } from '@/lib/api/client';
import type { ApiError } from '@/types';

async function syncLocationQueue(): Promise<void> {
  const companyId = getActiveCompanyId();
  if (!companyId) return;

  const db = await getDb();

  // Get all pending (unsynced) location entries
  const pending = await db.getAllFromIndex('locationQueue', 'by-synced', 0);
  if (pending.length === 0) return;

  // Group by task
  const byTask = pending.reduce<Record<number, LocationQueueEntry[]>>((acc, row) => {
    const existing = acc[row.taskId];
    if (existing) {
      existing.push(row);
    } else {
      acc[row.taskId] = [row];
    }
    return acc;
  }, {});

  for (const [taskIdStr, rows] of Object.entries(byTask)) {
    const taskId = Number(taskIdStr);
    // Never exceed backend max batch
    const batch = rows.slice(0, 50);

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

      // Mark as synced
      const tx = db.transaction('locationQueue', 'readwrite');
      for (const row of batch) {
        if (row.id != null) {
          await tx.store.put({ ...row, synced: 1 });
        }
      }
      await tx.done;
    } catch (error) {
      const is422 =
        typeof error === 'object' &&
        error !== null &&
        (error as { status?: number }).status === 422;

      if (is422) {
        // Mark as synced to avoid infinite retry loops
        const tx = db.transaction('locationQueue', 'readwrite');
        for (const row of batch) {
          if (row.id != null) {
            await tx.store.put({ ...row, synced: 1 });
          }
        }
        await tx.done;

        const apiError = error as ApiError;
        const msg =
          apiError.errors?.authorization?.[0] ||
          apiError.message ||
          'You can only track tasks currently assigned to you.';
        toast.error('Tracking Stopped', msg);
      }

      console.error('[SyncEngine] Location sync error:', error);
    }
  }
}

async function syncProofQueue(): Promise<void> {
  const db = await getDb();

  // Get all pending (not uploaded) proof entries
  const pending = await db.getAllFromIndex('proofQueue', 'by-uploaded', 0);
  if (pending.length === 0) return;

  for (const proof of pending) {
    try {
      const formData = new FormData();
      formData.append(
        'photo',
        new File([proof.fileBlob], proof.fileName, { type: proof.mimeType }),
      );

      await client.post(`/agent/tasks/${proof.taskId}/proofs`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      // Mark as uploaded
      if (proof.id != null) {
        await db.put('proofQueue', { ...proof, uploaded: 1 });
      }
    } catch (error) {
      console.error('[SyncEngine] Proof sync error:', error);
    }
  }
}

export const syncEngine = {
  syncLocationQueue,
  syncProofQueue,
  syncAll: async (): Promise<void> => {
    await Promise.allSettled([syncLocationQueue(), syncProofQueue()]);
  },
};
