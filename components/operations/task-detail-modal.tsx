'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import { useRouter } from 'next/navigation';
import { X, RefreshCw, CheckCircle, Loader2 } from 'lucide-react';
import type { DndItem } from '@/types/operations';
import { DEFAULT_AVATAR } from '@/lib/avatar';
import {
  useTaskDetail,
  useAssignTask,
  useTaskReassignmentInbox,
  useAcceptTaskReassignment,
  useRejectTaskReassignment,
  useUpdateTaskStatus,
  useUploadTaskProof,
} from '@/hooks/use-tasks';
import { useInternalUsers } from '@/hooks/use-internal-users';
import { useAuthStore } from '@/store/auth';
import { getActiveCompanyContext } from '@/lib/company-context';
import { getAuthTokenFromDocument } from '@/lib/auth/session';
import {
  createMapboxTransformRequest,
  getGoogleMapsPublicApiKey,
  getMapboxPublicToken,
} from '@/lib/config/public-env';
import { toast } from 'sonner';
import { LocationPermissionGate } from '@/components/tracking/LocationPermissionGate';
import { CompleteTaskSheet } from '@/components/tracking/CompleteTaskSheet';
import { TaskProofGallery } from '@/components/operations/task-proof-gallery';
import { TaskComments } from '@/components/operations/task-comments';
import { ObserverAvatar } from '@/components/operations/observer-avatars';
import { useActiveTracking } from '@/components/tracking/active-tracking-provider';
import { startTaskTracking } from '@/lib/api/tracking';
import { ApiRequestError } from '@/lib/api/onboarding';
import type { GeoReading } from '@/types/tracking';
import { useEffectiveMapProvider } from '@/hooks/use-effective-map-provider';
import { loadGoogleMapsApi } from '@/lib/map/google-loader';
import { formatTaskLocationLabel, hasTrackableTaskLocation } from '@/lib/tasks/location';
import { buildTaskMapUrl } from '@/lib/tasks/map-navigation';
import { useTrackingStore } from '@/store/tracking';

import { ProjectChecklistSection } from "./project-checklist";
import { formatChecklistDate, isOverdue, type ProjectSubtask } from "@/lib/tasks/project-checklist";
import { TASK_COMMENT_MAX_LENGTH, type ApiTaskStatus } from "@/lib/api/tasks";

type TaskGoogleMaps = {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => { [key: string]: unknown };
    Marker: new (opts: Record<string, unknown>) => { setMap: (map: unknown) => void; [key: string]: unknown };
    SymbolPath: { CIRCLE: number };
  };
};

interface TaskDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: DndItem | null;
  status: 'pending' | 'in-progress' | 'completed' | string;
  onToggleSubtask?: (id: string) => void;
  onSaveSubtasks?: (items: ProjectSubtask[]) => void;
  onApiStatusUpdated?: () => void;
  localTask?: {
    comments: string[];
    onComment: (body: string) => void;
    onStatus: (status: ApiTaskStatus) => void;
    onAssign: (assignee: { id: number; name: string }) => void;
  };
}

function toBoardStatus(status?: string): 'pending' | 'in-progress' | 'completed' | 'cancelled' {
  if (status === 'cancelled') return 'cancelled';
  if (status === 'completed') return 'completed';
  if (status === 'in_progress' || status === 'paused' || status === 'resumed') {
    return 'in-progress';
  }

  return 'pending';
}

