/** Agent PWA map always uses a fixed light basemap (never night/dark). */
export const AGENT_MAPBOX_LIGHT_STYLE = 'mapbox://styles/mapbox/navigation-day-v1';

export function getAgentMapboxStyle(): string {
  return AGENT_MAPBOX_LIGHT_STYLE;
}
