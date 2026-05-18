"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useLeads, useUpdateLead } from "@/hooks/use-crm";
import type { ApiLeadStatus, ApiRoleBasePath, LeadApiItem } from "@/lib/api/crm";
import type { DndContainer, DndItem } from "@/types/operations";
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragOverEvent,
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
import { Search, Plus } from "lucide-react";
import { formatDistanceToNowStrict, parseISO } from "date-fns";
import { toast } from "sonner";

const STAGES: Array<{ id: ApiLeadStatus; title: string; color: string }> = [
    { id: "new", title: "New Leads", color: "#2563EB" },
    { id: "proposal_sent", title: "Proposal Sent", color: "#F59E0B" },
    { id: "contacted", title: "Contacted", color: "#E879A0" },
    { id: "unqualified", title: "Unqualified", color: "#1A1F2C" },
    { id: "qualified", title: "Qualified", color: "#10B981" },
    { id: "lost", title: "Lost", color: "#EF4444" },
    { id: "won", title: "Won", color: "#166534" },
];

function toRelativeTime(value?: string | null): string {
    if (!value) {
        return "Just now";
    }

    try {
        return `${formatDistanceToNowStrict(parseISO(value))} ago`;
    } catch {
        return "Just now";
    }
}

function mapLeadToItem(lead: LeadApiItem): DndItem {
    return {
        id: String(lead.id),
        label: lead.name,
        description: lead.email ?? lead.phone ?? "No contact",
        location: "0",
        assignedBy: lead.assignee?.name ?? "Unassigned",
        time: toRelativeTime(lead.updated_at),
    };
}

function buildContainers(leads: LeadApiItem[]): DndContainer[] {
    const grouped = new Map<ApiLeadStatus, DndItem[]>();
    STAGES.forEach((stage) => grouped.set(stage.id, []));

    leads.forEach((lead) => {
        const status = (lead.status ?? "new") as ApiLeadStatus;
        if (!grouped.has(status)) {
            return;
        }

        grouped.get(status)?.push(mapLeadToItem(lead));
    });

    return STAGES.map((stage) => ({
        id: stage.id,
        title: stage.title,
        color: stage.color,
        items: grouped.get(stage.id) ?? [],
    }));
}

function findContainer(containers: DndContainer[], id: string): DndContainer | undefined {
    if (containers.some((container) => container.id === id)) {
        return containers.find((container) => container.id === id);
    }

    return containers.find((container) => container.items.some((item) => item.id === id));
}

function LeadCard({
    item,
    disabled,
}: {
    item: DndItem;
    disabled: boolean;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
        useSortable({ id: item.id, disabled });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...attributes}
            {...listeners}
            className={`bg-white rounded-[16px] p-4 border border-gray-100 shadow-sm mb-3 transition-all ${disabled ? "cursor-default" : "cursor-grab"
                } ${isDragging ? "opacity-50" : ""}`}
        >
            <p className="text-[#0B1215] font-bold text-[13px] leading-tight">{item.label}</p>
            <p className="text-[#9CA3AF] text-[12px] mt-0.5 truncate">{item.description}</p>
            <div className="flex items-center justify-between mt-2">
                <span className="text-[#6B7280] text-[11px]">{item.assignedBy ?? "Unassigned"}</span>
                <span className="text-[#6B7280] text-[11px]">{item.time}</span>
            </div>
        </div>
    );
}

function LeadColumn({
    container,
    disabled,
}: {
    container: DndContainer;
    disabled: boolean;
}) {
    return (
        <div className="flex flex-col w-72 shrink-0">
            <div
                className="rounded-t-[16px] px-4 py-3 flex items-center justify-between"
                style={{ backgroundColor: container.color }}
            >
                <span className="text-white font-semibold text-[13px]">{container.title}</span>
                <span className="bg-white/95 rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ color: container.color }}>
                    {container.items.length}
                </span>
            </div>

            <div className="bg-white rounded-b-[16px] p-3 min-h-[220px] border border-t-0 border-gray-100">
                <SortableContext
                    items={container.items.map((item) => item.id)}
                    strategy={verticalListSortingStrategy}
                >
                    {container.items.map((item) => (
                        <LeadCard key={item.id} item={item} disabled={disabled} />
                    ))}
                </SortableContext>

                {!disabled && (
                    <button className="w-full flex items-center justify-center gap-2 text-[12px] text-gray-400 hover:text-[#0B1215] py-2 transition-colors">
                        <Plus size={13} />
                        Add Leads
                    </button>
                )}
            </div>
        </div>
    );
}

