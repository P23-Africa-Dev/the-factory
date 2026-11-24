'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Copy,
  MoreVertical,
  SendHorizonal,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash,
  Trash2,
  Paperclip,
  FileSpreadsheet,
  X,
  FileBarChart2,
  TrendingUp,
} from 'lucide-react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import { ActionConfirmCard, asPendingActionProposal } from '@/features/assistant/ActionConfirmCard';
import { useAgentIdentity } from '@/features/auth';
import {
  useAssistantConversation,
  useDynamicSuggestions,
  assistantApi,
  runWeeklySummary,
  weeklySummaryMessage,
  WeeklySummaryError,
  type AssistantMessage,
} from '@/manager/features/assistant';
import {
  DailyPlanCard,
  loadPlanEdits,
  persistPlanEdits,
  useAcceptDailyPlan,
  type DailyPlanPayload,
  type PlanEditsMap,
} from '@/manager/features/planning';
import { InlineVoiceRecorder } from '@/components/ely/InlineVoiceRecorder';
import { ActionReceipts, receiptsFromPayload } from '@/components/ely/ActionReceipts';
import { ChatSwitcher } from '@/components/ely/ChatSwitcher';
import { ForecastView } from '@/manager/features/assistant/ForecastView';
import { ELY_INPUT_PLACEHOLDER, ELY_INTRO, ELY_NAME, ELY_TYPING_LABEL } from '@/lib/ely-brand';
import { toast } from '@/lib/toast';
import { showApiErrorToast } from '@/lib/api/errors';

type LocalAction = 'liked' | 'disliked' | null;

// Any reply carrying plan items shows the plan card, whatever tool produced it.
function asDailyPlanPayload(payload: Record<string, unknown> | null | undefined): DailyPlanPayload | null {
  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) return null;
  return payload as unknown as DailyPlanPayload;
}

function ParsedHtmlText({ text }: { text: string }): React.ReactNode {
  const parts = text.split(/(<u>.*?<\/u>)/g);
  return (
    <span className="whitespace-pre-line leading-relaxed text-xs sm:text-sm">
      {parts.map((part, index) => {
        if (part.startsWith('<u>') && part.endsWith('</u>')) {
          const innerText = part.slice(3, -4);
          return (
            <u key={index} className="underline font-semibold text-[#D0E2E3]">
              {innerText}
            </u>
          );
        }
        return <React.Fragment key={index}>{part}</React.Fragment>;
      })}
    </span>
  );
}

