'use client';

import React, { useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import { useAgentIdentity } from '@/features/auth';
import {
  useAssistantConversation,
  useDynamicSuggestions,
  assistantApi,
  type AssistantMessage,
} from '@/features/assistant';
import {
  DailyPlanCard,
  loadPlanEdits,
  persistPlanEdits,
  useAcceptDailyPlan,
  type DailyPlanPayload,
  type PlanEditsMap,
} from '@/features/planning';
import { ELY_INPUT_PLACEHOLDER, ELY_INTRO, ELY_NAME, ELY_TYPING_LABEL } from '@/lib/ely-brand';
import { toast } from '@/lib/toast';

type LocalAction = 'liked' | 'disliked' | null;

function asDailyPlanPayload(payload: Record<string, unknown> | null | undefined): DailyPlanPayload | null {
  if (!payload || !Array.isArray(payload.items)) return null;
  return payload as unknown as DailyPlanPayload;
}

// Parses <u>...</u> spans (used by some AI replies) into underlined elements.
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
  const { messages, isRestoring, isSending, processingLabel, send, runPlanMyDay, clearCurrent, clearAll, threadId } =
    useAssistantConversation();
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
  const [planEditsByMessage, setPlanEditsByMessage] = useState<Record<string, PlanEditsMap>>({});
  const [acceptingPlanMessageId, setAcceptingPlanMessageId] = useState<string | null>(null);
  const planDayTriggeredRef = useRef(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isAnalyzingPhoto, setIsAnalyzingPhoto] = useState(false);

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

    // Delay initial scroll to bypass browser/SPA scroll restoration
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
    router.replace('/assistant');
    void runPlanMyDay();
  }, [isRestoring, isSending, searchParams, router, runPlanMyDay]);

  useEffect(() => {
    for (const msg of messages) {
      if (msg.role !== 'assistant' || msg.tool !== 'planning.daily' || notifiedPlanIds.has(msg.id)) {
        continue;
      }
      const payload = msg.payload as DailyPlanPayload | null | undefined;
      if (!payload?.items?.length) continue;

      // eslint-disable-next-line react-hooks/set-state-in-effect -- mark assistant plan toast as shown once
      setNotifiedPlanIds((prev) => new Set(prev).add(msg.id));
      toast.info('Your daily plan is ready', 'Review the plan below and accept to create tasks.');
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
    void send(content, { withGeolocation, context });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzingPhoto(true);
    try {
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

    const planPayload =
      msg.tool === 'planning.daily' ? asDailyPlanPayload(msg.payload) : null;
    const planStorageKey = `plan-edit:${threadId ?? 'default'}:${msg.id}`;
    const planEdits =
      planPayload !== null
        ? (planEditsByMessage[msg.id] ?? loadPlanEdits(planStorageKey, planPayload))
        : null;

    return (
      <div key={msg.id} className="flex flex-col items-start">
        <div className="max-w-[85%] flex flex-col gap-2">
          <div className="bg-gradient-to-b from-[#333] to-[#16384B] border border-white/10 rounded-[24px] rounded-tl-none p-5 shadow-lg relative">
            <ParsedHtmlText text={msg.content} />
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
        <div className="relative z-10 flex items-center justify-between px-5 pt-6 pb-3 h-20 border-b border-white/10">
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
                <span className="text-[9px] font-normal text-[#75ADAF] uppercase tracking-wide">
                  {userRole}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">{ELY_NAME}</h3>
            <button
              type="button"
              aria-label="Conversation options"
              onClick={() => setMenuOpen((v) => !v)}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 text-white focus:outline-none transition-colors"
            >
              <MoreVertical size={18} />
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
              /* Dynamic suggestions empty state */
              <div className="flex flex-col items-center justify-center py-12 px-2 text-center">
                <h3 className="font-bold text-xl text-white mb-2">{ELY_INTRO}</h3>
                <p className="text-xs text-white/50 leading-relaxed max-w-[280px] mb-8">
                  Get assistance with leads, meetings, attendance, CRM operations, and workforce
                  tasks.
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
          <div className="bg-white rounded-t-3xl shadow-xl flex items-center p-6 gap-3 border border-gray-100">
            <input
              type="file"
              ref={fileInputRef}
              accept=".pdf,.doc,.docx,.txt,.xlsx,.xls,.csv,image/*"
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

            <div className="flex-1 bg-gray-100 rounded-full h-12 flex items-center px-4">
              <input
                type="text"
                placeholder={ELY_INPUT_PLACEHOLDER}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSend();
                }}
                className="w-full bg-transparent border-none text-[#091519] font-medium text-sm focus:outline-none placeholder-[#091519]/45 p-0"
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

      {/* Menu dropdown — rendered in a portal so it escapes overflow:hidden stacking contexts */}
      {menuOpen && createPortal(
        <>
          <div onClick={() => setMenuOpen(false)} className="fixed inset-0 z-[200]" />
          <div className="fixed right-4 top-[72px] w-52 bg-[#0F2D3D] border border-white/10 rounded-2xl shadow-2xl z-[201] py-1 flex flex-col">
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

      {/* Confirm modal — also in a portal for the same reason */}
      {confirmTarget && createPortal(
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
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
