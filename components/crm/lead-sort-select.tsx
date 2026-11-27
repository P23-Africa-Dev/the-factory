"use client";

import { SortMenu } from "@/components/ui/sort-menu";
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
    <SortMenu
      value={value}
      options={LEAD_LIST_SORTS}
      onChange={onChange}
      defaultValue="newest"
      ariaLabel="Sort leads"
    />
  );
}
