"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Menu, X, User } from "lucide-react";
import Logo from "@/assets/images/logo.png";

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
    <header className="relative w-full">
      <div className="flex items-center justify-between w-full">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 shrink-0 z-50">
          <Image
            src={Logo}
            alt="Factory 23 Logo"
            width={50}
            height={50}
            className="object-contain"
            priority
          />
          <span className="text-lg sm:text-xl font-bold tracking-tight text-[#0B252C]">
            Factory 23
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8">
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

        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="md:hidden p-2 text-[#0B252C] focus:outline-none z-50 hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Toggle navigation menu"
        >
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {isOpen && (
        <div className="absolute top-16 left-0 right-0 bg-white border border-gray-100 shadow-xl rounded-2xl p-6 flex flex-col gap-5 z-40 animate-in fade-in slide-in-from-top-5 duration-200 md:hidden">
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
          
          {/* Mobile Quick Action Buttons (Mirrored from right panel for accessibility) */}
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
