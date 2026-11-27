'use client';

import React from 'react';
import { AlertTriangle, CalendarClock, Loader2, Sparkles } from 'lucide-react';
import type { TripAiSummary } from './types';

/** ELY's summary of a submitted trip report (or the plain fallback). */
export function TripSummaryCard({ summary, generating }: { summary: TripAiSummary | null | undefined; generating?: boolean }) {
  if (!summary) {
    if (!generating) return null;
    return (
      <section className="flex items-center gap-2 rounded-2xl border border-[#44AFCD]/25 bg-[#44AFCD]/8 p-4 text-[13px] text-white/75">
        <Loader2 size={16} className="animate-spin text-[#44AFCD]" /> ELY is writing your trip summary…
      </section>
    );
  }
  const highlights = summary.highlights ?? [];
  const followUps = summary.follow_ups ?? [];
  const concerns = summary.concerns ?? [];
  return (
    <section className="space-y-3 rounded-2xl border border-[#44AFCD]/25 bg-gradient-to-b from-[#44AFCD]/12 to-transparent p-4 text-white">
      <h2 className="flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-wide text-[#44AFCD]">
        <Sparkles size={14} /> {summary.source === 'ai' ? 'AI trip summary' : 'Trip summary'}
      </h2>
      <p className="text-[14px] leading-relaxed text-white/90">{summary.summary}</p>
      {highlights.length > 0 && (
        <ul className="space-y-1">
          {highlights.map((h, i) => (
            <li key={i} className="flex gap-2 text-[13px] text-white/80">
              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#44AFCD]" />
              {h}
            </li>
          ))}
        </ul>
      )}
      {followUps.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#FBBF24]">Follow-ups</p>
          {followUps.map((f, i) => (
            <div key={i} className="flex items-start gap-2 rounded-xl bg-white/5 px-3 py-2 text-[13px]">
              <CalendarClock size={14} className="mt-0.5 shrink-0 text-[#FBBF24]" />
              <span>
                <span className="font-semibold">{f.who}</span> · {f.what}
                {f.when && <span className="text-white/60"> · {f.when}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
      {concerns.length > 0 && (
        <div className="space-y-1">
          {concerns.map((c, i) => (
            <p key={i} className="flex items-start gap-2 text-[12px] text-[#FD6046]">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {c}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
