/**
 * Unified place search for the Agent PWA via Laravel Places orchestrator
 * (Geoapify ∥ Foursquare, Google backstop). Mapbox is not used for search.
 */

import { client } from '@/lib/api/client';
import { getActiveCompanyId } from '@/lib/storage/stores';
import type { PlaceSourceRef } from '@/lib/map/place-attribution';

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
  latitude?: number | null;
  longitude?: number | null;
  sources?: PlaceSourceRef[];
  attributionVisible?: boolean;
};

export type RetrievedPlace = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  bbox: [number, number, number, number] | null;
  provider: string;
};

export function createSearchSessionToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

type PlacesApiPlace = {
  id: string;
  name: string;
  formatted_address: string;
  latitude?: number | null;
  longitude?: number | null;
  provider: string;
  categories?: string[];
  bbox?: [number, number, number, number] | null;
  sources?: { provider: string; id: string }[];
};

type PlacesResponse = {
  data?: PlacesApiPlace[];
  meta?: {
    credits?: unknown;
    attribution_visible?: boolean;
  };
};

const CLIENT_CACHE_TTL_MS = 60_000;
const DEFAULT_SUGGEST_LIMIT = 12;
const suggestCache = new Map<string, { value: PlaceSuggestion[]; expiresAt: number }>();
const suggestInflight = new Map<string, Promise<PlaceSuggestion[]>>();

let lastAttributionVisible = true;

export function getPlacesAttributionVisible(): boolean {
  return lastAttributionVisible;
}

export function __resetPlaceSearchCachesForTests(): void {
  suggestCache.clear();
  suggestInflight.clear();
  lastAttributionVisible = true;
}

function companyParams(): Record<string, string | number> {
  const companyId = getActiveCompanyId();
  return companyId != null ? { company_id: companyId } : {};
}

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

  const key = [
    trimmed.toLowerCase(),
    options.proximity?.map((n) => n.toFixed(3)).join(',') ?? '_',
    String(options.limit ?? DEFAULT_SUGGEST_LIMIT),
  ].join('|');

  const cached = suggestCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.value.map((s) => ({ ...s, sessionToken: options.sessionToken }));
  }

  const existing = suggestInflight.get(key);
  if (existing) {
    const results = await existing;
    return results.map((s) => ({ ...s, sessionToken: options.sessionToken }));
  }

  const promise = (async () => {
    try {
      const { data } = await client.get<PlacesResponse>('/places/autocomplete', {
        params: {
          q: trimmed,
          limit: options.limit ?? DEFAULT_SUGGEST_LIMIT,
          ...(options.proximity
            ? { lng: options.proximity[0], lat: options.proximity[1] }
            : {}),
          ...companyParams(),
          source: 'pwa',
        },
        signal: options.signal,
        suppressErrorToast: true,
      });

      const attributionVisible = data?.meta?.attribution_visible !== false;
      lastAttributionVisible = attributionVisible;

      const items = data?.data ?? [];
      return items.map((item) => {
        const sources =
          Array.isArray(item.sources) && item.sources.length > 0
            ? item.sources
                .filter((s) => s && typeof s.provider === 'string' && typeof s.id === 'string')
                .map((s) => ({ provider: s.provider, id: s.id }))
            : [{ provider: item.provider || 'unknown', id: item.id }];

        return {
          provider: item.provider || 'unknown',
          id: item.id,
          name: item.name?.trim() || 'Place',
          placeFormatted: item.formatted_address?.trim() ?? '',
          category: item.categories?.[0] ?? null,
          sessionToken: options.sessionToken,
          fullAddress: item.formatted_address?.trim() || null,
          latitude: typeof item.latitude === 'number' ? item.latitude : null,
          longitude: typeof item.longitude === 'number' ? item.longitude : null,
          sources,
          attributionVisible,
        };
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      return [];
    }
  })()
    .then((results) => {
      // Never cache empty arrays — empties are often transient.
      if (results.length > 0) {
        suggestCache.set(key, { value: results, expiresAt: Date.now() + CLIENT_CACHE_TTL_MS });
      }
      return results;
    })
    .finally(() => {
      suggestInflight.delete(key);
    });

  suggestInflight.set(key, promise);
  return promise;
}

export async function retrievePlace(suggestion: PlaceSuggestion): Promise<RetrievedPlace | null> {
  const suggestionHasCoords =
    typeof suggestion.latitude === 'number' &&
    typeof suggestion.longitude === 'number' &&
    Number.isFinite(suggestion.latitude) &&
    Number.isFinite(suggestion.longitude);

  // Skip details when autocomplete already returned fly-to-ready coords.
  if (suggestionHasCoords) {
    return {
      name: suggestion.name || 'Location',
      address: suggestion.placeFormatted || suggestion.fullAddress || suggestion.name || '',
      lat: suggestion.latitude as number,
      lng: suggestion.longitude as number,
      bbox: null,
      provider: suggestion.provider,
    };
  }

  try {
    const { data } = await client.get<PlacesResponse>('/places/details', {
      params: {
        id: suggestion.id,
        provider: suggestion.provider,
        ...companyParams(),
        source: 'pwa',
      },
      suppressErrorToast: true,
    });
    const place = data?.data?.[0];
    if (place && typeof place.latitude === 'number' && typeof place.longitude === 'number') {
      return {
        name: place.name?.trim() || suggestion.name || 'Location',
        address: place.formatted_address?.trim() || suggestion.placeFormatted || '',
        lat: place.latitude,
        lng: place.longitude,
        bbox: place.bbox ?? null,
        provider: place.provider || suggestion.provider,
      };
    }
  } catch {
    // Details failed and suggestion had no coords.
  }

  return null;
}

/** @deprecated Prefer retrievePlace */
export async function retrievePlaceByMapboxId(
  mapboxId: string,
  sessionToken: string,
): Promise<RetrievedPlace | null> {
  void sessionToken;
  return retrievePlace({
    provider: 'geoapify',
    id: mapboxId,
    name: 'Location',
    placeFormatted: '',
    category: null,
    sessionToken: createSearchSessionToken(),
  });
}
