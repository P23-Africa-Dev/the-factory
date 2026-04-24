'use client';

import React, { useState } from 'react';
import {
  X,
  MapPin,
  Share2,
  CheckCircle,
  Loader2,
  UserCheck,
  ChevronDown,
  ImageIcon,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/store/auth';
import { useTask, useUpdateTaskStatus, useReassignTask } from '@/hooks/use-tasks';
import { useInternalUsers } from '@/hooks/use-projects';
import { downloadTaskProof } from '@/lib/api/tasks';
import { getAuthTokenFromDocument } from '@/lib/auth/session';
import { ProofUploadModal } from './proof-upload-modal';
import type { ApiTaskStatus } from '@/lib/api/tasks';

interface TaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  taskId: number | string | null;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string }> = {
  pending: { bg: '#FF9F6A', text: 'white', label: 'Pending' },
  in_progress: { bg: '#3B63F8', text: 'white', label: 'In Progress' },
  completed: { bg: '#4FD1C5', text: 'white', label: 'Completed' },
  cancelled: { bg: '#9CA3AF', text: 'white', label: 'Cancelled' },
};

export function TaskDetailModal({ isOpen, onClose, taskId }: TaskDetailModalProps) {
  const user = useAuthStore((s) => s.user);
  const companyId = user?.active_company?.id;
  const accessRole = user?.access_role;
  const internalRole = user?.internal_role;

  const isAgent = accessRole === 'agent';
  const canDownloadProof = accessRole === 'admin' || internalRole === 'owner';
  const isTerminal = (status: string) => status === 'completed' || status === 'cancelled';

  const { data: task, isPending: loadingTask, refetch } = useTask(
    isOpen ? taskId : null,
    companyId ?? null
  );

  const { mutate: updateStatus, isPending: updatingStatus } = useUpdateTaskStatus({
    onSuccess: () => {
      toast.success('Task status updated.');
      refetch();
    },
  });

  const { mutate: reassign, isPending: reassigning } = useReassignTask({
    onSuccess: () => {
      toast.success('Task reassigned.');
      setShowReassign(false);
      refetch();
    },
  });

  const { data: agents = [] } = useInternalUsers({ role: 'agent' });

  const [showReassign, setShowReassign] = useState(false);
  const [newAgentId, setNewAgentId] = useState('');
  const [showProofUpload, setShowProofUpload] = useState(false);
  const [downloadingProofId, setDownloadingProofId] = useState<number | null>(null);

  if (!isOpen) return null;

  const handleStatusUpdate = (status: ApiTaskStatus) => {
    if (!task || !companyId) return;
    updateStatus({ taskId: task.id, payload: { company_id: companyId, status } });
  };

  const handleReassign = () => {
    if (!task || !companyId || !newAgentId) return;
    reassign({
      taskId: task.id,
      payload: { company_id: companyId, assigned_agent_id: Number(newAgentId) },
    });
  };

  const handleDownloadProof = async (fileUrl: string, proofId: number) => {
    setDownloadingProofId(proofId);
    try {
      const token = getAuthTokenFromDocument();
      const blob = await downloadTaskProof(fileUrl, token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `proof-${proofId}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Failed to download proof file.');
    } finally {
      setDownloadingProofId(null);
    }
  };

  const statusCfg = task
    ? STATUS_CONFIG[task.status] ?? STATUS_CONFIG.pending
    : STATUS_CONFIG.pending;

  const canCommence = task?.status === 'pending' && isAgent;
  const canComplete = task?.status === 'in_progress' && isAgent;
  const canCancel = (task?.status === 'pending' || task?.status === 'in_progress') && isAgent;
  const canReassign =
    !isAgent && task && !isTerminal(task.status);

  return (
    <>
      <div className="fixed inset-0 z-100 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

        <div
          className="relative w-full max-w-[94%] md:max-w-215 bg-white rounded-[28px] md:rounded-[40px] shadow-2xl overflow-hidden z-10 flex flex-col"
          style={{ maxHeight: '92vh' }}
        >
          {/* Map Section */}
          <div className="relative h-44 md:h-55 w-full bg-[#eef0f3] overflow-hidden shrink-0">
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
              <defs>
                <pattern id="grid" width="80" height="60" patternUnits="userSpaceOnUse">
                  <path d="M 80 0 L 0 0 0 60" fill="none" stroke="#CBD5E1" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>

            <svg
              className="absolute inset-0 w-full h-full pointer-events-none"
              preserveAspectRatio="none"
            >
              <path
                d="M100 160 C200 165 300 158 400 135 C450 122 500 135 600 135 C700 135 800 140 900 150"
                stroke="#3B82F6"
                strokeWidth="10"
                strokeLinecap="round"
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            </svg>

            <div className="absolute left-[10%] top-[40%]">
              <MapPin size={20} className="text-red-500 fill-red-500 drop-shadow-md" />
            </div>

            <div className="absolute left-[50%] top-[45%]">
              <div className="w-6 h-6 bg-[#3B82F6] rounded-full flex items-center justify-center shadow-lg border-2 border-white">
                <Share2 size={10} className="text-white fill-white" />
              </div>
            </div>

            <div className="absolute left-[85%] top-[55%]">
              <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-lg border-4 border-[#C77DFF]/40">
                <div className="w-2 h-2 bg-[#9D4EDD] rounded-full" />
              </div>
            </div>

            {task && (
              <div className="absolute top-4 right-16 hidden sm:flex rounded-[14px] overflow-hidden shadow-xl bg-white w-45">
                <div className="flex-1 px-3 py-2 min-w-0">
                  <p className="text-[10px] font-bold text-dash-dark truncate">
                    {task.project?.name ?? 'Standalone Task'}
                  </p>
                  <p className="text-[9px] text-gray-400 leading-none mt-0.5">
                    {task.location ?? '—'}
                  </p>
                </div>
              </div>
            )}

            <div
              className="absolute top-3 right-3 px-3 py-1.5 rounded-xl text-[11px] font-bold shadow-md z-20"
              style={{ backgroundColor: statusCfg.bg, color: statusCfg.text }}
            >
              {statusCfg.label}
            </div>

            <button
              onClick={onClose}
              className="absolute top-4 left-4 w-9 h-9 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-500 hover:text-gray-900 transition-all shadow-md z-30"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6 md:px-10 md:py-8 no-scrollbar">
            {loadingTask ? (
              <div className="flex items-center justify-center py-20 gap-3 text-gray-400">
                <Loader2 className="animate-spin" size={24} />
                <span className="font-semibold">Loading task…</span>
              </div>
            ) : !task ? (
              <div className="flex items-center justify-center py-20 text-gray-400 font-semibold">
                Task not found.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12">
                {/* Left column */}
                <div className="space-y-6 md:space-y-7">
                  <section>
                    <h3 className="text-[14px] md:text-[15px] font-bold text-dash-dark mb-1.5">
                      Task Title
                    </h3>
                    <p className="text-[14px] text-gray-500 leading-snug">{task.title}</p>
                  </section>

                  <section>
                    <h3 className="text-[15px] font-bold text-dash-dark mb-1.5">Location</h3>
                    <p className="text-[14px] text-gray-500 underline decoration-gray-300 underline-offset-4 leading-relaxed mb-3">
                      {task.location ?? '—'}
                    </p>
                    {task.address && (
                      <p className="text-[12px] text-gray-400 mb-3">{task.address}</p>
                    )}
                    <button className="px-4 py-1.5 bg-dash-teal/15 text-[#3A8C88] rounded-full text-[12px] font-semibold hover:bg-dash-teal/25 transition-colors">
                      View on Full Map
                    </button>
                  </section>

                  <section>
                    <h3 className="text-[15px] font-bold text-dash-dark mb-1.5">Due Date</h3>
                    <p className="text-[14px] text-gray-400">
                      {task.due_date
                        ? new Date(task.due_date).toLocaleDateString('en-GB', {
                            weekday: 'long',
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                          })
                        : '—'}
                    </p>
                  </section>

                  <section>
                    <h3 className="text-[15px] font-bold text-dash-dark mb-1.5">Assigned By</h3>
                    <p className="text-[14px] text-gray-400">
                      {task.creator ? `${task.creator.name}` : '—'}
                    </p>
                  </section>

                  {task.assignee && (
                    <section>
                      <h3 className="text-[15px] font-bold text-dash-dark mb-1.5">Assigned To</h3>
                      <p className="text-[14px] text-gray-400">{task.assignee.name}</p>
                    </section>
                  )}

                  {task.priority && (
                    <section>
                      <h3 className="text-[15px] font-bold text-dash-dark mb-1.5">Priority</h3>
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-[11px] font-bold ${
                          task.priority === 'high'
                            ? 'bg-red-100 text-red-600'
                            : task.priority === 'medium'
                            ? 'bg-amber-100 text-amber-600'
                            : 'bg-green-100 text-green-600'
                        }`}
                      >
                        {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                      </span>
                    </section>
                  )}

                  {/* Reassign (managers only, non-terminal tasks) */}
                  {canReassign && (
                    <section>
                      <h3 className="text-[15px] font-bold text-dash-dark mb-2">Reassign Task</h3>
                      {!showReassign ? (
                        <button
                          onClick={() => setShowReassign(true)}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-[12px] font-semibold text-gray-500 hover:bg-gray-50 transition-all"
                        >
                          <UserCheck size={14} />
                          Reassign Agent
                        </button>
                      ) : (
                        <div className="flex gap-2 items-center">
                          <div className="relative flex-1">
                            <ChevronDown
                              size={13}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                            />
                            <select
                              value={newAgentId}
                              onChange={(e) => setNewAgentId(e.target.value)}
                              className="w-full bg-gray-50 border border-gray-200 rounded-xl py-2 pl-3 pr-9 text-[13px] text-[#0B1215] appearance-none outline-none focus:border-[#094B5C]"
                            >
                              <option value="" disabled>
                                Select agent
                              </option>
                              {agents.map((a) => (
                                <option key={a.id} value={a.id.toString()}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <button
                            onClick={handleReassign}
                            disabled={!newAgentId || reassigning}
                            className="px-4 py-2 bg-[#094B5C] text-white rounded-xl text-[12px] font-bold disabled:opacity-50 hover:opacity-90 transition-all"
                          >
                            {reassigning ? <Loader2 size={13} className="animate-spin" /> : 'Confirm'}
                          </button>
                          <button
                            onClick={() => { setShowReassign(false); setNewAgentId(''); }}
                            className="px-3 py-2 rounded-xl border border-gray-200 text-[12px] text-gray-400 hover:bg-gray-50 transition-all"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </section>
                  )}
                </div>

                {/* Right column */}
                <div className="flex flex-col">
                  {task.description && (
                    <section className="mb-6">
                      <h3 className="text-[15px] font-bold text-dash-dark mb-2">Description</h3>
                      <div className="text-[13px] text-gray-500 leading-relaxed whitespace-pre-wrap">
                        {task.description}
                      </div>
                    </section>
                  )}

                  {task.required_actions && task.required_actions.length > 0 && (
                    <section className="mb-6">
                      <h3 className="text-[15px] font-bold text-dash-dark mb-2">
                        Required Actions
                      </h3>
                      <ul className="space-y-1">
                        {task.required_actions.map((action, i) => (
                          <li key={i} className="flex items-start gap-2 text-[13px] text-gray-500">
                            <span className="mt-1 w-1.5 h-1.5 rounded-full bg-gray-400 shrink-0" />
                            {action}
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {/* Proofs section */}
                  {task.proofs && task.proofs.length > 0 && (
                    <section className="mb-6">
                      <h3 className="text-[15px] font-bold text-dash-dark mb-3">
                        Uploaded Proofs ({task.proofs.length}
                        {task.minimum_photos_required
                          ? ` / ${task.minimum_photos_required} required`
                          : ''}
                        )
                      </h3>
                      <div className="grid grid-cols-3 gap-2">
                        {task.proofs.map((proof) => (
                          <div
                            key={proof.id}
                            className="relative rounded-xl overflow-hidden bg-gray-100 aspect-square flex items-center justify-center"
                          >
                            {proof.file_url ? (
                              <img
                                src={proof.file_url}
                                alt={`Proof ${proof.id}`}
                                className="w-full h-full object-cover"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <ImageIcon size={20} className="text-gray-400" />
                            )}
                            {canDownloadProof && proof.file_url && (
                              <button
                                onClick={() => handleDownloadProof(proof.file_url!, proof.id)}
                                disabled={downloadingProofId === proof.id}
                                className="absolute bottom-1 right-1 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center shadow hover:bg-white transition-all"
                              >
                                {downloadingProofId === proof.id ? (
                                  <Loader2 size={12} className="animate-spin text-gray-500" />
                                ) : (
                                  <Download size={12} className="text-gray-600" />
                                )}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* In-progress: upload photo + mark done + cancel */}
                  {task.status === 'in_progress' && isAgent && (
                    <div className="space-y-3 mt-auto pt-4">
                      <div className="flex gap-3">
                        <button
                          onClick={() => setShowProofUpload(true)}
                          className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 bg-white border-2 border-gray-100 rounded-[18px] text-[13px] font-semibold text-gray-400 hover:bg-gray-50 transition-all"
                        >
                          Upload Photo
                        </button>
                        <button
                          onClick={() => handleStatusUpdate('completed')}
                          disabled={updatingStatus}
                          className="flex-1 flex items-center justify-center px-5 py-3.5 bg-[#7EB5AE] text-white rounded-[18px] text-[13px] font-semibold shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90 transition-all disabled:opacity-50"
                        >
                          {updatingStatus ? <Loader2 size={14} className="animate-spin" /> : 'Task Done'}
                        </button>
                      </div>
                      <button
                        onClick={() => handleStatusUpdate('cancelled')}
                        disabled={updatingStatus}
                        className="w-full py-3 rounded-[18px] border border-red-200 text-red-400 text-[13px] font-semibold hover:bg-red-50 transition-all disabled:opacity-50"
                      >
                        Cancel Task
                      </button>
                    </div>
                  )}

                  {/* Pending: commence + cancel */}
                  {task.status === 'pending' && isAgent && (
                    <div className="space-y-3 mt-auto pt-6">
                      <button
                        onClick={() => handleStatusUpdate('in_progress')}
                        disabled={updatingStatus}
                        className="w-full flex items-center justify-center px-8 py-4 bg-[#7EB5AE] text-white rounded-[20px] text-[15px] font-semibold shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90 transition-all disabled:opacity-50"
                      >
                        {updatingStatus ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          'Commence Task'
                        )}
                      </button>
                      <button
                        onClick={() => handleStatusUpdate('cancelled')}
                        disabled={updatingStatus}
                        className="w-full py-3 rounded-[20px] border border-red-200 text-red-400 text-[13px] font-semibold hover:bg-red-50 transition-all disabled:opacity-50"
                      >
                        Cancel Task
                      </button>
                    </div>
                  )}

                  {/* Completed */}
                  {task.status === 'completed' && (
                    <div className="mt-auto pt-6">
                      <div className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-dash-teal/10 text-dash-teal rounded-[20px] text-[15px] font-semibold border border-dash-teal/20">
                        <CheckCircle size={20} />
                        Task Completed
                      </div>
                    </div>
                  )}

                  {/* Cancelled */}
                  {task.status === 'cancelled' && (
                    <div className="mt-auto pt-6">
                      <div className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-gray-100 text-gray-500 rounded-[20px] text-[15px] font-semibold border border-gray-200">
                        Task Cancelled
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Proof Upload Modal */}
      {task && (
        <ProofUploadModal
          isOpen={showProofUpload}
          onClose={() => setShowProofUpload(false)}
          taskId={task.id}
          onSuccess={() => {
            setShowProofUpload(false);
            refetch();
          }}
        />
      )}
    </>
  );
}
