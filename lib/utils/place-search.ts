import {
  placesAutocomplete,
  placesDetails,
  type PlacesApiPlace,
} from "@/lib/api/places";

/**
 * Unified place search via Laravel Places orchestrator
 * (Geoapify → Foursquare → Google). Mapbox is not used for search.
 */

const CLIENT_CACHE_TTL_MS = 60_000;
const CLIENT_CACHE_MAX = 100;

type CacheEntry = { value: PlaceSuggestion[]; expiresAt: number };
const suggestCache = new Map<string, CacheEntry>();
const suggestInflight = new Map<string, Promise<PlaceSuggestion[]>>();

export type PlaceSuggestion = {
  provider: string;
  id: string;
  name: string;
  placeFormatted: string;
  category: string | null;
  sessionToken: string;
  fullAddress?: string | null;
  featureType?: string;
  maki?: string | null;
  confidence?: number | null;
  latitude?: number | null;
  longitude?: number | null;
};

export type RetrievedPlace = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  bbox: [number, number, number, number] | null;
  provider: string;
};

export function createSearchSessionToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function suggestCacheKey(
  query: string,
  options: { proximity?: [number, number]; limit?: number },
): string {
  const prox =
    options.proximity &&
    Number.isFinite(options.proximity[0]) &&
    Number.isFinite(options.proximity[1])
      ? `${options.proximity[0].toFixed(3)},${options.proximity[1].toFixed(3)}`
      : "_";
  return [query.toLowerCase(), prox, String(options.limit ?? 6)].join("|");
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

export function __resetPlaceSearchCachesForTests(): void {
  suggestCache.clear();
  suggestInflight.clear();
}

function mapSuggestion(item: PlacesApiPlace, sessionToken: string): PlaceSuggestion {
  return {
    provider: item.provider || "unknown",
    id: item.id,
    name: item.name?.trim() || "Place",
    placeFormatted: item.formatted_address?.trim() ?? "",
    category: item.categories?.[0] ?? null,
    sessionToken,
    fullAddress: item.formatted_address?.trim() || null,
    confidence: item.confidence ?? null,
    latitude: typeof item.latitude === "number" ? item.latitude : null,
    longitude: typeof item.longitude === "number" ? item.longitude : null,
  };
}

/**
 * Place suggestions via Laravel (provider-agnostic).
 * `skipGoogle` / `forceGoogle` / `token` retained for API compatibility but ignored —
 * provider selection is server-side.
 */
export async function suggestPlaces(
  query: string,
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
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const key = suggestCacheKey(trimmed, options);
  const cached = getCachedSuggestions(key);
  if (cached) {
    return cached.map((s) => ({ ...s, sessionToken: options.sessionToken }));
  }

  const existing = suggestInflight.get(key);
  if (existing) {
    const results = await existing;
    return results.map((s) => ({ ...s, sessionToken: options.sessionToken }));
  }

  const promise = (async () => {
    try {
      const envelope = await placesAutocomplete(trimmed, {
        lat: options.proximity?.[1],
        lng: options.proximity?.[0],
        limit: options.limit ?? 6,
        signal: options.signal,
      });
      return (envelope.data ?? []).map((item) => mapSuggestion(item, options.sessionToken));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      return [];
    }
  })()
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

export async function retrievePlace(
  suggestion: PlaceSuggestion,
): Promise<RetrievedPlace | null> {
  const suggestionHasCoords =
    typeof suggestion.latitude === "number" &&
    typeof suggestion.longitude === "number" &&
    Number.isFinite(suggestion.latitude) &&
    Number.isFinite(suggestion.longitude);

  try {
    const envelope = await placesDetails(suggestion.id, suggestion.provider);
    const place = envelope.data?.[0];
    if (place && typeof place.latitude === "number" && typeof place.longitude === "number") {
      return {
        placeId: place.id,
        name: place.name?.trim() || suggestion.name || "Location",
        address: place.formatted_address?.trim() || suggestion.placeFormatted || "",
        lat: place.latitude,
        lng: place.longitude,
        bbox: place.bbox ?? null,
        provider: place.provider || suggestion.provider,
      };
    }
  } catch {
    // Fall through to suggestion coords when details fails.
  }

  // Autocomplete often already includes coordinates — use them so map fly-to still works
  // when place-details returns a polygon-only geometry or the provider is down.
  if (suggestionHasCoords) {
    return {
      placeId: suggestion.id,
      name: suggestion.name || "Location",
      address: suggestion.placeFormatted || suggestion.fullAddress || suggestion.name || "",
      lat: suggestion.latitude as number,
      lng: suggestion.longitude as number,
      bbox: null,
      provider: suggestion.provider,
    };
  }

  return null;
}

/** @deprecated Prefer retrievePlace(suggestion). */
export async function retrievePlaceByMapboxId(
  mapboxId: string,
  sessionToken: string,
): Promise<RetrievedPlace | null> {
  void sessionToken;
  return retrievePlace({
    provider: "geoapify",
    id: mapboxId,
    name: "Location",
    placeFormatted: "",
    category: null,
    sessionToken: createSearchSessionToken(),
  });
}
