"use client";

import React, { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import {
  Search,
  SlidersHorizontal,
  ChevronDown,
  ChevronRight,
  MoreHorizontal,
  Import,
  Tag,
  BookmarkPlus,
  Star,
} from "lucide-react";
import Image from "next/image";

// ─── Types ───────────────────────────────────────────────────────────────────

type LeadStatus =
  | "new"
  | "proposal-sent"
  | "contacted"
  | "qualified"
  | "lost";

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

// ─── Mock Data ───────────────────────────────────────────────────────────────

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

const PIPELINE_COLUMNS: LeadColumn[] = [
  {
    id: "new",
    title: "New",
    headerColor: "#22C55E",
    value: "N 342,000",
    count: 89,
    leads: [makeLead("lead-1"), makeLead("lead-6")],
  },
  {
    id: "proposal-sent",
    title: "Proposal Sent",
    headerColor: "#F59E0B",
    value: "N 342,000",
    count: 56,
    leads: [makeLead("lead-2"), makeLead("lead-7")],
  },
  {
    id: "contacted",
    title: "Contacted",
    headerColor: "#3B82F6",
    value: "N 342,000",
    count: 42,
    leads: [makeLead("lead-3"), makeLead("lead-8")],
  },
  {
    id: "qualified",
    title: "Qualified",
    headerColor: "#A3E635",
    value: "N 342,000",
    count: 31,
    leads: [makeLead("lead-4"), makeLead("lead-9")],
  },
  {
    id: "lost",
    title: "Lost",
    headerColor: "#EF4444",
    value: "N 342,000",
    count: 12,
    leads: [makeLead("lead-5"), makeLead("lead-10")],
  },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function TotalLeadsCard() {
  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex flex-col justify-between min-w-0 sm:min-w-[260px]">
      <div className="flex justify-between items-start">
        <h3 className="text-[#34373C] text-sm font-medium">
          Total Leads in Pipeline
        </h3>
        <button className="text-gray-400 hover:text-gray-600">
          <MoreHorizontal size={18} />
        </button>
      </div>

      <div className="flex items-center gap-6 mt-4">
        <div>
          <p className="text-[42px] font-bold text-[#0B1215] leading-none tracking-tight">
            4,100
          </p>
          <p className="text-gray-400 text-[13px] mt-1">Leads</p>
          <p className="text-[#22C55E] text-[11px] font-medium mt-1.5">
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
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex-1 min-w-0 sm:min-w-[340px]">
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
              formatter={(value: number) => [`${value}`, "Leads"]}
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

function CustomerMetricCard() {
  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 min-w-[220px] lg:max-w-[260px] flex flex-col">
      <div className="flex justify-between items-start">
        <h3 className="text-[#34373C] text-sm font-medium">Customer metric</h3>
        <ChevronRight size={16} className="text-gray-400 cursor-pointer" />
      </div>

      <div className="flex items-center gap-4 mt-4">
        <div className="w-16 h-16 rounded-full border-2 border-gray-100 overflow-hidden shrink-0">
          <Image
            src="https://i.pravatar.cc/150?u=customer-metric"
            alt="Customer"
            width={64}
            height={64}
            className="w-full h-full object-cover"
            unoptimized
          />
        </div>
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Star size={12} className="text-amber-400 fill-amber-400" />
            <span className="text-[12px] font-bold text-[#34373C]">4.5</span>
            <span className="text-[10px] text-gray-400">/5.0</span>
          </div>
          <p className="text-[12px] font-semibold text-[#34373C]">
            Overall Insight
          </p>
          <p className="text-[11px] text-gray-400 mt-0.5">Promising Leads</p>
        </div>
      </div>
    </div>
  );
}

function LeadCard({ lead }: { lead: Lead }) {
  return (
    <div className="bg-white rounded-[20px] p-5 shadow-[0px_2px_8px_rgba(0,0,0,0.04)] border border-gray-100 flex flex-col gap-2.5 hover:shadow-md transition-shadow cursor-pointer">
      {/* Name + Badge */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-[#0B1215] font-bold text-[14px] truncate">
            {lead.name}
          </h4>
          <p className="text-gray-400 text-[11px] mt-0.5 truncate">
            {lead.company}
          </p>
        </div>
        <span
          className="text-[9px] font-semibold px-2.5 py-1 rounded-full shrink-0"
          style={{
            backgroundColor: lead.badgeColor,
            color: lead.badgeTextColor,
          }}
        >
          {lead.badge}
        </span>
      </div>

      {/* Amount + Assignment */}
      <div className="flex items-center justify-between">
        <p className="text-[#0B1215] font-bold text-[15px]">
          N {lead.amount.toLocaleString()}
        </p>
        <span className="text-[10px] text-gray-400 font-medium">
          {lead.assignment}
        </span>
      </div>

      {/* Timestamp */}
      <p className="text-gray-300 text-[10px]">{lead.time}</p>
    </div>
  );
}

function PipelineColumn({ column }: { column: LeadColumn }) {
  return (
    <div className="flex flex-col min-w-[220px] sm:min-w-[240px] flex-1">
      {/* Column Header */}
      <div
        className="rounded-2xl px-4 py-3 flex items-center justify-between gap-2"
        style={{ backgroundColor: column.headerColor }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white font-semibold text-[13px] truncate">
            {column.title}
          </span>
          <span className="bg-white/25 text-white text-[10px] font-bold rounded-full min-w-[22px] h-[22px] px-1.5 flex items-center justify-center shrink-0">
            {column.count}
          </span>
        </div>
        <span className="text-white text-[11px] font-bold whitespace-nowrap">
          {column.value}
        </span>
      </div>

      {/* Lead Cards */}
      <div className="flex flex-col gap-3 mt-3 max-h-[500px] overflow-y-auto pr-1">
        {column.leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
      </div>
    </div>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CRMPage() {
  return (
    <div className="min-h-screen bg-[#F4F7F9] p-4 md:p-6 lg:p-8">
      <div className="max-w-[1600px] mx-auto flex flex-col gap-5">
        {/* Top Action Bar */}
        <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4">
          {/* Search */}
          <div className="relative w-full max-w-[300px] group">
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
            <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-full text-[12px] font-medium text-gray-500 hover:bg-gray-50 transition-all shadow-sm">
              All Pipeline
              <ChevronDown size={13} />
            </button>
            <button className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-gray-200 rounded-full text-[12px] font-medium text-gray-500 hover:bg-gray-50 transition-all shadow-sm">
              <Import size={13} />
              Import
            </button>
            <button className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-gray-200 rounded-full text-[12px] font-medium text-gray-500 hover:bg-gray-50 transition-all shadow-sm">
              <Tag size={13} />
              Label
            </button>
            <button className="flex items-center gap-1.5 px-4 py-2.5 bg-white border border-gray-200 rounded-full text-[12px] font-medium text-gray-500 hover:bg-gray-50 transition-all shadow-sm">
              Filter
              <SlidersHorizontal size={13} />
            </button>
            <button className="flex items-center gap-2 px-5 py-2.5 bg-[#0B1215] text-white rounded-full text-[12px] font-bold hover:opacity-90 transition-all shadow-lg">
              Add New Leads
              <BookmarkPlus size={15} />
            </button>
          </div>
        </div>

        {/* Summary Cards Row */}
        <div className="flex flex-col lg:flex-row gap-4 items-stretch">
          <TotalLeadsCard />
          <LeadsChart />
          <CustomerMetricCard />
        </div>

        {/* Pipeline Section Header */}
        <div className="flex items-center justify-end">
          <button className="text-[11px] font-medium text-gray-500 hover:text-[#0B1215] transition-colors flex items-center gap-0.5">
            View All Leads
            <ChevronRight size={13} />
          </button>
        </div>

        {/* Pipeline Kanban Board */}
        <div className="flex gap-4 overflow-x-auto pb-6 scrollbar-thin">
          {PIPELINE_COLUMNS.map((column) => (
            <PipelineColumn key={column.id} column={column} />
          ))}
        </div>
      </div>
    </div>
  );
}
