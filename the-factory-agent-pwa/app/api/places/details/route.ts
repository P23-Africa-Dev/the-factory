import { NextResponse } from "next/server";
import { googlePlaceDetails } from "@/lib/map/google-places";

export async function GET(request: Request) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ?? "";
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

  const details = await googlePlaceDetails(apiKey, placeId, sessionToken);
  if (!details) {
    return NextResponse.json({ error: "Place not found" }, { status: 404 });
  }

  return NextResponse.json({
    enabled: true,
    name: details.name,
    address: details.address,
    lat: details.lat,
    lng: details.lng,
    bbox: details.bbox,
  });
}
