'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { CreateTaskModal } from '@/features/tasks/components/CreateTaskModal';
import { ArrowLeft, MapPin, AlertCircle, Pencil, Trash2, Plus } from 'lucide-react';

import {
  useTaskList,
  useUpdateTaskStatus,
  useTaskNavigation,
  useUpdateTask,
  useDeleteTask,
  isResumeTrackingStatus,
  flattenTaskPages,
  taskHasMapLocation,
  type Task,
} from '@/features/tasks';
import {
  useKpis,
  useUpdateKpiStatus,
  type Kpi,
  type KpiStatus,
} from '@/features/kpis';
import { toast } from '@/lib/toast';

type FilterKey = 'all' | 'pending' | 'in_progress' | 'completed' | 'cancelled';

const FILTER_TABS: { key: FilterKey; label: string; color: string }[] = [
  { key: 'all', label: 'All Tasks', color: '#75ADAF' },
  { key: 'pending', label: 'Pending', color: '#F5A623' },
  { key: 'in_progress', label: 'In Progress', color: '#75ADAF' },
  { key: 'completed', label: 'Completed', color: '#4CAF50' },
  { key: 'cancelled', label: 'Cancelled', color: '#FD6046' },
];

const STATUS_COLOR: Record<string, string> = {
  pending: '#F5A623',
  in_progress: '#75ADAF',
  paused: '#75ADAF',
  resumed: '#75ADAF',
  completed: '#4CAF50',
  cancelled: '#FD6046',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  paused: 'Paused',
  resumed: 'Resumed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const PRIORITY_COLOR: Record<string, string> = {
  low: '#4CAF50',
  medium: '#F5A623',
  high: '#FD6046',
  urgent: '#E53935',
};

// KPI constants
const KPI_FILTER_TABS: { key: KpiStatus | 'all'; label: string; color: string }[] = [
  { key: 'all', label: 'All KPIs', color: '#75ADAF' },
  { key: 'pending', label: 'Pending', color: '#F5A623' },
  { key: 'in_progress', label: 'In Progress', color: '#75ADAF' },
  { key: 'completed', label: 'Completed', color: '#4CAF50' },
  { key: 'cancelled', label: 'Cancelled', color: '#FD6046' },
];

const KPI_STATUS_COLOR: Record<string, string> = {
  pending: '#F5A623',
  in_progress: '#75ADAF',
  completed: '#4CAF50',
  cancelled: '#FD6046',
};

const KPI_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const CATEGORY_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  sales: { bg: '#DBEAFE', text: '#1E3A8A', label: 'Sales' },
  customer_visits: { bg: '#FEF3C7', text: '#92400E', label: 'Visits' },
  lead_generation: { bg: '#FCE7F3', text: '#9D174D', label: 'Leads' },
  collection: { bg: '#EDE9FE', text: '#5B21B6', label: 'Collection' },
  survey: { bg: '#E2E8F0', text: '#334155', label: 'Survey' },
  merchandising: { bg: '#CCFBF1', text: '#0D4E4E', label: 'Merchandising' },
  others: { bg: '#F3F4F6', text: '#4B5563', label: 'Others' },
};

