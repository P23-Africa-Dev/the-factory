'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MapPin, Search, X, Loader2 } from 'lucide-react';
import {
  createSearchSessionToken,
  retrievePlace,
  suggestPlaces,
  type PlaceSuggestion,
} from '@/lib/utils/place-search';
import type { LocationContext } from '@/lib/map/location-search';

const DEBOUNCE_MS = 300;

type Props = {
  activeLocation: LocationContext | null;
  onLocationSelect: (ctx: LocationContext | null) => void;
  className?: string;
};

export function LocationSearchInput({ activeLocation, onLocationSelect, className }: Props) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // One Search Box session per suggest→retrieve cycle (Mapbox billing model).
  const sessionTokenRef = useRef<string>(createSearchSessionToken());

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setBusy(true);
    const results = await suggestPlaces(q, {
      sessionToken: sessionTokenRef.current,
      limit: 6,
    });
    setSuggestions(results);
    setOpen(true);
    setBusy(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), DEBOUNCE_MS);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleSelect(suggestion: PlaceSuggestion) {
    setResolving(true);
    const place = await retrievePlace(suggestion);
    setResolving(false);
    // Retrieval ends the search session; start a fresh one for the next search.
    sessionTokenRef.current = createSearchSessionToken();

    if (!place) return;

    onLocationSelect({
      name: place.name,
      center: [place.lng, place.lat],
      bbox: place.bbox,
      radiusKm: 5,
    });
    setQuery('');
    setSuggestions([]);
    setOpen(false);
  }

  function handleClear() {
    onLocationSelect(null);
    setQuery('');
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className={className}>
      {activeLocation ? (
        <div className="flex items-center gap-2 bg-white rounded-full px-4 py-3 shadow-2xl shadow-black/10 border border-slate-100">
          <MapPin size={15} className="text-dash-teal shrink-0" />
          <span className="text-[13px] font-semibold text-dash-dark truncate flex-1">
            {activeLocation.name}
          </span>
          <button
            onClick={handleClear}
            className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors shrink-0"
            aria-label="Clear location"
          >
            <X size={11} className="text-slate-500" />
          </button>
        </div>
      ) : (
        <div className="relative">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={15} strokeWidth={2} />
            <input
              type="text"
              placeholder="Search places…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => suggestions.length > 0 && setOpen(true)}
              className="w-full bg-white rounded-full py-3 pl-10 pr-10 text-[13px] shadow-2xl shadow-black/10 outline-none font-medium text-dash-dark placeholder:text-gray-400 border border-slate-100"
            />
            {busy || resolving ? (
              <Loader2 size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />
            ) : query.length > 0 ? (
              <button
                onClick={() => { setQuery(''); setSuggestions([]); setOpen(false); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition-colors"
              >
                <X size={10} className="text-slate-500" />
              </button>
            ) : null}
          </div>

          {open && (busy || suggestions.length > 0) && (
            <div className="absolute top-full mt-2 left-0 right-0 rounded-2xl border border-slate-200 bg-white/95 backdrop-blur px-2 py-2 shadow-xl max-h-[240px] overflow-y-auto z-30">
              {busy && suggestions.length === 0 && (
                <p className="px-3 py-2 text-[12px] text-slate-400">Searching…</p>
              )}
              {!busy && suggestions.length === 0 && (
                <p className="px-3 py-2 text-[12px] text-slate-400">No places found.</p>
              )}
              {suggestions.map((s) => (
                <button
                  key={`${s.provider}-${s.id}`}
                  disabled={resolving}
                  className="w-full text-left px-3 py-2 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-60"
                  onClick={() => handleSelect(s)}
                >
                  <p className="text-[13px] font-semibold text-dash-dark leading-tight">
                    {s.name}
                    {s.category && (
                      <span className="ml-2 text-[10px] font-medium text-dash-teal capitalize">
                        {s.category.replace(/_/g, ' ')}
                      </span>
                    )}
                    {s.provider === 'google' && (
                      <span className="ml-1.5 text-[9px] font-medium text-slate-400">via Google</span>
                    )}
                  </p>
                  {s.placeFormatted && s.placeFormatted !== s.name && (
                    <p className="text-[11px] text-slate-400 leading-tight mt-0.5 truncate">{s.placeFormatted}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
