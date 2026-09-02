import { env } from '@/constants/env';

const SPACES_ORIGIN =
  process.env.NEXT_PUBLIC_SPACES_ORIGIN_URL ??
  'https://factory23-storage.lon1.digitaloceanspaces.com';

export const DEFAULT_AVATAR =
  process.env.NEXT_PUBLIC_AVATAR_DEFAULT_URL ??
  `${SPACES_ORIGIN}/avatar/default/ghost.svg`;

export function normalizeSpacesAvatarUrl(url: string): string {
  try {
    const parsed = new URL(url);

    if (!parsed.hostname.endsWith('.cdn.digitaloceanspaces.com')) {
      return url;
    }

    const origin = new URL(SPACES_ORIGIN);
    parsed.hostname = origin.hostname;
    parsed.protocol = origin.protocol;

    return parsed.toString();
  } catch {
    return url.replace(/\.cdn\.digitaloceanspaces\.com/g, '.digitaloceanspaces.com');
  }
}

export function getSafeAvatarSrc(rawAvatar: string | null | undefined): string | null {
  if (!rawAvatar) return null;
  const trimmed = rawAvatar.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/')) return trimmed;

  if (trimmed.startsWith('avatar/') || trimmed.startsWith('storage/')) {
    const apiOrigin = env.API_BASE_URL.replace(/\/api\/v1\/?$/, '');
    if (trimmed.startsWith('storage/')) {
      return `${apiOrigin}/${trimmed}`;
    }
    return `${apiOrigin}/storage/${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return normalizeSpacesAvatarUrl(parsed.toString());
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveAvatarSrc(
  rawAvatar: string | null | undefined,
  fallback = DEFAULT_AVATAR,
): string {
  return getSafeAvatarSrc(rawAvatar) ?? fallback;
}
