import { AGENT_APK_VERSION_CODE } from '@/constants/apk-version';

/**
 * "Update available" for the Android app.
 *
 * The screens update themselves (the APK loads the live site), but the native
 * shell only changes when the person installs a new APK. The latest published
 * versionCode ships with the live site (AGENT_APK_VERSION_CODE), so every phone
 * learns about a new APK on its next launch, whatever version it runs.
 */
const SNOOZE_KEY = 'apk-update:snoozed-until';
/** "Later" hides the banner for this long. */
export const SNOOZE_MS = 24 * 60 * 60 * 1000;

export function latestApkVersionCode(): number {
  return Number(AGENT_APK_VERSION_CODE) || 0;
}

/** True when the installed APK (its versionCode, as App.getInfo().build) is older than the published one. */
export function isApkUpdateAvailable(installedBuild: string | number | null | undefined, latest = latestApkVersionCode()): boolean {
  const installed = Number(installedBuild);
  return Number.isFinite(installed) && installed > 0 && latest > installed;
}

export function isSnoozed(now = Date.now()): boolean {
  try {
    return Number(localStorage.getItem(SNOOZE_KEY) || 0) > now;
  } catch {
    return false;
  }
}

export function snooze(now = Date.now()): void {
  try {
    localStorage.setItem(SNOOZE_KEY, String(now + SNOOZE_MS));
  } catch {
    // ignore
  }
}
