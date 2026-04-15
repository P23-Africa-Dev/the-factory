'use client';

import Link from 'next/link';
import { ArrowLeft, Search, SlidersHorizontal, ChevronLeft, ChevronRight, MessageSquare, Map as MapIcon, Plus, MapPin } from 'lucide-react';
import { useState, useMemo } from 'react';

type AttendanceRecord = {
  id: string;
  name: string;
  address: string;
  checkIn: string;
  checkOut: string;
  role: string;
  zone: string;
  status: string;
  subText: string;
  active: boolean;
  avatar: string;
};

const ALL_ATTENDANCE: AttendanceRecord[] = [
  { id: '1', name: 'Francis Nasyomba', address: '12 Oba Akran Avenue, Ikeja, Lagos', checkIn: 'No check-in record', checkOut: 'No check-out record', role: 'Field Agent', zone: 'Ikeja LGA', status: 'Absent', subText: 'Since Yesterday', active: false, avatar: 'https://i.pravatar.cc/150?u=11' },
  { id: '2', name: 'Lade Wane', address: '12 Oba Akran Avenue, Ikeja, Lagos', checkIn: '8:25AM', checkOut: 'Still Active', role: 'Field Agent', zone: 'Ikeja LGA', status: 'Present', subText: 'Active', active: true, avatar: 'https://i.pravatar.cc/150?u=12' },
  { id: '3', name: 'Amina Bello', address: '45 Adeniran Ogunsanya, Surulere, Lagos', checkIn: 'No check-in record', checkOut: 'No check-out record', role: 'Field Agent', zone: 'Surulere LGA', status: 'Absent', subText: 'Since Yesterday', active: false, avatar: 'https://i.pravatar.cc/150?u=13' },
  { id: '4', name: 'Chidi Okonkwo', address: '3 Admiralty Way, Lekki Phase 1, Lagos', checkIn: '9:10AM', checkOut: '5:00PM', role: 'Senior Agent', zone: 'Lekki LGA', status: 'Present', subText: 'Checked Out', active: false, avatar: 'https://i.pravatar.cc/150?u=14' },
  { id: '5', name: 'Ngozi Eze', address: '7 Ozumba Mbadiwe, Victoria Island, Lagos', checkIn: 'No check-in record', checkOut: 'No check-out record', role: 'Field Agent', zone: 'Victoria Island', status: 'Absent', subText: '1 day ago', active: false, avatar: 'https://i.pravatar.cc/150?u=15' },
  { id: '6', name: 'Tunde Adeyemi', address: '22 Herbert Macaulay Way, Yaba, Lagos', checkIn: '7:58AM', checkOut: 'Still Active', role: 'Senior Agent', zone: 'Yaba LGA', status: 'Present', subText: 'Active', active: true, avatar: 'https://i.pravatar.cc/150?u=16' },
  { id: '7', name: 'Fatima Sule', address: '45 Adeniran Ogunsanya, Surulere, Lagos', checkIn: 'No check-in record', checkOut: 'No check-out record', role: 'Field Agent', zone: 'Surulere LGA', status: 'Absent', subText: '5 hours ago', active: false, avatar: 'https://i.pravatar.cc/150?u=17' },
  { id: '8', name: 'Emeka Obi', address: 'Oshodi Market Road, Oshodi, Lagos', checkIn: '8:45AM', checkOut: '4:30PM', role: 'Field Agent', zone: 'Oshodi LGA', status: 'Present', subText: 'Checked Out', active: false, avatar: 'https://i.pravatar.cc/150?u=18' },
  { id: '9', name: 'Blessing Okafor', address: '12 Oba Akran Avenue, Ikeja, Lagos', checkIn: '8:00AM', checkOut: 'Still Active', role: 'Senior Agent', zone: 'Ikeja LGA', status: 'Present', subText: 'Active', active: true, avatar: 'https://i.pravatar.cc/150?u=19' },
  { id: '10', name: 'Abdul Kareem', address: '3 Admiralty Way, Lekki Phase 1, Lagos', checkIn: 'No check-in record', checkOut: 'No check-out record', role: 'Field Agent', zone: 'Lekki LGA', status: 'Absent', subText: 'Since Yesterday', active: false, avatar: 'https://i.pravatar.cc/150?u=20' },
];

