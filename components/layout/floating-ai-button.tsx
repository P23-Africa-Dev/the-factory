"use client";

import { AIChat } from "@/components/dashboard/ai-chat";
import { Sparkles, Wand2, X } from "lucide-react";
import { useState } from "react";

export function FloatingAIButton() {
  const [open, setOpen] = useState(false);
  const [chatKey, setChatKey] = useState(0);

  function openChat() {
    setChatKey((k) => k + 1);
    setOpen(true);
  }

  return (
    <>
      {/* FAB */}
      <div className="fixed bottom-8 right-8 z-[9997] flex items-center justify-center">
        {/* Glow rings */}
        {!open && (
          <>
            <span className="absolute w-32 h-32 rounded-full bg-purple-600/10 animate-ping" style={{ animationDuration: "3s" }} />
            <span className="absolute w-24 h-24 rounded-full bg-purple-600/15 animate-ping" style={{ animationDuration: "3s", animationDelay: "0.4s" }} />
            <span className="absolute w-20 h-20 rounded-full bg-purple-500/20" />
          </>
        )}

        <button
          onClick={() => (open ? setOpen(false) : openChat())}
          aria-label="Open AI Assistant"
          className="relative w-16 h-16 rounded-full flex items-center justify-center shadow-[0_0_40px_rgba(168,85,247,0.6)] active:scale-95 transition-transform duration-200"
          style={{
            background: open
              ? "rgba(255,255,255,0.12)"
              : "linear-gradient(135deg, #9333ea 0%, #a855f7 40%, #c026d3 100%)",
          }}
        >
          {open ? (
            <X className="w-6 h-6 text-white" />
          ) : (
            <span className="relative flex items-center justify-center">
              <Wand2 className="w-6 h-6 text-white rotate-[-30deg]" strokeWidth={1.8} />
              <Sparkles className="w-4 h-4 text-white absolute -top-3 -right-3" strokeWidth={1.5} />
            </span>
          )}
        </button>
      </div>

      <AIChat key={chatKey} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
