'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, Calendar, User, ChevronRight, ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth';
import { getActiveCompanyContext } from '@/lib/company-context';
import { useTaskDetail, useUpdateTaskStatus } from '@/hooks/use-tasks';
import { formatTaskLocationLabel, hasTrackableTaskLocation } from '@/lib/tasks/location';

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-100 text-red-600',
  medium: 'bg-amber-100 text-amber-600',
  low: 'bg-green-100 text-green-600',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-600',
  in_progress: 'bg-blue-100 text-blue-600',
  completed: 'bg-teal-100 text-teal-600',
  cancelled: 'bg-gray-100 text-gray-500',
};

export default function AgentTaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const taskId = Number(id);
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);
  const { data: task, isLoading } = useTaskDetail(taskId, companyId ?? undefined);
  const { mutate: updateStatus, isPending: isUpdatingStatus } = useUpdateTaskStatus({
    onSuccess: () => {
      toast.success('Task updated');
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-dash-teal border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-[#f8f9fb] flex flex-col items-center justify-center gap-3">
        <ClipboardList size={40} className="text-gray-300" />
        <p className="text-gray-400 text-[14px]">Task not found.</p>
        <button onClick={() => router.back()} className="text-dash-teal text-[13px] font-semibold">
          Go back
        </button>
      </div>
    );
  }

  const hasMapLocation = hasTrackableTaskLocation(task);
  const locationLabel = formatTaskLocationLabel(task.location, task.address);
  const isPending = task.status === 'pending';
  const isInProgress = task.status === 'in_progress';
  const isCompleted = task.status === 'completed';
  const isCancelled = task.status === 'cancelled';

  const updateTaskStatus = (status: 'in_progress' | 'completed' | 'cancelled') => {
    updateStatus({
      taskId,
      payload: { company_id: companyId ?? undefined, status },
    });
  };

  return (
    <div className="min-h-screen bg-[#f8f9fb] pb-32">
      <div className="bg-white border-b border-gray-100 px-5 pt-5 pb-4 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center"
        >
          <ArrowLeft size={18} className="text-gray-600" />
        </button>
        <div>
          <h1 className="text-[16px] font-bold text-dash-dark leading-tight line-clamp-1">
            {task.title}
          </h1>
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${STATUS_COLORS[task.status] ?? ''}`}>
              {task.status.replace('_', ' ')}
            </span>
            {task.priority && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${PRIORITY_COLORS[task.priority] ?? ''}`}>
                {task.priority}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="px-4 py-5 space-y-4">
        {task.description && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-2">Description</p>
            <p className="text-[14px] text-dash-dark leading-relaxed">{task.description}</p>
          </div>
        )}

        <div className="bg-white rounded-2xl p-4 border border-gray-100 space-y-3">
          {task.due_date && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Calendar size={14} className="text-blue-500" />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 font-semibold">Due Date</p>
                <p className="text-[13px] text-dash-dark font-semibold">
                  {new Date(task.due_date).toLocaleDateString('en-GB', {
                    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
                  })}
                </p>
              </div>
            </div>
          )}

          {task.creator && (
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-purple-50 flex items-center justify-center shrink-0">
                <User size={14} className="text-purple-500" />
              </div>
              <div>
                <p className="text-[11px] text-gray-400 font-semibold">Assigned By</p>
                <p className="text-[13px] text-dash-dark font-semibold">{task.creator.name}</p>
              </div>
            </div>
          )}

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-rose-50 flex items-center justify-center shrink-0">
              <MapPin size={14} className="text-rose-500" />
            </div>
            <div>
              <p className="text-[11px] text-gray-400 font-semibold">Location</p>
              <p className="text-[13px] text-dash-dark font-semibold">{locationLabel}</p>
              {!hasMapLocation && (
                <p className="text-[11px] text-gray-400 mt-1">
                  No map destination. Use status actions below instead of map tracking.
                </p>
              )}
            </div>
          </div>
        </div>

        {task.required_actions && task.required_actions.length > 0 && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-3">Required Actions</p>
            <ul className="space-y-2">
              {task.required_actions.map((action, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-dash-dark">
                  <span className="w-5 h-5 rounded-full bg-dash-teal/10 flex items-center justify-center text-[10px] font-bold text-dash-teal shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  {action}
                </li>
              ))}
            </ul>
          </div>
        )}

        {task.proofs && task.proofs.length > 0 && (
          <div className="bg-white rounded-2xl p-4 border border-gray-100">
            <p className="text-[12px] font-bold text-gray-400 uppercase tracking-wide mb-3">Submitted Proofs</p>
            <div className="grid grid-cols-3 gap-2">
              {task.proofs.map((proof) =>
                proof.file_url ? (
                  <a
                    key={proof.id}
                    href={proof.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="aspect-square rounded-xl overflow-hidden bg-gray-100 block"
                  >
                    <img src={proof.file_url} className="w-full h-full object-cover" alt="Proof" />
                  </a>
                ) : (
                  <div key={proof.id} className="aspect-square rounded-xl bg-gray-100 flex items-center justify-center">
                    <ClipboardList size={18} className="text-gray-300" />
                  </div>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {(isPending || isInProgress) && !isCompleted && !isCancelled && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-5 py-4 pb-safe space-y-2">
          {isPending && hasMapLocation && (
            <button
              onClick={() => router.push(`/agent/tasks/${taskId}/tracking`)}
              className="w-full flex items-center justify-center gap-2 py-4 bg-[#7EB5AE] text-white rounded-2xl text-[15px] font-bold shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90 transition-all"
            >
              Start Tracking
              <ChevronRight size={18} />
            </button>
          )}

          {isPending && !hasMapLocation && (
            <>
              <button
                onClick={() => updateTaskStatus('in_progress')}
                disabled={isUpdatingStatus}
                className="w-full flex items-center justify-center gap-2 py-4 bg-[#7EB5AE] text-white rounded-2xl text-[15px] font-bold shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90 transition-all disabled:opacity-60"
              >
                Start Task
              </button>
              <button
                onClick={() => updateTaskStatus('cancelled')}
                disabled={isUpdatingStatus}
                className="w-full py-3 rounded-2xl border border-red-200 text-red-600 text-[14px] font-semibold disabled:opacity-60"
              >
                Cancel Task
              </button>
            </>
          )}

          {isInProgress && hasMapLocation && (
            <button
              onClick={() => router.push(`/agent/tasks/${taskId}/tracking`)}
              className="w-full flex items-center justify-center gap-2 py-4 bg-[#7EB5AE] text-white rounded-2xl text-[15px] font-bold shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90 transition-all"
            >
              Continue Tracking
              <ChevronRight size={18} />
            </button>
          )}

          {isInProgress && !hasMapLocation && (
            <>
              <button
                onClick={() => updateTaskStatus('completed')}
                disabled={isUpdatingStatus}
                className="w-full flex items-center justify-center gap-2 py-4 bg-dash-teal text-white rounded-2xl text-[15px] font-bold shadow-lg shadow-dash-teal/20 hover:opacity-90 transition-all disabled:opacity-60"
              >
                Mark Complete
              </button>
              <button
                onClick={() => updateTaskStatus('cancelled')}
                disabled={isUpdatingStatus}
                className="w-full py-3 rounded-2xl border border-red-200 text-red-600 text-[14px] font-semibold disabled:opacity-60"
              >
                Cancel Task
              </button>
            </>
          )}
        </div>
      )}

      {isCompleted && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-5 py-4 pb-safe">
          <div className="w-full flex items-center justify-center gap-2 py-4 bg-dash-teal/10 text-dash-teal rounded-2xl text-[15px] font-bold border border-dash-teal/20">
            Task Completed
          </div>
        </div>
      )}

      {isCancelled && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 px-5 py-4 pb-safe">
          <div className="w-full flex items-center justify-center gap-2 py-4 bg-gray-100 text-gray-500 rounded-2xl text-[15px] font-bold border border-gray-200">
            Task Cancelled
          </div>
        </div>
      )}
    </div>
  );
}
