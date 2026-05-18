"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, SlidersHorizontal, BookmarkPlus } from "lucide-react";
import { AgentCurveChart } from "./agent-curve-chart";
import { AgentList } from "./agent-list";
import type { AgentItem } from "./agent-list";
import { AgentSidebar } from "./agent-sidebar";
import { AddAgentModal } from "./add-agent-modal";
import { useInternalUsers } from "@/hooks/use-internal-users";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";

function mapToAgentItem(input: {
  id: number;
  name: string;
  email: string;
  role: string;
  assigned_zone?: string | null;
  phone_number?: string | null;
  avatar_url?: string | null;
  is_active?: boolean;
}): AgentItem {
  const isActive = Boolean(input.is_active);

  return {
    id: String(input.id),
    name: input.name,
    description: input.email,
    zone: input.assigned_zone ?? "Unassigned",
    phone: input.phone_number ?? "N/A",
    role: input.role,
    status: isActive ? "Active (View on Map)" : "Offline",
    time: isActive ? "Online" : "Offline",
    avatar: input.avatar_url ?? "/avatars/male-avatar.png",
    active: isActive,
  };
}

export function AgentView({ basePath }: { basePath: string }) {
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showAddAgent, setShowAddAgent] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<AgentItem | null>(null);

  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);

  const { data: internalUsers = [], isLoading } = useInternalUsers({
    company_id: companyId ?? undefined,
    role: "agent",
  });

  const agents = useMemo(
    () =>
      internalUsers
        .map((item) =>
          mapToAgentItem({
            id: item.id,
            name: item.name,
            email: item.email,
            role: item.internal_role ?? item.role,
            assigned_zone: item.assigned_zone,
            phone_number: item.phone_number,
            avatar_url: item.avatar_url,
            is_active: item.is_active,
          })
        )
        .filter((agent) =>
          [agent.name, agent.zone, agent.phone]
            .join(" ")
            .toLowerCase()
            .includes(search.trim().toLowerCase())
        ),
    [internalUsers, search]
  );

  useEffect(() => {
    if (!agents.length) {
      setSelectedAgent(null);
      return;
    }

    setSelectedAgent((current) => {
      if (!current) return agents[0];
      return agents.find((agent) => agent.id === current.id) ?? agents[0];
    });
  }, [agents]);

  return (
    <div className="flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* ── Toolbar ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <h1 className="text-[20px] font-extrabold text-[#09232D] shrink-0">
          <span className="lg:hidden">Agents Overview</span>
        </h1>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1 lg:justify-end min-w-0 mt-2 lg:mt-0 lg:-mt-16 xl:-mt-20 transition-all duration-300 relative z-10">
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
              placeholder="Search for Agents"
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

      {/* ── Content ───────────────────────────────────────────── */}
      <div className="flex flex-col xl:flex-row gap-5 mt-2">
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          <AgentCurveChart />
          {isLoading ? (
            <div className="bg-white rounded-3xl p-8 text-[13px] text-gray-400 shadow-[0px_1px_3px_0px_#0000004D,0px_4px_8px_3px_#00000026]">
              Loading agents...
            </div>
          ) : (
            <AgentList
              agents={agents}
              basePath={basePath}
              selectedId={selectedAgent?.id}
              onSelect={setSelectedAgent}
            />
          )}
        </div>
        <AgentSidebar agent={selectedAgent} />
      </div>

      {/* ── Modal ─────────────────────────────────────────────── */}
      {showAddAgent && <AddAgentModal onClose={() => setShowAddAgent(false)} />}
    </div>
  );
}
