import { NextResponse } from "next/server";
import { getGooglePlacesServerKey } from "@/lib/config/public-env";
import { googleAutocomplete } from "@/lib/utils/google-places";
import { clientIdFromRequest, guardPlacesRequest } from "@/lib/server/places-guard";

const AUTOCOMPLETE_CACHE_TTL_MS = 60_000;

export async function POST(request: Request) {
  const apiKey = getGooglePlacesServerKey();
  if (!apiKey) {
    return NextResponse.json({ enabled: false, suggestions: [] }, { status: 503 });
  }

  let body: {
    input?: string;
    sessionToken?: string;
    lat?: number;
    lng?: number;
    limit?: number;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = body.input?.trim() ?? "";
  const sessionToken = body.sessionToken?.trim() ?? "";

  if (input.length < 2) {
    return NextResponse.json({ suggestions: [] });
  }
  if (!sessionToken) {
    return NextResponse.json({ error: "sessionToken is required" }, { status: 400 });
  }

  const locationBias =
    typeof body.lat === "number" &&
    typeof body.lng === "number" &&
    Number.isFinite(body.lat) &&
    Number.isFinite(body.lng)
      ? { lat: body.lat, lng: body.lng }
      : undefined;

  const limit = Math.min(Math.max(body.limit ?? 6, 1), 10);

  const latKey = locationBias ? locationBias.lat.toFixed(2) : "_";
  const lngKey = locationBias ? locationBias.lng.toFixed(2) : "_";
  const guard = guardPlacesRequest({
    clientId: clientIdFromRequest(request),
    sku: "autocomplete",
    cacheKey: `autocomplete:${input.toLowerCase()}:${latKey}:${lngKey}:${limit}`,
    overBudgetPayload: { enabled: true, suggestions: [] },
  });
  if (guard.blocked && guard.response) return guard.response;
  if (guard.cached) return NextResponse.json(guard.cached);

  const results = await googleAutocomplete(apiKey, input, sessionToken, locationBias, limit);
  const payload = {
    enabled: true,
    suggestions: results.map((item) => ({
      placeId: item.placeId,
      name: item.name,
      placeFormatted: item.placeFormatted,
      category: item.category,
    })),
  };
  guard.store(payload, AUTOCOMPLETE_CACHE_TTL_MS);

  return NextResponse.json(payload);
}
