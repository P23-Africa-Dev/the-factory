"use client";

import { useCopilotChat } from "@/hooks/use-copilot-chat";
import {
  buildMeetingActionArgs,
  ElyMeetingActionFields,
  type ElyMeetingDraft,
} from "@/components/dashboard/ely-meeting-action-fields";
import { formatAiMessageHtml, formatPlainAiMessage } from "@/lib/format-ai-message";
import { ELY_INPUT_PLACEHOLDER, ELY_LANDING_HEADLINE, ELY_LANDING_SUBTEXT, ELY_NAME } from "@/lib/ely-brand";
import type { CopilotChatContext, CopilotThreadSearchResult } from "@/lib/api/copilot";
import { searchCopilotThreads } from "@/lib/api/copilot";
import { resolveCopilotGeolocationContext } from "@/lib/copilot-geolocation";
import { getActiveCompanyContext } from "@/lib/company-context";
import { listMeetingAttendeeCandidates, type MeetingAttendeeCandidate } from "@/lib/api/meeting-attendees";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth";
import Image from "next/image";
import {
  ChevronLeft,
  Copy,
  Paperclip,
  FileAudio,
  FileSpreadsheet,
  LineChart,
  MoreVertical,
  Search,
  Send,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

type MessageAction = "liked" | "disliked" | null;

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
  payload?: unknown;
}

interface AIChatProps {
  open: boolean;
  onClose: () => void;
}

interface ConfirmationPreviewRow {
  key: string;
  label: string;
  value: string;
  warning?: boolean;
}

type ActionDraftMap = Record<string, Record<string, string>>;

interface AssigneeOption {
  id: number;
  name: string;
  email: string;
  role: string | null;
}

interface AssigneeOptionsState {
  loading: boolean;
  loaded: boolean;
  items: AssigneeOption[];
}

interface MeetingAttendeeOptionsState {
  loading: boolean;
  loaded: boolean;
  items: MeetingAttendeeCandidate[];
}

type EditControlType = "text" | "textarea" | "select" | "date" | "datetime-local" | "number";

interface EditFieldOption {
  value: string;
  label: string;
}

interface EditFieldConfig {
  key: string;
  label: string;
  control: EditControlType;
  options?: EditFieldOption[];
}

const TASK_TYPE_OPTIONS: EditFieldOption[] = [
  { value: "inspection", label: "Inspection" },
  { value: "sales_visit", label: "Sales Visit" },
  { value: "delivery", label: "Delivery" },
  { value: "collection", label: "Collection" },
  { value: "awareness", label: "Awareness" },
];

const PROJECT_TYPE_OPTIONS: EditFieldOption[] = [
  { value: "sales", label: "Sales" },
  { value: "inspection", label: "Inspection" },
  { value: "deployment", label: "Deployment" },
];

const PROJECT_STATUS_OPTIONS: EditFieldOption[] = [
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
];

