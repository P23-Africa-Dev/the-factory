"use client";

import { useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { TaskBoard } from "./task-board";
import { TaskDetailModal } from "./task-detail-modal";
import { useDragAndDrop } from "@/lib/hooks/use-tasks-dnd";
import type { DndContainer, DndItem } from "@/types/operations";

// ─── Seed data: all tasks across all projects ─────────────────────────────────
const INITIAL_DATA: DndContainer[] = [
  {
    id: "pending",
    title: "Pending Task",
    color: "#BD7A22",
    items: [
      {
        id: "p1-task-1",
        label: "Francis Nasyomba",
        description: "Cover the entirety of Ikeja CV",
        location: "Computer Village, Ikeja, Lagos",
        time: "12 hours ago",
        category: "agent",
        dueDate: "Friday, 3rd April 2026",
        assignedBy: "Ridwan Thomson (Supervisor)",
        addedDescription:
          "Visit the Ikeja Computer village, and promote (product name) to the target audience there.\n\nSpeak with the business owner and note:\n- Contact Details\n- Prospect brief\n- Any other usable details.",
        statusLabel: "Pending",
      },
      {
        id: "p2-task-1",
        label: "Ngozi Eze",
        description: "Survey Oshodi market vendors",
        location: "Oshodi, Lagos",
        time: "3 hours ago",
        category: "agent",
        dueDate: "Monday, 7th April 2026",
        assignedBy: "Aisha Bello (Supervisor)",
        statusLabel: "Pending",
      },
      {
        id: "p3-task-1",
        label: "Tunde Adeyemi",
        description: "Collect feedback from Yaba tech hub",
        location: "Yaba, Lagos",
        time: "6 hours ago",
        category: "agent",
        dueDate: "Thursday, 10th April 2026",
        assignedBy: "Chukwuma Eze (Supervisor)",
        statusLabel: "Pending",
      },
      {
        id: "p4-task-1",
        label: "Kelechi Obi",
        description: "Map all retail outlets in Ikorodu",
        location: "Ikorodu, Lagos",
        time: "30 minutes ago",
        category: "attendance",
        dueDate: "Friday, 11th April 2026",
        assignedBy: "Ridwan Thomson (Supervisor)",
        statusLabel: "Pending",
      },
    ],
  },
  {
    id: "in-progress",
    title: "Task In-Progress",
    color: "#094B5C",
    items: [
      {
        id: "p1-task-2",
        label: "Amara Okafor",
        description: "Visit Lekki Phase 1 market",
        location: "Lekki Phase 1, Lagos",
        time: "1 day ago",
        category: "attendance",
        dueDate: "Saturday, 4th April 2026",
        assignedBy: "Ridwan Thomson (Supervisor)",
        addedDescription:
          "Visit Lekki Phase 1 market and speak with vendors about our product.\n\nCollect:\n- Business cards\n- Contact info\n- Feedback on product interest.",
        statusLabel: "In Progress",
      },
      {
        id: "p2-task-2",
        label: "Emeka Nwosu",
        description: "Follow up with Alaba contacts",
        location: "Alaba Int'l Market, Lagos",
        time: "5 hours ago",
        category: "agent",
        dueDate: "Tuesday, 8th April 2026",
        assignedBy: "Aisha Bello (Supervisor)",
        statusLabel: "In Progress",
      },
    ],
  },
  {
    id: "completed",
    title: "Completed Task",
    color: "#4FD1C5",
    items: [
      {
        id: "p1-task-3",
        label: "Chidi Okonkwo",
        description: "Document all contacts from Surulere",
        location: "Surulere, Lagos",
        time: "2 days ago",
        category: "agent",
        dueDate: "Wednesday, 1st April 2026",
        assignedBy: "Ridwan Thomson (Supervisor)",
        statusLabel: "Completed",
      },
      {
        id: "p3-task-2",
        label: "Blessing Okoro",
        description: "Complete Victoria Island zone report",
        location: "Victoria Island, Lagos",
        time: "1 day ago",
        category: "attendance",
        dueDate: "Wednesday, 9th April 2026",
        assignedBy: "Chukwuma Eze (Supervisor)",
        statusLabel: "Completed",
      },
    ],
  },
];

export function AllTasksView() {
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [selectedTask, setSelectedTask] = useState<{
    item: DndItem;
    containerId: string;
  } | null>(null);

  const {
    containers,
    addItem,
    moveItem,
    moveToContainer,
    moveBetweenContainers,
    findContainer,
  } = useDragAndDrop(INITIAL_DATA);

  // Apply search + status filtering
  const filteredContainers: DndContainer[] = containers
    .filter(
      (c) =>
        statusFilter === "All" ||
        c.id ===
          statusFilter
            .toLowerCase()
            .replace(" ", "-")
            .replace("in progress", "in-progress"),
    )
    .map((c) => {
      if (!search.trim()) return c;
      const q = search.toLowerCase();
      return {
        ...c,
        items: c.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            (item.location && item.location.toLowerCase().includes(q)),
        ),
      };
    });

  // Derive the status filter key from readable name
  const statusFilterToContainerId = (s: string) => {
    if (s === "Pending") return "pending";
    if (s === "In Progress") return "in-progress";
    if (s === "Completed") return "completed";
    return null;
  };

  const STATUS_OPTIONS = ["All", "Pending", "In Progress", "Completed"];

  // Apply proper filtering
  const displayContainers: DndContainer[] = containers
    .filter((c) => {
      if (statusFilter === "All") return true;
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
            (item.location && item.location.toLowerCase().includes(q)),
        ),
      };
    });

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[20px] font-extrabold text-[#09232D] shrink-0">
          All Tasks
        </h1>

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
                height: "46px",
                borderRadius: "24px",
                border: "0.7px solid #D7D7D7",
                boxShadow:
                  "0px 1px 3px 0px #0000004D, 0px 4px 8px 3px #00000026",
              }}
            />
          </div>

          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 px-2.5 py-1.75 rounded-[10px] transition-all shrink-0 cursor-pointer  ${
              showFilters ? "text-white" : "text-gray-500"
            }`}
            style={{
              background: showFilters ? "#34373C" : "#F8F8F8",
              border: showFilters
                ? "0.5px solid #34373C"
                : "0.5px solid #D1D1D1",
              boxShadow: showFilters ? "none" : "0 2px 8px rgba(0,0,0,0.06)",
            }}
          >
            <SlidersHorizontal size={14} strokeWidth={2} />
            <span style={{ fontSize: "10px", fontWeight: 400 }}>Filter</span>
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
                      ? "bg-[#0B1215] text-white"
                      : "bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {statusFilter !== "All" && (
            <div className="flex flex-col justify-end">
              <button
                onClick={() => setStatusFilter("All")}
                className="px-4 py-2 rounded-full text-[12px] font-bold text-red-400 hover:bg-red-50 transition-all border border-red-200"
              >
                Clear filter
              </button>
            </div>
          )}
        </div>
      )}

      {/* Task Board */}
      <TaskBoard
        containers={displayContainers}
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

      {/* Task Detail Modal */}
      <TaskDetailModal
        isOpen={!!selectedTask}
        onClose={() => setSelectedTask(null)}
        task={selectedTask?.item ?? null}
        status={selectedTask?.containerId ?? ""}
      />
    </div>
  );
}
