"use client";

import "@/components/sales-engine/sales-engine-workspace.css";

import {
  BookmarkPlus,
  ChevronDown,
  Eye,
  Pencil,
  Search,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useBulkDeleteLeads, useCrmAssignees, useCrmLabels, useCrmPipelines, useCrmPreferences, useDeleteLead, useLeadFields, useLeads, useUpdateLead } from "@/hooks/use-crm";
import { useCrmFilters } from "@/hooks/use-crm-filters";
import { getApiErrorMessage } from "@/lib/api/errors";
import { resolveCrmPipelineId } from "@/lib/crm/resolve-pipeline";
import { AddLeadModal } from "@/components/crm/add-lead-modal";
import { LabelManagerModal, PipelineManagerModal } from "@/components/crm/crm-toolbar-modals";
import { CrmImportExportButton } from "@/components/crm/crm-import-export-button";
import ConfirmDeleteModal from "@/components/ui/confirm-delete-modal";
import { CrmFilterBar, EMPTY_DATE_RANGE, type CrmDateRange } from "@/components/crm/crm-filter-bar";
import { MapLeadsToolbarButton } from "@/components/crm/map-leads-toolbar-button";
import { PipelineSwitcher } from "@/components/crm/pipeline-switcher";
import { LeadPagination } from "@/components/crm/lead-pagination";
import type { ApiLeadStatus, LeadApiItem, LeadCustomFields } from "@/lib/api/crm";
import { resolveLeadBudgetAmount } from "@/lib/api/crm";
import { readCustomFields } from "@/lib/crm/custom-fields";
import { LeadColumnMenu, LeadCustomColumnCells, LeadCustomColumnHeaders, leadListGridTemplate, useHiddenLeadColumns } from "@/components/crm/lead-list-columns";
import { LeadFieldDialog } from "@/components/crm/lead-field-dialog";
import { toast } from "sonner";

interface Lead {
  id: string;
  name: string;
  company: string;
  status: ApiLeadStatus;
  statusColor: string;
  value: number;
  assignedTo: string;
  source: string;
  customFields: LeadCustomFields;
}

function getStatusColor(status: string | null | undefined, labels: Array<{ slug: string; color: string }>): string {
  const match = labels.find((label) => label.slug === status);
  return match ? match.color : "#9CA3AF";
}

