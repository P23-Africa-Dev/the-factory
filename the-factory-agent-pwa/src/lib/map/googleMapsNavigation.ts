export type PwaTransportMode = 'driving' | 'cycling' | 'walking';
export type GoogleMapsTravelMode = 'driving' | 'walking' | 'bicycling';

const COORD_EPSILON = 0.0001;
const COORD_PRECISION = 6;

export function isValidMapCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) > COORD_EPSILON &&
    Math.abs(longitude) > COORD_EPSILON &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

export function formatMapCoordinate(value: number): string {
  return value.toFixed(COORD_PRECISION);
}

export function mapTransportMode(mode: PwaTransportMode): GoogleMapsTravelMode {
  if (mode === 'cycling') return 'bicycling';
  return mode;
}

/**
 * Google Maps bicycle routing is unavailable in many regions. Use driving for
 * external turn-by-turn handoff so agents always get a navigable route.
 */
export function resolveGoogleMapsTravelMode(mode: PwaTransportMode): GoogleMapsTravelMode {
  if (mode === 'cycling') return 'driving';
  return mapTransportMode(mode);
}

function formatLatLng(point: { latitude: number; longitude: number }): string {
  return `${formatMapCoordinate(point.latitude)},${formatMapCoordinate(point.longitude)}`;
}

function androidNavigationMode(travelMode: GoogleMapsTravelMode): string {
  if (travelMode === 'bicycling') return 'b';
  if (travelMode === 'walking') return 'w';
  return 'd';
}

export function buildGoogleNavigationIntentUrl(params: {
  destination: { latitude: number; longitude: number };
  travelMode?: GoogleMapsTravelMode;
}): string {
  const { destination, travelMode = 'driving' } = params;
  const q = formatLatLng(destination);
  const mode = androidNavigationMode(travelMode);
  return `google.navigation:q=${q}&mode=${mode}`;
}

export function buildGoogleMapsDirectionsUrl(params: {
  origin?: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  travelMode?: GoogleMapsTravelMode;
  useDeviceLocationAsOrigin?: boolean;
}): string {
  const { origin, destination, travelMode = 'driving', useDeviceLocationAsOrigin = false } = params;

  if (!isValidMapCoordinate(destination.latitude, destination.longitude)) {
    throw new Error('Invalid destination coordinates');
  }

  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');

  const omitOrigin = useDeviceLocationAsOrigin || !origin;
  if (!omitOrigin) {
    if (!isValidMapCoordinate(origin.latitude, origin.longitude)) {
      throw new Error('Invalid origin coordinates');
    }
    url.searchParams.set('origin', formatLatLng(origin));
  }

  url.searchParams.set('destination', formatLatLng(destination));
  url.searchParams.set('travelmode', travelMode);
  url.searchParams.set('dir_action', 'navigate');
  return url.toString();
}

function isAndroidDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent);
}

export function openGoogleMapsNavigation(params: {
  origin?: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  travelMode?: GoogleMapsTravelMode;
  useDeviceLocationAsOrigin?: boolean;
}): void {
  if (typeof window === 'undefined') return;

  if (!isValidMapCoordinate(params.destination.latitude, params.destination.longitude)) {
    throw new Error('Invalid destination coordinates');
  }

  const travelMode = params.travelMode ?? 'driving';
  const useDeviceLocationAsOrigin = params.useDeviceLocationAsOrigin ?? !params.origin;

  if (isAndroidDevice() && useDeviceLocationAsOrigin) {
    window.location.href = buildGoogleNavigationIntentUrl({
      destination: params.destination,
      travelMode,
    });
    return;
  }

  window.location.href = buildGoogleMapsDirectionsUrl({
    ...params,
    travelMode,
    useDeviceLocationAsOrigin,
  });
}
