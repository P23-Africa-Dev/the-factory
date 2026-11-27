"use client";

import { ArrowUpDown } from "lucide-react";
import { LEAD_LIST_SORTS, type LeadListSort } from "@/lib/api/crm";

/** Toolbar control for the order of CRM leads (list and board). */
export function LeadSortSelect({
  value,
  onChange,
}: {
  value: LeadListSort;
  onChange: (sort: LeadListSort) => void;
}) {
  return (
    <label
      className={`se-control relative flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm cursor-pointer ${value !== "newest" ? "se-control-active" : ""}`}
    >
      <ArrowUpDown size={13} aria-hidden />
      <span className="sr-only">Sort leads</span>
      <select
        aria-label="Sort leads"
        value={value}
        onChange={(e) => onChange(e.target.value as LeadListSort)}
        className="appearance-none bg-transparent pr-1 outline-none cursor-pointer"
      >
        {LEAD_LIST_SORTS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
