"use client";

import "@/components/sales-engine/sales-engine-workspace.css";

import type { DndContainer, DndItem } from "@/types/operations";
import type { ApiLeadStatus, LeadApiItem } from "@/lib/api/crm";
import { formatLeadBudgetDisplay, getCurrencySymbol, resolveLeadBudgetAmount } from "@/lib/api/crm";
import { useAuthStore } from "@/store/auth";
import { dedupeLeadsById } from "@/lib/crm/dedupe-leads";
import { getApiErrorMessage } from "@/lib/api/errors";
import { crmFiltersToQuery, useCrmFilters } from "@/hooks/use-crm-filters";
import { getActiveCompanyContext } from "@/lib/company-context";
import { DEFAULT_AVATAR, resolveAvatarSrc } from "@/lib/avatar";
import { useAgentUploadsOverview, useCrmAssignees, useCrmLabels, useCrmLeadsAnalytics, useCrmPipelines, useCrmPreferences, useDeleteLead, useLeadStagePages, useUpdateLead } from "@/hooks/use-crm";
import { resolveCrmPipelineId } from "@/lib/crm/resolve-pipeline";
import ConfirmDeleteModal from "@/components/ui/confirm-delete-modal";
import { AddLeadModal } from "@/components/crm/add-lead-modal";
import { LabelManagerModal, PipelineManagerModal } from "@/components/crm/crm-toolbar-modals";
import { CrmImportExportButton } from "@/components/crm/crm-import-export-button";
import { CRMPageSkeleton } from "@/components/crm/crm-page-skeleton";
import { LeadsChart, TotalLeadsCard } from "@/components/crm/crm-summary-cards";
import { CrmFilterBar, EMPTY_DATE_RANGE, type CrmDateRange } from "@/components/crm/crm-filter-bar";
import { MapLeadsToolbarButton } from "@/components/crm/map-leads-toolbar-button";
import { PipelineSwitcher } from "@/components/crm/pipeline-switcher";
import { useDroppable } from "@dnd-kit/core";
import { useBoardCollisionDetection } from "@/lib/dnd/use-board-collision";
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
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
  LayoutGrid,
  List,
  Pencil,
  Plus,
  Loader2,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { formatDistanceToNowStrict, parseISO } from "date-fns";

const DEFAULT_STAGES: Array<{ id: ApiLeadStatus; title: string; color: string }> = [
  { id: "newly_lead", title: "New Lead", color: "#2563EB" },
  { id: "proposal_sent", title: "Proposal Sent", color: "#F59E0B" },
  { id: "contacted", title: "Contacted", color: "#E879A0" },
  { id: "qualified", title: "Qualified", color: "#10B981" },
];

const AGENT_UPLOAD_SOURCE_FILTER = "agent_upload";

function toRelativeTime(value?: string | null): string {
  if (!value) return "Just now";
  try { return `${formatDistanceToNowStrict(parseISO(value))} ago`; } catch { return "Just now"; }
}

function mapLeadToItem(lead: LeadApiItem): DndItem {
  const rawValue = resolveLeadBudgetAmount(lead);
  return {
    id: String(lead.id),
    label: lead.name,
    description: lead.location || lead.source || lead.email || lead.phone || "No details",
    location: lead.location ?? "",
    assignedBy: lead.assignee?.name ?? "Unassigned",
    time: toRelativeTime(lead.updated_at),
    priority: lead.priority ?? "medium",
    rawValue,
    value: formatLeadBudgetDisplay(lead),
  };
}

function buildContainers(leads: LeadApiItem[], stages: Array<{ id: ApiLeadStatus; title: string; color: string }>): DndContainer[] {
  const grouped = new Map<ApiLeadStatus, DndItem[]>();
  stages.forEach((s) => grouped.set(s.id, []));
  // A lead that just moved can sit in two stage pages for a moment; draw it once.
  dedupeLeadsById(leads).forEach((lead) => {
    const status = (lead.status ?? "newly_lead") as ApiLeadStatus;
    const target = grouped.has(status) ? status : ("__uncategorized__" as ApiLeadStatus);
    grouped.get(target)?.push(mapLeadToItem(lead));
  });
  return stages.map((s) => ({ id: s.id, title: s.title, color: s.color, items: grouped.get(s.id) ?? [] }));
}

function findContainerForItem(containers: DndContainer[], id: string): DndContainer | undefined {
  if (containers.some((c) => c.id === id)) return containers.find((c) => c.id === id);
  return containers.find((c) => c.items.some((i) => i.id === id));
}

/* ─── Lead Card ─────────────────────────────────────────── */

const UNCATEGORIZED_STAGE_ID = "__uncategorized__";

type LeadCardProps = {
  item: DndItem;
  isDragOverlay?: boolean;
  basePath?: string;
  stages?: Array<{ id: string; title: string; color: string }>;
  currentStageId?: string;
  onMoveToStage?: (leadId: string, targetStageId: string) => void;
  onEditClick?: (leadId: string) => void;
  onDeleteClick?: (leadId: string) => void;
};

/** Sortable card on the board. */
function LeadCard(props: LeadCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: props.item.id });

  return (
    <LeadCardView
      {...props}
      dnd={{
        setNodeRef,
        attributes: attributes as unknown as Record<string, unknown>,
        listeners: (listeners ?? {}) as Record<string, unknown>,
        style: { transform: CSS.Transform.toString(transform), transition },
        isDragging,
      }}
    />
  );
}

/**
 * Presentational card. The DragOverlay renders this directly: giving the overlay
 * its own useSortable with the same id registers a second draggable and made
 * drops resolve onto the dragged card itself (cards "refused" to move).
 */
