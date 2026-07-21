"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  CheckCircle2,
  Sparkles,
  Wifi,
  Navigation,
  Clock,
  UserCheck,
  TrendingUp,
  Sliders,
  Layers,
  ChevronRight,
  Zap,
} from "lucide-react";

type TabType = "tracking" | "dispatch" | "ai";

const agents = [
  {
    name: "Sarah M.",
    role: "Senior Field Agent",
    status: "On Client Visit",
    location: "Lagos Central • Zone A",
    avatar: "/avatars/female-avatar.png",
    statusColor: "bg-emerald-400",
    top: "32%",
    left: "28%",
    pulseColor: "border-emerald-400/50",
  },
  {
    name: "John D.",
    role: "Territory Sales Rep",
    status: "In Transit",
    location: "Ikeja Expressway • Zone B",
    avatar: "/avatars/john_avatar.png",
    statusColor: "bg-amber-400",
    top: "58%",
    left: "62%",
    pulseColor: "border-amber-400/50",
  },
  {
    name: "Donald N.",
    role: "Account Executive",
    status: "Syncing Offline Data",
    location: "Victoria Island • Zone C",
    avatar: "/avatars/donald_avatar.png",
    statusColor: "bg-sky-400",
    top: "24%",
    left: "76%",
    pulseColor: "border-sky-400/50",
  },
];

const dispatchTasks = [
  {
    title: "Store Audit & Inventory Check",
    client: "Apex Retail • Ikeja Mall",
    assignee: "Sarah M.",
    avatar: "/avatars/female-avatar.png",
    time: "10:30 AM",
    status: "In Progress",
    priority: "High",
    priorityBg: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  },
  {
    title: "Quarterly POS Setup & Verification",
    client: "Crest Holdings Ltd.",
    assignee: "John D.",
    avatar: "/avatars/john_avatar.png",
    time: "11:45 AM",
    status: "Dispatched",
    priority: "Medium",
    priorityBg: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  },
  {
    title: "Client Onboarding & Contract Signoff",
    client: "Zenith Financial Center",
    assignee: "Donald N.",
    avatar: "/avatars/donald_avatar.png",
    time: "02:15 PM",
    status: "Completed",
    priority: "Normal",
    priorityBg: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  },
];

