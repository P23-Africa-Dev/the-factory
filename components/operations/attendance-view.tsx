'use client';

import { ArrowUpRight, MessageSquare, Map as MapIcon, Plus, MapPin, Share2 } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

const chartDataTeal = [
  { v: 20 }, { v: 35 }, { v: 28 }, { v: 42 }, { v: 33 },
  { v: 50 }, { v: 44 }, { v: 58 }, { v: 52 }, { v: 65 },
];
const chartDataOrange = [
  { v: 40 }, { v: 30 }, { v: 48 }, { v: 25 }, { v: 38 },
  { v: 20 }, { v: 35 }, { v: 18 }, { v: 30 }, { v: 22 },
];

const attendanceList = [
  {
    id: 1,
    name: 'Francis Nasyomba',
    address: '12 Oba Akran Avenue, Ikeja, Lagos',
    checkIn: 'No check-in record',
    checkOut: 'No check-out record',
    role: 'Field Agent',
    status: 'Absent',
    subText: 'Since Yesterday',
    active: false,
    avatar: 'https://i.pravatar.cc/150?u=11',
  },
  {
    id: 2,
    name: 'Francis Nasyomba',
    address: '12 Oba Akran Avenue, Ikeja, Lagos',
    checkIn: '8:25AM',
    checkOut: 'Still Active',
    role: 'Field Agent',
    status: 'Present',
    subText: 'Active',
    active: true,
    avatar: 'https://i.pravatar.cc/150?u=12',
  },
  {
    id: 3,
    name: 'Francis Nasyomba',
    address: '12 Oba Akran Avenue, Ikeja, Lagos',
    checkIn: 'No check-in record',
    checkOut: 'No check-out record',
    role: 'Field Agent',
    status: 'Absent',
    subText: 'Since Yesterday',
    active: false,
    avatar: 'https://i.pravatar.cc/150?u=13',
  },
  {
    id: 4,
    name: 'Francis Nasyomba',
    address: '12 Oba Akran Avenue, Ikeja, Lagos',
    checkIn: 'No check-in record',
    checkOut: 'No check-out record',
    role: 'Field Agent',
    status: 'Absent',
    subText: 'Since Yesterday',
    active: false,
    avatar: 'https://i.pravatar.cc/150?u=14',
  },
];

