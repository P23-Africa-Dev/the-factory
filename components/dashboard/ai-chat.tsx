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
  } = useCopilotChat();

  const [actionMap, setActionMap] = useState<Record<string, MessageAction>>({});
  const [copiedMap, setCopiedMap] = useState<Record<string, boolean>>({});
  const [input, setInput] = useState("");
  const [isRunningQuickAction, setIsRunningQuickAction] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const voiceInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !companyId) return;
    void initialize(companyId);
  }, [companyId, initialize, open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

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

    void sendCopilotMessage({
      message: priorPrompt,
      companyId: companyId ?? undefined,
      actionConfirmed: true,
      actionArgs:
        payload.action_args && typeof payload.action_args === "object"
          ? (payload.action_args as Record<string, unknown>)
          : undefined,
    });
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
                <button className="w-12 h-12 rounded-full bg-[#132A33] flex items-center justify-center hover:bg-[#1A3844] transition-colors">
                  <MoreVertical className="w-5 h-5 text-[#88B3B5]" />
                </button>
              </div>
            </div>

            {/* Divider */}
            <div className="px-8 flex-shrink-0">
              <div className="h-[1px] bg-white/10 w-full" />
            </div>

            {/* Top search bar (decorative, matches screenshot) */}
            <div className="px-8 py-6 flex-shrink-0">
              <div className="border border-white/20 rounded-[32px] px-6 py-4 space-y-3">
                <p className="text-[#88B3B5] text-[15px]">Ask Anything...</p>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={handleQueueWeeklyReport}
                    disabled={isQueueingWeeklyReport || isStreaming}
                    className="rounded-full border border-[#2D6F63] bg-[#113B37] px-3 py-1.5 text-[11px] font-semibold text-[#B9E9DD] hover:bg-[#1B4D47] disabled:opacity-60"
                  >
                    {isQueueingWeeklyReport ? "Queueing..." : "Generate Weekly Summary"}
                  </button>
                  {weeklyReport && (
                    <span className="rounded-full border border-[#3D6A78] bg-[#11303A] px-2.5 py-1 text-[11px] text-[#9CC6CA]">
                      Report {weeklyReport.status} ({weeklyReport.progress}%)
                    </span>
                  )}
                  {weeklyReport?.status === "completed" && (
                    <button
                      onClick={handleDownloadWeeklyReport}
                      className="rounded-full border border-[#425FA6] bg-[#1A2F5E] px-3 py-1.5 text-[11px] font-semibold text-[#D8E4FF] hover:bg-[#243E79]"
                    >
                      Download Summary
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
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
                  <input
                    ref={voiceInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        void handleVoiceFile(file);
                      }
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
                      if (file) {
                        void handleAnalysisFile(file);
                      }
                      event.currentTarget.value = "";
                    }}
                  />
                </div>
              </div>
            </div>

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
                          <button
                            onClick={() => handleConfirmAction(index, msg)}
                            disabled={isStreaming}
                            className="rounded-full bg-[#2D6F63] px-4 py-2 text-[12px] font-semibold text-white hover:bg-[#358372] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Confirm Action
                          </button>
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

