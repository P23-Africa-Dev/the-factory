const PLACES_BASE = "https://places.googleapis.com/v1";

export type GooglePlaceSuggestion = {
  placeId: string;
  name: string;
  placeFormatted: string;
  category: string | null;
  types: string[];
};

export type GooglePlaceDetails = {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  bbox: [number, number, number, number] | null;
  types: string[];
};

const GOOGLE_TYPE_TO_CATEGORY: Record<string, string> = {
  restaurant: "restaurant",
  cafe: "cafe",
  bar: "bar",
  bank: "bank",
  atm: "atm",
  pharmacy: "pharmacy",
  hospital: "hospital",
  doctor: "doctors",
  school: "school",
  university: "university",
  lodging: "hotel",
  hotel: "hotel",
  supermarket: "supermarket",
  grocery_store: "supermarket",
  convenience_store: "convenience",
  shopping_mall: "mall",
  clothing_store: "clothes",
  electronics_store: "electronics",
  gas_station: "fuel",
  police: "police",
  post_office: "post_office",
  place_of_worship: "place_of_worship",
};

function pickPrimaryCategory(types: string[] | undefined): string {
  if (!types?.length) return "business";
  for (const type of types) {
    const normalized = type.replace(/^(.+)_(store|shop)$/, "$1");
    if (GOOGLE_TYPE_TO_CATEGORY[type]) return GOOGLE_TYPE_TO_CATEGORY[type];
    if (GOOGLE_TYPE_TO_CATEGORY[normalized]) return GOOGLE_TYPE_TO_CATEGORY[normalized];
  }
  return types[0]?.replace(/_/g, " ") ?? "business";
}

function readDisplayName(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && "text" in value) {
    const text = (value as { text?: string }).text;
    return typeof text === "string" ? text.trim() : "";
  }
  return "";
}

function readText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (value && typeof value === "object" && "text" in value) {
    const text = (value as { text?: string }).text;
    return typeof text === "string" ? text.trim() : "";
  }
  return "";
}

async function googleFetch<T>(
  apiKey: string,
  path: string,
  options: {
    method?: "GET" | "POST";
    fieldMask: string;
    body?: unknown;
  },
): Promise<T | null> {
  try {
    const response = await fetch(`${PLACES_BASE}${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": options.fieldMask,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      console.error(`Google Places API error (${response.status}):`, errorText.slice(0, 200));
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    console.error("Google Places API request failed:", error);
    return null;
  }
}

export async function googleAutocomplete(
  apiKey: string,
  input: string,
  sessionToken: string,
  locationBias?: { lat: number; lng: number; radiusM?: number },
  limit = 6,
): Promise<GooglePlaceSuggestion[]> {
  const trimmed = input.trim();
  if (!apiKey || trimmed.length < 2) return [];

  const body: Record<string, unknown> = {
    input: trimmed,
    sessionToken,
  };

  if (locationBias) {
    body.locationBias = {
      circle: {
        center: { latitude: locationBias.lat, longitude: locationBias.lng },
        radius: locationBias.radiusM ?? 5000,
      },
    };
  }

  const payload = await googleFetch<{
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        place?: string;
        text?: { text?: string };
        structuredFormat?: {
          mainText?: { text?: string };
          secondaryText?: { text?: string };
        };
        types?: string[];
      };
    }>;
  }>(apiKey, "/places:autocomplete", {
    method: "POST",
    fieldMask:
      "suggestions.placePrediction.placeId,suggestions.placePrediction.place,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat,suggestions.placePrediction.types",
    body,
  });

  return (payload?.suggestions ?? [])
    .map((item) => item.placePrediction)
    .filter((prediction): prediction is NonNullable<typeof prediction> => !!prediction)
    .map((prediction) => {
      const placeId =
        prediction.placeId?.trim() ||
        prediction.place?.replace(/^places\//, "").trim() ||
        "";
      const name =
        readText(prediction.structuredFormat?.mainText) ||
        readText(prediction.text).split(",")[0]?.trim() ||
        "Place";
      const secondary = readText(prediction.structuredFormat?.secondaryText);
      const fullText = readText(prediction.text);
      const types = prediction.types ?? [];
      const category = pickPrimaryCategory(types);

      return {
        placeId,
        name,
        placeFormatted: secondary || fullText || name,
        category: category === "business" ? null : category,
        types,
      };
    })
    .filter((item) => item.placeId.length > 0)
    .slice(0, limit);
}

export async function googlePlaceDetails(
  apiKey: string,
  placeId: string,
  sessionToken: string,
): Promise<GooglePlaceDetails | null> {
  if (!apiKey || !placeId) return null;

  const encodedId = encodeURIComponent(placeId.replace(/^places\//, ""));
  const payload = await googleFetch<{
    id?: string;
    displayName?: { text?: string } | string;
    formattedAddress?: string;
    location?: { latitude?: number; longitude?: number };
    types?: string[];
    viewport?: {
      low?: { latitude?: number; longitude?: number };
      high?: { latitude?: number; longitude?: number };
    };
  }>(apiKey, `/places/${encodedId}?sessionToken=${encodeURIComponent(sessionToken)}`, {
    method: "GET",
    fieldMask: "id,displayName,formattedAddress,location,types,viewport",
  });

  if (!payload?.location) return null;

  const lat = payload.location.latitude;
  const lng = payload.location.longitude;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  let bbox: [number, number, number, number] | null = null;
  const low = payload.viewport?.low;
  const high = payload.viewport?.high;
  const lowLat = low?.latitude;
  const lowLng = low?.longitude;
  const highLat = high?.latitude;
  const highLng = high?.longitude;
  if (
    low &&
    high &&
    Number.isFinite(lowLat) &&
    Number.isFinite(lowLng) &&
    Number.isFinite(highLat) &&
    Number.isFinite(highLng)
  ) {
    bbox = [lowLng!, lowLat!, highLng!, highLat!];
  }

  return {
    placeId: payload.id?.replace(/^places\//, "") || placeId,
    name: readDisplayName(payload.displayName) || "Location",
    address: payload.formattedAddress?.trim() || "",
    lat,
    lng,
    bbox,
    types: payload.types ?? [],
  };
}
