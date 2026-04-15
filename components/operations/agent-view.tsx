"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, BookmarkPlus } from "lucide-react";
import { AgentCurveChart } from "./agent-curve-chart";
import { AgentList, AGENT_LIST_DATA } from "./agent-list";
import type { AgentItem } from "./agent-list";
import { AgentSidebar } from "./agent-sidebar";
import { AddAgentModal } from "./add-agent-modal";

export function AgentView() {
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentItem>(
    AGENT_LIST_DATA[0],
  );

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
              placeholder="Search for Agents"
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

      {/* ── Content ───────────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row gap-5 mt-2">
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          <AgentCurveChart />
          <AgentList
            selectedId={selectedAgent.id}
            onSelect={setSelectedAgent}
          />
        </div>
        <AgentSidebar agent={selectedAgent} />
      </div>

      {/* ── Modal ─────────────────────────────────────────────── */}
      {showAddAgent && <AddAgentModal onClose={() => setShowAddAgent(false)} />}
    </div>
  );
}
