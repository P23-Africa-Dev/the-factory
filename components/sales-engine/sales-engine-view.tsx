"use client";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { ProcessingPanel } from "./processing-panel";
import { IcpBuilderModal } from "./icp-builder-modal";
import { SocialScanPanel } from "./social-scan-panel";
import {
  SocialOpportunityEmptyState,
  SocialSignalsEmptyState,
} from "./social-listening-empty-states";
import {
  SocialOpportunityDetailSkeleton,
  SocialSignalsTableSkeleton,
} from "./social-scan-skeletons";
import { ChatMessageBody } from "./chat-message-body";
import { SearchableSelect, type SelectOption } from "@/components/ui/searchable-select";
import { useActivateIcpProfile, useActiveIcpProfile, useIcpProfiles } from "@/hooks/use-sales-engine-icp";
import { useSyncLeadToCrm, useSyncLeadsBatchToCrm } from "@/hooks/use-sync-leads-to-crm";
import { useFactory23IntegrationStatus } from "@/hooks/use-factory23-integration-status";
import { usePendingChatDiscovery } from "@/hooks/use-pending-chat-discovery";
import {
  isForegroundChatWaiting,
  isMissingActiveIcp,
  mapApiMessagesToUi,
  useChatHistory,
  useClearChatHistory,
  useSendChatMessage,
} from "@/hooks/use-sales-engine-chat";
import { useSalesEngineMetrics } from "@/hooks/use-sales-engine-metrics";
import { useSalesEngineOutreach } from "@/hooks/use-sales-engine-outreach";
import {
  useCreateSignalOutreach,
  useDismissSignal,
  useSetSignalReminder,
  useSocialListeningBootstrap,
  useSocialListeningSignals,
  useSyncSignalToCrm,
  useTriggerSocialListeningRun,
} from "@/hooks/use-sales-engine-social-listening";
import { getSocialListeningEmptyState } from "@/lib/social-listening-empty-state";
import {
  useSocialListeningSettings,
  useUpdateSocialListeningSettings,
} from "@/hooks/use-sales-engine-social-settings";
import {
  useOutreachSenderSettings,
  useUpdateOutreachSenderSettings,
} from "@/hooks/use-sales-engine-outreach-sender";
import { getApiErrorMessage } from "@/lib/api/errors";
import {
  hasMixedIcpRecommendations,
  icpBadgeLabel,
  showIcpAdvisoryBanner,
} from "@/lib/icp-advisory-leads";
import {
  formatRelativeTime,
  type ChatIntent,
  type ChatLead,
  type SocialListeningSettings,
  type SocialSignalApi,
} from "@/lib/api/sales-engine";
import {
  Check,
  ChevronDown,
  CircleCheck,
  Clock,
  Copy,
  Expand,
  Globe2,
  Lightbulb,
  Loader2,
  MessageCircle,
  Minimize2,
  MoreVertical,
  Plus,
  Scan,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  User,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";

type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  body: string;
  intent?: ChatIntent;
  leads?: ChatLead[];
  meta?: Record<string, unknown> | null;
};

type ActionIntent = Exclude<ChatIntent, "freeform">;
type SalesEngineTab = "smart-lead" | "social-listening";
type SocialSignal = SocialSignalApi;

type SocialStatCard = {
  title: string;
  value: string;
  percent: string;
  unit: string;
  active?: boolean;
};

const INTENT_PLACEHOLDERS: Record<ChatIntent, string> = {
  freeform: "Ask or search anything",
  quick_research: "Research market trends, competitors, or industry signals…",
  generate_leads: "Who are the top business prospects in your target market?",
  create_outreach: "Draft a follow-up email or WhatsApp message for…",
};

const INTENT_MODE_CONFIG: Record<
  ActionIntent,
  { label: string; tint: string; chipTint: string; icon: ReactNode }
> = {
  quick_research: {
    label: "Quick Research",
    tint: "bg-[#fffbdc]",
    chipTint: "bg-[#fff4a8] text-[#09232d]",
    icon: <Globe2 size={12} className="shrink-0" />,
  },
  generate_leads: {
    label: "Generate New Leads",
    tint: "bg-[#e4faff]",
    chipTint: "bg-[#c8f0ff] text-[#09232d]",
    icon: <UsersRound size={12} className="shrink-0" />,
  },
  create_outreach: {
    label: "Create Outreach",
    tint: "bg-[#f2ffe9]",
    chipTint: "bg-[#dfffc8] text-[#09232d]",
    icon: <Lightbulb size={12} className="shrink-0" />,
  },
};

const weekDays = ["Mon", "Tues", "Weds", "Thurs", "Fri", "Sat"];
const salesEngineTabs: Array<{ id: SalesEngineTab; label: string }> = [
  { id: "smart-lead", label: "Smart Lead" },
  { id: "social-listening", label: "Social Listening" },
];

const SOURCE_SETTING_OPTIONS = [
  { key: "linkedin_public", label: "LinkedIn public index" },
  { key: "x_mentions", label: "X/Twitter mentions" },
  { key: "reddit", label: "Reddit communities" },
  { key: "meta_pages", label: "Meta business pages" },
] as const;

const INTENT_SETTING_OPTIONS = [
  { key: "recommendation", label: "Recommendations" },
  { key: "switching", label: "Switching" },
  { key: "pricing", label: "Pricing questions" },
  { key: "hiring_expansion", label: "Hiring or expansion" },
] as const;

const sourceFilterOptions: SelectOption[] = [
  { value: "all", label: "All Sources" },
  { value: "LinkedIn Post", label: "LinkedIn Post" },
  { value: "X/Twitter Post", label: "X/Twitter Post" },
  { value: "Reddit Post", label: "Reddit Post" },
];

const signalTypeFilterOptions: SelectOption[] = [
  { value: "all", label: "All Signal Type" },
  { value: "Recommendation", label: "Recommendation" },
  { value: "Switching", label: "Switching" },
  { value: "Price", label: "Price" },
];

const intentFilterOptions: SelectOption[] = [
  { value: "all", label: "All Intent" },
  { value: "Consideration", label: "Consideration" },
  { value: "Vendor Evaluation", label: "Vendor Evaluation" },
  { value: "Research", label: "Research" },
];

const initialMessages: ChatMessage[] = [
  {
    id: 1,
    role: "assistant",
    body:
      "Welcome to Sales Engine.\n\nI'm your AI-powered assistant built to help you discover high-quality leads, craft personalized outreach messages, and develop smart follow-up strategies that improve response rates.\n\nWhether you're looking to identify companies in a specific industry, refine your targeting, write compelling sales emails, or understand why certain leads aren't responding, I'm here to guide you through the process step by step.\n\nYou can ask me to generate new leads, analyze your outreach performance, suggest improvements, or create follow-up messages based on engagement activity. The more details you provide about your target audience, location, or offer, the more precise and effective my recommendations will be.\n\nLet's start building smarter outreach.\n\nWhat would you like to work on today?",
  },
];

function MetricCard({
  title,
  value,
  percent,
  active = false,
  unit = "Leads",
  isScanning = false,
}: {
  title: string;
  value: string;
  percent: string;
  active?: boolean;
  unit?: string;
  isScanning?: boolean;
}) {
  return (
    <section
      className={`relative h-[126px] overflow-hidden rounded-[15px] border border-[rgba(179,179,179,0.2)] px-5 py-3 shadow-[0_1px_3px_1px_rgba(0,0,0,0.15),0_1px_2px_rgba(0,0,0,0.3)] ${
        active ? "bg-[#0b242e] text-white" : "bg-white text-[#0b242e]"
      } ${isScanning ? "ring-1 ring-[#16b37d]/30" : ""}`}
    >
      <div className="flex items-start justify-between">
        <p className={`text-[14px] font-light leading-[19px] ${active ? "text-white" : "text-[#293e46]"}`}>
          {title}
        </p>
        {/* <MoreVertical size={15} className={active ? "text-white/45" : "text-[#09232d]/40"} /> */}
      </div>

      <div className="absolute left-5 top-[48px]">
        <div className="flex items-end gap-1">
          <p className="text-[32px] font-semibold leading-[43px]">{value}</p>
          <p className={`pb-2 text-[9px] font-semibold ${active ? "text-white" : "text-[#0b242e]"}`}>
            {unit}
          </p>
        </div>
        <p className={`mt-[-4px] text-[8px] leading-[16px] ${active ? "text-[#c8c8c8]" : "text-[#34373c]"}`}>
          {isScanning ? "Scan in progress…" : `${percent}% increase this week`}
        </p>
      </div>

      <div className="absolute right-[17px] top-[19px] grid size-[108px] place-items-center">
        <div
          className={`absolute size-[84px] rounded-full border-[7px] ${
            active ? "border-[#3E7210]" : "border-[#ff604c]"
          } border-l-transparent rotate-[-24deg] ${isScanning ? "sales-gauge-spin" : ""}`}
        />
        <div className={`absolute size-[49px] rounded-full ${active ? "bg-[#14343e]" : "bg-[#f9f9f9]"}`} />
        <p className={`relative text-[8px] font-semibold ${active ? "text-[#c8c8c8]" : "text-[#34373c]"}`}>
          {isScanning ? "…" : `${percent}%`}
        </p>
      </div>
    </section>
  );
}

function TrendChart() {
  return (
    <section className="relative h-[126px] min-w-[420px] flex-1 overflow-visible px-1 pt-1 max-lg:min-w-0">
      <div className="grid grid-cols-6 text-[13px] font-medium text-[#09232d]/50">
        {weekDays.map((day) => (
          <span key={day} className="text-center">
            {day}
          </span>
        ))}
      </div>
      <div className="relative mt-4 h-[92px]">
        <div className="absolute inset-x-5 top-0 bottom-2 grid grid-cols-6">
          {weekDays.map((day, index) => (
            <div key={day} className="relative">
              <span
                className={`absolute left-1/2 top-0 h-full border-l border-dashed ${
                  index === 4 ? "border-[#fd6046]" : "border-[#6b9bb0]"
                }`}
              />
            </div>
          ))}
        </div>
        <svg viewBox="0 0 430 112" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id="sales-trend-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#fd6046" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#fd6046" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 54 C8 42 18 42 27 53 C37 64 45 38 56 51 C69 64 79 34 92 47 C105 58 118 42 130 45 C145 49 154 23 167 34 C181 47 192 20 207 31 C221 42 226 68 239 76 C254 93 270 68 284 76 C297 84 309 67 323 73 C337 79 348 54 362 68 C379 84 394 77 410 83 C421 87 427 81 430 84"
            fill="none"
            stroke="#fd6046"
            strokeLinecap="round"
            strokeWidth="2"
          />
          <path
            d="M0 54 C8 42 18 42 27 53 C37 64 45 38 56 51 C69 64 79 34 92 47 C105 58 118 42 130 45 C145 49 154 23 167 34 C181 47 192 20 207 31 C221 42 226 68 239 76 C254 93 270 68 284 76 C297 84 309 67 323 73 C337 79 348 54 362 68 C379 84 394 77 410 83 C421 87 427 81 430 84 L430 112 L0 112 Z"
            fill="url(#sales-trend-fill)"
          />
          <path d="M318 83 H382" stroke="#fd6046" strokeDasharray="6 6" strokeLinecap="round" />
        </svg>
        <div className="absolute right-4 top-[18px] flex h-5 items-center gap-1 rounded-[12px] border border-[#e4e4e9] bg-white px-2.5 shadow-[0_12px_17px_rgba(11,36,46,0.15)]">
          <span className="text-[11px] font-medium text-[#fd6046]">+27%</span>
          <span className="text-[10px] text-[#09232d]/70">Performance higher this week</span>
        </div>
      </div>
    </section>
  );
}

