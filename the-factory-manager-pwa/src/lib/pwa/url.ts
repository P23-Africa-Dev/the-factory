import {
  CANONICAL_AGENT_APK_URL,
  withAgentApkCacheBust,
} from '@/constants/apk-version';

const DEFAULT_PRODUCTION_URL = 'https://manager.thefactory23.com';
const DEFAULT_APK_PATH = '/downloads/factory23-manager.apk';

function inferFromHost(host: string, protocol: string): string {
  if (host.includes('localhost') || host.includes('127.0.0.1')) {
    return `${protocol}//localhost:3002`;
  }
  return `${protocol}//${host}`;
}

export function getAgentPwaPublicUrl(): string {
  const configured = (
    process.env.NEXT_PUBLIC_MANAGER_PWA_URL ||
    process.env.NEXT_PUBLIC_AGENT_PWA_URL
  )?.replace(/\/+$/, '');
  if (configured) return configured;

  if (typeof window !== 'undefined') {
    return inferFromHost(window.location.host, window.location.protocol);
  }

  return DEFAULT_PRODUCTION_URL;
}

export function getAgentMobileInstallUrl(): string {
  const base = getAgentPwaPublicUrl().replace(/\/+$/, '');
  return `${base}/install/mobile?install=true`;
}

function normalizeApkDownloadUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;
  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'drive.google.com' || host === 'docs.google.com') {
      const pathMatch = parsed.pathname.match(/\/file\/d\/([^/]+)/);
      const fileId = pathMatch?.[1] || parsed.searchParams.get('id');
      if (fileId) {
        return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(fileId)}`;
      }
    }
  } catch {
    return trimmed;
  }
  return trimmed;
}

export function getAgentApkDownloadUrl(): string | null {
  const configured = (
    process.env.NEXT_PUBLIC_MANAGER_APK_URL ||
    process.env.NEXT_PUBLIC_AGENT_APK_URL
  )?.trim();
  if (configured) {
    const normalized = normalizeApkDownloadUrl(configured);
    if (!/drive\.google\.com|docs\.google\.com/i.test(normalized)) {
      return withAgentApkCacheBust(normalized);
    }
  }

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host.includes('localhost') || host.includes('127.0.0.1')) {
      return withAgentApkCacheBust(`${window.location.origin}${DEFAULT_APK_PATH}`);
    }
  }

  return withAgentApkCacheBust(CANONICAL_AGENT_APK_URL);
}
