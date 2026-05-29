interface GoogleWindow extends Window {
  google?: { maps: object };
  [key: string]: unknown;
}

let googleMapsPromise: Promise<GoogleWindow["google"]> | null = null;

function hasGoogleMaps(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    return !!(window as GoogleWindow).google?.maps;
}

export function loadGoogleMapsApi(apiKey: string): Promise<GoogleWindow["google"]> {
    if (!apiKey) {
        return Promise.reject(new Error('Missing Google Maps API key.'));
    }

    if (hasGoogleMaps()) {
        return Promise.resolve((window as GoogleWindow).google);
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

        (window as GoogleWindow)[callbackName] = () => {
            resolve((window as GoogleWindow).google);
            delete (window as GoogleWindow)[callbackName];
        };

        script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&loading=async&callback=${callbackName}`;
        script.async = true;
        script.defer = true;
        script.onerror = () => {
            googleMapsPromise = null;
            delete (window as GoogleWindow)[callbackName];
            reject(new Error('Failed to load Google Maps JavaScript API.'));
        };

        document.head.appendChild(script);
    });

    return googleMapsPromise;
}
