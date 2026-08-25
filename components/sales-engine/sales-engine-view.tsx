"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import {
  ChevronDown,
  Copy,
  Expand,
  FolderInput,
  Globe2,
  Lightbulb,
  MessageCircle,
  MoreVertical,
  Plus,
  Send,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  UsersRound,
} from "lucide-react";

const weekDays = ["Mon", "Tues", "Weds", "Thurs", "Fri", "Sat"];

const outreachItems = [
  { color: "bg-[#df93e6]", icon: "text-[#9d25a8]", offset: "mt-0" },
  { color: "bg-[#8dc8c8]", icon: "text-[#6ab6b7]", offset: "mt-4" },
  { color: "bg-[#dbdbdb]", icon: "text-[#cfcfcf]", offset: "mt-4" },
  { color: "bg-[#f79787]", icon: "text-[#ef735f]", offset: "mt-4" },
];

function MetricCard({
  title,
  value,
  percent,
  active = false,
}: {
  title: string;
  value: string;
  percent: string;
  active?: boolean;
}) {
  return (
    <section
      className={`relative h-[126px] overflow-hidden rounded-[15px] border border-[rgba(179,179,179,0.2)] px-5 py-3 shadow-[0_1px_3px_1px_rgba(0,0,0,0.15),0_1px_2px_rgba(0,0,0,0.3)] ${
        active ? "bg-[#0b242e] text-white" : "bg-white text-[#0b242e]"
      }`}
    >
      <div className="flex items-start justify-between">
        <p className={`text-[14px] font-light leading-[19px] ${active ? "text-white" : "text-[#293e46]"}`}>
          {title}
        </p>
        <MoreVertical size={15} className={active ? "text-white/45" : "text-[#09232d]/40"} />
      </div>

      <div className="absolute left-5 top-[48px]">
        <div className="flex items-end gap-1">
          <p className="text-[32px] font-semibold leading-[43px]">{value}</p>
          <p className={`pb-2 text-[9px] font-semibold ${active ? "text-white" : "text-[#0b242e]"}`}>
            Leads
          </p>
        </div>
        <p className={`mt-[-4px] text-[8px] leading-[16px] ${active ? "text-[#c8c8c8]" : "text-[#34373c]"}`}>
          {percent}% increase this week
        </p>
      </div>

      <div className="absolute right-[17px] top-[19px] grid size-[108px] place-items-center">
        <div
          className={`absolute size-[84px] rounded-full border-[7px] ${
            active ? "border-[#8dec66]" : "border-[#ff604c]"
          } border-l-transparent rotate-[-24deg]`}
        />
        <div className={`absolute size-[49px] rounded-full ${active ? "bg-[#14343e]" : "bg-[#f9f9f9]"}`} />
        <p className={`relative text-[8px] font-semibold ${active ? "text-[#c8c8c8]" : "text-[#34373c]"}`}>
          {percent}%
        </p>
      </div>
    </section>
  );
}

function TrendChart() {
  return (
    <section className="relative h-[126px] min-w-[420px] flex-1 overflow-visible px-1 pt-1 max-lg:min-w-0">
      <div className="grid grid-cols-6 text-[13px] font-medium text-[#09232d]/50">
        {weekDays.map((day) => (
          <span key={day} className="text-center">
            {day}
          </span>
        ))}
      </div>
      <div className="relative mt-4 h-[92px]">
        <div className="absolute inset-x-5 top-0 bottom-2 grid grid-cols-6">
          {weekDays.map((day, index) => (
            <div key={day} className="relative">
              <span
                className={`absolute left-1/2 top-0 h-full border-l border-dashed ${
                  index === 4 ? "border-[#fd6046]" : "border-[#6b9bb0]"
                }`}
              />
            </div>
          ))}
        </div>
        <svg viewBox="0 0 430 112" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
          <defs>
            <linearGradient id="sales-trend-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#fd6046" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#fd6046" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M0 54 C8 42 18 42 27 53 C37 64 45 38 56 51 C69 64 79 34 92 47 C105 58 118 42 130 45 C145 49 154 23 167 34 C181 47 192 20 207 31 C221 42 226 68 239 76 C254 93 270 68 284 76 C297 84 309 67 323 73 C337 79 348 54 362 68 C379 84 394 77 410 83 C421 87 427 81 430 84"
            fill="none"
            stroke="#fd6046"
            strokeLinecap="round"
            strokeWidth="2"
          />
          <path
            d="M0 54 C8 42 18 42 27 53 C37 64 45 38 56 51 C69 64 79 34 92 47 C105 58 118 42 130 45 C145 49 154 23 167 34 C181 47 192 20 207 31 C221 42 226 68 239 76 C254 93 270 68 284 76 C297 84 309 67 323 73 C337 79 348 54 362 68 C379 84 394 77 410 83 C421 87 427 81 430 84 L430 112 L0 112 Z"
            fill="url(#sales-trend-fill)"
          />
          <path d="M318 83 H382" stroke="#fd6046" strokeDasharray="6 6" strokeLinecap="round" />
        </svg>
        <div className="absolute right-4 top-[18px] flex h-5 items-center gap-1 rounded-[12px] border border-[#e4e4e9] bg-white px-2.5 shadow-[0_12px_17px_rgba(11,36,46,0.15)]">
          <span className="text-[11px] font-medium text-[#fd6046]">+27%</span>
          <span className="text-[10px] text-[#09232d]/70">Performance higher this week</span>
        </div>
      </div>
    </section>
  );
}

