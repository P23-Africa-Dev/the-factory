"use client";

import { useState } from "react";
import Link from "next/link";
import { MapPin, Search, SlidersHorizontal, BookmarkPlus } from "lucide-react";
import { AddAgentModal } from "./add-agent-modal";
import { OpsTableRow, OpsTableNameCol, OpsTableCol, OpsTableStatus, OpsTableContainer } from "./ops-table";

type AttendanceItem = {
  id: number;
  name: string;
  address: string;
  checkIn: string;
  checkOut: string;
  role: string;
  status: string;
  subText: string;
  active: boolean;
  avatar: string;
};

const attendanceList: AttendanceItem[] = [
  { id: 1, name: "Francis Nasyomba", address: "12 Oba Akran Avenue, Ikeja, Lagos", checkIn: "No check-in record", checkOut: "No check-out record", role: "Field Agent", status: "Absent", subText: "Since Yesterday", active: false, avatar: "/avatars/male-avatar.png" },
  { id: 2, name: "Francis Nasyomba", address: "12 Oba Akran Avenue, Ikeja, Lagos", checkIn: "8:25AM", checkOut: "Still Active", role: "Field Agent", status: "Present", subText: "Active", active: true, avatar: "/avatars/male-avatar.png" },
  { id: 3, name: "Francis Nasyomba", address: "12 Oba Akran Avenue, Ikeja, Lagos", checkIn: "No check-in record", checkOut: "No check-out record", role: "Field Agent", status: "Absent", subText: "Since Yesterday", active: false, avatar: "/avatars/male-avatar.png" },
  { id: 4, name: "Francis Nasyomba", address: "12 Oba Akran Avenue, Ikeja, Lagos", checkIn: "No check-in record", checkOut: "No check-out record", role: "Field Agent", status: "Absent", subText: "Since Yesterday", active: false, avatar: "/avatars/male-avatar.png" },
  { id: 5, name: "Francis Nasyomba", address: "12 Oba Akran Avenue, Ikeja, Lagos", checkIn: "8:25AM", checkOut: "Still Active", role: "Field Agent", status: "Present", subText: "Active", active: true, avatar: "/avatars/male-avatar.png" },
  { id: 6, name: "Francis Nasyomba", address: "12 Oba Akran Avenue, Ikeja, Lagos", checkIn: "No check-in record", checkOut: "No check-out record", role: "Field Agent", status: "Absent", subText: "Since Yesterday", active: false, avatar: "/avatars/male-avatar.png" },
  { id: 7, name: "Francis Nasyomba", address: "12 Oba Akran Avenue, Ikeja, Lagos", checkIn: "No check-in record", checkOut: "No check-out record", role: "Field Agent", status: "Absent", subText: "Since Yesterday", active: false, avatar: "/avatars/male-avatar.png" },
  { id: 8, name: "Francis Nasyomba", address: "12 Oba Akran Avenue, Ikeja, Lagos", checkIn: "8:25AM", checkOut: "Still Active", role: "Field Agent", status: "Present", subText: "Active", active: true, avatar: "/avatars/male-avatar.png" },
  { id: 9, name: "Francis Nasyomba", address: "12 Oba Akran Avenue, Ikeja, Lagos", checkIn: "No check-in record", checkOut: "No check-out record", role: "Field Agent", status: "Absent", subText: "Since Yesterday", active: false, avatar: "/avatars/male-avatar.png" },
  { id: 10, name: "Francis Nasyomba", address: "12 Oba Akran Avenue, Ikeja, Lagos", checkIn: "No check-in record", checkOut: "No check-out record", role: "Field Agent", status: "Absent", subText: "Since Yesterday", active: false, avatar: "/avatars/male-avatar.png" },
  { id: 11, name: "Francis Nasyomba", address: "12 Oba Akran Avenue, Ikeja, Lagos", checkIn: "8:25AM", checkOut: "Still Active", role: "Field Agent", status: "Present", subText: "Active", active: true, avatar: "/avatars/male-avatar.png" },
];

