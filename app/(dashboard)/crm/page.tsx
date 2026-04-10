"use client";

import { TinyButton } from "@/components/ui/tiny-button";
import {
  BookmarkPlus,
  ChevronDown,
  Import,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Tag,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type LeadStatus = "new" | "proposal-sent" | "contacted" | "qualified" | "lost";

interface Lead {
  id: string;
  name: string;
  company: string;
  amount: number;
  badge: string;
  badgeColor: string;
  badgeTextColor: string;
  assignment: string;
  time: string;
  avatar: string;
}

interface LeadColumn {
  id: LeadStatus;
  title: string;
  headerColor: string;
  value: string;
  count: number;
  leads: Lead[];
}

const chartData = [
  { day: "Mon", value: 180 },
  { day: "Tues", value: 250 },
  { day: "Weds", value: 220 },
  { day: "Thurs", value: 380 },
  { day: "Fri", value: 300 },
  { day: "Sat", value: 420 },
];

const makeLead = (id: string): Lead => ({
  id,
  name: "Francis Nasyomba",
  company: "Raisin Capital Limited",
  amount: 40010,
  badge: "Medium",
  badgeColor: "#E8F5E9",
  badgeTextColor: "#22C55E",
  assignment: "Unassigned",
  time: "12 hours ago",
  avatar: `https://i.pravatar.cc/150?u=${id}`,
});

function TotalLeadsCard() {
  return (
    <div className="bg-white rounded-[20px] p-6 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] border border-gray-100 flex flex-col justify-between min-w-0 sm:min-w-[451px]">
      <div className="flex justify-between items-start">
        <h3 className="text-[#34373C] text-sm font-medium">
          Total Leads in Pipeline
        </h3>
        <button className="text-gray-400 hover:text-gray-600">
          <MoreHorizontal size={18} />
        </button>
      </div>

      <div className="flex items-center gap-6 mt-4 justify-between">
        <div>
          <div>
            <span className="text-[50px] font-medium text-[#0B1215] leading-none tracking-tight">
              4,100
            </span>
            <span className="text-[#34373C] text-[15px] font-semibold mt-1">
              Leads
            </span>
          </div>
          <p className="text-[#34373C] text-[14px] mt-1.5">
            73% increase this week
          </p>
        </div>

        {/* Donut / Ring Chart */}
        <div className="relative w-[100px] h-[100px] shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="38"
              stroke="#F3F4F6"
              strokeWidth="9"
              fill="transparent"
            />
            <circle
              cx="50"
              cy="50"
              r="38"
              stroke="#FD6046"
              strokeWidth="9"
              fill="transparent"
              strokeDasharray={`${0.73 * 238.76} ${0.27 * 238.76}`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[15px] font-bold text-[#0B1215]">73%</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeadsChart() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-full w-full min-h-[180px]" />;

  return (
    <div className="rounded-3xl p-6 border-gray-100 flex-1 min-w-0 sm:min-w-[340px]">
      {/* Day labels */}
      <div className="flex items-center justify-between mb-1 px-2">
        {["Mon", "Tues", "Weds", "Thurs", "Fri", "Sat"].map((d) => (
          <span key={d} className="text-[11px] text-gray-400 font-medium">
            {d}
          </span>
        ))}
      </div>

      {/* Chart with annotation */}
      <div className="h-[130px] w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
          >
            <defs>
              <linearGradient id="crmGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="day" hide />
            <YAxis hide domain={[0, "dataMax + 50"]} />
            <Tooltip
              contentStyle={{
                fontSize: 11,
                borderRadius: 8,
                border: "none",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                padding: "6px 10px",
              }}
              formatter={(value) => [`${value}`, "Leads"]}
            />
            {/* Highlighted vertical reference line on Fri */}
            <ReferenceLine
              x="Fri"
              stroke="#94A3B8"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#3B82F6"
              strokeWidth={2.5}
              fillOpacity={1}
              fill="url(#crmGradient)"
              dot={false}
              activeDot={{
                r: 5,
                fill: "#3B82F6",
                strokeWidth: 2,
                stroke: "white",
              }}
            />
          </AreaChart>
        </ResponsiveContainer>

        {/* Static annotation label */}
        <div className="absolute top-2 right-[28%] flex flex-col items-center pointer-events-none">
          <span className="text-[9px] text-gray-400 bg-white/90 px-1.5 py-0.5 rounded whitespace-nowrap">
            300 New leads in June
          </span>
        </div>
      </div>
    </div>
  );
}

function AgentCard() {
  return (
    <div className="bg-white rounded-[20px] py-9 px-2.25 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] w-full sm:max-w-85 flex justify-center items-center gap-4 mt-4">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="https://i.pravatar.cc/150?u=agent1"
        alt="Agent Avatar"
        className="w-[90.43px] h-[90.43px] rounded-full object-cover"
      />
      <div className="flex flex-col justify-between h-full">
        <div>
          <p className="text-[#34373C] text-[12px] font-semibold">
            Customer metric
          </p>
          <p className="text-[10px] text-[#616263] ">Overall Insight</p>
        </div>
        <div>
          <p className="text-[10px] text-[#616263] font-medium">
            Promising Lead
          </p>
        </div>
      </div>
    </div>
  );
}

function CRMPipeline() {
  return (
    <div className="shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] rounded-t-[30px] p-6 pt-4 h-full border-b-0 mt-10 max-w-349.75 min-h-102.5">
      <div className="flex items-center justify-end">
        <TinyButton>View All Leads</TinyButton>
      </div>
    </div>
  );
}

export default function CRMPage() {
  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="max-w-400 mx-auto flex flex-col gap-5">
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          <div className="relative w-full max-w-114 group">
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 text-gray-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search for leads"
              className="w-full bg-white border border-gray-200 rounded-full py-3.5 pl-13 pr-6 text-[13px] outline-none focus:ring-2 focus:ring-dash-teal/20 transition-all shadow-sm"
            />
          </div>

          {/* Right Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <button className="flex items-center gap-2 px-2.5 py-[8.5px] border border-gray-200 rounded-[10px] text-[10px] font-medium text-gray-500 transition-all">
              All Pipeline
              <ChevronDown size={13} />
            </button>
            <button className="flex items-center gap-2 px-2.5 py-[8.5px] border border-gray-200 rounded-[10px] text-[10px] font-medium text-gray-500 transition-all">
              <Import size={13} />
              Import
            </button>
            <button className="flex items-center gap-2 px-2.5 py-[8.5px] border border-gray-200 rounded-[10px] text-[10px] font-medium text-gray-500 transition-all">
              <Tag size={13} />
              Label
            </button>
            <button className="flex items-center gap-2 px-2.5 py-[8.5px] border border-gray-200 rounded-[10px] text-[10px] font-medium text-gray-500 transition-all ml-25.5">
              Filter
              <SlidersHorizontal size={13} />
            </button>
            <button className="flex items-center gap-2 px-5 py-2.5 bg-[#0B1215] text-white rounded-[10px] text-[10px] font-medium hover:opacity-90 transition-all">
              Add New Leads
              <BookmarkPlus size={15} />
            </button>
          </div>
        </div>

        {/* Summary Cards Row */}
        <div className="flex flex-col lg:flex-row gap-4 items-stretch">
          <TotalLeadsCard />
          <LeadsChart />
          <AgentCard />
        </div>

        <CRMPipeline />
      </div>
    </div>
  );
}
