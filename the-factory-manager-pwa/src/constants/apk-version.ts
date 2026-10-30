/**
 * Bump these whenever `npm run apk:release` publishes a new factory23-manager.apk.
 */
export const AGENT_APK_VERSION_CODE = '2';
export const AGENT_APK_VERSION_NAME = '1.0.1';

export const CANONICAL_AGENT_APK_URL =
  'https://thefactory23.com/downloads/factory23-manager.apk';

export function withAgentApkCacheBust(url: string): string {
  const version =
    process.env.NEXT_PUBLIC_MANAGER_APK_VERSION?.trim() ||
    process.env.NEXT_PUBLIC_AGENT_APK_VERSION?.trim() ||
    `${AGENT_APK_VERSION_NAME}-${AGENT_APK_VERSION_CODE}`;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('v', version);
    return parsed.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}v=${encodeURIComponent(version)}`;
  }
}
