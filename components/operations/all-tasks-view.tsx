"use client";

import { useState, useMemo } from "react";
import { SlidersHorizontal, BookmarkPlus } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { TaskBoard } from "./task-board";
import { OperationsCalendar } from "./operations-calendar";
import { CreateTaskModal } from "./create-task-modal";
import { TaskDetailModal } from "./task-detail-modal";
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
  cx = 0,
  cy = 0,
  midAngle = 0,
  innerRadius = 0,
  outerRadius = 0,
  value = 0,
}: {
  cx?: number;
  cy?: number;
  midAngle?: number;
  innerRadius?: number;
  outerRadius?: number;
  value?: number;
}) {
  const RADIAN = Math.PI / 180;
  const r = innerRadius + (outerRadius - innerRadius) / 2;
  const x = cx + r * Math.cos(-midAngle * RADIAN);
  const y = cy + r * Math.sin(-midAngle * RADIAN);
  return (
    <g>
      <circle cx={x} cy={y} r={22} fill="white" />
      <text
        x={x}
        y={y}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#0B1215"
        fontSize={12}
        fontWeight={800}
      >
        {value}%
      </text>
    </g>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export function AllTasksView() {
  const {
    containers,
    addItem,
    moveItem,
    moveToContainer,
    moveBetweenContainers,
    findContainer,
  } = useDragAndDrop(INITIAL_DATA);

  const [showModal, setShowModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<{
    item: DndItem;
    containerId: string;
  } | null>(null);

  const stats = useMemo(() => {
    const total = containers.reduce(
      (s: number, c: DndContainer) => s + c.items.length,
      0,
    );
    if (total === 0)
      return [
        { name: "Pending", value: 0, color: "#BD7A22" },
        { name: "In Progress", value: 0, color: "#094B5C" },
        { name: "Complete", value: 0, color: "#4FD1C5" },
      ];
    const pending =
      containers.find((c: DndContainer) => c.id === "pending")?.items.length ??
      0;
    const inProgress =
      containers.find((c: DndContainer) => c.id === "in-progress")?.items
        .length ?? 0;
    const completed =
      containers.find((c: DndContainer) => c.id === "completed")?.items
        .length ?? 0;
    return [
      {
        name: "Pending",
        value: Math.round((pending / total) * 100),
        color: "#BD7A22",
      },
      {
        name: "In Progress",
        value: Math.round((inProgress / total) * 100),
        color: "#094B5C",
      },
      {
        name: "Complete",
        value: Math.round((completed / total) * 100),
        color: "#4FD1C5",
      },
    ];
  }, [containers]);

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Toolbar ───────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-3">
        <button className="flex items-center gap-2.5 px-6 py-3.5 bg-white border border-gray-100 rounded-full text-[13px] font-bold text-gray-500 hover:bg-gray-50 transition-all shadow-sm">
          <span className="opacity-70">Filter</span>
          <SlidersHorizontal size={14} className="opacity-70" />
        </button>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 sm:px-6 py-3 bg-[#09232D] text-white rounded-xl text-[13px] font-bold hover:opacity-90 transition-all shadow-lg shrink-0 cursor-pointer"
        >
          <span>Create New Task</span>
          <BookmarkPlus size={16} />
        </button>
      </div>

      {/* ── Board + sidebar ───────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row gap-6">
        {/* Kanban */}
        <div className="flex-1 min-w-0">
          <TaskBoard
            containers={containers}
            activeTab="all"
            onAddCard={addItem}
            findContainer={findContainer}
            moveItem={moveItem}
            moveToContainer={moveToContainer}
            moveBetweenContainers={moveBetweenContainers}
            onTaskClick={(item, containerId) =>
              setSelectedTask({ item, containerId })
            }
          />
        </div>

        {/* Stats sidebar */}
        <div className="w-full xl:w-[360px] 2xl:w-[420px] flex flex-col gap-6 shrink-0">
          <div className="bg-[#0A1A22] rounded-[32px] px-4 py-4 shadow-xl relative overflow-hidden">
            <h3 className="text-gray-400 font-medium text-[15px] mb-6">
              Task Stats
            </h3>
            <div className="flex items-center gap-3">
              <div className="w-48 h-48 shrink-0 relative -left-4">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats}
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={78}
                      paddingAngle={0}
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
              <div className="space-y-4">
                {stats.map((stat, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: stat.color }}
                    />
                    <span className="text-[13px] text-gray-400 font-medium">
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

      {/* ── Modals ────────────────────────────────────────────── */}
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
