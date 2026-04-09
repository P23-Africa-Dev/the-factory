'use client';

import Link from 'next/link';

const agents = [
  {
    id: '1',
    name: 'Francis Nasyomba',
    description: 'Visit the Ikeja Computer village, and promote...',
    zone: 'Ikeja LGA',
    phone: '+234 803 4567890',
    role: 'Field Agent',
    status: 'Offline',
    time: '12 hours ago',
    avatar: 'https://i.pravatar.cc/150?u=1',
    active: false,
  },
  {
    id: '2',
    name: 'Lade Wane',
    description: 'Visit the Ikeja Computer village, and promote...',
    zone: 'Ikeja LGA',
    phone: '+234 803 4567890',
    role: 'Field Agent',
    status: 'Active (View on Map)',
    time: 'Online',
    avatar: 'https://i.pravatar.cc/150?u=2',
    active: true,
  },
  {
    id: '3',
    name: 'Francis Nasyomba',
    description: 'Visit the Ikeja Computer village, and promote...',
    zone: 'Ikeja LGA',
    phone: '+234 803 4567890',
    role: 'Field Agent',
    status: 'Offline',
    time: '12 hours ago',
    avatar: 'https://i.pravatar.cc/150?u=3',
    active: false,
  },
];

export function AgentList() {
  return (
    <div className="bg-white rounded-4xl p-5 sm:p-8 shadow-sm flex-1 min-w-0">
      {/* Header */}
      <div className="flex justify-end mb-5">
        <Link href="/operations/agents" className="px-5 py-2 bg-dash-dark text-white rounded-full text-[12px] font-semibold hover:opacity-90 transition-colors">
          View all Agents
        </Link>
      </div>

      {/* Agent Rows */}
      <div className="space-y-3">
        {agents.map((agent) => (
          <div
            key={agent.id}
            className={`flex items-center gap-3 sm:gap-5 rounded-[20px] pr-4 sm:pr-5 overflow-hidden cursor-pointer transition-all hover:shadow-md ${
              agent.active ? 'bg-dash-dark' : 'bg-gray-50/60'
            }`}
          >
            {/* Left accent bar */}
            <div
              className={`w-2 self-stretch shrink-0 rounded-l-[20px] ${
                agent.active ? 'bg-[#3B82F6]' : 'bg-[#93C5FD]/60'
              }`}
            />

            {/* Avatar */}
            <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full border-2 border-white shadow-sm overflow-hidden shrink-0 my-4">
              <img src={agent.avatar} className="w-full h-full object-cover" alt={agent.name} />
            </div>

            {/* Name + description — always visible */}
            <div className="min-w-0 flex-1 sm:flex-none sm:w-36 lg:w-40 py-4">
              <p className={`text-[13px] sm:text-[14px] font-bold truncate ${agent.active ? 'text-white' : 'text-dash-dark'}`}>
                {agent.name}
              </p>
              <p className={`text-[10px] sm:text-[11px] mt-0.5 truncate ${agent.active ? 'text-white/50' : 'text-gray-400'}`}>
                {agent.description}
              </p>
            </div>

            {/* Zone — hidden on mobile, visible sm+ */}
            <div className="hidden sm:block flex-1 min-w-0 py-4">
              <p className={`text-[11px] font-bold mb-0.5 ${agent.active ? 'text-white/40' : 'text-gray-400'}`}>Zone</p>
              <p className={`text-[13px] font-medium truncate ${agent.active ? 'text-white/80' : 'text-gray-600'}`}>
                {agent.zone}
              </p>
            </div>

            {/* Phone — hidden on mobile and sm, visible md+ */}
            <div className="hidden md:block flex-1 min-w-0 py-4">
              <p className={`text-[11px] font-bold mb-0.5 ${agent.active ? 'text-white/40' : 'text-gray-400'}`}>Phone Number</p>
              <p className={`text-[13px] font-medium truncate ${agent.active ? 'text-white/80' : 'text-gray-600'}`}>
                {agent.phone}
              </p>
            </div>

            {/* Role — hidden below lg */}
            <div className="hidden lg:block flex-1 min-w-0 py-4">
              <p className={`text-[11px] font-bold mb-0.5 ${agent.active ? 'text-white/40' : 'text-gray-400'}`}>Role</p>
              <p className={`text-[13px] font-medium truncate ${agent.active ? 'text-white/80' : 'text-gray-600'}`}>
                {agent.role}
              </p>
            </div>

            {/* Status — always visible */}
            <div className="shrink-0 text-right py-4">
              <div
                className={`inline-block px-2.5 sm:px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-bold whitespace-nowrap ${
                  agent.active ? 'bg-[#D63384] text-white' : 'bg-[#FF9F6A] text-white'
                }`}
              >
                {agent.status}
              </div>
              <p className={`text-[10px] sm:text-[11px] mt-1 ${agent.active ? 'text-white/40' : 'text-gray-400'}`}>
                {agent.time}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
