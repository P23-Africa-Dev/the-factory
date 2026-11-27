"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpDown, Check, ChevronDown } from "lucide-react";

export type SortMenuOption<T extends string> = { value: T; label: string };

/**
 * Toolbar "Sort by" control shared by the CRM and task boards.
 * A custom menu rather than a native <select>: the dark toolbar's white text
 * leaked into the browser's option list and made the options invisible.
 */
export function SortMenu<T extends string>({
  value,
  options,
  onChange,
  defaultValue,
  ariaLabel = "Sort",
}: {
  value: T;
  options: readonly SortMenuOption<T>[];
  onChange: (value: T) => void;
  /** The order used when nothing is chosen; any other choice highlights the button. */
  defaultValue: T;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const current = options.find((option) => option.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${ariaLabel}: ${current.label}`}
        onClick={() => setOpen((prev) => !prev)}
        className={`se-control flex items-center gap-2 px-3 py-2 border border-gray-200 bg-white rounded-[10px] text-[12px] font-medium text-gray-600 hover:border-gray-300 transition-all shadow-sm ${value !== defaultValue ? "se-control-active" : ""}`}
      >
        <ArrowUpDown size={13} aria-hidden />
        <span className="whitespace-nowrap">{current.label}</span>
        <ChevronDown size={13} aria-hidden className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-50 top-full mt-1 left-0 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 min-w-52"
        >
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <li key={option.value} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-[12px] font-medium hover:bg-gray-50 ${selected ? "text-[#0B1215] font-semibold" : "text-gray-600"}`}
                >
                  <span className="whitespace-nowrap">{option.label}</span>
                  {selected && <Check size={13} aria-hidden className="shrink-0 text-[#0B1215]" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
