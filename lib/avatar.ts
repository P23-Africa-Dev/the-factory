export const DEFAULT_AVATAR = "/avatars/default-ghost.svg";

function apiOrigin(): string {
  const apiBase =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1";

  return apiBase.replace(/\/api\/v1\/?$/, "");
}

/**
 * Normalize avatar values from API payloads into a browser-safe image src.
 * Prefers absolute CDN URLs returned by the backend; retains legacy relative
 * path support during the storage migration cutover.
 */
export function getSafeAvatarSrc(
  rawAvatar: string | null | undefined,
): string | null {
  if (!rawAvatar) return null;

  const trimmed = rawAvatar.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/")) return trimmed;

  if (trimmed.startsWith("avatar/") || trimmed.startsWith("storage/")) {
    const origin = apiOrigin();

    if (trimmed.startsWith("storage/")) {
      return `${origin}/${trimmed}`;
    }

    return `${origin}/storage/${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
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

import type { SyntheticEvent } from "react";

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
  target.src = fallback;
}
