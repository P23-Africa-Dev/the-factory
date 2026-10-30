'use client';

import React, { useState } from 'react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import { LeadCard } from '@/features/crm/components/LeadCard';
import {
  useLeads,
  useCrmLabels,
  useCrmNavigation,
  useCrmAssignees,
} from '@/features/crm';
import { NotificationPanel, useUnreadCount } from '@/features/notifications';

export default function AllLeadsPage() {
  const { goBack, goToLeadDetail } = useCrmNavigation();

  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<number | 'all'>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  const leadFilters = {
    ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
    ...(selectedAssigneeId !== 'all' ? { assigned_to_user_id: selectedAssigneeId } : {}),
    ...(selectedStatus !== 'all' ? { status: selectedStatus } : {}),
  };

  const { data: leadsData, isLoading } = useLeads(leadFilters);
  const { data: labels = [] } = useCrmLabels();
  const { data: assignees = [] } = useCrmAssignees();
  const { count: unreadCount = 0 } = useUnreadCount();

  const leads = leadsData?.leads ?? [];

  return (
    <ScreenErrorBoundary screenName="AllLeads">
      <div className="relative min-h-screen bg-[#0A1D25] text-white flex flex-col font-sans select-none overflow-hidden pb-10">
        {/* Safe Area Wrapper */}
        <div className="relative z-10 flex flex-col flex-1 px-5 pt-[calc(env(safe-area-inset-top,0px)+24px)]">
          {/* Header */}
          <div className="flex items-center gap-2 mb-4">
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
                placeholder="Search All Company Leads…"
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

          {/* Filter Row: Assignee & Status */}
          <div className="flex items-center gap-2 mb-4">
            <select
              value={selectedAssigneeId}
              onChange={(e) =>
                setSelectedAssigneeId(e.target.value === 'all' ? 'all' : Number(e.target.value))
              }
              className="flex-1 h-10 bg-white/[0.08] border border-white/15 rounded-xl px-3 text-xs font-semibold text-white focus:outline-none"
              style={{ backgroundColor: '#0B3343' }}
            >
              <option value="all">All Assignees</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="flex-1 h-10 bg-white/[0.08] border border-white/15 rounded-xl px-3 text-xs font-semibold text-white focus:outline-none"
              style={{ backgroundColor: '#0B3343' }}
            >
              <option value="all">All Statuses</option>
              {labels.map((l) => (
                <option key={l.slug} value={l.slug}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          {/* Section Title */}
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-bold text-lg text-white">Company Lead List</h3>
            <span className="text-xs text-white/50 font-semibold">{leads.length} leads</span>
          </div>

          {/* Lead List content */}
          <div className="flex-1 overflow-y-auto pb-16">
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
