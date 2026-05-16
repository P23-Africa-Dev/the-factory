export const MAPBOX_PUBLIC_TOKEN_ENV = 'NEXT_PUBLIC_MAPBOX_TOKEN';
export const MAPBOX_ALLOWED_HOSTS_ENV = 'NEXT_PUBLIC_MAPBOX_ALLOWED_HOSTS';
export const TRACKING_WS_URL_ENV = 'NEXT_PUBLIC_TRACKING_WS_URL';

export function getMapboxPublicToken(): string {
    return process.env.NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? '';
}

function resolveMapboxAllowedHosts(): Set<string> {
    const hosts = new Set<string>();
    const configured = process.env.NEXT_PUBLIC_MAPBOX_ALLOWED_HOSTS?.trim();

    if (configured) {
        for (const host of configured.split(',')) {
            const normalized = host.trim().toLowerCase();
            if (normalized) hosts.add(normalized);
        }
    }

    if (typeof window !== 'undefined' && window.location.hostname) {
        hosts.add(window.location.hostname.toLowerCase());
    }

    return hosts;
}

export function createMapboxTransformRequest(): (url: string) => { url: string } {
    const explicitHosts = resolveMapboxAllowedHosts();

    return (url: string): { url: string } => {
        if (!url || url.startsWith('mapbox://') || url.startsWith('data:') || url.startsWith('blob:')) {
            return { url };
        }

        if (!/^https?:\/\//i.test(url)) {
            return { url };
        }

        try {
            const parsed = new URL(url);
            const hostname = parsed.hostname.toLowerCase();
            const mapboxHost = hostname === 'mapbox.com' || hostname.endsWith('.mapbox.com');

            if (mapboxHost || explicitHosts.has(hostname)) {
                return { url };
            }

            // Block requests to unexpected hosts from Mapbox internals.
            return { url: 'data:,' };
        } catch {
            return { url };
        }
    };
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