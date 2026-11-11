"use client";

import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Calendar, Check, CheckCircle, FileText, GripVertical, Pencil, Plus, Trash2, User, X } from "lucide-react";
import { formatChecklistDate, isOverdue, toLocalChecklistDate, type ProjectChecklist, type ProjectSubtask } from "@/lib/tasks/project-checklist";

type Assignee = { id: string; name: string };

export function SubtaskEditor({ dueAt, assignee, agents, onSave, initial, onCancel }: {
  dueAt: string | null;
  assignee: Assignee;
  agents: Assignee[];
  onSave: (item: ProjectSubtask) => void;
  initial?: ProjectSubtask;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [assignedId, setAssignedId] = useState(initial?.assigneeId ?? "");
  const [date, setDate] = useState(() => toLocalChecklistDate(initial?.dueAt));
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(Boolean(initial));
  const selectedId = assignedId || assignee.id;
  const options = [...new Map([assignee, ...(initial ? [{ id: initial.assigneeId, name: initial.assigneeName }] : []), ...agents].map((agent) => [agent.id, agent])).values()].filter((agent) => agent.id);

  function openSubtaskModal() {
    if (!title.trim()) {
      setError("Enter a subtask title.");
      return;
    }
    setError("");
    if (!assignedId && assignee.id) {
      setAssignedId(assignee.id);
    }
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setError("");
    if (initial && onCancel) {
      onCancel();
    }
  }

  function confirmSave() {
    if (!title.trim()) return setError("Enter a subtask title.");
    if (!selectedId) return setError("Choose an assignee for the subtask.");
    const subtaskDue = date ? new Date(date).toISOString() : null;
    if (subtaskDue && dueAt && Date.parse(subtaskDue) > Date.parse(dueAt)) {
      return setError("Subtask due date must be on or before the task due date.");
    }
    onSave({
      id: initial?.id ?? crypto.randomUUID(),
      title: title.trim(),
      assigneeId: selectedId,
      assigneeName: options.find((agent) => agent.id === selectedId)?.name ?? assignee.name,
      dueAt: subtaskDue,
      isCompleted: initial?.isCompleted ?? false,
      completedAt: initial?.completedAt ?? null,
    });
    setTitle("");
    setDate("");
    setAssignedId("");
    setError("");
    setIsModalOpen(false);
  }

  return (
    <div className="space-y-2">
      {!initial && (
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
              <FileText size={13} />
            </div>
            <input
              type="text"
              className="w-full bg-gray-50 rounded-xl py-2.5 pl-9 pr-4 text-sm text-[#0B1215] outline-none border border-gray-200 focus:border-[#094B5C] transition-colors placeholder:text-gray-300"
              aria-label="Subtask"
              placeholder="Input your task title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (error) setError("");
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  openSubtaskModal();
                }
              }}
            />
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#094B5C] px-4 py-2.5 text-xs font-semibold text-white hover:opacity-90 transition-opacity shrink-0 cursor-pointer"
            onClick={openSubtaskModal}
          >
            <Plus size={14} strokeWidth={2.5} aria-hidden="true" />
            <span>Multiple Tasks</span>
          </button>
        </div>
      )}

      {!isModalOpen && error && (
        <p role="alert" className="text-xs text-red-500">
          {error}
        </p>
      )}

      {isModalOpen && (
        <div
          className="fixed inset-0 z-[110]"
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              closeModal();
            }
          }}
        >
          <div
            className="absolute inset-0 bg-black/25 backdrop-blur-[1px]"
            onClick={closeModal}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="subtask-modal-heading"
            className="absolute right-12 bottom-3.25 bg-white rounded-[28px] w-full max-w-100 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] overflow-hidden flex flex-col max-h-[calc(100vh-120px)] animate-in fade-in slide-in-from-right-4 duration-200"
          >
            <div className="bg-transparent h-18 relative overflow-hidden flex items-center px-7 shrink-0">
              <div className="absolute top-0 right-0 w-[50%] h-full pointer-events-none">
                <svg
                  viewBox="0 0 200 72"
                  fill="none"
                  className="w-full h-full"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                >
                  <path
                    d="M0 0 C60 24, 20 48, 190 72 L200 92 L200 0 Z"
                    fill="#09232D"
                  />
                </svg>
              </div>
              <h2
                id="subtask-modal-heading"
                className="text-[18px] font-bold text-dash-dark relative z-10 leading-tight"
              >
                {initial ? "Edit" : "Assign"}
                <br />
                Subtask
              </h2>
              <button
                type="button"
                aria-label="Close subtask modal"
                onClick={closeModal}
                className="absolute right-5 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors z-10 cursor-pointer"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1 min-h-0">
              <div className="rounded-2xl bg-[#F4F7F9] border border-gray-100 px-4 py-3">
                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 block mb-0.5">
                  Subtask Title
                </span>
                {initial ? (
                  <input
                    type="text"
                    aria-label="Subtask title"
                    value={title}
                    onChange={(event) => {
                      setTitle(event.target.value);
                      if (error) setError("");
                    }}
                    className="w-full bg-transparent text-sm font-semibold text-[#0B1215] outline-none"
                  />
                ) : (
                  <p className="text-sm font-semibold text-[#0B1215] break-words">
                    {title}
                  </p>
                )}
              </div>

              <div>
                <label
                  htmlFor="subtask-assign-to"
                  className="text-[11px] font-bold text-[#0B1215] uppercase tracking-wide block mb-1.5"
                >
                  Assign To<span className="text-red-400 ml-0.5">*</span>
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <User size={13} />
                  </div>
                  <select
                    id="subtask-assign-to"
                    aria-label="Assign to"
                    value={selectedId}
                    onChange={(event) => {
                      setAssignedId(event.target.value);
                      if (error) setError("");
                    }}
                    className="w-full bg-gray-50 rounded-xl py-2.5 pl-9 pr-4 text-sm text-[#0B1215] outline-none border border-gray-200 focus:border-[#094B5C] transition-colors cursor-pointer"
                  >
                    <option value="" disabled>
                      Select assignee
                    </option>
                    {options.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label
                  htmlFor="subtask-due-datetime"
                  className="text-[11px] font-bold text-[#0B1215] uppercase tracking-wide block mb-1.5"
                >
                  Due Date &amp; Time
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                    <Calendar size={13} />
                  </div>
                  <input
                    id="subtask-due-datetime"
                    aria-label="Subtask due date and time"
                    type="datetime-local"
                    value={date}
                    onChange={(event) => {
                      setDate(event.target.value);
                      if (error) setError("");
                    }}
                    className="w-full bg-gray-50 rounded-xl py-2.5 pl-9 pr-4 text-sm text-[#0B1215] outline-none border border-gray-200 focus:border-[#094B5C] transition-colors"
                  />
                </div>
              </div>

              {error && (
                <p role="alert" className="text-xs text-red-500 font-medium">
                  {error}
                </p>
              )}
            </div>

            <div className="px-7 py-5 shrink-0 flex items-center gap-3">
              <button
                type="button"
                onClick={confirmSave}
                className="w-fit px-9.25 py-[8.5px] bg-[#0B1215] text-white rounded-[10px] text-[14px] font-semibold hover:opacity-90 transition-colors cursor-pointer flex items-center gap-2"
              >
                <CheckCircle size={15} />
                {initial ? "Save Subtask" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SortableSubtaskItem({
  item,
  index,
  total,
  canToggle,
  canReorder,
  locked,
  onToggle,
  onEdit,
  onRemove,
  onMoveByKeyboard,
}: {
  item: ProjectSubtask;
  index: number;
  total: number;
  canToggle: boolean;
  canReorder: boolean;
  locked: boolean;
  onToggle?: (id: string) => void;
  onEdit?: (item: ProjectSubtask) => void;
  onRemove?: (id: string) => void;
  onMoveByKeyboard?: (fromIndex: number, toIndex: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !canReorder });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const overdue = !locked && !item.isCompleted && isOverdue(item.dueAt);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={`group/subtask flex items-start gap-2.5 px-3 py-2.5 text-xs text-dash-dark transition-colors ${
        isDragging
          ? "relative z-20 rounded-xl bg-[#E2ECF1] shadow-md ring-1 ring-[#094B5C]/20"
          : "bg-[#F4F7F9] hover:bg-[#E2ECF1]"
      }`}
    >
      {onToggle ? (
        <label
          className={`relative mt-0.5 inline-flex shrink-0 items-center justify-center ${
            canToggle ? "cursor-pointer" : "cursor-not-allowed opacity-60"
          }`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
        >
          <input
            type="checkbox"
            className="peer sr-only"
            checked={item.isCompleted}
            aria-label={item.title}
            disabled={!canToggle}
            onChange={() => onToggle(item.id)}
          />
          <span
            aria-hidden="true"
            className={`flex h-4.5 w-4.5 items-center justify-center rounded-[6px] border-[1.5px] transition-all duration-150 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#094B5C] ${
              item.isCompleted
                ? "border-[#3AB37E] bg-[#3AB37E] text-white"
                : "border-gray-300 bg-white group-hover/subtask:border-[#094B5C]"
            }`}
          >
            {item.isCompleted && <Check size={11} strokeWidth={3} />}
          </span>
        </label>
      ) : (
        <span
          aria-hidden="true"
          className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-[6px] border-[1.5px] border-gray-300 bg-white"
        />
      )}

      <div className="min-w-0 flex-1">
        <span
          className={`block text-[12.5px] font-medium leading-snug break-words transition-colors ${
            item.isCompleted ? "line-through text-gray-400" : "text-[#0B1215]"
          }`}
        >
          {item.title}
        </span>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-gray-400">
          <span className="inline-flex items-center gap-1 font-medium text-gray-500" title={item.assigneeName}>
            <span
              aria-hidden="true"
              className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#094B5C]/10 text-[8.5px] font-bold text-[#094B5C]"
            >
              {item.assigneeName
                .split(/\s+/)
                .slice(0, 2)
                .map((word) => word[0])
                .join("")
                .toUpperCase()}
            </span>
            <span className="max-w-[125px] truncate">{item.assigneeName}</span>
          </span>
          {item.dueAt && (
            <>
              <span aria-hidden="true" className="text-gray-300">
                ·
              </span>
              <time
                dateTime={item.dueAt}
                className={
                  overdue
                    ? "rounded bg-red-50 px-1.5 py-0.5 font-semibold text-red-600"
                    : "text-gray-400"
                }
              >
                {formatChecklistDate(item.dueAt)}
              </time>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {onEdit && (
          <button
            type="button"
            aria-label={`Edit ${item.title}`}
            className="flex h-6.5 w-6.5 items-center justify-center rounded-full border border-gray-200 bg-white text-[#094B5C] transition-colors hover:bg-[#094B5C]/10 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#094B5C]"
            onClick={() => onEdit(item)}
          >
            <Pencil size={12} aria-hidden="true" />
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            aria-label={`Remove ${item.title}`}
            className="flex h-6.5 w-6.5 items-center justify-center rounded-full border border-gray-200 bg-white text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
            onClick={() => onRemove(item.id)}
          >
            <Trash2 size={12} aria-hidden="true" />
          </button>
        )}
        {canReorder && (
          <button
            type="button"
            aria-label={`Reorder ${item.title}`}
            {...attributes}
            {...listeners}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "ArrowUp" && index > 0) {
                event.preventDefault();
                event.stopPropagation();
                onMoveByKeyboard?.(index, index - 1);
                return;
              }
              if (event.key === "ArrowDown" && index < total - 1) {
                event.preventDefault();
                event.stopPropagation();
                onMoveByKeyboard?.(index, index + 1);
                return;
              }
              listeners?.onKeyDown?.(event);
            }}
            className="mt-0.5 cursor-grab rounded-md p-1 text-gray-400 transition-colors hover:bg-white/80 hover:text-[#094B5C] active:cursor-grabbing focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#094B5C]"
          >
            <GripVertical size={14} aria-hidden="true" />
          </button>
        )}
      </div>
    </li>
  );
}

export function ChecklistRows({ subtasks, userId, creatorId, locked, onToggle, onEdit, onRemove, onReorder }: {
  subtasks: ProjectSubtask[];
  userId: string;
  creatorId: string;
  locked: boolean;
  onToggle?: (id: string) => void;
  onEdit?: (item: ProjectSubtask) => void;
  onRemove?: (id: string) => void;
  onReorder?: (subtasks: ProjectSubtask[]) => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const canReorder =
    !locked &&
    Boolean(onReorder) &&
    subtasks.length > 1 &&
    (!userId || !creatorId || userId === creatorId);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;
    const oldIndex = subtasks.findIndex((item) => item.id === String(active.id));
    const newIndex = subtasks.findIndex((item) => item.id === String(over.id));
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    onReorder(arrayMove(subtasks, oldIndex, newIndex));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={subtasks.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
      >
        <ul role="list" className="divide-y divide-gray-200/80">
          {subtasks.map((item, index) => {
            const canToggle =
              !locked &&
              Boolean(userId) &&
              (!creatorId || userId === creatorId || userId === item.assigneeId);

            return (
              <SortableSubtaskItem
                key={item.id}
                item={item}
                index={index}
                total={subtasks.length}
                canToggle={canToggle}
                canReorder={canReorder}
                locked={locked}
                onToggle={onToggle}
                onEdit={onEdit}
                onRemove={onRemove}
                onMoveByKeyboard={(fromIndex, toIndex) =>
                  onReorder?.(arrayMove(subtasks, fromIndex, toIndex))
                }
              />
            );
          })}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

export function ProjectChecklistSection({ checklist, userId, locked, agents, onToggle, onSave }: {
  checklist: ProjectChecklist;
  userId: string;
  locked: boolean;
  agents: Assignee[];
  onToggle: (id: string) => void;
  onSave: (items: ProjectSubtask[]) => void;
}) {
  const [editing, setEditing] = useState<ProjectSubtask | null>(null);
  const canManage = !locked && !!userId && (!checklist.creatorId || userId === checklist.creatorId);
  const { subtasks } = checklist;
  if (!subtasks.length && !canManage) return null;

  return (
    <section className="space-y-3">
      <h3 className="text-[15px] font-bold text-dash-dark">Subtasks ({subtasks.filter((item) => item.isCompleted).length}/{subtasks.length})</h3>
      {canManage && (
        <SubtaskEditor
          dueAt={checklist.dueAt}
          assignee={{
            id: checklist.assigneeId || userId,
            name: checklist.assigneeId ? checklist.assigneeName : "Task creator",
          }}
          agents={agents}
          onSave={(item) => onSave([...subtasks, item])}
        />
      )}
      {subtasks.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-[#F4F7F9]">
          <ChecklistRows
            subtasks={subtasks}
            userId={userId}
            creatorId={checklist.creatorId}
            locked={locked}
            onToggle={onToggle}
            onEdit={canManage ? setEditing : undefined}
            onReorder={canManage ? onSave : undefined}
            onRemove={
              canManage
                ? (id) => {
                    onSave(subtasks.filter((item) => item.id !== id));
                    if (editing?.id === id) setEditing(null);
                  }
                : undefined
            }
          />
        </div>
      )}
      {canManage && editing && (
        <SubtaskEditor
          key={editing.id}
          initial={editing}
          dueAt={checklist.dueAt}
          assignee={{
            id: checklist.assigneeId || userId,
            name: checklist.assigneeId ? checklist.assigneeName : "Task creator",
          }}
          agents={agents}
          onCancel={() => setEditing(null)}
          onSave={(item) => {
            onSave(subtasks.map((current) => (current.id === item.id ? item : current)));
            setEditing(null);
          }}
        />
      )}
    </section>
  );
}
