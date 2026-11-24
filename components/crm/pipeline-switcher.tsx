"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Settings2, Star } from "lucide-react";
import type { CrmPipeline } from "@/lib/api/crm";

type PipelineSwitcherProps = {
  pipelines: CrmPipeline[];
  /** null = all pipelines. */
  selectedPipelineId: number | null;
  /** The user's default pipeline (marked with a star). */
  defaultPipelineId?: number | null;
  onSelect: (pipelineId: number | null) => void;
  /** Opens the pipeline manager (create / rename / delete / set default). */
  onManage?: () => void;
  manageLabel?: string;
  /** Extra classes for the trigger, e.g. the toolbar's base button style. */
  className?: string;
  /** Applied when a non-default pipeline is selected. */
  activeClassName?: string;
};

/**
 * Pipeline switcher in the style of HubSpot / Pipedrive: one click opens the
 * list, one click switches. Managing pipelines is a secondary action at the
 * bottom instead of the primary behaviour of the button.
 */
export function PipelineSwitcher({
  pipelines,
  selectedPipelineId,
  defaultPipelineId = null,
  onSelect,
  onManage,
  manageLabel = "Manage pipelines…",
  className = "",
  activeClassName = "",
}: PipelineSwitcherProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const selected = pipelines.find((pipeline) => pipeline.id === selectedPipelineId);
  const label = selectedPipelineId == null ? "All pipelines" : selected?.name ?? "Pipeline";
  const isActive = selectedPipelineId !== defaultPipelineId;

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

  const choose = (pipelineId: number | null) => {
    onSelect(pipelineId);
    setOpen(false);
  };

  const optionCls = (selectedOption: boolean) =>
    `flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] transition-colors cursor-pointer ${
      selectedOption ? "bg-[#ECFDF8] font-semibold text-[#0B1215]" : "text-gray-700 hover:bg-gray-50"
    }`;

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-pressed={isActive}
        title="Switch pipeline"
        onClick={() => setOpen((current) => !current)}
        className={`${className} ${isActive ? activeClassName : ""}`}
      >
        <span className="max-w-40 truncate">{label}</span>
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          id={menuId}
          role="listbox"
          aria-label="Pipelines"
          className="absolute left-0 z-40 mt-2 w-64 rounded-2xl border border-gray-100 bg-white p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.18)] animate-in fade-in slide-in-from-top-1 duration-150"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400">
            Pipelines
          </p>
          <div className="max-h-72 overflow-y-auto">
            <button
              type="button"
              role="option"
              aria-selected={selectedPipelineId == null}
              onClick={() => choose(null)}
              className={optionCls(selectedPipelineId == null)}
            >
              <span className="flex-1 truncate">All pipelines</span>
              {selectedPipelineId == null && <Check size={13} className="text-[#0f9d84]" />}
            </button>
            {pipelines.map((pipeline) => {
              const isSelected = pipeline.id === selectedPipelineId;
              const isDefault = pipeline.id === defaultPipelineId;
              return (
                <button
                  key={pipeline.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => choose(pipeline.id)}
                  className={optionCls(isSelected)}
                >
                  <span className="flex-1 truncate">{pipeline.name}</span>
                  {isDefault && (
                    <Star size={12} className="fill-amber-400 text-amber-400" aria-label="Your default pipeline" />
                  )}
                  {isSelected && <Check size={13} className="text-[#0f9d84]" />}
                </button>
              );
            })}
          </div>
          {onManage && (
            <>
              <div className="my-1.5 border-t border-gray-100" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onManage();
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                <Settings2 size={13} />
                {manageLabel}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