function LeadCardView({
  item,
  isDragOverlay,
  basePath = "/crm",
  stages,
  currentStageId,
  onMoveToStage,
  onEditClick,
  onDeleteClick,
  dnd,
}: LeadCardProps & {
  dnd?: {
    setNodeRef: (el: HTMLElement | null) => void;
    attributes: Record<string, unknown>;
    listeners: Record<string, unknown>;
    style: CSSProperties;
    isDragging: boolean;
  };
}) {
  const router = useRouter();
  const setNodeRef = dnd?.setNodeRef;
  const style = dnd?.style;
  const attributes = dnd?.attributes ?? {};
  const listeners = dnd?.listeners ?? {};
  const isDragging = dnd?.isDragging ?? false;

  const amount = item.value || "£ 0";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => router.push(`${basePath}/leads/${item.id}`)}
      className={`se-lead-card group bg-white rounded-[20px] p-4 shadow-[0px_2px_8px_rgba(0,0,0,0.06)] border border-gray-100 cursor-grab select-none mb-3 transition-all duration-200 overflow-hidden min-w-0
        ${isDragging && !isDragOverlay ? "opacity-40 scale-95" : ""}
        ${isDragOverlay ? "shadow-2xl scale-105 cursor-grabbing" : "hover:shadow-md"}
      `}
    >
      <div className="flex items-start justify-between gap-2 min-w-0">
        <p className="text-[#0B1215] font-bold text-[14px] leading-tight min-w-0 flex-1 truncate">{item.label}</p>
        {(onEditClick || onDeleteClick) && !isDragOverlay && (
          <div className="flex items-center shrink-0 -mt-1 -mr-1">
            {onEditClick && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditClick(item.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="text-gray-300 hover:text-[#0B1215] p-1.5 rounded-full hover:bg-gray-50 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 max-md:opacity-100"
                title="Edit Lead"
              >
                <Pencil size={13} />
              </button>
            )}
            {onDeleteClick && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteClick(item.id);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                className="text-gray-300 hover:text-red-500 p-1.5 rounded-full hover:bg-red-50 transition-colors cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 max-md:opacity-100"
                title="Delete Lead"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
        )}
      </div>
      <p className="text-[#9CA3AF] text-[12px] mt-0.5 truncate" title={item.description}>
        {item.description}
      </p>

      <div className="flex items-center justify-between gap-2 mt-3 min-w-0">
        <span className="text-[#0B1215] font-bold text-[13px] truncate shrink-0">
          {amount}
        </span>
        <span className="bg-[#DCFCE7] text-[#16A34A] text-[11px] font-semibold px-3 py-0.5 rounded-full capitalize shrink-0">
          {item.priority ?? "medium"}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 mt-2 min-w-0">
        <span className="text-[#9CA3AF] text-[11px] truncate min-w-0">{item.assignedBy ?? "Unassigned"}</span>
        <span className="text-[#9CA3AF] text-[11px] shrink-0">{item.time}</span>
      </div>

      {onMoveToStage && stages && currentStageId && (
        <div className="relative md:hidden mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
          <span className="text-gray-400 text-[11px]">Move to:</span>
          <div className="relative">
            <select
              value={currentStageId}
              onChange={(e) => {
                e.stopPropagation();
                onMoveToStage(item.id, e.target.value);
              }}
              onClick={(e) => e.stopPropagation()}
              className="appearance-none bg-gray-50 border border-gray-200 text-gray-700 text-[11px] font-semibold py-1 pl-2.5 pr-6 rounded-lg focus:outline-none cursor-pointer"
            >
              {stages
                .filter((s) => s.id !== UNCATEGORIZED_STAGE_ID || s.id === currentStageId)
                .map((s) => (
                  <option key={s.id} value={s.id} disabled={s.id === UNCATEGORIZED_STAGE_ID}>
                    {s.title}
                  </option>
                ))}
            </select>
            <ChevronDown
              size={10}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none"
            />
          </div>
        </div>
      )}
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
  basePath,
  activeTabId,
  stages,
  onMoveToStage,
  onEditLeadClick,
  onDeleteLeadClick,
  total,
  hasMore,
  isFetchingMore,
  onLoadMore,
  currencySymbol = "£",
}: {
  id: string;
  title: string;
  color: string;
  items: DndItem[];
  onAddCard: () => void;
  basePath?: string;
  activeTabId?: string;
  stages?: Array<{ id: string; title: string; color: string }>;
  onMoveToStage?: (leadId: string, targetStageId: string) => void;
  onEditLeadClick?: (leadId: string) => void;
  onDeleteLeadClick?: (leadId: string) => void;
  total?: number;
  hasMore?: boolean;
  isFetchingMore?: boolean;
  onLoadMore?: () => void;
  currencySymbol?: string;
}) {
  // "Uncategorized" holds leads whose stage was deleted; it isn't a real stage,
  // so cards can be dragged out of it but not into it.
  const { setNodeRef, isOver } = useDroppable({ id, disabled: id === UNCATEGORIZED_STAGE_ID });

  return (
    <div
      className={`flex flex-col w-full md:w-55 shrink-0 md:shrink-0 min-w-0 overflow-hidden ${activeTabId ? (id === activeTabId ? "flex" : "hidden md:flex") : ""
        }`}
    >
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
            {(total ?? items.length).toLocaleString()}
          </div>
        </div>
        <span className="text-white text-[12px] font-medium">{currencySymbol} {items.reduce((sum, item) => sum + (item.rawValue ?? 0), 0).toLocaleString()}</span>
      </div>

      {/* Cards */}
      <div
        ref={setNodeRef}
        className={`flex-1 relative z-10 -mt-6 transition-colors duration-200 min-h-50 flex flex-col ${isOver ? "bg-gray-100/60 rounded-[20px] ring-2 ring-inset ring-gray-200" : ""
          }`}
      >
        <SortableContext
          items={items.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="pt-2">
            {items.map((item) => (
              <LeadCard
                key={item.id}
                item={item}
                basePath={basePath}
                stages={stages}
                currentStageId={id}
                onMoveToStage={onMoveToStage}
                onEditClick={onEditLeadClick}
                onDeleteClick={onDeleteLeadClick}
              />
            ))}
          </div>
        </SortableContext>

        {hasMore && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isFetchingMore}
            className="mx-2 mt-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-semibold text-gray-600 hover:border-gray-300 disabled:opacity-50"
          >
            {isFetchingMore
              ? "Loading…"
              : `Load more (${items.length.toLocaleString()} of ${(total ?? items.length).toLocaleString()})`}
          </button>
        )}

        {id !== UNCATEGORIZED_STAGE_ID && (
          <button
            onClick={() => onAddCard()}
            className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-gray-400 hover:text-[#0B1215] transition-colors group mt-4"
          >
            <span className="text-[11px] font-medium">Add Leads</span>
            <div className="w-5 h-5 rounded-full border border-gray-300 flex items-center justify-center group-hover:border-[#0B1215] transition-colors">
              <Plus size={11} />
            </div>
          </button>
        )}
      </div>
    </div>
  );
}

