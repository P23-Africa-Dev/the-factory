'use client';

import React from 'react';
import Link from 'next/link';
import {
  FieldActivitySummaryCard,
  DayReviewSheet,
  PileInboxBadge,
  PileInboxSheet,
  PendingReviewSoftBanner,
} from '@/features/field-activity';

export default function FieldActivityPage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-[#0A1D25] pb-8 pt-6">
      <header className="px-5 mb-2 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Field activity</h1>
          <p className="mt-1 text-sm text-[#8F9098]">
            Review today’s distance, stops, and unclassified visits.
          </p>
        </div>
        <Link
          href="/field-activity/journeys"
          className="shrink-0 rounded-full bg-[#75ADAF]/20 px-3 py-1.5 text-xs font-semibold text-[#75ADAF]"
        >
          Journey History
        </Link>
      </header>
      <PendingReviewSoftBanner />
      <PileInboxBadge />
      <FieldActivitySummaryCard />
      <DayReviewSheet />
      <PileInboxSheet />
    </main>
  );
}
