"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  ArrowUpDown,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  Filter,
  Globe,
  Grid3X3,
  Layers,
  LayoutList,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Sparkles,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useIcpProfiles, useActiveIcpProfile } from "@/hooks/use-sales-engine-icp";
import { usePendingReviewLeads } from "@/hooks/use-sales-engine-pending-leads";
import { useSyncLeadToCrm, useSyncLeadsBatchToCrm } from "@/hooks/use-sync-leads-to-crm";
import { useSalesEngineCrmPipelines } from "@/hooks/use-sales-engine-pipelines";
import { useFactory23IntegrationStatus } from "@/hooks/use-factory23-integration-status";
import { AddToCrmPipelineModal } from "./crm-action-modals";
import { getApiErrorMessage } from "@/lib/api/errors";
import { leadScoreBreakdown } from "@/lib/icp-advisory-leads";
import type { ChatLead } from "@/lib/api/sales-engine";

type FitFilter = "all" | "high" | "medium" | "contact_ready";
type SortOption = "highest_score" | "lowest_score" | "name_asc" | "company_asc";
type ViewMode = "grid" | "list";

// Signature palette requested: #7BB6B8, #E3A5E9, #DBDBDB
const LEAD_CARD_PALETTE = [
  {
    bg: "#7BB6B8",
    avatarText: "text-[#18484a]",
    iconAccent: "#205254",
    borderTint: "border-[#205254]/20",
    glowColor: "rgba(123, 182, 184, 0.35)",
  },
  {
    bg: "#E3A5E9",
    avatarText: "text-[#691f73]",
    iconAccent: "#702179",
    borderTint: "border-[#702179]/20",
    glowColor: "rgba(227, 165, 233, 0.35)",
  },
  {
    bg: "#DBDBDB",
    avatarText: "text-[#383838]",
    iconAccent: "#3f3f3f",
    borderTint: "border-[#3f3f3f]/20",
    glowColor: "rgba(219, 219, 219, 0.35)",
  },
] as const;

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function SalesEnginePendingReviewView() {
  const searchParams = useSearchParams();
  const initialIcpParam = searchParams.get("icp_id");

  const { data: icpProfiles = [], isLoading: isProfilesLoading } = useIcpProfiles();
  const { data: activeProfile } = useActiveIcpProfile();

  // Selected ICP state: can be a specific profile ID or "all"
  const [selectedIcpId, setSelectedIcpId] = useState<string>(
    initialIcpParam || (activeProfile?.id ? String(activeProfile.id) : "all")
  );

  const {
    data: leads = [],
    isLoading: isLeadsLoading,
    isFetching,
    refetch,
    removeLeadLocally,
    removeLeadsLocally,
    invalidateAll,
  } = usePendingReviewLeads(selectedIcpId);

  const { pipelines, isLoading: pipelinesLoading } = useSalesEngineCrmPipelines();
  const { data: integrationStatus } = useFactory23IntegrationStatus();
  const canSyncToCrm = integrationStatus?.can_sync ?? true;
  const crmBlockMessage =
    integrationStatus?.block_message ??
    "CRM sync is unavailable. Sign out and sign back in to link Factory23, or contact your admin.";

  const syncLead = useSyncLeadToCrm();
  const syncBatch = useSyncLeadsBatchToCrm();

  // View, filter and sort state
  const [searchQuery, setSearchQuery] = useState("");
  const [fitFilter, setFitFilter] = useState<FitFilter>("all");
  const [sortOption, setSortOption] = useState<SortOption>("highest_score");
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());

  // Modals & detail inspection
  const [pendingModalLead, setPendingModalLead] = useState<ChatLead | null>(null);
  const [inspectingLead, setInspectingLead] = useState<ChatLead | null>(null);
  const [copiedLeadId, setCopiedLeadId] = useState<number | null>(null);

  // Derive counts for top stat cards
  const { highFitCount, contactReadyCount } = useMemo(() => {
    let high = 0;
    let ready = 0;
    for (const lead of leads) {
      const { overall } = leadScoreBreakdown(lead);
      if (overall >= 80) high++;
      if (lead.email || lead.phone) ready++;
    }
    return { highFitCount: high, contactReadyCount: ready };
  }, [leads]);

  // Filtered & sorted leads calculation
  const filteredLeads = useMemo(() => {
    const list = leads.filter((lead) => {
      // Exclude any already marked saved or synced
      if (lead.crm_synced || lead.save_status === "saved" || lead.crm_duplicate) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = lead.name.toLowerCase().includes(q);
        const matchesCompany = lead.company?.toLowerCase().includes(q) ?? false;
        const matchesTitle = lead.title?.toLowerCase().includes(q) ?? false;
        const matchesLocation = lead.location?.toLowerCase().includes(q) ?? false;
        const matchesSummary = lead.summary?.toLowerCase().includes(q) ?? false;
        if (!matchesName && !matchesCompany && !matchesTitle && !matchesLocation && !matchesSummary) {
          return false;
        }
      }

      // Fit score filter
      const { overall } = leadScoreBreakdown(lead);
      if (fitFilter === "high" && overall < 80) return false;
      if (fitFilter === "medium" && (overall < 60 || overall >= 80)) return false;
      if (fitFilter === "contact_ready" && !lead.email && !lead.phone) return false;

      return true;
    });

    // Sorting
    return list.sort((a, b) => {
      const scoreA = leadScoreBreakdown(a).overall;
      const scoreB = leadScoreBreakdown(b).overall;
      if (sortOption === "highest_score") return scoreB - scoreA;
      if (sortOption === "lowest_score") return scoreA - scoreB;
      if (sortOption === "name_asc") return a.name.localeCompare(b.name);
      if (sortOption === "company_asc") return (a.company ?? "").localeCompare(b.company ?? "");
      return 0;
    });
  }, [leads, searchQuery, fitFilter, sortOption]);

  // Selected leads list
  const selectedCount = selectedLeadIds.size;
  const allFilteredSelected =
    filteredLeads.length > 0 && filteredLeads.every((l) => selectedLeadIds.has(l.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(filteredLeads.map((l) => l.id)));
    }
  };

  const toggleSelectLead = (id: number) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 1-Click Copy with feedback
  const handleCopyLead = (lead: ChatLead) => {
    const info = [
      lead.name,
      [lead.title, lead.company].filter(Boolean).join(" at "),
      lead.email ? `Email: ${lead.email}` : null,
      lead.phone ? `Phone: ${lead.phone}` : null,
      lead.linkedin_url ? `LinkedIn: ${lead.linkedin_url}` : null,
      lead.website ? `Website: ${lead.website}` : null,
      lead.location ? `Location: ${lead.location}` : null,
      lead.summary ? `Summary: ${lead.summary}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    navigator.clipboard.writeText(info);
    setCopiedLeadId(lead.id);
    toast.success(`Copied details for ${lead.name}`);
    setTimeout(() => {
      setCopiedLeadId((prev) => (prev === lead.id ? null : prev));
    }, 2000);
  };

  // Handle single lead save to CRM
  const handleConfirmSaveToCrm = (pipelineId: string) => {
    if (!pendingModalLead) return;
    const lead = pendingModalLead;

    syncLead.mutate(
      { leadId: lead.id, pipeline_id: pipelineId },
      {
        onSuccess: (result) => {
          removeLeadLocally(lead.id);
          setSelectedLeadIds((prev) => {
            const next = new Set(prev);
            next.delete(lead.id);
            return next;
          });
          if (inspectingLead?.id === lead.id) setInspectingLead(null);
          invalidateAll();

          if (result.updated) {
            toast.success(`Updated "${lead.name}" in CRM pipeline.`);
          } else if (result.crm_duplicate || result.already_synced) {
            toast.info(`"${lead.name}" is already synced in CRM.`);
          } else {
            toast.success(`Successfully saved "${lead.name}" to CRM.`);
          }
          setPendingModalLead(null);
        },
        onError: (err) => {
          toast.error(getApiErrorMessage(err, "Failed to save lead to CRM."));
        },
      }
    );
  };

  // Handle batch save
  const handleBatchSaveToCrm = () => {
    const ids = Array.from(selectedLeadIds);
    if (ids.length === 0) return;

    syncBatch.mutate(ids, {
      onSuccess: (result) => {
        const syncedIds = result.synced.map((item) => item.lead_id);
        removeLeadsLocally(syncedIds);
        setSelectedLeadIds(new Set());
        invalidateAll();

        toast.success(`Saved ${syncedIds.length} lead${syncedIds.length === 1 ? "" : "s"} to CRM.`);
        if (result.errors.length > 0) {
          toast.error(result.errors[0]);
        }
      },
      onError: (err) => {
        toast.error(getApiErrorMessage(err, "Failed to batch save leads to CRM."));
      },
    });
  };

  const selectedIcpName = useMemo(() => {
    if (selectedIcpId === "all") return "All ICP Profiles";
    const found = icpProfiles.find((p) => String(p.id) === selectedIcpId);
    return found ? found.name : "Active ICP";
  }, [selectedIcpId, icpProfiles]);

  return (
    <div className="min-h-[calc(100vh-80px)] overflow-x-hidden bg-[#f8f8f8] px-6 py-8 text-[#09232d] max-sm:px-4">
      <div className="mx-auto flex w-full max-w-[1340px] flex-col gap-6">
        {/* Top Breadcrumb & Quick Actions Bar */}
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <Link
                href="/sales-engine"
                className="inline-flex items-center gap-1.5 transition-colors hover:text-[#09232d]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Sales Engine</span>
              </Link>
              <span>/</span>
              <span className="font-semibold text-[#09232d]">Pending Review</span>
            </div>

            <div className="flex items-center gap-2.5">
              <Link
                href="/crm?source=sales_engine"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-[#09232d] shadow-sm transition-all hover:border-slate-400 hover:bg-slate-50 active:scale-[0.98]"
              >
                <Users className="h-4 w-4 text-slate-500" />
                <span>View CRM Pipeline</span>
              </Link>
            </div>
          </div>

          {/* Header Row */}
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-[#09232d]">
                  Pending Review Leads
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-200 px-3 py-0.5 text-xs font-semibold text-[#09232d]">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {leads.length} {leads.length === 1 ? "draft" : "drafts"}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                AI-discovered prospective leads awaiting qualification. Review research notes, verify details, and add qualified targets to your CRM.
              </p>
            </div>

            {/* ICP Profile Selector & Refresh Button */}
            <div className="flex items-center gap-2">
              <label htmlFor="icp-selector" className="text-xs font-semibold text-slate-600">
                ICP Build:
              </label>
              <div className="relative">
                <select
                  id="icp-selector"
                  value={selectedIcpId}
                  onChange={(e) => {
                    setSelectedIcpId(e.target.value);
                    setSelectedLeadIds(new Set());
                  }}
                  className="h-9.5 rounded-xl border border-slate-300 bg-white pl-3.5 pr-8 text-xs font-semibold text-[#09232d] shadow-sm focus:border-[#09232d] focus:outline-none focus:ring-1 focus:ring-[#09232d]"
                >
                  <option value="all">All ICP Profiles</option>
                  {icpProfiles.map((profile) => (
                    <option key={profile.id} value={String(profile.id)}>
                      {profile.name} {profile.isActive ? "(Active)" : ""}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                title="Refresh leads list"
                className="flex h-9.5 w-9.5 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 shadow-sm transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Integration Warning if CRM link is blocked */}
        {!canSyncToCrm && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-900">
            <span className="font-semibold">CRM Notice:</span> {crmBlockMessage}
          </div>
        )}

        {/* 3 Metric Cards with distinct white background and theme color accents */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Card 1: Total Pending (#7BB6B8 Accent) */}
          <button
            type="button"
            onClick={() => setFitFilter("all")}
            className={`group relative overflow-hidden rounded-[20px] bg-white p-5 text-left transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
              fitFilter === "all"
                ? "border-2 border-[#09232d] shadow-md ring-1 ring-[#09232d]/20"
                : "border border-slate-200 shadow-sm hover:border-slate-300 hover:shadow"
            }`}
          >
            {/* Top Accent Strip */}
            <div
              style={{ backgroundColor: "#7BB6B8" }}
              className="absolute left-0 top-0 h-1.5 w-full"
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Total Pending
                </span>
                {fitFilter === "all" && (
                  <span className="rounded-full bg-[#09232d] px-2 py-0.5 text-[9px] font-bold text-white">
                    Active
                  </span>
                )}
              </div>
              <div
                style={{ backgroundColor: "#7BB6B8" }}
                className="grid size-9 place-items-center rounded-full shadow-xs transition-transform group-hover:scale-105"
              >
                <Clock className="h-4 w-4 text-[#09232d]" />
              </div>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-[#09232d]">
                {leads.length}
              </span>
              <span className="text-xs font-semibold text-slate-600">leads to review</span>
            </div>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              Click to view all drafts for {selectedIcpName}
            </p>
          </button>

          {/* Card 2: High ICP Match (#E3A5E9 Accent) */}
          <button
            type="button"
            onClick={() => setFitFilter("high")}
            className={`group relative overflow-hidden rounded-[20px] bg-white p-5 text-left transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
              fitFilter === "high"
                ? "border-2 border-[#09232d] shadow-md ring-1 ring-[#09232d]/20"
                : "border border-slate-200 shadow-sm hover:border-slate-300 hover:shadow"
            }`}
          >
            {/* Top Accent Strip */}
            <div
              style={{ backgroundColor: "#E3A5E9" }}
              className="absolute left-0 top-0 h-1.5 w-full"
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  High ICP Match
                </span>
                {fitFilter === "high" && (
                  <span className="rounded-full bg-[#09232d] px-2 py-0.5 text-[9px] font-bold text-white">
                    Active
                  </span>
                )}
              </div>
              <div
                style={{ backgroundColor: "#E3A5E9" }}
                className="grid size-9 place-items-center rounded-full shadow-xs transition-transform group-hover:scale-105"
              >
                <Sparkles className="h-4 w-4 text-[#09232d]" />
              </div>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-[#09232d]">
                {highFitCount}
              </span>
              <span className="text-xs font-semibold text-slate-600">strong fits (80%+)</span>
            </div>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              Click to isolate high-confidence prospects
            </p>
          </button>

          {/* Card 3: Contact Enriched (#DBDBDB Accent) */}
          <button
            type="button"
            onClick={() => setFitFilter("contact_ready")}
            className={`group relative overflow-hidden rounded-[20px] bg-white p-5 text-left transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer ${
              fitFilter === "contact_ready"
                ? "border-2 border-[#09232d] shadow-md ring-1 ring-[#09232d]/20"
                : "border border-slate-200 shadow-sm hover:border-slate-300 hover:shadow"
            }`}
          >
            {/* Top Accent Strip */}
            <div
              style={{ backgroundColor: "#DBDBDB" }}
              className="absolute left-0 top-0 h-1.5 w-full"
            />

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Contact Enriched
                </span>
                {fitFilter === "contact_ready" && (
                  <span className="rounded-full bg-[#09232d] px-2 py-0.5 text-[9px] font-bold text-white">
                    Active
                  </span>
                )}
              </div>
              <div
                style={{ backgroundColor: "#DBDBDB" }}
                className="grid size-9 place-items-center rounded-full shadow-xs transition-transform group-hover:scale-105"
              >
                <Mail className="h-4 w-4 text-[#09232d]" />
              </div>
            </div>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-bold tracking-tight text-[#09232d]">
                {contactReadyCount}
              </span>
              <span className="text-xs font-semibold text-slate-600">with email or phone</span>
            </div>
            <p className="mt-1 text-[11px] font-medium text-slate-500">
              Click to view leads with direct outreach info
            </p>
          </button>
        </div>

        {/* Toolbar: Search, Filters, Sorting & View Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
          {/* Search box */}
          <div className="relative min-w-[280px] flex-1 max-sm:min-w-full">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, company, job title, location, notes…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-9 text-xs font-medium text-[#09232d] placeholder-slate-400 focus:border-[#09232d] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#09232d]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "all", label: "All Fits" },
                { id: "high", label: "High Fit (80%+)" },
                { id: "medium", label: "Medium Fit (60-79%)" },
                { id: "contact_ready", label: "Contact Ready" },
              ] as const
            ).map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setFitFilter(pill.id)}
                className={`rounded-xl px-3 py-2 text-xs font-semibold transition-all cursor-pointer ${
                  fitFilter === pill.id
                    ? "bg-[#09232d] text-white shadow-sm"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-[#09232d]"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>

          {/* Sort Dropdown & View Mode Switcher */}
          <div className="flex items-center gap-2 border-l border-slate-200 pl-3 max-sm:border-l-0 max-sm:pl-0">
            <div className="relative">
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as SortOption)}
                className="h-10 rounded-xl border border-slate-200 bg-slate-50 pl-3 pr-8 text-xs font-semibold text-[#09232d] focus:border-[#09232d] focus:outline-none"
              >
                <option value="highest_score">Highest Fit First</option>
                <option value="lowest_score">Lowest Fit First</option>
                <option value="name_asc">Name (A-Z)</option>
                <option value="company_asc">Company (A-Z)</option>
              </select>
            </div>

            {/* View Mode Toggle: Grid vs List */}
            <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                title="Grid View"
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                  viewMode === "grid" ? "bg-white text-[#09232d] shadow-xs font-bold" : "text-slate-500 hover:text-[#09232d]"
                }`}
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                title="List View"
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition-all ${
                  viewMode === "list" ? "bg-white text-[#09232d] shadow-xs font-bold" : "text-slate-500 hover:text-[#09232d]"
                }`}
              >
                <LayoutList className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Selection Status Row */}
        {filteredLeads.length > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm text-xs">
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 text-[#09232d] focus:ring-[#09232d]"
                />
                <span>Select all ({filteredLeads.length})</span>
              </label>

              {selectedCount > 0 && (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-bold text-[#09232d]">
                  {selectedCount} selected
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-slate-500">
                Showing {filteredLeads.length} of {leads.length} pending leads
              </span>
            </div>
          </div>
        )}

        {/* Loading Skeleton State */}
        {isLeadsLoading ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-[280px] animate-pulse rounded-[22px] bg-slate-200/70 p-5 shadow-sm"
              />
            ))}
          </div>
        ) : filteredLeads.length === 0 ? (
          /* Empty State */
          <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 rounded-[24px] border border-slate-200 bg-white p-12 text-center shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="max-w-md">
              <h3 className="text-lg font-bold text-[#09232d]">
                {leads.length === 0 ? "All caught up! No pending leads" : "No matching leads found"}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                {leads.length === 0
                  ? "All prospective leads for this ICP have been qualified and saved into CRM, or no discovery runs have completed yet. Return to Sales Engine to discover fresh prospects."
                  : "No prospective leads match your current search query or filter criteria. Try clearing the filter or adjusting your search term."}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              {leads.length > 0 && (searchQuery || fitFilter !== "all") && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setFitFilter("all");
                  }}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Clear Filters
                </button>
              )}
              <Link
                href="/sales-engine"
                className="rounded-xl bg-[#09232d] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-[#0c2e3b]"
              >
                Return to Sales Engine
              </Link>
              <Link
                href="/crm?source=sales_engine"
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-[#09232d] shadow-sm transition-all hover:bg-slate-50"
              >
                View CRM Pipeline
              </Link>
            </div>
          </div>
        ) : viewMode === "grid" ? (
          /* Cards Grid: #7BB6B8, #E3A5E9, #DBDBDB */
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
            {filteredLeads.map((lead, index) => {
              const { overall, search, icp, intent } = leadScoreBreakdown(lead);
              const isSelected = selectedLeadIds.has(lead.id);
              const initials = getInitials(lead.name);
              const palette = LEAD_CARD_PALETTE[index % LEAD_CARD_PALETTE.length];
              const isCopied = copiedLeadId === lead.id;

              return (
                <article
                  key={lead.id}
                  style={{ backgroundColor: palette.bg }}
                  className={`group relative flex flex-col justify-between rounded-[22px] p-5.5 shadow-[0_6px_5px_rgba(0,0,0,0.15),0_2px_1.5px_rgba(0,0,0,0.3)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_12px_24px_rgba(0,0,0,0.12),0_4px_8px_rgba(0,0,0,0.06)] ${
                    isSelected ? "ring-2 ring-[#09232d] ring-offset-2 ring-offset-[#f8f8f8]" : ""
                  }`}
                >
                  <div className="flex flex-col gap-3.5">
                    {/* Card Top: Checkbox, Avatar, Name & Score */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectLead(lead.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-[#09232d] focus:ring-[#09232d] cursor-pointer shrink-0"
                        />

                        {/* Pure White Circular Avatar with Monogram */}
                        <div
                          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white shadow-sm font-bold text-sm tracking-wide ${palette.avatarText}`}
                        >
                          {initials}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4
                            className="truncate text-base font-bold leading-tight text-[#09232d]"
                            title={lead.name}
                          >
                            {lead.name}
                          </h4>
                          {(lead.title || lead.company) && (
                            <p className="flex items-center gap-1.5 truncate text-xs font-medium text-[#09232d]/80 mt-0.5">
                              <Building2 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                              <span className="truncate">
                                {[lead.title, lead.company].filter(Boolean).join(" at ")}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Score Badge */}
                      <span
                        className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[#09232d] shadow-sm border border-black/5"
                        title={`Score Breakdown: Overall ${overall}%, ICP Fit ${icp ?? "—"}%, Relevance ${search ?? "—"}%`}
                      >
                        {overall}% Fit
                      </span>
                    </div>

                    {/* Metadata Pills (Location, Source, Enrichment) */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#09232d]">
                      {lead.location && (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-white/75 px-2.5 py-0.5 text-[11px] font-medium text-[#09232d] shadow-xs">
                          <MapPin className="h-3 w-3 opacity-70" />
                          <span className="truncate max-w-[120px]">{lead.location}</span>
                        </span>
                      )}
                      <span className="rounded-lg bg-white/75 px-2.5 py-0.5 text-[11px] font-semibold text-[#09232d] shadow-xs">
                        {lead.source}
                      </span>
                      {lead.website && (
                        <a
                          href={lead.website.startsWith("http") ? lead.website : `https://${lead.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg bg-white/75 px-2 py-0.5 text-[11px] font-medium text-[#09232d] hover:bg-white shadow-xs"
                          title={lead.website}
                        >
                          <Globe className="h-3 w-3 opacity-70" />
                          <span className="truncate max-w-[90px]">Website</span>
                        </a>
                      )}
                      {lead.contact_enrichment_tier && lead.contact_enrichment_tier !== "seed" && (
                        <span className="rounded-lg bg-white/75 px-2.5 py-0.5 text-[11px] font-semibold text-[#09232d] shadow-xs">
                          {lead.contact_enrichment_tier === "tier1"
                            ? "Web verified"
                            : lead.contact_enrichment_tier === "tier2"
                              ? "Enriched contact"
                              : "Verified direct"}
                        </span>
                      )}
                    </div>

                    {/* ICP Alignment Insight / Quote */}
                    {lead.icp_relevance_reason && (
                      <div className="rounded-xl bg-white/80 p-2.5 text-[11px] leading-relaxed text-[#09232d] shadow-xs border border-black/5 flex items-start gap-1.5">
                        <Sparkles className="h-3.5 w-3.5 shrink-0 opacity-70 mt-0.5" />
                        <span className="line-clamp-2 italic">{lead.icp_relevance_reason}</span>
                      </div>
                    )}

                    {/* AI Research Excerpt */}
                    {lead.summary && (
                      <p className="line-clamp-2 text-xs leading-relaxed text-[#09232d]/85 font-normal">
                        {lead.summary}
                      </p>
                    )}

                    {/* Verified Contact Details with interactive pills */}
                    <div className="flex flex-col gap-1.5 border-t border-black/10 pt-2.5 text-xs">
                      {lead.email && (
                        <a
                          href={`mailto:${lead.email}`}
                          className="flex items-center gap-1.5 truncate font-semibold text-[#09232d] hover:underline"
                        >
                          <Mail className="h-3.5 w-3.5 shrink-0 opacity-80" />
                          <span className="truncate">{lead.email}</span>
                        </a>
                      )}

                      {lead.phone && (
                        <a
                          href={`tel:${lead.phone}`}
                          className="flex items-center gap-1.5 truncate font-semibold text-[#09232d] hover:underline"
                        >
                          <Phone className="h-3.5 w-3.5 shrink-0 opacity-80" />
                          <span className="truncate">{lead.phone}</span>
                        </a>
                      )}

                      {lead.linkedin_url && (
                        <a
                          href={lead.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 font-semibold text-[#09232d] hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-80" />
                          <span>LinkedIn Profile</span>
                        </a>
                      )}

                      {!lead.email && !lead.phone && !lead.linkedin_url && (
                        <span className="text-[11px] font-medium text-[#09232d]/60">
                          Direct email/phone pending enrichment
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Action Footer */}
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-black/10 pt-3">
                    <div className="flex items-center gap-1.5">
                      {/* Inspect details button */}
                      <button
                        type="button"
                        onClick={() => setInspectingLead(lead)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#09232d] shadow-sm transition-all hover:bg-white/90 active:scale-95 cursor-pointer"
                        title="Inspect full lead profile"
                      >
                        <Eye className="h-4 w-4 opacity-75" />
                      </button>

                      {/* 1-Click Copy with feedback */}
                      <button
                        type="button"
                        onClick={() => handleCopyLead(lead)}
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-[#09232d] shadow-sm transition-all hover:bg-white/90 active:scale-95 cursor-pointer"
                        title="Copy contact details"
                      >
                        {isCopied ? (
                          <Check className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Copy className="h-4 w-4 opacity-75" />
                        )}
                      </button>
                    </div>

                    {/* Primary Save to CRM button */}
                    <button
                      type="button"
                      disabled={syncLead.isPending || !canSyncToCrm}
                      onClick={() => setPendingModalLead(lead)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#09232d] px-4 py-2 text-xs font-bold text-white shadow-md transition-all hover:bg-[#0c2e3b] active:scale-[0.98] disabled:opacity-60 cursor-pointer"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      <span>Save to CRM</span>
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          /* List View Mode (Dense Layout for high productivity) */
          <div className="flex flex-col gap-2.5">
            {filteredLeads.map((lead, index) => {
              const { overall } = leadScoreBreakdown(lead);
              const isSelected = selectedLeadIds.has(lead.id);
              const initials = getInitials(lead.name);
              const palette = LEAD_CARD_PALETTE[index % LEAD_CARD_PALETTE.length];
              const isCopied = copiedLeadId === lead.id;

              return (
                <div
                  key={lead.id}
                  className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border bg-white p-4 shadow-sm transition-all hover:shadow-md ${
                    isSelected ? "border-[#09232d] ring-1 ring-[#09232d]" : "border-slate-200"
                  }`}
                >
                  {/* Left: Checkbox, Color strip, Avatar, Name & Company */}
                  <div className="flex items-center gap-3.5 min-w-[260px] flex-1">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectLead(lead.id)}
                      className="h-4 w-4 rounded border-slate-300 text-[#09232d] focus:ring-[#09232d] cursor-pointer"
                    />

                    <div
                      style={{ backgroundColor: palette.bg }}
                      className="h-9 w-1.5 rounded-full shrink-0"
                    />

                    <div
                      style={{ backgroundColor: palette.bg }}
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-bold text-xs ${palette.avatarText} shadow-xs`}
                    >
                      {initials}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-[#09232d] truncate">
                          {lead.name}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                          {overall}% Fit
                        </span>
                      </div>
                      <p className="truncate text-xs text-slate-500">
                        {[lead.title, lead.company].filter(Boolean).join(" at ")}
                      </p>
                    </div>
                  </div>

                  {/* Middle: Contacts */}
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    {lead.email && (
                      <a
                        href={`mailto:${lead.email}`}
                        className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700 hover:bg-slate-200"
                      >
                        <Mail className="h-3 w-3 text-slate-500" />
                        <span className="truncate max-w-[140px]">{lead.email}</span>
                      </a>
                    )}
                    {lead.phone && (
                      <a
                        href={`tel:${lead.phone}`}
                        className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700 hover:bg-slate-200"
                      >
                        <Phone className="h-3 w-3 text-slate-500" />
                        <span>{lead.phone}</span>
                      </a>
                    )}
                    {lead.location && (
                      <span className="flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-slate-700">
                        <MapPin className="h-3 w-3 text-slate-500" />
                        <span>{lead.location}</span>
                      </span>
                    )}
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyLead(lead)}
                      className="flex h-8.5 w-8.5 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                      title="Copy contact info"
                    >
                      {isCopied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                    </button>

                    <button
                      type="button"
                      onClick={() => setInspectingLead(lead)}
                      className="flex h-8.5 w-8.5 items-center justify-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                      title="Inspect full lead profile"
                    >
                      <Eye className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      disabled={syncLead.isPending || !canSyncToCrm}
                      onClick={() => setPendingModalLead(lead)}
                      className="flex items-center gap-1.5 rounded-xl bg-[#09232d] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-[#0c2e3b] disabled:opacity-60 cursor-pointer"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      <span>Save to CRM</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating Sticky Batch Action Bar (Framer Motion) */}
      <AnimatePresence>
        {selectedCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-4 rounded-2xl bg-[#09232d] px-5 py-3 text-white shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
          >
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-[#7BB6B8]" />
              <span className="text-xs font-bold">
                {selectedCount} {selectedCount === 1 ? "lead" : "leads"} selected
              </span>
            </div>

            <div className="h-4 w-px bg-white/20" />

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-xs text-white/80 hover:text-white underline cursor-pointer"
              >
                {allFilteredSelected ? "Deselect all" : "Select all matching"}
              </button>

              <button
                type="button"
                onClick={() => setSelectedLeadIds(new Set())}
                className="text-xs text-white/60 hover:text-white cursor-pointer ml-1"
              >
                Clear
              </button>

              <button
                type="button"
                disabled={syncBatch.isPending || !canSyncToCrm}
                onClick={handleBatchSaveToCrm}
                className="ml-2 flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#09232d] shadow-sm transition-all hover:bg-slate-100 active:scale-95 disabled:opacity-60 cursor-pointer"
              >
                {syncBatch.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Saving to CRM…</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="h-3.5 w-3.5" />
                    <span>Save ({selectedCount}) to CRM</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inspect Lead Drawer / Detail Modal */}
      <AnimatePresence>
        {inspectingLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className="relative w-full max-w-lg rounded-[24px] bg-white p-6 shadow-2xl border border-slate-200 text-[#09232d]"
            >
              <button
                type="button"
                onClick={() => setInspectingLead(null)}
                className="absolute right-4 top-4 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>

              <div className="flex items-start gap-3.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#09232d] font-bold text-white text-base">
                  {getInitials(inspectingLead.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-bold text-[#09232d]">{inspectingLead.name}</h3>
                  <p className="text-xs font-medium text-slate-600">
                    {[inspectingLead.title, inspectingLead.company].filter(Boolean).join(" at ")}
                  </p>
                  {inspectingLead.location && (
                    <p className="mt-0.5 text-xs text-slate-500 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {inspectingLead.location}
                    </p>
                  )}
                </div>
                <span className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-xs font-bold text-emerald-800">
                  {leadScoreBreakdown(inspectingLead).overall}% Match
                </span>
              </div>

              {/* Score Breakdown Bar */}
              <div className="mt-5 grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center border border-slate-100 text-xs">
                <div>
                  <p className="text-[10px] text-slate-500 font-semibold uppercase">ICP Fit</p>
                  <p className="font-bold text-[#09232d] mt-0.5">
                    {leadScoreBreakdown(inspectingLead).icp ?? "—"}%
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-semibold uppercase">Query Match</p>
                  <p className="font-bold text-[#09232d] mt-0.5">
                    {leadScoreBreakdown(inspectingLead).search ?? "—"}%
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 font-semibold uppercase">Buyer Intent</p>
                  <p className="font-bold text-[#09232d] mt-0.5">
                    {leadScoreBreakdown(inspectingLead).intent ?? "—"}%
                  </p>
                </div>
              </div>

              {/* Research Insight */}
              {inspectingLead.icp_relevance_reason && (
                <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-700 border border-slate-100">
                  <span className="font-bold block mb-1">Target Reasoning:</span>
                  <span className="italic">{inspectingLead.icp_relevance_reason}</span>
                </div>
              )}

              {/* Full Summary */}
              {inspectingLead.summary && (
                <div className="mt-3 text-xs leading-relaxed text-slate-600">
                  <span className="font-bold block text-slate-800 mb-1">AI Research Profile:</span>
                  <p>{inspectingLead.summary}</p>
                </div>
              )}

              {/* Contact Channels */}
              <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3 text-xs">
                {inspectingLead.email && (
                  <a
                    href={`mailto:${inspectingLead.email}`}
                    className="flex items-center gap-2 text-emerald-700 font-medium hover:underline"
                  >
                    <Mail className="h-4 w-4 text-emerald-600" />
                    <span>{inspectingLead.email}</span>
                  </a>
                )}
                {inspectingLead.phone && (
                  <a
                    href={`tel:${inspectingLead.phone}`}
                    className="flex items-center gap-2 text-emerald-700 font-medium hover:underline"
                  >
                    <Phone className="h-4 w-4 text-emerald-600" />
                    <span>{inspectingLead.phone}</span>
                  </a>
                )}
                {inspectingLead.linkedin_url && (
                  <a
                    href={inspectingLead.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sky-700 font-medium hover:underline"
                  >
                    <ExternalLink className="h-4 w-4 text-sky-600" />
                    <span>LinkedIn Profile</span>
                  </a>
                )}
                {inspectingLead.website && (
                  <a
                    href={inspectingLead.website.startsWith("http") ? inspectingLead.website : `https://${inspectingLead.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-slate-700 font-medium hover:underline"
                  >
                    <Globe className="h-4 w-4 text-slate-500" />
                    <span>{inspectingLead.website}</span>
                  </a>
                )}
              </div>

              {/* Modal Actions */}
              <div className="mt-6 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={() => setInspectingLead(null)}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const lead = inspectingLead;
                    setInspectingLead(null);
                    setPendingModalLead(lead);
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-[#09232d] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#0c2e3b]"
                >
                  <UserCheck className="h-3.5 w-3.5" />
                  <span>Save Lead to CRM</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add To CRM Pipeline Modal */}
      <AddToCrmPipelineModal
        key={pendingModalLead?.id ?? "pending-review-modal"}
        isOpen={pendingModalLead != null}
        onClose={() => setPendingModalLead(null)}
        prospectName={pendingModalLead?.name ?? null}
        pipelines={pipelines}
        isLoading={pipelinesLoading}
        isConfirming={syncLead.isPending}
        onConfirm={handleConfirmSaveToCrm}
      />
    </div>
  );
}
