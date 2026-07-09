'use client';

import React, { useState, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useLeads } from '@/features/crm';
import { useAuth } from '@/features/auth/hooks/useAuth';
import type { AttendeeCandidate } from '../types';


interface InternalAttendee {
  id: number;
  name: string;
  email: string;
  isOptional: boolean;
}
interface ExternalAttendee {
  email: string;
  displayName: string;
  isOptional: boolean;
}

interface AttendeeSectionProps {
  candidates: AttendeeCandidate[];
  isLoadingCandidates: boolean;
  internalAttendees: InternalAttendee[];
  externalAttendees: ExternalAttendee[];
  onAddInternal: (c: AttendeeCandidate) => void;
  onRemoveInternal: (id: number) => void;
  onAddExternal: (email: string, displayName: string) => void;
  onRemoveExternal: (email: string) => void;
}

export function AttendeeSection({
  candidates,
  isLoadingCandidates,
  internalAttendees,
  externalAttendees,
  onAddInternal,
  onRemoveInternal,
  onAddExternal,
  onRemoveExternal,
}: AttendeeSectionProps): React.ReactElement {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [externalEmail, setExternalEmail] = useState('');
  const [externalName, setExternalName] = useState('');
  const [externalError, setExternalError] = useState('');

  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [leadSearchQuery, setLeadSearchQuery] = useState('');

  const { user } = useAuth();
  const { data: leadsData, isLoading: isLoadingLeads } = useLeads({
    source: 'agent_upload',
    per_page: 1000,
  });

  const myLeads = useMemo(() => {
    if (!leadsData?.leads) return [];
    const userId = user?.id ? String(user.id) : null;
    return leadsData.leads.filter(
      (lead) =>
        lead.email &&
        lead.createdByUserId &&
        String(lead.createdByUserId) === userId
    );
  }, [leadsData, user?.id]);

  const filteredLeads = useMemo(() => {
    if (!leadSearchQuery.trim()) return myLeads;
    const q = leadSearchQuery.toLowerCase();
    return myLeads.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.email && l.email.toLowerCase().includes(q))
    );
  }, [myLeads, leadSearchQuery]);

  const selectedInternalIds = useMemo(() => new Set(internalAttendees.map((a) => a.id)), [internalAttendees]);


  const filteredCandidates = useMemo(() => {
    if (!searchQuery.trim()) return candidates;
    const q = searchQuery.toLowerCase();
    return candidates.filter(
      (c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
    );
  }, [candidates, searchQuery]);

  const handleAddExternal = () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(externalEmail.trim())) {
      setExternalError('Enter a valid email address');
      return;
    }
    onAddExternal(externalEmail.trim(), externalName.trim());
    setExternalEmail('');
    setExternalName('');
    setExternalError('');
  };

  return (
    <div className="flex flex-col gap-3">
      <h4 className="text-sm font-bold text-white uppercase tracking-wider">Attendees</h4>

      {/* Selected Chips Row */}
      {(internalAttendees.length > 0 || externalAttendees.length > 0) && (
        <div className="flex flex-wrap gap-2">
          {internalAttendees.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-1.5 bg-[#44AFCD]/20 border border-[#44AFCD]/30 text-white rounded-full px-3.5 py-1 text-xs select-none max-w-[160px] min-w-[60px]"
            >
              <span className="truncate flex-1">{a.name}</span>
              <button
                type="button"
                onClick={() => onRemoveInternal(a.id)}
                className="text-[#44AFCD] hover:text-white font-bold p-0.5 text-[10px]"
              >
                ✕
              </button>
            </div>
          ))}
          {externalAttendees.map((a) => (
            <div
              key={a.email}
              className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-500/30 text-white rounded-full px-3.5 py-1 text-xs select-none max-w-[160px] min-w-[60px]"
            >
              <span className="truncate flex-1">{a.email}</span>
              <button
                type="button"
                onClick={() => onRemoveExternal(a.email)}
                className="text-emerald-400 hover:text-white font-bold p-0.5 text-[10px]"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add buttons container */}
      <div className="flex flex-col gap-2">
        {/* Add team member button */}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="w-full flex items-center justify-center py-3 border border-dashed border-[#75ADAF] hover:border-[#5DA1A3] rounded-xl text-xs font-semibold text-[#75ADAF] hover:text-[#5DA1A3] transition-colors focus:outline-none"
        >
          + Add team member
        </button>

        {/* Add from My Leads button */}
        <button
          type="button"
          onClick={() => setLeadPickerOpen(true)}
          className="w-full flex items-center justify-center py-3 border border-dashed border-emerald-500/50 hover:border-emerald-500 rounded-xl text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors focus:outline-none"
        >
          + Add from My Leads
        </button>
      </div>


      {/* External Attendee input fields */}
      <div className="flex flex-col gap-2 mt-2">
        <span className="text-[11px] font-bold text-white/40 uppercase tracking-wide">External attendee</span>
        <input
          type="email"
          placeholder="Email address"
          value={externalEmail}
          onChange={(e) => {
            setExternalEmail(e.target.value);
            setExternalError('');
          }}
          className="bg-white/[0.08] text-white text-sm border border-white/15 focus:border-[#44AFCD]/50 rounded-xl px-4 py-2.5 focus:outline-none transition-all placeholder-white/30"
        />
        <input
          type="text"
          placeholder="Display name (optional)"
          value={externalName}
          onChange={(e) => setExternalName(e.target.value)}
          className="bg-white/[0.08] text-white text-sm border border-white/15 focus:border-[#44AFCD]/50 rounded-xl px-4 py-2.5 focus:outline-none transition-all placeholder-white/30"
        />
        {externalError && <span className="text-xs text-red-500 font-semibold">{externalError}</span>}
        <button
          type="button"
          onClick={handleAddExternal}
          className="w-full h-11 flex items-center justify-center bg-white/10 hover:bg-white/15 text-white text-xs font-semibold rounded-xl active:scale-95 transition-all mt-1"
        >
          Add external
        </button>
      </div>

      {/* Team Member Candidate Picker Modal */}
      <AnimatePresence>
        {pickerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPickerOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10010] cursor-pointer"
            />

            {/* Picker Sheet Container */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-[#0A1D25] border-t border-white/10 rounded-t-2xl z-[10020] flex flex-col p-5 max-h-[75vh] shadow-2xl font-sans text-white"
            >
              <div className="w-12 h-1 bg-white/10 rounded-full mx-auto mb-4" />
              <h3 className="text-base font-bold text-white mb-3">Add Team Members</h3>

              {/* Search bar */}
              <input
                type="text"
                placeholder="Search by name......"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="bg-white/[0.08] text-white text-sm border border-white/15 focus:border-[#44AFCD]/50 rounded-xl px-4 py-2.5 focus:outline-none transition-all placeholder-white/30 mb-4"
              />

              {/* Candidates list wrapper */}
              <div className="flex-1 overflow-y-auto mb-4 flex flex-col gap-2">
                {isLoadingCandidates ? (
                  <div className="flex justify-center items-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#75ADAF] border-t-transparent" />
                  </div>
                ) : filteredCandidates.length === 0 ? (
                  <p className="text-center text-xs text-white/40 py-8">No matching candidates found.</p>
                ) : (
                  filteredCandidates.map((item) => {
                    const selected = selectedInternalIds.has(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => {
                          if (selected) onRemoveInternal(item.id);
                          else onAddInternal(item);
                        }}
                        className={`flex items-center gap-3 p-3 rounded-xl border border-white/5 cursor-pointer active:scale-98 transition-all ${
                          selected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-full bg-[#75ADAF] flex items-center justify-center font-bold text-white text-sm">
                          {item.name[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{item.name}</p>
                          <p className="text-[10px] text-white/50 truncate">{item.email}</p>
                        </div>
                        <span className="text-[10px] text-white/40 font-semibold">{item.displayRole}</span>
                        {selected && <span className="text-emerald-400 font-bold text-sm">✓</span>}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Done Button */}
              <button
                type="button"
                onClick={() => setPickerOpen(false)}
                className="w-full h-12 flex items-center justify-center bg-[#FD6046] hover:bg-[#E0533C] text-white text-sm font-semibold rounded-xl active:scale-95 transition-all"
              >
                Done
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Lead Candidate Picker Modal */}
      <AnimatePresence>
        {leadPickerOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLeadPickerOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10010] cursor-pointer"
            />

            {/* Picker Sheet Container */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-[#0A1D25] border-t border-white/10 rounded-t-2xl z-[10020] flex flex-col p-5 max-h-[75vh] shadow-2xl font-sans text-white"
            >
              <div className="w-12 h-1 bg-white/10 rounded-full mx-auto mb-4" />
              <h3 className="text-base font-bold text-white mb-3">Add External Leads</h3>

              {/* Search bar */}
              <input
                type="text"
                placeholder="Search leads by name or email…"
                value={leadSearchQuery}
                onChange={(e) => setLeadSearchQuery(e.target.value)}
                autoFocus
                className="bg-white/[0.08] text-white text-sm border border-white/15 focus:border-[#44AFCD]/50 rounded-xl px-4 py-2.5 focus:outline-none transition-all placeholder-white/30 mb-4"
              />

              {/* Leads list wrapper */}
              <div className="flex-1 overflow-y-auto mb-4 flex flex-col gap-2">
                {isLoadingLeads ? (
                  <div className="flex justify-center items-center py-8">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent" />
                  </div>
                ) : filteredLeads.length === 0 ? (
                  <p className="text-center text-xs text-white/40 py-8">No matching leads found.</p>
                ) : (
                  filteredLeads.map((lead) => {
                    const selected = externalAttendees.some((a) => a.email === lead.email);
                    return (
                      <div
                        key={lead.id}
                        onClick={() => {
                          if (selected) {
                            onRemoveExternal(lead.email!);
                          } else {
                            onAddExternal(lead.email!, lead.name);
                          }
                        }}
                        className={`flex items-center gap-3 p-3 rounded-xl border border-white/5 cursor-pointer active:scale-98 transition-all ${
                          selected ? 'bg-white/[0.08]' : 'hover:bg-white/[0.02]'
                        }`}
                      >
                        <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center font-bold text-white text-sm">
                          {lead.name[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-white truncate">{lead.name}</p>
                          <p className="text-[10px] text-white/50 truncate">{lead.email}</p>
                        </div>
                        {selected && <span className="text-emerald-400 font-bold text-sm">✓</span>}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Done Button */}
              <button
                type="button"
                onClick={() => setLeadPickerOpen(false)}
                className="w-full h-12 flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl active:scale-95 transition-all"
              >
                Done
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

    </div>
  );
}