const PRIORITY_OPTIONS: EditFieldOption[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const LEAD_STATUS_OPTIONS: EditFieldOption[] = [
  { value: "newly_lead", label: "Newly Lead" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "proposal_sent", label: "Proposal Sent" },
];

const NOTIFICATION_PRIORITY_OPTIONS: EditFieldOption[] = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const NOTIFICATION_CATEGORY_OPTIONS: EditFieldOption[] = [
  { value: "auth", label: "Auth" },
  { value: "onboarding", label: "Onboarding" },
  { value: "task", label: "Task" },
  { value: "project", label: "Project" },
  { value: "tracking", label: "Tracking" },
  { value: "attendance", label: "Attendance" },
  { value: "payroll", label: "Payroll" },
  { value: "crm", label: "CRM" },
  { value: "workforce", label: "Workforce" },
  { value: "profile", label: "Profile" },
  { value: "system", label: "System" },
];

function getSafeAvatarSrc(rawAvatar: string | null | undefined): string | null {
  if (!rawAvatar) return null;
  const trimmed = rawAvatar.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/")) return trimmed;
  if (trimmed.startsWith("avatar/") || trimmed.startsWith("storage/")) {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1";
    const apiOrigin = apiBase.replace(/\/api\/v1\/?$/, "");
    return trimmed.startsWith("storage/") ? `${apiOrigin}/${trimmed}` : `${apiOrigin}/storage/${trimmed}`;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.toString();
  } catch { }
  return null;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightPlainText(content: string, query: string): string {
  const trimmed = query.trim();
  if (trimmed === "") {
    return content;
  }

  const escaped = content
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const pattern = new RegExp(`(${escapeRegExp(trimmed)})`, "gi");
  return escaped.replace(pattern, '<mark class="bg-[#EBA771]/35 text-white rounded px-0.5">$1</mark>');
}

function formatSearchDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AIChat({ open, onClose }: AIChatProps) {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.name?.split(" ")[0] ?? "User";
  const avatarSrc = getSafeAvatarSrc(user?.avatar) ?? "/avatars/male-avatar.png";
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);
  const {
    messages,
    isStreaming,
    processingLabel,
    weeklyReport,
    isQueueingWeeklyReport,
    initialize,
    loadThread,
    sendMessage: sendCopilotMessage,
    clearCurrentThread,
    queueWeeklyReport,
    downloadWeeklyReport,
    runVoiceTranscription,
    runFileAnalysis,
    runTranscriptSummary,
    loadForecastOverview,
    searchAssignees,
  } = useCopilotChat();

  const canAnalyzeFile = user?.access_role ? user.access_role !== "agent" : true;

  const [actionMap, setActionMap] = useState<Record<string, MessageAction>>({});
  const [copiedMap, setCopiedMap] = useState<Record<string, boolean>>({});
  const [input, setInput] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<CopilotThreadSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [highlightMessageId, setHighlightMessageId] = useState<string | null>(null);
  const [highlightQuery, setHighlightQuery] = useState("");
  const [actionDrafts, setActionDrafts] = useState<ActionDraftMap>({});
  const [meetingActionDrafts, setMeetingActionDrafts] = useState<Record<string, ElyMeetingDraft>>({});
  const [assigneeOptions, setAssigneeOptions] = useState<Record<string, AssigneeOptionsState>>({});
  const [meetingAttendeeOptions, setMeetingAttendeeOptions] = useState<Record<string, MeetingAttendeeOptionsState>>({});
  const [isRunningQuickAction, setIsRunningQuickAction] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isAiToolsOpen, setIsAiToolsOpen] = useState(false);
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  // AI Tools modals
  const [isTranscriptModalOpen, setIsTranscriptModalOpen] = useState(false);
  const [transcriptInput, setTranscriptInput] = useState("");
  const [isVoicePreviewOpen, setIsVoicePreviewOpen] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceTranscriptSummary, setVoiceTranscriptSummary] = useState("");
  const [isAnalyzeFilePreviewOpen, setIsAnalyzeFilePreviewOpen] = useState(false);
  const [isFileAnalysisLoading, setIsFileAnalysisLoading] = useState(false);
  const [fileAnalysisStage, setFileAnalysisStage] = useState("Analyzing file…");
  const [fileAnalysisResult, setFileAnalysisResult] = useState("");
  const [fileAnalysisFileName, setFileAnalysisFileName] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const hasMessages = messages.length > 0;

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  useEffect(() => {
    if (!isMenuOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);

  useEffect(() => {
    if (!open || !companyId) return;
    setTimeout(() => setIsInitializing(true), 0);
    Promise.resolve(initialize(companyId)).finally(() => setIsInitializing(false));
  }, [companyId, initialize, open]);

  useEffect(() => {
    setTimeout(() => setAssigneeOptions({}), 0);
    setTimeout(() => setMeetingAttendeeOptions({}), 0);
    setTimeout(() => setMeetingActionDrafts({}), 0);
  }, [companyId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  useEffect(() => {
    if (!searchOpen) {
      setSearchQuery("");
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    setTimeout(() => {
      if (window.innerWidth < 640) {
        mobileSearchInputRef.current?.focus();
      } else {
        searchInputRef.current?.focus();
      }
    }, 150);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen || !companyId) {
      return;
    }

    const query = searchQuery.trim();
    if (query.length < 1) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void (async () => {
        setSearchLoading(true);
        try {
          const token = getAuthTokenFromDocument();
          if (!token) {
            setSearchResults([]);
            return;
          }

          const response = await searchCopilotThreads(token, query, companyId);
          setSearchResults(response.data.items ?? []);
        } catch {
          setSearchResults([]);
        } finally {
          setSearchLoading(false);
        }
      })();
    }, 300);

    return () => window.clearTimeout(timer);
  }, [companyId, searchOpen, searchQuery]);

  useEffect(() => {
    if (!highlightMessageId) {
      return;
    }

    const element = document.getElementById(`copilot-msg-${highlightMessageId}`);
    if (!element) {
      return;
    }

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add("ring-2", "ring-[#EBA771]/60", "rounded-[20px]");
    const timer = window.setTimeout(() => {
      element.classList.remove("ring-2", "ring-[#EBA771]/60", "rounded-[20px]");
    }, 3200);

    return () => window.clearTimeout(timer);
  }, [highlightMessageId, messages]);

  useEffect(() => {
    for (const msg of messages) {
      const payload = messagePayload(msg);
      if (msg.role !== "assistant" || payload?.confirmation_required !== true) {
        continue;
      }

      const tool = String(payload.tool ?? "");
      const rawArgs = parseRecord(payload.action_args);
      const argKeys = rawArgs ? Object.keys(rawArgs) : [];
      const hasUserAssignmentField = argKeys.some((key) => /(^|_)(user_id|assigned_agent_id|to_user_id|project_manager_user_id)$/.test(key));

      if (!["tasks.create", "tasks.reassign", "projects.create", "meetings.schedule", "crm.create_lead"].includes(tool) && !hasUserAssignmentField) {
        continue;
      }

      if (tool === "meetings.schedule") {
        void loadMeetingAttendeeOptions(msg.id);
        continue;
      }

      if (["tasks.create", "tasks.reassign", "projects.create", "crm.create_lead"].includes(tool) || hasUserAssignmentField) {
        void loadAssigneeOptions(msg.id);
      }
    }
  }, [messages]);

  useEffect(() => {
    setActionDrafts((prev) => {
      let next = prev;
      for (const msg of messages) {
        const payload = messagePayload(msg);
        if (msg.role !== "assistant" || payload?.confirmation_required !== true) {
          continue;
        }
        if (prev[msg.id]) {
          continue;
        }

        const rawArgs = parseRecord(payload.action_args);
        if (!rawArgs) {
          continue;
        }

        const seed: Record<string, string> = {};
        for (const [key, value] of Object.entries(rawArgs)) {
          if (key.startsWith("__") || key === "company_id" || key === "meta" || key === "pipeline_id") {
            continue;
          }
          if (value === null || value === undefined) {
            continue;
          }
          seed[key] = String(value);
        }

        const meta = parseRecord(rawArgs.meta);
        if (meta) {
          for (const [key, value] of Object.entries(meta)) {
            if (value !== null && value !== undefined && seed[key] === undefined) {
              seed[key] = String(value);
            }
          }
        }

        if (Object.keys(seed).length === 0) {
          continue;
        }

        next = { ...next, [msg.id]: seed };
      }

      return next;
    });
  }, [messages]);

  function toTitleCase(value: string): string {
    return value
      .replace(/[_\-]+/g, " ")
      .replace(/\b\w/g, (ch) => ch.toUpperCase());
  }

  function asDateInputValue(raw: unknown): string {
    if (typeof raw !== "string" || raw.trim() === "") {
      return "";
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    return parsed.toISOString().slice(0, 10);
  }

  function asDateTimeLocalInputValue(raw: unknown): string {
    if (typeof raw !== "string" || raw.trim() === "") {
      return "";
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      return "";
    }

    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    const day = String(parsed.getDate()).padStart(2, "0");
    const hour = String(parsed.getHours()).padStart(2, "0");
    const minute = String(parsed.getMinutes()).padStart(2, "0");
    return `${year}-${month}-${day}T${hour}:${minute}`;
  }

  function sendMessage(text?: string, context?: CopilotChatContext) {
    const content = (text ?? input).trim();
    if (!content) return;

    setInput("");

    void sendCopilotMessage({
      message: content,
      companyId: companyId ?? undefined,
      context,
    });
  }

  async function handlePlanTodayPriorities() {
    const geoContext = await resolveCopilotGeolocationContext();
    sendMessage("Plan today's priorities for me", geoContext);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") sendMessage();
  }

  function handleAction(id: string, action: MessageAction) {
    setActionMap((prev) => ({
      ...prev,
      [id]: prev[id] === action ? null : action,
    }));
  }

  function handleCopy(id: string, content: string) {
    // Strip HTML tags for copying
    const plainText = content.replace(/<[^>]*>?/gm, '');
    navigator.clipboard.writeText(plainText).catch(() => { });
    setCopiedMap((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => {
      setCopiedMap((prev) => ({ ...prev, [id]: false }));
    }, 1500);
  }

  function messagePayload(msg: Message): Record<string, unknown> | null {
    return msg && typeof msg.payload === "object" && msg.payload !== null
      ? (msg.payload as Record<string, unknown>)
      : null;
  }

  function parseRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  }

  function sanitizeActionArgs(args: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(
      Object.entries(args).filter(([key]) => !key.startsWith("__")),
    );
  }

  function warningCodesForMessage(msg: Message): string[] {
    const payload = messagePayload(msg);
    if (!payload || !Array.isArray(payload.validation_warning_codes)) {
      return [];
    }

    return payload.validation_warning_codes
      .map((code) => String(code))
      .filter((code) => code.trim() !== "");
  }

  function blockingWarningCodesForMessage(msg: Message): string[] {
    const payload = messagePayload(msg);
    if (!payload || !Array.isArray(payload.blocking_warning_codes)) {
      return payload?.blocking_confirmation === true ? warningCodesForMessage(msg) : [];
    }

    return payload.blocking_warning_codes
      .map((code) => String(code))
      .filter((code) => code.trim() !== "");
  }

  function updateActionDraft(msgId: string, field: string, value: string) {
    setActionDrafts((prev) => ({
      ...prev,
      [msgId]: {
        ...(prev[msgId] ?? {}),
        [field]: value,
      },
    }));
  }

  async function loadMeetingAttendeeOptions(msgId: string) {
    const current = meetingAttendeeOptions[msgId];
    if (current?.loading === true || current?.loaded === true) {
      return;
    }

    setMeetingAttendeeOptions((prev) => ({
      ...prev,
      [msgId]: {
        loading: true,
        loaded: false,
        items: prev[msgId]?.items ?? [],
      },
    }));

    try {
      const token = getAuthTokenFromDocument();
      const response = await listMeetingAttendeeCandidates({ company_id: companyId ?? undefined }, token);
      setMeetingAttendeeOptions((prev) => ({
        ...prev,
        [msgId]: {
          loading: false,
          loaded: true,
          items: response.data.items,
        },
      }));
    } catch {
      setMeetingAttendeeOptions((prev) => ({
        ...prev,
        [msgId]: {
          loading: false,
          loaded: true,
          items: [],
        },
      }));
    }
  }

  function updateMeetingActionDraft(msgId: string, draft: ElyMeetingDraft) {
    setMeetingActionDrafts((prev) => ({
      ...prev,
      [msgId]: draft,
    }));
  }

  async function loadAssigneeOptions(msgId: string) {
    const current = assigneeOptions[msgId];
    if (current?.loading === true || current?.loaded === true) {
      return;
    }

    setAssigneeOptions((prev) => ({
      ...prev,
      [msgId]: {
        loading: true,
        loaded: false,
        items: prev[msgId]?.items ?? [],
      },
    }));

    try {
      const items = await searchAssignees("", companyId ?? undefined, 20);
      setAssigneeOptions((prev) => ({
        ...prev,
        [msgId]: {
          loading: false,
          loaded: true,
          items,
        },
      }));
    } catch {
      setAssigneeOptions((prev) => ({
        ...prev,
        [msgId]: {
          loading: false,
          loaded: true,
          items: [],
        },
      }));
    }
  }

  function actionArgsForMessage(msg: Message): Record<string, unknown> | null {
    const payload = messagePayload(msg);
    if (!payload) {
      return null;
    }

    const actionArgsRaw = parseRecord(payload.action_args);
    if (!actionArgsRaw) {
      return null;
    }

    const baseArgs = sanitizeActionArgs(actionArgsRaw);
    const draft = actionDrafts[msg.id] ?? {};
    const tool = String(payload.tool ?? "");

    if (tool === "tasks.create") {
      const merged: Record<string, unknown> = { ...baseArgs };

      if (Object.prototype.hasOwnProperty.call(draft, "title")) {
        merged.title = draft.title;
      }

      if (Object.prototype.hasOwnProperty.call(draft, "type")) {
        merged.type = draft.type;
      }

      if (Object.prototype.hasOwnProperty.call(draft, "due_date")) {
        merged.due_date = draft.due_date;
      }

      if (Object.prototype.hasOwnProperty.call(draft, "assignee")) {
        const assignee = (draft.assignee ?? "").trim();
        if (assignee !== "") {
          merged.assignee = assignee;
          delete merged.assigned_agent_id;
        } else {
          delete merged.assignee;
        }
      }

      return merged;
    }

    if (tool === "meetings.schedule") {
      const draft = meetingActionDrafts[msg.id];
      if (draft) {
        const candidates = meetingAttendeeOptions[msg.id]?.items ?? [];
        return buildMeetingActionArgs(draft, candidates);
      }

      return baseArgs;
    }

    if (Object.keys(draft).length === 0) {
      return baseArgs;
    }

    return {
      ...baseArgs,
      ...draft,
    };
  }

  function assigneeDraftValue(msg: Message): string {
    const draft = actionDrafts[msg.id] ?? {};
    return String(draft.assignee ?? "").trim();
  }

  function assigneeDropdownValue(msg: Message, args: Record<string, unknown>): string {
    const draftValue = assigneeDraftValue(msg);
    if (draftValue !== "") {
      return draftValue;
    }

    const directAssignee = typeof args.assignee === "string" ? args.assignee.trim() : "";
    if (directAssignee !== "") {
      return directAssignee;
    }

    const assignedId = typeof args.assigned_agent_id === "number" ? args.assigned_agent_id : null;
    if (assignedId === null) {
      return "";
    }

    const options = assigneeOptions[msg.id]?.items ?? [];
    const matched = options.find((item) => item.id === assignedId);
    return matched?.email ?? "";
  }

  function assigneeDisplayName(msg: Message, args: Record<string, unknown>): string {
    const options = assigneeOptions[msg.id]?.items ?? [];
    const selected = assigneeDropdownValue(msg, args);

    if (selected !== "") {
      const byEmail = options.find((item) => item.email === selected);
      if (byEmail) {
        return byEmail.name;
      }

      return selected;
    }

    const assignedId = typeof args.assigned_agent_id === "number" ? args.assigned_agent_id : null;
    if (assignedId !== null) {
      const byId = options.find((item) => item.id === assignedId);
      return byId?.name ?? `Agent #${String(assignedId)}`;
    }

    return "";
  }

  function assigneeSelectOptions(msg: Message): EditFieldOption[] {
    return (assigneeOptions[msg.id]?.items ?? []).map((item) => ({
      value: item.email,
      label: item.name,
    }));
  }

  function userIdSelectOptions(msg: Message): EditFieldOption[] {
    return (assigneeOptions[msg.id]?.items ?? []).map((item) => ({
      value: String(item.id),
      label: item.name,
    }));
  }

  function editFieldsForMessage(msg: Message, args: Record<string, unknown>): EditFieldConfig[] {
    const payload = messagePayload(msg);
    const tool = String(payload?.tool ?? "");

    if (tool === "tasks.create") {
      return [
        { key: "title", label: "Title", control: "text" },
        { key: "type", label: "Type", control: "select", options: TASK_TYPE_OPTIONS },
        { key: "due_date", label: "Due Date", control: "date" },
        { key: "assignee", label: "Assignee", control: "select", options: assigneeSelectOptions(msg) },
      ];
    }

    if (tool === "meetings.schedule") {
      return [];
    }

    if (tool === "projects.create") {
      return [
        { key: "name", label: "Project Name", control: "text" },
        { key: "type", label: "Type", control: "select", options: PROJECT_TYPE_OPTIONS },
        { key: "status", label: "Status", control: "select", options: PROJECT_STATUS_OPTIONS },
        { key: "priority", label: "Priority", control: "select", options: PRIORITY_OPTIONS },
        { key: "start_date", label: "Start Date", control: "date" },
        { key: "end_date", label: "End Date", control: "date" },
        { key: "project_manager_user_id", label: "Project Manager", control: "select", options: userIdSelectOptions(msg) },
      ];
    }

    if (tool === "notifications.send") {
      return [
        { key: "title", label: "Title", control: "text" },
        { key: "message", label: "Message", control: "textarea" },
        { key: "category", label: "Category", control: "select", options: NOTIFICATION_CATEGORY_OPTIONS },
        { key: "priority", label: "Priority", control: "select", options: NOTIFICATION_PRIORITY_OPTIONS },
        { key: "type", label: "Type", control: "text" },
      ];
    }

    if (tool === "tasks.reassign") {
      return [
        { key: "task_id", label: "Task ID", control: "number" },
        { key: "to_user_id", label: "Reassign To", control: "select", options: userIdSelectOptions(msg) },
        { key: "reason", label: "Reason", control: "textarea" },
      ];
    }

    if (tool === "crm.create_lead") {
      return [
        { key: "name", label: "Business Name", control: "text" },
        { key: "phone", label: "Phone Number", control: "text" },
        { key: "location", label: "Location", control: "text" },
        { key: "email", label: "Email", control: "text" },
        { key: "industry", label: "Industry", control: "text" },
        { key: "contact_person", label: "Contact Person", control: "text" },
        { key: "status", label: "Status", control: "select", options: LEAD_STATUS_OPTIONS },
        { key: "priority", label: "Priority", control: "select", options: PRIORITY_OPTIONS },
        { key: "next_action", label: "Next Action", control: "textarea" },
        { key: "notes", label: "Notes", control: "textarea" },
        { key: "assigned_to_user_id", label: "Assign To", control: "select", options: userIdSelectOptions(msg) },
      ];
    }

    return Object.entries(args)
      .filter(([key]) => key !== "company_id")
      .map(([key]) => {
        if (/(_at|_date|^date$|due_date)/i.test(key)) {
          const isDateOnly = /(_date|^date$|due_date)/i.test(key) && !/_at$/i.test(key);
          return {
            key,
            label: toTitleCase(key),
            control: isDateOnly ? "date" : "datetime-local",
          } as EditFieldConfig;
        }

        if (/(^|_)(type|status|priority|category)$/i.test(key)) {
          return {
            key,
            label: toTitleCase(key),
            control: "select",
            options: [
              { value: String(args[key] ?? ""), label: toTitleCase(String(args[key] ?? "current")) },
            ],
          } as EditFieldConfig;
        }

        if (/_id$/i.test(key)) {
          return {
            key,
            label: toTitleCase(key),
            control: "number",
          } as EditFieldConfig;
        }

        if (/(description|message|notes|reason)/i.test(key)) {
          return {
            key,
            label: toTitleCase(key),
            control: "textarea",
          } as EditFieldConfig;
        }

        return {
          key,
          label: toTitleCase(key),
          control: "text",
        } as EditFieldConfig;
      });
  }

  function editFieldValue(msg: Message, args: Record<string, unknown>, field: EditFieldConfig): string {
    const draft = actionDrafts[msg.id] ?? {};
    if (Object.prototype.hasOwnProperty.call(draft, field.key)) {
      return String(draft[field.key] ?? "");
    }

    if (field.key === "assignee") {
      return assigneeDropdownValue(msg, args);
    }

    const raw = args[field.key];

    if (field.control === "date") {
      return asDateInputValue(raw);
    }

    if (field.control === "datetime-local") {
      return asDateTimeLocalInputValue(raw);
    }

    if (raw === null || raw === undefined) {
      return "";
    }

    return String(raw);
  }

  function blockingIssuesForMessage(msg: Message): string[] {
    const blockingCodes = blockingWarningCodesForMessage(msg);
    if (blockingCodes.length === 0) {
      return [];
    }

    const args = actionArgsForMessage(msg);
    const argsForChecks: Record<string, unknown> = args ?? {};
    const remaining: string[] = [];

    for (const code of blockingCodes) {
      if (code === "assignee_unresolved") {
        const assigneeEdited = assigneeDropdownValue(msg, argsForChecks) !== "";
        const hasResolvedId = typeof args?.assigned_agent_id === "number";
        if (!assigneeEdited && !hasResolvedId) {
          remaining.push(code);
        }
        continue;
      }

      if (code === "used_default_title") {
        const title = String(args?.title ?? "").trim().toLowerCase();
        if (title === "" || title === "task created by ely") {
          remaining.push(code);
        }
        continue;
      }

      if (code === "used_default_due_date") {
        const due = String(args?.due_date ?? "").trim();
        if (due === "") {
          remaining.push(code);
        }
        continue;
      }

      if (code === "missing_lead_name") {
        const name = String(args?.name ?? "").trim().toLowerCase();
        if (name === "" || name === "new lead") {
          remaining.push(code);
        }
        continue;
      }

      remaining.push(code);
    }

    return remaining;
  }

  function formatPreviewValue(key: string, value: unknown): string {
    if (value === null || value === undefined) {
      return "Not provided";
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") {
        return "Not provided";
      }

      if (key === "due_date") {
        const parsed = new Date(trimmed);
        if (!Number.isNaN(parsed.getTime())) {
          return parsed.toLocaleString();
        }

        return "Not set";
      }

      return trimmed;
    }

    if (typeof value === "number" || typeof value === "boolean") {
      return String(value);
    }

    if (Array.isArray(value)) {
      const list = value.map((item) => String(item)).filter((item) => item.trim() !== "");
      return list.length > 0 ? list.join(", ") : "Not provided";
    }

    try {
      return JSON.stringify(value);
    } catch {
      return "[Unserializable value]";
    }
  }

  function confirmationPreviewRows(msg: Message): ConfirmationPreviewRow[] {
    const payload = messagePayload(msg);
    if (!payload) {
      return [];
    }

    const tool = String(payload.tool ?? "");
    const args = actionArgsForMessage(msg);
    if (!args) {
      return [];
    }
    const warningCodes = warningCodesForMessage(msg);

    if (tool === "tasks.create") {
      const rows: ConfirmationPreviewRow[] = [
        { key: "title", label: "Title", value: formatPreviewValue("title", args.title) },
        { key: "type", label: "Type", value: formatPreviewValue("type", args.type) },
        { key: "due_date", label: "Due Date", value: formatPreviewValue("due_date", args.due_date) },
        { key: "location", label: "Location", value: formatPreviewValue("location", args.location) },
      ];

      const assigneeEdited = assigneeDropdownValue(msg, args) !== "";
      const assigneeResolved = typeof args.assigned_agent_id === "number";

      if (warningCodes.includes("assignee_unresolved") && !assigneeEdited && !assigneeResolved) {
        rows.push({
          key: "assigned_agent_id",
          label: "Assignee",
          value: "Needs correction",
          warning: true,
        });
      } else {
        rows.push({
          key: "assigned_agent_id",
          label: "Assignee",
          value: formatPreviewValue("assignee", assigneeDisplayName(msg, args)),
        });
      }

      return rows;
    }

    if (tool === "meetings.schedule") {
      const attendees = Array.isArray(args.attendees) ? args.attendees : [];
      const reminders = Array.isArray(args.reminders) ? args.reminders : [];

      return [
        { key: "title", label: "Title", value: formatPreviewValue("title", args.title) },
        { key: "description", label: "Description", value: formatPreviewValue("description", args.description) },
        { key: "start_at", label: "Start", value: formatPreviewValue("start_at", args.start_at) },
        { key: "end_at", label: "End", value: formatPreviewValue("end_at", args.end_at) },
        { key: "timezone", label: "Timezone", value: formatPreviewValue("timezone", args.timezone) },
        { key: "location", label: "Location", value: formatPreviewValue("location", args.location) },
        {
          key: "attendees",
          label: "Attendees",
          value: attendees.length > 0 ? `${attendees.length} selected` : "None selected",
          warning: warningCodes.includes("attendee_unresolved"),
        },
        {
          key: "reminders",
          label: "Reminders",
          value: reminders.length > 0 ? `${reminders.length} scheduled` : "None selected",
        },
      ];
    }

    if (tool === "crm.create_lead") {
      return [
        { key: "name", label: "Business Name", value: formatPreviewValue("name", args.name), warning: warningCodes.includes("missing_lead_name") },
        { key: "phone", label: "Phone", value: formatPreviewValue("phone", args.phone), warning: warningCodes.includes("missing_phone") },
        { key: "location", label: "Location", value: formatPreviewValue("location", args.location), warning: warningCodes.includes("missing_location") },
        { key: "email", label: "Email", value: formatPreviewValue("email", args.email) },
        { key: "industry", label: "Industry", value: formatPreviewValue("industry", args.industry) },
        { key: "contact_person", label: "Contact Person", value: formatPreviewValue("contact_person", args.contact_person) },
        { key: "status", label: "Status", value: formatPreviewValue("status", args.status) },
        { key: "priority", label: "Priority", value: formatPreviewValue("priority", args.priority) },
      ];
    }

    return Object.entries(args)
      .filter(([key]) => key !== "company_id")
      .map(([key, value]) => ({
        key,
        label: key.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
        value: formatPreviewValue(key, value),
      }));
  }

  function findActionContextForConfirm(index: number): string {
    const parts: string[] = [];

    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = messages[i];
      if (!candidate) {
        continue;
      }

      if (candidate.role === "assistant") {
        const payload = messagePayload(candidate);
        if (payload?.confirmation_required === true) {
          break;
        }
        continue;
      }

      if (candidate.role === "user") {
        const content = String(candidate.content ?? "").trim();
        if (content !== "" && !/^\s*confirm\b/i.test(content)) {
          parts.unshift(content);
        }
      }
    }

    return parts.join("\n");
  }

  function handleConfirmAction(index: number, msg: Message) {
    const payload = messagePayload(msg);
    if (!payload) return;

    const priorPrompt = findActionContextForConfirm(index);
    if (!priorPrompt.trim()) return;

    const actionArgs = actionArgsForMessage(msg);
    const sanitizedArgs = actionArgs ? sanitizeActionArgs(actionArgs) : undefined;
    const hasSanitizedArgs = sanitizedArgs ? Object.keys(sanitizedArgs).length > 0 : false;

    void sendCopilotMessage({
      message: priorPrompt,
      companyId: companyId ?? undefined,
      actionConfirmed: true,
      actionArgs: hasSanitizedArgs ? sanitizedArgs : undefined,
    });
  }

  function handleEditActionDetails(index: number) {
    const priorPrompt = findActionContextForConfirm(index);
    if (!priorPrompt.trim()) return;
    setInput(priorPrompt);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function isBlockingConfirmation(msg: Message): boolean {
    return blockingIssuesForMessage(msg).length > 0;
  }

  function blockingMessage(msg: Message): string {
    const issues = blockingIssuesForMessage(msg);
    if (issues.includes("assignee_unresolved")) {
      return "Confirmation is blocked until assignee details are corrected.";
    }

    if (issues.includes("invalid_attendee_email")) {
      return "Confirmation is blocked until attendee email addresses are corrected.";
    }

    if (issues.includes("used_default_title") || issues.includes("used_default_due_date")) {
      return "Confirmation is blocked until title and due date are explicitly set.";
    }

    if (issues.includes("missing_lead_name")) {
      return "Confirmation is blocked until the business name is provided.";
    }

    return "Confirmation is currently blocked until required fields are corrected.";
  }

  async function handleQueueWeeklyReport() {
    await queueWeeklyReport(companyId ?? undefined);
  }

  async function handleDownloadWeeklyReport() {
    try {
      await downloadWeeklyReport(companyId ?? undefined);
      toast.success("Weekly report downloaded successfully!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to download weekly report.");
    }
  }

  async function handleOpenSearchResult(result: CopilotThreadSearchResult) {
    if (!companyId) {
      return;
    }

    const query = searchQuery.trim();
    setSearchOpen(false);
    setHighlightQuery(query);
    setHighlightMessageId(result.match_message_id || null);

    try {
      await loadThread(result.thread_id, companyId);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Unable to open conversation.");
    }
  }

  async function handleVoiceFile(file: File) {
    setIsRunningQuickAction(true);
    try {
      const result = await runVoiceTranscription(file, companyId ?? undefined);
      const transcript = String(result?.transcript ?? "Voice transcription completed.");
      setVoiceTranscript(transcript);
      // Generate a brief summary by requesting it
      setVoiceTranscriptSummary(`Transcript from: ${file.name}`);
      setIsVoicePreviewOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process voice input.");
    } finally {
      setIsRunningQuickAction(false);
    }
  }

  async function handleAnalysisFile(file: File) {
    setIsRunningQuickAction(true);
    setFileAnalysisFileName(file.name);
    setFileAnalysisResult("");
    setFileAnalysisStage("Analyzing file…");
    setIsFileAnalysisLoading(true);
    setIsAnalyzeFilePreviewOpen(true);

    const readingTimer = window.setTimeout(() => {
      setFileAnalysisStage("Reading document content…");
    }, 1200);

    const analyzingTimer = window.setTimeout(() => {
      setFileAnalysisStage("ELY is analyzing your document…");
    }, 3200);

    try {
      const result = await runFileAnalysis(file, companyId ?? undefined);
      const rawSummary = String((result?.analysis as { summary?: string } | undefined)?.summary ?? "File analysis completed.");
      setFileAnalysisResult(formatPlainAiMessage(rawSummary));
    } catch (err) {
      setIsAnalyzeFilePreviewOpen(false);
      toast.error(err instanceof Error ? err.message : "Failed to analyze file.");
    } finally {
      window.clearTimeout(readingTimer);
      window.clearTimeout(analyzingTimer);
      setIsFileAnalysisLoading(false);
      setIsRunningQuickAction(false);
    }
  }

  function handleCloseFileAnalysisModal() {
    setIsAnalyzeFilePreviewOpen(false);
    setIsFileAnalysisLoading(false);
  }

  async function handleTranscriptSummaryModalOpen() {
    setTranscriptInput("");
    setIsTranscriptModalOpen(true);
  }

  async function handleTranscriptSummarize() {
    if (!transcriptInput.trim() || transcriptInput.trim().length < 20) {
      toast.error("Please enter at least 20 characters of transcript text.");
      return;
    }

    setIsRunningQuickAction(true);
    try {
      const result = await runTranscriptSummary(transcriptInput, companyId ?? undefined);
      const summary = result?.summary as { key_points?: string[]; action_items?: string[] } | undefined;
      const keyPoints = (summary?.key_points ?? []).slice(0, 5).map((item) => `• ${item}`).join("\n");
      const actionItems = (summary?.action_items ?? []).slice(0, 5).map((item) => `• ${item}`).join("\n");

      void sendCopilotMessage({
        message: `Transcript Summary\n\n**Key Points:**\n${keyPoints || "None"}\n\n**Action Items:**\n${actionItems || "None"}`,
        companyId: companyId ?? undefined,
      });

      setIsTranscriptModalOpen(false);
      toast.success("Transcript summarized!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to summarize transcript.");
    } finally {
      setIsRunningQuickAction(false);
    }
  }

  async function handleForecastAction() {
    setIsRunningQuickAction(true);
    try {
      const result = await loadForecastOverview(companyId ?? undefined);
      const recommendations = Array.isArray((result?.forecast as { recommendations?: unknown } | undefined)?.recommendations)
        ? ((result?.forecast as { recommendations?: string[] }).recommendations ?? [])
        : [];

      const text = recommendations.length > 0
        ? recommendations.map((item) => `- ${item}`).join("\n")
        : "Forecast overview generated.";

      void sendCopilotMessage({
        message: `Forecast recommendations:\n${text}`,
        companyId: companyId ?? undefined,
      });
    } finally {
      setIsRunningQuickAction(false);
    }
  }

  function handleSendVoiceTranscriptToChat() {
    void sendCopilotMessage({
      message: `Voice note transcript:\n\n${voiceTranscript}`,
      companyId: companyId ?? undefined,
    });
    setIsVoicePreviewOpen(false);
    toast.success("Transcript sent to chat!");
  }

  function handleSendFileAnalysisToChat() {
    void sendCopilotMessage({
      message: `File Analysis (${fileAnalysisFileName}):\n\n${fileAnalysisResult}`,
      companyId: companyId ?? undefined,
    });
    setIsAnalyzeFilePreviewOpen(false);
    toast.success("Analysis sent to chat!");
  }

  async function handleConfirmClear() {
    if (!companyId) return;
    setIsClearing(true);
    try {
      await clearCurrentThread(companyId ?? undefined);
      toast.success("Conversation cleared");
      // reset to initial state
      await initialize(companyId ?? undefined);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear conversation.");
    } finally {
      setIsClearing(false);
      setIsConfirmClearOpen(false);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed top-20 inset-x-0 bottom-0 z-[9998] bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
        onClick={onClose}
      />

      {/* Slide-in panel / Modal */}
      <div
        className={`fixed top-20 inset-x-0 bottom-0 z-[9999] flex items-end justify-end sm:items-start sm:justify-end p-4 sm:p-6 transition-all duration-300 ${open ? "pointer-events-auto" : "pointer-events-none"
          }`}
      >
        <div
          className={`w-full sm:w-[800px] max-w-full h-full sm:h-[calc(100vh-130px)] bg-[#10232A] p-2 sm:p-3 rounded-t-[32px] sm:rounded-[36px] flex flex-col shadow-2xl transition-transform duration-300 ease-out border border-white/5 ${open ? "translate-y-0 sm:translate-x-0 opacity-100" : "translate-y-full sm:translate-y-0 sm:translate-x-8 opacity-0"
            }`}
        >
          <div className="flex-1 relative bg-[#091519] rounded-[24px] sm:rounded-[28px] flex flex-col overflow-hidden">
            <div
              className="absolute inset-0 rounded-[24px] sm:rounded-[28px] pointer-events-none"
              style={{
                // backgroundImage: "url('/avatars/12px Flip.png')",
                backgroundRepeat: "repeat",
                backgroundSize: "auto",
                opacity: "12px",
              }}
            />
            {/* Header */}
            <div className="flex-shrink-0">
              <div className="flex items-center gap-4 px-6 pt-6 pb-4">
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center hover:bg-white/5 transition-colors rounded-full flex-shrink-0"
                >
                  <ChevronLeft className="w-6 h-6 text-white" />
                </button>

                {/* Avatar + name — hidden on sm when search is open */}
                <div className={`flex items-center gap-4 min-w-0 transition-all duration-300 ${searchOpen ? "flex-0 sm:flex-1 hidden sm:flex" : "flex-1"}`}>
                  <div className="w-14 h-14 rounded-full flex-shrink-0 overflow-hidden bg-[#EBA771]">
                    <Image
                      src={avatarSrc}
                      alt={firstName}
                      width={56}
                      height={56}
                      className="w-full h-full object-cover"
                      unoptimized={avatarSrc.startsWith("http")}
                    />
                  </div>
                  <div className="min-w-0">
                    <p className="text-white/70 text-[16px] font-normal leading-tight">Hello,</p>
                    <p className="text-white text-[28px] font-semibold leading-tight truncate">{firstName}!</p>
                  </div>
                </div>

                {/* Inline search bar — large screens only */}
                <div className={`hidden sm:flex flex-1 items-center transition-all duration-300 overflow-hidden ${searchOpen ? "opacity-100 max-w-full" : "opacity-0 max-w-0 pointer-events-none"}`}>
                  <div className="relative w-full">
                    <div className="w-full border border-white/20 rounded-full px-5 py-3 flex items-center gap-2 bg-[#091519]">
                      <Search className="w-4 h-4 text-[#88B3B5] flex-shrink-0" />
                      <input
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder="Search conversations..."
                        className="flex-1 bg-transparent text-white text-sm placeholder:text-[#88B3B5] outline-none"
                      />
                      {searchQuery.trim() !== "" && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          className="text-[#88B3B5] hover:text-white"
                          aria-label="Clear search"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {searchQuery.trim() !== "" && (
                      <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-72 overflow-y-auto rounded-2xl border border-white/10 bg-[#0F2228] shadow-2xl">
                        {searchLoading ? (
                          <p className="px-4 py-3 text-[12px] text-[#88B3B5]">Searching…</p>
                        ) : searchResults.length === 0 ? (
                          <p className="px-4 py-3 text-[12px] text-[#88B3B5]">No conversations found.</p>
                        ) : (
                          searchResults.map((result) => (
                            <button
                              key={`${result.thread_id}-${result.match_message_id}`}
                              type="button"
                              onClick={() => void handleOpenSearchResult(result)}
                              className="w-full border-b border-white/5 px-4 py-3 text-left hover:bg-white/5 transition-colors last:border-b-0"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-[13px] font-medium text-white truncate">{result.title}</p>
                                <span className="text-[10px] text-[#88B3B5] flex-shrink-0">{formatSearchDate(result.updated_at)}</span>
                              </div>
                              <p
                                className="mt-1 text-[12px] text-[#9CC6CA] line-clamp-2"
                                dangerouslySetInnerHTML={{ __html: highlightPlainText(result.snippet, searchQuery) }}
                              />
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="hidden sm:flex flex-col items-end leading-tight">
                    <span className="text-[#7BB6B8] text-[11px] font-bold uppercase tracking-[0.2em]">{ELY_NAME}</span>
                    <span className="text-[#88B3B5] text-[10px]">AI Assistant</span>
                  </div>
                  <button
                    onClick={() => {
                      setSearchOpen((value) => !value);
                    }}
                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-colors ${searchOpen ? "bg-[#7BB6B8]/20" : "bg-[#132A33] hover:bg-[#1A3844]"}`}
                  >
                    <Search className="w-5 h-5 text-[#88B3B5]" />
                  </button>
                  <div className="relative" ref={menuRef}>
                    <button
                      onClick={() => setIsMenuOpen((prev) => !prev)}
                      className="w-12 h-12 rounded-full bg-[#132A33] flex items-center justify-center hover:bg-[#1A3844] transition-colors"
                      aria-label="More options"
                      aria-expanded={isMenuOpen}
                    >
                      {isMenuOpen
                        ? <X className="w-5 h-5 text-[#88B3B5]" />
                        : <MoreVertical className="w-5 h-5 text-[#88B3B5]" />}
                    </button>

                    {isMenuOpen && (
                      <div className="absolute right-0 top-14 z-50 w-56 rounded-2xl bg-[#132A33] border border-white/10 shadow-xl overflow-hidden">
                        <div className="px-4 py-2.5 border-b border-white/10">
                          <p className="text-[#88B3B5] text-[11px] font-semibold uppercase tracking-wider">More Options</p>
                        </div>
                        <div className="py-1">
                          <button
                            onClick={() => setIsAiToolsOpen((v) => !v)}
                            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-[13px] text-[#B9E9DD] hover:bg-white/5 transition-colors"
                          >
                            <span className="flex items-center gap-3"><LineChart className="w-4 h-4 flex-shrink-0" />AI Tools</span>
                            <ChevronLeft className={`w-4 h-4 text-[#88B3B5] transition-transform ${isAiToolsOpen ? 'rotate-90' : '-rotate-90'}`} />
                          </button>

                          {isAiToolsOpen && (
                            <div className="pl-4">
                              <button
                                onClick={() => { setIsMenuOpen(false); setIsAiToolsOpen(false); void handleQueueWeeklyReport(); }}
                                disabled={isQueueingWeeklyReport || isStreaming}
                                className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-[#B9E9DD] hover:bg-white/5 disabled:opacity-50 transition-colors text-left"
                              >
                                <LineChart className="w-4 h-4 flex-shrink-0" />
                                {isQueueingWeeklyReport ? "Queueing report…" : "Generate Weekly Summary"}
                              </button>

                              {weeklyReport?.status === "completed" && (
                                <button
                                  onClick={() => { setIsMenuOpen(false); setIsAiToolsOpen(false); void handleDownloadWeeklyReport(); }}
                                  className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-[#D8E4FF] hover:bg-white/5 transition-colors text-left"
                                >
                                  <FileSpreadsheet className="w-4 h-4 flex-shrink-0" />
                                  Download Summary
                                </button>
                              )}

                              <button
                                onClick={() => { setIsMenuOpen(false); setIsAiToolsOpen(false); voiceInputRef.current?.click(); }}
                                disabled={isRunningQuickAction || isStreaming}
                                className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-[#F2D9A6] hover:bg-white/5 disabled:opacity-50 transition-colors text-left"
                              >
                                <FileAudio className="w-4 h-4 flex-shrink-0" />
                                Voice Input
                              </button>

                              {canAnalyzeFile && (
                                <button
                                  onClick={() => { setIsMenuOpen(false); setIsAiToolsOpen(false); fileInputRef.current?.click(); }}
                                  disabled={isRunningQuickAction || isStreaming}
                                  className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-[#D8E7A0] hover:bg-white/5 disabled:opacity-50 transition-colors text-left"
                                >
                                  <FileSpreadsheet className="w-4 h-4 flex-shrink-0" />
                                  {isFileAnalysisLoading ? "Analyzing…" : "Analyze File"}
                                </button>
                              )}

                              <button
                                onClick={() => { setIsMenuOpen(false); setIsAiToolsOpen(false); void handleTranscriptSummaryModalOpen(); }}
                                disabled={isRunningQuickAction || isStreaming}
                                className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-[#DAB9FF] hover:bg-white/5 disabled:opacity-50 transition-colors text-left"
                              >
                                <FileAudio className="w-4 h-4 flex-shrink-0" />
                                Summarize Transcript
                              </button>

                              <button
                                onClick={() => { setIsMenuOpen(false); setIsAiToolsOpen(false); void handleForecastAction(); }}
                                disabled={isRunningQuickAction || isStreaming}
                                className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-[#BCE7FF] hover:bg-white/5 disabled:opacity-50 transition-colors text-left"
                              >
                                <LineChart className="w-4 h-4 flex-shrink-0" />
                                Forecast Overview
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="py-1 border-t border-white/10">
                          <button
                            onClick={() => { setIsMenuOpen(false); setIsConfirmClearOpen(true); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-[#FFB3B3] hover:bg-white/5 transition-colors text-left"
                          >
                            <X className="w-4 h-4 flex-shrink-0" />
                            Clear Chat
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Below-header search bar — small screens only */}
              <div className={`sm:hidden overflow-hidden transition-all duration-300 ease-out ${searchOpen ? "max-h-[360px] opacity-100 pb-3" : "max-h-0 opacity-0"}`}>
                <div className="mx-6 border border-white/20 rounded-full px-5 py-3 flex items-center gap-2 bg-[#091519]">
                  <Search className="w-4 h-4 text-[#88B3B5] flex-shrink-0" />
                  <input
                    ref={mobileSearchInputRef}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search conversations..."
                    className="flex-1 bg-transparent text-white text-sm placeholder:text-[#88B3B5] outline-none"
                  />
                  {searchQuery.trim() !== "" && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-[#88B3B5] hover:text-white"
                      aria-label="Clear search"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
                {searchQuery.trim() !== "" && (
                  <div className="mx-6 mt-2 max-h-64 overflow-y-auto rounded-2xl border border-white/10 bg-[#0F2228]">
                    {searchLoading ? (
                      <p className="px-4 py-3 text-[12px] text-[#88B3B5]">Searching…</p>
                    ) : searchResults.length === 0 ? (
                      <p className="px-4 py-3 text-[12px] text-[#88B3B5]">No conversations found.</p>
                    ) : (
                      searchResults.map((result) => (
                        <button
                          key={`mobile-${result.thread_id}-${result.match_message_id}`}
                          type="button"
                          onClick={() => void handleOpenSearchResult(result)}
                          className="w-full border-b border-white/5 px-4 py-3 text-left hover:bg-white/5 transition-colors last:border-b-0"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-[13px] font-medium text-white truncate">{result.title}</p>
                            <span className="text-[10px] text-[#88B3B5] flex-shrink-0">{formatSearchDate(result.updated_at)}</span>
                          </div>
                          <p
                            className="mt-1 text-[12px] text-[#9CC6CA] line-clamp-2"
                            dangerouslySetInnerHTML={{ __html: highlightPlainText(result.snippet, searchQuery) }}
                          />
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Divider */}
            <div className="px-8 flex-shrink-0">
              <div className="h-[1px] bg-white/10 w-full" />
            </div>

            {/* Hidden file inputs — always rendered so menu buttons can trigger them */}
            <input
              ref={voiceInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleVoiceFile(file);
                event.currentTarget.value = "";
              }}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleAnalysisFile(file);
                event.currentTarget.value = "";
              }}
            />

            {isConfirmClearOpen && (
              <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
                <button className="absolute inset-0 bg-black/40" onClick={() => setIsConfirmClearOpen(false)} aria-label="Close" />
                <div className="relative w-full max-w-md bg-[#0F2A2F] border border-white/10 rounded-2xl p-5">
                  <h3 className="text-white text-[16px] font-semibold mb-2">Clear Chat?</h3>
                  <p className="text-[#B9E9DD] text-[13px] mb-4">This will permanently remove the current conversation history. This action cannot be undone.</p>
                  <div className="flex justify-end gap-2">
                    <button onClick={() => setIsConfirmClearOpen(false)} className="px-4 py-2 rounded-lg bg-[#132A33] text-[#B9E9DD]">Cancel</button>
                    <button onClick={() => void handleConfirmClear()} disabled={isClearing} className="px-4 py-2 rounded-lg bg-red-600 text-white">{isClearing ? 'Clearing...' : 'Clear Chat'}</button>
                  </div>
                </div>
              </div>
            )}

            {/* Transcript Summary Input Modal */}
            {isTranscriptModalOpen && (
              <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
                <button className="absolute inset-0 bg-black/40" onClick={() => setIsTranscriptModalOpen(false)} aria-label="Close" />
                <div className="relative w-full max-w-2xl bg-[#0F2A2F] border border-white/10 rounded-2xl p-6">
                  <h3 className="text-white text-[18px] font-semibold mb-2">Summarize Meeting Transcript</h3>
                  <p className="text-[#B9E9DD] text-[13px] mb-4">Paste your meeting transcript below for AI analysis.</p>

                  <textarea
                    value={transcriptInput}
                    onChange={(e) => setTranscriptInput(e.target.value)}
                    placeholder="Paste your meeting transcript here (minimum 20 characters)..."
                    className="w-full h-48 bg-[#1A3D4D] border border-[#355E73] rounded-lg p-3 text-[#B9E9DD] text-[13px] placeholder-[#5B7A87] focus:outline-none focus:border-[#4A7F94] resize-none"
                  />

                  <p className="text-[#88B3B5] text-[12px] mt-2 mb-4">
                    {transcriptInput.length} characters
                  </p>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsTranscriptModalOpen(false)}
                      className="px-4 py-2 rounded-lg bg-[#132A33] text-[#B9E9DD] hover:bg-[#1A3D4D]"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void handleTranscriptSummarize()}
                      disabled={isRunningQuickAction || transcriptInput.trim().length < 20}
                      className="px-4 py-2 rounded-lg bg-[#4A7F94] text-white hover:bg-[#5A8FA4] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isRunningQuickAction ? 'Analyzing...' : 'Summarize'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Voice Transcription Preview Modal */}
            {isVoicePreviewOpen && (
              <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
                <button className="absolute inset-0 bg-black/40" onClick={() => setIsVoicePreviewOpen(false)} aria-label="Close" />
                <div className="relative w-full max-w-2xl bg-[#0F2A2F] border border-white/10 rounded-2xl p-6 max-h-[80vh] overflow-y-auto">
                  <h3 className="text-white text-[18px] font-semibold mb-2">Voice Transcription</h3>

                  <div className="bg-[#1A3D4D] border border-[#355E73] rounded-lg p-4 mb-4">
                    <p className="text-[#88B3B5] text-[12px] uppercase tracking-wider font-semibold mb-2">Transcript:</p>
                    <p className="text-[#B9E9DD] text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                      {voiceTranscript}
                    </p>
                  </div>

                  {voiceTranscriptSummary && (
                    <div className="bg-[#132F3C] border border-[#355E73] rounded-lg p-4 mb-4">
                      <p className="text-[#88B3B5] text-[12px] uppercase tracking-wider font-semibold mb-2">What would you like to do?</p>
                      <p className="text-[#B9E9DD] text-[13px] leading-relaxed">
                        Send this transcript to chat for further discussion or analysis.
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsVoicePreviewOpen(false)}
                      className="px-4 py-2 rounded-lg bg-[#132A33] text-[#B9E9DD] hover:bg-[#1A3D4D]"
                    >
                      Close
                    </button>
                    <button
                      onClick={handleSendVoiceTranscriptToChat}
                      className="px-4 py-2 rounded-lg bg-[#4A7F94] text-white hover:bg-[#5A8FA4] flex items-center gap-2"
                    >
                      <Send className="w-4 h-4" />
                      Send to Chat
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* File Analysis Preview Modal */}
            {isAnalyzeFilePreviewOpen && (
              <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
                <button
                  className="absolute inset-0 bg-black/40"
                  onClick={handleCloseFileAnalysisModal}
                  aria-label="Close"
                />
                <div className="relative w-full max-w-2xl bg-[#0F2A2F] border border-white/10 rounded-2xl p-6 max-h-[80vh] overflow-y-auto">
                  <div className="flex items-center gap-3 mb-4">
                    {isFileAnalysisLoading && (
                      <div className="h-5 w-5 flex-shrink-0 rounded-full border-2 border-[#4A7F94]/30 border-t-[#7BB6B8] animate-spin" />
                    )}
                    <h3 className="text-white text-[18px] font-semibold">
                      {isFileAnalysisLoading ? "Analyzing File…" : "File Analysis"}
                    </h3>
                  </div>

                  <div className="bg-[#1A3D4D] border border-[#355E73] rounded-lg p-4 mb-2">
                    <p className="text-[#88B3B5] text-[12px] uppercase tracking-wider font-semibold mb-1">File:</p>
                    <p className="text-[#B9E9DD] text-[13px] truncate">
                      {fileAnalysisFileName}
                    </p>
                  </div>

                  <div className="bg-[#1A3D4D] border border-[#355E73] rounded-lg p-4 mb-4">
                    <p className="text-[#88B3B5] text-[12px] uppercase tracking-wider font-semibold mb-2">Analysis:</p>
                    {isFileAnalysisLoading ? (
                      <div className="space-y-3">
                        <p className="text-[#B9E9DD] text-[13px]">{fileAnalysisStage}</p>
                        <div className="space-y-2.5 pt-1">
                          {[100, 94, 88, 72, 58].map((width, index) => (
                            <div
                              key={`file-analysis-skeleton-${index}`}
                              className="h-3 rounded-full bg-white/10 animate-pulse"
                              style={{ width: `${width}%`, animationDelay: `${index * 120}ms` }}
                            />
                          ))}
                        </div>
                        <p className="text-[#88B3B5] text-[11px] leading-relaxed pt-1">
                          PDFs and spreadsheets can take a little longer. Your results will appear here automatically.
                        </p>
                      </div>
                    ) : (
                      <div
                        className="text-[#B9E9DD] text-[13px] leading-relaxed ai-message-content"
                        dangerouslySetInnerHTML={{ __html: formatAiMessageHtml(fileAnalysisResult) }}
                      />
                    )}
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={handleCloseFileAnalysisModal}
                      className="px-4 py-2 rounded-lg bg-[#132A33] text-[#B9E9DD] hover:bg-[#1A3D4D]"
                    >
                      Close
                    </button>
                    {!isFileAnalysisLoading && (
                      <button
                        onClick={handleSendFileAnalysisToChat}
                        className="px-4 py-2 rounded-lg bg-[#4A7F94] text-white hover:bg-[#5A8FA4] flex items-center gap-2"
                      >
                        <Send className="w-4 h-4" />
                        Send to Chat
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Landing panel — only visible before the first message */}
            {!hasMessages && (
              <div className="px-8 py-6 flex-shrink-0">
                <div className="border border-white/20 rounded-[32px] px-6 py-5 space-y-4">
                  <p className="text-[#88B3B5] text-[15px] font-medium">{ELY_LANDING_HEADLINE}</p>
                  <p className="text-white/40 text-[13px] leading-relaxed">
                    {ELY_LANDING_SUBTEXT}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      onClick={() => void handlePlanTodayPriorities()}
                      disabled={isRunningQuickAction || isStreaming}
                      className="rounded-full border border-[#2D6F63] bg-[#113B37] px-3 py-1.5 text-[11px] font-semibold text-[#B9E9DD] hover:bg-[#1B4D47] disabled:opacity-60"
                    >
                      Plan Today&apos;s Priorities
                    </button>
                    <button
                      onClick={handleQueueWeeklyReport}
                      disabled={isQueueingWeeklyReport || isStreaming}
                      className="rounded-full border border-[#2D6F63] bg-[#113B37] px-3 py-1.5 text-[11px] font-semibold text-[#B9E9DD] hover:bg-[#1B4D47] disabled:opacity-60"
                    >
                      {isQueueingWeeklyReport ? "Queueing..." : "Generate Weekly Summary"}
                    </button>
                    <button
                      onClick={() => voiceInputRef.current?.click()}
                      disabled={isRunningQuickAction || isStreaming}
                      className="rounded-full border border-[#6B5A3B] bg-[#342A1A] px-3 py-1.5 text-[11px] text-[#F2D9A6] hover:bg-[#433322] disabled:opacity-60"
                    >
                      <span className="inline-flex items-center gap-1"><FileAudio className="h-3.5 w-3.5" /> Voice Input</span>
                    </button>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isRunningQuickAction || isStreaming}
                      className="rounded-full border border-[#4F5D2A] bg-[#2B3418] px-3 py-1.5 text-[11px] text-[#D8E7A0] hover:bg-[#364221] disabled:opacity-60"
                    >
                      <span className="inline-flex items-center gap-1"><FileSpreadsheet className="h-3.5 w-3.5" /> {isFileAnalysisLoading ? "Analyzing…" : "Analyze File"}</span>
                    </button>
                    <button
                      onClick={handleTranscriptSummaryModalOpen}
                      disabled={isRunningQuickAction || isStreaming}
                      className="rounded-full border border-[#5A496E] bg-[#2C2139] px-3 py-1.5 text-[11px] text-[#DAB9FF] hover:bg-[#39294A] disabled:opacity-60"
                    >
                      Summarize Transcript
                    </button>
                    <button
                      onClick={handleForecastAction}
                      disabled={isRunningQuickAction || isStreaming}
                      className="rounded-full border border-[#355E73] bg-[#132F3C] px-3 py-1.5 text-[11px] text-[#BCE7FF] hover:bg-[#1A3D4D] disabled:opacity-60"
                    >
                      <span className="inline-flex items-center gap-1"><LineChart className="h-3.5 w-3.5" /> Forecast</span>
                    </button>
                  </div>
                  {weeklyReport && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="rounded-full border border-[#3D6A78] bg-[#11303A] px-2.5 py-1 text-[11px] text-[#9CC6CA]">
                        Report: {weeklyReport.status} ({weeklyReport.progress}%)
                      </span>
                      {weeklyReport.status === "completed" && (
                        <button
                          onClick={handleDownloadWeeklyReport}
                          className="rounded-full border border-[#425FA6] bg-[#1A2F5E] px-3 py-1.5 text-[11px] font-semibold text-[#D8E4FF] hover:bg-[#243E79]"
                        >
                          Download Summary
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-6 py-2 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
              {isInitializing && !hasMessages && (
                <div className="flex flex-col gap-3 pt-2">
                  {[80, 55, 70].map((w, i) => (
                    <div key={i} className={`h-3 rounded-full bg-white/10 animate-pulse`} style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }} />
                  ))}
                  <div className="flex gap-3 mt-2">
                    {[45, 60].map((w, i) => (
                      <div key={i} className="h-3 rounded-full bg-white/10 animate-pulse" style={{ width: `${w}%`, animationDelay: `${i * 120}ms` }} />
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg, index) => (
                <div key={msg.id} id={`copilot-msg-${msg.id}`}>
                  {msg.role === "user" ? (
                    /* User message */
                    <div className="flex justify-end mb-3">
                      <div className="group relative max-w-[75%]">
                        <div className="bg-[#5B2155] text-white/90 text-[13px] px-4 py-2.5 rounded-[20px] leading-relaxed shadow-sm">
                          {highlightMessageId === msg.id && highlightQuery.trim() !== "" ? (
                            <span dangerouslySetInnerHTML={{ __html: highlightPlainText(msg.content, highlightQuery) }} />
                          ) : (
                            msg.content
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* AI message */
                    <div className="flex flex-col gap-3 max-w-[65%]">
                      <div className="bg-gradient-to-b from-[#333333] to-[#16384B] rounded-[20px] p-4 shadow-sm">
                        <div
                          className="text-[#D0E2E3] text-[13px] leading-[1.7] ai-message-content font-light"
                          dangerouslySetInnerHTML={{ __html: formatAiMessageHtml(msg.content) }}
                        />
                      </div>
                      {Array.isArray(msg.sources) && msg.sources.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 pl-1">
                          {msg.sources.map((source) => (
                            <span
                              key={`${msg.id}-${source}`}
                              className="rounded-full border border-[#3D6A78] bg-[#11303A] px-2.5 py-1 text-[11px] text-[#9CC6CA]"
                            >
                              {source}
                            </span>
                          ))}
                        </div>
                      )}
                      {messagePayload(msg)?.confirmation_required === true && (
                        <div className="pl-1">
                          {(() => {
                            const previewRows = confirmationPreviewRows(msg);
                            if (previewRows.length === 0) {
                              return null;
                            }

                            return (
                              <div className="mb-2 rounded-xl border border-[#2F5E5A]/70 bg-[#152B2A] px-3 py-2">
                                <p className="text-[11px] font-semibold text-[#A6DFD2] mb-1">Parsed action details:</p>
                                <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
                                  {previewRows.map((row) => (
                                    <div key={`${msg.id}-preview-${row.key}`} className="contents">
                                      <span className="text-[11px] text-[#8CB9B3]">{row.label}</span>
                                      <span className={`text-[11px] ${row.warning ? "text-[#F2B4A6]" : "text-[#C9E5E0]"}`}>
                                        {row.value}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}
                          {(() => {
                            const args = actionArgsForMessage(msg);
                            const payloadTool = String(messagePayload(msg)?.tool ?? "");
                            if (!args) {
                              return null;
                            }

                            if (payloadTool === "meetings.schedule") {
                              return (
                                <div className="mb-2 rounded-xl border border-[#355C57]/70 bg-[#102322] px-3 py-2">
                                  <p className="text-[11px] font-semibold text-[#9FD3C8] mb-2">Edit before confirm:</p>
                                  <ElyMeetingActionFields
                                    msgId={msg.id}
                                    args={args}
                                    draft={meetingActionDrafts[msg.id]}
                                    onDraftChange={updateMeetingActionDraft}
                                    candidates={meetingAttendeeOptions[msg.id]?.items ?? []}
                                    loadingCandidates={meetingAttendeeOptions[msg.id]?.loading === true}
                                  />
                                </div>
                              );
                            }

                            const fields = editFieldsForMessage(msg, args);
                            if (fields.length === 0) {
                              return null;
                            }

                            return (
                              <div className="mb-2 rounded-xl border border-[#355C57]/70 bg-[#102322] px-3 py-2">
                                <p className="text-[11px] font-semibold text-[#9FD3C8] mb-2">Edit before confirm:</p>
                                <div className="grid grid-cols-1 gap-2">
                                  {fields.map((field) => {
                                    const value = editFieldValue(msg, args, field);
                                    const baseClassName = "w-full rounded-lg border border-[#355C57] bg-[#0D1C1C] px-2.5 py-2 text-[12px] text-[#D0E2E3] outline-none focus:border-[#4F8C83]";

                                    if (field.control === "select") {
                                      const options = field.options ?? [];
                                      const hasCurrent = value !== "" && !options.some((opt) => opt.value === value);

                                      return (
                                        <div key={`${msg.id}-edit-${field.key}`} className="grid gap-1">
                                          <label className="text-[11px] text-[#8CB9B3]">{field.label}</label>
                                          <select
                                            value={value}
                                            onChange={(e) => updateActionDraft(msg.id, field.key, e.target.value)}
                                            className={baseClassName}
                                          >
                                            <option value="">Select {field.label}</option>
                                            {hasCurrent && <option value={value}>{toTitleCase(value)}</option>}
                                            {options.map((option) => (
                                              <option key={`${msg.id}-opt-${field.key}-${option.value}`} value={option.value}>
                                                {option.label}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                      );
                                    }

                                    if (field.control === "textarea") {
                                      return (
                                        <div key={`${msg.id}-edit-${field.key}`} className="grid gap-1">
                                          <label className="text-[11px] text-[#8CB9B3]">{field.label}</label>
                                          <textarea
                                            value={value}
                                            onChange={(e) => updateActionDraft(msg.id, field.key, e.target.value)}
                                            rows={3}
                                            className={`${baseClassName} resize-none`}
                                          />
                                        </div>
                                      );
                                    }

                                    const inputType = field.control === "datetime-local"
                                      ? "datetime-local"
                                      : field.control === "date"
                                        ? "date"
                                        : field.control === "number"
                                          ? "number"
                                          : "text";

                                    return (
                                      <div key={`${msg.id}-edit-${field.key}`} className="grid gap-1">
                                        <label className="text-[11px] text-[#8CB9B3]">{field.label}</label>
                                        <input
                                          type={inputType}
                                          value={value}
                                          onChange={(e) => updateActionDraft(msg.id, field.key, e.target.value)}
                                          className={baseClassName}
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}
                          {Array.isArray(messagePayload(msg)?.validation_warnings) && (messagePayload(msg)?.validation_warnings as unknown[]).length > 0 && (
                            <div className="mb-2 rounded-xl border border-[#7A5A2A]/60 bg-[#2F2617] px-3 py-2">
                              <p className="text-[11px] font-semibold text-[#F2D9A6] mb-1">Please review before confirming:</p>
                              <ul className="space-y-1">
                                {(messagePayload(msg)?.validation_warnings as unknown[]).map((warning, idx) => (
                                  <li key={`${msg.id}-warn-${idx}`} className="text-[11px] text-[#EBCFA0] leading-relaxed">
                                    - {String(warning)}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {isBlockingConfirmation(msg) && (
                            <p className="mb-2 text-[11px] text-[#F2B4A6]">
                              {blockingMessage(msg)}
                            </p>
                          )}
                          <div className="flex items-center gap-2">
                            {isBlockingConfirmation(msg) && (
                              <button
                                onClick={() => handleEditActionDetails(index)}
                                disabled={isStreaming}
                                className="rounded-full border border-[#7A5A2A]/70 bg-[#2F2617] px-3 py-2 text-[11px] font-semibold text-[#F2D9A6] hover:bg-[#3B2E1D] disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Edit Details
                              </button>
                            )}
                            <button
                              onClick={() => handleConfirmAction(index, msg)}
                              disabled={isStreaming || isBlockingConfirmation(msg)}
                              className="rounded-full bg-[#2D6F63] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#358372] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Confirm Action
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-5 pl-2 mt-1">
                        <button
                          onClick={() => handleAction(msg.id, "liked")}
                          className={`transition-colors ${actionMap[msg.id] === "liked"
                            ? "text-[#7BB6B8]"
                            : "text-white/40 hover:text-white/80"
                            }`}
                        >
                          <ThumbsUp className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleAction(msg.id, "disliked")}
                          className={`transition-colors ${actionMap[msg.id] === "disliked"
                            ? "text-red-400"
                            : "text-white/40 hover:text-white/80"
                            }`}
                        >
                          <ThumbsDown className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleCopy(msg.id, msg.content)}
                          className="text-white/40 hover:text-white/80 transition-colors flex items-center gap-1 relative"
                        >
                          <Copy className="w-5 h-5" />
                          {copiedMap[msg.id] && (
                            <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[12px] text-[#7BB6B8] bg-[#1A3844] px-2.5 py-1 rounded shadow-md">Copied!</span>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {isStreaming && (() => {
                const lastMessage = messages[messages.length - 1];
                const assistantHasContent = lastMessage?.role === "assistant" && Boolean(lastMessage.content?.trim());
                if (assistantHasContent) return null;
                return (
                <div className="max-w-[65%]">
                  <div className="bg-gradient-to-b from-[#333333] to-[#16384B] rounded-[24px] px-6 py-4 shadow-sm">
                    {processingLabel ? (
                      <p className="text-[#D0E2E3]/90 text-[13px] font-medium animate-pulse">{processingLabel}</p>
                    ) : (
                      <div className="flex gap-1.5 items-center justify-center h-4">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="w-2.5 h-2.5 bg-[#D0E2E3]/60 rounded-full animate-bounce"
                            style={{ animationDelay: `${i * 150}ms` }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                );
              })()}

              <div ref={messagesEndRef} />
            </div>

            {/* Bottom input */}
            <div className="px-6 pb-6 pt-3 flex-shrink-0">
              <div className="flex items-center gap-2 bg-[#DCE0E1] rounded-[40px] p-1.5 pl-4 shadow-lg">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-8 h-8 flex items-center justify-center text-[#091519] hover:text-black transition-colors flex-shrink-0"
                  title="Upload file"
                >
                  <Paperclip className="w-5 h-5" />
                </button>
                <div className="flex-1 bg-[#CDD1D2] rounded-[32px] flex items-center px-5 h-[40px] ml-1 border border-black/5 shadow-inner">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={ELY_INPUT_PLACEHOLDER}
                    className="flex-1 bg-transparent text-[#091519] text-[14px] placeholder:text-[#091519]/60 font-medium outline-none min-w-0"
                  />
                </div>
                {input.trim() && (
                  <button
                    onClick={() => sendMessage()}
                    className="w-10 h-10 rounded-full bg-[#16384B] flex items-center justify-center flex-shrink-0 hover:bg-[#16384B]/80 transition-colors ml-1 mr-0.5"
                  >
                    <ChevronLeft className="w-5 h-5 text-white rotate-180" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      <style>{`
        .ai-message-content u {
          text-decoration: underline;
          text-underline-offset: 3px;
          text-decoration-thickness: 1px;
        }
      `}</style>
    </>
  );
}

