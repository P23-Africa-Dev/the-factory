import { NextResponse } from "next/server";
import { googlePlaceDetails } from "@/lib/map/google-places";
import { clientIdFromRequest, guardPlacesRequest } from "@/lib/server/places-guard";
import { consumeMapCredit, creditMeta } from "@/lib/server/map-credit-gate";

function getPlacesApiKey(): string {
  return (
    process.env.GOOGLE_PLACES_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    ""
  );
}

export async function GET(request: Request) {
  const apiKey = getPlacesApiKey();
  if (!apiKey) {
    return NextResponse.json({ enabled: false }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const placeId = searchParams.get("placeId")?.trim() ?? "";
  const sessionToken = searchParams.get("sessionToken")?.trim() ?? "";

  if (!placeId) {
    return NextResponse.json({ error: "placeId is required" }, { status: 400 });
  }
  if (!sessionToken) {
    return NextResponse.json({ error: "sessionToken is required" }, { status: 400 });
  }

  const guard = guardPlacesRequest({
    clientId: clientIdFromRequest(request),
    sku: "details",
    cacheKey: `details:${placeId}`,
    overBudgetPayload: { enabled: true, blocked: true },
  });
  if (guard.blocked && guard.response) return guard.response;
  if (guard.cached) return NextResponse.json(guard.cached);

  const credit = await consumeMapCredit(request, "details");
  if (credit.blocked) {
    return NextResponse.json({
      enabled: true,
      blocked: true,
      credits: creditMeta(credit),
    });
  }

  const details = await googlePlaceDetails(apiKey, placeId, sessionToken);
  if (!details) {
    return NextResponse.json({ error: "Place not found" }, { status: 404 });
  }

  const payload = {
    enabled: true,
    name: details.name,
    address: details.address,
    lat: details.lat,
    lng: details.lng,
    bbox: details.bbox,
  };
  guard.store(payload);

  return NextResponse.json({ ...payload, credits: creditMeta(credit) });
}
