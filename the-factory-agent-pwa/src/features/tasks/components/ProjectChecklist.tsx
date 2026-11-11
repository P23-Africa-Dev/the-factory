'use client';

import { useState } from 'react';
import { create } from 'zustand';
import { toast } from 'sonner';
import { useAuth } from '@/features/auth/hooks/useAuth';

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
};
export type ChecklistStep = { id: string; title: string; assigneeId: string; assigneeName: string; dueAt: string | null; done: boolean };
type Draft = { steps: ChecklistStep[]; dueAt?: string | null; status?: Status; baseStatus?: Status; creatorId?: string };

const useChecklistStore = create<{ drafts: Record<string, Draft> }>(() => ({ drafts: {} }));
const emptySteps: ChecklistStep[] = [];

function keyFor(task: ChecklistTask, userId: string, companyId?: number | string) {
  return JSON.stringify([String(task.companyId ?? companyId ?? ""), userId, task.id]);
}

export function saveCreatedChecklist(task: ChecklistTask, userId: string, companyId: string | number | undefined, steps: ChecklistStep[]) {
  if (!steps.length || !userId) return;
  const key = keyFor(task, userId, companyId);
  useChecklistStore.setState((state) => ({
    drafts: { ...state.drafts, [key]: { steps, creatorId: userId } },
  }));
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
  const { user } = useAuth();
  const drafts = useChecklistStore((state) => state.drafts);
  const items: Array<T & Pick<ChecklistTask, "checklistBaseStatus">> = tasks.map((task) => {
    const draft = drafts[keyFor(task, String(user?.id ?? ''), user?.company_id)];
    return draft?.status && draft.baseStatus === task.status && task.status !== 'cancelled' ? { ...task, status: draft.status, checklistBaseStatus: task.status } : task;
  });
  return {
    items,
    visible: filter && filter !== 'all' ? items.filter((task) => task.status === filter) : items,
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

export function ProjectChecklist({ task, compact = false, agents = [] }: {
  task: ChecklistTask;
  compact?: boolean;
  agents?: { id: number; name: string }[];
}) {
  const { user } = useAuth();
  const userId = String(user?.id ?? '');
  const key = keyFor(task, userId, user?.company_id);
  const draft = useChecklistStore((state) => state.drafts[key]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [assignee, setAssignee] = useState('');
  const [editing, setEditing] = useState<string>();
  const [error, setError] = useState('');
  const steps = draft?.steps ?? emptySteps;
  const dueAt = draft?.dueAt === undefined ? task.dueDate : draft.dueAt;
  const locked = task.status === 'cancelled';
  const canEdit = Boolean(userId && (task.creatorId ?? draft?.creatorId) === userId && !locked);
  const assignedToMe = Boolean(userId && String(task.assignedAgentId) === userId);
  const completed = steps.filter((step) => step.done).length;
  const defaultAssignee = String(task.assignedAgentId ?? userId);
  const defaultName = task.assigneeName ?? (defaultAssignee === userId ? user?.name ?? 'You' : 'Task assignee');
  const options = [...new Map([{ id: defaultAssignee, name: defaultName }, ...agents.map((agent) => ({ ...agent, id: String(agent.id) }))].map((agent) => [agent.id, agent.name])).entries()];

  function write(nextSteps: ChecklistStep[], nextDue = dueAt, toggle = false) {
    const status = task.status;
    const baseStatus = task.checklistBaseStatus ?? status;
    let nextStatus = draft?.baseStatus === baseStatus ? draft?.status : undefined;
    if (nextSteps.length && nextSteps.every((step) => step.done)) nextStatus = 'completed';
    else if (status === 'completed' && nextSteps.length) nextStatus = 'in_progress';
    else if (toggle && status === 'pending' && nextSteps.some((step) => step.done)) nextStatus = 'in_progress';
    useChecklistStore.setState((state) => ({ drafts: { ...state.drafts, [key]: { steps: nextSteps, dueAt: nextDue, status: nextStatus, baseStatus, creatorId: draft?.creatorId } } }));
    if (nextStatus && nextStatus !== status) toast.success(nextStatus === 'completed' ? 'All subtasks done. Task moved to Completed.' : 'Task moved to In Progress.');
  }

  function saveStep() {
    if (!title.trim()) return setError('Enter a subtask title.');
    const due = date ? new Date(date).toISOString() : null;
    if (due && dueAt && Date.parse(due) > Date.parse(dueAt)) return setError('Subtask due date cannot be later than the task due date.');
    const id = assignee || defaultAssignee;
    const existing = steps.find((step) => step.id === editing);
    const item = { id: existing?.id ?? crypto.randomUUID(), title: title.trim(), dueAt: due, assigneeId: id, assigneeName: options.find(([value]) => value === id)?.[1] ?? defaultName, done: existing?.done ?? false };
    write(editing ? steps.map((step) => step.id === editing ? item : step) : [...steps, item]);
    setTitle(''); setDate(''); setAssignee(''); setEditing(undefined); setError('');
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
            disabled={locked || (!canEdit && (!userId || step.assigneeId !== userId))}
            onChange={() => write(steps.map((item) => item.id === step.id ? { ...item, done: !item.done } : item), dueAt, true)} />
          <div className="min-w-0 flex-1">
            <p className={step.done ? 'line-through text-white/55' : 'break-words'}>{step.title}</p>
            <p className="text-white/60">{step.assigneeName}
              {step.dueAt && <time dateTime={step.dueAt} className={!locked && !step.done && overdue(step.dueAt) ? 'ml-2 text-[#ff8774]' : 'ml-2'}>{new Date(step.dueAt).toLocaleString()}</time>}
            </p>
          </div>
          {compact && canEdit && <div className="flex gap-2">
        <input aria-label="Subtask" placeholder="Subtask" className="min-w-0 flex-1 rounded bg-black/30 p-2"
          value={title} onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveStep(); } }} />
        <button type="button" disabled={!title.trim()} className="rounded bg-[#75ADAF] px-2 font-semibold text-[#0A1D25] disabled:opacity-50"
          onClick={saveStep}>Add Subtask</button>
      </div>}
      {!compact && canEdit && <>
            <button type="button" onClick={() => {
              const due = step.dueAt ? new Date(step.dueAt) : null;
              setDate(due ? new Date(due.getTime() - due.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');
              setEditing(step.id); setTitle(step.title); setAssignee(step.assigneeId);
            }}>Edit</button>
            <button type="button" aria-label={`Move ${step.title} up`} disabled={!index} className="disabled:opacity-30" onClick={() => {
              const next = [...steps]; [next[index - 1], next[index]] = [next[index], next[index - 1]]; write(next);
            }}>↑</button>
            <button type="button" aria-label={`Remove ${step.title}`} onClick={() => {
              write(steps.filter((item) => item.id !== step.id));
              if (editing === step.id) { setEditing(undefined); setTitle(''); setDate(''); setAssignee(''); }
            }}>×</button>
          </>}
        </div>
      ))}
      {compact && steps.length > 3 && <p className="text-white/60">+{steps.length - 3} more</p>}
      {!compact && canEdit && <>
        <label className="block text-white/75">Task due date and time
          <input type="datetime-local" className="mt-1 block w-full rounded bg-black/30 p-2"
            value={dueAt ? (() => { const due = new Date(dueAt); return new Date(due.getTime() - due.getTimezoneOffset() * 60_000).toISOString().slice(0, 16); })() : ''}
            onChange={(event) => {
              const due = event.target.value ? new Date(event.target.value).toISOString() : null;
              if (due && steps.some((step) => step.dueAt && Date.parse(step.dueAt) > Date.parse(due))) return setError('The task deadline cannot be earlier than a subtask deadline.');
              write(steps, due); setError('');
            }} />
        </label>
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
          <button type="button" className="rounded bg-[#75ADAF] px-3 py-2 font-semibold text-[#0A1D25]" onClick={saveStep}>{editing ? 'Save subtask' : 'Add Subtask'}</button>
          {error && <p role="alert" className="text-[#ff8774]">{error}</p>}
        </div>
      </>}
      {!compact && assignedToMe && !locked && !steps.length && (
        <button type="button" className="text-[#9ed3d4] underline" onClick={() => write(
          ['Review task instructions', 'Complete the assigned work', 'Confirm the outcome'].map((label) => ({
            id: crypto.randomUUID(), title: label, dueAt, assigneeId: userId, assigneeName: user?.name ?? 'You', done: false,
          })),
        )}>Load demo checklist</button>
      )}
      {!compact && <p className="text-white/50">Checklist changes are local to this session.</p>}
    </section>
  );
}
