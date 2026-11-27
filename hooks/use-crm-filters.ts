"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isLeadListSort, type LeadListSort } from "@/lib/api/crm";

/**
 * CRM filters live in the URL so they survive reloads, can be shared as links,
 * and are kept when switching between the board and the list.
 *
 *   ?pipeline=12|all   (absent = the user's default pipeline)
 *   ?stage=qualified   (lead stage / label slug)
 *   ?q=acme            (search)
 *   ?created_by=7      (added by)
 *   ?assigned_to=9
 *   ?from=2026-11-01&to=2026-11-19 (local calendar days)
 *   ?source=agent_upload
 *   ?industry=Fintech%20%26%20Payments
 *   ?sort=recent_activity (absent = newest first)
 */
export const CRM_FILTER_KEYS = [
  "pipeline",
  "stage",
  "q",
  "created_by",
  "assigned_to",
  "from",
  "to",
  "source",
  "industry",
  "sort",
] as const;

export type CrmFilterKey = (typeof CRM_FILTER_KEYS)[number];
export type CrmFilters = Partial<Record<CrmFilterKey, string>>;

/** Filters that count toward the "N active" badge (pipeline and search have their own UI). */
const COUNTED_FILTERS: CrmFilterKey[] = ["stage", "created_by", "assigned_to", "from", "industry", "source"];

export function readCrmFilters(params: URLSearchParams | { get(name: string): string | null }): CrmFilters {
  const filters: CrmFilters = {};
  for (const key of CRM_FILTER_KEYS) {
    const value = params.get(key);
    if (value != null && value.trim() !== "") filters[key] = value;
  }
  return filters;
}

/** Build a query string from filters, dropping empty values. */
export function crmFiltersToQuery(filters: CrmFilters): string {
  const params = new URLSearchParams();
  for (const key of CRM_FILTER_KEYS) {
    const value = filters[key];
    if (value != null && String(value).trim() !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function countActiveCrmFilters(filters: CrmFilters): number {
  return COUNTED_FILTERS.filter((key) => {
    if (key === "from") return Boolean(filters.from || filters.to);
    return Boolean(filters[key]);
  }).length;
}

/** The lead order chosen in the URL, defaulting to newest first. */
export function crmSortFromFilters(filters: CrmFilters): LeadListSort {
  return isLeadListSort(filters.sort) ? filters.sort : "newest";
}

export function useCrmFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters = useMemo(() => readCrmFilters(searchParams), [searchParams]);

  const replaceQuery = useCallback(
    (next: CrmFilters) => {
      // Keep unrelated params (e.g. ?lead= deep links) intact.
      const params = new URLSearchParams(searchParams.toString());
      for (const key of CRM_FILTER_KEYS) params.delete(key);
      for (const key of CRM_FILTER_KEYS) {
        const value = next[key];
        if (value != null && String(value).trim() !== "") params.set(key, String(value));
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const setFilters = useCallback(
    (patch: CrmFilters | ((current: CrmFilters) => CrmFilters)) => {
      const current = readCrmFilters(searchParams);
      const next = typeof patch === "function" ? patch(current) : { ...current, ...patch };
      replaceQuery(next);
    },
    [replaceQuery, searchParams],
  );

  const setFilter = useCallback(
    (key: CrmFilterKey, value: string | number | null | undefined) => {
      setFilters({ [key]: value == null ? "" : String(value) });
    },
    [setFilters],
  );

  /** Clear everything except the pipeline selection and the sort order. */
  const clearFilters = useCallback(() => {
    replaceQuery({
      ...(filters.pipeline ? { pipeline: filters.pipeline } : {}),
      ...(filters.sort ? { sort: filters.sort } : {}),
    });
  }, [filters.pipeline, filters.sort, replaceQuery]);

  return {
    filters,
    setFilter,
    setFilters,
    clearFilters,
    activeCount: countActiveCrmFilters(filters),
    /** Query string to carry the current filters to another CRM page. */
    query: crmFiltersToQuery(filters),
  };
}
