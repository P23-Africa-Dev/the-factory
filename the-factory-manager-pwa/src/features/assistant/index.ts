export type {
  AssistantMessage,
  AssistantRole,
  SendMessageResult,
  ThreadDetail,
  ThreadSummary,
} from './types';

export { assistantApi } from './api';
export { useAssistantConversation } from './useAssistantConversation';
export { useDynamicSuggestions } from './useDynamicSuggestions';
export type { AssistantSuggestion } from './useDynamicSuggestions';
export {
  getActiveThreadId,
  setActiveThreadId,
  clearActiveThreadId,
} from './storage';
