export type {
  AssistantMessage,
  AssistantRole,
  SendMessageResult,
  ThreadDetail,
  ThreadSummary,
  WeeklySummaryStatus,
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
export {
  runWeeklySummary,
  weeklySummaryMessage,
  WeeklySummaryError,
  type WeeklySummaryResult,
} from './weeklySummary';
