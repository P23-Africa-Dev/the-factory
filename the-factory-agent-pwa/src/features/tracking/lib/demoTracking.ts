/** ~2 km offset from destination for demo task starts (matches backend DemoRouteInterpolator). */
export function demoSyntheticStartFromDestination(
  destLat: number,
  destLng: number,
  offsetKm = 2,
): { latitude: number; longitude: number } {
  const latOffset = offsetKm / 111;
  const lngOffset = offsetKm / (111 * Math.max(0.1, Math.cos((destLat * Math.PI) / 180)));

  return {
    latitude: destLat + latOffset,
    longitude: destLng - lngOffset,
  };
}

export function isDemoOrganization(profile: unknown): boolean {
  if (!profile || typeof profile !== 'object') return false;
  const org = (profile as { organization?: { company?: { is_demo?: boolean } } }).organization;
  return org?.company?.is_demo === true;
}
