'use client';

import React from 'react';
import Link from 'next/link';
import { useMyJourneys } from '@/features/field-activity/queries';

function formatKm(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

export default function JourneyHistoryPage(): React.ReactElement {
  const { data, isLoading } = useMyJourneys();
  const items = data?.items ?? [];
  const summary = data?.summary;

  return (
    <main className="min-h-screen bg-[#0A1D25] pb-8 pt-6">
      <header className="px-5 mb-4">
        <Link href="/field-activity" className="text-xs font-semibold text-[#75ADAF]">
          ← Field activity
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">My Journey History</h1>
        <p className="mt-1 text-sm text-[#8F9098]">
          Replay past working days — distance, stops, and visits.
        </p>
      </header>

      <section className="mx-5 mb-4 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center">
          <p className="text-xl font-bold text-white">{summary?.journey_count ?? 0}</p>
          <p className="text-[10px] text-[#8F9098] uppercase tracking-wide">Days</p>
        </div>
        <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center">
          <p className="text-lg font-bold text-white">
            {formatKm(summary?.distance_meters ?? 0)}
          </p>
          <p className="text-[10px] text-[#8F9098] uppercase tracking-wide">Distance</p>
        </div>
        <div className="rounded-2xl bg-white/5 border border-white/10 p-3 text-center">
          <p className="text-xl font-bold text-white">{summary?.visit_count ?? 0}</p>
          <p className="text-[10px] text-[#8F9098] uppercase tracking-wide">Visits</p>
        </div>
      </section>

      <section className="px-5 space-y-3">
        {isLoading ? (
          <p className="text-sm text-[#8F9098]">Loading journeys…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-[#8F9098]">
            No journeys yet. Clock in with Field Activity enabled to start recording.
          </p>
        ) : (
          items.map((journey) => (
            <Link
              key={journey.id}
              href={`/field-activity/journeys/${journey.id}`}
              className="block rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {journey.date ?? 'Unknown date'}
                  </p>
                  <p className="mt-1 text-xs text-[#8F9098]">
                    {formatKm(journey.distance_meters)} · {journey.stop_count} stops ·{' '}
                    {journey.visit_count} visits
                  </p>
                </div>
                <span className="rounded-full bg-[#75ADAF]/20 px-3 py-1 text-[10px] font-bold uppercase text-[#75ADAF]">
                  View
                </span>
              </div>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
