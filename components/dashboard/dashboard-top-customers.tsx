"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { FilterSelect } from "@/components/ui/filter-select";
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

const filterOptions = Object.keys(datasets) as FilterOption[];

const customers = [
  { name: "Lane Wade", category: "E-commerce", avatarBg: "#EAEAEA" },
  { name: "Lane Wade", category: "E-commerce", avatarBg: "#B29D8B" },
];

type FilterOption = keyof typeof datasets;

export function TopCustomers() {
  const [filter, setFilter] = useState<FilterOption>("Weekly");
  const data = datasets[filter];
  const maxValue = Math.max(...data.map((d) => d.value));

  return (
    <div className="bg-[#09232D] rounded-[20px] p-6 flex flex-col h-min shadow-[0px_2px_3px_0px_#0000004D,0px_6px_10px_4px_#00000026]">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-white font-medium text-[14px]">Top Leads</h3>
        <FilterSelect
          value={filter}
          onChange={setFilter}
          options={filterOptions}
        />
      </div>

      {/* Radial Bar Chart */}
      <div className="relative h-66 w-full mx-auto">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-[24px] font-bold text-white mt-1">
            {maxValue}%
          </span>
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
      <div className="flex flex-wrap items-center justify-center gap-3 mb-6.25">
        {chartData.map((item) => (
          <div key={item.name} className="flex items-center gap-2.5">
            <div
              className="w-[14px] h-[14px] rounded-full"
              style={{ background: item.fill }}
            />
            <span className="text-[10px] font-medium text-white">
              {item.name}
            </span>
          </div>
        ))}
      </div>

      {/* Customer List */}
      <div className="flex flex-col gap-3">
        {customers.map((customer, index) => (
          <div
            key={index}
            className="flex items-center justify-between p-2 rounded-[15px] transition-colors hover:bg-[#EAEAEA] group/item cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center"
                style={{ backgroundColor: customer.avatarBg }}
              >
                <Image
                  src="/placeholder.svg"
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                  alt={customer.name}
                />
              </div>
              <div>
                <p className="text-[14px] font-bold text-white leading-tight group-hover/item:text-[#041114]">
                  {customer.name}
                </p>
                <p className="text-[10px] font-medium text-white group-hover/item:text-[#7E7E7E]">
                  {customer.category}
                </p>
              </div>
            </div>
            <button className="text-white group-hover/item:text-[#34373C] p-1">
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
