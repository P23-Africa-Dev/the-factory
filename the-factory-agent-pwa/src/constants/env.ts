/**
 * Environment configuration for the agent PWA.
 * Uses production defaults so Vercel/CI builds succeed without every var set locally.
 */

// Static references to allow the Next.js/Turbopack bundler to inline them at build/compile time
const NEXT_PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const NEXT_PUBLIC_TRACKING_WS_URL = process.env.NEXT_PUBLIC_TRACKING_WS_URL;
const NEXT_PUBLIC_MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const NEXT_PUBLIC_APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;

function validateEnv(value: string | undefined, key: string, fallback = ''): string {
  if (!value) {
    console.warn(
      `[WARN] Missing environment variable: "${key}". Using fallback: "${fallback}". Ensure it is set in your environment.`,
    );
    return fallback;
  }
  return value;
}

export const env = {
  API_BASE_URL: validateEnv(
    NEXT_PUBLIC_API_BASE_URL,
    'NEXT_PUBLIC_API_BASE_URL',
    'https://api.thefactory23.com/api/v1',
  ),
  TRACKING_WS_URL: validateEnv(
    NEXT_PUBLIC_TRACKING_WS_URL,
    'NEXT_PUBLIC_TRACKING_WS_URL',
    'wss://api.thefactory23.com/tracking-ws',
  ),
  MAPBOX_TOKEN: validateEnv(NEXT_PUBLIC_MAPBOX_TOKEN, 'NEXT_PUBLIC_MAPBOX_TOKEN', ''),
  APP_ENV: (NEXT_PUBLIC_APP_ENV ?? 'development') as
    | 'development'
    | 'staging'
    | 'production',
} as const;
