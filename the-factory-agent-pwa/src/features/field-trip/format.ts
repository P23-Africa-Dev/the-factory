/** Display helpers for field trips. */

export function formatElapsed(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(sec)}`;
}

export function formatDistance(meters: number | null | undefined): string {
  const m = Math.max(0, Number(meters ?? 0));
  if (m < 1000) return `${Math.round(m)} m`;
  const km = m / 1000;
  return `${km >= 10 ? km.toFixed(0) : km.toFixed(1)} km`;
}

export function secondsSince(iso: string | null | undefined, now: number = Date.now()): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? Math.max(0, Math.floor((now - t) / 1000)) : 0;
}

export function plural(n: number, one: string, many: string = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
