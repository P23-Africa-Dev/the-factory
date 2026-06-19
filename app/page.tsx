"use client";

import Image from "next/image";
import Link from "next/link";
import { User } from "lucide-react";
import Logo from "@/assets/images/logo.png";

export default function Home() {
  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-white font-sans overflow-x-hidden">
      {/* Far-Left Vertical Accent Column (Dark Teal) */}
      <div className="w-12 bg-[#0B252C] shrink-0 hidden lg:block" />

      {/* Main Content Pane (White Background) */}
      <div className="flex-1 lg:max-w-[58%] bg-white flex flex-col justify-between p-6 sm:p-10 lg:p-16 min-h-screen lg:min-h-0">
        {/* Navigation Bar */}
        <header className="flex items-center gap-6 sm:gap-12 w-full">
          <Link href="/" className="flex items-center shrink-0">
            <Image
              src={Logo}
              alt="Factory 23 Logo"
              width={54}
              height={54}
              className="object-contain"
              priority
            />
          </Link>
          
          <nav className="hidden sm:flex items-center gap-8">
            <Link href="#" className="text-sm font-semibold text-[#0B252C] hover:opacity-80 transition-opacity">
              About
            </Link>
            <Link href="#" className="text-sm font-semibold text-[#0B252C] hover:opacity-80 transition-opacity">
              Pricing
            </Link>
            <Link href="#" className="text-sm font-semibold text-[#0B252C] hover:opacity-80 transition-opacity">
              Reviews
            </Link>
            <Link href="#" className="text-sm font-semibold text-[#0B252C] hover:opacity-80 transition-opacity">
              P23 Africa
            </Link>
          </nav>
        </header>

        {/* Hero Section */}
        <main className="my-auto py-12 lg:py-0 flex flex-col justify-center max-w-xl">
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
            The Ultimate Field <br />
            Agent Tracking <br />
            System
          </h1>

          {/* Subheading / Description */}
          <p className="text-sm sm:text-base text-[#4A5F64] leading-relaxed mb-10 max-w-lg">
            An all-in-one field management and CRM platform built for real-world operations. Track teams, manage tasks, and capture customer interactions seamlessly, even offline.
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full">
            <Link href="/register" className="w-full sm:w-auto">
              <button className="w-full sm:w-auto px-10 h-14 bg-[#0B252C] text-white text-sm font-bold rounded-full shadow-[0px_4px_12px_rgba(11,37,44,0.15)] hover:opacity-90 active:scale-[0.98] transition-all cursor-pointer">
                Sign Up
              </button>
            </Link>
            <button className="w-full sm:w-auto px-8 h-14 border-2 border-[#0B252C] text-[#0B252C] text-sm font-bold rounded-full bg-transparent hover:bg-[#0B252C]/5 active:scale-[0.98] transition-all cursor-pointer">
              Download Agent App
            </button>
          </div>
        </main>

        {/* Muted Bottom Section / Spacer */}
        <div className="hidden lg:block h-12" />
      </div>

      {/* Right Column Pane (Dark Teal Background) */}
      <div className="w-full lg:w-[42%] bg-[#0B252C] flex flex-col justify-between p-6 sm:p-10 lg:p-16 relative overflow-hidden min-h-[500px] lg:min-h-screen">
        {/* Right Section Header Buttons */}
        <div className="flex items-center justify-end gap-4 w-full z-10">
          <Link href="/login" className="px-6 h-12 border border-white/30 text-white text-xs font-semibold rounded-full flex items-center justify-center gap-2 hover:border-white/60 hover:bg-white/5 active:scale-[0.98] transition-all">
            <User className="w-4 h-4 stroke-[2.5]" />
            Log In
          </Link>
          <Link href="/enterprise/schedule-demo">
            <button className="px-6 h-12 bg-white text-[#0B252C] text-xs font-bold rounded-full shadow-[0px_2px_8px_rgba(0,0,0,0.1)] hover:bg-white/95 active:scale-[0.98] transition-all cursor-pointer">
              Book a Demo
            </button>
          </Link>
        </div>

        {/* Vector Line Art Illustration */}
        <div className="flex-1 flex items-center justify-center z-10 py-12 lg:py-0">
          <div className="relative w-64 h-64 md:w-80 md:h-80 lg:w-[350px] lg:h-[350px] flex items-center justify-center">
            <svg
              viewBox="0 0 240 240"
              className="w-full h-full text-white/90 fill-none"
              stroke="currentColor"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Hand-drawn style loop-the-loop */}
              <path
                d="M110,60 
                   C95,85 85,130 120,120 
                   C140,115 150,90 130,80 
                   C100,70 80,140 130,150 
                   C155,155 170,130 150,110 
                   C130,90 110,150 145,170 
                   C170,185 185,165 190,140"
                className="opacity-95"
              />
              
              {/* Starburst sparks radiating outward */}
              <path d="M175,85 Q195,80 215,78" className="opacity-90" strokeWidth="3" />
              <path d="M182,108 Q205,109 228,112" className="opacity-90" strokeWidth="3" />
              <path d="M178,130 Q198,142 215,155" className="opacity-90" strokeWidth="3" />
              <path d="M162,148 Q177,165 188,185" className="opacity-90" strokeWidth="3" />
            </svg>
          </div>
        </div>

        {/* Bottom Spacer */}
        <div className="hidden lg:block h-12" />
      </div>
    </div>
  );
}
