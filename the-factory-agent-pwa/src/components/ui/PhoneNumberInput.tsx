'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PhoneInput, { getCountryCallingCode, type Country } from 'react-phone-number-input';
import flags from 'react-phone-number-input/flags';
import 'react-phone-number-input/style.css';

// ─── Icon components ──────────────────────────────────────────────────────────

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 10 10"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ transition: 'transform 150ms', transform: open ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}
    >
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <circle cx="5.5" cy="5.5" r="4" stroke="#9CA3AF" strokeWidth="1.4" />
      <path d="M8.5 8.5L11 11" stroke="#9CA3AF" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width={13} height={13} viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M2.5 6.5L5 9L10.5 4" stroke="#0B1215" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Searchable Country Dropdown ──────────────────────────────────────────────

interface SearchableCountrySelectProps {
  name?: string;
  value?: Country;
  onChange: (value?: Country) => void;
  options: { value?: Country; label: string }[];
  disabled?: boolean;
  readOnly?: boolean;
  iconComponent: React.ComponentType<{ country?: Country; label?: string }>;
}

function SearchableCountrySelect({
  value,
  onChange,
  options,
  disabled = false,
  readOnly = false,
  iconComponent: FlagIcon,
}: SearchableCountrySelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean; triggerHeight: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((o) => o.value === value);
  const selectedLabel = selectedOption ? selectedOption.label : 'International';

  const calcPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const dropHeight = 300;
    const above = spaceBelow < dropHeight && spaceAbove > dropHeight;
    const dropWidth = 300;
    const rawLeft = rect.left;
    const maxLeft = window.innerWidth - dropWidth - 8;
    const left = Math.max(8, Math.min(maxLeft, rawLeft));
    setPos({ top: rect.top, left, width: dropWidth, above, triggerHeight: rect.height });
  }, []);

  const openDropdown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || readOnly) return;
    calcPos();
    setOpen(true);
    setSearch('');
  };

  const close = useCallback(() => { setOpen(false); setSearch(''); }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!triggerRef.current?.contains(e.target as Node) && !dropdownRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    const onScroll = () => calcPos();
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', calcPos);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', calcPos);
    };
  }, [open, close, calcPos]);

  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 30);
  }, [open]);

  const query = search.trim().toLowerCase();
  const filteredOptions = options.filter((opt) => {
    if (!opt.value) return opt.label.toLowerCase().includes(query);
    const code = opt.value.toLowerCase();
    const name = opt.label.toLowerCase();
    let callingCode = '';
    try { callingCode = getCountryCallingCode(opt.value); } catch { /* ignore */ }
    return code.includes(query) || name.includes(query) || callingCode.includes(query);
  });

  const pick = (opt: { value?: Country; label: string }) => {
    onChange(opt.value);
    close();
  };

  const dropdown = open && pos
    ? createPortal(
        <div
          ref={dropdownRef}
          style={{
            position: 'fixed',
            top: pos.above ? undefined : pos.top + pos.triggerHeight + 6,
            bottom: pos.above ? window.innerHeight - pos.top + 6 : undefined,
            left: pos.left,
            width: pos.width,
            zIndex: 99999,
          }}
          className="overflow-hidden flex flex-col bg-white border border-gray-200 rounded-2xl shadow-[0px_8px_32px_rgba(0,0,0,0.14)]"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Search */}
          <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-gray-100">
            <SearchIcon />
            <input
              ref={searchRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country or dial code..."
              className="flex-1 text-[12px] text-gray-700 placeholder:text-gray-400 outline-none bg-transparent"
              style={{ fontFamily: 'inherit' }}
            />
          </div>
          {/* List */}
          <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
            {filteredOptions.length === 0 ? (
              <p className="text-center text-[12px] py-8 text-gray-400">No results</p>
            ) : (
              filteredOptions.map((opt) => {
                const active = opt.value === value;
                let callCode = '';
                if (opt.value) {
                  try { callCode = `+${getCountryCallingCode(opt.value)}`; } catch { /* ignore */ }
                }
                return (
                  <button
                    key={opt.value ?? 'ZZ'}
                    type="button"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => pick(opt)}
                    className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-[12px] text-left transition-colors cursor-pointer ${
                      active ? 'bg-gray-50 text-[#0B1215] font-semibold' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                    style={{ fontFamily: 'inherit' }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="shrink-0 w-5 h-3.5 flex items-center justify-center overflow-hidden rounded-sm border border-gray-100">
                        <FlagIcon country={opt.value} label={opt.label} />
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {callCode && <span className="text-[11px] text-gray-400 font-normal">{callCode}</span>}
                      {active && <CheckIcon />}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || readOnly}
        onClick={openDropdown}
        className="flex items-center gap-1 px-2 py-1.5 cursor-pointer outline-none select-none disabled:cursor-not-allowed disabled:opacity-60 rounded-lg hover:bg-white/8 transition-colors shrink-0"
      >
        <span className="shrink-0 w-6 h-4 flex items-center justify-center overflow-hidden rounded-sm">
          <FlagIcon country={value} label={selectedLabel} />
        </span>
        <ChevronDown open={open} />
      </button>
      {dropdown}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface PhoneNumberInputProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  defaultCountry?: string;
  disabled?: boolean;
  className?: string;
}

export default function PhoneNumberInput({
  value,
  onChange,
  placeholder = 'Phone number',
  defaultCountry = 'NG',
  disabled,
  className,
}: PhoneNumberInputProps) {
  return (
    <PhoneInput
      international
      defaultCountry={defaultCountry as never}
      countryCallingCodeEditable={false}
      placeholder={placeholder}
      value={value ?? undefined}
      onChange={(next) => onChange(next ?? '')}
      disabled={disabled}
      flags={flags}
      countrySelectComponent={SearchableCountrySelect}
      className={`pwa-phone-input${className ? ` ${className}` : ''}`}
    />
  );
}