function TaskLocationMap({
  latitude,
  longitude,
  agentName,
  agentAvatar,
}: {
  latitude: number | null;
  longitude: number | null;
  agentName: string;
  agentAvatar?: string | null;
}) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapboxMapRef = useRef<mapboxgl.Map | null>(null);
  const googleMapRef = useRef<unknown | null>(null);
  const googleMarkersRef = useRef<Array<{ setMap: (map: unknown | null) => void }>>([]);
  const mapboxToken = useMemo(() => getMapboxPublicToken(), []);
  const googleApiKey = useMemo(() => getGoogleMapsPublicApiKey(), []);
  const {
    requestedProvider,
    effectiveProvider,
    fallbackReason,
    hasGoogleMapsApiKey,
    hasMapboxToken,
  } = useEffectiveMapProvider();
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude);

  useEffect(() => {
    if (!mapContainerRef.current || !hasCoordinates) return;

    let cancelled = false;

    const disposeGoogle = () => {
      googleMarkersRef.current.forEach((marker) => marker.setMap(null));
      googleMarkersRef.current = [];
      googleMapRef.current = null;
    };

    const disposeMapbox = () => {
      if (mapboxMapRef.current) {
        mapboxMapRef.current.remove();
        mapboxMapRef.current = null;
      }
    };

    if (effectiveProvider === 'google') {
      disposeMapbox();
      mapContainerRef.current.innerHTML = '';

      if (!googleApiKey) {
        return () => {
          disposeGoogle();
        };
      }

      loadGoogleMapsApi(googleApiKey)
        .then((raw) => {
          if (cancelled || !mapContainerRef.current || !raw) return;
          const google = raw as unknown as TaskGoogleMaps;

          const lat = latitude as number;
          const lng = longitude as number;

          const map = new google.maps.Map(mapContainerRef.current, {
            center: { lat, lng },
            zoom: 13.5,
            disableDefaultUI: true,
            zoomControl: true,
            mapTypeControl: false,
            fullscreenControl: false,
            streetViewControl: false,
          });

          googleMapRef.current = map;

          const destinationMarker = new google.maps.Marker({
            map,
            position: { lat, lng },
            title: 'Destination',
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#DC2626',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 3,
            },
          });

          const agentMarker = new google.maps.Marker({
            map,
            position: { lat, lng },
            title: agentName,
            label: {
              text: (agentName || 'A').slice(0, 1).toUpperCase(),
              color: '#FFFFFF',
              fontWeight: '700',
            },
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 12,
              fillColor: '#0F172A',
              fillOpacity: 0.92,
              strokeColor: '#FFFFFF',
              strokeWeight: 2,
            },
          });

          googleMarkersRef.current = [destinationMarker, agentMarker];
        })
        .catch(() => {
          // Ignore here; fallback text is shown by render path when key is missing.
        });

      return () => {
        cancelled = true;
        disposeGoogle();
      };
    }

    disposeGoogle();

    if (!mapboxToken) {
      return () => {
        disposeMapbox();
      };
    }

    mapboxgl.accessToken = mapboxToken;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/light-v11',
      center: [longitude as number, latitude as number],
      zoom: 13.5,
      attributionControl: false,
      transformRequest: createMapboxTransformRequest(),
    });

    mapboxMapRef.current = map;

    map.on('load', () => {
      if (cancelled) return;

      const destination = document.createElement('div');
      destination.style.cssText =
        'width:16px;height:16px;border-radius:999px;background:#DC2626;border:3px solid white;box-shadow:0 2px 8px rgba(220,38,38,0.45);';
      new mapboxgl.Marker({ element: destination, anchor: 'center' })
        .setLngLat([longitude as number, latitude as number])
        .addTo(map);

      const assignee = document.createElement('div');
      assignee.style.cssText =
        'display:flex;align-items:center;gap:8px;padding:4px 8px;background:rgba(15,23,42,0.86);color:white;border-radius:999px;box-shadow:0 4px 12px rgba(2,6,23,0.35);font-size:11px;font-weight:700;';

      const avatar = document.createElement('img');
      avatar.src = agentAvatar || DEFAULT_AVATAR;
      avatar.alt = agentName;
      avatar.style.cssText =
        'width:22px;height:22px;border-radius:999px;border:2px solid rgba(255,255,255,0.9);object-fit:cover;';
      assignee.appendChild(avatar);

      const name = document.createElement('span');
      name.textContent = agentName;
      assignee.appendChild(name);

      new mapboxgl.Marker({ element: assignee, anchor: 'bottom-left', offset: [14, 8] })
        .setLngLat([longitude as number, latitude as number])
        .addTo(map);
    });

    return () => {
      cancelled = true;
      disposeMapbox();
    };
  }, [agentAvatar, agentName, effectiveProvider, googleApiKey, hasCoordinates, latitude, longitude, mapboxToken]);

  if (!hasCoordinates) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#eef0f3] text-[12px] font-medium text-gray-500">
        Task destination coordinates are unavailable.
      </div>
    );
  }

  if (effectiveProvider === 'google' && !hasGoogleMapsApiKey) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#eef0f3] text-[12px] font-medium text-gray-500 px-4 text-center">
        Map preview requires NEXT_PUBLIC_GOOGLE_MAPS_API_KEY.
      </div>
    );
  }

  if (effectiveProvider === 'mapbox' && !hasMapboxToken) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#eef0f3] text-[12px] font-medium text-gray-500 px-4 text-center">
        Map preview requires NEXT_PUBLIC_MAPBOX_TOKEN.
      </div>
    );
  }

  return (
    <div className="h-full w-full relative">
      <div ref={mapContainerRef} className="h-full w-full" />

      {fallbackReason === 'missing_google_api_key' && requestedProvider === 'google' && (
        <div className="absolute bottom-2 left-2 right-2 rounded-md bg-black/75 px-2.5 py-1.5 text-[10px] font-medium text-white">
          Google map is selected by admin, but NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is missing. Showing Mapbox fallback.
        </div>
      )}
    </div>
  );
}