export default function FieldCommandHubHero() {
  const [activeTab, setActiveTab] = useState<TabType>("tracking");
  const [selectedAgent, setSelectedAgent] = useState<number>(0);

  return (
    <div className="w-full max-w-lg lg:max-w-xl mx-auto flex flex-col gap-3 font-sans select-none">
      {/* Top Glassmorphic Navigation Bar */}
      <div className="flex items-center justify-between bg-white/10 backdrop-blur-xl border border-white/15 p-1.5 rounded-2xl shadow-xl">
        <button
          onClick={() => setActiveTab("tracking")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            activeTab === "tracking"
              ? "bg-gradient-to-r from-[#1E5A69] to-[#133139] text-white shadow-md border border-white/20"
              : "text-white/70 hover:text-white hover:bg-white/5"
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>Live Tracking</span>
        </button>

        <button
          onClick={() => setActiveTab("dispatch")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            activeTab === "dispatch"
              ? "bg-gradient-to-r from-[#1E5A69] to-[#133139] text-white shadow-md border border-white/20"
              : "text-white/70 hover:text-white hover:bg-white/5"
          }`}
        >
          <Layers className="w-4 h-4 text-[#9BDD7C]" />
          <span>Task Dispatch</span>
        </button>

        <button
          onClick={() => setActiveTab("ai")}
          className={`flex-1 flex items-center justify-center gap-2 py-2 px-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
            activeTab === "ai"
              ? "bg-gradient-to-r from-[#1E5A69] to-[#133139] text-white shadow-md border border-white/20"
              : "text-white/70 hover:text-white hover:bg-white/5"
          }`}
        >
          <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
          <span>ELY AI Engine</span>
        </button>
      </div>

      {/* Main Glass Visual Viewport */}
      <div className="relative w-full h-[330px] sm:h-[360px] bg-gradient-to-br from-[#0B252C] via-[#113843] to-[#0A1F25] border border-white/15 rounded-3xl overflow-hidden shadow-2xl p-4 flex flex-col justify-between">
        {/* Background Grid Pattern */}
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#9BDD7C_1px,transparent_1px)] [background-size:16px_16px]" />

        <AnimatePresence mode="wait">
          {/* TAB 1: LIVE GPS TRACKING MAP */}
          {activeTab === "tracking" && (
            <motion.div
              key="tracking"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="relative w-full h-full flex flex-col justify-between z-10"
            >
              {/* Simulated GPS Map Canvas */}
              <div className="absolute inset-0 rounded-2xl overflow-hidden">
                {/* SVG Territory Polygons & Waypoints */}
                <svg className="w-full h-full opacity-40" viewBox="0 0 400 300">
                  <path
                    d="M 50,40 L 180,60 L 220,160 L 90,180 Z"
                    fill="url(#zone-a)"
                    stroke="#9BDD7C"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                  <path
                    d="M 230,70 L 370,50 L 350,220 L 210,170 Z"
                    fill="url(#zone-b)"
                    stroke="#38BDF8"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                  {/* Route Paths */}
                  <path
                    d="M 112,96 Q 160,120 248,174"
                    fill="none"
                    stroke="#9BDD7C"
                    strokeWidth="2"
                  />
                  <line
                    x1="248"
                    y1="174"
                    x2="304"
                    y2="72"
                    stroke="#FBBF24"
                    strokeWidth="2"
                    strokeDasharray="3 3"
                  />
                  <defs>
                    <linearGradient id="zone-a" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#9BDD7C" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#9BDD7C" stopOpacity="0.02" />
                    </linearGradient>
                    <linearGradient id="zone-b" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#38BDF8" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#38BDF8" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                </svg>

                {/* Agent GPS Markers */}
                {agents.map((agent, i) => (
                  <button
                    key={i}
                    onClick={() => setSelectedAgent(i)}
                    style={{ top: agent.top, left: agent.left }}
                    className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer z-20"
                  >
                    <div className="relative flex items-center justify-center">
                      <span
                        className={`absolute w-8 h-8 rounded-full border ${agent.pulseColor} animate-ping opacity-75`}
                      />
                      <div className="relative w-9 h-9 rounded-full overflow-hidden border-2 border-white shadow-lg transition-transform group-hover:scale-110">
                        <Image
                          src={agent.avatar}
                          alt={agent.name}
                          width={36}
                          height={36}
                          className="object-cover w-full h-full"
                        />
                      </div>
                      <span
                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-[#0B252C] ${agent.statusColor}`}
                      />
                    </div>

                    {/* Hover Tooltip */}
                    <div className="absolute left-1/2 -translate-x-1/2 bottom-11 opacity-0 group-hover:opacity-100 transition-opacity bg-black/80 backdrop-blur-md text-white text-[10px] font-bold px-2.5 py-1 rounded-lg whitespace-nowrap shadow-xl border border-white/20 pointer-events-none">
                      {agent.name} • {agent.status}
                    </div>
                  </button>
                ))}
              </div>

              {/* Top Bar: Geofence Badge */}
              <div className="flex items-center justify-between relative z-10">
                <div className="inline-flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/15 text-xs text-white/90">
                  <MapPin className="w-3.5 h-3.5 text-[#9BDD7C]" />
                  <span className="font-bold">Active Zone: Lagos Metro (3 Squads)</span>
                </div>

                <div className="inline-flex items-center gap-1.5 bg-emerald-500/20 backdrop-blur-md px-3 py-1 rounded-full border border-emerald-400/30 text-[11px] font-semibold text-emerald-300">
                  <Wifi className="w-3 h-3 text-emerald-400" />
                  <span>Offline Engine Active</span>
                </div>
              </div>

              {/* Bottom Overlay: Active Selected Agent Card */}
              <div className="relative z-10 bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-3.5 shadow-xl flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-white/30">
                    <Image
                      src={agents[selectedAgent].avatar}
                      alt={agents[selectedAgent].name}
                      width={40}
                      height={40}
                      className="object-cover w-full h-full"
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-white leading-tight">
                        {agents[selectedAgent].name}
                      </h4>
                      <span className="text-[10px] bg-white/15 text-white/90 font-medium px-2 py-0.5 rounded-md">
                        {agents[selectedAgent].role}
                      </span>
                    </div>
                    <p className="text-xs text-[#9BDD7C] font-medium flex items-center gap-1 mt-0.5">
                      <Navigation className="w-3 h-3 shrink-0" />
                      {agents[selectedAgent].status} ({agents[selectedAgent].location})
                    </p>
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  <div className="text-right hidden sm:block">
                    <span className="text-[10px] text-white/60 block font-medium">
                      GPS Precision
                    </span>
                    <span className="text-xs font-bold text-emerald-300">
                      High (&plusmn;3m)
                    </span>
                  </div>
                  <button className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 transition text-white flex items-center justify-center cursor-pointer">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 2: TASK DISPATCH BOARD */}
          {activeTab === "dispatch" && (
            <motion.div
              key="dispatch"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="relative w-full h-full flex flex-col justify-between z-10"
            >
              {/* Header Ticker */}
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-white/90 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#9BDD7C]" />
                  Live Dispatch Queue (3 Active)
                </span>
                <span className="text-[11px] font-semibold text-[#9BDD7C] bg-[#9BDD7C]/10 px-2.5 py-1 rounded-full border border-[#9BDD7C]/20">
                  Auto-Dispatched by ELY
                </span>
              </div>

              {/* Task Cards List */}
              <div className="flex-1 flex flex-col gap-2.5 overflow-hidden justify-center">
                {dispatchTasks.map((task, idx) => (
                  <div
                    key={idx}
                    className="bg-white/10 hover:bg-white/15 transition-all backdrop-blur-md border border-white/15 rounded-xl p-3 flex items-center justify-between gap-3 shadow-md"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 border border-white/20">
                        <Image
                          src={task.avatar}
                          alt={task.assignee}
                          width={32}
                          height={32}
                          className="object-cover w-full h-full"
                        />
                      </div>
                      <div className="min-w-0">
                        <h5 className="text-xs font-bold text-white truncate">
                          {task.title}
                        </h5>
                        <p className="text-[11px] text-white/70 truncate">
                          {task.client} &bull; <span className="text-white/90 font-medium">{task.assignee}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${task.priorityBg}`}
                      >
                        {task.priority}
                      </span>
                      <span className="text-[11px] font-medium text-white/60 hidden sm:inline">
                        {task.time}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Bottom Summary Bar */}
              <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-xs text-white/70">
                <span className="flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  28 Tasks Completed Today
                </span>
                <span className="font-semibold text-white">98.4% On-Time SLA</span>
              </div>
            </motion.div>
          )}

          {/* TAB 3: ELY AI ENGINE */}
          {activeTab === "ai" && (
            <motion.div
              key="ai"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="relative w-full h-full flex flex-col justify-between z-10"
            >
              {/* AI Header */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-amber-400/20 border border-amber-300/40 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  </div>
                  <span className="text-xs font-bold text-white">
                    ELY Field Intelligence Assistant
                  </span>
                </div>
                <span className="text-[10px] font-semibold text-amber-300 bg-amber-400/10 px-2 py-0.5 rounded-md border border-amber-400/20">
                  v2.4 Neural Model
                </span>
              </div>

              {/* AI Chat / Insight Box */}
              <div className="flex-1 bg-black/30 backdrop-blur-md rounded-2xl border border-white/15 p-4 flex flex-col justify-between gap-3">
                <div className="space-y-3">
                  <div className="bg-white/10 rounded-xl p-2.5 text-xs text-white/90 border border-white/10 self-start max-w-[90%]">
                    <span className="font-semibold text-amber-300 block mb-0.5">
                      Operational Query
                    </span>
                    &ldquo;Suggest route optimization for Lagos Central field reps.&rdquo;
                  </div>

                  <div className="bg-[#133139]/80 rounded-xl p-3 text-xs text-white border border-[#9BDD7C]/30 shadow-md">
                    <div className="flex items-center gap-1.5 text-[#9BDD7C] font-bold mb-1">
                      <Zap className="w-3.5 h-3.5" />
                      ELY Smart Recommendation
                    </div>
                    <p className="text-white/80 leading-relaxed text-[11px]">
                      Re-ordering Sarah M.&apos;s 4 afternoon visits saves 28 minutes of transit time and cuts vehicle fuel costs by ~18%.
                    </p>
                  </div>
                </div>

                {/* AI Performance Pill */}
                <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-white/10">
                  <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                    <span className="text-[10px] text-white/60 block">Route Saved</span>
                    <span className="text-xs font-bold text-[#9BDD7C]">42 km/day</span>
                  </div>
                  <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                    <span className="text-[10px] text-white/60 block">Visit Rate</span>
                    <span className="text-xs font-bold text-amber-300">+35% / week</span>
                  </div>
                  <div className="bg-white/5 p-2 rounded-xl border border-white/10">
                    <span className="text-[10px] text-white/60 block">Map Credits</span>
                    <span className="text-xs font-bold text-sky-300">4.8k / 5k</span>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom KPI Ticker */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-3 flex items-center gap-2.5 text-white shadow-lg">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center shrink-0">
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <span className="text-[10px] text-white/60 block font-medium">Field Force</span>
            <span className="text-xs font-bold text-white">18/20 Active</span>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-3 flex items-center gap-2.5 text-white shadow-lg">
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4 text-amber-300" />
          </div>
          <div>
            <span className="text-[10px] text-white/60 block font-medium">Daily Visits</span>
            <span className="text-xs font-bold text-white">142 Logged</span>
          </div>
        </div>

        <div className="bg-white/10 backdrop-blur-md border border-white/15 rounded-2xl p-3 flex items-center gap-2.5 text-white shadow-lg">
          <div className="w-8 h-8 rounded-xl bg-sky-500/20 border border-sky-400/30 flex items-center justify-center shrink-0">
            <Wifi className="w-4 h-4 text-sky-300" />
          </div>
          <div>
            <span className="text-[10px] text-white/60 block font-medium">Offline Sync</span>
            <span className="text-xs font-bold text-white">100% Reliable</span>
          </div>
        </div>
      </div>
    </div>
  );
}
