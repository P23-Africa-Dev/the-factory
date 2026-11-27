/**
 * Resolves once the sign-in has been restored at start-up (localStorage, or the
 * newer native copy). API calls wait for it, so none goes out with a stale
 * token that the server would reject (a 401 signs the user out).
 */
let resolveReady: () => void = () => {};
let ready = false;
const readyPromise = new Promise<void>((resolve) => {
  resolveReady = () => {
    ready = true;
    resolve();
  };
});

export function markAuthReady(): void {
  resolveReady();
}

/** Wait for start-up restore (at most `timeoutMs`, so a failure never blocks the app). */
export function waitForAuthReady(timeoutMs = 4_000): Promise<void> {
  if (ready) return Promise.resolve();
  return Promise.race([readyPromise, new Promise<void>((r) => setTimeout(r, timeoutMs))]);
}
