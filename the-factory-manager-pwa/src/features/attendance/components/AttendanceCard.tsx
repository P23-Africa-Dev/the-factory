'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import { useAttendanceMetrics } from '../queries';

/**
 * Manager Workforce Attendance Card — keeps the exact 90x154px home card geometry
 * of the Agent PWA while displaying live workforce attendance metrics
 * (`attendance_percentage`, `present`, `late`, `absent`) and navigating to `/workforce`.
 */
export function AttendanceCard(): React.ReactElement {
  const router = useRouter();
  const { data: metrics, isLoading } = useAttendanceMetrics();

  const present = metrics?.present ?? 0;
  const late = metrics?.late ?? 0;
  const total = metrics?.total_workforce ?? 0;
  const pct =
    metrics?.attendance_percentage != null
      ? Math.round(metrics.attendance_percentage)
      : total > 0
        ? Math.round(((present + late) / total) * 100)
        : 0;

  return (
    <div
      onClick={() => router.push('/workforce')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') router.push('/workforce');
      }}
      className="w-[90px] h-[154px] bg-[#0B3343] rounded-[20px] overflow-hidden flex flex-col justify-between py-3 px-1.5 shadow-md flex-shrink-0 select-none cursor-pointer active:scale-95 transition-transform"
    >
      {isLoading && !metrics ? (
        <div className="flex flex-1 items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#75ADAF] border-t-transparent" />
        </div>
      ) : (
        <div className="flex flex-col flex-1 items-center justify-between">
          {/* Top badge */}
          <div className="flex items-center gap-1 bg-[#75ADAF]/16 rounded-lg px-2 py-1">
            <Users size={10} className="text-[#75ADAF]" />
            <span className="text-[8px] font-bold tracking-wider text-[#75ADAF]">
              {pct}% In
            </span>
          </div>

          {/* Middle attendance counts */}
          <div className="flex flex-col items-center leading-tight">
            <span className="font-sans text-[9px] font-normal text-white/50 text-center">
              Workforce
            </span>
            <span className="font-sans text-sm font-extrabold text-white mt-0.5 text-center tabular-nums">
              {present + late}/{total}
            </span>
            <span className="font-sans text-[8px] font-medium text-[#FD6046] mt-0.5 text-center">
              {late > 0 ? `${late} Late` : 'On Time'}
            </span>
          </div>

          {/* Bottom action pill */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.push('/workforce');
            }}
            className="w-[67px] h-[32px] rounded-xl bg-[#75ADAF]/20 hover:bg-[#75ADAF]/30 border border-[#75ADAF]/40 flex items-center justify-center gap-1 px-1 text-[#75ADAF] transition-all outline-none"
          >
            <span className="font-sans font-bold text-[8px] uppercase tracking-wider">
              Team Log
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
