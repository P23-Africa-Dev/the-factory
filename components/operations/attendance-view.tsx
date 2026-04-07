'use client';

import React from 'react';
import { UserCheck, UserX, Clock, MapPin, Search } from 'lucide-react';

const stats = [
  { label: 'Total Agents', value: '124', icon: UserCheck, color: '#4FD1C5', bg: '#4FD1C5/10' },
  { label: 'Present Today', value: '118', icon: UserCheck, color: '#3B82F6', bg: '#3B82F6/10' },
  { label: 'Late Check-ins', value: '6', icon: Clock, color: '#FF9F6A', bg: '#FF9F6A/10' },
  { label: 'Absent', value: '0', icon: UserX, color: '#FF4D4D', bg: '#FF4D4D/10' },
];

const attendanceData = [
  {
    id: '1',
    name: 'Francis Nasyomba',
    checkIn: '08:15 AM',
    location: 'Computer Village, Ikeja',
    status: 'On Time',
    avatar: 'https://i.pravatar.cc/150?u=1'
  },
  {
    id: '2',
    name: 'Lade Wane',
    checkIn: '08:45 AM',
    location: 'Oredo LGA, Benin City',
    status: 'Late',
    avatar: 'https://i.pravatar.cc/150?u=2'
  },
  {
    id: '3',
    name: 'Francis Nasyomba',
    checkIn: '08:10 AM',
    location: 'Ikeja Mall, Alausa',
    status: 'On Time',
    avatar: 'https://i.pravatar.cc/150?u=3'
  },
  {
    id: '4',
    name: 'Jane Doe',
    checkIn: '08:05 AM',
    location: 'Lekki Phase 1',
    status: 'On Time',
    avatar: 'https://i.pravatar.cc/150?u=4'
  },
];

export function AttendanceView() {
  return (
    <div className="flex flex-col gap-8 mt-4 animate-in fade-in slide-in-from-bottom-5 duration-700">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white rounded-[32px] p-8 shadow-sm border border-gray-50 flex items-center justify-between group hover:shadow-md transition-all">
            <div>
              <p className="text-[14px] font-bold text-gray-400 mb-2 truncate">{stat.label}</p>
              <p className="text-[28px] font-black text-[#0B1215]">{stat.value}</p>
            </div>
            <div 
              className="w-16 h-16 rounded-3xl flex items-center justify-center transition-transform group-hover:scale-110"
              style={{ backgroundColor: `${stat.color}15`, color: stat.color }}
            >
              <stat.icon size={28} strokeWidth={2.5} />
            </div>
          </div>
        ))}
      </div>

      {/* Main Attendance List */}
      <div className="bg-white rounded-[40px] p-10 shadow-sm border border-gray-50">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-10">
          <div>
            <h3 className="text-[22px] font-black text-[#0B1215]">Daily Attendance</h3>
            <p className="text-[13px] text-gray-400 mt-1 font-medium">Friday, 3rd April. 2026</p>
          </div>
          
          <div className="flex items-center gap-4 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-80 group">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-300 transition-colors group-focus-within:text-[#0B1215]" size={16} />
              <input 
                type="text" 
                placeholder="Search by Agent Name" 
                className="w-full bg-gray-50 border border-transparent rounded-full py-3.5 pl-12 pr-6 text-[13px] outline-none focus:bg-white focus:border-gray-200 transition-all font-medium"
              />
            </div>
            <button className="px-6 py-3.5 bg-[#0B1215] text-white rounded-full text-[13px] font-black hover:opacity-90 transition-all shadow-lg truncate">
              Export Report
            </button>
          </div>
        </div>

        <div className="overflow-x-auto -mx-10 px-10">
          <table className="w-full text-left border-separate border-spacing-y-4">
            <thead>
              <tr className="text-[12px] font-black text-gray-400 uppercase tracking-widest">
                <th className="px-6 pb-2">Agent Details</th>
                <th className="px-6 pb-2">Check-in Time</th>
                <th className="px-6 pb-2">Location</th>
                <th className="px-6 pb-2">Status</th>
                <th className="px-6 pb-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {attendanceData.map((agent, i) => (
                <tr key={i} className="group hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 bg-white first:rounded-l-[24px] border-y border-l border-gray-100 group-hover:border-gray-200">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full border-2 border-white shadow-sm overflow-hidden shrink-0">
                        <img src={agent.avatar} className="w-full h-full object-cover" alt="Avatar" />
                      </div>
                      <div>
                        <p className="text-[15px] font-black text-[#0B1215]">{agent.name}</p>
                        <p className="text-[11px] text-gray-400 font-bold uppercase tracking-wider mt-0.5">Field Agent</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 bg-white border-y border-gray-100 group-hover:border-gray-200">
                    <div className="flex items-center gap-2.5 text-[14px] font-bold text-gray-600">
                      <Clock size={16} className="text-gray-400" />
                      {agent.checkIn}
                    </div>
                  </td>
                  <td className="px-6 py-4 bg-white border-y border-gray-100 group-hover:border-gray-200">
                    <div className="flex items-center gap-2.5 text-[14px] font-bold text-gray-500 hover:text-[#0B1215] cursor-pointer transition-colors group/loc">
                      <MapPin size={16} className="text-gray-400 group-hover/loc:text-red-500 transition-colors" />
                      <span className="underline decoration-gray-200 underline-offset-4">{agent.location}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 bg-white border-y border-gray-100 group-hover:border-gray-200">
                    <div className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-black uppercase tracking-wider ${
                      agent.status === 'On Time' 
                      ? 'bg-green-50 text-green-600' 
                      : 'bg-orange-50 text-orange-600'
                    }`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${agent.status === 'On Time' ? 'bg-green-500' : 'bg-orange-500'}`} />
                      {agent.status}
                    </div>
                  </td>
                  <td className="px-6 py-4 bg-white last:rounded-r-[24px] border-y border-r border-gray-100 group-hover:border-gray-200 text-right">
                    <button className="text-[13px] font-black text-[#0B1215] hover:text-[#D63384] transition-colors uppercase tracking-widest mr-2">
                      View Details
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-10 flex justify-center">
            <button className="px-10 py-4 bg-gray-50 text-[#0B1215] rounded-full text-[13px] font-black hover:bg-gray-100 transition-all border border-gray-100">
              Load More Records
            </button>
        </div>
      </div>
    </div>
  );
}
