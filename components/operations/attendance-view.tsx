"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MessageSquare,
  Map as MapIcon,
  Plus,
  MapPin,
  Search,
  SlidersHorizontal,
  BookmarkPlus,
} from "lucide-react";
import { AddAgentModal } from "./add-agent-modal";

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
  {
    id: 1,
    name: "Francis Nasyomba",
    address: "12 Oba Akran Avenue, Ikeja, Lagos",
    checkIn: "No check-in record",
    checkOut: "No check-out record",
    role: "Field Agent",
    status: "Absent",
    subText: "Since Yesterday",
    active: false,
    avatar: "https://i.pravatar.cc/150?u=11",
  },
  {
    id: 2,
    name: "Francis Nasyomba",
    address: "12 Oba Akran Avenue, Ikeja, Lagos",
    checkIn: "8:25AM",
    checkOut: "Still Active",
    role: "Field Agent",
    status: "Present",
    subText: "Active",
    active: true,
    avatar: "https://i.pravatar.cc/150?u=12",
  },
  {
    id: 3,
    name: "Francis Nasyomba",
    address: "12 Oba Akran Avenue, Ikeja, Lagos",
    checkIn: "No check-in record",
    checkOut: "No check-out record",
    role: "Field Agent",
    status: "Absent",
    subText: "Since Yesterday",
    active: false,
    avatar: "https://i.pravatar.cc/150?u=13",
  },
  {
    id: 4,
    name: "Francis Nasyomba",
    address: "12 Oba Akran Avenue, Ikeja, Lagos",
    checkIn: "No check-in record",
    checkOut: "No check-out record",
    role: "Field Agent",
    status: "Absent",
    subText: "Since Yesterday",
    active: false,
    avatar: "https://i.pravatar.cc/150?u=14",
  },
  {
    id: 5,
    name: "Francis Nasyomba",
    address: "12 Oba Akran Avenue, Ikeja, Lagos",
    checkIn: "8:25AM",
    checkOut: "Still Active",
    role: "Field Agent",
    status: "Present",
    subText: "Active",
    active: true,
    avatar: "https://i.pravatar.cc/150?u=15",
  },
  {
    id: 6,
    name: "Francis Nasyomba",
    address: "12 Oba Akran Avenue, Ikeja, Lagos",
    checkIn: "No check-in record",
    checkOut: "No check-out record",
    role: "Field Agent",
    status: "Absent",
    subText: "Since Yesterday",
    active: false,
    avatar: "https://i.pravatar.cc/150?u=16",
  },
  {
    id: 7,
    name: "Francis Nasyomba",
    address: "12 Oba Akran Avenue, Ikeja, Lagos",
    checkIn: "No check-in record",
    checkOut: "No check-out record",
    role: "Field Agent",
    status: "Absent",
    subText: "Since Yesterday",
    active: false,
    avatar: "https://i.pravatar.cc/150?u=17",
  },
  {
    id: 8,
    name: "Francis Nasyomba",
    address: "12 Oba Akran Avenue, Ikeja, Lagos",
    checkIn: "8:25AM",
    checkOut: "Still Active",
    role: "Field Agent",
    status: "Present",
    subText: "Active",
    active: true,
    avatar: "https://i.pravatar.cc/150?u=18",
  },
  {
    id: 9,
    name: "Francis Nasyomba",
    address: "12 Oba Akran Avenue, Ikeja, Lagos",
    checkIn: "No check-in record",
    checkOut: "No check-out record",
    role: "Field Agent",
    status: "Absent",
    subText: "Since Yesterday",
    active: false,
    avatar: "https://i.pravatar.cc/150?u=19",
  },
  {
    id: 10,
    name: "Francis Nasyomba",
    address: "12 Oba Akran Avenue, Ikeja, Lagos",
    checkIn: "No check-in record",
    checkOut: "No check-out record",
    role: "Field Agent",
    status: "Absent",
    subText: "Since Yesterday",
    active: false,
    avatar: "https://i.pravatar.cc/150?u=20",
  },
  {
    id: 11,
    name: "Francis Nasyomba",
    address: "12 Oba Akran Avenue, Ikeja, Lagos",
    checkIn: "8:25AM",
    checkOut: "Still Active",
    role: "Field Agent",
    status: "Present",
    subText: "Active",
    active: true,
    avatar: "https://i.pravatar.cc/150?u=21",
  },
];