function KanbanBoard({
    initialContainers,
    readOnly,
    onStatusChange,
}: {
    initialContainers: DndContainer[];
    readOnly: boolean;
    onStatusChange: (leadId: string, status: ApiLeadStatus) => Promise<void>;
}) {
    const [containers, setContainers] = useState<DndContainer[]>(initialContainers);
    const [activeItem, setActiveItem] = useState<DndItem | null>(null);
    const dragOriginRef = useRef<string | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    function handleDragStart(event: DragStartEvent) {
        if (readOnly) return;

        const itemId = String(event.active.id);
        const container = findContainer(containers, itemId);
        dragOriginRef.current = container?.id ?? null;
        const item = container?.items.find((entry) => entry.id === itemId) ?? null;
        setActiveItem(item);
    }

    function handleDragOver(event: DragOverEvent) {
        if (readOnly) return;

        const { active, over } = event;
        if (!over) return;

        const activeId = String(active.id);
        const overId = String(over.id);

        setContainers((previous) => {
            const activeContainer = findContainer(previous, activeId);
            const overContainer = findContainer(previous, overId);
            if (!activeContainer || !overContainer) return previous;
            if (activeContainer.id === overContainer.id) return previous;

            const activeItemValue = activeContainer.items.find((item) => item.id === activeId);
            if (!activeItemValue) return previous;

            const next = previous.map((container) => ({ ...container, items: [...container.items] }));
            const nextActive = next.find((container) => container.id === activeContainer.id);
            const nextOver = next.find((container) => container.id === overContainer.id);
            if (!nextActive || !nextOver) return previous;

            nextActive.items = nextActive.items.filter((item) => item.id !== activeId);

            const overIndex = nextOver.items.findIndex((item) => item.id === overId);
            if (overIndex >= 0) {
                nextOver.items.splice(overIndex, 0, activeItemValue);
            } else {
                nextOver.items.push(activeItemValue);
            }

            return next;
        });
    }

    async function handleDragEnd(event: DragEndEvent) {
        if (readOnly) return;

        const { active, over } = event;
        setActiveItem(null);

        if (!over) {
            dragOriginRef.current = null;
            return;
        }

        const activeId = String(active.id);
        const overId = String(over.id);

        const destinationContainer = findContainer(containers, overId);
        const originContainerId = dragOriginRef.current;
        const destinationContainerId = destinationContainer?.id ?? null;

        setContainers((previous) => {
            const activeContainer = findContainer(previous, activeId);
            const overContainer = findContainer(previous, overId);
            if (!activeContainer || !overContainer) return previous;

            if (activeContainer.id !== overContainer.id) {
                return previous;
            }

            const activeIndex = activeContainer.items.findIndex((item) => item.id === activeId);
            const overIndex = activeContainer.items.findIndex((item) => item.id === overId);
            if (activeIndex < 0 || overIndex < 0 || activeIndex === overIndex) return previous;

            const next = previous.map((container) => ({ ...container, items: [...container.items] }));
            const target = next.find((container) => container.id === activeContainer.id);
            if (!target) return previous;

            const [moved] = target.items.splice(activeIndex, 1);
            target.items.splice(overIndex, 0, moved);
            return next;
        });

        if (
            originContainerId &&
            destinationContainerId &&
            originContainerId !== destinationContainerId
        ) {
            try {
                await onStatusChange(activeId, destinationContainerId as ApiLeadStatus);
            } catch {
                setContainers(initialContainers);
            }
        }

        dragOriginRef.current = null;
    }

    return (
        <div className="overflow-x-auto">
            <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
            >
                <div className="flex gap-3 min-w-max pb-1">
                    {containers.map((container) => (
                        <LeadColumn key={container.id} container={container} disabled={readOnly} />
                    ))}
                </div>

                {!readOnly && (
                    <DragOverlay>{activeItem ? <LeadCard item={activeItem} disabled={false} /> : null}</DragOverlay>
                )}
            </DndContext>
        </div>
    );
}

export function CrmKanbanPage({
    apiBasePath,
    readOnly,
}: {
    apiBasePath: ApiRoleBasePath;
    readOnly: boolean;
}) {
    const user = useAuthStore((s) => s.user);
    const { apiCompanyId: companyId } = getActiveCompanyContext(user);

    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");

    useEffect(() => {
        const timeout = setTimeout(() => {
            setDebouncedSearch(search.trim());
        }, 350);

        return () => clearTimeout(timeout);
    }, [search]);

    const { data, isLoading, refetch } = useLeads(
        {
            company_id: companyId ?? undefined,
            search: debouncedSearch || undefined,
            page: 1,
        },
        apiBasePath
    );

    const initialContainers = useMemo(() => buildContainers(data?.leads ?? []), [data?.leads]);
    const boardKey = useMemo(
        () =>
            (data?.leads ?? [])
                .map((lead) => `${lead.id}:${lead.status ?? "new"}:${lead.updated_at ?? ""}`)
                .join("|"),
        [data?.leads]
    );

    const updateLeadMutation = useUpdateLead(undefined, apiBasePath);

    async function persistStatusChange(leadId: string, status: ApiLeadStatus) {
        try {
            await updateLeadMutation.mutateAsync({
                leadId,
                payload: {
                    company_id: companyId ?? undefined,
                    status,
                },
            });
        } catch {
            toast.error("Could not update lead status. Re-syncing board...");
            await refetch();
            throw new Error("Lead status update failed");
        }
    }

    if (!companyId) {
        return (
            <div className="bg-white rounded-3xl p-8 text-center text-gray-500 border border-gray-100">
                No active company context was found for this account.
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3">
                <div className="relative w-full max-w-110">
                    <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                    <input
                        type="text"
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search for Leads"
                        className="w-full bg-white border border-gray-200 rounded-full py-3.5 pl-13 pr-6 text-[13px] outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm"
                    />
                </div>

                {!readOnly && (
                    <button className="flex items-center gap-2 px-6 py-3 bg-[#0B1215] text-white rounded-[14px] text-[13px] font-black hover:opacity-90 transition-all shadow-lg">
                        Add New Leads
                        <Plus size={15} />
                    </button>
                )}
            </div>

            <div className="bg-white rounded-[24px] border border-gray-100 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] p-4">
                {isLoading ? (
                    <div className="p-6 text-[13px] text-gray-400">Loading CRM leads...</div>
                ) : (
                    <KanbanBoard
                        key={boardKey}
                        initialContainers={initialContainers}
                        readOnly={readOnly}
                        onStatusChange={persistStatusChange}
                    />
                )}
            </div>
        </div>
    );
}
