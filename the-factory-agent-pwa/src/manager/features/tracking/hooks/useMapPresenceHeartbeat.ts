type MapPresenceHeartbeatOptions = {
  companyId?: number | null;
  enabled?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  accuracyMeters?: number | null;
  intervalMs?: number;
};

/**
 * Managers monitor fleet presence on `/map` rather than broadcasting field agent
 * GPS presence heartbeats. Kept as a no-op hook for signature compatibility.
 */
export function useMapPresenceHeartbeat(_options: MapPresenceHeartbeatOptions): void {
  void _options;
}
