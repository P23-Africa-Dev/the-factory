'use client';

import React, { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { isNativeAndroid } from '@/features/tracking/native/capacitorPlatform';
import { AGENT_APK_VERSION_NAME, CANONICAL_AGENT_APK_URL, withAgentApkCacheBust } from '@/constants/apk-version';
import { isApkUpdateAvailable, isSnoozed, snooze } from '@/lib/pwa/apkUpdate';

/**
 * Shown in the Android app when a newer APK has been published. "Update" opens
 * the download in the phone's browser (a different host, so Capacitor hands it
 * to the system); the person then opens the file and taps Update. Sign-in and
 * data are kept (same signing key).
 */
export function ApkUpdateBanner(): React.ReactElement | null {
  const [show, setShow] = useState(false);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    if (!isNativeAndroid() || isSnoozed()) return undefined;
    let cancelled = false;
    void import('@capacitor/app')
      .then(({ App }) => App.getInfo())
      .then((info) => {
        if (!cancelled && isApkUpdateAvailable(info.build)) setShow(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!show) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 top-[calc(env(safe-area-inset-top,0px)+8px)] z-[10040] rounded-2xl border border-[#44AFCD]/40 bg-[#0E2A36] p-3 text-white shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#44AFCD]/15 text-[#44AFCD]">
          <Download size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold">Update available · version {AGENT_APK_VERSION_NAME}</p>
          <p className="mt-0.5 text-[11px] leading-snug text-white/70">
            {opened
              ? 'When the download finishes, open the file and tap Update. You stay signed in.'
              : 'Get the latest tracking and sign-in fixes. Takes a minute; you stay signed in.'}
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                setOpened(true);
                // Another host: Capacitor opens it in the phone's browser, which downloads the APK.
                window.location.href = withAgentApkCacheBust(CANONICAL_AGENT_APK_URL);
              }}
              className="min-h-11 rounded-full bg-[#44AFCD] px-4 text-[12px] font-semibold text-[#0A1D25] active:scale-[0.98]"
            >
              {opened ? 'Download again' : 'Update'}
            </button>
            <button
              type="button"
              onClick={() => {
                snooze();
                setShow(false);
              }}
              className="min-h-11 rounded-full border border-white/15 px-4 text-[12px] text-white/80"
            >
              Later
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            snooze();
            setShow(false);
          }}
          className="-mr-1 -mt-1 flex h-11 w-11 items-center justify-center rounded-full text-white/60"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
