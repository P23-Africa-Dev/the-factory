"use client";

import { Suspense, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, SlidersHorizontal, BookmarkPlus } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { TaskBoard } from "@/components/operations/task-board";
import { OperationsCalendar } from "@/components/operations/operations-calendar";
import { CreateTaskModal } from "@/components/operations/create-task-modal";
import { TaskDetailModal } from "@/components/operations/task-detail-modal";
import { useDragAndDrop } from "@/lib/hooks/use-tasks-dnd";
import type { DndContainer, DndItem } from "@/types/operations";

// ─── Seed data ────────────────────────────────────────────────────────────────
const INITIAL_DATA: DndContainer[] = [
  {
    id: "pending",
    title: "Pending Task",
    color: "#BD7A22",
    items: [
      {
        id: "task-1",
        label: "Francis Nasyomba",
        description: "Cover the entirety of Ikeja CV",
        location: "Computer Village, Ikeja, Otigba, Ikeja, Lagos",
        time: "12 hours ago",
        category: "agent",
        dueDate: "Tomorrow (Friday, 3rd April. 2026)",
        assignedBy: "Ridwan Thomson (Supervisor)",
        addedDescription:
          "Visit the Ikeja Computer village, and promote (product name) to the target audience there.\n\nSpeak with the business owner and note:\n- Contact Details\n- Prospect brief\n- Any other usable details.",
        statusLabel: "Pending",
      },
      {
        id: "task-4",
        label: "Francis Nasyomba",
        description: "Cover the entirety of Ikeja CV",
        location: "Computer Village, Ikeja, Otigba, Ikeja, Lagos",
        time: "12 hours ago",
        category: "attendance",
      },
      {
        id: "task-7",
        label: "Francis Nasyomba",
        description: "Cover the entirety of Ikeja CV",
        location: "Computer Village, Ikeja, Otigba, Ikeja, Lagos",
        time: "12 hours ago",
        category: "agent",
      },
    ],
  },
  {
    id: "in-progress",
    title: "Task In-Progress",
    color: "#094B5C",
    items: [
      {
        id: "task-2",
        label: "Francis Nasyomba",
        description: "Cover the entirety of Ikeja CV",
        location: "Computer Village, Ikeja, Otigba, Ikeja, Lagos",
        time: "12 hours ago",
        category: "attendance",
        dueDate: "Tomorrow (Friday, 3rd April. 2026)",
        assignedBy: "Ridwan Thomson (Supervisor)",
        addedDescription:
          "Visit the Ikeja Computer village, and promote (product name) to the target audience there.\n\nSpeak with the business owner and note:\n- Contact Details\n- Prospect brief\n- Any other usable details.",
        statusLabel: "In Progress",
      },
      {
        id: "task-5",
        label: "Francis Nasyomba",
        description: "Cover the entirety of Ikeja CV",
        location: "Computer Village, Ikeja, Otigba, Ikeja, Lagos",
        time: "12 hours ago",
        category: "agent",
      },
      {
        id: "task-8",
        label: "Francis Nasyomba",
        description: "Cover the entirety of Ikeja CV",
        location: "Computer Village, Ikeja, Otigba, Ikeja, Lagos",
        time: "12 hours ago",
        category: "attendance",
      },
    ],
  },
  {
    id: "completed",
    title: "Completed Task",
    color: "#4FD1C5",
    items: [
      {
        id: "task-3",
        label: "Francis Nasyomba",
        description: "Cover the entirety of Ikeja CV",
        location: "Computer Village, Ikeja, Otigba, Ikeja, Lagos",
        time: "12 hours ago",
        category: "agent",
      },
      {
        id: "task-6",
        label: "Francis Nasyomba",
        description: "Cover the entirety of Ikeja CV",
        location: "Computer Village, Ikeja, Otigba, Ikeja, Lagos",
        time: "12 hours ago",
        category: "attendance",
      },
    ],
  },
];

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

