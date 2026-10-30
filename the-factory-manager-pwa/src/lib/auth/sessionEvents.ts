/**
 * Session event emitter — identical to mobile app.
 *
 * This lives outside React so the Axios interceptor (which has no access to
 * hooks or context) can signal a session expiry, and a top-level component
 * that does have access to AuthContext can respond.
 */
type Listener = () => void;

class SessionEventEmitter {
  private listeners: Set<Listener> = new Set();

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(): void {
    this.listeners.forEach((l) => l());
  }
}

export const sessionEvents = new SessionEventEmitter();
