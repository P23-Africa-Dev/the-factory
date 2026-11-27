'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useJourneyDetail } from '@/manager/features/field-activity/queries';
import { TripReviewScreen } from '@/features/field-trip/report/TripReviewScreen';

export default function ManagerTripReviewPage(): React.ReactElement {
  const params = useParams<{ id: string }>();
  const tripId = Number(params.id);
  const journey = useJourneyDetail(params.id);
  return (
    <TripReviewScreen
      tripId={tripId}
      route={journey.data?.route}
      homePath="/manager"
      journeyHref={`/manager/field-activity/journeys/${tripId}`}
    />
  );
}
