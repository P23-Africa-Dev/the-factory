'use client';

import React from 'react';
import { ArrowUpRight, MessageCircle, Map as MapIcon, Plus } from 'lucide-react';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';

const chartData = [
  { value: 30 },
  { value: 45 },
  { value: 35 },
  { value: 50 },
  { value: 40 },
  { value: 60 },
  { value: 55 },
  { value: 70 },
  { value: 65 },
  { value: 80 },
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
    theme: 'light'
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
    theme: 'dark'
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
    theme: 'light'
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
    theme: 'light'
  }
];

export function AttendanceView() {
  return (
    <div className="flex flex-col lg:flex-row gap-6 mt-2 animate-in fade-in slide-in-from-bottom-5 duration-700">
      
      {/* ─── Left Column (Stats + List) ─────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-6">
        
        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 min-h-fit sm:h-[180px]">
          {/* Present Card */}
          <div className="bg-white rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 shadow-sm border border-gray-50 flex flex-col relative overflow-hidden group">
            <div className="flex justify-between items-start z-10 w-full mb-2">
              <div className="space-y-1">
                <h3 className="text-[32px] sm:text-[42px] font-black leading-none text-[#0B1215]">150</h3>
                <p className="text-[12px] sm:text-[14px] font-bold text-gray-500">Present Agents Today</p>
              </div>
              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#82BDBE] text-white rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-wider hover:opacity-90 transition-all shrink-0">
                View All
                <ArrowUpRight size={14} />
              </button>
            </div>
            {/* Recharts AreaChart */}
            <div className="absolute bottom-0 left-0 right-0 h-[60px] sm:h-[80px] opacity-80 pointer-events-none">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#82BDBE" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#82BDBE" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#82BDBE" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorPresent)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Absent Card */}
          <div className="bg-white rounded-[24px] sm:rounded-[32px] p-5 sm:p-6 shadow-sm border border-gray-50 flex flex-col relative overflow-hidden group">
            <div className="flex justify-between items-start z-10 w-full mb-2">
              <div className="space-y-1">
                <h3 className="text-[32px] sm:text-[42px] font-black leading-none text-[#0B1215]">150</h3>
                <p className="text-[12px] sm:text-[14px] font-bold text-gray-500">Absent Agents Today</p>
              </div>
              <button className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F48243] text-white rounded-full text-[10px] sm:text-[11px] font-black uppercase tracking-wider hover:opacity-90 transition-all shrink-0">
                View All
                <ArrowUpRight size={14} />
              </button>
            </div>
            {/* Recharts AreaChart */}
            <div className="absolute bottom-0 left-0 right-0 h-[60px] sm:h-[80px] opacity-80 pointer-events-none">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorAbsent" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#F48243" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#F48243" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <Area 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#F48243" 
                    strokeWidth={2}
                    fillOpacity={1} 
                    fill="url(#colorAbsent)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Attendance List Container */}
        <div className="bg-white rounded-[24px] sm:rounded-[40px] p-5 sm:p-6 shadow-sm flex-1 relative border border-gray-50 min-h-[300px]">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-[18px] sm:text-[20px] font-black text-[#0B1215]">Attendance Records</h3>
            <div className="bg-[#6B7280] text-white text-[10px] sm:text-[11px] px-3.5 py-1.5 rounded-lg font-bold shadow-sm">
              Attendance List
            </div>
          </div>

          <div className="flex flex-col gap-4">
            {attendanceList.map((item) => (
              <div 
                key={item.id}
                className={`relative flex flex-col p-4 sm:py-5 sm:px-6 rounded-[24px] sm:rounded-[40px] overflow-hidden transition-all ${
                  item.theme === 'dark' 
                  ? 'bg-[#0B1215] text-white shadow-xl translate-y-[-2px] sm:translate-y-0' 
                  : 'bg-white border border-gray-100 hover:border-gray-200 hover:shadow-sm'
                }`}
              >
                {/* Blue indicator for light theme */}
                {item.theme === 'light' && (
                  <div className="absolute left-0 top-0 bottom-0 w-[8px] sm:w-[12px] bg-[#6ea0fc] rounded-l-[40px]" />
                )}

                {/* Info Container */}
                <div className="flex flex-col md:flex-row md:items-center gap-4 w-full">
                  
                  {/* Left: Avatar & Title (Primary Info) */}
                  <div className={`flex items-center gap-3 md:w-[35%] ${item.theme === 'light' ? 'pl-2' : ''}`}>
                    <div className={`w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden shrink-0 border-2 ${item.theme === 'dark' ? 'border-[#0B1215] bg-[#EED58D]' : 'border-white shadow-sm bg-[#F48243]'}`}>
                       <img src={`https://i.pravatar.cc/150?u=${item.id + 10}`} alt="avatar" className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <h4 className={`text-[14px] sm:text-[15px] font-black truncate ${item.theme === 'dark' ? 'text-white' : 'text-[#0B1215]'}`}>{item.name}</h4>
                      <p className={`text-[11px] sm:text-[12px] leading-tight mt-0.5 truncate pr-2 ${item.theme === 'dark' ? 'text-gray-400' : 'text-gray-400 font-medium'}`}>
                        {item.address}
                      </p>
                    </div>
                  </div>

                  {/* Right: Sub Grid for Details (3 columns on md+) */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1 md:items-center">
                    {/* Check-In */}
                    <div className="flex flex-col gap-0.5">
                      <h5 className={`text-[10px] sm:text-[12px] font-bold uppercase tracking-wider ${item.theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Check-In</h5>
                      <p className={`text-[12px] sm:text-[13px] font-bold ${item.theme === 'dark' ? 'text-white' : 'text-[#0B1215]'}`}>
                        {item.checkIn}
                      </p>
                    </div>

                    {/* Check-Out */}
                    <div className="flex flex-col gap-0.5">
                      <h5 className={`text-[10px] sm:text-[12px] font-bold uppercase tracking-wider ${item.theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Check-Out</h5>
                      <p className={`text-[12px] sm:text-[13px] font-bold ${item.theme === 'dark' ? 'text-white' : 'text-[#0B1215]'}`}>
                        {item.checkOut}
                      </p>
                    </div>

                    {/* Role (Hidden on very small screens, visible on mobile grid) */}
                    <div className="hidden sm:flex flex-col gap-0.5">
                       <h5 className={`text-[10px] sm:text-[12px] font-bold uppercase tracking-wider ${item.theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Role</h5>
                       <p className={`text-[12px] sm:text-[13px] font-bold ${item.theme === 'dark' ? 'text-white' : 'text-[#0B1215]'}`}>
                        {item.role}
                      </p>
                    </div>

                    {/* Status (End aligned on larger screens) */}
                    <div className="flex flex-col items-start md:items-end gap-1.5 col-span-1 md:col-span-1">
                      <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        item.status === 'Present' 
                        ? 'bg-[#1A452C] text-[#4ADE80]' 
                        : 'bg-[#F48243] text-white shadow-sm'
                      }`}>
                        {item.status}
                      </div>
                      <p className={`text-[10px] font-bold ${item.theme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>
                        {item.subText}
                      </p>
                    </div>
                  </div>

                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ─── Right Column (Agent Info + Tracking) ────────────────────────── */}
      <div className="w-full lg:w-[460px] flex flex-col gap-6 shrink-0">
        
        {/* Agent Info Panel */}
        <div className="flex flex-col sm:flex-row gap-6 lg:gap-4 pt-2">
          {/* Info Details List */}
          <div className="flex-1 space-y-5 sm:space-y-6 pt-3 px-2">
            <div>
              <h3 className="text-[17px] font-black text-[#0B1215] mb-1">Lane Wade</h3>
              <p className="text-[13px] text-gray-400 font-medium leading-relaxed pr-2">
                Visit the ikeja Computer village, and promote...
              </p>
            </div>
            <div className="grid grid-cols-2 sm:block gap-4">
              <div>
                <h4 className="text-[14px] sm:text-[15px] font-black text-[#0B1215] mb-0.5">Zone</h4>
                <p className="text-[13px] text-gray-500 font-medium">Ikeja LGA</p>
              </div>
              <div>
                <h4 className="text-[14px] sm:text-[15px] font-black text-[#0B1215] mb-0.5">Phone Number</h4>
                <p className="text-[13px] text-gray-500 font-medium">+234 803 4567890</p>
              </div>
            </div>
            <div>
              <h4 className="text-[14px] sm:text-[15px] font-black text-[#0B1215] mb-0.5">Role</h4>
              <p className="text-[13px] text-gray-500 font-medium">Field Agent</p>
            </div>
          </div>

          {/* Avatar Card */}
          <div className="w-full sm:w-[180px] flex flex-row sm:flex-col gap-4 items-center">
            <div className="bg-white rounded-[32px] sm:rounded-[40px] p-4 pb-5 sm:pb-6 shadow-sm border border-gray-100 flex-1 sm:w-full flex flex-row sm:flex-col items-center gap-4 sm:gap-0">
              <div className="w-20 h-20 sm:w-full aspect-square bg-[#EED58D] rounded-[24px] sm:rounded-[32px] overflow-hidden sm:mb-4 relative flex items-end justify-center shrink-0">
                 <img src="https://i.pravatar.cc/150?u=25" className="w-[90%] h-[90%] object-cover object-bottom rounded-b-[32px]" alt="Lane Wade" />
              </div>
              <div className="flex-1 sm:text-center w-full min-w-0">
                <h4 className="text-[15px] sm:text-[16px] font-black text-[#0B1215] mb-0.5 truncate">Lane Wade</h4>
                <p className="text-[11px] sm:text-[12px] text-gray-400 font-black mb-3">Ikeja LGA</p>
                <div className="bg-[#1A452C] text-[#4ADE80] text-[10px] px-3.5 py-1.5 rounded-full font-black uppercase tracking-wider inline-flex items-center justify-center">
                  Present
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gray-200/50 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-[#0B1215] transition-all shrink-0">
                <MessageCircle size={18} strokeWidth={2.5} />
              </button>
              <button className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gray-200/50 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-[#0B1215] transition-all shrink-0">
                <MapIcon size={18} strokeWidth={2.5} />
              </button>
              <button className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-gray-200/50 hover:bg-gray-200 flex items-center justify-center text-gray-500 hover:text-[#0B1215] transition-all shrink-0">
                <Plus size={18} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>

        {/* Tracking Card */}
        <div className="bg-[#0B1215] rounded-[32px] sm:rounded-[40px] p-6 sm:p-8 shadow-xl relative overflow-hidden mt-2 h-[340px] flex flex-col">
          
          {/* Top Times */}
          <div className="flex items-start justify-between mb-8 relative z-10 gap-3">
            <div className="min-w-0">
              <p className="text-[12px] sm:text-[13px] font-bold text-gray-400 mb-1 truncate">Check-In</p>
              <p className="text-[14px] sm:text-[15px] font-black text-white">8:25AM</p>
            </div>
            <div className="min-w-0">
              <p className="text-[12px] sm:text-[13px] font-bold text-gray-400 mb-1 truncate">Check-Out</p>
              <p className="text-[14px] sm:text-[15px] font-black text-white">Still Active</p>
            </div>
            <div className="bg-[#1A452C] text-[#4ADE80] text-[9px] sm:text-[11px] px-3.5 py-1.5 rounded-full font-black uppercase tracking-widest shrink-0 shadow-sm border border-[#2B6D45]/50">
              On-Time
            </div>
          </div>

          {/* Location */}
          <div className="mb-6 relative z-10">
            <h4 className="text-[15px] sm:text-[16px] font-black text-white flex items-center gap-2 mb-1">Location (Check-In)</h4>
            <p className="text-[12px] sm:text-[13px] text-gray-400 font-medium line-clamp-1">12 Oba Akran Avenue, Ikeja, Lagos</p>
          </div>

          {/* Map Area */}
          <div className="absolute bottom-0 left-0 right-0 h-[170px] bg-[#E8EAED] rounded-b-[32px] sm:rounded-b-[40px] overflow-hidden">
            {/* Mock Map Image / Background */}
            <div className="w-full h-full relative" style={{
              backgroundImage: 'radial-gradient(#CBD5E1 1px, transparent 1px)',
              backgroundSize: '24px 24px',
              backgroundColor: '#F1F5F9'
            }}>
               {/* Map graphic lines abstract */}
               <svg className="absolute inset-0 w-full h-full text-white/80" fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round">
                 <path d="M-20,100 Q40,120 100,80 T250,90 T350,150 T500,100" />
                 <path d="M120,-20 Q140,50 180,180" />
                 <path d="M220,-20 Q200,80 300,120 T500,50" />
                 <path d="M380,-20 Q350,60 250,80" />
                 <path d="M-20,40 Q50,50 100,-20" />
               </svg>

               <div className="absolute top-12 right-6 text-[#0B1215] font-black text-[12px] sm:text-[14px] leading-tight">
                 McDow<br/>ell Street
               </div>
               
               <div className="absolute bottom-4 left-[65%] text-[#0B1215] font-black text-[12px] sm:text-[14px] transform -rotate-[20deg] opacity-70">
                 Br<span className="opacity-0">..</span>o
               </div>
               <div className="absolute top-8 left-[45%] text-[#0B1215] font-black text-[12px] sm:text-[14px] transform rotate-90 opacity-70">
                 Dresde<span className="opacity-0">...</span>n\nStree
               </div>

               {/* Target Pin Purple */}
               <div className="absolute top-8 right-24 sm:right-32 w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-[#EADDFF] flex items-center justify-center opacity-80 shadow-md">
                 <div className="w-3 h-3 sm:w-4 sm:h-4 bg-[#D0BCFF] rounded-full border-2 border-white pointer-events-none" />
               </div>

               {/* Current Location Red Pin */}
               <div className="absolute top-16 sm:top-20 left-1/3 drop-shadow-md">
                 <svg 
                   viewBox="0 0 24 24" 
                   fill="none" 
                   xmlns="http://www.w3.org/2000/svg"
                   className="w-6 h-6 sm:w-7 sm:h-7"
                 >
                    <path d="M12 21.5C16.5 17.5 20.5 13 20.5 8.5C20.5 3.80558 16.6944 0 12 0C7.30558 0 3.5 3.80558 3.5 8.5C3.5 13 7.5 17.5 12 21.5Z" fill="#F04438" stroke="white" strokeWidth="2.5"/>
                    <circle cx="12" cy="8.5" r="3.5" fill="white"/>
                 </svg>
               </div>

               {/* Active Status Badge on Map */}
               <div className="absolute bottom-4 left-4 sm:left-6 bg-white/90 backdrop-blur-md rounded-full p-1.5 pr-3 sm:pr-4 flex items-center gap-2 sm:gap-2.5 shadow-lg border border-white max-w-[160px] sm:max-w-none">
                 <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-[#EED58D] shrink-0 overflow-hidden relative border border-gray-100">
                    <img src="https://i.pravatar.cc/150?u=25" className="w-[110%] h-[110%] object-cover object-bottom" alt="Map avatar" />
                 </div>
                 <div className="leading-tight min-w-0">
                   <p className="text-[9px] sm:text-[11px] font-black text-[#0B1215] uppercase tracking-wider truncate">
                     Lane Wade
                   </p>
                   <p className="font-bold text-gray-500 capitalize text-[8px] sm:text-[9px] mt-0.5 truncate">
                     Active at Eamil Street
                   </p>
                 </div>
               </div>
               
               {/* Translucent overlay at bottom edge of map area in dark card */}
               <div className="absolute inset-0 bg-gradient-to-t from-[#82BDBE]/40 via-transparent to-transparent pointer-events-none" />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
