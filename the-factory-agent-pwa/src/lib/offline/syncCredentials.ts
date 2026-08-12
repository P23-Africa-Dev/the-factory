/**
 * Mirrors auth token + API base into IndexedDB so the service worker can
 * upload queued location points when no client window is open.
 * (Service workers cannot read localStorage.)
 */
import { getDb } from '@/lib/db/client';
import { env } from '@/constants/env';
import { getActiveCompanyId } from '@/lib/storage/stores';

export const SYNC_CREDENTIALS_KEY = 'credentials';

export type SyncCredentials = {
  id: typeof SYNC_CREDENTIALS_KEY;
  token: string;
  apiBaseUrl: string;
  companyId: number | null;
  updatedAt: string;
};

export async function writeSyncCredentials(token: string | null): Promise<void> {
  try {
    const db = await getDb();
    if (!db.objectStoreNames.contains('syncMeta')) return;

    if (!token) {
      await db.delete('syncMeta', SYNC_CREDENTIALS_KEY);
      return;
    }

    const row: SyncCredentials = {
      id: SYNC_CREDENTIALS_KEY,
      token,
      apiBaseUrl: env.API_BASE_URL,
      companyId: getActiveCompanyId(),
      updatedAt: new Date().toISOString(),
    };
    await db.put('syncMeta', row);
  } catch (err) {
    console.warn('[syncCredentials] Failed to write credentials for SW:', err);
  }
}

export async function clearSyncCredentials(): Promise<void> {
  await writeSyncCredentials(null);
}
