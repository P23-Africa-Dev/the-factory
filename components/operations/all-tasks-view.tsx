'use client';

import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal, BookmarkPlus, TrendingUp, Clock, CheckCircle2, XCircle, BarChart3 } from 'lucide-react';
import { arrayMove } from '@dnd-kit/sortable';
import { KpiBoard } from './kpi-board';
import { CreateKpiModal } from './create-kpi-modal';
import { KpiDetailsModal } from './kpi-details-modal';
import { EditKpiModal } from './edit-kpi-modal';
import { useAuthStore } from '@/store/auth';
import { useTasks } from '@/hooks/use-tasks';
import { getActiveCompanyContext } from '@/lib/company-context';
import type { DndContainer, DndItem } from '@/types/operations';
import { TaskBoardSkeleton } from './skeletons/task-board-skeleton';
import type { TaskApiItem } from '@/lib/api/tasks';
// import { OperationsCalendar } from './operations-calendar';

// ─── KPI Stats Panel ──────────────────────────────────────────────────────────
interface StatDef {
  id: string;
  label: string;
  count: number;
  pct: number;
  color: string;
  bg: string;
  icon: React.ReactNode;
}

function KpiStatsPanel({ containers }: { containers: DndContainer[] }) {
  const pending   = containers.find(c => c.id === 'pending')?.items.length   ?? 0;
  const inProgress = containers.find(c => c.id === 'in-progress')?.items.length ?? 0;
  const completed  = containers.find(c => c.id === 'completed')?.items.length  ?? 0;
  const cancelled  = containers.find(c => c.id === 'cancelled')?.items.length  ?? 0;
  const total = pending + inProgress + completed + cancelled;

  const pct = (n: number) => (total === 0 ? 0 : Math.round((n / total) * 100));
  const completionRate = pct(completed);

  // Modern, vibrant colors for the stats
  const stats: StatDef[] = [
    {
      id: 'pending',
      label: 'Pending',
      count: pending,
      pct: pct(pending),
      color: '#F59E0B', // Amber
      bg: 'rgba(245, 158, 11, 0.12)',
      icon: <Clock size={18} strokeWidth={2.5} />,
    },
    {
      id: 'in-progress',
      label: 'In Progress',
      count: inProgress,
      pct: pct(inProgress),
      color: '#3B82F6', // Blue
      bg: 'rgba(59, 130, 246, 0.12)',
      icon: <TrendingUp size={18} strokeWidth={2.5} />,
    },
    {
      id: 'completed',
      label: 'Completed',
      count: completed,
      pct: pct(completed),
      color: '#10B981', // Emerald
      bg: 'rgba(16, 185, 129, 0.12)',
      icon: <CheckCircle2 size={18} strokeWidth={2.5} />,
    },
    {
      id: 'cancelled',
      label: 'Cancelled',
      count: cancelled,
      pct: pct(cancelled),
      color: '#8B5CF6', // Purple instead of gray for a more vibrant look
      bg: 'rgba(139, 92, 246, 0.12)',
      icon: <XCircle size={18} strokeWidth={2.5} />,
    },
  ];

  // Circumference for the SVG ring (r=32)
  const R = 32;
  const CIRC = 2 * Math.PI * R;
  const ringOffset = CIRC - (completionRate / 100) * CIRC;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 animate-in fade-in slide-in-from-bottom-4 duration-700">
      
      {/* ── Hero Block (Overall Completion) ── */}
      <div className="col-span-1 lg:col-span-4 relative overflow-hidden bg-gradient-to-br from-[#0B1215] to-[#1A262D] text-white rounded-[24px] p-5 shadow-2xl flex flex-col justify-between group">
        {/* Subtle decorative background elements */}
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-[#10B981] rounded-full blur-[80px] opacity-20 group-hover:opacity-40 transition-opacity duration-700" />
        <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-[#3B82F6] rounded-full blur-[80px] opacity-20 group-hover:opacity-40 transition-opacity duration-700" />
        
        <div className="flex justify-between items-start z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-white/10 rounded-lg backdrop-blur-md">
                <BarChart3 size={16} className="text-teal-300" />
              </div>
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-300">KPI Overview</span>
            </div>
            <p className="text-[42px] font-black mt-1 tracking-tight leading-none">{total}</p>
            <p className="text-[13px] text-gray-400 font-medium mt-1">Total KPIs tracked</p>
          </div>
          
          <div className="relative w-[80px] h-[80px] shrink-0 transform group-hover:scale-105 transition-transform duration-500">
            <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90 drop-shadow-[0_0_12px_rgba(16,185,129,0.3)]">
              <circle cx="40" cy="40" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
              <circle
                cx="40" cy="40" r={R}
                fill="none"
                stroke="#10B981"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={CIRC}
                strokeDashoffset={ringOffset}
                style={{ transition: 'stroke-dashoffset 1.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[18px] font-black leading-none">{completionRate}%</span>
              <span className="text-[8px] text-gray-400 font-bold tracking-widest mt-0.5">DONE</span>
            </div>
          </div>
        </div>

        {/* Progress distribution bar */}
        <div className="mt-4 z-10">
          <div className="flex justify-between text-xs font-semibold text-gray-400 mb-3">
            <span>Distribution</span>
            <span>{total > 0 ? '100%' : '0%'}</span>
          </div>
          <div className="flex h-3 rounded-full overflow-hidden bg-white/5 backdrop-blur-sm p-0.5 shadow-inner gap-0.5">
            {stats.map((stat) => stat.pct > 0 && (
              <div
                key={stat.id}
                className="h-full rounded-full hover:brightness-125 transition-all cursor-pointer relative group/bar"
                style={{
                  width: `${stat.pct}%`,
                  backgroundColor: stat.color,
                }}
              >
                {/* Tooltip */}
                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-white text-[#0B1215] text-[11px] font-bold py-1.5 px-3 rounded-lg opacity-0 group-hover/bar:opacity-100 pointer-events-none transition-all scale-95 group-hover/bar:scale-100 whitespace-nowrap z-20 shadow-xl border border-gray-100">
                  {stat.label}: {stat.pct}%
                  <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rotate-45 border-b border-r border-gray-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Stats Bento Grid ── */}
      <div className="col-span-1 lg:col-span-8 grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-5">
        {stats.map((stat, i) => (
          <div 
            key={stat.id} 
            className="bg-white rounded-[24px] p-4 border border-gray-100 shadow-[0px_4px_20px_rgba(0,0,0,0.03)] hover:shadow-[0px_12px_40px_rgba(0,0,0,0.08)] transition-all duration-500 hover:-translate-y-1.5 relative overflow-hidden group flex flex-col justify-between"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            {/* Subtle glow background on hover */}
            <div 
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none"
              style={{ background: `radial-gradient(circle at 80% 0%, ${stat.color}15, transparent 70%)` }}
            />
            
            <div className="flex items-start justify-between mb-3 z-10 relative">
              <div 
                className="w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-500 group-hover:rotate-3 shadow-sm border border-white/50"
                style={{ backgroundColor: stat.bg, color: stat.color }}
              >
                {stat.icon}
              </div>
              <span className="text-[28px] font-black text-[#0B1215] leading-none tracking-tight">{stat.count}</span>
            </div>
            
            <div className="z-10 relative">
              <h3 className="text-[13px] font-extrabold text-[#0B1215] mb-1">{stat.label}</h3>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-gray-400">{stat.pct}% of total</span>
              </div>
              
              <div className="h-2 rounded-full bg-gray-100/80 overflow-hidden shadow-inner">
                <div
                  className="h-full rounded-full relative"
                  style={{
                    width: `${stat.pct}%`,
                    backgroundColor: stat.color,
                    transition: 'width 1s cubic-bezier(0.4, 0, 0.2, 1)',
                  }}
                >
                  {/* Shimmer effect */}
                  <div className="absolute top-0 bottom-0 left-0 right-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />
                </div>
              </div>
            </div>
          </div>
        ))}
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

// ─── Main view ────────────────────────────────────────────────────────────────
export function AllTasksView() {
  const searchParams = useSearchParams();
  const isNotCommencedMode = searchParams.get('status') === 'not_commenced';

  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showKpiModal, setShowKpiModal] = useState(false);
  const [selectedKpi, setSelectedKpi] = useState<DndItem | null>(null);
  const [kpiToEdit, setKpiToEdit] = useState<DndItem | null>(null);
  const [statusFilter, setStatusFilter] = useState(isNotCommencedMode ? 'Pending' : 'All');

  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);

  const { data: tasksData, isPending } = useTasks({
    company_id: companyId ?? undefined,
    ...(isNotCommencedMode ? { status: 'pending' as const } : {}),
  });

  // ── Server-derived containers ──────────────────────────────────────────────
  const serverContainers = useMemo((): DndContainer[] => {
    const items = (tasksData?.tasks || []).filter((task) =>
      isNotCommencedMode ? isTaskNotCommenced(task) : true
    );

    return [
      {
        id: 'pending',
        title: 'Pending KPI',
        color: '#BD7A22',
        items: items.filter(t => t.status === 'pending').map(mapTaskToKpi),
      },
      {
        id: 'in-progress',
        title: 'KPI In Progress',
        color: '#094B5C',
        items: items
          .filter(t => t.status === 'in_progress' || t.status === 'paused' || t.status === 'resumed')
          .map(mapTaskToKpi),
      },
      {
        id: 'completed',
        title: 'Completed KPI',
        color: '#0D9488',
        items: items.filter(t => t.status === 'completed').map(mapTaskToKpi),
      },
      {
        id: 'cancelled',
        title: 'Cancelled KPI',
        color: '#6B7280',
        items: items.filter(t => t.status === 'cancelled').map(mapTaskToKpi),
      },
    ];
  }, [isNotCommencedMode, tasksData]);

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
    setBoardContainers((prev) => {
      const activeContainer = prev.find((c) => c.items.some((item) => item.id === activeId));
      const activeItem = activeContainer?.items.find((item) => item.id === activeId);
      if (!activeContainer || !activeItem) return prev;
      return prev.map((container) => {
        if (container.id === activeContainer.id)
          return { ...container, items: container.items.filter((item) => item.id !== activeId) };
        if (container.id === overContainerId)
          return { ...container, items: [...container.items, activeItem] };
        return container;
      });
    });
  }, []);

  const moveBetweenContainers = useCallback(
    (activeId: string, overId: string, activeContainerId: string, overContainerId: string) => {
      setBoardContainers((prev) => {
        const activeContainer = prev.find((c) => c.id === activeContainerId);
        const overContainer = prev.find((c) => c.id === overContainerId);
        if (!activeContainer || !overContainer) return prev;
        const activeItem = activeContainer.items.find((item) => item.id === activeId);
        if (!activeItem) return prev;
        const overIndex = overContainer.items.findIndex((item) => item.id === overId);
        const insertionIndex = overIndex >= 0 ? overIndex : overContainer.items.length;
        return prev.map((container) => {
          if (container.id === activeContainerId)
            return { ...container, items: container.items.filter((item) => item.id !== activeId) };
          if (container.id === overContainerId) {
            const nextItems = [...overContainer.items];
            nextItems.splice(insertionIndex, 0, activeItem);
            return { ...container, items: nextItems };
          }
          return container;
        });
      });
    },
    []
  );

  // ── Search + status filter ─────────────────────────────────────────────────
  const displayContainers: DndContainer[] = boardContainers
    .filter((c) => {
      if (statusFilter === 'All') return true;
      return c.id === statusToContainerId(statusFilter);
    })
    .map((c) => {
      if (!search.trim()) return c;
      const q = search.toLowerCase();
      return {
        ...c,
        items: c.items.filter(
          (item) =>
            item.description.toLowerCase().includes(q) ||
            item.label.toLowerCase().includes(q) ||
            (item.addedDescription?.toLowerCase().includes(q) ?? false)
        ),
      };
    });

  return (
    <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-[20px] font-extrabold text-dash-dark shrink-0 lg:hidden">
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
              placeholder="Search KPIs, agents, categories…"
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
            className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all shrink-0 cursor-pointer ${
              showFilters ? 'text-white' : 'text-gray-500'
            }`}
            style={{
              background: showFilters ? '#34373C' : '#F8F8F8',
              border: showFilters ? '0.5px solid #34373C' : '0.5px solid #D1D1D1',
              boxShadow: showFilters ? 'none' : '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <SlidersHorizontal size={14} strokeWidth={2} />
            <span style={{ fontSize: '10px', fontWeight: 400 }}>Filter</span>
          </button>

          <button
            onClick={() => setShowKpiModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-dash-dark text-white rounded-xl text-[13px] font-bold hover:opacity-90 transition-all shrink-0 cursor-pointer"
            style={{ boxShadow: '0 4px 14px rgba(9, 35, 45, 0.3)' }}
          >
            <BookmarkPlus size={15} strokeWidth={2} />
            <span className="hidden sm:inline whitespace-nowrap">Create New KPI</span>
            <span className="sm:hidden">KPI</span>
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
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
          <KpiStatsPanel containers={boardContainers} />

          {/* ── KPI Board (full width, below) ─────────────────────── */}
          <KpiBoard
            containers={displayContainers}
            findContainer={findContainer}
            moveItem={moveItem}
            moveToContainer={moveToContainer}
            moveBetweenContainers={moveBetweenContainers}
            onKpiClick={(item) => setSelectedKpi(item)}
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
        kpi={selectedKpi}
        onClose={() => setSelectedKpi(null)}
        onEdit={() => {
          setKpiToEdit(selectedKpi);
          setSelectedKpi(null);
        }}
      />

      {/* Edit KPI Modal */}
      <EditKpiModal
        kpi={kpiToEdit}
        onClose={() => setKpiToEdit(null)}
      />
    </div>
  );
}

// ─── Map task API data to KPI DnD item ────────────────────────────────────────
function mapTaskToKpi(apiTask: TaskApiItem): DndItem {
  let statusLabel = 'Pending';
  if (apiTask.status === 'in_progress') statusLabel = 'In Progress';
  if (apiTask.status === 'paused') statusLabel = 'Paused';
  if (apiTask.status === 'resumed') statusLabel = 'Resumed';
  if (apiTask.status === 'completed') statusLabel = 'Completed';
  if (apiTask.status === 'cancelled') statusLabel = 'Cancelled';

  const assigneeLabel =
    apiTask.assigned_users && apiTask.assigned_users.length > 0
      ? apiTask.assigned_users.map((u) => u.name).join(', ')
      : apiTask.assignee?.name || 'Unassigned';

  return {
    id: String(apiTask.id),
    description: apiTask.title,
    label: assigneeLabel,
    addedDescription: apiTask.description,
    category: (apiTask.type || 'general') as DndItem['category'],
    priority: apiTask.priority ?? undefined,
    dueDate: apiTask.due_date
      ? new Date(apiTask.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
      : undefined,
    statusLabel,
    location: '',
    time: '',
  };
}

function isTaskNotCommenced(task: TaskApiItem): boolean {
  const hasAssignment =
    (task.assigned_users?.length ?? 0) > 0 ||
    !!task.assigned_agent_id ||
    !!task.assignee?.id;
  return hasAssignment && task.status === 'pending' && !task.started_at;
}
