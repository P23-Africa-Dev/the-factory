"use client";

import ArrowUp from "@/assets/images/arrow-57deg.png";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  ReferenceLine,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";

const activitiesData = [
  { name: "Mon", value: 30 },
  { name: "Tue", value: 25 },
  { name: "Wed", value: 40 },
  { name: "Thu", value: 35 },
  { name: "Fri", value: 55 },
  { name: "Sat", value: 45 },
  { name: "Sun", value: 60 },
];

const leadsData = [
  { name: "1", v1: 3000, v2: 3500 },
  { name: "2", v1: 3000, v2: 3400 },
  { name: "3", v1: 3500, v2: 2100 },
  { name: "4", v1: 3500, v2: 2800 },
  { name: "5", v1: 3200, v2: 2600 },
  { name: "6", v1: 4100, v2: 3200 },
];

export function MyActivitiesChart() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-full w-full" />;

  return (
    <div className="bg-[#78B3B3] rounded-3xl w-full py-6 text-white h-full flex flex-col relative overflow-hidden shadow-2xl">
      <div className="flex justify-between items-start relative z-10 px-8.5">
        <div>
          <h3 className="text-white/80 text-[13px] font-bold tracking-tight">
            My Activities
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-4xl font-bold tracking-tighter leading-9">
              60%
            </span>
            <Image
              src={ArrowUp}
              alt="Arrow Up Right Icon"
              width={18}
              height={18}
              className="text-white/80 self-end pb-1.5"
            />
          </div>
        </div>
      </div>

      <div className="flex-1 w-full min-h-25 mt-2 relative z-10">
        <ResponsiveContainer
          width="100%"
          height="100%"
          minHeight={0}
          minWidth={0}
        >
          <AreaChart
            data={activitiesData}
            margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="white" stopOpacity={0.4} />
                <stop offset="95%" stopColor="white" stopOpacity={0} />
              </linearGradient>
            </defs>
            <ReferenceLine
              y={45}
              stroke="white"
              strokeDasharray="3 3"
              strokeOpacity={0.4}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="white"
              strokeWidth={4}
              fillOpacity={1}
              fill="url(#colorValue)"
              dot={false}
              activeDot={{ r: 6, fill: "white", strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Decorative dashed lines spanning the card */}
      <div className="absolute inset-0 pointer-events-none opacity-10">
        <div className="absolute left-[30%] top-0 bottom-0 border-l border-dashed border-white" />
        <div className="absolute left-0 right-0 top-[60%] border-t border-dashed border-white" />
      </div>
    </div>
  );
}

export function TotalLeadsChart() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  if (!mounted) return <div className="h-full w-full" />;

  return (
    <div className="bg-white rounded-3xl px-7 py-3.75 text-dash-dark h-full flex flex-col shadow-2xl relative">
      <div className="flex justify-between items-start mb-4">
        <div>
          <h3 className="text-dash-dark text-[16px] font-semibold">
            Total Leads
          </h3>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-4xl font-bold tracking-tighter">4,100</span>
            <span className="text-dash-dark/40 text-sm font-bold mt-2">
              Leads
            </span>
          </div>
        </div>
        <button className="bg-[#5E5D5D] rounded-[3px] py-px px-1.5 text-[9px] font-medium text-white">
          View
        </button>
      </div>

      <div className="w-full h-10.25 mt-auto">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={leadsData}
            barGap={4}
            margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          >
            <YAxis domain={[0, "dataMax"]} hide />
            <XAxis hide padding={{ left: 0, right: 0 }} />
            <Bar dataKey="v1" fill="#7BB6B8" radius={10} barSize={15} />
            <Bar dataKey="v2" fill="#FD6046" radius={10} barSize={15} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
