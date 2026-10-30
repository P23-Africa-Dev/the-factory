'use client';

import React, { useState, useCallback, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { format } from 'date-fns';
import {
  ChevronLeft,
  Plus,
  MoreVertical,
  MapPin,
  Calendar,
  Flag,
  Trash2,
  Edit2,
  Briefcase,
  Target,
  CheckCircle2,
  Clock,
  Play,
  XCircle,
  Search,
  UserPlus,
  ArrowRightLeft,
  FolderKanban,
  Users,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

import {
  useTaskList,
  flattenTaskPages,
  useCreateSelfTask,
  useUpdateTask,
  useDeleteTask,
  useUpdateTaskStatus,
  useTaskAssignees,
  useAssignTask,
  useTaskReassignmentsInbox,
  useRespondTaskReassignment,
  useProjects,
  useCreateProject,
  formatTaskLocationLabel,
} from '@/features/tasks';
import type { Task, TaskStatus } from '@/features/tasks';
import {
  useKpis,
  useCreateKpi,
  useDeleteKpi,
  useUpdateKpiStatus,
} from '@/features/kpis';
import type {
  Kpi,
  KpiStatus,
  KpiCategory,
  KpiPriority,
} from '@/features/kpis';
import { searchPlaces, type GeocodedPlace } from '@/lib/map/geocoding';
import { PlaceSearchCreditExhaustedError } from '@/lib/map/place-search';
import { getAttributionLine } from '@/lib/map/place-attribution';
import { toast } from '@/lib/toast';

type ActiveSection = 'tasks' | 'kpis' | 'reassignments' | 'projects';

const TASK_FILTER_TABS: Array<{ label: string; value: TaskStatus | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Pending', value: 'pending' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
  { label: 'Cancelled', value: 'cancelled' },
];

const KPI_FILTER_TABS: Array<{ label: string; value: KpiStatus | undefined }> = [
  { label: 'All', value: undefined },
  { label: 'Pending', value: 'pending' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
];

const TASK_TYPES = [
  { label: 'Sales Visit', value: 'sales_visit' },
  { label: 'Inspection', value: 'inspection' },
  { label: 'Delivery', value: 'delivery' },
  { label: 'Collection', value: 'collection' },
  { label: 'Awareness', value: 'awareness' },
] as const;

const PRIORITIES = [
  { label: 'Low', value: 'low', color: '#75ADAF' },
  { label: 'Medium', value: 'medium', color: '#F6C470' },
  { label: 'High', value: 'high', color: '#FD6046' },
  { label: 'Urgent', value: 'urgent', color: '#E74C3C' },
] as const;

const KPI_CATEGORIES: Array<{ label: string; value: KpiCategory }> = [
  { label: 'Sales', value: 'sales' },
  { label: 'Customer Visits', value: 'customer_visits' },
  { label: 'Lead Generation', value: 'lead_generation' },
  { label: 'Collection', value: 'collection' },
  { label: 'Survey', value: 'survey' },
  { label: 'Merchandising', value: 'merchandising' },
  { label: 'Others', value: 'others' },
];

type TaskType = (typeof TASK_TYPES)[number]['value'];
type Priority = (typeof PRIORITIES)[number]['value'];

function getStatusStyle(status: string): { bg: string; text: string; label: string } {
  switch (status) {
    case 'completed':
      return { bg: 'rgba(76,175,80,0.18)', text: '#4CAF50', label: 'Completed' };
    case 'in_progress':
    case 'resumed':
      return { bg: 'rgba(117,173,175,0.2)', text: '#75ADAF', label: 'In Progress' };
    case 'paused':
      return { bg: 'rgba(246,196,112,0.18)', text: '#F6C470', label: 'Paused' };
    case 'cancelled':
      return { bg: 'rgba(231,76,60,0.18)', text: '#E74C3C', label: 'Cancelled' };
    default:
      return { bg: 'rgba(255,255,255,0.1)', text: 'rgba(255,255,255,0.65)', label: 'Pending' };
  }
}

function getPriorityStyle(priority?: string): { color: string; label: string } {
  switch (priority) {
    case 'urgent':
    case 'critical':
      return { color: '#E74C3C', label: priority === 'critical' ? 'Critical' : 'Urgent' };
    case 'high':
      return { color: '#FD6046', label: 'High' };
    case 'medium':
      return { color: '#F6C470', label: 'Medium' };
    default:
      return { color: '#75ADAF', label: 'Low' };
  }
}

function ManagerTasksContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab = (searchParams.get('tab') as ActiveSection | null) ?? 'tasks';

  const [section, setSection] = useState<ActiveSection>(
    ['tasks', 'kpis', 'reassignments', 'projects'].includes(initialTab) ? initialTab : 'tasks',
  );
  const [taskFilter, setTaskFilter] = useState<TaskStatus | undefined>(undefined);
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');
  const [kpiFilter, setKpiFilter] = useState<KpiStatus | undefined>(undefined);

  // Task queries & mutations
  const {
    data: taskPages,
    isLoading: tasksLoading,
    refetch: refetchTasks,
    fetchNextPage: fetchNextTasksPage,
    hasNextPage: hasMoreTasks,
    isFetchingNextPage: isFetchingMoreTasks,
  } = useTaskList({
    status: taskFilter,
    assigned_to: assigneeFilter ? Number(assigneeFilter) : undefined,
  });
  const tasks = React.useMemo(() => flattenTaskPages(taskPages), [taskPages]);

  const { data: assignees = [] } = useTaskAssignees();
  const { data: reassignments = [], isLoading: reassignmentsLoading } = useTaskReassignmentsInbox();
  const { data: projects = [], isLoading: projectsLoading } = useProjects();

  const createTask = useCreateSelfTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const updateTaskStatus = useUpdateTaskStatus();
  const assignTaskMutation = useAssignTask();
  const respondReassignment = useRespondTaskReassignment();
  const createProjectMutation = useCreateProject();

  // KPI queries & mutations
  const {
    data: kpis = [],
    isLoading: kpisLoading,
  } = useKpis({
    status: kpiFilter,
    assigned_to_user_id: assigneeFilter ? Number(assigneeFilter) : undefined,
  });
  const createKpi = useCreateKpi();
  const deleteKpi = useDeleteKpi();
  const updateKpiStatus = useUpdateKpiStatus();

  const pendingReassignmentsCount = React.useMemo(
    () => reassignments.filter((r) => r.status === 'pending').length,
    [reassignments],
  );

  // Create Task modal state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<TaskType>('sales_visit');
  const [newDesc, setNewDesc] = useState('');
  const [newAddress, setNewAddress] = useState('');
  const [newPlaceCoords, setNewPlaceCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [newPlaceResults, setNewPlaceResults] = useState<GeocodedPlace[]>([]);
  const [newPlaceSearching, setNewPlaceSearching] = useState(false);
  const [placeCreditsExhausted, setPlaceCreditsExhausted] = useState(false);
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [newDueDate, setNewDueDate] = useState('');
  const [newAssigneeId, setNewAssigneeId] = useState<string>('');
  const [newProjectId, setNewProjectId] = useState<string>('');
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const placeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Edit Task modal state
  const [editTask, setEditTask] = useState<Task | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editAddress, setEditAddress] = useState('');

  // Reassign Task modal state
  const [reassignModalTask, setReassignModalTask] = useState<Task | null>(null);
  const [selectedReassignUserId, setSelectedReassignUserId] = useState<string>('');

  // Delete Task modal state
  const [deleteConfirmTask, setDeleteConfirmTask] = useState<Task | null>(null);
  const [menuTask, setMenuTask] = useState<Task | null>(null);

  // Create KPI modal state
  const [createKpiOpen, setCreateKpiOpen] = useState(false);
  const [kpiName, setKpiName] = useState('');
  const [kpiCategory, setKpiCategory] = useState<KpiCategory>('sales');
  const [kpiObjective, setKpiObjective] = useState('');
  const [kpiTargetValue, setKpiTargetValue] = useState('');
  const [kpiExpectedOutcome, setKpiExpectedOutcome] = useState('');
  const [kpiPriority, setKpiPriority] = useState<KpiPriority>('medium');
  const [kpiStartDate, setKpiStartDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));
  const [kpiEndDate, setKpiEndDate] = useState(() => format(new Date(Date.now() + 7 * 86400000), 'yyyy-MM-dd'));
  const [kpiAssigneeId, setKpiAssigneeId] = useState<string>('');
  const [selectedKpi, setSelectedKpi] = useState<Kpi | null>(null);

  // Create Project modal state
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDesc, setProjectDesc] = useState('');
  const [projectDueDate, setProjectDueDate] = useState('');

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setCreateModalOpen(true);
    }
  }, [searchParams]);

  // Debounced place search inside Create Task modal
  useEffect(() => {
    if (placeDebounceRef.current) clearTimeout(placeDebounceRef.current);
    const trimmed = newAddress.trim();
    if (!createModalOpen || newPlaceCoords !== null || trimmed.length < 2) {
      setNewPlaceResults([]);
      setNewPlaceSearching(false);
      return;
    }
    setNewPlaceSearching(true);
    placeDebounceRef.current = setTimeout(async () => {
      try {
        const results = await searchPlaces(trimmed);
        setPlaceCreditsExhausted(false);
        setNewPlaceResults(results);
      } catch (err) {
        if (err instanceof PlaceSearchCreditExhaustedError) {
          setPlaceCreditsExhausted(true);
        }
        setNewPlaceResults([]);
      } finally {
        setNewPlaceSearching(false);
      }
    }, 350);

    return () => {
      if (placeDebounceRef.current) clearTimeout(placeDebounceRef.current);
    };
  }, [newAddress, newPlaceCoords, createModalOpen]);

  const resetCreateForm = useCallback(() => {
    setNewTitle('');
    setNewType('sales_visit');
    setNewDesc('');
    setNewAddress('');
    setNewPlaceCoords(null);
    setNewPlaceResults([]);
    setNewPriority('medium');
    setNewDueDate('');
    setNewAssigneeId('');
    setNewProjectId('');
    setCreateErrors({});
  }, []);

  const handleCreateTask = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const errs: Record<string, string> = {};
      if (newTitle.trim().length < 3) errs.title = 'Title must be at least 3 characters';
      if (newDesc.trim().length < 5) errs.description = 'Description must be at least 5 characters';
      if (Object.keys(errs).length > 0) {
        setCreateErrors(errs);
        return;
      }
      setCreateErrors({});
      try {
        await createTask.mutateAsync({
          title: newTitle.trim(),
          type: newType,
          description: newDesc.trim(),
          address: newAddress.trim() || null,
          location: newAddress.trim() || null,
          latitude: newPlaceCoords?.latitude ?? null,
          longitude: newPlaceCoords?.longitude ?? null,
          priority: newPriority,
          due_date: newDueDate ? new Date(newDueDate).toISOString() : null,
          assigned_to: newAssigneeId ? Number(newAssigneeId) : null,
          assignee_ids: newAssigneeId ? [Number(newAssigneeId)] : undefined,
          project_id: newProjectId ? Number(newProjectId) : null,
        });
        setCreateModalOpen(false);
        resetCreateForm();
        void refetchTasks();
      } catch {
        // Error handled by mutation
      }
    },
    [
      newTitle,
      newType,
      newDesc,
      newAddress,
      newPlaceCoords,
      newPriority,
      newDueDate,
      newAssigneeId,
      newProjectId,
      createTask,
      resetCreateForm,
      refetchTasks,
    ],
  );

  const handleOpenEdit = useCallback((task: Task) => {
    setMenuTask(null);
    setEditTask(task);
    setEditTitle(task.title);
    setEditDesc(task.description ?? '');
    setEditAddress(task.address === '—' ? '' : task.address);
  }, []);

  const handleSaveEdit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editTask || editTitle.trim().length < 3) return;
      try {
        await updateTask.mutateAsync({
          id: editTask.id,
          title: editTitle.trim(),
          description: editDesc.trim() || undefined,
          address: editAddress.trim() || undefined,
          location: editAddress.trim() || undefined,
        });
        toast.success('Task updated');
        setEditTask(null);
        void refetchTasks();
      } catch {
        toast.error('Failed to update task');
      }
    },
    [editTask, editTitle, editDesc, editAddress, updateTask, refetchTasks],
  );

  const handleConfirmReassign = useCallback(async () => {
    if (!reassignModalTask || !selectedReassignUserId) return;
    try {
      await assignTaskMutation.mutateAsync({
        id: reassignModalTask.id,
        assigned_to: Number(selectedReassignUserId),
        assignee_ids: [Number(selectedReassignUserId)],
      });
      setReassignModalTask(null);
      setSelectedReassignUserId('');
      void refetchTasks();
    } catch {
      toast.error('Failed to assign task');
    }
  }, [reassignModalTask, selectedReassignUserId, assignTaskMutation, refetchTasks]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteConfirmTask) return;
    try {
      await deleteTask.mutateAsync(deleteConfirmTask.id);
      setDeleteConfirmTask(null);
      void refetchTasks();
    } catch {
      toast.error('Failed to delete task');
    }
  }, [deleteConfirmTask, deleteTask, refetchTasks]);

  const handleCreateKpiSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!kpiName.trim() || !kpiTargetValue.trim()) {
        toast.error('Name and target value are required');
        return;
      }
      try {
        await createKpi.mutateAsync({
          name: kpiName.trim(),
          category: kpiCategory,
          objective: kpiObjective.trim() || kpiName.trim(),
          target_value: kpiTargetValue.trim(),
          expected_outcome: kpiExpectedOutcome.trim() || kpiTargetValue.trim(),
          priority: kpiPriority,
          start_date: kpiStartDate,
          end_date: kpiEndDate,
          assigned_to_user_id: kpiAssigneeId ? Number(kpiAssigneeId) : null,
        });
        setCreateKpiOpen(false);
        setKpiName('');
        setKpiObjective('');
        setKpiTargetValue('');
        setKpiExpectedOutcome('');
        setKpiAssigneeId('');
      } catch {
        toast.error('Could not create KPI');
      }
    },
    [
      kpiName,
      kpiCategory,
      kpiObjective,
      kpiTargetValue,
      kpiExpectedOutcome,
      kpiPriority,
      kpiStartDate,
      kpiEndDate,
      kpiAssigneeId,
      createKpi,
    ],
  );

  const handleCreateProjectSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!projectName.trim()) return;
      try {
        await createProjectMutation.mutateAsync({
          name: projectName.trim(),
          description: projectDesc.trim() || undefined,
          due_date: projectDueDate || null,
        });
        setCreateProjectOpen(false);
        setProjectName('');
        setProjectDesc('');
        setProjectDueDate('');
      } catch {
        toast.error('Could not create project');
      }
    },
    [projectName, projectDesc, projectDueDate, createProjectMutation],
  );

  return (
    <div className="relative flex flex-col flex-1 min-h-screen bg-[#0A1D25] overflow-x-hidden pb-[120px] font-sans">
      <div
        className="fixed inset-0 z-0 bg-cover bg-center pointer-events-none opacity-35 mix-blend-overlay"
        style={{ backgroundImage: "url('/assets/home-background-gradient.png')" }}
      />
      <div className="fixed inset-0 z-0 bg-gradient-to-b from-[#0A1D25]/90 via-[#0D252F]/95 to-[#0A1D25] pointer-events-none" />

      <div className="relative z-10 flex flex-col flex-1 px-5 pt-4">
        {/* ─── Top Bar ─── */}
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center text-white hover:bg-white/12 active:scale-95 transition-all"
          >
            <ChevronLeft size={20} />
          </button>

          <h1 className="text-lg font-extrabold text-white tracking-tight">Operations Command</h1>

          {section === 'tasks' ? (
            <button
              onClick={() => setCreateModalOpen(true)}
              className="h-9 px-3.5 rounded-full bg-[#FD6046] hover:bg-[#E0533C] flex items-center gap-1 text-white text-xs font-bold shadow-md active:scale-95 transition-all"
            >
              <Plus size={15} className="stroke-[2.5]" />
              <span>Assign Task</span>
            </button>
          ) : section === 'kpis' ? (
            <button
              onClick={() => setCreateKpiOpen(true)}
              className="h-9 px-3.5 rounded-full bg-[#FD6046] hover:bg-[#E0533C] flex items-center gap-1 text-white text-xs font-bold shadow-md active:scale-95 transition-all"
            >
              <Plus size={15} className="stroke-[2.5]" />
              <span>New KPI</span>
            </button>
          ) : section === 'projects' ? (
            <button
              onClick={() => setCreateProjectOpen(true)}
              className="h-9 px-3.5 rounded-full bg-[#FD6046] hover:bg-[#E0533C] flex items-center gap-1 text-white text-xs font-bold shadow-md active:scale-95 transition-all"
            >
              <Plus size={15} className="stroke-[2.5]" />
              <span>Project</span>
            </button>
          ) : (
            <div className="w-10" />
          )}
        </div>

        {/* ─── 4-Tab Section Switcher: Tasks | KPIs | Reassignments | Projects ─── */}
        <div className="grid grid-cols-4 bg-[#0B3343] rounded-2xl p-1 mb-4 border border-white/8 gap-1">
          <button
            onClick={() => setSection('tasks')}
            className={`py-2 rounded-xl flex items-center justify-center gap-1 text-[11px] font-bold transition-all ${
              section === 'tasks' ? 'bg-[#75ADAF] text-[#0A1D25] shadow-md' : 'text-white/60'
            }`}
          >
            <Briefcase size={13} />
            <span>Tasks</span>
          </button>
          <button
            onClick={() => setSection('kpis')}
            className={`py-2 rounded-xl flex items-center justify-center gap-1 text-[11px] font-bold transition-all ${
              section === 'kpis' ? 'bg-[#75ADAF] text-[#0A1D25] shadow-md' : 'text-white/60'
            }`}
          >
            <Target size={13} />
            <span>KPIs</span>
          </button>
          <button
            onClick={() => setSection('reassignments')}
            className={`py-2 rounded-xl flex items-center justify-center gap-1 text-[11px] font-bold transition-all relative ${
              section === 'reassignments' ? 'bg-[#75ADAF] text-[#0A1D25] shadow-md' : 'text-white/60'
            }`}
          >
            <ArrowRightLeft size={13} />
            <span>Inbox</span>
            {pendingReassignmentsCount > 0 && (
              <span className="ml-0.5 rounded-full bg-[#FD6046] px-1.5 py-0.2 text-[9px] font-extrabold text-white">
                {pendingReassignmentsCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setSection('projects')}
            className={`py-2 rounded-xl flex items-center justify-center gap-1 text-[11px] font-bold transition-all ${
              section === 'projects' ? 'bg-[#75ADAF] text-[#0A1D25] shadow-md' : 'text-white/60'
            }`}
          >
            <FolderKanban size={13} />
            <span>Projects</span>
          </button>
        </div>

        {/* ─── Assignee Filter Bar (for Tasks & KPIs) ─── */}
        {(section === 'tasks' || section === 'kpis') && assignees.length > 0 && (
          <div className="mb-3 flex items-center gap-2">
            <Users size={14} className="text-[#75ADAF] shrink-0" />
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="flex-1 h-9 rounded-xl border border-white/10 bg-[#0B3343] px-3 text-xs font-semibold text-white outline-none focus:border-[#75ADAF]"
            >
              <option value="">All Team Members ({assignees.length})</option>
              {assignees.map((a) => (
                <option key={a.id} value={String(a.id)}>
                  {a.name} ({a.email})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ═══════════════════ TASKS SECTION ═══════════════════ */}
        {section === 'tasks' && (
          <>
            <div className="flex overflow-x-auto gap-2 pb-2 mb-4 scrollbar-none -mx-5 px-5">
              {TASK_FILTER_TABS.map((tab) => {
                const active = taskFilter === tab.value;
                return (
                  <button
                    key={tab.label}
                    onClick={() => setTaskFilter(tab.value)}
                    className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                      active
                        ? 'bg-[#75ADAF] text-[#0A1D25]'
                        : 'bg-[#0B3343] text-white/65 hover:text-white border border-white/8'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {tasksLoading ? (
              <div className="flex flex-col gap-3 mt-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-28 rounded-2xl bg-[#0B3343]/60 animate-pulse border border-white/5"
                  />
                ))}
              </div>
            ) : tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-full bg-[#0B3343] flex items-center justify-center mb-3 border border-white/10">
                  <Briefcase size={24} className="text-[#75ADAF]" />
                </div>
                <p className="text-base font-bold text-white mb-1">No tasks found</p>
                <p className="text-xs text-white/50 max-w-[240px] mb-5">
                  Create and assign tasks to your field agents to monitor their live progress.
                </p>
                <button
                  onClick={() => setCreateModalOpen(true)}
                  className="px-5 py-2.5 rounded-full bg-[#FD6046] text-white text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
                >
                  <Plus size={15} />
                  <span>Create &amp; Assign Task</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {tasks.map((task) => {
                  const statusBadge = getStatusStyle(task.status);
                  const priorityBadge = getPriorityStyle(task.priority);

                  return (
                    <div
                      key={task.id}
                      onClick={() => router.push(`/task/${task.id}`)}
                      className="relative bg-[#0B3343]/90 hover:bg-[#0E3B4D] border border-white/8 rounded-2xl p-4 cursor-pointer transition-all active:scale-[0.99] shadow-md"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ backgroundColor: statusBadge.bg, color: statusBadge.text }}
                          >
                            {statusBadge.label}
                          </span>
                          {task.priority && (
                            <span
                              className="flex items-center gap-1 text-[10px] font-bold"
                              style={{ color: priorityBadge.color }}
                            >
                              <Flag size={10} />
                              {priorityBadge.label}
                            </span>
                          )}
                          {task.assigneeName ? (
                            <span className="px-2 py-0.5 rounded-full bg-[#75ADAF]/15 text-[#75ADAF] text-[9px] font-bold">
                              👤 {task.assigneeName}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-[#FD6046]/15 text-[#FD6046] text-[9px] font-bold">
                              Unassigned
                            </span>
                          )}
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenuTask(task);
                          }}
                          className="w-7 h-7 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white"
                        >
                          <MoreVertical size={15} />
                        </button>
                      </div>

                      <h3 className="text-sm font-bold text-white mb-1 line-clamp-1">
                        {task.title}
                      </h3>

                      {task.description && (
                        <p className="text-xs text-white/55 line-clamp-2 mb-2.5">
                          {task.description}
                        </p>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-white/45 pt-2 border-t border-white/6">
                        <div className="flex items-center gap-1.5 truncate max-w-[65%]">
                          <MapPin size={12} className="text-[#75ADAF] shrink-0" />
                          <span className="truncate">{formatTaskLocationLabel(task)}</span>
                        </div>
                        {task.dueDate && (
                          <div className="flex items-center gap-1 shrink-0">
                            <Calendar size={11} className="text-white/40" />
                            <span>{format(new Date(task.dueDate), 'MMM d')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {hasMoreTasks && (
                  <button
                    type="button"
                    disabled={isFetchingMoreTasks}
                    onClick={() => void fetchNextTasksPage()}
                    className="mt-1 py-3 rounded-2xl bg-[#0B3343] border border-white/10 text-xs font-bold text-[#75ADAF] hover:bg-[#0E3B4D] disabled:opacity-50 transition-all"
                  >
                    {isFetchingMoreTasks ? 'Loading more tasks…' : 'Load more tasks'}
                  </button>
                )}
              </div>
            )}
          </>
        )}

        {/* ═══════════════════ KPIS SECTION ═══════════════════ */}
        {section === 'kpis' && (
          <>
            <div className="flex overflow-x-auto gap-2 pb-2 mb-4 scrollbar-none -mx-5 px-5">
              {KPI_FILTER_TABS.map((tab) => {
                const active = kpiFilter === tab.value;
                return (
                  <button
                    key={tab.label}
                    onClick={() => setKpiFilter(tab.value)}
                    className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                      active
                        ? 'bg-[#75ADAF] text-[#0A1D25]'
                        : 'bg-[#0B3343] text-white/65 hover:text-white border border-white/8'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {kpisLoading ? (
              <div className="flex flex-col gap-3 mt-2">
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="h-32 rounded-2xl bg-[#0B3343]/60 animate-pulse border border-white/5"
                  />
                ))}
              </div>
            ) : kpis.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-full bg-[#0B3343] flex items-center justify-center mb-3 border border-white/10">
                  <Target size={24} className="text-[#75ADAF]" />
                </div>
                <p className="text-base font-bold text-white mb-1">No KPIs found</p>
                <p className="text-xs text-white/50 max-w-[240px] mb-5">
                  Create and assign performance targets to your field agents.
                </p>
                <button
                  onClick={() => setCreateKpiOpen(true)}
                  className="px-5 py-2.5 rounded-full bg-[#FD6046] text-white text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all"
                >
                  <Plus size={15} />
                  <span>Create KPI</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {kpis.map((kpi) => {
                  const statusBadge = getStatusStyle(kpi.status);
                  const priorityBadge = getPriorityStyle(kpi.priority);

                  return (
                    <div
                      key={kpi.id}
                      onClick={() => setSelectedKpi(kpi)}
                      className="bg-[#0B3343]/90 hover:bg-[#0E3B4D] border border-white/8 rounded-2xl p-4 cursor-pointer transition-all active:scale-[0.99] shadow-md"
                    >
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="px-2.5 py-0.5 rounded-full text-[10px] font-bold"
                            style={{ backgroundColor: statusBadge.bg, color: statusBadge.text }}
                          >
                            {statusBadge.label}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-white/8 text-white/70 text-[10px] font-semibold capitalize">
                            {kpi.category.replace(/_/g, ' ')}
                          </span>
                          {kpi.assigneeName && (
                            <span className="px-2 py-0.5 rounded-full bg-[#75ADAF]/15 text-[#75ADAF] text-[9px] font-bold">
                              👤 {kpi.assigneeName}
                            </span>
                          )}
                        </div>
                        <span
                          className="flex items-center gap-1 text-[10px] font-bold"
                          style={{ color: priorityBadge.color }}
                        >
                          <Flag size={10} />
                          {priorityBadge.label}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-white mb-1">{kpi.name}</h3>
                      {kpi.objective && (
                        <p className="text-xs text-white/55 line-clamp-2 mb-2.5">{kpi.objective}</p>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-white/55 pt-2 border-t border-white/6">
                        <span>
                          Target: <strong className="text-white">{kpi.targetValue}</strong>
                        </span>
                        <span className="text-white/40">
                          {kpi.startDate ? format(new Date(kpi.startDate), 'MMM d') : ''} –{' '}
                          {kpi.endDate ? format(new Date(kpi.endDate), 'MMM d') : ''}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ═══════════════════ REASSIGNMENTS INBOX SECTION ═══════════════════ */}
        {section === 'reassignments' && (
          <div className="flex flex-col gap-3">
            {reassignmentsLoading ? (
              <div className="flex flex-col gap-3 mt-2">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-28 rounded-2xl bg-[#0B3343]/60 animate-pulse border border-white/5"
                  />
                ))}
              </div>
            ) : reassignments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-full bg-[#0B3343] flex items-center justify-center mb-3 border border-white/10">
                  <ArrowRightLeft size={24} className="text-[#75ADAF]" />
                </div>
                <p className="text-base font-bold text-white mb-1">Reassignment Inbox Clear</p>
                <p className="text-xs text-white/50 max-w-[240px]">
                  When field agents request to reassign a task, their requests appear here for your approval.
                </p>
              </div>
            ) : (
              reassignments.map((item) => {
                const isPending = item.status === 'pending';
                const taskTitle = item.task?.title ?? item.task_title ?? `Task #${item.task_id}`;
                const requester = item.from_user?.name ?? item.requester_name ?? 'Agent';
                const target = item.to_user?.name ?? item.target_name ?? 'Another Agent';

                return (
                  <div
                    key={item.id}
                    className="rounded-2xl border border-white/10 bg-[#0B3343]/90 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                            isPending
                              ? 'bg-[#FD6046]/20 text-[#FD6046]'
                              : item.status === 'accepted'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : 'bg-white/10 text-white/60'
                          }`}
                        >
                          {item.status}
                        </span>
                        <h3 className="mt-1.5 text-sm font-bold text-white">{taskTitle}</h3>
                        <p className="text-xs text-white/65 mt-0.5">
                          <strong className="text-white">{requester}</strong> →{' '}
                          <strong className="text-[#75ADAF]">{target}</strong>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => router.push(`/task/${item.task_id}`)}
                        className="text-xs font-semibold text-[#75ADAF] hover:underline"
                      >
                        View Task
                      </button>
                    </div>

                    {item.reason && (
                      <p className="rounded-xl bg-black/20 p-2.5 text-xs text-white/80">
                        “{item.reason}”
                      </p>
                    )}

                    {isPending && (
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          disabled={respondReassignment.isPending}
                          onClick={() =>
                            respondReassignment.mutate({
                              reassignmentId: item.id,
                              action: 'accept',
                            })
                          }
                          className="flex-1 h-10 rounded-xl bg-[#4CAF50] text-white text-xs font-bold active:scale-95 transition-transform disabled:opacity-50"
                        >
                          Accept &amp; Reassign
                        </button>
                        <button
                          type="button"
                          disabled={respondReassignment.isPending}
                          onClick={() =>
                            respondReassignment.mutate({
                              reassignmentId: item.id,
                              action: 'reject',
                            })
                          }
                          className="flex-1 h-10 rounded-xl bg-[#E74C3C]/20 border border-[#E74C3C]/40 text-[#E74C3C] text-xs font-bold active:scale-95 transition-transform disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* ═══════════════════ PROJECTS SECTION ═══════════════════ */}
        {section === 'projects' && (
          <div className="flex flex-col gap-3">
            {projectsLoading ? (
              <div className="flex flex-col gap-3 mt-2">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-24 rounded-2xl bg-[#0B3343]/60 animate-pulse border border-white/5"
                  />
                ))}
              </div>
            ) : projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-14 h-14 rounded-full bg-[#0B3343] flex items-center justify-center mb-3 border border-white/10">
                  <FolderKanban size={24} className="text-[#75ADAF]" />
                </div>
                <p className="text-base font-bold text-white mb-1">No Projects Yet</p>
                <p className="text-xs text-white/50 max-w-[240px] mb-4">
                  Group your field tasks and KPIs into projects to track campaign completion.
                </p>
                <button
                  type="button"
                  onClick={() => setCreateProjectOpen(true)}
                  className="px-5 py-2.5 rounded-full bg-[#FD6046] text-white text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus size={15} />
                  Create Project
                </button>
              </div>
            ) : (
              projects.map((proj) => (
                <div
                  key={proj.id}
                  className="rounded-2xl border border-white/10 bg-[#0B3343]/90 p-4"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white">{proj.name}</h3>
                    {proj.status && (
                      <span className="rounded-full bg-[#75ADAF]/20 px-2.5 py-0.5 text-[10px] font-bold text-[#75ADAF] capitalize">
                        {proj.status}
                      </span>
                    )}
                  </div>
                  {proj.description && (
                    <p className="mt-1 text-xs text-white/60 line-clamp-2">{proj.description}</p>
                  )}
                  <div className="mt-3 flex items-center justify-between text-[11px] text-white/50 border-t border-white/8 pt-2">
                    <span>{proj.tasks_count ?? 0} linked tasks</span>
                    {proj.due_date && (
                      <span>Due {format(new Date(proj.due_date), 'MMM d, yyyy')}</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ─── Task Action Sheet (Assign / Status / Edit / Delete) ─── */}
      <AnimatePresence>
        {menuTask && (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60">
            <div className="absolute inset-0" onClick={() => setMenuTask(null)} />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="relative z-10 w-full max-w-md bg-[#0D252F] rounded-t-3xl p-5 pb-9 border-t border-white/10 space-y-2"
            >
              <div className="w-9 h-1 rounded-full bg-white/25 mx-auto mb-3" />
              <p className="text-sm font-bold text-white px-2 mb-2 truncate">{menuTask.title}</p>

              <button
                onClick={() => {
                  const target = menuTask;
                  setMenuTask(null);
                  setReassignModalTask(target);
                  setSelectedReassignUserId(
                    target.assignedAgentId ? String(target.assignedAgentId) : '',
                  );
                }}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl hover:bg-white/5 text-white text-sm font-semibold"
              >
                <UserPlus size={16} className="text-[#75ADAF]" />
                <span>Assign / Reassign Agent</span>
              </button>

              {menuTask.status !== 'completed' && (
                <button
                  onClick={() => {
                    const id = menuTask.id;
                    setMenuTask(null);
                    updateTaskStatus.mutate({ id, status: 'completed' });
                  }}
                  className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl hover:bg-white/5 text-[#4CAF50] text-sm font-semibold"
                >
                  <CheckCircle2 size={16} />
                  <span>Mark Task Completed</span>
                </button>
              )}

              <button
                onClick={() => handleOpenEdit(menuTask)}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl hover:bg-white/5 text-white text-sm font-semibold"
              >
                <Edit2 size={16} className="text-[#75ADAF]" />
                <span>Edit Task</span>
              </button>

              <button
                onClick={() => {
                  const t = menuTask;
                  setMenuTask(null);
                  setDeleteConfirmTask(t);
                }}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-xl hover:bg-white/5 text-[#E74C3C] text-sm font-semibold"
              >
                <Trash2 size={16} />
                <span>Delete Task</span>
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Assign / Reassign Agent Modal ─── */}
      <AnimatePresence>
        {reassignModalTask && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 px-5">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="w-full max-w-sm bg-[#0D252F] border border-white/10 rounded-3xl p-6"
            >
              <h3 className="text-base font-bold text-white mb-1">Assign Task to Agent</h3>
              <p className="text-xs text-white/60 mb-4 truncate">{reassignModalTask.title}</p>

              <select
                value={selectedReassignUserId}
                onChange={(e) => setSelectedReassignUserId(e.target.value)}
                className="w-full h-11 rounded-xl bg-white/8 border border-white/12 px-3.5 text-sm text-white outline-none focus:border-[#75ADAF] mb-5"
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
                  onClick={() => setReassignModalTask(null)}
                  className="flex-1 h-11 rounded-xl bg-white/10 text-white text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!selectedReassignUserId || assignTaskMutation.isPending}
                  onClick={() => void handleConfirmReassign()}
                  className="flex-1 h-11 rounded-xl bg-[#FD6046] text-white text-xs font-bold disabled:opacity-50"
                >
                  {assignTaskMutation.isPending ? 'Assigning…' : 'Confirm'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Create & Assign Task Modal ─── */}
      <AnimatePresence>
        {createModalOpen && (
          <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/65">
            <div className="absolute inset-0" onClick={() => setCreateModalOpen(false)} />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 240 }}
              className="relative z-10 w-full max-w-md bg-[#0A1D25] rounded-t-3xl border-t border-white/10 px-5 pt-4 pb-9 max-h-[90vh] overflow-y-auto"
            >
              <div className="w-9 h-1 rounded-full bg-white/25 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-4">Create &amp; Assign Task</h3>

              <form onSubmit={handleCreateTask} className="space-y-4">
                {/* Assignee selector */}
                <div>
                  <label className="text-xs font-semibold text-[#75ADAF] mb-1.5 block">
                    Assign to Field Agent
                  </label>
                  <select
                    value={newAssigneeId}
                    onChange={(e) => setNewAssigneeId(e.target.value)}
                    className="w-full h-11 rounded-xl bg-[#0B2330] border border-white/12 px-3.5 text-sm text-white outline-none focus:border-[#75ADAF]"
                  >
                    <option value="">Unassigned (Assign later)</option>
                    {assignees.map((agent) => (
                      <option key={agent.id} value={String(agent.id)}>
                        {agent.name} ({agent.email})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Project selector */}
                {projects.length > 0 && (
                  <div>
                    <label className="text-xs font-semibold text-[#75ADAF] mb-1.5 block">
                      Project (Optional)
                    </label>
                    <select
                      value={newProjectId}
                      onChange={(e) => setNewProjectId(e.target.value)}
                      className="w-full h-11 rounded-xl bg-[#0B2330] border border-white/12 px-3.5 text-sm text-white outline-none focus:border-[#75ADAF]"
                    >
                      <option value="">No project</option>
                      {projects.map((p) => (
                        <option key={p.id} value={String(p.id)}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="text-xs font-semibold text-[#75ADAF] mb-1.5 block">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="e.g. Client site inspection at Lekki"
                    className="w-full h-11 rounded-xl bg-white/6 border border-white/12 px-3.5 text-sm text-white placeholder-white/35 outline-none focus:border-[#75ADAF]"
                  />
                  {createErrors.title && (
                    <p className="text-[11px] text-[#E74C3C] mt-1">{createErrors.title}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#75ADAF] mb-1.5 block">
                    Task Type
                  </label>
                  <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-none">
                    {TASK_TYPES.map((t) => (
                      <button
                        key={t.value}
                        type="button"
                        onClick={() => setNewType(t.value)}
                        className={`px-3.5 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                          newType === t.value
                            ? 'bg-[#75ADAF] text-[#0A1D25] font-bold'
                            : 'bg-white/8 text-white/65'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#75ADAF] mb-1.5 block">
                    Description *
                  </label>
                  <textarea
                    rows={3}
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Describe instructions and deliverables for the agent..."
                    className="w-full rounded-xl bg-white/6 border border-white/12 p-3.5 text-sm text-white placeholder-white/35 outline-none focus:border-[#75ADAF] resize-none"
                  />
                  {createErrors.description && (
                    <p className="text-[11px] text-[#E74C3C] mt-1">{createErrors.description}</p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#75ADAF] mb-1.5 block">
                    Location / Address
                  </label>
                  <div className="relative">
                    <Search
                      size={15}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none"
                    />
                    <input
                      type="text"
                      value={newAddress}
                      onChange={(e) => {
                        setNewAddress(e.target.value);
                        setNewPlaceCoords(null);
                      }}
                      placeholder="Search address or landmark..."
                      className="w-full h-11 rounded-xl bg-white/6 border border-white/12 pl-9 pr-8 text-sm text-white placeholder-white/35 outline-none focus:border-[#75ADAF]"
                    />
                  </div>

                  {!newPlaceSearching && newPlaceResults.length > 0 && (
                    <div className="mt-1.5 rounded-xl bg-[#0D252F] border border-white/10 max-h-44 overflow-y-auto divide-y divide-white/5">
                      {newPlaceResults.map((place) => (
                        <button
                          key={place.id}
                          type="button"
                          onClick={() => {
                            setNewAddress(
                              place.address ? `${place.name} — ${place.address}` : place.name,
                            );
                            setNewPlaceCoords({
                              latitude: place.latitude,
                              longitude: place.longitude,
                            });
                            setNewPlaceResults([]);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-white/5 transition-colors"
                        >
                          <MapPin size={14} className="text-[#75ADAF] shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-white truncate">
                              {place.name}
                            </p>
                            <p className="text-[11px] text-white/50 truncate">{place.address}</p>
                          </div>
                        </button>
                      ))}
                      {getAttributionLine(newPlaceResults) && (
                        <p className="text-[10px] text-white/35 text-right px-3 py-1">
                          {getAttributionLine(newPlaceResults)}
                        </p>
                      )}
                    </div>
                  )}
                  {placeCreditsExhausted && (
                    <p className="text-[11px] text-amber-300/80 mt-1.5">
                      Place search is temporarily unavailable. Enter the address manually.
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#75ADAF] mb-1.5 block">
                    Priority
                  </label>
                  <div className="flex gap-2">
                    {PRIORITIES.map((p) => (
                      <button
                        key={p.value}
                        type="button"
                        onClick={() => setNewPriority(p.value)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border transition-all ${
                          newPriority === p.value
                            ? 'bg-white/15 border-white/30 text-white'
                            : 'bg-white/5 border-white/8 text-white/50'
                        }`}
                        style={
                          newPriority === p.value
                            ? { borderColor: p.color, color: p.color }
                            : undefined
                        }
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#75ADAF] mb-1.5 block">
                    Due Date (Optional)
                  </label>
                  <input
                    type="datetime-local"
                    value={newDueDate}
                    onChange={(e) => setNewDueDate(e.target.value)}
                    className="w-full h-11 rounded-xl bg-white/6 border border-white/12 px-3.5 text-sm text-white outline-none focus:border-[#75ADAF]"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCreateModalOpen(false);
                      resetCreateForm();
                    }}
                    className="flex-1 h-12 rounded-xl bg-white/8 text-white text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createTask.isPending}
                    className="flex-1 h-12 rounded-xl bg-[#FD6046] hover:bg-[#E0533C] text-white text-sm font-bold flex items-center justify-center disabled:opacity-50"
                  >
                    {createTask.isPending ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      'Create & Assign'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Create & Assign KPI Modal ─── */}
      <AnimatePresence>
        {createKpiOpen && (
          <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/65">
            <div className="absolute inset-0" onClick={() => setCreateKpiOpen(false)} />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 240 }}
              className="relative z-10 w-full max-w-md bg-[#0A1D25] rounded-t-3xl border-t border-white/10 px-5 pt-4 pb-9 max-h-[90vh] overflow-y-auto"
            >
              <div className="w-9 h-1 rounded-full bg-white/25 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-4">Create &amp; Assign KPI</h3>

              <form onSubmit={handleCreateKpiSubmit} className="space-y-3.5">
                <div>
                  <label className="text-xs font-semibold text-[#75ADAF] mb-1 block">
                    Assign to Field Agent
                  </label>
                  <select
                    value={kpiAssigneeId}
                    onChange={(e) => setKpiAssigneeId(e.target.value)}
                    className="w-full h-11 rounded-xl bg-[#0B2330] border border-white/12 px-3.5 text-sm text-white outline-none focus:border-[#75ADAF]"
                  >
                    <option value="">Team / Unassigned</option>
                    {assignees.map((a) => (
                      <option key={a.id} value={String(a.id)}>
                        {a.name} ({a.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#75ADAF] mb-1 block">
                    KPI Name *
                  </label>
                  <input
                    type="text"
                    value={kpiName}
                    onChange={(e) => setKpiName(e.target.value)}
                    placeholder="e.g. Monthly Enterprise Lead Signups"
                    className="w-full h-11 rounded-xl bg-white/6 border border-white/12 px-3.5 text-sm text-white outline-none focus:border-[#75ADAF]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs font-semibold text-[#75ADAF] mb-1 block">
                      Category
                    </label>
                    <select
                      value={kpiCategory}
                      onChange={(e) => setKpiCategory(e.target.value as KpiCategory)}
                      className="w-full h-11 rounded-xl bg-[#0B2330] border border-white/12 px-3 text-xs text-white outline-none"
                    >
                      {KPI_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-[#75ADAF] mb-1 block">
                      Target Value *
                    </label>
                    <input
                      type="text"
                      value={kpiTargetValue}
                      onChange={(e) => setKpiTargetValue(e.target.value)}
                      placeholder="e.g. 25 visits"
                      className="w-full h-11 rounded-xl bg-white/6 border border-white/12 px-3 text-sm text-white outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#75ADAF] mb-1 block">
                    Objective
                  </label>
                  <textarea
                    rows={2}
                    value={kpiObjective}
                    onChange={(e) => setKpiObjective(e.target.value)}
                    placeholder="What should the agent achieve?"
                    className="w-full rounded-xl bg-white/6 border border-white/12 p-3 text-sm text-white outline-none resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-xs font-semibold text-[#75ADAF] mb-1 block">
                      Start Date
                    </label>
                    <input
                      type="date"
                      value={kpiStartDate}
                      onChange={(e) => setKpiStartDate(e.target.value)}
                      className="w-full h-11 rounded-xl bg-white/6 border border-white/12 px-3 text-xs text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-[#75ADAF] mb-1 block">
                      End Date
                    </label>
                    <input
                      type="date"
                      value={kpiEndDate}
                      onChange={(e) => setKpiEndDate(e.target.value)}
                      className="w-full h-11 rounded-xl bg-white/6 border border-white/12 px-3 text-xs text-white outline-none"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setCreateKpiOpen(false)}
                    className="flex-1 h-11 rounded-xl bg-white/8 text-white text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createKpi.isPending}
                    className="flex-1 h-11 rounded-xl bg-[#FD6046] text-white text-xs font-bold disabled:opacity-50"
                  >
                    {createKpi.isPending ? 'Creating…' : 'Create KPI'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Create Project Modal ─── */}
      <AnimatePresence>
        {createProjectOpen && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/65 px-5">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="w-full max-w-sm bg-[#0D252F] border border-white/10 rounded-3xl p-6"
            >
              <h3 className="text-base font-bold text-white mb-4">Create New Project</h3>
              <form onSubmit={handleCreateProjectSubmit} className="space-y-3.5">
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Project Name *"
                  className="w-full h-11 rounded-xl bg-white/8 border border-white/12 px-3.5 text-sm text-white outline-none"
                />
                <textarea
                  rows={2}
                  value={projectDesc}
                  onChange={(e) => setProjectDesc(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full rounded-xl bg-white/8 border border-white/12 p-3 text-sm text-white outline-none resize-none"
                />
                <input
                  type="date"
                  value={projectDueDate}
                  onChange={(e) => setProjectDueDate(e.target.value)}
                  className="w-full h-11 rounded-xl bg-white/8 border border-white/12 px-3.5 text-sm text-white outline-none"
                />
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setCreateProjectOpen(false)}
                    className="flex-1 h-11 rounded-xl bg-white/10 text-white text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createProjectMutation.isPending}
                    className="flex-1 h-11 rounded-xl bg-[#FD6046] text-white text-xs font-bold"
                  >
                    {createProjectMutation.isPending ? 'Creating…' : 'Create'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Edit Task Modal ─── */}
      <AnimatePresence>
        {editTask && (
          <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/65">
            <div className="absolute inset-0" onClick={() => setEditTask(null)} />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 240 }}
              className="relative z-10 w-full max-w-md bg-[#0A1D25] rounded-t-3xl border-t border-white/10 px-5 pt-4 pb-9"
            >
              <div className="w-9 h-1 rounded-full bg-white/25 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-white mb-4">Edit Task</h3>

              <form onSubmit={handleSaveEdit} className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-[#75ADAF] mb-1.5 block">
                    Title *
                  </label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full h-11 rounded-xl bg-white/6 border border-white/12 px-3.5 text-sm text-white outline-none focus:border-[#75ADAF]"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#75ADAF] mb-1.5 block">
                    Description
                  </label>
                  <textarea
                    rows={3}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className="w-full rounded-xl bg-white/6 border border-white/12 p-3.5 text-sm text-white outline-none focus:border-[#75ADAF] resize-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-[#75ADAF] mb-1.5 block">
                    Location / Address
                  </label>
                  <input
                    type="text"
                    value={editAddress}
                    onChange={(e) => setEditAddress(e.target.value)}
                    className="w-full h-11 rounded-xl bg-white/6 border border-white/12 px-3.5 text-sm text-white outline-none focus:border-[#75ADAF]"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditTask(null)}
                    className="flex-1 h-12 rounded-xl bg-white/8 text-white text-sm font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={updateTask.isPending}
                    className="flex-1 h-12 rounded-xl bg-[#75ADAF] text-[#0A1D25] text-sm font-bold flex items-center justify-center disabled:opacity-50"
                  >
                    {updateTask.isPending ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#0A1D25] border-t-transparent" />
                    ) : (
                      'Save Changes'
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── Delete Confirmation Modal ─── */}
      <AnimatePresence>
        {deleteConfirmTask && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/65 px-5">
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="w-full max-w-sm bg-[#0D252F] border border-white/10 rounded-3xl p-6 text-center"
            >
              <div className="w-12 h-12 rounded-full bg-[#E74C3C]/15 flex items-center justify-center mx-auto mb-3">
                <Trash2 size={22} className="text-[#E74C3C]" />
              </div>
              <h3 className="text-base font-bold text-white mb-1.5">Delete Task?</h3>
              <p className="text-xs text-white/60 mb-5">
                Are you sure you want to delete &ldquo;{deleteConfirmTask.title}&rdquo;?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeleteConfirmTask(null)}
                  className="flex-1 h-11 rounded-xl bg-white/10 text-white text-xs font-bold"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleConfirmDelete()}
                  disabled={deleteTask.isPending}
                  className="flex-1 h-11 rounded-xl bg-[#E74C3C] text-white text-xs font-bold flex items-center justify-center"
                >
                  {deleteTask.isPending ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ─── KPI Details Bottom Sheet ─── */}
      <AnimatePresence>
        {selectedKpi && (
          <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/65">
            <div className="absolute inset-0" onClick={() => setSelectedKpi(null)} />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 240 }}
              className="relative z-10 w-full max-w-md bg-[#0D252F] rounded-t-3xl border-t border-white/10 p-5 pb-9 max-h-[85vh] overflow-y-auto"
            >
              <div className="w-9 h-1 rounded-full bg-white/25 mx-auto mb-4" />
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="px-2.5 py-1 rounded-full bg-[#75ADAF]/20 text-[#75ADAF] text-xs font-bold capitalize">
                  {selectedKpi.category.replace(/_/g, ' ')}
                </span>
                <span
                  className="px-2.5 py-1 rounded-full text-xs font-bold"
                  style={{
                    backgroundColor: getStatusStyle(selectedKpi.status).bg,
                    color: getStatusStyle(selectedKpi.status).text,
                  }}
                >
                  {getStatusStyle(selectedKpi.status).label}
                </span>
              </div>

              <h3 className="text-lg font-extrabold text-white mb-2">{selectedKpi.name}</h3>

              {selectedKpi.assigneeName && (
                <p className="text-xs text-[#75ADAF] font-semibold mb-3">
                  Assigned to: {selectedKpi.assigneeName}
                </p>
              )}

              {selectedKpi.objective && (
                <div className="bg-white/5 rounded-xl p-3.5 mb-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[#75ADAF] block mb-1">
                    Objective
                  </span>
                  <p className="text-xs text-white/80 leading-relaxed">{selectedKpi.objective}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5 mb-5">
                <div className="bg-white/5 rounded-xl p-3">
                  <span className="text-[10px] text-white/45 block">Target Value</span>
                  <span className="text-sm font-bold text-white">{selectedKpi.targetValue}</span>
                </div>
                <div className="bg-white/5 rounded-xl p-3">
                  <span className="text-[10px] text-white/45 block">Priority</span>
                  <span
                    className="text-sm font-bold capitalize"
                    style={{ color: getPriorityStyle(selectedKpi.priority).color }}
                  >
                    {selectedKpi.priority}
                  </span>
                </div>
              </div>

              <p className="text-xs font-bold text-white/50 uppercase tracking-wider mb-2">
                Update KPI Status
              </p>
              <div className="grid grid-cols-2 gap-2 mb-3">
                {(
                  [
                    { label: 'Pending', value: 'pending', icon: Clock },
                    { label: 'In Progress', value: 'in_progress', icon: Play },
                    { label: 'Completed', value: 'completed', icon: CheckCircle2 },
                    { label: 'Cancelled', value: 'cancelled', icon: XCircle },
                  ] as const
                ).map((opt) => {
                  const Icon = opt.icon;
                  const active = selectedKpi.status === opt.value;
                  return (
                    <button
                      key={opt.value}
                      disabled={active || updateKpiStatus.isPending}
                      onClick={async () => {
                        try {
                          const updated = await updateKpiStatus.mutateAsync({
                            kpiId: selectedKpi.id,
                            status: opt.value,
                          });
                          setSelectedKpi(updated);
                          toast.success(`KPI marked as ${opt.label}`);
                        } catch {
                          toast.error('Failed to update KPI status');
                        }
                      }}
                      className={`h-11 rounded-xl flex items-center justify-center gap-2 text-xs font-bold border transition-all ${
                        active
                          ? 'bg-[#75ADAF] text-[#0A1D25] border-[#75ADAF]'
                          : 'bg-white/5 text-white/75 border-white/10 hover:bg-white/10'
                      }`}
                    >
                      <Icon size={14} />
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              <button
                type="button"
                disabled={deleteKpi.isPending}
                onClick={async () => {
                  await deleteKpi.mutateAsync(selectedKpi.id);
                  setSelectedKpi(null);
                }}
                className="w-full h-11 rounded-xl bg-[#E74C3C]/15 border border-[#E74C3C]/40 text-[#E74C3C] text-xs font-bold flex items-center justify-center gap-2"
              >
                <Trash2 size={14} />
                Delete KPI
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function TasksScreen() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center min-h-screen bg-[#0A1D25]">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
        </div>
      }
    >
      <ManagerTasksContent />
    </Suspense>
  );
}
