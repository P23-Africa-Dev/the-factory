const DEFAULT_PRODUCTION_URL = "https://app.thefactory23.com";
const DEFAULT_APK_PATH = "/downloads/factory23-agent.apk";

function inferFromHost(host: string, protocol: string): string {
  if (host.includes("localhost") || host.includes("127.0.0.1")) {
    return `${protocol}//localhost:3001`;
  }
  return `${protocol}//${host}`;
}

export function getAgentPwaPublicUrl(): string {
  const configured = process.env.NEXT_PUBLIC_AGENT_PWA_URL?.replace(/\/+$/, "");
  if (configured) return configured;

  if (typeof window !== "undefined") {
    return inferFromHost(window.location.host, window.location.protocol);
  }

  return DEFAULT_PRODUCTION_URL;
}

export function getAgentMobileInstallUrl(): string {
  const base = getAgentPwaPublicUrl().replace(/\/+$/, "");
  return `${base}/install/mobile?install=true`;
}

/** Convert Google Drive share/view links to direct-download URLs. */
function normalizeApkDownloadUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, "");
    if (host === "drive.google.com" || host === "docs.google.com") {
      const pathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
      const fileId = pathMatch?.[1] || parsed.searchParams.get("id");
      if (fileId) {
        return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
      }
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

/** Absolute URL for Android APK download (optional). */
export function getAgentApkDownloadUrl(): string | null {
  const configured = process.env.NEXT_PUBLIC_AGENT_APK_URL?.trim();
  if (configured) return normalizeApkDownloadUrl(configured);

  if (typeof window !== "undefined") {
    // Prefer marketing-site default when browsing the agent origin in local/dev.
    try {
      const host = window.location.hostname;
      if (host.includes("localhost") || host.includes("127.0.0.1")) {
        return `http://localhost:3000${DEFAULT_APK_PATH}`;
      }
    } catch {
      // fall through
    }
  }

  return `https://thefactory23.com${DEFAULT_APK_PATH}`;
}
