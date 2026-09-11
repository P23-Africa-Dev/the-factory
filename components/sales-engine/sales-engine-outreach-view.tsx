"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  Eye,
  Grid3X3,
  Inbox,
  LayoutList,
  Loader2,
  Mail,
  MailCheck,
  MessageCircle,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Settings,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  useSalesEngineOutreach,
  useDeleteOutreachActivity,
} from "@/hooks/use-sales-engine-outreach";
import { useOutreachSenderSettings } from "@/hooks/use-sales-engine-outreach-sender";
import {
  fetchOutreachActivity,
  formatRelativeTime,
  normalizeOutreachSubjectBody,
  SalesEngineApiError,
  type OutreachActivity,
} from "@/lib/api/sales-engine";
import { OutreachPreviewModal } from "./outreach-preview-modal";
import { OutreachSettingsModal } from "./outreach-settings-modal";

type OutreachPreviewState = {
  activityId: number | null;
  channel: "email" | "whatsapp";
  subject?: string | null;
  body: string;
  toEmail?: string;
  contextLabel?: string;
};

const DELIVERY_STATUS_CONFIG: Record<
  string,
  { label: string; badgeCls: string; dotCls: string }
> = {
  sent: {
    label: "Sent",
    badgeCls: "bg-slate-100 text-slate-700 border-slate-200/80",
    dotCls: "bg-slate-400",
  },
  delivered: {
    label: "Delivered",
    badgeCls: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    dotCls: "bg-emerald-500",
  },
  opened: {
    label: "Opened",
    badgeCls: "bg-sky-50 text-sky-700 border-sky-200/80",
    dotCls: "bg-sky-500",
  },
  clicked: {
    label: "Clicked",
    badgeCls: "bg-purple-50 text-purple-700 border-purple-200/80",
    dotCls: "bg-purple-500",
  },
  bounced: {
    label: "Bounced",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200/80",
    dotCls: "bg-rose-500",
  },
  dropped: {
    label: "Dropped",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200/80",
    dotCls: "bg-rose-500",
  },
  spam: {
    label: "Marked Spam",
    badgeCls: "bg-rose-50 text-rose-700 border-rose-200/80",
    dotCls: "bg-rose-500",
  },
  unsubscribed: {
    label: "Unsubscribed",
    badgeCls: "bg-amber-50 text-amber-700 border-amber-200/80",
    dotCls: "bg-amber-500",
  },
};

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof SalesEngineApiError && error.message) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .map((p) => p.charAt(0).toUpperCase())
      .slice(0, 2)
      .join("") || "??"
  );
}

