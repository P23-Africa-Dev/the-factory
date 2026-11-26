/**
 * "The server says this trip is over" signal. Any uploader (the trip reporter,
 * the sync engine) that gets a "not active" answer for a trip's points raises
 * it, so the device stops recording at once instead of waiting for the next
 * status check (which does not run while the app is in the background).
 */
const EVENT = 'field-trip:server-ended';

export function isTripNotActiveError(error: { status?: number; message?: string } | null | undefined): boolean {
  return error?.status === 422 && /not active|not found/i.test(error.message ?? '');
}

export function notifyFieldTripServerEnded(sessionId: number): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<number>(EVENT, { detail: sessionId }));
}

export function onFieldTripServerEnded(listener: (sessionId: number) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = (event: Event) => listener(Number((event as CustomEvent<number>).detail));
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