/* ─── List View ─────────────────────────────────────────── */

function LeadListView({
  containers,
  basePath = "/crm",
  stageMeta,
  budgetTotal,
  currencySymbol = "£",
  stages,
  onMoveToStage,
  onAddClick,
  onEditLeadClick,
}: {
  containers: DndContainer[];
  basePath?: string;
  stageMeta?: Record<string, { total: number; hasMore?: boolean }>;
  budgetTotal?: number;
  currencySymbol?: string;
  stages?: Array<{ id: string; title: string; color: string }>;
  onMoveToStage?: (leadId: string, targetStageId: string) => void;
  onAddClick?: (status: ApiLeadStatus) => void;
  onEditLeadClick?: (leadId: string) => void;
}) {
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
      <div className="hidden md:grid grid-cols-[2fr_2fr_1.2fr_1fr_1fr_1fr_auto] gap-4 px-4 py-2.5 mb-1">
        {["Lead", "Company", "Stage", "Amount", "Priority", "Assigned", ""].map((h) => (
          <span key={h} className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
            {h}
          </span>
        ))}
      </div>

      {containers.map((container) => {
        const isOpen = !collapsed[container.id];
        const total = container.items.reduce((sum, item) => sum + (item.rawValue ?? 0), 0);
        const stageHasMore = Boolean(stageMeta?.[container.id]?.hasMore);

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
                {(stageMeta?.[container.id]?.total ?? container.items.length).toLocaleString()} leads
              </span>
              <span className="text-[12px] font-semibold text-gray-500 mr-2">
                {total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                {stageHasMore ? " (loaded)" : ""}
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
                    onClick={() => router.push(`${basePath}/leads/${item.id}`)}
                    className={`se-list-row relative grid grid-cols-1 md:grid-cols-[2fr_2fr_1.2fr_1fr_1fr_1fr_auto] gap-2 md:gap-4 items-start md:items-center px-4 py-3 rounded-xl transition-colors cursor-pointer hover:bg-gray-50 group/row ${idx % 2 === 0 ? "" : "bg-gray-50/50"
                      }`}
                  >
                    {/* Lead name */}
                    <div className="flex items-center gap-2.5 min-w-0 pr-8 md:pr-0">
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
                    <span className="text-[12px] text-gray-500 truncate pl-3.5 md:pl-0">{item.description}</span>

                    {/* Responsive badge/amount/priority/assigned grouping */}
                    <div className="flex flex-wrap items-center gap-2 pl-3.5 md:pl-0 md:contents">
                      {/* Stage select */}
                      {onMoveToStage && stages && stages.length > 0 ? (
                        <div
                          className="relative inline-flex items-center w-fit"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <select
                            aria-label={`Change stage for ${item.label}`}
                            value={container.id}
                            onChange={(e) => {
                              e.stopPropagation();
                              if (e.target.value !== container.id) {
                                onMoveToStage(item.id, e.target.value);
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="appearance-none text-[11px] font-semibold pl-2.5 pr-6 py-1 rounded-full cursor-pointer outline-none focus:ring-2 focus:ring-[#09232D]/20 transition-opacity hover:opacity-85"
                            style={{ backgroundColor: `${container.color}18`, color: container.color }}
                          >
                            {stages
                              .filter((s) => s.id !== UNCATEGORIZED_STAGE_ID || s.id === container.id)
                              .map((s) => (
                                <option
                                  key={s.id}
                                  value={s.id}
                                  disabled={s.id === UNCATEGORIZED_STAGE_ID}
                                  className="bg-white text-[#0B1215]"
                                >
                                  {s.title}
                                </option>
                              ))}
                          </select>
                          <ChevronDown
                            size={11}
                            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2"
                            style={{ color: container.color }}
                          />
                        </div>
                      ) : (
                        <span
                          className="text-[11px] font-semibold px-2.5 py-1 rounded-full w-fit"
                          style={{ backgroundColor: `${container.color}18`, color: container.color }}
                        >
                          {container.title}
                        </span>
                      )}

                      {/* Amount */}
                      <span className="text-[13px] font-bold text-[#0B1215]">
                        {item.value || `${currencySymbol} 0`}
                      </span>

                      {/* Priority badge */}
                      <span className="bg-[#DCFCE7] text-[#16A34A] text-[11px] font-semibold px-2.5 py-0.5 rounded-full w-fit capitalize">
                        {item.priority ?? "medium"}
                      </span>

                      {/* Assigned */}
                      <span className="text-[12px] text-gray-400">{item.assignedBy ?? "Unassigned"}</span>
                    </div>

                    {/* Actions -- */}
                    {onEditLeadClick && (
                      <button
                        type="button"
                        aria-label={`Edit ${item.label}`}
                        title="Edit lead"
                        onClick={(e) => {
                          e.stopPropagation();
                          onEditLeadClick(item.id);
                        }}
                        className="absolute right-4 top-3 md:relative md:top-auto md:right-auto opacity-100 md:opacity-0 md:group-hover/row:opacity-100 focus:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-gray-100"
                      >
                        <Pencil size={14} className="text-gray-400" />
                      </button>
                    )}
                  </div>
                ))}

                {/* Add row */}
                {onAddClick && container.id !== UNCATEGORIZED_STAGE_ID && (
                <button
                  type="button"
                  onClick={() => onAddClick(container.id as ApiLeadStatus)}
                  className="flex items-center gap-2 px-4 py-2.5 text-gray-400 hover:text-[#0B1215] transition-colors group/add w-full"
                >
                  <div className="w-5 h-5 rounded-full border border-dashed border-gray-300 flex items-center justify-center group-hover/add:border-[#0B1215] transition-colors">
                    <Plus size={11} />
                  </div>
                  <span className="text-[11px] font-medium">Add lead</span>
                </button>
                )}
              </div>
            )}

            {/* Divider */}
            <div className="h-px bg-gray-100 mx-4 mt-1" />
          </div>
        );
      })}

      {/* Summary footer */}
      <div className="mt-4 flex flex-col sm:flex-row gap-2 items-start sm:items-center sm:justify-between px-4 py-3 bg-gray-50 rounded-xl">
        <span className="text-[12px] font-semibold text-gray-500">
          {allLeads.length.toLocaleString()} loaded of{" "}
          {(stageMeta
            ? Object.values(stageMeta).reduce((sum, stage) => sum + stage.total, 0)
            : allLeads.length
          ).toLocaleString()} total leads
        </span>
        <span className="text-[13px] font-bold text-[#0B1215]">
          {currencySymbol} {(budgetTotal ?? allLeads.reduce((sum, lead) => sum + (lead.rawValue ?? 0), 0)).toLocaleString(undefined, {
            maximumFractionDigits: 2,
          })}{" "}
          pipeline value
        </span>
      </div>
    </div>
  );
}

