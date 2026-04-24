'use client';

import { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, Loader2, Plus } from 'lucide-react';
import { TaskBoard } from './task-board';
import { TaskDetailModal } from './task-detail-modal';
import { CreateTaskModal } from './create-task-modal';
import { CreateSelfTaskModal } from './create-self-task-modal';
import { useAuthStore } from '@/store/auth';
import { useTasks } from '@/hooks/use-tasks';
import type { DndContainer, DndItem } from '@/types/operations';
import type { TaskApiItem } from '@/lib/api/tasks';

export function AllTasksView() {
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCreateTask, setShowCreateTask] = useState(false);
  const [showCreateSelfTask, setShowCreateSelfTask] = useState(false);

  const user = useAuthStore((s) => s.user);
  const companyId = user?.active_company?.id;
  const accessRole = user?.access_role;

  const isAgent = accessRole === 'agent';
  const isManager = accessRole === 'admin' || accessRole === 'supervisor';

  const { data: tasksData, isPending } = useTasks({ company_id: companyId });

  const containers: DndContainer[] = useMemo(() => {
    const items = tasksData?.tasks || [];

    const pendingItems = items.filter((t) => t.status === 'pending').map(mapTaskToDnd);
    const inProgressItems = items.filter((t) => t.status === 'in_progress').map(mapTaskToDnd);
    const completedItems = items.filter((t) => t.status === 'completed').map(mapTaskToDnd);
    const cancelledItems = items.filter((t) => t.status === 'cancelled').map(mapTaskToDnd);

    return [
      { id: 'pending', title: 'Pending Task', color: '#BD7A22', items: pendingItems },
      { id: 'in-progress', title: 'Task In-Progress', color: '#094B5C', items: inProgressItems },
      { id: 'completed', title: 'Completed Task', color: '#4FD1C5', items: completedItems },
      { id: 'cancelled', title: 'Cancelled', color: '#9CA3AF', items: cancelledItems },
    ];
  }, [tasksData]);

  const statusFilterToContainerId = (s: string) => {
    if (s === 'Pending') return 'pending';
    if (s === 'In Progress') return 'in-progress';
    if (s === 'Completed') return 'completed';
    if (s === 'Cancelled') return 'cancelled';
    return null;
  };

  const STATUS_OPTIONS = ['All', 'Pending', 'In Progress', 'Completed', 'Cancelled'];

  const displayContainers: DndContainer[] = containers
    .filter((c) => {
      if (statusFilter === 'All') return true;
      return c.id === statusFilterToContainerId(statusFilter);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[20px] font-extrabold text-dash-dark shrink-0">All Tasks</h1>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 flex-1 md:justify-end min-w-0">
          <div className="relative w-full md:w-95 group shrink-0">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-dash-dark transition-colors"
              size={18}
              strokeWidth={2}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tasks, agents, projects…"
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

          {/* Manager: create management task */}
          {isManager && (
            <button
              onClick={() => setShowCreateTask(true)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-white shrink-0 transition-all hover:opacity-90"
              style={{ background: '#09232D' }}
            >
              <Plus size={14} />
              <span style={{ fontSize: '12px', fontWeight: 600 }}>New Task</span>
            </button>
          )}

          {/* Agent: create self-task */}
          {isAgent && (
            <button
              onClick={() => setShowCreateSelfTask(true)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl text-white shrink-0 transition-all hover:opacity-90"
              style={{ background: '#09232D' }}
            >
              <Plus size={14} />
              <span style={{ fontSize: '12px', fontWeight: 600 }}>New Self-Task</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-400 px-1">Status</label>
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
          <span className="font-bold text-lg">Loading Tasks…</span>
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
            onTaskClick={(item) => setSelectedTaskId(item.id)}
          />
        </div>
      )}

      {/* Task Detail Modal — fetches real task by ID */}
      <TaskDetailModal
        isOpen={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        taskId={selectedTaskId}
      />

      {/* Management task creation (managers only) */}
      {isManager && (
        <CreateTaskModal
          isOpen={showCreateTask}
          onClose={() => setShowCreateTask(false)}
        />
      )}

      {/* Self-task creation (agents only) */}
      {isAgent && (
        <CreateSelfTaskModal
          isOpen={showCreateSelfTask}
          onClose={() => setShowCreateSelfTask(false)}
        />
      )}
    </div>
  );
}

function mapTaskToDnd(apiTask: TaskApiItem): DndItem {
  return {
    id: String(apiTask.id),
    label: apiTask.assignee?.name ?? `Agent #${apiTask.assigned_agent_id}`,
    description: apiTask.title,
    location: apiTask.location || 'No location',
    time: apiTask.due_date ? new Date(apiTask.due_date).toLocaleDateString() : 'No due date',
    category: (apiTask.type || 'agent') as any,
    dueDate: apiTask.due_date ? new Date(apiTask.due_date).toLocaleDateString() : undefined,
    assignedBy: apiTask.creator?.name ?? `User #${apiTask.created_by_user_id}`,
    addedDescription: apiTask.description,
    statusLabel:
      apiTask.status === 'in_progress'
        ? 'In Progress'
        : apiTask.status.charAt(0).toUpperCase() + apiTask.status.slice(1),
  };
}