export function AttendanceView() {
  return (
    <div className="flex flex-col xl:flex-row gap-5 mt-2 animate-in fade-in slide-in-from-bottom-4 duration-500">

      {/* ── Left column ─────────────────────────────────── */}
      <div className="flex-1 min-w-0 flex flex-col gap-5">

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">

          {/* Present */}
          <div className="bg-white rounded-4xl p-6 shadow-sm relative overflow-hidden min-h-[160px]">
            <div className="flex justify-between items-start relative z-10">
              <div>
                <h2 className="text-[52px] font-black leading-none text-dash-dark">150</h2>
                <p className="text-[13px] text-gray-500 font-medium mt-1">Present Agents Today</p>
              </div>
              <button className="flex items-center gap-1.5 px-3.5 py-1.5 bg-dash-teal/80 text-white rounded-full text-[11px] font-bold hover:opacity-90 transition-all shrink-0 mt-1">
                View All <ArrowUpRight size={13} />
              </button>
            </div>
            {/* Mini chart */}
            <div className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartDataTeal} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradPresent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4FD1C5" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#4FD1C5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="#4FD1C5" strokeWidth={2.5} fill="url(#gradPresent)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Absent */}
          <div className="bg-white rounded-4xl p-6 shadow-sm relative overflow-hidden min-h-[160px]">
            <div className="flex justify-between items-start relative z-10">
              <div>
                <h2 className="text-[52px] font-black leading-none text-dash-dark">150</h2>
                <p className="text-[13px] text-gray-500 font-medium mt-1">Absent Agents Today</p>
              </div>
              <button className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#F48243]/90 text-white rounded-full text-[11px] font-bold hover:opacity-90 transition-all shrink-0 mt-1">
                View All <ArrowUpRight size={13} />
              </button>
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartDataOrange} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradAbsent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F48243" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#F48243" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="v" stroke="#F48243" strokeWidth={2.5} fill="url(#gradAbsent)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Attendance list */}
        <div className="bg-white rounded-4xl p-5 sm:p-8 shadow-sm">
          {/* Header */}
          <div className="flex justify-end mb-5">
            <button className="px-5 py-2 bg-dash-dark text-white rounded-full text-[12px] font-semibold hover:opacity-90 transition-colors">
              Attendance List
            </button>
          </div>

          <div className="space-y-3">
            {attendanceList.map((item) => (
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
                  <p className={`text-[10px] sm:text-[11px] mt-0.5 leading-snug ${item.active ? 'text-white/50' : 'text-gray-400'}`}>
                    {item.address}
                  </p>
                </div>

                {/* Check-In */}
                <div className="hidden sm:block flex-1 min-w-0 py-4">
                  <p className={`text-[10px] font-bold mb-0.5 ${item.active ? 'text-white/40' : 'text-gray-400'}`}>Check-In</p>
                  <p className={`text-[13px] font-medium ${item.active ? 'text-white/80' : 'text-gray-600'}`}>{item.checkIn}</p>
                </div>

                {/* Check-Out */}
                <div className="hidden md:block flex-1 min-w-0 py-4">
                  <p className={`text-[10px] font-bold mb-0.5 ${item.active ? 'text-white/40' : 'text-gray-400'}`}>Check-Out</p>
                  <p className={`text-[13px] font-medium ${item.active ? 'text-white/80' : 'text-gray-600'}`}>{item.checkOut}</p>
                </div>

                {/* Role */}
                <div className="hidden lg:block flex-1 min-w-0 py-4">
                  <p className={`text-[10px] font-bold mb-0.5 ${item.active ? 'text-white/40' : 'text-gray-400'}`}>Role</p>
                  <p className={`text-[13px] font-medium ${item.active ? 'text-white/80' : 'text-gray-600'}`}>{item.role}</p>
                </div>

                {/* Status */}
                <div className="shrink-0 text-right py-4">
                  <div className={`inline-block px-3 py-1.5 rounded-full text-[10px] sm:text-[11px] font-bold ${
                    item.active ? 'bg-[#1A452C] text-[#4ADE80]' : 'bg-[#F48243] text-white'
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
        </div>
      </div>

      {/* ── Right column ────────────────────────────────── */}
      <div className="flex flex-col gap-5 w-full xl:w-90 xl:shrink-0">

        {/* Agent info (no card — page background) */}
        <div>
          <div className="flex flex-col sm:flex-row items-start gap-6">
            {/* Details */}
            <div className="flex-1 space-y-4 min-w-0">
              <div>
                <h3 className="text-[17px] font-bold text-dash-dark">Lane Wade</h3>
                <p className="text-[12px] text-gray-400 mt-1 leading-relaxed">
                  Visit the Ikeja Computer village, and promote...
                </p>
              </div>
              <div>
                <p className="text-[13px] font-bold text-dash-dark mb-0.5">Zone</p>
                <p className="text-[13px] text-gray-400">Ikeja LGA</p>
              </div>
              <div>
                <p className="text-[13px] font-bold text-dash-dark mb-0.5">Phone Number</p>
                <p className="text-[13px] text-gray-400">+234 803 4567890</p>
              </div>
              <div>
                <p className="text-[13px] font-bold text-dash-dark mb-0.5">Role</p>
                <p className="text-[13px] text-gray-400">Field Agent</p>
              </div>
            </div>

            {/* Photo card */}
            <div className="shrink-0 w-36">
              <div className="w-36 h-44 rounded-3xl overflow-hidden shadow-lg bg-[#C9A84C]">
                <img src="https://i.pravatar.cc/150?u=25" className="w-full h-full object-cover" alt="Lane Wade" />
              </div>
              <div className="mt-2 text-center">
                <p className="text-[12px] font-bold text-dash-dark">Lane Wade</p>
                <div className="flex items-center justify-center gap-2 mt-0.5">
                  <span className="text-[11px] text-gray-400">Ikeja LGA</span>
                  <span className="px-2 py-0.5 bg-[#1A452C] text-[#4ADE80] rounded-full text-[9px] font-bold">Present</span>
                </div>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex justify-end gap-3 mt-4">
            <button className="w-10 h-10 bg-white text-gray-400 rounded-full flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-100 shadow-sm">
              <MessageSquare size={15} />
            </button>
            <button className="w-10 h-10 bg-white text-gray-400 rounded-full flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-100 shadow-sm">
              <MapIcon size={15} />
            </button>
            <button className="w-10 h-10 bg-white text-gray-400 rounded-full flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-100 shadow-sm">
              <Plus size={15} />
            </button>
          </div>
        </div>

        {/* Tracking / Check-in card */}
        <div className="bg-dash-dark rounded-4xl p-6 shadow-2xl">
          {/* Times row */}
          <div className="flex items-start gap-4 mb-5">
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-400 font-bold mb-0.5">Check-In Time</p>
              <p className="text-[15px] font-bold text-white">8:25AM</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-gray-400 font-bold mb-0.5">Check-Out Time</p>
              <p className="text-[13px] font-medium text-white/70">Still Active</p>
            </div>
            <div className="px-3 py-1.5 bg-[#1A452C] text-[#4ADE80] rounded-full text-[10px] font-bold shrink-0 self-start">
              On-Time
            </div>
          </div>

          {/* Location */}
          <div className="mb-4">
            <p className="text-[15px] font-bold text-white mb-0.5">Location (Check-In)</p>
            <p className="text-[12px] text-gray-400">12 Oba Akran Avenue, Ikeja, Lagos</p>
          </div>

          {/* Map preview */}
          <div className="relative h-44 w-full rounded-[18px] bg-[#e8ecef] overflow-hidden">
            {/* Grid */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-50">
              <defs>
                <pattern id="attgrid" width="36" height="36" patternUnits="userSpaceOnUse">
                  <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#CBD5E1" strokeWidth="0.8" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#attgrid)" />
            </svg>

            {/* Street stripes */}
            <div className="absolute left-[30%] top-0 bottom-0 w-9 bg-white/60 pointer-events-none" />
            <div className="absolute top-[48%] left-0 right-0 h-8 bg-white/60 pointer-events-none" />
            <div className="absolute right-0 top-[28%] w-10 h-14 bg-[#A8D5B5]/60 pointer-events-none" />

            {/* Labels */}
            <div className="absolute pointer-events-none" style={{ left: '28%', top: 6 }}>
              <span className="text-[8px] font-semibold text-gray-600 block leading-tight">Dresd</span>
              <span className="text-[8px] font-semibold text-gray-600 block leading-tight">Street</span>
            </div>
            <div className="absolute right-1 top-[16%] pointer-events-none">
              <span className="text-[7px] font-semibold text-gray-500 block leading-tight">McDow</span>
              <span className="text-[7px] font-semibold text-gray-500 block leading-tight">ell Str</span>
            </div>

            {/* Red pin */}
            <div className="absolute" style={{ left: '32%', top: '25%' }}>
              <MapPin size={20} className="text-red-500 fill-red-500 drop-shadow-md" />
            </div>

            {/* Agent marker */}
            <div className="absolute flex flex-col items-center" style={{ left: 'calc(32% - 14px)', top: '48%' }}>
              <div className="w-7 h-7 rounded-full border-2 border-white shadow-md overflow-hidden">
                <img src="https://i.pravatar.cc/150?u=25" className="w-full h-full object-cover" alt="Agent" />
              </div>
              <div className="bg-white px-2 py-0.5 rounded-lg mt-1 whitespace-nowrap shadow-md">
                <p className="text-[8px] font-bold text-dash-dark">Lane Wade</p>
                <p className="text-[7px] text-gray-400">Active at Kemsi Street</p>
              </div>
            </div>

            {/* Destination */}
            <div className="absolute" style={{ left: '60%', top: '28%' }}>
              <div className="w-8 h-8 rounded-full bg-white/30 flex items-center justify-center border-4 border-[#C77DFF]/50 shadow-md">
                <div className="w-3 h-3 bg-[#9D4EDD] rounded-full" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
