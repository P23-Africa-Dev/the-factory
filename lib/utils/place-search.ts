import { getMapboxPublicToken } from "@/lib/config/public-env";
import {
  areSuggestResultsAcceptable,
  isForceGooglePrimary,
} from "@/lib/map/place-result-quality";
import { ingestCreditMeta } from "@/store/map-credits";

/**
 * Unified place search: Mapbox Search Box primary, Google Places (New) via
 * server proxy only when Mapbox results fail the quality gate.
 */

const SEARCHBOX_BASE = "https://api.mapbox.com/search/searchbox/v1";

const CLIENT_CACHE_TTL_MS = 60_000;
const CLIENT_CACHE_MAX = 100;

type CacheEntry = { value: PlaceSuggestion[]; expiresAt: number };
const suggestCache = new Map<string, CacheEntry>();
const suggestInflight = new Map<string, Promise<PlaceSuggestion[]>>();

export type PlaceSuggestion = {
  provider: "google" | "mapbox";
  id: string;
  name: string;
  placeFormatted: string;
  category: string | null;
  sessionToken: string;
  /** Mapbox-only extras (optional) */
  fullAddress?: string | null;
  featureType?: string;
  maki?: string | null;
};

export type RetrievedPlace = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  bbox: [number, number, number, number] | null;
  provider: "google" | "mapbox";
};

export function createSearchSessionToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function suggestCacheKey(
  query: string,
  options: {
    proximity?: [number, number];
    limit?: number;
    skipGoogle?: boolean;
    forceGoogle?: boolean;
  },
): string {
  const prox =
    options.proximity &&
    Number.isFinite(options.proximity[0]) &&
    Number.isFinite(options.proximity[1])
      ? `${options.proximity[0].toFixed(3)},${options.proximity[1].toFixed(3)}`
      : "_";
  return [
    query.toLowerCase(),
    prox,
    String(options.limit ?? 6),
    options.skipGoogle ? "sg" : "",
    options.forceGoogle || isForceGooglePrimary() ? "fg" : "",
  ].join("|");
}

function getCachedSuggestions(key: string): PlaceSuggestion[] | null {
  const entry = suggestCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    suggestCache.delete(key);
    return null;
  }
  return entry.value;
}

function setCachedSuggestions(key: string, value: PlaceSuggestion[]): void {
  if (suggestCache.size >= CLIENT_CACHE_MAX) {
    const first = suggestCache.keys().next().value;
    if (first) suggestCache.delete(first);
  }
  suggestCache.set(key, { value, expiresAt: Date.now() + CLIENT_CACHE_TTL_MS });
}

/** Test helper — clears client suggest cache + inflight map. */
export function __resetPlaceSearchCachesForTests(): void {
  suggestCache.clear();
  suggestInflight.clear();
}

async function suggestPlacesGoogle(
  query: string,
  options: {
    sessionToken: string;
    proximity?: [number, number];
    limit?: number;
    signal?: AbortSignal;
  },
): Promise<PlaceSuggestion[]> {
  try {
    const response = await fetch("/api/places/autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        input: query,
        sessionToken: options.sessionToken,
        lat: options.proximity?.[1],
        lng: options.proximity?.[0],
        limit: options.limit ?? 6,
      }),
      signal: options.signal,
    });

    if (response.status === 503) return [];

    const payload = (await response.json()) as {
      enabled?: boolean;
      credits?: unknown;
      suggestions?: Array<{
        placeId?: string;
        name?: string;
        placeFormatted?: string;
        category?: string | null;
      }>;
    };

    ingestCreditMeta(payload.credits);

    if (!response.ok || payload.enabled === false) return [];

    return (payload.suggestions ?? [])
      .filter((item) => item.placeId && item.name)
      .map((item) => ({
        provider: "google" as const,
        id: item.placeId!,
        name: item.name!.trim(),
        placeFormatted: item.placeFormatted?.trim() ?? "",
        category: item.category ?? null,
        sessionToken: options.sessionToken,
      }));
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return [];
  }
}

