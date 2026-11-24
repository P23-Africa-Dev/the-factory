"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { DndItem } from "@/types/operations";
import type { ProjectSubtask } from "@/lib/tasks/project-checklist";
import { TaskCard } from "./task-card";
import { Plus } from "lucide-react";

interface TaskColumnProps {
  id: string;
  title: string;
  color: string;
  items: DndItem[];
  onOpenCreateTask?: () => void;
  canDrag?: boolean;
  observerDragAllowed?: boolean;
  checklistUserId?: string;
  onToggleSubtask?: (taskId: string, subtaskId: string) => void;
  onAddSubtask?: (taskId: string, title: string) => void;
  onReorderSubtasks?: (taskId: string, subtasks: ProjectSubtask[]) => void;
  onTaskClick?: (item: DndItem) => void;
  onTaskEdit?: (item: DndItem) => void;
  onTaskDelete?: (item: DndItem) => void;
  onViewMap?: (item: DndItem) => void;
}

export function TaskColumn({
  id,
  title,
  color,
  items,
  onOpenCreateTask,
  canDrag = true,
  observerDragAllowed = false,
  checklistUserId,
  onToggleSubtask,
  onAddSubtask,
  onReorderSubtasks,
  onTaskClick,
  onTaskEdit,
  onTaskDelete,
  onViewMap,
}: TaskColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="flex flex-col relative h-full">
      {/* Column Header */}
      <div
        className="rounded-t-[30px] px-7.5 pt-3.25 pb-8 flex gap-3 items-center"
        style={{ backgroundColor: color }}
      >
        <h3 className="text-white font-medium text-sm">{title}</h3>
        <div
          className="rounded-full min-w-7 h-7 px-2 flex items-center justify-center font-bold text-xs bg-white"
          style={{ color }}
        >
          {items.length}
        </div>
      </div>

      {/* Droppable Body */}
      <div
        ref={setNodeRef}
        className={`flex-1 relative z-10 -mt-8 transition-colors duration-200 min-h-[300px] flex flex-col ${
          isOver
            ? "bg-gray-100/50 rounded-[32px] ring-2 ring-inset ring-gray-200"
            : ""
        }`}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="pt-2">
            {items.map((item) => (
              <TaskCard
                checklistUserId={checklistUserId}
                onToggleSubtask={onToggleSubtask}
                onAddSubtask={onAddSubtask}
                onReorderSubtasks={onReorderSubtasks}
                key={item.id}
                item={item}
                dragDisabled={!canDrag}
                observerDragAllowed={observerDragAllowed}
                onClick={onTaskClick}
                onEdit={onTaskEdit}
                onDelete={onTaskDelete}
                onViewMap={onViewMap}
              />
            ))}
          </div>
        </SortableContext>

        {/* Add Card Manually */}
        {onOpenCreateTask && (
          <button
            type="button"
            onClick={onOpenCreateTask}
            className="w-full flex items-center justify-between px-2 py-3 text-gray-400 hover:text-[#0B1215] transition-colors group mt-6"
          >
            <span className="text-xs font-medium">Add Card Manually</span>
            <div className="w-6 h-6 rounded-full border border-gray-300 flex items-center justify-center group-hover:border-[#0B1215] transition-colors">
              <Plus size={13} />
            </div>
          </button>
        )}
      </div>
    </div>
  );
}
