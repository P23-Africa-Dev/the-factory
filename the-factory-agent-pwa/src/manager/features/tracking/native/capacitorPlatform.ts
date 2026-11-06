import { Capacitor } from '@capacitor/core';

/** True when running inside the Capacitor Android (or iOS) shell. */
export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** True only on Capacitor Android — background live tracking target. */
export function isNativeAndroid(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch {
    return false;
  }
}
