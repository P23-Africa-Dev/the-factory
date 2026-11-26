'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useJourneyDetail } from '@/features/field-activity/queries';
import { JourneyDetailScreen } from '@/features/field-trip/components/JourneyDetailScreen';

export default function JourneyDetailPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const { data, isLoading, isError, refetch } = useJourneyDetail(params.id);
  return (
    <JourneyDetailScreen
      data={data}
      isLoading={isLoading}
      isError={isError}
      basePath="/field-activity/journeys"
      onRetry={() => void refetch()}
    />
  );
}
