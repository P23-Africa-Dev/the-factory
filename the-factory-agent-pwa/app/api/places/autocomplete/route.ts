import { NextResponse } from "next/server";
import { googleAutocomplete } from "@/lib/map/google-places";

export async function POST(request: Request) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
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
  const results = await googleAutocomplete(apiKey, input, sessionToken, locationBias, limit);

  return NextResponse.json({
    enabled: true,
    suggestions: results.map((item) => ({
      placeId: item.placeId,
      name: item.name,
      placeFormatted: item.placeFormatted,
      category: item.category,
    })),
  });
}
