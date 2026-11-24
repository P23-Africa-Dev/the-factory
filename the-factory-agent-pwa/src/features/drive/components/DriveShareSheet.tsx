'use client';

import React, { useMemo, useState } from 'react';
import { Check, Loader2, Search, Users } from 'lucide-react';
import { driveErrorMessage } from '../api';
import { useDriveMembers, useSyncDriveGrants } from '../queries';
import type { DriveFile, DriveMemberLoader } from '../types';
import { DriveSheet } from './DriveSheet';

export function DriveShareSheet({
  file,
  loadMembers,
  onClose,
}: {
  file: DriveFile;
  loadMembers?: DriveMemberLoader;
  onClose: () => void;
}) {
  const members = useDriveMembers(loadMembers);
  const syncGrants = useSyncDriveGrants();

  const [shareWithAll, setShareWithAll] = useState(() =>
    file.grants.some((grant) => grant.grantee_type === 'all'),
  );
  const [selected, setSelected] = useState<Set<number>>(
    () =>
      new Set(
        file.grants
          .filter((grant) => grant.grantee_type === 'user' && grant.user_id != null)
          .map((grant) => grant.user_id as number),
      ),
  );
  const [search, setSearch] = useState('');

  const visibleMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = members.data ?? [];
    if (!term) return list;
    return list.filter(
      (member) => member.name.toLowerCase().includes(term) || member.email.toLowerCase().includes(term),
    );
  }, [members.data, search]);

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    try {
      await syncGrants.mutateAsync({
        fileId: file.id,
        share_with_all: shareWithAll,
        user_ids: shareWithAll ? [] : Array.from(selected),
      });
      onClose();
    } catch {
      // toast shown by the mutation
    }
  };

  const footer = (
    <button
      type="button"
      onClick={handleSave}
      disabled={syncGrants.isPending}
      className="w-full h-11 rounded-xl bg-[#75ADAF] hover:bg-[#66989A] text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
    >
      {syncGrants.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
      Save sharing
    </button>
  );

  return (
    <DriveSheet title={`Share "${file.original_name}"`} onClose={onClose} footer={footer} labelledBy="drive-share-title">
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setShareWithAll((value) => !value)}
          aria-pressed={shareWithAll}
          className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border text-left transition-colors ${
            shareWithAll ? 'bg-[#75ADAF]/15 border-[#75ADAF]/50' : 'bg-white/5 border-white/10'
          }`}
        >
          <div className="p-2 rounded-xl bg-[#75ADAF]/20 text-[#75ADAF]">
            <Users className="w-4 h-4" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-white">All company members</p>
            <p className="text-xs text-white/50">Everyone in the company can view and download it.</p>
          </div>
          {shareWithAll && <Check className="w-4 h-4 text-[#75ADAF]" />}
        </button>

        {!shareWithAll && (
          <>
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search team members…"
                className="w-full h-11 pl-9 pr-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#75ADAF]"
              />
            </label>

            {members.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-5 h-5 animate-spin text-[#75ADAF]" />
              </div>
            ) : members.isError ? (
              <p className="text-sm text-amber-300 py-4">{driveErrorMessage(members.error)}</p>
            ) : visibleMembers.length === 0 ? (
              <p className="text-sm text-white/50 py-4 text-center">No team members found.</p>
            ) : (
              <ul className="space-y-1.5">
                {visibleMembers.map((member) => {
                  const checked = selected.has(member.id);
                  return (
                    <li key={member.id}>
                      <button
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        onClick={() => toggle(member.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                          checked ? 'bg-[#75ADAF]/15 border-[#75ADAF]/40' : 'bg-white/[0.03] border-white/5'
                        }`}
                      >
                        <span
                          className={`w-5 h-5 shrink-0 rounded-md border flex items-center justify-center ${
                            checked ? 'bg-[#75ADAF] border-[#75ADAF]' : 'border-white/30'
                          }`}
                        >
                          {checked && <Check className="w-3.5 h-3.5 text-white" />}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-white truncate">{member.name}</span>
                          <span className="block text-xs text-white/50 truncate">
                            {member.email} · {member.role}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
    </DriveSheet>
  );
}
