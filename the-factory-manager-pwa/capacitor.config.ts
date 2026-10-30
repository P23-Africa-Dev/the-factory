import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Android shell loads the live Manager PWA (remote WebView).
 * Override with CAPACITOR_SERVER_URL for LAN device debugging.
 */
const serverUrl =
  process.env.CAPACITOR_SERVER_URL?.replace(/\/+$/, '') ||
  process.env.NEXT_PUBLIC_MANAGER_PWA_URL?.replace(/\/+$/, '') ||
  process.env.NEXT_PUBLIC_AGENT_PWA_URL?.replace(/\/+$/, '') ||
  'https://manager.thefactory23.com';

const allowCleartext =
  process.env.CAPACITOR_CLEARTEXT === 'true' ||
  serverUrl.startsWith('http://');

const config: CapacitorConfig = {
  appId: 'com.thefactory23.manager',
  appName: 'Factory 23 Manager',
  webDir: 'www',
  android: {
    useLegacyBridge: true,
  },
  server: {
    url: serverUrl,
    cleartext: allowCleartext,
    androidScheme: 'https',
    errorPath: 'error.html',
  },
  plugins: {
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
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
