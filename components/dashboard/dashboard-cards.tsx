"use client";

import AIIcon from "@/assets/images/ai-icon.png";
import ArrowUp from "@/assets/images/arrow-57deg.png";
import happyIcon from "@/assets/images/happy.png";
import SearchListIcon from "@/assets/images/search-list-icon.png";
import { FilterSelect } from "@/components/ui/filter-select";
import { cn } from "@/lib/utils/sample";
import { ChevronRight, MoreHorizontal } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

export function TopCustomers() {
  const customers = [
    {
      id: 1,
      name: "Lane Wade",
      type: "E-commerce",
      avatar: "https://i.pravatar.cc/150?u=lane",
    },
    {
      id: 2,
      name: "Lane Wade",
      type: "E-commerce",
      avatar: "https://i.pravatar.cc/150?u=lane2",
      active: true,
    },
  ];

  return (
    <div className="bg-dash-dark rounded-4xl p-8 text-white h-full flex flex-col shadow-2xl relative overflow-hidden ring-1 ring-white/5">
      <div className="flex justify-between items-start mb-10">
        <h3 className="text-white font-bold text-lg tracking-tight">
          Top Customers
        </h3>
        <div className="flex items-center gap-1 bg-white/10 px-3 py-1.5 rounded-xl cursor-pointer hover:bg-white/20 transition-all font-bold text-[10px]">
          <span>Weekly</span>
          <ChevronRight size={10} className="rotate-90" />
        </div>
      </div>

      {/* Accurate Triple Ring Chart */}
      <div className="relative flex justify-center mb-12">
        <div className="relative w-48 h-48 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90 drop-shadow-[0_0_20px_rgba(79,209,197,0.15)]">
            {/* Ring 1 (Inner - Red) */}
            <circle
              cx="96"
              cy="96"
              r="38"
              stroke="currentColor"
              strokeWidth="14"
              fill="transparent"
              className="text-white/5"
            />
            <circle
              cx="96"
              cy="96"
              r="38"
              stroke="currentColor"
              strokeWidth="14"
              fill="transparent"
              strokeDasharray="239"
              strokeDashoffset="48"
              strokeLinecap="round"
              className="text-dash-red"
            />

            {/* Ring 2 (Middle - Orange) */}
            <circle
              cx="96"
              cy="96"
              r="58"
              stroke="currentColor"
              strokeWidth="14"
              fill="transparent"
              className="text-white/5"
            />
            <circle
              cx="96"
              cy="96"
              r="58"
              stroke="currentColor"
              strokeWidth="14"
              fill="transparent"
              strokeDasharray="364"
              strokeDashoffset="73"
              strokeLinecap="round"
              className="text-dash-orange"
            />

            {/* Ring 3 (Outer - Teal) */}
            <circle
              cx="96"
              cy="96"
              r="78"
              stroke="currentColor"
              strokeWidth="14"
              fill="transparent"
              className="text-white/5"
            />
            <circle
              cx="96"
              cy="96"
              r="78"
              stroke="currentColor"
              strokeWidth="14"
              fill="transparent"
              strokeDasharray="490"
              strokeDashoffset="40"
              strokeLinecap="round"
              className="text-dash-teal"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[34px] font-black text-white drop-shadow-lg">
              99%
            </span>
          </div>
        </div>
      </div>

      <div className="flex justify-center gap-6 mb-12 text-[11px] font-bold text-white/70">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-dash-teal" /> Customer 1
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-dash-orange" /> Customer 2
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-dash-red" /> Customer 3
        </div>
      </div>

      <div className="space-y-4">
        {customers.map((c) => (
          <div
            key={c.id}
            className={cn(
              "flex items-center justify-between p-4 rounded-[28px] transition-all cursor-pointer group",
              c.active
                ? "bg-white text-dash-dark shadow-2xl scale-[1.02]"
                : "bg-white/5 text-white hover:bg-white/10",
            )}
          >
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "w-12 h-12 rounded-full border-2 p-0.5 transition-all duration-500",
                  c.active
                    ? "border-dash-teal shadow-inner"
                    : "border-dash-teal/20 group-hover:border-dash-teal",
                )}
              >
                <Image
                  src={c.avatar}
                  alt={c.name}
                  width={48}
                  height={48}
                  className="w-full h-full rounded-full object-cover"
                  unoptimized
                />
              </div>
              <div>
                <p
                  className={cn(
                    "text-sm font-bold tracking-tight",
                    c.active ? "text-dash-dark" : "text-white",
                  )}
                >
                  {c.name}
                </p>
                <p
                  className={cn(
                    "text-[11px] font-semibold",
                    c.active ? "text-dash-dark/40" : "text-white/30",
                  )}
                >
                  {c.type}
                </p>
              </div>
            </div>
            <button
              className={cn(
                "transition-colors",
                c.active
                  ? "text-dash-dark/20"
                  : "text-white/30 hover:text-white",
              )}
            >
              <MoreHorizontal size={22} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

const taskFilterOptions = ["Daily", "Weekly", "Monthly"] as const;
type TaskFilter = (typeof taskFilterOptions)[number];

export function WeeklyTasks() {
  const [filter, setFilter] = useState<TaskFilter>("Daily");

  return (
    <div className="drop-shadow-[0px_4px_6px_rgba(0,0,0,0.3)]">
      <div className="ticket-cutout w-full lg:max-w-89 rounded-[20px] py-4 px-4 sm:px-7 text-dash-dark h-fit flex flex-col relative border border-dash-dark/5 bg-white mt-4 lg:mt-20">
        <div className="flex justify-between items-start mb-3 px-[11.5px]">
          <h3 className="text-dash-dark font-medium text-sm tracking-tight">
            Weekly Tasks
          </h3>
          <FilterSelect
            value={filter}
            onChange={setFilter}
            options={taskFilterOptions}
          />
        </div>

        <div className="w-full h-px bg-[#D9D6D6] mb-5.5" />

        <div className="flex items-start gap-6 sm:gap-12 mb-5.5">
          <div>
            <p className="text-[50px] font-medium text-[#34373C] tracking-tighter leading-none mb-1">
              70%
            </p>
            <p className="text-[10px] text-[#616263]">Task Completed</p>
          </div>
          <div>
            <p className="text-[50px] font-medium text-[#34373C] tracking-tighter leading-none mb-1">
              31%
            </p>
            <p className="text-[10px] text-[#616263]">
              Better than previous intervals
            </p>
          </div>
        </div>

        <div className="bg-[#CAE3E3] text-[#616263] w-fit px-2.5 py-[6.5px] rounded-3xl flex items-center gap-1 mb-5.5 text-[10px] font-medium shadow-sm">
          <Image src={happyIcon} alt="User" className="w-6 h-6 rounded-full" />
          <p className="mr-2">Your work balance this week. Awesome!</p>
        </div>

        <div className="w-full h-px bg-[#D9D6D6] mb-3.75" />

        <div className="mb-6.5 relative px-5">
          <p className="text-[14px] font-medium text-[#34373C]">Ongoing Task</p>

          <div className="w-full h-5 bg-[#F5F5F5] rounded-full p-1.5 shadow-inner ring-1 ring-dash-dark/5 mt-6.5">
            <div className="w-[20%] h-full bg-[#FD6046] rounded-full shadow-lg relative">
              <div className="absolute -top-6 -right-1.5 flex items-center gap-1.5  text-white rounded-full text-[9px] font-medium whitespace-nowrap -translate-y-1">
                <Image
                  src="/avatars/male-avatar.png"
                  alt="Attendee"
                  width={16}
                  height={16}
                  className="w-4 h-4 object-cover rounded-full overflow-hidden z-20"
                />
                <div className="bg-[#FD6046] leading-1.5 py-px px-0.75 text-[3px] rounded-r-[3px] absolute left-3.5">
                  Alex ... 42%
                </div>
                <div className="absolute rotate-180 w-1.5 h-1.75 -bottom-1 right-1 bg-[#FD6046] [clip-path:polygon(50%_0%,100%_100%,0%_100%)]" />
              </div>
            </div>
          </div>
        </div>

        <button className="w-full bg-[#D056DC] text-white py-5 rounded-4xl mb-4 flex items-center justify-between px-8 hover:opacity-95 transition-all text-sm group mt-auto">
          View All Task
          <Image
            src={ArrowUp}
            alt="Arrow Up Right Icon"
            width={18}
            height={18}
            className="text-white/80 self-end pb-1.5"
          />
        </button>
      </div>
    </div>
  );
}

export function CRMPipeline() {
  return (
    <div className="py-3.75 px-2.75 pb-10 bg-[#D056DC] h-fit rounded-[20px] text-white relative overflow-hidden mb-2.5 shadow-[0px_2px_3px_0px_#0000004D,0px_6px_10px_4px_#00000026]">
      <div className="z-20 relative">
        <div className="w-12.75 h-12.75 rounded-[50px] bg-[#D056DC] backdrop-blur-xl flex items-center justify-center mb-2.25 drop-shadow-[0px_4px_6px_rgba(0,0,0,0.3)]">
          <Image
            src={SearchListIcon}
            alt="Search List Icon"
            width={28}
            height={28}
            className="text-white drop-shadow-md"
          />
        </div>

        <h4 className="text-xs font-bold mb-1 leading-5.5 w-full">
          View CRM Pipeline
        </h4>
        <p className="text-[8px] text-white font-light leading-2.25 pr-3.25">
          Get an intelligent review of your current leads, outreach performance,
          and engagement trends.
        </p>
      </div>
      <div className="absolute w-40 h-51.5 bg-linear-to-l from-[#C248CE] to-[#F7ABFF] -left-10 -top-10 rounded-[50%_50%_45%_45%/60%_60%_40%_40%] transition-all duration-700 z-0" />
    </div>
  );
}

export function AIWorkspace() {
  return (
    <div className="py-3.75 px-2.75 bg-[#7BB6B8] h-fit rounded-[20px] text-white relative overflow-hidden shadow-[0px_2px_3px_0px_#0000004D,0px_6px_10px_4px_#00000026]">
      <div className="z-20 relative text-[#09232D]">
        <div className="w-12.75 h-12.75 rounded-[50px] bg-[#09232D] backdrop-blur-xl flex items-center justify-center mb-2.25 drop-shadow-[0px_4px_6px_rgba(0,0,0,0.3)]">
          <Image
            src={AIIcon}
            alt="AI Icon"
            width={28}
            height={28}
            className="text-white drop-shadow-md"
          />
        </div>

        <h4 className="text-xs font-bold mb-1 leading-5.5 w-full">
          AI Workspace
        </h4>
        <p className="text-[8px] font-light leading-2.25 pr-3.25">
          Generate leads, draft outreach, or get recommendations using single
          line prompt
        </p>
        <button className="mt-4 text-[10px] w-full font-semibold bg-[#09232D] py-[10.5px] rounded-[10px] flex items-center justify-center gap-1 hover:bg-[#09232D]/90 transition-all text-white">
          Try AI
        </button>
      </div>
      <div className="absolute w-40 h-51.5 bg-linear-to-l from-[#7BB6B8] to-[#9DD8DA] -left-10 top-20 rounded-[50%_50%_45%_45%/60%_60%_40%_40%] transition-all duration-700 z-0" />
    </div>
  );
}
