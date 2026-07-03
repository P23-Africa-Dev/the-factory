"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { User, ChevronLeft, ChevronRight } from "lucide-react";
import Logo from "@/assets/images/logo.png";
import { DownloadAgentAppModal } from "@/components/pwa/DownloadAgentAppModal";
import { getAgentInstallUrl, isMobileDevice } from "@/lib/agent-pwa-url";
import Footer from "@/components/layout/footer";

const testimonials = [
  {
    quote: "I've been consistently impressed with the quality of service provided by Factory 23. It have exceeded my expectations and delivered exceptional results. Highly recommended!",
    name: "John D.",
    role: "Company CEO",
    avatar: "/avatars/john_avatar.png",
    bgColor: "bg-[#FDF2FB]",
    borderColor: "border-[#FAD8F7]",
  },
  {
    quote: "I've been consistently impressed with the quality of service provided by Factory 23. It have exceeded my expectations and delivered exceptional results. Highly recommended!",
    name: "Touka F.",
    role: "Company CEO",
    avatar: "/avatars/touka_avatar.png",
    bgColor: "bg-white",
    borderColor: "border-gray-100",
    shadow: "shadow-lg shadow-gray-100/50",
  },
  {
    quote: "I've been consistently impressed with the quality of service provided by Factory 23. It have exceeded my expectations and delivered exceptional results. Highly recommended!",
    name: "Donald N.",
    role: "Company CEO",
    avatar: "/avatars/donald_avatar.png",
    bgColor: "bg-[#F0FDF8]",
    borderColor: "border-[#D1F7E2]",
  },
  {
    quote: "Implementing the Factory 23 field tracking system transformed our dispatch operations. Real-time updates and offline synchronization are absolute game-changers.",
    name: "Sarah M.",
    role: "Operations Director",
    avatar: "/avatars/female-avatar.png",
    bgColor: "bg-[#FDF2FB]",
    borderColor: "border-[#FAD8F7]",
  },
  {
    quote: "We tried several platforms before, but none offered the offline reliability of Factory 23. Our field agents love the app's simplicity and speed.",
    name: "David K.",
    role: "Logistics Manager",
    avatar: "/avatars/male-avatar.png",
    bgColor: "bg-white",
    borderColor: "border-gray-100",
    shadow: "shadow-lg shadow-gray-100/50",
  },
  {
    quote: "The customer service and custom workflows allowed us to integrate our existing database smoothly. Highly recommend for any enterprise with field teams.",
    name: "Elena R.",
    role: "Product Head",
    avatar: "/avatars/female-avatar.png",
    bgColor: "bg-[#F0FDF8]",
    borderColor: "border-[#D1F7E2]",
  }
];

const pricingTiers = [
  { name: "Up to 5 users", monthly: 99, annual: 990 },
  { name: "Up to 10 users", monthly: 99, annual: 990 },
  { name: "Up to 15 users", monthly: 99, annual: 990 },
  { name: "Up to 20 users", monthly: 99, annual: 990 },
  { name: "Up to 25 users", monthly: 99, annual: 990 },
  { name: "Up to 30 users", monthly: 99, annual: 990 },
  { name: "Up to 40 users", monthly: 99, annual: 990 },
  { name: "Up to 50 users", monthly: 99, annual: 990 },
  { name: "Up to 75 users", monthly: 99, annual: 990 },
  { name: "Up to 100 users", monthly: 99, annual: 990 },
];

