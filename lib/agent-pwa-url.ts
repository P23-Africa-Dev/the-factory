const DEFAULT_PRODUCTION_URL = "https://app.thefactory23.com";
const DEFAULT_APK_PATH = "/downloads/factory23-agent.apk";

function inferAgentUrlFromHost(host: string, protocol: string): string {
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    return `${protocol}//localhost:3001`;
  }

  const parts = host.split(".");
  if (parts.length > 2) {
    parts.shift();
  }
  return `${protocol}//app.${parts.join(".")}`;
}

export function getAgentPwaUrl(origin?: string): string {
  const configured = process.env.NEXT_PUBLIC_AGENT_PWA_URL?.replace(/\/+$/, "");
  if (configured) return configured;

  if (typeof window !== "undefined") {
    return inferAgentUrlFromHost(window.location.host, window.location.protocol);
  }

  if (origin) {
    try {
      const parsed = new URL(origin);
      return inferAgentUrlFromHost(parsed.host, `${parsed.protocol}//`);
    } catch {
      return DEFAULT_PRODUCTION_URL;
    }
  }

  return DEFAULT_PRODUCTION_URL;
}

export function getAgentInstallUrl(origin?: string): string {
  const base = getAgentPwaUrl(origin).replace(/\/+$/, "");
  return `${base}/install/mobile?install=true`;
}

/**
 * Absolute URL for the Android APK download (QR → direct download).
 * Prefer NEXT_PUBLIC_AGENT_APK_URL (supports Google Drive share links — normalized
 * to a direct-download URL). Otherwise same-origin /downloads/factory23-agent.apk.
 */
export function getAgentApkUrl(origin?: string): string {
  const configured = process.env.NEXT_PUBLIC_AGENT_APK_URL?.trim();
  if (configured) return normalizeAgentApkDownloadUrl(configured);

  if (typeof window !== "undefined") {
    return `${window.location.origin}${DEFAULT_APK_PATH}`;
  }

  if (origin) {
    try {
      const parsed = new URL(origin);
      return `${parsed.origin}${DEFAULT_APK_PATH}`;
    } catch {
      // fall through
    }
  }

  return `https://thefactory23.com${DEFAULT_APK_PATH}`;
}

/**
 * Convert Google Drive “share” / “view” links into a direct-download URL so
 * scanning the QR starts an APK download instead of opening the Drive preview page.
 *
 * Share:  https://drive.google.com/file/d/FILE_ID/view?usp=sharing
 * Direct: https://drive.google.com/uc?export=download&id=FILE_ID
 *
 * Note: very large files may still hit Drive’s virus-scan interstitial; keep the
 * APK under ~100MB or host on your own CDN if installs fail mid-download.
 */
export function normalizeAgentApkDownloadUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "");

    if (host === "drive.google.com" || host === "docs.google.com") {
      const pathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
      const idFromPath = pathMatch?.[1];
      const idFromQuery = parsed.searchParams.get("id");
      const fileId = idFromPath || idFromQuery;
      if (fileId) {
        return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
      }
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

export function isAgentApkConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_AGENT_APK_URL?.trim());
}

export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /android|iphone|ipad|ipod|mobile/i.test(ua);
}

export function isDesktopDevice(): boolean {
  if (typeof window === "undefined") return true;
  return !isMobileDevice();
}

export function isAndroidDevice(): boolean {
  if (typeof window === "undefined") return false;
  return /android/i.test(window.navigator.userAgent);
}
