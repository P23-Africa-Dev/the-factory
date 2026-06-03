"use client";

import { AIChat } from "@/components/dashboard/ai-chat";
import AIIcon from "@/assets/images/ai-icon.png";
import Image from "next/image";
import { useState } from "react";
import { X } from "lucide-react";

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
      <div className="fixed bottom-6 right-6 z-[9997] flex flex-col items-end gap-2">
        {/* Tooltip label */}
        <div
          className={`px-3 py-1.5 rounded-full bg-[#09232D] text-white text-xs font-medium shadow-lg transition-all duration-200 whitespace-nowrap ${
            open ? "opacity-0 scale-90 pointer-events-none" : "opacity-0 group-hover:opacity-100"
          }`}
        >
          AI Assistant
        </div>

        <button
          onClick={() => (open ? setOpen(false) : openChat())}
          className="group relative w-14 h-14 rounded-full shadow-2xl transition-all duration-300 active:scale-95"
          aria-label="Open AI Assistant"
        >
          {/* Outer glow ring */}
          <span
            className={`absolute inset-0 rounded-full bg-[#7BB6B8]/30 transition-all duration-300 ${
              open ? "scale-0 opacity-0" : "scale-110 animate-ping opacity-60"
            }`}
            style={{ animationDuration: "2.5s" }}
          />

          {/* Button body */}
          <span
            className={`absolute inset-0 rounded-full transition-all duration-300 ${
              open
                ? "bg-white/15 backdrop-blur-sm border border-white/20"
                : "bg-gradient-to-br from-[#7BB6B8] to-[#09232D] border-2 border-[#7BB6B8]/60 shadow-[0_0_20px_rgba(123,182,184,0.5)]"
            }`}
          />

          {/* Icon — switches between AI icon and X */}
          <span className="absolute inset-0 flex items-center justify-center">
            {open ? (
              <X className="w-5 h-5 text-white transition-all duration-200" />
            ) : (
              <Image
                src={AIIcon}
                alt="AI"
                width={26}
                height={26}
                className="drop-shadow-md transition-all duration-200"
              />
            )}
          </span>
        </button>
      </div>

      <AIChat key={chatKey} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
