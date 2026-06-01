export type MapAppearance = "day" | "night";

export const MAPBOX_NAVIGATION_DAY_STYLE = "mapbox://styles/mapbox/navigation-day-v1";
export const MAPBOX_NAVIGATION_NIGHT_STYLE = "mapbox://styles/mapbox/navigation-night-v1";

function inferAppearanceByClock(date: Date): MapAppearance {
  const hour = date.getHours();
  return hour >= 6 && hour < 19 ? "day" : "night";
}

export function resolveMapAppearance(): MapAppearance {
  if (typeof window === "undefined") {
    return inferAppearanceByClock(new Date());
  }

  if (window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "night";
  }

  return inferAppearanceByClock(new Date());
}

export function getMapboxNavigationStyle(appearance: MapAppearance): string {
  return appearance === "night"
    ? MAPBOX_NAVIGATION_NIGHT_STYLE
    : MAPBOX_NAVIGATION_DAY_STYLE;
}
