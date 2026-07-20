"use client";

import Link from "next/link";
import HeroIllustration from "@/components/layout/HeroIllustration";

interface HeroSectionProps {
  onDownloadAgentApp: () => void;
}

export default function HeroSection({ onDownloadAgentApp }: HeroSectionProps) {
  return (
    <div className="flex-1 w-full flex flex-col lg:flex-row bg-white">
      {/* Main Content Pane (White Background) */}
      <div className="flex-grow lg:max-w-[58%] bg-white flex flex-col justify-between p-6 sm:p-10 lg:p-16 py-6 sm:py-10 lg:py-12 lg:min-h-[calc(100vh-100px)]">
        {/* Hero Content */}
        <main className="my-auto py-6 lg:py-0 flex flex-col justify-center max-w-xl">
          {/* Feature Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white p-1 pr-4 self-start mb-8 shadow-sm">
            <span className="rounded-full bg-[#82C341] px-3 py-1.5 text-[11px] font-semibold text-white tracking-wide uppercase">
              New
            </span>
            <span className="text-[12px] font-medium text-[#4A5F64] tracking-wide">
              Offline RealTime Tracking System
            </span>
          </div>

          {/* Heading */}
          <h1 className="text-4xl sm:text-5xl lg:text-[62px] font-extrabold text-[#0B252C] leading-[1.1] tracking-[-0.02em] mb-6">
            Factory 23 <br />
            The Ultimate Field <br />
            Agent Tracking System
          </h1>

          {/* Subheading / Description */}
          <p className="text-sm sm:text-base text-[#4A5F64] leading-relaxed mb-10 max-w-lg">
            Factory 23 is an all-in-one field management and CRM platform built for real-world operations. Track teams, manage tasks, and capture customer interactions seamlessly, even offline.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
            <Link href="/register" className="w-full sm:w-auto">
              <button className="w-full sm:w-auto px-10 h-14 bg-[#0B252C] text-white text-sm font-bold rounded-full shadow-[0px_4px_12px_rgba(11,37,44,0.15)] hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer">
                Sign Up
              </button>
            </Link>
            <button
              onClick={onDownloadAgentApp}
              className="w-full sm:w-auto px-8 h-14 border-2 border-[#0B252C] text-[#0B252C] text-sm font-bold rounded-full bg-transparent hover:bg-[#0B252C]/5 active:scale-[0.98] transition-all cursor-pointer"
            >
              Download Agent App
            </button>
          </div>
        </main>
      </div>

      {/* Right Column Pane (Dark Teal Background) */}
      <div className="hidden lg:flex lg:w-[42%] bg-[#0B252C] flex-col justify-center p-6 sm:p-10 lg:p-16 relative overflow-hidden min-h-[320px] lg:min-h-[calc(100vh-100px)]">
        {/* Vector Line Art Illustration */}
        <div className="flex-1 flex items-center justify-center z-10 py-6 lg:py-0">
          <HeroIllustration className="w-48 h-auto sm:w-56 md:w-64 lg:w-[280px]" />
        </div>
      </div>
    </div>
  );
}
