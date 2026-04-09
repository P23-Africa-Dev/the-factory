'use client';

import Link from 'next/link';
import { ArrowLeft, Search, SlidersHorizontal, BookmarkPlus, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useMemo } from 'react';
import { AddAgentModal } from '@/components/operations/add-agent-modal';

const ALL_AGENTS = [
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
  {
    id: '4',
    name: 'Amina Bello',
    description: 'Visit the Ikeja Computer village, and promote...',
    zone: 'Surulere LGA',
    phone: '+234 803 1234567',
    role: 'Field Agent',
    status: 'Active (View on Map)',
    time: 'Online',
    avatar: 'https://i.pravatar.cc/150?u=4',
    active: true,
  },
  {
    id: '5',
    name: 'Chidi Okonkwo',
    description: 'Visit the Ikeja Computer village, and promote...',
    zone: 'Lekki LGA',
    phone: '+234 803 9876543',
    role: 'Senior Agent',
    status: 'Offline',
    time: '3 hours ago',
    avatar: 'https://i.pravatar.cc/150?u=5',
    active: false,
  },
  {
    id: '6',
    name: 'Ngozi Eze',
    description: 'Visit the Ikeja Computer village, and promote...',
    zone: 'Victoria Island',
    phone: '+234 803 5551234',
    role: 'Field Agent',
    status: 'Offline',
    time: '1 day ago',
    avatar: 'https://i.pravatar.cc/150?u=6',
    active: false,
  },
  {
    id: '7',
    name: 'Tunde Adeyemi',
    description: 'Cover the Yaba tech hub area and engage startups...',
    zone: 'Yaba LGA',
    phone: '+234 803 2223333',
    role: 'Senior Agent',
    status: 'Active (View on Map)',
    time: 'Online',
    avatar: 'https://i.pravatar.cc/150?u=7',
    active: true,
  },
  {
    id: '8',
    name: 'Fatima Sule',
    description: 'Visit the Ikeja Computer village, and promote...',
    zone: 'Surulere LGA',
    phone: '+234 803 4445555',
    role: 'Field Agent',
    status: 'Offline',
    time: '5 hours ago',
    avatar: 'https://i.pravatar.cc/150?u=8',
    active: false,
  },
  {
    id: '9',
    name: 'Emeka Obi',
    description: 'Cover the Oshodi market area and promote products...',
    zone: 'Oshodi LGA',
    phone: '+234 803 6667777',
    role: 'Field Agent',
    status: 'Offline',
    time: '2 days ago',
    avatar: 'https://i.pravatar.cc/150?u=9',
    active: false,
  },
  {
    id: '10',
    name: 'Blessing Okafor',
    description: 'Visit the Ikeja Computer village, and promote...',
    zone: 'Ikeja LGA',
    phone: '+234 803 8889999',
    role: 'Senior Agent',
    status: 'Active (View on Map)',
    time: 'Online',
    avatar: 'https://i.pravatar.cc/150?u=10',
    active: true,
  },
];

