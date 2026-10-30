'use client';

import React from 'react';
import { toast } from '@/lib/toast';
import {
  useFieldActivityPendingReview,
  useFieldActivityToday,
} from '../queries';
import { useFieldActivityReviewUi } from '../reviewUiStore';
import { StopClassifyRow, useStopClassifier } from './StopClassifyRow';

export function DayReviewSheet(): React.ReactElement | null {
  const open = useFieldActivityReviewUi((s) => s.dayReviewOpen);
  const close = useFieldActivityReviewUi((s) => s.closeDayReview);
  const openPileInbox = useFieldActivityReviewUi((s) => s.openPileInbox);
  const { data: today } = useFieldActivityToday(open);
  const { data: pendingReview, refetch } = useFieldActivityPendingReview(open);
  const { handleClassify, busy } = useStopClassifier();

  if (!open) return null;

  const todayPending = (today?.stops ?? []).filter((s) => s.classification === 'pending');
  const backlogSessions = pendingReview?.sessions ?? [];
  const primaryStops =
    todayPending.length > 0
      ? todayPending
      : backlogSessions[0]?.stops?.filter((s) => s.classification === 'pending') ?? [];
  const pendingCount = pendingReview?.pending_stop_count ?? primaryStops.length;

  return (
    <div className="fixed inset-0 z-[10020] flex items-end justify-center bg-black/70 px-0 sm:items-center sm:px-6">
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#0B1E26] p-5 shadow-2xl sm:rounded-[28px]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#75ADAF]">
              Day review
            </p>
            <h3 className="mt-1 text-lg font-bold text-white">Complete your journey</h3>
            <p className="mt-1 text-sm text-[#8F9098]">
              {pendingCount > 0
                ? `${pendingCount} stop${pendingCount === 1 ? '' : 's'} still need classification.`
                : 'All stops for today are classified. Nice work.'}
            </p>
          </div>
          <button
            type="button"
            onClick={close}
            className="rounded-full border border-white/15 px-3 py-1 text-xs text-white"
          >
            Close
          </button>
        </div>

        <div className="space-y-3">
          {primaryStops.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-[#8F9098]">
              Nothing left to classify right now.
            </p>
          ) : (
            primaryStops.map((stop) => (
              <StopClassifyRow
                key={stop.id}
                stop={stop}
                busy={busy}
                onClassify={async (...args) => {
                  await handleClassify(...args);
                  void refetch();
                }}
              />
            ))
          )}
        </div>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={() => {
              close();
              toast.success('Piled for later', 'You can finish this from your review inbox anytime.');
              openPileInbox();
            }}
            className="flex-1 rounded-full border border-white/15 py-3 text-sm font-semibold text-white"
          >
            Pile for later
          </button>
          <button
            type="button"
            onClick={close}
            className="flex-1 rounded-full bg-[#75ADAF] py-3 text-sm font-semibold text-[#0B1E26]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
