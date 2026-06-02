"use client";

import { useAuthStore } from "@/store/auth";
import Image from "next/image";
import {
  Camera,
  ChevronLeft,
  Copy,
  MoreVertical,
  Search,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

const DUMMY_RESPONSES: Record<string, string> = {
  default:
    "I'm here to help you with your CRM needs. You can ask me about leads, customers, outreach strategies, or anything related to your sales pipeline.",
  banks:
    "Here are some banks around Lagos you can check out nearby:\n• <u>Access Tower (Access Bank Head Office)</u>\n• <u>First Bank - Head Office</u>\n• <u>Union Bank Head Office</u>\n• <u>Globus Bank</u>\n• <u>Citibank Nigeria</u>\n• <u>PremiumTrust Bank</u>\n• <u>Jaiz Bank Oba Akran Ikeja</u>\n• <u>Parallex Bank Limited</u>\nIf you want, I can also help you with:\n• banks closest to your exact area,\n• ATMs nearby,\n• Islamic banks only,\n• banks open now,\n• best banks for transfers/savings in Nigeria,\n• or branches around areas like Yaba, Ojuelegba, Ikeja, Lekki, Gbagada, or VI.\n<u>(Buzdy)</u>",
  leads:
    "You currently have 24 active leads in your pipeline. 8 are in the qualification stage, 6 are in proposal review, and 10 are awaiting follow-up. Would you like me to draft outreach messages for the stale leads?",
  customers:
    "Your top customers this month are Acme Corp, TechFlow Inc, and NovaStar Ltd. Acme Corp has the highest lifetime value at ₦4.2M. Would you like a detailed breakdown?",
  meeting:
    "You have 3 upcoming meetings today: a discovery call at 10am with TechFlow, a product demo at 2pm with NovaStar, and a follow-up call at 4:30pm with a new prospect. Want me to prepare talking points?",
  outreach:
    "Based on your pipeline data, I recommend reaching out to the 6 leads who haven't responded in over 7 days. I can draft personalized follow-up emails for each of them using their interaction history. Shall I proceed?",
};

function getDummyResponse(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("bank")) return DUMMY_RESPONSES.banks;
  if (q.includes("lead")) return DUMMY_RESPONSES.leads;
  if (q.includes("customer")) return DUMMY_RESPONSES.customers;
  if (q.includes("meeting") || q.includes("schedule"))
    return DUMMY_RESPONSES.meeting;
  if (q.includes("outreach") || q.includes("email") || q.includes("draft"))
    return DUMMY_RESPONSES.outreach;
  return DUMMY_RESPONSES.default;
}

type MessageAction = "liked" | "disliked" | null;

interface Message {
  id: string;
  role: "user" | "ai";
  content: string;
  action?: MessageAction;
  copied?: boolean;
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
  } catch {}
  return null;
}

export function AIChat({ open, onClose }: AIChatProps) {
  const user = useAuthStore((s) => s.user);
  const firstName = user?.name?.split(" ")[0] ?? "User";
  const avatarSrc = getSafeAvatarSrc(user?.avatar) ?? "/avatars/male-avatar.png";

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  function sendMessage(text?: string) {
    const content = (text ?? input).trim();
    if (!content) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: getDummyResponse(content),
        action: null,
      };
      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 1200);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") sendMessage();
  }

  function handleAction(id: string, action: MessageAction) {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, action: m.action === action ? null : action } : m
      )
    );
  }

  function handleCopy(id: string, content: string) {
    // Strip HTML tags for copying
    const plainText = content.replace(/<[^>]*>?/gm, '');
    navigator.clipboard.writeText(plainText).catch(() => {});
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, copied: true } : m))
    );
    setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) => (m.id === id ? { ...m, copied: false } : m))
      );
    }, 1500);
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed top-20 inset-x-0 bottom-0 z-[9998] bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        onClick={onClose}
      />

      {/* Slide-in panel / Modal */}
      <div
        className={`fixed top-20 inset-x-0 bottom-0 z-[9999] flex items-end justify-end sm:items-start sm:justify-end p-4 sm:p-6 transition-all duration-300 ${
          open ? "pointer-events-auto" : "pointer-events-none"
        }`}
      >
        <div
          className={`w-full sm:w-[800px] max-w-full h-full sm:h-[calc(100vh-130px)] bg-[#10232A] p-2 sm:p-3 rounded-t-[32px] sm:rounded-[36px] flex flex-col shadow-2xl transition-transform duration-300 ease-out border border-white/5 ${
            open ? "translate-y-0 sm:translate-x-0 opacity-100" : "translate-y-full sm:translate-y-0 sm:translate-x-8 opacity-0"
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
            <div className="border border-white/20 rounded-[32px] px-6 py-4">
              <p className="text-[#88B3B5] text-[15px]">Ask Anything...</p>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-8 py-2 space-y-8 scrollbar-thin scrollbar-thumb-white/10">
            {messages.map((msg) => (
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
                    {/* Actions */}
                    <div className="flex items-center gap-5 pl-2 mt-1">
                      <button
                        onClick={() => handleAction(msg.id, "liked")}
                        className={`transition-colors ${
                          msg.action === "liked"
                            ? "text-[#7BB6B8]"
                            : "text-white/40 hover:text-white/80"
                        }`}
                      >
                        <ThumbsUp className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleAction(msg.id, "disliked")}
                        className={`transition-colors ${
                          msg.action === "disliked"
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
                        {msg.copied && (
                          <span className="absolute -top-8 left-1/2 -translate-x-1/2 text-[12px] text-[#7BB6B8] bg-[#1A3844] px-2.5 py-1 rounded shadow-md">Copied!</span>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {isTyping && (
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

