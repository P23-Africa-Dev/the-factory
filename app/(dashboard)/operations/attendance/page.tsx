'use client';

import Link from 'next/link';
import { ArrowLeft, Search, SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useMemo } from 'react';

const ALL_ATTENDANCE = [
  {
    id: '1',
    name: 'Francis Nasyomba',
    address: '12 Oba Akran Avenue, Ikeja, Lagos',
    checkIn: 'No check-in record',
    checkOut: 'No check-out record',
    role: 'Field Agent',
    zone: 'Ikeja LGA',
    status: 'Absent',
    subText: 'Since Yesterday',
    active: false,
    avatar: 'https://i.pravatar.cc/150?u=11',
  },
  {
    id: '2',
    name: 'Lade Wane',
    address: '12 Oba Akran Avenue, Ikeja, Lagos',
    checkIn: '8:25AM',
    checkOut: 'Still Active',
    role: 'Field Agent',
    zone: 'Ikeja LGA',
    status: 'Present',
    subText: 'Active',
    active: true,
    avatar: 'https://i.pravatar.cc/150?u=12',
  },
  {
    id: '3',
    name: 'Amina Bello',
    address: '45 Adeniran Ogunsanya, Surulere, Lagos',
    checkIn: 'No check-in record',
    checkOut: 'No check-out record',
    role: 'Field Agent',
    zone: 'Surulere LGA',
    status: 'Absent',
    subText: 'Since Yesterday',
    active: false,
    avatar: 'https://i.pravatar.cc/150?u=13',
  },
  {
    id: '4',
    name: 'Chidi Okonkwo',
    address: '3 Admiralty Way, Lekki Phase 1, Lagos',
    checkIn: '9:10AM',
    checkOut: '5:00PM',
    role: 'Senior Agent',
    zone: 'Lekki LGA',
    status: 'Present',
    subText: 'Checked Out',
    active: false,
    avatar: 'https://i.pravatar.cc/150?u=14',
  },
  {
    id: '5',
    name: 'Ngozi Eze',
    address: '7 Ozumba Mbadiwe, Victoria Island, Lagos',
    checkIn: 'No check-in record',
    checkOut: 'No check-out record',
    role: 'Field Agent',
    zone: 'Victoria Island',
    status: 'Absent',
    subText: '1 day ago',
    active: false,
    avatar: 'https://i.pravatar.cc/150?u=15',
  },
  {
    id: '6',
    name: 'Tunde Adeyemi',
    address: '22 Herbert Macaulay Way, Yaba, Lagos',
    checkIn: '7:58AM',
    checkOut: 'Still Active',
    role: 'Senior Agent',
    zone: 'Yaba LGA',
    status: 'Present',
    subText: 'Active',
    active: true,
    avatar: 'https://i.pravatar.cc/150?u=16',
  },
  {
    id: '7',
    name: 'Fatima Sule',
    address: '45 Adeniran Ogunsanya, Surulere, Lagos',
    checkIn: 'No check-in record',
    checkOut: 'No check-out record',
    role: 'Field Agent',
    zone: 'Surulere LGA',
    status: 'Absent',
    subText: '5 hours ago',
    active: false,
    avatar: 'https://i.pravatar.cc/150?u=17',
  },
  {
    id: '8',
    name: 'Emeka Obi',
    address: 'Oshodi Market Road, Oshodi, Lagos',
    checkIn: '8:45AM',
    checkOut: '4:30PM',
    role: 'Field Agent',
    zone: 'Oshodi LGA',
    status: 'Present',
    subText: 'Checked Out',
    active: false,
    avatar: 'https://i.pravatar.cc/150?u=18',
  },
  {
    id: '9',
    name: 'Blessing Okafor',
    address: '12 Oba Akran Avenue, Ikeja, Lagos',
    checkIn: '8:00AM',
    checkOut: 'Still Active',
    role: 'Senior Agent',
    zone: 'Ikeja LGA',
    status: 'Present',
    subText: 'Active',
    active: true,
    avatar: 'https://i.pravatar.cc/150?u=19',
  },
  {
    id: '10',
    name: 'Abdul Kareem',
    address: '3 Admiralty Way, Lekki Phase 1, Lagos',
    checkIn: 'No check-in record',
    checkOut: 'No check-out record',
    role: 'Field Agent',
    zone: 'Lekki LGA',
    status: 'Absent',
    subText: 'Since Yesterday',
    active: false,
    avatar: 'https://i.pravatar.cc/150?u=20',
  },
];

const ZONES = ['All Zones', ...Array.from(new Set(ALL_ATTENDANCE.map((a) => a.zone)))];
const PAGE_SIZE = 5;

