/**
 * Notification store — direct port from mobile app.
 * Zero React Native dependencies — identical Zustand store.
 */
import { create } from 'zustand';

export type NotificationEnvelope = {
  notification_id: number;
  type: string;
  category: string;
  priority: string;
  title: string;
  message: string;
  is_in_app_visible: boolean;
  action_url: string | null;
};

interface NotificationStore {
  unreadCount: number;
  pendingNotification: NotificationEnvelope | null;
  setUnreadCount: (count: number) => void;
  setPendingNotification: (n: NotificationEnvelope | null) => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  unreadCount: 0,
  pendingNotification: null,
  setUnreadCount: (count) => set({ unreadCount: count }),
  setPendingNotification: (n) => set({ pendingNotification: n }),
}));
