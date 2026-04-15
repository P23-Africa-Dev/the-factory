'use client';

import Link from 'next/link';
import { ArrowLeft, Search, SlidersHorizontal, BookmarkPlus, ChevronLeft, ChevronRight, MessageSquare, Map, Plus, MapPin } from 'lucide-react';
import { useState, useMemo } from 'react';
import { AddAgentModal } from '@/components/operations/add-agent-modal';

type Agent = {
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

const ALL_AGENTS: Agent[] = [
  { id: '1', name: 'Francis Nasyomba', description: 'Visit the Ikeja Computer village, and promote...', zone: 'Ikeja LGA', phone: '+234 803 4567890', role: 'Field Agent', status: 'Offline', time: '12 hours ago', avatar: 'https://i.pravatar.cc/150?u=1', active: false },
  { id: '2', name: 'Lade Wane', description: 'Visit the Ikeja Computer village, and promote...', zone: 'Ikeja LGA', phone: '+234 803 4567890', role: 'Field Agent', status: 'Active (View on Map)', time: 'Online', avatar: 'https://i.pravatar.cc/150?u=2', active: true },
  { id: '3', name: 'Francis Nasyomba', description: 'Visit the Ikeja Computer village, and promote...', zone: 'Ikeja LGA', phone: '+234 803 4567890', role: 'Field Agent', status: 'Offline', time: '12 hours ago', avatar: 'https://i.pravatar.cc/150?u=3', active: false },
  { id: '4', name: 'Amina Bello', description: 'Visit the Ikeja Computer village, and promote...', zone: 'Surulere LGA', phone: '+234 803 1234567', role: 'Field Agent', status: 'Active (View on Map)', time: 'Online', avatar: 'https://i.pravatar.cc/150?u=4', active: true },
  { id: '5', name: 'Chidi Okonkwo', description: 'Visit the Ikeja Computer village, and promote...', zone: 'Lekki LGA', phone: '+234 803 9876543', role: 'Senior Agent', status: 'Offline', time: '3 hours ago', avatar: 'https://i.pravatar.cc/150?u=5', active: false },
  { id: '6', name: 'Ngozi Eze', description: 'Visit the Ikeja Computer village, and promote...', zone: 'Victoria Island', phone: '+234 803 5551234', role: 'Field Agent', status: 'Offline', time: '1 day ago', avatar: 'https://i.pravatar.cc/150?u=6', active: false },
  { id: '7', name: 'Tunde Adeyemi', description: 'Cover the Yaba tech hub area and engage startups...', zone: 'Yaba LGA', phone: '+234 803 2223333', role: 'Senior Agent', status: 'Active (View on Map)', time: 'Online', avatar: 'https://i.pravatar.cc/150?u=7', active: true },
  { id: '8', name: 'Fatima Sule', description: 'Visit the Ikeja Computer village, and promote...', zone: 'Surulere LGA', phone: '+234 803 4445555', role: 'Field Agent', status: 'Offline', time: '5 hours ago', avatar: 'https://i.pravatar.cc/150?u=8', active: false },
  { id: '9', name: 'Emeka Obi', description: 'Cover the Oshodi market area and promote products...', zone: 'Oshodi LGA', phone: '+234 803 6667777', role: 'Field Agent', status: 'Offline', time: '2 days ago', avatar: 'https://i.pravatar.cc/150?u=9', active: false },
  { id: '10', name: 'Blessing Okafor', description: 'Visit the Ikeja Computer village, and promote...', zone: 'Ikeja LGA', phone: '+234 803 8889999', role: 'Senior Agent', status: 'Active (View on Map)', time: 'Online', avatar: 'https://i.pravatar.cc/150?u=10', active: true },
];

const ZONES = ['All Zones', ...Array.from(new Set(ALL_AGENTS.map((a) => a.zone)))];
const ROLES = ['All Roles', ...Array.from(new Set(ALL_AGENTS.map((a) => a.role)))];
const PAGE_SIZE = 5;

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function AgentDetailSidebar({ agent }: { agent: Agent }) {
  return (
    <div className="flex flex-col gap-5 w-full xl:w-90 xl:shrink-0">
      {/* Info */}
      <div>
        <div className="flex flex-col sm:flex-row xl:flex-col gap-6">
          <div className="flex sm:flex-row xl:flex-row items-start gap-6">
            <div className="flex-1 space-y-4 min-w-0">
              <div>
                <h3 className="text-[17px] font-bold text-dash-dark">{agent.name}</h3>
                <p className="text-[12px] text-gray-400 mt-1 leading-relaxed">{agent.description}</p>
              </div>
              <div>
                <p className="text-[13px] font-bold text-dash-dark mb-0.5">Zone</p>
                <p className="text-[13px] text-gray-400">{agent.zone}</p>
              </div>
              <div>
                <p className="text-[13px] font-bold text-dash-dark mb-0.5">Phone Number</p>
                <p className="text-[13px] text-gray-400">{agent.phone}</p>
              </div>
              <div>
                <p className="text-[13px] font-bold text-dash-dark mb-0.5">Role</p>
                <p className="text-[13px] text-gray-400">{agent.role}</p>
              </div>
            </div>
            <div className="shrink-0 w-36">
              <div className="w-36 h-36 rounded-3xl overflow-hidden shadow-lg bg-[#C9A84C]">
                <img src={agent.avatar} className="w-full h-full object-cover" alt={agent.name} />
              </div>
              <div className="mt-2 text-center">
                <p className="text-[12px] font-bold text-dash-dark">{agent.name}</p>
                <div className="flex items-center justify-center gap-1.5 mt-0.5">
                  <span className="text-[11px] text-gray-400">{agent.zone}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${agent.active ? 'bg-[#9D4EDD] text-white' : 'bg-gray-200 text-gray-500'}`}>
                    {agent.active ? 'Online' : 'Offline'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-center gap-3 mt-5">
          {[MessageSquare, Map, Plus].map((Icon, i) => (
            <button key={i} className="w-10 h-10 bg-white text-gray-400 rounded-full flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-100 shadow-sm">
              <Icon size={15} />
            </button>
          ))}
        </div>
      </div>

      {/* Live Details */}
      <div className="bg-dash-dark rounded-4xl p-6 shadow-2xl">
        <h3 className="text-[16px] font-bold text-white mb-4">Live Details</h3>
        <div className="relative h-44 w-full rounded-[18px] bg-[#e8ecef] overflow-hidden">
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-50">
            <defs>
              <pattern id="agpage-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#CBD5E1" strokeWidth="0.8" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#agpage-grid)" />
          </svg>
          <div className="absolute left-[28%] top-0 bottom-0 w-10 bg-white/60 pointer-events-none" />
          <div className="absolute top-[45%] left-0 right-0 h-8 bg-white/60 pointer-events-none" />
          <div className="absolute right-0 top-[30%] w-12 h-16 bg-[#A8D5B5]/60 pointer-events-none" />
          <div className="absolute pointer-events-none" style={{ left: '26%', top: 8 }}>
            <span className="text-[9px] font-semibold text-gray-600 block leading-tight">Dresd</span>
            <span className="text-[9px] font-semibold text-gray-600 block leading-tight">Street</span>
          </div>
          <div className="absolute right-2 top-[18%] pointer-events-none">
            <span className="text-[8px] font-semibold text-gray-500 block leading-tight">McDo</span>
            <span className="text-[8px] font-semibold text-gray-500 block leading-tight">ell Str</span>
          </div>
          <div className="absolute" style={{ left: '30%', top: '28%' }}>
            <MapPin size={20} className="text-red-500 fill-red-500 drop-shadow-md" />
          </div>
          <div className="absolute flex flex-col items-center" style={{ left: 'calc(30% - 14px)', top: '50%' }}>
            <div className="w-7 h-7 rounded-full border-2 border-white shadow-md overflow-hidden">
              <img src={agent.avatar} className="w-full h-full object-cover" alt="Agent" />
            </div>
            <div className="bg-white px-2 py-0.5 rounded-lg mt-1 whitespace-nowrap shadow-md">
              <p className="text-[8px] font-bold text-dash-dark">{agent.name}</p>
              <p className="text-[7px] text-gray-400">Active at Kemsi Street</p>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex rounded-full overflow-hidden h-3">
            <div className="w-[38%] bg-dash-teal" />
            <div className="w-[62%] bg-[#EF5350]" />
          </div>
          <div className="flex justify-between mt-1.5">
            <p className="text-[11px] text-gray-400">Completed</p>
            <p className="text-[11px] text-gray-400">Pending</p>
          </div>
        </div>
        <div className="mt-4">
          <button className={`px-5 py-2.5 rounded-full text-[12px] font-bold hover:opacity-90 transition-all inline-flex items-center gap-2 ${agent.active ? 'bg-[#9D4EDD] text-white' : 'bg-gray-600 text-white'}`}>
            {agent.active ? 'Active (View on Map)' : 'Offline'}
            {agent.active && <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
          </button>
          <p className="text-[11px] text-gray-500 mt-2">{agent.time}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────
function AgentRow({ agent, isSelected, onClick }: { agent: Agent; isSelected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center rounded-[20px] overflow-hidden cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'bg-dash-dark' : 'bg-gray-50/60'
      }`}
    >
      <div className={`w-2 self-stretch shrink-0 ${isSelected ? 'bg-[#3B82F6]' : 'bg-[#93C5FD]/60'}`} />

      <div className="w-12 h-12 rounded-full border-2 border-white shadow-sm overflow-hidden shrink-0 my-4 mx-3 sm:mx-4">
        <img src={agent.avatar} className="w-full h-full object-cover" alt={agent.name} />
      </div>

      {/* Name */}
      <div className="w-32.5 sm:w-40 shrink-0 py-4 pr-3 min-w-0">
        <p className={`text-[13px] font-bold truncate ${isSelected ? 'text-white' : 'text-dash-dark'}`}>{agent.name}</p>
        <p className={`text-[11px] mt-0.5 truncate ${isSelected ? 'text-white/50' : 'text-gray-400'}`}>{agent.description}</p>
      </div>

      {/* Zone */}
      <div className="hidden sm:block w-27.5 shrink-0 py-4 pr-3">
        <p className={`text-[11px] font-bold mb-0.5 ${isSelected ? 'text-white/40' : 'text-gray-400'}`}>Zone</p>
        <p className={`text-[13px] font-medium truncate ${isSelected ? 'text-white/80' : 'text-gray-600'}`}>{agent.zone}</p>
      </div>

      {/* Phone */}
      <div className="hidden md:block w-37.5 shrink-0 py-4 pr-3">
        <p className={`text-[11px] font-bold mb-0.5 ${isSelected ? 'text-white/40' : 'text-gray-400'}`}>Phone Number</p>
        <p className={`text-[13px] font-medium truncate ${isSelected ? 'text-white/80' : 'text-gray-600'}`}>{agent.phone}</p>
      </div>

      {/* Role */}
      <div className="hidden lg:block w-27.5 shrink-0 py-4 pr-3">
        <p className={`text-[11px] font-bold mb-0.5 ${isSelected ? 'text-white/40' : 'text-gray-400'}`}>Role</p>
        <p className={`text-[13px] font-medium truncate ${isSelected ? 'text-white/80' : 'text-gray-600'}`}>{agent.role}</p>
      </div>

      {/* Status */}
      <div className="ml-auto shrink-0 text-right py-4 pr-4 sm:pr-5">
        <div className={`inline-block px-2.5 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${agent.active ? 'bg-[#D63384] text-white' : 'bg-[#FF9F6A] text-white'}`}>
          {agent.status}
        </div>
        <p className={`text-[11px] mt-1 ${isSelected ? 'text-white/40' : 'text-gray-400'}`}>{agent.time}</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AllAgentsPage() {
  const [search, setSearch]           = useState('');
  const [zoneFilter, setZoneFilter]   = useState('All Zones');
  const [roleFilter, setRoleFilter]   = useState('All Roles');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'offline'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage]               = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent>(ALL_AGENTS[0]);

  const filtered = useMemo(() => {
    return ALL_AGENTS.filter((a) => {
      const matchesSearch =
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.zone.toLowerCase().includes(search.toLowerCase()) ||
        a.phone.includes(search);
      const matchesZone   = zoneFilter === 'All Zones' || a.zone === zoneFilter;
      const matchesRole   = roleFilter === 'All Roles' || a.role === roleFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && a.active) ||
        (statusFilter === 'offline' && !a.active);
      return matchesSearch && matchesZone && matchesRole && matchesStatus;
    });
  }, [search, zoneFilter, roleFilter, statusFilter]);

  const totalPages   = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage  = Math.min(page, totalPages);
  const paginated    = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSearch = (val: string) => { setSearch(val); setPage(1); };
  const handleFilter = (key: 'zone' | 'role' | 'status', val: string) => {
    if (key === 'zone')   setZoneFilter(val);
    if (key === 'role')   setRoleFilter(val);
    if (key === 'status') setStatusFilter(val as 'all' | 'active' | 'offline');
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="max-w-350 mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/operations?tab=agent" className="flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-sm hover:shadow-md transition-all">
              <ArrowLeft size={18} className="text-dash-dark" />
            </Link>
            <div>
              <h1 className="text-[22px] font-bold text-dash-dark">All Agents</h1>
              <p className="text-[13px] text-gray-400 mt-0.5">{filtered.length} agents found</p>
            </div>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2 px-4 sm:px-6 py-3 bg-[#09232D] text-white rounded-xl text-[13px] font-bold hover:opacity-90 transition-all shadow-lg shrink-0 cursor-pointer"
          >
            <span>Add New Agent</span>
            <BookmarkPlus size={16} />
          </button>
        </div>

        {/* Search + Filter Bar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-dash-teal transition-colors" size={17} />
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by name, zone or phone..."
              className="w-full bg-white border border-gray-100 rounded-full py-3.5 pl-12 pr-5 text-[13px] outline-none focus:ring-2 focus:ring-dash-teal/20 transition-all shadow-sm"
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 px-5 py-3.5 rounded-full text-[13px] font-bold transition-all shadow-sm border ${
              showFilters ? 'bg-dash-dark text-white border-dash-dark' : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal size={14} />
            <span>Filter</span>
          </button>
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="flex flex-wrap gap-3 mb-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-400 px-1">Zone</label>
              <select value={zoneFilter} onChange={(e) => handleFilter('zone', e.target.value)} className="bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-[13px] font-medium text-dash-dark outline-none cursor-pointer">
                {ZONES.map((z) => <option key={z}>{z}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-400 px-1">Role</label>
              <select value={roleFilter} onChange={(e) => handleFilter('role', e.target.value)} className="bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-[13px] font-medium text-dash-dark outline-none cursor-pointer">
                {ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-400 px-1">Status</label>
              <div className="flex gap-1">
                {(['all', 'active', 'offline'] as const).map((s) => (
                  <button key={s} onClick={() => handleFilter('status', s)}
                    className={`px-4 py-2 rounded-full text-[12px] font-bold capitalize transition-all ${
                      statusFilter === s ? 'bg-dash-dark text-white' : 'bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100'
                    }`}>
                    {s === 'all' ? 'All' : s === 'active' ? 'Online' : 'Offline'}
                  </button>
                ))}
              </div>
            </div>
            {(zoneFilter !== 'All Zones' || roleFilter !== 'All Roles' || statusFilter !== 'all') && (
              <div className="flex flex-col justify-end">
                <button onClick={() => { setZoneFilter('All Zones'); setRoleFilter('All Roles'); setStatusFilter('all'); setPage(1); }}
                  className="px-4 py-2 rounded-full text-[12px] font-bold text-red-400 hover:bg-red-50 transition-all border border-red-200">
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* List + Sidebar */}
        <div className="flex flex-col xl:flex-row gap-6">

          {/* List */}
          <div className="flex-1 min-w-0 bg-white rounded-4xl p-5 sm:p-8 shadow-sm">
            {paginated.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-[14px] font-medium">No agents match your search.</div>
            ) : (
              <div className="space-y-3">
                {paginated.map((agent) => (
                  <AgentRow
                    key={agent.id}
                    agent={agent}
                    isSelected={selectedAgent.id === agent.id}
                    onClick={() => setSelectedAgent(agent)}
                  />
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6 pt-5 border-t border-gray-100">
                <p className="text-[12px] text-gray-400">
                  Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}
                    className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    <ChevronLeft size={15} />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                    <button key={p} onClick={() => setPage(p)}
                      className={`w-9 h-9 rounded-full text-[13px] font-bold transition-all ${p === currentPage ? 'bg-dash-dark text-white shadow-sm' : 'text-gray-400 hover:bg-gray-100'}`}>
                      {p}
                    </button>
                  ))}
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                    className="flex items-center justify-center w-9 h-9 rounded-full border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all">
                    <ChevronRight size={15} />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <AgentDetailSidebar agent={selectedAgent} />
        </div>
      </div>

      {showAddModal && <AddAgentModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
