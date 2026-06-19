const DEFAULT_PRODUCTION_URL = "https://app.thefactory23.com";

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
