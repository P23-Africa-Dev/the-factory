import { NextResponse } from "next/server";
import { getGooglePlacesServerKey } from "@/lib/config/public-env";
import { googleNearbyPlaceToPoiResult, googleSearchNearby } from "@/lib/utils/google-places";

const TYPE_BATCHES: string[][] = [
  ["restaurant", "cafe", "bar", "meal_takeaway"],
  ["supermarket", "grocery_store", "shopping_mall", "convenience_store"],
  ["bank", "atm", "pharmacy", "hospital"],
];

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
  const seen = new Set<string>();
  const places = [];

  for (const types of TYPE_BATCHES) {
    const batch = await googleSearchNearby(apiKey, { lat, lng }, radius, types, 20);
    for (const place of batch) {
      if (seen.has(place.placeId)) continue;
      seen.add(place.placeId);
      places.push(googleNearbyPlaceToPoiResult(place));
      if (places.length >= 80) break;
    }
    if (places.length >= 80) break;
  }

  return NextResponse.json({ enabled: true, places });
}
