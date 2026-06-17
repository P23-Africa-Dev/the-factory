/**
 * Environment configuration for the agent PWA.
 * Uses production defaults so Vercel/CI builds succeed without every var set locally.
 */

// Static references to allow the Next.js/Turbopack bundler to inline them at build/compile time
const NEXT_PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const NEXT_PUBLIC_TRACKING_WS_URL = process.env.NEXT_PUBLIC_TRACKING_WS_URL;
const NEXT_PUBLIC_MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const NEXT_PUBLIC_APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;

const DEFAULT_API_BASE_URL = 'https://api.thefactory23.com/api/v1';
const DEFAULT_TRACKING_WS_URL = 'wss://api.thefactory23.com/tracking-ws';

function withFallback(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed || fallback;
}

export const env = {
  API_BASE_URL: withFallback(NEXT_PUBLIC_API_BASE_URL, DEFAULT_API_BASE_URL),
  TRACKING_WS_URL: withFallback(NEXT_PUBLIC_TRACKING_WS_URL, DEFAULT_TRACKING_WS_URL),
  MAPBOX_TOKEN: NEXT_PUBLIC_MAPBOX_TOKEN?.trim() ?? '',
  APP_ENV: (NEXT_PUBLIC_APP_ENV ?? 'development') as
    | 'development'
    | 'staging'
    | 'production',
} as const;
