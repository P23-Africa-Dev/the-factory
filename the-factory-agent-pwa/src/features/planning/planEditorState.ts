import type { DailyPlanItem, DailyPlanPayload, PlanEditsMap, PlanItemEditState } from './types';

export function planItemKey(item: DailyPlanItem): string {
  return item.item_id ?? `${item.entity_type}-${item.entity_id}-${item.rank}`;
}

export function createInitialPlanEdits(payload: DailyPlanPayload): PlanEditsMap {
  const edits: PlanEditsMap = {};

  for (const item of payload.items) {
    const key = planItemKey(item);
    edits[key] = {
      selected: true,
      removed: false,
    };
  }

  return edits;
}

export function loadPlanEdits(
  storageKey: string,
  payload: DailyPlanPayload,
): PlanEditsMap {
  if (typeof window === 'undefined') {
    return createInitialPlanEdits(payload);
  }

  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) {
      return createInitialPlanEdits(payload);
    }

    const parsed = JSON.parse(raw) as PlanEditsMap;
    const initial = createInitialPlanEdits(payload);

    for (const key of Object.keys(initial)) {
      if (parsed[key]) {
        initial[key] = { ...initial[key], ...parsed[key] };
      }
    }

    return initial;
  } catch {
    return createInitialPlanEdits(payload);
  }
}

export function persistPlanEdits(storageKey: string, edits: PlanEditsMap): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    sessionStorage.setItem(storageKey, JSON.stringify(edits));
  } catch {
    // Ignore storage quota errors.
  }
}

export function resolveItemDraft(
  item: DailyPlanItem,
  edit?: PlanItemEditState,
): DailyPlanItem['task_draft'] {
  if (!edit?.draft) {
    return item.task_draft;
  }

  return {
    ...item.task_draft,
    ...edit.draft,
  };
}

export function countSelectedCreatableItems(
  payload: DailyPlanPayload,
  edits: PlanEditsMap,
): number {
  return payload.items.filter((item) => {
    const key = planItemKey(item);
    const edit = edits[key];
    if (edit?.removed || edit?.selected === false) {
      return false;
    }

    const draft = resolveItemDraft(item, edit);
    return draft.creates_task === true;
  }).length;
}

export function buildAcceptDrafts(
  payload: DailyPlanPayload,
  edits: PlanEditsMap,
): DailyPlanItem['task_draft'][] {
  return payload.items
    .filter((item) => {
      const key = planItemKey(item);
      const edit = edits[key];
      if (edit?.removed || edit?.selected === false) {
        return false;
      }

      const draft = resolveItemDraft(item, edit);
      return draft.creates_task === true;
    })
    .map((item) => resolveItemDraft(item, edits[planItemKey(item)]));
}
