'use client';

import Link from 'next/link';

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
    <div className="bg-white rounded-4xl p-5 sm:p-8 shadow-sm flex-1 min-w-0">
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
            <div
              key={agent.id}
              onClick={() => onSelect?.(agent)}
              className={`flex items-center rounded-[20px] overflow-hidden cursor-pointer transition-all hover:shadow-md ${
                isSelected ? 'bg-dash-dark' : 'bg-gray-50/60'
              }`}
            >
              {/* Accent bar */}
              <div className={`w-2 self-stretch shrink-0 ${isSelected ? 'bg-[#3B82F6]' : 'bg-[#93C5FD]/60'}`} />

              {/* Avatar */}
              <div className="w-12 h-12 rounded-full border-2 border-white shadow-sm overflow-hidden shrink-0 my-4 mx-3 sm:mx-4">
                <img src={agent.avatar} className="w-full h-full object-cover" alt={agent.name} />
              </div>

              {/* Name — fixed width */}
              <div className="w-32.5 sm:w-40 shrink-0 py-4 pr-3 min-w-0">
                <p className={`text-[13px] font-bold truncate ${isSelected ? 'text-white' : 'text-dash-dark'}`}>
                  {agent.name}
                </p>
                <p className={`text-[11px] mt-0.5 truncate ${isSelected ? 'text-white/50' : 'text-gray-400'}`}>
                  {agent.description}
                </p>
              </div>

              {/* Zone — fixed width */}
              <div className="hidden sm:block w-27.5 shrink-0 py-4 pr-3">
                <p className={`text-[11px] font-bold mb-0.5 ${isSelected ? 'text-white/40' : 'text-gray-400'}`}>Zone</p>
                <p className={`text-[13px] font-medium truncate ${isSelected ? 'text-white/80' : 'text-gray-600'}`}>
                  {agent.zone}
                </p>
              </div>

              {/* Phone — fixed width */}
              <div className="hidden md:block w-37.5 shrink-0 py-4 pr-3">
                <p className={`text-[11px] font-bold mb-0.5 ${isSelected ? 'text-white/40' : 'text-gray-400'}`}>Phone Number</p>
                <p className={`text-[13px] font-medium truncate ${isSelected ? 'text-white/80' : 'text-gray-600'}`}>
                  {agent.phone}
                </p>
              </div>

              {/* Role — fixed width */}
              <div className="hidden lg:block w-27.5 shrink-0 py-4 pr-3">
                <p className={`text-[11px] font-bold mb-0.5 ${isSelected ? 'text-white/40' : 'text-gray-400'}`}>Role</p>
                <p className={`text-[13px] font-medium truncate ${isSelected ? 'text-white/80' : 'text-gray-600'}`}>
                  {agent.role}
                </p>
              </div>

              {/* Status — push to right */}
              <div className="ml-auto shrink-0 text-right py-4 pr-4 sm:pr-5">
                <div className={`inline-block px-2.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${
                  agent.active ? 'bg-[#D63384] text-white' : 'bg-[#FF9F6A] text-white'
                }`}>
                  {agent.status}
                </div>
                <p className={`text-[11px] mt-1 ${isSelected ? 'text-white/40' : 'text-gray-400'}`}>
                  {agent.time}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
