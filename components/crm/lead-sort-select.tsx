"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpDown, Check, ChevronDown } from "lucide-react";
import { LEAD_LIST_SORTS, type LeadListSort } from "@/lib/api/crm";

/**
 * Toolbar control for the order of CRM leads (list and board).
 * A custom menu rather than a native <select>: the dark toolbar's white text
 * leaked into the browser's option list and made the options invisible.
 */
export function LeadSortSelect({
  value,
  onChange,
}: {
  value: LeadListSort;
  onChange: (sort: LeadListSort) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const current = LEAD_LIST_SORTS.find((option) => option.value === value) ?? LEAD_LIST_SORTS[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Sort leads: ${current.label}`}
        onClick={() => setOpen((prev) => !prev)}
        className={`se-control flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm ${value !== "newest" ? "se-control-active" : ""}`}
      >
        <ArrowUpDown size={13} aria-hidden />
        <span className="whitespace-nowrap">{current.label}</span>
        <ChevronDown size={13} aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Sort leads"
          className="absolute z-50 top-full mt-1 left-0 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 min-w-52"
        >
          {LEAD_LIST_SORTS.map((option) => {
            const selected = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-[12px] font-medium hover:bg-gray-50 ${selected ? "text-[#0B1215] font-semibold" : "text-gray-600"}`}
                >
                  <span className="whitespace-nowrap">{option.label}</span>
                  {selected && <Check size={13} aria-hidden className="shrink-0 text-[#0B1215]" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
