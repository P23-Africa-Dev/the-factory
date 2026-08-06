/**
 * Bump this whenever `npm run apk:release` publishes a new factory23-agent.apk.
 * Used as `?v=` on download URLs so phones/CDNs do not keep serving a stale APK.
 * Keep in sync with android/app/build.gradle versionCode.
 */
export const AGENT_APK_VERSION_CODE = '2';
export const AGENT_APK_VERSION_NAME = '1.0.1';

export function withAgentApkCacheBust(url: string): string {
  const version =
    process.env.NEXT_PUBLIC_AGENT_APK_VERSION?.trim() || AGENT_APK_VERSION_CODE;
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('v', version);
    return parsed.toString();
  } catch {
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}v=${encodeURIComponent(version)}`;
  }
}
