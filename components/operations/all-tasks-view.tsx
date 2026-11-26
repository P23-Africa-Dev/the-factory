'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Search, SlidersHorizontal, BookmarkPlus, User } from 'lucide-react';
import Arrow57Deg from '@/assets/images/arrow-57deg.png';
import { arrayMove } from '@dnd-kit/sortable';
import { KpiBoard } from './kpi-board';
import { CreateKpiModal } from './create-kpi-modal';
import { KpiDetailsModal } from './kpi-details-modal';
import { EditKpiModal } from './edit-kpi-modal';
import ConfirmDeleteModal from '@/components/ui/confirm-delete-modal';
import { useAuthStore } from '@/store/auth';
import { useDeleteKpi, useKpis, useUpdateKpiStatus } from '@/hooks/use-kpi';
import { getActiveCompanyContext } from '@/lib/company-context';
import { getApiErrorMessage } from '@/lib/api/errors';
import { isTaskManagerRole } from '@/lib/tasks/board-permissions';
import type { DndContainer, DndItem } from '@/types/operations';
import { TaskBoardSkeleton } from './skeletons/task-board-skeleton';
import type { KpiItem, KpiStatus, KpiStatusCards } from '@/lib/api/kpi';
import { toast } from 'sonner';
import { useSearchParams } from 'next/navigation';
import { moveCardToColumn } from "@/lib/dnd/board-moves";
// import { OperationsCalendar } from './operations-calendar';

// ─── KPI Stats Panel ──────────────────────────────────────────────────────────
const KPI_ARC_LENGTH = 188.5;
const KPI_CIRCUMFERENCE = 251.3;

function formatKpiCount(value: number): string {
  return String(value).padStart(3, '0');
}

