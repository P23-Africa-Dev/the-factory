"use client";

import { useDragAndDrop } from "@/lib/hooks/use-tasks-dnd";
import type { DndContainer, DndItem } from "@/types/operations";
import { useDroppable } from "@dnd-kit/core";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  Import,
  LayoutGrid,
  List,
  MoreHorizontal,
  Plus,
  Search,
  SlidersHorizontal,
  Tag,
} from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const chartData = [
  { day: "Mon", value: 180 },
  { day: "Tues", value: 250 },
  { day: "Weds", value: 220 },
  { day: "Thurs", value: 380 },
  { day: "Fri", value: 300 },
  { day: "Sat", value: 420 },
];

const CRM_INITIAL_DATA: DndContainer[] = [
  {
    id: "new",
    title: "New Leads",
    color: "#2563EB",
    items: [
      {
        id: "lead-1",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
      {
        id: "lead-8",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
      {
        id: "lead-9",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
    ],
  },
  {
    id: "proposal-sent",
    title: "Proposal Sent",
    color: "#F59E0B",
    items: [
      {
        id: "lead-2",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
      {
        id: "lead-10",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
      {
        id: "lead-11",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
    ],
  },
  {
    id: "contacted",
    title: "Contacted",
    color: "#E879A0",
    items: [
      {
        id: "lead-3",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
      {
        id: "lead-12",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
      {
        id: "lead-13",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
    ],
  },
  {
    id: "unqualified",
    title: "Unqualified",
    color: "#1A1F2C",
    items: [
      {
        id: "lead-4",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
      {
        id: "lead-14",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
      {
        id: "lead-15",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
    ],
  },
  {
    id: "qualified",
    title: "Qualified",
    color: "#10B981",
    items: [
      {
        id: "lead-5",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
      {
        id: "lead-16",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
      {
        id: "lead-17",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
    ],
  },
  {
    id: "lost",
    title: "Lost",
    color: "#EF4444",
    items: [
      {
        id: "lead-6",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
      {
        id: "lead-18",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
      {
        id: "lead-19",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
    ],
  },
  {
    id: "won",
    title: "Won",
    color: "#166534",
    items: [
      {
        id: "lead-7",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
      {
        id: "lead-20",
        label: "Francis Nasyomba",
        description: "Raisin Capital Limited",
        location: "40010",
        assignedBy: "Unassigned",
        time: "12 hours ago",
        category: "agent",
      },
    ],
  },
];

/* ─── Lead Card ─────────────────────────────────────────── */

function LeadCard({
  item,
  isDragOverlay,
}: {
  item: DndItem;
  isDragOverlay?: boolean;
}) {
  const router = useRouter();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const pointerStart = React.useRef<{ x: number; y: number } | null>(null);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const amount = item.location ? Number(item.location).toLocaleString() : "0";

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStart.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (pointerStart.current) {
      const dx = Math.abs(e.clientX - pointerStart.current.x);
      const dy = Math.abs(e.clientY - pointerStart.current.y);
      if (dx < 5 && dy < 5) {
        router.push(`/crm/leads/${item.id}`);
      }
    }
    pointerStart.current = null;
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onPointerDown={(e) => {
        handlePointerDown(e);
        listeners?.onPointerDown?.(e as any);
      }}
      onPointerUp={handlePointerUp}
      className={`bg-white rounded-[20px] p-5 shadow-[0px_4px_4px_0px_rgba(0,0,0,0.05),0px_8px_12px_rgba(0,0,0,0.03)] border border-gray-100 cursor-grab select-none mb-4 transition-all duration-300 hover:-translate-y-1
        ${isDragging && !isDragOverlay ? "opacity-40 scale-95" : ""}
        ${isDragOverlay ? "shadow-2xl scale-105 cursor-grabbing" : "hover:shadow-lg"}
      `}
    >
      <p className="text-[#0B1215] font-bold text-[14px] leading-tight">{item.label}</p>
      <p className="text-[#9CA3AF] text-[12px] mt-0.5">{item.description}</p>

      <div className="flex items-center justify-between mt-3">
        <span className="text-[#0B1215] font-bold text-[13px]">
          ₦ {amount}
        </span>
        <span className="bg-[#DCFCE7] text-[#16A34A] text-[11px] font-semibold px-3 py-0.5 rounded-full">
          Medium
        </span>
      </div>

      <div className="flex items-center justify-between mt-2">
        <span className="text-[#9CA3AF] text-[11px]">{item.assignedBy ?? "Unassigned"}</span>
        <span className="text-[#9CA3AF] text-[11px]">{item.time}</span>
      </div>
    </div>
  );
}

/* ─── Lead Column ────────────────────────────────────────── */

function LeadColumn({
  id,
  title,
  color,
  items,
  onAddCard,
}: {
  id: string;
  title: string;
  color: string;
  items: DndItem[];
  onAddCard: (item: DndItem) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div className="flex flex-col w-55 shrink-0">
      {/* Header */}
      <div
        className="rounded-t-[20px] px-4 pt-3 pb-8 flex items-center justify-between"
        style={{ backgroundColor: color }}
      >
        <div className="flex items-center gap-2">
          <span className="text-white font-semibold text-[13px]">{title}</span>
          <div
            className="rounded-full min-w-5.5 h-5.5 px-1.5 flex items-center justify-center font-bold text-[11px] bg-white"
            style={{ color }}
          >
            {items.length < 10 ? `0${items.length}` : items.length}
          </div>
        </div>
        <span className="text-white text-[12px] font-medium">₦ 342,000</span>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className={`flex-1 relative z-10 -mt-6 transition-colors duration-200 min-h-50 flex flex-col ${
          isOver ? "bg-gray-100/60 rounded-[20px] ring-2 ring-inset ring-gray-200" : ""
        }`}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="pt-2">
            {items.map((item) => (
              <LeadCard key={item.id} item={item} />
            ))}
          </div>
        </SortableContext>

        <button
          onClick={() =>
            onAddCard({
              id: `lead-${Date.now()}`,
              label: "New Lead",
              description: "Company Name",
              location: "0",
              assignedBy: "Unassigned",
              time: "Just now",
            })
          }
          className="w-full flex items-center justify-between px-3 py-2.5 text-gray-400 hover:text-[#0B1215] transition-colors group mt-1"
        >
          <span className="text-[11px] font-medium">Add Leads</span>
          <div className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center group-hover:border-[#0B1215] transition-colors">
            <Plus size={11} />
          </div>
        </button>
      </div>
    </div>
  );
}

/* ─── List View ─────────────────────────────────────────── */

function LeadListView({ containers }: { containers: DndContainer[] }) {
  const router = useRouter();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (id: string) =>
    setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  const allLeads = containers.flatMap((c) =>
    c.items.map((item) => ({ ...item, stageId: c.id, stageTitle: c.title, stageColor: c.color }))
  );

  return (
    <div className="px-4 pb-6">
      {/* Table header */}
      <div className="grid grid-cols-[2fr_2fr_1.2fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 mb-1">
        {["Lead", "Company", "Stage", "Amount", "Priority", "Assigned", ""].map((h) => (
          <span key={h} className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            {h}
          </span>
        ))}
      </div>

      {containers.map((container) => {
        const isOpen = !collapsed[container.id];
        const total = container.items.reduce((s) => s + 40010, 0);

        return (
          <div key={container.id} className="mb-2">
            {/* Stage group header */}
            <button
              onClick={() => toggle(container.id)}
              className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-colors group"
            >
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: container.color }} />
              <span className="text-[13px] font-bold text-[#0B1215] flex-1 text-left">{container.title}</span>
              <span
                className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                style={{ backgroundColor: `${container.color}20`, color: container.color }}
              >
                {container.items.length} leads
              </span>
              <span className="text-[12px] font-semibold text-gray-500 mr-2">
                ₦ {(total).toLocaleString()}
              </span>
              <ChevronRight
                size={14}
                className={`text-gray-400 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}
              />
            </button>

            {/* Rows */}
            {isOpen && (
              <div className="mt-0.5 overflow-hidden">
                {container.items.map((item, idx) => (
                  <div
                    key={item.id}
                    onClick={() => router.push(`/crm/leads/${item.id}`)}
                    className={`grid grid-cols-[2fr_2fr_1.2fr_1fr_1fr_1fr_auto] gap-4 items-center px-4 py-3 rounded-xl transition-colors cursor-pointer hover:bg-gray-50 group/row ${
                      idx % 2 === 0 ? "" : "bg-gray-50/50"
                    }`}
                  >
                    {/* Lead name */}
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-1 h-7 rounded-full shrink-0"
                        style={{ backgroundColor: container.color }}
                      />
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-[#0B1215] truncate">{item.label}</p>
                        <p className="text-[11px] text-gray-400 truncate">{item.time}</p>
                      </div>
                    </div>

                    {/* Company */}
                    <span className="text-[12px] text-gray-500 truncate">{item.description}</span>

                    {/* Stage pill */}
                    <span
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-full w-fit"
                      style={{ backgroundColor: `${container.color}18`, color: container.color }}
                    >
                      {container.title}
                    </span>

                    {/* Amount */}
                    <span className="text-[13px] font-bold text-[#0B1215]">
                      ₦ {Number(item.location).toLocaleString()}
                    </span>

                    {/* Priority badge */}
                    <span className="bg-[#DCFCE7] text-[#16A34A] text-[11px] font-semibold px-2.5 py-0.5 rounded-full w-fit">
                      Medium
                    </span>

                    {/* Assigned */}
                    <span className="text-[12px] text-gray-400">{item.assignedBy ?? "Unassigned"}</span>

                    {/* Actions */}
                    <button className="opacity-0 group-hover/row:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-gray-100">
                      <MoreHorizontal size={14} className="text-gray-400" />
                    </button>
                  </div>
                ))}

                {/* Add row */}
                <button className="flex items-center gap-2 px-4 py-2.5 text-gray-400 hover:text-[#0B1215] transition-colors group/add w-full">
                  <div className="w-5 h-5 rounded-full border border-dashed border-gray-300 flex items-center justify-center group-hover/add:border-[#0B1215] transition-colors">
                    <Plus size={11} />
                  </div>
                  <span className="text-[11px] font-medium">Add lead</span>
                </button>
              </div>
            )}

            {/* Divider */}
            <div className="h-px bg-gray-100 mx-4 mt-1" />
          </div>
        );
      })}

      {/* Summary footer */}
      <div className="mt-4 flex items-center justify-between px-4 py-3 bg-gray-50 rounded-xl">
        <span className="text-[12px] font-semibold text-gray-500">
          {allLeads.length} total leads across {containers.length} stages
        </span>
        <span className="text-[13px] font-bold text-[#0B1215]">
          ₦ {(allLeads.length * 40010).toLocaleString()} pipeline value
        </span>
      </div>
    </div>
  );
}

/* ─── Lead Board ─────────────────────────────────────────── */

function LeadBoard() {
  const router = useRouter();
  const {
    containers,
    addItem,
    moveItem,
    moveToContainer,
    moveBetweenContainers,
    findContainer,
  } = useDragAndDrop(CRM_INITIAL_DATA);

  const [activeItem, setActiveItem] = useState<DndItem | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart(event: DragStartEvent) {
    const container = findContainer(event.active.id as string);
    const item = container?.items.find((i) => i.id === event.active.id);
    setActiveItem(item ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    const activeContainer = findContainer(activeId);
    const overIsContainer = containers.some((c) => c.id === overId);
    const overContainer = overIsContainer
      ? containers.find((c) => c.id === overId)
      : findContainer(overId);
    if (!activeContainer || !overContainer) return;
    if (activeContainer.id === overContainer.id) return;
    if (overIsContainer) {
      moveToContainer(activeId, overId);
    } else {
      moveBetweenContainers(activeId, overId, activeContainer.id, overContainer.id);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveItem(null);
    if (!over) return;
    const activeId = active.id as string;
    const overId = over.id as string;
    const activeContainer = findContainer(activeId);
    const overIsContainer = containers.some((c) => c.id === overId);
    const overContainer = overIsContainer
      ? containers.find((c) => c.id === overId)
      : findContainer(overId);
    if (!activeContainer || !overContainer) return;
    if (activeId !== overId && activeContainer.id === overContainer.id) {
      moveItem(activeId, overId, activeContainer.id);
    }
  }

  return (
    <div className="bg-white shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] rounded-t-[30px] mt-6 overflow-hidden flex flex-col h-[calc(100vh-360px)] min-h-[70vh]">
      {/* Board toolbar */}
      <div className="flex items-center justify-end gap-3 px-6 pt-4 pb-2">
        <button
          onClick={() => router.push("/crm/leads")}
          className="text-[11px] font-medium bg-[#0B1215] text-white px-4 py-1.5 rounded-lg hover:opacity-90 transition-all"
        >
          View All Leads
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === "grid" ? "bg-[#0B1215] text-white" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-md transition-colors ${
              viewMode === "list" ? "bg-[#0B1215] text-white" : "text-gray-400 hover:text-gray-600"
            }`}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {viewMode === "list" ? (
        <div className="flex-1 overflow-y-auto">
          <LeadListView containers={containers} />
        </div>
      ) : (
        /* Kanban columns */
        <div className="flex-1 overflow-x-auto overflow-y-auto pb-6">
          <DndContext
            id="crm-board"
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-3 px-4 min-w-max">
              {containers.map((container) => (
                <LeadColumn
                  key={container.id}
                  id={container.id}
                  title={container.title}
                  color={container.color}
                  items={container.items}
                  onAddCard={(item) => addItem(container.id, item)}
                />
              ))}
            </div>

            <DragOverlay>
              {activeItem ? <LeadCard item={activeItem} isDragOverlay /> : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}
    </div>
  );
}

/* ─── Summary Cards ──────────────────────────────────────── */

function TotalLeadsCard() {
  return (
    <div className="bg-white rounded-[20px] p-6 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 flex flex-col justify-between min-w-0 sm:min-w-85">
      <div className="flex justify-between items-start">
        <h3 className="text-[#34373C] text-sm font-medium">Total Leads in Pipeline</h3>
        <button className="text-gray-400 hover:text-gray-600">
          <MoreHorizontal size={18} />
        </button>
      </div>

      <div className="flex items-center gap-6 mt-4 justify-between">
        <div>
          <div className="flex gap-1.5 items-end">
            <span className="text-[50px] font-medium text-[#0B1215] leading-none tracking-tight">
              4,100
            </span>
            <span className="text-[#34373C] text-[15px] font-semibold mb-1">Leads</span>
          </div>
          <p className="text-[#34373C] text-[14px] mt-1.5">73% increase this week</p>
        </div>

        <div className="relative w-25 h-25 shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="38" stroke="#F3F4F6" strokeWidth="9" fill="transparent" />
            <circle
              cx="50"
              cy="50"
              r="38"
              stroke="#FD6046"
              strokeWidth="9"
              fill="transparent"
              strokeDasharray={`${0.73 * 238.76} ${0.27 * 238.76}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[15px] font-bold text-[#0B1215]">73%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeadsChart() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-full w-full min-h-45" />;

  return (
    <div className="bg-white rounded-[20px] p-6 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 flex-1 min-w-0 sm:min-w-75">
      <div className="flex items-center justify-between mb-1 px-2">
        {["Mon", "Tues", "Weds", "Thurs", "Fri", "Sat"].map((d) => (
          <span key={d} className="text-[11px] text-gray-400 font-medium">
            {d}
          </span>
        ))}
      </div>

      <div className="h-32.5 w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="crmGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" hide />
            <YAxis hide domain={[0, "dataMax + 50"]} />
            <Tooltip
              contentStyle={{
                fontSize: 11,
                borderRadius: 8,
                border: "none",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                padding: "6px 10px",
              }}
              formatter={(value) => [`${value}`, "Leads"]}
            />
            <ReferenceLine x="Fri" stroke="#94A3B8" strokeDasharray="4 4" strokeWidth={1} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#3B82F6"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#crmGradient)"
              dot={false}
              activeDot={{ r: 5, fill: "#3B82F6", strokeWidth: 2, stroke: "white" }}
            />
          </AreaChart>
        </ResponsiveContainer>

        <div className="absolute top-2 right-[28%] flex flex-col items-center pointer-events-none">
          <span className="text-[9px] text-gray-400 bg-white/90 px-1.5 py-0.5 rounded whitespace-nowrap">
            300 New Leads in June
          </span>
        </div>
      </div>
    </div>
  );
}

function AgentUploadsCard() {
  return (
    <div className="bg-white rounded-[20px] p-6 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 flex items-center gap-5 min-w-0 sm:min-w-70">
      {/* Avatar with ring */}
      <div className="relative shrink-0">
        <div
          className="w-20 h-20 rounded-full"
          style={{
            background: "conic-gradient(#FD6046 0% 60%, #F3F4F6 60% 100%)",
            padding: "3px",
          }}
        >
          <div className="relative w-full h-full rounded-full bg-white shadow-[0px_10px_20px_-5px_rgba(0,0,0,0.3)]">
            <div className="w-full h-full rounded-full overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/avatar/agent.png"
                alt="Agent"
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src =
                    "https://i.pravatar.cc/150?u=agent-crm";
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[36px] font-bold text-[#0B1215] leading-none">1,430</span>
          <span className="text-[#9CA3AF] text-[13px] font-medium">Leads</span>
        </div>
        <p className="text-[#6B7280] text-[12px]">Uploaded by your Agents</p>
        <button className="flex items-center gap-1 text-[12px] font-semibold text-[#0B1215] mt-1 hover:opacity-70 transition-opacity">
          View Leads
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────── */

export default function CRMPage() {
  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="max-w-350 mx-auto flex flex-col gap-5">
        {/* Top bar */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div className="relative w-full max-w-110 group">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search for Leads"
              className="w-full bg-white border border-gray-200 rounded-full py-3.5 pl-13 pr-6 text-[13px] outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button className="flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm">
              All Pipeline
              <ChevronDown size={13} />
            </button>
            <button className="flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm">
              <Tag size={13} />
              Label
            </button>
            <button className="flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm">
              <SlidersHorizontal size={13} />
              Filter
            </button>
            <button className="flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm">
              <Import size={13} />
              Import
            </button>
            <button className="flex items-center gap-2 px-6 py-3 bg-[#0B1215] text-white rounded-[14px] text-[13px] font-black hover:opacity-90 transition-all shadow-lg">
              Add New Leads
              <BookmarkPlus size={16} />
            </button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="flex flex-col lg:flex-row gap-4 items-stretch">
          <TotalLeadsCard />
          <LeadsChart />
          <AgentUploadsCard />
        </div>

        {/* Pipeline board */}
        <LeadBoard />
      </div>
    </div>
  );
}
