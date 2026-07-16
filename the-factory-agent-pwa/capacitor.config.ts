import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android shell loads the live Agent PWA (remote WebView).
 * Override with CAPACITOR_SERVER_URL for LAN device debugging.
 * APK rebuilds are only required when native plugins/permissions change.
 */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.replace(/\/+$/, '') ||
  process.env.NEXT_PUBLIC_AGENT_PWA_URL?.replace(/\/+$/, '') ||
  'https://app.thefactory23.com';

const allowCleartext =
  process.env.CAPACITOR_CLEARTEXT === 'true' ||
  serverUrl.startsWith('http://');

const config: CapacitorConfig = {
  appId: 'com.thefactory23.agent',
  appName: 'Factory 23 Agent',
  webDir: 'www',
  // Required so background-geolocation keeps delivering while minimized.
  android: {
    useLegacyBridge: true,
  },
  server: {
    url: serverUrl,
    cleartext: allowCleartext,
    androidScheme: 'https',
  },
  plugins: {
    // Native HTTP so location flushes survive Android's ~5min WebView throttle.
    CapacitorHttp: {
      enabled: true,
    },
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#0B1E26',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0B1E26',
    },
  },
};

export default config;
