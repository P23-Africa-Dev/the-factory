import { useTrackingStore } from '@/store/tracking';

export type ProximitySyncPayload = {
  arrived: boolean;
  near_destination?: boolean;
  distance_remaining_meters?: number | null;
};

type ProximityListener = (taskId: number, payload: ProximitySyncPayload) => void;

const listeners = new Set<ProximityListener>();

/** Register UI callbacks (arrived / near / distance) for offline sync backfill. */
export function subscribeProximityFromSync(listener: ProximityListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Apply proximity fields after a successful location POST (memory flush or syncEngine). */
export function applyProximityFromSync(taskId: number, payload: ProximitySyncPayload): void {
  if (payload.arrived) {
    useTrackingStore.getState().markArrived(taskId, new Date().toISOString());
  }
  listeners.forEach((listener) => {
    try {
      listener(taskId, payload);
    } catch (err) {
      console.warn('[proximityFromSync] listener error:', err);
    }
  });
}