export function AttendanceView() {
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [selectedId, setSelectedId] = useState<number>(attendanceList[0].id);

  const selected =
    attendanceList.find((i) => i.id === selectedId) ?? attendanceList[0];

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center gap-3 w-full justify-between">
        <div></div>
        {/* ── Toolbar ──────────────────────────────────────────── */}
        <div className="flex items-center gap-3 min-w-[800px]">
          <div className="relative flex-1 group">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-dash-teal transition-colors"
              size={17}
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by agent name..."
              className="w-full bg-white border border-gray-100 rounded-full py-3.5 pl-12 pr-5 text-[13px] outline-none focus:ring-2 focus:ring-dash-teal/20 transition-all shadow-sm"
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`flex items-center gap-2.5 px-6 py-3.5 rounded-full text-[13px] font-bold transition-all shadow-sm border shrink-0 ${
              showFilters
                ? "bg-[#0B1215] text-white border-[#0B1215]"
                : "bg-white text-gray-500 border-gray-100 hover:bg-gray-50"
            }`}
          >
            <span className="opacity-70">Filter</span>
            <SlidersHorizontal size={14} className="opacity-70" />
          </button>
          <button
            onClick={() => setShowAddAgent(true)}
            className="flex items-center gap-2 px-4 sm:px-6 py-3 bg-[#09232D] text-white rounded-xl text-[13px] font-bold hover:opacity-90 transition-all shadow-lg shrink-0 cursor-pointer"
          >
            <span>Add New Agent</span>
            <BookmarkPlus size={16} />
          </button>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row gap-5 mt-2">
        {/* ── Left: attendance list ──────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          <div className="bg-white rounded-4xl p-5 sm:p-8 shadow-sm">
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
                  <div
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                    className={`flex items-center rounded-[20px] overflow-hidden cursor-pointer transition-all hover:shadow-md ${
                      isSelected ? "bg-dash-dark" : "bg-gray-50/60"
                    }`}
                  >
                    <div
                      className={`w-2 self-stretch shrink-0 ${isSelected ? "bg-[#3B82F6]" : "bg-[#93C5FD]/60"}`}
                    />

                    <div className="w-12 h-12 rounded-full border-2 border-white shadow-sm overflow-hidden shrink-0 my-4 mx-3 sm:mx-4">
                      <img
                        src={item.avatar}
                        className="w-full h-full object-cover"
                        alt={item.name}
                      />
                    </div>

                    {/* Name — fixed width */}
                    <div className="w-32.5 sm:w-40 shrink-0 py-4 pr-3 min-w-0">
                      <p
                        className={`text-[13px] font-bold truncate ${isSelected ? "text-white" : "text-dash-dark"}`}
                      >
                        {item.name}
                      </p>
                      <p
                        className={`text-[11px] mt-0.5 truncate ${isSelected ? "text-white/50" : "text-gray-400"}`}
                      >
                        {item.address}
                      </p>
                    </div>

                    {/* Check-In — fixed width */}
                    <div className="hidden sm:block w-27.5 shrink-0 py-4 pr-3">
                      <p
                        className={`text-[11px] font-bold mb-0.5 ${isSelected ? "text-white/40" : "text-gray-400"}`}
                      >
                        Check-In
                      </p>
                      <p
                        className={`text-[13px] font-medium truncate ${isSelected ? "text-white/80" : "text-gray-600"}`}
                      >
                        {item.checkIn}
                      </p>
                    </div>

                    {/* Check-Out — fixed width */}
                    <div className="hidden md:block w-37.5 shrink-0 py-4 pr-3">
                      <p
                        className={`text-[11px] font-bold mb-0.5 ${isSelected ? "text-white/40" : "text-gray-400"}`}
                      >
                        Check-Out
                      </p>
                      <p
                        className={`text-[13px] font-medium truncate ${isSelected ? "text-white/80" : "text-gray-600"}`}
                      >
                        {item.checkOut}
                      </p>
                    </div>

                    {/* Role — fixed width */}
                    <div className="hidden lg:block w-27.5 shrink-0 py-4 pr-3">
                      <p
                        className={`text-[11px] font-bold mb-0.5 ${isSelected ? "text-white/40" : "text-gray-400"}`}
                      >
                        Role
                      </p>
                      <p
                        className={`text-[13px] font-medium truncate ${isSelected ? "text-white/80" : "text-gray-600"}`}
                      >
                        {item.role}
                      </p>
                    </div>

                    {/* Status */}
                    <div className="ml-auto shrink-0 text-right py-4 pr-4 sm:pr-5">
                      <div
                        className={`inline-block px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap ${
                          item.active
                            ? "bg-[#1A452C] text-[#4ADE80]"
                            : "bg-[#F48243] text-white"
                        }`}
                      >
                        {item.status}
                      </div>
                      <p
                        className={`text-[11px] mt-1 ${isSelected ? "text-white/40" : "text-gray-400"}`}
                      >
                        {item.subText}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Right: detail sidebar ──────────────────────────── */}
        <div className="flex flex-col gap-5 w-full xl:w-90 xl:shrink-0">
          {/* Agent info */}
          <div>
            <div className="flex flex-col sm:flex-row items-start gap-6">
              <div className="flex-1 space-y-4 min-w-0">
                <div>
                  <h3 className="text-[17px] font-bold text-dash-dark">
                    {selected.name}
                  </h3>
                  <p className="text-[12px] text-gray-400 mt-1 leading-relaxed">
                    {selected.address}
                  </p>
                </div>
                <div>
                  <p className="text-[13px] font-bold text-dash-dark mb-0.5">
                    Role
                  </p>
                  <p className="text-[13px] text-gray-400">{selected.role}</p>
                </div>
                <div>
                  <p className="text-[13px] font-bold text-dash-dark mb-0.5">
                    Check-In
                  </p>
                  <p className="text-[13px] text-gray-400">
                    {selected.checkIn}
                  </p>
                </div>
                <div>
                  <p className="text-[13px] font-bold text-dash-dark mb-0.5">
                    Check-Out
                  </p>
                  <p className="text-[13px] text-gray-400">
                    {selected.checkOut}
                  </p>
                </div>
              </div>
              <div className="shrink-0 w-36">
                <div className="w-36 h-44 rounded-3xl overflow-hidden shadow-lg bg-[#C9A84C]">
                  <img
                    src={selected.avatar}
                    className="w-full h-full object-cover"
                    alt={selected.name}
                  />
                </div>
                <div className="mt-2 text-center">
                  <p className="text-[12px] font-bold text-dash-dark">
                    {selected.name}
                  </p>
                  <div className="flex items-center justify-center gap-2 mt-0.5">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${
                        selected.active
                          ? "bg-[#1A452C] text-[#4ADE80]"
                          : "bg-[#F48243]/20 text-[#F48243]"
                      }`}
                    >
                      {selected.status}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              {[MessageSquare, MapIcon, Plus].map((Icon, i) => (
                <button
                  key={i}
                  className="w-10 h-10 bg-white text-gray-400 rounded-full flex items-center justify-center hover:bg-gray-50 transition-all border border-gray-100 shadow-sm"
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>
          </div>

          {/* Tracking card */}
          <div className="bg-dash-dark rounded-4xl p-6 shadow-2xl">
            <div className="flex items-start gap-4 mb-5">
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-gray-400 font-bold mb-0.5">
                  Check-In Time
                </p>
                <p className="text-[15px] font-bold text-white">
                  {selected.checkIn}
                </p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-gray-400 font-bold mb-0.5">
                  Check-Out Time
                </p>
                <p className="text-[13px] font-medium text-white/70">
                  {selected.checkOut}
                </p>
              </div>
              <div
                className={`px-3 py-1.5 rounded-full text-[10px] font-bold shrink-0 self-start ${
                  selected.active
                    ? "bg-[#1A452C] text-[#4ADE80]"
                    : "bg-gray-700 text-gray-300"
                }`}
              >
                {selected.active ? "On-Time" : "Absent"}
              </div>
            </div>

            <div className="mb-4">
              <p className="text-[15px] font-bold text-white mb-0.5">
                Location (Check-In)
              </p>
              <p className="text-[12px] text-gray-400">{selected.address}</p>
            </div>

            {/* Map */}
            <div className="relative h-44 w-full rounded-[18px] bg-[#e8ecef] overflow-hidden">
              <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-50">
                <defs>
                  <pattern
                    id="attgrid"
                    width="36"
                    height="36"
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d="M 36 0 L 0 0 0 36"
                      fill="none"
                      stroke="#CBD5E1"
                      strokeWidth="0.8"
                    />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#attgrid)" />
              </svg>
              <div className="absolute left-[30%] top-0 bottom-0 w-9 bg-white/60 pointer-events-none" />
              <div className="absolute top-[48%] left-0 right-0 h-8 bg-white/60 pointer-events-none" />
              <div className="absolute right-0 top-[28%] w-10 h-14 bg-[#A8D5B5]/60 pointer-events-none" />
              <div
                className="absolute pointer-events-none"
                style={{ left: "28%", top: 6 }}
              >
                <span className="text-[8px] font-semibold text-gray-600 block leading-tight">
                  Dresd
                </span>
                <span className="text-[8px] font-semibold text-gray-600 block leading-tight">
                  Street
                </span>
              </div>
              <div className="absolute right-1 top-[16%] pointer-events-none">
                <span className="text-[7px] font-semibold text-gray-500 block leading-tight">
                  McDow
                </span>
                <span className="text-[7px] font-semibold text-gray-500 block leading-tight">
                  ell Str
                </span>
              </div>
              <div className="absolute" style={{ left: "32%", top: "25%" }}>
                <MapPin
                  size={20}
                  className="text-red-500 fill-red-500 drop-shadow-md"
                />
              </div>
              <div
                className="absolute flex flex-col items-center"
                style={{ left: "calc(32% - 14px)", top: "48%" }}
              >
                <div className="w-7 h-7 rounded-full border-2 border-white shadow-md overflow-hidden">
                  <img
                    src={selected.avatar}
                    className="w-full h-full object-cover"
                    alt="Agent"
                  />
                </div>
                <div className="bg-white px-2 py-0.5 rounded-lg mt-1 whitespace-nowrap shadow-md">
                  <p className="text-[8px] font-bold text-dash-dark">
                    {selected.name}
                  </p>
                  <p className="text-[7px] text-gray-400">
                    Active at Kemsi Street
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Modal ─────────────────────────────────────────────── */}
      {showAddAgent && <AddAgentModal onClose={() => setShowAddAgent(false)} />}
    </div>
  );
}
