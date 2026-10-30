/**
 * Mutex so memory flush (useLocationReporter) and IndexedDB syncEngine
 * never POST the same location points concurrently.
 */

let lock: Promise<void> = Promise.resolve();

export async function withLocationUploadLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const prev = lock;
  lock = prev.then(() => next);
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}