function KpiStatsPanel({
  statusCards,
  containers,
}: {
  statusCards?: KpiStatusCards;
  containers: DndContainer[];
}) {
  const pending = statusCards?.cards.find((c) => c.id === 'pending')?.count
    ?? containers.find((c) => c.id === 'pending')?.items.length
    ?? 0;
  const inProgress = statusCards?.cards.find((c) => c.id === 'in-progress')?.count
    ?? containers.find((c) => c.id === 'in-progress')?.items.length
    ?? 0;
  const completed = statusCards?.cards.find((c) => c.id === 'completed')?.count
    ?? containers.find((c) => c.id === 'completed')?.items.length
    ?? 0;
  const cancelled = statusCards?.cards.find((c) => c.id === 'cancelled')?.count
    ?? containers.find((c) => c.id === 'cancelled')?.items.length
    ?? 0;
  const total = statusCards?.total ?? pending + inProgress + completed + cancelled;
  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  const completionRate = statusCards?.completion_rate ?? pct(completed);

  const [animatedPct, setAnimatedPct] = useState(0);
  useEffect(() => {
    const duration = 1200;
    const start = performance.now();
    const target = completionRate;
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
    let raf: number;
    function frame(now: number) {
      const t = Math.min((now - start) / duration, 1);
      setAnimatedPct(ease(t) * target);
      if (t < 1) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [completionRate]);

  const animatedDash = (animatedPct / 100) * KPI_ARC_LENGTH;
  const dotAngle = (animatedPct / 100) * 270 * (Math.PI / 180);
  const dotX = 50 + 40 * Math.cos(dotAngle);
  const dotY = 50 + 40 * Math.sin(dotAngle);
  const completedPct = pct(completed);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto] gap-4 animate-in fade-in slide-in-from-bottom-4 duration-700">

      {/* Performance */}
      <div className="se-stat-card rounded-[20px] p-5 sm:p-6 relative flex flex-col sm:flex-row items-center text-center sm:text-left gap-4 sm:gap-6 overflow-hidden">
        <div className="relative w-28 h-28 sm:w-41.5 sm:h-41.5 shrink-0">
          <svg viewBox="0 0 100 100" className="w-full h-full" style={{ transform: 'rotate(135deg)' }}>
            <circle cx="50" cy="50" r="40" fill="none" stroke="#6B9A9A" strokeOpacity="0.3" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${KPI_ARC_LENGTH} ${KPI_CIRCUMFERENCE}`} />
            <circle cx="50" cy="50" r="40" fill="none" stroke="white" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${KPI_ARC_LENGTH} ${KPI_CIRCUMFERENCE}`} />
            <circle cx="50" cy="50" r="40" fill="none" stroke="#6B9A9A" strokeWidth="6" strokeLinecap="round" strokeDasharray={`${animatedDash} ${KPI_CIRCUMFERENCE}`} />
            <circle cx={dotX} cy={dotY} r="3" fill="#fff" stroke="#7BB6B8" strokeWidth="4px" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5 sm:gap-1">
            <div className="w-7 h-7 sm:w-10 sm:h-10 rounded-full bg-[#EF6C55] flex items-center justify-center shadow-lg">
              <User className="text-white fill-current w-3 h-3 sm:w-4.5 sm:h-4.5" />
            </div>
            <span className="text-white font-semibold text-[24px] sm:text-[30px] leading-none">
              {completionRate}%
            </span>
          </div>
        </div>
        <div className="flex flex-col z-10 text-white min-w-0">
          <p className="text-[#E8E8E8] font-normal text-[12px] sm:text-[14px] lg:text-[16px] leading-tight mb-0.5">
            Overall KPI
          </p>
          <h2 className="text-[20px] sm:text-[22px] xl:text-[30px] font-semibold leading-[1.1] mb-2 sm:mb-4 tracking-tight">
            Performance
          </h2>
          <p className="text-[11px] sm:text-[14px] font-medium text-[#E8E8E8]/80">
            Status:{' '}
            <span className="text-white font-semibold">
              {completionRate >= 80 ? 'Excellent' : completionRate >= 60 ? 'Good' : completionRate >= 40 ? 'Fair' : 'Poor'}
            </span>
          </p>
        </div>
      </div>

      {/* Pending KPIs */}
      <div className="se-stat-card px-5 sm:px-6 pb-3 rounded-[20px] overflow-hidden relative flex flex-col min-h-45 w-full min-w-0">
        <div className="flex items-start justify-between pt-5 sm:pt-6">
          <div>
            <p className="text-[14px] font-medium text-[#f8f8f8]">Pending KPIs</p>
            <h2 className="text-[64px] font-bold text-white leading-none tracking-[-0.04em]">
              {formatKpiCount(pending)}
            </h2>
          </div>
          <span className="flex items-center gap-1 px-2.5 py-1.5 h-4 bg-[#EF8E5B] text-white rounded-full text-[7px] mt-1">
            All
            <Image src={Arrow57Deg} alt="" width={7.5} height={7.5} />
          </span>
        </div>
      </div>

      {/* In Progress KPIs */}
      <div className="se-stat-card px-5 sm:px-6 pb-3 rounded-[20px] overflow-hidden relative flex flex-col min-h-45 w-full min-w-0">
        <div className="flex items-start justify-between pt-5 sm:pt-6">
          <div>
            <p className="text-[14px] font-medium text-[#f8f8f8]">In Progress</p>
            <h2 className="text-[64px] font-bold text-white leading-none tracking-[-0.04em]">
              {formatKpiCount(inProgress)}
            </h2>
          </div>
          <span className="flex items-center gap-1 px-2.5 py-1.5 h-4 bg-[#3AB37E] text-white rounded-full text-[7px] mt-1">
            All
            <Image src={Arrow57Deg} alt="" width={7.5} height={7.5} />
          </span>
        </div>
      </div>

      {/* Completed arc card */}
      <div className="se-stat-card rounded-[20px] p-5 flex flex-col items-center w-full min-w-0 text-center gap-3">
        <p className="text-[#f8f8f8] font-light text-[10px] leading-[1.4] max-w-24 mx-auto">
          KPIs completed out of total
        </p>
        <span className="flex items-center gap-1 px-2.5 py-1 bg-[#14343e] text-[#2ae9c9] rounded-full text-[8px] font-medium border border-[#2ae9c9]/30">
          Done
          <Image src={Arrow57Deg} alt="" width={7.5} height={7.5} />
        </span>
        <div className="relative w-24 h-24 flex items-center justify-center mt-1">
          <svg viewBox="0 0 100 100" className="absolute inset-0 w-full h-full" style={{ transform: 'rotate(135deg)' }}>
            <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="7" strokeLinecap="round" strokeDasharray="188.5 251.3" />
            <circle cx="50" cy="50" r="40" fill="none" stroke="#2ae9c9" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(completedPct / 100) * KPI_ARC_LENGTH} ${KPI_CIRCUMFERENCE}`} />
          </svg>
          <div className="relative flex flex-col items-center gap-0.5">
            <div className="w-8 h-8 bg-[#14343e] rounded-full flex items-center justify-center shadow-sm">
              <User size={14} className="text-[#2ae9c9] fill-current" />
            </div>
            <span className="text-white text-[10px] font-bold">{completedPct}%</span>
          </div>
        </div>
      </div>

    </div>
  );
}

// ─── Status options ────────────────────────────────────────────────────────────
const STATUS_OPTIONS = ['All', 'Pending', 'In Progress', 'Completed', 'Cancelled'];

function statusToContainerId(s: string): string | null {
  if (s === 'Pending') return 'pending';
  if (s === 'In Progress') return 'in-progress';
  if (s === 'Completed') return 'completed';
  if (s === 'Cancelled') return 'cancelled';
  return null;
}

function statusFilterToApiStatus(s: string): KpiStatus | undefined {
  if (s === 'Pending') return 'pending';
  if (s === 'In Progress') return 'in_progress';
  if (s === 'Completed') return 'completed';
  if (s === 'Cancelled') return 'cancelled';
  return undefined;
}

const CONTAINER_TO_STATUS: Record<string, KpiStatus> = {
  pending: 'pending',
  'in-progress': 'in_progress',
  completed: 'completed',
  cancelled: 'cancelled',
};

// ─── Main view ────────────────────────────────────────────────────────────────
export function AllTasksView() {
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showKpiModal, setShowKpiModal] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<KpiItem | null>(null);
  const [kpiToEdit, setKpiToEdit] = useState<KpiItem | null>(null);
  const [kpiToDelete, setKpiToDelete] = useState<KpiItem | null>(null);
  const [statusFilter, setStatusFilter] = useState('All');

  const searchParams = useSearchParams();
  const taskIdParam = searchParams.get('taskId') || searchParams.get('kpiId');

  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId, role } = getActiveCompanyContext(user);
  // Managers and agents may drag KPI cards to any status column.
  const canManage = isTaskManagerRole(role);
  const isAgent = role === 'agent';
  const canDragStatuses = canManage || isAgent;

  const { data: kpisData, isPending } = useKpis(
    {
      company_id: companyId ?? undefined,
      search: search.trim() || undefined,
      status: statusFilter !== 'All' ? statusFilterToApiStatus(statusFilter) : undefined,
    },
    { agentScope: isAgent }
  );

  const updateKpiStatusMutation = useUpdateKpiStatus({
    adminScope: canManage,
    agentScope: isAgent,
  });
  const deleteKpiMutation = useDeleteKpi({
    onSuccess: () => {
      toast.success('KPI deleted.');
      setKpiToDelete(null);
    },
  });

  const kpis = kpisData?.kpis;
  const kpiFromUrl = useMemo(() => {
    if (!taskIdParam || !kpis) return null;
    return kpis.find((k) => String(k.id) === taskIdParam) ?? null;
  }, [taskIdParam, kpis]);

  const activeKpi = selectedKpi ?? kpiFromUrl;

  const kpiById = useMemo(() => {
    const map = new Map<string, KpiItem>();
    for (const kpi of kpisData?.kpis ?? []) {
      map.set(String(kpi.id), kpi);
    }
    return map;
  }, [kpisData?.kpis]);

  // ── Server-derived containers ──────────────────────────────────────────────
  const serverContainers = useMemo((): DndContainer[] => {
    const items = kpisData?.kpis ?? [];

    return [
      {
        id: 'pending',
        title: 'Pending KPI',
        color: '#BD7A22',
        items: items.filter((kpi) => kpi.status === 'pending').map(mapKpiToDndItem),
      },
      {
        id: 'in-progress',
        title: 'KPI In Progress',
        color: '#094B5C',
        items: items.filter((kpi) => kpi.status === 'in_progress').map(mapKpiToDndItem),
      },
      {
        id: 'completed',
        title: 'Completed KPI',
        color: '#0D9488',
        items: items.filter((kpi) => kpi.status === 'completed').map(mapKpiToDndItem),
      },
      {
        id: 'cancelled',
        title: 'Cancelled KPI',
        color: '#6B7280',
        items: items.filter((kpi) => kpi.status === 'cancelled').map(mapKpiToDndItem),
      },
    ];
  }, [kpisData?.kpis]);

  // ── Local DnD state ────────────────────────────────────────────────────────
  const [boardContainers, setBoardContainers] = useState<DndContainer[]>(serverContainers);
  const [prevServerContainers, setPrevServerContainers] = useState(serverContainers);

  if (serverContainers !== prevServerContainers) {
    setPrevServerContainers(serverContainers);
    setBoardContainers(serverContainers);
  }

  const findContainer = useCallback(
    (id: string) => {
      if (boardContainers.some((c) => c.id === id)) {
        return boardContainers.find((c) => c.id === id);
      }
      return boardContainers.find((c) => c.items.some((item) => item.id === id));
    },
    [boardContainers]
  );

  const moveItem = useCallback((activeId: string, overId: string, containerId: string) => {
    setBoardContainers((prev) =>
      prev.map((container) => {
        if (container.id !== containerId) return container;
        const activeIndex = container.items.findIndex((item) => item.id === activeId);
        const overIndex = container.items.findIndex((item) => item.id === overId);
        if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return container;
        return { ...container, items: arrayMove(container.items, activeIndex, overIndex) };
      })
    );
  }, []);

  const moveToContainer = useCallback((activeId: string, overContainerId: string) => {
    setBoardContainers((prev) => moveCardToColumn(prev, activeId, overContainerId));
  }, []);

  const moveBetweenContainers = useCallback(
    (activeId: string, overId: string, activeContainerId: string, overContainerId: string) => {
      if (activeContainerId === overContainerId) return;
      setBoardContainers((prev) => moveCardToColumn(prev, activeId, overContainerId, overId));
    },
    []
  );

  const displayContainers: DndContainer[] = boardContainers.filter((c) => {
    if (statusFilter === 'All') return true;
    return c.id === statusToContainerId(statusFilter);
  });

  const handleStatusDrop = (activeId: string, _fromContainerId: string, toContainerId: string) => {
    const status = CONTAINER_TO_STATUS[toContainerId];
    if (!status || !companyId) return;

    updateKpiStatusMutation.mutate(
      {
        kpiId: activeId,
        payload: { company_id: companyId, status },
      },
      {
        onSuccess: () => toast.success('KPI status updated.'),
        // useUpdateKpiStatus already toasts the backend's error message.
        onError: () => {
          setBoardContainers(serverContainers);
        },
      }
    );
  };

  const openKpiDetails = (item: DndItem) => {
    setSelectedKpi(kpiById.get(item.id) ?? null);
  };

  const openKpiEdit = (item: DndItem) => {
    const kpi = kpiById.get(item.id) ?? null;
    if (!kpi) return;
    setKpiToEdit(kpi);
    setSelectedKpi(null);
  };

  const openKpiDelete = (item: DndItem) => {
    const kpi = kpiById.get(item.id) ?? null;
    if (!kpi) return;
    setKpiToDelete(kpi);
    setSelectedKpi(null);
  };

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-[20px] font-extrabold text-white shrink-0 lg:hidden">
          KPI Overview
        </h1>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 lg:justify-end min-w-0 mt-2 transition-all duration-300 relative z-10">
          <div className="relative w-full md:w-114.5 group shrink-0">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-dash-dark transition-colors"
              size={18}
              strokeWidth={2}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search KPIs......"
              className="w-full bg-white pl-13 pr-5 text-[14px] placeholder:text-gray-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-dash-dark/10 transition-all font-sans"
              style={{
                height: '46px',
                borderRadius: '24px',
                border: '0.7px solid #D7D7D7',
                boxShadow: '0px 1px 3px 0px #0000004D, 0px 4px 8px 3px #00000026',
              }}
            />
          </div>

          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`se-control flex items-center gap-2 px-4 py-2.5 text-[12px] font-medium transition-all shrink-0 cursor-pointer ${
              showFilters ? 'se-control-active' : ''
            }`}
          >
            <SlidersHorizontal size={14} strokeWidth={2} />
            <span>Filter</span>
          </button>

          {canManage && (
            <button
              onClick={() => setShowKpiModal(true)}
              className="se-primary flex items-center gap-2 px-5 py-2.5 text-[12px] font-semibold transition-all shrink-0 cursor-pointer"
            >
              <BookmarkPlus size={15} strokeWidth={2} />
              <span className="hidden sm:inline whitespace-nowrap">Create New KPI</span>
              <span className="sm:hidden">KPI</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-4 bg-white rounded-2xl shadow-[0_-3px_9px_rgb(255_255_255_/_25%),0_6px_12px_rgb(0_0_0_/_45%)] border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-400 px-1">KPI Status</label>
            <div className="flex gap-1 flex-wrap">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-4 py-2 rounded-full text-[12px] font-bold transition-all ${
                    statusFilter === s
                      ? 'bg-[#0B1215] text-white'
                      : 'bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {statusFilter !== 'All' && (
            <div className="flex flex-col justify-end">
              <button
                onClick={() => setStatusFilter('All')}
                className="px-4 py-2 rounded-full text-[12px] font-bold text-red-400 hover:bg-red-50 transition-all border border-red-200"
              >
                Clear filter
              </button>
            </div>
          )}
        </div>
      )}

      {isPending ? (
        <TaskBoardSkeleton />
      ) : (
        <div className="flex flex-col gap-6">
          {/* ── KPI Stats (full width, on top) ────────────────────── */}
          <KpiStatsPanel statusCards={kpisData?.statusCards} containers={boardContainers} />

          {/* ── KPI Board (full width, below) ─────────────────────── */}
          <KpiBoard
            containers={displayContainers}
            canManageCards={canManage || isAgent}
            canDrag={canDragStatuses}
            findContainer={findContainer}
            moveItem={moveItem}
            moveToContainer={moveToContainer}
            moveBetweenContainers={moveBetweenContainers}
            onKpiClick={(item) => openKpiDetails(item)}
            onKpiEdit={(item) => openKpiEdit(item)}
            onKpiDelete={(item) => openKpiDelete(item)}
            onStatusDrop={handleStatusDrop}
          />
        </div>
      )}

      {/* Create KPI Modal */}
      <CreateKpiModal
        isOpen={showKpiModal}
        onClose={() => setShowKpiModal(false)}
      />

      {/* View KPI Details Modal */}
      <KpiDetailsModal
        kpi={activeKpi}
        onClose={() => setSelectedKpi(null)}
        onEdit={() => {
          setKpiToEdit(activeKpi);
          setSelectedKpi(null);
        }}
      />

      {/* Edit KPI Modal */}
      <EditKpiModal
        kpi={kpiToEdit}
        onClose={() => setKpiToEdit(null)}
      />

      <ConfirmDeleteModal
        isOpen={!!kpiToDelete}
        onClose={() => setKpiToDelete(null)}
        onConfirm={() => {
          if (!kpiToDelete || !companyId) return;
          deleteKpiMutation.mutate(
            { kpiId: kpiToDelete.id, companyId },
            { onError: (err) => toast.error(getApiErrorMessage(err, 'Failed to delete KPI.')) },
          );
        }}
        title="Delete KPI"
        description={`Are you sure you want to delete "${kpiToDelete?.name ?? 'this KPI'}"? This action cannot be undone.`}
        confirmLabel={deleteKpiMutation.isPending ? 'Deleting...' : 'Delete'}
      />
    </div>
  );
}

// ─── Map KPI API data to DnD item ─────────────────────────────────────────────
function mapKpiToDndItem(kpi: KpiItem): DndItem {
  let statusLabel = 'Pending';
  if (kpi.status === 'in_progress') statusLabel = 'In Progress';
  if (kpi.status === 'completed') statusLabel = 'Completed';
  if (kpi.status === 'cancelled') statusLabel = 'Cancelled';

  return {
    id: String(kpi.id),
    description: kpi.name,
    label: kpi.assignee?.name ?? 'Unassigned',
    addedDescription: kpi.objective,
    category: kpi.category as DndItem['category'],
    priority: kpi.priority,
    dueDate: kpi.end_date
      ? new Date(kpi.end_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : undefined,
    statusLabel,
    location: '',
    time: '',
    value: kpi.target_value,
    assignedToUserId: kpi.assigned_to_user_id ?? null,
  };
}
