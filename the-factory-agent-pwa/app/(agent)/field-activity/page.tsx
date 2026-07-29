'use client';

import React from 'react';
import { FieldActivitySummaryCard } from '@/features/field-activity';

export default function FieldActivityPage(): React.ReactElement {
  return (
    <main className="min-h-screen bg-[#0A1D25] pb-8 pt-6">
      <header className="px-5 mb-2">
        <h1 className="text-2xl font-bold text-white">Field activity</h1>
        <p className="mt-1 text-sm text-[#8F9098]">
          Review today’s distance, stops, and unclassified visits.
        </p>
      </header>
      <FieldActivitySummaryCard />
    </main>
  );
}