function IntentModeChip({
  intent,
  onClear,
  compact = false,
}: {
  intent: ActionIntent;
  onClear?: () => void;
  compact?: boolean;
}) {
  const mode = INTENT_MODE_CONFIG[intent];

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full font-semibold ${mode.chipTint} ${
        compact ? "px-2 py-0.5 text-[8px]" : "px-2.5 py-1 text-[9px]"
      }`}
    >
      {mode.icon}
      <span className="truncate">{mode.label}</span>
      {onClear && (
        <button
          type="button"
          aria-label={`Clear ${mode.label} mode`}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClear();
          }}
          className="ml-0.5 grid size-4 shrink-0 place-items-center rounded-full transition hover:bg-black/10"
        >
          <X size={10} />
        </button>
      )}
    </span>
  );
}

function PromptButton({
  icon,
  label,
  tint,
  active = false,
  onSelect,
  disabled = false,
}: {
  icon: ReactNode;
  label: string;
  tint: string;
  active?: boolean;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect();
      }}
      disabled={disabled}
      aria-pressed={active}
      className={`flex h-[32px] items-center gap-2 rounded-[18px] border px-4 text-[9px] font-medium text-[#09232d] shadow-[0_1px_2px_rgba(0,0,0,0.18)] disabled:cursor-not-allowed disabled:opacity-50 ${tint} ${
        active ? "border-[#09232d] ring-2 ring-[#09232d]/20" : "border-black/10"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function LeadInlineResults({
  leads,
  onLeadsChange,
}: {
  leads: ChatLead[];
  onLeadsChange?: (leads: ChatLead[]) => void;
}) {
  const syncLead = useSyncLeadToCrm();
  const syncBatch = useSyncLeadsBatchToCrm();
  const { data: integrationStatus } = useFactory23IntegrationStatus();
  const canSyncToCrm = integrationStatus?.can_sync ?? true;
  const crmBlockMessage =
    integrationStatus?.block_message ??
    "CRM sync is unavailable. Sign out and sign back in to link Factory23, or contact your admin.";
  const unsavedIds = leads.filter((lead) => !lead.crm_synced && lead.save_status !== "saved").map((lead) => lead.id);

  function markSynced(ids: number[]) {
    onLeadsChange?.(
      leads.map((lead) =>
        ids.includes(lead.id)
          ? { ...lead, crm_synced: true, save_status: "saved" as const }
          : lead
      )
    );
  }

  const showAdvisoryBanner = showIcpAdvisoryBanner(leads);
  const mixedRecommendations = hasMixedIcpRecommendations(leads);

  return (
    <div className="mt-3 max-w-[640px]">
      {!canSyncToCrm && (
        <p className="mb-2 rounded-[12px] bg-[#fef2f2] px-3 py-2 text-[8px] leading-[11px] text-[#991b1b]">
          {crmBlockMessage}
        </p>
      )}
      {showAdvisoryBanner && (
        <p className="mb-2 rounded-[12px] bg-[#fff7ed] px-3 py-2 text-[8px] leading-[11px] text-[#92400e]">
          {mixedRecommendations
            ? "These answer your search. Leads marked ICP match align with your profile; Outside ICP leads still match what you asked for."
            : "These answer your search but may fall outside your ICP. You can still review and save any lead below."}
        </p>
      )}
      {unsavedIds.length > 0 && (
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[9px] font-medium text-[#616263]">
            Review leads below. Save the ones you want in CRM.
          </p>
          <button
            type="button"
            disabled={syncBatch.isPending || !canSyncToCrm}
            title={!canSyncToCrm ? crmBlockMessage : undefined}
            onClick={() => {
              syncBatch.mutate(unsavedIds, {
                onSuccess: (result) => {
                  const syncedIds = result.synced.map((item) => item.lead_id);
                  markSynced(syncedIds);
                  toast.success(`Saved ${syncedIds.length} lead${syncedIds.length === 1 ? "" : "s"} to CRM.`);
                  if (result.errors.length > 0) {
                    toast.error(result.errors[0]);
                  }
                },
                onError: (error) =>
                  toast.error(getApiErrorMessage(error, "Could not save leads to CRM.")),
              });
            }}
            className="shrink-0 rounded-full bg-[#09232d] px-3 py-1 text-[8px] font-semibold text-white disabled:opacity-60"
          >
            {syncBatch.isPending ? "Saving…" : "Save all"}
          </button>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        {leads.map((lead) => {
          const isSynced = lead.crm_synced || lead.save_status === "saved";
          const badge = icpBadgeLabel(lead);

          return (
            <div
              key={lead.id ?? lead.name}
              className="rounded-[14px] border border-[#09232d]/10 bg-white px-3 py-2 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[10px] font-bold text-[#09232d]">{lead.name}</p>
                <span className="shrink-0 rounded-full bg-[#16b37d]/10 px-1.5 py-0.5 text-[8px] font-bold text-[#087652]">
                  {lead.score}
                </span>
              </div>
              {badge && (
                <span
                  className={`mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[7px] font-semibold ${
                    badge === "ICP match"
                      ? "bg-[#16b37d]/10 text-[#087652]"
                      : "bg-[#fef3c7] text-[#92400e]"
                  }`}
                >
                  {badge}
                </span>
              )}
              <p className="mt-1 text-[8px] text-[#09232d]/50">{lead.source}</p>
              {(lead.title || lead.company) && (
                <p className="mt-1 text-[8px] font-medium text-[#09232d]/70">
                  {[lead.title, lead.company].filter(Boolean).join(" at ")}
                </p>
              )}
              {lead.location && (
                <p className="mt-0.5 text-[8px] text-[#09232d]/55">{lead.location}</p>
              )}
              {lead.profile_urls && lead.profile_urls.length > 0 && (
                <a
                  href={lead.profile_urls[0]}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block truncate text-[8px] font-medium text-[#087652] underline"
                >
                  View profile
                </a>
              )}
              <p className="mt-1 line-clamp-2 text-[8px] leading-[10px] text-[#09232d]/65">{lead.summary}</p>
              {lead.low_confidence && (
                <p className="mt-1 text-[7px] font-medium text-[#b45309]">Lower confidence match</p>
              )}
              <div className="mt-2">
                {isSynced ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#16b37d]/10 px-2 py-0.5 text-[8px] font-semibold text-[#087652]">
                    <CircleCheck size={10} />
                    In CRM
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={syncLead.isPending || !canSyncToCrm}
                    title={!canSyncToCrm ? crmBlockMessage : undefined}
                    onClick={() => {
                      syncLead.mutate(lead.id, {
                        onSuccess: () => {
                          markSynced([lead.id]);
                          toast.success(`Saved "${lead.name}" to CRM.`);
                        },
                        onError: (error) =>
                          toast.error(getApiErrorMessage(error, "Could not save lead to CRM.")),
                      });
                    }}
                    className="rounded-full border border-[#09232d]/15 px-2.5 py-0.5 text-[8px] font-semibold text-[#09232d] hover:bg-[#09232d]/5 disabled:opacity-60"
                  >
                    Save to CRM
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChatWorkspace({
  expanded,
  onToggleExpanded,
  onOpenIcpBuilder,
}: {
  expanded: boolean;
  onToggleExpanded: () => void;
  onOpenIcpBuilder: () => void;
}) {
  const { data: activeProfile } = useActiveIcpProfile();
  const activeIcpId = activeProfile?.id;
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [selectedIntent, setSelectedIntent] = useState<ChatIntent>("freeform");
  const [isIcpMenuOpen, setIsIcpMenuOpen] = useState(false);
  const [icpMenuPosition, setIcpMenuPosition] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const transcriptRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nextMessageIdRef = useRef(2);
  function nextMessageId() {
    return nextMessageIdRef.current++;
  }
  const [backgroundRunIds, setBackgroundRunIds] = useState<Set<number>>(new Set());
  const icpMenuRef = useRef<HTMLDivElement>(null);
  const icpTriggerRef = useRef<HTMLButtonElement>(null);

  const { data: icpProfiles = [], isLoading: isIcpProfilesLoading } = useIcpProfiles();
  const { data: chatHistory, isLoading: isHistoryLoading } = useChatHistory(activeIcpId);
  const clearChatHistory = useClearChatHistory(activeIcpId);

  const activateIcpProfile = useActivateIcpProfile({
    onSuccess: (profile) => toast.success(`Switched active ICP to "${profile.name}"`),
    onError: (error) => toast.error(getApiErrorMessage(error, "Failed to switch ICP build.")),
  });

  useEffect(() => {
    if (!activeIcpId || isHistoryLoading) return;

    if (!chatHistory || chatHistory.messages.length === 0) {
      setMessages(initialMessages);
      nextMessageIdRef.current = 2;

      return;
    }

    setMessages(mapApiMessagesToUi(chatHistory.messages));
    nextMessageIdRef.current = chatHistory.messages.length + 2;
  }, [activeIcpId, chatHistory, isHistoryLoading]);

  const hasPendingDiscovery = useMemo(
    () => chatHistory?.messages.some((message) => Boolean(message.meta?.pending)) ?? false,
    [chatHistory]
  );

  usePendingChatDiscovery(activeIcpId, chatHistory?.messages, ({ intent }) => {
    toast.success(
      intent === "quick_research" ? "Research results are ready." : "Lead results are ready."
    );
  });

  useLayoutEffect(() => {
    if (!isIcpMenuOpen || !icpTriggerRef.current) return;
    const rect = icpTriggerRef.current.getBoundingClientRect();
    setIcpMenuPosition({ top: rect.bottom + 8, left: rect.left, width: Math.max(rect.width, 260) });
  }, [isIcpMenuOpen]);

  useEffect(() => {
    if (!isIcpMenuOpen) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        icpMenuRef.current &&
        !icpMenuRef.current.contains(target) &&
        icpTriggerRef.current &&
        !icpTriggerRef.current.contains(target)
      ) {
        setIsIcpMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isIcpMenuOpen]);

  const sendMessage = useSendChatMessage(activeIcpId, {
    onSuccess: ({ assistant_message, pending }) => {
      if (!assistant_message) return;
      setMessages((current) => {
        const alreadyPresent = current.some(
          (message) =>
            message.role === "assistant" &&
            message.body === assistant_message.body &&
            (pending ? true : Boolean(message.leads?.length))
        );
        if (alreadyPresent) return current;

        return [
          ...current,
          {
            id: nextMessageId(),
            role: "assistant",
            body: assistant_message.body,
            intent: assistant_message.intent,
            leads: assistant_message.leads ?? undefined,
            meta: assistant_message.meta ?? undefined,
          },
        ];
      });
    },
    onError: (error) => {
      toast.error(
        isMissingActiveIcp(error)
          ? "Select an active ICP profile first — open ICP Builder to create or activate one."
          : getApiErrorMessage(error, "Sales Engine couldn't process that request.")
      );
    },
  });

  function handleDetachToBackground() {
    const runId = sendMessage.detachToBackground();
    if (typeof runId === "number") {
      setBackgroundRunIds((current) => new Set(current).add(runId));
    }
    toast.info("Processing in background. You can keep chatting — we'll notify you when results are ready.");
  }

  const isThinking = isForegroundChatWaiting(sendMessage.isPending, sendMessage.waitMode);
  const showWelcomeMessage = messages.length > 0 && messages[0]?.id === 1;

  function selectIntent(intent: ActionIntent) {
    setSelectedIntent((current) => (current === intent ? "freeform" : intent));
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }

  function clearIntent() {
    setSelectedIntent("freeform");
    inputRef.current?.focus();
  }

  function handleSend(prompt: string, intent: ChatIntent = selectedIntent) {
    const trimmed = prompt.trim();
    if (!trimmed || isThinking) return;

    setMessages((current) => [
      ...current,
      { id: nextMessageId(), role: "user", body: trimmed, intent },
    ]);
    setDraft("");
    sendMessage.mutate({ body: trimmed, intent });
  }

  function scrollTranscriptToBottom() {
    const node = transcriptRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: "smooth" });
  }

  useEffect(() => {
    if (messages.length === 1 && !isThinking) return;
    const frame = window.requestAnimationFrame(() => {
      scrollTranscriptToBottom();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages, isThinking, sendMessage.processingState]);


  return (
    <section
      className={`relative flex flex-col overflow-hidden rounded-[35px] bg-white shadow-[0_8px_6px_rgba(0,0,0,0.15),0_4px_2px_rgba(0,0,0,0.3)] transition-[height] duration-300 ${
        expanded ? "h-[calc(100vh-112px)] min-h-[720px]" : "h-[600px]"
      }`}
    >
      <header className="mx-6 mt-5 flex h-[48px] shrink-0 items-center justify-between rounded-[24px] bg-[#09232d] px-6 text-white shadow-[0_6px_6px_rgba(0,0,0,0.18)] max-sm:mx-4">
        <button
          ref={icpTriggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={isIcpMenuOpen}
          onClick={() => setIsIcpMenuOpen((current) => !current)}
          className="flex items-center gap-3 rounded-full px-2 py-1 transition hover:bg-white/10"
        >
          <Sparkles size={18} className="shrink-0" />
          <span className="max-w-[220px] truncate text-[21px] font-semibold">
            {icpProfiles.find((profile) => profile.isActive)?.name ?? "Sales Engine"}
          </span>
          <ChevronDown
            size={14}
            className={`text-white/50 transition-transform ${isIcpMenuOpen ? "rotate-180" : ""}`}
          />
        </button>
        <button
          type="button"
          aria-label={expanded ? "Minimize Sales Engine" : "Expand Sales Engine"}
          onClick={onToggleExpanded}
          className="grid size-8 place-items-center rounded-full text-white/70 transition hover:bg-white/10 hover:text-white"
        >
          {expanded ? <Minimize2 size={18} /> : <Expand size={18} />}
        </button>
      </header>

      {isIcpMenuOpen &&
        icpMenuPosition &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={icpMenuRef}
            role="menu"
            style={{ top: icpMenuPosition.top, left: icpMenuPosition.left, width: icpMenuPosition.width }}
            className="fixed z-50 max-h-[320px] overflow-y-auto rounded-[16px] border border-black/5 bg-white p-1.5 text-[#09232d] shadow-[0_16px_32px_rgba(9,35,45,0.18)]"
          >
            <p className="px-2.5 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              ICP Builds
            </p>
            {isIcpProfilesLoading && (
              <p className="px-2.5 py-2 text-[12px] text-gray-400">Loading…</p>
            )}
            {!isIcpProfilesLoading && icpProfiles.length === 0 && (
              <p className="px-2.5 py-2 text-[12px] text-gray-400">No ICP builds yet.</p>
            )}
            {icpProfiles.map((profile) => {
              const isSwitchingToThis = activateIcpProfile.isPending && activateIcpProfile.variables === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={profile.isActive}
                  disabled={activateIcpProfile.isPending}
                  onClick={() => {
                    if (profile.isActive) {
                      setIsIcpMenuOpen(false);
                      return;
                    }
                    activateIcpProfile.mutate(profile.id, { onSuccess: () => setIsIcpMenuOpen(false) });
                  }}
                  className={`flex w-full items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-left text-[12px] font-medium transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60 ${
                    profile.isActive ? "bg-gray-100" : ""
                  }`}
                >
                  <span className="truncate">{profile.name}</span>
                  {isSwitchingToThis ? (
                    <Loader2 size={14} className="shrink-0 animate-spin text-gray-400" />
                  ) : (
                    profile.isActive && <Check size={14} className="shrink-0 text-[#16b37d]" />
                  )}
                </button>
              );
            })}
            <div className="mt-1 border-t border-gray-100 pt-1">
              <button
                type="button"
                disabled={!activeIcpId || clearChatHistory.isPending}
                onClick={() => {
                  clearChatHistory.mutate(undefined, {
                    onSuccess: () => {
                      setMessages(initialMessages);
                      nextMessageIdRef.current = 2;
                      setIsIcpMenuOpen(false);
                      toast.success("Chat history cleared for this ICP.");
                    },
                    onError: (error) =>
                      toast.error(getApiErrorMessage(error, "Could not clear chat history.")),
                  });
                }}
                className="w-full rounded-[10px] px-2.5 py-2 text-left text-[12px] font-medium text-[#616263] transition hover:bg-gray-100 disabled:opacity-60"
              >
                Clear chat history
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsIcpMenuOpen(false);
                  onOpenIcpBuilder();
                }}
                className="w-full rounded-[10px] px-2.5 py-2 text-left text-[12px] font-semibold text-[#09232d] transition hover:bg-gray-100"
              >
                Manage ICP Builds
              </button>
            </div>
          </div>,
          document.body
        )}

      <div
        ref={transcriptRef}
        className={`mx-auto mt-5 min-h-0 w-full flex-1 overflow-y-auto scroll-smooth px-6 pb-4 text-[#09232d] max-sm:px-4 ${
          expanded ? "max-w-[1100px]" : "max-w-[824px]"
        }`}
      >
        <div className="space-y-4">
          {messages.map((message, index) => {
            const pendingRunId =
              typeof message.meta?.discovery_run_id === "number"
                ? message.meta.discovery_run_id
                : null;
            const isPendingMessage = Boolean(message.meta?.pending);
            const isBackgroundPending =
              isPendingMessage &&
              !isThinking &&
              (pendingRunId == null ||
                backgroundRunIds.has(pendingRunId) ||
                sendMessage.waitMode === "background" ||
                hasPendingDiscovery);

            return (
            <div key={message.id} className={message.role === "user" ? "ml-auto max-w-[78%]" : "max-w-full"}>
              {message.role === "user" && message.intent && message.intent !== "freeform" && (
                <div className="mb-1.5 flex justify-end">
                  <IntentModeChip intent={message.intent} compact />
                </div>
              )}
              {isBackgroundPending && (
                <div className="mb-1.5 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#09232d]/8 px-2 py-0.5 text-[8px] font-semibold text-[#09232d]/70">
                    <Loader2 size={10} className="animate-spin" />
                    Processing in background
                  </span>
                </div>
              )}
              <div
                className={
                  message.role === "user"
                    ? "rounded-[18px] bg-[#09232d] px-4 py-3 text-[12px] leading-[16px] text-white"
                    : showWelcomeMessage && index === 0
                      ? "text-[12px] leading-[15px] text-[#09232d]"
                      : "rounded-[18px] bg-[#f8f8f8] px-4 py-3 text-[12px] leading-[16px] text-[#09232d]"
                }
              >
                <ChatMessageBody
                  content={message.body}
                  variant={message.role === "user" ? "user" : showWelcomeMessage && index === 0 ? "welcome" : "assistant"}
                />
              </div>
              {message.intent === "generate_leads" && !message.leads?.length && !isPendingMessage && (
                <p className="mt-2 text-[9px] font-medium text-[#616263]">
                  No leads could be extracted for this search — try rephrasing with specific names, companies, or territories.
                </p>
              )}
              {message.leads && message.leads.length > 0 && (
                <LeadInlineResults
                  leads={message.leads}
                  onLeadsChange={(leads) => {
                    setMessages((current) =>
                      current.map((item) => (item.id === message.id ? { ...item, leads } : item))
                    );
                  }}
                />
              )}
              {showWelcomeMessage && index === 0 && (
                <div className="mt-5 flex items-center gap-5 text-[#cfcfcf]">
                  <ThumbsUp size={14} />
                  <ThumbsDown size={14} />
                  <Copy size={14} />
                </div>
              )}
            </div>
            );
          })}
          {isThinking && sendMessage.processingState && (
            <ProcessingPanel
              state={sendMessage.processingState}
              onDetachToBackground={handleDetachToBackground}
            />
          )}
          <div aria-hidden className="h-2" />
        </div>
      </div>

      <div
        className={`mx-auto mb-5 w-[calc(100%-88px)] shrink-0 rounded-[22px] border border-[#d7d7d7] bg-white shadow-sm max-sm:mb-4 max-sm:w-[calc(100%-32px)] ${
          expanded ? "max-w-[1100px]" : "max-w-[824px]"
        }`}
      >
        <div className="flex min-h-[43px] flex-wrap items-center gap-2 rounded-t-[22px] border-b border-[#ececec] px-5 py-1.5">
          <Plus size={21} className="shrink-0 text-[#09232d]" />
          {selectedIntent !== "freeform" && (
            <IntentModeChip intent={selectedIntent} onClear={clearIntent} />
          )}
          <input
            ref={inputRef}
            aria-label="Ask Sales Engine"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" || event.shiftKey) return;
              event.preventDefault();
              if (draft.trim()) handleSend(draft, selectedIntent);
            }}
            className="h-8 min-w-[120px] flex-1 bg-transparent text-[10px] text-[#09232d] outline-none placeholder:text-[#b5b5b5]"
            placeholder={INTENT_PLACEHOLDERS[selectedIntent]}
          />
          <button
            type="button"
            aria-label="Send message"
            onClick={() => handleSend(draft, selectedIntent)}
            disabled={isThinking || !draft.trim()}
            className="grid size-[30px] shrink-0 place-items-center rounded-full bg-[#09232d] text-white disabled:opacity-60"
          >
            <Send size={15} fill="currentColor" />
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 px-4 py-4">
          <PromptButton
            icon={<Globe2 size={17} />}
            label="Quick Research"
            active={selectedIntent === "quick_research"}
            onSelect={() => selectIntent("quick_research")}
            tint={INTENT_MODE_CONFIG.quick_research.tint}
            disabled={isThinking}
          />
          <PromptButton
            icon={<UsersRound size={17} />}
            label="Generate New Leads"
            active={selectedIntent === "generate_leads"}
            onSelect={() => selectIntent("generate_leads")}
            tint={INTENT_MODE_CONFIG.generate_leads.tint}
            disabled={isThinking}
          />
          <PromptButton
            icon={<Lightbulb size={17} />}
            label="Create Outreach Message"
            active={selectedIntent === "create_outreach"}
            onSelect={() => selectIntent("create_outreach")}
            tint={INTENT_MODE_CONFIG.create_outreach.tint}
            disabled={isThinking}
          />
        </div>
      </div>
    </section>
  );
}

function OutreachCard({
  color,
  icon,
  iconColor,
  name,
  channel,
  preview,
  time,
}: {
  color: string;
  icon: string;
  iconColor?: string;
  name: string;
  channel: string;
  preview: string;
  time: string;
}) {
  return (
    <article
      className={`${color} h-[108px] rounded-[20px] p-5 shadow-[0_6px_5px_rgba(0,0,0,0.15),0_2px_1.5px_rgba(0,0,0,0.3)]`}
      style={color.startsWith("#") ? { backgroundColor: color } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-2">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-white">
            <MessageCircle
              size={21}
              className={icon}
              style={iconColor ? { color: iconColor } : undefined}
              fill="currentColor"
            />
          </div>
          <div className="min-w-0 text-[#09232d]">
            <p className="text-[14px] font-bold leading-[18px]">{name}</p>
            <p className="mt-1 max-w-[156px] text-[7px] font-light leading-[9px]">
              {channel}: {preview}
            </p>
          </div>
        </div>
        <MoreVertical size={24} className="shrink-0 text-[#09232d]" />
      </div>
      <p className="ml-[88px] mt-2 text-[5px] font-light leading-[9px] text-[#09232d]">{time}</p>
    </article>
  );
}

const OUTREACH_FALLBACK_COLORS = [
  { color: "bg-[#df93e6]", icon: "text-[#9d25a8]" },
  { color: "bg-[#8dc8c8]", icon: "text-[#6ab6b7]" },
  { color: "bg-[#dbdbdb]", icon: "text-[#cfcfcf]" },
  { color: "bg-[#f79787]", icon: "text-[#ef735f]" },
] as const;

function OutreachPanel() {
  const { data: items = [] } = useSalesEngineOutreach();

  return (
    <aside className="ticket-cutout relative h-[600px] overflow-hidden rounded-[20px] bg-[#09232d] px-[44px] py-[33px] text-white shadow-sm max-xl:h-[520px] max-sm:px-6">
      <header className="mb-8 flex items-center justify-center gap-2">
        <h2 className="text-[13px] font-bold">Recent Outreach Activities</h2>
        <ChevronDown size={14} className="text-white/70" />
      </header>
      {items.length > 0 ? (
        <>
          <div className="absolute right-[22px] top-[97px] h-[18px] w-[3px] rounded-full bg-[#e5e5e5]" />
          <div className="mx-auto flex h-[480px] max-w-[285px] flex-col gap-4 overflow-y-auto pr-2 max-xl:h-[400px]">
            {items.map((item, index) => {
              const fallback = OUTREACH_FALLBACK_COLORS[index % OUTREACH_FALLBACK_COLORS.length];
              const useApiColors = item.accentBg?.startsWith("#");
              return (
                <OutreachCard
                  key={item.id}
                  color={useApiColors ? item.accentBg : fallback.color}
                  icon={useApiColors ? "" : fallback.icon}
                  iconColor={useApiColors ? item.accentIcon : undefined}
                  name={item.name}
                  channel={item.channel}
                  preview={item.preview}
                  time={formatRelativeTime(item.occurred_at)}
                />
              );
            })}
          </div>
        </>
      ) : (
        <div className="flex h-[460px] flex-col items-center justify-center max-xl:h-[380px]">
          <Image
            src="/message_empty.png"
            alt="No recent outreach activities"
            width={209}
            height={201}
            className="h-auto w-[180px] max-w-full select-none object-contain"
            priority
          />
        </div>
      )}
    </aside>
  );
}

function PipelineGaugeIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M7 16a5.5 5.5 0 1 1 10 0" />
      <path d="M12 12.5l-2.5-2.5" />
      <circle cx="12" cy="12.5" r="0.75" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IcpBuilderIcon({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M13.5 3.5H7.5A4 4 0 0 0 3.5 7.5v9A4 4 0 0 0 7.5 20.5h9a4 4 0 0 0 4-4v-6" />
      <circle cx="10.5" cy="10" r="2.5" />
      <path d="M6.5 17.5c0-2.2 1.8-4 4-4s4 1.8 4 4" />
      <path
        d="M18.5 2.5c0 1.6 1.4 2.8 3 2.8-1.6 0-3 1.2-3 2.8 0-1.6-1.4-2.8-3-2.8 1.6 0 3-1.2 3-2.8z"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

function CompanyBuildingIcon({ className = "size-5" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M3 21h18" />
      <path d="M5 21V7a4 4 0 0 1 4-4h5v18" />
      <path d="M8 8h3" />
      <path d="M8 12h3" />
      <path d="M8 16h3" />
      <path d="M14 9h5a1 1 0 0 1 1 1v11" />
      <path d="M17 14v4" />
    </svg>
  );
}

function SalesEngineTabs({
  activeTab,
  onChange,
}: {
  activeTab: SalesEngineTab;
  onChange: (tab: SalesEngineTab) => void;
}) {
  return (
    <div className="flex">
      <div className="inline-flex h-[42px] items-center gap-1 rounded-[21px] bg-white p-1 shadow-[0_1px_3px_rgba(0,0,0,0.08)]">
        {salesEngineTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`h-[32px] rounded-[17px] px-5 text-[12px] font-semibold transition ${
              activeTab === tab.id
                ? "bg-[#09232d] text-white shadow-[0_2px_4px_rgba(0,0,0,0.25)]"
                : "bg-transparent text-[#9d9d9d] hover:text-[#09232d]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SourceBadge({ sourceIcon }: { sourceIcon: string }) {
  const isLinkedIn = sourceIcon === "in";
  const isReddit = sourceIcon === "r";
  return (
    <span
      className={`grid size-[22px] shrink-0 place-items-center rounded-full text-[10px] font-bold text-white ${
        isLinkedIn ? "bg-[#0a66c2]" : isReddit ? "bg-[#ff4500]" : "bg-black"
      }`}
    >
      {sourceIcon}
    </span>
  );
}

function ScoreGauge({ score, dark = false }: { score: number; dark?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative grid size-[43px] place-items-center">
        <span
          className={`sales-gauge-spin absolute inset-0 rounded-full border-[4px] border-[#3E7210] border-l-transparent rotate-[-35deg] ${
            dark ? "bg-[#153841]" : "bg-white"
          }`}
        />
        <span
          className={`absolute inset-[7px] rounded-full ${dark ? "bg-[#3E7210]" : "bg-white"}`}
        />
        <span className={`relative text-[9px] font-semibold ${dark ? "text-white" : "text-[#09232d]"}`}>{score}%</span>
      </div>
      <span className={`text-[9px] ${dark ? "text-white/80" : "text-[#616263]"}`}>High</span>
    </div>
  );
}

function SignalActionMenu({
  signal,
  onRemove,
  onSelect,
  onCreateOutreach,
  onAddToCrm,
  onSetReminder,
}: {
  signal: SocialSignal;
  onRemove?: (id: number) => void;
  onSelect?: (signal: SocialSignal) => void;
  onCreateOutreach?: (signal: SocialSignal) => void;
  onAddToCrm?: (signal: SocialSignal) => void;
  onSetReminder?: (signal: SocialSignal) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const menuWidth = 150;
    const menuHeight = 155;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow < menuHeight ? rect.top - menuHeight : rect.bottom + 4;
    const left = Math.max(12, rect.right - menuWidth);
    setPosition({ top, left });
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePosition();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    }
    function handleScroll() {
      setIsOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label="Signal actions"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(signal);
          setIsOpen((prev) => !prev);
        }}
        className={`grid size-6 place-items-center rounded-full transition hover:bg-black/10 group-hover:hover:bg-white/20 cursor-pointer ${
          isOpen ? "bg-black/10 group-hover:bg-white/20" : ""
        }`}
      >
        <MoreVertical
          size={16}
          className="text-[#616263] transition-colors group-hover:text-white group-focus:text-white"
        />
      </button>

      {isOpen &&
        position &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ top: position.top, left: position.left }}
            className="fixed z-50 w-[150px] rounded-[14px] border border-black/10 bg-white p-1.5 text-[#09232d] shadow-[0_12px_28px_rgba(9,35,45,0.18)]"
          >
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                if (onCreateOutreach) {
                  onCreateOutreach(signal);
                } else {
                  toast.success(`Opening outreach composer for ${signal.company} (${signal.profile})…`);
                }
              }}
              className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[11px] font-medium text-[#09232d] transition hover:bg-gray-100 cursor-pointer"
            >
              <Send size={13} className="shrink-0 text-[#09232d]" />
              <span>Outreach</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                if (onAddToCrm) {
                  onAddToCrm(signal);
                } else {
                  toast.success(`Added ${signal.company} to CRM pipeline.`);
                }
              }}
              className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[11px] font-medium text-[#09232d] transition hover:bg-gray-100 cursor-pointer"
            >
              <UserPlus size={13} className="shrink-0 text-[#09232d]" />
              <span>Add to CRM</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                if (onSetReminder) {
                  onSetReminder(signal);
                } else {
                  toast.success(`Reminder set for ${signal.company}.`);
                }
              }}
              className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[11px] font-medium text-[#09232d] transition hover:bg-gray-100 cursor-pointer"
            >
              <Clock size={13} className="shrink-0 text-[#09232d]" />
              <span>Set Reminder</span>
            </button>
            <div className="my-1 border-t border-gray-100" />
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
                if (onRemove) {
                  onRemove(signal.id);
                } else {
                  toast.success(`Signal from ${signal.company} removed.`);
                }
              }}
              className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2 text-left text-[11px] font-medium text-red-600 transition hover:bg-red-50 cursor-pointer"
            >
              <Trash2 size={13} className="shrink-0 text-red-500" />
              <span>Remove</span>
            </button>
          </div>,
          document.body
        )}
    </>
  );
}

function SocialSignalRow({
  signal,
  isActive = false,
  onHover,
  onRemoveSignal,
  onCreateOutreach,
  onAddToCrm,
  onSetReminder,
}: {
  signal: SocialSignal;
  isActive?: boolean;
  onHover: (signal: SocialSignal) => void;
  onRemoveSignal?: (id: number) => void;
  onCreateOutreach?: (signal: SocialSignal) => void;
  onAddToCrm?: (signal: SocialSignal) => void;
  onSetReminder?: (signal: SocialSignal) => void;
}) {
  const isIndividual =
    signal.entityType === "individual" || signal.company.toLowerCase() === "individual";

  return (
    <tr
      onClick={() => onHover(signal)}
      onMouseEnter={() => onHover(signal)}
      onFocus={() => onHover(signal)}
      tabIndex={0}
      className={`group cursor-pointer outline-none transition-colors duration-200 ${
        isActive
          ? "bg-[#09232d] text-white"
          : "bg-[#f4f4f4] text-[#616263] hover:bg-[#09232d] hover:text-white focus:bg-[#09232d] focus:text-white"
      }`}
    >
      <td className="rounded-l-[20px] px-4 py-3">
        <div className="flex min-w-[230px] gap-3">
          <SourceBadge sourceIcon={signal.sourceIcon} />
          <p
            className={`line-clamp-4 text-[9px] leading-[11px] transition-colors ${
              isActive ? "text-white" : "text-[#616263] group-hover:text-white group-focus:text-white"
            }`}
          >
            {signal.signal}
          </p>
        </div>
      </td>
      <td className="px-3 py-3 align-middle">
        <p className="w-[64px] text-[8px] leading-[11px]">{signal.source}</p>
        <p
          className={`mt-1 text-[8px] transition-colors ${
            isActive ? "text-white/70" : "text-[#616263]/70 group-hover:text-white/70 group-focus:text-white/70"
          }`}
        >
          {formatRelativeTime(signal.posted_at)}
        </p>
      </td>
      <td className="px-3 py-3 align-middle">
        <p className="w-[68px] text-[8px] leading-[11px]">{signal.persona}</p>
      </td>
      <td className="px-3 py-3 align-middle">
        <div className="flex min-w-[150px] items-center gap-2">
          {isIndividual ? (
            <User
              size={20}
              className={`shrink-0 transition-colors ${
                isActive ? "text-white" : "text-[#616263] group-hover:text-white group-focus:text-white"
              }`}
            />
          ) : (
            <CompanyBuildingIcon
              className={`size-5 shrink-0 transition-colors ${
                isActive ? "text-white" : "text-[#616263] group-hover:text-white group-focus:text-white"
              }`}
            />
          )}
          <div>
            <p className="text-[9px] font-semibold leading-[11px]">{signal.company}</p>
            {signal.location && (
              <p className="whitespace-pre-line text-[8px] leading-[10px] opacity-80">{signal.location}</p>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-3 align-middle">
        <span
          className="inline-flex rounded-full px-3 py-1 text-[8px] font-semibold text-white"
          style={{ backgroundColor: signal.intentColor }}
        >
          {signal.intent}
        </span>
        <p className="mt-1 w-[92px] text-[8px] leading-[10px] opacity-80">{signal.description}</p>
      </td>
      <td className="px-3 py-3 align-middle">
        <div className={isActive ? "hidden" : "block group-hover:hidden group-focus:hidden"}>
          <ScoreGauge score={signal.score} />
        </div>
        <div className={isActive ? "block" : "hidden group-hover:block group-focus:block"}>
          <ScoreGauge score={signal.score} dark />
        </div>
      </td>
      <td className="rounded-r-[20px] px-4 py-3 align-middle">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={`Message ${signal.profile || signal.company}`}
            onClick={(e) => {
              e.stopPropagation();
              onHover(signal);
              if (onCreateOutreach) {
                onCreateOutreach(signal);
              } else {
                toast.info(`Opening message composer for ${signal.profile || signal.company}…`);
              }
            }}
            className="grid size-6 place-items-center rounded-full transition hover:bg-black/10 group-hover:hover:bg-white/20 cursor-pointer"
          >
            <MessageCircle
              size={15}
              className={`transition-colors ${
                isActive ? "text-white" : "text-[#616263] group-hover:text-white group-focus:text-white"
              }`}
            />
          </button>
          <SignalActionMenu
            signal={signal}
            onRemove={onRemoveSignal}
            onSelect={onHover}
            onCreateOutreach={onCreateOutreach}
            onAddToCrm={onAddToCrm}
            onSetReminder={onSetReminder}
          />
        </div>
      </td>
    </tr>
  );
}

function SocialSignalsTable({
  signals,
  activeSignalId,
  onHoverSignal,
  onRemoveSignal,
  onCreateOutreach,
  onAddToCrm,
  onSetReminder,
  page,
  lastPage,
  total,
  perPage,
  onPageChange,
  isLoading,
  isScanning,
  emptyState,
  onEmptyScanNow,
  onEmptyOpenSettings,
  enabledSources,
  scanPanel,
}: {
  signals: SocialSignal[];
  activeSignalId?: number | null;
  onHoverSignal: (signal: SocialSignal) => void;
  onRemoveSignal?: (id: number) => void;
  onCreateOutreach?: (signal: SocialSignal) => void;
  onAddToCrm?: (signal: SocialSignal) => void;
  onSetReminder?: (signal: SocialSignal) => void;
  page: number;
  lastPage: number;
  total: number;
  perPage: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
  isScanning?: boolean;
  emptyState?: ReturnType<typeof getSocialListeningEmptyState>;
  onEmptyScanNow?: () => void;
  onEmptyOpenSettings?: () => void;
  enabledSources?: string[];
  scanPanel?: ReactNode;
}) {
  const rangeStart = total === 0 ? 0 : (page - 1) * perPage + 1;
  const rangeEnd = Math.min(page * perPage, total);
  const safePage = Math.min(Math.max(1, page), Math.max(lastPage, 1));
  const pageNumbers = useMemo(() => {
    if (lastPage <= 5) {
      return Array.from({ length: Math.max(lastPage, 1) }, (_, i) => i + 1);
    }
    if (safePage <= 3) {
      return [1, 2, 3, "...", lastPage];
    }
    if (safePage >= lastPage - 2) {
      return [1, "...", lastPage - 2, lastPage - 1, lastPage];
    }
    return [1, "...", safePage, "...", lastPage];
  }, [safePage, lastPage]);
  const showSkeleton = (isLoading || isScanning) && signals.length === 0;
  const skeletonRows = isScanning ? 5 : 4;

  return (
    <section className="flex flex-1 min-h-0 flex-col rounded-[30px] bg-white p-2 shadow-[0_8px_12px_6px_rgba(0,0,0,0.15),0_4px_4px_rgba(0,0,0,0.3)] overflow-hidden">
      {isScanning && scanPanel}
      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-auto pr-1">
        <table className="w-full min-w-[860px] border-separate border-spacing-y-2">
          <thead className="sticky top-0 z-10 bg-white">
            <tr className="text-[9px] font-semibold text-[#333333]">
              <th className="bg-white px-4 py-1 text-left">Signal</th>
              <th className="bg-white px-3 py-1 text-left">Source</th>
              <th className="bg-white px-3 py-1 text-left">Persona</th>
              <th className="bg-white px-3 py-1 text-left">Company</th>
              <th className="bg-white px-3 py-1 text-left">Intent</th>
              <th className="bg-white px-3 py-1 text-center">Score</th>
              <th className="bg-white px-4 py-1 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((signal) => (
              <SocialSignalRow
                key={signal.id}
                signal={signal}
                isActive={signal.id === activeSignalId}
                onHover={onHoverSignal}
                onRemoveSignal={onRemoveSignal}
                onCreateOutreach={onCreateOutreach}
                onAddToCrm={onAddToCrm}
                onSetReminder={onSetReminder}
              />
            ))}
            {showSkeleton && <SocialSignalsTableSkeleton rows={skeletonRows} />}
          </tbody>
        </table>
        {!isLoading && !isScanning && signals.length === 0 && emptyState && (
          <SocialSignalsEmptyState
            state={emptyState}
            enabledSources={enabledSources}
            onScanNow={onEmptyScanNow}
            onOpenSettings={onEmptyOpenSettings}
          />
        )}
      </div>
      <div className="shrink-0 flex items-center justify-between border-t border-[#f1f1f1] px-8 pb-3 pt-3 text-[9px] font-semibold text-[#333333] max-sm:px-3">
        <span>
          Showing {rangeStart} - {rangeEnd} of {total} Signals
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => onPageChange(safePage - 1)}
            className={`px-2 transition ${
              safePage <= 1
                ? "text-[#c1c1c1] cursor-not-allowed"
                : "text-[#333333] hover:text-[#09232d] cursor-pointer"
            }`}
          >
            Prev
          </button>
          {pageNumbers.map((pageNumber, idx) =>
            typeof pageNumber === "number" ? (
              <button
                key={pageNumber}
                type="button"
                onClick={() => onPageChange(pageNumber)}
                className={`grid size-8 place-items-center rounded-[8px] border text-[10px] font-medium transition cursor-pointer ${
                  safePage === pageNumber
                    ? "border-[#3f83f8] bg-[#3f83f8] text-white shadow-sm"
                    : "border-[#f1f1f1] bg-white text-[#333333] hover:bg-gray-100"
                }`}
              >
                {pageNumber}
              </button>
            ) : (
              <span key={`ellipsis-${idx}`} className="px-1 text-[13px] text-gray-400">
                ...
              </span>
            )
          )}
          <button
            type="button"
            disabled={safePage >= lastPage}
            onClick={() => onPageChange(safePage + 1)}
            className={`px-2 transition ${
              safePage >= lastPage
                ? "text-[#c1c1c1] cursor-not-allowed"
                : "text-[#333333] hover:text-[#09232d] cursor-pointer"
            }`}
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}

function SocialListeningFilters({
  search,
  source,
  signalType,
  intent,
  onSearchChange,
  onSourceChange,
  onSignalTypeChange,
  onIntentChange,
  onOpenSettings,
  onScanNow,
  isScanning,
  isScanPending,
}: {
  search: string;
  source: string;
  signalType: string;
  intent: string;
  onSearchChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onSignalTypeChange: (value: string) => void;
  onIntentChange: (value: string) => void;
  onOpenSettings: () => void;
  onScanNow: () => void;
  isScanning?: boolean;
  isScanPending?: boolean;
}) {
  const scanBusy = isScanning || isScanPending;
  return (
    <div className="flex flex-nowrap items-center gap-2 xl:gap-2.5 overflow-x-auto py-1">
      <label className="flex h-9 w-[150px] xl:w-[170px] shrink-0 items-center gap-2 rounded-full bg-white px-3.5 shadow-[0_1px_3px_1px_rgba(0,0,0,0.12),0_1px_2px_rgba(0,0,0,0.18)]">
        <Search size={14} className="shrink-0 text-[#09232d]" />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-[10px] text-[#09232d] outline-none placeholder:text-[#616263]"
          placeholder="Search"
        />
      </label>
      <SearchableSelect
        value={source}
        onChange={onSourceChange}
        options={sourceFilterOptions}
        className="h-8 min-w-[96px] shrink-0 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-2.5 text-[10px] text-[#34373c]"
      />
      <SearchableSelect
        value={signalType}
        onChange={onSignalTypeChange}
        options={signalTypeFilterOptions}
        className="h-8 min-w-[110px] shrink-0 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-2.5 text-[10px] text-[#34373c]"
      />
      <SearchableSelect
        value={intent}
        onChange={onIntentChange}
        options={intentFilterOptions}
        className="h-8 min-w-[90px] shrink-0 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-2.5 text-[10px] text-[#34373c]"
      />
      <button
        type="button"
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-2.5 text-[10px] text-[#34373c] transition-colors hover:bg-gray-100 cursor-pointer"
      >
        <SlidersHorizontal size={13} />
        Filter
      </button>
      <button
        type="button"
        onClick={onScanNow}
        disabled={scanBusy}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-3 text-[10px] font-medium text-[#34373c] transition-colors hover:bg-gray-100 disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed"
      >
        {scanBusy ? (
          <Loader2 size={13} className="animate-spin text-[#09232d]" />
        ) : (
          <Scan size={13} className="text-[#09232d]" />
        )}
        <span>{scanBusy ? "Scanning…" : "Scan"}</span>
      </button>
      <button
        type="button"
        onClick={onOpenSettings}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#d1d1d1] bg-[#09232d] px-3 text-[10px] font-medium text-white transition-colors hover:bg-[#0f3340] cursor-pointer"
      >
        <Sparkles size={13} />
        Listen Settings
      </button>
    </div>
  );
}

function SocialOpportunityDetail({
  signal,
  onCreateOutreach,
  onSetReminder,
  onSyncToCrm,
  isCreatingOutreach,
  isSettingReminder,
  isSyncingToCrm,
}: {
  signal: SocialSignal;
  onCreateOutreach: () => void;
  onSetReminder: () => void;
  onSyncToCrm: () => void;
  isCreatingOutreach?: boolean;
  isSettingReminder?: boolean;
  isSyncingToCrm?: boolean;
}) {
  const isIndividual =
    signal.entityType === "individual" || signal.company.toLowerCase() === "individual";
  const [hasCopiedMessage, setHasCopiedMessage] = useState(false);
  const recommendedAction =
    signal.recommendedAction ??
    "Reach out within 24 hours — this prospect may be actively looking for solutions.";

  const handleCopyMessage = async () => {
    try {
      await navigator.clipboard.writeText(signal.suggestedMessage);
      setHasCopiedMessage(true);
      toast.success("AI suggested message copied to clipboard!");
      window.setTimeout(() => setHasCopiedMessage(false), 2000);
    } catch {
      toast.error("Failed to copy message.");
    }
  };

  const postHref =
    signal.post_url ||
    (signal.source === "LinkedIn Post"
      ? "https://www.linkedin.com"
      : signal.source === "X/Twitter Post"
        ? "https://x.com"
        : "https://www.reddit.com");

  return (
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-[30px] bg-white shadow-[0_8px_12px_6px_rgba(0,0,0,0.15),0_4px_4px_rgba(0,0,0,0.3)]">
      <div className="relative min-h-[175px] shrink-0 bg-[#0b242e] px-7 pb-5 pt-8 text-white">
        <div className="absolute right-7 top-8">
          <ScoreGauge score={signal.score} dark />
        </div>
        <SourceBadge sourceIcon={signal.sourceIcon} />
        <p className="mt-3 max-w-[250px] text-[10px] font-light leading-[12px]">
          {signal.signal}
        </p>
        <div className="mt-2">
          <a
            href={postHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1 text-[10px] italic text-white/90 transition-opacity hover:opacity-100 hover:text-white cursor-pointer"
          >
            <span className="underline underline-offset-2">See Post</span>
            <span className="not-italic no-underline">→</span>
          </a>
        </div>
        <p className="mt-2 text-[9px] font-light text-[#d0d0d0]">
          {signal.source} • Public • {formatRelativeTime(signal.posted_at)}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">
        <div className="grid grid-cols-2 border-b border-[#e9e9e9] px-5 py-3 text-[#616263]">
          <div className="flex items-center gap-2 border-r border-[#e9e9e9] pr-4">
            <Image
              src="/avatars/male-avatar.png"
              alt=""
              width={25}
              height={25}
              className="size-[25px] rounded-full object-cover"
            />
            <div>
              <p className="text-[10px] font-semibold leading-[12px]">{signal.profile}</p>
              <p className="text-[10px] font-light leading-[12px]">{signal.persona}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 pl-4">
            {isIndividual ? (
              <User size={22} className="shrink-0 text-[#616263]" />
            ) : (
              <CompanyBuildingIcon className="size-[22px] shrink-0 text-[#616263]" />
            )}
            <div>
              <p className="text-[10px] font-semibold leading-[12px]">{signal.company}</p>
              <p className="whitespace-pre-line text-[10px] font-light leading-[12px]">
                {signal.location || (isIndividual ? "Individual profile" : "Public profile")}
              </p>
            </div>
          </div>
        </div>

        <div className="border-b border-[#e9e9e9] px-5 py-3 text-[#616263]">
          <p className="mb-2 text-[10px] font-semibold leading-[12px]">Why this is an opportunity</p>
          {signal.reasons.map((item) => (
            <div key={item} className="flex items-center gap-1.5 py-0.5 text-[10px] font-light leading-[12px]">
              <CircleCheck size={17} className="shrink-0 text-[#57c946]" />
              {item}
            </div>
          ))}
        </div>

        <div className="border-b border-[#e9e9e9] px-5 py-3 text-[#616263]">
          <p className="mb-3 text-[10px] font-semibold leading-[12px]">Intent & Context</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            {[
              ["Signal Type", signal.signalType],
              ["Buying Stage", signal.buyingStage],
              ["Problem", signal.problem],
              ["Urgency", signal.urgency],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-[10px] font-light leading-[12px]">{label}</p>
                <p className="text-[10px] font-semibold leading-[12px]">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {(signal.industry || (signal.keyTopics && signal.keyTopics.length > 0)) && (
          <div className="border-b border-[#e9e9e9] px-5 py-3 text-[#616263]">
            <p className="mb-2 text-[10px] font-semibold leading-[12px]">Prospect Intelligence</p>
            {signal.industry && (
              <p className="mb-2 text-[10px] leading-[13px]">
                <span className="font-semibold">Industry:</span> {signal.industry}
              </p>
            )}
            {signal.keyTopics && signal.keyTopics.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {signal.keyTopics.map((topic) => (
                  <span
                    key={topic}
                    className="inline-flex rounded-full bg-[#f1f3f4] px-2.5 py-0.5 text-[9px] font-medium text-[#494c4e]"
                  >
                    #{topic}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {signal.competitors && signal.competitors.length > 0 && (
          <div className="border-b border-[#e9e9e9] px-5 py-3 text-[#616263]">
            <p className="mb-1.5 text-[10px] font-semibold leading-[12px]">Mentioned Tools & Vendors</p>
            <div className="flex flex-wrap gap-1.5">
              {signal.competitors.map((comp) => (
                <span
                  key={comp}
                  className="inline-flex items-center gap-1 rounded-[6px] border border-[#e2e2e2] bg-white px-2 py-0.5 text-[9px] font-semibold text-[#09232d]"
                >
                  {comp}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-[5px] px-2 py-2">
          <div className="rounded-[10px] border border-[#e8e5e5] bg-[#f7f6f6] px-3.5 py-2 text-[#616263] shadow-[inset_0_1px_4px_rgba(12,12,13,0.05)]">
            <p className="text-[10px] font-bold leading-[12px]">Recommended Action</p>
            <p className="mt-1 text-[9px] leading-[12px]">{recommendedAction}</p>
          </div>
          <div className="rounded-[10px] border border-[#e8e5e5] bg-white px-3.5 py-2 text-[#616263] shadow-[inset_0_1px_4px_rgba(12,12,13,0.05)]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] font-bold leading-[12px]">AI Suggested Message</p>
              <button
                type="button"
                aria-label="Copy AI suggested message"
                onClick={handleCopyMessage}
                className="grid size-5 place-items-center rounded-[4px] text-[#9d9d9d] transition-colors hover:bg-gray-100 hover:text-[#09232d] cursor-pointer"
              >
                {hasCopiedMessage ? (
                  <Check size={13} className="text-[#16b37d]" />
                ) : (
                  <Copy size={13} />
                )}
              </button>
            </div>
            <p className="mt-1 whitespace-pre-line text-[9px] leading-[12px]">{signal.suggestedMessage}</p>
          </div>
          {signal.followUpStrategy && (
            <div className="rounded-[10px] border border-[#e8e5e5] bg-[#fcfcfc] px-3.5 py-2 text-[#616263] shadow-[inset_0_1px_4px_rgba(12,12,13,0.05)]">
              <p className="text-[10px] font-bold leading-[12px]">Follow-up Strategy</p>
              <p className="mt-1 text-[9px] leading-[12px]">{signal.followUpStrategy}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-auto shrink-0 flex items-center gap-[17px] border-t border-[#e9e9e9] bg-[#f7f7f7] px-6 py-4">
        <button
          type="button"
          disabled={isCreatingOutreach}
          onClick={onCreateOutreach}
          className="h-8 rounded-[10px] border border-[#d1d1d1] bg-[#09232d] px-3 text-[10px] font-medium text-white transition hover:bg-[#0f3340] cursor-pointer disabled:opacity-60"
        >
          {isCreatingOutreach ? "Creating…" : "Create Outreach"}
        </button>
        <button
          type="button"
          disabled={isSettingReminder}
          onClick={onSetReminder}
          className="h-8 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-3 text-[10px] text-[#34373c] transition hover:bg-gray-100 cursor-pointer disabled:opacity-60"
        >
          {isSettingReminder ? "Saving…" : "Set Reminder"}
        </button>
        <button
          type="button"
          disabled={isSyncingToCrm}
          onClick={onSyncToCrm}
          className="h-8 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-3 text-[10px] text-[#34373c] transition hover:bg-gray-100 cursor-pointer disabled:opacity-60"
        >
          {isSyncingToCrm ? "Syncing…" : "Add to CRM"}
        </button>
      </div>
    </aside>
  );
}

function ListeningSettingsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { data: settings, isLoading } = useSocialListeningSettings(isOpen);
  const { data: senderSettings } = useOutreachSenderSettings(isOpen);
  const updateSettings = useUpdateSocialListeningSettings();
  const updateSender = useUpdateOutreachSenderSettings();
  const triggerRun = useTriggerSocialListeningRun();

  const [enabledSources, setEnabledSources] = useState<string[]>([]);
  const [cadenceDays, setCadenceDays] = useState<14 | 30>(14);
  const [minScore, setMinScore] = useState(70);
  const [intentFilters, setIntentFilters] = useState<string[]>([]);
  const [crmDestination, setCrmDestination] = useState<SocialListeningSettings["crm_destination"]>("qualified_pipeline");
  const [outreachChannel, setOutreachChannel] = useState<SocialListeningSettings["outreach_channel_default"]>("email");
  const [senderMode, setSenderMode] = useState<"platform" | "organization">("platform");

  useEffect(() => {
    if (!settings) return;
    setEnabledSources(settings.enabled_sources ?? []);
    setCadenceDays(settings.cadence_days ?? 14);
    setMinScore(settings.min_score ?? 70);
    setIntentFilters(settings.intent_filters ?? []);
    setCrmDestination(settings.crm_destination ?? "qualified_pipeline");
    setOutreachChannel(settings.outreach_channel_default ?? "email");
    setSenderMode(senderSettings?.sender_mode ?? settings.sender_mode ?? "platform");
  }, [settings, senderSettings]);

  const orgVerified = senderSettings?.verification_status === "verified";

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        enabled_sources: enabledSources,
        cadence_days: cadenceDays,
        min_score: minScore,
        intent_filters: intentFilters,
        crm_destination: crmDestination,
        outreach_channel_default: outreachChannel,
        sender_mode: senderMode,
      });
      await updateSender.mutateAsync({ sender_mode: senderMode });
      await triggerRun.mutateAsync(true);
      toast.success("Listening settings saved. A refresh run has been queued.");
      onClose();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not save listening settings."));
    }
  };

  const toggleSource = (key: string) => {
    setEnabledSources((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  const toggleIntent = (key: string) => {
    setIntentFilters((current) =>
      current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 18 }}
            transition={{ type: "spring", duration: 0.32 }}
            className="relative z-10 flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#0b242e] text-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">
                  Social Listening
                </p>
                <h3 className="mt-1 text-[18px] font-semibold">Listen Settings</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid size-9 place-items-center rounded-full bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
                aria-label="Close listen settings"
              >
                <X size={18} />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              {isLoading ? (
                <div className="flex items-center justify-center py-10 text-[13px] text-white/60">
                  <Loader2 size={18} className="mr-2 animate-spin" />
                  Loading settings…
                </div>
              ) : (
                <>
              <section className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[13px] font-semibold">Sources monitored</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {SOURCE_SETTING_OPTIONS.map((sourceOption) => (
                    <label
                      key={sourceOption.key}
                      className="flex items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-[12px] text-white/75"
                    >
                      <input
                        type="checkbox"
                        checked={enabledSources.includes(sourceOption.key)}
                        onChange={() => toggleSource(sourceOption.key)}
                        className="accent-[#8dec66]"
                      />
                      {sourceOption.label}
                    </label>
                  ))}
                </div>
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[13px] font-semibold">Refresh cadence</p>
                  <div className="mt-3 space-y-2 text-[12px] text-white/70">
                    {[
                      { label: "Every 14 days", value: 14 as const },
                      { label: "Every 30 days", value: 30 as const },
                    ].map((cadence) => (
                      <label key={cadence.value} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="social-listening-cadence"
                          checked={cadenceDays === cadence.value}
                          onChange={() => setCadenceDays(cadence.value)}
                          className="accent-[#8dec66]"
                        />
                        {cadence.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[13px] font-semibold">Opportunity threshold</p>
                  <div className="mt-4">
                    <input
                      type="range"
                      min="40"
                      max="90"
                      value={minScore}
                      onChange={(event) => setMinScore(Number(event.target.value))}
                      className="w-full accent-[#8dec66]"
                    />
                    <div className="mt-2 flex justify-between text-[11px] text-white/45">
                      <span>Broad</span>
                      <span>{minScore}% score</span>
                      <span>Strict</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[13px] font-semibold">Intent signals</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {INTENT_SETTING_OPTIONS.map((intentOption) => (
                    <label
                      key={intentOption.key}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-[12px] text-white/75"
                    >
                      <input
                        type="checkbox"
                        checked={intentFilters.includes(intentOption.key)}
                        onChange={() => toggleIntent(intentOption.key)}
                        className="accent-[#8dec66]"
                      />
                      {intentOption.label}
                    </label>
                  ))}
                </div>
              </section>

              <section className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[13px] font-semibold">Routing rules</p>
                <div className="mt-3 grid gap-3 text-[12px] text-white/70 sm:grid-cols-2">
                  <label>
                    CRM destination
                    <select
                      value={crmDestination}
                      onChange={(event) =>
                        setCrmDestination(event.target.value as SocialListeningSettings["crm_destination"])
                      }
                      className="mt-1 h-10 w-full rounded-[10px] border border-white/10 bg-[#14343e] px-3 text-white outline-none"
                    >
                      <option value="qualified_pipeline">Qualified leads pipeline</option>
                      <option value="human_review">Human review queue</option>
                    </select>
                  </label>
                  <label>
                    Outreach channel
                    <select
                      value={outreachChannel}
                      onChange={(event) =>
                        setOutreachChannel(
                          event.target.value as SocialListeningSettings["outreach_channel_default"]
                        )
                      }
                      className="mt-1 h-10 w-full rounded-[10px] border border-white/10 bg-[#14343e] px-3 text-white outline-none"
                    >
                      <option value="email">Email first</option>
                      <option value="human_follow_up">Human follow-up</option>
                    </select>
                  </label>
                </div>
              </section>

              <section className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-semibold">Email sender</p>
                  <span className="rounded-full bg-white/10 px-2 py-1 text-[10px] uppercase tracking-wide text-white/60">
                    {senderSettings?.verification_status ?? "pending"}
                  </span>
                </div>
                <div className="mt-3 space-y-2 text-[12px] text-white/70">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="social-listening-sender"
                      checked={senderMode === "platform"}
                      onChange={() => setSenderMode("platform")}
                      className="accent-[#8dec66]"
                    />
                    Send using The Factory (recommended)
                  </label>
                  <label className={`flex items-center gap-2 ${orgVerified ? "" : "opacity-50"}`}>
                    <input
                      type="radio"
                      name="social-listening-sender"
                      checked={senderMode === "organization"}
                      onChange={() => orgVerified && setSenderMode("organization")}
                      disabled={!orgVerified}
                      className="accent-[#8dec66]"
                    />
                    Send using my organization email
                  </label>
                  {!orgVerified && (
                    <p className="text-[11px] text-white/45">
                      Verify your domain in SendGrid to enable organization sending.
                    </p>
                  )}
                </div>
              </section>
                </>
              )}
            </div>

            <div className="flex gap-3 border-t border-white/10 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="h-11 flex-1 rounded-[14px] bg-white/5 text-[13px] font-semibold text-white transition hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updateSettings.isPending || updateSender.isPending || triggerRun.isPending}
                onClick={handleSave}
                className="h-11 flex-1 rounded-[14px] bg-[#8dec66] text-[13px] font-semibold text-[#09232d] transition hover:bg-[#9bff73] disabled:opacity-60"
              >
                {updateSettings.isPending ? "Saving…" : "Save Settings"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function SocialListeningTab({ onOpenIcpBuilder }: { onOpenIcpBuilder: () => void }) {
  const { data: activeProfile } = useActiveIcpProfile();
  const { data: listenSettings } = useSocialListeningSettings();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [source, setSource] = useState("all");
  const [signalType, setSignalType] = useState("all");
  const [intent, setIntent] = useState("all");
  const [page, setPage] = useState(1);
  const [activeSignalId, setActiveSignalId] = useState<number | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const perPage = 10;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [source, signalType, intent]);

  const { metrics, metricsLoading, latestRun, isScanning, bootstrap } =
    useSocialListeningBootstrap();
  const triggerRun = useTriggerSocialListeningRun();
  const {
    data: signalsResult,
    isLoading: signalsLoading,
    error: signalsError,
  } = useSocialListeningSignals(
    {
      page,
      per_page: perPage,
      search: debouncedSearch,
      source,
      signal_type: signalType,
      buying_stage: intent,
    },
    { refetchInterval: isScanning ? 5000 : false }
  );

  const createOutreach = useCreateSignalOutreach();
  const setReminder = useSetSignalReminder();
  const syncToCrm = useSyncSignalToCrm();
  const dismissSignalMutation = useDismissSignal();

  const signals = signalsResult?.items ?? [];
  const meta = signalsResult?.meta ?? { current_page: 1, last_page: 1, per_page: perPage, total: 0 };

  useEffect(() => {
    if (signals.length === 0) {
      setActiveSignalId(null);
      return;
    }
    if (!activeSignalId || !signals.some((signal) => signal.id === activeSignalId)) {
      setActiveSignalId(signals[0].id);
    }
  }, [signals, activeSignalId]);

  const activeSignal = signals.find((signal) => signal.id === activeSignalId) ?? signals[0];

  const hasActiveFilters =
    debouncedSearch.length > 0 ||
    source !== "all" ||
    signalType !== "all" ||
    intent !== "all";

  const emptyState = getSocialListeningEmptyState(
    latestRun,
    metrics?.last_run_at,
    isScanning,
    hasActiveFilters
  );

  const icpContext = useMemo(
    () => ({
      industries: activeProfile?.config.industries,
      territories: activeProfile?.config.territories,
      name: activeProfile?.name,
    }),
    [activeProfile]
  );

  const scanPanel = isScanning ? (
    <SocialScanPanel
      stages={latestRun?.stages}
      signalsFound={Math.max(latestRun?.signals_created ?? 0, signals.length)}
      enabledSources={listenSettings?.enabled_sources ?? []}
      startedAt={latestRun?.started_at}
      icpContext={icpContext}
    />
  ) : null;

  const handleScanNow = () => {
    triggerRun.mutate(true, {
      onSuccess: () => toast.success("Social listening scan queued."),
      onError: (error) =>
        toast.error(getApiErrorMessage(error, "Could not start social listening scan.")),
    });
  };

  const handleCreateOutreach = (signal: SocialSignal) => {
    createOutreach.mutate(
      { id: signal.id },
      {
        onSuccess: () => toast.success("Outreach draft created."),
        onError: (error) =>
          toast.error(getApiErrorMessage(error, "Could not create outreach draft.")),
      }
    );
  };

  const handleSetReminder = (signal: SocialSignal) => {
    setReminder.mutate(
      { id: signal.id, note: signal.recommendedAction },
      {
        onSuccess: () => toast.success("Reminder set for 24 hours from now."),
        onError: (error) =>
          toast.error(getApiErrorMessage(error, "Could not set reminder.")),
      }
    );
  };

  const handleSyncToCrm = (signal: SocialSignal) => {
    syncToCrm.mutate(signal.id, {
      onSuccess: () => toast.success("Signal synced to CRM."),
      onError: (error) =>
        toast.error(getApiErrorMessage(error, "Could not sync signal to CRM.")),
    });
  };

  const handleRemoveSignal = (id: number) => {
    dismissSignalMutation.mutate(id, {
      onSuccess: () => {
        toast.success("Signal removed.");
        if (activeSignalId === id) {
          setActiveSignalId(null);
        }
      },
      onError: (error) =>
        toast.error(getApiErrorMessage(error, "Could not remove signal.")),
    });
  };

  const statCards: SocialStatCard[] = [
    {
      title: "Signals Detected",
      value: (metrics?.signals_detected ?? 0).toLocaleString(),
      percent: String(Math.max(0, metrics?.percent_change ?? 0)),
      unit: "Signals",
      active: true,
    },
    {
      title: "High Opportunities",
      value: (metrics?.high_opportunities ?? 0).toLocaleString(),
      percent: String(Math.max(0, metrics?.percent_change ?? 0)),
      unit: "Opportunities",
    },
    {
      title: "Added to CRM",
      value: (metrics?.added_to_crm ?? 0).toLocaleString(),
      percent: String(Math.max(0, metrics?.percent_change ?? 0)),
      unit: "Opportunities",
    },
  ];

  if (!activeProfile) {
    return (
      <div className="flex min-h-[645px] flex-col items-center justify-center rounded-[30px] bg-white px-8 py-16 text-center shadow-[0_8px_12px_6px_rgba(0,0,0,0.15),0_4px_4px_rgba(0,0,0,0.3)]">
        <p className="max-w-md text-[14px] font-medium text-[#616263]">
          Activate an ICP profile to start social listening against your target market.
        </p>
        <button
          type="button"
          onClick={onOpenIcpBuilder}
          className="mt-5 h-11 rounded-[14px] bg-[#09232d] px-5 text-sm font-medium text-white transition-colors hover:bg-[#0c2e3b]"
        >
          Open ICP Builder
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_406px] items-stretch gap-[25px] max-xl:grid-cols-1 xl:h-[700px]">
        <div className="flex h-full min-h-0 flex-col gap-[17px]">
          <div className="shrink-0 grid grid-cols-3 items-start gap-[25px] max-lg:grid-cols-2 max-sm:grid-cols-1">
            {statCards.map((card) => (
              <MetricCard
                key={card.title}
                title={card.title}
                value={metricsLoading && !isScanning ? "—" : card.value}
                percent={metricsLoading && !isScanning ? "—" : card.percent}
                active={card.active}
                unit={card.unit}
                isScanning={isScanning && card.active}
              />
            ))}
          </div>
          <div className="shrink-0">
            <SocialListeningFilters
              search={search}
              source={source}
              signalType={signalType}
              intent={intent}
              onSearchChange={setSearch}
              onSourceChange={setSource}
              onSignalTypeChange={setSignalType}
              onIntentChange={setIntent}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onScanNow={handleScanNow}
              isScanning={isScanning}
              isScanPending={triggerRun.isPending || bootstrap.isPending}
            />
          </div>
          {signalsError && isMissingActiveIcp(signalsError) ? (
            <div className="flex flex-1 items-center justify-center rounded-[30px] bg-white p-8 text-[13px] text-[#616263]">
              Select an active ICP profile first — open ICP Builder to create or activate one.
            </div>
          ) : (
            <SocialSignalsTable
              signals={signals}
              activeSignalId={activeSignalId}
              onHoverSignal={(signal) => setActiveSignalId(signal.id)}
              onRemoveSignal={handleRemoveSignal}
              onCreateOutreach={handleCreateOutreach}
              onAddToCrm={handleSyncToCrm}
              onSetReminder={handleSetReminder}
              page={meta.current_page}
              lastPage={Math.max(meta.last_page, 1)}
              total={meta.total}
              perPage={meta.per_page}
              onPageChange={setPage}
              isLoading={signalsLoading}
              isScanning={isScanning}
              emptyState={emptyState}
              onEmptyScanNow={handleScanNow}
              onEmptyOpenSettings={() => setIsSettingsOpen(true)}
              enabledSources={listenSettings?.enabled_sources}
              scanPanel={scanPanel}
            />
          )}
        </div>
        {activeSignal ? (
          <SocialOpportunityDetail
            signal={activeSignal}
            isCreatingOutreach={createOutreach.isPending}
            isSettingReminder={setReminder.isPending}
            isSyncingToCrm={syncToCrm.isPending}
            onCreateOutreach={() => handleCreateOutreach(activeSignal)}
            onSetReminder={() => handleSetReminder(activeSignal)}
            onSyncToCrm={() => handleSyncToCrm(activeSignal)}
          />
        ) : isScanning ? (
          <SocialOpportunityDetailSkeleton />
        ) : (
          <SocialOpportunityEmptyState />
        )}
      </div>
      <ListeningSettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </>
  );
}

export function SalesEngineView() {
  const [chatExpanded, setChatExpanded] = useState(false);
  const [isIcpModalOpen, setIsIcpModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<SalesEngineTab>("social-listening");
  const { data: activeProfile } = useActiveIcpProfile();
  const { data: metrics } = useSalesEngineMetrics();

  const leadsInCrm = metrics?.leads_in_crm ?? 0;
  const leadsPendingReview = metrics?.leads_pending_review ?? 0;
  const formatMetric = (value: number) => value.toLocaleString();

  return (
    <div className="min-h-[calc(100vh-80px)] overflow-x-hidden bg-[#f8f8f8] px-6 py-8 text-[#09232d] max-sm:px-4">
      <div className="mx-auto flex w-full max-w-[1340px] flex-col gap-7">
        {!chatExpanded && (
          <SalesEngineTabs
            activeTab={activeTab}
            onChange={(tab) => {
              setActiveTab(tab);
              setChatExpanded(false);
            }}
          />
        )}

        {activeTab === "social-listening" && !chatExpanded ? (
          <SocialListeningTab onOpenIcpBuilder={() => setIsIcpModalOpen(true)} />
        ) : (
          <>
        {!chatExpanded && (
          <div className="grid grid-cols-[269px_269px_minmax(360px,1fr)_auto] items-start gap-[25px] max-xl:grid-cols-2 max-lg:grid-cols-1">
            <MetricCard
              title="Lead Metrics"
              value={formatMetric(leadsInCrm)}
              percent="—"
              active
              unit="Leads"
            />
            <MetricCard
              title="Pending Review"
              value={formatMetric(leadsPendingReview)}
              percent="—"
              unit="Drafts"
            />
            <TrendChart />
            <div className="flex flex-col gap-2 pt-1 max-xl:col-span-2 max-lg:col-span-1 max-lg:pt-0">
              <div className="flex items-center gap-3">
                <Link
                  href="/crm?source=sales_engine"
                  className="flex h-11 items-center gap-2.5 rounded-[14px] border border-[#d1d1d1] bg-white px-4 text-sm font-medium text-[#222222] shadow-[0_1px_2px_rgba(0,0,0,0.03)] transition-colors hover:border-[#bfbfbf] hover:bg-[#f8f8f8]"
                >
                  <PipelineGaugeIcon className="h-5 w-5 text-[#8a8a8a]" />
                  View CRM Pipeline
                </Link>
                <button
                  type="button"
                  onClick={() => setIsIcpModalOpen(true)}
                  className="flex h-11 items-center gap-2.5 rounded-[14px] bg-[#09232d] px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#0c2e3b] cursor-pointer"
                >
                  <IcpBuilderIcon className="h-5 w-5 text-white" />
                  ICP Builder
                </button>
              </div>
              {activeProfile && (
                <div className="flex items-center gap-1.5 px-1 text-[11px] text-gray-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-medium text-gray-400">Active ICP:</span>
                  <span className="font-semibold text-[#09232d] truncate max-w-[240px]">
                    {activeProfile.name}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <div
          className={
            chatExpanded
              ? "grid grid-cols-1 gap-[25px]"
              : "grid grid-cols-[minmax(0,949px)_368px] gap-[25px] max-xl:grid-cols-1"
          }
        >
          <ChatWorkspace
            expanded={chatExpanded}
            onToggleExpanded={() => setChatExpanded((current) => !current)}
            onOpenIcpBuilder={() => setIsIcpModalOpen(true)}
          />
          {!chatExpanded && <OutreachPanel />}
        </div>
          </>
        )}
      </div>

      <IcpBuilderModal isOpen={isIcpModalOpen} onClose={() => setIsIcpModalOpen(false)} />
    </div>
  );
}
