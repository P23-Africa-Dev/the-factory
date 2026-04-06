"use client";

import { useState } from "react";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import Image from "next/image";
import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  PolarAngleAxis,
} from "recharts";

const chartData = [
  { name: "Customer 3", value: 65, fill: "#7BB6B8" },
  { name: "Customer 2", value: 80, fill: "#146AFA" },
  { name: "Customer 1", value: 95, fill: "#FD6046" },
];

const datasets = {
  Weekly: chartData,
  Monthly: chartData.map((d) => ({ ...d, value: d.value + 5 })),
  Yearly: chartData.map((d) => ({ ...d, value: d.value - 10 })),
};

type FilterOption = keyof typeof datasets;

export function TopCustomers() {
  const [filter, setFilter] = useState<FilterOption>("Weekly");
  const data = datasets[filter];

  return (
    <div className="bg-[#09232D] rounded-[20px] p-6 shadow-sm flex flex-col h-min">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-white font-medium text-[14px]">Top Leads</h3>
        <div className="relative">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterOption)}
            className="appearance-none outline-none text-[9px] leading-3.5 font-medium bg-[#5E5D5D] text-white px-1.5 pr-5.25 py-px flex items-center rounded-md transition-colors hover:bg-[#3F4254] cursor-pointer"
          >
            <option value="Weekly">Weekly</option>
            <option value="Monthly">Monthly</option>
            <option value="Yearly">Yearly</option>
          </select>
          <ChevronDown className="w-3 h-3 text-white absolute right-[8px] top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Radial Bar Chart */}
      <div className="relative h-66 w-full mx-auto">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[24px] font-bold text-white mt-1">99%</span>
        </div>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="50%"
            innerRadius="35%"
            outerRadius="95%"
            barSize={16}
            data={data}
            startAngle={90}
            endAngle={450}
          >
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              angleAxisId={0}
              tick={false}
            />
            <RadialBar
              background={{ fill: "#0E2F3C" }}
              cornerRadius={10}
              dataKey="value"
            />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
        {[
          { color: "#7BB6B8", label: "Customer 1" },
          { color: "#146AFA", label: "Customer 2" },
          { color: "#FD6046", label: "Customer 3" },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div
              className="w-[14px] h-[14px] rounded-full"
              style={{ background: item.color }}
            />
            <span className="text-[10px] font-medium text-white">
              {item.label}
            </span>
          </div>
        ))}
      </div>

      {/* Customer List */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between p-2 rounded-[15px] transition-colors hover:bg-[#EAEAEA] group/item cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#EAEAEA] overflow-hidden flex items-center justify-center">
              <Image
                src="/placeholder.svg"
                width={40}
                height={40}
                className="w-full h-full object-cover"
                alt="Avatar"
              />
            </div>
            <div>
              <p className="text-[14px] font-bold text-white leading-tight group-hover/item:text-[#041114]">
                Lane Wade
              </p>
              <p className="text-[10px] font-medium text-white group-hover/item:text-[#7E7E7E]">E-commerce</p>
            </div>
          </div>
          <button className="text-white group-hover/item:text-[#34373C] p-1">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>

        <div className="flex items-center justify-between p-2 rounded-[15px] transition-colors hover:bg-[#EAEAEA] group/item cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#B29D8B] overflow-hidden flex items-center justify-center">
              <Image
                src="/placeholder.svg"
                width={40}
                height={40}
                className="w-full h-full object-cover"
                alt="Avatar"
              />
            </div>
            <div>
              <p className="text-[14px] font-bold text-white leading-tight group-hover/item:text-[#041114]">
                Lane Wade
              </p>
              <p className="text-[10px] font-medium text-white group-hover/item:text-[#7E7E7E]">
                E-commerce
              </p>
            </div>
          </div>
          <button className="text-white group-hover/item:text-[#34373C] p-1">
            <MoreHorizontal className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
