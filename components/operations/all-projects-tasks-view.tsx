"use client";

import { useCallback, useMemo, useState } from "react";
import { Search, SlidersHorizontal, BookmarkPlus, Loader2 } from "lucide-react";
import { arrayMove } from "@dnd-kit/sortable";
import { toast } from "sonner";
import { TaskBoard } from "@/components/operations/task-board";
import { TaskDetailModal } from "@/components/operations/task-detail-modal";
import { CreateTaskModal } from "@/components/operations/create-task-modal";
import { TaskBoardSkeleton } from "@/components/operations/skeletons/task-board-skeleton";
import { useTasks, useUpdateTaskStatusAdmin } from "@/hooks/use-tasks";
import type { DndContainer, DndItem } from "@/types/operations";
import type { ApiTaskStatus, TaskApiItem } from "@/lib/api/tasks";
import { formatTaskLocationLabel, hasTrackableTaskLocation } from "@/lib/tasks/location";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";

const STATUS_OPTIONS = ["All", "Pending", "In Progress", "Completed", "Cancelled"];

function statusToContainerId(s: string): string | null {
  if (s === "Pending") return "pending";
  if (s === "In Progress") return "in-progress";
  if (s === "Completed") return "completed";
  if (s === "Cancelled") return "cancelled";
  return null;
}