export default function AiAssistantPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { firstName, avatarSrc, userRole } = useAgentIdentity();
  const {
    messages,
    isRestoring,
    isSending,
    processingLabel,
    send,
    confirmAction,
    cancelAction,
    undoAction,
    runPlanMyDay,
    clearCurrent,
    clearAll,
    threadId,
    threads,
    refreshThreads,
    switchThread,
    startNewChat,
    appendAssistantMessage,
  } = useAssistantConversation();
  const suggestions = useDynamicSuggestions();
  const acceptPlan = useAcceptDailyPlan();

  const [input, setInput] = useState('');
  const [actions, setActions] = useState<Record<string, LocalAction>>({});
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<'current' | 'all' | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [acceptedPlanIds, setAcceptedPlanIds] = useState<Set<string>>(new Set());
  const [dismissedPlanIds, setDismissedPlanIds] = useState<Set<string>>(new Set());
  const [notifiedPlanIds, setNotifiedPlanIds] = useState<Set<string>>(new Set());
  const [actionStates, setActionStates] = useState<Record<string, 'confirmed' | 'cancelled'>>({});
  const [planEditsByMessage, setPlanEditsByMessage] = useState<Record<string, PlanEditsMap>>({});
  const [acceptingPlanMessageId, setAcceptingPlanMessageId] = useState<string | null>(null);
  const planDayTriggeredRef = useRef(false);

  // Executive Summary & Forecast state
  const [isGeneratingWeekly, setIsGeneratingWeekly] = useState(false);
  const [forecastModalOpen, setForecastModalOpen] = useState(false);
  const [forecastData, setForecastData] = useState<Record<string, unknown> | null>(null);
  const [isLoadingForecast, setIsLoadingForecast] = useState(false);
  const weeklyAbortRef = useRef<AbortController | null>(null);
  const weeklyTriggeredRef = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);
  // A CSV attached for ELY to import; sent with the next message.
  const [attachment, setAttachment] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    const contentElement = contentRef.current;
    if (!scrollContainer || !contentElement) return;

    let timeoutId: NodeJS.Timeout;

    const scrollToBottom = (delay = 0) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
      }, delay);
    };

    scrollToBottom(50);

    const observer = new ResizeObserver(() => {
      scrollToBottom(0);
    });

    observer.observe(contentElement);

    return () => {
      observer.disconnect();
      clearTimeout(timeoutId);
    };
  }, [messages, isRestoring, isSending]);

  useEffect(() => {
    if (isRestoring || isSending || planDayTriggeredRef.current) return;
    if (searchParams.get('flow') !== 'plan-day') return;

    planDayTriggeredRef.current = true;
    router.replace('/manager/assistant');
    void runPlanMyDay();
  }, [isRestoring, isSending, searchParams, router, runPlanMyDay]);

  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant' || notifiedPlanIds.has(msg.id)) {
        continue;
      }
      if (!asDailyPlanPayload(msg.payload)) continue;

      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNotifiedPlanIds((prev) => new Set(prev).add(msg.id));
      toast.info('Operational plan is ready', 'Review the plan below and accept to assign tasks.');
    }
  }, [messages, notifiedPlanIds]);

  const handleSend = (
    text?: string,
    withGeolocation = false,
    context?: { focus?: 'all' | 'visits' | 'followups' | 'tasks'; limit?: number },
  ) => {
    const content = (text ?? input).trim();
    if (!content) return;
    setInput('');
    const attached = attachment;
    setAttachment(null);
    void send(content, {
      withGeolocation,
      context: attached ? { ...context, attachment: attached } : context,
    });
  };

  // The summary is a background job: queue it, poll until it is ready, then
  // show ELY's narrative in the chat.
  const handleGenerateWeeklySummary = useCallback(async () => {
    if (weeklyAbortRef.current) return;
    const controller = new AbortController();
    weeklyAbortRef.current = controller;
    setIsGeneratingWeekly(true);
    try {
      const result = await runWeeklySummary({ signal: controller.signal });
      appendAssistantMessage(weeklySummaryMessage(result));
    } catch (err) {
      if (err instanceof WeeklySummaryError && err.reason === 'aborted') return;
      appendAssistantMessage(
        err instanceof WeeklySummaryError
          ? err.message
          : "ELY couldn't start your weekly summary. Please try again.",
        true,
      );
    } finally {
      if (weeklyAbortRef.current === controller) weeklyAbortRef.current = null;
      if (!controller.signal.aborted) setIsGeneratingWeekly(false);
    }
  }, [appendAssistantMessage]);

  useEffect(() => () => weeklyAbortRef.current?.abort(), []);

  useEffect(() => {
    if (isRestoring || weeklyTriggeredRef.current) return;
    if (searchParams.get('flow') !== 'weekly-summary') return;

    weeklyTriggeredRef.current = true;
    router.replace('/manager/assistant');
    void handleGenerateWeeklySummary();
  }, [isRestoring, searchParams, router, handleGenerateWeeklySummary]);

  const handleOpenForecast = async () => {
    setForecastModalOpen(true);
    setIsLoadingForecast(true);
    try {
      const data = await assistantApi.getForecastOverview();
      setForecastData(data);
    } catch (err) {
      showApiErrorToast(err, 'Could not load forecast overview');
    } finally {
      setIsLoadingForecast(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ELY reads documents and spreadsheets, not photos.
    if (file.type.startsWith('image/')) {
      toast.error('ELY can read documents and spreadsheets, but not photos yet.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setIsAnalyzingPhoto(true);
    try {
      // A CSV is attached so ELY can import it (e.g. a lead list) when asked.
      if (/\.csv$/i.test(file.name)) {
        const attached = await assistantApi.attachFile(file);
        setAttachment(attached);
        if (!input.trim()) setInput('Import these leads');
        return;
      }
      const result = await assistantApi.analyzeFile(file);
      void send(`File Analysis (${file.name}):\n\n${result.summary}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to analyze file.');
    } finally {
      setIsAnalyzingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAction = (id: string, action: Exclude<LocalAction, null>) => {
    setActions((prev) => ({ ...prev, [id]: prev[id] === action ? null : action }));
  };

  const handleCopy = (content: string) => {
    const plainText = content.replace(/<[^>]*>?/gm, '');
    navigator.clipboard.writeText(plainText);
    toast.success('Copied to clipboard');
  };

  const handleConfirmClear = async () => {
    if (!confirmTarget) return;
    setIsClearing(true);
    try {
      if (confirmTarget === 'current') {
        await clearCurrent();
        toast.success('Conversation cleared');
      } else {
        await clearAll();
        toast.success('All conversations cleared');
      }
    } finally {
      setIsClearing(false);
      setConfirmTarget(null);
    }
  };

  const renderMessage = (msg: AssistantMessage) => {
    if (msg.role === 'user') {
      return (
        <div key={msg.id} className="flex flex-col items-end">
          <div className="bg-[#5B2155] text-white rounded-[24px] rounded-tr-none px-5 py-3.5 max-w-[80%] shadow-md text-xs sm:text-sm leading-relaxed">
            {msg.content}
          </div>
        </div>
      );
    }

    const planPayload = asDailyPlanPayload(msg.payload);
    const planStorageKey = `plan-edit:${threadId ?? 'default'}:${msg.id}`;
    const planEdits =
      planPayload !== null
        ? (planEditsByMessage[msg.id] ?? loadPlanEdits(planStorageKey, planPayload))
        : null;

    const actionProposal = asPendingActionProposal(msg.payload);
    const actionState = actionStates[msg.id];
    const isLatest = messages[messages.length - 1]?.id === msg.id;
    const showActionCard = actionProposal !== null && (isLatest || actionState !== undefined);

    return (
      <div key={msg.id} className="flex flex-col items-start">
        <div className="max-w-[88%] flex flex-col gap-2">
          <div className="bg-gradient-to-b from-[#333] to-[#16384B] border border-white/10 rounded-[24px] rounded-tl-none p-5 shadow-lg relative">
            <ParsedHtmlText text={msg.content} />
            <ActionReceipts
              receipts={receiptsFromPayload(msg.payload)}
              area="manager"
              disabled={isSending}
              onUndo={undoAction}
            />

            {/* Risky actions wait for a tap. Only the newest reply can still be
                waiting; older cards stay hidden unless acted on here. */}
            {showActionCard && actionProposal && (
              <ActionConfirmCard
                proposal={actionProposal}
                state={actionState ?? 'open'}
                disabled={isSending}
                onConfirm={() => {
                  setActionStates((prev) => ({ ...prev, [msg.id]: 'confirmed' }));
                  void confirmAction(actionProposal.tool, actionProposal.args);
                }}
                onCancel={() => {
                  setActionStates((prev) => ({ ...prev, [msg.id]: 'cancelled' }));
                  // Cancel on the server too, so the action can't run later.
                  if (actionProposal.pendingActionId) {
                    void cancelAction(actionProposal.pendingActionId);
                  }
                }}
              />
            )}

            {planPayload && planEdits && (
              <DailyPlanCard
                payload={planPayload}
                edits={planEdits}
                onEditsChange={(nextEdits) => {
                  setPlanEditsByMessage((prev) => ({ ...prev, [msg.id]: nextEdits }));
                  persistPlanEdits(planStorageKey, nextEdits);
                }}
                accepted={acceptedPlanIds.has(msg.id)}
                dismissed={dismissedPlanIds.has(msg.id)}
                isAccepting={acceptPlan.isPending && acceptingPlanMessageId === msg.id}
                onDismiss={() => setDismissedPlanIds((prev) => new Set(prev).add(msg.id))}
                onAccept={() => {
                  setAcceptingPlanMessageId(msg.id);
                  acceptPlan.mutate(
                    { payload: planPayload, edits: planEdits },
                    {
                      onSuccess: () => {
                        setAcceptedPlanIds((prev) => new Set(prev).add(msg.id));
                      },
                      onSettled: () => {
                        setAcceptingPlanMessageId(null);
                      },
                    },
                  );
                }}
              />
            )}
          </div>
          {!msg.failed && (
            <div className="flex items-center gap-3 ml-3 select-none">
              <button
                onClick={() => handleAction(msg.id, 'liked')}
                className={`p-1 rounded-full transition-colors focus:outline-none ${
                  actions[msg.id] === 'liked'
                    ? 'text-[#7BB6B8]'
                    : 'text-white/40 hover:text-white/80'
                }`}
              >
                <ThumbsUp size={14} />
              </button>
              <button
                onClick={() => handleAction(msg.id, 'disliked')}
                className={`p-1 rounded-full transition-colors focus:outline-none ${
                  actions[msg.id] === 'disliked'
                    ? 'text-[#FD6046]'
                    : 'text-white/40 hover:text-white/80'
                }`}
              >
                <ThumbsDown size={14} />
              </button>
              <button
                onClick={() => handleCopy(msg.content)}
                className="p-1 rounded-full text-white/40 hover:text-white/80 transition-colors focus:outline-none"
              >
                <Copy size={14} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <ScreenErrorBoundary screenName="AiAssistant">
      <div className="relative h-[calc(100dvh-100px)] bg-[#091519] text-[#D0E2E3] flex flex-col font-sans select-none overflow-hidden pb-0">
        {/* Ambient background texture */}
        <div
          className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-[0.12] z-0"
          style={{ backgroundImage: "url('/assets/app-background.png')" }}
        />

        {/* Header */}
        <div className="relative z-10 flex flex-col px-5 pt-[calc(env(safe-area-inset-top,0px)+20px)] pb-3 border-b border-white/10 gap-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <img
                src={avatarSrc}
                alt="avatar"
                className="w-11 h-11 rounded-full bg-[#0B3343] border border-white/10 object-cover"
              />
              <div className="flex flex-col justify-center leading-tight">
                <span className="text-white/60 font-light text-xs">Hello,</span>
                <span className="text-white font-semibold text-lg">{firstName}!</span>
                {userRole && (
                  <span className="text-[9px] font-bold text-[#75ADAF] uppercase tracking-wide">
                    {userRole} · Executive Copilot
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">{ELY_NAME}</h3>
              <button
                type="button"
                aria-label="Conversation options"
                onClick={() => {
                  if (!menuOpen) void refreshThreads();
                  setMenuOpen((v) => !v);
                }}
                className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 text-white focus:outline-none transition-colors"
              >
                <MoreVertical size={18} />
              </button>
            </div>
          </div>

          {/* Executive Actions Strip */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={handleGenerateWeeklySummary}
              disabled={isGeneratingWeekly || isSending}
              className="px-3 py-1.5 rounded-full bg-[#75ADAF]/15 border border-[#75ADAF]/40 text-[#75ADAF] text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap"
            >
              <FileBarChart2 className="w-3.5 h-3.5" />
              {isGeneratingWeekly ? 'Generating Weekly Brief…' : 'Weekly Executive Summary'}
            </button>
            <button
              type="button"
              onClick={handleOpenForecast}
              className="px-3 py-1.5 rounded-full bg-[#FD6046]/15 border border-[#FD6046]/40 text-[#FD6046] text-[11px] font-bold flex items-center gap-1.5 whitespace-nowrap"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              Operations &amp; Sales Forecast
            </button>
          </div>
        </div>

        {/* Messages Scroll Area */}
        <div
          ref={scrollRef}
          className="relative z-10 flex-1 overflow-y-auto px-5 pt-4 pb-0"
        >
          <div ref={contentRef} className="flex flex-col gap-5">
            {isRestoring ? (
              <div className="flex flex-1 items-center justify-center">
                <div className="h-7 w-7 animate-spin rounded-full border-4 border-[#75ADAF] border-t-transparent" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-2 text-center">
                <h3 className="font-bold text-xl text-white mb-2">{ELY_INTRO}</h3>
                <p className="text-xs text-white/50 leading-relaxed max-w-[300px] mb-6">
                  Command your field workforce, assign tasks, audit KPIs, analyze CRM pipelines, and generate executive reports.
                </p>

                <div className="w-full flex flex-col gap-3">
                  {suggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      type="button"
                      onClick={() => handleSend(suggestion.prompt, suggestion.withGeolocation ?? false)}
                      className="w-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 rounded-2xl py-4 px-5 text-left text-xs font-semibold text-[#D0E2E3] transition-all active:scale-98 flex items-center gap-3"
                    >
                      <Sparkles size={14} className="text-[#75ADAF] flex-shrink-0" />
                      <span>{suggestion.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map(renderMessage)
            )}

            {isSending && (
              <div className="flex items-start">
                <div className="bg-[#16384B]/80 text-[#D0E2E3]/80 border border-white/5 rounded-2xl px-5 py-3 text-xs font-semibold animate-pulse">
                  {processingLabel ?? ELY_TYPING_LABEL}
                </div>
              </div>
            )}

            {isGeneratingWeekly && (
              <div className="flex items-start">
                <div className="bg-[#16384B]/80 text-[#D0E2E3]/80 border border-white/5 rounded-2xl px-5 py-3 text-xs font-semibold animate-pulse">
                  ELY is preparing your weekly summary…
                </div>
              </div>
            )}

            {isAnalyzingPhoto && (
              <div className="flex items-start">
                <div className="bg-[#16384B]/80 text-[#D0E2E3]/80 border border-white/5 rounded-2xl px-5 py-3 text-xs font-semibold animate-pulse">
                  ELY is analyzing your attachment...
                </div>
              </div>
            )}

            {!isRestoring && <div className="h-24 flex-shrink-0" />}
          </div>
        </div>

        {/* Input Bar pinned above Bottom Navigation */}
        <div className="fixed bottom-[80px] left-0 right-0 max-w-md mx-auto z-50 pb-1">
          {attachment && (
            <div className="mx-4 mb-2 flex items-center gap-2 rounded-2xl bg-[#16384B] px-3 py-2 text-xs text-white shadow-lg">
              <FileSpreadsheet size={16} className="flex-shrink-0 text-[#7BB6B8]" />
              <span className="min-w-0 flex-1 truncate">
                {attachment.name} is attached. Tell ELY what to do with it.
              </span>
              <button
                type="button"
                onClick={() => setAttachment(null)}
                aria-label="Remove attachment"
                className="flex-shrink-0 rounded-full p-1 active:bg-white/10"
              >
                <X size={14} />
              </button>
            </div>
          )}
          <div className="bg-white rounded-t-3xl shadow-xl flex items-center p-6 gap-3 border border-gray-100">
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,.doc,.docx,.txt,.xlsx,.csv"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isSending || isAnalyzingPhoto}
              className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:text-gray-800 focus:outline-none flex-shrink-0 disabled:opacity-50 transition-colors"
            >
              <Paperclip size={20} />
            </button>

            <div className="relative flex-1 min-w-0 bg-gray-100 rounded-full h-12 flex items-center pl-4 pr-1.5 gap-1">
              <input
                type="text"
                placeholder={ELY_INPUT_PLACEHOLDER}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend();
                }}
                className="w-full min-w-0 bg-transparent border-none text-[#091519] font-medium text-sm focus:outline-none placeholder-[#091519]/45 p-0"
              />
              <InlineVoiceRecorder
                disabled={isSending}
                onTranscribe={assistantApi.transcribeVoice}
                onTranscribed={(text) => setInput((prev) => (prev.trim() ? `${prev.trim()} ${text}` : text))}
                onError={(message) => toast.error(message)}
              />
            </div>

            {input.trim().length > 0 && (
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={isSending}
                className="w-11 h-11 rounded-full bg-[#16384B] hover:bg-[#1C465E] flex items-center justify-center text-white focus:outline-none transition-colors active:scale-95 disabled:opacity-50"
              >
                <SendHorizonal size={18} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Forecast Modal */}
      {forecastModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-[10000] bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 font-sans">
            <div className="w-full max-w-md bg-[#0B3343] border border-white/15 rounded-3xl p-5 text-white max-h-[80vh] overflow-y-auto">
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-[#FD6046]" />
                  <h3 className="text-sm font-bold text-white">Operations &amp; Pipeline Forecast</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setForecastModalOpen(false)}
                  className="text-white/60 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="py-4">
                {isLoadingForecast ? (
                  <p className="text-xs text-white/60 text-center py-8">Computing AI forecast…</p>
                ) : !forecastData ? (
                  <p className="text-xs text-white/60 text-center py-8">No forecast data available yet.</p>
                ) : (
                  <ForecastView data={forecastData} />
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Menu dropdown */}
      {menuOpen &&
        createPortal(
          <>
            <div onClick={() => setMenuOpen(false)} className="fixed inset-0 z-[200]" />
            <div className="fixed right-4 top-[72px] w-52 bg-[#0F2D3D] border border-white/10 rounded-2xl shadow-2xl z-[201] py-1 flex flex-col">
              <ChatSwitcher
                threads={threads}
                activeThreadId={threadId}
                disabled={isSending}
                canStartNew={messages.length > 0 || threadId !== null}
                onNewChat={() => {
                  setMenuOpen(false);
                  setAttachment(null);
                  startNewChat();
                }}
                onSelect={(id) => {
                  setMenuOpen(false);
                  void switchThread(id).then((ok) => {
                    if (!ok) toast.error('Could not open that chat. Please try again.');
                  });
                }}
              />
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmTarget('current');
                }}
                disabled={messages.length === 0}
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.05] text-white text-sm text-left focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Trash2 size={15} className="flex-shrink-0" />
                <span>Clear chat</span>
              </button>
              <div className="h-px bg-white/5 mx-3" />
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setConfirmTarget('all');
                }}
                className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.05] text-[#FD6046] text-sm text-left focus:outline-none font-semibold"
              >
                <Trash size={15} className="flex-shrink-0" />
                <span>Clear all history</span>
              </button>
            </div>
          </>,
          document.body,
        )}

      {/* Confirm modal */}
      {confirmTarget &&
        createPortal(
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4">
            <div
              onClick={() => !isClearing && setConfirmTarget(null)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer"
            />
            <div className="relative bg-[#0B1E26] border border-white/10 rounded-2xl w-full max-w-xs p-6 shadow-2xl z-10 flex flex-col gap-4 font-sans text-center">
              <h3 className="font-bold text-lg text-white">
                {confirmTarget === 'current' ? 'Clear conversation' : 'Clear all conversations'}
              </h3>
              <p className="text-xs text-white/50 leading-relaxed">
                {confirmTarget === 'current'
                  ? 'Are you sure you want to clear this conversation? This cannot be undone.'
                  : 'Are you sure you want to clear all AI chat history? This cannot be undone.'}
              </p>
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setConfirmTarget(null)}
                  disabled={isClearing}
                  className="flex-1 h-11 border border-white/15 rounded-full text-xs font-semibold text-white hover:bg-white/5 active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmClear}
                  disabled={isClearing}
                  className="flex-1 h-11 bg-[#FD6046] hover:bg-[#E0533C] rounded-full text-xs font-semibold text-white active:scale-95 transition-all flex items-center justify-center"
                >
                  {isClearing ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    'Clear'
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </ScreenErrorBoundary>
  );
}