function StatusDropdown({
  value,
  color,
  options,
  onChange,
}: {
  value: ApiLeadStatus;
  color: string;
  options: Array<{ label: string; value: ApiLeadStatus; color: string }>;
  onChange: (value: ApiLeadStatus, color: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const label = options.find((option) => option.value === value)?.label ?? "New Lead";

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((p) => !p)}
        className="flex items-center gap-1.5 px-3 py-1 rounded-full text-white text-[11px] font-semibold transition-opacity hover:opacity-85"
        style={{ backgroundColor: color }}
      >
        {label}
        <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 left-0 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 min-w-[150px]">
          {options.map((s) => (
            <button
              key={s.value}
              onClick={() => {
                onChange(s.value, s.color);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-[12px] text-[#0B1215] font-medium">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}


export default function AllLeadsPage() {
  const basePath = "/crm";
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);
  // Filters live in the URL (shared with the board, survive reloads, linkable).
  const { filters, setFilter, setFilters, query: filterQuery } = useCrmFilters();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState(() => filters.q ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(() => (filters.q ?? "").trim());
  const [pageState, setPageState] = useState<{ key: string; page: number }>({ key: "", page: 1 });
  const [showFilter, setShowFilter] = useState(false);
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAddColumn, setShowAddColumn] = useState(false);
  const [editingLead, setEditingLead] = useState<LeadApiItem | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

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
    ? "agent_upload"
    : salesEngineScope
      ? "sales_engine"
      : sourceParam || undefined;

  const boardUrl = `${basePath}${filterQuery}`;

  const { data: pipelines = [] } = useCrmPipelines(companyId ?? undefined, "/admin");
  const { data: preferences } = useCrmPreferences(companyId ?? undefined, "/admin");
  const { data: labels = [] } = useCrmLabels(companyId ?? undefined, "/admin");
  const { data: leadFields = [] } = useLeadFields(companyId ?? undefined, "/admin");
  const leadColumns = useHiddenLeadColumns(companyId ?? undefined);
  const { data: people = [], isLoading: loadingPeople } = useCrmAssignees(companyId ?? undefined, "/admin");

  const defaultPipelineId = useMemo(
    () =>
      resolveCrmPipelineId(
        pipelines,
        preferences?.preferred_pipeline_id,
        preferences?.company_default_pipeline_id
      ),
    [pipelines, preferences?.preferred_pipeline_id, preferences?.company_default_pipeline_id]
  );

  const selectedPipelineId: number | null =
    filters.pipeline === "all"
      ? null
      : filters.pipeline && Number.isFinite(Number(filters.pipeline))
        ? Number(filters.pipeline)
        : defaultPipelineId ?? null;
  const pipelineFiltered = selectedPipelineId !== defaultPipelineId;
  const selectedLabel: string =
    filters.stage && (labels.length === 0 || labels.some((label) => label.slug === filters.stage))
      ? filters.stage
      : "all";
  const createdBy = filters.created_by ?? "";
  const industryFilter = filters.industry ?? "";
  const dateRange: CrmDateRange = filters.from || filters.to
    ? { preset: null, from: filters.from ?? "", to: filters.to ?? "" }
    : EMPTY_DATE_RANGE;
  const createdByPerson = people.find((person) => String(person.id) === createdBy);

  // Any filter change returns to page 1 and clears the selection.
  const filterKey = `${filterQuery}|${defaultPipelineId ?? ""}`;
  const page = pageState.key === filterKey ? pageState.page : 1;
  const setPage = (next: number) => setPageState({ key: filterKey, page: next });
  if (pageState.key !== filterKey && selected.size > 0) setSelected(new Set());

  const setSelectedPipelineId = (pipelineId: number | null) =>
    setFilter("pipeline", pipelineId == null ? "all" : pipelineId === defaultPipelineId ? null : pipelineId);
  const setSelectedLabel = (label: string) => setFilter("stage", label === "all" ? null : label);

  // Wait for a pause in typing before querying, then mirror the search into the URL.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    if ((filters.q ?? "") !== debouncedSearch) setFilter("q", debouncedSearch || null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const createdFrom = dateRange.from ? new Date(`${dateRange.from}T00:00:00`).toISOString() : undefined;
  const createdTo = dateRange.to ? new Date(`${dateRange.to}T23:59:59.999`).toISOString() : undefined;
  const extraFilters = {
    created_by_user_id: createdBy || undefined,
    created_from: createdFrom,
    created_to: createdTo,
    assigned_to_user_id: filters.assigned_to || undefined,
    industry: industryFilter || undefined,
  };
  const activeFilterCount =
    (pipelineFiltered ? 1 : 0) +
    (selectedLabel !== "all" ? 1 : 0) +
    (createdBy ? 1 : 0) +
    (dateRange.from || dateRange.to ? 1 : 0) +
    (industryFilter ? 1 : 0) +
    (filters.assigned_to ? 1 : 0);

  const { data, isFetching, isLoading: isLoadingLeads, isError: leadsError, refetch } = useLeads({
    company_id: companyId ?? undefined,
    page,
    search: debouncedSearch || undefined,
    pipeline_id: selectedPipelineId ?? undefined,
    status: selectedLabel === "all" ? undefined : selectedLabel,
    source: effectiveSourceFilter,
    ...extraFilters,
  }, "/admin");
  const updateLeadMutation = useUpdateLead(undefined, "/admin");
  const deleteLeadMutation = useDeleteLead(undefined, "/admin");
  const bulkDeleteMutation = useBulkDeleteLeads("/admin");

  // The sales-engine scope is filtered on the server (source=sales_engine); filtering
  // again here made page counts disagree with the rows shown.
  const apiLeads = data?.leads ?? [];

  const statusOptions = labels.map((label) => ({
    label: label.name,
    value: label.slug,
    color: label.color,
  }));

  const leads: Lead[] = apiLeads.map((l) => ({
    id: String(l.id),
    name: l.name,
    company: l.company_name || "—",
    status: (l.status ?? "newly_lead") as ApiLeadStatus,
    statusColor: getStatusColor(l.status, labels),
    value: resolveLeadBudgetAmount(l),
    assignedTo: l.assignee?.name ?? "Unassigned",
    source: l.source ?? "—",
    customFields: readCustomFields(l.custom_fields),
  }));

  const allChecked = leads.length > 0 && selected.size === leads.length;
  const visibleCustomFields = leadFields.filter((field) =>
    (field.status === "active" || field.status === "pending")
    && field.show_in_list
    && leadColumns.visible(`custom:${field.key}`),
  );
  const listGridStyle = { gridTemplateColumns: leadListGridTemplate(leadColumns.visible, visibleCustomFields.length) };


  const toggleAll = () => {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map((l) => l.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateStatus = async (id: string, status: ApiLeadStatus) => {
    try {
      await updateLeadMutation.mutateAsync({
        leadId: id,
        payload: { company_id: companyId ?? "", status },
      });
      toast.success("Status updated");
      refetch();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to update status"));
    }
  };

  const deleteLead = async (id: string) => {
    try {
      await deleteLeadMutation.mutateAsync({
        leadId: id,
        companyId: companyId ?? undefined,
      });
      toast.success("Lead deleted successfully");
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setDeleteTargetId(null);
      refetch();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not delete the lead. Please try again."));
    }
  };

  const deleteSelectedLeads = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    try {
      const res = await bulkDeleteMutation.mutateAsync({ leadIds: ids, companyId: companyId ?? undefined });
      const deleted = res.data.deleted_ids.length;
      const failed = res.data.failed;
      if (failed.length === 0) {
        toast.success(deleted === 1 ? "Lead deleted successfully" : `${deleted} leads deleted successfully`);
        setSelected(new Set());
      } else {
        // Keep the leads that failed selected so the user can see/retry them.
        toast.error(`${deleted} deleted, ${failed.length} could not be deleted. ${failed[0].message}`);
        setSelected(new Set(failed.map((item) => String(item.id))));
      }
      setShowBulkDeleteConfirm(false);
      refetch();
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Could not delete the selected leads. Please try again."));
      refetch();
    }
  };

  const openEditLead = (id: string) => {
    const lead = apiLeads.find((entry) => String(entry.id) === id);
    if (lead) {
      setEditingLead(lead);
    }
  };

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
                if (e.key === "Enter") e.preventDefault();
              }}
              placeholder="Search for Leads"
              className="se-search w-full bg-white border border-gray-200 rounded-full py-3.5 pl-13 pr-6 text-[13px] outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm"
            />
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
              aria-pressed={activeFilterCount > 0}
              onClick={() => setShowFilter((prev) => !prev)}
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
              apiBasePath="/admin"
              pipelines={pipelines}
              labels={labels}
              defaultPipelineId={selectedPipelineId}
              activeFilters={{
                search: debouncedSearch || undefined,
                pipeline_id: selectedPipelineId ?? undefined,
                status: selectedLabel === "all" ? undefined : selectedLabel,
                source: effectiveSourceFilter,
                ...extraFilters,
              }}
              selectedLeadIds={Array.from(selected)}
              onViewImportedPipeline={(pipelineId) => {
                setSearch("");
                setDebouncedSearch("");
                setFilters(() => ({ pipeline: pipelineId === defaultPipelineId ? undefined : String(pipelineId) }));
              }}
              onViewAllLeads={() => {
                setSearch("");
                setDebouncedSearch("");
                setFilters(() => ({ pipeline: "all" }));
              }}
            />
            <button onClick={() => setShowAddModal(true)} className="se-primary flex items-center gap-2 px-5 py-2.5 bg-[#0B1215] text-white rounded-[10px] text-[12px] font-medium hover:opacity-90 transition-all">
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

        {(agentUploadScope || createdBy) && (
          <div className="se-surface flex items-center justify-between rounded-2xl border border-[#09232d]/15 bg-[#09232d]/[0.03] px-4 py-2.5 text-xs text-[#09232d] shadow-xs">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex size-2 shrink-0 rounded-full bg-emerald-500" />
              <span className="font-semibold text-slate-900 truncate">
                {createdBy
                  ? `Uploaded by ${createdByPerson?.name ?? "selected agent"}`
                  : "Uploaded by your agents"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setFilters({ source: "", created_by: "" })}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold text-slate-700 shadow-xs hover:bg-slate-100 transition cursor-pointer"
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
            onCreatedByChange={(userId) => setFilter("created_by", userId || null)}
            dateRange={dateRange}
            onDateRangeChange={(range) => setFilters({ from: range.from || "", to: range.to || "" })}
            industry={industryFilter}
            onIndustryChange={(value) => setFilter("industry", value || null)}
            onClear={() => setFilters((current) => ({ q: current.q, source: current.source }))}
          />
        )}

        {/* Table card */}
        <div className="se-surface se-list-surface bg-white rounded-[24px] shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] overflow-hidden flex flex-col h-[calc(100vh-200px)] min-h-96">
          {/* Select all + view toggle */}
          <div className="flex items-center justify-between px-6 pt-5 pb-4 shrink-0">
            <label className="flex items-center gap-2.5 cursor-pointer select-none group">
              <div
                onClick={toggleAll}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${allChecked
                    ? "bg-[#0B1215] border-[#0B1215]"
                    : "border-gray-300 group-hover:border-gray-400"
                  }`}
              >
                {allChecked && (
                  <svg
                    width="10"
                    height="8"
                    viewBox="0 0 10 8"
                    fill="none"
                  >
                    <path
                      d="M1 4L3.5 6.5L9 1"
                      stroke="white"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
              <span className="text-[13px] font-medium text-gray-500">Select page</span>
            </label>

            <div className="flex items-center gap-1">
              <LeadColumnMenu
                hidden={leadColumns.hidden}
                customFields={leadFields.filter((field) => field.status === "active" || field.status === "pending")}
                onHide={leadColumns.hide}
                onShow={leadColumns.show}
                onAdd={() => setShowAddColumn(true)}
              />
              <button
                onClick={() => router.push(boardUrl)}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 transition-colors"
              >
                {/* Grid icon */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="1" width="6" height="6" rx="1.5" fill="currentColor" />
                  <rect x="9" y="1" width="6" height="6" rx="1.5" fill="currentColor" />
                  <rect x="1" y="9" width="6" height="6" rx="1.5" fill="currentColor" />
                  <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" />
                </svg>
              </button>
              <button className="se-primary p-1.5 rounded-md bg-[#0B1215] text-white transition-colors">
                {/* List icon */}
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <rect x="1" y="3" width="14" height="2" rx="1" fill="currentColor" />
                  <rect x="1" y="7" width="14" height="2" rx="1" fill="currentColor" />
                  <rect x="1" y="11" width="14" height="2" rx="1" fill="currentColor" />
                </svg>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
          {/* Column headers */}
          <div className="se-list-heading grid min-w-max gap-3 px-6 pb-4 shrink-0" style={listGridStyle}>
            <div />
            {leadColumns.visible("name") && (
            <div className="bg-[#3B82F6] text-white text-[12px] font-semibold px-4 py-2 rounded-full text-center">
              Leads
            </div>
            )}
            {leadColumns.visible("company") && (
            <div className="bg-[#D946EF] text-white text-[12px] font-semibold px-4 py-2 rounded-full text-center">
              Company
            </div>
            )}
            {leadColumns.visible("status") && (
            <div className="bg-[#F59E0B] text-white text-[12px] font-semibold px-4 py-2 rounded-full text-center">
              Status
            </div>
            )}
            {leadColumns.visible("value") && (
            <div className="bg-[#06B6D4] text-white text-[12px] font-semibold px-4 py-2 rounded-full text-center">
              Value
            </div>
            )}
            {leadColumns.visible("assigned") && (
            <div className="bg-[#8B5CF6] text-white text-[12px] font-semibold px-4 py-2 rounded-full text-center">
              Assigned to
            </div>
            )}
            {leadColumns.visible("source") && (
            <div className="bg-[#65A30D] text-white text-[12px] font-semibold px-4 py-2 rounded-full text-center">
              Source
            </div>
            )}
            <LeadCustomColumnHeaders fields={visibleCustomFields} onHide={leadColumns.hide} />
            <button
              type="button"
              onClick={() => setShowAddColumn(true)}
              className="rounded-full border border-dashed border-gray-300 px-2 py-2 text-[11px] font-semibold text-gray-500"
            >
              Add
            </button>
            <div className="text-[12px] font-semibold text-gray-500 px-4 py-2 text-center">
              Actions
            </div>
          </div>

          {/* Rows */}
          <div className="flex-1 overflow-y-auto px-4">
            {isLoadingLeads && leads.length === 0 && (
              <div className="space-y-2 px-2 py-2" aria-label="Loading leads">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="h-11 rounded-2xl bg-gray-100 animate-pulse" />
                ))}
              </div>
            )}
            {!isLoadingLeads && leadsError && leads.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <p className="text-[13px] text-gray-500">We couldn&apos;t load your leads.</p>
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="rounded-full border border-gray-200 px-4 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Try again
                </button>
              </div>
            )}
            {!isLoadingLeads && !leadsError && leads.length === 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <p className="text-[13px] font-semibold text-[#0B1215]">
                  {activeFilterCount > 0 || debouncedSearch || effectiveSourceFilter ? "No leads match these filters" : "No leads yet"}
                </p>
                {activeFilterCount > 0 || debouncedSearch || effectiveSourceFilter ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      setDebouncedSearch("");
                      setFilters(() => ({}));
                    }}
                    className="rounded-full border border-gray-200 px-4 py-1.5 text-[12px] font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Clear all filters
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddModal(true)}
                    className="rounded-full bg-[#0B1215] px-4 py-1.5 text-[12px] font-semibold text-white hover:opacity-90"
                  >
                    Add your first lead
                  </button>
                )}
              </div>
            )}
            {leads.map((lead) => {
              const isSelected = selected.has(lead.id);
              return (
                <div
                  key={lead.id}
                  onClick={() => router.push(`${basePath}/leads/${lead.id}`)}
                  className={`se-list-row ${isSelected ? "se-table-row-active" : ""} grid min-w-max gap-3 items-center px-2 py-3.5 rounded-2xl mb-1 transition-all duration-150 group/row cursor-pointer ${isSelected
                      ? "bg-[#0B1215]"
                      : "hover:bg-gray-50 border border-transparent hover:border-gray-100"
                    }`}
                  style={listGridStyle}
                >
                  {/* Checkbox */}
                  <div className="flex items-center justify-center">
                    <div
                      onClick={(e) => { e.stopPropagation(); toggleOne(lead.id); }}
                      className={`w-4.5 h-4.5 rounded-md border-2 flex items-center justify-center transition-colors ${isSelected
                          ? "bg-white border-white"
                          : "border-gray-300"
                        }`}
                    >
                      {isSelected && (
                        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                          <path
                            d="M1 3.5L3 5.5L8 1"
                            stroke="#0B1215"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Name */}
                  {leadColumns.visible("name") && (
                  <span
                    className={`text-[13px] font-semibold truncate ${isSelected ? "text-white" : "text-[#0B1215]"
                      }`}
                  >
                    {lead.name}
                  </span>
                  )}

                  {leadColumns.visible("company") && (
                  <span
                    className={`text-[12px] truncate ${isSelected ? "text-white/80" : "text-gray-500"
                      }`}
                  >
                    {lead.company}
                  </span>
                  )}

                  {leadColumns.visible("status") && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <StatusDropdown
                      value={lead.status}
                      color={lead.statusColor}
                      options={statusOptions}
                      onChange={(s) => updateStatus(lead.id, s)}
                    />
                  </div>
                  )}

                  {leadColumns.visible("value") && (
                  <span
                    className={`text-[13px] font-semibold ${isSelected ? "text-white" : "text-[#0B1215]"
                      }`}
                  >
                    $ {lead.value.toLocaleString()}
                  </span>
                  )}

                  {leadColumns.visible("assigned") && (
                  <span
                    className={`text-[12px] truncate ${isSelected ? "text-white/80" : "text-gray-500"
                      }`}
                  >
                    {lead.assignedTo}
                  </span>
                  )}

                  {leadColumns.visible("source") && (
                  <span
                    className={`text-[12px] truncate ${isSelected ? "text-white/80" : "text-gray-500"
                      }`}
                  >
                    {lead.source}
                  </span>
                  )}

                  <LeadCustomColumnCells fields={visibleCustomFields} values={lead.customFields} selected={isSelected} />
                  <span />

                  {/* Actions */}
                  <div
                    className={`flex items-center justify-center gap-2 ${isSelected
                        ? "opacity-100"
                        : "opacity-0 group-hover/row:opacity-100"
                      } transition-opacity`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => router.push(`${basePath}/leads/${lead.id}`)}
                      className={`p-1 rounded-md transition-colors ${isSelected ? "hover:bg-white/10" : "hover:bg-gray-100"
                        }`}
                    >
                      <Eye
                        size={14}
                        className={isSelected ? "text-white" : "text-gray-400"}
                      />
                    </button>
                    <button
                      onClick={() => openEditLead(lead.id)}
                      className={`p-1 rounded-md transition-colors ${isSelected ? "hover:bg-white/10" : "hover:bg-gray-100"
                        }`}
                    >
                      <Pencil
                        size={14}
                        className={isSelected ? "text-white" : "text-gray-400"}
                      />
                    </button>
                    <button
                      className={`p-1 rounded-md transition-colors ${isSelected ? "hover:bg-white/10" : "hover:bg-gray-100"
                        }`}
                      onClick={() => setDeleteTargetId(lead.id)}
                    >
                      <Trash2
                        size={14}
                        className={isSelected ? "text-white" : "text-gray-400"}
                      />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          </div>

          {/* Footer */}
          <div className="shrink-0">
            {selected.size > 0 && (
              <div className="px-6 py-2 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[12px] text-gray-400">{selected.size} selected on this page</span>
                <button
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  className="flex items-center gap-1.5 text-[12px] font-medium text-red-500 hover:text-red-600 transition-colors"
                >
                  <Trash2 size={13} />
                  Delete selected
                </button>
              </div>
            )}
            <LeadPagination
              pagination={data?.pagination}
              itemCount={leads.length}
              page={page}
              onPageChange={(nextPage) => {
                setSelected(new Set());
                setPage(nextPage);
              }}
              disabled={isFetching}
            />
          </div>
        </div>
      </div>

      {showPipelineModal && companyId && (
        <PipelineManagerModal
          companyId={companyId}
          apiBasePath="/admin"
          pipelines={pipelines}
          selectedPipelineId={selectedPipelineId}
          onSelectPipeline={setSelectedPipelineId}
          onClose={() => setShowPipelineModal(false)}
        />
      )}

      {showLabelModal && companyId && (
        <LabelManagerModal
          companyId={companyId}
          apiBasePath="/admin"
          labels={labels}
          onClose={() => setShowLabelModal(false)}
        />
      )}

      {showAddColumn && companyId && (
        <LeadFieldDialog
          companyId={companyId}
          apiBasePath="/admin"
          title="Add a lead column"
          onClose={() => setShowAddColumn(false)}
          onCreated={() => setShowAddColumn(false)}
        />
      )}

      {showAddModal && (
        <AddLeadModal
          onClose={() => setShowAddModal(false)}
          apiBasePath="/admin"
        />
      )}

      {editingLead && (
        <AddLeadModal
          lead={editingLead}
          onClose={() => setEditingLead(null)}
          apiBasePath="/admin"
        />
      )}

      <ConfirmDeleteModal
        isOpen={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={() => { if (deleteTargetId) void deleteLead(deleteTargetId); }}
        title="Delete Lead"
        description="Are you sure you want to delete this lead? This action cannot be undone."
      />

      <ConfirmDeleteModal
        isOpen={showBulkDeleteConfirm}
        onClose={() => setShowBulkDeleteConfirm(false)}
        onConfirm={() => { void deleteSelectedLeads(); }}
        title={`Delete ${selected.size} Lead${selected.size === 1 ? "" : "s"}`}
        description={`Are you sure you want to delete ${selected.size} selected lead${selected.size === 1 ? "" : "s"}? This action cannot be undone.`}
      />
    </div>
  );
}
