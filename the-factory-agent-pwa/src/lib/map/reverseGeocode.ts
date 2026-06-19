import { getMapboxPublicToken } from '@/lib/map/public-env';
import { env } from '@/constants/env';

/**
 * Reverse-geocode a coordinate pair into a human-readable place name via Mapbox.
 * Returns null on any failure (offline, no token, no match).
 */
export async function reverseGeocode(lng: number, lat: number): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const token = getMapboxPublicToken() || env.MAPBOX_TOKEN;
  if (!token) return null;

  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&limit=1`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = (await response.json()) as { features?: Array<{ place_name?: string }> };
    const placeName = data.features?.[0]?.place_name;
    return placeName && placeName.trim() ? placeName.trim() : null;
  } catch {
    return null;
  }
}
