"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  endOfMonth,
  format,
  parseISO,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";
import { Briefcase, CalendarDays, ChevronDown, GitBranch, RotateCcw, Tag, UserRound, X } from "lucide-react";
import { LEAD_INDUSTRIES } from "@/lib/crm/industries";
import { SearchableSelect } from "@/components/ui/searchable-select";
import type { CrmAssignee, CrmLabel, CrmPipeline } from "@/lib/api/crm";

/** Days are local calendar dates (yyyy-MM-dd); the page turns them into instants for the API. */
export type CrmDateRange = { preset: DatePresetKey | null; from: string; to: string };
export const EMPTY_DATE_RANGE: CrmDateRange = { preset: null, from: "", to: "" };

type DatePresetKey = "today" | "last7" | "last30" | "thisMonth" | "lastMonth";

const DAY = "yyyy-MM-dd";

const DATE_PRESETS: { key: DatePresetKey; label: string; range: () => [Date, Date] }[] = [
  { key: "today", label: "Today", range: () => [new Date(), new Date()] },
  { key: "last7", label: "Last 7 days", range: () => [subDays(new Date(), 6), new Date()] },
  { key: "last30", label: "Last 30 days", range: () => [subDays(new Date(), 29), new Date()] },
  { key: "thisMonth", label: "This month", range: () => [startOfMonth(new Date()), new Date()] },
  {
    key: "lastMonth",
    label: "Last month",
    range: () => {
      const previous = subMonths(new Date(), 1);
      return [startOfMonth(previous), endOfMonth(previous)];
    },
  },
];

// A value that matches no option, so the select shows its placeholder.
const UNSET = "__unset__";

export function describeDateRange(range: CrmDateRange): string | null {
  if (range.preset) return DATE_PRESETS.find((preset) => preset.key === range.preset)?.label ?? null;
  if (!range.from && !range.to) return null;
  const show = (day: string) => format(parseISO(day), "d MMM yyyy");
  if (range.from && range.to) return range.from === range.to ? show(range.from) : `${show(range.from)} – ${show(range.to)}`;
  return range.from ? `From ${show(range.from)}` : `Until ${show(range.to)}`;
}

type CrmFilterBarProps = {
  pipelines: CrmPipeline[];
  labels: CrmLabel[];
  selectedPipelineId: number | null;
  /** The pipeline "Reset" goes back to; picking it doesn't count as an active filter. */
  defaultPipelineId?: number | null;
  onPipelineChange: (pipelineId: number | null) => void;
  selectedLabel: string;
  onLabelChange: (label: string) => void;
  /** "Added by" shows only when a handler is passed. */
  people?: CrmAssignee[];
  loadingPeople?: boolean;
  createdBy?: string;
  onCreatedByChange?: (userId: string) => void;
  /** "Date added" shows only when a handler is passed. */
  dateRange?: CrmDateRange;
  onDateRangeChange?: (range: CrmDateRange) => void;
  /** Shown when "Added by" was set from a link before people loaded. */
  createdByLabel?: string | null;
  /** "Industry" shows only when a handler is passed. */
  industry?: string;
  onIndustryChange?: (industry: string) => void;
  onClear: () => void;
};

const FIELD_CLS =
  "w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-[12px] text-white transition-colors hover:border-white/20 cursor-pointer";
/** A field that currently filters the list is highlighted so users can see what's applied. */
const FIELD_ACTIVE_CLS =
  "w-full rounded-xl border border-[#2ae9c9]/70 bg-[#2ae9c9]/[0.12] px-3 py-2.5 text-[12px] font-semibold text-white shadow-[0_0_0_1px_rgb(42_233_201/0.25)] transition-colors cursor-pointer";
const fieldCls = (active: boolean) => (active ? FIELD_ACTIVE_CLS : FIELD_CLS);

function FieldLabel({ icon, children, htmlFor }: { icon: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/45">
      <span className="text-[#2ae9c9]/80">{icon}</span>
      {children}
    </label>
  );
}

