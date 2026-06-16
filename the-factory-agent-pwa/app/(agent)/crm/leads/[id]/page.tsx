'use client';

import React, { useState, useEffect, use } from 'react';
import { ScreenErrorBoundary } from '@/components/shared/ScreenErrorBoundary';
import {
  useLead,
  useCrmLabels,
  useUpdateLead,
  useCrmNavigation,
  type CrmLabel,
} from '@/features/crm';
import { getActiveCompanyId } from '@/lib/storage/stores';
import { toast } from '@/lib/toast';

interface LeadDetailPageProps {
  params: Promise<{ id: string }>;
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex flex-col border-b border-white/5 py-3 last:border-none">
      <span className="text-[10px] font-bold text-white/40 uppercase tracking-wider mb-1">
        {label}
      </span>
      <span className="text-sm font-medium text-white leading-relaxed">
        {value}
      </span>
    </div>
  );
}

function StatusPicker({
  currentStatus,
  labels,
  onSelect,
}: {
  currentStatus: string | null;
  labels: CrmLabel[];
  onSelect: (slug: string) => void;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] font-bold text-white/40 uppercase tracking-widest mb-3">
        Select Status
      </span>
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none select-none">
        {labels.map((label) => {
          const isActive = currentStatus === label.slug;
          return (
            <button
              key={label.slug}
              onClick={() => onSelect(label.slug)}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all whitespace-nowrap active:scale-95"
              style={{
                backgroundColor: isActive ? label.color : 'rgba(255,255,255,0.08)',
                borderColor: isActive ? label.color : 'rgba(255,255,255,0.15)',
                color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.6)',
              }}
            >
              {label.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function LeadDetailPage({ params }: LeadDetailPageProps) {
  const { id } = use(params);
  const { goBack } = useCrmNavigation();

  const { data: lead, isLoading, isError } = useLead(id);
  const { data: labels = [] } = useCrmLabels();
  const { mutate: updateLead, isPending: isUpdating } = useUpdateLead({
    onSuccess: () => {
      toast.success('Lead updated successfully');
    },
  });

  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editSource, setEditSource] = useState('');

  // Populate edit fields when lead loads
  useEffect(() => {
    if (lead) {
      setEditName(lead.name);
      setEditPhone(lead.phone ?? '');
      setEditEmail(lead.email ?? '');
      setEditLocation(lead.location ?? '');
      setEditSource(lead.source ?? '');
    }
  }, [lead]);

  const handleStatusChange = (slug: string) => {
    if (!lead) return;
    const companyId = getActiveCompanyId();
    if (!companyId) {
      toast.error('No active company selected');
      return;
    }
    updateLead({
      id: lead.id,
      payload: { company_id: companyId, status: slug },
    });
  };

  const handleSaveEdit = () => {
    if (!lead) return;
    const companyId = getActiveCompanyId();
    if (!companyId) {
      toast.error('No active company selected');
      return;
    }

    if (!editName.trim()) {
      toast.error('Lead name cannot be empty');
      return;
    }

    updateLead(
      {
        id: lead.id,
        payload: {
          company_id: companyId,
          name: editName.trim(),
          phone: editPhone.trim() || null,
          email: editEmail.trim() || null,
          location: editLocation.trim() || null,
          source: editSource.trim() || null,
        },
      },
      {
        onSuccess: () => setEditMode(false),
      },
    );
  };

  const handleCancelEdit = () => {
    if (lead) {
      setEditName(lead.name);
      setEditPhone(lead.phone ?? '');
      setEditEmail(lead.email ?? '');
      setEditLocation(lead.location ?? '');
      setEditSource(lead.source ?? '');
    }
    setEditMode(false);
  };

  const currentLabelInfo = labels.find((l) => l.slug === lead?.status);

  return (
    <ScreenErrorBoundary screenName="LeadDetail">
      <div className="relative min-h-screen bg-[#0A1D25] text-white flex flex-col font-sans select-none overflow-hidden pb-10">
        {/* Header */}
        <div className="relative z-10 flex items-center justify-between px-5 pt-6 mb-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={goBack}
              className="w-10 h-10 flex items-center justify-center text-3xl font-light text-white/90 hover:text-white transition-colors focus:outline-none"
              aria-label="Go back"
            >
              ‹
            </button>
            <h2 className="font-bold text-lg text-white truncate max-w-[200px]">
              {isLoading ? 'Loading…' : lead?.name ?? 'Lead Detail'}
            </h2>
          </div>

          {!isLoading && lead && (
            <button
              onClick={() => (editMode ? handleCancelEdit() : setEditMode(true))}
              disabled={isUpdating}
              className="px-4 py-2 bg-white/[0.08] hover:bg-white/[0.12] disabled:opacity-50 text-[#44AFCD] font-semibold text-xs rounded-full border border-white/[0.15] transition-all active:scale-95"
            >
              {editMode ? 'Cancel' : 'Edit'}
            </button>
          )}
        </div>

        {/* Content Wrapper */}
        <div className="relative z-10 flex-1 px-5 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-3 border-[#44AFCD] border-t-transparent" />
            </div>
          ) : isError || !lead ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
              <p className="text-sm text-white/60">Failed to load lead details.</p>
              <button
                onClick={goBack}
                className="px-6 py-2 bg-white/[0.08] text-[#44AFCD] text-xs font-semibold rounded-full hover:bg-white/[0.12] transition-colors"
              >
                Go Back
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Header card with name and current status badge */}
              <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg">
                <h3 className="font-bold text-xl text-white mb-2">{lead.name}</h3>
                {currentLabelInfo && (
                  <div
                    className="inline-flex rounded-full px-3 py-1 text-xs font-semibold mb-2"
                    style={{
                      backgroundColor: `${currentLabelInfo.color}22`,
                      color: currentLabelInfo.color,
                    }}
                  >
                    {currentLabelInfo.name}
                  </div>
                )}
                {lead.updatedAt && (
                  <p className="text-[10px] text-white/40">
                    Last updated: {new Date(lead.updatedAt).toLocaleDateString()}
                  </p>
                )}
              </div>

              {/* Status Picker */}
              {labels.length > 0 && !editMode && (
                <div className="relative bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg">
                  <StatusPicker
                    currentStatus={lead.status}
                    labels={labels}
                    onSelect={handleStatusChange}
                  />
                  {isUpdating && (
                    <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] rounded-2xl flex items-center justify-center gap-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#44AFCD] border-t-transparent" />
                      <span className="text-xs text-[#44AFCD] font-medium">Saving…</span>
                    </div>
                  )}
                </div>
              )}

              {/* Information Section */}
              <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg flex flex-col">
                <h4 className="font-bold text-sm text-white mb-4">Lead Information</h4>

                {editMode ? (
                  <div className="flex flex-col gap-4">
                    {/* Name field */}
                    <div className="flex flex-col">
                      <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide mb-1.5">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Full name"
                        className="bg-white/[0.08] text-white text-sm border border-white/15 focus:border-[#44AFCD]/50 rounded-xl px-4 py-2.5 focus:outline-none transition-all placeholder-white/30"
                      />
                    </div>

                    {/* Email field */}
                    <div className="flex flex-col">
                      <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide mb-1.5">
                        Email
                      </label>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="Email address"
                        className="bg-white/[0.08] text-white text-sm border border-white/15 focus:border-[#44AFCD]/50 rounded-xl px-4 py-2.5 focus:outline-none transition-all placeholder-white/30"
                      />
                    </div>

                    {/* Phone field */}
                    <div className="flex flex-col">
                      <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide mb-1.5">
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={editPhone}
                        onChange={(e) => setEditPhone(e.target.value)}
                        placeholder="Phone number"
                        className="bg-white/[0.08] text-white text-sm border border-white/15 focus:border-[#44AFCD]/50 rounded-xl px-4 py-2.5 focus:outline-none transition-all placeholder-white/30"
                      />
                    </div>

                    {/* Location field */}
                    <div className="flex flex-col">
                      <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide mb-1.5">
                        Location
                      </label>
                      <input
                        type="text"
                        value={editLocation}
                        onChange={(e) => setEditLocation(e.target.value)}
                        placeholder="Location"
                        className="bg-white/[0.08] text-white text-sm border border-white/15 focus:border-[#44AFCD]/50 rounded-xl px-4 py-2.5 focus:outline-none transition-all placeholder-white/30"
                      />
                    </div>

                    {/* Source field */}
                    <div className="flex flex-col">
                      <label className="text-[10px] font-bold text-white/50 uppercase tracking-wide mb-1.5">
                        Source
                      </label>
                      <input
                        type="text"
                        value={editSource}
                        onChange={(e) => setEditSource(e.target.value)}
                        placeholder="Source"
                        className="bg-white/[0.08] text-white text-sm border border-white/15 focus:border-[#44AFCD]/50 rounded-xl px-4 py-2.5 focus:outline-none transition-all placeholder-white/30"
                      />
                    </div>

                    {/* Save Button */}
                    <button
                      onClick={handleSaveEdit}
                      disabled={isUpdating}
                      className="w-full h-12 flex items-center justify-center bg-[#FD6046] hover:bg-[#E0533C] text-white text-sm font-semibold rounded-xl mt-3 active:scale-95 disabled:opacity-60 transition-all"
                    >
                      {isUpdating ? (
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        'Save Changes'
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <InfoRow label="Email" value={lead.email} />
                    <InfoRow label="Phone" value={lead.phone} />
                    <InfoRow label="Location" value={lead.location} />
                    <InfoRow label="Source" value={lead.source} />
                    <InfoRow label="Priority" value={lead.priority} />
                    <InfoRow label="Next Action" value={lead.nextAction} />
                    <InfoRow label="Last Interaction" value={lead.lastInteraction} />
                    {!lead.email && !lead.phone && !lead.location && !lead.source && (
                      <p className="text-xs text-white/40 italic">
                        No additional information available.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Assignment Section */}
              {(lead.creator || lead.assignee || lead.pipeline) && !editMode && (
                <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-5 shadow-lg flex flex-col mb-10">
                  <h4 className="font-bold text-sm text-white mb-4">Assignment</h4>
                  <InfoRow label="Created by" value={lead.creator?.name} />
                  <InfoRow label="Assigned to" value={lead.assignee?.name ?? 'Unassigned'} />
                  {lead.pipeline && <InfoRow label="Pipeline" value={lead.pipeline.name} />}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </ScreenErrorBoundary>
  );
}
