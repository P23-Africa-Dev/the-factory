"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ChevronDown } from "lucide-react";
import { LEAD_INDUSTRIES, LEAD_INDUSTRY_MAX_LENGTH } from "@/lib/crm/industries";

type IndustryComboboxProps = {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
    inputClassName?: string;
    disabled?: boolean;
    "aria-invalid"?: boolean | "true" | "false";
    maxLength?: number;
};

export function IndustryCombobox({
    value,
    onChange,
    placeholder = "Pick or type, e.g Technology & Software",
    className = "",
    inputClassName = "",
    disabled = false,
    "aria-invalid": ariaInvalid,
    maxLength = LEAD_INDUSTRY_MAX_LENGTH,
}: IndustryComboboxProps) {
    const listId = useId();
    const rootRef = useRef<HTMLDivElement>(null);
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);

    const filtered = useMemo(() => {
        const needle = value.trim().toLowerCase();
        if (!needle) return [...LEAD_INDUSTRIES];
        return LEAD_INDUSTRIES.filter((option) => option.toLowerCase().includes(needle));
    }, [value]);

    useEffect(() => {
        setHighlight(0);
    }, [value, open]);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (event: MouseEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", onPointerDown);
        return () => document.removeEventListener("mousedown", onPointerDown);
    }, [open]);

    const select = (option: string) => {
        onChange(option);
        setOpen(false);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === "Escape") {
            setOpen(false);
            return;
        }
        if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setHighlight((current) => Math.min(current + 1, Math.max(filtered.length - 1, 0)));
            return;
        }
        if (event.key === "ArrowUp") {
            event.preventDefault();
            setOpen(true);
            setHighlight((current) => Math.max(current - 1, 0));
            return;
        }
        if (event.key === "Enter" && open && filtered[highlight]) {
            event.preventDefault();
            select(filtered[highlight]);
        }
    };

    return (
        <div ref={rootRef} className={`relative ${className}`}>
            <div className="relative">
                <input
                    value={value}
                    disabled={disabled}
                    maxLength={maxLength}
                    placeholder={placeholder}
                    aria-invalid={ariaInvalid}
                    aria-expanded={open}
                    aria-controls={listId}
                    role="combobox"
                    autoComplete="off"
                    onFocus={() => setOpen(true)}
                    onClick={() => setOpen(true)}
                    onChange={(event) => {
                        onChange(event.target.value);
                        setOpen(true);
                    }}
                    onKeyDown={onKeyDown}
                    className={inputClassName || "h-12.25 w-full rounded-xl border border-gray-200 px-3 pr-9 text-[13px] shadow-[0px_1px_3px_1px_#00000026,0px_1px_2px_0px_#0000004D] outline-none focus:border-gray-400"}
                />
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
            {open ? (
                <div
                    id={listId}
                    role="listbox"
                    className="absolute left-0 right-0 z-30 mt-1 max-h-[220px] overflow-y-auto rounded-xl border border-gray-200 bg-white py-1 shadow-lg"
                >
                    {filtered.length === 0 ? (
                        <p className="px-3 py-2 text-[12px] text-gray-500">
                            No matches. “{value.trim() || "…"}” will be saved as entered.
                        </p>
                    ) : (
                        filtered.map((option, index) => (
                            <button
                                key={option}
                                type="button"
                                role="option"
                                aria-selected={index === highlight}
                                className={`block w-full px-3 py-2 text-left text-[13px] ${
                                    index === highlight ? "bg-slate-100 text-[#0B1215]" : "text-gray-700 hover:bg-slate-50"
                                }`}
                                onMouseEnter={() => setHighlight(index)}
                                onMouseDown={(event) => {
                                    event.preventDefault();
                                    select(option);
                                }}
                            >
                                {option}
                            </button>
                        ))
                    )}
                </div>
            ) : null}
        </div>
    );
}
