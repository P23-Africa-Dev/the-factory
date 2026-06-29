import { useEffect, useRef } from 'react';
import { client } from '@/lib/api/client';

type MapPresenceHeartbeatOptions = {
  companyId?: number | null;
  enabled?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  intervalMs?: number;
};

export function useMapPresenceHeartbeat({
  companyId,
  enabled = true,
  latitude,
  longitude,
  accuracyMeters,
  intervalMs = 60_000,
}: MapPresenceHeartbeatOptions): void {
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || !companyId || latitude == null || longitude == null) {
      return;
    }

    const sendHeartbeat = async () => {
      if (inFlightRef.current || document.visibilityState === 'hidden') {
        return;
      }

      inFlightRef.current = true;
      try {
        await client.post('/agent/presence/heartbeat', {
          company_id: companyId,
          latitude,
          longitude,
          accuracy_meters: accuracyMeters ?? undefined,
        });
      } catch {
        // Presence heartbeat is best-effort while the map is open.
      } finally {
        inFlightRef.current = false;
      }
    };

    void sendHeartbeat();
    const timer = window.setInterval(() => {
      void sendHeartbeat();
    }, intervalMs);

    return () => {
      window.clearInterval(timer);
    };
  }, [accuracyMeters, companyId, enabled, intervalMs, latitude, longitude]);
}
