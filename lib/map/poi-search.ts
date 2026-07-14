import type { LocationContext } from "@/lib/map/location-search";
import {
  fetchBusinessesInBbox,
  fetchBusinessesNearPoint,
  isBboxTooLarge,
  resolvePoiStyle,
  type PoiResult,
} from "@/lib/map/overpass-search";
import { getMapboxPublicToken } from "@/lib/config/public-env";
import {
  createSearchSessionToken,
  retrievePlaceByMapboxId,
  suggestPlaces,
} from "@/lib/utils/place-search";

const MAPBOX_POI_QUERIES = ["supermarket", "restaurant", "bank", "pharmacy", "hotel", "hospital"];
const GOOGLE_NEARBY_RETRY_AFTER_MS = 30_000;
let googleNearbyUnavailableUntil = 0;

function deriveRadiusM(ctx: LocationContext): number {
  if (ctx.bbox) {
    const [minLng, minLat, maxLng, maxLat] = ctx.bbox;
    const latMid = (minLat + maxLat) / 2;
    const lngKm = (maxLng - minLng) * 111 * Math.cos((latMid * Math.PI) / 180);
    const latKm = (maxLat - minLat) * 111;
    const radius = (Math.max(lngKm, latKm) * 1000) / 2;
    return Math.min(Math.max(radius, 500), 3000);
  }
  return Math.min(ctx.radiusKm * 1000, 3000);
}

function isOverpassFallbackEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_ENABLE_OVERPASS_POI_FALLBACK === "true" ||
    process.env.ENABLE_OVERPASS_POI_FALLBACK === "true"
  );
}

async function fetchGoogleNearby(ctx: LocationContext): Promise<PoiResult[]> {
  if (Date.now() < googleNearbyUnavailableUntil) return [];

  const lat = ctx.center[1];
  const lng = ctx.center[0];

  try {
    const response = await fetch("/api/places/nearby", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat,
        lng,
        radiusM: deriveRadiusM(ctx),
        bbox: ctx.bbox ?? undefined,
      }),
    });

    if (response.status === 503) {
      googleNearbyUnavailableUntil = Date.now() + GOOGLE_NEARBY_RETRY_AFTER_MS;
      return [];
    }

    if (!response.ok) return [];

    const payload = (await response.json()) as {
      enabled?: boolean;
      places?: PoiResult[];
    };

    if (payload.enabled === false) return [];
    return payload.places ?? [];
  } catch {
    return [];
  }
}

async function fetchMapboxPoiFallback(ctx: LocationContext): Promise<PoiResult[]> {
  const token = getMapboxPublicToken();
  if (!token) return [];

  const sessionToken = createSearchSessionToken();
  const proximity: [number, number] = ctx.center;
  const seen = new Set<string>();
  const results: PoiResult[] = [];

  for (const keyword of MAPBOX_POI_QUERIES) {
    const suggestions = await suggestPlaces(keyword, {
      sessionToken,
      proximity,
      limit: 3,
      token,
      skipGoogle: true,
    });

    for (const suggestion of suggestions) {
      if (suggestion.provider !== "mapbox" || seen.has(suggestion.id)) continue;

      const place = await retrievePlaceByMapboxId(suggestion.id, sessionToken, { token });
      if (!place) continue;

      seen.add(suggestion.id);
      const category = suggestion.category ?? "business";
      const style = resolvePoiStyle(category);

      results.push({
        id: suggestion.id,
        lat: place.lat,
        lng: place.lng,
        name: place.name,
        category,
        categoryLabel: style.label,
        categoryColor: style.color,
        address: place.address || undefined,
      });

      if (results.length >= 40) return results;
    }
  }

  return results;
}

async function fetchOverpassFallback(ctx: LocationContext): Promise<PoiResult[]> {
  if (ctx.bbox) {
    return fetchBusinessesInBbox(ctx.bbox);
  }
  return fetchBusinessesNearPoint(ctx.center[1], ctx.center[0]);
}

export async function fetchPlacesInArea(
  ctx: LocationContext,
  options?: { skipGoogleNearby?: boolean },
): Promise<PoiResult[]> {
  if (ctx.bbox && isBboxTooLarge(ctx.bbox)) return [];

  if (!options?.skipGoogleNearby) {
    const googleResults = await fetchGoogleNearby(ctx);
    if (googleResults.length > 0) return googleResults;
  }

  const mapboxResults = await fetchMapboxPoiFallback(ctx);
  if (mapboxResults.length > 0) return mapboxResults;

  if (isOverpassFallbackEnabled()) {
    return fetchOverpassFallback(ctx);
  }

  return [];
}
