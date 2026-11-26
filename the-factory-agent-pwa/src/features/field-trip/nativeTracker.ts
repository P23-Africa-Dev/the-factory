import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isNativeAndroid } from '@/features/tracking/native/capacitorPlatform';

/**
 * Typed bridge to the native field-trip tracker
 * (android/.../fieldtrip/FieldTripTrackerPlugin.java, APK 1.0.4+).
 *
 * On those APKs a foreground service records and uploads the trip by itself,
 * so it keeps working with the screen off, the app swiped away or after a
 * reboot. The WebView loads the live site, so this code also runs in older
 * APKs and in the browser: there `isNativeTrackerAvailable()` is false and the
 * JS reporter (watchPosition + IndexedDB) is used instead.
 */

export interface NativeTrackerState {
  active: boolean;
  running: boolean;
  recording?: boolean;
  clientTripId: string | null;
  serverId: number;
  pending: number;
  uploaded: number;
  fixes: number;
  lastFixAt: number;
  lastAccuracy: number;
  endedByServer: boolean;
  lastError: string | null;
}

export interface NativeFix {
  latitude: number;
  longitude: number;
  accuracy?: number;
  speed?: number;
  heading?: number;
  time: number;
}

export interface NativeStartOptions {
  clientTripId: string;
  serverId?: number | null;
  apiBaseUrl: string;
  token?: string | null;
  companyId?: number | null;
  movingIntervalSeconds?: number;
  stationaryIntervalSeconds?: number;
  startedAtMillis?: number;
}

interface FieldTripTrackerPlugin {
  start(options: NativeStartOptions): Promise<NativeTrackerState>;
  update(options: { serverId?: number | null; token?: string | null; companyId?: number | null; recording?: boolean }): Promise<NativeTrackerState>;
  flush(): Promise<NativeTrackerState>;
  getState(): Promise<NativeTrackerState>;
  getTrail(): Promise<{ points: [number, number][] }>;
  stop(): Promise<NativeTrackerState>;
  getBatteryOptimization(): Promise<{ optimized: boolean }>;
  openBatteryOptimizationSettings(): Promise<void>;
  addListener(event: 'fix', cb: (fix: NativeFix) => void): Promise<PluginListenerHandle>;
  addListener(event: 'endedByServer', cb: (state: NativeTrackerState) => void): Promise<PluginListenerHandle>;
}

export const FieldTripTracker = registerPlugin<FieldTripTrackerPlugin>('FieldTripTracker');

export function isNativeTrackerAvailable(): boolean {
  try {
    return isNativeAndroid() && Capacitor.isPluginAvailable('FieldTripTracker');
  } catch {
    return false;
  }
}