const ZONES = ['All Zones', ...Array.from(new Set(ALL_ATTENDANCE.map((a) => a.zone)))];
const PAGE_SIZE = 5;

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function AttendanceSidebar({ record }: { record: AttendanceRecord }) {
  return (
    <div className="flex flex-col gap-5 w-full xl:w-90 xl:shrink-0">
      {/* Info */}
      <div>
        <div className="flex flex-col sm:flex-row xl:flex-col gap-6">
          <div className="flex sm:flex-row xl:flex-row items-start gap-6">
            <div className="flex-1 space-y-4 min-w-0">
              <div>
                <h3 className="text-[17px] font-bold text-dash-dark">{record.name}</h3>
                <p className="text-[12px] text-gray-400 mt-1 leading-relaxed">{record.address}</p>
              </div>
              <div>
                <p className="text-[13px] font-bold text-dash-dark mb-0.5">Zone</p>
                <p className="text-[13px] text-gray-400">{record.zone}</p>
              </div>
              <div>
                <p className="text-[13px] font-bold text-dash-dark mb-0.5">Role</p>
                <p className="text-[13px] text-gray-400">{record.role}</p>
              </div>
              <div>
                <p className="text-[13px] font-bold text-dash-dark mb-0.5">Check-In</p>
                <p className="text-[13px] text-gray-400">{record.checkIn}</p>
              </div>
            </div>
            <div className="shrink-0 w-36">
              <div className="w-36 h-44 rounded-3xl overflow-hidden shadow-lg bg-[#C9A84C]">
                <img src={record.avatar} className="w-full h-full object-cover" alt={record.name} />
              </div>
              <div className="mt-2 text-center">
                <p className="text-[12px] font-bold text-dash-dark">{record.name}</p>
                <div className="flex items-center justify-center gap-2 mt-0.5">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                    record.active ? 'bg-[#1A452C] text-[#4ADE80]' : 'bg-[#F48243]/20 text-[#F48243]'
                  }`}>
                    {record.status}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="flex justify-center gap-3 mt-5">
          {[MessageSquare, MapIcon, Plus].map((Icon, i) => (
            <button key={i} className="w-10 h-10 bg-white text-gray-400 rounded-full flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-100 shadow-sm">
              <Icon size={15} />
            </button>
          ))}
        </div>
      </div>

      {/* Tracking card */}
      <div className="bg-dash-dark rounded-4xl p-6 shadow-2xl">
        <div className="flex items-start gap-4 mb-5">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 font-bold mb-0.5">Check-In Time</p>
            <p className="text-[15px] font-bold text-white">{record.checkIn}</p>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-400 font-bold mb-0.5">Check-Out Time</p>
            <p className="text-[13px] font-medium text-white/70">{record.checkOut}</p>
          </div>
          <div className={`px-3 py-1.5 rounded-full text-[10px] font-bold shrink-0 self-start ${
            record.active ? 'bg-[#1A452C] text-[#4ADE80]' : 'bg-gray-700 text-gray-300'
          }`}>
            {record.active ? 'On-Time' : 'Absent'}
          </div>
        </div>

        <div className="mb-4">
          <p className="text-[15px] font-bold text-white mb-0.5">Location (Check-In)</p>
          <p className="text-[12px] text-gray-400">{record.address}</p>
        </div>

        {/* Map */}
        <div className="relative h-44 w-full rounded-[18px] bg-[#e8ecef] overflow-hidden">
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-50">
            <defs>
              <pattern id="attpage-grid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#CBD5E1" strokeWidth="0.8" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#attpage-grid)" />
          </svg>
          <div className="absolute left-[30%] top-0 bottom-0 w-9 bg-white/60 pointer-events-none" />
          <div className="absolute top-[48%] left-0 right-0 h-8 bg-white/60 pointer-events-none" />
          <div className="absolute right-0 top-[28%] w-10 h-14 bg-[#A8D5B5]/60 pointer-events-none" />
          <div className="absolute pointer-events-none" style={{ left: '28%', top: 6 }}>
            <span className="text-[8px] font-semibold text-gray-600 block leading-tight">Dresd</span>
            <span className="text-[8px] font-semibold text-gray-600 block leading-tight">Street</span>
          </div>
          <div className="absolute right-1 top-[16%] pointer-events-none">
            <span className="text-[7px] font-semibold text-gray-500 block leading-tight">McDow</span>
            <span className="text-[7px] font-semibold text-gray-500 block leading-tight">ell Str</span>
          </div>
          <div className="absolute" style={{ left: '32%', top: '25%' }}>
            <MapPin size={20} className="text-red-500 fill-red-500 drop-shadow-md" />
          </div>
          <div className="absolute flex flex-col items-center" style={{ left: 'calc(32% - 14px)', top: '48%' }}>
            <div className="w-7 h-7 rounded-full border-2 border-white shadow-md overflow-hidden">
              <img src={record.avatar} className="w-full h-full object-cover" alt="Agent" />
            </div>
            <div className="bg-white px-2 py-0.5 rounded-lg mt-1 whitespace-nowrap shadow-md">
              <p className="text-[8px] font-bold text-dash-dark">{record.name}</p>
              <p className="text-[7px] text-gray-400">Active at Kemsi Street</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────
function AttendanceRow({ item, isSelected, onClick }: { item: AttendanceRecord; isSelected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center rounded-[20px] overflow-hidden cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'bg-dash-dark' : 'bg-gray-50/60'
      }`}
    >
      <div className={`w-2 self-stretch shrink-0 ${isSelected ? 'bg-[#3B82F6]' : 'bg-[#93C5FD]/60'}`} />

      <div className="w-12 h-12 rounded-full border-2 border-white shadow-sm overflow-hidden shrink-0 my-4 mx-3 sm:mx-4">
        <img src={item.avatar} className="w-full h-full object-cover" alt={item.name} />
      </div>

      {/* Name */}
      <div className="w-32.5 sm:w-40 shrink-0 py-4 pr-3 min-w-0">
        <p className={`text-[13px] font-bold truncate ${isSelected ? 'text-white' : 'text-dash-dark'}`}>{item.name}</p>
        <p className={`text-[11px] mt-0.5 truncate ${isSelected ? 'text-white/50' : 'text-gray-400'}`}>{item.address}</p>
      </div>

      {/* Check-In */}
      <div className="hidden sm:block w-27.5 shrink-0 py-4 pr-3">
        <p className={`text-[11px] font-bold mb-0.5 ${isSelected ? 'text-white/40' : 'text-gray-400'}`}>Check-In</p>
        <p className={`text-[13px] font-medium truncate ${isSelected ? 'text-white/80' : 'text-gray-600'}`}>{item.checkIn}</p>
      </div>

      {/* Check-Out */}
      <div className="hidden md:block w-37.5 shrink-0 py-4 pr-3">
        <p className={`text-[11px] font-bold mb-0.5 ${isSelected ? 'text-white/40' : 'text-gray-400'}`}>Check-Out</p>
        <p className={`text-[13px] font-medium truncate ${isSelected ? 'text-white/80' : 'text-gray-600'}`}>{item.checkOut}</p>
      </div>

      {/* Zone */}
      <div className="hidden lg:block w-27.5 shrink-0 py-4 pr-3">
        <p className={`text-[11px] font-bold mb-0.5 ${isSelected ? 'text-white/40' : 'text-gray-400'}`}>Zone</p>
        <p className={`text-[13px] font-medium truncate ${isSelected ? 'text-white/80' : 'text-gray-600'}`}>{item.zone}</p>
      </div>

      {/* Status */}
      <div className="ml-auto shrink-0 text-right py-4 pr-4 sm:pr-5">
        <div className={`inline-block px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${
          item.status === 'Present' ? 'bg-[#1A452C] text-[#4ADE80]' : 'bg-[#F48243] text-white'
        }`}>
          {item.status}
        </div>
        <p className={`text-[11px] mt-1 ${isSelected ? 'text-white/40' : 'text-gray-400'}`}>{item.subText}</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AttendanceListPage() {
  const [search, setSearch]           = useState('');
  const [zoneFilter, setZoneFilter]   = useState('All Zones');
  const [statusFilter, setStatusFilter] = useState<'all' | 'present' | 'absent'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage]               = useState(1);
  const [selectedId, setSelectedId]   = useState<string>(ALL_ATTENDANCE[0].id);

  const filtered = useMemo(() => {
    return ALL_ATTENDANCE.filter((a) => {
      const matchesSearch =
        a.name.toLowerCase().includes(search.toLowerCase()) ||
        a.zone.toLowerCase().includes(search.toLowerCase()) ||
        a.address.toLowerCase().includes(search.toLowerCase());
      const matchesZone   = zoneFilter === 'All Zones' || a.zone === zoneFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'present' && a.status === 'Present') ||
        (statusFilter === 'absent'  && a.status === 'Absent');
      return matchesSearch && matchesZone && matchesStatus;
    });
  }, [search, zoneFilter, statusFilter]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated   = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const presentCount = ALL_ATTENDANCE.filter((a) => a.status === 'Present').length;
  const absentCount  = ALL_ATTENDANCE.filter((a) => a.status === 'Absent').length;

  const selectedRecord =
    ALL_ATTENDANCE.find((a) => a.id === selectedId) ?? ALL_ATTENDANCE[0];

  const handleSearch = (val: string) => { setSearch(val); setPage(1); };
  const handleFilter = (key: 'zone' | 'status', val: string) => {
    if (key === 'zone')   setZoneFilter(val);
    if (key === 'status') setStatusFilter(val as 'all' | 'present' | 'absent');
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="max-w-350 mx-auto">

        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link href="/operations?tab=attendance" className="flex items-center justify-center w-10 h-10 rounded-full bg-white shadow-sm hover:shadow-md transition-all">
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

        {/* Search + Filter */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-dash-teal transition-colors" size={17} />
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
              <label className="text-[11px] font-bold text-gray-400 px-1">Status</label>
              <div className="flex gap-1">
                {(['all', 'present', 'absent'] as const).map((s) => (
                  <button key={s} onClick={() => handleFilter('status', s)}
                    className={`px-4 py-2 rounded-full text-[12px] font-bold capitalize transition-all ${
                      statusFilter === s ? 'bg-dash-dark text-white' : 'bg-gray-50 border border-gray-200 text-gray-500 hover:bg-gray-100'
                    }`}>
                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {(zoneFilter !== 'All Zones' || statusFilter !== 'all') && (
              <div className="flex flex-col justify-end">
                <button onClick={() => { setZoneFilter('All Zones'); setStatusFilter('all'); setPage(1); }}
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
              <div className="py-16 text-center text-gray-400 text-[14px] font-medium">No records match your search.</div>
            ) : (
              <div className="space-y-3">
                {paginated.map((item) => (
                  <AttendanceRow
                    key={item.id}
                    item={item}
                    isSelected={selectedId === item.id}
                    onClick={() => setSelectedId(item.id)}
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
          <AttendanceSidebar record={selectedRecord} />
        </div>
      </div>
    </div>
  );
}
