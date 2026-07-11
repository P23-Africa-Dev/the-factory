import { getMapboxPublicToken } from "@/lib/config/public-env";

/**
 * Place search backed by the Mapbox Search Box API, which — unlike the legacy
 * Geocoding v5 API — covers businesses, brands and POIs (e.g. "Shoprite",
 * "University of Lagos") in addition to addresses and administrative areas.
 *
 * It is a two-step flow per Mapbox's design:
 *   1. `suggestPlaces` returns typeahead suggestions (no coordinates).
 *   2. `retrievePlace` resolves a suggestion's `mapboxId` to coordinates.
 * Both calls should share the same session token for session-based billing.
 */

const SEARCHBOX_BASE = "https://api.mapbox.com/search/searchbox/v1";

export type PlaceSuggestion = {
  mapboxId: string;
  name: string;
  placeFormatted: string;
  fullAddress: string | null;
  featureType: string;
  category: string | null;
  maki: string | null;
};

export type RetrievedPlace = {
  name: string;
  address: string;
  lat: number;
  lng: number;
  bbox: [number, number, number, number] | null;
};

export function createSearchSessionToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function suggestPlaces(
  query: string,
  options: {
    sessionToken: string;
    proximity?: [number, number]; // [lng, lat]
    country?: string;
    limit?: number;
    token?: string;
  },
): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const token = options.token ?? getMapboxPublicToken();
  if (!token) return [];

  const params = new URLSearchParams({
    q: trimmed,
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
        mapboxId: s.mapbox_id!,
        name: s.name!.trim(),
        placeFormatted: s.place_formatted?.trim() ?? "",
        fullAddress: s.full_address?.trim() || null,
        featureType: s.feature_type ?? "place",
        category: s.poi_category?.[0] ?? null,
        maki: s.maki ?? null,
      }));
  } catch {
    return [];
  }
}

export async function retrievePlace(
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
      name: props.name?.trim() || "Location",
      address: props.full_address?.trim() || props.place_formatted?.trim() || "",
      lat,
      lng,
      bbox:
        Array.isArray(rawBbox) && rawBbox.length === 4
          ? (rawBbox as [number, number, number, number])
          : null,
    };
  } catch {
    return null;
  }
}
