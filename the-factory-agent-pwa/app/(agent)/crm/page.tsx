'use client';

import React, { useState } from 'react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import { LeadCard } from '@/features/crm/components/LeadCard';
import { AddLeadModal } from '@/features/crm/components/AddLeadModal';
import {
  useLeads,
  useCrmLabels,
  useAgentUploadsOverview,
  useCrmNavigation,
} from '@/features/crm';
import { useAuth, useAgentIdentity } from '@/features/auth';
import { NotificationPanel, useUnreadCount } from '@/features/notifications';

const PREVIEW_COUNT = 5;

export default function CrmDashboardPage() {
  useAuth();
  const { avatarSrc } = useAgentIdentity();
  const { goToAllLeads, goToLeadDetail } = useCrmNavigation();

  const [isNotificationOpen, setIsNotificationOpen] = useState(false);
  const [isAddLeadOpen, setIsAddLeadOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);

  const { data: leadsData, isLoading: isLoadingLeads, refetch: refetchLeads } = useLeads(
    searchQuery.trim() ? { search: searchQuery.trim() } : undefined,
  );
  const { data: labels = [] } = useCrmLabels();
  const { data: overview, isLoading: isLoadingOverview } = useAgentUploadsOverview();
  const { count: unreadCount = 0 } = useUnreadCount();

  const allLeads = leadsData?.leads ?? [];
  const previewLeads = allLeads.slice(0, PREVIEW_COUNT);
  const totalUploaded = overview?.total_uploaded_leads ?? 0;

  return (
    <ScreenErrorBoundary screenName="CrmDashboard">
      <div className="relative min-h-screen bg-[#0A1D25] text-white flex flex-col font-sans select-none overflow-hidden pb-10">
        {/* Ambient background image */}
        <div
          className="absolute inset-0 bg-cover bg-center pointer-events-none opacity-[0.12]"
          style={{ backgroundImage: "url('/assets/app-background.png')" }}
        />

        {/* Safe Area Wrapper */}
        <div className="relative z-10 flex flex-col flex-1 px-5 pt-6">
          {/* Header */}
          <div className="flex items-center gap-3.5 mb-6">
            {/* Search Bar */}
            <div
              className={`flex-1 flex items-center bg-white/[0.08] rounded-[28px] px-4 h-12 border transition-all ${
                isSearchFocused ? 'border-[#44AFCD]/40' : 'border-transparent'
              }`}
            >
              <img
                src="/assets/search-icon.png"
                alt="Search"
                className="w-5 h-5 mr-2.5 opacity-60"
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
            </div>

            {/* Notification Bell */}
            <button
              onClick={() => setIsNotificationOpen(true)}
              className="relative w-12 h-12 flex items-center justify-center bg-white/[0.08] hover:bg-white/[0.12] rounded-full active:scale-95 transition-all focus:outline-none"
            >
              <img
                src="/assets/notification-icon.png"
                alt="Notifications"
                className="w-10 h-10 object-contain"
              />
              {unreadCount > 0 && (
                <div className="absolute top-1 right-1 min-w-4 h-4 bg-[#FD6046] text-white font-bold text-[9px] rounded-full flex items-center justify-center px-1">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </div>
              )}
            </button>
          </div>

          {/* Main Scroll Content Container */}
          <div className="flex-1 overflow-y-auto">
            {/* Agent Upload Card */}
            <div className="bg-white rounded-2xl flex items-center p-5 mb-6 gap-4 text-black shadow-lg">
              {/* Avatar with Gradient border */}
              <div className="w-20 h-20 rounded-full p-0.5 border-3 border-[#FD6046] overflow-hidden flex-shrink-0">
                <img
                  src={avatarSrc}
                  alt="Agent avatar"
                  className="w-full h-full object-cover rounded-full"
                />
              </div>

              {/* Upload Card Info */}
              <div className="flex-1">
                {isLoadingOverview ? (
                  <div className="flex items-center justify-center p-2">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#FD6046] border-t-transparent" />
                  </div>
                ) : (
                  <>
                    <div className="flex items-end gap-1 mb-0.5">
                      <span className="font-bold text-4xl text-[#0A1D25] leading-none">
                        {totalUploaded.toLocaleString()}
                      </span>
                      <span className="font-normal text-xs text-gray-400 mb-1">Leads</span>
                    </div>
                    <p className="text-xs text-gray-500 font-medium mb-3">Uploaded by you</p>
                    <button
                      onClick={() => setIsAddLeadOpen(true)}
                      className="flex items-center gap-1.5 bg-[#FD6046] hover:bg-[#E0533C] text-white text-xs font-semibold rounded-[24px] px-4 py-2 transition-colors active:scale-95"
                    >
                      <img
                        src="/assets/bookmark-add-02.png"
                        alt="Add"
                        className="w-4 h-4 brightness-0 invert"
                      />
                      <span>Add Lead</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Section Header */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base text-white">Lead List</h3>
              <button
                onClick={goToAllLeads}
                className="bg-[#6B21A8] hover:bg-[#581C87] text-white font-semibold text-xs rounded-lg px-3.5 py-2 transition-colors active:scale-95"
              >
                View All Leads
              </button>
            </div>

            {/* Leads List rendering */}
            {isLoadingLeads ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#44AFCD] border-t-transparent" />
              </div>
            ) : previewLeads.length === 0 ? (
              <div className="flex items-center justify-center py-12 px-6 bg-white/[0.04] border border-white/5 rounded-2xl text-center">
                <p className="text-sm text-white/50 leading-relaxed font-medium">
                  {searchQuery.trim()
                    ? 'No leads found for your search'
                    : 'No leads yet. Add your first lead!'}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {previewLeads.map((lead) => (
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

      {/* Add Lead dialog */}
      <AddLeadModal
        visible={isAddLeadOpen}
        onClose={() => setIsAddLeadOpen(false)}
        onSuccess={() => {
          refetchLeads();
        }}
      />
    </ScreenErrorBoundary>
  );
}
