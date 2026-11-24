import type { CopilotThreadSummary } from "@/lib/api/copilot";

const MAX_TITLE_LENGTH = 48;

/** Title shown for a chat in the chat switcher. */
export function threadDisplayTitle(thread: Pick<CopilotThreadSummary, "last_message_preview"> & { title?: string | null }): string {
    const raw = (thread.title ?? "").trim() || (thread.last_message_preview ?? "").trim();
    if (!raw) return "ELY chat";
    const singleLine = raw.replace(/\s+/g, " ");
    return singleLine.length > MAX_TITLE_LENGTH ? `${singleLine.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : singleLine;
}

/** Short relative time such as "just now", "5m ago", "2h ago", "3d ago". */
export function formatThreadRelativeTime(iso: string | null | undefined, now: number = Date.now()): string {
    if (!iso) return "";
    const time = new Date(iso).getTime();
    if (Number.isNaN(time)) return "";
    const seconds = Math.max(0, Math.round((now - time) / 1000));
    if (seconds < 60) return "just now";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    if (days < 365) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 365)}y ago`;
}
