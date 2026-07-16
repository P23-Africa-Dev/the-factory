import { NextResponse } from "next/server";
import { getGooglePlacesServerKey } from "@/lib/config/public-env";
import { googleNearbyPlaceToPoiResult, googleSearchNearby } from "@/lib/utils/google-places";
import { clientIdFromRequest, guardPlacesRequest } from "@/lib/server/places-guard";
import { consumeMapCredit, creditMeta } from "@/lib/server/map-credit-gate";

/** Shared cache key: adjacent viewports and other users in the same ~110m cell reuse one billed call. */
function nearbyCacheKey(lat: number, lng: number, radius: number): string {
  const mode = process.env.PLACES_NEARBY_BATCH_MODE?.trim().toLowerCase() === "split" ? "s" : "c";
  return `nearby:${mode}:${lat.toFixed(3)}:${lng.toFixed(3)}:${Math.round(radius / 250)}`;
}

// Cost control: by default all categories are requested in ONE Nearby Search
// call (Places New accepts many includedTypes per request), so a viewport
// refresh is billed once instead of three times. Set PLACES_NEARBY_BATCH_MODE=
// "split" to restore the legacy 3-call behaviour (more result variety, ~3x cost).
const COMBINED_TYPES: string[] = [
  "restaurant", "cafe", "bar", "meal_takeaway",
  "supermarket", "grocery_store", "shopping_mall", "convenience_store",
  "bank", "atm", "pharmacy", "hospital",
];

const SPLIT_TYPE_BATCHES: string[][] = [
  ["restaurant", "cafe", "bar", "meal_takeaway"],
  ["supermarket", "grocery_store", "shopping_mall", "convenience_store"],
  ["bank", "atm", "pharmacy", "hospital"],
];

function resolveTypeBatches(): string[][] {
  const mode = process.env.PLACES_NEARBY_BATCH_MODE?.trim().toLowerCase();
  return mode === "split" ? SPLIT_TYPE_BATCHES : [COMBINED_TYPES];
}

function deriveRadiusM(
  lat: number,
  lng: number,
  bbox?: [number, number, number, number],
  radiusM?: number,
): number {
  if (typeof radiusM === "number" && Number.isFinite(radiusM)) {
    return Math.min(Math.max(radiusM, 100), 5000);
  }

  if (bbox && bbox.length === 4) {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    const latMid = (minLat + maxLat) / 2;
    const lngKm = (maxLng - minLng) * 111 * Math.cos((latMid * Math.PI) / 180);
    const latKm = (maxLat - minLat) * 111;
    const derived = (Math.max(lngKm, latKm) * 1000) / 2;
    return Math.min(Math.max(derived, 500), 3000);
  }

  return 1500;
}

export async function POST(request: Request) {
  const apiKey = getGooglePlacesServerKey();
  if (!apiKey) {
    return NextResponse.json({ enabled: false, places: [] }, { status: 503 });
  }

  let body: {
    lat?: number;
    lng?: number;
    radiusM?: number;
    bbox?: [number, number, number, number];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const lat = body.lat;
  const lng = body.lng;

  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  }

  const radius = deriveRadiusM(lat, lng, body.bbox, body.radiusM);

  const guard = guardPlacesRequest({
    clientId: clientIdFromRequest(request),
    sku: "nearby",
    cacheKey: nearbyCacheKey(lat, lng, radius),
    overBudgetPayload: { enabled: true, places: [] },
  });
  if (guard.blocked && guard.response) return guard.response;
  if (guard.cached) return NextResponse.json(guard.cached);

  const credit = await consumeMapCredit(request, "nearby", "dashboard");
  if (credit.blocked) {
    return NextResponse.json({ enabled: true, places: [], credits: creditMeta(credit) });
  }

  const seen = new Set<string>();
  const places = [];

  for (const types of resolveTypeBatches()) {
    const batch = await googleSearchNearby(apiKey, { lat, lng }, radius, types, 20);
    for (const place of batch) {
      if (seen.has(place.placeId)) continue;
      seen.add(place.placeId);
      places.push(googleNearbyPlaceToPoiResult(place));
      if (places.length >= 80) break;
    }
    if (places.length >= 80) break;
  }

  const payload = { enabled: true, places };
  guard.store(payload);

  return NextResponse.json({ ...payload, credits: creditMeta(credit) });
}
