'use client';

import React from 'react';
import {
  isSoftBannerDismissedToday,
  useFieldActivityReviewUi,
} from '../reviewUiStore';
import { useFieldActivityPendingReview, useFieldActivityToday } from '../queries';
import { StopClassifyRow, useStopClassifier } from './StopClassifyRow';

export function PileInboxBadge(): React.ReactElement | null {
  const { data } = useFieldActivityPendingReview();
  const openPileInbox = useFieldActivityReviewUi((s) => s.openPileInbox);
  const count = data?.pending_stop_count ?? 0;
  if (count <= 0) return null;

  return (
    <button
      type="button"
      onClick={openPileInbox}
      className="mx-4 mt-3 flex w-[calc(100%-2rem)] items-center justify-between rounded-2xl border border-[#F6C470]/30 bg-[#F6C470]/10 px-4 py-3 text-left"
    >
      <div>
        <p className="text-sm font-semibold text-[#F6C470]">Review inbox</p>
        <p className="text-xs text-[#8F9098]">
          {count} piled stop{count === 1 ? '' : 's'} across {data?.pending_session_count ?? 0} day
          {(data?.pending_session_count ?? 0) === 1 ? '' : 's'}
        </p>
      </div>
      <span className="rounded-full bg-[#F6C470] px-2.5 py-1 text-xs font-bold text-[#0B1E26]">
        {count}
      </span>
    </button>
  );
}

export function PendingReviewSoftBanner(): React.ReactElement | null {
  const { data: today } = useFieldActivityToday();
  const { data: pending } = useFieldActivityPendingReview();
  const openPileInbox = useFieldActivityReviewUi((s) => s.openPileInbox);
  const dismissedDate = useFieldActivityReviewUi((s) => s.softBannerDismissedDate);
  const dismiss = useFieldActivityReviewUi((s) => s.dismissSoftBannerForToday);

  const count = pending?.pending_stop_count ?? 0;
  const hasActiveSession = Boolean(today?.session && today.session.status === 'active');
  if (count <= 0 || hasActiveSession || isSoftBannerDismissedToday(dismissedDate)) {
    return null;
  }

  return (
    <div className="mx-4 mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
      <p className="text-sm font-semibold text-white">You have piled day reviews</p>
      <p className="mt-1 text-xs text-[#8F9098]">
        {count} unclassified stop{count === 1 ? '' : 's'} waiting. Finish them when you can.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={openPileInbox}
          className="rounded-full bg-[#75ADAF] px-3 py-1.5 text-xs font-semibold text-[#0B1E26]"
        >
          Open inbox
        </button>
        <button
          type="button"
          onClick={dismiss}
          className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white"
        >
          Later
        </button>
      </div>
    </div>
  );
}

export function PileInboxSheet(): React.ReactElement | null {
  const open = useFieldActivityReviewUi((s) => s.pileInboxOpen);
  const close = useFieldActivityReviewUi((s) => s.closePileInbox);
  const { data: pendingReview, refetch } = useFieldActivityPendingReview(open);
  const { handleClassify, busy } = useStopClassifier();

  if (!open) return null;

  const sessions = pendingReview?.sessions ?? [];

  return (
    <div className="fixed inset-0 z-[10020] flex items-end justify-center bg-black/70 px-0 sm:items-center sm:px-6">
      <div className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-[28px] border border-white/10 bg-[#0B1E26] p-5 shadow-2xl sm:rounded-[28px]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#F6C470]">
              Review inbox
            </p>
            <h3 className="mt-1 text-lg font-bold text-white">Piled day reviews</h3>
            <p className="mt-1 text-sm text-[#8F9098]">
              {pendingReview?.pending_stop_count ?? 0} stop
              {(pendingReview?.pending_stop_count ?? 0) === 1 ? '' : 's'} across{' '}
              {pendingReview?.pending_session_count ?? 0} day
              {(pendingReview?.pending_session_count ?? 0) === 1 ? '' : 's'}
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

        <div className="space-y-4">
          {sessions.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-white/10 px-4 py-6 text-center text-sm text-[#8F9098]">
              Inbox is clear.
            </p>
          ) : (
            sessions.map((session) => {
              const label = session.started_at
                ? new Date(session.started_at).toLocaleDateString()
                : 'Unknown date';
              return (
                <div key={session.session_id} className="space-y-3">
                  <div className="flex items-center justify-between px-1">
                    <p className="text-sm font-semibold text-white">{label}</p>
                    <span className="text-xs text-[#8F9098]">
                      {session.pending_stop_count} pending
                    </span>
                  </div>
                  {session.stops.map((stop) => (
                    <StopClassifyRow
                      key={stop.id}
                      stop={stop}
                      busy={busy}
                      onClassify={async (...args) => {
                        await handleClassify(...args);
                        void refetch();
                      }}
                    />
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
