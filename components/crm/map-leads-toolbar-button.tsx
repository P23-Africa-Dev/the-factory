"use client";

import type { CrmPipeline } from "@/lib/api/crm";
import {
  findMapLeadsPipeline,
  isMapLeadsPipelineSelected,
  MAP_LEADS_PIPELINE_NAME,
} from "@/lib/crm/map-leads-pipeline";

type MapLeadsToolbarButtonProps = {
  pipelines: CrmPipeline[];
  selectedPipelineId: number | null;
  onPipelineChange: (pipelineId: number | null) => void;
  /** Where "off" returns to (the user's default pipeline); null = all pipelines. */
  fallbackPipelineId?: number | null;
};

export function MapLeadsToolbarButton({
  pipelines,
  selectedPipelineId,
  onPipelineChange,
  fallbackPipelineId = null,
}: MapLeadsToolbarButtonProps) {
  const mapLeadsPipeline = findMapLeadsPipeline(pipelines);
  if (!mapLeadsPipeline) return null;

  const isMapLeadsActive = isMapLeadsPipelineSelected(pipelines, selectedPipelineId);

  return (
    <button
      type="button"
      aria-pressed={isMapLeadsActive}
      onClick={() =>
        onPipelineChange(
          isMapLeadsActive
            ? (fallbackPipelineId !== mapLeadsPipeline.id ? fallbackPipelineId : null)
            : mapLeadsPipeline.id,
        )
      }
      className={`${isMapLeadsActive ? "se-primary" : "se-control"} flex items-center gap-2 px-3 py-2 rounded-[10px] text-[12px] font-medium border transition-all shadow-sm ${
        isMapLeadsActive
          ? "bg-[#0B1215] text-white border-[#0B1215]"
          : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
      }`}
    >
      {MAP_LEADS_PIPELINE_NAME}
    </button>
  );
}
