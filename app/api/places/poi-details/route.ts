import { NextResponse } from "next/server";
import { getGooglePlacesServerKey } from "@/lib/config/public-env";
import { googlePoiDetails } from "@/lib/utils/google-places";
import {
  clientIdFromRequest,
  guardPlacesRequest,
} from "@/lib/server/places-guard";

// On-demand POI enrichment (phone + opening hours). Billed per pin click, not
// per pin per viewport refresh, so the Enterprise-tier fields cost far less.
export async function GET(request: Request) {
  const apiKey = getGooglePlacesServerKey();
  if (!apiKey) {
    return NextResponse.json({ enabled: false }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("placeId")?.trim() ?? "";
  if (!placeId) {
    return NextResponse.json({ error: "placeId is required" }, { status: 400 });
  }

  const guard = guardPlacesRequest({
    clientId: clientIdFromRequest(request),
    sku: "poi-details",
    cacheKey: `poi-details:${placeId}`,
  });
  if (guard.blocked && guard.response) return guard.response;
  if (guard.cached) return NextResponse.json(guard.cached);

  const details = await googlePoiDetails(apiKey, placeId);
  const payload = {
    enabled: true,
    phone: details?.phone ?? null,
    openingHours: details?.openingHours ?? null,
  };
  guard.store(payload);

  return NextResponse.json(payload);
}