function PromptButton({
  icon,
  label,
  tint,
}: {
  icon: ReactNode;
  label: string;
  tint: string;
}) {
  return (
    <button
      type="button"
      className={`flex h-[32px] items-center gap-2 rounded-[18px] border border-black/10 px-4 text-[9px] font-medium text-[#09232d] shadow-[0_1px_2px_rgba(0,0,0,0.18)] ${tint}`}
    >
      {icon}
      {label}
    </button>
  );
}

function ChatWorkspace() {
  return (
    <section className="relative min-h-[486px] overflow-hidden rounded-[35px] bg-white shadow-[0_8px_6px_rgba(0,0,0,0.15),0_4px_2px_rgba(0,0,0,0.3)]">
      <header className="mx-6 mt-5 flex h-[48px] items-center justify-between rounded-[24px] bg-[#09232d] px-6 text-white shadow-[0_6px_6px_rgba(0,0,0,0.18)] max-sm:mx-4">
        <div className="flex items-center gap-3">
          <Sparkles size={18} />
          <span className="text-[21px] font-semibold">Sales Engine</span>
          <ChevronDown size={14} className="text-white/50" />
        </div>
        <Expand size={18} className="text-white/70" />
      </header>

      <div className="mx-auto mt-8 max-w-[824px] px-6 text-[#09232d] max-sm:px-4">
        <div className="space-y-3 text-[12px] leading-[15px]">
          <p>
            <span className="font-semibold">Welcome to Sales Engine.</span>
          </p>
          <p>
            I&apos;m your AI-powered assistant built to help you discover high-quality leads, craft personalized outreach messages,
            and develop smart follow-up strategies that improve response rates.
          </p>
          <p>
            Whether you&apos;re looking to identify companies in a specific industry, refine your targeting, write compelling
            sales emails, or understand why certain leads aren&apos;t responding, I&apos;m here to guide you through the process step by step.
          </p>
          <p>
            You can ask me to generate new leads, analyze your outreach performance, suggest improvements, or create follow-up
            messages based on engagement activity. The more details you provide about your target audience, location, or offer,
            the more precise and effective my recommendations will be.
          </p>
          <p>Let&apos;s start building smarter outreach.</p>
          <p className="font-semibold">What would you like to work on today?</p>
        </div>

        <div className="mt-5 flex items-center gap-5 text-[#cfcfcf]">
          <ThumbsUp size={14} />
          <ThumbsDown size={14} />
          <Copy size={14} />
        </div>
      </div>

      <div className="absolute bottom-7 left-1/2 w-[calc(100%-88px)] max-w-[824px] -translate-x-1/2 rounded-[22px] border border-[#d7d7d7] bg-white shadow-sm max-sm:w-[calc(100%-32px)]">
        <div className="flex h-[43px] items-center gap-3 rounded-t-[22px] border-b border-[#ececec] px-5">
          <Plus size={21} className="text-[#09232d]" />
          <input
            aria-label="Ask Sales Engine"
            className="h-full min-w-0 flex-1 bg-transparent text-[10px] text-[#09232d] outline-none placeholder:text-[#b5b5b5]"
            placeholder="Ask or search anything"
          />
          <button
            type="button"
            aria-label="Send message"
            className="grid size-[30px] place-items-center rounded-full bg-[#09232d] text-white"
          >
            <Send size={15} fill="currentColor" />
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-4 px-4 py-4">
          <PromptButton icon={<Globe2 size={17} />} label="Quick Research" tint="bg-[#fffbdc]" />
          <PromptButton icon={<UsersRound size={17} />} label="Generate New Leads" tint="bg-[#e4faff]" />
          <PromptButton icon={<Lightbulb size={17} />} label="Create Outreach Message" tint="bg-[#f2ffe9]" />
        </div>
      </div>
    </section>
  );
}

