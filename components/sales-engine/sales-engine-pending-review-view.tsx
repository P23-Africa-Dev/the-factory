"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  Filter,
  Layers,
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

  // Filter and search state
  const [searchQuery, setSearchQuery] = useState("");
  const [fitFilter, setFitFilter] = useState<FitFilter>("all");
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<number>>(new Set());

  // Modal state for single lead save
  const [pendingModalLead, setPendingModalLead] = useState<ChatLead | null>(null);

  // Filtered leads calculation
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
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
  }, [leads, searchQuery, fitFilter]);

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
        {/* Navigation & Header */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/sales-engine"
              className="inline-flex items-center gap-2 text-xs font-medium text-slate-600 transition-colors hover:text-[#09232d]"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Sales Engine</span>
            </Link>

            <Link
              href="/crm?source=sales_engine"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-[#09232d] shadow-sm transition-colors hover:border-slate-400 hover:bg-slate-50"
            >
              <Users className="h-4 w-4 text-slate-500" />
              <span>View in CRM Pipeline</span>
            </Link>
          </div>

          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-[#09232d]">
                  Pending Review Leads
                </h1>
                <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-semibold text-[#09232d]">
                  {leads.length} {leads.length === 1 ? "draft" : "drafts"}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Prospective leads discovered by Sales Engine awaiting review. Add qualified candidates directly to your CRM pipeline.
              </p>
            </div>

            {/* ICP Profile Selector */}
            <div className="flex items-center gap-2">
              <label htmlFor="icp-selector" className="text-xs font-medium text-slate-600">
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
                  className="h-9 rounded-xl border border-slate-300 bg-white pl-3 pr-8 text-xs font-medium text-[#09232d] shadow-sm focus:border-[#09232d] focus:outline-none focus:ring-1 focus:ring-[#09232d]"
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
                title="Refresh leads"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
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

        {/* Filter and Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          {/* Search box */}
          <div className="relative min-w-[260px] flex-1 max-sm:min-w-full">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, company, role, location…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-9 text-xs text-[#09232d] placeholder-slate-400 focus:border-[#09232d] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#09232d]"
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
            <span className="mr-1 text-[11px] font-medium text-slate-500">Filter:</span>
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
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  fitFilter === pill.id
                    ? "bg-[#09232d] text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-[#09232d]"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        {/* Batch Selection Bar (shown when leads exist) */}
        {filteredLeads.length > 0 && (
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 shadow-sm">
            <div className="flex items-center gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleSelectAll}
                  className="h-4 w-4 rounded border-slate-300 text-[#09232d] focus:ring-[#09232d]"
                />
                <span>Select all ({filteredLeads.length})</span>
              </label>

              {selectedCount > 0 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-[#09232d]">
                  {selectedCount} selected
                </span>
              )}
            </div>

            {selectedCount > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedLeadIds(new Set())}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >
                  Clear
                </button>
                <button
                  type="button"
                  disabled={syncBatch.isPending || !canSyncToCrm}
                  onClick={handleBatchSaveToCrm}
                  className="flex items-center gap-2 rounded-xl bg-[#09232d] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#0c2e3b] disabled:opacity-60"
                >
                  {syncBatch.isPending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving to CRM…
                    </>
                  ) : (
                    <>
                      <UserCheck className="h-3.5 w-3.5" />
                      Save ({selectedCount}) to CRM
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Loading State */}
        {isLeadsLoading ? (
          <div className="flex min-h-[340px] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <Loader2 className="h-8 w-8 animate-spin text-[#09232d]" />
            <p className="text-sm font-medium text-slate-600">
              Loading prospective leads for {selectedIcpName}…
            </p>
          </div>
        ) : filteredLeads.length === 0 ? (
          /* Empty State */
          <div className="flex min-h-[380px] flex-col items-center justify-center gap-4 rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 border border-emerald-200">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="max-w-md">
              <h3 className="text-lg font-bold text-[#09232d]">
                {leads.length === 0 ? "All caught up! No pending leads" : "No matching leads found"}
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
                {leads.length === 0
                  ? "All prospective leads for this ICP have been reviewed and saved to your CRM, or no new leads have been discovered yet. Return to Sales Engine to generate fresh prospects."
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
                className="rounded-xl bg-[#09232d] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#0c2e3b]"
              >
                Return to Sales Engine
              </Link>
              <Link
                href="/crm?source=sales_engine"
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-[#09232d] shadow-sm transition-colors hover:bg-slate-50"
              >
                View CRM Pipeline
              </Link>
            </div>
          </div>
        ) : (
          /* Cards Grid */
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {filteredLeads.map((lead) => {
              const { overall, search, icp, intent } = leadScoreBreakdown(lead);
              const isSelected = selectedLeadIds.has(lead.id);
              const initials = getInitials(lead.name);

              return (
                <article
                  key={lead.id}
                  className={`flex flex-col justify-between rounded-2xl border bg-white p-5 shadow-sm transition-all hover:shadow-md ${
                    isSelected ? "border-[#09232d] ring-1 ring-[#09232d]" : "border-slate-200"
                  }`}
                >
                  <div className="flex flex-col gap-3">
                    {/* Card Top: Checkbox, Avatar, Name & Score */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectLead(lead.id)}
                          className="mt-1 h-4 w-4 rounded border-slate-300 text-[#09232d] focus:ring-[#09232d]"
                        />

                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 font-bold text-slate-700 border border-slate-200 text-xs">
                          {initials}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h4 className="truncate text-sm font-bold text-[#09232d]" title={lead.name}>
                            {lead.name}
                          </h4>
                          {(lead.title || lead.company) && (
                            <p className="flex items-center gap-1.5 truncate text-xs text-slate-600">
                              <Building2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                              <span className="truncate">
                                {[lead.title, lead.company].filter(Boolean).join(" at ")}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Match Score Badge */}
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold border ${
                          overall >= 80
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : overall >= 60
                              ? "border-amber-200 bg-amber-50 text-amber-800"
                              : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                        title={`Overall priority score: ${overall}%`}
                      >
                        {overall}% Fit
                      </span>
                    </div>

                    {/* Location & Source */}
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      {lead.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-slate-400" />
                          <span>{lead.location}</span>
                        </span>
                      )}
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                        {lead.source}
                      </span>
                    </div>

                    {/* ICP Relevance Note */}
                    {lead.icp_relevance_reason && (
                      <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-[11px] italic leading-relaxed text-slate-600">
                        {lead.icp_relevance_reason}
                      </div>
                    )}

                    {/* AI Research Summary */}
                    {lead.summary && (
                      <p className="line-clamp-2 text-xs leading-relaxed text-slate-600">
                        {lead.summary}
                      </p>
                    )}

                    {/* Contact Channels */}
                    <div className="flex flex-col gap-1.5 border-t border-slate-100 pt-2.5 text-xs">
                      {lead.email && (
                        <a
                          href={`mailto:${lead.email}`}
                          className="flex items-center gap-1.5 truncate font-medium text-emerald-700 hover:underline"
                        >
                          <Mail className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <span className="truncate">{lead.email}</span>
                        </a>
                      )}

                      {lead.phone && (
                        <a
                          href={`tel:${lead.phone}`}
                          className="flex items-center gap-1.5 truncate font-medium text-emerald-700 hover:underline"
                        >
                          <Phone className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                          <span className="truncate">{lead.phone}</span>
                        </a>
                      )}

                      {lead.linkedin_url && (
                        <a
                          href={lead.linkedin_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1.5 font-medium text-sky-700 hover:underline"
                        >
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-sky-600" />
                          <span>View LinkedIn Profile</span>
                        </a>
                      )}

                      {/* Contact Enrichment Tier Pill */}
                      {lead.contact_enrichment_tier && lead.contact_enrichment_tier !== "seed" && (
                        <span className="inline-flex w-fit items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                          {lead.contact_enrichment_tier === "tier1"
                            ? "Web verified"
                            : lead.contact_enrichment_tier === "tier2"
                              ? "Enriched contact"
                              : "Verified direct contact"}
                        </span>
                      )}

                      {!lead.email && !lead.phone && !lead.linkedin_url && (
                        <span className="text-[11px] text-slate-400">No direct contact details found</span>
                      )}
                    </div>
                  </div>

                  {/* Card Action Footer */}
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        const info = [
                          lead.name,
                          [lead.title, lead.company].filter(Boolean).join(" at "),
                          lead.email,
                          lead.phone,
                          lead.linkedin_url,
                        ]
                          .filter(Boolean)
                          .join("\n");
                        navigator.clipboard.writeText(info);
                        toast.success(`Copied details for ${lead.name}`);
                      }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
                      title="Copy prospect contact info"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>

                    <button
                      type="button"
                      disabled={syncLead.isPending || !canSyncToCrm}
                      onClick={() => setPendingModalLead(lead)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#09232d] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#0c2e3b] disabled:opacity-60"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      Save to CRM
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

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
