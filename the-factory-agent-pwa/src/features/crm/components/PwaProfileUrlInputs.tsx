'use client';

import React from 'react';
import { Plus, X } from 'lucide-react';

function isValidUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  try {
    const parsed = new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function PwaProfileUrlInputs({
  values,
  onChange,
}: {
  values: string[];
  onChange: (values: string[]) => void;
}): React.ReactElement {
  const rows = values.length > 0 ? values : [''];
  const showAddMore = rows.some((url) => url.trim() !== '');

  const updateRow = (index: number, next: string) => {
    const nextRows = [...rows];
    nextRows[index] = next;
    onChange(nextRows);
  };

  return (
    <div className="flex flex-col gap-2">
      {rows.map((url, index) => (
        <div key={index} className="flex flex-col">
          {index === 0 && (
            <label className="text-xs font-semibold text-[#75ADAF] mb-1.5">Profile URL</label>
          )}
          <div className="flex items-center gap-2">
            <input
              type="url"
              placeholder="https://linkedin.com/in/username"
              value={url}
              onChange={(e) => updateRow(index, e.target.value)}
              className="flex-1 h-12 border-1.5 border-white/12 rounded-xl px-3.5 text-sm text-white bg-white/5 placeholder-white/35 outline-none transition-colors focus:border-[#75ADAF]"
            />
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, i) => i !== index).length ? rows.filter((_, i) => i !== index) : [''])}
                className="p-2 text-white/40 hover:text-[#EF4444]"
                aria-label="Remove profile URL"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {url.trim() && !isValidUrl(url) && (
            <span className="text-[#EF4444] text-[11px] mt-1 ml-1">Enter a valid URL.</span>
          )}
        </div>
      ))}
      {showAddMore && (
        <button
          type="button"
          onClick={() => onChange([...rows, ''])}
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#75ADAF] hover:text-white transition-colors"
        >
          <Plus size={12} />
          Add another URL
        </button>
      )}
    </div>
  );
}

function normalizeWebsite(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
}

export function parseProfileUrls(values: string[]): string[] {
  return values.map((url) => url.trim()).filter(Boolean);
}

export { normalizeWebsite, isValidUrl };
