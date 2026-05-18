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

const PAGE_SIZE = 4;

interface AgentListProps {
  agents: AgentItem[];
  selectedId?: string;
  onSelect?: (agent: AgentItem) => void;
}

export function AgentList({ agents, selectedId, onSelect, basePath }: AgentListProps & { basePath: string }) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(agents.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = agents.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <OpsTableContainer className="grow-0 flex flex-col h-140">
      {/* Header */}
      <div className="flex justify-end mb-5 shrink-0">
        <Link
          href={`${basePath}/operations/agents`}
          className="px-5 py-2 bg-dash-dark text-white rounded-full text-[12px] font-semibold hover:opacity-90 transition-colors"
        >
          View all Agents
        </Link>
      </div>

      {/* Scrollable rows */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {agents.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[13px] text-gray-400">
            No agents found.
          </div>
        ) : (
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
        )}
      </div>

      {/* Pagination */}
      <div className="shrink-0 flex items-center justify-between pt-5 mt-4 border-t border-gray-100">
        <p className="text-[12px] text-gray-400">
          {agents.length === 0
            ? "Showing 0 of 0"
            : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, agents.length)} of ${agents.length}`}
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
