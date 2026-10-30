'use client';

import React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useJourneyDetail } from '@/features/field-activity/queries';

const COLORS: Record<string, string> = {
  green: '#22C55E',
  blue: '#3B82F6',
  orange: '#F97316',
  purple: '#A855F7',
  gray: '#9CA3AF',
  red: '#EF4444',
  teal: '#14B8A6',
};

function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

export default function JourneyDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const { data, isLoading, isError } = useJourneyDetail(params.id);

  const timeline = data?.timeline ?? [];
  const stats = data?.stats ?? {};
  const navigation = data?.navigation;

  return (
    <main className="min-h-screen bg-[#0A1D25] pb-8 pt-6">
      <header className="px-5 mb-4">
        <Link href="/field-activity/journeys" className="text-xs font-semibold text-[#75ADAF]">
          ← Journey history
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">
          {data?.journey?.date ?? 'Journey'}
        </h1>
        <p className="mt-1 text-sm text-[#8F9098]">
          {formatKm(Number(stats.distance_meters ?? data?.journey?.distance_meters ?? 0))} ·{' '}
          {Number(stats.visit_count ?? 0)} visits · {Number(stats.stop_count ?? 0)} stops
        </p>
        <div className="mt-3 flex gap-2">
          {navigation?.previous_id ? (
            <Link
              href={`/field-activity/journeys/${navigation.previous_id}`}
              className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white"
            >
              ← Prev day
            </Link>
          ) : null}
          {navigation?.next_id ? (
            <Link
              href={`/field-activity/journeys/${navigation.next_id}`}
              className="rounded-full border border-white/15 px-3 py-1 text-xs font-semibold text-white"
            >
              Next day →
            </Link>
          ) : null}
        </div>
      </header>

      {isLoading ? (
        <p className="px-5 text-sm text-[#8F9098]">Loading journey…</p>
      ) : isError || !data ? (
        <p className="px-5 text-sm text-[#8F9098]">Unable to load this journey.</p>
      ) : (
        <section className="px-5 space-y-3">
          <h2 className="text-sm font-semibold text-white">Timeline</h2>
          {timeline.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/5 p-3"
            >
              <span
                className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: COLORS[event.color] ?? '#9CA3AF' }}
              />
              <div className="min-w-0">
                <p className="text-[11px] text-[#8F9098]">
                  {event.occurred_at
                    ? new Date(event.occurred_at).toLocaleTimeString([], {
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : '—'}
                </p>
                <p className="text-sm font-semibold text-white">{event.label}</p>
              </div>
            </div>
          ))}
        </section>
      )}
    </main>
  );
}
