"use client";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { toast } from "sonner";
import { IcpBuilderModal } from "./icp-builder-modal";
import { ChatMessageBody } from "./chat-message-body";
import { SearchableSelect, type SelectOption } from "@/components/ui/searchable-select";
import { useActivateIcpProfile, useActiveIcpProfile, useIcpProfiles } from "@/hooks/use-sales-engine-icp";
import { isMissingActiveIcp, useSendChatMessage } from "@/hooks/use-sales-engine-chat";
import { useSalesEngineMetrics } from "@/hooks/use-sales-engine-metrics";
import { useSalesEngineOutreach } from "@/hooks/use-sales-engine-outreach";
import { getApiErrorMessage } from "@/lib/api/errors";
import { formatRelativeTime, type ChatIntent, type ChatLead } from "@/lib/api/sales-engine";
import {
  Building2,
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
};

type ActionIntent = Exclude<ChatIntent, "freeform">;
type SalesEngineTab = "smart-lead" | "social-listening";
type SocialSignal = {
  id: number;
  signal: string;
  source: "LinkedIn Post" | "X/Twitter Post" | "Reddit Post";
  sourceIcon: string;
  persona: string;
  company: string;
  location: string;
  intent: string;
  intentColor: string;
  description: string;
  score: number;
  profile: string;
  reasons: string[];
  signalType: string;
  buyingStage: string;
  problem: string;
  urgency: string;
  suggestedMessage: string;
  postUrl?: string;
  entityType?: "company" | "individual";
};

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
const salesEngineTabs: Array<{ id: SalesEngineTab; label: string }> = [
  { id: "smart-lead", label: "Smart Lead" },
  { id: "social-listening", label: "Social Listening" },
];

const socialStatCards: SocialStatCard[] = [
  { title: "Signals Detected", value: "4,100", percent: "73", unit: "Signals", active: true },
  { title: "High Opportunities", value: "1,100", percent: "43", unit: "Opportunities" },
  { title: "Added to CRM", value: "34", percent: "43", unit: "Opportunities" },
];

