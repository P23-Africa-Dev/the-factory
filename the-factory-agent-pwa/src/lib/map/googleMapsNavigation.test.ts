import { describe, expect, it } from 'vitest';

import {
  buildGoogleMapsDirectionsUrl,
  buildGoogleNavigationIntentUrl,
  isValidMapCoordinate,
  resolveGoogleMapsTravelMode,
} from './googleMapsNavigation';
import { resolveTaskDestinationCoords } from './resolveTaskDestinationCoords';

describe('isValidMapCoordinate', () => {
  it('accepts valid coordinates', () => {
    expect(isValidMapCoordinate(6.5244, 3.3792)).toBe(true);
  });

  it('rejects zero coordinates', () => {
    expect(isValidMapCoordinate(0, 0)).toBe(false);
  });
});

describe('resolveGoogleMapsTravelMode', () => {
  it('uses driving for cycling handoff', () => {
    expect(resolveGoogleMapsTravelMode('cycling')).toBe('driving');
  });

  it('keeps walking and driving modes', () => {
    expect(resolveGoogleMapsTravelMode('walking')).toBe('walking');
    expect(resolveGoogleMapsTravelMode('driving')).toBe('driving');
  });
});

describe('buildGoogleMapsDirectionsUrl', () => {
  const destination = { latitude: 6.601838, longitude: 3.351486 };

  it('omits origin when useDeviceLocationAsOrigin is true', () => {
    const url = buildGoogleMapsDirectionsUrl({
      destination,
      useDeviceLocationAsOrigin: true,
      origin: { latitude: 1, longitude: 2 },
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.has('origin')).toBe(false);
    expect(parsed.searchParams.get('destination')).toBe('6.601838,3.351486');
    expect(parsed.searchParams.get('dir_action')).toBe('navigate');
  });
});

describe('buildGoogleNavigationIntentUrl', () => {
  it('builds android navigation intent with driving mode by default', () => {
    expect(
      buildGoogleNavigationIntentUrl({
        destination: { latitude: 6.601838, longitude: 3.351486 },
      }),
    ).toBe('google.navigation:q=6.601838,3.351486&mode=d');
  });
});

describe('resolveTaskDestinationCoords', () => {
  it('prefers live destination over other sources', () => {
    expect(
      resolveTaskDestinationCoords({
        liveDestination: { latitude: 1.1, longitude: 2.2 },
        routeDestination: { latitude: 3.3, longitude: 4.4 },
        selectedDestination: { latitude: 5.5, longitude: 6.6 },
      }),
    ).toEqual({ latitude: 1.1, longitude: 2.2 });
  });

  it('returns null when no valid source exists', () => {
    expect(
      resolveTaskDestinationCoords({
        selectedDestination: { latitude: 0, longitude: 0 },
      }),
    ).toBeNull();
  });
});