// ─── Page content ─────────────────────────────────────────────────────────────
function ProjectTasksContent() {
  const router = useRouter();

  const { containers, addItem, moveItem, moveToContainer, moveBetweenContainers, findContainer } =
    useDragAndDrop(INITIAL_DATA);

  const [showModal, setShowModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<{ item: DndItem; containerId: string } | null>(null);

  const stats = useMemo(() => {
    const total = containers.reduce((s: number, c: DndContainer) => s + c.items.length, 0);
    if (total === 0) return [
      { name: "Pending", value: 0, color: "#BD7A22" },
      { name: "In Progress", value: 0, color: "#094B5C" },
      { name: "Complete", value: 0, color: "#4FD1C5" },
    ];
    const pending = containers.find((c: DndContainer) => c.id === "pending")?.items.length ?? 0;
    const inProgress = containers.find((c: DndContainer) => c.id === "in-progress")?.items.length ?? 0;
    const completed = containers.find((c: DndContainer) => c.id === "completed")?.items.length ?? 0;
    return [
      { name: "Pending", value: Math.round((pending / total) * 100), color: "#BD7A22" },
      { name: "In Progress", value: Math.round((inProgress / total) * 100), color: "#094B5C" },
      { name: "Complete", value: Math.round((completed / total) * 100), color: "#4FD1C5" },
    ];
  }, [containers]);

  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="flex flex-col xl:flex-row gap-6 items-start animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* ── LEFT: header + kanban ─────────────────────────── */}
        <div className="flex-1 xl:flex-3 min-w-0 flex flex-col gap-5 w-full">

          {/* Header row */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4 md:mb-8">
            <div className="flex items-start gap-3">
              <button
                onClick={() => router.push("/projects")}
                className="mt-1 flex items-center justify-center w-8 h-8 rounded-full bg-white border border-gray-100 shadow-sm hover:shadow-md hover:text-[#09232D] text-gray-400 transition-all shrink-0 cursor-pointer"
              >
                <ChevronLeft size={18} strokeWidth={2.5} />
              </button>
              <div>
                <h1 className="text-[18px] font-extrabold text-[#09232D] leading-tight">
                  Product Outreach
                </h1>
                <p className="text-[11px] text-gray-400 mt-0.5 max-w-xs leading-relaxed">
                  Physical outreach and transforms executive networking from
                  casual connections to strategic growth
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:shrink-0">
              <button
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-medium transition-all cursor-pointer"
                style={{ background: "#F8F8F8", border: "0.5px solid #D1D1D1" }}
              >
                <SlidersHorizontal size={13} strokeWidth={2} className="text-gray-400" />
                <span className="text-gray-500 text-[10px]">Filter</span>
              </button>

              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#09232D] text-white rounded-xl text-[12px] font-bold hover:opacity-90 transition-all shadow-md cursor-pointer whitespace-nowrap"
              >
                <BookmarkPlus size={14} strokeWidth={2} />
                <span className="hidden sm:inline">Create New Task</span>
                <span className="sm:hidden">New Task</span>
              </button>
            </div>
          </div>

          <TaskBoard
            containers={containers}
            activeTab="all"
            onAddCard={addItem}
            findContainer={findContainer}
            moveItem={moveItem}
            moveToContainer={moveToContainer}
            moveBetweenContainers={moveBetweenContainers}
            onTaskClick={(item, containerId) => setSelectedTask({ item, containerId })}
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

      <CreateTaskModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onCreateTask={(containerId, item) => addItem(containerId, item)}
      />
      <TaskDetailModal
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        task={selectedTask?.item ?? null}
        status={selectedTask?.containerId ?? ""}
      />
    </div>
  );
}

export default function ProjectTasksPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F4F7F9] p-8 flex items-center justify-center font-bold text-gray-400">
          Loading Tasks...
        </div>
      }
    >
      <ProjectTasksContent />
    </Suspense>
  );
}
