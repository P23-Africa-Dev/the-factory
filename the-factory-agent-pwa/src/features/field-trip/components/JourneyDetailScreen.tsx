'use client';

import React, { useMemo } from 'react';
import Link from 'next/link';
import { formatDistance, plural } from '../format';
import { journeySubtitle, journeyTitle, type JourneyDetailDto } from '../journeyDetail';
import { TripRouteMap } from './TripRouteMap';

const COLORS: Record<string, string> = {
  green: '#22C55E',
  blue: '#3B82F6',
  orange: '#F97316',
  purple: '#A855F7',
  gray: '#9CA3AF',
  red: '#EF4444',
  teal: '#14B8A6',
};

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/**
 * Trip / journey detail for agents and managers: title with the trip's time
 * range, the route map with playback, key numbers, stops and the timeline.
 */
export function JourneyDetailScreen({
  data,
  isLoading,
  isError,
  basePath,
  onRetry,
}: {
  data: JourneyDetailDto | undefined;
  isLoading: boolean;
  isError: boolean;
  /** e.g. "/field-activity/journeys" or "/manager/field-activity/journeys" */
  basePath: string;
  onRetry?: () => void;
}): React.ReactElement {
  const journey = data?.journey;
  const isTrip = journey?.source === 'field_trip';
  const stats = data?.stats ?? {};
  const stops = useMemo(() => data?.stops ?? [], [data?.stops]);
  const timeline = data?.timeline ?? [];
  const navigation = data?.navigation;
  const running = journey?.status === 'active' || (isTrip && !journey?.ended_at);
  const subtitle = journeySubtitle(journey);
  const distance = Number(stats.distance_meters ?? journey?.distance_meters ?? 0);
  const activeSeconds = Number(stats.active_seconds ?? 0);
  const unit = isTrip ? 'trip' : 'day';

  return (
    <main className="min-h-screen bg-[#0A1D25] pb-10 pt-6">
      <header className="mb-4 px-5">
        <Link href={basePath} className="inline-flex min-h-11 items-center text-xs font-semibold text-[#75ADAF]">
          ← Journey history
        </Link>
        <h1 className="mt-1 text-xl font-bold text-white">{journeyTitle(journey)}</h1>
        {subtitle ? <p className="mt-0.5 text-xs text-[#FBBF24]/90">{subtitle}</p> : null}
        <p className="mt-1 text-sm text-[#8F9098]">
          {formatDistance(distance)} · {plural(Number(stats.stop_count ?? stops.length), 'stop')}
          {activeSeconds > 0 ? ` · ${formatDuration(activeSeconds)}` : ''}
          {Number(stats.visit_count ?? 0) > 0 ? ` · ${plural(Number(stats.visit_count), 'visit')}` : ''}
        </p>
        <div className="mt-3 flex gap-2">
          {navigation?.previous_id ? (
            <Link
              href={`${basePath}/${navigation.previous_id}`}
              className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-xs font-semibold text-white"
            >
              ← Previous {unit}
            </Link>
          ) : null}
          {navigation?.next_id ? (
            <Link
              href={`${basePath}/${navigation.next_id}`}
              className="inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-xs font-semibold text-white"
            >
              Next {unit} →
            </Link>
          ) : null}
        </div>
      </header>

      {isLoading ? (
        <p className="px-5 text-sm text-[#8F9098]">Loading {unit}…</p>
      ) : isError || !data ? (
        <div className="px-5">
          <p className="text-sm text-[#8F9098]">Unable to load this {unit}.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 min-h-11 rounded-full bg-[#44AFCD] px-5 text-xs font-semibold text-[#0A1D25]"
            >
              Try again
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-5 px-5">
          <TripRouteMap route={data.route} stops={stops} running={running} />

          {stops.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-white">Stops</h2>
              {stops.map((stop, i) => (
                <div key={stop.id} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#F59E0B] text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-white">{stop.address || `Stop ${i + 1}`}</p>
                    <p className="text-[11px] text-[#8F9098]">
                      {stop.arrived_at
                        ? new Date(stop.arrived_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                        : '—'}
                      {stop.duration_seconds > 0 ? ` · ${formatDuration(stop.duration_seconds)}` : ''}
                      {stop.classification ? ` · ${stop.classification.replaceAll('_', ' ')}` : ''}
                    </p>
                  </div>
                </div>
              ))}
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-white">Timeline</h2>
            {timeline.length === 0 ? <p className="text-xs text-[#8F9098]">Nothing recorded yet.</p> : null}
            {timeline.map((event) => (
              <div key={event.id} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                <span
                  className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: COLORS[event.color] ?? '#9CA3AF' }}
                />
                <div className="min-w-0">
                  <p className="text-[11px] text-[#8F9098]">
                    {event.occurred_at
                      ? new Date(event.occurred_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                      : '—'}
                  </p>
                  <p className="text-sm font-semibold text-white">{event.label}</p>
                </div>
              </div>
            ))}
          </section>
        </div>
      )}
    </main>
  );
}
