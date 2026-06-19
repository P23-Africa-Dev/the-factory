'use client';

import React from 'react';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, MapPin, Calendar, User, ShieldAlert } from 'lucide-react';

import { useTask, useTaskNavigation, isResumeTrackingStatus } from '@/features/tasks';
import { useTrackingStore } from '@/store/tracking';

const STATUS_COLOR: Record<string, string> = {
  pending: '#FD6046',
  in_progress: '#75ADAF',
  paused: '#F5A623',
  resumed: '#75ADAF',
  completed: '#4CAF50',
  cancelled: '#8F9098',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  paused: 'Paused',
  resumed: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const PRIORITY_COLOR: Record<string, string> = {
  low: '#4CAF50',
  medium: '#FF9800',
  high: '#FD6046',
  urgent: '#E53935',
};

function MetaRow({ label, value, icon: Icon }: { label: string; value: string; icon: React.ComponentType<{ className?: string; size?: number }> }) {
  return (
    <div className="flex gap-3 text-xs font-sans items-start">
      <div className="flex items-center text-[#8F9098] gap-1.5 w-24 flex-shrink-0 font-semibold">
        <Icon size={14} className="text-[#8F9098]" />
        <span>{label}</span>
      </div>
      <span className="text-white flex-1 leading-relaxed">{value}</span>
    </div>
  );
}

function Section({ title, body }: { title: string; body: string }) {
  return (
    <div className="mb-5 font-sans">
      <h4 className="text-xs font-bold text-[#75ADAF] mb-1.5 uppercase tracking-wider">
        {title}
      </h4>
      <p className="text-sm text-[#D0D0D0] leading-relaxed">{body}</p>
    </div>
  );
}

export default function TaskDetailPage() {
  const router = useRouter();
  const routeParams = useParams();
  const id = (routeParams?.id as string) || '';

  const { data: task, isLoading, error } = useTask(id);
  const { goToTracking, goToContinueTracking, goToTaskComplete } = useTaskNavigation();
  const liveTask = useTrackingStore((s) => s.liveTaskMap[Number(id)]);
  const hasArrived = liveTask?.status === 'arrived' || liveTask?.arrivedAt != null;

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen bg-[#0A1D25]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-[#0A1D25] gap-3 px-6 text-center">
        <ShieldAlert size={48} className="text-[#FD6046]" />
        <h4 className="text-lg font-bold text-white font-sans">Unable to load task</h4>
        <p className="text-xs text-[#8F9098] font-sans max-w-[200px]">Check your connection and try again.</p>
        <button
          onClick={() => router.back()}
          className="mt-4 px-6 py-2 rounded-full border border-white/10 text-white font-semibold text-xs transition-colors hover:bg-white/5"
        >
          Go Back
        </button>
      </div>
    );
  }

  const statusColor = STATUS_COLOR[task.status] || '#8F9098';
  const isActive = isResumeTrackingStatus(task.status);
  const isPending = task.status === 'pending';
  const _isDone = task.status === 'completed' || task.status === 'cancelled';

  return (
    <div className="flex flex-col flex-1 bg-[#0A1D25] min-h-screen">
      {/* Header */}
      <header className="flex items-center gap-3 px-5 py-4 mt-2">
        <button
          onClick={() => router.back()}
          className="flex h-10 w-10 items-center justify-center text-white"
        >
          <ArrowLeft size={24} />
        </button>
        <h2 className="flex-1 font-sans font-semibold text-xl text-white">
          Task Details
        </h2>
      </header>

      {/* Main content scroll container */}
      <div className="flex-1 px-6 pb-8 overflow-y-auto">
        {/* Status Pill */}
        <div
          className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 mb-4 text-xs font-semibold font-sans tracking-wide"
          style={{ backgroundColor: `${statusColor}22` }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: statusColor }} />
          <span style={{ color: statusColor }}>{STATUS_LABEL[task.status]}</span>
        </div>

        {/* Title */}
        <h3 className="font-sans font-bold text-xl text-white mb-2.5 leading-snug">
          {task.title}
        </h3>

        {/* Priority */}
        {task.priority && (
          <div
            className="inline-flex rounded-md px-2.5 py-1 mb-5 text-[9px] font-bold tracking-wider font-sans"
            style={{
              backgroundColor: `${PRIORITY_COLOR[task.priority]}22`,
              color: PRIORITY_COLOR[task.priority],
            }}
          >
            {task.priority.toUpperCase()} PRIORITY
          </div>
        )}

        {/* Meta Card */}
        <div className="bg-[#0B3343]/70 rounded-2xl border-[0.5px] border-white/8 p-4 flex flex-col gap-3.5 mb-5 shadow-sm">
          <MetaRow label="Location" value={task.address} icon={MapPin} />
          {task.dueDate && (
            <MetaRow
              label="Due Date"
              value={new Date(task.dueDate).toLocaleDateString('en-GB', {
                weekday: 'short',
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
              icon={Calendar}
            />
          )}
          <MetaRow
            label="Assigned At"
            value={new Date(task.assignedAt).toLocaleDateString('en-GB', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
            icon={Calendar}
          />
          {task.assignedBy && <MetaRow label="Assigned By" value={task.assignedBy} icon={User} />}
        </div>

        {/* Description / Instructions */}
        {task.description && <Section title="Description" body={task.description} />}
        {task.instructions && <Section title="Instructions" body={task.instructions} />}

        <div className="h-[0.5px] bg-white/6 my-6" />

        {/* Actions button group */}
        <div className="flex flex-col gap-3">
          {isPending && (
            <button
              onClick={() => goToTracking(task.id)}
              className="w-full h-[51px] rounded-[30px] bg-[#75ADAF] hover:bg-[#66989A] text-white font-bold text-sm transition-all duration-200 active:scale-95 shadow-md flex items-center justify-center"
            >
              Start Tracking
            </button>
          )}

          {isActive && (
            <>
              <button
                onClick={() => goToContinueTracking(task.id)}
                className="w-full h-[51px] rounded-[30px] bg-[#75ADAF] hover:bg-[#66989A] text-white font-bold text-sm transition-all duration-200 active:scale-95 shadow-md flex items-center justify-center"
              >
                Continue Tracking
              </button>
              {hasArrived && (
                <button
                  onClick={() => goToTaskComplete(task.id)}
                  className="w-full h-[46px] rounded-[30px] border border-white/15 text-[#8F9098] hover:text-white font-medium text-xs bg-transparent transition-all duration-200 active:scale-95 flex items-center justify-center"
                >
                  Complete Task (proof required)
                </button>
              )}
            </>
          )}

          {task.status === 'completed' && (
            <div className="bg-[#4CAF50]/10 border-l-[3px] border-[#4CAF50] rounded-xl p-4 flex items-center justify-center">
              <span className="font-sans font-medium text-xs text-white">
                This task has been completed.
              </span>
            </div>
          )}

          {task.status === 'cancelled' && (
            <div className="bg-[#8F9098]/10 border-l-[3px] border-[#8F9098] rounded-xl p-4 flex items-center justify-center">
              <span className="font-sans font-medium text-xs text-white">
                This task has been cancelled.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