async function suggestPlacesMapbox(
  query: string,
  options: {
    sessionToken: string;
    proximity?: [number, number];
    country?: string;
    limit?: number;
    token?: string;
    signal?: AbortSignal;
  },
): Promise<PlaceSuggestion[]> {
  const token = options.token ?? getMapboxPublicToken();
  if (!token) return [];

  const params = new URLSearchParams({
    q: query,
    access_token: token,
    session_token: options.sessionToken,
    limit: String(options.limit ?? 6),
    types: "country,region,place,locality,neighborhood,address,poi,street",
  });
  if (options.country) params.set("country", options.country);
  if (options.proximity) {
    params.set("proximity", `${options.proximity[0]},${options.proximity[1]}`);
  }
  if (typeof navigator !== "undefined" && navigator.language) {
    params.set("language", navigator.language.split("-")[0]);
  }

  try {
    const response = await fetch(`${SEARCHBOX_BASE}/suggest?${params.toString()}`, {
      signal: options.signal,
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as {
      suggestions?: Array<{
        mapbox_id?: string;
        name?: string;
        place_formatted?: string;
        full_address?: string;
        feature_type?: string;
        poi_category?: string[];
        maki?: string;
      }>;
    };

    return (payload.suggestions ?? [])
      .filter((s) => !!s.mapbox_id && !!s.name)
      .map((s) => ({
        provider: "mapbox" as const,
        id: s.mapbox_id!,
        name: s.name!.trim(),
        placeFormatted: s.place_formatted?.trim() ?? "",
        category: s.poi_category?.[0] ?? null,
        sessionToken: options.sessionToken,
        fullAddress: s.full_address?.trim() || null,
        featureType: s.feature_type ?? "place",
        maki: s.maki ?? null,
      }));
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return [];
  }
}

async function suggestPlacesUncached(
  trimmed: string,
  options: {
    sessionToken: string;
    proximity?: [number, number];
    country?: string;
    limit?: number;
    token?: string;
    skipGoogle?: boolean;
    forceGoogle?: boolean;
    signal?: AbortSignal;
  },
): Promise<PlaceSuggestion[]> {
  const forceGoogle = options.forceGoogle === true || isForceGooglePrimary();

  if (forceGoogle && !options.skipGoogle) {
    const googleResults = await suggestPlacesGoogle(trimmed, options);
    if (googleResults.length > 0) return googleResults;
    return suggestPlacesMapbox(trimmed, options);
  }

  const mapboxResults = await suggestPlacesMapbox(trimmed, options);
  if (
    areSuggestResultsAcceptable(mapboxResults, { query: trimmed }) ||
    options.skipGoogle
  ) {
    return mapboxResults;
  }

  const googleResults = await suggestPlacesGoogle(trimmed, options);
  if (googleResults.length > 0) return googleResults;

  return mapboxResults;
}

/**
 * Mapbox-first place suggestions. Google is only called when Mapbox fails the
 * quality gate (unless skipGoogle / forceGoogle / env override).
 */
export async function suggestPlaces(
  query: string,
  options: {
    sessionToken: string;
    proximity?: [number, number];
    country?: string;
    limit?: number;
    token?: string;
    /** When true, skip Google and use Mapbox only (e.g. POI area fallback). */
    skipGoogle?: boolean;
    /** Emergency: try Google before Mapbox (tests / ops override). */
    forceGoogle?: boolean;
    signal?: AbortSignal;
  },
): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const key = suggestCacheKey(trimmed, options);
  const cached = getCachedSuggestions(key);
  if (cached) {
    // Re-bind session token so retrieve still bills the current session.
    return cached.map((s) => ({ ...s, sessionToken: options.sessionToken }));
  }

  const existing = suggestInflight.get(key);
  if (existing) {
    const results = await existing;
    return results.map((s) => ({ ...s, sessionToken: options.sessionToken }));
  }

  const promise = suggestPlacesUncached(trimmed, options)
    .then((results) => {
      setCachedSuggestions(key, results);
      return results;
    })
    .finally(() => {
      suggestInflight.delete(key);
    });

  suggestInflight.set(key, promise);
  return promise;
}

async function retrievePlaceGoogle(
  placeId: string,
  sessionToken: string,
  fallbackName?: string,
): Promise<RetrievedPlace | null> {
  try {
    const params = new URLSearchParams({
      placeId,
      sessionToken,
    });
    const response = await fetch(`/api/places/details?${params.toString()}`);
    if (response.status === 503 || !response.ok) return null;

    const payload = (await response.json()) as {
      name?: string;
      address?: string;
      lat?: number;
      lng?: number;
      bbox?: [number, number, number, number] | null;
      credits?: unknown;
    };

    ingestCreditMeta(payload.credits);

    if (typeof payload.lat !== "number" || typeof payload.lng !== "number") return null;

    return {
      placeId,
      // Prefer the name already returned by autocomplete so Place Details can stay
      // on the cheaper Essentials SKU (no displayName field requested).
      name: fallbackName?.trim() || payload.name?.trim() || "Location",
      address: payload.address?.trim() || "",
      lat: payload.lat,
      lng: payload.lng,
      bbox: payload.bbox ?? null,
      provider: "google",
    };
  } catch {
    return null;
  }
}

async function retrievePlaceMapbox(
  mapboxId: string,
  sessionToken: string,
  options?: { token?: string },
): Promise<RetrievedPlace | null> {
  const token = options?.token ?? getMapboxPublicToken();
  if (!token || !mapboxId) return null;

  const params = new URLSearchParams({
    access_token: token,
    session_token: sessionToken,
  });

  try {
    const response = await fetch(
      `${SEARCHBOX_BASE}/retrieve/${encodeURIComponent(mapboxId)}?${params.toString()}`,
    );
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number] };
        properties?: {
          name?: string;
          full_address?: string;
          place_formatted?: string;
          bbox?: number[];
        };
      }>;
    };

    const feature = payload.features?.[0];
    const coordinates = feature?.geometry?.coordinates;
    if (!coordinates || coordinates.length !== 2) return null;

    const [lng, lat] = coordinates;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    const props = feature.properties ?? {};
    const rawBbox = props.bbox;

    return {
      placeId: mapboxId,
      name: props.name?.trim() || "Location",
      address: props.full_address?.trim() || props.place_formatted?.trim() || "",
      lat,
      lng,
      bbox:
        Array.isArray(rawBbox) && rawBbox.length === 4
          ? (rawBbox as [number, number, number, number])
          : null,
      provider: "mapbox",
    };
  } catch {
    return null;
  }
}

export async function retrievePlace(
  suggestion: PlaceSuggestion,
  options?: { token?: string },
): Promise<RetrievedPlace | null> {
  if (suggestion.provider === "google") {
    return retrievePlaceGoogle(suggestion.id, suggestion.sessionToken, suggestion.name);
  }
  return retrievePlaceMapbox(suggestion.id, suggestion.sessionToken, options);
}

/** @deprecated Use retrievePlace(suggestion) — kept for internal Mapbox POI fallback. */
export async function retrievePlaceByMapboxId(
  mapboxId: string,
  sessionToken: string,
  options?: { token?: string },
): Promise<RetrievedPlace | null> {
  return retrievePlaceMapbox(mapboxId, sessionToken, options);
}