const socialSignals: SocialSignal[] = [
  {
    id: 1,
    signal: "We're struggling to consistently generate qualified leads in Nigeria. Any recommendations for agencies that actually understand B2B?",
    source: "LinkedIn Post",
    sourceIcon: "in",
    persona: "Marketing Director",
    company: "ABC Technologies",
    location: "Lagos, Nigeria\n51-200 employees",
    intent: "Recommendation",
    intentColor: "#6ec758",
    description: "Actively looking for solutions",
    score: 73,
    profile: "Thabo Molefe",
    reasons: [
      "Explicit problem with current situation",
      "Actively asking for recommendations",
      "Relevant decision maker (Marketing Director)",
      "Matches ICP (Industry, Size, Location)",
      "Recent activity (Posted 2 hours ago)",
    ],
    signalType: "Recommendation",
    buyingStage: "Consideration",
    problem: "Generating qualified leads consistently",
    urgency: "Medium-High",
    entityType: "company",
    postUrl: "https://www.linkedin.com/feed/",
    suggestedMessage:
      "Hi John,\nI came across your post about the challenges of generating qualified leads in Nigeria. We help B2B companies improve their lead generation and connect with more qualified prospects.",
  },
  {
    id: 2,
    signal: "Our CRM contract expires next month. Looking for something easier to implement. Anyone used Zoho or HubSpot?",
    source: "X/Twitter Post",
    sourceIcon: "X",
    persona: "Sales Manager",
    company: "Greenfield Ltd",
    location: "Lagos, Nigeria\n51-200 employees",
    intent: "Switching",
    intentColor: "#f8725d",
    description: "Evaluating alternatives",
    score: 73,
    profile: "Aisha Bello",
    reasons: [
      "Contract renewal creates a near-term trigger",
      "Named competing tools in the current workflow",
      "Relevant decision maker (Sales Manager)",
      "Clear need for easier implementation",
      "Recent activity (Posted 2 hours ago)",
    ],
    signalType: "Switching",
    buyingStage: "Vendor Evaluation",
    problem: "CRM implementation friction",
    urgency: "High",
    entityType: "company",
    postUrl: "https://x.com/search?q=CRM",
    suggestedMessage:
      "Hi Aisha,\nI noticed your team is evaluating CRM options before renewal. Factory 23 can help compare implementation effort and identify a lower-friction path for your sales process.",
  },
  {
    id: 3,
    signal: "We're struggling to consistently generate qualified leads in Nigeria. Any recommendations for agencies that actually understand B2B?",
    source: "LinkedIn Post",
    sourceIcon: "in",
    persona: "Marketing Director",
    company: "ABC Technologies",
    location: "Lagos, Nigeria\n51-200 employees",
    intent: "Recommendation",
    intentColor: "#6ec758",
    description: "Actively looking for solutions",
    score: 73,
    profile: "Thabo Molefe",
    reasons: [
      "Explicit problem with current situation",
      "Actively asking for recommendations",
      "Relevant decision maker (Marketing Director)",
      "Matches ICP (Industry, Size, Location)",
      "Recent activity (Posted 2 hours ago)",
    ],
    signalType: "Recommendation",
    buyingStage: "Consideration",
    problem: "Generating qualified leads consistently",
    urgency: "Medium-High",
    entityType: "company",
    postUrl: "https://www.linkedin.com/feed/",
    suggestedMessage:
      "Hi John,\nI came across your post about the challenges of generating qualified leads in Nigeria. We help B2B companies improve their lead generation and connect with more qualified prospects.",
  },
  {
    id: 4,
    signal: "Anyone know how much it actually costs to build a mobile app like these fintech apps?",
    source: "Reddit Post",
    sourceIcon: "r",
    persona: "Marketing Director",
    company: "Individual",
    location: "",
    intent: "Price",
    intentColor: "#67b7f4",
    description: "Gathering pricing information",
    score: 73,
    profile: "Daniel Okafor",
    reasons: [
      "Pricing question suggests active budgeting",
      "Mobile product scope fits Factory 23 discovery",
      "Open to external recommendations",
      "Fintech context has high commercial value",
      "Recent activity (Posted 2 hours ago)",
    ],
    signalType: "Price",
    buyingStage: "Research",
    problem: "Understanding app build cost",
    urgency: "Medium",
    entityType: "individual",
    postUrl: "https://www.reddit.com/r/startups/",
    suggestedMessage:
      "Hi Daniel,\nI saw your question about fintech app build costs. We can help you break the scope into phases and estimate a realistic budget before you commit to a vendor.",
  },
];

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
}: {
  title: string;
  value: string;
  percent: string;
  active?: boolean;
  unit?: string;
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
          {percent}% increase this week
        </p>
      </div>

      <div className="absolute right-[17px] top-[19px] grid size-[108px] place-items-center">
        <div
          className={`sales-gauge-spin absolute size-[84px] rounded-full border-[7px] ${
            active ? "border-[#3E7210]" : "border-[#ff604c]"
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

function ViewAllOutreachIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M4.66797 9.33341L6.5299 7.47148C6.79024 7.21115 7.21237 7.21115 7.4727 7.47148L8.5299 8.52868C8.79024 8.78901 9.21237 8.78901 9.4727 8.52868L11.3346 6.66675" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M13.9995 8.66667C14 8.4536 14 8.23153 14 8C14 5.17157 14 3.75736 13.1213 2.87868C12.2427 2 10.8284 2 8 2C5.17157 2 3.75736 2 2.87868 2.87868C2 3.75736 2 5.17157 2 8C2 10.8284 2 12.2427 2.87868 13.1213C3.75736 14 5.17157 14 8 14C8.23153 14 8.4536 14 8.66667 13.9995" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M12.6505 10.6811C12.6543 10.662 12.6817 10.662 12.6855 10.6811C12.8881 11.6722 13.6626 12.4466 14.6537 12.6492C14.6728 12.6531 14.6728 12.6804 14.6537 12.6843C13.6626 12.8869 12.8881 13.6614 12.6855 14.6524C12.6817 14.6716 12.6543 14.6716 12.6505 14.6524C12.4479 13.6614 11.6734 12.8869 10.6823 12.6843C10.6632 12.6804 10.6632 12.6531 10.6823 12.6492C11.6734 12.4466 12.4479 11.6722 12.6505 10.6811Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function AllOutreachModal({
  isOpen,
  onClose,
  items,
}: {
  isOpen: boolean;
  onClose: () => void;
  items: Array<{
    id: number;
    name: string;
    channel: string;
    preview: string;
    occurred_at: string;
    accentBg?: string;
    accentIcon?: string;
  }>;
}) {
  const [query, setQuery] = useState("");

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.channel.toLowerCase().includes(q) ||
        item.preview.toLowerCase().includes(q)
    );
  }, [items, query]);

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
            className="relative z-10 flex max-h-[88vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[28px] border border-white/10 bg-[#09232d] text-white shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/40">
                  Smart Lead
                </p>
                <h3 className="mt-1 text-[18px] font-semibold">All Outreach Activities</h3>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="grid size-9 place-items-center rounded-full bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white cursor-pointer"
                aria-label="Close modal"
              >
                <X size={18} />
              </button>
            </div>

            <div className="border-b border-white/10 px-6 py-3">
              <label className="flex h-9 w-full items-center gap-2 rounded-full bg-white/5 px-3.5 text-white">
                <Search size={14} className="text-white/40" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search activities by recipient, channel, or message…"
                  className="min-w-0 flex-1 bg-transparent text-[12px] text-white outline-none placeholder:text-white/40"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="text-white/40 hover:text-white cursor-pointer"
                  >
                    <X size={13} />
                  </button>
                )}
              </label>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">
              {filteredItems.length === 0 ? (
                <div className="flex h-[200px] flex-col items-center justify-center text-center text-white/50 text-[13px]">
                  No outreach activities found.
                </div>
              ) : (
                filteredItems.map((item, index) => {
                  const fallback = OUTREACH_FALLBACK_COLORS[index % OUTREACH_FALLBACK_COLORS.length];
                  const useApiColors = item.accentBg?.startsWith("#");
                  return (
                    <OutreachCard
                      key={item.id}
                      color={useApiColors ? item.accentBg! : fallback.color}
                      icon={useApiColors ? "" : fallback.icon}
                      iconColor={useApiColors ? item.accentIcon : undefined}
                      name={item.name}
                      channel={item.channel}
                      preview={item.preview}
                      time={formatRelativeTime(item.occurred_at)}
                    />
                  );
                })
              )}
            </div>

            <div className="flex justify-end border-t border-white/10 px-6 py-4">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-[12px] bg-white/10 px-5 text-[12px] font-semibold text-white transition hover:bg-white/15 cursor-pointer"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function OutreachPanel() {
  const { data: items = [] } = useSalesEngineOutreach();
  const [isAllOutreachOpen, setIsAllOutreachOpen] = useState(false);

  return (
    <>
      <aside className="ticket-cutout relative h-[600px] overflow-hidden rounded-[20px] bg-[#09232d] px-[36px] py-[33px] text-white shadow-sm max-xl:h-[520px] max-sm:px-6">
        <header className="mb-6 flex items-center justify-between gap-2">
          <h2 className="text-[13px] font-bold leading-tight">Recent Outreach Activities</h2>
          <button
            type="button"
            onClick={() => setIsAllOutreachOpen(true)}
            className="flex h-[34px] shrink-0 items-center gap-1.5 rounded-[12px] bg-white px-3 text-[12px] font-bold text-[#09232d] shadow-sm transition hover:bg-gray-100 cursor-pointer"
          >
            <ViewAllOutreachIcon className="size-4 text-[#09232d]" />
            <span>View All</span>
          </button>
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
    <AllOutreachModal
      isOpen={isAllOutreachOpen}
      onClose={() => setIsAllOutreachOpen(false)}
      items={items}
    />
  </>
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
      className={`grid size-[22px] shrink-0 place-items-center rounded-[6px] text-[10px] font-bold text-white shadow-sm ${
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
}: {
  signal: SocialSignal;
  onRemove?: (id: number) => void;
  onSelect?: (signal: SocialSignal) => void;
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
                toast.success(`Opening outreach composer for ${signal.company} (${signal.profile})…`);
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
                toast.success(`Added ${signal.company} to CRM pipeline.`);
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
                toast.success(`Reminder set for ${signal.company}.`);
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
                onRemove?.(signal.id);
                toast.success(`Signal from ${signal.company} removed.`);
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
  onHover,
  onRemoveSignal,
}: {
  signal: SocialSignal;
  onHover: (signal: SocialSignal) => void;
  onRemoveSignal?: (id: number) => void;
}) {
  const isIndividual = signal.entityType === "individual" || signal.company.toLowerCase() === "individual";

  return (
    <tr
      onMouseEnter={() => onHover(signal)}
      onFocus={() => onHover(signal)}
      tabIndex={0}
      className="group bg-[#f4f4f4] text-[#616263] outline-none transition-colors duration-200 hover:bg-[#09232d] hover:text-white focus:bg-[#09232d] focus:text-white"
    >
      <td className="rounded-l-[20px] px-4 py-3">
        <div className="flex min-w-[230px] gap-3">
          <SourceBadge sourceIcon={signal.sourceIcon} />
          <p className="line-clamp-4 text-[9px] leading-[11px] text-[#616263] transition-colors group-hover:text-white group-focus:text-white">
            {signal.signal}
          </p>
        </div>
      </td>
      <td className="px-3 py-3 align-middle">
        <p className="w-[64px] text-[8px] leading-[11px]">{signal.source}</p>
        <p className="mt-1 text-[8px] text-[#616263]/70 transition-colors group-hover:text-white/70 group-focus:text-white/70">2hr ago</p>
      </td>
      <td className="px-3 py-3 align-middle">
        <p className="w-[68px] text-[8px] leading-[11px]">{signal.persona}</p>
      </td>
      <td className="px-3 py-3 align-middle">
        <div className="flex min-w-[150px] items-center gap-2">
          {isIndividual ? (
            <User
              size={20}
              className="shrink-0 text-[#616263] transition-colors group-hover:text-white group-focus:text-white"
            />
          ) : (
            <CompanyBuildingIcon
              className="size-5 shrink-0 text-[#616263] transition-colors group-hover:text-white group-focus:text-white"
            />
          )}
          <div>
            <p className="text-[9px] font-semibold leading-[11px]">{signal.company}</p>
            {signal.location && <p className="whitespace-pre-line text-[8px] leading-[10px] opacity-80">{signal.location}</p>}
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
        <div className="block group-hover:hidden group-focus:hidden">
          <ScoreGauge score={signal.score} />
        </div>
        <div className="hidden group-hover:block group-focus:block">
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
              toast.info(`Opening message composer for ${signal.profile || signal.company}…`);
            }}
            className="grid size-6 place-items-center rounded-full transition hover:bg-black/10 group-hover:hover:bg-white/20 cursor-pointer"
          >
            <MessageCircle
              size={15}
              className="text-[#616263] transition-colors group-hover:text-white group-focus:text-white"
            />
          </button>
          <SignalActionMenu signal={signal} onRemove={onRemoveSignal} onSelect={onHover} />
        </div>
      </td>
    </tr>
  );
}

