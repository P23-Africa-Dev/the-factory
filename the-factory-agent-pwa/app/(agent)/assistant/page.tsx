'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import { useAuth } from '@/features/auth';
import {
  ELY_INPUT_PLACEHOLDER,
  ELY_INTRO,
  ELY_NAME,
  ELY_TYPING_LABEL,
} from '@/lib/ely-brand';
import { toast } from '@/lib/toast';

const DUMMY_RESPONSES = {
  default:
    `${ELY_INTRO} I can help with leads, customers, outreach strategies, meetings, attendance, and your sales pipeline.`,
  banks:
    "Here are some banks around Lagos you can check out nearby:\n• <u>Access Tower (Access Bank Head Office)</u>\n• <u>First Bank - Head Office</u>\n• <u>Union Bank Head Office</u>\n• <u>Globus Bank</u>\n• <u>Citibank Nigeria</u>\n• <u>PremiumTrust Bank</u>\n• <u>Jaiz Bank Oba Akran Ikeja</u>\n• <u>Parallex Bank Limited</u>\nIf you want, I can also help you with:\n• banks closest to your exact area,\n• ATMs nearby,\n• Islamic banks only,\n• banks open now,\n• best banks for transfers/savings in Nigeria,\n• or branches around areas like Yaba, Ojuelegba, Ikeja, Lekki, Gbagada, or VI.\n<u>(The Factory)</u>",
  leads:
    "You currently have 24 active leads in your pipeline. 8 are in the qualification stage, 6 are in proposal review, and 10 are awaiting follow-up. Would you like me to draft outreach messages for the stale leads?",
  customers:
    "Your top customers this month are Acme Corp, TechFlow Inc, and NovaStar Ltd. Acme Corp has the highest lifetime value at ₦4.2M. Would you like a detailed breakdown?",
  meeting:
    "You have 3 upcoming meetings today: a discovery call at 10am with TechFlow, a product demo at 2pm with NovaStar, and a follow-up call at 4:30pm with a new prospect. Want me to prepare talking points?",
  outreach:
    "Based on your pipeline data, I recommend reaching out to the 6 leads who haven't responded in over 7 days. I can draft personalized follow-up emails for each of them using their interaction history. Shall I proceed?",
} as const;

function getDummyResponse(query: string): string {
  const q = query.toLowerCase();
  if (q.includes('bank')) return DUMMY_RESPONSES.banks;
  if (q.includes('lead')) return DUMMY_RESPONSES.leads;
  if (q.includes('customer')) return DUMMY_RESPONSES.customers;
  if (q.includes('meeting') || q.includes('schedule')) return DUMMY_RESPONSES.meeting;
  if (q.includes('outreach') || q.includes('email') || q.includes('draft')) return DUMMY_RESPONSES.outreach;
  return DUMMY_RESPONSES.default;
}

type MessageAction = 'liked' | 'disliked' | null;

interface Message {
  id: string;
  role: 'user' | 'ai';
  content: string;
  action?: MessageAction;
}

