'use client';

import Link from 'next/link';
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
  {
    id: '1', name: 'Francis Nasyomba',
    description: 'Visit the Ikeja Computer village, and promote...',
    zone: 'Ikeja LGA', phone: '+234 803 4567890', role: 'Field Agent',
    status: 'Offline', time: '12 hours ago',
    avatar: 'https://i.pravatar.cc/150?u=1', active: false,
  },
  {
    id: '2', name: 'Lade Wane',
    description: 'Visit the Ikeja Computer village, and promote...',
    zone: 'Ikeja LGA', phone: '+234 803 4567890', role: 'Field Agent',
    status: 'Active (View on Map)', time: 'Online',
    avatar: 'https://i.pravatar.cc/150?u=2', active: true,
  },
  {
    id: '3', name: 'Francis Nasyomba',
    description: 'Visit the Ikeja Computer village, and promote...',
    zone: 'Ikeja LGA', phone: '+234 803 4567890', role: 'Field Agent',
    status: 'Offline', time: '12 hours ago',
    avatar: 'https://i.pravatar.cc/150?u=3', active: false,
  },
];

interface AgentListProps {
  selectedId?: string;
  onSelect?: (agent: AgentItem) => void;
}

export function AgentList({ selectedId, onSelect }: AgentListProps) {
  return (
    <OpsTableContainer>
      {/* Header */}
      <div className="flex justify-end mb-5">
        <Link
          href="/operations/agents"
          className="px-5 py-2 bg-dash-dark text-white rounded-full text-[12px] font-semibold hover:opacity-90 transition-colors"
        >
          View all Agents
        </Link>
      </div>

      {/* Rows */}
      <div className="space-y-3">
        {AGENT_LIST_DATA.map((agent) => {
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
    </OpsTableContainer>
  );
}
