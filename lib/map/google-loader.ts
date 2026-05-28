let googleMapsPromise: Promise<any> | null = null;

function hasGoogleMaps(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    return !!(window as any).google?.maps;
}

export function loadGoogleMapsApi(apiKey: string): Promise<any> {
    if (!apiKey) {
        return Promise.reject(new Error('Missing Google Maps API key.'));
    }

    if (hasGoogleMaps()) {
        return Promise.resolve((window as any).google);
    }

    if (googleMapsPromise) {
        return googleMapsPromise;
    }

    googleMapsPromise = new Promise((resolve, reject) => {
        if (typeof window === 'undefined') {
            reject(new Error('Google Maps can only be loaded in the browser.'));
            return;
        }

        const callbackName = `factory23GoogleMapsInit_${Date.now()}`;
        const script = document.createElement('script');

        (window as any)[callbackName] = () => {
            resolve((window as any).google);
            delete (window as any)[callbackName];
        };

        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&callback=${callbackName}`;
        script.async = true;
        script.defer = true;
        script.onerror = () => {
            googleMapsPromise = null;
            delete (window as any)[callbackName];
            reject(new Error('Failed to load Google Maps JavaScript API.'));
        };

        document.head.appendChild(script);
    });

    return googleMapsPromise;
}