// Simple React component that parses <u> tags into native HTML <u> elements
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
  const { user } = useAuth();
  const firstName = user?.name ? user.name.split(' ')[0] : 'Agent';

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping]);

  const handleSendMessage = (text?: string) => {
    const content = (text ?? input).trim();
    if (!content) return;

    const userMsg: Message = {
      id: `${Date.now()}-user`,
      role: 'user',
      content,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    setTimeout(() => {
      const aiMsg: Message = {
        id: `${Date.now()}-ai`,
        role: 'ai',
        content: getDummyResponse(content),
        action: null,
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 1200);
  };

  const handleAction = (id: string, action: MessageAction) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, action: m.action === action ? null : action } : m))
    );
  };

  const handleCopy = (content: string) => {
    const plainText = content.replace(/<[^>]*>?/gm, '');
    navigator.clipboard.writeText(plainText);
    toast.success('Copied to clipboard');
  };

  return (
    <ScreenErrorBoundary screenName="AiAssistant">
      <div className="relative min-h-screen bg-[#091519] text-[#D0E2E3] flex flex-col font-sans select-none overflow-hidden pb-[140px]">
        {/* Ambient background texture */}
        <div
          className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-[0.12] z-0"
          style={{ backgroundImage: "url('/assets/app-background.png')" }}
        />

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-6 pb-3 h-20 border-b border-white/10">
          <div className="flex items-center gap-3.5">
            <img
              src="/assets/animoji.png"
              alt="avatar"
              className="w-11 h-11 rounded-full bg-[#0B3343] border border-white/10"
            />
            <div className="flex flex-col justify-center leading-tight">
              <span className="text-white/60 font-light text-xs">Hello,</span>
              <span className="text-white font-semibold text-lg">{firstName}!</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider">{ELY_NAME}</h3>
          </div>
        </div>

        {/* Messages Scroll Area */}
        <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {messages.length === 0 ? (
            /* Suggestions Empty State */
            <div className="flex flex-col items-center justify-center py-12 px-2 text-center">
              <h3 className="font-bold text-xl text-white mb-2">{ELY_INTRO}</h3>
              <p className="text-xs text-white/50 leading-relaxed max-w-[280px] mb-8">
                Get assistance with leads, meetings, attendance, CRM operations, and workforce tasks.
              </p>

              <div className="w-full flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => handleSendMessage('Banks around me')}
                  className="w-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 rounded-2xl py-4 px-5 text-left text-xs font-semibold text-[#D0E2E3] transition-all active:scale-98"
                >
                  🏦 Banks around me
                </button>
                <button
                  type="button"
                  onClick={() => handleSendMessage('Show active leads')}
                  className="w-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 rounded-2xl py-4 px-5 text-left text-xs font-semibold text-[#D0E2E3] transition-all active:scale-98"
                >
                  📈 Active leads overview
                </button>
                <button
                  type="button"
                  onClick={() => handleSendMessage('Outreach email draft')}
                  className="w-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 rounded-2xl py-4 px-5 text-left text-xs font-semibold text-[#D0E2E3] transition-all active:scale-98"
                >
                  ✍️ Draft outreach email
                </button>
                <button
                  type="button"
                  onClick={() => handleSendMessage('My schedule today')}
                  className="w-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 rounded-2xl py-4 px-5 text-left text-xs font-semibold text-[#D0E2E3] transition-all active:scale-98"
                >
                  📅 Today&apos;s meetings
                </button>
              </div>
            </div>
          ) : (
            messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                {msg.role === 'user' ? (
                  /* User Bubble */
                  <div className="bg-[#5B2155] text-white rounded-[24px] rounded-tr-none px-5 py-3.5 max-w-[80%] shadow-md text-xs sm:text-sm leading-relaxed">
                    {msg.content}
                  </div>
                ) : (
                  /* AI Message Bubble + Feedback row */
                  <div className="max-w-[85%] flex flex-col gap-2">
                    <div className="bg-gradient-to-b from-[#333] to-[#16384B] border border-white/10 rounded-[24px] rounded-tl-none p-5 shadow-lg relative">
                      <ParsedHtmlText text={msg.content} />
                    </div>

                    {/* Actions row */}
                    <div className="flex items-center gap-4 ml-3 select-none">
                      <button
                        onClick={() => handleAction(msg.id, 'liked')}
                        className={`text-sm opacity-60 hover:opacity-100 transition-opacity focus:outline-none ${
                          msg.action === 'liked' ? 'text-[#7BB6B8]' : 'text-white'
                        }`}
                      >
                        👍
                      </button>
                      <button
                        onClick={() => handleAction(msg.id, 'disliked')}
                        className={`text-sm opacity-60 hover:opacity-100 transition-opacity focus:outline-none ${
                          msg.action === 'disliked' ? 'text-[#FD6046]' : 'text-white'
                        }`}
                      >
                        👎
                      </button>
                      <button
                        onClick={() => handleCopy(msg.content)}
                        className="text-sm opacity-60 hover:opacity-100 transition-opacity focus:outline-none text-white"
                      >
                        📋
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}

          {isTyping && (
            <div className="flex items-start">
              <div className="bg-[#16384B]/80 text-[#D0E2E3]/80 border border-white/5 rounded-2xl px-5 py-3 text-xs font-semibold animate-pulse">
                {ELY_TYPING_LABEL}
              </div>
            </div>
          )}
        </div>

        {/* Input Bar pinned above Bottom Navigation */}
        <div className="fixed bottom-[96px] left-0 right-0 max-w-md mx-auto z-20 px-5 pb-3">
          <div className="bg-white rounded-t-3xl shadow-xl flex items-center p-3 gap-3 border border-gray-100">
            <button
              type="button"
              className="w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center text-[#091519] focus:outline-none text-lg"
            >
              📷
            </button>

            <div className="flex-1 bg-gray-100 rounded-full h-12 flex items-center px-4">
              <input
                type="text"
                placeholder={ELY_INPUT_PLACEHOLDER}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSendMessage();
                }}
                className="w-full bg-transparent border-none text-[#091519] font-medium text-sm focus:outline-none placeholder-[#091519]/45 p-0"
              />
            </div>

            {input.trim().length > 0 && (
              <button
                type="button"
                onClick={() => handleSendMessage()}
                className="w-11 h-11 rounded-full bg-[#16384B] hover:bg-[#1C465E] flex items-center justify-center text-white focus:outline-none transition-colors active:scale-95"
              >
                ➔
              </button>
            )}
          </div>
        </div>
      </div>
    </ScreenErrorBoundary>
  );
}
