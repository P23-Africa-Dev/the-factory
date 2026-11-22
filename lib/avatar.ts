import type { SyntheticEvent } from "react";

const SPACES_ORIGIN =
  process.env.NEXT_PUBLIC_SPACES_ORIGIN_URL ??
  "https://factory23-files-45822258.lon1.digitaloceanspaces.com";

/** Bump when catalog objects on Spaces are re-encoded so browsers skip stale caches. */
export const CATALOG_AVATAR_CACHE_VERSION = "png192";

export const DEFAULT_AVATAR =
  process.env.NEXT_PUBLIC_AVATAR_DEFAULT_URL ??
  `${SPACES_ORIGIN}/avatar/default/ghost.svg`;

/**
 * DigitalOcean CDN hostnames can 404 when CDN is disabled or not yet propagated.
 * Keep the same bucket hostname and only strip the `.cdn.` segment.
 * Never rewrite onto a different bucket (that broke avatars after the Spaces move).
 */
export function normalizeSpacesAvatarUrl(url: string): string {
  return url.replace(
    /\.cdn\.digitaloceanspaces\.com/g,
    ".digitaloceanspaces.com",
  );
}

/** Legacy bucket hostname from the pre-migration Spaces account. */
function rewriteLegacySpacesHost(url: string): string {
  return url.replace(
    /https?:\/\/factory23-storage(\.cdn)?\.lon1\.digitaloceanspaces\.com/gi,
    SPACES_ORIGIN,
  );
}

/**
 * Catalog avatars must load as PNG. WebP-in-SVG shells render blank in <img>,
 * and legacy absolute .svg URLs in user records should follow the PNG objects.
 */
export function preferCatalogPngUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.pathname = parsed.pathname.replace(
      /(\/avatar\/(?:male|female)\/[^/]+)\.svg$/i,
      "$1.png",
    );
    return parsed.toString();
  } catch {
    return url.replace(
      /(\/avatar\/(?:male|female)\/[^/]+)\.svg(\?|$)/i,
      "$1.png$2",
    );
  }
}

/**
 * Catalog objects were replaced in-place. Append a stable version query so
 * clients that cached blank/heavy bodies refetch the PNG assets.
 */
export function withCatalogAvatarCacheBust(url: string): string {
  try {
    const parsed = new URL(url);
    if (!/\/avatar\/(male|female)\/[^/]+\.(png|webp|svg)$/i.test(parsed.pathname)) {
      return url;
    }
    if (!parsed.searchParams.has("v")) {
      parsed.searchParams.set("v", CATALOG_AVATAR_CACHE_VERSION);
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

function finalizeAvatarUrl(url: string): string {
  return withCatalogAvatarCacheBust(
    preferCatalogPngUrl(
      normalizeSpacesAvatarUrl(rewriteLegacySpacesHost(url)),
    ),
  );
}

/**
 * Normalize avatar values from API payloads into a browser-safe image src.
 * Prefers absolute Spaces URLs; maps bare `avatar/...` keys to the public
 * Spaces origin (optimized catalog objects), not the API `/storage` proxy.
 */
export function getSafeAvatarSrc(
  rawAvatar: string | null | undefined,
): string | null {
  if (!rawAvatar) return null;

  const trimmed = rawAvatar.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/")) {
    if (trimmed.startsWith("/avatar/")) {
      return finalizeAvatarUrl(`${SPACES_ORIGIN}${trimmed}`);
    }
    return trimmed;
  }

  if (trimmed.startsWith("avatar/")) {
    // Bare storage path — prefer png for catalog gender folders.
    const asPng = trimmed.replace(
      /^(avatar\/(?:male|female)\/[^/]+)\.svg$/i,
      "$1.png",
    );
    return finalizeAvatarUrl(`${SPACES_ORIGIN}/${asPng}`);
  }

  if (trimmed.startsWith("storage/")) {
    const withoutStorage = trimmed.replace(/^storage\//, "");
    if (withoutStorage.startsWith("avatar/")) {
      return getSafeAvatarSrc(withoutStorage);
    }
    const apiBase =
      process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1";
    const origin = apiBase.replace(/\/api\/v1\/?$/, "");
    return `${origin}/${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return finalizeAvatarUrl(parsed.toString());
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

export function onAvatarError(
  event: SyntheticEvent<HTMLImageElement, Event>,
  fallback: string = DEFAULT_AVATAR,
): void {
  const target = event.currentTarget;

  if (target.dataset.avatarFallbackApplied === "true") {
    target.style.visibility = "hidden";
    return;
  }

  target.dataset.avatarFallbackApplied = "true";
  target.src = finalizeAvatarUrl(fallback);
}
