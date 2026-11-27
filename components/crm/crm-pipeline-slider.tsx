"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export interface PipelineSliderItem {
  id: number;
  name: string;
}

interface CrmPipelineSliderProps {
  pipelines: PipelineSliderItem[];
  selectedPipelineId: number | null;
  onSelect: (pipelineId: number | null) => void;
}

export function CrmPipelineSlider({
  pipelines,
  selectedPipelineId,
  onSelect,
}: CrmPipelineSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const updateScrollState = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    updateScrollState();

    const observer = new ResizeObserver(updateScrollState);
    observer.observe(el);
    return () => observer.disconnect();
  }, [pipelines.length, updateScrollState]);

  const scrollByStep = (direction: -1 | 1) => {
    const el = trackRef.current;
    if (!el) return;
    const step = Math.max(180, Math.round(el.clientWidth * 0.65));
    el.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  return (
    <div className="flex items-center gap-1.5 min-w-0 flex-1">
      <button
        type="button"
        onClick={() => scrollByStep(-1)}
        disabled={!canScrollLeft}
        aria-label="Scroll pipelines left"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-[#09232D] shadow-xs transition-all hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
      >
        <ChevronLeft size={14} />
      </button>

      <div
        ref={trackRef}
        onScroll={updateScrollState}
        role="tablist"
        aria-label="Filter by pipeline"
        className="flex items-center gap-1.5 overflow-x-auto min-w-0 flex-1 py-0.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
      >
        <button
          type="button"
          role="tab"
          aria-selected={selectedPipelineId === null}
          onClick={() => onSelect(null)}
          className={`px-3.5 py-1.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
            selectedPipelineId === null
              ? "bg-[#09232D] text-white shadow-xs"
              : "bg-[#F4F7F9] text-gray-600 border border-gray-200/80 hover:bg-gray-100 hover:text-[#0B1215]"
          }`}
        >
          All Pipelines
        </button>

        {pipelines.map((pipeline) => {
          const isActive = selectedPipelineId === pipeline.id;
          return (
            <button
              key={pipeline.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(pipeline.id)}
              className={`px-3.5 py-1.5 rounded-full text-[11.5px] font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                isActive
                  ? "bg-[#09232D] text-white shadow-xs"
                  : "bg-[#F4F7F9] text-gray-600 border border-gray-200/80 hover:bg-gray-100 hover:text-[#0B1215]"
              }`}
            >
              {pipeline.name}
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => scrollByStep(1)}
        disabled={!canScrollRight}
        aria-label="Scroll pipelines right"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-[#09232D] shadow-xs transition-all hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
