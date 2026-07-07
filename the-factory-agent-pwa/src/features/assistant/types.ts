export type AssistantRole = 'user' | 'assistant';

export interface AssistantMessage {
  id: string;
  role: AssistantRole;
  content: string;
  sources?: string[];
  tool?: string | null;
  payload?: Record<string, unknown> | null;
  created_at?: string;
  /** Local-only flag for optimistic messages that failed to send. */
  failed?: boolean;
}

export interface ThreadSummary {
  thread_id: string;
  updated_at: string;
  created_at: string;
  message_count: number;
  last_message_preview: string;
}

export interface ThreadDetail {
  thread_id: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  messages: AssistantMessage[];
  pagination?: {
    has_more: boolean;
    next_cursor: string | null;
    loaded_count: number;
  };
}

export interface SendMessageResult {
  thread_id: string;
  content: string;
  sources: string[];
  tool: string | null;
  payload: Record<string, unknown> | null;
}
