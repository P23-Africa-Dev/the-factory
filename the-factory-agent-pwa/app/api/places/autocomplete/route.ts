import { NextResponse } from "next/server";

/** @deprecated Use Laravel GET /api/v1/places/autocomplete */
export async function POST() {
  return NextResponse.json(
    { enabled: false, deprecated: true, suggestions: [] },
    { status: 410 },
  );
}
