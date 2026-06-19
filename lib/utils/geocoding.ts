import { getMapboxPublicToken } from "@/lib/config/public-env";

export type GeocodedCoordinates = {
    lat: number;
    lng: number;
};

export async function geocodeAddressWithMapbox(
    address: string,
    options?: { country?: string; token?: string }
): Promise<GeocodedCoordinates | null> {
    const trimmedAddress = address.trim();
    if (!trimmedAddress) {
        return null;
    }

    const token = options?.token ?? getMapboxPublicToken();
    if (!token) {
        return null;
    }

    const country = options?.country ?? "ng";
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(trimmedAddress)}.json?access_token=${token}&country=${country}&limit=1`;

    const response = await fetch(url);
    if (!response.ok) {
        return null;
    }

    const payload = (await response.json()) as {
        features?: Array<{ center?: [number, number] }>;
    };
    const feature = payload.features?.[0];

    if (!feature?.center || feature.center.length !== 2) {
        return null;
    }

    const [lng, lat] = feature.center;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }

    return { lat, lng };
}

export async function reverseGeocodeWithMapbox(
    lng: number,
    lat: number,
    options?: { token?: string }
): Promise<string | null> {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return null;
    }

    const token = options?.token ?? getMapboxPublicToken();
    if (!token) {
        return null;
    }

    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${token}&limit=1`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            return null;
        }

        const payload = (await response.json()) as {
            features?: Array<{ place_name?: string }>;
        };

        const placeName = payload.features?.[0]?.place_name;
        return placeName && placeName.trim() ? placeName.trim() : null;
    } catch {
        return null;
    }
}
