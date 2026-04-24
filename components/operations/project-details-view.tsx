"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, SlidersHorizontal, BookmarkPlus, Loader2 } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { TaskBoard } from "@/components/operations/task-board";
import { OperationsCalendar } from "@/components/operations/operations-calendar";
import { CreateTaskModal } from "@/components/operations/create-task-modal";
import { TaskDetailModal } from "@/components/operations/task-detail-modal";
import { ProjectDetailsSkeleton } from "@/components/operations/skeletons/project-details-skeleton";
import { useProject } from "@/hooks/use-projects";
import { useTasks } from "@/hooks/use-tasks";
import type { DndContainer, DndItem } from "@/types/operations";
import type { TaskApiItem } from "@/lib/api/tasks";

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

export function ProjectDetailsView({ projectId }: { projectId: string }) {
  const router = useRouter();
  
  const { data: project, isPending: loadingProject } = useProject(projectId);
  const { data: tasksData, isPending: loadingTasks } = useTasks({ project_id: projectId });

  const [showModal, setShowModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<{ item: DndItem; containerId: string } | null>(null);

  // Map API Tasks to DndContainer structure
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

  const stats = useMemo(() => {
    const total = containers.reduce((s, c) => s + c.items.length, 0);
    if (total === 0) return [
      { name: "Pending", value: 0, color: "#BD7A22" },
      { name: "In Progress", value: 0, color: "#094B5C" },
      { name: "Complete", value: 0, color: "#4FD1C5" },
    ];
    const pending = containers.find((c) => c.id === "pending")?.items.length ?? 0;
    const inProgress = containers.find((c) => c.id === "in-progress")?.items.length ?? 0;
    const completed = containers.find((c) => c.id === "completed")?.items.length ?? 0;
    
    return [
      { name: "Pending", value: Math.round((pending / total) * 100), color: "#BD7A22" },
      { name: "In Progress", value: Math.round((inProgress / total) * 100), color: "#094B5C" },
      { name: "Complete", value: Math.round((completed / total) * 100), color: "#4FD1C5" },
    ];
  }, [containers]);

  if (loadingProject) {
    return <ProjectDetailsSkeleton />;
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#F4F7F9] p-8 flex flex-col items-center justify-center text-gray-400">
        <span className="font-bold text-lg">Project not found</span>
        <button onClick={() => router.push("/projects")} className="mt-4 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg">Go back</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="flex flex-col xl:flex-row gap-6 items-start animate-in fade-in slide-in-from-bottom-4 duration-500">

        {/* ── LEFT: header + kanban ─────────────────────────── */}
        <div className="flex-1 xl:flex-3 min-w-0 flex flex-col gap-5 w-full">

          {/* Header row */}
          <div className="flex flex-col gap-6 mb-8">
            <div className="flex flex-col md:flex-row items-start gap-4 md:gap-12">
              <button
                onClick={() => router.push("/projects")}
                className="mt-1 text-[#092635] hover:opacity-70 transition-all shrink-0 cursor-pointer"
              >
                <ChevronLeft size={24} strokeWidth={2} />
              </button>
              
              <div className="flex-1">
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div>
                    <h1 className="text-[20px] font-extrabold text-[#092635] leading-tight">
                      {project.name}
                    </h1>
                    <p className="text-[16px] text-[#717171] mt-1 max-w-2xl font-light">
                      {project.description || "No description provided."}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      className="flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 rounded-xl transition-all cursor-pointer bg-white border border-[#D1D1D1] shadow-sm hover:bg-gray-50 flex-1 sm:flex-initial justify-center"
                    >
                      <SlidersHorizontal size={16} strokeWidth={2} className="text-gray-400" />
                      <span className="text-gray-500 text-[12px] font-medium">Filter</span>
                    </button>

                    <button
                      onClick={() => setShowModal(true)}
                      className="flex items-center gap-2 px-4 md:px-5 py-2.5 md:py-3 bg-[#09232D] text-white rounded-xl text-[13px] font-bold hover:opacity-90 transition-all shadow-md cursor-pointer whitespace-nowrap flex-1 sm:flex-initial justify-center"
                    >
                      <BookmarkPlus size={16} strokeWidth={2} />
                      <span>Create New Task</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 md:gap-8 mt-6 md:mt-8">
                  <div className="space-y-1">
                    <h3 className="text-[14px] md:text-[16px] font-bold text-[#092635]">Created By</h3>
                    <p className="text-[14px] md:text-[16px] text-[#717171] font-light">
                      {project.manager?.name || "Unknown"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-[14px] md:text-[16px] font-bold text-[#092635]">Due Date</h3>
                    <p className="text-[14px] md:text-[16px] text-[#717171] font-light">
                      {project.deadline || "No deadline"}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-[14px] md:text-[16px] font-bold text-[#092635]">Emphasis</h3>
                    <div className="mt-1">
                      <span className="px-6 py-1 bg-[#C241B4] text-white rounded-full text-[12px] font-bold inline-flex items-center justify-center min-w-[100px] capitalize">
                        {project.priority}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {loadingTasks ? (
            <div className="py-20 flex justify-center text-gray-400">
              <Loader2 className="animate-spin" />
            </div>
          ) : (
            <TaskBoard
              containers={containers}
              activeTab="all"
              onAddCard={() => {}}
              findContainer={() => undefined}
              moveItem={() => {}}
              moveToContainer={() => {}}
              moveBetweenContainers={() => {}}
              onTaskClick={(item, containerId) => setSelectedTask({ item, containerId })}
            />
          )}
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
        projectId={projectId}
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

function mapTaskToDnd(apiTask: TaskApiItem): DndItem {
  let statusLabel = "Pending";
  if (apiTask.status === "in_progress") statusLabel = "In Progress";
  if (apiTask.status === "completed") statusLabel = "Completed";

  return {
    id: String(apiTask.id),
    label: `Agent ID: ${apiTask.assigned_agent_id}`, // Fallback if name is missing from payload
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
