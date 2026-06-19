'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, MapPin, AlertCircle } from 'lucide-react';

import {
  useTaskList,
  useUpdateTaskStatus,
  useTaskNavigation,
  isResumeTrackingStatus,
  flattenTaskPages,
  type Task,
} from '@/features/tasks';
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
}: {
  task: Task;
  onPrimaryAction: (e: React.MouseEvent) => void;
  onDecline: (e: React.MouseEvent) => void;
  onPress: () => void;
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
          <span
            className="px-2.5 py-1 rounded-full text-[10px] font-semibold flex-shrink-0 font-sans"
            style={{ backgroundColor: `${statusColor}22`, color: statusColor }}
          >
            {STATUS_LABEL[task.status] ?? task.status}
          </span>
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

export default function TasksPage() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState<FilterKey>('pending');
  const [taskToDecline, setTaskToDecline] = useState<Task | null>(null);

  const listFilters = useMemo(
    () => (activeFilter === 'all' ? undefined : { status: activeFilter }),
    [activeFilter],
  );

  const {
    data: listData,
    isLoading,
    isError,
    refetch,
    isFetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useTaskList(listFilters);

  const tasks = useMemo(() => flattenTaskPages(listData), [listData]);

  const { mutate: updateStatus, isPending: isDeclining } = useUpdateTaskStatus();
  const { goToTaskDetail, goToTracking, goToContinueTracking } = useTaskNavigation();

  const handleTaskAction = (task: Task, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isResumeTrackingStatus(task.status)) {
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
          refetch();
        },
        onError: (err: unknown) => {
          toast.error(err instanceof Error ? err.message : 'Failed to decline task');
          setTaskToDecline(null);
        },
      },
    );
  };

  const activeTabConfig = FILTER_TABS.find((t) => t.key === activeFilter)!;

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
          <h2 className="font-sans font-semibold text-xl text-white">My Tasks</h2>
          <p className="font-sans text-[11px] text-white/40 mt-0.5">Tasks assigned to you</p>
        </div>
        <div className="min-w-[28px] h-7 rounded-full bg-[#75ADAF]/20 flex items-center justify-center px-2.5">
          <span className="font-sans font-bold text-xs text-[#75ADAF]">
            {tasks.length}
            {hasNextPage ? '+' : ''}
          </span>
        </div>
      </header>

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
        {isFetching && !isLoading && (
          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#75ADAF] border-t-transparent" />
        )}
      </div>

      <div className="flex-1 px-5 pb-6 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-4 bg-white/[0.03] border border-white/5 rounded-2xl">
            <AlertCircle className="text-[#FD6046]" size={28} />
            <h4 className="font-sans font-semibold text-sm text-white">Failed to load tasks</h4>
            <p className="font-sans text-xs text-[#8F9098]">Please check your connection and try again.</p>
            <button
              onClick={() => refetch()}
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
                  isResumeTrackingStatus(task.status)
                    ? goToContinueTracking(task.id)
                    : goToTaskDetail(task.id)
                }
                onPrimaryAction={(e) => handleTaskAction(task, e)}
                onDecline={(e) => {
                  e.stopPropagation();
                  setTaskToDecline(task);
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
    </div>
  );
}
