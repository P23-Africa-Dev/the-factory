/**
 * Environment configuration — validates required env vars at startup.
 * All env vars are read from `NEXT_PUBLIC_*` process.env keys.
 */

// Static references to allow the Next.js/Turbopack bundler to inline them at build/compile time
const NEXT_PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const NEXT_PUBLIC_TRACKING_WS_URL = process.env.NEXT_PUBLIC_TRACKING_WS_URL;
const NEXT_PUBLIC_MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const NEXT_PUBLIC_APP_ENV = process.env.NEXT_PUBLIC_APP_ENV;

function validateEnv(value: string | undefined, key: string): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable: "${key}". Ensure it is set in .env.local.`,
    );
  }
  return value;
}

export const env = {
  API_BASE_URL: validateEnv(NEXT_PUBLIC_API_BASE_URL, 'NEXT_PUBLIC_API_BASE_URL'),
  TRACKING_WS_URL: validateEnv(NEXT_PUBLIC_TRACKING_WS_URL, 'NEXT_PUBLIC_TRACKING_WS_URL'),
  MAPBOX_TOKEN: validateEnv(NEXT_PUBLIC_MAPBOX_TOKEN, 'NEXT_PUBLIC_MAPBOX_TOKEN'),
  APP_ENV: (NEXT_PUBLIC_APP_ENV ?? 'development') as
    | 'development'
    | 'staging'
    | 'production',
} as const;
