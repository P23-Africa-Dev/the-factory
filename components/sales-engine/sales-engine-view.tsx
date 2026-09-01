"use client";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { toast } from "sonner";
import { IcpBuilderModal } from "./icp-builder-modal";
import { ChatMessageBody } from "./chat-message-body";
import { useActivateIcpProfile, useActiveIcpProfile, useIcpProfiles } from "@/hooks/use-sales-engine-icp";
import { isMissingActiveIcp, useSendChatMessage } from "@/hooks/use-sales-engine-chat";
import { useSalesEngineMetrics } from "@/hooks/use-sales-engine-metrics";
import { useSalesEngineOutreach } from "@/hooks/use-sales-engine-outreach";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatRelativeTime, type ChatIntent, type ChatLead } from "@/lib/api/sales-engine";
import {
  Check,
  ChevronDown,
  Copy,
  Expand,
  Globe2,
  Lightbulb,
  Loader2,
  MessageCircle,
  Minimize2,
  MoreVertical,
  Plus,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  UsersRound,
  X,
} from "lucide-react";

type ChatMessage = {
  id: number;
  role: "assistant" | "user";
  body: string;
  intent?: ChatIntent;
  leads?: ChatLead[];
};

type ActionIntent = Exclude<ChatIntent, "freeform">;

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

const thinkingStagesByIntent: Record<ChatIntent, readonly string[]> = {
  freeform: ["Thinking…"],
  quick_research: [
    "Decomposing your research question…",
    "Scanning web & registries…",
    "Cross-referencing signals…",
    "Synthesizing insights…",
  ],
  generate_leads: [
    "Analyzing your brief…",
    "Scanning web & social signals…",
    "Extracting buying intent…",
    "Compiling ranked results…",
  ],
  create_outreach: [
    "Reviewing target context…",
    "Drafting message…",
    "Checking compliance tone…",
  ],
};