function LeadBoard({
  basePath = "/crm",
  leadListUrl,
  boardKey,
  initialContainers,
  onStatusChange,
  onAddClick,
  onEditLeadClick,
  onDeleteLeadClick,
  isLoading,
  stageMeta,
  onLoadMore,
  budgetTotal,
  currencySymbol = "£",
}: {
  basePath?: string;
  leadListUrl?: string;
  boardKey: string;
  initialContainers: DndContainer[];
  onStatusChange: (leadId: string, status: ApiLeadStatus) => Promise<void>;
  onAddClick?: (status: ApiLeadStatus) => void;
  onEditLeadClick?: (leadId: string) => void;
  onDeleteLeadClick?: (leadId: string) => void;
  isLoading?: boolean;
  stageMeta?: Record<string, { total: number; hasMore: boolean; isFetchingMore: boolean }>;
  onLoadMore?: (stageId: string) => void;
  budgetTotal?: number;
  currencySymbol?: string;
}) {
  const router = useRouter();
  const [containers, setContainers] = useState<DndContainer[]>(initialContainers);
  const [activeItem, setActiveItem] = useState<DndItem | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const containersRef = useRef<DndContainer[]>(initialContainers);
  const initialContainersRef = useRef(initialContainers);
  const boardKeyRef = useRef(boardKey);
  const statusPendingRef = useRef(false);
  const boardKeyAtPendingStartRef = useRef(boardKey);
  const dragOriginRef = useRef<string | null>(null);
  // Active tab state for column navigation
  const [activeTabId, setActiveTabId] = useState<string>(() => initialContainers[0]?.id ?? "newly_lead");
  const resolvedActiveTabId =
    initialContainers.length > 0 &&
    !initialContainers.some((c) => c.id === activeTabId)
      ? initialContainers[0].id
      : activeTabId;
  useEffect(() => {
    initialContainersRef.current = initialContainers;
    boardKeyRef.current = boardKey;
  }, [boardKey, initialContainers]);

  useEffect(() => {
    if (statusPendingRef.current) return;
    const timer = setTimeout(() => {
      if (!statusPendingRef.current) setContainers(initialContainersRef.current);
    }, 0);
    return () => clearTimeout(timer);
  }, [boardKey]);

  useEffect(() => {
    containersRef.current = containers;
  }, [containers]);

  function apply(updater: DndContainer[] | ((prev: DndContainer[]) => DndContainer[])) {
    setContainers((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      containersRef.current = next;
      return next;
    });
  }

  async function persistStageMove(leadId: string, status: ApiLeadStatus) {
    boardKeyAtPendingStartRef.current = boardKeyRef.current;
    statusPendingRef.current = true;
    try {
      await onStatusChange(leadId, status);
    } catch {
      apply(initialContainersRef.current);
      throw new Error("status update failed");
    } finally {
      statusPendingRef.current = false;
      // If refetch already landed a new boardKey during the mutation, adopt it now.
      if (boardKeyRef.current !== boardKeyAtPendingStartRef.current) {
        apply(initialContainersRef.current);
      }
    }
  }

  const { collisionDetection, markMoved, resetDrag } = useBoardCollisionDetection();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart(event: DragStartEvent) {
    resetDrag();
    const itemId = String(event.active.id);
    const container = findContainerForItem(containersRef.current, itemId);
    dragOriginRef.current = container?.id ?? null;
    setActiveItem(container?.items.find((i) => i.id === itemId) ?? null);
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    apply((prev) => {
      const ac = findContainerForItem(prev, activeId);
      const oc = findContainerForItem(prev, overId);
      if (!ac || !oc || ac.id === oc.id) return prev;
      if (oc.id === UNCATEGORIZED_STAGE_ID) return prev;
      const item = ac.items.find((i) => i.id === activeId);
      if (!item) return prev;
      const next = prev.map((c) => ({ ...c, items: [...c.items] }));
      const na = next.find((c) => c.id === ac.id)!;
      const no2 = next.find((c) => c.id === oc.id)!;
      na.items = na.items.filter((i) => i.id !== activeId);
      // Never hold the same lead twice in one column (duplicate React keys).
      no2.items = no2.items.filter((i) => i.id !== activeId);
      const oi = no2.items.findIndex((i) => i.id === overId);
      if (oi >= 0) no2.items.splice(oi, 0, item); else no2.items.push(item);
      markMoved();
      return next;
    });
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveItem(null);
    const activeId = String(active.id);
    const origin = dragOriginRef.current;
    dragOriginRef.current = null;
    if (!over || !origin) { apply(initialContainersRef.current); return; }
    const dest = findContainerForItem(containersRef.current, activeId);
    if (!dest) { apply(initialContainersRef.current); return; }
    if (origin === dest.id) return; // same column reorder, no API call needed
    if (dest.id === UNCATEGORIZED_STAGE_ID) { apply(initialContainersRef.current); return; }
    try {
      await persistStageMove(activeId, dest.id as ApiLeadStatus);
    } catch {
      // persistStageMove already reverted local state
    }
  }

  const stagesList = useMemo(() => {
    return containers.map((c) => ({ id: c.id, title: c.title, color: c.color }));
  }, [containers]);

  const handleMoveToStage = async (leadId: string, targetStageId: string) => {
    if (targetStageId === UNCATEGORIZED_STAGE_ID) return;
    const origin = findContainerForItem(containersRef.current, leadId);
    if (!origin || origin.id === targetStageId) return;
    apply((prev) => {
      const next = prev.map((c) => ({ ...c, items: [...c.items] }));
      const from = next.find((c) => c.id === origin.id);
      const to = next.find((c) => c.id === targetStageId);
      if (!from || !to) return prev;
      const item = from.items.find((i) => i.id === leadId);
      if (!item) return prev;
      from.items = from.items.filter((i) => i.id !== leadId);
      to.items = [...to.items, item];
      return next;
    });
    try {
      await persistStageMove(leadId, targetStageId as ApiLeadStatus);
    } catch {
      // persistStageMove already reverted local state
    }
  };

  if (isLoading) {
    return (
      <div className="se-surface bg-white shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] rounded-t-[30px] mt-6 overflow-hidden flex items-center justify-center h-[calc(100vh-360px)] min-h-[70vh]">
        <p className="text-[13px] text-gray-400">Loading CRM leads…</p>
      </div>
    );
  }

  return (
    <div className="se-surface bg-white shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] rounded-t-[30px] mt-6 overflow-hidden flex flex-col h-[calc(100vh-360px)] min-h-[70vh]">
      {/* Board toolbar */}
      <div className="flex items-center justify-end gap-3 px-6 pt-4 pb-2">
        <button
          onClick={() => router.push(leadListUrl ?? `${basePath}/leads`)}
          className="se-primary text-[11px] font-medium bg-[#0B1215] text-white px-4 py-1.5 rounded-lg hover:opacity-90 transition-all"
        >
          View All Leads
        </button>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setViewMode("grid")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-[#0B1215] text-white" : "text-gray-400 hover:text-gray-600"
              }`}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => setViewMode("list")}
            className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-[#0B1215] text-white" : "text-gray-400 hover:text-gray-600"
              }`}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {viewMode === "grid" && (
        <div className="flex md:hidden gap-1.5 overflow-x-auto px-4 pb-3 pt-1 border-b border-gray-100 shrink-0 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {containers.map((c) => {
            const isActive = resolvedActiveTabId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setActiveTabId(c.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all shrink-0 select-none cursor-pointer"
                style={{
                  backgroundColor: isActive ? c.color : "#F3F4F6",
                  color: isActive ? "#FFFFFF" : "#4B5563",
                }}
              >
                <span>{c.title}</span>
                <span
                  className="rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{
                    backgroundColor: isActive ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.05)",
                    color: isActive ? "#FFFFFF" : "#4B5563",
                  }}
                >
                  {c.items.length}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {viewMode === "list" ? (
        <div className="flex-1 overflow-y-auto">
          <LeadListView
            containers={containers}
            basePath={basePath}
            stageMeta={stageMeta}
            budgetTotal={budgetTotal}
            currencySymbol={currencySymbol}
            stages={stagesList}
            onMoveToStage={handleMoveToStage}
            onAddClick={onAddClick}
            onEditLeadClick={onEditLeadClick}
          />
        </div>
      ) : (
        <div className="flex-1 overflow-x-auto overflow-y-auto pb-6">
          <DndContext
            id="crm-board"
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-3 px-4 min-w-full md:min-w-max">
              {containers.map((container) => (
                <LeadColumn
                  key={container.id}
                  id={container.id}
                  title={container.title}
                  color={container.color}
                  items={container.items}
                  onAddCard={() => onAddClick?.(container.id as ApiLeadStatus)}
                  basePath={basePath}
                  activeTabId={resolvedActiveTabId}
                  stages={stagesList}
                  onMoveToStage={handleMoveToStage}
                  onEditLeadClick={onEditLeadClick}
                  onDeleteLeadClick={onDeleteLeadClick}
                  total={stageMeta?.[container.id]?.total}
                  hasMore={stageMeta?.[container.id]?.hasMore}
                  isFetchingMore={stageMeta?.[container.id]?.isFetchingMore}
                  onLoadMore={() => onLoadMore?.(container.id)}
                  currencySymbol={currencySymbol}
                />
              ))}
            </div>

            <DragOverlay>
              {activeItem ? (
                <LeadCardView
                  item={activeItem}
                  isDragOverlay
                  basePath={basePath}
                  stages={stagesList}
                  currentStageId={resolvedActiveTabId}
                />
              ) : null}
            </DragOverlay>
          </DndContext>
        </div>
      )}
    </div>
  );
}

