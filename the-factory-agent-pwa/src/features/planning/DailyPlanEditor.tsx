'use client';

import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ListChecks,
  Pencil,
  Sparkles,
  X,
} from 'lucide-react';
import {
  countSelectedCreatableItems,
  planItemKey,
  resolveItemDraft,
} from './planEditorState';
import type { DailyPlanItem, DailyPlanPayload, PlanEditsMap, PlanItemEditState } from './types';

interface DailyPlanEditorProps {
  payload: DailyPlanPayload;
  edits: PlanEditsMap;
  onEditsChange: (edits: PlanEditsMap) => void;
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
    case 'overdue_follow_up':
    case 'follow_up':
      return 'Follow-up';
    case 'meeting_attend':
    case 'meeting_prep':
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

function formatDueForInput(dueDate?: string | null): string {
  if (!dueDate) {
    return '';
  }

  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

interface PlanItemRowProps {
  item: DailyPlanItem;
  edit: PlanItemEditState;
  displayTitle: string;
  createsTask: boolean;
  onToggleSelected: () => void;
  onRemove: () => void;
  onEdit: () => void;
}

function PlanItemRow({
  item,
  edit,
  displayTitle,
  createsTask,
  onToggleSelected,
  onRemove,
  onEdit,
}: PlanItemRowProps): React.ReactElement {
  const isLinked = item.editable === false || item.removable === false || !createsTask;
  const hidden = edit.removed;

  if (hidden) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 px-3 py-2 text-[10px] text-white/40 italic">
        Removed: {displayTitle}
        <button type="button" onClick={onRemove} className="ml-2 text-[#75ADAF] not-italic font-semibold">
          Undo
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/5 px-3 py-2.5">
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={edit.selected}
          disabled={isLinked}
          onChange={onToggleSelected}
          className="mt-1 h-3.5 w-3.5 rounded border-white/20 bg-transparent accent-[#75ADAF] disabled:opacity-40"
          aria-label={`Include ${displayTitle}`}
        />
        <div className="min-w-0 flex-1">
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
          <p className="text-xs font-semibold text-white leading-snug">{displayTitle}</p>
          <p className="text-[10px] text-white/50 mt-0.5">{item.reason}</p>
          <p className="text-[10px] text-[#D0E2E3]/70 mt-1">{item.suggested_action}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={`inline-block text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                createsTask
                  ? 'bg-[#FD6046]/15 text-[#FD6046]'
                  : 'bg-[#75ADAF]/15 text-[#75ADAF]'
              }`}
            >
              {createsTask ? 'Will create task' : 'Already a task'}
            </span>
            {item.editable !== false && (
              <button
                type="button"
                onClick={onEdit}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-[#75ADAF] hover:text-white"
              >
                <Pencil size={10} />
                Edit
              </button>
            )}
            {item.removable !== false && createsTask && (
              <button
                type="button"
                onClick={onRemove}
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/50 hover:text-[#FD6046]"
              >
                <X size={10} />
                Remove
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function DailyPlanEditor({
  payload,
  edits,
  onEditsChange,
  onAccept,
  onDismiss,
  isAccepting,
  accepted,
  dismissed,
}: DailyPlanEditorProps): React.ReactElement {
  const counts = payload.summary_counts ?? {};
  const selectedCreatableCount = countSelectedCreatableItems(payload, edits);
  const [expandedKpiGroups, setExpandedKpiGroups] = useState<Record<number, boolean>>({});
  const [editingItemKey, setEditingItemKey] = useState<string | null>(null);

  const groupedItems = useMemo(() => {
    const standalone: DailyPlanItem[] = [];
    const kpiGroups = new Map<number, DailyPlanItem[]>();

    for (const item of payload.items) {
      if (item.parent_entity_type === 'kpi' && item.parent_entity_id != null) {
        const group = kpiGroups.get(item.parent_entity_id) ?? [];
        group.push(item);
        kpiGroups.set(item.parent_entity_id, group);
        continue;
      }

      standalone.push(item);
    }

    return { standalone, kpiGroups };
  }, [payload.items]);

  const updateEdit = (key: string, patch: Partial<PlanItemEditState>): void => {
    onEditsChange({
      ...edits,
      [key]: {
        ...edits[key],
        ...patch,
      },
    });
  };

  const renderItem = (item: DailyPlanItem): React.ReactElement => {
    const key = planItemKey(item);
    const edit = edits[key] ?? { selected: true, removed: false };
    const draft = resolveItemDraft(item, edit);
    const displayTitle = draft.title || item.title;
    const createsTask = draft.creates_task === true;

    return (
      <PlanItemRow
        key={key}
        item={item}
        edit={edit}
        displayTitle={displayTitle}
        createsTask={createsTask}
        onToggleSelected={() => updateEdit(key, { selected: !edit.selected })}
        onRemove={() => updateEdit(key, { removed: !edit.removed })}
        onEdit={() => setEditingItemKey(key)}
      />
    );
  };

  const editingItem = editingItemKey
    ? payload.items.find((item) => planItemKey(item) === editingItemKey)
    : null;
  const editingDraft = editingItem
    ? resolveItemDraft(editingItem, edits[editingItemKey!])
    : null;

  return (
    <div className="mt-3 rounded-2xl border border-[#75ADAF]/25 bg-[#0B1E26]/80 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 flex items-center gap-2">
        <Sparkles size={14} className="text-[#75ADAF]" />
        <span className="text-xs font-bold text-white uppercase tracking-wide">Your day plan</span>
      </div>

      {payload.profile_summary && (
        <div className="px-4 py-2 border-b border-white/5 text-[10px] text-white/50 leading-relaxed">
          Found{' '}
          {(payload.profile_summary.tasks_due ?? 0) + (payload.profile_summary.overdue_tasks ?? 0)} tasks,{' '}
          {payload.profile_summary.meetings_today ?? 0} meetings,{' '}
          {payload.profile_summary.active_kpis ?? 0} KPIs,{' '}
          {payload.profile_summary.stale_leads ?? 0} stale leads.
          Edit or remove items before accepting.
        </div>
      )}

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

      <div className="max-h-[320px] overflow-y-auto px-3 pb-2 flex flex-col gap-2">
        {groupedItems.standalone.map(renderItem)}

        {[...groupedItems.kpiGroups.entries()].map(([kpiId, items]) => {
          const expanded = expandedKpiGroups[kpiId] ?? true;
          const kpiName = items[0]?.title.split(' — ')[0]?.replace(/^KPI:\s*/, '') ?? 'KPI';

          return (
            <div key={`kpi-group-${kpiId}`} className="rounded-xl border border-[#75ADAF]/15 overflow-hidden">
              <button
                type="button"
                onClick={() =>
                  setExpandedKpiGroups((prev) => ({ ...prev, [kpiId]: !expanded }))
                }
                className="w-full px-3 py-2 flex items-center justify-between bg-[#75ADAF]/10 text-left"
              >
                <span className="text-[11px] font-semibold text-white">
                  KPI: {kpiName} ({items.length} task{items.length === 1 ? '' : 's'} today)
                </span>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
              {expanded && (
                <div className="p-2 flex flex-col gap-2">{items.map(renderItem)}</div>
              )}
            </div>
          );
        })}
      </div>

      {!dismissed && !accepted && (
        <div className="px-4 py-3 border-t border-white/5 flex gap-2">
          <button
            type="button"
            onClick={onAccept}
            disabled={isAccepting || selectedCreatableCount === 0}
            className="flex-1 h-10 rounded-full bg-[#FD6046] hover:bg-[#E0533C] text-white text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95 transition-all"
          >
            {isAccepting ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <>
                <ListChecks size={14} />
                Accept plan
                {selectedCreatableCount > 0 ? ` (${selectedCreatableCount})` : ''}
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

      {editingItem && editingDraft && editingItemKey && (
        <div className="fixed inset-0 z-[220] flex items-end sm:items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setEditingItemKey(null)}
          />
          <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-[#0B1E26] p-5 shadow-2xl z-10">
            <h4 className="text-sm font-bold text-white mb-4">Edit plan item</h4>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-[10px] text-white/60">
                Title
                <input
                  type="text"
                  value={editingDraft.title}
                  onChange={(event) =>
                    updateEdit(editingItemKey, {
                      draft: { ...editingDraft, title: event.target.value },
                    })
                  }
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-[10px] text-white/60">
                Due
                <input
                  type="datetime-local"
                  value={formatDueForInput(editingDraft.due_date)}
                  onChange={(event) =>
                    updateEdit(editingItemKey, {
                      draft: {
                        ...editingDraft,
                        due_date: event.target.value
                          ? new Date(event.target.value).toISOString()
                          : null,
                      },
                    })
                  }
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                />
              </label>
              <label className="flex flex-col gap-1 text-[10px] text-white/60">
                Priority
                <select
                  value={editingDraft.priority ?? 'medium'}
                  onChange={(event) =>
                    updateEdit(editingItemKey, {
                      draft: { ...editingDraft, priority: event.target.value },
                    })
                  }
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[10px] text-white/60">
                Notes
                <textarea
                  value={editingDraft.description ?? ''}
                  onChange={(event) =>
                    updateEdit(editingItemKey, {
                      draft: { ...editingDraft, description: event.target.value },
                    })
                  }
                  rows={3}
                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white resize-none"
                />
              </label>
            </div>
            <button
              type="button"
              onClick={() => setEditingItemKey(null)}
              className="mt-4 w-full h-10 rounded-full bg-[#75ADAF] text-[#091519] text-xs font-bold"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
