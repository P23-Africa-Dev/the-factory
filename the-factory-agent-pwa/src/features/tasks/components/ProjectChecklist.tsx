'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { taskApi } from '@/features/tasks/api';
import { taskKeys } from '@/features/tasks/queryKeys';

type Status = 'pending' | 'in_progress' | 'paused' | 'resumed' | 'completed' | 'cancelled';
export type ChecklistTask = {
  id: string;
  companyId: number | null;
  status: Status;
  checklistBaseStatus?: Status;
  creatorId?: string;
  assignedAgentId: number | null;
  dueDate: string | null;
  commentCount?: number;
  assigneeName?: string | null;
  checklistSteps?: ChecklistStep[];
};
export type ChecklistStep = {
  id: string;
  title: string;
  assigneeId: string;
  assigneeName: string;
  dueAt: string | null;
  done: boolean;
};

const emptySteps: ChecklistStep[] = [];

/** Kept for create-form callers that previously staged local drafts. Subtasks now go in the create payload. */
export function saveCreatedChecklist(
  _task: ChecklistTask,
  _userId: string,
  _companyId: string | number | undefined,
  _steps: ChecklistStep[],
) {
  return;
}

/**
 * Subtasks on the create form: typing a title and pressing "Multiple Tasks" adds it straight
 * to the list for the task's primary assignee. The edit sheet changes only title and assignee.
 */
