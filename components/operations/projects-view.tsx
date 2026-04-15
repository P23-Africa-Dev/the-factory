'use client';

import { useState, useMemo } from 'react';
import { MoreVertical, Search, SlidersHorizontal, BookmarkPlus } from 'lucide-react';
import { Project } from '@/types/operations';
import { CreateProjectDrawer } from './create-project-drawer';

const STATUS_FILTERS = ['All', 'In progress', 'Completed', 'Pending'];
const PRIORITY_FILTERS = ['All', 'High', 'Medium', 'Low'];

interface ProjectsViewProps {
  projects: Project[];
  onViewProject: (projectId: string) => void;
}

export function ProjectsView({ projects, onViewProject }: ProjectsViewProps) {
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter]   = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [showFilters, setShowFilters]   = useState(false);
  const [showDrawer, setShowDrawer]     = useState(false);

  const filtered = useMemo(() => projects.filter((p) => {
    const matchesSearch   = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesStatus   = statusFilter   === 'All' || p.status   === statusFilter;
    const matchesPriority = priorityFilter === 'All' || p.priority === priorityFilter;
    return matchesSearch && matchesStatus && matchesPriority;
  }), [projects, search, statusFilter, priorityFilter]);

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[20px] font-extrabold text-[#09232D] shrink-0">All project</h1>

        <div className="flex items-center gap-3 flex-1 sm:max-w-2xl">
          {/* Search — taller with prominent shadow */}
          <div className="relative flex-1 group min-w-0">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#09232D] transition-colors"
              size={18}
              strokeWidth={2}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search for Agents"
              className="w-full bg-white border border-gray-100 rounded-full py-4 pl-13 pr-5 text-[14px] placeholder:text-gray-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-[#09232D]/10 transition-all"
              style={{ boxShadow: '0px 4px 4px 0px #0000004D' }}
            />
          </div>

          {/* Filter toggle — icon before text, shorter than search */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl text-[13px] font-bold transition-all border shrink-0 cursor-pointer ${
              showFilters
                ? 'bg-[#09232D] text-white border-[#09232D]'
                : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'
            }`}
            style={{ boxShadow: showFilters ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.06)' }}
          >
            <SlidersHorizontal size={14} strokeWidth={2} />
            <span className="opacity-80">Filter</span>
          </button>

          {/* Create — shorter than search */}
          <button
            onClick={() => setShowDrawer(true)}
            className="flex items-center gap-2 px-5 py-3 bg-[#09232D] text-white rounded-xl text-[13px] font-bold hover:opacity-90 transition-all shrink-0 cursor-pointer"
            style={{ boxShadow: '0 4px 14px rgba(9, 35, 45, 0.3)' }}
          >
            <BookmarkPlus size={15} strokeWidth={2} />
            <span className="hidden sm:inline whitespace-nowrap">Create New Project</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </div>

      {/* ── Filter panel ─────────────────────────────────────── */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-400 px-1">Status</label>
            <div className="flex gap-1 flex-wrap">
              {STATUS_FILTERS.map((s) => (
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

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-400 px-1">Priority</label>
            <div className="flex gap-1 flex-wrap">
              {PRIORITY_FILTERS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={`px-4 py-2 rounded-full text-[12px] font-bold transition-all ${
                    priorityFilter === p
                      ? 'bg-[#0B1215] text-white'
                      : 'bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {(statusFilter !== 'All' || priorityFilter !== 'All') && (
            <div className="flex flex-col justify-end">
              <button
                onClick={() => { setStatusFilter('All'); setPriorityFilter('All'); }}
                className="px-4 py-2 rounded-full text-[12px] font-bold text-red-400 hover:bg-red-50 transition-all border border-red-200"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Grid — wrapped in a thick-shadow container ─────── */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center text-gray-400 text-[14px] font-medium">
          No projects match your search.
        </div>
      ) : (
        <div
          className="bg-white rounded-3xl p-5 sm:p-7 border border-gray-100/60"
          style={{ boxShadow: '0px 8px 12px 6px #00000026' }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-4 gap-x-5 gap-y-10">
            {filtered.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onClick={() => onViewProject(project.id)}
              />
            ))}
          </div>
        </div>
      )}

      {showDrawer && <CreateProjectDrawer onClose={() => setShowDrawer(false)} />}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  const statusCls = (s: string) => {
    switch (s) {
      case 'In progress': return 'bg-[#0E5D5D] text-white';
      case 'Completed':   return 'bg-[#4FD1C5] text-[#0B1215]';
      case 'Pending':     return 'bg-[#BD7A22] text-white';
      default:            return 'bg-gray-100 text-gray-600';
    }
  };
  const priorityCls = (p: string) => {
    switch (p) {
      case 'High':   return 'bg-[#A3E635] text-[#0B1215]';
      case 'Medium': return 'bg-[#FDE047] text-[#0B1215]';
      case 'Low':    return 'bg-[#CBD5E1] text-[#0B1215]';
      default:       return 'bg-gray-100 text-gray-600';
    }
  };

  return (
    <div className="relative pb-5">
      <div className="bg-white rounded-3xl p-5 pt-6 border border-gray-100/80 transition-all"
        style={{ boxShadow: '0px 1px 2px 2px #00000026' }}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[15px] font-bold text-[#09232D] leading-snug">{project.name}</h3>
          <button className="text-gray-300 hover:text-gray-500 transition-colors mt-0.5 shrink-0">
            <MoreVertical size={18} />
          </button>
        </div>

        <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-3 mt-1.5">
          {project.description}
        </p>

        <p className="text-[11px] font-semibold text-gray-400 mt-3">{project.deadline}</p>

        <div className="flex items-center gap-2 mt-3">
          <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${statusCls(project.status)}`}>
            {project.status}
          </span>
          <span className={`px-3 py-1 rounded-full text-[10px] font-bold ${priorityCls(project.priority)}`}>
            {project.priority}
          </span>
        </div>

        <div className="flex gap-2 mt-4">
          <div className="flex-1 min-w-0">
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#6B9A9A] rounded-full" style={{ width: `${project.completedPercent}%` }} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-[#F87171] rounded-full" style={{ width: `${project.pendingPercent}%` }} />
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-1.5 mb-3">
          <span className="flex-1 text-[10px] font-semibold text-gray-400">Completed</span>
          <span className="flex-1 text-[10px] font-semibold text-gray-400">Pending</span>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 flex justify-center">
        <button
          onClick={onClick}
          className="px-10 py-3 bg-[#09232D] text-white rounded-full text-[12px] font-bold hover:opacity-90 active:scale-[0.98] transition-all shadow-md"
        >
          View Project
        </button>
      </div>
    </div>
  );
}
