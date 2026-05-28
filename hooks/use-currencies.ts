"use client";

import { useQuery } from "@tanstack/react-query";
import {
    getFallbackSupportedCurrencies,
    getSupportedCurrencies,
    type SupportedCurrenciesData,
} from "@/lib/api/currencies";

export const CURRENCY_KEYS = {
    all: ["currencies"] as const,
};

export function useSupportedCurrencies() {
    return useQuery({
        queryKey: CURRENCY_KEYS.all,
        queryFn: async (): Promise<SupportedCurrenciesData> => {
            try {
                const res = await getSupportedCurrencies();
                return res.data;
            } catch {
                return getFallbackSupportedCurrencies();
            }
        },
        staleTime: 1000 * 60 * 10,
    });
}
