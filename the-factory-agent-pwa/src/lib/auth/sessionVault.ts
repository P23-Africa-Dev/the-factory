import { Capacitor, registerPlugin } from '@capacitor/core';

/**
 * Durable copy of the sign-in in native storage (APK 1.0.6+, SessionVaultPlugin).
 *
 * The WebView's localStorage can silently roll back to an old state after the
 * app is killed mid-write (a corrupted LevelDB log makes Chromium ignore every
 * later write). The app then restores an OLD session whose token is rejected
 * and the user is signed out. Keeping the newest sign-in / sign-out natively and
 * picking whichever is newer at start-up prevents that.
 */

export interface StoredSession {
  token: string;
  user: string | null; // JSON of the user, as kept in localStorage
}

interface VaultPlugin {
  save(o: { session: string; savedAt: number }): Promise<{ ok: boolean }>;
  load(): Promise<{ session: string | null; savedAt: number; loggedOutAt: number }>;
  clear(o: { loggedOutAt: number }): Promise<{ ok: boolean }>;
}

const Vault = registerPlugin<VaultPlugin>('SessionVault');

export function isSessionVaultAvailable(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('SessionVault');
  } catch {
    return false;
  }
}

export async function vaultSave(session: StoredSession, savedAt: number): Promise<void> {
  if (!isSessionVaultAvailable()) return;
  try {
    await Vault.save({ session: JSON.stringify(session), savedAt });
  } catch {
    // Best effort: localStorage still has it.
  }
}

export async function vaultClear(loggedOutAt: number): Promise<void> {
  if (!isSessionVaultAvailable()) return;
  try {
    await Vault.clear({ loggedOutAt });
  } catch {
    // ignore
  }
}

export interface VaultState {
  session: StoredSession | null;
  savedAt: number;
  loggedOutAt: number;
}

export async function vaultLoad(): Promise<VaultState | null> {
  if (!isSessionVaultAvailable()) return null;
  try {
    const r = await Vault.load();
    let session: StoredSession | null = null;
    if (r.session) {
      const parsed = JSON.parse(r.session) as Partial<StoredSession>;
      if (typeof parsed.token === 'string' && parsed.token) {
        session = { token: parsed.token, user: typeof parsed.user === 'string' ? parsed.user : null };
      }
    }
    return { session, savedAt: Number(r.savedAt) || 0, loggedOutAt: Number(r.loggedOutAt) || 0 };
  } catch {
    return null;
  }
}

export type SessionDecision =
  | { kind: 'local' } // keep what localStorage has (and back it up natively)
  | { kind: 'vault'; session: StoredSession } // localStorage rolled back: restore the newer native copy
  | { kind: 'signed_out' }; // signed out more recently than localStorage's session

/**
 * Which state is newest? `localSavedAt` is 0 for sessions saved before this
 * fix (no timestamp): the native copy then wins only when it is a real, newer
 * record, and an old sign-in is never resurrected over a later sign-out.
 */
export function decideSession(
  local: { token: string | null; savedAt: number },
  vault: VaultState | null,
): SessionDecision {
  if (!vault) return { kind: 'local' };
  const newestVault = Math.max(vault.savedAt, vault.loggedOutAt);
  if (newestVault <= local.savedAt) return { kind: 'local' };
  if (vault.loggedOutAt > vault.savedAt) {
    return local.token ? { kind: 'signed_out' } : { kind: 'local' };
  }
  if (vault.session && vault.session.token !== local.token) return { kind: 'vault', session: vault.session };
  return { kind: 'local' };
}
