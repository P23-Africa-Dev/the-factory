export type AssistantGeolocationContext = {
  latitude?: number;
  longitude?: number;
};

export async function resolveAssistantGeolocationContext(): Promise<AssistantGeolocationContext> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return {};
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => resolve({}),
      { enableHighAccuracy: false, maximumAge: 120_000, timeout: 4_000 },
    );
  });
}
