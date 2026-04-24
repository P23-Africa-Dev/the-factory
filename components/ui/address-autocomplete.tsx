'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Navigation, Loader2, MapPin } from 'lucide-react';

export type AddressSuggestion = {
  id: string;
  place_name: string;
  text: string;
  center: [number, number]; // [lng, lat]
};

interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: AddressSuggestion) => void;
  placeholder?: string;
  className?: string;
  error?: string;
}

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'Search address…',
  className = '',
  error,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(false);

  useEffect(() => {
    const query = value.trim();

    if (selectedRef.current) {
      selectedRef.current = false;
      return;
    }

    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const encoded = encodeURIComponent(query);
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json` +
          `?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=5&types=address,place,poi`;

        const res = await fetch(url);
        const json = await res.json();

        const items: AddressSuggestion[] = (json.features ?? []).map((f: any) => ({
          id: f.id,
          place_name: f.place_name,
          text: f.text,
          center: f.center,
        }));

        setSuggestions(items);
        setOpen(items.length > 0);
      } catch {
        setSuggestions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (s: AddressSuggestion) => {
    selectedRef.current = true;
    onChange(s.place_name);
    onSelect(s);
    setOpen(false);
    setSuggestions([]);
  };

  const baseInput =
    'w-full bg-gray-50 rounded-xl text-sm text-[#0B1215] outline-none border transition-colors placeholder:text-gray-300 py-2.5 pl-9 pr-9';
  const borderCls = error ? 'border-red-300' : 'border-gray-200 focus:border-[#094B5C]';

  return (
    <div ref={containerRef} className="relative">
      {/* Left icon */}
      <Navigation
        size={13}
        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none z-10"
      />

      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        placeholder={placeholder}
        className={`${baseInput} ${borderCls} ${className}`}
        autoComplete="off"
      />

      {/* Right loading indicator */}
      {loading && (
        <Loader2
          size={13}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin pointer-events-none"
        />
      )}

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-50 top-full mt-1.5 left-0 right-0 bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {suggestions.map((s, i) => (
            <li key={`${s.id}-${i}`}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(s);
                }}
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <MapPin size={13} className="text-gray-400 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#0B1215] truncate">{s.text}</p>
                  <p className="text-[11px] text-gray-400 truncate">{s.place_name}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
