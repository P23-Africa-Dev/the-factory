'use client';

import React, { useMemo } from 'react';
import { Compass, ShieldAlert, X } from 'lucide-react';
import { isNativeAndroid } from '../native/capacitorPlatform';
import { openNativeLocationSettings } from '../native/nativeBackgroundGeolocation';

type Platform = 'ios' | 'android' | 'android-native' | 'chrome-desktop' | 'pwa' | 'other';

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';

  if (isNativeAndroid()) return 'android-native';

  const ua = navigator.userAgent || '';
  const isStandalone =
    (typeof window !== 'undefined' &&
      window.matchMedia?.('(display-mode: standalone)')?.matches) ||
    // iOS Safari adds navigator.standalone when launched from the home screen.
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (isStandalone) return 'pwa';
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  if (/Chrome\//.test(ua)) return 'chrome-desktop';
  return 'other';
}

const GUIDANCE: Record<Platform, string[]> = {
  ios: [
    'Open the iOS Settings app',
    'Go to Privacy & Security → Location Services and make sure it is On',
    'Find your browser (Safari/Chrome) and set location to "While Using"',
    'Return here and tap Try Again',
  ],
  android: [
    'Tap the lock icon in the address bar (or open Site settings)',
    'Set Location to Allow',
    'Make sure system Location is turned on in Quick Settings',
    'Return here and tap Try Again',
  ],
  'android-native': [
    'Open App info → Permissions → Location and choose "Allow all the time"',
    'Allow Notifications so the live-tracking indicator can stay on',
    'Under Battery, set unrestricted / no battery optimization for this app',
    'Return here and tap Try Again (or Open Settings below)',
  ],
  'chrome-desktop': [
    'Click the lock / tune icon to the left of the address bar',
    'Set Location to Allow',
    'Reload the page, then tap Try Again',
  ],
  pwa: [
    'Open your device Settings → Apps → this app',
    'Enable the Location permission',
    'Reopen the app and tap Try Again',
  ],
  other: [
    'Open your browser site settings',
    'Allow Location access for this site',
    'Reload, then tap Try Again',
  ],
};

const PLATFORM_LABEL: Record<Platform, string> = {
  ios: 'On iPhone / iPad',
  android: 'On Android',
  'android-native': 'In the Android app',
  'chrome-desktop': 'In Chrome',
  pwa: 'In the installed app',
  other: 'In your browser',
};

export interface LocationPermissionGateProps {
  /** 'request' = first ask; 'denied' = blocked, show recovery guidance. */
  mode: 'request' | 'denied';
  /** True while a permission request / GPS fix is in flight. */
  isBusy?: boolean;
  /** Whether the task is being resumed (already in progress) vs. started fresh. */
  isResume?: boolean;
  onRequest: () => void;
  onDismiss?: () => void;
  /** When true, renders as a full screen view instead of a bottom overlay. */
  fullScreen?: boolean;
}

export function LocationPermissionGate({
  mode,
  isBusy = false,
  isResume = false,
  onRequest,
  onDismiss,
  fullScreen = false,
}: LocationPermissionGateProps): React.ReactElement {
  const platform = useMemo(() => detectPlatform(), []);

  const container = fullScreen
    ? 'flex flex-col items-center justify-center min-h-screen bg-[#0A1D25] px-8 text-center font-sans'
    : 'flex flex-col items-center justify-center px-8 py-10 text-center font-sans';

  if (mode === 'denied') {
    return (
      <div className={container}>
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white"
          >
            <X size={18} />
          </button>
        )}
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#FD6046]/15">
          <ShieldAlert className="text-[#FD6046]" size={28} />
        </div>
        <h3 className="mb-2 text-lg font-bold text-white">Location access is blocked</h3>
        <p className="mb-5 max-w-xs text-xs leading-relaxed text-[#8F9098]">
          We need your location so supervisors can see your route and confirm you reached the
          destination. Your location is only shared while a task is active.
        </p>

        <div className="mb-6 w-full max-w-xs rounded-2xl bg-white/5 p-4 text-left">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#75ADAF]">
            {PLATFORM_LABEL[platform]}
          </p>
          <ol className="list-decimal space-y-1.5 pl-4 text-xs leading-relaxed text-[#C9CDD2]">
            {GUIDANCE[platform].map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>

        <button
          onClick={onRequest}
          disabled={isBusy}
          className="h-11 w-full max-w-xs rounded-full bg-[#75ADAF] text-xs font-semibold text-white hover:bg-[#66989A] active:scale-95 disabled:opacity-60"
        >
          {isBusy ? 'Checking…' : 'Try Again'}
        </button>
        {platform === 'android-native' && (
          <button
            type="button"
            onClick={() => void openNativeLocationSettings()}
            className="mt-2 h-11 w-full max-w-xs rounded-full border border-white/15 bg-white/5 text-xs font-semibold text-white hover:bg-white/10 active:scale-95"
          >
            Open App Settings
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="py-2.5 text-xs font-semibold text-[#8F9098] transition-colors hover:text-white"
          >
            Not now
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={container}>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white"
        >
          <X size={18} />
        </button>
      )}
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#75ADAF]/10 text-[#75ADAF]">
        <Compass className={isBusy ? 'animate-spin' : 'animate-pulse'} size={32} />
      </div>
      <h3 className="mb-3 text-xl font-bold text-white">
        {isResume ? 'Resume tracking' : 'Location access needed'}
      </h3>
      <p className="mb-8 max-w-xs text-xs leading-relaxed text-[#8F9098]">
        {isResume
          ? 'This task is already in progress. Allow location access to resume tracking from where you left off.'
          : platform === 'android-native'
            ? 'To start this task we track your location in the background (even when minimized or the screen is locked). Allow location “all the time” and notifications so the live-tracking indicator can stay on.'
            : 'To start this task we track your location so supervisors can monitor your route and confirm you reached the destination. Your location is only shared while the task is active.'}
      </p>
      <button
        onClick={onRequest}
        disabled={isBusy}
        className="mb-3 h-12 w-full max-w-xs rounded-full bg-[#75ADAF] text-xs font-semibold text-white shadow-md hover:bg-[#66989A] active:scale-95 disabled:opacity-60"
      >
        {isBusy
          ? 'Getting your location…'
          : isResume
            ? 'Resume Tracking'
            : 'Allow Location Access'}
      </button>
      {onDismiss && (
        <button
          onClick={onDismiss}
          disabled={isBusy}
          className="py-2.5 text-xs font-semibold text-[#8F9098] transition-colors hover:text-white disabled:opacity-60"
        >
          Not Now
        </button>
      )}
    </div>
  );
}
