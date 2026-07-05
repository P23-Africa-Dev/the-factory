'use client';

import React from 'react';
import { CalendarClock, CheckCircle2, ListChecks, Sparkles } from 'lucide-react';
import type { DailyPlanPayload } from './types';

interface DailyPlanCardProps {
  payload: DailyPlanPayload;
  onAccept: () => void;
  onDismiss: () => void;
  isAccepting: boolean;
  accepted: boolean;
  dismissed: boolean;
}

function typeLabel(type: string): string {
  switch (type) {
    case 'overdue_task':
    case 'task':
      return 'Task';
    case 'follow_up':
      return 'Follow-up';
    case 'meeting':
      return 'Meeting';
    case 'nearby_visit':
      return 'Nearby';
    case 'kpi':
      return 'KPI';
    default:
      return 'Item';
  }
}

export function DailyPlanCard({
  payload,
  onAccept,
  onDismiss,
  isAccepting,
  accepted,
  dismissed,
}: DailyPlanCardProps): React.ReactElement {
  const counts = payload.summary_counts ?? {};
  const creatableCount = payload.acceptance?.creatable_count ?? 0;

  return (
    <div className="mt-3 rounded-2xl border border-[#75ADAF]/25 bg-[#0B1E26]/80 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
        <Sparkles size={14} className="text-[#75ADAF]" />
        <span className="text-xs font-bold text-white uppercase tracking-wide">Your day plan</span>
      </div>

      <div className="px-4 py-3 flex flex-wrap gap-2 text-[10px] font-semibold">
        {(counts.tasks ?? 0) > 0 && (
          <span className="px-2 py-1 rounded-full bg-white/5 text-[#D0E2E3]">
            {counts.tasks} task{counts.tasks === 1 ? '' : 's'}
          </span>
        )}
        {(counts.follow_ups ?? 0) > 0 && (
          <span className="px-2 py-1 rounded-full bg-white/5 text-[#D0E2E3]">
            {counts.follow_ups} follow-up{counts.follow_ups === 1 ? '' : 's'}
          </span>
        )}
        {(counts.meetings ?? 0) > 0 && (
          <span className="px-2 py-1 rounded-full bg-white/5 text-[#D0E2E3]">
            {counts.meetings} meeting{counts.meetings === 1 ? '' : 's'}
          </span>
        )}
        {(counts.kpis ?? 0) > 0 && (
          <span className="px-2 py-1 rounded-full bg-white/5 text-[#D0E2E3]">
            {counts.kpis} KPI{counts.kpis === 1 ? '' : 's'}
          </span>
        )}
        {(counts.nearby ?? 0) > 0 && (
          <span className="px-2 py-1 rounded-full bg-white/5 text-[#D0E2E3]">
            {counts.nearby} nearby
          </span>
        )}
      </div>

      <div className="max-h-[280px] overflow-y-auto px-3 pb-2 flex flex-col gap-2">
        {payload.items.map((item) => {
          const createsTask = item.task_draft?.creates_task === true;
          return (
            <div
              key={`${item.entity_type}-${item.entity_id}-${item.rank}`}
              className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[#75ADAF]/20 text-[#75ADAF] text-[10px] font-bold flex items-center justify-center">
                    {item.rank}
                  </span>
                  <span className="text-[10px] font-semibold text-[#75ADAF] uppercase">
                    {typeLabel(item.type)}
                  </span>
                </div>
                {item.scheduled_start && item.scheduled_end && (
                  <span className="flex items-center gap-1 text-[9px] text-white/50 flex-shrink-0">
                    <CalendarClock size={10} />
                    {item.scheduled_start}–{item.scheduled_end}
                  </span>
                )}
              </div>
              <p className="text-xs font-semibold text-white leading-snug">{item.title}</p>
              <p className="text-[10px] text-white/50 mt-0.5">{item.reason}</p>
              <p className="text-[10px] text-[#D0E2E3]/70 mt-1">{item.suggested_action}</p>
              <span
                className={`inline-block mt-2 text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                  createsTask
                    ? 'bg-[#FD6046]/15 text-[#FD6046]'
                    : 'bg-[#75ADAF]/15 text-[#75ADAF]'
                }`}
              >
                {createsTask ? 'Will create task' : 'Already a task'}
              </span>
            </div>
          );
        })}
      </div>

      {!dismissed && !accepted && (
        <div className="px-4 py-3 border-t border-white/5 flex gap-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={isAccepting || creatableCount === 0}
            className="flex-1 h-10 rounded-full bg-[#FD6046] hover:bg-[#E0533C] text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 transition-all"
          >
            {isAccepting ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <ListChecks size={14} />
                Accept plan
                {creatableCount > 0 ? ` (${creatableCount})` : ''}
              </>
            )}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            disabled={isAccepting}
            className="h-10 px-4 rounded-full border border-white/15 text-white/70 text-xs font-semibold hover:bg-white/5 active:scale-95 transition-all"
          >
            Dismiss
          </button>
        </div>
      )}

      {accepted && (
        <div className="px-4 py-3 border-t border-white/5 flex items-center gap-2 text-[#75ADAF] text-xs font-semibold">
          <CheckCircle2 size={14} />
          Plan accepted — your tasks are ready
        </div>
      )}
    </div>
  );
}
