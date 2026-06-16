'use client';

import React, { useEffect } from 'react';
import { useCurrentLocation } from '@/hooks/useCurrentLocation';
import { toast } from '@/lib/toast';
import { useTodayAttendance, useClockIn, useClockOut } from '../queries';

type ClockInModalProps = {
  visible: boolean;
  onClose: () => void;
};

export function ClockInModal({ visible, onClose }: ClockInModalProps): React.ReactElement | null {
  const { data: today } = useTodayAttendance();
  const { location, error: locationError, isLoading: isLocating, refresh } = useCurrentLocation();
  const { mutateAsync: clockIn, isPending: isClockingIn } = useClockIn();
  const { mutateAsync: clockOut, isPending: isClockingOut } = useClockOut();

  const isClockedIn = today?.isClockedIn ?? false;
  const isSubmitting = isClockingIn || isClockingOut;
  const action = isClockedIn ? 'clock_out' : 'clock_in';

  const blockedReason = !today
    ? null
    : !today.workingDay
      ? "Today isn't a scheduled working day."
      : isClockedIn
        ? (!today.canClockOut ? 'Clock-out is not available right now.' : null)
        : (!today.canClockIn ? 'Clock-in is not available right now.' : null);

  useEffect(() => {
    if (visible) refresh();
  }, [visible, refresh]);

  const handleConfirm = async (): Promise<void> => {
    if (!location) return;

    const payload = {
      latitude: location.latitude,
      longitude: location.longitude,
      timestamp: new Date(location.timestamp).toISOString(),
    };

    const actionFn = isClockedIn ? clockOut : clockIn;

    try {
      await actionFn(payload);
      toast.success(isClockedIn ? 'Clocked out' : 'Clocked in', 'Your location has been recorded.');
      onClose();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      const message = apiErr?.message || 'Something went wrong. Please try again.';
      toast.error(message);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 px-6 font-sans">
      <div className="w-full max-w-sm rounded-[20px] bg-[#0B1E26] p-6 text-center border border-white/10 shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <h3 className="text-xl font-bold text-white mb-3">
          {isClockedIn ? 'Clock Out' : 'Clock In'}
        </h3>
        <p className="text-sm leading-relaxed text-[#8F9098] mb-5">
          {isClockedIn
            ? 'This will record your current location and end your active attendance session.'
            : 'This will record your current location and start your attendance session for today.'}
        </p>

        {/* Location Status Message */}
        <div className="flex items-center justify-center gap-2 mb-6 min-h-[24px]">
          {blockedReason ? (
            <span className="text-[#FD6046] text-xs font-semibold">{blockedReason}</span>
          ) : isLocating ? (
            <div className="flex items-center gap-2 text-[#75ADAF] text-xs">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#75ADAF] border-t-transparent" />
              <span>Capturing your location…</span>
            </div>
          ) : locationError ? (
            <span className="text-[#FD6046] text-xs font-semibold">{locationError}</span>
          ) : location ? (
            <span className="text-[#75ADAF] text-xs">
              Location captured ({location.latitude.toFixed(5)}, {location.longitude.toFixed(5)})
            </span>
          ) : null}
        </div>

        {/* Action Button Layout */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 h-11 rounded-full border border-white/15 text-white font-medium text-xs bg-transparent transition-colors hover:bg-white/5 active:scale-95 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isSubmitting || isLocating || !location || Boolean(blockedReason)}
            className="flex-1 h-11 rounded-full bg-[#FD6046] hover:bg-[#E0533C] text-white font-bold text-xs flex items-center justify-center transition-colors active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              isClockedIn ? 'Clock Out' : 'Clock In'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
