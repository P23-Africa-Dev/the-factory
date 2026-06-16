'use client';

import React, { useMemo, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  useNotifications,
  useMarkRead,
  useMarkAllRead,
  useDeleteNotification,
  useUnreadCount,
} from '../queries';
import { useNotificationNavigation } from '../navigation';
import { NotificationItem } from './NotificationItem';
import type { AppNotification } from '../types';

interface NotificationPanelProps {
  open: boolean;
  onClose: () => void;
}

type DateGroup = 'Today' | 'Yesterday' | 'Earlier';

function getGroup(iso: string): DateGroup {
  const now = new Date();
  const d = new Date(iso);
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return 'Earlier';
}

type ListItem =
  | { kind: 'header'; label: DateGroup }
  | { kind: 'notification'; data: AppNotification };

export function NotificationPanel({ open, onClose }: NotificationPanelProps): React.ReactElement {
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const {
    data,
    isLoading,
    isError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useNotifications(filter === 'unread' ? { is_read: 1 } : undefined); // in api, is_read: 0 filters unread, wait! Let's check mobile, it says "filter === 'unread' ? { is_read: 0 } : undefined". Wait, in the database/API: is_read=0 means unread! Let's pass is_read: 0 for unread.

  const { count: unreadCount, refetch: refetchUnreadCount } = useUnreadCount();
  const { mutate: markRead } = useMarkRead();
  const { mutate: markAllRead } = useMarkAllRead();
  const { mutate: deleteNotif } = useDeleteNotification();
  const { navigateToNotification } = useNotificationNavigation();

  // Refetch when drawer opens
  useEffect(() => {
    if (open) {
      refetch();
      refetchUnreadCount();
    }
  }, [open, refetch, refetchUnreadCount]);

  const allItems = useMemo((): AppNotification[] => {
    if (!data) return [];
    return data.pages.flatMap((p) => p.items);
  }, [data]);

  const listItems = useMemo((): ListItem[] => {
    const result: ListItem[] = [];
    let lastGroup: DateGroup | null = null;
    for (const n of allItems) {
      const group = getGroup(n.createdAt);
      if (group !== lastGroup) {
        result.push({ kind: 'header', label: group });
        lastGroup = group;
      }
      result.push({ kind: 'notification', data: n });
    }
    return result;
  }, [allItems]);

  const handlePress = (n: AppNotification) => {
    if (!n.isRead) {
      markRead([n.id]);
    }
    navigateToNotification(n);
    onClose();
  };

  const handleDelete = (id: number) => {
    deleteNotif(id);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 cursor-pointer"
          />

          {/* Drawer container (max-width matched to layout) */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 250 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-md bg-[#0A1D25] border-l border-white/10 z-50 flex flex-col shadow-2xl font-sans"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-white">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="bg-[#FD6046] text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-5 text-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllRead()}
                    className="text-xs font-semibold px-2.5 py-1.5 bg-white/10 hover:bg-white/15 active:scale-95 text-white/80 hover:text-white rounded-lg transition-all"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center text-white/60 hover:text-white text-lg rounded-full hover:bg-white/10 transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex px-5 py-3 gap-2 border-b border-white/10">
              <button
                onClick={() => setFilter('all')}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  filter === 'all'
                    ? 'bg-[#44AFCD] text-white'
                    : 'bg-white/10 text-white/60 hover:text-white/80'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilter('unread')}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  filter === 'unread'
                    ? 'bg-[#44AFCD] text-white'
                    : 'bg-white/10 text-white/60 hover:text-white/80'
                }`}
              >
                Unread
              </button>
            </div>

            {/* Content list */}
            <div className="flex-1 overflow-y-auto pb-10">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#75ADAF] border-t-transparent" />
                  <span className="text-sm text-white/40">Loading notifications...</span>
                </div>
              ) : isError ? (
                <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-4">
                  <span className="text-3xl">⚠️</span>
                  <h4 className="text-base font-semibold text-white">Couldn't load notifications</h4>
                  <p className="text-xs text-white/50 leading-relaxed">
                    Check your internet connection and try again.
                  </p>
                  <button
                    onClick={() => refetch()}
                    className="px-5 py-2 rounded-full bg-[#44AFCD] hover:bg-[#399EB9] active:scale-95 text-xs font-bold text-white transition-all"
                  >
                    Retry
                  </button>
                </div>
              ) : listItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-8 text-center gap-3">
                  <span className="text-4xl mb-2">🔔</span>
                  <h4 className="text-base font-semibold text-white">All caught up!</h4>
                  <p className="text-xs text-white/40 leading-relaxed">
                    {filter === 'unread' ? 'No unread notifications.' : "You don't have any notifications yet."}
                  </p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {listItems.map((item, idx) => {
                    if (item.kind === 'header') {
                      return (
                        <div
                          key={`header-${item.label}`}
                          className="bg-white/[0.03] px-4 py-2 text-[10px] font-bold text-white/40 uppercase tracking-widest border-y border-white/5"
                        >
                          {item.label}
                        </div>
                      );
                    }

                    return (
                      <NotificationItem
                        key={`notif-${item.data.id}-${idx}`}
                        notification={item.data}
                        onPress={handlePress}
                        onDelete={handleDelete}
                      />
                    );
                  })}

                  {/* Infinite scroll load button/trigger */}
                  {hasNextPage && (
                    <div className="p-4 text-center">
                      <button
                        onClick={() => fetchNextPage()}
                        disabled={isFetchingNextPage}
                        className="text-xs font-semibold px-4 py-2 border border-white/10 hover:border-white/20 rounded-lg text-white/70 hover:text-white disabled:opacity-50"
                      >
                        {isFetchingNextPage ? 'Loading more...' : 'Load older notifications'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
