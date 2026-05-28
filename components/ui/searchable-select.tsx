"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Search, Check } from "lucide-react";

export type SelectOption = { value: string; label: string };

const DROPDOWN_MIN_WIDTH = 200;
const DROPDOWN_EDGE_GAP = 8; // px from viewport edge

type DropdownPos = { top: number; left: number; width: number; above: boolean };

type SearchableSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
  disabled?: boolean;
  leftIcon?: React.ReactNode;
};

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  className = "",
  disabled = false,
  leftIcon,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState<DropdownPos | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const selected = options.find((o) => o.value === value);

  const calcPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const above = spaceBelow < 240 && rect.top > 240;

    // Width: at least DROPDOWN_MIN_WIDTH, at least as wide as the trigger
    const dropWidth = Math.max(rect.width, DROPDOWN_MIN_WIDTH);

    // Left-anchor by default; right-clamp if it would bleed off-screen
    const rawLeft = rect.left;
    const maxLeft = window.innerWidth - dropWidth - DROPDOWN_EDGE_GAP;
    const left = rawLeft > maxLeft
      ? Math.max(DROPDOWN_EDGE_GAP, rect.right - dropWidth) // align to trigger's right edge
      : Math.max(DROPDOWN_EDGE_GAP, rawLeft);

    setPos({
      top: above ? rect.top : rect.bottom + 4,
      left,
      width: dropWidth,
      above,
    });
  }, []);

  const openDropdown = (e: React.MouseEvent | React.PointerEvent) => {
    e.stopPropagation();
    if (disabled) return;
    calcPos();
    setOpen(true);
    setSearch("");
  };

  const close = useCallback(() => {
    setOpen(false);
    setSearch("");
  }, []);

  // Close on outside click / scroll / resize
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !dropdownRef.current?.contains(e.target as Node)
      ) {
        close();
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    const onScroll = () => { calcPos(); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", calcPos);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", calcPos);
    };
  }, [open, close, calcPos]);

  // Focus search when opened
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 30);
  }, [open]);

  const filtered = options.filter((o) =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const pick = (opt: SelectOption) => {
    onChange(opt.value);
    close();
  };

  const dropdown = open && pos && mounted ? createPortal(
    <div
      ref={dropdownRef}
      style={{
        position: "fixed",
        top: pos.above ? undefined : pos.top,
        bottom: pos.above ? window.innerHeight - pos.top : undefined,
        left: pos.left,
        width: pos.width,
        zIndex: 99999,
      }}
      className="bg-white border border-gray-200 rounded-2xl shadow-[0px_8px_24px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col max-h-60"
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* Search */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
        <Search size={13} className="text-gray-400 shrink-0" />
        <input
          ref={searchRef}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="flex-1 text-[12px] text-gray-700 outline-none bg-transparent placeholder:text-gray-400"
        />
      </div>

      {/* Options */}
      <div className="overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {filtered.length === 0 ? (
          <p className="text-center text-[12px] text-gray-400 py-4">No results</p>
        ) : (
          filtered.map((opt) => {
            const active = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => pick(opt)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-[12px] text-left transition-colors cursor-pointer ${
                  active
                    ? "bg-gray-50 text-[#0B1215] font-semibold"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                <span className="flex-1 min-w-0 whitespace-nowrap overflow-hidden text-ellipsis">{opt.label}</span>
                {active && <Check size={12} className="text-[#0B1215] shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={openDropdown}
        onPointerDown={(e) => e.stopPropagation()}
        className={`flex items-center gap-2 text-left ${className}`}
      >
        {leftIcon && <span className="shrink-0">{leftIcon}</span>}
        <span className={`flex-1 truncate ${!selected ? "text-gray-400" : ""}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={13}
          className={`shrink-0 text-gray-400 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
        />
      </button>
      {dropdown}
    </>
  );
}
