"use client";

import { SearchableSelect } from "@/components/ui/searchable-select";
import type { CrmLabel, CrmPipeline } from "@/lib/api/crm";

type CrmFilterBarProps = {
  pipelines: CrmPipeline[];
  labels: CrmLabel[];
  selectedPipelineId: number | null;
  onPipelineChange: (pipelineId: number | null) => void;
  selectedLabel: string;
  onLabelChange: (label: string) => void;
  onClear: () => void;
};

export function CrmFilterBar({
  pipelines,
  labels,
  selectedPipelineId,
  onPipelineChange,
  selectedLabel,
  onLabelChange,
  onClear,
}: CrmFilterBarProps) {
  return (
    <div className="bg-white rounded-[14px] border border-gray-100 p-3 flex flex-wrap items-center gap-2">
      <SearchableSelect
        value={String(selectedPipelineId ?? "")}
        onChange={(value) => onPipelineChange(value ? Number(value) : null)}
        options={[
          { value: "", label: "All Pipelines" },
          ...pipelines.map((pipeline) => ({
            value: String(pipeline.id),
            label: pipeline.name,
          })),
        ]}
        className="border border-gray-200 rounded-[10px] px-3 py-2 text-[12px] bg-white min-w-32"
      />
      <SearchableSelect
        value={selectedLabel}
        onChange={onLabelChange}
        options={[
          { value: "all", label: "All Labels" },
          ...labels.map((label) => ({ value: label.slug, label: label.name })),
        ]}
        className="border border-gray-200 rounded-[10px] px-3 py-2 text-[12px] bg-white min-w-28"
      />
      <button
        type="button"
        onClick={onClear}
        className="px-3 py-2 border border-red-200 text-red-500 rounded-[10px] text-[12px]"
      >
        Clear
      </button>
    </div>
  );
}