export function AttendanceView() {
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [selectedId, setSelectedId] = useState<number>(attendanceList[0].id);

  const selected = attendanceList.find((i) => i.id === selectedId) ?? attendanceList[0];

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[20px] font-extrabold text-[#09232D] shrink-0"></h1>

        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 flex-1 md:justify-end min-w-0">
          {/* Search */}
          <div className="relative w-full md:w-[458px] group shrink-0">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-[#09232D] transition-colors"
              size={18}
              strokeWidth={2}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by agent name..."
              className="w-full bg-white pl-13 pr-5 text-[14px] placeholder:text-gray-400 placeholder:font-medium outline-none focus:ring-2 focus:ring-[#09232D]/10 transition-all font-sans"
              style={{
                height: '46px',
                borderRadius: '24px',
                border: '0.7px solid #D7D7D7',
                boxShadow: '0px 1px 3px 0px #0000004D, 0px 4px 8px 3px #00000026'
              }}
            />
          </div>

          {/* Filter toggle — icon before text */}
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl transition-all shrink-0 cursor-pointer ${
              showFilters ? 'text-white' : 'text-gray-500'
            }`}
            style={{ 
              background: showFilters ? '#34373C' : '#F8F8F8',
              border: showFilters ? '0.5px solid #34373C' : '0.5px solid #D1D1D1',
              boxShadow: showFilters ? 'none' : '0 2px 8px rgba(0, 0, 0, 0.06)'
            }}
          >
            <SlidersHorizontal size={14} strokeWidth={2} />
            <span style={{
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 400,
              fontStyle: 'normal',
              fontSize: '10px',
              lineHeight: '100%',
              letterSpacing: '0%',
              verticalAlign: 'middle'
            }}>
              Filter
            </span>
          </button>

          {/* Create — shorter than search */}
          <button
            onClick={() => setShowAddAgent(true)}
            className="flex items-center gap-2 px-5 py-3 bg-[#09232D] text-white rounded-xl text-[13px] font-bold hover:opacity-90 transition-all shrink-0 cursor-pointer"
            style={{ boxShadow: '0 4px 14px rgba(9, 35, 45, 0.3)' }}
          >
            <BookmarkPlus size={15} strokeWidth={2} />
            <span className="hidden sm:inline whitespace-nowrap">Add New Agent</span>
            <span className="sm:hidden">New</span>
          </button>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row gap-5 mt-2">

        {/* ── Left: attendance list ──────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          <OpsTableContainer>
            <div className="flex justify-end mb-5">
              <Link
                href="/operations/attendance"
                className="px-5 py-2 bg-dash-dark text-white rounded-full text-[12px] font-semibold hover:opacity-90 transition-colors"
              >
                Attendance List
              </Link>
            </div>

            <div className="space-y-3">
              {attendanceList.map((item) => {
                const isSelected = item.id === selectedId;
                return (
                  <OpsTableRow
                    key={item.id}
                    isSelected={isSelected}
                    onClick={() => setSelectedId(item.id)}
                    avatar={item.avatar}
                    avatarAlt={item.name}
                  >
                    <OpsTableNameCol name={item.name} subText={item.address} isSelected={isSelected} />
                    <OpsTableCol label="Check-In" value={item.checkIn} isSelected={isSelected} className="hidden sm:block w-28 sm:w-32" />
                    <OpsTableCol label="Check-Out" value={item.checkOut} isSelected={isSelected} className="hidden md:block w-36 sm:w-40" />
                    <OpsTableCol label="Role" value={item.role} isSelected={isSelected} className="hidden lg:block w-28 sm:w-32" />
                    <OpsTableStatus
                      label={item.status}
                      subText={item.subText}
                      isSelected={isSelected}
                      badgeClass={item.active ? 'bg-[#2F6C0E] text-white' : 'bg-[#EF7129] text-white'}
                    />
                  </OpsTableRow>
                );
              })}
            </div>
          </OpsTableContainer>
        </div>

        {/* ── Right: detail sidebar ──────────────────────────── */}
        <div className="flex flex-col gap-5 w-full xl:w-90 xl:shrink-0">
          {/* Agent Info Card */}
          <div className="px-4 sm:px-8">
            <div className="flex items-start gap-5">
              <div className="flex-1 space-y-3 min-w-0">
                <div>
                  <h3 className="text-[13px] font-extrabold text-dash-dark leading-tight">{selected.name}</h3>
                  <p className="text-[11px] text-gray-400 mt-1 leading-relaxed max-w-45">{selected.address}</p>
                </div>
                <div>
                  <p className="text-[13px] font-bold text-dash-dark mb-0.5">Role</p>
                  <p className="text-[12px] text-gray-400">{selected.role}</p>
                </div>
                <div>
                  <p className="text-[13px] font-bold text-dash-dark mb-0.5">Check-In</p>
                  <p className="text-[12px] text-gray-400">{selected.checkIn}</p>
                </div>
                <div>
                  <p className="text-[13px] font-bold text-dash-dark mb-0.5">Check-Out</p>
                  <p className="text-[12px] text-gray-400">{selected.checkOut}</p>
                </div>
              </div>

              <div className="shrink-0 flex flex-col items-center">
                <div className="bg-white p-2 rounded-[30px]">
                  <div className="w-32 h-32 rounded-[22px] overflow-hidden shadow-md">
                    <img src={selected.avatar} className="w-full h-full object-cover" alt={selected.name} />
                  </div>
                  <div className="mt-2.5 flex flex-col items-center gap-1">
                    <p className="text-[13px] font-bold text-dash-dark">{selected.name}</p>
                    <span className={`px-2.5 py-0.75 rounded-full text-[9px] font-bold ${selected.active ? 'bg-[#22C55E] text-white' : 'bg-[#F48243]/20 text-[#F48243]'}`}>
                      {selected.status}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-4">
                  <svg width="33" height="33" viewBox="0 0 33 33" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="16.2378" cy="16.2378" r="15.9878" fill="#EAEAEA" stroke="#DFDFDF" strokeWidth="0.5" />
                    <path d="M13.9717 18.5035H19.2584M13.9717 14.7273H16.615" stroke="#2F5E71" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M18.2543 23.33C21.4135 23.12 23.9299 20.5678 24.137 17.3639C24.1775 16.7369 24.1775 16.0875 24.137 15.4605C23.9299 12.2565 21.4135 9.70435 18.2543 9.49435C17.1765 9.42271 16.0512 9.42286 14.9756 9.49435C11.8164 9.70435 9.29995 12.2565 9.09289 15.4605C9.05237 16.0875 9.05237 16.7369 9.09289 17.3639C9.16831 18.5308 9.68439 19.6113 10.292 20.5236C10.6447 21.1623 10.4119 21.9595 10.0445 22.6558C9.77953 23.1579 9.64706 23.4089 9.75343 23.5903C9.85979 23.7716 10.0974 23.7774 10.5726 23.789C11.5123 23.8118 12.1459 23.5454 12.6489 23.1745C12.9342 22.9642 13.0768 22.859 13.1751 22.8469C13.2734 22.8348 13.4669 22.9145 13.8538 23.0738C14.2015 23.217 14.6052 23.3054 14.9756 23.33C16.0512 23.4015 17.1765 23.4017 18.2543 23.33Z" stroke="#2F5E71" strokeLinejoin="round" />
                  </svg>
                  <svg width="33" height="33" viewBox="0 0 33 33" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="16.2378" cy="16.2378" r="15.9878" fill="#EAEAEA" stroke="#DFDFDF" strokeWidth="0.5" />
                    <path d="M24.1674 15.4826V14.8916C24.1674 13.4268 24.1674 12.6943 23.725 12.2392C23.2825 11.7842 22.5705 11.7842 21.1464 11.7842H19.5766C18.8837 11.7842 18.878 11.7828 18.255 11.471L15.7388 10.2119C14.6882 9.68616 14.1629 9.4233 13.6033 9.44156C13.0437 9.45983 12.5357 9.75643 11.5197 10.3496L10.5923 10.891C9.84598 11.3267 9.47282 11.5446 9.26765 11.907C9.0625 12.2695 9.0625 12.7108 9.0625 13.5936V19.7994C9.0625 20.9592 9.0625 21.5392 9.32099 21.862C9.493 22.0767 9.73403 22.2211 10.0005 22.269C10.401 22.3409 10.8913 22.0546 11.8719 21.4821C12.5378 21.0933 13.1787 20.6896 13.9753 20.7991C14.6428 20.8908 15.2631 21.312 15.8597 21.6105" stroke="#2F5E71" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M13.5942 9.44067V20.7693" stroke="#2F5E71" strokeLinejoin="round" />
                    <path d="M18.8809 11.7063V14.7273" stroke="#2F5E71" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M20.7692 16.6155C22.6085 16.6155 24.1678 18.1384 24.1678 19.9861C24.1678 21.8631 22.5831 23.1804 21.1193 24.076C21.0126 24.1363 20.8919 24.1679 20.7692 24.1679C20.6465 24.1679 20.5258 24.1363 20.4192 24.076C18.9581 23.1716 17.3706 21.8696 17.3706 19.9861C17.3706 18.1384 18.93 16.6155 20.7692 16.6155Z" stroke="#2F5E71" />
                    <path d="M20.8633 20.014H20.7689M20.9577 20.014C20.9577 20.1183 20.8732 20.2028 20.7689 20.2028C20.6646 20.2028 20.5801 20.1183 20.5801 20.014C20.5801 19.9097 20.6646 19.8252 20.7689 19.8252C20.8732 19.8252 20.9577 19.9097 20.9577 20.014Z" stroke="#2F5E71" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <svg width="33" height="33" viewBox="0 0 33 33" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="16.2378" cy="16.2378" r="15.9878" fill="#EAEAEA" stroke="#DFDFDF" strokeWidth="0.5" />
                    <path d="M16.6154 9.06299C20.7865 9.06299 24.1679 12.4443 24.1679 16.6154C24.1679 20.7866 20.7865 24.1679 16.6154 24.1679C12.4443 24.1679 9.06299 20.7866 9.06299 16.6154M14.281 9.43069C13.5189 9.67812 12.81 10.0434 12.1758 10.5051M10.5051 12.1757C10.0433 12.8101 9.678 13.5192 9.43057 14.2814" stroke="#2F5E71" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M16.6157 13.5945V19.6364M19.6367 16.6154H13.5947" stroke="#2F5E71" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Tracking card */}
          <div className="bg-dash-dark rounded-4xl p-6 shadow-2xl">
            <div className="flex items-start gap-4 mb-5">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-gray-400 font-bold mb-0.5">Check-In Time</p>
                <p className="text-[15px] font-bold text-white">{selected.checkIn}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-gray-400 font-bold mb-0.5">Check-Out Time</p>
                <p className="text-[13px] font-medium text-white/70">{selected.checkOut}</p>
              </div>
              <div className={`px-3 py-1.5 rounded-full text-[10px] font-bold shrink-0 self-start ${selected.active ? "bg-[#1A452C] text-[#4ADE80]" : "bg-gray-700 text-gray-300"}`}>
                {selected.active ? "On-Time" : "Absent"}
              </div>
            </div>

            <div className="mb-4">
              <p className="text-[15px] font-bold text-white mb-0.5">Location (Check-In)</p>
              <p className="text-[12px] text-gray-400">{selected.address}</p>
            </div>

            {/* Map */}
            <div className="relative h-44 w-full rounded-[18px] bg-[#e8ecef] overflow-hidden">
              <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-50">
                <defs>
                  <pattern id="attgrid" width="36" height="36" patternUnits="userSpaceOnUse">
                    <path d="M 36 0 L 0 0 0 36" fill="none" stroke="#CBD5E1" strokeWidth="0.8" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#attgrid)" />
              </svg>
              <div className="absolute left-[30%] top-0 bottom-0 w-9 bg-white/60 pointer-events-none" />
              <div className="absolute top-[48%] left-0 right-0 h-8 bg-white/60 pointer-events-none" />
              <div className="absolute right-0 top-[28%] w-10 h-14 bg-[#A8D5B5]/60 pointer-events-none" />
              <div className="absolute pointer-events-none" style={{ left: "28%", top: 6 }}>
                <span className="text-[8px] font-semibold text-gray-600 block leading-tight">Dresd</span>
                <span className="text-[8px] font-semibold text-gray-600 block leading-tight">Street</span>
              </div>
              <div className="absolute right-1 top-[16%] pointer-events-none">
                <span className="text-[7px] font-semibold text-gray-500 block leading-tight">McDow</span>
                <span className="text-[7px] font-semibold text-gray-500 block leading-tight">ell Str</span>
              </div>
              <div className="absolute" style={{ left: "32%", top: "25%" }}>
                <MapPin size={20} className="text-red-500 fill-red-500 drop-shadow-md" />
              </div>
              <div className="absolute flex flex-col items-center" style={{ left: "calc(32% - 14px)", top: "48%" }}>
                <div className="w-7 h-7 rounded-full border-2 border-white shadow-md overflow-hidden">
                  <img src={selected.avatar} className="w-full h-full object-cover" alt="Agent" />
                </div>
                <div className="bg-white px-2 py-0.5 rounded-lg mt-1 whitespace-nowrap shadow-md">
                  <p className="text-[8px] font-bold text-dash-dark">{selected.name}</p>
                  <p className="text-[7px] text-gray-400">Active at Kemsi Street</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showAddAgent && <AddAgentModal onClose={() => setShowAddAgent(false)} />}
    </div>
  );
}
