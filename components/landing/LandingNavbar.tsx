"use client";

import Link from "next/link";
import Image from "next/image";
import Logo from "@/assets/images/logo.png";

export default function LandingNavbar() {
  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, targetId: string) => {
    e.preventDefault();
    const target = document.getElementById(targetId);
    if (target) {
      target.scrollIntoView({ behavior: "smooth" });
      window.history.pushState(null, "", `#${targetId}`);
    }
  };

  return (
    <header className="flex items-center gap-6 sm:gap-12 w-full">
      <Link href="/" className="flex items-center gap-3 shrink-0">
        <Image
          src={Logo}
          alt="Factory 23 Logo"
          width={54}
          height={54}
          className="object-contain"
          priority
        />
        <span className="text-lg sm:text-xl font-bold tracking-tight text-[#0B252C]">
          Factory 23
        </span>
      </Link>

      <nav className="hidden sm:flex items-center gap-8">
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
    </header>
  );
}
