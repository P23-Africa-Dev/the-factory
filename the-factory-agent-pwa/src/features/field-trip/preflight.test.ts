import { describe, expect, it, vi } from 'vitest';
import { runFieldTripPreflight, type PreflightDeps } from './preflight';

type Status = Awaited<ReturnType<PreflightDeps['getPermissionStatus']>>;

const status = (over: Partial<Status> = {}): Status => ({
  foreground: 'granted',
  background: 'granted',
  locationServicesOn: true,
  precise: true,
  native: true,
  ...over,
});

const fix = { latitude: 6.5, longitude: 3.3, accuracyMeters: 8, recordedAt: '2026-11-25T09:00:00.000Z' };

function deps(over: Partial<PreflightDeps> = {}): PreflightDeps {
  return {
    getPermissionStatus: vi.fn(async () => status()),
    requestForegroundPermission: vi.fn(async () => status()),
    checkLocationSettings: vi.fn(async () => ({ enabled: true, resolution: 'turned_on' })),
    readPosition: vi.fn(async () => fix),
    ...over,
  };
}

describe('runFieldTripPreflight', () => {
  it('passes with a first fix when everything is in place', async () => {
    const steps: string[] = [];
    const res = await runFieldTripPreflight((s) => steps.push(s), deps());
    expect(res).toMatchObject({ ok: true, issue: null, warning: null, position: fix });
    expect(steps).toEqual(['permission', 'gps', 'background', 'position']);
  });

  it('asks Android to turn location on, and stops when the user declines', async () => {
    const check = vi.fn(async () => ({ enabled: false, resolution: 'declined' }));
    const res = await runFieldTripPreflight(
      undefined,
      deps({ getPermissionStatus: async () => status({ locationServicesOn: false }), checkLocationSettings: check }),
    );
    expect(check).toHaveBeenCalledWith({ highAccuracy: true, showDialog: true });
    expect(res).toMatchObject({ ok: false, issue: 'gps_off' });
  });

  it('reports a blocked permission', async () => {
    const res = await runFieldTripPreflight(undefined, deps({ getPermissionStatus: async () => status({ foreground: 'denied' }) }));
    expect(res).toMatchObject({ ok: false, issue: 'permission_denied' });
  });

  it('warns but allows a start when only foreground location is granted on the APK', async () => {
    const res = await runFieldTripPreflight(undefined, deps({ getPermissionStatus: async () => status({ background: 'denied' }) }));
    expect(res).toMatchObject({ ok: true, warning: 'background_missing', position: fix });
  });

  it('treats position unavailable in a browser as location switched off', async () => {
    const res = await runFieldTripPreflight(
      undefined,
      deps({
        getPermissionStatus: async () => status({ native: false, background: 'denied' }),
        readPosition: async () => {
          throw Object.assign(new Error('off'), { code: 2 });
        },
      }),
    );
    expect(res).toMatchObject({ ok: false, issue: 'gps_off', native: false });
  });

  it('starts without a fix on a GPS timeout and waits for signal', async () => {
    const res = await runFieldTripPreflight(
      undefined,
      deps({
        readPosition: async () => {
          throw Object.assign(new Error('timeout'), { code: 3 });
        },
      }),
    );
    expect(res).toMatchObject({ ok: true, issue: null, position: null });
  });
});
