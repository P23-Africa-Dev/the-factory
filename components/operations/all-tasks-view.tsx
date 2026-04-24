'use client';

import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, Loader2 } from 'lucide-react';
import { TaskBoard } from './task-board';
import { TaskDetailModal } from './task-detail-modal';
import { useAuthStore } from '@/store/auth';
import { useTasks } from '@/hooks/use-tasks';
import type { DndContainer, DndItem } from '@/types/operations';
import type { TaskApiItem } from '@/lib/api/tasks';

export function AllTasksView() {
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedTask, setSelectedTask] = useState<{
    item: DndItem;
    containerId: string;
  } | null>(null);

  const user = useAuthStore((s) => s.user);
  const companyId = user?.active_company?.id;

  const { data: tasksData, isPending } = useTasks({
    company_id: companyId,
  });

  const containers: DndContainer[] = useMemo(() => {
    const items = tasksData?.tasks || [];
    
    const pendingItems = items.filter(t => t.status === "pending").map(mapTaskToDnd);
    const inProgressItems = items.filter(t => t.status === "in_progress").map(mapTaskToDnd);
    const completedItems = items.filter(t => t.status === "completed").map(mapTaskToDnd);

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
    ];
  }, [tasksData]);

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
    return null;
  };

  const STATUS_OPTIONS = ['All', 'Pending', 'In Progress', 'Completed'];

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
            className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all shrink-0 cursor-pointer ${
              showFilters ? 'text-white' : 'text-gray-500'
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

      {/* Task Board */}
      {isPending ? (
        <div className="py-32 flex flex-col items-center justify-center gap-4 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin text-[#092635]" />
          <span className="font-bold text-lg">Loading Tasks...</span>
        </div>
      ) : (
        <div className="mt-2">
          <TaskBoard
            containers={displayContainers}
            activeTab="all"
            onAddCard={() => {}}
            findContainer={() => undefined}
            moveItem={() => {}}
            moveToContainer={() => {}}
            moveBetweenContainers={() => {}}
            onTaskClick={(item, containerId) =>
              setSelectedTask({ item, containerId })
            }
          />
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
  if (apiTask.status === "completed") statusLabel = "Completed";

  return {
    id: String(apiTask.id),
    label: `Agent ID: ${apiTask.assigned_agent_id}`, 
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
