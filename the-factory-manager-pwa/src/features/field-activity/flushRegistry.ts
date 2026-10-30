type FlushFn = () => Promise<void>;

let currentFlush: FlushFn | null = null;

export function registerFieldActivityFlush(fn: FlushFn | null): void {
  currentFlush = fn;
}

/**
 * Drains buffered field GPS points before the session closes (clock-out).
 * Each reporter flush sends at most one batch, so run a few passes to clear
 * the memory queue and any IndexedDB backlog.
 */
export async function flushFieldActivityPoints(): Promise<void> {
  if (!currentFlush) return;
  for (let i = 0; i < 5; i += 1) {
    await currentFlush();
  }
}
