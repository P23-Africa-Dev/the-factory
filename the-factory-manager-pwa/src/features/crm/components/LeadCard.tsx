'use client';

import React from 'react';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import type { Lead, CrmLabel } from '@/features/crm';
import { resolveAvatarSrc } from '@/lib/avatar';

function toRelativeTime(value?: string | null): string {
  if (!value) return 'Just now';
  try {
    return `${formatDistanceToNowStrict(parseISO(value))} ago`;
  } catch {
    return 'Just now';
  }
}

function getLabelForStatus(
  status: string | null,
  labels: CrmLabel[],
): { name: string; color: string } | null {
  if (!status) return null;
  const match = labels.find((l) => l.slug === status);
  if (!match) return null;
  return { name: match.name, color: match.color };
}

interface LeadCardProps {
  lead: Lead;
  labels: CrmLabel[];
  onOpenDetails: (id: number) => void;
}

export function LeadCard({ lead, labels, onOpenDetails }: LeadCardProps): React.ReactElement {
  const lastUpdateText = lead.lastInteraction ?? 'No recent update';
  const relativeTime = toRelativeTime(lead.updatedAt);
  const labelInfo = getLabelForStatus(lead.status, labels);
  const assigneeName = lead.assignee?.name ?? 'You';

  return (
    <div className="flex bg-[#0B3343] rounded-[18px] p-3.5 mb-3 border-[0.5px] border-white/8 font-sans select-none">
      {/* Left Section */}
      <div className="flex-1 flex flex-col justify-between pr-2.5 min-w-0">
        <div>
          <h4 className="font-bold text-sm text-white truncate mb-0.5">
            {lead.name}
          </h4>
          {(lead.source || lead.location) && (
            <p className="text-[11px] text-white/55 leading-snug line-clamp-2 mb-1.5">
              {lead.source ?? lead.location}
            </p>
          )}

          {lead.location && (
            <div className="mb-2">
              <span className="block font-semibold text-[11px] text-[#44AFCD] mb-0.5">Location</span>
              <p className="text-[11px] text-white/70 leading-snug line-clamp-2 underline decoration-white/40">
                {lead.location}
              </p>
            </div>
          )}
        </div>

        <button
          onClick={() => onOpenDetails(lead.id)}
          className="bg-[#FD6046] hover:bg-[#E0533C] text-white font-semibold text-[11px] rounded-[20px] px-3.5 py-1.5 self-start transition-colors duration-150 active:scale-95"
        >
          Open Details
        </button>
      </div>

      {/* Vertical Divider */}
      <div className="w-[0.5px] bg-white/12 mx-1" />

      {/* Right Section */}
      <div className="flex-[0.85] flex flex-col justify-between pl-2.5 min-w-0">
        <div>
          <span className="block font-bold text-xs text-white mb-0.5">Last Update</span>
          <p className="text-[11px] text-white/60 leading-snug line-clamp-2 mb-2">
            {lastUpdateText}
          </p>
        </div>

        {/* Status Badge */}
        <div className="mb-2.5">
          {labelInfo ? (
            <div
              className="inline-flex items-center gap-1 rounded-[20px] px-2.5 py-1 text-[11px] font-semibold"
              style={{ backgroundColor: `${labelInfo.color}22`, color: labelInfo.color }}
            >
              <span>{labelInfo.name}</span>
              <span className="text-[10px]">▼</span>
            </div>
          ) : (
            <div className="inline-flex items-center gap-1 rounded-[20px] bg-[#44AFCD]/20 px-2.5 py-1 text-[11px] font-semibold text-[#44AFCD]">
              <span>New</span>
              <span className="text-[10px]">▼</span>
            </div>
          )}
        </div>

        {/* Assignee Footer Row */}
        <div className="flex items-center gap-1.5">
          <img
            src={resolveAvatarSrc(lead.assignee?.avatar_url)}
            alt={assigneeName}
            className="w-5 h-5 rounded-full border-[1px] border-white/20 object-cover"
          />
          <span className="text-[10px] text-white/60 truncate flex-1">
            {assigneeName === 'You' ? `You and ${relativeTime}` : assigneeName}
          </span>
        </div>
      </div>
    </div>
  );
}
