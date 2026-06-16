/**
 * Environment configuration — validates required env vars at startup.
 * All env vars are read from `NEXT_PUBLIC_*` process.env keys.
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(
      `Missing required environment variable: "${key}". Ensure it is set in .env.local.`,
    );
  }
  return value;
}

export const env = {
  API_BASE_URL: requireEnv('NEXT_PUBLIC_API_BASE_URL'),
  TRACKING_WS_URL: requireEnv('NEXT_PUBLIC_TRACKING_WS_URL'),
  MAPBOX_TOKEN: requireEnv('NEXT_PUBLIC_MAPBOX_TOKEN'),
  APP_ENV: (process.env.NEXT_PUBLIC_APP_ENV ?? 'development') as
    | 'development'
    | 'staging'
    | 'production',
} as const;
