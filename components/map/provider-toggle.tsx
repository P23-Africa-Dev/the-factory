"use client";

import type { MapProvider } from "@/lib/map/types";
import { useMapProvider } from "@/lib/map/use-map-provider";

type ProviderToggleProps = {
    className?: string;
    onChange?: (provider: MapProvider) => void;
};

const PROVIDER_OPTIONS: Array<{ value: MapProvider; label: string }> = [
    { value: "mapbox", label: "Mapbox" },
    { value: "google", label: "Google Maps" },
];

export function ProviderToggle({ className = "", onChange }: ProviderToggleProps) {
    const { provider, setProvider, isHydrated } = useMapProvider();

    return (
        <div
            className={`inline-flex items-center rounded-full border border-gray-200 bg-white p-1 shadow-sm ${className}`.trim()}
            role="group"
            aria-label="Map provider"
        >
            {PROVIDER_OPTIONS.map((option) => {
                const active = provider === option.value;

                return (
                    <button
                        key={option.value}
                        type="button"
                        disabled={!isHydrated}
                        onClick={() => {
                            setProvider(option.value);
                            onChange?.(option.value);
                        }}
                        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${active
                                ? "bg-slate-900 text-white"
                                : "text-slate-600 hover:bg-slate-100"
                            } disabled:cursor-not-allowed disabled:opacity-60`}
                        aria-pressed={active}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
