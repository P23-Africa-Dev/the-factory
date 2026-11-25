'use client';

import React, { Suspense } from 'react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import { DriveScreen } from '@/features/drive';

export default function AgentDrivePage() {
  return (
    <ScreenErrorBoundary screenName="Company Drive">
      {/* useSearchParams (?file= deep links) needs a Suspense boundary. */}
      <Suspense fallback={<div className="min-h-screen bg-[#0A1D25]" />}>
        <DriveScreen area="agent" />
      </Suspense>
    </ScreenErrorBoundary>
  );
}
