'use client';

import React, { useRef, useState } from 'react';
import { X, MapPin, Share2, RefreshCw, CheckCircle, Loader2 } from 'lucide-react';
import type { DndItem } from '@/types/operations';
import {
  useTaskDetail,
  useAssignTask,
  useUpdateTaskStatus,
  useUploadTaskProof,
} from '@/hooks/use-tasks';
import { useAuthStore } from '@/store/auth';
import { getActiveCompanyContext } from '@/lib/company-context';
import { getAuthTokenFromDocument } from '@/lib/auth/session';
import { toast } from 'sonner';
import { LocationPermissionGate } from '@/components/tracking/LocationPermissionGate';
import { CompleteTaskSheet } from '@/components/tracking/CompleteTaskSheet';
import { useActiveTracking } from '@/components/tracking/active-tracking-provider';
import { startTaskTracking } from '@/lib/api/tracking';
import { ApiRequestError } from '@/lib/api/onboarding';
import { useTrackingStore } from '@/store/tracking';
import type { GeoReading } from '@/types/tracking';

interface TaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: DndItem | null;
  status: 'pending' | 'in-progress' | 'completed' | string;
}

export function TaskDetailModal({ isOpen, onClose, task, status }: TaskDetailModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const authUser = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(authUser);
  const taskId = Number(task?.id ?? 0);
  const detailQuery = useTaskDetail(taskId, companyId ?? undefined);
  const [assignmentInput, setAssignmentInput] = useState('');
  const [showLocationGate, setShowLocationGate] = useState(false);
  const [commencing, setCommencing] = useState(false);
  const [showCompleteSheet, setShowCompleteSheet] = useState(false);
  const { startTracking, activeTaskId } = useActiveTracking();

  const updateStatusMutation = useUpdateTaskStatus({
    onSuccess: (updatedTask) => {
      toast.success(`Task moved to ${updatedTask.status.replace('_', ' ')}`);
    },
  });
  const uploadProofMutation = useUploadTaskProof({
    onSuccess: () => toast.success('Proof uploaded successfully.'),
  });
  const assignTaskMutation = useAssignTask({
    onSuccess: () => toast.success('Task assignment updated.'),
  });
  if (!isOpen || !task) return null;

  const handleCommenceAndTrack = () => {
    if (!companyId) { toast.error('Company context is required.'); return; }
    setShowLocationGate(true);
  };

  const handleLocationGranted = async (reading: GeoReading) => {
    if (!companyId) return;
    setShowLocationGate(false);
    setCommencing(true);
    try {
      const token = getAuthTokenFromDocument();
      const res = await startTaskTracking(
        taskId,
        {
          company_id: companyId,
          location_permission_granted: true,
          latitude: reading.latitude,
          longitude: reading.longitude,
          accuracy_meters: reading.accuracyMeters,
          recorded_at: reading.recordedAt,
        },
        token
      );

      useTrackingStore.getState().seedFromTaskStart({
        taskId,
        trackingSessionId: res.data.tracking.id,
        userId: authUser?.id ?? res.data.tracking.started_by_user_id,
        agentName: authUser?.name,
        agentAvatarUrl: authUser?.avatar ?? undefined,
        taskTitle: res.data.task.title,
        taskAddress: res.data.task.address ?? res.data.task.location ?? undefined,
        destination:
          typeof res.data.task.latitude === 'number' &&
          typeof res.data.task.longitude === 'number'
            ? { lat: res.data.task.latitude, lng: res.data.task.longitude, radiusM: 75 }
            : undefined,
        position: [reading.longitude, reading.latitude],
        occurredAt: reading.recordedAt,
      });

      startTracking(taskId, companyId as number, token, {
        onArrived: () => toast.success("You've arrived at the destination!"),
        onError: () => {},
      });
      if (res.data.arrived) {
        toast.success("Task started — you're already at the destination!");
      } else {
        toast.success('Tracking started.');
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        const first = err.errors ? Object.values(err.errors)[0]?.[0] : null;
        toast.error(first ?? err.message ?? 'Failed to start tracking.');
      } else {
        toast.error('Failed to start tracking.');
      }
    } finally {
      setCommencing(false);
    }
  };

  const handleTaskDone = () => {
    if (activeTaskId !== taskId) {
      toast.error('Start tracking before completing the task.');
      return;
    }
    setShowCompleteSheet(true);
  };

  const handleCompleteSuccess = () => {
    setShowCompleteSheet(false);
    onClose();
  };

  const isPending = status === 'pending';
  const isInProgress = status === 'in-progress';
  const isCompleted = status === 'completed';
  const canDownloadProofs = role === 'owner' || role === 'admin';

  const statusConfig = {
    pending: { bg: '#FF9F6A', text: 'white', label: 'Pending' },
    'in-progress': { bg: '#3B63F8', text: 'white', label: 'In-Progress' },
    completed: { bg: '#4FD1C5', text: 'white', label: 'Completed' },
  };

  const currentStatus = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;

  // Format addedDescription: split by newline, render each line
  const descriptionLines = (task.addedDescription || '').split('\n').filter(Boolean);

  const updateTaskStatus = (nextStatus: 'in_progress' | 'completed' | 'cancelled') => {
    if (!companyId) {
      toast.error('Company context is required.');
      return;
    }
    updateStatusMutation.mutate({
      taskId,
      payload: {
        company_id: companyId,
        status: nextStatus,
      },
    });
  };

  const onProofSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!companyId) {
      toast.error('Company context is required.');
      return;
    }
    const formData = new FormData();
    formData.append('company_id', String(companyId));
    formData.append('file', file);
    uploadProofMutation.mutate({ taskId, formData });
    event.currentTarget.value = '';
  };

  const updateAssignment = () => {
    if (!companyId) {
      toast.error('Company context is required.');
      return;
    }

    const assignedAgentIds = assignmentInput
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => !Number.isNaN(value));

    if (assignedAgentIds.length === 0) {
      toast.error('Enter at least one agent ID.');
      return;
    }

    assignTaskMutation.mutate({
      taskId,
      payload: {
        company_id: companyId,
        assigned_agent_ids: assignedAgentIds,
      },
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="relative w-full max-w-[94%] md:max-w-215 bg-white rounded-[28px] md:rounded-[40px] shadow-2xl overflow-hidden z-10 flex flex-col" style={{ maxHeight: '92vh' }}>

        {/* ── Map Section ──────────────────────────────────────────────── */}
        <div className="relative h-44 md:h-55 w-full bg-[#eef0f3] overflow-hidden shrink-0">

          {/* Grid lines */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
            <defs>
              <pattern id="grid" width="80" height="60" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 60" fill="none" stroke="#CBD5E1" strokeWidth="1"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid)" />
          </svg>

          {/* Street labels */}
          <div className="absolute left-50 top-0 bottom-0 flex flex-col justify-center gap-1 pointer-events-none">
            <span className="text-[11px] font-semibold text-gray-400 -rotate-90 origin-center whitespace-nowrap">Dresd</span>
            <span className="text-[11px] font-semibold text-gray-400 -rotate-90 origin-center whitespace-nowrap">Stree</span>
          </div>

          {/* Route line */}
          <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
            <path
              d="M100 160 C200 165 300 158 400 135 C450 122 500 135 600 135 C700 135 800 140 900 150"
              stroke="#3B82F6"
              strokeWidth="10"
              strokeLinecap="round"
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* Origin pin */}
          <div className="absolute left-[10%] top-[40%]">
            <MapPin size={20} className="text-red-500 fill-red-500 drop-shadow-md" />
          </div>

          {/* Agent marker */}
          <div className="absolute flex flex-col items-center left-[15%] top-[55%]">
            <div className="w-8 h-8 rounded-full border-[3px] border-white shadow-lg overflow-hidden">
              <img
                src={task.avatar || '/avatars/female-avatar.png'}
                className="w-full h-full object-cover"
                alt="Agent"
              />
            </div>
            <div className="bg-[#B7E4C7] px-2 py-0.5 rounded-full mt-1 shadow-sm text-center whitespace-nowrap hidden sm:block">
              <p className="text-[8px] font-bold text-[#2D6A4F]">Lane Wade</p>
            </div>
          </div>

          {/* Mid waypoint */}
          <div className="absolute left-[50%] top-[45%]">
            <div className="w-6 h-6 bg-[#3B82F6] rounded-full flex items-center justify-center shadow-lg border-2 border-white">
              <Share2 size={10} className="text-white fill-white" />
            </div>
          </div>

          {/* Destination marker */}
          <div className="absolute left-[85%] top-[55%]">
            <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-lg border-4 border-[#C77DFF]/40">
              <div className="w-2 h-2 bg-[#9D4EDD] rounded-full" />
            </div>
          </div>

          {/* Business card overlay — hidden on small mobile */}
          <div className="absolute top-4 right-16 hidden sm:flex rounded-[14px] overflow-hidden shadow-xl bg-white w-[180px]">
            <div className="w-12 h-12 shrink-0 bg-gray-200 overflow-hidden">
              <img
                src="https://images.unsplash.com/photo-1486325212027-8081e485255e?w=200&q=80"
                className="w-full h-full object-cover"
                alt="Location"
              />
            </div>
            <div className="flex-1 px-2 py-1.5 min-w-0">
              <p className="text-[10px] font-bold text-dash-dark truncate">Company Name</p>
              <p className="text-[9px] text-gray-400 leading-none mt-0.5">London SE1 2UF, UK</p>
            </div>
          </div>

          {/* Status badge */}
          <div
            className="absolute top-3 right-3 px-3 py-1.5 rounded-xl text-[11px] font-bold shadow-md z-20"
            style={{ backgroundColor: currentStatus.bg, color: currentStatus.text }}
          >
            {currentStatus.label}
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 left-4 w-9 h-9 bg-white/80 backdrop-blur-sm rounded-full flex items-center justify-center text-gray-500 hover:text-gray-900 transition-all shadow-md z-30"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {/* ── Content Section ──────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-6 py-6 md:px-10 md:py-8 no-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-12">

            {/* Left column */}
            <div className="space-y-6 md:space-y-7">
              <section>
                <h3 className="text-[14px] md:text-[15px] font-bold text-dash-dark mb-1.5">Task Title</h3>
                <p className="text-[14px] text-gray-500 leading-snug">
                  {task.description || 'Cover the entirety of Ikeja, For our product publicity'}
                </p>
              </section>

              <section>
                <h3 className="text-[15px] font-bold text-dash-dark mb-1.5">Location</h3>
                <p className="text-[14px] text-gray-500 underline decoration-gray-300 underline-offset-4 leading-relaxed mb-3">
                  {task.location}
                </p>
                <button className="px-4 py-1.5 bg-dash-teal/15 text-[#3A8C88] rounded-full text-[12px] font-semibold hover:bg-dash-teal/25 transition-colors">
                  View on Full Map
                </button>
              </section>

              <section>
                <h3 className="text-[15px] font-bold text-dash-dark mb-1.5">Due Date</h3>
                <p className="text-[14px] text-gray-400">
                  {task.dueDate || 'Tomorrow (Friday, 3rd April. 2026)'}
                </p>
              </section>

              <section>
                <h3 className="text-[15px] font-bold text-dash-dark mb-1.5">Assigned By</h3>
                <p className="text-[14px] text-gray-400">
                  {task.assignedBy || 'Ridwan Thomson (Supervisor)'}
                </p>
              </section>
            </div>

            {/* Right column */}
            <div className="flex flex-col">
              <section className="mb-6">
                <h3 className="text-[15px] font-bold text-dash-dark mb-2">Added Description</h3>
                <div className="text-[13px] text-gray-500 leading-relaxed space-y-1">
                  {descriptionLines.length > 0
                    ? descriptionLines.map((line, i) => (
                        <p key={i}>{line}</p>
                      ))
                    : (
                      <>
                        <p>Visit the Ikeja Computer village, and promote (product name) to the target audience there.</p>
                        <p className="mt-2">Speak with the business owner and note:</p>
                        <p>- Contact Details</p>
                        <p>- Prospect brief</p>
                        <p>- Any other usable details.</p>
                      </>
                    )
                  }
                </div>
              </section>

              {/* In-progress: note + actions */}
              {isInProgress && (
                <div className="space-y-4 mt-1">
                  <section>
                    <h3 className="text-[15px] font-bold text-dash-dark mb-2">Add Note</h3>
                    <div className="relative">
                      <textarea
                        placeholder="Type your note here ..."
                        className="w-full h-28 bg-dash-bg rounded-[18px] px-5 py-4 text-[13px] text-dash-dark outline-none border border-transparent focus:border-gray-200 resize-none placeholder:text-gray-300"
                      />
                      <span className="absolute bottom-4 right-5 text-[10px] text-gray-300 font-medium">Optional</span>
                    </div>
                  </section>
                  <div className="flex gap-3">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-2 px-5 py-3.5 bg-white border-2 border-gray-100 rounded-[18px] text-[13px] font-semibold text-gray-400 hover:bg-gray-50 transition-all"
                    >
                      Upload Photo
                      <div className="w-7 h-7 rounded-full border-2 border-gray-200 flex items-center justify-center ml-1">
                        <RefreshCw size={12} className="text-gray-400" />
                      </div>
                    </button>
                    <button
                      onClick={handleTaskDone}
                      className="flex-1 flex items-center justify-center px-5 py-3.5 bg-[#7EB5AE] text-white rounded-[18px] text-[13px] font-semibold shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90 transition-all"
                    >
                      Task Done
                    </button>
                  </div>
                  <button
                    onClick={() => updateTaskStatus('cancelled')}
                    className="w-full px-4 py-2 rounded-xl border border-red-200 text-red-500 text-xs font-semibold hover:bg-red-50"
                  >
                    Cancel Task
                  </button>
                </div>
              )}

              {/* Pending: commence button */}
              {isPending && (
                <div className="mt-auto pt-6">
                  <button
                    onClick={handleCommenceAndTrack}
                    disabled={commencing}
                    className="w-full flex items-center justify-center gap-2 px-8 py-4 bg-[#7EB5AE] text-white rounded-[20px] text-[15px] font-semibold shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90 transition-all disabled:opacity-60"
                  >
                    {commencing && <Loader2 size={16} className="animate-spin" />}
                    {commencing ? 'Starting…' : 'Commence Task'}
                  </button>
                  <button
                    onClick={() => updateTaskStatus('cancelled')}
                    className="w-full mt-2 px-4 py-2 rounded-xl border border-red-200 text-red-500 text-xs font-semibold hover:bg-red-50"
                  >
                    Cancel Task
                  </button>
                </div>
              )}

              {/* Completed */}
              {isCompleted && (
                <div className="mt-auto pt-6">
                  <div className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-dash-teal/10 text-dash-teal rounded-[20px] text-[15px] font-semibold border border-dash-teal/20">
                    <CheckCircle size={20} />
                    Task Completed
                  </div>
                </div>
              )}
              {detailQuery.data?.proofs?.length ? (
                <div className="mt-4 space-y-2">
                  <h4 className="text-[13px] font-bold text-dash-dark">Proofs</h4>
                  {detailQuery.data.proofs.map((proof) => (
                    <div
                      key={proof.id}
                      className="flex items-center justify-between text-[11px] text-gray-500 border border-gray-100 rounded-lg px-3 py-2"
                    >
                      <span>Proof #{proof.id}</span>
                      {canDownloadProofs && proof.file_url ? (
                        <a href={proof.file_url} className="text-dash-teal font-semibold">
                          Download
                        </a>
                      ) : (
                        <span className="text-gray-400">Restricted</span>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="mt-4 p-3 border border-gray-100 rounded-lg space-y-2">
                <p className="text-[12px] font-bold text-dash-dark">Reassign Task</p>
                <input
                  value={assignmentInput}
                  onChange={(event) => setAssignmentInput(event.target.value)}
                  placeholder="Agent IDs e.g 31,42"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs"
                />
                <button
                  onClick={updateAssignment}
                  className="w-full px-4 py-2 rounded-lg bg-dash-dark text-white text-xs font-semibold"
                >
                  Update Assignment
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/jpg"
        className="hidden"
        onChange={onProofSelected}
      />

      {/* Location permission gate overlay */}
      {showLocationGate && (
        <div className="absolute inset-0 z-50 bg-white/95 backdrop-blur-sm rounded-[28px] md:rounded-[40px] flex items-center justify-center">
          <LocationPermissionGate
            onGranted={handleLocationGranted}
            onDenied={() => setShowLocationGate(false)}
            onCancel={() => setShowLocationGate(false)}
          />
        </div>
      )}

      {/* Complete task sheet */}
      {showCompleteSheet && companyId && (
        <CompleteTaskSheet
          taskId={taskId}
          companyId={companyId}
          minimumPhotos={detailQuery.data?.minimum_photos_required ?? 1}
          onSuccess={handleCompleteSuccess}
          onClose={() => setShowCompleteSheet(false)}
        />
      )}
    </div>
  );
}
