'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Search, SlidersHorizontal } from 'lucide-react';
import { TaskBoard } from './task-board';
import { TaskDetailModal } from './task-detail-modal';
import { useAuthStore } from '@/store/auth';
import { useTasks } from '@/hooks/use-tasks';
import { getActiveCompanyContext } from '@/lib/company-context';
import type { DndContainer, DndItem } from '@/types/operations';
import { TaskBoardSkeleton } from './skeletons/task-board-skeleton';
import type { TaskApiItem } from '@/lib/api/tasks';
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { OperationsCalendar } from './operations-calendar';


// ─── Pie chart label ──────────────────────────────────────────────────────────
function CustomLabel({
  cx = 0, cy = 0, midAngle = 0,
  innerRadius = 0, outerRadius = 0, value = 0,
}: {
  cx?: number; cy?: number; midAngle?: number;
  innerRadius?: number; outerRadius?: number; value?: number;
}) {
  if (value === 0) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) / 2;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <g>
      <circle cx={x} cy={y} r={22} fill="white" />
      <text x={x} y={y} textAnchor="middle" dominantBaseline="central"
        fill="#0B1215" fontSize={13} fontWeight={800}>
        {value}%
      </text>
    </g>
  );
}


export function AllTasksView() {
  const searchParams = useSearchParams();
  const isNotCommencedMode = searchParams.get('status') === 'not_commenced';

  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState(isNotCommencedMode ? 'Pending' : 'All');
  const [selectedTask, setSelectedTask] = useState<{
    item: DndItem;
    containerId: string;
  } | null>(null);

  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);

  const { data: tasksData, isPending } = useTasks({
    company_id: companyId ?? undefined,
    ...(isNotCommencedMode ? { status: 'pending' as const } : {}),
  });

  const containers: DndContainer[] = useMemo(() => {
    const items = (tasksData?.tasks || []).filter((task) => {
      if (!isNotCommencedMode) {
        return true;
      }

      return isTaskNotCommenced(task);
    });

    const pendingItems = items.filter(t => t.status === "pending").map(mapTaskToDnd);
    const inProgressItems = items
      .filter((t) => t.status === "in_progress" || t.status === "paused" || t.status === "resumed")
      .map(mapTaskToDnd);
    const completedItems = items.filter(t => t.status === "completed").map(mapTaskToDnd);
    const cancelledItems = items.filter(t => t.status === "cancelled").map(mapTaskToDnd);

    return [
      {
        id: "pending",
        title: "Pending Task",
        color: "#BD7A22",
        items: pendingItems,
      },
      {
        id: "in-progress",
        title: "Task In-Progress",
        color: "#094B5C",
        items: inProgressItems,
      },
      {
        id: "completed",
        title: "Completed Task",
        color: "#4FD1C5",
        items: completedItems,
      },
      {
        id: "cancelled",
        title: "Cancelled Task",
        color: "#EF4444",
        items: cancelledItems,
      },
    ];
  }, [isNotCommencedMode, tasksData]);

  // Apply search + status filtering
  const filteredContainers: DndContainer[] = containers
    .filter((c) => statusFilter === 'All' || c.id === statusFilter.toLowerCase().replace(' ', '-').replace('in progress', 'in-progress'))
    .map((c) => {
      if (!search.trim()) return c;
      const q = search.toLowerCase();
      return {
        ...c,
        items: c.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            (item.location && item.location.toLowerCase().includes(q))
        ),
      };
    });

  // Derive the status filter key from readable name
  const statusFilterToContainerId = (s: string) => {
    if (s === 'Pending') return 'pending';
    if (s === 'In Progress') return 'in-progress';
    if (s === 'Completed') return 'completed';
    if (s === 'Cancelled') return 'cancelled';
    return null;
  };

  const STATUS_OPTIONS = ['All', 'Pending', 'In Progress', 'Completed', 'Cancelled'];

  // Apply proper filtering
  const displayContainers: DndContainer[] = containers
    .filter((c) => {
      if (statusFilter === 'All') return true;
      const mappedId = statusFilterToContainerId(statusFilter);
      return c.id === mappedId;
    })
    .map((c) => {
      if (!search.trim()) return c;
      const q = search.toLowerCase();
      return {
        ...c,
        items: c.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            (item.location && item.location.toLowerCase().includes(q))
        ),
      };
    });

  const stats = useMemo(() => {
    const pending = containers.find((c) => c.id === "pending")?.items.length ?? 0;
    const inProgress = containers.find((c) => c.id === "in-progress")?.items.length ?? 0;
    const completed = containers.find((c) => c.id === "completed")?.items.length ?? 0;
    const total = pending + inProgress + completed;

    if (total === 0) return [
      { name: "Pending", value: 0, color: "#BD7A22" },
      { name: "In Progress", value: 0, color: "#094B5C" },
      { name: "Complete", value: 0, color: "#4FD1C5" },
    ];

    return [
      { name: "Pending", value: Math.round((pending / total) * 100), color: "#BD7A22" },
      { name: "In Progress", value: Math.round((inProgress / total) * 100), color: "#094B5C" },
      { name: "Complete", value: Math.round((completed / total) * 100), color: "#4FD1C5" },
    ];
  }, [containers]);

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Toolbar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-[20px] font-extrabold text-[#09232D] shrink-0">
          <span className="lg:hidden">Tasks Overview</span>
        </h1>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 lg:justify-end min-w-0 mt-2 lg:mt-0 lg:-mt-16 xl:-mt-20 transition-all duration-300 relative z-10">
          <div className="relative w-full md:w-[458px] group shrink-0">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#09232D] transition-colors"
              size={18}
              strokeWidth={2}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks, agents, projects…"
              className="w-full bg-white pl-13 pr-5 text-[14px] placeholder:text-gray-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-[#09232D]/10 transition-all font-sans"
              style={{
                height: '46px',
                borderRadius: '24px',
                border: '0.7px solid #D7D7D7',
                boxShadow:
                  '0px 1px 3px 0px #0000004D, 0px 4px 8px 3px #00000026',
              }}
            />
          </div>

          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all shrink-0 cursor-pointer ${showFilters ? 'text-white' : 'text-gray-500'
              }`}
            style={{
              background: showFilters ? '#34373C' : '#F8F8F8',
              border: showFilters
                ? '0.5px solid #34373C'
                : '0.5px solid #D1D1D1',
              boxShadow: showFilters
                ? 'none'
                : '0 2px 8px rgba(0,0,0,0.06)',
            }}
          >
            <SlidersHorizontal size={14} strokeWidth={2} />
            <span style={{ fontSize: '10px', fontWeight: 400 }}>Filter</span>
          </button>
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-400 px-1">
              Status
            </label>
            <div className="flex gap-1 flex-wrap">
              {STATUS_OPTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-4 py-2 rounded-full text-[12px] font-bold transition-all ${statusFilter === s
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

      {/* Task Board */}
      {isPending ? (
        <TaskBoardSkeleton />
      ) : (
        <div className="mt-2 flex flex-col xl:flex-row gap-6 items-start animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* ── LEFT: header + kanban ─────────────────────────── */}
          <div className="flex-1 xl:flex-3 min-w-0 flex flex-col gap-5 w-full">
            <TaskBoard
              containers={displayContainers}
              activeTab="all"
              onAddCard={() => { }}
              findContainer={() => undefined}
              moveItem={() => { }}
              moveToContainer={() => { }}
              moveBetweenContainers={() => { }}
              onTaskClick={(item, containerId) =>
                setSelectedTask({ item, containerId })
              }
            />
          </div>
          {/* ── RIGHT: stats + calendar ───────────────────────── */}
          <div className="w-full sm:max-w-sm xl:max-w-85 xl:flex-1 xl:min-w-70 flex flex-col gap-5 xl:shrink-0">

            <div className="bg-[#0A1A22] rounded-[28px] px-5 pt-5 pb-4 shadow-xl overflow-visible">
              <h3 className="text-gray-400 font-medium text-[13px] mb-1">Task Stats</h3>
              <div className="flex items-center justify-between gap-2">
                <div className="w-44 h-44 shrink-0 -ml-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }} style={{ overflow: 'visible' }}>
                      <Pie
                        data={stats}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={62}
                        paddingAngle={1}
                        dataKey="value"
                        stroke="none"
                        labelLine={false}
                        label={(props) => <CustomLabel {...props} />}
                      >
                        {stats.map((entry, i) => (
                          <Cell key={`cell-${i}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-4 flex-1 pr-2">
                  {stats.map((stat, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div
                        className="w-3.5 h-3.5 rounded-full shrink-0"
                        style={{ backgroundColor: stat.color }}
                      />
                      <span className="text-[12px] text-[#A0B3B8] font-medium whitespace-nowrap">
                        {stat.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <OperationsCalendar />
          </div>
        </div>
      )}

      {/* Task Detail Modal */}
      <TaskDetailModal
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        task={selectedTask?.item ?? null}
        status={selectedTask?.containerId ?? ''}
      />
    </div>
  );
}

function mapTaskToDnd(apiTask: TaskApiItem): DndItem {
  let statusLabel = "Pending";
  if (apiTask.status === "in_progress") statusLabel = "In Progress";
  if (apiTask.status === "paused") statusLabel = "Paused";
  if (apiTask.status === "resumed") statusLabel = "Resumed";
  if (apiTask.status === "completed") statusLabel = "Completed";
  if (apiTask.status === "cancelled") statusLabel = "Cancelled";

  const assigneeLabel =
    apiTask.assigned_users && apiTask.assigned_users.length > 0
      ? apiTask.assigned_users.map((user) => user.name).join(", ")
      : apiTask.assignee?.name || "Unassigned";

  return {
    id: String(apiTask.id),
    label: assigneeLabel,
    description: apiTask.title,
    location: apiTask.location || "No location",
    time: "Just now",
    category: (apiTask.type || "agent") as DndItem["category"],
    dueDate: apiTask.due_date ? new Date(apiTask.due_date).toLocaleDateString() : undefined,
    assignedBy: `User ID: ${apiTask.created_by_user_id}`,
    addedDescription: apiTask.description,
    statusLabel,
  };
}

function isTaskNotCommenced(task: TaskApiItem): boolean {
  const hasAssignment =
    (task.assigned_users?.length ?? 0) > 0 ||
    !!task.assigned_agent_id ||
    !!task.assignee?.id;

  return hasAssignment && task.status === 'pending' && !task.started_at;
}
