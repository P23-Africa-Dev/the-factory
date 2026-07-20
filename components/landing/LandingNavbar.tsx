"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X, User } from "lucide-react";
import FactoryLogo from "@/components/layout/FactoryLogo";

export default function LandingNavbar() {
  const [isOpen, setIsOpen] = useState(false);

  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    setIsOpen(false);
    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
      window.history.pushState(null, "", `#${targetId}`);
    }
  };

  return (
    <header className="relative w-full z-30">
      {/* Desktop Split Navbar (lg screens and above) */}
      <div className="hidden lg:flex w-full items-stretch">
        {/* Left Pane Header (White Background) */}
        <div className="flex-1 lg:max-w-[58%] bg-white px-6 sm:px-10 lg:px-16 pt-8 pb-6 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 shrink-0">
            <FactoryLogo className="w-12 h-auto" />
            <span className="text-lg sm:text-xl font-bold tracking-tight text-[#0B252C]">
              Factory 23
            </span>
          </Link>

          {/* Navigation Links */}
          <nav className="flex items-center gap-8 sm:gap-10 xl:gap-14">
            <a
              href="#about"
              onClick={(e) => handleScroll(e, "about")}
              className="text-sm font-semibold text-[#0B252C] hover:opacity-80 transition-opacity"
            >
              About
            </a>
            <a
              href="#pricing"
              onClick={(e) => handleScroll(e, "pricing")}
              className="text-sm font-semibold text-[#0B252C] hover:opacity-80 transition-opacity"
            >
              Pricing
            </a>
            <a
              href="#reviews"
              onClick={(e) => handleScroll(e, "reviews")}
              className="text-sm font-semibold text-[#0B252C] hover:opacity-80 transition-opacity"
            >
              Reviews
            </a>
            <a
              href="#p23-africa"
              onClick={(e) => handleScroll(e, "p23-africa")}
              className="text-sm font-semibold text-[#0B252C] hover:opacity-80 transition-opacity"
            >
              P23 Africa
            </a>
          </nav>
        </div>

        {/* Right Pane Header (Dark Teal Background) */}
        <div className="lg:w-[42%] bg-[#0B252C] px-6 sm:px-10 lg:px-16 pt-8 pb-6 flex items-center justify-end gap-4">
          <Link
            href="/login"
            className="px-6 h-11 border border-white/40 text-white text-xs font-semibold rounded-full flex items-center justify-center gap-2 hover:border-white/70 hover:bg-white/10 active:scale-[0.98] transition-all"
          >
            <User className="w-4 h-4 stroke-[2.5]" />
            Log In
          </Link>
          <Link href="/enterprise/schedule-demo">
            <button className="px-6 h-11 bg-white text-[#0B252C] text-xs font-bold rounded-full shadow-[0px_2px_8px_rgba(0,0,0,0.1)] hover:bg-white/95 active:scale-[0.98] transition-all cursor-pointer">
              Book a Demo
            </button>
          </Link>
        </div>
      </div>

      {/* Mobile Navbar (< lg screens) */}
      <div className="lg:hidden flex items-center justify-between w-full bg-white px-6 py-5">
        <Link href="/" className="flex items-center gap-3 shrink-0">
          <FactoryLogo className="w-10 h-auto" />
          <span className="text-lg font-bold tracking-tight text-[#0B252C]">
            Factory 23
          </span>
        </Link>

        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 text-[#0B252C] focus:outline-none hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Toggle navigation menu"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 bg-white border border-gray-100 shadow-xl p-6 flex flex-col gap-5 z-40 animate-in fade-in slide-in-from-top-5 duration-200 lg:hidden">
          <a
            href="#about"
            onClick={(e) => handleScroll(e, "about")}
            className="text-base font-semibold text-[#0B252C] py-2 border-b border-gray-50 hover:text-opacity-70"
          >
            About
          </a>
          <a
            href="#pricing"
            onClick={(e) => handleScroll(e, "pricing")}
            className="text-base font-semibold text-[#0B252C] py-2 border-b border-gray-50 hover:text-opacity-70"
          >
            Pricing
          </a>
          <a
            href="#reviews"
            onClick={(e) => handleScroll(e, "reviews")}
            className="text-base font-semibold text-[#0B252C] py-2 border-b border-gray-50 hover:text-opacity-70"
          >
            Reviews
          </a>
          <a
            href="#p23-africa"
            onClick={(e) => handleScroll(e, "p23-africa")}
            className="text-base font-semibold text-[#0B252C] py-2 border-b border-gray-50 hover:text-opacity-70"
          >
            P23 Africa
          </a>

          {/* Mobile Quick Action Buttons */}
          <div className="flex flex-col gap-3 mt-2">
            <Link
              href="/login"
              onClick={() => setIsOpen(false)}
              className="w-full h-12 border border-[#0B252C]/20 text-[#0B252C] text-sm font-semibold rounded-full flex items-center justify-center gap-2 hover:bg-[#0B252C]/5 transition-all"
            >
              <User className="w-4 h-4 stroke-[2.5]" />
              Log In
            </Link>
            <Link
              href="/enterprise/schedule-demo"
              onClick={() => setIsOpen(false)}
              className="w-full"
            >
              <button className="w-full h-12 bg-[#0B252C] text-white text-sm font-bold rounded-full shadow-md hover:opacity-90 transition-all cursor-pointer">
                Book a Demo
              </button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
