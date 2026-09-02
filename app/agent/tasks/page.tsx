'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ClipboardList, Clock, CheckCircle2, ChevronRight, AlertCircle, Plus } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { getActiveCompanyContext } from '@/lib/company-context';
import { useAgentTasks } from '@/hooks/use-tracking';
import type { ApiTaskStatus } from '@/lib/api/tasks';
import { hasTrackableTaskLocation } from '@/lib/tasks/location';
import { CreateTaskModal } from '@/components/operations/create-task-modal';

type Tab = 'pending' | 'in_progress' | 'completed';

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: 'pending', label: 'Pending', icon: <Clock size={14} /> },
  { id: 'in_progress', label: 'In Progress', icon: <ClipboardList size={14} /> },
  { id: 'completed', label: 'Completed', icon: <CheckCircle2 size={14} /> },
];

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-600',
  medium: 'bg-amber-100 text-amber-600',
  low: 'bg-green-100 text-green-600',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-600',
  in_progress: 'bg-blue-100 text-blue-600',
  completed: 'bg-teal-100 text-teal-600',
};

function isOverdue(dueDate?: string): boolean {
  if (!dueDate) return false;
  return new Date(dueDate) < new Date();
}

export default function AgentTasksPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);
  const [activeTab, setActiveTab] = useState<Tab>('pending');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useAgentTasks({
    company_id: companyId ?? undefined,
    status: activeTab as ApiTaskStatus,
  });

  const tasks = data?.tasks ?? [];

  return (
    <div className="min-h-screen bg-[#f8f9fb]">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-5 pt-6 pb-4 flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-bold text-dash-dark">My Tasks</h1>
          <p className="text-[13px] text-gray-400 mt-0.5">Tasks assigned to you</p>
        </div>
        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-[#094B5C] hover:bg-[#094B5C]/90 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
        >
          <Plus size={14} />
          Create Daily Task
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 px-5">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-[13px] font-semibold border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-dash-teal text-dash-teal'
                  : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <div className="px-4 py-4 space-y-3">
        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-4 animate-pulse h-24" />
            ))}
          </div>
        )}

        {isError && (
          <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl p-4">
            <AlertCircle size={18} className="text-red-400 shrink-0" />
            <p className="text-[13px] text-red-600">Failed to load tasks. Please try again.</p>
          </div>
        )}

        {!isLoading && !isError && tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <ClipboardList size={28} className="text-gray-300" />
            </div>
            <p className="text-[15px] font-semibold text-gray-400">No {activeTab.replace('_', ' ')} tasks</p>
          </div>
        )}

        {tasks.map((task) => {
          const overdue = isOverdue(task.due_date);
          const hasMap = hasTrackableTaskLocation(task);
          const action =
            task.status === 'pending'
              ? hasMap ? 'Start' : 'Open'
              : task.status === 'in_progress'
              ? hasMap ? 'Continue' : 'Manage'
              : 'View';
          const actionColor =
            task.status === 'pending'
              ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
              : task.status === 'in_progress'
              ? 'bg-blue-50 text-blue-600 border border-blue-200'
              : 'bg-gray-100 text-gray-500';

          return (
            <div
              key={task.id}
              className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[task.status] ?? 'bg-gray-100 text-gray-500'}`}>
                    {task.status.replace('_', ' ')}
                  </span>
                  {task.priority && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${PRIORITY_COLORS[task.priority] ?? ''}`}>
                      {task.priority}
                    </span>
                  )}
                  {overdue && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-500">
                      Overdue
                    </span>
                  )}
                </div>

                <p className="text-[14px] font-bold text-dash-dark leading-snug truncate">
                  {task.title}
                </p>

                {(task.address ?? task.location) && (
                  <p className="text-[12px] text-gray-400 mt-0.5 truncate">
                    {task.address ?? task.location}
                  </p>
                )}

                {task.due_date && (
                  <p className={`text-[11px] mt-1 ${overdue ? 'text-red-400 font-semibold' : 'text-gray-400'}`}>
                    Due {new Date(task.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>

              <button
                onClick={() =>
                  router.push(
                    task.status === 'in_progress' && hasMap
                      ? `/agent/tasks/${task.id}/tracking`
                      : `/agent/tasks/${task.id}`
                  )
                }
                className={`shrink-0 px-3.5 py-2 rounded-xl text-[12px] font-bold flex items-center gap-1 ${actionColor}`}
              >
                {action}
                <ChevronRight size={13} />
              </button>
            </div>
          );
        })}
      </div>

      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => {
          setIsCreateModalOpen(false);
          refetch();
        }}
      />
    </div>
  );
}