function SocialSignalsTable({
  signals,
  onHoverSignal,
  onRemoveSignal,
}: {
  signals: SocialSignal[];
  onHoverSignal: (signal: SocialSignal) => void;
  onRemoveSignal?: (id: number) => void;
}) {
  return (
    <section className="flex min-h-[416px] flex-1 flex-col rounded-[30px] bg-white p-2 shadow-[0_8px_12px_6px_rgba(0,0,0,0.15),0_4px_4px_rgba(0,0,0,0.3)]">
      <div className="min-h-0 flex-1 overflow-auto pr-1">
        <table className="w-full min-w-[860px] border-separate border-spacing-y-2">
          <thead>
            <tr className="text-[9px] font-semibold text-[#333333]">
              <th className="px-4 py-1 text-left">Signal</th>
              <th className="px-3 py-1 text-left">Source</th>
              <th className="px-3 py-1 text-left">Persona</th>
              <th className="px-3 py-1 text-left">Company</th>
              <th className="px-3 py-1 text-left">Intent</th>
              <th className="px-3 py-1 text-center">Score</th>
              <th className="px-4 py-1 text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((signal) => (
              <SocialSignalRow
                key={signal.id}
                signal={signal}
                onHover={onHoverSignal}
                onRemoveSignal={onRemoveSignal}
              />
            ))}
          </tbody>
        </table>
        {signals.length === 0 && (
          <div className="flex h-[220px] items-center justify-center text-[12px] font-medium text-[#616263]">
            No matching signals found.
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-8 pb-3 pt-1 text-[9px] font-semibold text-[#333333] max-sm:px-3">
        <span>Showing 1 - {Math.max(signals.length, 1)} of 213 Signals</span>
        <div className="flex items-center gap-2">
          <button type="button" className="px-2 text-[#c1c1c1]">Prev</button>
          {[1, 2, 3].map((page) => (
            <button
              key={page}
              type="button"
              className={`grid size-8 place-items-center rounded-[8px] border text-[10px] ${
                page === 1 ? "border-[#3f83f8] bg-[#3f83f8] text-white" : "border-[#f1f1f1] bg-white text-[#333333]"
              }`}
            >
              {page}
            </button>
          ))}
          <span className="px-2 text-[13px]">...</span>
          <button type="button" className="grid size-8 place-items-center rounded-[8px] border border-[#f1f1f1] bg-white text-[10px]">10</button>
          <button type="button" className="px-2">Next</button>
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
  isScanning,
  onSearchChange,
  onSourceChange,
  onSignalTypeChange,
  onIntentChange,
  onOpenSettings,
  onScan,
}: {
  search: string;
  source: string;
  signalType: string;
  intent: string;
  isScanning?: boolean;
  onSearchChange: (value: string) => void;
  onSourceChange: (value: string) => void;
  onSignalTypeChange: (value: string) => void;
  onIntentChange: (value: string) => void;
  onOpenSettings: () => void;
  onScan?: () => void;
}) {
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
        onClick={onScan}
        disabled={isScanning}
        className="flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-3 text-[10px] font-medium text-[#34373c] transition-colors hover:bg-gray-100 disabled:opacity-60 cursor-pointer"
      >
        {isScanning ? (
          <Loader2 size={13} className="animate-spin text-[#09232d]" />
        ) : (
          <Scan size={13} className="text-[#09232d]" />
        )}
        <span>{isScanning ? "Scanning…" : "Scan"}</span>
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

function SocialOpportunityDetail({ signal }: { signal: SocialSignal }) {
  const isIndividual = signal.entityType === "individual" || signal.company.toLowerCase() === "individual";
  const [hasCopiedMessage, setHasCopiedMessage] = useState(false);

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
    signal.postUrl ||
    (signal.source === "LinkedIn Post"
      ? "https://www.linkedin.com"
      : signal.source === "X/Twitter Post"
      ? "https://x.com"
      : "https://www.reddit.com");

  return (
    <aside className="flex min-h-[645px] flex-col overflow-hidden rounded-[30px] bg-white shadow-[0_8px_12px_6px_rgba(0,0,0,0.15),0_4px_4px_rgba(0,0,0,0.3)]">
      <div className="relative min-h-[175px] bg-[#0b242e] px-7 pb-5 pt-8 text-white">
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
            onClick={(e) => {
              e.stopPropagation();
              toast.info(`Opening ${signal.source}…`);
            }}
            className="inline-flex items-center gap-1 text-[10px] italic text-white/90 transition-opacity hover:opacity-100 hover:text-white cursor-pointer"
          >
            <span className="underline underline-offset-2">See Post</span>
            <span className="not-italic no-underline">→</span>
          </a>
        </div>
        <p className="mt-2 text-[9px] font-light text-[#d0d0d0]">{signal.source} • Public • 2hrs ago</p>
      </div>

      <div className="grid grid-cols-2 border-b border-[#e9e9e9] px-5 py-3 text-[#616263]">
        <div className="flex items-center gap-2 border-r border-[#e9e9e9] pr-4">
          <Image src="/avatars/male-avatar.png" alt="" width={25} height={25} className="size-[25px] rounded-full object-cover" />
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

      <div className="px-5 py-3 text-[#616263]">
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

      <div className="space-y-[5px] px-2 pb-2">
        <div className="rounded-[10px] border border-[#e8e5e5] bg-[#f7f6f6] px-3.5 py-2 text-[#616263] shadow-[inset_0_1px_4px_rgba(12,12,13,0.05)]">
          <p className="text-[10px] font-bold leading-[12px]">Recommended Action</p>
          <p className="mt-1 text-[9px] leading-[12px]"><span className="font-semibold">Reach out within 24 hours</span><br />This prospect is actively looking for solutions.</p>
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
      </div>

      <div className="mt-auto flex items-center gap-[17px] bg-[#f7f7f7] px-6 py-4">
        <button
          type="button"
          onClick={() => toast.success(`Creating outreach message for ${signal.company}…`)}
          className="h-8 rounded-[10px] border border-[#d1d1d1] bg-[#09232d] px-3 text-[10px] font-medium text-white transition hover:bg-[#0f3340] cursor-pointer"
        >
          Create Outreach
        </button>
        <button
          type="button"
          onClick={() => toast.success(`Reminder set for ${signal.company}.`)}
          className="h-8 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-3 text-[10px] text-[#34373c] transition hover:bg-gray-100 cursor-pointer"
        >
          Set Reminder
        </button>
        <button
          type="button"
          onClick={() => toast.success(`Added ${signal.company} to CRM pipeline.`)}
          className="h-8 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-3 text-[10px] text-[#34373c] transition hover:bg-gray-100 cursor-pointer"
        >
          Add to CRM
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
  const sources = ["LinkedIn public index", "X/Twitter mentions", "Reddit communities", "Meta business pages"];
  const intents = ["Recommendations", "Switching", "Pricing questions", "Hiring or expansion"];

  const handleSave = () => {
    toast.success("Listening settings saved for this mock workspace.");
    onClose();
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
              <section className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[13px] font-semibold">Sources monitored</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {sources.map((sourceName) => (
                    <label
                      key={sourceName}
                      className="flex items-center gap-2 rounded-[12px] bg-white/[0.05] px-3 py-2 text-[12px] text-white/75"
                    >
                      <input type="checkbox" defaultChecked className="accent-[#8dec66]" />
                      {sourceName}
                    </label>
                  ))}
                </div>
              </section>

              <section className="grid gap-4 sm:grid-cols-2">
                <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[13px] font-semibold">Refresh cadence</p>
                  <div className="mt-3 space-y-2 text-[12px] text-white/70">
                    {["Every 14 days", "Every 30 days"].map((cadence, index) => (
                      <label key={cadence} className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="social-listening-cadence"
                          defaultChecked={index === 0}
                          className="accent-[#8dec66]"
                        />
                        {cadence}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                  <p className="text-[13px] font-semibold">Opportunity threshold</p>
                  <div className="mt-4">
                    <input type="range" min="40" max="90" defaultValue="70" className="w-full accent-[#8dec66]" />
                    <div className="mt-2 flex justify-between text-[11px] text-white/45">
                      <span>Broad</span>
                      <span>70% score</span>
                      <span>Strict</span>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[13px] font-semibold">Intent signals</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {intents.map((intentName) => (
                    <label
                      key={intentName}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-3 py-2 text-[12px] text-white/75"
                    >
                      <input type="checkbox" defaultChecked className="accent-[#8dec66]" />
                      {intentName}
                    </label>
                  ))}
                </div>
              </section>

              <section className="rounded-[18px] border border-white/10 bg-white/[0.04] p-4">
                <p className="text-[13px] font-semibold">Routing rules</p>
                <div className="mt-3 grid gap-3 text-[12px] text-white/70 sm:grid-cols-2">
                  <label>
                    CRM destination
                    <select className="mt-1 h-10 w-full rounded-[10px] border border-white/10 bg-[#14343e] px-3 text-white outline-none">
                      <option>Qualified leads pipeline</option>
                      <option>Human review queue</option>
                    </select>
                  </label>
                  <label>
                    Outreach channel
                    <select className="mt-1 h-10 w-full rounded-[10px] border border-white/10 bg-[#14343e] px-3 text-white outline-none">
                      <option>Email first</option>
                      <option>Human follow-up</option>
                    </select>
                  </label>
                </div>
              </section>
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
                onClick={handleSave}
                className="h-11 flex-1 rounded-[14px] bg-[#8dec66] text-[13px] font-semibold text-[#09232d] transition hover:bg-[#9bff73]"
              >
                Save Settings
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function SocialListeningTab() {
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("all");
  const [signalType, setSignalType] = useState("all");
  const [intent, setIntent] = useState("all");
  const [activeSignalId, setActiveSignalId] = useState(socialSignals[0].id);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [removedSignalIds, setRemovedSignalIds] = useState<number[]>([]);

  const handleRemoveSignal = (id: number) => {
    setRemovedSignalIds((prev) => [...prev, id]);
  };

  const handleScan = () => {
    setIsScanning(true);
    toast.loading("Scanning web, social channels, and public registries…", { id: "social-scan" });
    window.setTimeout(() => {
      setIsScanning(false);
      toast.success("Scan complete. 4 new social opportunities identified.", { id: "social-scan" });
    }, 1500);
  };

  const filteredSignals = useMemo(() => {
    const query = search.trim().toLowerCase();
    return socialSignals.filter((signal) => {
      if (removedSignalIds.includes(signal.id)) return false;
      const matchesSearch =
        query.length === 0 ||
        [signal.signal, signal.source, signal.persona, signal.company, signal.intent, signal.description]
          .join(" ")
          .toLowerCase()
          .includes(query);
      const matchesSource = source === "all" || signal.source === source;
      const matchesSignalType = signalType === "all" || signal.signalType === signalType;
      const matchesIntent = intent === "all" || signal.buyingStage === intent;
      return matchesSearch && matchesSource && matchesSignalType && matchesIntent;
    });
  }, [intent, removedSignalIds, search, signalType, source]);

  const activeSignal =
    filteredSignals.find((signal) => signal.id === activeSignalId) ?? filteredSignals[0] ?? socialSignals[0];

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_406px] items-stretch gap-[25px] max-xl:grid-cols-1">
        <div className="flex min-h-[645px] flex-col gap-[17px]">
          <div className="grid grid-cols-3 items-start gap-[25px] max-lg:grid-cols-2 max-sm:grid-cols-1">
            {socialStatCards.map((card) => (
              <MetricCard
                key={card.title}
                title={card.title}
                value={card.value}
                percent={card.percent}
                active={card.active}
                unit={card.unit}
              />
            ))}
          </div>
          <SocialListeningFilters
            search={search}
            source={source}
            signalType={signalType}
            intent={intent}
            isScanning={isScanning}
            onSearchChange={setSearch}
            onSourceChange={setSource}
            onSignalTypeChange={setSignalType}
            onIntentChange={setIntent}
            onScan={handleScan}
            onOpenSettings={() => setIsSettingsOpen(true)}
          />
          <SocialSignalsTable
            signals={filteredSignals}
            onHoverSignal={(signal) => setActiveSignalId(signal.id)}
            onRemoveSignal={handleRemoveSignal}
          />
        </div>
        <SocialOpportunityDetail signal={activeSignal} />
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

  const leadsDiscovered = metrics?.leads_discovered ?? 0;
  const qualifiedLeads = metrics?.qualified_leads ?? 0;
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
          <SocialListeningTab />
        ) : (
          <>
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
          </>
        )}
      </div>

      <IcpBuilderModal isOpen={isIcpModalOpen} onClose={() => setIsIcpModalOpen(false)} />
    </div>
  );
}
