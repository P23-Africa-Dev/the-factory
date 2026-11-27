"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, BookmarkPlus, User } from "lucide-react";
import { SortMenu } from "@/components/ui/sort-menu";
import { TASK_BOARD_PAGE_SIZE, TASK_LIST_SORTS, type TaskListSort } from "@/lib/api/tasks";
import { arrayMove } from "@dnd-kit/sortable";
import { toast } from "sonner";
import Image from "next/image";
import { TaskBoard } from "@/components/operations/task-board";
import { TaskDetailModal } from "@/components/operations/task-detail-modal";
import { CreateTaskModal, type CreateTaskStatus } from "@/components/operations/create-task-modal";
import ConfirmDeleteModal from "@/components/ui/confirm-delete-modal";
import ConfirmStatusMoveModal from "@/components/ui/confirm-status-move-modal";
import { TaskBoardSkeleton } from "@/components/operations/skeletons/task-board-skeleton";
import {
  useTasks,
  useUpdateTaskStatus,
  useUpdateTaskStatusAdmin,
  useUpdateTask,
  useDeleteTask,
  useCreateTaskSubtask,
  useUpdateTaskSubtask,
  useCompleteTaskSubtask,
  useReorderTaskSubtasks,
  useDeleteTaskSubtask,
} from "@/hooks/use-tasks";
import type { DndContainer, DndItem } from "@/types/operations";
import type { ApiTaskStatus, TaskApiItem, TaskSubtaskMutationData } from "@/lib/api/tasks";
import { formatTaskLocationLabel, hasTrackableTaskLocation } from "@/lib/tasks/location";
import { buildTaskMapUrl } from "@/lib/tasks/map-navigation";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { checklistFromTask, toLocalChecklistDate, type ProjectChecklist, type ProjectSubtask } from "@/lib/tasks/project-checklist";
import { completionBlockerLabels } from "@/lib/tasks/status-move-blockers";
import { ApiRequestError } from "@/lib/api/onboarding";
import { getApiErrorMessage } from "@/lib/api/errors";
import { isTaskManagerRole } from "@/lib/tasks/board-permissions";
import Arrow57Deg from "@/assets/images/arrow-57deg.png";
import { moveCardToColumn } from "@/lib/dnd/board-moves";
import { resolveAvatarSrc } from "@/lib/avatar";

const STATUS_OPTIONS = ["All", "Pending", "In Progress", "Completed", "Cancelled"];

const ARC_LENGTH = 188.5;
const CIRCUMFERENCE = 251.3;

function formatStatCount(value: number): string {
  return String(value).padStart(3, "0");
}