export function ChecklistDraftFields({ steps, onChange, defaultAssignee, agents = [] }: {
  steps: ChecklistStep[];
  onChange: (steps: ChecklistStep[]) => void;
  defaultAssignee: { id: string; name: string };
  agents?: { id: number; name: string }[];
}) {
  const [title, setTitle] = useState('');
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ChecklistStep | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editAssignee, setEditAssignee] = useState('');
  const [editError, setEditError] = useState('');
  const options = [...new Map([
    defaultAssignee,
    ...(editing ? [{ id: editing.assigneeId, name: editing.assigneeName }] : []),
    ...agents.map((agent) => ({ id: String(agent.id), name: agent.name })),
  ].filter((agent) => agent.id).map((agent) => [agent.id, agent.name])).entries()];

  function add() {
    if (!title.trim()) return setError('Enter a subtask title.');
    if (!defaultAssignee.id) return setError('Choose who the task is assigned to first.');
    onChange([...steps, { id: crypto.randomUUID(), title: title.trim(), assigneeId: defaultAssignee.id, assigneeName: defaultAssignee.name, dueAt: null, done: false }]);
    setTitle(''); setError('');
  }

  function openEdit(step: ChecklistStep) {
    setEditing(step); setEditTitle(step.title); setEditAssignee(step.assigneeId); setEditError('');
  }

  function saveEdit() {
    if (!editing) return;
    if (!editTitle.trim()) return setEditError('Enter a subtask title.');
    if (!editAssignee) return setEditError('Choose an assignee for the subtask.');
    const assigneeName = options.find(([id]) => id === editAssignee)?.[1] ?? editing.assigneeName;
    onChange(steps.map((step) => step.id === editing.id ? { ...step, title: editTitle.trim(), assigneeId: editAssignee, assigneeName } : step));
    setEditing(null);
  }

  return (
    <section className="space-y-2 text-white">
      <label htmlFor="create-subtask-title" className="text-[10px] text-white/50 tracking-wider font-bold uppercase font-sans block">
        Subtasks
      </label>
      <div className="flex gap-2">
        <input id="create-subtask-title" aria-label="Subtask" placeholder="Input your task title"
          className="min-w-0 flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/35 outline-none focus:border-[#75ADAF]/60 transition-colors"
          value={title}
          onChange={(event) => { setTitle(event.target.value); if (error) setError(''); }}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} />
        <button type="button" onClick={add}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#75ADAF] px-3.5 py-2.5 text-xs font-semibold text-[#0A1D25] hover:opacity-90 transition-opacity cursor-pointer">
          <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
          Multiple Tasks
        </button>
      </div>
      {error && <p role="alert" className="text-xs text-[#ff8774]">{error}</p>}
      {steps.length > 0 && (
        <ul className="divide-y divide-white/5 overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
          {steps.map((step) => (
            <li key={step.id} className="flex items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium break-words">{step.title}</p>
                <p className="text-[11px] text-white/55 truncate">{step.assigneeName}</p>
              </div>
              <button type="button" aria-label={`Edit ${step.title}`} onClick={() => openEdit(step)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-[#75ADAF] hover:bg-white/10 transition-colors cursor-pointer">
                <Pencil size={12} aria-hidden="true" />
              </button>
              <button type="button" aria-label={`Remove ${step.title}`}
                onClick={() => { onChange(steps.filter((item) => item.id !== step.id)); if (editing?.id === step.id) setEditing(null); }}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-[#ff8774] hover:bg-white/10 transition-colors cursor-pointer">
                <Trash2 size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="fixed inset-0 z-[10010] flex items-end sm:items-center justify-center"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setEditing(null); } }}>
          <div className="absolute inset-0 bg-black/60" onClick={() => setEditing(null)} />
          <div role="dialog" aria-modal="true" aria-labelledby="edit-subtask-heading"
            className="relative w-full max-w-md rounded-t-3xl sm:rounded-3xl border-t border-white/10 bg-[#0A1D25] px-5 pt-4 pb-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 id="edit-subtask-heading" className="text-lg font-bold text-white">Edit Subtask</h3>
              <button type="button" aria-label="Close subtask editor" onClick={() => setEditing(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/70 hover:bg-white/10 hover:text-white cursor-pointer">
                <X size={16} />
              </button>
            </div>
            <div className="flex flex-col">
              <label htmlFor="edit-subtask-title" className="text-[10px] text-white/50 tracking-wider font-bold mb-1 uppercase font-sans">
                Subtask Title <span className="text-red-400">*</span>
              </label>
              <input id="edit-subtask-title" aria-label="Subtask title" value={editTitle}
                onChange={(event) => { setEditTitle(event.target.value); if (editError) setEditError(''); }}
                className="bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#75ADAF]/60" />
            </div>
            <div className="flex flex-col">
              <label htmlFor="edit-subtask-assignee" className="text-[10px] text-white/50 tracking-wider font-bold mb-1 uppercase font-sans">
                Assign To <span className="text-red-400">*</span>
              </label>
              <select id="edit-subtask-assignee" aria-label="Assign to" value={editAssignee}
                onChange={(event) => { setEditAssignee(event.target.value); if (editError) setEditError(''); }}
                className="bg-[#0B1E26] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none focus:border-[#75ADAF]/60">
                {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
            </div>
            {editError && <p role="alert" className="text-xs text-[#ff8774]">{editError}</p>}
            <button type="button" onClick={saveEdit}
              className="w-full h-11 rounded-xl bg-[#75ADAF] text-sm font-bold text-[#0A1D25] hover:opacity-90 cursor-pointer">
              Save Subtask
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function useChecklistTasks<T extends ChecklistTask>(tasks: T[], filter?: Status | 'all') {
  return {
    items: tasks,
    visible: filter && filter !== 'all' ? tasks.filter((task) => task.status === filter) : tasks,
  };
}

export function TaskOverview({ tasks }: { tasks: ChecklistTask[] }) {
  const completed = tasks.filter((task) => task.status === 'completed').length;
  const cards = [
    ['Task performance', `${tasks.length ? Math.round(completed / tasks.length * 100) : 0}%`],
    ['Total tasks', tasks.length],
    ['Pending tasks', tasks.filter((task) => task.status === 'pending').length],
    ['In progress', tasks.filter((task) => ['in_progress', 'paused', 'resumed'].includes(task.status)).length],
  ] as const;
  return (
    <dl aria-label="Loaded task summary" className="grid grid-cols-2 gap-2 px-1 pb-3 sm:grid-cols-4">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-white/10 bg-[#0B3343] px-3 py-2">
          <dt className="text-[11px] text-white/70">{label}</dt>
          <dd className="text-lg font-bold text-white">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function overdue(date: string | null | undefined) {
  return Boolean(date && Date.parse(date) < Date.now());
}

function handleMutationResult(data: { status_changed?: boolean; completion_blocked_reason?: string | null; task?: { status?: Status } }) {
  if (data.completion_blocked_reason) {
    toast.error(data.completion_blocked_reason);
    return;
  }
  if (data.status_changed && data.task?.status === 'completed') {
    toast.success('All subtasks done. Task moved to Completed.');
  } else if (data.status_changed) {
    toast.success('Task moved to In Progress.');
  }
}

export function ProjectChecklist({ task, compact = false, agents = [] }: {
  task: ChecklistTask;
  compact?: boolean;
  agents?: { id: number; name: string }[];
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = String(user?.id ?? '');
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState('');
  const [editing, setEditing] = useState<string>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const steps = task.checklistSteps ?? emptySteps;
  const dueAt = task.dueDate;
  const locked = task.status === 'cancelled';
  const canEdit = Boolean(userId && task.creatorId === userId && !locked);
  const assignedToMe = Boolean(userId && String(task.assignedAgentId) === userId);
  const completed = steps.filter((step) => step.done).length;
  const defaultAssignee = String(task.assignedAgentId ?? userId);
  const defaultName = task.assigneeName ?? (defaultAssignee === userId ? user?.name ?? 'You' : 'Task assignee');
  const options = [...new Map([{ id: defaultAssignee, name: defaultName }, ...agents.map((agent) => ({ ...agent, id: String(agent.id) }))].map((agent) => [agent.id, agent.name])).entries()];

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: taskKeys.lists() }),
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(task.id) }),
    ]);
  }

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    try {
      const data = await action() as {
        status_changed?: boolean;
        completion_blocked_reason?: string | null;
        task?: { status?: Status };
      };
      handleMutationResult(data ?? {});
      await refresh();
    } catch (err) {
      const message = err && typeof err === 'object' && 'message' in err ? String((err as { message?: string }).message) : 'Unable to update subtask.';
      toast.error(message || 'Unable to update subtask.');
    } finally {
      setBusy(false);
    }
  }

  function resetForm() {
    setTitle(''); setAssignee(''); setEditing(undefined); setError('');
  }

  // New subtasks go to the task's assignee; only editing changes title and assignee.
  function saveStep() {
    if (!title.trim()) return setError('Enter a subtask title.');
    const id = assignee || defaultAssignee;
    const existing = steps.find((step) => step.id === editing);
    setError('');
    void run(async () => {
      if (existing) {
        return taskApi.updateSubtask(task.id, existing.id, {
          title: title.trim(),
          assigned_user_id: id || null,
        });
      }
      return taskApi.createSubtask(task.id, {
        title: title.trim(),
        assigned_user_id: defaultAssignee || undefined,
        due_at: null,
      });
    }).then(resetForm);
  }

  if (compact && !steps.length && !dueAt && !task.commentCount && !canEdit) return null;

  return (
    <section className="mt-3 space-y-2 rounded-xl border border-white/10 bg-[#0B2531] p-3 text-xs text-white"
      onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
      {dueAt && <p className={task.status !== 'completed' && !locked && overdue(dueAt) ? 'text-[#ff8774]' : 'text-white/75'}>
        Due <time dateTime={dueAt}>{new Date(dueAt).toLocaleString()}</time>
      </p>}
      {steps.length > 0 && <p className="font-semibold">Checklist {completed}/{steps.length}</p>}
      {Boolean(task.commentCount) && compact && <p className="text-white/70">{task.commentCount} comments</p>}
      {steps.slice(0, compact ? 3 : steps.length).map((step, index) => (
        <div key={step.id} className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 accent-[#75ADAF]" aria-label={step.title} checked={step.done}
            disabled={busy || locked || (!canEdit && (!userId || step.assigneeId !== userId))}
            onChange={() => void run(() => taskApi.completeSubtask(task.id, step.id, !step.done))} />
          <div className="min-w-0 flex-1">
            <p className={step.done ? 'line-through text-white/55' : 'break-words'}>{step.title}</p>
            <p className="text-white/60">{step.assigneeName}
              {step.dueAt && <time dateTime={step.dueAt} className={!locked && !step.done && overdue(step.dueAt) ? 'ml-2 text-[#ff8774]' : 'ml-2'}>{new Date(step.dueAt).toLocaleString()}</time>}
            </p>
          </div>
          {!compact && canEdit && <div className="flex items-center gap-2 shrink-0">
            <button type="button" aria-label={`Edit ${step.title}`} disabled={busy} onClick={() => {
              setEditing(step.id); setTitle(step.title); setAssignee(step.assigneeId); setError('');
            }}>Edit</button>
            <button type="button" aria-label={`Move ${step.title} up`} disabled={busy || !index} className="disabled:opacity-30" onClick={() => {
              const next = [...steps];
              [next[index - 1], next[index]] = [next[index], next[index - 1]];
              void run(() => taskApi.reorderSubtasks(task.id, next.map((item) => item.id)));
            }}>↑</button>
            <button type="button" aria-label={`Remove ${step.title}`} disabled={busy} onClick={() => {
              void run(() => taskApi.deleteSubtask(task.id, step.id));
              if (editing === step.id) resetForm();
            }}>×</button>
          </div>}
        </div>
      ))}
      {compact && steps.length > 3 && <p className="text-white/60">+{steps.length - 3} more</p>}
      {compact && canEdit && (
        <div className="flex flex-col min-[340px]:flex-row gap-2 pt-1">
          <input aria-label="Subtask" placeholder="Subtask" className="min-w-0 flex-1 rounded bg-black/30 p-2"
            value={title} onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveStep(); } }} />
          <button type="button" disabled={!title.trim() || busy} className="shrink-0 rounded bg-[#75ADAF] px-3 py-2 font-semibold text-[#0A1D25] disabled:opacity-50"
            onClick={saveStep}>Add Subtask</button>
        </div>
      )}
      {!compact && canEdit && <>
        <div className="grid gap-2">
          <input aria-label="Subtask" placeholder="Subtask" className="rounded bg-black/30 p-2" value={title} onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveStep(); } }} />
          {editing && <label>Assign to
            <select className="ml-2 rounded bg-[#0B3343] p-2" value={assignee || defaultAssignee} onChange={(event) => setAssignee(event.target.value)}>
              {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>}
          <div className="flex gap-2">
            <button type="button" disabled={busy} className="flex-1 rounded bg-[#75ADAF] px-3 py-2 font-semibold text-[#0A1D25]" onClick={saveStep}>{editing ? 'Save subtask' : 'Add Subtask'}</button>
            {editing && <button type="button" disabled={busy} className="rounded bg-white/10 px-3 py-2 font-semibold" onClick={resetForm}>Cancel</button>}
          </div>
          {error && <p role="alert" className="text-[#ff8774]">{error}</p>}
        </div>
      </>}
      {!compact && assignedToMe && !locked && !steps.length && !canEdit && (
        <p className="text-white/50">No checklist items yet.</p>
      )}
    </section>
  );
}
