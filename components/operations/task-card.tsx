'use client';

import React, { useRef, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { formatDistanceStrict } from 'date-fns';
import { CSS } from '@dnd-kit/utilities';
import type { DndItem } from '@/types/operations';
import { ChecklistRows } from './project-checklist';
import { formatChecklistDate, isOverdue, type ProjectSubtask } from '@/lib/tasks/project-checklist';
import {
  Calendar,
  ChevronRight,
  ChevronUp,
  ListChecks,
  MessageSquare,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

interface TaskCardProps {
  item: DndItem;
  checklistUserId?: string;
  onToggleSubtask?: (taskId: string, subtaskId: string) => void;
  onAddSubtask?: (taskId: string, title: string) => void;
  onReorderSubtasks?: (taskId: string, subtasks: ProjectSubtask[]) => void;
  onClick?: (item: DndItem) => void;
  onViewMap?: (item: DndItem) => void;
  onEdit?: (item: DndItem) => void;
  onDelete?: (item: DndItem) => void;
}

export function TaskCard({
  item,
  onClick,
  onViewMap,
  onEdit,
  onDelete,
  checklistUserId,
  onToggleSubtask,
  onAddSubtask,
  onReorderSubtasks,
}: TaskCardProps) {
  const [isChecklistOpen, setIsChecklistOpen] = useState(true);
  const [isAddingSubtask, setIsAddingSubtask] = useState(false);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const subtaskInputRef = useRef<HTMLInputElement | null>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isFallbackLocation =
    !item.location ||
    item.location.startsWith("Created:") ||
    item.location === "No location set" ||
    item.location === "Location not set";

  let displayLocation = item.location;
  if (isFallbackLocation) {
    if (item.location?.startsWith("Created:")) {
      displayLocation = item.location.replace(/^Created:\s*/i, "");
    } else if (item.createdAt) {
      try {
        const d = new Date(item.createdAt);
        if (!isNaN(d.getTime())) {
          displayLocation = d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          });
        }
      } catch {
        displayLocation = item.location;
      }
    }
  }

  const createdAt = item.createdAt ? Date.parse(item.createdAt) : NaN;
  const now = Date.now();
  let creationAge = item.time;
  if (Number.isFinite(createdAt)) {
    const elapsed = now - createdAt;
    creationAge = elapsed >= 0 && elapsed < 60_000
      ? "Just now"
      : formatDistanceStrict(createdAt, now, { addSuffix: true, roundingMethod: "floor" });
  }

  const checklist = item.projectChecklist;
  const cancelled = item.statusLabel === "Cancelled";
  const completedSubtasks = checklist ? checklist.subtasks.filter((subtask) => subtask.isCompleted).length : 0;
  const totalSubtasks = checklist ? checklist.subtasks.length : 0;
  const progressPct = totalSubtasks > 0 ? Math.round((completedSubtasks / totalSubtasks) * 100) : 0;
  const allSubtasksDone = totalSubtasks > 0 && completedSubtasks === totalSubtasks;
  const canManageSubtasks =
    Boolean(checklist) &&
    !cancelled &&
    Boolean(checklistUserId) &&
    (!checklist?.creatorId || checklistUserId === checklist.creatorId);
  const hasChecklistBody = Boolean(checklist && (totalSubtasks > 0 || (onAddSubtask && canManageSubtasks)));
  const commentCount = item.commentCount ?? checklist?.initialComments?.length ?? 0;
  const dueOverdue = Boolean(checklist?.dueAt && item.statusLabel !== "Completed" && !cancelled && isOverdue(checklist.dueAt));

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`
        group relative bg-white rounded-[32px] p-6 shadow-[0px_4px_20px_rgba(0,0,0,0.03)] border border-gray-100 flex flex-col gap-5
        cursor-pointer transition-all duration-200 select-none mb-3
        ${isDragging ? 'opacity-50 scale-105 z-50 shadow-xl cursor-grabbing' : 'hover:shadow-md hover:-translate-y-0.5'}
      `}
      onClick={() => onClick?.(item)}
    >
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
        {onEdit && !checklist?.isMock ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit(item);
            }}
            className="h-8 w-8 rounded-full bg-white border border-gray-200 text-[#094B5C] hover:bg-gray-50 flex items-center justify-center"
            aria-label="Edit task"
          >
            <Pencil size={14} />
          </button>
        ) : null}
        {onDelete ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item);
            }}
            className="h-8 w-8 rounded-full bg-white border border-gray-200 text-red-500 hover:bg-red-50 flex items-center justify-center"
            aria-label="Delete task"
          >
            <Trash2 size={14} />
          </button>
        ) : null}
      </div>
      <div>
        <h4 className="text-[#0B1215] font-bold text-[17px] tracking-tight">{item.label}</h4>
        <p className="text-gray-400 text-[13px] mt-1">{item.description}</p>
      </div>

      <div className="space-y-2.5">
        <span className="text-[#0B1215] font-bold text-[15px] block">
          {isFallbackLocation ? "Created" : "Location"}
        </span>
        <div className="flex items-start justify-between gap-3">
          <span className={`text-[12px] leading-relaxed flex-1 ${
            isFallbackLocation
              ? "text-gray-400 no-underline"
              : "text-gray-500 underline decoration-gray-300 underline-offset-4"
          }`}>
            {displayLocation}
          </span>
          <div className="flex flex-col items-end gap-2.5 shrink-0">
            {item.hasTrackableLocation ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onViewMap?.(item);
                }}
                className="bg-[#D15FE2] text-white text-[10px] font-semibold px-3 py-1.5 rounded-full hover:bg-[#B14FC2] transition-colors"
              >
                View on Map
              </button>
            ) : null}
            {creationAge && <span className="text-gray-400 text-[11px]">{creationAge}</span>}
          </div>
        </div>
      </div>

      {checklist && (
        <div className="space-y-3 border-t border-gray-100 pt-3.5">
          {hasChecklistBody && (
            <div
              className="space-y-2.5"
              onClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-6 w-6 items-center justify-center rounded-lg ${
                      allSubtasksDone
                        ? "bg-[#3AB37E]/15 text-[#238859]"
                        : "bg-[#094B5C]/10 text-[#094B5C]"
                    }`}
                  >
                    <ListChecks size={13} />
                  </span>
                  <p className="flex items-center gap-1.5 text-xs font-bold text-dash-dark">
                    Checklist{" "}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                        allSubtasksDone
                          ? "bg-[#3AB37E]/15 text-[#238859]"
                          : "bg-[#094B5C]/10 text-[#094B5C]"
                      }`}
                    >
                      {completedSubtasks}/{totalSubtasks}
                    </span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {totalSubtasks > 0 && (
                    <div
                      className="h-1.5 w-12 overflow-hidden rounded-full bg-gray-100"
                      aria-hidden="true"
                    >
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          allSubtasksDone ? "bg-[#3AB37E]" : "bg-[#094B5C]"
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    aria-expanded={isChecklistOpen}
                    aria-label={isChecklistOpen ? "Collapse checklist" : "Expand checklist"}
                    onClick={() => setIsChecklistOpen((prev) => !prev)}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-[#F4F7F9] text-[#094B5C] transition-colors hover:bg-[#094B5C]/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#094B5C]"
                  >
                    <ChevronUp
                      size={14}
                      aria-hidden="true"
                      className={`transition-transform duration-200 ${
                        isChecklistOpen ? "rotate-0" : "rotate-180"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {isChecklistOpen && (
                <div className="overflow-hidden rounded-2xl border border-gray-200/80 bg-[#F4F7F9]">
                  {totalSubtasks > 0 && (
                    <ChecklistRows
                      subtasks={checklist.subtasks}
                      userId={checklistUserId ?? ""}
                      creatorId={checklist.creatorId}
                      locked={cancelled}
                      onToggle={
                        onToggleSubtask ? (id) => onToggleSubtask(item.id, id) : undefined
                      }
                      onReorder={
                        onReorderSubtasks && canManageSubtasks
                          ? (nextSubtasks) => onReorderSubtasks(item.id, nextSubtasks)
                          : undefined
                      }
                    />
                  )}

                  {onAddSubtask && canManageSubtasks && (
                    isAddingSubtask ? (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          const trimmed = subtaskDraft.trim();
                          if (!trimmed) return;
                          onAddSubtask(item.id, trimmed);
                          setSubtaskDraft("");
                          subtaskInputRef.current?.focus();
                        }}
                        className={`flex items-center gap-2.5 bg-white px-3 py-2.5 ${
                          totalSubtasks > 0 ? "border-t border-gray-100" : ""
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-[6px] border-[1.5px] border-gray-300 bg-white"
                        />
                        <input
                          ref={subtaskInputRef}
                          type="text"
                          autoFocus
                          value={subtaskDraft}
                          onChange={(event) => setSubtaskDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setSubtaskDraft("");
                              setIsAddingSubtask(false);
                            }
                          }}
                          placeholder="Add a subtask..."
                          aria-label="New subtask title"
                          className="min-w-0 flex-1 bg-transparent text-[12.5px] font-medium text-[#0B1215] placeholder:text-gray-400 outline-none"
                        />
                        <button
                          type="submit"
                          disabled={!subtaskDraft.trim()}
                          className="rounded-lg bg-[#094B5C] px-2.5 py-1 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          aria-label="Cancel adding subtask"
                          onClick={() => {
                            setSubtaskDraft("");
                            setIsAddingSubtask(false);
                          }}
                          className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                        >
                          <X size={13} aria-hidden="true" />
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setIsAddingSubtask(true)}
                        className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[12px] font-medium text-gray-500 transition-colors hover:bg-[#E2ECF1] hover:text-[#094B5C] ${
                          totalSubtasks > 0 ? "border-t border-gray-200/80 bg-white/80" : "bg-[#F4F7F9]"
                        }`}
                      >
                        <Plus size={14} strokeWidth={2.2} className="text-[#094B5C]" aria-hidden="true" />
                        <span>Add subtask</span>
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          <div
            className={`flex items-center justify-between gap-2 ${
              hasChecklistBody ? "border-t border-gray-100 pt-3" : ""
            }`}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <Calendar
                size={13}
                aria-hidden="true"
                className={dueOverdue ? "shrink-0 text-red-500" : "shrink-0 text-gray-400"}
              />
              {checklist.dueAt ? (
                <p
                  className={`truncate text-xs font-medium ${
                    dueOverdue ? "text-red-600" : "text-gray-500"
                  }`}
                >
                  Due <time dateTime={checklist.dueAt}>{formatChecklistDate(checklist.dueAt)}</time>
                </p>
              ) : (
                <p className="truncate text-xs text-gray-400">No due date</p>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-3 text-gray-400">
              <span
                className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500"
                aria-label={`${commentCount} comment${commentCount === 1 ? "" : "s"}`}
              >
                <span>{commentCount}</span>
                <MessageSquare size={13} aria-hidden="true" className="text-gray-400" />
              </span>

              {totalSubtasks > 0 && (
                <span
                  className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500"
                  aria-label={`${completedSubtasks} of ${totalSubtasks} subtasks completed`}
                >
                  <span>{totalSubtasks}</span>
                  <ListChecks size={13} aria-hidden="true" className="text-gray-400" />
                </span>
              )}

              <ChevronRight
                size={15}
                aria-hidden="true"
                className="text-gray-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#094B5C]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
