import type { LocationContext } from "@/lib/map/location-search";
import {
  fetchBusinessesInBbox,
  fetchBusinessesNearPoint,
  isBboxTooLarge,
  resolvePoiStyle,
  type PoiResult,
} from "@/lib/map/overpass-search";
import {
  arePoiResultsAcceptable,
  isForceGooglePrimary,
} from "@/lib/map/place-result-quality";
import { getMapboxPublicToken } from "@/lib/config/public-env";
import {
  createSearchSessionToken,
  retrievePlaceByMapboxId,
  suggestPlaces,
} from "@/lib/utils/place-search";
import { ingestCreditMeta } from "@/store/map-credits";

const MAPBOX_POI_QUERIES = ["supermarket", "restaurant", "bank", "pharmacy", "hotel", "hospital"];
/** Cap retrieves per keyword to limit Mapbox Search Box session cost. */
const MAPBOX_RETRIEVE_PER_KEYWORD = 2;
const MAPBOX_MAX_POIS = 24;
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
      credits?: unknown;
    };

    ingestCreditMeta(payload.credits);

    if (payload.enabled === false) return [];
    return payload.places ?? [];
  } catch {
    return [];
  }
}

/**
 * Mapbox Search Box keyword sweep for nearby POIs.
 * Caps retrieves per keyword to avoid 24–36 serial billable retrieves.
 */
export async function fetchMapboxPoiFallback(ctx: LocationContext): Promise<PoiResult[]> {
  const token = getMapboxPublicToken();
  if (!token) return [];

  const sessionToken = createSearchSessionToken();
  const proximity: [number, number] = ctx.center;
  const seen = new Set<string>();
  const results: PoiResult[] = [];

  for (const keyword of MAPBOX_POI_QUERIES) {
    if (results.length >= MAPBOX_MAX_POIS) break;

    const suggestions = await suggestPlaces(keyword, {
      sessionToken,
      proximity,
      limit: MAPBOX_RETRIEVE_PER_KEYWORD,
      token,
      skipGoogle: true,
    });

    let retrievedForKeyword = 0;
    for (const suggestion of suggestions) {
      if (suggestion.provider !== "mapbox" || seen.has(suggestion.id)) continue;
      if (retrievedForKeyword >= MAPBOX_RETRIEVE_PER_KEYWORD) break;

      const place = await retrievePlaceByMapboxId(suggestion.id, sessionToken, { token });
      retrievedForKeyword += 1;
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

      if (results.length >= MAPBOX_MAX_POIS) return results;
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

/**
 * Area POI search: Mapbox (then optional Overpass) first; Google Nearby only when
 * non-Google results fail the quality gate (unless forceGoogle / skipGoogleNearby).
 */
export async function fetchPlacesInArea(
  ctx: LocationContext,
  options?: {
    skipGoogleNearby?: boolean;
    /** Prefer Google Nearby before Mapbox (ops/tests only). */
    forceGoogleNearby?: boolean;
  },
): Promise<PoiResult[]> {
  if (ctx.bbox && isBboxTooLarge(ctx.bbox)) return [];

  const forceGoogle =
    options?.forceGoogleNearby === true || isForceGooglePrimary();
  const allowGoogle = !options?.skipGoogleNearby;

  if (forceGoogle && allowGoogle) {
    const googleResults = await fetchGoogleNearby(ctx);
    if (googleResults.length > 0) return googleResults;
  }

  const mapboxResults = await fetchMapboxPoiFallback(ctx);
  if (arePoiResultsAcceptable(mapboxResults)) {
    return mapboxResults;
  }

  let bestNonGoogle = mapboxResults;

  if (isOverpassFallbackEnabled()) {
    const overpassResults = await fetchOverpassFallback(ctx);
    if (arePoiResultsAcceptable(overpassResults)) {
      return overpassResults;
    }
    if (overpassResults.length > bestNonGoogle.length) {
      bestNonGoogle = overpassResults;
    }
  }

  if (allowGoogle && !forceGoogle) {
    const googleResults = await fetchGoogleNearby(ctx);
    if (googleResults.length > 0) return googleResults;
  }

  return bestNonGoogle;
}