export default function AttendanceListPage() {
  const [search, setSearch] = useState('');
  const [zoneFilter, setZoneFilter] = useState('All Zones');
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'absent'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return ALL_ATTENDANCE.filter((a) => {
      const matchesSearch =
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.zone.toLowerCase().includes(search.toLowerCase()) ||
        a.address.toLowerCase().includes(search.toLowerCase());
      const matchesZone = zoneFilter === 'All Zones' || a.zone === zoneFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'present' && a.status === 'Present') ||
        (statusFilter === 'absent' && a.status === 'Absent');
      return matchesSearch && matchesZone && matchesStatus;
    });
  }, [search, zoneFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const presentCount = ALL_ATTENDANCE.filter((a) => a.status === 'Present').length;
  const absentCount = ALL_ATTENDANCE.filter((a) => a.status === 'Absent').length;

  const handleSearch = (val: string) => { setSearch(val); setPage(1); };
  const handleFilter = (key: 'zone' | 'status', val: string) => {
    if (key === 'zone') setZoneFilter(val);
    if (key === 'status') setStatusFilter(val as 'all' | 'present' | 'absent');
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="max-w-[1200px] mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link
            href="/operations?tab=attendance"
            className="flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-sm hover:shadow-md transition-all"
          >
            <ArrowLeft size={18} className="text-dash-dark" />
          </Link>
          <div>
            <h1 className="text-[22px] font-bold text-dash-dark">Attendance List</h1>
            <p className="text-[13px] text-gray-400 mt-0.5">{filtered.length} records found</p>
          </div>
        </div>

        {/* Stat Pills */}
        <div className="flex gap-3 mb-6">
          <div className="flex items-center gap-2.5 bg-white rounded-full px-5 py-2.5 shadow-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-[#4ADE80] shrink-0" />
            <span className="text-[13px] font-bold text-dash-dark">{presentCount}</span>
            <span className="text-[12px] text-gray-400">Present</span>
          </div>
          <div className="flex items-center gap-2.5 bg-white rounded-full px-5 py-2.5 shadow-sm">
            <span className="w-2.5 h-2.5 rounded-full bg-[#F48243] shrink-0" />
            <span className="text-[13px] font-bold text-dash-dark">{absentCount}</span>
            <span className="text-[12px] text-gray-400">Absent</span>
          </div>
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
              placeholder="Search by name, zone or address..."
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

        {/* Filter Panel */}
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
              <label className="text-[11px] font-bold text-gray-400 px-1">Status</label>
              <div className="flex gap-1">
                {(['all', 'present', 'absent'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => handleFilter('status', s)}
                    className={`px-4 py-2 rounded-full text-[12px] font-bold capitalize transition-all ${
                      statusFilter === s
                        ? 'bg-dash-dark text-white'
                        : 'bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100'
                    }`}
                  >
                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {(zoneFilter !== 'All Zones' || statusFilter !== 'all') && (
              <div className="flex flex-col justify-end">
                <button
                  onClick={() => { setZoneFilter('All Zones'); setStatusFilter('all'); setPage(1); }}
                  className="px-4 py-2 rounded-full text-[12px] font-bold text-red-400 hover:bg-red-50 transition-all border border-red-200"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}

        {/* Attendance Table */}
        <div className="bg-white rounded-4xl p-5 sm:p-8 shadow-sm">
          {paginated.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-[14px] font-medium">
              No records match your search.
            </div>
          ) : (
            <div className="space-y-3">
              {paginated.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 sm:gap-5 rounded-[20px] pr-4 sm:pr-5 overflow-hidden cursor-pointer transition-all hover:shadow-md ${
                    item.active ? 'bg-dash-dark' : 'bg-gray-50/60'
                  }`}
                >
                  {/* Left accent */}
                  <div className={`w-2 self-stretch shrink-0 rounded-l-[20px] ${item.active ? 'bg-[#3B82F6]' : 'bg-[#93C5FD]/60'}`} />

                  {/* Avatar */}
                  <div className="w-11 h-11 sm:w-14 sm:h-14 rounded-full border-2 border-white shadow-sm overflow-hidden shrink-0 my-4">
                    <img src={item.avatar} className="w-full h-full object-cover" alt={item.name} />
                  </div>

                  {/* Name + address */}
                  <div className="min-w-0 flex-1 sm:flex-none sm:w-36 lg:w-44 py-4">
                    <p className={`text-[13px] sm:text-[14px] font-bold truncate ${item.active ? 'text-white' : 'text-dash-dark'}`}>
                      {item.name}
                    </p>
                    <p className={`text-[10px] sm:text-[11px] mt-0.5 truncate ${item.active ? 'text-white/50' : 'text-gray-400'}`}>
                      {item.address}
                    </p>
                  </div>

                  {/* Check-In */}
                  <div className="hidden sm:block flex-1 min-w-0 py-4">
                    <p className={`text-[11px] font-bold mb-0.5 ${item.active ? 'text-white/40' : 'text-gray-400'}`}>Check-In</p>
                    <p className={`text-[13px] font-medium truncate ${item.active ? 'text-white/80' : 'text-gray-600'}`}>{item.checkIn}</p>
                  </div>

                  {/* Check-Out */}
                  <div className="hidden md:block flex-1 min-w-0 py-4">
                    <p className={`text-[11px] font-bold mb-0.5 ${item.active ? 'text-white/40' : 'text-gray-400'}`}>Check-Out</p>
                    <p className={`text-[13px] font-medium truncate ${item.active ? 'text-white/80' : 'text-gray-600'}`}>{item.checkOut}</p>
                  </div>

                  {/* Zone */}
                  <div className="hidden lg:block flex-1 min-w-0 py-4">
                    <p className={`text-[11px] font-bold mb-0.5 ${item.active ? 'text-white/40' : 'text-gray-400'}`}>Zone</p>
                    <p className={`text-[13px] font-medium truncate ${item.active ? 'text-white/80' : 'text-gray-600'}`}>{item.zone}</p>
                  </div>

                  {/* Status */}
                  <div className="shrink-0 text-right py-4">
                    <div className={`inline-block px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-bold whitespace-nowrap ${
                      item.status === 'Present' ? 'bg-[#1A452C] text-[#4ADE80]' : 'bg-[#F48243] text-white'
                    }`}>
                      {item.status}
                    </div>
                    <p className={`text-[10px] sm:text-[11px] mt-1 ${item.active ? 'text-white/40' : 'text-gray-400'}`}>
                      {item.subText}
                    </p>
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
    </div>
  );
}
