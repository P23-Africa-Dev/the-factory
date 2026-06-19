const DEFAULT_PRODUCTION_URL = "https://app.thefactory23.com";

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

export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return /android|iphone|ipad|ipod|mobile/i.test(ua);
}

export function isDesktopDevice(): boolean {
  if (typeof window === "undefined") return true;
  return !isMobileDevice();
}
