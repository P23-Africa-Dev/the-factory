import { isNativeAndroid } from '@/features/tracking/native/capacitorPlatform';
import { openNativeBatteryOptimizationSettings } from '@/features/tracking/native/nativeBackgroundGeolocation';

const STORAGE_KEY = 'factory23.tracking.battery-opt-prompted-v1';

/**
 * One-time nudge on APK so agents whitelist the app from aggressive battery kill.
 * Returns true when settings were opened.
 */
export function maybePromptBatteryOptimizationOnTrackingStart(): boolean {
  if (!isNativeAndroid()) return false;
  if (typeof localStorage === 'undefined') return false;

  try {
    if (localStorage.getItem(STORAGE_KEY) === '1') return false;
    localStorage.setItem(STORAGE_KEY, '1');
    void openNativeBatteryOptimizationSettings();
    return true;
  } catch {
    return false;
  }
}
