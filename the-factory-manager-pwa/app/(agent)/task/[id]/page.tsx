'use client';

import React, { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { format } from 'date-fns';
import {
  ChevronLeft,
  MapPin,
  Calendar,
  Flag,
  CheckCircle2,
  Play,
  Pause,
  Navigation,
  UserPlus,
  Trash2,
  Camera,
  ExternalLink,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import {
  useTask,
  useUpdateTaskStatus,
  useTaskAssignees,
  useAssignTask,
  useDeleteTask,
  useTaskRoute,
  formatTaskLocationLabel,
  taskHasMapLocation,
} from '@/features/tasks';
import { TaskComments } from '@/features/tasks/components/TaskComments';
import { toast } from '@/lib/toast';

function getStatusBadge(status: string): { bg: string; text: string; label: string } {
  switch (status) {
    case 'completed':
      return { bg: 'rgba(76,175,80,0.2)', text: '#4CAF50', label: 'Completed' };
    case 'in_progress':
    case 'resumed':
      return { bg: 'rgba(117,173,175,0.2)', text: '#75ADAF', label: 'In Progress' };
    case 'paused':
      return { bg: 'rgba(246,196,112,0.2)', text: '#F6C470', label: 'Paused' };
    case 'cancelled':
      return { bg: 'rgba(231,76,60,0.2)', text: '#E74C3C', label: 'Cancelled' };
    default:
      return { bg: 'rgba(255,255,255,0.1)', text: 'rgba(255,255,255,0.7)', label: 'Pending' };
  }
}

export default function ManagerTaskDetailScreen() {
  const params = useParams();
  const router = useRouter();
  const id = (params?.id as string) || '';

  const { data: task, isLoading } = useTask(id);
  const { data: assignees = [] } = useTaskAssignees();
  const { data: routeData } = useTaskRoute(id, Boolean(id));
  const updateStatus = useUpdateTaskStatus();
  const assignTaskMutation = useAssignTask();
  const deleteTaskMutation = useDeleteTask();

  // Reassign modal state
  const [reassignOpen, setReassignOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [previewProofUrl, setPreviewProofUrl] = useState<string | null>(null);

  const handleTrackOnMap = useCallback(() => {
    if (!task) return;
    const qs = new URLSearchParams({ taskId: task.id });
    if (task.assignedAgentId) qs.set('agentId', String(task.assignedAgentId));
    router.push(`/map?${qs.toString()}`);
  }, [task, router]);

  const handleStatusChange = useCallback(
    async (newStatus: 'pending' | 'in_progress' | 'paused' | 'completed' | 'cancelled') => {
      if (!task) return;
      try {
        await updateStatus.mutateAsync({ id: task.id, status: newStatus });
        toast.success(`Task status updated to ${newStatus.replace('_', ' ')}`);
      } catch {
        toast.error('Failed to update task status');
      }
    },
    [task, updateStatus],
  );

  const handleReassignSubmit = useCallback(async () => {
    if (!task || !selectedAgentId) return;
    try {
      await assignTaskMutation.mutateAsync({
        id: task.id,
        assigned_to: Number(selectedAgentId),
        assignee_ids: [Number(selectedAgentId)],
      });
      setReassignOpen(false);
    } catch {
      toast.error('Could not assign task');
    }
  }, [task, selectedAgentId, assignTaskMutation]);

  const handleDeleteTask = useCallback(async () => {
    if (!task) return;
    try {
      await deleteTaskMutation.mutateAsync(task.id);
      router.replace('/tasks');
    } catch {
      toast.error('Could not delete task');
    }
  }, [task, deleteTaskMutation, router]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center min-h-screen bg-[#0A1D25]">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
      </div>
    );
  }

  if (!task) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center min-h-screen bg-[#0A1D25] px-6 text-center">
        <p className="text-base font-bold text-white mb-2">Task not found</p>
        <button
          onClick={() => router.back()}
          className="px-5 py-2.5 rounded-full bg-[#75ADAF] text-[#0A1D25] text-xs font-bold"
        >
          Go Back
        </button>
      </div>
    );
  }

  const badge = getStatusBadge(task.status);
  const hasLocation = taskHasMapLocation(task);
  const proofs = task.proofs ?? [];
  const routePointsCount = Array.isArray((routeData as { points?: unknown[] })?.points)
    ? ((routeData as { points: unknown[] }).points.length)
    : 0;

  return (
    <div className="relative flex flex-col flex-1 min-h-screen bg-[#0A1D25] overflow-x-hidden pb-[120px] font-sans">
      <div className="relative z-10 flex flex-col flex-1 px-5 pt-4">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-5">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center text-white hover:bg-white/12 active:scale-95 transition-all"
          >
            <ChevronLeft size={20} />
          </button>
          <h1 className="text-base font-extrabold text-white">Task &amp; Proof Inspector</h1>
          <button
            onClick={() => void handleDeleteTask()}
            disabled={deleteTaskMutation.isPending}
            className="w-10 h-10 rounded-full bg-[#E74C3C]/15 flex items-center justify-center text-[#E74C3C] hover:bg-[#E74C3C]/25 active:scale-95 transition-all"
            title="Delete task"
          >
            <Trash2 size={16} />
          </button>
        </div>

        {/* Main details card */}
        <div className="bg-[#0B3343]/90 border border-white/10 rounded-3xl p-5 mb-4 shadow-lg">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <span
              className="px-3 py-1 rounded-full text-xs font-bold"
              style={{ backgroundColor: badge.bg, color: badge.text }}
            >
              {badge.label}
            </span>
            {task.priority && (
              <span className="flex items-center gap-1 text-xs font-bold text-[#FD6046] capitalize">
                <Flag size={12} />
                {task.priority} Priority
              </span>
            )}
          </div>

          <h2 className="text-lg font-extrabold text-white mb-2 leading-snug">{task.title}</h2>

          {task.description && (
            <p className="text-xs text-white/70 leading-relaxed mb-4 whitespace-pre-wrap">
              {task.description}
            </p>
          )}

          {task.instructions && (
            <div className="bg-white/5 rounded-2xl p-3.5 mb-4 border border-white/5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#75ADAF] block mb-1">
                Instructions
              </span>
              <p className="text-xs text-white/80 leading-relaxed">{task.instructions}</p>
            </div>
          )}

          <div className="space-y-2.5 pt-3 border-t border-white/8 text-xs text-white/65">
            <div className="flex items-start gap-2.5">
              <MapPin size={15} className="text-[#75ADAF] shrink-0 mt-0.5" />
              <span>{formatTaskLocationLabel(task)}</span>
            </div>
            {task.dueDate && (
              <div className="flex items-center gap-2.5">
                <Calendar size={15} className="text-[#75ADAF] shrink-0" />
                <span>Due {format(new Date(task.dueDate), 'EEE, MMM d, yyyy • h:mm a')}</span>
              </div>
            )}
            {routePointsCount > 0 && (
              <div className="flex items-center gap-2.5 text-[#75ADAF]">
                <Navigation size={15} className="shrink-0" />
                <span>{routePointsCount} live GPS route breadcrumbs recorded</span>
              </div>
            )}
          </div>
        </div>

        {/* ─── Assigned Agent & Fleet Map Card ─── */}
        <div className="bg-[#0B3343]/90 border border-white/10 rounded-3xl p-4 mb-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#75ADAF] block">
                Assigned Field Agent
              </span>
              <p className="text-sm font-bold text-white mt-0.5">
                {task.assigneeName ?? 'Unassigned'}
              </p>
              {task.assigneeEmail && (
                <p className="text-xs text-white/50">{task.assigneeEmail}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedAgentId(task.assignedAgentId ? String(task.assignedAgentId) : '');
                setReassignOpen(true);
              }}
              className="h-9 px-3.5 rounded-xl bg-[#75ADAF]/20 border border-[#75ADAF]/40 text-xs font-bold text-[#75ADAF] flex items-center gap-1.5 active:scale-95 transition-transform"
            >
              <UserPlus size={14} />
              <span>{task.assigneeName ? 'Reassign' : 'Assign'}</span>
            </button>
          </div>

          {(hasLocation || task.assignedAgentId) && (
            <button
              type="button"
              onClick={handleTrackOnMap}
              className="mt-3 w-full h-11 rounded-2xl bg-[#75ADAF] hover:bg-[#66989A] text-[#0A1D25] font-extrabold text-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
            >
              <Navigation size={15} />
              <span>Track Agent &amp; Destination on Fleet Map</span>
            </button>
          )}
        </div>

        {/* ─── Completion Proofs Gallery (Uploaded by Agent) ─── */}
        <div className="bg-[#0B3343]/90 border border-white/10 rounded-3xl p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Camera size={15} className="text-[#75ADAF]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Completion Proofs ({proofs.length})
              </h3>
            </div>
            {task.completedAt && (
              <span className="text-[10px] text-emerald-400 font-semibold">
                Completed {format(new Date(task.completedAt), 'MMM d, h:mm a')}
              </span>
            )}
          </div>

          {task.completionNotes && (
            <div className="rounded-xl bg-black/25 p-3 mb-3 text-xs text-white/80">
              <span className="text-[10px] font-bold uppercase text-[#75ADAF] block mb-0.5">
                Agent Completion Notes
              </span>
              {task.completionNotes}
            </div>
          )}

          {proofs.length === 0 ? (
            <p className="text-xs text-white/45 py-3 text-center">
              No completion proof photos uploaded for this task yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {proofs.map((proof) => (
                <div
                  key={proof.id}
                  onClick={() => proof.url && setPreviewProofUrl(proof.url)}
                  className="group relative rounded-2xl overflow-hidden border border-white/10 bg-black/30 cursor-pointer"
                >
                  {proof.url ? (
                    <img
                      src={proof.url}
                      alt={`Proof #${proof.id}`}
                      className="w-full h-32 object-cover group-hover:scale-105 transition-transform"
                    />
                  ) : (
                    <div className="w-full h-32 flex items-center justify-center text-xs text-white/40">
                      Proof #{proof.id}
                    </div>
                  )}
                  <div className="p-2 bg-[#0A1D25]/90 text-[10px] text-white/70">
                    {proof.notes && <p className="truncate font-semibold text-white">{proof.notes}</p>}
                    {proof.createdAt && (
                      <p className="text-white/45">
                        {format(new Date(proof.createdAt), 'MMM d, h:mm a')}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ─── Manager Status Controls ─── */}
        <div className="bg-[#0B3343]/90 border border-white/10 rounded-3xl p-4 mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-white/60 mb-3">
            Manager Status Override
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={task.status === 'in_progress' || updateStatus.isPending}
              onClick={() => void handleStatusChange('in_progress')}
              className="h-10 rounded-xl bg-[#75ADAF]/20 border border-[#75ADAF]/40 text-[#75ADAF] text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <Play size={14} />
              In Progress
            </button>
            <button
              type="button"
              disabled={task.status === 'paused' || updateStatus.isPending}
              onClick={() => void handleStatusChange('paused')}
              className="h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 text-amber-300 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <Pause size={14} />
              Pause
            </button>
            <button
              type="button"
              disabled={task.status === 'completed' || updateStatus.isPending}
              onClick={() => void handleStatusChange('completed')}
              className="h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              <CheckCircle2 size={14} />
              Mark Completed
            </button>
            <button
              type="button"
              disabled={task.status === 'cancelled' || updateStatus.isPending}
              onClick={() => void handleStatusChange('cancelled')}
              className="h-10 rounded-xl bg-red-500/15 border border-red-500/35 text-red-400 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
            >
              Cancel Task
            </button>
          </div>
        </div>

        {/* Task Comments */}
        <div className="mt-2">
          <TaskComments taskId={task.id} />
        </div>
      </div>

      {/* ─── Reassign Task Modal ─── */}
      <AnimatePresence>
        {reassignOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 px-5">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="w-full max-w-sm bg-[#0D252F] border border-white/10 rounded-3xl p-6"
            >
              <h3 className="text-base font-bold text-white mb-1">Assign / Reassign Task</h3>
              <p className="text-xs text-white/60 mb-4 truncate">{task.title}</p>

              <select
                value={selectedAgentId}
                onChange={(e) => setSelectedAgentId(e.target.value)}
                className="w-full h-11 rounded-xl bg-white/8 border border-white/12 px-3.5 text-sm text-white outline-none mb-5"
              >
                <option value="" className="bg-[#0D252F]">
                  Select an agent…
                </option>
                {assignees.map((a) => (
                  <option key={a.id} value={String(a.id)} className="bg-[#0D252F]">
                    {a.name} ({a.email})
                  </option>
                ))}
              </select>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setReassignOpen(false)}
                  className="flex-1 h-11 rounded-xl bg-white/10 text-white text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedAgentId || assignTaskMutation.isPending}
                  onClick={() => void handleReassignSubmit()}
                  className="flex-1 h-11 rounded-xl bg-[#FD6046] text-white text-xs font-bold disabled:opacity-50"
                >
                  {assignTaskMutation.isPending ? 'Assigning…' : 'Assign'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Full-screen Proof Photo Lightbox ─── */}
      <AnimatePresence>
        {previewProofUrl && (
          <div
            onClick={() => setPreviewProofUrl(null)}
            className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-black/90 p-4"
          >
            <img
              src={previewProofUrl}
              alt="Task Completion Proof"
              className="max-h-[80vh] max-w-full rounded-2xl object-contain"
            />
            <div className="mt-4 flex items-center gap-3">
              <a
                href={previewProofUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="px-4 py-2 rounded-full bg-[#75ADAF] text-[#0A1D25] text-xs font-bold flex items-center gap-1.5"
              >
                <ExternalLink size={13} />
                Open Original
              </a>
              <button
                type="button"
                onClick={() => setPreviewProofUrl(null)}
                className="px-4 py-2 rounded-full bg-white/15 text-white text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
