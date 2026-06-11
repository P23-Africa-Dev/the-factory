"use client";

import { useCopilotChat } from "@/hooks/use-copilot-chat";
import { getActiveCompanyContext } from "@/lib/company-context";
import { useAuthStore } from "@/store/auth";
import Image from "next/image";
import {
  Camera,
  ChevronLeft,
  Copy,
  FileAudio,
  FileSpreadsheet,
  LineChart,
  MoreVertical,
  Search,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

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

interface AssigneeSuggestionState {
  query: string;
  loading: boolean;
  items: AssigneeOption[];
}

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

export function AIChat({ open, onClose }: AIChatProps) {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.name?.split(" ")[0] ?? "User";
  const avatarSrc = getSafeAvatarSrc(user?.avatar) ?? "/avatars/male-avatar.png";
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);
  const {
    messages,
    isStreaming,
    weeklyReport,
    isQueueingWeeklyReport,
    initialize,
    sendMessage: sendCopilotMessage,
    queueWeeklyReport,
    downloadWeeklyReport,
    runVoiceTranscription,
    runFileAnalysis,
    runTranscriptSummary,
    loadForecastOverview,
    searchAssignees,
  } = useCopilotChat();

  const [actionMap, setActionMap] = useState<Record<string, MessageAction>>({});
  const [copiedMap, setCopiedMap] = useState<Record<string, boolean>>({});
  const [input, setInput] = useState("");
  const [actionDrafts, setActionDrafts] = useState<ActionDraftMap>({});
  const [assigneeSuggestions, setAssigneeSuggestions] = useState<Record<string, AssigneeSuggestionState>>({});
  const [isRunningQuickAction, setIsRunningQuickAction] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const assigneeLookupTimersRef = useRef<Record<string, ReturnType<typeof setTimeout> | undefined>>({});
  const assigneeLookupSeqRef = useRef<Record<string, number>>({});

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
    void initialize(companyId);
  }, [companyId, initialize, open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  useEffect(() => {
    return () => {
      Object.values(assigneeLookupTimersRef.current).forEach((timer) => {
        if (timer) {
          clearTimeout(timer);
        }
      });
    };
  }, []);

  function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content) return;

    setInput("");

    void sendCopilotMessage({
      message: content,
      companyId: companyId ?? undefined,
    });
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

  function clearAssigneeSuggestions(msgId: string) {
    setAssigneeSuggestions((prev) => ({
      ...prev,
      [msgId]: {
        query: "",
        loading: false,
        items: [],
      },
    }));
  }

  async function runAssigneeLookup(msgId: string, query: string, seq: number) {
    try {
      const items = await searchAssignees(query, companyId ?? undefined, 8);

      if ((assigneeLookupSeqRef.current[msgId] ?? 0) !== seq) {
        return;
      }

      setAssigneeSuggestions((prev) => ({
        ...prev,
        [msgId]: {
          query,
          loading: false,
          items,
        },
      }));
    } catch {
      if ((assigneeLookupSeqRef.current[msgId] ?? 0) !== seq) {
        return;
      }

      setAssigneeSuggestions((prev) => ({
        ...prev,
        [msgId]: {
          query,
          loading: false,
          items: [],
        },
      }));
    }
  }

  function handleAssigneeFieldChange(msgId: string, value: string) {
    updateActionDraft(msgId, "assignee", value);

    const timer = assigneeLookupTimersRef.current[msgId];
    if (timer) {
      clearTimeout(timer);
    }

    const query = value.trim();
    if (query.length < 2) {
      clearAssigneeSuggestions(msgId);
      return;
    }

    setAssigneeSuggestions((prev) => ({
      ...prev,
      [msgId]: {
        query,
        loading: true,
        items: prev[msgId]?.items ?? [],
      },
    }));

    const seq = (assigneeLookupSeqRef.current[msgId] ?? 0) + 1;
    assigneeLookupSeqRef.current[msgId] = seq;

    assigneeLookupTimersRef.current[msgId] = setTimeout(() => {
      void runAssigneeLookup(msgId, query, seq);
    }, 250);
  }

  function selectAssigneeSuggestion(msgId: string, option: AssigneeOption) {
    updateActionDraft(msgId, "assignee", option.email);
    setAssigneeSuggestions((prev) => ({
      ...prev,
      [msgId]: {
        query: option.email,
        loading: false,
        items: [],
      },
    }));
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

  function blockingIssuesForMessage(msg: Message): string[] {
    const blockingCodes = blockingWarningCodesForMessage(msg);
    if (blockingCodes.length === 0) {
      return [];
    }

    const args = actionArgsForMessage(msg);
    const remaining: string[] = [];

    for (const code of blockingCodes) {
      if (code === "assignee_unresolved") {
        const assigneeEdited = assigneeDraftValue(msg) !== "";
        const hasResolvedId = typeof args?.assigned_agent_id === "number";
        if (!assigneeEdited && !hasResolvedId) {
          remaining.push(code);
        }
        continue;
      }

      if (code === "used_default_title") {
        const title = String(args?.title ?? "").trim().toLowerCase();
        if (title === "" || title === "task created by copilot") {
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

      const assigneeEdited = assigneeDraftValue(msg) !== "";
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
          value: formatPreviewValue("assignee", args.assignee ?? args.assigned_agent_id),
        });
      }

      return rows;
    }

    return Object.entries(args)
      .filter(([key]) => key !== "company_id")
      .map(([key, value]) => ({
        key,
        label: key.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
        value: formatPreviewValue(key, value),
      }));
  }

  function findPreviousUserContent(index: number): string {
    for (let i = index - 1; i >= 0; i -= 1) {
      if (messages[i]?.role === "user") {
        return String(messages[i]?.content ?? "");
      }
    }

    return "";
  }

  function handleConfirmAction(index: number, msg: Message) {
    const payload = messagePayload(msg);
    if (!payload) return;

    const priorPrompt = findPreviousUserContent(index);
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
    const priorPrompt = findPreviousUserContent(index);
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

    if (issues.includes("used_default_title") || issues.includes("used_default_due_date")) {
      return "Confirmation is blocked until title and due date are explicitly set.";
    }

    return "Confirmation is currently blocked until required fields are corrected.";
  }

  async function handleQueueWeeklyReport() {
    await queueWeeklyReport(companyId ?? undefined);
  }

  async function handleDownloadWeeklyReport() {
    await downloadWeeklyReport(companyId ?? undefined);
  }

  async function handleVoiceFile(file: File) {
    setIsRunningQuickAction(true);
    try {
      const result = await runVoiceTranscription(file, companyId ?? undefined);
      const transcript = String(result?.transcript ?? "Voice transcription completed.");
      void sendCopilotMessage({
        message: `Voice note transcript:\n${transcript}`,
        companyId: companyId ?? undefined,
      });
    } finally {
      setIsRunningQuickAction(false);
    }
  }

  async function handleAnalysisFile(file: File) {
    setIsRunningQuickAction(true);
    try {
      const result = await runFileAnalysis(file, companyId ?? undefined);
      const summary = String((result?.analysis as { summary?: string } | undefined)?.summary ?? "File analysis completed.");
      void sendCopilotMessage({
        message: `File analysis: ${summary}`,
        companyId: companyId ?? undefined,
      });
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

  async function handleTranscriptSummaryAction() {
    if (typeof window === "undefined") return;

    const transcript = window.prompt("Paste meeting transcript text to summarize:");
    if (!transcript || transcript.trim().length < 20) return;

    setIsRunningQuickAction(true);
    try {
      const result = await runTranscriptSummary(transcript, companyId ?? undefined);
      const summary = result?.summary as { key_points?: string[]; action_items?: string[] } | undefined;
      const keyPoints = (summary?.key_points ?? []).slice(0, 3).map((item) => `- ${item}`).join("\n");
      const actionItems = (summary?.action_items ?? []).slice(0, 3).map((item) => `- ${item}`).join("\n");

      void sendCopilotMessage({
        message: `Transcript summary:\nKey points:\n${keyPoints || "- None"}\nAction items:\n${actionItems || "- None"}`,
        companyId: companyId ?? undefined,
      });
    } finally {
      setIsRunningQuickAction(false);
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
          <div className="flex-1 bg-[#091519] rounded-[24px] sm:rounded-[28px] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-4 px-6 pt-6 pb-4 flex-shrink-0">
              <button
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center hover:bg-white/5 transition-colors rounded-full flex-shrink-0"
              >
                <ChevronLeft className="w-6 h-6 text-white" />
              </button>

              <div className="flex items-center gap-4 flex-1 min-w-0">
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
                  <p className="text-white text-[28px] font-semibold leading-tight truncate">
                    {firstName}!
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 flex-shrink-0">
                <button className="w-12 h-12 rounded-full bg-[#132A33] flex items-center justify-center hover:bg-[#1A3844] transition-colors">
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
                        <p className="text-[#88B3B5] text-[11px] font-semibold uppercase tracking-wider">Quick Actions</p>
                      </div>
                      <div className="py-1">
                        <button
                          onClick={() => { setIsMenuOpen(false); void handleQueueWeeklyReport(); }}
                          disabled={isQueueingWeeklyReport || isStreaming}
                          className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-[#B9E9DD] hover:bg-white/5 disabled:opacity-50 transition-colors text-left"
                        >
                          <LineChart className="w-4 h-4 flex-shrink-0" />
                          {isQueueingWeeklyReport ? "Queueing report…" : "Generate Weekly Summary"}
                        </button>

                        {weeklyReport?.status === "completed" && (
                          <button
                            onClick={() => { setIsMenuOpen(false); void handleDownloadWeeklyReport(); }}
                            className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-[#D8E4FF] hover:bg-white/5 transition-colors text-left"
                          >
                            <FileSpreadsheet className="w-4 h-4 flex-shrink-0" />
                            Download Summary
                          </button>
                        )}

                        <button
                          onClick={() => { setIsMenuOpen(false); voiceInputRef.current?.click(); }}
                          disabled={isRunningQuickAction || isStreaming}
                          className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-[#F2D9A6] hover:bg-white/5 disabled:opacity-50 transition-colors text-left"
                        >
                          <FileAudio className="w-4 h-4 flex-shrink-0" />
                          Voice Input
                        </button>

                        <button
                          onClick={() => { setIsMenuOpen(false); fileInputRef.current?.click(); }}
                          disabled={isRunningQuickAction || isStreaming}
                          className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-[#D8E7A0] hover:bg-white/5 disabled:opacity-50 transition-colors text-left"
                        >
                          <FileSpreadsheet className="w-4 h-4 flex-shrink-0" />
                          Analyze File
                        </button>

                        <button
                          onClick={() => { setIsMenuOpen(false); void handleTranscriptSummaryAction(); }}
                          disabled={isRunningQuickAction || isStreaming}
                          className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-[#DAB9FF] hover:bg-white/5 disabled:opacity-50 transition-colors text-left"
                        >
                          <FileAudio className="w-4 h-4 flex-shrink-0" />
                          Summarize Transcript
                        </button>

                        <button
                          onClick={() => { setIsMenuOpen(false); void handleForecastAction(); }}
                          disabled={isRunningQuickAction || isStreaming}
                          className="w-full flex items-center gap-3 px-4 py-3 text-[13px] text-[#BCE7FF] hover:bg-white/5 disabled:opacity-50 transition-colors text-left"
                        >
                          <LineChart className="w-4 h-4 flex-shrink-0" />
                          Forecast Overview
                        </button>
                      </div>

                      {weeklyReport && weeklyReport.status !== "completed" && (
                        <div className="px-4 py-2.5 border-t border-white/10">
                          <p className="text-[#9CC6CA] text-[11px]">
                            Report: {weeklyReport.status} ({weeklyReport.progress}%)
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
              accept=".pdf,.xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleAnalysisFile(file);
                event.currentTarget.value = "";
              }}
            />

            {/* Landing panel — only visible before the first message */}
            {!hasMessages && (
              <div className="px-8 py-6 flex-shrink-0">
                <div className="border border-white/20 rounded-[32px] px-6 py-5 space-y-4">
                  <p className="text-[#88B3B5] text-[15px] font-medium">Ask Anything…</p>
                  <p className="text-white/40 text-[13px] leading-relaxed">
                    Get summaries, create tasks, schedule meetings, view attendance, or ask anything about your operations.
                  </p>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
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
                      <span className="inline-flex items-center gap-1"><FileSpreadsheet className="h-3.5 w-3.5" /> Analyze File</span>
                    </button>
                    <button
                      onClick={handleTranscriptSummaryAction}
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
            <div className="flex-1 overflow-y-auto px-8 py-2 space-y-8 scrollbar-thin scrollbar-thumb-white/10">
              {messages.map((msg, index) => (
                <div key={msg.id}>
                  {msg.role === "user" ? (
                    /* User message */
                    <div className="flex justify-end mb-6">
                      <div className="group relative max-w-[75%]">
                        <div className="bg-[#5B2155] text-white/90 text-[16px] px-6 py-3.5 rounded-[32px] leading-relaxed shadow-sm">
                          {msg.content}
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* AI message */
                    <div className="flex flex-col gap-4 max-w-[65%]">
                      <div className="bg-gradient-to-b from-[#333333] to-[#16384B] rounded-[24px] p-7 shadow-sm">
                        <div
                          className="text-[#D0E2E3] text-[15px] leading-[1.8] ai-message-content font-light"
                          dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br />') }}
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
                            const payload = messagePayload(msg);
                            if (payload?.tool !== "tasks.create") {
                              return null;
                            }

                            const args = actionArgsForMessage(msg);
                            if (!args) {
                              return null;
                            }

                            const typeValue = String(args.type ?? "inspection");
                            const dueValue = String(args.due_date ?? "");
                            const titleValue = String(args.title ?? "");
                            const assigneeValue = assigneeDraftValue(msg);
                            const suggestionState = assigneeSuggestions[msg.id];
                            const assigneeFallback = typeof args.assigned_agent_id === "number"
                              ? `Agent #${String(args.assigned_agent_id)}`
                              : "";

                            return (
                              <div className="mb-2 rounded-xl border border-[#355C57]/70 bg-[#102322] px-3 py-2">
                                <p className="text-[11px] font-semibold text-[#9FD3C8] mb-2">Edit before confirm:</p>
                                <div className="grid grid-cols-1 gap-2">
                                  <input
                                    value={titleValue}
                                    onChange={(e) => updateActionDraft(msg.id, "title", e.target.value)}
                                    placeholder="Task title"
                                    className="w-full rounded-lg border border-[#355C57] bg-[#0D1C1C] px-2.5 py-2 text-[12px] text-[#D0E2E3] placeholder:text-[#7EA09B] outline-none focus:border-[#4F8C83]"
                                  />
                                  <div className="grid grid-cols-2 gap-2">
                                    <select
                                      value={typeValue}
                                      onChange={(e) => updateActionDraft(msg.id, "type", e.target.value)}
                                      className="rounded-lg border border-[#355C57] bg-[#0D1C1C] px-2.5 py-2 text-[12px] text-[#D0E2E3] outline-none focus:border-[#4F8C83]"
                                    >
                                      <option value="inspection">Inspection</option>
                                      <option value="sales_visit">Sales Visit</option>
                                      <option value="delivery">Delivery</option>
                                      <option value="collection">Collection</option>
                                      <option value="awareness">Awareness</option>
                                    </select>
                                    <input
                                      value={dueValue}
                                      onChange={(e) => updateActionDraft(msg.id, "due_date", e.target.value)}
                                      placeholder="Due date (e.g. tomorrow 5pm)"
                                      className="rounded-lg border border-[#355C57] bg-[#0D1C1C] px-2.5 py-2 text-[12px] text-[#D0E2E3] placeholder:text-[#7EA09B] outline-none focus:border-[#4F8C83]"
                                    />
                                  </div>
                                  <input
                                    value={assigneeValue}
                                    onChange={(e) => handleAssigneeFieldChange(msg.id, e.target.value)}
                                    placeholder={assigneeFallback !== "" ? `Assignee name or email (${assigneeFallback})` : "Assignee name or email"}
                                    className="w-full rounded-lg border border-[#355C57] bg-[#0D1C1C] px-2.5 py-2 text-[12px] text-[#D0E2E3] placeholder:text-[#7EA09B] outline-none focus:border-[#4F8C83]"
                                  />
                                  {(suggestionState?.loading === true || (Array.isArray(suggestionState?.items) && suggestionState.items.length > 0) || ((suggestionState?.query?.length ?? 0) >= 2 && suggestionState?.loading === false)) && (
                                    <div className="rounded-lg border border-[#244643] bg-[#0B1717] p-1.5">
                                      {suggestionState?.loading === true && (
                                        <p className="px-2 py-1 text-[11px] text-[#7EA09B]">Searching assignees...</p>
                                      )}

                                      {suggestionState?.loading === false && Array.isArray(suggestionState.items) && suggestionState.items.length > 0 && (
                                        <div className="flex flex-col gap-1">
                                          {suggestionState.items.map((option) => (
                                            <button
                                              key={`${msg.id}-assignee-${option.id}`}
                                              type="button"
                                              onClick={() => selectAssigneeSuggestion(msg.id, option)}
                                              className="flex items-center justify-between rounded-md px-2 py-1.5 text-left hover:bg-[#12302F]"
                                            >
                                              <span className="text-[11px] text-[#D0E2E3]">{option.name}</span>
                                              <span className="text-[10px] text-[#8FB8B1]">{option.email}</span>
                                            </button>
                                          ))}
                                        </div>
                                      )}

                                      {suggestionState?.loading === false && Array.isArray(suggestionState.items) && suggestionState.items.length === 0 && (suggestionState.query?.length ?? 0) >= 2 && (
                                        <p className="px-2 py-1 text-[11px] text-[#7EA09B]">No matching assignees found in your company.</p>
                                      )}
                                    </div>
                                  )}
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

              {isStreaming && (
                <div className="max-w-[65%]">
                  <div className="bg-gradient-to-b from-[#333333] to-[#16384B] rounded-[24px] p-6 shadow-sm w-24">
                    <div className="flex gap-1.5 items-center justify-center h-4">
                      {[0, 1, 2].map((i) => (
                        <span
                          key={i}
                          className="w-2.5 h-2.5 bg-[#D0E2E3]/60 rounded-full animate-bounce"
                          style={{ animationDelay: `${i * 150}ms` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Bottom input */}
            <div className="px-8 pb-10 pt-4 flex-shrink-0">
              <div className="flex items-center gap-2 bg-[#DCE0E1] rounded-[48px] p-2 pl-5 shadow-lg">
                <button className="w-10 h-10 flex items-center justify-center text-[#091519] hover:text-black transition-colors flex-shrink-0">
                  <Camera className="w-6 h-6" />
                </button>
                <div className="flex-1 bg-[#CDD1D2] rounded-[40px] flex items-center px-6 h-[60px] ml-1 border border-black/5 shadow-inner">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Anything..."
                    className="flex-1 bg-transparent text-[#091519] text-[16px] placeholder:text-[#091519]/60 font-medium outline-none min-w-0"
                  />
                </div>
                {input.trim() && (
                  <button
                    onClick={() => sendMessage()}
                    className="w-14 h-14 rounded-full bg-[#16384B] flex items-center justify-center flex-shrink-0 hover:bg-[#16384B]/80 transition-colors ml-2 mr-1"
                  >
                    <ChevronLeft className="w-6 h-6 text-white rotate-180" />
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

