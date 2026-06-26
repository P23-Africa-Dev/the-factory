export type PwaTransportMode = 'driving' | 'cycling' | 'walking';
export type GoogleMapsTravelMode = 'driving' | 'walking' | 'bicycling';

export function mapTransportMode(mode: PwaTransportMode): GoogleMapsTravelMode {
  if (mode === 'cycling') return 'bicycling';
  return mode;
}

export function buildGoogleMapsDirectionsUrl(params: {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  travelMode?: GoogleMapsTravelMode;
}): string {
  const { origin, destination, travelMode = 'driving' } = params;
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('origin', `${origin.latitude},${origin.longitude}`);
  url.searchParams.set('destination', `${destination.latitude},${destination.longitude}`);
  url.searchParams.set('travelmode', travelMode);
  url.searchParams.set('dir_action', 'navigate');
  return url.toString();
}

export function openGoogleMapsNavigation(params: {
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  travelMode?: GoogleMapsTravelMode;
}): void {
  const url = buildGoogleMapsDirectionsUrl(params);
  if (typeof window === 'undefined') return;
  window.location.href = url;
}
