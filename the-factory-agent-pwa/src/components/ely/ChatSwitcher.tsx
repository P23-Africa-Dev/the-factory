'use client';

import { useState } from 'react';
import { Check, ChevronDown, ChevronRight, MessageSquare, SquarePen } from 'lucide-react';

/** The fields the switcher needs from a thread summary (agent and manager share this shape). */
export interface ChatSwitcherThread {
  thread_id: string;
  title?: string;
  last_message_preview?: string;
  updated_at?: string;
}

/** The chat's title, falling back to its last message, then "ELY chat". */
export function chatTitle(thread: ChatSwitcherThread): string {
  return thread.title?.trim() || thread.last_message_preview?.trim() || 'ELY chat';
}

/** "Just now", "5m ago", "3h ago", "Yesterday", "4d ago", then a short date. */
export function relativeTime(iso: string | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '';
  const minutes = Math.floor(Math.max(0, now - time) / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const rowClass =
  'flex items-center gap-3 px-4 py-3 hover:bg-white/[0.05] text-white text-sm text-left focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed';

/**
 * "New chat" and an expandable "Chats" list for the ELY three-dot menu. It sits
 * above the menu's Clear rows and uses the same row styling.
 */
export function ChatSwitcher({
  threads,
  activeThreadId,
  disabled = false,
  canStartNew = true,
  onNewChat,
  onSelect,
}: {
  threads: ChatSwitcherThread[];
  activeThreadId: string | null;
  disabled?: boolean;
  /** False while the open chat is already empty. */
  canStartNew?: boolean;
  onNewChat: () => void;
  onSelect: (threadId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <button type="button" onClick={onNewChat} disabled={disabled || !canStartNew} className={rowClass}>
        <SquarePen size={15} className="flex-shrink-0" />
        <span>New chat</span>
      </button>
      <div className="h-px bg-white/5 mx-3" />
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={rowClass}
      >
        <MessageSquare size={15} className="flex-shrink-0" />
        <span className="flex-1">Chats</span>
        {expanded ? (
          <ChevronDown size={15} className="flex-shrink-0 text-white/50" />
        ) : (
          <ChevronRight size={15} className="flex-shrink-0 text-white/50" />
        )}
      </button>
      {expanded && (
        <div role="list" aria-label="Chats" className="max-h-64 overflow-y-auto">
          {threads.length === 0 ? (
            <p className="px-4 py-2.5 text-xs text-white/50">No chats yet.</p>
          ) : (
            threads.map((thread) => {
              const active = thread.thread_id === activeThreadId;
              const time = relativeTime(thread.updated_at);
              return (
                <button
                  key={thread.thread_id}
                  type="button"
                  role="listitem"
                  aria-current={active ? 'true' : undefined}
                  disabled={disabled}
                  onClick={() => onSelect(thread.thread_id)}
                  className="w-full flex items-center gap-2 pl-6 pr-4 py-2.5 hover:bg-white/[0.05] text-left focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[13px] ${active ? 'text-white font-semibold' : 'text-white/85'}`}>
                      {chatTitle(thread)}
                    </span>
                    {time && <span className="block text-[10px] text-white/40">{time}</span>}
                  </span>
                  {active && <Check size={14} aria-label="Current chat" className="flex-shrink-0 text-[#75ADAF]" />}
                </button>
              );
            })
          )}
        </div>
      )}
      <div className="h-px bg-white/5 mx-3" />
    </>
  );
}
