'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Navigation, ChevronRight, MapPin, Activity } from 'lucide-react';
import { useFieldActivityAnalytics } from '../queries';

function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatHours(seconds: number): string {
  return `${(seconds / 3600).toFixed(1)} h`;
}

export function FieldActivitySummaryCard(): React.ReactElement | null {
  const router = useRouter();
  const { data: analytics, isLoading } = useFieldActivityAnalytics({ preset: 'today' });

  if (isLoading && !analytics) {
    return null;
  }

  const activeSessions = analytics?.active_sessions ?? 0;
  const distance = analytics?.distance_meters ?? 0;
  const travel = analytics?.travel_seconds ?? 0;
  const visits = analytics?.visit_count ?? 0;
  const stops = analytics?.stop_count ?? 0;
  const unknown = analytics?.unknown_stop_count ?? 0;
  const agents = analytics?.agents ?? [];

  return (
    <section className="mx-4 mt-4 space-y-3">
      <div
        onClick={() => router.push('/field-activity')}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') router.push('/field-activity');
        }}
        className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#12323A] to-[#0B1E26] p-5 cursor-pointer active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-[#75ADAF]" />
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#75ADAF]">
              Team Field Activity Pulse
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-[#75ADAF]/15 px-2.5 py-0.5 text-[10px] font-bold text-[#75ADAF]">
            {activeSessions} Active Now
            <ChevronRight size={12} />
          </span>
        </div>

        <p className="mt-2.5 text-xs text-white/75 leading-relaxed">
          {agents.length > 0
            ? `Tracking ${agents.length} field agent(s) today. Tap to inspect agent routes, journeys, and stop classifications.`
            : 'Real-time team field journeys, route efficiency, and customer visit stops.'}
        </p>

        <div className="mt-4 grid grid-cols-4 gap-2">
          <div className="rounded-2xl bg-black/20 p-2.5">
            <p className="text-[10px] text-[#8F9098]">Distance</p>
            <p className="mt-0.5 text-sm font-bold text-white">{formatKm(distance)}</p>
          </div>
          <div className="rounded-2xl bg-black/20 p-2.5">
            <p className="text-[10px] text-[#8F9098]">Travel</p>
            <p className="mt-0.5 text-sm font-bold text-white">{formatHours(travel)}</p>
          </div>
          <div className="rounded-2xl bg-black/20 p-2.5">
            <p className="text-[10px] text-[#8F9098]">Visits</p>
            <p className="mt-0.5 text-sm font-bold text-[#75ADAF]">{visits}</p>
          </div>
          <div className="rounded-2xl bg-black/20 p-2.5">
            <p className="text-[10px] text-[#8F9098]">Stops / Unk.</p>
            <p className="mt-0.5 text-sm font-bold text-white">
              {stops} / <span className="text-[#FD6046]">{unknown}</span>
            </p>
          </div>
        </div>

        {agents.length > 0 && (
          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
            <div className="flex items-center gap-2 text-xs text-white/80">
              <Navigation size={12} className="text-[#75ADAF]" />
              <span>
                Top mover: <strong className="text-white">{agents[0].name}</strong> (
                {formatKm(agents[0].distance_meters)})
              </span>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#75ADAF]">
              <MapPin size={11} />
              Journeys
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