function OutreachCard({ color, icon, offset }: { color: string; icon: string; offset: string }) {
  return (
    <article className={`${offset} ${color} h-[108px] rounded-[20px] p-5 shadow-[0_6px_5px_rgba(0,0,0,0.15),0_2px_1.5px_rgba(0,0,0,0.3)]`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-2">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-white">
            <MessageCircle size={21} className={icon} fill="currentColor" />
          </div>
          <div className="min-w-0 text-[#09232d]">
            <p className="text-[14px] font-bold leading-[18px]">Smith Williams</p>
            <p className="mt-1 max-w-[156px] text-[7px] font-light leading-[9px]">
              Hi Smith Williams, I&apos;ve been following your brand and I really like what you&apos;re building. I believe there are a few ways we can ...
            </p>
          </div>
        </div>
        <MoreVertical size={24} className="shrink-0 text-[#09232d]" />
      </div>
      <p className="ml-[88px] mt-2 text-[5px] font-light leading-[9px] text-[#09232d]">2 hrs ago</p>
    </article>
  );
}

function OutreachPanel() {
  return (
    <aside className="ticket-cutout relative h-[486px] overflow-hidden rounded-[20px] bg-[#09232d] px-[44px] py-[33px] text-white shadow-sm max-xl:h-auto max-xl:min-h-[360px] max-sm:px-6">
      <header className="mb-8 flex items-center justify-center gap-2">
        <h2 className="text-[13px] font-bold">Recent Outreach Activities</h2>
        <ChevronDown size={14} className="text-white/70" />
      </header>
      <div className="absolute right-[22px] top-[97px] h-[18px] w-[3px] rounded-full bg-[#e5e5e5]" />
      <div className="mx-auto max-w-[285px]">
        {outreachItems.map((item, index) => (
          <OutreachCard key={index} {...item} />
        ))}
      </div>
    </aside>
  );
}

export function SalesEngineView() {
  return (
    <div className="min-h-[calc(100vh-80px)] overflow-x-hidden bg-[#f8f8f8] px-6 py-8 text-[#09232d] max-sm:px-4">
      <div className="mx-auto flex w-full max-w-[1340px] flex-col gap-7">
        <div className="grid grid-cols-[269px_269px_minmax(360px,1fr)_auto] items-start gap-[25px] max-xl:grid-cols-2 max-lg:grid-cols-1">
          <MetricCard title="Lead Metrics" value="4,100" percent="73" active />
          <MetricCard title="Qualified Lead Metrics" value="1,100" percent="43" />
          <TrendChart />
          <div className="flex items-center gap-[17px] pt-[11px] max-xl:col-span-2 max-lg:col-span-1 max-lg:pt-0">
            <button
              type="button"
              className="flex h-8 items-center gap-2.5 rounded-[10px] border border-[#d1d1d1] bg-[#f8f8f8] px-3 text-[10px] text-[#34373c]"
            >
              <FolderInput size={18} />
              Import
            </button>
            <Link
              href="/crm"
              className="flex h-8 items-center gap-2.5 rounded-[10px] border border-[#d1d1d1] bg-[#09232d] px-3 text-[10px] font-medium text-white"
            >
              <Sparkles size={18} />
              View CRM Pipeline
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,949px)_368px] gap-[25px] max-xl:grid-cols-1">
          <ChatWorkspace />
          <OutreachPanel />
        </div>
      </div>
    </div>
  );
}
