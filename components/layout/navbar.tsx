"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { clearAuthSession } from "@/lib/auth/session";
import { ChevronDown, Menu, X, LogOut, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils/sample";

// Import local SVG assets
import DashboardIcon from "@/assets/nav-icons/dashboard.svg";
import MapIconAsset from "@/assets/nav-icons/map.svg";
import ProjectsIcon from "@/assets/nav-icons/projects.svg";
import WorkforceIcon from "@/assets/nav-icons/workforce.svg";
import CRMIcon from "@/assets/nav-icons/crm.svg";

import FinanceIcon from "@/assets/nav-icons/finance.svg";
import NotificationIcon from "@/assets/nav-icons/notification.svg";
import SettingsIcon from "@/assets/nav-icons/settings.svg";
import Logo from "@/assets/images/logo.png";

const navItems = [
  { name: "Dashboard", href: "/dashboard", icon: DashboardIcon },
  // { name: 'Sales Engine', href: '/sales-engine', icon: SalesEngineIcon },
  { name: "Map", href: "/map", icon: MapIconAsset },
  {
    name: "Projects",
    href: "/projects",
    icon: ProjectsIcon,
    hasDropdown: true,
  },
  {
    name: "Workforce",
    href: "/operations",
    icon: WorkforceIcon,
    hasDropdown: true,
  },
  { name: "CRM", href: "/crm", icon: CRMIcon },
  // { name: 'Insight', href: '/insight', icon: InsightIcon },
  { name: "Finance", href: "/finance", icon: FinanceIcon, hasDropdown: true },
];

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const user = useAuthStore((s) => s.user);
  const clearUser = useAuthStore((s) => s.clearUser);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        profileRef.current &&
        !profileRef.current.contains(e.target as Node)
      ) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleLogout() {
    clearAuthSession();
    clearUser();
    router.push("/login");
  }

  return (
    <nav className="h-20 flex items-center justify-between px-6 lg:px-10 bg-[#09232D] text-white sticky top-0 z-50">
      {/* Logo */}
      <div className="flex items-center">
        <Link href="/dashboard" className="flex items-center">
          <div className="w-10 h-10 flex items-center justify-center relative">
            <Image
              src={Logo}
              alt="Factory Logo"
              width={40}
              height={40}
              className="object-contain"
            />
          </div>
        </Link>

        {/* Desktop Navigation Links */}
        <div className="hidden lg:flex items-center gap-8 xl:gap-10 ml-17">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-2 text-sm font-medium transition-all duration-300",
                  isActive ? "text-white" : "text-white/40 hover:text-white/70",
                )}
              >
                <Image
                  src={item.icon}
                  alt={item.name}
                  width={18}
                  height={18}
                  className={cn(
                    "transition-opacity duration-300",
                    isActive
                      ? "opacity-100"
                      : "opacity-60 group-hover:opacity-100",
                  )}
                />
                <span>{item.name}</span>
                {item.hasDropdown && (
                  <ChevronDown size={14} className="opacity-40" />
                )}

                {isActive && (
                  <motion.div
                    layoutId="activeUnderline"
                    className="absolute -bottom-3 left-0 right-0 h-px bg-white rounded-full z-10"
                  />
                )}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Right Side Actions */}
      <div className="flex items-center gap-4 lg:gap-8">
        <div className="hidden sm:flex items-center gap-3 lg:gap-5 text-white/60">
          <button className="hover:text-white transition-all cursor-pointer relative p-1">
            <Image
              src={NotificationIcon}
              alt="Notifications"
              width={20}
              height={20}
            />
            <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border-2 border-[#0B1215]"></span>
          </button>
          <button className="hover:text-white transition-all cursor-pointer p-1">
            <Image src={SettingsIcon} alt="Settings" width={20} height={20} />
          </button>
        </div>

        <div
          ref={profileRef}
          className="relative flex items-center gap-3 lg:gap-4"
        >
          <div className="hidden sm:block text-right">
            <p className="text-sm font-bold tracking-tight">
              {user?.name ?? "—"}
            </p>
            <p className="text-[11px] text-white/30 font-medium tracking-wide">
              {user?.email ?? "—"}
            </p>
          </div>

          {/* Avatar + chevron trigger */}
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-1.5 focus:outline-none group"
          >
            <div className="w-10 h-10 lg:w-11 lg:h-11 rounded-full overflow-hidden border-2 border-white/10 p-0.5 bg-white/10 flex items-center justify-center">
              {user?.avatar ? (
                <Image
                  src={user.avatar}
                  alt="Profile"
                  width={44}
                  height={44}
                  className="w-full h-full object-cover rounded-full"
                />
              ) : (
                <span className="text-sm font-bold text-white">
                  {user?.name?.[0]?.toUpperCase() ?? "?"}
                </span>
              )}
            </div>
            <ChevronDown
              size={14}
              className={cn(
                "text-white/40 group-hover:text-white/70 transition-all duration-200",
                profileOpen && "rotate-180 text-white/70",
              )}
            />
          </button>

          {/* Dropdown */}
          <AnimatePresence>
            {profileOpen && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.96 }}
                transition={{ duration: 0.15, ease: "easeOut" }}
                className="absolute right-0 top-full mt-3 w-56 bg-[#0d2d3a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50"
              >
                {/* Profile header */}
                <div className="px-4 py-3.5 border-b border-white/10 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-white/10 border border-white/10 flex items-center justify-center shrink-0">
                    {user?.avatar ? (
                      <Image
                        src={user.avatar}
                        alt="Profile"
                        width={36}
                        height={36}
                        className="w-full h-full object-cover rounded-full"
                      />
                    ) : (
                      <span className="text-xs font-bold text-white">
                        {user?.name?.[0]?.toUpperCase() ?? "?"}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {user?.name ?? "—"}
                    </p>
                    <p className="text-[11px] text-white/40 truncate">
                      {user?.email ?? "—"}
                    </p>
                  </div>
                </div>

                {/* Menu items */}
                <div className="p-1.5">
                  <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-white/60 hover:text-white hover:bg-white/5 transition-colors text-sm font-medium">
                    <User size={15} />
                    Profile
                  </button>
                  <div className="my-1 border-t border-white/5" />
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors text-sm font-medium"
                  >
                    <LogOut size={15} />
                    Log out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Mobile Menu Button */}
        <button
          className="lg:hidden p-2 text-white/60 hover:text-white transition-colors"
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        >
          {isMobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[99] lg:hidden"
            />

            {/* Content */}
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="fixed top-0 right-0 bottom-0 w-[80%] max-w-sm bg-[#09232D] border-l border-white/5 z-[100] lg:hidden p-8 flex flex-col gap-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-4">
                <div className="w-10 h-10">
                  <Image
                    src={Logo}
                    alt="Factory Logo"
                    width={40}
                    height={40}
                    className="object-contain"
                  />
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 text-white/40 hover:text-white"
                >
                  <X size={28} />
                </button>
              </div>

              <div className="space-y-1">
                {navItems.map((item) => {
                  const isActive = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center gap-4 p-4 rounded-2xl transition-all",
                        isActive
                          ? "bg-white/5 text-white"
                          : "text-white/40 hover:bg-white/5",
                      )}
                    >
                      <Image
                        src={item.icon}
                        alt={item.name}
                        width={22}
                        height={22}
                        className={isActive ? "opacity-100" : "opacity-40"}
                      />
                      <span className="text-lg font-bold">{item.name}</span>
                      {item.hasDropdown && (
                        <ChevronDown
                          size={16}
                          className="ml-auto opacity-40 md:hidden"
                        />
                      )}
                    </Link>
                  );
                })}
              </div>

              <div className="mt-auto space-y-6">
                <div className="flex flex-col gap-4 p-4 bg-white/5 rounded-2xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full border border-white/20 bg-white/10 flex items-center justify-center overflow-hidden shrink-0">
                      {user?.avatar ? (
                        <Image
                          src={user.avatar}
                          alt="Profile"
                          width={48}
                          height={48}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-base font-bold text-white">
                          {user?.name?.[0]?.toUpperCase() ?? "?"}
                        </span>
                      )}
                    </div>
                    <div>
                      <p className="text-base font-bold">{user?.name ?? "—"}</p>
                      <p className="text-xs text-white/30">
                        {user?.email ?? "—"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button className="flex-1 bg-white/5 p-4 rounded-xl flex items-center justify-center text-white/60 hover:text-white transition-colors">
                    <Image
                      src={NotificationIcon}
                      alt="Notifications"
                      width={24}
                      height={24}
                    />
                  </button>
                  <button className="flex-1 bg-white/5 p-4 rounded-xl flex items-center justify-center text-white/60 hover:text-white transition-colors">
                    <Image
                      src={SettingsIcon}
                      alt="Settings"
                      width={24}
                      height={24}
                    />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </nav>
  );
}
