import { appStore, getActiveCompanyId } from '@/lib/storage/stores';

/**
 * The active copilot thread id is persisted per company + user so a refresh,
 * app restart, or background resume can reload the exact conversation the agent
 * was last in. Scoping by user prevents one agent's thread from leaking into
 * another account on a shared device.
 */
function activeThreadKey(userId: string | number | undefined): string {
  const companyId = getActiveCompanyId();
  return `assistant_thread:${companyId ?? 'unknown'}:${userId ?? 'unknown'}`;
}

export function getActiveThreadId(userId: string | number | undefined): string | null {
  return appStore.getString(activeThreadKey(userId)) ?? null;
}

export function setActiveThreadId(userId: string | number | undefined, threadId: string): void {
  appStore.set(activeThreadKey(userId), threadId);
}

export function clearActiveThreadId(userId: string | number | undefined): void {
  appStore.delete(activeThreadKey(userId));
}