export function TaskDetailModal({ isOpen, onClose, task, status, onToggleSubtask, onSaveSubtasks, onApiStatusUpdated, localTask }: TaskDetailModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const authUser = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(authUser);
  const currentUserId = Number(authUser?.id ?? 0);
  const taskId = localTask ? 0 : Number(task?.id ?? 0);
  const detailQuery = useTaskDetail(taskId, companyId ?? undefined);
  const { data: internalUsers = [], isLoading: loadingInternalUsers } = useInternalUsers({
    company_id: companyId ?? undefined,
  });
  const reassignmentInbox = useTaskReassignmentInbox({
    company_id: companyId ?? undefined,
    status: 'pending',
  });
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [reassignmentReason, setReassignmentReason] = useState('');
  const [showLocationGate, setShowLocationGate] = useState(false);
  const [commencing, setCommencing] = useState(false);
  const [showCompleteSheet, setShowCompleteSheet] = useState(false);
  const { startTracking, activeTaskId } = useActiveTracking();

  const updateStatusMutation = useUpdateTaskStatus({
    onSuccess: (updatedTask) => {
      onApiStatusUpdated?.();
      toast.success(`Task moved to ${updatedTask.status.replace('_', ' ')}`);
    },
  });
  const uploadProofMutation = useUploadTaskProof({
    onSuccess: () => toast.success('Proof uploaded successfully.'),
  });
  const assignTaskMutation = useAssignTask({
    onSuccess: () => {
      toast.success('Reassignment request sent. Waiting for acceptance.');
      setReassignmentReason('');
    },
  });
  const acceptReassignmentMutation = useAcceptTaskReassignment({
    onSuccess: () => toast.success('Task reassignment accepted.'),
  });
  const rejectReassignmentMutation = useRejectTaskReassignment({
    onSuccess: () => toast.success('Task reassignment rejected.'),
  });

  if (!isOpen || !task) return null;

  const resolvedSelectedAgentId =
    selectedAgentId ||
    (detailQuery.data?.assignee?.id ? String(detailQuery.data.assignee.id) : localTask ? task.projectChecklist?.assigneeId ?? '' : '');

  const apiStatus = detailQuery.data?.status;
  const boardStatus = toBoardStatus(task.projectChecklist ? status : apiStatus ?? status);
  const isPending = boardStatus === 'pending';
  const isInProgress = boardStatus === 'in-progress';
  const isCompleted = boardStatus === 'completed';
  const isCancelled = boardStatus === 'cancelled';
  const observers = detailQuery.data?.observers ?? task.observers ?? [];
  // Observers follow the task and comment on it; the assignee's actions are not theirs.
  const isObserver = Boolean(detailQuery.data?.is_observer ?? task.isObserver);
  const canDownloadProofs = role === 'owner' || role === 'admin';
  const canOpenManagementMap =
    role === 'owner' ||
    role === 'admin' ||
    role === 'management' ||
    role === 'manager' ||
    role === 'supervisor';

  const fullMapPath = canOpenManagementMap ? '/map' : '/agent/map';
  const title = detailQuery.data?.title || task.description;
  const locationText = formatTaskLocationLabel(
    detailQuery.data?.location || task.location,
    detailQuery.data?.address,
    "No location set",
    detailQuery.data?.created_at || task.createdAt,
  );
  const checklist = task.projectChecklist;
  const dueDateText = checklist
    ? checklist.dueAt ? formatChecklistDate(checklist.dueAt) : 'No due date'
    : detailQuery.data?.due_date
      ? new Date(detailQuery.data.due_date).toLocaleString()
      : task.dueDate || 'No due date';
  const assignedByText = detailQuery.data?.creator?.name || task.assignedBy || 'Not specified';
  const taskDescription = detailQuery.data?.description || task.addedDescription || '';
  const descriptionLines = taskDescription.split('\n').filter(Boolean);
  const assignee = detailQuery.data?.assignee;
  const assigneeName = assignee?.name || task.label || 'Unassigned';
  const assigneeAvatar = assignee?.avatar_url || task.avatar || null;

  const latitude = detailQuery.data?.latitude ?? null;
  const longitude = detailQuery.data?.longitude ?? null;
  const hasTrackableLocation = hasTrackableTaskLocation(detailQuery.data);
  const latestReassignment = detailQuery.data?.latest_reassignment ?? null;

  const canReassignToRoles = role === 'agent' ? ['agent'] : ['agent', 'supervisor'];
  const eligibleUsers = internalUsers.filter((candidate) => {
    const candidateRole = candidate.role ?? candidate.internal_role;
    return !!candidateRole && canReassignToRoles.includes(candidateRole);
  });

  const pendingInboxRequest = reassignmentInbox.data?.find(
    (item) => Number(item.task_id) === taskId && item.status === 'pending'
  );
  const canRespondToPendingRequest =
    !!pendingInboxRequest && Number(pendingInboxRequest.to_user_id) === currentUserId;
  const hasPendingReassignment = latestReassignment?.status === 'pending';

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
      // Seed the tracking store from the fresh start response so the map shows
      // the task's current destination (reflects any location edits made by
      // admins/supervisors), instead of relying on possibly-stale cached data.
      useTrackingStore.getState().seedFromTaskStart({
        taskId,
        trackingSessionId: res.data.tracking.id,
        userId: assignee?.id ?? currentUserId,
        agentName: assigneeName,
        agentAvatarUrl: assigneeAvatar ?? undefined,
        taskTitle: res.data.task.title,
        taskAddress: res.data.task.address ?? res.data.task.location ?? undefined,
        destination:
          typeof res.data.task.latitude === 'number' &&
          typeof res.data.task.longitude === 'number'
            ? {
              lat: res.data.task.latitude,
              lng: res.data.task.longitude,
              radiusM: res.data.tracking.destination?.radius_meters ?? 75,
            }
            : undefined,
        position: [reading.longitude, reading.latitude],
        occurredAt: reading.recordedAt,
      });
      startTracking(taskId, companyId as number, token, {
        onArrived: () => toast.success("You've arrived at the destination!"),
        // onError/onStopped fall back to the provider's visible toasts.
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
    if (hasTrackableLocation) {
      if (activeTaskId !== taskId) {
        toast.error('Start tracking before completing the task.');
        return;
      }
      setShowCompleteSheet(true);
      return;
    }

    updateTaskStatus('completed');
  };

  const handleCompleteSuccess = () => {
    setShowCompleteSheet(false);
    onClose();
  };

  const statusConfig = {
    pending: { bg: '#FF9F6A', text: 'white', label: 'Pending' },
    'in-progress': { bg: '#3B63F8', text: 'white', label: 'In-Progress' },
    completed: { bg: '#4FD1C5', text: 'white', label: 'Completed' },
    cancelled: { bg: '#EF4444', text: 'white', label: 'Cancelled' },
  };

  const currentStatus = statusConfig[boardStatus as keyof typeof statusConfig] || statusConfig.pending;

  const updateTaskStatus = (nextStatus: 'in_progress' | 'completed' | 'cancelled') => {
    if (localTask) {
      localTask.onStatus(nextStatus);
      toast.success(`Task moved to ${nextStatus.replace('_', ' ')}`);
      if (nextStatus === 'cancelled') onClose();
      return;
    }
    if (!companyId) {
      toast.error('Company context is required.');
      return;
    }
    updateStatusMutation.mutate(
      { taskId, payload: { company_id: companyId, status: nextStatus } },
      nextStatus === 'cancelled' ? { onSuccess: onClose } : undefined,
    );
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

    if (!resolvedSelectedAgentId) {
      toast.error('Select an agent to assign this task.');
      return;
    }

    if (localTask) {
      const assignee = eligibleUsers.find((candidate) => String(candidate.id) === resolvedSelectedAgentId);
      if (!assignee || resolvedSelectedAgentId === checklist?.assigneeId) {
        toast.error('Select a different user for reassignment.');
        return;
      }
      localTask.onAssign({ id: Number(assignee.id), name: assignee.name });
      setSelectedAgentId('');
      setReassignmentReason('');
      toast.success('Demo task reassigned.');
      return;
    }

    if (Number(resolvedSelectedAgentId) === Number(detailQuery.data?.assigned_agent_id)) {
      toast.error('Select a different user for reassignment.');
      return;
    }

    assignTaskMutation.mutate({
      taskId,
      payload: {
        company_id: companyId,
        to_user_id: Number(resolvedSelectedAgentId),
        reason: reassignmentReason.trim() ? reassignmentReason.trim() : undefined,
      },
    });
  };

  const respondToReassignment = (decision: 'accept' | 'reject') => {
    if (!companyId || !pendingInboxRequest) {
      return;
    }

    if (decision === 'accept') {
      acceptReassignmentMutation.mutate({
        reassignmentId: pendingInboxRequest.id,
        payload: { company_id: companyId },
      });
      return;
    }

    rejectReassignmentMutation.mutate({
      reassignmentId: pendingInboxRequest.id,
      payload: { company_id: companyId },
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
        <div className={`relative w-full bg-[#eef0f3] overflow-hidden shrink-0 ${hasTrackableLocation ? 'h-44 md:h-55' : 'h-20'}`}>
          {hasTrackableLocation ? (
            <TaskLocationMap
              latitude={latitude}
              longitude={longitude}
              agentName={assigneeName}
              agentAvatar={assigneeAvatar}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <p className="text-[12px] text-gray-500">
                This task has no map destination. Update status from the actions below.
              </p>
            </div>
          )}

          {/* Status badge */}
          <div
            className="absolute top-3 right-3 px-3 py-1.5 rounded-xl text-[11px] font-bold shadow-md z-20"
            style={{ backgroundColor: currentStatus.bg, color: currentStatus.text }}
          >
            {currentStatus.label}
          </div>

          {/* Close button */}
          <button
            aria-label="Close task details"
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
                  {title}
                </p>
              </section>

              <section>
                <h3 className="text-[15px] font-bold text-dash-dark mb-1.5">
                  {locationText.startsWith("Created:") || locationText === "No location set" ? "Created" : "Location"}
                </h3>
                <p className={`text-[14px] leading-relaxed mb-3 ${
                  locationText.startsWith("Created:") || locationText === "No location set"
                    ? "text-gray-400 no-underline"
                    : "text-gray-500 underline decoration-gray-300 underline-offset-4"
                }`}>
                  {locationText.replace(/^Created:\s*/i, "")}
                </p>
                {hasTrackableLocation ? (
                  <button
                    onClick={() =>
                      router.push(
                        buildTaskMapUrl(
                          {
                            id: taskId,
                            latitude,
                            longitude,
                            location: locationText,
                            address: detailQuery.data?.address ?? task.address,
                          },
                          role,
                        ) ?? fullMapPath,
                      )
                    }
                    className="px-4 py-1.5 bg-dash-teal/15 text-[#3A8C88] rounded-full text-[12px] font-semibold hover:bg-dash-teal/25 transition-colors"
                  >
                    View on Full Map
                  </button>
                ) : (
                  <p className="text-[11px] text-gray-400">
                    Map tracking is unavailable without destination coordinates.
                  </p>
                )}
              </section>

              <section>
                <h3 className="text-[15px] font-bold text-dash-dark mb-1.5">Due Date</h3>
                <p className={`text-[14px] ${!isCompleted && !isCancelled && isOverdue(checklist?.dueAt) ? "text-red-600" : "text-gray-400"}`}>
                  {dueDateText}
                </p>
              </section>

              <section>
                <h3 className="text-[15px] font-bold text-dash-dark mb-1.5">Assigned By</h3>
                <p className="text-[14px] text-gray-400">
                  {assignedByText}
                </p>
              </section>

              <section>
                <h3 className="text-[15px] font-bold text-dash-dark mb-2">Observers</h3>
                {observers.length > 0 ? (
                  <ul className="flex flex-wrap gap-2">
                    {observers.map((observer) => (
                      <li
                        key={observer.id}
                        className="inline-flex items-center gap-2 rounded-full border border-gray-100 bg-gray-50 py-1 pl-1 pr-3 text-[13px] text-gray-600"
                      >
                        <ObserverAvatar person={observer} size={24} className="ring-0" />
                        {observer.name}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[14px] text-gray-400">No observers</p>
                )}
                {isObserver && (
                  <p className="mt-3 rounded-xl bg-[#E6F1F0] px-3 py-2 text-[12px] text-[#094B5C]">
                    You&apos;re observing this task. You can follow its progress and comment, but it isn&apos;t assigned to you.
                  </p>
                )}
              </section>
              {checklist && onToggleSubtask && onSaveSubtasks && (
                <ProjectChecklistSection
                  key={task.id}
                  checklist={{
                    ...checklist,
                    assigneeId: String(detailQuery.data?.assignee?.id ?? (checklist.assigneeId || currentUserId || "")),
                    assigneeName:
                      detailQuery.data?.assignee?.name ||
                      (checklist.assigneeName && checklist.assigneeName !== "Unassigned"
                        ? checklist.assigneeName
                        : assigneeName),
                  }}
                  userId={String(authUser?.id ?? "")}
                  locked={isCancelled}
                  agents={(internalUsers.length > 0 ? internalUsers : eligibleUsers).map((agent) => ({
                    id: String(agent.id),
                    name: agent.name,
                  }))}
                  onToggle={onToggleSubtask}
                  onSave={onSaveSubtasks}
                />
              )}
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
                      // Presentation-only empty state for legacy tasks; never persisted.
                      <p className="italic text-gray-400">No description provided.</p>
                    )
                  }
                </div>
              </section>

              {/* In-progress: note + actions */}
              {isInProgress && !isObserver && (
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
                  {role === 'agent' && (
                    <button
                      onClick={() => updateTaskStatus('cancelled')}
                      className="w-full px-4 py-2 rounded-xl border border-red-200 text-red-500 text-xs font-semibold hover:bg-red-50"
                    >
                      Cancel Task
                    </button>
                  )}
                </div>
              )}

              {/* Pending: commence or status-only */}
              {isPending && hasTrackableLocation && !isObserver && (
                <div className="mt-auto pt-6">
                  <button
                    onClick={handleCommenceAndTrack}
                    disabled={commencing}
                    className="w-full flex items-center justify-center gap-2 px-8 py-4 bg-[#7EB5AE] text-white rounded-[20px] text-[15px] font-semibold shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90 transition-all disabled:opacity-60"
                  >
                    {commencing && <Loader2 size={16} className="animate-spin" />}
                    {commencing ? 'Starting…' : 'Commence Task'}
                  </button>
                  {role === 'agent' && (
                    <button
                      onClick={() => updateTaskStatus('cancelled')}
                      className="w-full mt-2 px-4 py-2 rounded-xl border border-red-200 text-red-500 text-xs font-semibold hover:bg-red-50"
                    >
                      Cancel Task
                    </button>
                  )}
                </div>
              )}

              {isPending && !hasTrackableLocation && !isObserver && (
                <div className="mt-auto pt-6 space-y-2">
                  <button
                    onClick={() => updateTaskStatus('in_progress')}
                    disabled={updateStatusMutation.isPending}
                    className="w-full flex items-center justify-center gap-2 px-8 py-4 bg-[#7EB5AE] text-white rounded-[20px] text-[15px] font-semibold shadow-lg shadow-[#7EB5AE]/20 hover:opacity-90 transition-all disabled:opacity-60"
                  >
                    Start Task
                  </button>
                  {role === 'agent' && (
                    <button
                      onClick={() => updateTaskStatus('cancelled')}
                      className="w-full px-4 py-2 rounded-xl border border-red-200 text-red-500 text-xs font-semibold hover:bg-red-50"
                    >
                      Cancel Task
                    </button>
                  )}
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
              {isCancelled && (
                <div className="mt-auto pt-6">
                  <div className="w-full flex items-center justify-center gap-3 px-8 py-4 bg-red-50 text-red-500 rounded-[20px] text-[15px] font-semibold border border-red-100">
                    <CheckCircle size={20} />
                    Task Cancelled
                  </div>
                </div>
              )}
              {detailQuery.data?.proofs?.length && taskId && companyId ? (
                <TaskProofGallery
                  taskId={taskId}
                  companyId={companyId}
                  proofs={detailQuery.data.proofs}
                  canDownload={canDownloadProofs}
                  onProofReplaced={() => {
                    void detailQuery.refetch();
                  }}
                />
              ) : null}
              {localTask && <DemoTaskComments key={task.id} comments={localTask.comments} onComment={localTask.onComment} />}
              {taskId > 0 && (
                <TaskComments
                  taskId={taskId}
                  companyId={companyId ?? undefined}
                  className="mt-6 pt-5 border-t border-gray-100"
                />
              )}
              <div className={`mt-4 p-3 border border-gray-100 rounded-lg space-y-2 ${isObserver ? 'hidden' : ''}`}>
                <p className="text-[12px] font-bold text-dash-dark">Reassign Task</p>
                {hasPendingReassignment ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                    Pending request: {latestReassignment?.from_user?.name ?? 'Current owner'} →{' '}
                    {latestReassignment?.to_user?.name ?? 'New owner'}
                  </div>
                ) : null}
                <select
                  value={resolvedSelectedAgentId}
                  onChange={(event) => setSelectedAgentId(event.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white"
                  disabled={hasPendingReassignment}
                >
                  <option value="">Select agent</option>
                  {loadingInternalUsers ? (
                    <option value="" disabled>Loading agents...</option>
                  ) : (
                    eligibleUsers.map((candidate) => (
                      <option key={candidate.id} value={String(candidate.id)}>
                        {candidate.name} ({candidate.email})
                      </option>
                    ))
                  )}
                </select>
                <textarea
                  value={reassignmentReason}
                  onChange={(event) => setReassignmentReason(event.target.value)}
                  placeholder="Reason for reassignment (optional)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white min-h-20"
                  disabled={hasPendingReassignment}
                />
                <button
                  onClick={updateAssignment}
                  disabled={assignTaskMutation.isPending || hasPendingReassignment}
                  className="w-full px-4 py-2 rounded-lg bg-dash-dark text-white text-xs font-semibold disabled:opacity-60"
                >
                  {assignTaskMutation.isPending ? 'Sending Request...' : 'Request Reassignment'}
                </button>
                {canRespondToPendingRequest ? (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => respondToReassignment('accept')}
                      disabled={acceptReassignmentMutation.isPending || rejectReassignmentMutation.isPending}
                      className="px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold disabled:opacity-60"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => respondToReassignment('reject')}
                      disabled={acceptReassignmentMutation.isPending || rejectReassignmentMutation.isPending}
                      className="px-3 py-2 rounded-lg border border-red-200 text-red-600 text-xs font-semibold disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </div>
                ) : null}
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
          onSuccess={handleCompleteSuccess}
          onClose={() => setShowCompleteSheet(false)}
        />
      )}
    </div>
  );
}

function DemoTaskComments({ comments, onComment }: { comments: string[]; onComment: (body: string) => void }) {
  const [draft, setDraft] = useState("");
  return (
    <section className="mt-6 space-y-3 border-t border-gray-100 pt-5">
      <h3 className="text-[15px] font-bold text-dash-dark">Comments &amp; Feedback</h3>
      {comments.length ? (
        <ul className="space-y-2 text-sm text-gray-600">
          {comments.map((body, index) => <li key={index} className="whitespace-pre-wrap break-words rounded-lg bg-dash-bg p-3">{body}</li>)}
        </ul>
      ) : <p className="text-sm text-gray-400">No comments yet. Start the conversation below.</p>}
      <form className="space-y-2" onSubmit={(event) => {
        event.preventDefault();
        if (!draft.trim()) return;
        onComment(draft.trim());
        setDraft("");
      }}>
        <textarea aria-label="Write feedback or a reply" placeholder="Write feedback or a reply…" maxLength={TASK_COMMENT_MAX_LENGTH}
          className="w-full rounded-xl bg-dash-bg p-3 text-sm text-dash-dark" value={draft} onChange={(event) => setDraft(event.target.value)} />
        <button type="submit" disabled={!draft.trim()} className="rounded-lg bg-[#094B5C] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Post comment</button>
      </form>
    </section>
  );
}