const ZONES = ['All Zones', ...Array.from(new Set(ALL_AGENTS.map((a) => a.zone)))];
const ROLES = ['All Roles', ...Array.from(new Set(ALL_AGENTS.map((a) => a.role)))];
const PAGE_SIZE = 5;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AllAgentsPage() {
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('All Zones');
  const [roleFilter, setRoleFilter] = useState('All Roles');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'offline'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);

  const filtered = useMemo(() => {
    return ALL_AGENTS.filter((a) => {
      const matchesSearch =
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.zone.toLowerCase().includes(search.toLowerCase()) ||
        a.phone.includes(search);
      const matchesZone = zoneFilter === 'All Zones' || a.zone === zoneFilter;
      const matchesRole = roleFilter === 'All Roles' || a.role === roleFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' && a.active) ||
        (statusFilter === 'offline' && !a.active);
      return matchesSearch && matchesZone && matchesRole && matchesStatus;
    });
  }, [search, zoneFilter, roleFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleSearch = (val: string) => { setSearch(val); setPage(1); };
  const handleFilter = (key: 'zone' | 'role' | 'status', val: string) => {
    if (key === 'zone') setZoneFilter(val);
    if (key === 'role') setRoleFilter(val);
    if (key === 'status') setStatusFilter(val as 'all' | 'active' | 'offline');
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="max-w-[1200px] mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/operations?tab=agent"
              className="flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-sm hover:shadow-md transition-all"
            >
              <ArrowLeft size={18} className="text-dash-dark" />
            </Link>
            <div>
              <h1 className="text-[22px] font-bold text-dash-dark">All Agents</h1>
              <p className="text-[13px] text-gray-400 mt-0.5">{filtered.length} agents found</p>
            </div>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-2.5 px-6 py-3 bg-dash-dark text-white rounded-full text-[13px] font-bold hover:opacity-90 transition-all shadow-lg"
          >
            <span>Add New Agent</span>
            <BookmarkPlus size={16} />
          </button>
        </div>

        {/* Search + Filter Bar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 group">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-dash-teal transition-colors"
              size={17}
            />
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
              showFilters
                ? 'bg-dash-dark text-white border-dash-dark'
                : 'bg-white text-gray-500 border-gray-100 hover:bg-gray-50'
            }`}
          >
            <SlidersHorizontal size={14} />
            <span>Filter</span>
          </button>
        </div>

        {/* Filter Dropdowns */}
        {showFilters && (
          <div className="flex flex-wrap gap-3 mb-4 p-4 bg-white rounded-2xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-400 px-1">Zone</label>
              <select
                value={zoneFilter}
                onChange={(e) => handleFilter('zone', e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-[13px] font-medium text-dash-dark outline-none focus:ring-2 focus:ring-dash-teal/20 cursor-pointer"
              >
                {ZONES.map((z) => <option key={z}>{z}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-400 px-1">Role</label>
              <select
                value={roleFilter}
                onChange={(e) => handleFilter('role', e.target.value)}
                className="bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-[13px] font-medium text-dash-dark outline-none focus:ring-2 focus:ring-dash-teal/20 cursor-pointer"
              >
                {ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-bold text-gray-400 px-1">Status</label>
              <div className="flex gap-1">
                {(['all', 'active', 'offline'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleFilter('status', s)}
                    className={`px-4 py-2 rounded-full text-[12px] font-bold capitalize transition-all ${
                      statusFilter === s
                        ? 'bg-dash-dark text-white'
                        : 'bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    {s === 'all' ? 'All' : s === 'active' ? 'Online' : 'Offline'}
                  </button>
                ))}
              </div>
            </div>

            {(zoneFilter !== 'All Zones' || roleFilter !== 'All Roles' || statusFilter !== 'all') && (
              <div className="flex flex-col justify-end">
                <button
                  onClick={() => { setZoneFilter('All Zones'); setRoleFilter('All Roles'); setStatusFilter('all'); setPage(1); }}
                  className="px-4 py-2 rounded-full text-[12px] font-bold text-red-400 hover:bg-red-50 transition-all border border-red-200"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* Agent List */}
        <div className="bg-white rounded-4xl p-5 sm:p-8 shadow-sm">
          {paginated.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-[14px] font-medium">
              No agents match your search.
            </div>
          ) : (
            <div className="space-y-3">
              {paginated.map((agent) => (
                <div
                  key={agent.id}
                  className={`flex items-center gap-3 sm:gap-5 rounded-[20px] pr-4 sm:pr-5 overflow-hidden cursor-pointer transition-all hover:shadow-md ${
                    agent.active ? 'bg-dash-dark' : 'bg-gray-50/60'
                  }`}
                >
                  <div className={`w-2 self-stretch shrink-0 rounded-l-[20px] ${agent.active ? 'bg-[#3B82F6]' : 'bg-[#93C5FD]/60'}`} />

                  <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full border-2 border-white shadow-sm overflow-hidden shrink-0 my-4">
                    <img src={agent.avatar} className="w-full h-full object-cover" alt={agent.name} />
                  </div>

                  <div className="min-w-0 flex-1 sm:flex-none sm:w-36 lg:w-40 py-4">
                    <p className={`text-[13px] sm:text-[14px] font-bold truncate ${agent.active ? 'text-white' : 'text-dash-dark'}`}>{agent.name}</p>
                    <p className={`text-[10px] sm:text-[11px] mt-0.5 truncate ${agent.active ? 'text-white/50' : 'text-gray-400'}`}>{agent.description}</p>
                  </div>

                  <div className="hidden sm:block flex-1 min-w-0 py-4">
                    <p className={`text-[11px] font-bold mb-0.5 ${agent.active ? 'text-white/40' : 'text-gray-400'}`}>Zone</p>
                    <p className={`text-[13px] font-medium truncate ${agent.active ? 'text-white/80' : 'text-gray-600'}`}>{agent.zone}</p>
                  </div>

                  <div className="hidden md:block flex-1 min-w-0 py-4">
                    <p className={`text-[11px] font-bold mb-0.5 ${agent.active ? 'text-white/40' : 'text-gray-400'}`}>Phone Number</p>
                    <p className={`text-[13px] font-medium truncate ${agent.active ? 'text-white/80' : 'text-gray-600'}`}>{agent.phone}</p>
                  </div>

                  <div className="hidden lg:block flex-1 min-w-0 py-4">
                    <p className={`text-[11px] font-bold mb-0.5 ${agent.active ? 'text-white/40' : 'text-gray-400'}`}>Role</p>
                    <p className={`text-[13px] font-medium truncate ${agent.active ? 'text-white/80' : 'text-gray-600'}`}>{agent.role}</p>
                  </div>

                  <div className="shrink-0 text-right py-4">
                    <div className={`inline-block px-2.5 sm:px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-bold whitespace-nowrap ${agent.active ? 'bg-[#D63384] text-white' : 'bg-[#FF9F6A] text-white'}`}>
                      {agent.status}
                    </div>
                    <p className={`text-[10px] sm:text-[11px] mt-1 ${agent.active ? 'text-white/40' : 'text-gray-400'}`}>{agent.time}</p>
                  </div>
                </div>
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
                    className={`w-9 h-9 rounded-full text-[13px] font-bold transition-all ${
                      p === currentPage ? 'bg-dash-dark text-white shadow-sm' : 'text-gray-400 hover:bg-gray-100'
                    }`}
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
          )}
        </div>
      </div>

      {/* Add Agent Modal */}
      {showAddModal && <AddAgentModal onClose={() => setShowAddModal(false)} />}
    </div>
  );
}
