import { describe, expect, it } from 'vitest';

import {
  buildGoogleMapsDirectionsUrl,
  buildGoogleNavigationIntentUrl,
  isValidMapCoordinate,
} from './googleMapsNavigation';
import { resolveTaskDestinationCoords } from './resolveTaskDestinationCoords';

describe('isValidMapCoordinate', () => {
  it('accepts valid coordinates', () => {
    expect(isValidMapCoordinate(6.5244, 3.3792)).toBe(true);
  });

  it('rejects zero coordinates', () => {
    expect(isValidMapCoordinate(0, 0)).toBe(false);
  });

  it('rejects non-finite values', () => {
    expect(isValidMapCoordinate(Number.NaN, 3.4)).toBe(false);
  });
});

describe('buildGoogleMapsDirectionsUrl', () => {
  const destination = { latitude: 6.601838, longitude: 3.351486 };

  it('omits origin when useDeviceLocationAsOrigin is true', () => {
    const url = buildGoogleMapsDirectionsUrl({
      destination,
      travelMode: 'driving',
      useDeviceLocationAsOrigin: true,
      origin: { latitude: 1, longitude: 2 },
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.has('origin')).toBe(false);
    expect(parsed.searchParams.get('destination')).toBe('6.601838,3.351486');
    expect(parsed.searchParams.get('dir_action')).toBe('navigate');
    expect(parsed.searchParams.get('travelmode')).toBe('driving');
  });

  it('includes origin when useDeviceLocationAsOrigin is false', () => {
    const url = buildGoogleMapsDirectionsUrl({
      origin: { latitude: 6.5, longitude: 3.3 },
      destination,
      travelMode: 'bicycling',
      useDeviceLocationAsOrigin: false,
    });

    const parsed = new URL(url);
    expect(parsed.searchParams.get('origin')).toBe('6.500000,3.300000');
    expect(parsed.searchParams.get('destination')).toBe('6.601838,3.351486');
    expect(parsed.searchParams.get('travelmode')).toBe('bicycling');
  });

  it('throws for invalid destination', () => {
    expect(() =>
      buildGoogleMapsDirectionsUrl({
        destination: { latitude: 0, longitude: 0 },
      }),
    ).toThrow('Invalid destination coordinates');
  });
});

describe('buildGoogleNavigationIntentUrl', () => {
  it('builds android navigation intent with destination and mode', () => {
    expect(
      buildGoogleNavigationIntentUrl({
        destination: { latitude: 6.601838, longitude: 3.351486 },
        travelMode: 'bicycling',
      }),
    ).toBe('google.navigation:q=6.601838,3.351486&mode=b');
  });
});

describe('resolveTaskDestinationCoords', () => {
  it('prefers live destination over other sources', () => {
    const result = resolveTaskDestinationCoords({
      liveDestination: { latitude: 1.1, longitude: 2.2 },
      routeDestination: { latitude: 3.3, longitude: 4.4 },
      selectedDestination: { latitude: 5.5, longitude: 6.6 },
      taskRecord: { latitude: 7.7, longitude: 8.8 },
    });

    expect(result).toEqual({ latitude: 1.1, longitude: 2.2 });
  });

  it('falls back through route, selected, and task record', () => {
    expect(
      resolveTaskDestinationCoords({
        routeDestination: { latitude: 3.3, longitude: 4.4 },
        selectedDestination: { latitude: 5.5, longitude: 6.6 },
      }),
    ).toEqual({ latitude: 3.3, longitude: 4.4 });

    expect(
      resolveTaskDestinationCoords({
        selectedDestination: { latitude: 5.5, longitude: 6.6 },
        taskRecord: { latitude: 7.7, longitude: 8.8 },
      }),
    ).toEqual({ latitude: 5.5, longitude: 6.6 });
  });

  it('returns null when no valid source exists', () => {
    expect(
      resolveTaskDestinationCoords({
        liveDestination: { latitude: 0, longitude: 0 },
        selectedDestination: { latitude: Number.NaN, longitude: 1 },
      }),
    ).toBeNull();
  });
});