export function SalesEngineOutreachView() {
  const { data: items = [], isLoading, isRefetching, refetch } = useSalesEngineOutreach();
  const { data: senderSettings } = useOutreachSenderSettings(true);
  const deleteOutreach = useDeleteOutreachActivity();

  const [preview, setPreview] = useState<OutreachPreviewState | null>(null);
  const [openingId, setOpeningId] = useState<number | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "oldest" | "name_asc" | "name_desc">("newest");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Compute metrics
  const metrics = useMemo(() => {
    const total = items.length;
    const deliveredCount = items.filter(
      (item) =>
        item.delivery_status === "delivered" ||
        item.delivery_status === "opened" ||
        item.delivery_status === "clicked"
    ).length;
    const openedCount = items.filter(
      (item) => item.delivery_status === "opened" || item.delivery_status === "clicked"
    ).length;
    const emailCount = items.filter(
      (item) => item.channel?.toLowerCase() === "email"
    ).length;
    const whatsappCount = items.filter(
      (item) => item.channel?.toLowerCase() === "whatsapp"
    ).length;

    const deliveryRate = total > 0 ? Math.round((deliveredCount / total) * 100) : 0;
    const openRate = total > 0 ? Math.round((openedCount / total) * 100) : 0;

    return {
      total,
      deliveredCount,
      deliveryRate,
      openedCount,
      openRate,
      emailCount,
      whatsappCount,
    };
  }, [items]);

  // Filter items
  const filteredItems = useMemo(() => {
    let result = [...items];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.preview.toLowerCase().includes(q) ||
          item.channel.toLowerCase().includes(q)
      );
    }

    if (channelFilter !== "all") {
      result = result.filter(
        (item) => item.channel?.toLowerCase() === channelFilter.toLowerCase()
      );
    }

    if (statusFilter !== "all") {
      result = result.filter(
        (item) => item.delivery_status?.toLowerCase() === statusFilter.toLowerCase()
      );
    }

    result.sort((a, b) => {
      if (sortBy === "newest") {
        return new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime();
      }
      if (sortBy === "oldest") {
        return new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime();
      }
      if (sortBy === "name_asc") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "name_desc") {
        return b.name.localeCompare(a.name);
      }
      return 0;
    });

    return result;
  }, [items, searchQuery, channelFilter, statusFilter, sortBy]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / itemsPerPage));
  const effectivePage = Math.min(currentPage, totalPages);
  const startIndex = (effectivePage - 1) * itemsPerPage;
  const paginatedItems = filteredItems.slice(startIndex, startIndex + itemsPerPage);

  const handlePageChange = (newPage: number) => {
    setCurrentPage(Math.max(1, Math.min(newPage, totalPages)));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleView = async (item: OutreachActivity) => {
    setOpeningId(item.id);
    try {
      const draft = await fetchOutreachActivity(item.id);
      const normalized = normalizeOutreachSubjectBody(draft.body || item.preview, draft.subject);
      setPreview({
        activityId: draft.activity_id ?? item.id,
        channel: draft.channel === "whatsapp" ? "whatsapp" : "email",
        subject: normalized.subject,
        body: normalized.body,
        toEmail: draft.to_email ?? "",
        contextLabel: item.name,
      });
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not open outreach draft."));
    } finally {
      setOpeningId(null);
    }
  };

  const handleDelete = (item: OutreachActivity) => {
    if (!window.confirm(`Are you sure you want to delete outreach for ${item.name}?`)) {
      return;
    }
    deleteOutreach.mutate(item.id, {
      onSuccess: () => {
        if (preview?.activityId === item.id) setPreview(null);
        toast.success(`Removed outreach for ${item.name}.`);
      },
      onError: (error) =>
        toast.error(getApiErrorMessage(error, "Could not delete outreach activity.")),
    });
  };

  const handleCopyPreview = async (item: OutreachActivity) => {
    try {
      await navigator.clipboard.writeText(item.preview);
      setCopiedId(item.id);
      toast.success("Outreach snippet copied to clipboard");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast.error("Failed to copy snippet");
    }
  };

  const hasActiveFilters =
    Boolean(searchQuery) || channelFilter !== "all" || statusFilter !== "all";

  const clearFilters = () => {
    setSearchQuery("");
    setChannelFilter("all");
    setStatusFilter("all");
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen bg-slate-50/50 pb-24 text-slate-800 antialiased selection:bg-slate-200">
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        {/* Header & Breadcrumbs */}
        <header className="mb-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Link
                href="/sales-engine"
                className="group inline-flex items-center gap-1.5 font-medium text-slate-600 transition hover:text-[#09232d]"
              >
                <ArrowLeft size={13} className="transition-transform group-hover:-translate-x-0.5" />
                <span>Sales Engine</span>
              </Link>
              <span className="text-slate-300">/</span>
              <span className="font-semibold text-slate-900">All Outreach</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900"
                title="Sender domain and mailbox settings"
              >
                <Settings size={14} className="text-slate-500" />
                <span>Sender Settings</span>
              </button>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isRefetching}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
                title="Refresh outreach activities"
              >
                <RefreshCw size={13} className={`text-slate-500 ${isRefetching ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
                  Outreach Activities
                </h1>
                <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                  {items.length} records
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Review, personalize, and dispatch AI-generated sales outreach across email and WhatsApp.
              </p>
            </div>

            {/* Sender Domain Status Badge */}
            {senderSettings && (
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs shadow-sm">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                <span className="text-slate-500">Sending Domain:</span>
                <span className="font-semibold text-slate-900">
                  {senderSettings.sender_mode === "organization" &&
                  senderSettings.org_connection_status === "verified" &&
                  senderSettings.org_verified_domain
                    ? senderSettings.org_verified_domain
                    : "The Factory Platform"}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Metric Cards */}
        <section className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Total Outreaches Card */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:border-slate-300 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Total Outreach
              </span>
              <div className="grid size-9 place-items-center rounded-xl bg-slate-100 text-slate-700">
                <Send size={16} />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-slate-900">{metrics.total}</span>
              <span className="text-xs font-medium text-slate-500">dispatches</span>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              <span className="flex items-center gap-1 font-medium text-emerald-600">
                <TrendingUp size={13} /> Active pipeline
              </span>
              <span>All time</span>
            </div>
          </div>

          {/* Delivery Card */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:border-slate-300 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Delivered Rate
              </span>
              <div className="grid size-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700">
                <MailCheck size={16} />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-slate-900">{metrics.deliveredCount}</span>
              <span className="inline-flex items-center rounded-md bg-emerald-50 px-1.5 py-0.5 text-xs font-bold text-emerald-700">
                {metrics.deliveryRate}% rate
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                style={{ width: `${Math.min(metrics.deliveryRate, 100)}%` }}
              />
            </div>
            <div className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span>Confirmed by recipient MTA</span>
            </div>
          </div>

          {/* Engagement Card */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:border-slate-300 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Engagement (Opened)
              </span>
              <div className="grid size-9 place-items-center rounded-xl bg-sky-50 text-sky-700">
                <Eye size={16} />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold tracking-tight text-slate-900">{metrics.openedCount}</span>
              <span className="inline-flex items-center rounded-md bg-sky-50 px-1.5 py-0.5 text-xs font-bold text-sky-700">
                {metrics.openRate}% open rate
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-sky-500 transition-all duration-500"
                style={{ width: `${Math.min(metrics.openRate, 100)}%` }}
              />
            </div>
            <div className="mt-3 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              <span className="size-1.5 rounded-full bg-sky-500" />
              <span>Prospects interacted with message</span>
            </div>
          </div>

          {/* Channels Card */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition hover:border-slate-300 hover:shadow-md">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Active Channels
              </span>
              <div className="grid size-9 place-items-center rounded-xl bg-purple-50 text-purple-700">
                <MessageSquare size={16} />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex flex-1 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                <Mail size={13} className="text-sky-600" />
                <span>{metrics.emailCount} Email</span>
              </div>
              <div className="flex flex-1 items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700">
                <MessageCircle size={13} className="text-emerald-600" />
                <span>{metrics.whatsappCount} WhatsApp</span>
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[11px] text-slate-500">
              <span>Multi-channel routing</span>
              <span className="font-semibold text-slate-700">Enabled</span>
            </div>
          </div>
        </section>

        {/* Toolbar: Search, Filter Tabs & Layout Switcher */}
        <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-sm">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            {/* Search Input */}
            <div className="relative flex-1 min-w-[280px]">
              <Search
                size={15}
                className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                placeholder="Search by prospect name, message content, channel..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-9 text-xs text-slate-900 placeholder-slate-400 outline-none transition focus:border-[#09232d] focus:bg-white focus:ring-1 focus:ring-[#09232d]"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filter Controls Row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Channel Filter Tabs */}
              <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setChannelFilter("all");
                    setCurrentPage(1);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    channelFilter === "all"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <span>All</span>
                  <span className="rounded-md bg-slate-200/60 px-1 text-[10px] text-slate-700">
                    {items.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChannelFilter("email");
                    setCurrentPage(1);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    channelFilter === "email"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <Mail size={12} className="text-sky-600" />
                  <span>Email</span>
                  <span className="rounded-md bg-slate-200/60 px-1 text-[10px] text-slate-700">
                    {metrics.emailCount}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setChannelFilter("whatsapp");
                    setCurrentPage(1);
                  }}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                    channelFilter === "whatsapp"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  <MessageCircle size={12} className="text-emerald-600" />
                  <span>WhatsApp</span>
                  <span className="rounded-md bg-slate-200/60 px-1 text-[10px] text-slate-700">
                    {metrics.whatsappCount}
                  </span>
                </button>
              </div>

              {/* Status Filter */}
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-[#09232d]"
                >
                  <option value="all">All Statuses</option>
                  <option value="sent">Sent</option>
                  <option value="delivered">Delivered</option>
                  <option value="opened">Opened</option>
                  <option value="clicked">Clicked</option>
                  <option value="bounced">Bounced</option>
                </select>
              </div>

              {/* Sort By Dropdown */}
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm outline-none transition hover:border-slate-300 focus:border-[#09232d]"
                >
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="name_asc">Prospect A → Z</option>
                  <option value="name_desc">Prospect Z → A</option>
                </select>
              </div>

              {/* View Switcher */}
              <div className="flex items-center rounded-xl border border-slate-200 bg-slate-100 p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  className={`grid size-7 place-items-center rounded-lg transition ${
                    viewMode === "grid"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                  title="Grid card view"
                >
                  <Grid3X3 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("table")}
                  className={`grid size-7 place-items-center rounded-lg transition ${
                    viewMode === "table"
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                  title="Table list view"
                >
                  <LayoutList size={15} />
                </button>
              </div>

              {/* Reset Filter Button */}
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="flex items-center gap-1 rounded-xl border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                >
                  <X size={13} />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Content Section */}
        {isLoading ? (
          <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <Loader2 size={28} className="animate-spin text-[#09232d]" />
            <p className="text-xs font-semibold text-slate-600">Fetching outreach records…</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
            <div className="grid size-16 place-items-center rounded-2xl bg-slate-100 text-slate-400">
              <Inbox size={32} />
            </div>
            <h3 className="mt-4 text-base font-bold text-slate-900">No outreach activities match</h3>
            <p className="mt-1.5 max-w-sm text-xs text-slate-500 leading-relaxed">
              {hasActiveFilters
                ? "No records found matching your active filters. Try searching for another prospect or clearing the active filters."
                : "You haven't generated any outreach drafts yet. Navigate to Sales Engine to start discovering prospects and generating customized messaging."}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-slate-900"
              >
                Clear all filters
              </button>
            ) : (
              <Link
                href="/sales-engine"
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#09232d] px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#133e4f]"
              >
                <span>Go to Sales Engine</span>
                <ArrowLeft size={13} className="rotate-180" />
              </Link>
            )}
          </div>
        ) : viewMode === "grid" ? (
          /* Modern Card Grid */
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {paginatedItems.map((item) => {
              const statusCfg = item.delivery_status
                ? DELIVERY_STATUS_CONFIG[item.delivery_status]
                : null;
              const isEmail = item.channel?.toLowerCase() === "email";
              const isBusyOpening = openingId === item.id;
              const isDeleting =
                deleteOutreach.isPending && deleteOutreach.variables === item.id;
              const normalized = normalizeOutreachSubjectBody(item.preview);

              return (
                <article
                  key={item.id}
                  className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.03),0_6px_16px_-4px_rgba(0,0,0,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-[0_12px_28px_-6px_rgba(0,0,0,0.08),0_4px_12px_-2px_rgba(0,0,0,0.03)]"
                >
                  <div>
                    {/* Header: Avatar, Name, Channel, and Delivery Status */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white font-semibold text-xs shadow-sm ring-4 ring-slate-50">
                          <span>{getInitials(item.name)}</span>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full text-white ring-2 ring-white ${
                              isEmail ? "bg-sky-500" : "bg-emerald-500"
                            }`}
                            title={item.channel}
                          >
                            {isEmail ? <Mail size={9} /> : <MessageCircle size={9} />}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <h2 className="truncate text-sm font-semibold text-slate-900 group-hover:text-slate-950 transition-colors">
                            {item.name}
                          </h2>
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                            <span className="font-medium text-slate-500 capitalize">{item.channel}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock size={11} className="text-slate-400" />
                              {formatRelativeTime(item.occurred_at)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Status badge */}
                      {statusCfg && (
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium tracking-wide shrink-0 ${statusCfg.badgeCls}`}
                          title={item.bounce_reason ?? undefined}
                        >
                          <span className={`size-1.5 rounded-full ${statusCfg.dotCls}`} />
                          {statusCfg.label}
                        </span>
                      )}
                    </div>

                    {/* Message Preview Box - Clean & Modern */}
                    <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 text-xs transition group-hover:bg-slate-50">
                      {normalized.subject ? (
                        <div className="mb-1.5 flex items-baseline gap-1.5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 shrink-0">
                            Subject
                          </span>
                          <p className="truncate font-semibold text-slate-800 text-xs">
                            {normalized.subject}
                          </p>
                        </div>
                      ) : null}
                      <p className="line-clamp-3 text-xs leading-relaxed text-slate-600 font-normal">
                        {normalized.body || item.preview}
                      </p>
                    </div>

                    {item.bounce_reason && (
                      <p className="mt-2 text-[11px] font-medium text-rose-600">
                        Reason: {item.bounce_reason}
                      </p>
                    )}
                  </div>

                  {/* Card Action Footer */}
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => handleView(item)}
                      disabled={isBusyOpening}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#09232d] px-3.5 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#153e4e] active:scale-95 disabled:opacity-50"
                    >
                      {isBusyOpening ? (
                        <Loader2 size={13} className="animate-spin" />
                      ) : (
                        <Eye size={13} />
                      )}
                      <span>Review & Send</span>
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleCopyPreview(item)}
                        className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        title="Copy message preview"
                      >
                        {copiedId === item.id ? (
                          <Check size={14} className="text-emerald-600" />
                        ) : (
                          <Copy size={14} />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        disabled={isDeleting}
                        className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                        title="Delete outreach"
                      >
                        {isDeleting ? (
                          <Loader2 size={14} className="animate-spin text-rose-600" />
                        ) : (
                          <Trash2 size={14} />
                        )}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          /* Table View - Modern Clean Data Grid */
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-700">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-4 py-3.5">Prospect</th>
                    <th className="px-4 py-3.5">Channel</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Message Snippet</th>
                    <th className="px-4 py-3.5">Dispatched</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedItems.map((item) => {
                    const statusCfg = item.delivery_status
                      ? DELIVERY_STATUS_CONFIG[item.delivery_status]
                      : null;
                    const isEmail = item.channel?.toLowerCase() === "email";
                    const isBusyOpening = openingId === item.id;
                    const isDeleting =
                      deleteOutreach.isPending && deleteOutreach.variables === item.id;
                    const normalized = normalizeOutreachSubjectBody(item.preview);

                    return (
                      <tr
                        key={item.id}
                        className="transition hover:bg-slate-50/80"
                      >
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="grid size-7 shrink-0 place-items-center rounded-full bg-slate-900 font-bold text-white text-[10px]">
                              {getInitials(item.name)}
                            </div>
                            <span className="font-semibold text-slate-900">{item.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            {isEmail ? (
                              <Mail size={11} className="text-sky-600" />
                            ) : (
                              <MessageCircle size={11} className="text-emerald-600" />
                            )}
                            <span className="capitalize">{item.channel}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          {statusCfg ? (
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${statusCfg.badgeCls}`}
                              title={item.bounce_reason ?? undefined}
                            >
                              <span className={`size-1.5 rounded-full ${statusCfg.dotCls}`} />
                              {statusCfg.label}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="max-w-[340px] px-4 py-3.5">
                          <p className="truncate text-slate-600 font-normal text-xs">
                            {normalized.subject ? `[${normalized.subject}] ` : ""}
                            {normalized.body || item.preview}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap text-slate-500">
                          {formatRelativeTime(item.occurred_at)}
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleView(item)}
                              disabled={isBusyOpening}
                              className="inline-flex items-center gap-1 rounded-lg bg-[#09232d] px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:bg-[#153e4e] active:scale-95 disabled:opacity-50"
                            >
                              {isBusyOpening ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Eye size={12} />
                              )}
                              <span>Open</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyPreview(item)}
                              className="grid size-7 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                              title="Copy snippet"
                            >
                              {copiedId === item.id ? (
                                <Check size={13} className="text-emerald-600" />
                              ) : (
                                <Copy size={13} />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              disabled={isDeleting}
                              className="grid size-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                              title="Delete outreach"
                            >
                              {isDeleting ? (
                                <Loader2 size={13} className="animate-spin text-rose-600" />
                              ) : (
                                <Trash2 size={13} />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination Footer */}
        {filteredItems.length > 0 && (
          <footer className="mt-8 flex flex-col items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-3.5 shadow-sm sm:flex-row">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span>
                Showing <strong className="font-semibold text-slate-900">{startIndex + 1}</strong> to{" "}
                <strong className="font-semibold text-slate-900">
                  {Math.min(startIndex + itemsPerPage, filteredItems.length)}
                </strong>{" "}
                of <strong className="font-semibold text-slate-900">{filteredItems.length}</strong> record
                {filteredItems.length === 1 ? "" : "s"}
              </span>

              <div className="hidden sm:flex items-center gap-1.5 border-l border-slate-200 pl-3">
                <span>Per page:</span>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs text-slate-700 outline-none hover:bg-white focus:border-[#09232d]"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            {/* Page Buttons */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handlePageChange(effectivePage - 1)}
                disabled={effectivePage <= 1}
                className="grid size-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30"
                title="Previous page"
              >
                <ChevronLeft size={14} />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => {
                  if (totalPages <= 7) return true;
                  if (p === 1 || p === totalPages) return true;
                  return Math.abs(p - effectivePage) <= 1;
                })
                .map((pageNumber, idx, arr) => {
                  const prev = arr[idx - 1];
                  const hasGap = prev && pageNumber - prev > 1;

                  return (
                    <div key={pageNumber} className="flex items-center">
                      {hasGap && <span className="px-1 text-slate-400">…</span>}
                      <button
                        type="button"
                        onClick={() => handlePageChange(pageNumber)}
                        className={`grid size-8 place-items-center rounded-lg text-xs font-semibold transition ${
                          pageNumber === effectivePage
                            ? "bg-[#09232d] text-white shadow-sm"
                            : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                        }`}
                      >
                        {pageNumber}
                      </button>
                    </div>
                  );
                })}

              <button
                type="button"
                onClick={() => handlePageChange(effectivePage + 1)}
                disabled={effectivePage >= totalPages}
                className="grid size-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-30"
                title="Next page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </footer>
        )}
      </div>

      {/* Modals */}
      <OutreachPreviewModal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        activityId={preview?.activityId ?? null}
        channel={preview?.channel ?? "email"}
        initialSubject={preview?.subject}
        initialBody={preview?.body ?? ""}
        initialToEmail={preview?.toEmail}
        contextLabel={preview?.contextLabel}
        onSent={() => {
          toast.success("Outreach dispatched successfully.");
          setPreview(null);
          refetch();
        }}
        onConfigureSender={() => setIsSettingsOpen(true)}
      />

      <OutreachSettingsModal
        open={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