const weekDays = ["Mon", "Tues", "Weds", "Thurs", "Fri", "Sat"];

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
}: {
  title: string;
  value: string;
  percent: string;
  active?: boolean;
}) {
  return (
    <section
      className={`relative h-[126px] overflow-hidden rounded-[15px] border border-[rgba(179,179,179,0.2)] px-5 py-3 shadow-[0_1px_3px_1px_rgba(0,0,0,0.15),0_1px_2px_rgba(0,0,0,0.3)] ${
        active ? "bg-[#0b242e] text-white" : "bg-white text-[#0b242e]"
      }`}
    >
      <div className="flex items-start justify-between">
        <p className={`text-[14px] font-light leading-[19px] ${active ? "text-white" : "text-[#293e46]"}`}>
          {title}
        </p>
        <MoreVertical size={15} className={active ? "text-white/45" : "text-[#09232d]/40"} />
      </div>

      <div className="absolute left-5 top-[48px]">
        <div className="flex items-end gap-1">
          <p className="text-[32px] font-semibold leading-[43px]">{value}</p>
          <p className={`pb-2 text-[9px] font-semibold ${active ? "text-white" : "text-[#0b242e]"}`}>
            Leads
          </p>
        </div>
        <p className={`mt-[-4px] text-[8px] leading-[16px] ${active ? "text-[#c8c8c8]" : "text-[#34373c]"}`}>
          {percent}% increase this week
        </p>
      </div>

      <div className="absolute right-[17px] top-[19px] grid size-[108px] place-items-center">
        <div
          className={`absolute size-[84px] rounded-full border-[7px] ${
            active ? "border-[#8dec66]" : "border-[#ff604c]"
          } border-l-transparent rotate-[-24deg]`}
        />
        <div className={`absolute size-[49px] rounded-full ${active ? "bg-[#14343e]" : "bg-[#f9f9f9]"}`} />
        <p className={`relative text-[8px] font-semibold ${active ? "text-[#c8c8c8]" : "text-[#34373c]"}`}>
          {percent}%
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

function ThinkingBubble({ stage }: { stage: string }) {
  return (
    <div className="max-w-[430px] rounded-[18px] bg-[#f8f8f8] px-4 py-3 text-[#09232d] shadow-[inset_0_0_0_1px_rgba(9,35,45,0.04)]">
      <div className="flex items-center gap-3">
        <div className="relative grid size-8 place-items-center rounded-full bg-[#09232d] text-white">
          <Sparkles size={14} className="animate-pulse" />
          <span className="absolute inset-[-4px] rounded-full border border-[#16b37d]/40 animate-ping" />
        </div>
        <div className="min-w-0">
          <p key={stage} className="animate-in fade-in slide-in-from-bottom-1 text-[11px] font-semibold duration-300">
            {stage}
          </p>
          <div className="mt-1.5 flex gap-1">
            <span className="h-1.5 w-8 animate-pulse rounded-full bg-[#16b37d]" />
            <span className="h-1.5 w-5 animate-pulse rounded-full bg-[#16b37d]/60 [animation-delay:150ms]" />
            <span className="h-1.5 w-3 animate-pulse rounded-full bg-[#16b37d]/30 [animation-delay:300ms]" />
          </div>
        </div>
      </div>
    </div>
  );
}

function LeadInlineResults({ leads }: { leads: ChatLead[] }) {
  return (
    <div className="mt-3 grid max-w-[640px] gap-2 sm:grid-cols-3">
      {leads.map((lead) => (
        <div key={lead.id ?? lead.name} className="rounded-[14px] border border-[#09232d]/10 bg-white px-3 py-2 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[10px] font-bold text-[#09232d]">{lead.name}</p>
            <span className="shrink-0 rounded-full bg-[#16b37d]/10 px-1.5 py-0.5 text-[8px] font-bold text-[#087652]">
              {lead.score}
            </span>
          </div>
          <p className="mt-1 text-[8px] text-[#09232d]/50">{lead.source}</p>
          <p className="mt-1 line-clamp-2 text-[8px] leading-[10px] text-[#09232d]/65">{lead.summary}</p>
        </div>
      ))}
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
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [selectedIntent, setSelectedIntent] = useState<ChatIntent>("freeform");
  const [thinkingStage, setThinkingStage] = useState<string>(thinkingStagesByIntent.freeform[0]);
  const [isIcpMenuOpen, setIsIcpMenuOpen] = useState(false);
  const [icpMenuPosition, setIcpMenuPosition] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const transcriptRef = useRef<HTMLDivElement>(null);
  const thinkingIntervalRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  // Local React keys for messages — independent of the API's session-scoped message
  // ids, which restart from 1 per session and would collide with the hardcoded
  // welcome message (id: 1).
  const nextMessageIdRef = useRef(2);
  function nextMessageId() {
    return nextMessageIdRef.current++;
  }
  const icpMenuRef = useRef<HTMLDivElement>(null);
  const icpTriggerRef = useRef<HTMLButtonElement>(null);

  const { data: icpProfiles = [], isLoading: isIcpProfilesLoading } = useIcpProfiles();
  const activateIcpProfile = useActivateIcpProfile({
    onSuccess: (profile) => toast.success(`Switched active ICP to "${profile.name}"`),
    onError: (error) => toast.error(getApiErrorMessage(error, "Failed to switch ICP build.")),
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

  const sendMessage = useSendChatMessage({
    onSuccess: ({ assistant_message }) => {
      setMessages((current) => [
        ...current,
        {
          id: nextMessageId(),
          role: "assistant",
          body: assistant_message.body,
          leads: assistant_message.leads ?? undefined,
        },
      ]);
    },
    onError: (error) => {
      toast.error(
        isMissingActiveIcp(error)
          ? "Select an active ICP profile first — open ICP Builder to create or activate one."
          : getApiErrorMessage(error, "Sales Engine couldn't process that request.")
      );
    },
  });
  const isThinking = sendMessage.isPending;

  function stopThinkingCycle() {
    if (thinkingIntervalRef.current != null) {
      window.clearInterval(thinkingIntervalRef.current);
      thinkingIntervalRef.current = null;
    }
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }

  function startThinkingCycle(intent: ChatIntent) {
    const stages = thinkingStagesByIntent[intent];
    let stageIndex = 0;
    setThinkingStage(stages[0]);
    stopThinkingCycle();
    thinkingIntervalRef.current = window.setInterval(() => {
      stageIndex = (stageIndex + 1) % stages.length;
      setThinkingStage(stages[stageIndex]);
    }, 1200);
  }

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
    startThinkingCycle(intent);

    sendMessage.mutate(
      { body: trimmed, intent },
      { onSettled: () => stopThinkingCycle() }
    );
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
  }, [messages, isThinking, thinkingStage]);

  useEffect(() => () => stopThinkingCycle(), []);

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
          {messages.map((message, index) => (
            <div key={message.id} className={message.role === "user" ? "ml-auto max-w-[78%]" : "max-w-full"}>
              {message.role === "user" && message.intent && message.intent !== "freeform" && (
                <div className="mb-1.5 flex justify-end">
                  <IntentModeChip intent={message.intent} compact />
                </div>
              )}
              <div
                className={
                  message.role === "user"
                    ? "rounded-[18px] bg-[#09232d] px-4 py-3 text-[12px] leading-[16px] text-white"
                    : index === 0
                      ? "text-[12px] leading-[15px] text-[#09232d]"
                      : "rounded-[18px] bg-[#f8f8f8] px-4 py-3 text-[12px] leading-[16px] text-[#09232d]"
                }
              >
                <ChatMessageBody
                  content={message.body}
                  variant={message.role === "user" ? "user" : index === 0 ? "welcome" : "assistant"}
                />
              </div>
              {message.leads && <LeadInlineResults leads={message.leads} />}
              {index === 0 && (
                <div className="mt-5 flex items-center gap-5 text-[#cfcfcf]">
                  <ThumbsUp size={14} />
                  <ThumbsDown size={14} />
                  <Copy size={14} />
                </div>
              )}
            </div>
          ))}
          {isThinking && <ThinkingBubble stage={thinkingStage} />}
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

export function SalesEngineView() {
  const [chatExpanded, setChatExpanded] = useState(false);
  const [isIcpModalOpen, setIsIcpModalOpen] = useState(false);
  const { data: activeProfile } = useActiveIcpProfile();
  const { data: metrics } = useSalesEngineMetrics();

  const leadsDiscovered = metrics?.leads_discovered ?? 0;
  const qualifiedLeads = metrics?.qualified_leads ?? 0;
  const formatMetric = (value: number) => value.toLocaleString();

  return (
    <div className="min-h-[calc(100vh-80px)] overflow-x-hidden bg-[#f8f8f8] px-6 py-8 text-[#09232d] max-sm:px-4">
      <div className="mx-auto flex w-full max-w-[1340px] flex-col gap-7">
        {!chatExpanded && (
          <div className="grid grid-cols-[269px_269px_minmax(360px,1fr)_auto] items-start gap-[25px] max-xl:grid-cols-2 max-lg:grid-cols-1">
            <MetricCard title="Lead Metrics" value={formatMetric(leadsDiscovered)} percent="—" active />
            <MetricCard title="Qualified Lead Metrics" value={formatMetric(qualifiedLeads)} percent="—" />
            <TrendChart />
            <div className="flex flex-col gap-2 pt-1 max-xl:col-span-2 max-lg:col-span-1 max-lg:pt-0">
              <div className="flex items-center gap-3">
                <Link
                  href="/crm"
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
      </div>

      <IcpBuilderModal isOpen={isIcpModalOpen} onClose={() => setIsIcpModalOpen(false)} />
    </div>
  );
}
