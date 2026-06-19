'use client';

import React, { useEffect, useState } from 'react';
import { useAgentIdentity } from '@/features/auth';
import { useTodayAttendance } from '../queries';
import { ClockInModal } from './ClockInModal';

type CardStatus = 'loading' | 'idle' | 'active' | 'completed';

function formatDuration(startIso: string | null, endMs: number): string {
  if (!startIso) return '00:00:00';
  const elapsedSeconds = Math.max(0, Math.floor((endMs - new Date(startIso).getTime()) / 1000));
  const hours = Math.floor(elapsedSeconds / 3600);
  const minutes = Math.floor((elapsedSeconds % 3600) / 60);
  const seconds = elapsedSeconds % 60;
  const pad = (value: number): string => value.toString().padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

function StatusBadge({ status }: { status: CardStatus }): React.ReactElement {
  if (status === 'active') {
    return (
      <div className="flex items-center gap-1 bg-[#75ADAF]/16 rounded-lg px-2 py-1 select-none font-sans">
        <div className="w-1.5 h-1.5 rounded-full bg-[#75ADAF] animate-ping" />
        <span className="text-[8px] font-bold tracking-wider text-[#75ADAF]">Active</span>
      </div>
    );
  }
  if (status === 'completed') {
    return (
      <div className="flex items-center gap-1 bg-[#4CAF50]/16 rounded-lg px-2 py-1 select-none font-sans">
        <span className="text-[8px] font-bold text-[#4CAF50]">✓</span>
        <span className="text-[8px] font-bold tracking-wider text-[#4CAF50]">Completed</span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 bg-white/8 rounded-lg px-2 py-1 select-none font-sans">
      <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
      <span className="text-[8px] font-bold tracking-wider text-white/60">Inactive</span>
    </div>
  );
}

export function AttendanceCard(): React.ReactElement {
  const { data: today, isLoading, isFetching } = useTodayAttendance();
  const { avatarSrc } = useAgentIdentity();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const clockInAt = today?.clockInAt ?? null;
  const clockOutAt = today?.clockOutAt ?? null;
  const isActive = today?.isClockedIn ?? false;
  const isCompleted = Boolean(clockInAt && clockOutAt);

  const status: CardStatus = isLoading && !today ? 'loading' : isActive ? 'active' : isCompleted ? 'completed' : 'idle';
  const isBusy = isLoading || isFetching || isActionPending;

  useEffect(() => {
    if (status !== 'active') return undefined;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [status]);

  const timeWorked =
    status === 'active'
      ? formatDuration(clockInAt, now)
      : status === 'completed'
        ? formatDuration(clockInAt, clockOutAt ? new Date(clockOutAt).getTime() : now)
        : '00:00:00';

  return (
    <>
      <div className="w-[90px] h-[154px] bg-[#0B3343] rounded-[20px] overflow-hidden flex flex-col justify-between py-3 px-1.5 shadow-md flex-shrink-0 select-none">
        {status === 'loading' && (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#75ADAF] border-t-transparent" />
          </div>
        )}

        {status === 'idle' && (
          <div className="flex flex-col flex-1 items-center justify-between">
            {/* Top avatar circle */}
            <div className="w-8 h-8 rounded-full bg-black/30 flex items-center justify-center overflow-hidden">
              <img src={avatarSrc} alt="Avatar" className="w-7 h-7 object-cover" />
            </div>

            {/* Middle attendance status texts */}
            <div className="flex flex-col items-center leading-tight">
              <span className="font-sans text-[10px] font-normal text-white/50 text-center">Attendance</span>
              <span className="font-sans text-[10px] font-normal text-white/50 text-center">Status</span>
              <span className="font-sans text-[11px] font-bold text-white mt-1 text-center">(Inactive)</span>
            </div>

            {/* Bottom clock-in button */}
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={isBusy}
              className="w-[67px] h-[34px] rounded-xl bg-[#FD6046] hover:bg-[#E0533C] flex items-center justify-center gap-1 px-1.5 text-white active:scale-95 transition-all outline-none focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <img src="/assets/clock-arrow-up.png" alt="Clock" className="w-3.5 h-3.5 object-contain" />
              <span className="font-sans font-medium text-[8px]">Clock In</span>
            </button>
          </div>
        )}

        {status === 'active' && (
          <div className="flex flex-col flex-1 items-center justify-between">
            <StatusBadge status={status} />

            <div className="flex flex-col items-center gap-0.5">
              <span className="font-sans font-light text-[7px] tracking-wider text-white/60">Time Worked</span>
              <span className="font-sans font-bold text-xs tracking-wider text-white tabular-nums">{timeWorked}</span>
            </div>

            <button
              onClick={() => setIsModalOpen(true)}
              disabled={isBusy}
              className="w-[67px] h-[34px] rounded-xl bg-[#FD6046]/15 hover:bg-[#FD6046]/25 border border-[#FD6046] flex items-center justify-center gap-1 px-1 text-[#FD6046] active:scale-95 transition-all outline-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <img src="/assets/clock-arrow-up.png" alt="Clock" className="w-3.5 h-3.5 object-contain" />
              <span className="font-sans font-medium text-[8px]">Clock Out</span>
            </button>
          </div>
        )}

        {status === 'completed' && (
          <div className="flex flex-col flex-1 items-center justify-between">
            <StatusBadge status={status} />

            <div className="flex flex-col items-center gap-0.5">
              <span className="font-sans font-light text-[7px] tracking-wider text-white/60">Time Worked</span>
              <span className="font-sans font-bold text-xs tracking-wider text-white tabular-nums">{timeWorked}</span>
            </div>

            <span className="font-sans text-[7px] text-white/50 tracking-wide text-center">Done for today</span>
          </div>
        )}
      </div>

      <ClockInModal
        visible={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onPendingChange={setIsActionPending}
      />
    </>
  );
}
