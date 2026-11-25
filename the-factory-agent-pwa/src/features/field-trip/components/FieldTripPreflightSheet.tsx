'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, MapPinOff, ShieldAlert, X } from 'lucide-react';
import { isNativeAndroid } from '@/features/tracking/native/capacitorPlatform';
import {
  checkLocationSettings,
  openAppSettings,
  requestBackgroundPermission,
} from '@/features/tracking/native/locationSettings';
import { runFieldTripPreflight, type PreflightIssue, type PreflightResult, type PreflightStep } from '../preflight';
import type { TripPosition } from '../types';
import { OverlayPortal } from '@/components/shared/OverlayPortal';

const STEPS: Array<{ key: PreflightStep; label: string; nativeOnly?: boolean }> = [
  { key: 'permission', label: 'Location permission' },
  { key: 'gps', label: 'Location (GPS) is on' },
  { key: 'background', label: 'Background tracking allowed', nativeOnly: true },
  { key: 'position', label: 'Getting your position…' },
];

const ISSUE_COPY: Record<PreflightIssue, { title: string; body: string }> = {
  permission_denied: {
    title: 'Location access is blocked',
    body: 'Factory 23 needs your location to record your route and stops.',
  },
  gps_off: {
    title: 'Your location is turned off',
    body: 'Turn on location (GPS) so we can track this field trip.',
  },
  background_missing: {
    title: 'Allow location "All the time"',
    body: 'Without it, tracking pauses when the app is minimised or the screen is locked.',
  },
  unsupported: {
    title: 'Location is not available',
    body: 'This browser cannot share location. Please use the Factory 23 app.',
  },
};

const BROWSER_GPS_STEPS = [
  'Swipe down from the top of your phone and turn on Location',
  'If your browser asks, choose Allow',
  'Come back here and tap Try again',
];

const BROWSER_PERMISSION_STEPS = [
  'Tap the lock icon next to the web address',
  'Set Location to Allow',
  'Come back here and tap Try again',
];

/**
 * Bottom sheet shown when "Start Field Trip" is pressed: checks everything the
 * trip needs and offers one clear fix when something is missing.
 */
export function FieldTripPreflightSheet({
  open,
  onClose,
  onReady,
}: {
  open: boolean;
  onClose: () => void;
  onReady: (position: TripPosition | null) => void;
}) {
  const [step, setStep] = useState<PreflightStep>('permission');
  const [result, setResult] = useState<PreflightResult | null>(null);
  // Mounted only while open (see FieldTripCard): it starts out checking.
  const [running, setRunning] = useState(true);
  const native = isNativeAndroid();

  const check = useCallback(async () => {
    const res = await runFieldTripPreflight((s) => setStep(s));
    setRunning(false);
    setResult(res);
    if (res.ok && !res.warning) onReady(res.position);
  }, [onReady]);

  /** Re-run after the user fixed something (event handler, not an effect). */
  const run = useCallback(() => {
    setRunning(true);
    setResult(null);
    void check();
  }, [check]);

  useEffect(() => {
    if (!open) return undefined;
    // Next tick: lets the sheet paint its first state before checks run.
    const t = setTimeout(() => void check(), 0);
    return () => clearTimeout(t);
  }, [open, check]);

  if (!open) return null;

  const issue = result?.issue ?? result?.warning ?? null;
  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const visibleSteps = STEPS.filter((s) => !s.nativeOnly || native);

  const fix = async () => {
    if (!issue) return;
    if (issue === 'gps_off' && native) {
      const r = await checkLocationSettings({ highAccuracy: true, showDialog: true });
      if (r.enabled) void run();
      return;
    }
    if (issue === 'background_missing') {
      await requestBackgroundPermission();
      void run();
      return;
    }
    if (issue === 'permission_denied' && native) {
      await openAppSettings();
      return;
    }
    void run();
  };

  const fixLabel =
    issue === 'gps_off'
      ? native
        ? 'Turn on location'
        : 'Try again'
      : issue === 'background_missing'
        ? 'Allow all the time'
        : issue === 'permission_denied'
          ? native
            ? 'Open app settings'
            : 'Try again'
          : 'Try again';

  const guidance =
    !native && issue === 'gps_off'
      ? BROWSER_GPS_STEPS
      : !native && issue === 'permission_denied'
        ? BROWSER_PERMISSION_STEPS
        : null;

  return (
    <OverlayPortal>
    <div className="fixed inset-0 z-[10050] flex items-end justify-center bg-black/50" role="dialog" aria-modal="true" aria-label="Start field trip">
      <div className="w-full max-w-md rounded-t-[28px] bg-[#0E2A36] px-5 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-5 text-white shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-semibold">{issue ? ISSUE_COPY[issue].title : 'Getting ready…'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-white/70 active:bg-white/10">
            <X size={18} />
          </button>
        </div>

        {!issue && (
          <ul className="space-y-3">
            {visibleSteps.map((s) => {
              const idx = STEPS.findIndex((x) => x.key === s.key);
              const done = (result?.ok ?? false) || idx < stepIndex;
              const current = running && idx === stepIndex;
              return (
                <li key={s.key} className="flex items-center gap-3 text-[13px]">
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full ${
                      done ? 'bg-[#44AFCD] text-[#0A1D25]' : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {done ? <Check size={14} /> : current ? <Loader2 size={14} className="animate-spin" /> : null}
                  </span>
                  <span className={done || current ? 'text-white' : 'text-white/50'}>{s.label}</span>
                </li>
              );
            })}
          </ul>
        )}

        {issue && (
          <div className="space-y-3">
            <div className="flex items-start gap-3 rounded-2xl bg-white/5 p-3">
              {issue === 'gps_off' ? (
                <MapPinOff size={20} className="mt-0.5 shrink-0 text-[#FD6046]" />
              ) : (
                <ShieldAlert size={20} className="mt-0.5 shrink-0 text-[#FD6046]" />
              )}
              <p className="text-[13px] leading-snug text-white/85">{ISSUE_COPY[issue].body}</p>
            </div>
            {guidance && (
              <ol className="list-decimal space-y-1 pl-5 text-[12px] text-white/70">
                {guidance.map((g) => (
                  <li key={g}>{g}</li>
                ))}
              </ol>
            )}
            <button
              type="button"
              onClick={() => void fix()}
              className="h-12 w-full rounded-2xl bg-[#FD6046] text-[14px] font-semibold active:scale-[0.98]"
            >
              {fixLabel}
            </button>
            {result?.ok && result.warning && (
              <button
                type="button"
                onClick={() => onReady(result.position)}
                className="h-11 w-full rounded-2xl border border-white/15 text-[13px] text-white/80 active:bg-white/5"
              >
                Start anyway (tracking may pause when minimised)
              </button>
            )}
          </div>
        )}

        {!issue && (
          <button type="button" onClick={onClose} className="mt-5 h-11 w-full rounded-2xl border border-white/15 text-[13px] text-white/80">
            Cancel
          </button>
        )}
      </div>
    </div>
    </OverlayPortal>
  );
}
