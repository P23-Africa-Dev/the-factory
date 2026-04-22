"use client";

import { useState, useMemo, useEffect } from "react";
import {
  MoreVertical,
  Search,
  SlidersHorizontal,
  BookmarkPlus,
  ArrowUpRight,
  User,
} from "lucide-react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { Project } from "@/types/operations";
import { CreateProjectDrawer } from "./create-project-drawer";
import { ProjectCardSkeleton } from "./skeletons/project-card-skeleton";

const STATUS_FILTERS = ["All", "In progress", "Completed", "Pending"];
const PRIORITY_FILTERS = ["All", "High", "Medium", "Low"];

interface ProjectsViewProps {
  projects: Project[];
  onViewProject: (projectId: string) => void;
  isLoading?: boolean;
}

export function ProjectsView({ projects, onViewProject, isLoading = false }: ProjectsViewProps) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [showFilters, setShowFilters] = useState(false);
  const [showDrawer, setShowDrawer] = useState(false);

  const filtered = useMemo(
    () =>
      projects.filter((p) => {
        const matchesSearch = p.name
          .toLowerCase()
          .includes(search.toLowerCase());
        const matchesStatus =
          statusFilter === "All" || p.status === statusFilter;
        const matchesPriority =
          priorityFilter === "All" || p.priority === priorityFilter;
        return matchesSearch && matchesStatus && matchesPriority;
      }),
    [projects, search, statusFilter, priorityFilter],
  );

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[20px] font-extrabold text-[#09232D] shrink-0">
          All project
        </h1>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 flex-1 md:justify-end min-w-0">
          {/* Search */}
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
              placeholder="Search for Agents"
              className="w-full bg-white pl-13 pr-5 text-[14px] placeholder:text-gray-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-[#09232D]/10 transition-all font-sans"
              style={{
                height: "46px",
                borderRadius: "24px",
                border: "0.7px solid #D7D7D7",
                boxShadow:
                  "0px 1px 3px 0px #0000004D, 0px 4px 8px 3px #00000026",
              }}
            />
          </div>

          {/* Filter toggle — icon before text */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all shrink-0 cursor-pointer ${
              showFilters ? "text-white" : "text-gray-500"
            }`}
            style={{
              background: showFilters ? "#34373C" : "#F8F8F8",
              border: showFilters
                ? "0.5px solid #34373C"
                : "0.5px solid #D1D1D1",
              boxShadow: showFilters ? "none" : "0 2px 8px rgba(0, 0, 0, 0.06)",
            }}
          >
            <SlidersHorizontal size={14} strokeWidth={2} />
            <span
              style={{
                fontFamily: "Poppins, sans-serif",
                fontWeight: 400,
                fontStyle: "normal",
                fontSize: "10px",
                lineHeight: "100%",
                letterSpacing: "0%",
                verticalAlign: "middle",
              }}
            >
              Filter
            </span>
          </button>

          {/* Create — shorter than search */}
          <button
            onClick={() => setShowDrawer(true)}
            className="flex items-center gap-2 px-5 py-3 bg-[#09232D] text-white rounded-xl text-[13px] font-bold hover:opacity-90 transition-all shrink-0 cursor-pointer"
            style={{ boxShadow: "0 4px 14px rgba(9, 35, 45, 0.3)" }}
          >
            <BookmarkPlus size={15} strokeWidth={2} />
            <span className="hidden sm:inline whitespace-nowrap">
              Create New Project
            </span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </div>

      {/* ── Summary Cards ────────────────────────────────────── */}
      <SummaryCards projects={projects} isLoading={isLoading} />

      {/* ── Filter panel ─────────────────────────────────────── */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-400 px-1">
              Status
            </label>
            <div className="flex gap-1 flex-wrap">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-4 py-2 rounded-full text-[12px] font-bold transition-all ${
                    statusFilter === s
                      ? "bg-[#0B1215] text-white"
                      : "bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-bold text-gray-400 px-1">
              Priority
            </label>
            <div className="flex gap-1 flex-wrap">
              {PRIORITY_FILTERS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPriorityFilter(p)}
                  className={`px-4 py-2 rounded-full text-[12px] font-bold transition-all ${
                    priorityFilter === p
                      ? "bg-[#0B1215] text-white"
                      : "bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {(statusFilter !== "All" || priorityFilter !== "All") && (
            <div className="flex flex-col justify-end">
              <button
                onClick={() => {
                  setStatusFilter("All");
                  setPriorityFilter("All");
                }}
                className="px-4 py-2 rounded-full text-[12px] font-bold text-red-400 hover:bg-red-50 transition-all border border-red-200"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Grid — wrapped in a thick-shadow container ─────── */}
      {isLoading ? (
        <div
          className="bg-white rounded-3xl p-5 sm:p-7 border border-gray-100/60"
          style={{ boxShadow: "0px 8px 12px 6px #00000026" }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-4 gap-x-5 gap-y-10">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProjectCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-gray-400 text-[14px] font-medium">
          No projects match your search.
        </div>
      ) : (
        <div
          className="bg-white rounded-3xl p-5 sm:p-7 border border-gray-100/60"
          style={{ boxShadow: "0px 8px 12px 6px #00000026" }}
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

      {showDrawer && (
        <CreateProjectDrawer onClose={() => setShowDrawer(false)} />
      )}
    </div>
  );
}

// ─── Card ─────────────────────────────────────────────────────────────────────
function ProjectCard({
  project,
  onClick,
}: {
  project: Project;
  onClick: () => void;
}) {
  const statusCls = (s: string) => {
    switch (s) {
      case "In progress":
        return "bg-[#0E5D5D] text-white";
      case "Completed":
        return "bg-[#4FD1C5] text-[#0B1215]";
      case "Pending":
        return "bg-[#BD7A22] text-white";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };
  const priorityCls = (p: string) => {
    switch (p) {
      case "High":
        return "bg-[#A3E635] text-[#0B1215]";
      case "Medium":
        return "bg-[#FDE047] text-[#0B1215]";
      case "Low":
        return "bg-[#CBD5E1] text-[#0B1215]";
      default:
        return "bg-gray-100 text-gray-600";
    }
  };

  return (
    <div className="relative pb-5">
      <div
        className="bg-white rounded-3xl p-5 pt-6 border border-gray-100/80 transition-all"
        style={{ boxShadow: "0px 1px 2px 2px #00000026" }}
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[15px] font-bold text-[#09232D] leading-snug">
            {project.name}
          </h3>
          <button className="text-gray-300 hover:text-gray-500 transition-colors mt-0.5 shrink-0">
            <MoreVertical size={18} />
          </button>
        </div>

        <p className="text-[11px] text-gray-400 leading-relaxed line-clamp-3 mt-1.5">
          {project.description}
        </p>

        <p className="text-[11px] font-semibold text-gray-400 mt-3">
          {project.deadline}
        </p>

        <div className="flex items-center gap-2 mt-3">
          <span
            className={`px-3 py-1 rounded-full text-[10px] font-bold ${statusCls(project.status)}`}
          >
            {project.status}
          </span>
          <span
            className={`px-3 py-1 rounded-full text-[10px] font-bold ${priorityCls(project.priority)}`}
          >
            {project.priority}
          </span>
        </div>

        <div className="flex gap-2 mt-4">
          <div className="flex-1 min-w-0">
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#6B9A9A] rounded-full"
                style={{ width: `${project.completedPercent}%` }}
              />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#F87171] rounded-full"
                style={{ width: `${project.pendingPercent}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 mt-1.5 mb-3">
          <span className="flex-1 text-[10px] font-semibold text-gray-400">
            Completed
          </span>
          <span className="flex-1 text-[10px] font-semibold text-gray-400">
            Pending
          </span>
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

// ─── Chart data ───────────────────────────────────────────────────────────────
const TOTAL_PROJECTS_DATA = [
  { value: 30 },
  { value: 18 },
  { value: 28 },
  { value: 28 },
  { value: 20 },
  { value: 26 },
  { value: 8 },
  { value: 32 },
];

const PENDING_PROJECTS_DATA = [
  { value: 34 },
  { value: 22 },
  { value: 30 },
  { value: 30 },
  { value: 32 },
  { value: 24 },
  { value: 12 },
  { value: 34 },
];

// ─── Summary Cards ─────────────────────────────────────────────────────────────
// Full 270° arc → circumference segment = (270/360) × 2π×40 = 188.5
const ARC_LENGTH = 188.5;
const CIRCUMFERENCE = 251.3;

function performanceLabel(pct: number) {
  if (pct >= 80) return "Excellent";
  if (pct >= 60) return "Good";
  if (pct >= 40) return "Fair";
  return "Poor";
}

function SummaryCards({ projects, isLoading }: { projects: Project[]; isLoading: boolean }) {
  const total = projects.length;
  const pending = projects.filter((p) => p.status === "Pending").length;
  const completed = projects.filter((p) => p.status === "Completed").length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  // Single JS animation loop — drives both arc and dot together
  const [animatedPct, setAnimatedPct] = useState(0);
  useEffect(() => {
    const duration = 1200;
    const start = performance.now();
    const target = percent;
    // ease-in-out cubic
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
    let raf: number;
    function frame(now: number) {
      const t = Math.min((now - start) / duration, 1);
      setAnimatedPct(ease(t) * target);
      if (t < 1) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [percent]);

  const animatedDash = (animatedPct / 100) * ARC_LENGTH;
  const dotAngle = (animatedPct / 100) * 270 * (Math.PI / 180);
  const dotX = 50 + 40 * Math.cos(dotAngle);
  const dotY = 50 + 40 * Math.sin(dotAngle);

  return (
    <div className="grid grid-cols-12 gap-4 w-full animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* 1. Overall Project Performance */}
      <div className="col-span-12 xl:col-span-4 bg-[#0B1C25] rounded-[20px] p-6 sm:p-8 relative shadow-sm flex items-center gap-6 lg:gap-10 overflow-hidden min-h-[208px]">
        {/* Donut chart */}
        <div className="relative w-30 h-30 shrink-0">
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full"
            style={{ transform: "rotate(135deg)" }}
          >
            {/* Dim track */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="#6B9A9A"
              strokeOpacity="0.3"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
            />
            {/* White full-track */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="white"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
            />
            {/* Animated teal progress arc */}
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="#6B9A9A"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${animatedDash} ${CIRCUMFERENCE}`}
            />
            {/* Valve dot — tracks the live end of the progress arc */}
            <circle
              cx={dotX}
              cy={dotY}
              r="6"
              fill="#8AB8B8"
              stroke="#0B1C25"
              strokeWidth="2.5"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
            <div className="w-10 h-10 rounded-full bg-[#EF6C55] flex items-center justify-center shadow-lg">
              <User size={18} className="text-white fill-current" />
            </div>
            <span className="text-white font-extrabold text-[15px] leading-none">
              {percent}%
            </span>
          </div>
        </div>
        <div className="flex flex-col z-10 text-white min-w-0">
          <p className="text-white/60 font-normal text-[14px] sm:text-[16px] leading-tight mb-0.5">
            Overall Project
          </p>
          <h2 className="text-[28px] sm:text-[34px] font-extrabold leading-[1.1] mb-3 tracking-tight">
            Performance
          </h2>
          <p className="text-[13px] font-medium text-white/60">
            Status:{" "}
            <span className="text-white font-semibold">
              {performanceLabel(percent)}
            </span>
          </p>
        </div>
      </div>

      {/* spacer — xl only */}
      {/* <div className="hidden xl:block xl:col-span-1" /> */}

        {/* 2. Total Projects */}
        <div className="col-span-12 md:col-span-4 xl:col-span-3 bg-white rounded-[20px] overflow-hidden border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] relative flex flex-col min-h-[196px]">
          <div className="flex items-start justify-between px-5 sm:px-6 pt-5 sm:pt-6">
            <div>
              <p className="text-[16px] font-semibold text-[#2D2D2D] mb-1">
                Total Projects
              </p>
              {isLoading ? (
                <div className="h-12 w-24 bg-gray-200 rounded-lg animate-pulse mt-1" />
              ) : (
                <h2 className="text-[52px] font-extrabold text-[#1A1A1A] leading-none tracking-[-0.04em]">
                  {String(total).padStart(3, "0")}
                </h2>
              )}
            </div>
            <button className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#2ECC71] text-white rounded-full text-[10px] font-bold hover:bg-[#27ae60] transition-colors shadow-sm mt-1">
              View All <ArrowUpRight size={11} strokeWidth={3} />
            </button>
          </div>
          <div className="w-full h-20 mt-auto">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={TOTAL_PROJECTS_DATA}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2ECC71" stopOpacity={1} />
                    <stop offset="95%" stopColor="#D9D9D9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="natural"
                  dataKey="value"
                  stroke="#2ECC71"
                  strokeWidth={0}
                  fillOpacity={1}
                  fill="url(#gradGreen)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. Pending Projects */}
        <div className="col-span-12 md:col-span-4 xl:col-span-3 bg-white rounded-[20px] overflow-hidden border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] relative flex flex-col min-h-[196px]">
          <div className="flex items-start justify-between px-5 sm:px-6 pt-5 sm:pt-6">
            <div>
              <p className="text-[16px] font-semibold text-[#2D2D2D] mb-1">
                Pending Projects
              </p>
              {isLoading ? (
                <div className="h-12 w-24 bg-gray-200 rounded-lg animate-pulse mt-1" />
              ) : (
                <h2 className="text-[52px] font-extrabold text-[#1A1A1A] leading-none tracking-[-0.04em]">
                  {String(pending).padStart(3, "0")}
                </h2>
              )}
            </div>
            <button className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#E8875B] text-white rounded-full text-[10px] font-bold hover:bg-[#d57848] transition-colors shadow-sm mt-1">
              View All <ArrowUpRight size={11} strokeWidth={3} />
            </button>
          </div>
          <div className="w-full h-20 mt-auto">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={PENDING_PROJECTS_DATA}
                margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="gradOrange" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E8875B" stopOpacity={1} />
                    <stop offset="95%" stopColor="#D9D9D9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="natural"
                  dataKey="value"
                  stroke="#E8875B"
                  strokeWidth={0}
                  fillOpacity={1}
                  fill="url(#gradOrange)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 4. Agents — View Agent who hasn't commenced task */}
        <div className="col-span-12 md:col-span-4 xl:col-span-2 bg-[#7BA9A4] rounded-[20px] p-4 shadow-sm relative flex flex-col items-center min-h-[196px] text-center justify-between">
          <p className="text-white text-[13px] font-medium leading-[1.4] max-w-[140px] mx-auto mt-1">
            View Agent who hasn&apos;t commenced task
          </p>
          <button className="flex items-center gap-1.5 px-4 py-1.5 bg-[#0E2A33] text-white rounded-full text-[10px] font-bold hover:bg-[#061820] transition-colors">
            View All <ArrowUpRight size={11} strokeWidth={3} />
          </button>

          <div className="w-[72px] h-[72px] relative flex items-center justify-center mt-2 mb-1">
            <svg
              viewBox="0 0 100 100"
              className="absolute inset-0 w-full h-full"
              style={{ transform: "rotate(135deg)" }}
            >
              {/* Background track — faded white */}
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="rgba(255,255,255,0.25)"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray="188.5 251.3"
              />
              {/* White progress arc */}
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="white"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray="81 251.3"
              />
              {/* Dark accent at the top */}
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="#0E2A33"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray="30 251.3"
                strokeDashoffset="-81"
              />
              {/* Endpoint dot */}
              <circle
                cx="32.4"
                cy="85.9"
                r="4.5"
                fill="white"
                stroke="#7BA9A4"
                strokeWidth="2"
              />
            </svg>
            <div className="relative w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm">
              <User size={14} className="text-[#09232D] fill-current" />
            </div>
          </div>
          <span className="text-white text-[14px] font-extrabold">43%</span>
        </div>
    </div>
  );
}
