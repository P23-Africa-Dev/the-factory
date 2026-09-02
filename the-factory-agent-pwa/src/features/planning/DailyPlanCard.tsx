'use client';

import React from 'react';
import { DailyPlanEditor } from './DailyPlanEditor';
import type { DailyPlanPayload, PlanEditsMap } from './types';

interface DailyPlanCardProps {
  payload: DailyPlanPayload;
  edits: PlanEditsMap;
  onEditsChange: (edits: PlanEditsMap) => void;
  onAccept: () => void;
  onDismiss: () => void;
  isAccepting: boolean;
  accepted: boolean;
  dismissed: boolean;
}

export function DailyPlanCard(props: DailyPlanCardProps): React.ReactElement {
  return <DailyPlanEditor {...props} />;
}
