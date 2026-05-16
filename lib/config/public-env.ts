export const MAPBOX_PUBLIC_TOKEN_ENV = 'NEXT_PUBLIC_MAPBOX_TOKEN';
export const TRACKING_WS_URL_ENV = 'NEXT_PUBLIC_TRACKING_WS_URL';

export function getMapboxPublicToken(): string {
    return process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? '';
}

export function getTrackingWebSocketUrl(): string {
    const configured = process.env.NEXT_PUBLIC_TRACKING_WS_URL?.trim();

    if (configured) {
        return configured;
    }

    if (typeof window === 'undefined') {
        return '';
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

    return `${protocol}//${window.location.host}/tracking-ws`;
}