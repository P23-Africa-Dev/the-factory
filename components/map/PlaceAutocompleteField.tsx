"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  createSearchSessionToken,
  retrievePlace,
  suggestPlaces,
  type PlaceSuggestion,
  type RetrievedPlace,
} from "@/lib/utils/place-search";
import { useMapCreditStore } from "@/store/map-credits";

const DEBOUNCE_MS = 300;

export type PlaceAutocompleteFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (place: RetrievedPlace) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  inputClassName?: string;
  /** Optional map proximity [lng, lat] to bias results. */
  proximity?: [number, number];
  limit?: number;
  /** When true, show the suggestions panel even if empty (after a search). */
  id?: string;
  name?: string;
  onFocus?: () => void;
  onBlur?: () => void;
};

/**
 * Form-friendly place typeahead: Google Places → Mapbox fallback via
 * suggestPlaces / retrievePlace. Selecting a suggestion resolves coordinates.
 */
export function PlaceAutocompleteField({
  value,
  onChange,
  onPlaceSelect,
  placeholder = "Search address or place…",
  disabled = false,
  className,
  inputClassName,
  proximity,
  limit = 6,
  id,
  name,
  onFocus,
  onBlur,
}: PlaceAutocompleteFieldProps) {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [searched, setSearched] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sessionTokenRef = useRef(createSearchSessionToken());
  const requestIdRef = useRef(0);
  const creditBlocked = useMapCreditStore((s) => s.lastMeta?.blocked ?? false);

  const runSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (trimmed.length < 2) {
        setSuggestions([]);
        setOpen(false);
        setSearched(false);
        setStatusNote(null);
        setBusy(false);
        return;
      }

      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setSuggestions([]);
        setOpen(true);
        setSearched(true);
        setBusy(false);
        setStatusNote("You're offline — place search needs a connection.");
        return;
      }

      const requestId = ++requestIdRef.current;
      setBusy(true);
      setStatusNote(null);

      const results = await suggestPlaces(trimmed, {
        sessionToken: sessionTokenRef.current,
        proximity,
        limit,
      });

      if (requestId !== requestIdRef.current) return;

      setSuggestions(results);
      setOpen(true);
      setSearched(true);
      setBusy(false);

      if (results.length === 0) {
        setStatusNote("No places found — try a fuller address.");
      } else if (creditBlocked || results.every((r) => r.provider === "mapbox")) {
        // Google returned nothing or credits blocked; Mapbox may still have hits.
        if (creditBlocked) {
          setStatusNote("Google search paused (map credits). Showing Mapbox results.");
        }
      }
    },
    [creditBlocked, limit, proximity],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runSearch(value);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, runSearch]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = async (suggestion: PlaceSuggestion) => {
    setResolving(true);
    setStatusNote(null);
    try {
      const place = await retrievePlace(suggestion);
      sessionTokenRef.current = createSearchSessionToken();
      if (!place) {
        setStatusNote("Couldn't load that place. Pick another suggestion or drop a pin.");
        toast.error("Couldn't load that place. Pick another suggestion.");
        return;
      }
      onChange(place.address || place.name);
      onPlaceSelect(place);
      setSuggestions([]);
      setOpen(false);
      setSearched(false);
    } finally {
      setResolving(false);
    }
  };

  const showPanel = open && (busy || resolving || searched || suggestions.length > 0);

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <div className="relative">
        <input
          id={id}
          name={name}
          type="text"
          value={value}
          disabled={disabled || resolving}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            onFocus?.();
            if (suggestions.length > 0 || searched) setOpen(true);
          }}
          onBlur={() => {
            onBlur?.();
          }}
          className={inputClassName}
        />
        {(busy || resolving) && (
          <Loader2
            size={15}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin pointer-events-none"
          />
        )}
      </div>

      {statusNote && !showPanel && (
        <p className="mt-1 text-[11px] text-amber-700">{statusNote}</p>
      )}

      {showPanel && (
        <ul className="absolute z-30 left-0 right-0 mt-1 max-h-44 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg">
          {(busy || resolving) && suggestions.length === 0 && (
            <li className="px-3 py-2 text-[12px] text-slate-400">
              {resolving ? "Loading place…" : "Searching…"}
            </li>
          )}
          {!busy && !resolving && suggestions.length === 0 && searched && (
            <li className="px-3 py-2 text-[12px] text-slate-400">
              {statusNote ?? "No places found — try a fuller address."}
            </li>
          )}
          {statusNote && suggestions.length > 0 && (
            <li className="px-3 py-1.5 text-[10px] text-amber-700 bg-amber-50 border-b border-amber-100">
              {statusNote}
            </li>
          )}
          {suggestions.map((s) => (
            <li key={`${s.provider}-${s.id}`}>
              <button
                type="button"
                disabled={resolving}
                className="w-full px-3 py-2 text-left hover:bg-gray-50 disabled:opacity-60"
                onMouseDown={(e) => {
                  e.preventDefault();
                  void handleSelect(s);
                }}
              >
                <span className="block text-[13px] font-semibold text-[#0B1215] leading-tight">
                  {s.name}
                  {s.provider === "google" && (
                    <span className="ml-1.5 text-[9px] font-medium text-slate-400">via Google</span>
                  )}
                </span>
                {s.placeFormatted && s.placeFormatted !== s.name && (
                  <span className="block text-[11px] text-gray-500 leading-tight mt-0.5 truncate">
                    {s.placeFormatted}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
