"use client";

import { useState, useEffect } from "react";
import { User } from "lucide-react";
import Image from "next/image";
import { AreaChart, Area, ResponsiveContainer } from "recharts";
import { Project } from "@/types/operations";
import Arrow57Deg from "@/assets/images/arrow-57deg.png";
import {
  TOTAL_PROJECTS_DATA,
  PENDING_PROJECTS_DATA,
  ARC_LENGTH,
  CIRCUMFERENCE,
} from "./constants";
import { getPerformanceLabel } from "./utils";

interface SummaryCardsProps {
  projects: Project[];
}

export function SummaryCards({ projects }: SummaryCardsProps) {
  const total = projects.length;
  const completed = projects.filter((p) => p.status === "Completed").length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  // Single JS animation loop — drives both arc and dot together
  const [animatedPct, setAnimatedPct] = useState(0);
  useEffect(() => {
    const duration = 1200;
    const start = performance.now();
    const target = percent;
    // ease-in-out cubic
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t);
    let raf: number;
    function frame(now: number) {
      const t = Math.min((now - start) / duration, 1);
      setAnimatedPct(ease(t) * target);
      if (t < 1) raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [percent]);

  const animatedDash = (animatedPct / 100) * ARC_LENGTH;
  const dotAngle = (animatedPct / 100) * 270 * (Math.PI / 180);
  const dotX = 50 + 40 * Math.cos(dotAngle);
  const dotY = 50 + 40 * Math.sin(dotAngle);

  return (
    <div className="flex justify-between w-full px-8 animate-in fade-in slide-in-from-bottom-2 duration-500 h-49">
      <PerformanceCard
        percent={percent}
        animatedDash={animatedDash}
        dotX={dotX}
        dotY={dotY}
      />

      <div className="flex gap-6.25">
        <TotalProjectsCard />
        <PendingProjectsCard />
        <AgentsCard />
      </div>
    </div>
  );
}

// ─── Performance Card ─────────────────────────────────────────────────────────
function PerformanceCard({
  percent,
  animatedDash,
  dotX,
  dotY,
}: {
  percent: number;
  animatedDash: number;
  dotX: number;
  dotY: number;
}) {
  return (
    <div className="bg-[#0B1C25] rounded-[20px] p-6 sm:p-8 relative shadow-sm flex items-center gap-6 lg:gap-10 overflow-hidden min-h-45 max-h-52 shrink-0">
      <div className="relative w-30 h-30 shrink-0">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full"
          style={{ transform: "rotate(135deg)" }}
        >
          {/* Dim track */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#6B9A9A"
            strokeOpacity="0.3"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
          />
          {/* White full-track */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="white"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${ARC_LENGTH} ${CIRCUMFERENCE}`}
          />
          {/* Animated teal progress arc */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#6B9A9A"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${animatedDash} ${CIRCUMFERENCE}`}
          />
          {/* Valve dot — tracks the live end of the progress arc */}
          <circle
            cx={dotX}
            cy={dotY}
            r="6"
            fill="#8AB8B8"
            stroke="#0B1C25"
            strokeWidth="2.5"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
          <div className="w-10 h-10 rounded-full bg-[#EF6C55] flex items-center justify-center shadow-lg">
            <User size={18} className="text-white fill-current" />
          </div>
          <span className="text-white font-extrabold text-[15px] leading-none">
            {percent}%
          </span>
        </div>
      </div>
      <div className="flex flex-col z-10 text-white min-w-0">
        <p className="text-[#E8E8E8] font-normal text-[14px] sm:text-[16px] leading-tight mb-0.5">
          Overall Project
        </p>
        <h2 className="text-[28px] sm:text-[36px] font-semibold leading-[1.1] mb-7 tracking-tight">
          Performance
        </h2>
        <p className="text-[14px] font-medium text-[#E8E8E8]">
          Status: <span>{getPerformanceLabel(percent)}</span>
        </p>
      </div>
    </div>
  );
}

// ─── Total Projects Card ──────────────────────────────────────────────────────
function TotalProjectsCard() {
  return (
    <div className="px-5 sm:px-6 pb-3 bg-white rounded-[20px] overflow-hidden border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] relative flex flex-col min-h-45 w-69.75 shrink-0">
      <div className="flex items-start justify-between pt-5 sm:pt-6">
        <div>
          <p className="text-[14px] font-medium text-[#2D2D2D]">
            Total Projects
          </p>
          <h2 className="text-[64px] font-bold text-[#34373C] leading-none tracking-[-0.04em]">
            045
          </h2>
        </div>
        <button className="flex items-center gap-1 px-2.5 py-1.5 h-4 bg-[#3AB37E] text-white rounded-full text-[7px] hover:bg-[#27ae60] transition-colors mt-1">
          View All
          <Image src={Arrow57Deg} alt="View All" width={7.5} height={7.5} />
        </button>
      </div>
      <div className="w-full h-14.5 mt-auto">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={TOTAL_PROJECTS_DATA}
            margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3AB37E" stopOpacity={1} />
                <stop offset="95%" stopColor="#D9D9D9" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke="#3AB37E"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#gradGreen)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Pending Projects Card ────────────────────────────────────────────────────
function PendingProjectsCard() {
  return (
    <div className="xl:col-span-3 px-5 sm:px-6 pb-3 bg-white rounded-[20px] overflow-hidden border border-gray-100 shadow-[0_2px_12px_rgba(0,0,0,0.04)] relative flex flex-col min-h-45 w-69.75 shrink-0">
      <div className="flex items-start justify-between pt-5 sm:pt-6">
        <div>
          <p className="text-[14px] font-medium text-[#2D2D2D]">
            Pending Projects
          </p>
          <h2 className="text-[64px] font-bold text-[#34373C] leading-none tracking-[-0.04em]">
            015
          </h2>
        </div>
        <button className="flex items-center gap-1 px-2.5 py-1.5 h-4 bg-[#EF8E5B] text-white rounded-full text-[7px] hover:bg-[#d57848] transition-colors mt-1">
          View All
          <Image src={Arrow57Deg} alt="View All" width={7.5} height={7.5} />
        </button>
      </div>
      <div className="w-full h-14.5 mt-auto">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={PENDING_PROJECTS_DATA}
            margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="gradOrange" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#E8875B" stopOpacity={1} />
                <stop offset="95%" stopColor="#D9D9D9" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              stroke="#E8875B"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#gradOrange)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Agents Card ──────────────────────────────────────────────────────────────
function AgentsCard() {
  return (
    <div className="xl:col-span-2 bg-[#7BA9A4] rounded-[20px] gap-4 p-5 shadow-sm relative flex flex-col items-center h-full w-29.75 text-center justify-between">
      <p className="text-white font-light text-[8px] leading-[1.4] max-w-20 mx-auto">
        View Agent who hasn&apos;t commenced task
      </p>
      <button className="flex items-center gap-1 px-2.5 py-1.5 h-4 bg-[#08393A] text-white rounded-full text-[7px] hover:bg-[#d57848] transition-colors">
        View All
        <Image src={Arrow57Deg} alt="View All" width={7.5} height={7.5} />
      </button>

      <div className="w-18 h-18 relative flex items-center justify-center">
        <svg
          viewBox="0 0 100 100"
          className="absolute inset-0 w-full h-full"
          style={{ transform: "rotate(135deg)" }}
        >
          {/* Background track — faded white */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="rgba(255,255,255,0.25)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray="188.5 251.3"
          />
          {/* White progress arc */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="white"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray="81 251.3"
          />
          {/* Dark accent at the top */}
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke="#0E2A33"
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray="30 251.3"
            strokeDashoffset="-81"
          />
          {/* Endpoint dot */}
          <circle
            cx="32.4"
            cy="85.9"
            r="4.5"
            fill="white"
            stroke="#7BA9A4"
            strokeWidth="2"
          />
        </svg>
        <div className="relative w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm">
          <User size={14} className="text-[#09232D] fill-current" />
        </div>
        <span className="text-white text-[10px] font-bold absolute bottom-0">
          43%
        </span>
      </div>
    </div>
  );
}
