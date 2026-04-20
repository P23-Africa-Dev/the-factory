'use client';

import { useState, useMemo } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import type { DndItem } from '@/types/operations';

export interface FlatTask extends DndItem {
  projectId: string;
  projectName: string;
  status: 'Pending' | 'In Progress' | 'Completed';
}

// Mock: all tasks across all projects (swap for API later)
const ALL_TASKS: FlatTask[] = [
  {
    id: 'p1-task-1', projectId: 'project-1', projectName: 'Product Outreach',
    label: 'Francis Nasyomba', description: 'Cover the entirety of Ikeja CV',
    location: 'Computer Village, Ikeja, Lagos', time: '12 hours ago',
    category: 'agent', status: 'Pending',
    dueDate: 'Friday, 3rd April 2026', assignedBy: 'Ridwan Thomson (Supervisor)',
  },
  {
    id: 'p1-task-2', projectId: 'project-1', projectName: 'Product Outreach',
    label: 'Amara Okafor', description: 'Visit Lekki Phase 1 market',
    location: 'Lekki Phase 1, Lagos', time: '1 day ago',
    category: 'attendance', status: 'In Progress',
    dueDate: 'Saturday, 4th April 2026', assignedBy: 'Ridwan Thomson (Supervisor)',
  },
  {
    id: 'p1-task-3', projectId: 'project-1', projectName: 'Product Outreach',
    label: 'Chidi Okonkwo', description: 'Document all contacts from Surulere',
    location: 'Surulere, Lagos', time: '2 days ago',
    category: 'agent', status: 'Completed',
    dueDate: 'Wednesday, 1st April 2026', assignedBy: 'Ridwan Thomson (Supervisor)',
  },
  {
    id: 'p2-task-1', projectId: 'project-2', projectName: 'Product Outreach',
    label: 'Ngozi Eze', description: 'Survey Oshodi market vendors',
    location: 'Oshodi, Lagos', time: '3 hours ago',
    category: 'agent', status: 'Pending',
    dueDate: 'Monday, 7th April 2026', assignedBy: 'Aisha Bello (Supervisor)',
  },
  {
    id: 'p2-task-2', projectId: 'project-2', projectName: 'Product Outreach',
    label: 'Emeka Nwosu', description: 'Follow up with Alaba contacts',
    location: "Alaba Int'l Market, Lagos", time: '5 hours ago',
    category: 'attendance', status: 'In Progress',
    dueDate: 'Tuesday, 8th April 2026', assignedBy: 'Aisha Bello (Supervisor)',
  },
  {
    id: 'p3-task-1', projectId: 'project-3', projectName: 'Product Outreach',
    label: 'Tunde Adeyemi', description: 'Collect feedback from Yaba tech hub',
    location: 'Yaba, Lagos', time: '6 hours ago',
    category: 'agent', status: 'Pending',
    dueDate: 'Thursday, 10th April 2026', assignedBy: 'Chukwuma Eze (Supervisor)',
  },
  {
    id: 'p3-task-2', projectId: 'project-3', projectName: 'Product Outreach',
    label: 'Blessing Okoro', description: 'Complete Victoria Island zone report',
    location: 'Victoria Island, Lagos', time: '1 day ago',
    category: 'attendance', status: 'Completed',
    dueDate: 'Wednesday, 9th April 2026', assignedBy: 'Chukwuma Eze (Supervisor)',
  },
  {
    id: 'p4-task-1', projectId: 'project-4', projectName: 'Product Outreach',
    label: 'Kelechi Obi', description: 'Map all retail outlets in Ikorodu',
    location: 'Ikorodu, Lagos', time: '30 minutes ago',
    category: 'agent', status: 'Pending',
    dueDate: 'Friday, 11th April 2026', assignedBy: 'Ridwan Thomson (Supervisor)',
  },
];

const STATUS_OPTIONS = ['All', 'Pending', 'In Progress', 'Completed'];

const STATUS_COLORS: Record<string, string> = {
  Pending: 'bg-[#BD7A22] text-white',
  'In Progress': 'bg-[#0E5D5D] text-white',
  Completed: 'bg-[#4FD1C5] text-[#0B1215]',
};

export function AllTasksView() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showFilters, setShowFilters] = useState(false);

  const filtered = useMemo(() => ALL_TASKS.filter((t) => {
    const q = search.toLowerCase();
    const matchesSearch =
      t.label.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.projectName.toLowerCase().includes(q) ||
      t.location.toLowerCase().includes(q);
    const matchesStatus = statusFilter === 'All' || t.status === statusFilter;
    return matchesSearch && matchesStatus;
  }), [search, statusFilter]);

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[20px] font-extrabold text-[#09232D] shrink-0">All Tasks</h1>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 flex-1 md:justify-end min-w-0">
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

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center text-gray-400 text-[14px] font-medium">
          No tasks match your search.
        </div>
      ) : (
        <div
          className="bg-white rounded-3xl border border-gray-100/60 overflow-hidden"
          style={{ boxShadow: '0px 8px 12px 6px #00000026' }}
        >
          <div className="grid grid-cols-[1fr_1fr_1fr_120px] gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 text-[11px] font-bold text-gray-400 uppercase tracking-wide">
            <span>Task</span>
            <span>Project</span>
            <span className="hidden md:block">Location</span>
            <span>Status</span>
          </div>

          {filtered.map((task, idx) => (
            <div
              key={task.id}
              className={`grid grid-cols-[1fr_1fr_1fr_120px] gap-4 items-center px-6 py-4 ${
                idx < filtered.length - 1 ? 'border-b border-gray-50' : ''
              } hover:bg-gray-50/60 transition-colors`}
            >
              <div className="flex flex-col min-w-0">
                <span className="text-[13px] font-bold text-[#09232D] truncate">{task.label}</span>
                <span className="text-[11px] text-gray-400 truncate">{task.description}</span>
                {task.dueDate && (
                  <span className="text-[10px] text-gray-300 mt-0.5">Due: {task.dueDate}</span>
                )}
              </div>

              <div className="min-w-0">
                <span className="text-[12px] font-semibold text-[#09232D] truncate block">
                  {task.projectName}
                </span>
                <span className="text-[10px] text-gray-400 truncate block">ID: {task.projectId}</span>
              </div>

              <div className="hidden md:block min-w-0">
                <span className="text-[11px] text-gray-500 truncate block">{task.location}</span>
                {task.assignedBy && (
                  <span className="text-[10px] text-gray-300 truncate block">{task.assignedBy}</span>
                )}
              </div>

              <div>
                <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-bold ${STATUS_COLORS[task.status] ?? 'bg-gray-100 text-gray-600'}`}>
                  {task.status}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
