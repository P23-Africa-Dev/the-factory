import { env } from '@/constants/env';

export const DEFAULT_AVATAR =
  process.env.NEXT_PUBLIC_AVATAR_DEFAULT_URL ??
  'https://factory23-storage.lon1.cdn.digitaloceanspaces.com/avatar/default/ghost.svg';

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
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveAvatarSrc(
  rawAvatar: string | null | undefined,
  fallback: string = DEFAULT_AVATAR,
): string {
  return getSafeAvatarSrc(rawAvatar) ?? fallback;
}
