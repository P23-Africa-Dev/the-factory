'use client';

import React, { useState } from 'react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import { LeadCard } from '@/features/crm/components/LeadCard';
import {
  useLeads,
  useCrmLabels,
  useCrmNavigation,
} from '@/features/crm';
import { NotificationPanel, useUnreadCount } from '@/features/notifications';

export default function AllLeadsPage() {
  const { goBack, goToLeadDetail } = useCrmNavigation();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);

  const { data: leadsData, isLoading, refetch } = useLeads(
    searchQuery.trim() ? { search: searchQuery.trim() } : undefined,
  );
  const { data: labels = [] } = useCrmLabels();
  const { count: unreadCount = 0 } = useUnreadCount();

  const leads = leadsData?.leads ?? [];

  return (
    <ScreenErrorBoundary screenName="AllLeads">
      <div className="relative min-h-screen bg-[#0A1D25] text-white flex flex-col font-sans select-none overflow-hidden pb-10">
        {/* Safe Area Wrapper */}
        <div className="relative z-10 flex flex-col flex-1 px-5 pt-6">
          {/* Header */}
          <div className="flex items-center gap-2 mb-6">
            {/* Back Button */}
            <button
              onClick={goBack}
              className="w-10 h-10 flex items-center justify-center text-3xl font-light text-white/90 hover:text-white transition-colors focus:outline-none"
              aria-label="Go back"
            >
              ‹
            </button>

            {/* Search Bar */}
            <div
              className={`flex-1 flex items-center bg-white/[0.08] rounded-[28px] px-3.5 h-12 border transition-all ${
                isSearchFocused ? 'border-[#44AFCD]/40' : 'border-transparent'
              }`}
            >
              <img
                src="/assets/search-icon.png"
                alt="Search"
                className="w-[18px] h-[18px] mr-2 opacity-60"
              />
              <input
                type="text"
                placeholder="Search For Leads"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setIsSearchFocused(false)}
                className="flex-1 bg-transparent text-white placeholder-white/40 text-sm focus:outline-none border-none p-0"
              />
              {searchQuery.length > 0 && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-white/50 hover:text-white px-2 focus:outline-none text-sm"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Notification Bell */}
            <button
              onClick={() => setIsNotificationOpen(true)}
              className="relative w-11 h-11 flex items-center justify-center bg-white/[0.08] hover:bg-white/[0.12] rounded-full active:scale-95 transition-all focus:outline-none"
            >
              <img
                src="/assets/notification-icon.png"
                alt="Notifications"
                className="w-9 h-9 object-contain"
              />
              {unreadCount > 0 && (
                <div className="absolute top-1 right-1 min-w-3.5 h-3.5 bg-[#FD6046] text-white font-bold text-[9px] rounded-full flex items-center justify-center px-0.5">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </div>
              )}
            </button>
          </div>

          {/* Section Title */}
          <div className="mb-4">
            <h3 className="font-bold text-lg text-white">All Lead List</h3>
          </div>

          {/* Lead List content */}
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#44AFCD] border-t-transparent" />
              </div>
            ) : leads.length === 0 ? (
              <div className="flex items-center justify-center py-20 px-6 bg-white/[0.04] border border-white/5 rounded-2xl text-center">
                <p className="text-sm text-white/50 leading-relaxed font-medium">
                  {searchQuery.trim()
                    ? 'No leads matched your search'
                    : 'No leads available'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {leads.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    labels={labels}
                    onOpenDetails={(id) => goToLeadDetail(id)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Notification Drawer */}
      <NotificationPanel
        open={isNotificationOpen}
        onClose={() => setIsNotificationOpen(false)}
      />
    </ScreenErrorBoundary>
  );
}
