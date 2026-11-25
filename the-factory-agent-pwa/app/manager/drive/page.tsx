'use client';

import React, { Suspense } from 'react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import { DriveScreen, type DriveMember } from '@/features/drive';
import { workforceApi } from '@/manager/features/workforce/api';

async function loadDriveMembers(): Promise<DriveMember[]> {
  const users = await workforceApi.getInternalUsers();
  return users
    .filter((user) => user.id > 0 && !user.is_suspended)
    .map(({ id, name, email, role }) => ({ id, name, email, role }));
}

export default function ManagerDrivePage() {
  return (
    <ScreenErrorBoundary screenName="Company Drive">
      {/* useSearchParams (?file= deep links) needs a Suspense boundary. */}
      <Suspense fallback={<div className="min-h-screen bg-[#0A1D25]" />}>
        <DriveScreen area="manager" loadMembers={loadDriveMembers} />
      </Suspense>
    </ScreenErrorBoundary>
  );
}