function AgentUploadsCard({
  basePath = "/crm",
  totalUploadedLeads = 0,
  topAgentAvatarUrl,
  topAgentName,
  topAgentUploads,
  topAgentId,
}: {
  basePath?: string;
  leadListUrl?: string;
  totalUploadedLeads?: number;
  topAgentAvatarUrl?: string | null;
  topAgentName?: string | null;
  topAgentUploads?: number | null;
  topAgentId?: number | null;
}) {
  const router = useRouter();
  // "View Leads" opens the list filtered to the agent shown on the card. The card
  // counts uploads across every pipeline, so the list must too ("all"): scoped to
  // the current pipeline it came up empty whenever the agent's leads sat elsewhere.
  const viewLeadsUrl = topAgentId
    ? `${basePath}/leads${crmFiltersToQuery({ pipeline: "all", source: "agent_upload", created_by: String(topAgentId) })}`
    : `${basePath}/leads${crmFiltersToQuery({ pipeline: "all", source: "agent_upload" })}`;

  return (
    <div className="se-stat-card bg-white rounded-[20px] p-6 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 flex items-center gap-5 min-w-0 sm:min-w-70">
      {/* Avatar with gradient ring */}
      <div className="relative shrink-0">
        <div
          className="w-20 h-20 rounded-full p-0.75"
          style={{
            background: "linear-gradient(135deg, #2ae9c9 0%, #c974f4 100%)",
          }}
        >
          <div className="w-full h-full rounded-full overflow-hidden bg-[#EEF3F8]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={resolveAvatarSrc(topAgentAvatarUrl)}
              alt="Agent"
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR;
              }}
            />
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-col gap-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[36px] font-bold text-[#0B1215] leading-none">{totalUploadedLeads.toLocaleString()}</span>
          <span className="text-[#9CA3AF] text-[13px] font-medium">Leads</span>
        </div>
        <p className="text-[#6B7280] text-[12px]">Uploaded by your agents</p>
        {topAgentName ? (
          <p className="text-[#6B7280] text-[11px]">
            Top: <span className="font-bold text-[#0B1215]">{topAgentName}</span>
            {typeof topAgentUploads === "number" ? ` (${topAgentUploads.toLocaleString()})` : ""}
          </p>
        ) : null}
        <button
          onClick={() => router.push(viewLeadsUrl)}
          title={topAgentName ? `View leads uploaded by ${topAgentName}` : "View leads uploaded by agents"}
          className="se-stat-link flex items-center gap-1 text-[12px] font-semibold text-[#0B1215] mt-1 hover:opacity-70 transition-opacity"
        >
          {topAgentName ? `View ${topAgentName.split(" ")[0]}'s Leads` : "View Leads"}
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

export default function CRMPage() {
  const basePath = "/crm";
  const apiBasePath = "/admin" as const;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);
  // All filters live in the URL: they survive reloads and carry over to the list view.
  const { filters, setFilter, setFilters, query: filterQuery } = useCrmFilters();

  const sourceParam = (filters.source ?? "").trim().toLowerCase();
  const agentUploadScope = [
    "agent_upload",
    "agent uploaded",
    "agent upload",
    "uploaded_by_agent",
    "uploaded by agent",
    "uploaded_by_agents",
    "uploaded by agents",
  ].includes(sourceParam);

  const salesEngineScope = [
    "sales_engine",
    "sales engine",
    "sales-engine",
    "smart_lead",
    "smart lead",
    "smart-lead",
    "smart_leads",
    "smart leads",
  ].includes(sourceParam);

  const effectiveSourceFilter = agentUploadScope
    ? AGENT_UPLOAD_SOURCE_FILTER
    : salesEngineScope
      ? "sales_engine"
      : sourceParam || undefined;

  // Carry every active filter to the list view.
  const leadListUrl = `${basePath}/leads${filterQuery}`;

  const [search, setSearch] = useState(() => filters.q ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => (filters.q ?? "").trim());
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [defaultStatus, setDefaultStatus] = useState<ApiLeadStatus>("newly_lead");
  const [showFilter, setShowFilter] = useState(false);
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [editingLead, setEditingLead] = useState<LeadApiItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LeadApiItem | null>(null);

  const { data: pipelines = [] } = useCrmPipelines(companyId ?? undefined, apiBasePath);
  const { data: preferences } = useCrmPreferences(companyId ?? undefined, apiBasePath);
  const { data: labels = [] } = useCrmLabels(companyId ?? undefined, apiBasePath);
  const { data: agentUploadsOverview } = useAgentUploadsOverview(companyId ?? undefined, apiBasePath);
  const { data: people = [], isLoading: loadingPeople } = useCrmAssignees(companyId ?? undefined, apiBasePath);

  const defaultPipelineId = useMemo(
    () =>
      resolveCrmPipelineId(
        pipelines,
        preferences?.preferred_pipeline_id,
        preferences?.company_default_pipeline_id
      ),
    [pipelines, preferences?.preferred_pipeline_id, preferences?.company_default_pipeline_id]
  );

  // ?pipeline=<id> or "all"; absent = the user's default. The URL is the source of
  // truth, so a preferences refetch can no longer yank the user to another pipeline.
  const selectedPipelineId: number | null =
    filters.pipeline === "all"
      ? null
      : filters.pipeline && Number.isFinite(Number(filters.pipeline))
        ? Number(filters.pipeline)
        : defaultPipelineId ?? null;
  const setSelectedPipelineId = (pipelineId: number | null) =>
    setFilter("pipeline", pipelineId == null ? "all" : pipelineId === defaultPipelineId ? null : pipelineId);

  // Ignore a stage that no longer exists (renamed/deleted label) instead of showing an empty board.
  const selectedLabel: string =
    filters.stage && (labels.length === 0 || labels.some((label) => label.slug === filters.stage))
      ? filters.stage
      : "all";
  const setSelectedLabel = (label: string) => setFilter("stage", label === "all" ? null : label);

  const createdBy = filters.created_by ?? "";
  const setCreatedBy = (userId: string) => setFilter("created_by", userId || null);
  const assignedTo = filters.assigned_to ?? "";
  const setAssignedTo = (userId: string) => setFilter("assigned_to", userId || null);
  const dateRange: CrmDateRange = filters.from || filters.to
    ? { preset: null, from: filters.from ?? "", to: filters.to ?? "" }
    : EMPTY_DATE_RANGE;
  const setDateRange = (range: CrmDateRange) => setFilters({ from: range.from || "", to: range.to || "" });
  const industryFilter = filters.industry ?? "";

  const stages = useMemo(() => {
    if (!labels.length) return DEFAULT_STAGES;
    return labels.map((label) => ({ id: label.slug, title: label.name, color: label.color }));
  }, [labels]);

  const boardStageDefinitions = useMemo(() => {
    const selectedStages =
      selectedLabel === "all" ? stages : stages.filter((stage) => stage.id === selectedLabel);
    return selectedLabel === "all"
      ? [
          ...selectedStages,
          { id: "__uncategorized__" as ApiLeadStatus, title: "Uncategorized", color: "#6B7280" },
        ]
      : selectedStages;
  }, [selectedLabel, stages]);

  // Wait for a pause in typing before querying, so each keystroke doesn't hit the API.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  // Mirror the settled search into the URL (replace, so no history entry per keystroke).
  useEffect(() => {
    if ((filters.q ?? "") !== debouncedSearch) setFilter("q", debouncedSearch || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Picked days are local; send the instants that bound them so "today" means the viewer's today.
  const createdFrom = dateRange.from ? new Date(`${dateRange.from}T00:00:00`).toISOString() : undefined;
  const createdTo = dateRange.to ? new Date(`${dateRange.to}T23:59:59.999`).toISOString() : undefined;
  const creatorAndDateFilters = {
    created_by_user_id: createdBy || undefined,
    created_from: createdFrom,
    created_to: createdTo,
    assigned_to_user_id: filters.assigned_to || undefined,
    industry: industryFilter || undefined,
  };

  const stageQuery = useLeadStagePages(
    boardStageDefinitions,
    {
      company_id: companyId ?? undefined,
      search: debouncedSearch || undefined,
      pipeline_id: selectedPipelineId ?? undefined,
      source: effectiveSourceFilter,
      ...creatorAndDateFilters,
      per_page: 20,
    },
    apiBasePath,
  );

  const { data: leadsAnalytics, isLoading: isAnalyticsLoading } = useCrmLeadsAnalytics(
    {
      company_id: companyId ?? undefined,
      search: debouncedSearch || undefined,
      pipeline_id: selectedPipelineId ?? undefined,
      status: selectedLabel === "all" ? undefined : selectedLabel,
      source: effectiveSourceFilter,
      ...creatorAndDateFilters,
    },
    apiBasePath
  );

  const pipelineFiltered = selectedPipelineId !== defaultPipelineId;
  const activeFilterCount =
    (pipelineFiltered ? 1 : 0) +
    (selectedLabel !== "all" ? 1 : 0) +
    (createdBy ? 1 : 0) +
    (dateRange.from || dateRange.to ? 1 : 0) +
    (industryFilter ? 1 : 0) +
    (filters.assigned_to ? 1 : 0);
  const isSearchPending = search.trim() !== debouncedSearch || (Boolean(debouncedSearch) && stageQuery.isRefreshing);

  // The sales-engine scope is filtered on the server (source=sales_engine), so stage totals,
  // pagination and the summary cards all count the same leads.
  const visibleStagePages = useMemo(
    () =>
      stageQuery.stages.filter(
        (stage) => stage.id !== "__uncategorized__" || stage.total > 0
      ),
    [stageQuery.stages],
  );

  const loadedLeads = useMemo(
    () => visibleStagePages.flatMap((stage) => stage.leads),
    [visibleStagePages],
  );
  const visibleStages = useMemo(
    () => visibleStagePages.map(({ id, title, color }) => ({ id, title, color })),
    [visibleStagePages],
  );
  const initialContainers = useMemo(
    () => buildContainers(loadedLeads, visibleStages),
    [loadedLeads, visibleStages],
  );
  const boardKey = useMemo(
    () =>
      [
        selectedPipelineId ?? "all",
        selectedLabel,
        ...loadedLeads.map(
          (lead) => `${lead.id}:${lead.status ?? "new"}:${lead.updated_at ?? ""}`,
        ),
      ].join("|"),
    [loadedLeads, selectedLabel, selectedPipelineId],
  );
  const stageMeta = useMemo(
    () =>
      Object.fromEntries(
        visibleStagePages.map((stage) => [
          stage.id,
          {
            total: stage.total,
            hasMore: stage.hasMore,
            isFetchingMore: stage.isFetchingMore,
          },
        ]),
      ),
    [visibleStagePages],
  );

  const updateMutation = useUpdateLead(undefined, apiBasePath);
  const deleteLeadMutation = useDeleteLead(
    {
      onSuccess: () => {
        toast.success("Lead deleted successfully");
      },
    },
    apiBasePath
  );

  const handleEditLead = (leadId: string) => {
    const lead = loadedLeads.find((entry) => String(entry.id) === leadId);
    if (lead) {
      setEditingLead(lead);
    }
  };

  const handleDeleteLead = (leadId: string) => {
    const lead = loadedLeads.find((entry) => String(entry.id) === leadId);
    if (lead) {
      setDeleteTarget(lead);
    }
  };

  const confirmDeleteLead = () => {
    if (!deleteTarget) return;
    deleteLeadMutation.mutate(
      { leadId: deleteTarget.id, companyId: companyId ?? undefined },
      {
        onError: (err) => toast.error(getApiErrorMessage(err, "Could not delete the lead. Please try again.")),
      }
    );
    setDeleteTarget(null);
  };

  async function persistStatusChange(leadId: string, status: ApiLeadStatus) {
    try {
      await updateMutation.mutateAsync({ leadId, payload: { company_id: companyId ?? "", status } });
      toast.success("Lead status updated");
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not update lead status. Reverting..."));
      throw new Error("status update failed");
    }
  }

  if (stageQuery.isLoading) return <CRMPageSkeleton />;

  return (
    <div className="se-workspace min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="max-w-350 mx-auto flex flex-col gap-5">
        {/* Top bar */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div className="relative w-full max-w-110 group">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="search"
              aria-label="Search leads"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                // Searching is live; Enter must never submit or reload anything.
                if (e.key === "Enter") e.preventDefault();
              }}
              placeholder="Search for Leads"
              className="se-search w-full bg-white border border-gray-200 rounded-full py-3.5 pl-13 pr-12 text-[13px] outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm [&::-webkit-search-cancel-button]:hidden"
            />
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
              {isSearchPending ? (
                <Loader2 size={15} className="animate-spin text-gray-400" aria-label="Searching" />
              ) : search ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearch("");
                    setDebouncedSearch("");
                  }}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 cursor-pointer"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <PipelineSwitcher
              pipelines={pipelines}
              selectedPipelineId={selectedPipelineId}
              defaultPipelineId={defaultPipelineId}
              onSelect={setSelectedPipelineId}
              onManage={() => setShowPipelineModal(true)}
              className="se-control flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm"
              activeClassName="se-control-active"
            />
            <MapLeadsToolbarButton
              pipelines={pipelines}
              selectedPipelineId={selectedPipelineId}
              fallbackPipelineId={defaultPipelineId}
              onPipelineChange={setSelectedPipelineId}
            />
            <button onClick={() => setShowLabelModal(true)} className="se-control flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm">
              <Tag size={13} />
              Label
            </button>
            <button
              type="button"
              aria-expanded={showFilter}
              onClick={() => setShowFilter((prev) => !prev)}
              aria-pressed={activeFilterCount > 0}
              className={`se-control flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm ${activeFilterCount > 0 ? "se-control-active" : showFilter ? "ring-1 ring-[#2ae9c9]/60" : ""}`}
            >
              <SlidersHorizontal size={13} />
              Filter
              {activeFilterCount > 0 && (
                <span className="flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-[#2ae9c9] px-1 text-[10px] font-bold text-[#022228]">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <CrmImportExportButton
              companyId={companyId}
              apiBasePath={apiBasePath}
              pipelines={pipelines}
              labels={labels}
              defaultPipelineId={selectedPipelineId}
              activeFilters={{
                search: debouncedSearch || undefined,
                pipeline_id: selectedPipelineId ?? undefined,
                status: selectedLabel === "all" ? undefined : selectedLabel,
                source: effectiveSourceFilter,
                ...creatorAndDateFilters,
              }}
              onViewImportedPipeline={(pipelineId) => {
                setSearch("");
                setDebouncedSearch("");
                setFilters(() => ({ pipeline: pipelineId === defaultPipelineId ? undefined : String(pipelineId) }));
              }}
              onViewAllLeads={() => router.push(`${basePath}/leads`)}
            />
            <button
              onClick={() => { setDefaultStatus("newly_lead"); setIsAddModalOpen(true); }}
              className="se-primary flex items-center gap-2 px-5 py-2.5 bg-[#0B1215] text-white rounded-[10px] text-[12px] font-medium hover:opacity-90 transition-all"
            >
              Add New Leads
              <BookmarkPlus size={15} />
            </button>
          </div>
        </div>

        {salesEngineScope && (
          <div className="se-surface flex items-center justify-between rounded-2xl border border-[#09232d]/15 bg-[#09232d]/[0.03] px-4 py-2.5 text-xs text-[#09232d] shadow-xs">
            <div className="flex items-center gap-2.5">
              <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-slate-900">Filtered by: Sales Engine</span>
              <span className="text-slate-500 hidden sm:inline">• Displaying leads discovered and saved from Sales Engine</span>
            </div>
            <button
              type="button"
              onClick={() => setFilter("source", null)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-xs hover:bg-slate-100 transition cursor-pointer"
            >
              <span>Clear Filter</span>
              <X size={12} />
            </button>
          </div>
        )}

        {showFilter && (
          <CrmFilterBar
            pipelines={pipelines}
            labels={labels}
            selectedPipelineId={selectedPipelineId}
            defaultPipelineId={defaultPipelineId}
            onPipelineChange={setSelectedPipelineId}
            selectedLabel={selectedLabel}
            onLabelChange={setSelectedLabel}
            people={people}
            loadingPeople={loadingPeople}
            createdBy={createdBy}
            onCreatedByChange={setCreatedBy}
            assignedTo={assignedTo}
            onAssignedToChange={setAssignedTo}
            dateRange={dateRange}
            onDateRangeChange={setDateRange}
            industry={industryFilter}
            onIndustryChange={(value) => setFilter("industry", value || null)}
            onClear={() => {
              // Keep search and the source scope; reset everything in the panel.
              setFilters((current) => ({ q: current.q, source: current.source }));
            }}
          />
        )}

        {/* Summary cards */}
        <div className="flex flex-col lg:flex-row gap-4 items-stretch">
          <TotalLeadsCard
            totalLeads={leadsAnalytics?.total_leads ?? 0}
            weekGrowthPercent={leadsAnalytics?.week_growth_percent ?? 0}
            weekGrowthDirection={leadsAnalytics?.week_growth_direction ?? "flat"}
            isLoading={isAnalyticsLoading}
          />
          <LeadsChart
            dailyTrend={leadsAnalytics?.daily_trend}
            monthNewLeads={leadsAnalytics?.month_new_leads ?? 0}
            monthLabel={leadsAnalytics?.month_label ?? ""}
            highlightDay={leadsAnalytics?.highlight_day}
            isLoading={isAnalyticsLoading}
          />
          <AgentUploadsCard
            basePath={basePath}
            leadListUrl={leadListUrl}
            totalUploadedLeads={agentUploadsOverview?.total_uploaded_leads ?? 0}
            topAgentAvatarUrl={agentUploadsOverview?.top_agent?.avatar_url ?? null}
            topAgentName={agentUploadsOverview?.top_agent?.name ?? null}
            topAgentUploads={agentUploadsOverview?.top_agent?.total_uploads ?? null}
            topAgentId={agentUploadsOverview?.top_agent?.id ?? null}
          />
        </div>

        {/* Pipeline board */}
        <LeadBoard
          basePath={basePath}
          leadListUrl={leadListUrl}
          boardKey={boardKey}
          initialContainers={initialContainers}
          onStatusChange={persistStatusChange}
          onAddClick={(status) => { setDefaultStatus(status); setIsAddModalOpen(true); }}
          onEditLeadClick={handleEditLead}
          onDeleteLeadClick={handleDeleteLead}
          isLoading={stageQuery.isLoading}
          stageMeta={stageMeta}
          onLoadMore={(stageId) => stageQuery.loadMore(stageId as ApiLeadStatus)}
          budgetTotal={leadsAnalytics?.budget_total}
          currencySymbol={getCurrencySymbol(pipelines.find((p) => p.id === selectedPipelineId)?.currency_code ?? "GBP")}
        />
      </div>

      {isAddModalOpen && (
        <AddLeadModal
          onClose={() => setIsAddModalOpen(false)}
          apiBasePath={apiBasePath}
          defaultStatus={defaultStatus}
        />
      )}

      {editingLead && (
        <AddLeadModal
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          apiBasePath={apiBasePath}
        />
      )}

      <ConfirmDeleteModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDeleteLead}
        title="Delete Lead"
        description={`Are you sure you want to delete "${deleteTarget?.name ?? "this lead"}"? This action cannot be undone.`}
      />

      {showPipelineModal && companyId && (
        <PipelineManagerModal
          companyId={companyId}
          apiBasePath={apiBasePath}
          pipelines={pipelines}
          selectedPipelineId={selectedPipelineId}
          onSelectPipeline={(pipelineId) => {
            setSelectedPipelineId(pipelineId);
          }}
          onClose={() => setShowPipelineModal(false)}
        />
      )}

      {showLabelModal && companyId && (
        <LabelManagerModal
          companyId={companyId}
          apiBasePath={apiBasePath}
          labels={labels}
          onClose={() => setShowLabelModal(false)}
        />
      )}

    </div>
  );
}