export default function Home() {
  const [agentModalOpen, setAgentModalOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);
  const [hoveredTier, setHoveredTier] = useState<number | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function handleDownloadAgentApp() {
    if (isMobileDevice()) {
      window.location.href = getAgentInstallUrl();
      return;
    }
    setAgentModalOpen(true);
  }

  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
      window.history.pushState(null, "", `#${targetId}`);
    }
  };


  const handleNext = () => {
    if (isDesktop) {
      setCurrentIndex((prev) => (prev === 0 ? 3 : 0));
    } else {
      setCurrentIndex((prev) => (prev === testimonials.length - 1 ? 0 : prev + 1));
    }
  };

  const handlePrev = () => {
    if (isDesktop) {
      setCurrentIndex((prev) => (prev === 0 ? 3 : 0));
    } else {
      setCurrentIndex((prev) => (prev === 0 ? testimonials.length - 1 : prev - 1));
    }
  };

  const handleDotClick = (idx: number) => {
    if (isDesktop) {
      setCurrentIndex(idx * 3);
    } else {
      setCurrentIndex(idx);
    }
  };

  const translatePercent = isDesktop ? Math.floor(currentIndex / 3) * 100 : currentIndex * 100;
  const totalDots = isDesktop ? 2 : testimonials.length;

  return (
    <div className="min-h-screen w-full flex flex-col bg-white font-sans overflow-x-hidden">
      {/* Split-screen layout container */}
      <div className="flex-1 w-full flex flex-col lg:flex-row bg-white">
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
              <a href="#about" onClick={(e) => handleScroll(e, "about")} className="text-sm font-semibold text-[#0B252C] hover:opacity-80 transition-opacity">
                About
              </a>
              <a href="#pricing" onClick={(e) => handleScroll(e, "pricing")} className="text-sm font-semibold text-[#0B252C] hover:opacity-80 transition-opacity">
                Pricing
              </a>
              <a href="#reviews" onClick={(e) => handleScroll(e, "reviews")} className="text-sm font-semibold text-[#0B252C] hover:opacity-80 transition-opacity">
                Reviews
              </a>
              <a href="#p23-africa" onClick={(e) => handleScroll(e, "p23-africa")} className="text-sm font-semibold text-[#0B252C] hover:opacity-80 transition-opacity">
                P23 Africa
              </a>
            </nav>
          </header>

          {/* Hero Section */}
          <main id="about" className="my-auto py-12 lg:py-0 flex flex-col justify-center max-w-xl">
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
              <button
                onClick={handleDownloadAgentApp}
                className="w-full sm:w-auto px-8 h-14 border-2 border-[#0B252C] text-[#0B252C] text-sm font-bold rounded-full bg-transparent hover:bg-[#0B252C]/5 active:scale-[0.98] transition-all cursor-pointer"
              >
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

        {/* Closes split-screen layout container */}
      </div>

      {/* Stats Section */}
      <section className="w-full bg-[#F4F7F6] py-16 lg:py-20 px-6 sm:px-12 lg:px-24 font-sans border-t border-gray-100">
        <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-start lg:items-center justify-between gap-8 lg:gap-16">
          <div className="max-w-2xl">
            <h2 className="text-2xl sm:text-3xl lg:text-[36px] font-extrabold text-[#0B252C] leading-tight tracking-tight">
              Helping businesses simplify field operations while keeping every customer interaction organized.
            </h2>
          </div>
          <div className="flex flex-row items-center gap-12 sm:gap-24">
            <div>
              <div className="text-5xl lg:text-7xl font-extrabold text-[#0B252C] tracking-tight">
                25k +
              </div>
              <div className="text-xs sm:text-sm font-semibold text-[#4A5F64] mt-2 tracking-wider">
                Total Users
              </div>
            </div>
            <div>
              <div className="text-5xl lg:text-7xl font-extrabold text-[#0B252C] tracking-tight">
                1.5k +
              </div>
              <div className="text-xs sm:text-sm font-semibold text-[#4A5F64] mt-2 tracking-wider">
                Users Ratings
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section id="reviews" className="w-full bg-[#F8FAFC] py-20 lg:py-28 px-6 sm:px-12 lg:px-24 font-sans relative overflow-hidden">
        <div className="max-w-7xl mx-auto flex flex-col items-center">
          
          {/* Header */}
          <div className="text-center max-w-3xl mb-16">
            <h2 className="text-3xl sm:text-4xl lg:text-[40px] font-extrabold text-[#0B252C] tracking-tight">
              What Our Client Say About Us
            </h2>
            <p className="text-sm sm:text-base text-[#4A5F64] leading-relaxed mt-4">
              Discover the experiences of our satisfied customers! Read their testimonials to learn how our services have made a positive impact on their businesses.
            </p>
          </div>

          {/* Carousel Viewport Container */}
          <div className="w-full relative flex items-center gap-4 sm:gap-6">
            {/* Left Navigation Button */}
            <button
              onClick={handlePrev}
              aria-label="Previous testimonial"
              className="absolute left-[-16px] lg:left-[-24px] z-20 w-12 h-12 rounded-full bg-white flex items-center justify-center border border-gray-100 shadow-md hover:bg-gray-50 hover:shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5 text-[#0B252C] stroke-[2.5]" />
            </button>

            {/* Carousel Inner Container */}
            <div className="w-full overflow-hidden px-2 py-4">
              <div
                className="flex transition-transform duration-500 ease-in-out"
                style={{ transform: `translateX(-${translatePercent}%)` }}
              >
                {testimonials.map((item, idx) => (
                  <div
                    key={idx}
                    className="w-full lg:w-1/3 shrink-0 px-3 sm:px-4 flex"
                  >
                    <div
                      className={`w-full rounded-2xl border p-8 flex flex-col justify-between transition-all duration-300 hover:shadow-md ${item.bgColor} ${item.borderColor} ${item.shadow || ""}`}
                    >
                      <p className="text-[15px] sm:text-base text-[#4A5F64] leading-relaxed italic mb-8">
                        &ldquo;{item.quote}&rdquo;
                      </p>
                      
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full overflow-hidden shrink-0 border border-gray-100">
                          <Image
                            src={item.avatar}
                            alt={item.name}
                            width={48}
                            height={48}
                            className="object-cover w-full h-full"
                          />
                        </div>
                        <div>
                          <h4 className="text-sm sm:text-base font-bold text-[#0B252C]">
                            {item.name}
                          </h4>
                          <p className="text-xs text-[#4A5F64] font-medium">
                            {item.role}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Navigation Button */}
            <button
              onClick={handleNext}
              aria-label="Next testimonial"
              className="absolute right-[-16px] lg:right-[-24px] z-20 w-12 h-12 rounded-full bg-white flex items-center justify-center border border-gray-100 shadow-md hover:bg-gray-50 hover:shadow-lg transition-all active:scale-95 cursor-pointer"
            >
              <ChevronRight className="w-5 h-5 text-[#0B252C] stroke-[2.5]" />
            </button>
          </div>

          {/* Indicator Dots */}
          <div className="flex items-center gap-2.5 mt-10">
            {Array.from({ length: totalDots }).map((_, idx) => {
              const isActive = isDesktop
                ? Math.floor(currentIndex / 3) === idx
                : currentIndex === idx;
              return (
                <button
                  key={idx}
                  onClick={() => handleDotClick(idx)}
                  aria-label={`Go to slide page ${idx + 1}`}
                  className={`h-2.5 rounded-full transition-all duration-300 cursor-pointer ${
                    isActive ? "w-6 bg-[#0B252C]" : "w-2.5 bg-[#0B252C]/30 hover:bg-[#0B252C]/50"
                  }`}
                />
              );
            })}
          </div>

        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="w-full bg-[#0B252C] py-20 lg:py-28 px-6 sm:px-12 lg:px-24 font-sans relative overflow-hidden">
        {/* Decorative background SVG patterns */}
        <div className="absolute inset-y-0 right-0 w-1/4 opacity-10 pointer-events-none hidden lg:block z-0">
          <svg className="w-full h-full text-[#9BDD7C] stroke-current fill-none" viewBox="0 0 300 800" strokeWidth="2">
            {Array.from({ length: 12 }).map((_, i) => {
              const offset = i * 24;
              return (
                <path
                  key={i}
                  d={`M300 ${100 + offset} L${150 + offset / 2} ${250 + offset} L300 ${400 + offset}`}
                />
              );
            })}
          </svg>
        </div>
        <div className="absolute inset-y-0 left-0 w-1/4 opacity-10 pointer-events-none hidden lg:block z-0">
          <svg className="w-full h-full text-[#9BDD7C] stroke-current fill-none" viewBox="0 0 300 800" strokeWidth="2">
            {Array.from({ length: 12 }).map((_, i) => {
              const offset = i * 24;
              return (
                <path
                  key={i}
                  d={`M0 ${200 + offset} L${150 - offset / 2} ${350 + offset} L0 ${500 + offset}`}
                />
              );
            })}
          </svg>
        </div>

        <div className="max-w-5xl mx-auto flex flex-col items-center">
          
          {/* Header */}
          <div className="text-center mb-16 relative z-10">
            <h2 className="text-3xl sm:text-4xl lg:text-[40px] font-extrabold text-white tracking-tight">
              Simple, transparent pricing
            </h2>
            <p className="text-sm sm:text-base text-gray-300 mt-4">
              No contracts. No surprise fees.
            </p>
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block w-full max-w-[900px] bg-white rounded-[32px] p-8 lg:p-10 shadow-2xl relative z-10 overflow-visible mx-auto">
            
            {/* Top Badge */}
            <div className="flex justify-end mb-2">
              <span className="bg-[#C56C39] text-white text-[13px] font-medium px-4 py-2 rounded-lg inline-block shadow-sm">
                Annual billing saves you 17%
              </span>
            </div>

            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 pb-4 border-b border-gray-100 items-end px-2">
              <div className="col-span-5 text-left">
                <h3 className="text-[28px] font-bold text-[#0B252C] leading-none mb-1">Team Size</h3>
                <p className="text-[13px] text-[#4A5F64]">
                  Knowing your team size help you choose appropriately.
                </p>
              </div>
              <div className="col-span-2 text-center">
                <span className="text-[15px] text-[#0B252C] font-semibold">Monthly</span>
              </div>
              <div className="col-span-2 text-center">
                <span className="text-[15px] text-[#0B252C] font-semibold block leading-tight">Annual</span>
                <span className="text-[12px] text-[#4A5F64] block leading-tight">(2 months free)</span>
              </div>
              <div className="col-span-3 text-right">
                {/* Empty space above Choose plan buttons */}
              </div>
            </div>

            {/* Table Body */}
            <div className="flex flex-col mt-4">
              {pricingTiers.map((tier, idx) => {
                const isHovered = hoveredTier === idx;
                return (
                  <div
                    key={idx}
                    onMouseEnter={() => setHoveredTier(idx)}
                    onMouseLeave={() => setHoveredTier(null)}
                    className="relative group cursor-pointer"
                  >
                    {/* Background layer for hover state */}
                    <div 
                      className={`absolute inset-y-0 left-[-16px] lg:left-[-24px] right-[-16px] md:right-[-48px] lg:right-[-80px] rounded-[16px] transition-all duration-150 z-0 ${
                        isHovered ? "bg-[#1E5A69] shadow-lg" : "bg-transparent"
                      }`} 
                    />

                    {/* Content layer */}
                    <div className="grid grid-cols-12 gap-4 items-center py-4 px-2 relative z-10 transition-colors duration-150">
                      <div className="col-span-5 text-left">
                        <span className={`text-[16px] font-medium ${isHovered ? "text-white" : "text-[#0B252C]"}`}>
                          {tier.name}
                        </span>
                      </div>
                      <div className="col-span-2 text-center">
                        <span className={`text-[16px] font-medium tracking-wide ${isHovered ? "text-white" : "text-[#0B252C]/90"}`}>
                          ${tier.monthly}
                        </span>
                      </div>
                      <div className="col-span-2 text-center">
                        <span className={`text-[16px] font-medium tracking-wide ${isHovered ? "text-white" : "text-[#0B252C]/90"}`}>
                          ${tier.annual}
                        </span>
                      </div>
                      <div className="col-span-3 text-right">
                        <button
                          className={`px-6 py-2.5 text-[14px] font-medium rounded-lg transition-all cursor-pointer shadow-sm ${
                            isHovered
                              ? "bg-gradient-to-r from-[#A7E88A] to-[#92D774] text-[#0B252C]"
                              : "bg-[#F4F7F6] text-[#A0AAB0] hover:bg-gray-200"
                          }`}
                        >
                          Choose plan
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>

          {/* Mobile View (Stacked Cards) */}
          <div className="md:hidden w-full flex flex-col gap-4 relative z-10 px-4">
            <div className="text-center mb-2">
              <span className="bg-[#C56C39] text-white text-[12px] font-bold px-4 py-2 rounded-lg inline-block shadow-sm">
                Annual billing saves you 17%
              </span>
            </div>
            {pricingTiers.map((tier, idx) => {
              const isHovered = hoveredTier === idx;
              return (
                <div
                  key={idx}
                  onMouseEnter={() => setHoveredTier(idx)}
                  onMouseLeave={() => setHoveredTier(null)}
                  onClick={() => setHoveredTier(isHovered ? null : idx)}
                  className={`w-full rounded-2xl border p-5 flex flex-col gap-4 transition-all duration-300 cursor-pointer ${
                    isHovered
                      ? "bg-[#1E5A69] border-[#1E5A69] text-white shadow-lg scale-[1.02]"
                      : "bg-white border-gray-150 text-[#0B252C]"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-lg">{tier.name}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 py-2 border-t border-b border-current/10">
                    <div>
                      <span className="text-[11px] uppercase tracking-wider opacity-60 block">Monthly</span>
                      <span className="text-xl font-extrabold">${tier.monthly}</span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase tracking-wider opacity-60 block">Annual</span>
                      <span className="text-xl font-extrabold">${tier.annual}</span>
                    </div>
                  </div>
                  <button
                    className={`w-full py-3 text-sm font-bold rounded-[10px] transition-all cursor-pointer shadow-sm ${
                      isHovered
                        ? "bg-[#9BDD7C] text-[#0B252C]"
                        : "bg-[#F4F7F6] text-[#0B252C]/70 hover:bg-gray-200"
                    }`}
                  >
                    Choose plan
                  </button>
                </div>
              );
            })}
          </div>

        </div>
      </section>

      {/* Full-width Footer */}
      <div id="p23-africa">
        <Footer />
      </div>

      <DownloadAgentAppModal isOpen={agentModalOpen} onClose={() => setAgentModalOpen(false)} />
    </div>
  );
}