// ─── Stat Cards ───────────────────────────────────────────────────────────────
function TaskSummaryCards({ tasks }: { tasks: TaskApiItem[] }) {
  const total = tasks.length;
  const pending = tasks.filter((t) => t.status === "pending").length;
  const inProgress = tasks.filter(
    (t) => t.status === "in_progress" || t.status === "paused" || t.status === "resumed"
  ).length;
  const completed = tasks.filter((t) => t.status === "completed").length;
  const completionPct = total === 0 ? 0 : Math.round((completed / total) * 100);

  const [animatedPct, setAnimatedPct] = useState(0);
  useEffect(() => {
    const duration = 1200;
    const start = performance.now();
    const target = completionPct;
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
    let raf: number;
    function frame(now: number) {
      const t = Math.min((now - start) / duration, 1);
      setAnimatedPct(ease(t) * target);
      if (t < 1) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [completionPct]);

  const animatedDash = (animatedPct / 100) * ARC_LENGTH;
  const dotAngle = (animatedPct / 100) * 270 * (Math.PI / 180);
  const dotX = 50 + 40 * Math.cos(dotAngle);
  const dotY = 50 + 40 * Math.sin(dotAngle);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto] gap-4 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Performance */}
      <div className="se-stat-card rounded-[20px] p-5 sm:p-6 relative flex flex-col sm:flex-row items-center text-center sm:text-left gap-4 sm:gap-6 overflow-hidden">
        <div className="relative w-28 h-28 sm:w-41.5 sm:h-41.5 shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: "rotate(135deg)" }}>
            <circle cx="50" cy="50" r="40" fill="none" stroke="#6B9A9A" strokeOpacity="0.3" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`} />
            <circle cx="50" cy="50" r="40" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`} />
            <circle cx="50" cy="50" r="40" fill="none" stroke="#6B9A9A" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${animatedDash} ${CIRCUMFERENCE}`} />
            <circle cx={dotX} cy={dotY} r="3" fill="#fff" stroke="#7BB6B8" strokeWidth="4px" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 sm:gap-1">
            <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-[#EF6C55] flex items-center justify-center shadow-lg">
              <User className="text-white fill-current w-3 h-3 sm:w-4.5 sm:h-4.5" />
            </div>
            <span className="text-white font-semibold text-[24px] sm:text-[40px] leading-none">
              {completionPct}%
            </span>
          </div>
        </div>
        <div className="flex flex-col z-10 text-white min-w-0">
          <p className="text-[#E8E8E8] font-normal text-[12px] sm:text-[14px] lg:text-[16px] leading-tight mb-0.5">
            Overall Task
          </p>
          <h2 className="text-[20px] sm:text-[22px] xl:text-[30px] font-semibold leading-[1.1] mb-2 sm:mb-4 tracking-tight">
            Performance
          </h2>
          <p className="text-[11px] sm:text-[14px] font-medium text-[#E8E8E8]/80">
            Status:{" "}
            <span className="text-white font-semibold">
              {completionPct >= 80 ? "Excellent" : completionPct >= 60 ? "Good" : completionPct >= 40 ? "Fair" : "Poor"}
            </span>
          </p>
        </div>
      </div>

      {/* Total Tasks */}
      <div className="se-stat-card px-5 sm:px-6 pb-3 rounded-[20px] overflow-hidden relative flex flex-col min-h-45 w-full min-w-0">
        <div className="flex items-start justify-between pt-5 sm:pt-6">
          <div>
            <p className="text-[14px] font-medium text-[#f8f8f8]">Total Tasks</p>
            <h2 className="text-[64px] font-bold text-white leading-none tracking-[-0.04em]">
              {formatStatCount(total)}
            </h2>
          </div>
          <span className="flex items-center gap-1 px-2.5 py-1.5 h-4 bg-[#3AB37E] text-white rounded-full text-[7px] mt-1">
            All
            <Image src={Arrow57Deg} alt="" width={7.5} height={7.5} />
          </span>
        </div>
      </div>

      {/* Pending Tasks */}
      <div className="se-stat-card px-5 sm:px-6 pb-3 rounded-[20px] overflow-hidden relative flex flex-col min-h-45 w-full min-w-0">
        <div className="flex items-start justify-between pt-5 sm:pt-6">
          <div>
            <p className="text-[14px] font-medium text-[#f8f8f8]">Pending Tasks</p>
            <h2 className="text-[64px] font-bold text-white leading-none tracking-[-0.04em]">
              {formatStatCount(pending)}
            </h2>
          </div>
          <span className="flex items-center gap-1 px-2.5 py-1.5 h-4 bg-[#EF8E5B] text-white rounded-full text-[7px] mt-1">
            All
            <Image src={Arrow57Deg} alt="" width={7.5} height={7.5} />
          </span>
        </div>
      </div>

      {/* In Progress / Arc card */}
      <div className="se-stat-card rounded-[20px] p-5 flex flex-col items-center w-full min-w-0 text-center gap-3">
        <p className="mt-5 text-[#f8f8f8] font-light text-[10px] leading-[1.4] max-w-20 mx-auto">
          Tasks currently in progress
        </p>
        <div className="relative w-24 h-24 flex items-center justify-center mt-1">
          <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" style={{ transform: "rotate(135deg)" }}>
            <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="7" strokeLinecap="round" strokeDasharray="188.5 251.3" />
            <circle cx="50" cy="50" r="40" fill="none" stroke="#2ae9c9" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(inProgress / Math.max(total, 1)) * ARC_LENGTH} ${CIRCUMFERENCE}`} />
          </svg>
          <div className="relative flex flex-col items-center gap-0.5">
            <div className="w-8 h-8 bg-[#14343e] rounded-full flex items-center justify-center shadow-sm">
              <User size={14} className="text-[#2ae9c9] fill-current" />
            </div>
            <span className="text-white text-[10px] font-bold">
              {total === 0 ? 0 : Math.round((inProgress / total) * 100)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function statusToContainerId(s: string): string | null {
  if (s === "Pending") return "pending";
  if (s === "In Progress") return "in-progress";
  if (s === "Completed") return "completed";
  if (s === "Cancelled") return "cancelled";
  return null;
}

type BoardTask = TaskApiItem & { checklist?: ProjectChecklist; commentCount?: number };

export function AllProjectsTasksView({ enableProjectChecklist = false, agentView = false }: { enableProjectChecklist?: boolean; agentView?: boolean }) {
  const router = useRouter();
  const authUser = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(authUser);
  const isManagementUser = isTaskManagerRole(role);
  // Managers on the ops board, or agents on their own board, may drag to any column.
  const canManageTaskStatuses = !agentView && isManagementUser;
  const canDragTaskStatuses = canManageTaskStatuses || agentView;

  const userId = String(authUser?.id ?? "");
  const userName = authUser?.name ?? "Current user";

  const [search, setSearch] = useState("");
  const [taskScope, setTaskScope] = useState<"mine" | "all">("mine");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [taskSort, setTaskSort] = useState<TaskListSort>("newest");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createStatus, setCreateStatus] = useState<CreateTaskStatus>("pending");
  const [selectedTask, setSelectedTask] = useState<{ item: DndItem; containerId: string } | null>(null);
  const [editingTask, setEditingTask] = useState<DndItem | null>(null);
  const [deleteTaskTarget, setDeleteTaskTarget] = useState<DndItem | null>(null);
  const [pendingStatusMove, setPendingStatusMove] = useState<{
    activeId: string;
    previousStatus: ApiTaskStatus;
    nextStatus: ApiTaskStatus;
    blockers: string[];
    snapshot: DndContainer[];
  } | null>(null);
  const [confirmingStatusMove, setConfirmingStatusMove] = useState(false);

  const { data: tasksData, isPending: loadingTasks } = useTasks(
    companyId
      ? {
          company_id: companyId,
          assigned_to_me: agentView || (isManagementUser && taskScope === "mine"),
          sort: taskSort,
          per_page: TASK_BOARD_PAGE_SIZE,
        }
      : {}
  );
  const adminStatusMutation = useUpdateTaskStatusAdmin();
  const agentStatusMutation = useUpdateTaskStatus();
  const statusMutation = canManageTaskStatuses ? adminStatusMutation : agentStatusMutation;
  const updateTaskMutation = useUpdateTask({
    onSuccess: () => {
      toast.success("Task updated successfully.");
      setEditingTask(null);
    },
  });
  const deleteTaskMutation = useDeleteTask({
    onSuccess: () => {
      toast.success("Task deleted successfully.");
      setDeleteTaskTarget(null);
    },
  });

  function openCreateTask(containerId?: string) {
    setCreateStatus(containerToCreateStatus(containerId));
    setShowCreateModal(true);
  }

  const handleSubtaskResult = useCallback((data: TaskSubtaskMutationData) => {
    if (data.completion_blocked_reason) {
      toast.error(data.completion_blocked_reason);
      return;
    }
    if (data.status_changed && data.task?.status === "completed") {
      toast.success("All subtasks done. Task moved to Completed.");
    } else if (data.status_changed) {
      toast.success(getStatusTransitionMessage("pending", data.task.status));
    }
  }, []);

  const createSubtaskMutation = useCreateTaskSubtask({ onSuccess: handleSubtaskResult });
  const updateSubtaskMutation = useUpdateTaskSubtask({ onSuccess: handleSubtaskResult });
  const completeSubtaskMutation = useCompleteTaskSubtask({ onSuccess: handleSubtaskResult });
  const reorderSubtasksMutation = useReorderTaskSubtasks({ onSuccess: handleSubtaskResult });
  const deleteSubtaskMutation = useDeleteTaskSubtask({ onSuccess: handleSubtaskResult });

  const allTasks = useMemo<BoardTask[]>(() => {
    const apiTasks = tasksData?.tasks ?? [];
    if (!enableProjectChecklist) return apiTasks;
    return apiTasks.map((task) => {
      const checklist = checklistFromTask(task, userId, userName);
      return {
        ...task,
        commentCount: task.comments_count ?? 0,
        checklist,
      };
    });
  }, [enableProjectChecklist, tasksData?.tasks, userId, userName]);
  const serverContainers = useMemo(() => buildContainers(allTasks), [allTasks]);

  function subtaskError(err: unknown) {
    if (err instanceof ApiRequestError) {
      toast.error(err.message || "Unable to update subtask.");
      return;
    }
    toast.error("Unable to update subtask.");
  }

  function saveSubtasks(id: string, subtasks: ProjectSubtask[]) {
    const task = allTasks.find((entry) => String(entry.id) === id);
    if (!task?.checklist || task.status === "cancelled" || (task.checklist.creatorId && task.checklist.creatorId !== userId) || !userId || !companyId) return;
    const previous = task.checklist.subtasks;

    if (subtasks.length < previous.length) {
      const removed = previous.find((item) => !subtasks.some((next) => next.id === item.id));
      if (!removed) return;
      deleteSubtaskMutation.mutate(
        { taskId: task.id, subtaskId: removed.id, companyId },
        { onError: subtaskError },
      );
      return;
    }

    if (subtasks.length > previous.length) {
      const added = subtasks.find((item) => !previous.some((current) => current.id === item.id));
      if (!added) return;
      createSubtaskMutation.mutate(
        {
          taskId: task.id,
          payload: {
            company_id: companyId,
            title: added.title,
            assigned_user_id: added.assigneeId || undefined,
            due_at: added.dueAt,
          },
        },
        { onError: subtaskError },
      );
      return;
    }

    const previousIds = previous.map((item) => item.id).join(",");
    const nextIds = subtasks.map((item) => item.id).join(",");
    if (previousIds !== nextIds && subtasks.every((item) => previous.some((current) => current.id === item.id))) {
      reorderSubtasksMutation.mutate(
        { taskId: task.id, payload: { company_id: companyId, subtask_ids: subtasks.map((item) => item.id) } },
        { onError: subtaskError },
      );
      return;
    }

    const changed = subtasks.find((item) => {
      const current = previous.find((entry) => entry.id === item.id);
      return current && (
        current.title !== item.title
        || current.assigneeId !== item.assigneeId
        || current.dueAt !== item.dueAt
      );
    });
    if (!changed) return;
    updateSubtaskMutation.mutate(
      {
        taskId: task.id,
        subtaskId: changed.id,
        payload: {
          company_id: companyId,
          title: changed.title,
          assigned_user_id: changed.assigneeId || null,
          due_at: changed.dueAt,
        },
      },
      { onError: subtaskError },
    );
  }

  function addSubtask(id: string, title: string) {
    const task = allTasks.find((entry) => String(entry.id) === id);
    const trimmed = title.trim();
    if (!task?.checklist || !trimmed || task.status === "cancelled" || !userId || !companyId) return;
    if (task.checklist.creatorId && task.checklist.creatorId !== userId) return;
    createSubtaskMutation.mutate(
      {
        taskId: task.id,
        payload: {
          company_id: companyId,
          title: trimmed,
          assigned_user_id: task.checklist.assigneeId || userId,
          due_at: task.checklist.dueAt,
        },
      },
      { onError: subtaskError },
    );
  }

  function toggleSubtask(id: string, subtaskId: string) {
    const task = allTasks.find((entry) => String(entry.id) === id);
    const item = task?.checklist?.subtasks.find((subtask) => subtask.id === subtaskId);
    if (!task?.checklist || task.status === "cancelled" || !item || !userId || !companyId ||
      (item.assigneeId !== userId && task.checklist.creatorId !== userId)) return;
    completeSubtaskMutation.mutate(
      {
        taskId: task.id,
        subtaskId: item.id,
        payload: { company_id: companyId, is_completed: !item.isCompleted },
      },
      { onError: subtaskError },
    );
  }

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
    if (!canDragTaskStatuses) return;
    setBoardContainers((prev) =>
      prev.map((container) => {
        if (container.id !== containerId) return container;
        const activeIndex = container.items.findIndex((item) => item.id === activeId);
        const overIndex = container.items.findIndex((item) => item.id === overId);
        if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return container;
        return { ...container, items: arrayMove(container.items, activeIndex, overIndex) };
      })
    );
  }, [canDragTaskStatuses]);

  const moveToContainer = useCallback((activeId: string, overContainerId: string) => {
    if (!canDragTaskStatuses) return;
    setBoardContainers((prev) => moveCardToColumn(prev, activeId, overContainerId));
  }, [canDragTaskStatuses]);

  const moveBetweenContainers = useCallback(
    (activeId: string, overId: string, activeContainerId: string, overContainerId: string) => {
      if (!canDragTaskStatuses) return;
      if (activeContainerId === overContainerId) return;
      setBoardContainers((prev) => moveCardToColumn(prev, activeId, overContainerId, overId));
    },
    [canDragTaskStatuses]
  );

  function commitStatusMove(
    activeId: string,
    previousStatus: ApiTaskStatus,
    nextStatus: ApiTaskStatus,
    snapshot: DndContainer[],
    completeIncompleteSubtasks = false,
  ) {
    if (!companyId) {
      toast.error("Company context is required.");
      setBoardContainers(snapshot);
      return;
    }

    const taskId = Number(activeId);
    if (!Number.isFinite(taskId)) {
      setBoardContainers(snapshot);
      return;
    }

    statusMutation.mutate(
      {
        taskId,
        payload: {
          company_id: companyId,
          status: nextStatus,
          ...(completeIncompleteSubtasks ? { complete_incomplete_subtasks: true } : {}),
        },
      },
      {
        onSuccess: (response) => {
          setBoardContainers((prev) =>
            prev.map((container) => ({
              ...container,
              items: container.items.map((item) =>
                item.id === activeId
                  ? {
                      ...item,
                      apiStatus: response.data.task.status,
                      statusLabel: mapStatusToLabel(response.data.task.status),
                      projectChecklist: item.projectChecklist
                        ? {
                            ...item.projectChecklist,
                            subtasks: item.projectChecklist.subtasks.map((subtask) =>
                              completeIncompleteSubtasks
                                ? {
                                    ...subtask,
                                    isCompleted: true,
                                    completedAt: subtask.completedAt ?? new Date().toISOString(),
                                  }
                                : subtask,
                            ),
                          }
                        : item.projectChecklist,
                    }
                  : item
              ),
            }))
          );
          toast.success(getStatusTransitionMessage(previousStatus, nextStatus));
          setPendingStatusMove(null);
          setConfirmingStatusMove(false);
        },
        onError: (err) => {
          setBoardContainers(snapshot);
          setConfirmingStatusMove(false);
          toast.error(getApiErrorMessage(err, "Failed to update task status."));
        },
      }
    );
  }

  function handleStatusDrop(activeId: string, fromContainerId: string, toContainerId: string) {
    const nextStatus = containerToApiStatus(toContainerId);
    const draggedItem = boardContainers.flatMap((c) => c.items).find((item) => item.id === activeId);
    // Use the task's real status: the In Progress column also holds paused/resumed tasks.
    const previousStatus = draggedItem?.apiStatus ?? containerToApiStatus(fromContainerId);

    if (!nextStatus || !previousStatus || nextStatus === previousStatus) return;

    if (!canDragTaskStatuses) {
      setBoardContainers(serverContainers);
      return;
    }

    if (!companyId) {
      toast.error("Company context is required.");
      setBoardContainers(serverContainers);
      return;
    }

    const snapshot = boardContainers;
    const blockers =
      nextStatus === "completed" ? completionBlockerLabels(draggedItem) : [];

    if (blockers.length > 0) {
      // Revert the optimistic board move until the user confirms.
      setBoardContainers(serverContainers);
      setPendingStatusMove({
        activeId,
        previousStatus,
        nextStatus,
        blockers,
        snapshot: serverContainers,
      });
      return;
    }

    commitStatusMove(activeId, previousStatus, nextStatus, snapshot);
  }

  function confirmPendingStatusMove() {
    if (!pendingStatusMove) return;
    setConfirmingStatusMove(true);
    // Re-apply the visual move, then persist with checklist auto-complete.
    const { activeId, previousStatus, nextStatus, snapshot } = pendingStatusMove;
    const fromId = statusToContainerId(
      previousStatus === "in_progress" || previousStatus === "paused" || previousStatus === "resumed"
        ? "In Progress"
        : previousStatus === "pending"
          ? "Pending"
          : previousStatus === "completed"
            ? "Completed"
            : "Cancelled",
    );
    const toId = "completed";
    if (fromId && fromId !== toId) {
      setBoardContainers((prev) => {
        const activeContainer = prev.find((c) => c.items.some((item) => item.id === activeId));
        const activeItem = activeContainer?.items.find((item) => item.id === activeId);
        if (!activeContainer || !activeItem) return prev;
        return prev.map((container) => {
          if (container.id === activeContainer.id)
            return { ...container, items: container.items.filter((item) => item.id !== activeId) };
          if (container.id === toId) return { ...container, items: [...container.items, activeItem] };
          return container;
        });
      });
    }
    commitStatusMove(activeId, previousStatus, nextStatus, snapshot, true);
  }

  function cancelPendingStatusMove() {
    if (!pendingStatusMove) return;
    setBoardContainers(pendingStatusMove.snapshot);
    setPendingStatusMove(null);
    setConfirmingStatusMove(false);
  }

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

  // Prefer the visible board column so the modal badge matches what the user clicked;
  // fall back to server containers for fresh checklist item data.
  const currentSelection = selectedTask
    ? (() => {
        const fromBoard = boardContainers
          .flatMap((container) => container.items.map((item) => ({ item, containerId: container.id })))
          .find(({ item }) => item.id === selectedTask.item.id);
        const fromServer = enableProjectChecklist
          ? serverContainers
              .flatMap((container) => container.items.map((item) => ({ item, containerId: container.id })))
              .find(({ item }) => item.id === selectedTask.item.id)
          : undefined;
        if (!fromBoard && !fromServer) return selectedTask;
        return {
          item: fromServer?.item ?? fromBoard?.item ?? selectedTask.item,
          containerId: fromBoard?.containerId ?? fromServer?.containerId ?? selectedTask.containerId,
        };
      })()
    : null;
  const selectedId = currentSelection?.item.id;

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {isManagementUser && !agentView && (
          <div
            className="flex w-fit items-center gap-1 rounded-full border border-gray-200 bg-white p-1 shadow-sm shrink-0"
            role="group"
            aria-label="Task visibility"
          >
            {([
              ["mine", "My Tasks"],
              ["all", "All Tasks"],
            ] as const).map(([scope, label]) => {
              const active = taskScope === scope;

              return (
                <button
                  key={scope}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setTaskScope(scope)}
                  className={`rounded-full px-5 py-2 text-[13px] font-bold transition-colors ${
                    active
                      ? "bg-[#09232D] text-white shadow-sm"
                      : "text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}

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
              placeholder="Search tasks......"
              className="w-full bg-white pl-13 pr-5 text-[14px] placeholder:text-gray-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-dash-dark/10 transition-all font-sans"
              style={{
                height: "46px",
                borderRadius: "24px",
                border: "0.7px solid #D7D7D7",
                boxShadow: "0px 1px 3px 0px #0000004D, 0px 4px 8px 3px #00000026",
              }}
            />
          </div>

          <SortMenu
            value={taskSort}
            options={TASK_LIST_SORTS}
            onChange={setTaskSort}
            defaultValue="newest"
            ariaLabel="Sort tasks"
          />

          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`se-control flex items-center gap-2 px-4 py-2.5 text-[12px] font-medium transition-all shrink-0 cursor-pointer ${
              showFilters ? "se-control-active" : ""
            }`}
          >
            <SlidersHorizontal size={14} strokeWidth={2} />
            <span>Filter</span>
          </button>

          <button
            onClick={() => openCreateTask()}
            className="se-primary flex items-center gap-2 px-5 py-2.5 text-[12px] font-semibold transition-all shrink-0 cursor-pointer"
          >
            <BookmarkPlus size={15} strokeWidth={2} />
            <span className="hidden sm:inline whitespace-nowrap">Create New Task</span>
            <span className="sm:hidden">Task</span>
          </button>
        </div>
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

      {/* ── Stat Cards ── */}
      {!loadingTasks && <TaskSummaryCards tasks={allTasks} />}

      {/* ── Board ── */}
      {loadingTasks ? (
        <TaskBoardSkeleton />
      ) : (
        <TaskBoard
          containers={displayContainers}
          canDrag={canDragTaskStatuses}
          observerDragAllowed={canManageTaskStatuses}
          onOpenCreateTask={openCreateTask}
          checklistUserId={userId}
          onToggleSubtask={enableProjectChecklist ? toggleSubtask : undefined}
          onAddSubtask={enableProjectChecklist ? addSubtask : undefined}
          onReorderSubtasks={enableProjectChecklist ? saveSubtasks : undefined}
          activeTab="all"
          findContainer={findContainer}
          moveItem={moveItem}
          moveToContainer={moveToContainer}
          moveBetweenContainers={moveBetweenContainers}
          onStatusDrop={handleStatusDrop}
          onDragStateChange={handleDragStateChange}
          onTaskClick={(item, containerId) => setSelectedTask({ item, containerId })}
          onTaskEdit={agentView ? undefined : setEditingTask}
          onTaskDelete={agentView ? undefined : setDeleteTaskTarget}
          onViewMap={(item) => {
            const url = buildTaskMapUrl(item, role);
            if (!url) {
              toast.error("This task has no map coordinates yet.");
              return;
            }
            router.push(url);
          }}
        />
      )}

      <CreateTaskModal
        isOpen={showCreateModal}
        initialStatus={createStatus}
        onProjectChecklistCreated={enableProjectChecklist ? () => undefined : undefined}
        onClose={() => setShowCreateModal(false)}
      />

      <CreateTaskModal
        key={editingTask ? `edit-task-${editingTask.id}` : "edit-task-modal"}
        isOpen={!!editingTask}
        onClose={() => setEditingTask(null)}
        mode="edit"
        projectSubtasks={editingTask?.projectChecklist?.subtasks}
        submitLabel="Save Changes"
        initialValues={
          editingTask
            ? {
                title: editingTask.description,
                taskType: editingTask.taskType ?? "",
                description: editingTask.addedDescription ?? "",
                location: editingTask.location ?? "",
                address: editingTask.address ?? "",
                dueDate: editingTask.projectChecklist
                  ? toLocalChecklistDate(editingTask.projectChecklist.dueAt)
                  : editingTask.dueDateIso?.slice(0, 10) ?? "",
                requiredActions: editingTask.requiredActions?.join(", ") ?? "",
                priority: editingTask.priority
                  ? (editingTask.priority.charAt(0).toUpperCase() + editingTask.priority.slice(1).toLowerCase()) as
                      | "High"
                      | "Medium"
                      | "Low"
                  : "",
                minPhotos: editingTask.minPhotosRequired != null ? String(editingTask.minPhotosRequired) : "0",
                visitVerification: editingTask.visitVerificationRequired ?? false,
                observerIds: (editingTask.observers ?? []).map((observer) => String(observer.id)),
                assigneeIds: editingTask.assigneeIds ?? [],
              }
            : undefined
        }
        onSubmitTask={(payload) => {
          if (!editingTask || !companyId) return;
          const dueAt = payload.dueDate ? new Date(payload.dueDate).toISOString() : null;
          updateTaskMutation.mutate(
            {
            taskId: editingTask.id,
            payload: {
              company_id: companyId,
              title: payload.title,
              type: payload.taskType,
              description: payload.description,
              location: payload.location,
              address: payload.address,
              due_date: dueAt ?? undefined,
              required_actions: payload.requiredActions,
              priority: payload.priority,
              minimum_photos_required: payload.minPhotos,
              visit_verification_required: payload.visitVerification,
              latitude: payload.latitude,
              longitude: payload.longitude,
              observer_ids: payload.observerIds,
              ...(payload.assigneeIds && payload.assigneeIds.length > 0
                ? { assigned_agent_ids: payload.assigneeIds }
                : {}),
            },
            },
            { onError: (err) => toast.error(getApiErrorMessage(err, "Failed to update task.")) },
          );
        }}
      />

      <ConfirmDeleteModal
        isOpen={!!deleteTaskTarget}
        onClose={() => setDeleteTaskTarget(null)}
        title="Delete Task"
        description="Are you sure you want to delete this task? This action cannot be undone."
        confirmLabel={deleteTaskMutation.isPending ? "Deleting..." : "Delete"}
        onConfirm={() => {
          if (!deleteTaskTarget || !companyId) return;
          deleteTaskMutation.mutate(
            { taskId: deleteTaskTarget.id, companyId },
            { onError: (err) => toast.error(getApiErrorMessage(err, "Failed to delete task.")) },
          );
        }}
      />

      <ConfirmStatusMoveModal
        isOpen={Boolean(pendingStatusMove)}
        onClose={cancelPendingStatusMove}
        onConfirm={confirmPendingStatusMove}
        confirming={confirmingStatusMove}
        title="Complete unfinished checklist items?"
        description="This task still has open checklist items. Confirming marks them complete and moves the card to Completed."
        confirmLabel="Confirm & complete"
        items={pendingStatusMove?.blockers ?? []}
      />

      <TaskDetailModal
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        task={currentSelection?.item ?? null}
        status={currentSelection?.containerId ?? ""}
        onApiStatusUpdated={(nextStatus) => {
          if (!nextStatus) return;
          const containerId =
            nextStatus === "in_progress" || nextStatus === "paused" || nextStatus === "resumed"
              ? "in-progress"
              : nextStatus === "completed"
                ? "completed"
                : nextStatus === "cancelled"
                  ? "cancelled"
                  : "pending";
          setSelectedTask((prev) => (prev ? { ...prev, containerId } : prev));
        }}
        onToggleSubtask={enableProjectChecklist && selectedId ? (id) => toggleSubtask(selectedId, id) : undefined}
        onSaveSubtasks={enableProjectChecklist && selectedId ? (items) => saveSubtasks(selectedId, items) : undefined}
      />
    </div>
  );
}

function containerToCreateStatus(containerId?: string): CreateTaskStatus {
  if (containerId === "in-progress") return "in-progress";
  if (containerId === "completed") return "completed";
  return "pending";
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
  if (to === "cancelled") return "Task cancelled.";
  if (from === "cancelled") return "Task reopened.";
  if (to === "completed") return "Task marked as Completed successfully.";
  return "Task status updated successfully.";
}

function buildContainers(tasks: BoardTask[]): DndContainer[] {
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

/** Current assignee ids with the primary assignee first. */
function orderedAssigneeIds(apiTask: BoardTask): string[] {
  const ids = (apiTask.assigned_users ?? []).map((user) => String(user.id));
  const primary = apiTask.assigned_agent_id != null ? String(apiTask.assigned_agent_id) : null;
  if (primary && !ids.includes(primary)) ids.unshift(primary);
  return primary ? [primary, ...ids.filter((id) => id !== primary)] : ids;
}

function mapTaskToDnd(apiTask: BoardTask): DndItem {
  const statusLabel = mapStatusToLabel(apiTask.status);
  const assigneeLabel =
    apiTask.assigned_users && apiTask.assigned_users.length > 0
      ? apiTask.assigned_users.map((user) => user.name).join(", ")
      : apiTask.assignee?.name || "Unassigned";

  return {
    id: String(apiTask.id),
    label: assigneeLabel,
    description: apiTask.title,
    location: formatTaskLocationLabel(apiTask.location, apiTask.address, "No location set", apiTask.created_at),
    address: apiTask.address ?? undefined,
    latitude: apiTask.latitude ?? null,
    longitude: apiTask.longitude ?? null,
    hasTrackableLocation: hasTrackableTaskLocation(apiTask),
    time: "",
    avatar: apiTask.assignee?.avatar_url
      ? resolveAvatarSrc(apiTask.assignee.avatar_url)
      : undefined,
    category: (apiTask.type || "agent") as DndItem["category"],
    dueDate: apiTask.due_date ? new Date(apiTask.due_date).toLocaleDateString() : undefined,
    dueDateIso: apiTask.due_date ?? undefined,
    projectChecklist: apiTask.checklist,
    commentCount: apiTask.commentCount,
    createdAt: apiTask.created_at ?? undefined,
    assignedBy: apiTask.creator?.name || `User ID: ${apiTask.created_by_user_id}`,
    addedDescription: apiTask.description,
    taskType: apiTask.type ?? undefined,
    requiredActions: apiTask.required_actions ?? undefined,
    minPhotosRequired: apiTask.minimum_photos_required ?? undefined,
    visitVerificationRequired: apiTask.visit_verification_required ?? undefined,
    priority: apiTask.priority ?? undefined,
    observers: apiTask.observers ?? [],
    isObserver: Boolean(apiTask.is_observer),
    assigneeIds: orderedAssigneeIds(apiTask),
    createdByUserId: apiTask.created_by_user_id != null ? String(apiTask.created_by_user_id) : undefined,
    statusLabel,
    apiStatus: apiTask.status,
  };
}
