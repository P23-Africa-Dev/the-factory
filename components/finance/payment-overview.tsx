"use client";

import { useEffect, useState } from "react";
import { AreaChart, Area, ResponsiveContainer } from "recharts";

const overviewChartData = [
  { v: 28 },
  { v: 45 },
  { v: 32 },
  { v: 50 },
  { v: 36 },
  { v: 58 },
  { v: 42 },
  { v: 62 },
  { v: 38 },
  { v: 55 },
];

const miniChartData = [
  { v: 30 },
  { v: 55 },
  { v: 38 },
  { v: 62 },
  { v: 44 },
  { v: 70 },
  { v: 50 },
  { v: 66 },
];

const darkChartData = [
  { v: 20 },
  { v: 40 },
  { v: 28 },
  { v: 55 },
  { v: 38 },
  { v: 68 },
  { v: 48 },
  { v: 75 },
];

function CircularProgress({
  percentage,
  size = 88,
  strokeWidth = 8,
  color = "#E8612D",
  bgColor = "#F0F0F0",
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  bgColor?: string;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={bgColor}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
      />
    </svg>
  );
}

function MiniChart({
  color = "#E84040",
  gradId,
}: {
  color?: string;
  gradId: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart
        data={miniChartData}
        margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          strokeWidth={1.5}
          fillOpacity={1}
          fill={`url(#${gradId})`}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function PaymentOverview() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* ── Left: Payment Overview ─────────────────── */}
      <div className="bg-white rounded-3xl p-5 shadow-sm flex-1 min-w-0">
        <h2 className="text-[16px] font-bold text-[#0B1215] mb-4">
          Payment Overview
        </h2>

        {/* Donut + label row */}
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            <CircularProgress
              percentage={68}
              size={88}
              strokeWidth={8}
              color="#E8612D"
            />
            {/* Face emoji placeholder */}
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ transform: "rotate(0deg)" }}
            >
              <span className="text-[22px] leading-none select-none">🙂</span>
            </div>
          </div>

          <div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#EBFAF3] rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" />
              <span className="text-[11px] font-bold text-[#22C55E]">
                As at Today
              </span>
            </span>
            <p className="text-[10px] text-gray-400 mt-1.5 ml-0.5">
              Monday, April 6th
            </p>
          </div>
        </div>

        {/* Full-width area chart */}
        <div className="mt-4 h-16">
          {mounted ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={overviewChartData}
                margin={{ top: 4, right: 4, left: 4, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="overviewGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#64A8E8" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#64A8E8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#64A8E8"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#overviewGrad)"
                  dot={{ r: 3, fill: "#64A8E8", strokeWidth: 0 }}
                  activeDot={{ r: 4, fill: "#64A8E8", strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full w-full" />
          )}
        </div>
      </div>

      {/* ── Middle: Commissions + Pending ──────────── */}
      <div className="flex-1 min-w-0 flex flex-col max-w-71.5 gap-2.5">
        <div className="bg-white rounded-3xl px-5 py-4 shadow-[0px_1px_3px_0px_#0000004D,0px_4px_8px_3px_#00000026] h-fit">
          <p className="text-[32px] font-bold text-[#34373C] leading-13.75 tracking-tight font-[poppins]">
            &#8358;1,180,000
          </p>
          <p className="text-[14px] font-light text-[#34373C] mb-2.5">
            Total Commissions
          </p>
          <div className="flex items-end gap-2 shrink-0">
            <div className="w-full h-9">
              {mounted ? (
                <MiniChart color="#E18695" gradId="commGrad" />
              ) : (
                <div className="h-full w-full" />
              )}
            </div>
            <div className="inline-flex items-center gap-1 text-[15px] font-medium">
              20%
            </div>
          </div>
        </div>

        <div className="bg-white flex  rounded-3xl px-5 py-4 shadow-[0px_1px_3px_0px_#0000004D,0px_4px_8px_3px_#00000026] h-fit">
          <div className="shrink-0 mr-2">
            <p className="text-[20px] font-bold text-[#34373C] tracking-tight font-[poppins]">
              &#8358;1,180,000
            </p>
            <p className="text-[12px] font-light text-[#34373C] leading-none">
              Pending Approvals
            </p>
          </div>
          <div className="w-full h-9">
            {mounted ? (
              <MiniChart color="#E18695" gradId="commGrad" />
            ) : (
              <div className="h-full w-full" />
            )}
          </div>
          <div className="inline-flex items-center gap-1 text-[15px] font-medium ml-3.5">
            20%
          </div>
        </div>
      </div>

      {/* ── Right: Total Payroll (dark) ─────────────── */}
      <div className="bg-[#09232D] shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] rounded-3xl max-w-115.25 py-5 px-3.75 flex-1 min-w-0 relative overflow-hidden flex flex-col">
        <div className="relative z-10 flex flex-col flex-1">
          <div className="px-4.5 py-3.25 bg-[#041820] rounded-[20px] w-fit shadow-[0px_2px_3px_0px_#0000004D,0px_6px_10px_4px_#00000026]">
            <p className="text-[48px] text-white leading-tight tracking-tight">
              &#8358;4,250,0000
            </p>
            <p className="text-[14px] font-light text-white mt-0.75">
              Total Payroll
            </p>
          </div>

          {/* Chart */}
          <div className="mt-auto pt-4 h-14 flex">
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={darkChartData}
                  margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="payrollDarkGrad"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor="#95E1C0"
                        stopOpacity={0.35}
                      />
                      <stop offset="95%" stopColor="#95E1C0" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="#95E1C0"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#payrollDarkGrad)"
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full w-full" />
            )}

            <span className="inline-flex items-center gap-1 text-[24px] font-medium text-[#95E1C0] px-2.5 py-0.5 rounded-full shrink-0">
              20%
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                <path
                  d="M5 8V2M2 5l3-3 3 3"
                  stroke="#95E1C0"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
