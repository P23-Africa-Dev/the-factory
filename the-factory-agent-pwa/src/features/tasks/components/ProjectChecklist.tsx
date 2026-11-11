'use client';

import { useState } from 'react';
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

export function ChecklistDraftFields({ steps, onChange, dueDate, defaultAssignee, agents = [] }: {
  steps: ChecklistStep[];
  onChange: (steps: ChecklistStep[]) => void;
  dueDate: string;
  defaultAssignee: { id: string; name: string };
  agents?: { id: number; name: string }[];
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [assigned, setAssigned] = useState('');
  const [error, setError] = useState('');
  const options = [...new Map([defaultAssignee, ...agents.map((agent) => ({ id: String(agent.id), name: agent.name }))].map((agent) => [agent.id, agent.name])).entries()];
  const assigneeId = assigned || defaultAssignee.id;
  function add() {
    if (!title.trim() || !assigneeId) return setError('Enter a subtask and select an assignee.');
    if (date && dueDate && Date.parse(date) > Date.parse(dueDate)) return setError('Subtask due date cannot be later than the task due date.');
    onChange([...steps, { id: crypto.randomUUID(), title: title.trim(), assigneeId, assigneeName: options.find(([id]) => id === assigneeId)?.[1] ?? defaultAssignee.name, dueAt: date ? new Date(date).toISOString() : null, done: false }]);
    setTitle(''); setDate(''); setAssigned(''); setError('');
  }
  return (
    <section className="space-y-2 rounded-xl border border-white/10 p-3 text-xs text-white">
      <h3 className="font-semibold">Subtasks</h3>
      <input aria-label="Subtask" placeholder="Subtask" className="w-full rounded bg-white/10 p-2" value={title} onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); add(); } }} />
      <label className="block">Subtask assignee
        <select className="ml-2 rounded bg-[#0B3343] p-2" value={assigneeId} onChange={(event) => setAssigned(event.target.value)}>
          {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
      </label>
      <label className="block">Subtask due date and time
        <input type="datetime-local" className="mt-1 block w-full rounded bg-white/10 p-2" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>
      <button type="button" className="rounded bg-[#75ADAF] px-3 py-2 font-semibold text-[#0A1D25]" onClick={add}>Add Subtask</button>
      {error && <p role="alert" className="text-[#ff8774]">{error}</p>}
      {steps.length > 0 && <ul className="space-y-2">
        {steps.map((step) => <li key={step.id} className="flex justify-between gap-2">
          <span>{step.title} · {step.assigneeName}{step.dueAt && ` · ${new Date(step.dueAt).toLocaleString()}`}</span>
          <button type="button" aria-label={`Remove ${step.title}`} onClick={() => onChange(steps.filter((item) => item.id !== step.id))}>×</button>
        </li>)}
      </ul>}
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
  const [date, setDate] = useState('');
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

  function saveStep() {
    if (!title.trim()) return setError('Enter a subtask title.');
    const due = date ? new Date(date).toISOString() : null;
    if (due && dueAt && Date.parse(due) > Date.parse(dueAt)) return setError('Subtask due date cannot be later than the task due date.');
    const id = assignee || defaultAssignee;
    const existing = steps.find((step) => step.id === editing);
    setError('');
    void run(async () => {
      if (existing) {
        return taskApi.updateSubtask(task.id, existing.id, {
          title: title.trim(),
          assigned_user_id: id || null,
          due_at: due,
        });
      }
      return taskApi.createSubtask(task.id, {
        title: title.trim(),
        assigned_user_id: id || undefined,
        due_at: due,
      });
    }).then(() => {
      setTitle(''); setDate(''); setAssignee(''); setEditing(undefined);
    });
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
          {compact && canEdit && index === 0 && <div className="flex gap-2">
            <input aria-label="Subtask" placeholder="Subtask" className="min-w-0 flex-1 rounded bg-black/30 p-2"
              value={title} onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveStep(); } }} />
            <button type="button" disabled={!title.trim() || busy} className="rounded bg-[#75ADAF] px-2 font-semibold text-[#0A1D25] disabled:opacity-50"
              onClick={saveStep}>Add Subtask</button>
          </div>}
          {!compact && canEdit && <>
            <button type="button" disabled={busy} onClick={() => {
              const due = step.dueAt ? new Date(step.dueAt) : null;
              setDate(due ? new Date(due.getTime() - due.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
              setEditing(step.id); setTitle(step.title); setAssignee(step.assigneeId);
            }}>Edit</button>
            <button type="button" aria-label={`Move ${step.title} up`} disabled={busy || !index} className="disabled:opacity-30" onClick={() => {
              const next = [...steps];
              [next[index - 1], next[index]] = [next[index], next[index - 1]];
              void run(() => taskApi.reorderSubtasks(task.id, next.map((item) => item.id)));
            }}>↑</button>
            <button type="button" aria-label={`Remove ${step.title}`} disabled={busy} onClick={() => {
              void run(() => taskApi.deleteSubtask(task.id, step.id));
              if (editing === step.id) { setEditing(undefined); setTitle(''); setDate(''); setAssignee(''); }
            }}>×</button>
          </>}
        </div>
      ))}
      {compact && steps.length > 3 && <p className="text-white/60">+{steps.length - 3} more</p>}
      {compact && canEdit && !steps.length && (
        <div className="flex gap-2">
          <input aria-label="Subtask" placeholder="Subtask" className="min-w-0 flex-1 rounded bg-black/30 p-2"
            value={title} onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveStep(); } }} />
          <button type="button" disabled={!title.trim() || busy} className="rounded bg-[#75ADAF] px-2 font-semibold text-[#0A1D25] disabled:opacity-50"
            onClick={saveStep}>Add Subtask</button>
        </div>
      )}
      {!compact && canEdit && <>
        <div className="grid gap-2">
          <input aria-label="Subtask" placeholder="Subtask" className="rounded bg-black/30 p-2" value={title} onChange={(event) => setTitle(event.target.value)}
            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveStep(); } }} />
          <label>Assign to
            <select className="ml-2 rounded bg-[#0B3343] p-2" value={assignee || defaultAssignee} onChange={(event) => setAssignee(event.target.value)}>
              {options.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <label>Subtask due date and time
            <input type="datetime-local" className="mt-1 block w-full rounded bg-black/30 p-2" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <button type="button" disabled={busy} className="rounded bg-[#75ADAF] px-3 py-2 font-semibold text-[#0A1D25]" onClick={saveStep}>{editing ? 'Save subtask' : 'Add Subtask'}</button>
          {error && <p role="alert" className="text-[#ff8774]">{error}</p>}
        </div>
      </>}
      {!compact && assignedToMe && !locked && !steps.length && !canEdit && (
        <p className="text-white/50">No checklist items yet.</p>
      )}
    </section>
  );
}
