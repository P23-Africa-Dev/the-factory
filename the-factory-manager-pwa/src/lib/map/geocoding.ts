import { env } from '@/constants/env';
import { getMapboxPublicToken } from '@/lib/map/public-env';

export type GeocodedPlaceSuggestion = {
  id?: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  provider?: string;
  sources?: Array<{ provider: string; id: string }>;
  attributionVisible?: boolean;
};

export type GeocodedPlace = GeocodedPlaceSuggestion;

/** Mapbox place types that support global search (countries through addresses). */
const GLOBAL_PLACE_TYPES =
  'country,region,place,locality,neighborhood,address,poi';

function resolveMapboxToken(): string {
  return getMapboxPublicToken() || env.MAPBOX_TOKEN;
}

/**
 * Forward-geocode a free-text query via Mapbox without country restrictions so
 * agents can search destinations anywhere in the world.
 */
export async function searchPlacesWithMapbox(
  query: string,
  options?: { limit?: number },
): Promise<GeocodedPlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return [];
  }

  const token = resolveMapboxToken();
  if (!token) {
    return [];
  }

  const limit = options?.limit ?? 5;
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmed)}.json` +
    `?access_token=${token}` +
    `&limit=${limit}` +
    `&types=${GLOBAL_PLACE_TYPES}` +
    `&autocomplete=true`;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as {
      features?: Array<{ id?: string; text?: string; place_name?: string; center?: [number, number] }>;
    };

    return (payload.features ?? [])
      .filter((feature) => feature.center && feature.center.length === 2)
      .map((feature, idx) => ({
        id: feature.id ?? `${feature.center![1]}-${feature.center![0]}-${idx}`,
        name: feature.text?.trim() || feature.place_name?.split(',')[0]?.trim() || 'Location',
        address: feature.place_name?.trim() || '',
        latitude: feature.center![1],
        longitude: feature.center![0],
      }));
  } catch {
    return [];
  }
}

export const searchPlaces = searchPlacesWithMapbox;
