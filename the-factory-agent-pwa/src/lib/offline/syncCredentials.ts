/**
 * Mirrors auth token + API base into IndexedDB so the service worker can
 * upload queued location points when no client window is open.
 * (Service workers cannot read localStorage.)
 */
import { getDb } from '@/lib/db/client';
import { env } from '@/constants/env';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { readSession } from '@/session/sessionStore';
import type { AppMode } from '@/session/appMode';

export const SYNC_CREDENTIALS_KEY = 'credentials';

export type SyncCredentials = {
  id: typeof SYNC_CREDENTIALS_KEY;
  token: string;
  apiBaseUrl: string;
  companyId: number | null;
  appMode?: AppMode;
  role?: string;
  updatedAt: string;
};

export async function writeSyncCredentials(
  token: string | null,
  modeOrOptions?: AppMode | { mode?: AppMode; role?: string },
): Promise<void> {
  try {
    const db = await getDb();
    if (!db.objectStoreNames.contains('syncMeta')) return;

    if (!token) {
      await db.delete('syncMeta', SYNC_CREDENTIALS_KEY);
      return;
    }

    const session = readSession();
    let appMode: AppMode = session?.app_mode ?? 'agent';
    let role: string | undefined = session?.user?.role;

    if (typeof modeOrOptions === 'string') {
      appMode = modeOrOptions;
    } else if (modeOrOptions && typeof modeOrOptions === 'object') {
      if (modeOrOptions.mode) appMode = modeOrOptions.mode;
      if (modeOrOptions.role) role = modeOrOptions.role;
    }

    const row: SyncCredentials = {
      id: SYNC_CREDENTIALS_KEY,
      token,
      apiBaseUrl: env.API_BASE_URL,
      companyId: getActiveCompanyId(),
      appMode,
      role,
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