const PRIORITY_STYLES: Record<string, { dot: string; text: string; label: string }> = {
  high: { dot: '#EF4444', text: '#991B1B', label: 'High' },
  medium: { dot: '#F59E0B', text: '#92400E', label: 'Medium' },
  low: { dot: '#10B981', text: '#166534', label: 'Low' },
  critical: { dot: '#7C3AED', text: '#4C1D95', label: 'Critical' },
};

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function isOverdue(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

function TaskCard({
  task,
  onPrimaryAction,
  onDecline,
  onPress,
  onEdit,
  onDelete,
}: {
  task: Task;
  onPrimaryAction: (e: React.MouseEvent) => void;
  onDecline: (e: React.MouseEvent) => void;
  onPress: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
}) {
  const statusColor = STATUS_COLOR[task.status] ?? '#8F9098';
  const isPending = task.status === 'pending';
  const isActive = task.status === 'in_progress' || task.status === 'paused' || task.status === 'resumed';
  const overdue = isOverdue(task.dueDate);
  const locationLabel = task.location ?? task.address;

  const primaryLabel =
    task.status === 'pending' ? 'Start' : isActive ? 'Continue' : 'View';

  return (
    <div
      onClick={onPress}
      className="flex bg-[#0B3343]/75 hover:bg-[#0B3343]/90 rounded-2xl border-[0.5px] border-white/8 overflow-hidden mb-3 cursor-pointer select-none transition-colors active:scale-[0.99] duration-150"
    >
      <div className="w-1.5 self-stretch" style={{ backgroundColor: statusColor }} />

      <div className="flex-1 p-4 flex flex-col gap-1.5 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h4 className="font-sans font-bold text-sm text-white line-clamp-2 leading-relaxed">
            {task.title}
          </h4>
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className="h-7 w-7 rounded-full border border-white/15 text-[#75ADAF] flex items-center justify-center"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={onDelete}
              className="h-7 w-7 rounded-full border border-white/15 text-[#FD6046] flex items-center justify-center"
            >
              <Trash2 size={13} />
            </button>
            <span
              className="px-2.5 py-1 rounded-full text-[10px] font-semibold flex-shrink-0 font-sans"
              style={{ backgroundColor: `${statusColor}22`, color: statusColor }}
            >
              {STATUS_LABEL[task.status] ?? task.status}
            </span>
          </div>
        </div>

        {task.description && (
          <p className="font-sans text-xs text-[#8F9098] line-clamp-2 leading-relaxed">
            {task.description}
          </p>
        )}

        {task.priority && (
          <div
            className="self-start px-2 py-0.5 rounded text-[9px] font-bold tracking-wider font-sans"
            style={{
              backgroundColor: `${PRIORITY_COLOR[task.priority]}22`,
              color: PRIORITY_COLOR[task.priority],
            }}
          >
            {task.priority.toUpperCase()}
          </div>
        )}

        {locationLabel && locationLabel !== '—' && (
          <div className="flex items-center gap-1.5 mt-1 text-[11px] font-sans">
            <MapPin size={12} className="text-white/60 flex-shrink-0" />
            <span className="text-[#75ADAF] truncate">{locationLabel}</span>
          </div>
        )}

        <div className="flex items-center justify-between mt-1 text-[10px] font-sans">
          <span className="text-[#494A50]">{formatRelativeTime(task.assignedAt)}</span>
          {task.dueDate && (
            <span className={`font-medium ${overdue ? 'text-[#FD6046]' : 'text-[#F5A623]'}`}>
              Due {new Date(task.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </div>

        <div className="flex gap-2.5 mt-3">
          <button
            onClick={onPrimaryAction}
            className="flex-1 h-9 rounded-xl bg-[#75ADAF] text-white font-semibold text-xs transition-opacity hover:opacity-95 active:scale-[0.98]"
          >
            {primaryLabel}
          </button>
          {isPending && (
            <button
              onClick={onDecline}
              className="flex-1 h-9 rounded-xl border border-[#FD6046] text-[#FD6046] font-semibold text-xs bg-transparent transition-colors hover:bg-[#FD6046]/10 active:scale-[0.98]"
            >
              Decline
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({
  kpi,
  onStart,
  onComplete,
  onCancel,
  isUpdating,
}: {
  kpi: Kpi;
  onStart: () => void;
  onComplete: () => void;
  onCancel: () => void;
  isUpdating: boolean;
}) {
  const statusColor = KPI_STATUS_COLOR[kpi.status] ?? '#8F9098';
  const catStyle = CATEGORY_STYLES[kpi.category] ?? { bg: '#E2E8F0', text: '#334155', label: kpi.category };
  const prioStyle = PRIORITY_STYLES[kpi.priority] ?? { dot: '#8F9098', text: '#8F9098', label: kpi.priority };

  const isPending = kpi.status === 'pending';
  const isInProgress = kpi.status === 'in_progress';

  return (
    <div className="bg-[#0B3343]/75 hover:bg-[#0B3343]/90 rounded-2xl border-[0.5px] border-white/8 overflow-hidden mb-3 p-4 flex flex-col gap-3 min-w-0 transition-colors select-none">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1 min-w-0">
          <h4 className="font-sans font-bold text-sm text-white leading-relaxed line-clamp-2">
            {kpi.name}
          </h4>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <span
              className="px-2 py-0.5 rounded text-[9px] font-bold tracking-wider uppercase font-sans"
              style={{ backgroundColor: catStyle.bg, color: catStyle.text }}
            >
              {catStyle.label}
            </span>
            <span className="flex items-center gap-1 text-[10px] text-white/60 font-sans">
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: prioStyle.dot }} />
              {prioStyle.label}
            </span>
          </div>
        </div>
        <span
          className="px-2.5 py-1 rounded-full text-[10px] font-semibold flex-shrink-0 font-sans"
          style={{ backgroundColor: `${statusColor}22`, color: statusColor }}
        >
          {KPI_STATUS_LABEL[kpi.status] ?? kpi.status}
        </span>
      </div>

      {kpi.objective && (
        <p className="font-sans text-xs text-[#8F9098] leading-relaxed">
          <strong className="text-white/80 font-medium">Objective:</strong> {kpi.objective}
        </p>
      )}

      {kpi.expectedOutcome && (
        <p className="font-sans text-xs text-[#8F9098] leading-relaxed">
          <strong className="text-white/80 font-medium">Expected Outcome:</strong> {kpi.expectedOutcome}
        </p>
      )}

      <div className="flex items-center justify-between text-[11px] font-sans border-t border-white/5 pt-2.5 mt-0.5">
        <span className="text-[#75ADAF]">
          Target: <strong className="text-white font-semibold">{kpi.targetValue}</strong>
        </span>
        <span className="text-white/40">
          Ends {new Date(kpi.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
        </span>
      </div>

      {(isPending || isInProgress) && (
        <div className="flex gap-2.5 mt-1">
          {isPending && (
            <button
              onClick={onStart}
              disabled={isUpdating}
              className="flex-1 h-9 rounded-xl bg-[#75ADAF] text-white font-semibold text-xs transition-opacity hover:opacity-95 active:scale-[0.98] disabled:opacity-50"
            >
              Start KPI
            </button>
          )}
          {isInProgress && (
            <>
              <button
                onClick={onComplete}
                disabled={isUpdating}
                className="flex-1 h-9 rounded-xl bg-[#4CAF50] text-white font-semibold text-xs transition-opacity hover:opacity-95 active:scale-[0.98] disabled:opacity-50"
              >
                Complete
              </button>
              <button
                onClick={onCancel}
                disabled={isUpdating}
                className="flex-1 h-9 rounded-xl border border-[#FD6046] text-[#FD6046] font-semibold text-xs bg-transparent transition-colors hover:bg-[#FD6046]/10 active:scale-[0.98] disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function TasksPage() {
  const router = useRouter();
  const [activeSubTab, setActiveSubTab] = useState<'tasks' | 'kpis'>('tasks');

  // Tasks States
  const [activeFilter, setActiveFilter] = useState<FilterKey>('pending');
  const [taskToDecline, setTaskToDecline] = useState<Task | null>(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const [editForm, setEditForm] = useState({ title: '', description: '', location: '', address: '' });

  // KPIs States
  const [activeKpiFilter, setActiveKpiFilter] = useState<KpiStatus | 'all'>('all');

  // Tasks Queries
  const listFilters = useMemo(
    () => (activeFilter === 'all' ? undefined : { status: activeFilter }),
    [activeFilter],
  );

  const {
    data: listData,
    isLoading: isLoadingTasks,
    isError: isTasksError,
    refetch: refetchTasks,
    isFetching: isFetchingTasks,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTaskList(listFilters);

  const tasks = useMemo(() => flattenTaskPages(listData), [listData]);
  const { mutate: updateStatus, isPending: isDeclining } = useUpdateTaskStatus();
  const { mutate: updateTask, isPending: isSavingTask } = useUpdateTask();
  const { mutate: deleteTask, isPending: isDeletingTask } = useDeleteTask();
  const { goToTaskDetail, goToContinueTracking } = useTaskNavigation();

  // KPIs Queries
  const kpiFilters = useMemo(
    () => (activeKpiFilter === 'all' ? undefined : { status: activeKpiFilter }),
    [activeKpiFilter],
  );

  const {
    data: kpis = [],
    isLoading: isLoadingKpis,
    isError: isKpisError,
    refetch: refetchKpis,
    isFetching: isFetchingKpis,
  } = useKpis(kpiFilters);

  const { mutate: updateKpiStatus, isPending: isUpdatingKpi } = useUpdateKpiStatus();

  // Handlers
  const handleTaskAction = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    if (taskHasMapLocation(task) && isResumeTrackingStatus(task.status)) {
      goToContinueTracking(task.id);
      return;
    }
    goToTaskDetail(task.id);
  };

  const handleDeclineConfirm = () => {
    if (!taskToDecline) return;
    updateStatus(
      { id: taskToDecline.id, status: 'cancelled' },
      {
        onSuccess: () => {
          toast.success('Task declined');
          setTaskToDecline(null);
          refetchTasks();
        },
        onError: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'Failed to decline task');
          setTaskToDecline(null);
        },
      },
    );
  };

  const handleKpiStatusTransition = (kpiId: number, status: KpiStatus) => {
    updateKpiStatus(
      { kpiId, status },
      {
        onSuccess: () => {
          toast.success(`KPI marked as ${status.replace('_', ' ')}`);
          refetchKpis();
        },
        onError: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'Failed to update KPI status');
        },
      },
    );
  };

  const activeTabConfig = FILTER_TABS.find((t) => t.key === activeFilter)!;
  const activeKpiTabConfig = KPI_FILTER_TABS.find((t) => t.key === activeKpiFilter)!;

  return (
    <div className="flex flex-col flex-1 bg-[#0A1D25] min-h-screen">
      <header className="flex items-center gap-3 px-5 py-4 mt-2">
        <button
          onClick={() => router.back()}
          className="flex h-10 w-10 items-center justify-center text-white"
        >
          <ArrowLeft size={24} />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-sans font-semibold text-xl text-white">Operations</h2>
          <p className="font-sans text-[11px] text-white/40 mt-0.5">Tasks and targets assigned to you</p>
        </div>
        <div className="min-w-[28px] h-7 rounded-full bg-[#75ADAF]/20 flex items-center justify-center px-2.5">
          <span className="font-sans font-bold text-xs text-[#75ADAF]">
            {activeSubTab === 'tasks' ? tasks.length : kpis.length}
            {activeSubTab === 'tasks' && hasNextPage ? '+' : ''}
          </span>
        </div>
      </header>

      {/* Segment Selector for Operations Tabs */}
      <div className="flex bg-[#0B3343]/50 p-1 rounded-full mx-5 mb-4 border border-white/5">
        <button
          onClick={() => setActiveSubTab('tasks')}
          className={`flex-1 py-2 text-center text-xs font-semibold rounded-full transition-all ${
            activeSubTab === 'tasks'
              ? 'bg-[#75ADAF] text-white shadow-md'
              : 'text-[#8F9098] hover:text-white'
          }`}
        >
          Tasks
        </button>
        <button
          onClick={() => setActiveSubTab('kpis')}
          className={`flex-1 py-2 text-center text-xs font-semibold rounded-full transition-all ${
            activeSubTab === 'kpis'
              ? 'bg-[#75ADAF] text-white shadow-md'
              : 'text-[#8F9098] hover:text-white'
          }`}
        >
          KPIs
        </button>
      </div>

      {activeSubTab === 'tasks' ? (
        <>
          {/* Tasks Filters */}
          <div className="flex overflow-x-auto scrollbar-none gap-2 px-5 py-2">
            {FILTER_TABS.map((tab) => {
              const isActive = activeFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key)}
                  className={`flex items-center gap-1.5 py-2 px-3.5 rounded-full border transition-all text-xs font-semibold whitespace-nowrap outline-none focus:outline-none ${
                    isActive
                      ? 'border-transparent text-white'
                      : 'border-white/12 text-[#8F9098] hover:text-white'
                  }`}
                  style={{ backgroundColor: isActive ? tab.color : 'transparent' }}
                >
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 px-5 pt-4 pb-2">
            <div className="w-1 h-4.5 rounded" style={{ backgroundColor: activeTabConfig.color }} />
            <h3 className="font-sans font-semibold text-sm text-white">
              {activeTabConfig.label}{' '}
              <span className="font-bold ml-1.5" style={{ color: activeTabConfig.color }}>
                {tasks.length}
                {hasNextPage ? '+' : ''}
              </span>
            </h3>
            {isFetchingTasks && !isLoadingTasks && (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#75ADAF] border-t-transparent" />
            )}
          </div>

          <div className="flex-1 px-5 pb-6 overflow-y-auto">
            {isLoadingTasks ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
              </div>
            ) : isTasksError ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-4 bg-white/[0.03] border border-white/5 rounded-2xl">
                <AlertCircle className="text-[#FD6046]" size={28} />
                <h4 className="font-sans font-semibold text-sm text-white">Failed to load tasks</h4>
                <p className="font-sans text-xs text-[#8F9098]">Please check your connection and try again.</p>
                <button
                  onClick={() => refetchTasks()}
                  className="px-5 py-2 rounded-full bg-[#75ADAF]/20 text-[#75ADAF] text-xs font-semibold"
                >
                  Retry
                </button>
              </div>
            ) : tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-4 text-2xl font-bold font-sans"
                  style={{ backgroundColor: `${activeTabConfig.color}33`, color: activeTabConfig.color }}
                >
                  0
                </div>
                <h4 className="font-sans font-semibold text-lg text-white mb-1">
                  No {activeTabConfig.label}
                </h4>
                <p className="font-sans text-xs text-[#8F9098] leading-relaxed max-w-[220px]">
                  {activeFilter === 'all'
                    ? 'You have no assigned tasks yet.'
                    : `You have no ${activeTabConfig.label.toLowerCase()} right now.`}
                </p>
              </div>
            ) : (
              <div>
                {tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onPress={() =>
                      isResumeTrackingStatus(task.status) && taskHasMapLocation(task)
                        ? goToContinueTracking(task.id)
                        : goToTaskDetail(task.id)
                    }
                    onPrimaryAction={(e) => handleTaskAction(task, e)}
                    onDecline={(e) => {
                      e.stopPropagation();
                      setTaskToDecline(task);
                    }}
                    onEdit={(e) => {
                      e.stopPropagation();
                      setTaskToEdit(task);
                      setEditForm({
                        title: task.title ?? '',
                        description: task.description ?? '',
                        location: task.location ?? '',
                        address: task.address ?? '',
                      });
                    }}
                    onDelete={(e) => {
                      e.stopPropagation();
                      setTaskToDelete(task);
                    }}
                  />
                ))}

                {hasNextPage && (
                  <div className="py-4 text-center">
                    <button
                      onClick={() => fetchNextPage()}
                      disabled={isFetchingNextPage}
                      className="w-full h-10 rounded-xl border border-white/12 text-[#75ADAF] font-semibold text-xs transition-colors hover:bg-[#75ADAF]/10 disabled:opacity-50 active:scale-[0.98]"
                    >
                      {isFetchingNextPage ? 'Loading more...' : 'Load more tasks'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* KPIs Filters */}
          <div className="flex overflow-x-auto scrollbar-none gap-2 px-5 py-2">
            {KPI_FILTER_TABS.map((tab) => {
              const isActive = activeKpiFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveKpiFilter(tab.key)}
                  className={`flex items-center gap-1.5 py-2 px-3.5 rounded-full border transition-all text-xs font-semibold whitespace-nowrap outline-none focus:outline-none ${
                    isActive
                      ? 'border-transparent text-white'
                      : 'border-white/12 text-[#8F9098] hover:text-white'
                  }`}
                  style={{ backgroundColor: isActive ? tab.color : 'transparent' }}
                >
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 px-5 pt-4 pb-2">
            <div className="w-1 h-4.5 rounded" style={{ backgroundColor: activeKpiTabConfig.color }} />
            <h3 className="font-sans font-semibold text-sm text-white">
              {activeKpiTabConfig.label}{' '}
              <span className="font-bold ml-1.5" style={{ color: activeKpiTabConfig.color }}>
                {kpis.length}
              </span>
            </h3>
            {isFetchingKpis && !isLoadingKpis && (
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#75ADAF] border-t-transparent" />
            )}
          </div>

          <div className="flex-1 px-5 pb-6 overflow-y-auto">
            {isLoadingKpis ? (
              <div className="flex flex-col items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
              </div>
            ) : isKpisError ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-4 bg-white/[0.03] border border-white/5 rounded-2xl">
                <AlertCircle className="text-[#FD6046]" size={28} />
                <h4 className="font-sans font-semibold text-sm text-white">Failed to load KPIs</h4>
                <p className="font-sans text-xs text-[#8F9098]">Please check your connection and try again.</p>
                <button
                  onClick={() => refetchKpis()}
                  className="px-5 py-2 rounded-full bg-[#75ADAF]/20 text-[#75ADAF] text-xs font-semibold"
                >
                  Retry
                </button>
              </div>
            ) : kpis.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-4 text-2xl font-bold font-sans"
                  style={{ backgroundColor: `${activeKpiTabConfig.color}33`, color: activeKpiTabConfig.color }}
                >
                  0
                </div>
                <h4 className="font-sans font-semibold text-lg text-white mb-1">
                  No {activeKpiTabConfig.label}
                </h4>
                <p className="font-sans text-xs text-[#8F9098] leading-relaxed max-w-[220px]">
                  {activeKpiFilter === 'all'
                    ? 'You have no assigned KPIs yet.'
                    : `You have no ${activeKpiTabConfig.label.toLowerCase()} KPIs right now.`}
                </p>
              </div>
            ) : (
              <div>
                {kpis.map((kpi) => (
                  <KpiCard
                    key={kpi.id}
                    kpi={kpi}
                    onStart={() => handleKpiStatusTransition(kpi.id, 'in_progress')}
                    onComplete={() => handleKpiStatusTransition(kpi.id, 'completed')}
                    onCancel={() => handleKpiStatusTransition(kpi.id, 'cancelled')}
                    isUpdating={isUpdatingKpi}
                  />
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <AnimatePresence>
        {taskToDecline && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/65 px-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0B1E26] p-6 text-center shadow-2xl"
            >
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#FD6046]/15">
                <AlertCircle className="text-[#FD6046]" size={28} />
              </div>

              <h3 className="mb-2 text-lg font-bold text-white font-sans">Decline Task</h3>
              <p className="mb-6 text-xs leading-relaxed text-[#8F9098] font-sans">
                Are you sure you want to decline <br />
                <span className="font-semibold text-white font-sans">&quot;{taskToDecline.title}&quot;</span>?
                <br />This action cannot be undone.
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setTaskToDecline(null)}
                  disabled={isDeclining}
                  className="flex-1 h-11 rounded-full border border-white/15 text-white font-medium text-xs bg-transparent transition-colors hover:bg-white/5 active:scale-95"
                >
                  Keep Task
                </button>
                <button
                  onClick={handleDeclineConfirm}
                  disabled={isDeclining}
                  className="flex-1 h-11 rounded-full bg-[#FD6046] hover:bg-[#E0533C] text-white font-semibold text-xs flex items-center justify-center transition-colors active:scale-95"
                >
                  {isDeclining ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    'Decline'
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Floating Action Button for Task Creation */}
      {activeSubTab === 'tasks' && (
        <button
          onClick={() => setIsCreateOpen(true)}
          className="fixed bottom-28 right-6 z-[100] flex h-14 w-14 items-center justify-center rounded-full bg-[#75ADAF] hover:bg-[#85bec0] text-white shadow-[0px_4px_10px_0px_rgba(117,173,175,0.4)] transition-transform active:scale-95 cursor-pointer focus:outline-none"
        >
          <Plus size={24} />
        </button>
      )}

      <CreateTaskModal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          refetchTasks();
        }}
      />
      <AnimatePresence>
        {taskToEdit && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/65 px-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0B1E26] p-5 text-white"
            >
              <h3 className="mb-4 text-lg font-bold font-sans">Edit Task</h3>
              <div className="space-y-3">
                <input className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm" value={editForm.title} onChange={(e) => setEditForm((p) => ({ ...p, title: e.target.value }))} placeholder="Task title" />
                <textarea className="w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm min-h-20" value={editForm.description} onChange={(e) => setEditForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description" />
                <input className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm" value={editForm.location} onChange={(e) => setEditForm((p) => ({ ...p, location: e.target.value }))} placeholder="Location" />
                <input className="w-full h-10 rounded-xl bg-white/5 border border-white/10 px-3 text-sm" value={editForm.address} onChange={(e) => setEditForm((p) => ({ ...p, address: e.target.value }))} placeholder="Address" />
              </div>
              <div className="mt-5 flex gap-3">
                <button className="flex-1 h-10 rounded-full border border-white/15 text-xs font-semibold" onClick={() => setTaskToEdit(null)}>Cancel</button>
                <button
                  className="flex-1 h-10 rounded-full bg-[#75ADAF] text-xs font-semibold"
                  disabled={isSavingTask}
                  onClick={() => {
                    updateTask(
                      {
                        id: taskToEdit.id,
                        title: editForm.title,
                        description: editForm.description || undefined,
                        location: editForm.location || undefined,
                        address: editForm.address || undefined,
                      },
                      {
                        onSuccess: () => {
                          toast.success('Task updated');
                          setTaskToEdit(null);
                        },
                        onError: (err: unknown) => {
                          toast.error(err instanceof Error ? err.message : 'Failed to update task');
                        },
                      },
                    );
                  }}
                >
                  {isSavingTask ? 'Saving...' : 'Save'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {taskToDelete && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/65 px-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#0B1E26] p-6 text-center"
            >
              <h3 className="mb-2 text-lg font-bold text-white font-sans">Delete Task</h3>
              <p className="mb-6 text-xs text-[#8F9098]">Delete &quot;{taskToDelete.title}&quot; permanently?</p>
              <div className="flex gap-3">
                <button className="flex-1 h-11 rounded-full border border-white/15 text-white text-xs" onClick={() => setTaskToDelete(null)}>Cancel</button>
                <button
                  className="flex-1 h-11 rounded-full bg-[#FD6046] text-white text-xs font-semibold"
                  disabled={isDeletingTask}
                  onClick={() => {
                    deleteTask(taskToDelete.id, {
                      onSuccess: () => {
                        toast.success('Task deleted');
                        setTaskToDelete(null);
                      },
                      onError: (err: unknown) => {
                        toast.error(err instanceof Error ? err.message : 'Failed to delete task');
                      },
                    });
                  }}
                >
                  {isDeletingTask ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
