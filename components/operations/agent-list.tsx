'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { OpsTableRow, OpsTableNameCol, OpsTableCol, OpsTableStatus, OpsTableContainer } from './ops-table';

export type AgentItem = {
  id: string;
  name: string;
  description: string;
  zone: string;
  phone: string;
  role: string;
  status: string;
  time: string;
  avatar: string;
  active: boolean;
};

export const AGENT_LIST_DATA: AgentItem[] = [
  { id: '1', name: 'Francis Nasyomba', description: 'Visit the Ikeja Computer village, and promote...', zone: 'Ikeja LGA', phone: '+234 803 4567890', role: 'Field Agent', status: 'Offline', time: '12 hours ago', avatar: '/avatars/male-avatar.png', active: false },
  { id: '2', name: 'Lade Wane', description: 'Visit the Ikeja Computer village, and promote...', zone: 'Ikeja LGA', phone: '+234 803 4567890', role: 'Field Agent', status: 'Active (View on Map)', time: 'Online', avatar: '/avatars/female-avatar.png', active: true },
  { id: '3', name: 'Amina Bello', description: 'Survey Surulere market and log product feedback...', zone: 'Surulere LGA', phone: '+234 812 3456789', role: 'Senior Agent', status: 'Offline', time: '3 hours ago', avatar: '/avatars/female-avatar.png', active: false },
  { id: '4', name: 'Chidi Okonkwo', description: 'Distribute flyers in Lekki Phase 1 corridor...', zone: 'Lekki LGA', phone: '+234 905 6789012', role: 'Field Agent', status: 'Active (View on Map)', time: 'Online', avatar: '/avatars/male-avatar.png', active: true },
  { id: '5', name: 'Ngozi Eze', description: 'Visit Victoria Island corporate offices...', zone: 'Victoria Island', phone: '+234 806 7890123', role: 'Supervisor', status: 'Offline', time: '1 day ago', avatar: '/avatars/female-avatar.png', active: false },
  { id: '6', name: 'Tunde Adeyemi', description: 'Yaba market outreach and new client onboarding...', zone: 'Yaba LGA', phone: '+234 817 8901234', role: 'Field Agent', status: 'Active (View on Map)', time: 'Online', avatar: '/avatars/male-avatar.png', active: true },
  { id: '7', name: 'Fatima Sule', description: 'Conduct customer satisfaction survey in Surulere...', zone: 'Surulere LGA', phone: '+234 803 9012345', role: 'Field Agent', status: 'Offline', time: '5 hours ago', avatar: '/avatars/female-avatar.png', active: false },
  { id: '8', name: 'Emeka Obi', description: 'Oshodi depot stock count and reporting...', zone: 'Oshodi LGA', phone: '+234 908 0123456', role: 'Senior Agent', status: 'Offline', time: '2 hours ago', avatar: '/avatars/male-avatar.png', active: false },
];

const PAGE_SIZE = 4;

interface AgentListProps {
  selectedId?: string;
  onSelect?: (agent: AgentItem) => void;
}

export function AgentList({ selectedId, onSelect }: AgentListProps) {
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(AGENT_LIST_DATA.length / PAGE_SIZE);
  const currentPage = Math.min(page, totalPages);
  const paginated = AGENT_LIST_DATA.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <OpsTableContainer className="grow-0 flex flex-col h-140">
      {/* Header */}
      <div className="flex justify-end mb-5 shrink-0">
        <Link
          href="/operations/agents"
          className="px-5 py-2 bg-dash-dark text-white rounded-full text-[12px] font-semibold hover:opacity-90 transition-colors"
        >
          View all Agents
        </Link>
      </div>

      {/* Scrollable rows */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="space-y-3">
          {paginated.map((agent) => {
            const isSelected = selectedId === agent.id;
            return (
              <OpsTableRow
                key={agent.id}
                isSelected={isSelected}
                onClick={() => onSelect?.(agent)}
                avatar={agent.avatar}
                avatarAlt={agent.name}
              >
                <OpsTableNameCol name={agent.name} subText={agent.description} isSelected={isSelected} />
                <OpsTableCol label="Zone" value={agent.zone} isSelected={isSelected} className="hidden sm:block w-28 sm:w-32" />
                <OpsTableCol label="Phone Number" value={agent.phone} isSelected={isSelected} className="hidden md:block w-36 sm:w-40" />
                <OpsTableCol label="Role" value={agent.role} isSelected={isSelected} className="hidden lg:block w-28 sm:w-32" />
                <OpsTableStatus
                  label={agent.status}
                  subText={agent.time}
                  isSelected={isSelected}
                  badgeClass={agent.active ? 'bg-[#2F6C0E] text-white' : 'bg-[#EF7129] text-white'}
                />
              </OpsTableRow>
            );
          })}
        </div>
      </div>

      {/* Pagination */}
      <div className="shrink-0 flex items-center justify-between pt-5 mt-4 border-t border-gray-100">
        <p className="text-[12px] text-gray-400">
          Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, AGENT_LIST_DATA.length)} of {AGENT_LIST_DATA.length}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft size={15} />
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-9 h-9 rounded-full text-[13px] font-bold transition-all ${p === currentPage ? 'bg-dash-dark text-white shadow-sm' : 'text-gray-400 hover:bg-gray-100'}`}
            >
              {p}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
            className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
          >
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </OpsTableContainer>
  );
}