export function AllProjectsTasksView() {
  const authUser = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(authUser);
  const canManageTaskStatuses =
    role === "owner" ||
    role === "admin" ||
    role === "management" ||
    role === "manager" ||
    role === "supervisor";

  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<{ item: DndItem; containerId: string } | null>(null);

  const { data: tasksData, isPending: loadingTasks } = useTasks(
    companyId ? { company_id: companyId } : {}
  );
  const statusMutation = useUpdateTaskStatusAdmin();

  const serverContainers = useMemo(
    () => buildContainers(tasksData?.tasks ?? []),
    [tasksData?.tasks],
  );
  const [boardContainers, setBoardContainers] = useState<DndContainer[]>(serverContainers);
  const [isDraggingBoard, setIsDraggingBoard] = useState(false);
  const [pendingServerContainers, setPendingServerContainers] = useState<DndContainer[] | null>(null);
  const [prevServerContainers, setPrevServerContainers] = useState(serverContainers);

  if (serverContainers !== prevServerContainers) {
    setPrevServerContainers(serverContainers);
    if (isDraggingBoard) {
      setPendingServerContainers(serverContainers);
    } else {
      setBoardContainers(serverContainers);
      setPendingServerContainers(null);
    }
  }

  const handleDragStateChange = useCallback((dragging: boolean) => {
    if (!dragging && pendingServerContainers) {
      setBoardContainers(pendingServerContainers);
      setPrevServerContainers(pendingServerContainers);
      setPendingServerContainers(null);
    }
    setIsDraggingBoard(dragging);
  }, [pendingServerContainers]);

  const findContainer = useCallback(
    (id: string) => {
      if (boardContainers.some((c) => c.id === id)) {
        return boardContainers.find((c) => c.id === id);
      }
      return boardContainers.find((c) => c.items.some((item) => item.id === id));
    },
    [boardContainers]
  );

  const moveItem = useCallback((activeId: string, overId: string, containerId: string) => {
    if (!canManageTaskStatuses) return;
    setBoardContainers((prev) =>
      prev.map((container) => {
        if (container.id !== containerId) return container;
        const activeIndex = container.items.findIndex((item) => item.id === activeId);
        const overIndex = container.items.findIndex((item) => item.id === overId);
        if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return container;
        return { ...container, items: arrayMove(container.items, activeIndex, overIndex) };
      })
    );
  }, [canManageTaskStatuses]);

  const moveToContainer = useCallback((activeId: string, overContainerId: string) => {
    if (!canManageTaskStatuses) return;
    setBoardContainers((prev) => {
      const activeContainer = prev.find((c) => c.items.some((item) => item.id === activeId));
      const activeItem = activeContainer?.items.find((item) => item.id === activeId);
      if (!activeContainer || !activeItem) return prev;
      return prev.map((container) => {
        if (container.id === activeContainer.id)
          return { ...container, items: container.items.filter((item) => item.id !== activeId) };
        if (container.id === overContainerId)
          return { ...container, items: [...container.items, activeItem] };
        return container;
      });
    });
  }, [canManageTaskStatuses]);

  const moveBetweenContainers = useCallback(
    (activeId: string, overId: string, activeContainerId: string, overContainerId: string) => {
      if (!canManageTaskStatuses) return;
      setBoardContainers((prev) => {
        const activeContainer = prev.find((c) => c.id === activeContainerId);
        const overContainer = prev.find((c) => c.id === overContainerId);
        if (!activeContainer || !overContainer) return prev;
        const activeItem = activeContainer.items.find((item) => item.id === activeId);
        if (!activeItem) return prev;
        const overIndex = overContainer.items.findIndex((item) => item.id === overId);
        const insertionIndex = overIndex >= 0 ? overIndex : overContainer.items.length;
        return prev.map((container) => {
          if (container.id === activeContainerId)
            return { ...container, items: container.items.filter((item) => item.id !== activeId) };
          if (container.id === overContainerId) {
            const nextItems = [...overContainer.items];
            nextItems.splice(insertionIndex, 0, activeItem);
            return { ...container, items: nextItems };
          }
          return container;
        });
      });
    },
    [canManageTaskStatuses]
  );

  const handleStatusDrop = useCallback(
    (activeId: string, fromContainerId: string, toContainerId: string) => {
      const nextStatus = containerToApiStatus(toContainerId);
      const previousStatus = containerToApiStatus(fromContainerId);

      if (!nextStatus || !previousStatus || nextStatus === previousStatus) return;

      if (!canManageTaskStatuses) {
        toast.error("Only management users can move task status on this board.");
        setBoardContainers(buildContainers(tasksData?.tasks ?? []));
        return;
      }

      if (!companyId) {
        toast.error("Company context is required.");
        setBoardContainers(buildContainers(tasksData?.tasks ?? []));
        return;
      }

      const taskId = Number(activeId);
      if (!Number.isFinite(taskId)) {
        setBoardContainers(buildContainers(tasksData?.tasks ?? []));
        return;
      }

      const snapshot = boardContainers;

      statusMutation.mutate(
        { taskId, payload: { company_id: companyId, status: nextStatus } },
        {
          onSuccess: (response) => {
            setBoardContainers((prev) =>
              prev.map((container) => ({
                ...container,
                items: container.items.map((item) =>
                  item.id === activeId
                    ? { ...item, statusLabel: mapStatusToLabel(response.data.task.status) }
                    : item
                ),
              }))
            );
            toast.success(getStatusTransitionMessage(previousStatus, nextStatus));
          },
          onError: () => {
            setBoardContainers(snapshot);
            toast.error("Failed to update task status. Board state has been restored.");
          },
        }
      );
    },
    [boardContainers, canManageTaskStatuses, companyId, statusMutation, tasksData?.tasks]
  );

  const displayContainers: DndContainer[] = boardContainers
    .filter((c) => {
      if (statusFilter === "All") return true;
      return c.id === statusToContainerId(statusFilter);
    })
    .map((c) => {
      if (!search.trim()) return c;
      const q = search.toLowerCase();
      return {
        ...c,
        items: c.items.filter(
          (item) =>
            item.description.toLowerCase().includes(q) ||
            item.label.toLowerCase().includes(q) ||
            (item.addedDescription?.toLowerCase().includes(q) ?? false)
        ),
      };
    });

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Toolbar ── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 sm:justify-end min-w-0 transition-all duration-300 relative z-10">
        <div className="relative w-full md:w-114.5 group shrink-0">
          <Search
            className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-dash-dark transition-colors"
            size={18}
            strokeWidth={2}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tasks, agents, categories…"
            className="w-full bg-white pl-13 pr-5 text-[14px] placeholder:text-gray-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-dash-dark/10 transition-all font-sans"
            style={{
              height: "46px",
              borderRadius: "24px",
              border: "0.7px solid #D7D7D7",
              boxShadow: "0px 1px 3px 0px #0000004D, 0px 4px 8px 3px #00000026",
            }}
          />
        </div>

        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all shrink-0 cursor-pointer ${
            showFilters ? "text-white" : "text-gray-500"
          }`}
          style={{
            background: showFilters ? "#34373C" : "#F8F8F8",
            border: showFilters ? "0.5px solid #34373C" : "0.5px solid #D1D1D1",
            boxShadow: showFilters ? "none" : "0 2px 8px rgba(0,0,0,0.06)",
          }}
        >
          <SlidersHorizontal size={14} strokeWidth={2} />
          <span style={{ fontSize: "10px", fontWeight: 400 }}>Filter</span>
        </button>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-5 py-3 bg-dash-dark text-white rounded-xl text-[13px] font-bold hover:opacity-90 transition-all shrink-0 cursor-pointer"
          style={{ boxShadow: "0 4px 14px rgba(9, 35, 45, 0.3)" }}
        >
          <BookmarkPlus size={15} strokeWidth={2} />
          <span className="hidden sm:inline whitespace-nowrap">Create New Task</span>
          <span className="sm:hidden">Task</span>
        </button>
      </div>

      {/* ── Filter panel ── */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-400 px-1">Task Status</label>
            <div className="flex gap-1 flex-wrap">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-4 py-2 rounded-full text-[12px] font-bold transition-all ${
                    statusFilter === s
                      ? "bg-[#0B1215] text-white"
                      : "bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {statusFilter !== "All" && (
            <div className="flex flex-col justify-end">
              <button
                onClick={() => setStatusFilter("All")}
                className="px-4 py-2 rounded-full text-[12px] font-bold text-red-400 hover:bg-red-50 transition-all border border-red-200"
              >
                Clear filter
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Board ── */}
      {loadingTasks ? (
        <TaskBoardSkeleton />
      ) : (
        <TaskBoard
          containers={displayContainers}
          activeTab="all"
          onAddCard={() => {}}
          findContainer={findContainer}
          moveItem={moveItem}
          moveToContainer={moveToContainer}
          moveBetweenContainers={moveBetweenContainers}
          onStatusDrop={handleStatusDrop}
          onDragStateChange={handleDragStateChange}
          onTaskClick={(item, containerId) => setSelectedTask({ item, containerId })}
        />
      )}

      <CreateTaskModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
      />

      <TaskDetailModal
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        task={selectedTask?.item ?? null}
        status={selectedTask?.containerId ?? ""}
      />
    </div>
  );
}

function containerToApiStatus(containerId: string): ApiTaskStatus | null {
  if (containerId === "pending") return "pending";
  if (containerId === "in-progress") return "in_progress";
  if (containerId === "completed") return "completed";
  if (containerId === "cancelled") return "cancelled";
  return null;
}

function mapStatusToLabel(status: ApiTaskStatus): string {
  if (status === "in_progress") return "In Progress";
  if (status === "paused") return "Paused";
  if (status === "resumed") return "Resumed";
  if (status === "completed") return "Completed";
  if (status === "cancelled") return "Cancelled";
  return "Pending";
}

function getStatusTransitionMessage(from: ApiTaskStatus, to: ApiTaskStatus): string {
  if (from === "pending" && to === "in_progress") return "Task moved to In Progress successfully.";
  if (from === "in_progress" && to === "completed") return "Task marked as Completed successfully.";
  if (from === "in_progress" && to === "pending") return "Task moved back to Pending.";
  if (from === "completed" && to === "in_progress") return "Task reopened and moved back to In Progress.";
  if (from === "completed" && to === "pending") return "Task reverted to Pending.";
  if (from === "pending" && to === "cancelled") return "Task cancelled.";
  if (from === "in_progress" && to === "cancelled") return "Task cancelled.";
  return "Task status updated successfully.";
}

function buildContainers(tasks: TaskApiItem[]): DndContainer[] {
  return [
    {
      id: "pending",
      title: "Pending Task",
      color: "#BD7A22",
      items: tasks.filter((t) => t.status === "pending").map(mapTaskToDnd),
    },
    {
      id: "in-progress",
      title: "Task In-Progress",
      color: "#094B5C",
      items: tasks
        .filter((t) => t.status === "in_progress" || t.status === "paused" || t.status === "resumed")
        .map(mapTaskToDnd),
    },
    {
      id: "completed",
      title: "Completed Task",
      color: "#4FD1C5",
      items: tasks.filter((t) => t.status === "completed").map(mapTaskToDnd),
    },
    {
      id: "cancelled",
      title: "Cancelled Task",
      color: "#6B7280",
      items: tasks.filter((t) => t.status === "cancelled").map(mapTaskToDnd),
    },
  ];
}

function mapTaskToDnd(apiTask: TaskApiItem): DndItem {
  const statusLabel = mapStatusToLabel(apiTask.status);
  const assigneeLabel =
    apiTask.assigned_users && apiTask.assigned_users.length > 0
      ? apiTask.assigned_users.map((user) => user.name).join(", ")
      : apiTask.assignee?.name || "Unassigned";

  return {
    id: String(apiTask.id),
    label: assigneeLabel,
    description: apiTask.title,
    location: formatTaskLocationLabel(apiTask.location, apiTask.address),
    latitude: apiTask.latitude ?? null,
    longitude: apiTask.longitude ?? null,
    hasTrackableLocation: hasTrackableTaskLocation(apiTask),
    time: "Just now",
    avatar: apiTask.assignee?.avatar_url || undefined,
    category: (apiTask.type || "agent") as DndItem["category"],
    dueDate: apiTask.due_date ? new Date(apiTask.due_date).toLocaleDateString() : undefined,
    assignedBy: apiTask.creator?.name || `User ID: ${apiTask.created_by_user_id}`,
    addedDescription: apiTask.description,
    statusLabel,
  };
}
