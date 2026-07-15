/**
 * Unified place search for the Agent PWA.
 *
 * Two-provider waterfall:
 *   1. Google Places API (New) via server proxy at /api/places/autocomplete
 *   2. Mapbox Search Box API — automatic fallback when Google is unavailable or empty
 *
 * Follows the Mapbox Search Box billing model:
 *   - `suggestPlaces` returns lightweight typeahead suggestions (no coordinates)
 *   - `retrievePlace` resolves a suggestion's id to full coordinates + bbox
 *   - Both calls share the same `sessionToken`; rotate after each retrieval.
 */

import { getMapboxPublicToken } from '@/lib/map/public-env';
import { appStore, getActiveCompanyId } from '@/lib/storage/stores';

const SEARCHBOX_BASE = 'https://api.mapbox.com/search/searchbox/v1';

/**
 * Auth headers so the Places proxy can meter Google usage against the agent's
 * organization credits. The PWA stores its token in localStorage (separate
 * origin), so it must be forwarded explicitly.
 */
function creditAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  try {
    const token = appStore.getString('auth_token');
    if (token) headers.Authorization = `Bearer ${token}`;
    const companyId = getActiveCompanyId();
    if (companyId != null) headers['X-Company-Id'] = String(companyId);
  } catch {
    // Non-fatal — request proceeds unmetered.
  }
  return headers;
}

export type PlaceSuggestion = {
  provider: 'google' | 'mapbox';
  /** placeId for Google, mapbox_id for Mapbox */
  id: string;
  name: string;
  placeFormatted: string;
  category: string | null;
  /** Must be forwarded to retrievePlace for correct billing */
  sessionToken: string;
  /** Mapbox-only extras */
  fullAddress?: string | null;
  featureType?: string;
  maki?: string | null;
};

export type RetrievedPlace = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  bbox: [number, number, number, number] | null;
  provider: 'google' | 'mapbox';
};

export function createSearchSessionToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// ─── Google provider (server proxy) ──────────────────────────────────────────

async function suggestPlacesGoogle(
  query: string,
  options: { sessionToken: string; proximity?: [number, number]; limit?: number },
): Promise<PlaceSuggestion[]> {
  try {
    const response = await fetch('/api/places/autocomplete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...creditAuthHeaders() },
      body: JSON.stringify({
        input: query,
        sessionToken: options.sessionToken,
        lat: options.proximity?.[1],
        lng: options.proximity?.[0],
        limit: options.limit ?? 6,
      }),
    });

    if (response.status === 503) return [];

    const payload = (await response.json()) as {
      enabled?: boolean;
      suggestions?: Array<{ placeId?: string; name?: string; placeFormatted?: string; category?: string | null }>;
    };

    if (!response.ok || payload.enabled === false) return [];

    return (payload.suggestions ?? [])
      .filter((item) => item.placeId && item.name)
      .map((item) => ({
        provider: 'google' as const,
        id: item.placeId!,
        name: item.name!.trim(),
        placeFormatted: item.placeFormatted?.trim() ?? '',
        category: item.category ?? null,
        sessionToken: options.sessionToken,
      }));
  } catch {
    return [];
  }
}

async function retrievePlaceGoogle(
  placeId: string,
  sessionToken: string,
  fallbackName?: string,
): Promise<RetrievedPlace | null> {
  try {
    const params = new URLSearchParams({ placeId, sessionToken });
    const response = await fetch(`/api/places/details?${params.toString()}`, {
      headers: creditAuthHeaders(),
    });
    if (response.status === 503 || !response.ok) return null;

    const payload = (await response.json()) as {
      name?: string;
      address?: string;
      lat?: number;
      lng?: number;
      bbox?: [number, number, number, number] | null;
    };

    if (typeof payload.lat !== 'number' || typeof payload.lng !== 'number') return null;

    return {
      // Prefer the autocomplete suggestion name so Place Details stays on the
      // cheaper Essentials SKU (no displayName field requested).
      name: fallbackName?.trim() || payload.name?.trim() || 'Location',
      address: payload.address?.trim() || '',
      lat: payload.lat,
      lng: payload.lng,
      bbox: payload.bbox ?? null,
      provider: 'google',
    };
  } catch {
    return null;
  }
}

// ─── Mapbox Search Box provider ───────────────────────────────────────────────

async function suggestPlacesMapbox(
  query: string,
  options: {
    sessionToken: string;
    proximity?: [number, number];
    country?: string;
    limit?: number;
    token?: string;
  },
): Promise<PlaceSuggestion[]> {
  const token = options.token ?? getMapboxPublicToken();
  if (!token) return [];

  const params = new URLSearchParams({
    q: query,
    access_token: token,
    session_token: options.sessionToken,
    limit: String(options.limit ?? 6),
    types: 'country,region,place,locality,neighborhood,address,poi,street',
  });
  if (options.country) params.set('country', options.country);
  if (options.proximity) {
    params.set('proximity', `${options.proximity[0]},${options.proximity[1]}`);
  }
  if (typeof navigator !== 'undefined' && navigator.language) {
    params.set('language', navigator.language.split('-')[0]);
  }

  try {
    const response = await fetch(`${SEARCHBOX_BASE}/suggest?${params.toString()}`);
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
        provider: 'mapbox' as const,
        id: s.mapbox_id!,
        name: s.name!.trim(),
        placeFormatted: s.place_formatted?.trim() ?? '',
        category: s.poi_category?.[0] ?? null,
        sessionToken: options.sessionToken,
        fullAddress: s.full_address?.trim() || null,
        featureType: s.feature_type ?? 'place',
        maki: s.maki ?? null,
      }));
  } catch {
    return [];
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
        properties?: { name?: string; full_address?: string; place_formatted?: string; bbox?: number[] };
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
      name: props.name?.trim() || 'Location',
      address: props.full_address?.trim() || props.place_formatted?.trim() || '',
      lat,
      lng,
      bbox:
        Array.isArray(rawBbox) && rawBbox.length === 4
          ? (rawBbox as [number, number, number, number])
          : null,
      provider: 'mapbox',
    };
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Two-step place suggestion. Try Google Places first (via server proxy),
 * fall back to Mapbox Search Box API if Google is unavailable.
 */
export async function suggestPlaces(
  query: string,
  options: {
    sessionToken: string;
    proximity?: [number, number];
    country?: string;
    limit?: number;
    token?: string;
    /** Skip Google and use Mapbox only (e.g. POI area fallback). */
    skipGoogle?: boolean;
  },
): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  if (!options.skipGoogle) {
    const googleResults = await suggestPlacesGoogle(trimmed, options);
    if (googleResults.length > 0) return googleResults;
  }

  return suggestPlacesMapbox(trimmed, options);
}

/**
 * Resolve a suggestion to full coordinates.
 * Routes to the correct provider based on `suggestion.provider`.
 */
export async function retrievePlace(
  suggestion: PlaceSuggestion,
  options?: { token?: string },
): Promise<RetrievedPlace | null> {
  if (suggestion.provider === 'google') {
    return retrievePlaceGoogle(suggestion.id, suggestion.sessionToken, suggestion.name);
  }
  return retrievePlaceMapbox(suggestion.id, suggestion.sessionToken, options);
}

/** @deprecated Use retrievePlace(suggestion) instead. Kept for internal Mapbox POI fallback. */
export async function retrievePlaceByMapboxId(
  mapboxId: string,
  sessionToken: string,
  options?: { token?: string },
): Promise<RetrievedPlace | null> {
  return retrievePlaceMapbox(mapboxId, sessionToken, options);
}
