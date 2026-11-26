import { getDb } from '@/lib/db/client';

/** Uploaded points are kept this long on the phone (trail rebuild, support), then deleted. */
export const SYNCED_ROW_TTL_MS = 48 * 60 * 60 * 1000;
const PRUNE_EVERY_MS = 60 * 60 * 1000;
let lastPruneAt = 0;

/** Delete uploaded location rows older than 48 h. Never touches rows still waiting to upload. */
export async function pruneSyncedLocationRows(now = Date.now(), force = false): Promise<number> {
  if (!force && now - lastPruneAt < PRUNE_EVERY_MS) return 0;
  lastPruneAt = now;
  const db = await getDb();
  const synced = await db.getAllFromIndex('locationQueue', 'by-synced', 1);
  const cutoff = now - SYNCED_ROW_TTL_MS;
  const old = synced.filter((row) => row.id != null && Date.parse(row.recordedAt) < cutoff);
  if (old.length === 0) return 0;
  const tx = db.transaction('locationQueue', 'readwrite');
  for (const row of old) await tx.store.delete(row.id as number);
  await tx.done;
  return old.length;
}

/** Delete every point of a trip the server refused to start (they can never be uploaded). */
export async function deleteTripRows(clientTripId: string): Promise<void> {
  const db = await getDb();
  const rows = (await db.getAll('locationQueue')).filter(
    (row) => row.fieldTripClientId === clientTripId && !row.fieldActivitySessionId,
  );
  if (rows.length === 0) return;
  const tx = db.transaction('locationQueue', 'readwrite');
  for (const row of rows) if (row.id != null) await tx.store.delete(row.id);
  await tx.done;
}
