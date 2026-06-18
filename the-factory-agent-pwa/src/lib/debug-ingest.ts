/** Debug session logging — writes to /api/debug-log and browser console (visible in Next dev terminal). */
export function agentDebugLog(payload: Record<string, unknown>): void {
  const entry = { sessionId: '6d289e', timestamp: Date.now(), ...payload };
  console.warn('[MapDebug]', entry);
  if (typeof window === 'undefined') return;
  void fetch('/api/debug-log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  }).catch(() => {});
}