function DateRangeField({ value, onChange }: { value: CrmDateRange; onChange: (range: CrmDateRange) => void }) {
  const hasValue = Boolean(value.from || value.to);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const summary = describeDateRange(value);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const inputCls =
    "w-full rounded-lg border border-white/10 bg-white/[0.05] px-2.5 py-2 text-[12px] text-white outline-none [color-scheme:dark] focus:border-[#2ae9c9]/50";

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label="Date added"
        onClick={() => setOpen((current) => !current)}
        className={`${fieldCls(hasValue)} flex items-center gap-2 text-left ${open && !hasValue ? "border-[#2ae9c9]/40 bg-white/[0.08]" : ""}`}
      >
        <CalendarDays size={13} className="shrink-0 text-white/40" aria-hidden="true" />
        <span className={`flex-1 truncate ${summary ? "" : "text-white/30"}`}>{summary ?? "Any time"}</span>
        <ChevronDown size={13} className={`shrink-0 text-white/40 transition-transform ${open ? "rotate-180 text-[#2ae9c9]" : ""}`} />
      </button>

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Choose when the lead was added"
          className="absolute right-0 z-30 mt-2 w-[min(320px,calc(100vw-32px))] rounded-[18px] border border-white/10 bg-[#0A1618]/95 p-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">Quick ranges</p>
          <div className="flex flex-wrap gap-1.5">
            {DATE_PRESETS.map((preset) => {
              const active = value.preset === preset.key;
              return (
                <button
                  key={preset.key}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    const [from, to] = preset.range();
                    onChange({ preset: preset.key, from: format(from, DAY), to: format(to, DAY) });
                    setOpen(false);
                  }}
                  className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-colors cursor-pointer ${
                    active
                      ? "border-[#2ae9c9] bg-[#2ae9c9] text-[#022228]"
                      : "border-white/10 bg-white/[0.04] text-white/70 hover:border-[#2ae9c9]/40 hover:text-white"
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <p className="mb-2 mt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-white/40">Custom range</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-[10px] text-white/50">
              From
              <input
                type="date"
                aria-label="Added from"
                value={value.from}
                max={value.to || undefined}
                onChange={(event) => onChange({ preset: null, from: event.target.value, to: value.to })}
                className={`mt-1 ${inputCls}`}
              />
            </label>
            <label className="text-[10px] text-white/50">
              To
              <input
                type="date"
                aria-label="Added to"
                value={value.to}
                min={value.from || undefined}
                onChange={(event) => onChange({ preset: null, from: value.from, to: event.target.value })}
                className={`mt-1 ${inputCls}`}
              />
            </label>
          </div>

          {(value.from || value.to) && (
            <button
              type="button"
              onClick={() => {
                onChange({ preset: null, from: "", to: "" });
                setOpen(false);
              }}
              className="mt-3 text-[11px] font-semibold text-[#2ae9c9] hover:opacity-80 cursor-pointer"
            >
              Clear dates
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[#2ae9c9]/30 bg-[#2ae9c9]/10 py-1 pl-3 pr-1 text-[11px] font-medium text-[#bff8ee]">
      <span className="truncate">{label}</span>
      <button
        type="button"
        aria-label={`Remove filter ${label}`}
        onClick={onRemove}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[#2ae9c9] hover:bg-[#2ae9c9]/20 cursor-pointer"
      >
        <X size={11} />
      </button>
    </span>
  );
}

export function CrmFilterBar({
  pipelines,
  labels,
  selectedPipelineId,
  defaultPipelineId = null,
  onPipelineChange,
  selectedLabel,
  onLabelChange,
  people = [],
  loadingPeople,
  createdBy = "",
  onCreatedByChange,
  dateRange = EMPTY_DATE_RANGE,
  onDateRangeChange,
  createdByLabel = null,
  industry = "",
  onIndustryChange,
  onClear,
}: CrmFilterBarProps) {
  const pipelineName = pipelines.find((pipeline) => pipeline.id === selectedPipelineId)?.name;
  const labelName = labels.find((label) => label.slug === selectedLabel)?.name;
  const personName = people.find((person) => String(person.id) === createdBy)?.name ?? createdByLabel ?? undefined;
  const pipelineActive = selectedPipelineId !== defaultPipelineId;
  const dateSummary = describeDateRange(dateRange);

  const chips = [
    selectedPipelineId !== defaultPipelineId &&
      pipelineName && { key: "pipeline", label: `Pipeline: ${pipelineName}`, remove: () => onPipelineChange(defaultPipelineId) },
    selectedLabel !== "all" &&
      labelName && { key: "label", label: `Label: ${labelName}`, remove: () => onLabelChange("all") },
    onCreatedByChange &&
      createdBy && { key: "person", label: `Added by ${personName ?? "selected person"}`, remove: () => onCreatedByChange("") },
    onDateRangeChange &&
      dateSummary && { key: "date", label: `Added ${dateSummary}`, remove: () => onDateRangeChange(EMPTY_DATE_RANGE) },
    onIndustryChange &&
      industry && { key: "industry", label: `Industry: ${industry}`, remove: () => onIndustryChange("") },
  ].filter(Boolean) as { key: string; label: string; remove: () => void }[];
  const fieldCount = 2 + (onCreatedByChange ? 1 : 0) + (onDateRangeChange ? 1 : 0) + (onIndustryChange ? 1 : 0);
  const industryOptions = [
    { value: "", label: "Any industry" },
    ...(industry && !(LEAD_INDUSTRIES as readonly string[]).includes(industry) ? [{ value: industry, label: industry }] : []),
    ...LEAD_INDUSTRIES.map((option) => ({ value: option, label: option })),
  ];

  return (
    <section
      aria-label="Lead filters"
      className="relative overflow-visible rounded-[20px] border border-[#477893]/20 bg-[linear-gradient(53deg,#022228_73%,#477893_249%)] p-4 text-white shadow-[0_0_12px_2px_rgb(241_241_241/0.18),0_0_22px_4px_rgb(71_120_147/0.2),0_5px_10px_1px_rgb(0_0_0/0.25)] sm:p-5 animate-in fade-in slide-in-from-top-2 duration-200"
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-2 w-2 rounded-full bg-[#2ae9c9] shadow-[0_0_10px_#2ae9c9]" aria-hidden="true" />
          <h2 className="text-[13px] font-semibold tracking-wide text-white">Refine leads</h2>
          {chips.length > 0 && (
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/70">
              {chips.length} active
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={chips.length === 0}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] font-semibold text-white/70 transition-colors hover:border-[#2ae9c9]/40 hover:text-[#2ae9c9] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
        >
          <RotateCcw size={11} />
          Reset
        </button>
      </div>

      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${fieldCount >= 5 ? "xl:grid-cols-5" : fieldCount === 4 ? "xl:grid-cols-4" : fieldCount === 3 ? "xl:grid-cols-3" : ""}`}>
        <div>
          <FieldLabel icon={<GitBranch size={11} />}>Pipeline</FieldLabel>
          <SearchableSelect
            variant="enterprise"
            value={selectedPipelineId != null ? String(selectedPipelineId) : UNSET}
            onChange={(value) => onPipelineChange(value ? Number(value) : null)}
            options={[
              { value: "", label: "All pipelines" },
              ...pipelines.map((pipeline) => ({ value: String(pipeline.id), label: pipeline.name })),
            ]}
            placeholder="Choose a pipeline"
            searchPlaceholder="Search pipelines…"
            className={fieldCls(pipelineActive)}
          />
        </div>

        <div>
          <FieldLabel icon={<Tag size={11} />}>Label</FieldLabel>
          <SearchableSelect
            variant="enterprise"
            value={selectedLabel === "all" ? UNSET : selectedLabel}
            onChange={(value) => onLabelChange(value || "all")}
            options={[
              { value: "", label: "All labels" },
              ...labels.map((label) => ({ value: label.slug, label: label.name })),
            ]}
            placeholder="Choose a label"
            searchPlaceholder="Search labels…"
            className={fieldCls(selectedLabel !== "all")}
          />
        </div>

        {onCreatedByChange && (
        <div>
          <FieldLabel icon={<UserRound size={11} />}>Added by</FieldLabel>
          <SearchableSelect
            variant="enterprise"
            value={createdBy || UNSET}
            onChange={onCreatedByChange}
            options={[
              { value: "", label: "Anyone" },
              ...people.map((person) => ({ value: String(person.id), label: person.name })),
            ]}
            placeholder={loadingPeople ? "Loading people…" : "Choose a person"}
            searchPlaceholder="Search people…"
            className={fieldCls(Boolean(createdBy))}
          />
        </div>
        )}

        {onIndustryChange && (
        <div>
          <FieldLabel icon={<Briefcase size={11} />}>Industry</FieldLabel>
          <SearchableSelect
            variant="enterprise"
            value={industry || UNSET}
            onChange={onIndustryChange}
            options={industryOptions}
            placeholder="Any industry"
            searchPlaceholder="Search industries…"
            className={fieldCls(Boolean(industry))}
          />
        </div>
        )}

        {onDateRangeChange && (
        <div>
          <FieldLabel icon={<CalendarDays size={11} />}>Date added</FieldLabel>
          <DateRangeField value={dateRange} onChange={onDateRangeChange} />
        </div>
        )}
      </div>

      {chips.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-white/10 pt-3.5">
          {chips.map((chip) => (
            <ActiveChip key={chip.key} label={chip.label} onRemove={chip.remove} />
          ))}
        </div>
      )}
    </section>
  );
}
