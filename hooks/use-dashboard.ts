"use client";

import { useQuery } from "@tanstack/react-query";
import {
    getDashboardOverview,
    getWorkforceSummary,
    type DashboardOverviewData,
    type DashboardQueryParams,
    type WorkforceSummaryData,
} from "@/lib/api/dashboard";
import type { ApiRoleBasePath } from "@/lib/api/crm";
import { getAuthTokenFromDocument } from "@/lib/auth/session";

export type UseDashboardParams = DashboardQueryParams & {
    basePath?: ApiRoleBasePath;
};

export const DASHBOARD_KEYS = {
    all: ["dashboard"] as const,
    overview: (params: UseDashboardParams) => ["dashboard", "overview", params] as const,
    workforce: (params: UseDashboardParams) => ["dashboard", "workforce", params] as const,
};

export function useDashboardOverview(params: UseDashboardParams = {}) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
    const { basePath = "/admin", ...queryParams } = params;

    return useQuery({
        queryKey: DASHBOARD_KEYS.overview(params),
        queryFn: async (): Promise<DashboardOverviewData> => {
            const res = await getDashboardOverview(queryParams, token, basePath);
            return res.data;
        },
        enabled: !!token && !!queryParams.company_id,
        staleTime: 1000 * 60 * 2,
    });
}

export function useWorkforceSummary(params: UseDashboardParams = {}) {
    const token = typeof window !== "undefined" ? getAuthTokenFromDocument() : "";
    const { basePath = "/admin", ...queryParams } = params;

    return useQuery({
        queryKey: DASHBOARD_KEYS.workforce(params),
        queryFn: async (): Promise<WorkforceSummaryData> => {
            const res = await getWorkforceSummary(queryParams, token, basePath);
            return res.data;
        },
        enabled: !!token && !!queryParams.company_id,
        staleTime: 1000 * 60 * 2,
    });
}
