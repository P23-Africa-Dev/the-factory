"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { X, ChevronUp, ChevronDown, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ApiRequestError } from "@/lib/api/onboarding";
import type { ApiRoleBasePath, CrmLabel, CrmPipeline } from "@/lib/api/crm";
import {
    useCreateCrmLabel,
    useCreateCrmPipeline,
    useDeleteCrmLabel,
    useDeleteCrmPipeline,
    useReorderCrmLabels,
    useUpdateCrmLabel,
    useUpdateCrmPipeline,
} from "@/hooks/use-crm";
import ConfirmDeleteModal from "@/components/ui/confirm-delete-modal";

type BaseModalProps = {
    companyId: number | string;
    apiBasePath: ApiRoleBasePath;
    onClose: () => void;
};

export function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
    return (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
            <button className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Close modal" />
            <div className="relative w-full max-w-3xl max-h-[88vh] overflow-auto bg-white rounded-2xl shadow-2xl border border-gray-100">
                <div className="sticky top-0 bg-white z-10 border-b border-gray-100 px-5 py-4 flex items-center justify-between">
                    <h3 className="text-[16px] font-bold text-dash-dark">{title}</h3>
                    <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:text-gray-600">
                        <X size={17} />
                    </button>
                </div>
                <div className="p-5">{children}</div>
            </div>
        </div>
    );
}

export function PipelineManagerModal({
    companyId,
    apiBasePath,
    pipelines,
    selectedPipelineId,
    onSelectPipeline,
    onClose,
}: BaseModalProps & {
    pipelines: CrmPipeline[];
    selectedPipelineId?: number | null;
    onSelectPipeline: (pipelineId: number) => void;
}) {
    const [newPipelineName, setNewPipelineName] = useState("");
    const [editing, setEditing] = useState<Record<number, string>>({});
    const [pipelinePendingDelete, setPipelinePendingDelete] = useState<CrmPipeline | null>(null);

    const createPipeline = useCreateCrmPipeline(apiBasePath);
    const updatePipeline = useUpdateCrmPipeline(apiBasePath);
    const deletePipeline = useDeleteCrmPipeline(apiBasePath);

    const saveNew = async () => {
        if (!newPipelineName.trim()) return;
        try {
            await createPipeline.mutateAsync({ company_id: companyId, name: newPipelineName.trim() });
            setNewPipelineName("");
            toast.success("Pipeline created");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to create pipeline");
        }
    };

    const saveEdit = async (id: number) => {
        const name = editing[id]?.trim();
        if (!name) return;
        try {
            await updatePipeline.mutateAsync({ pipelineId: id, payload: { company_id: companyId, name } });
            toast.success("Pipeline updated");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to update pipeline");
        }
    };

    const confirmDeletePipeline = async () => {
        if (!pipelinePendingDelete) return;
        const pipeline = pipelinePendingDelete;
        setPipelinePendingDelete(null);

        try {
            const result = await deletePipeline.mutateAsync({
                pipelineId: pipeline.id,
                payload: { company_id: companyId, force: true },
            });

            const movedCount = result.data?.reassigned_leads_count ?? 0;
            if (movedCount > 0) {
                toast.success(
                    `${pipeline.name} deleted. ${movedCount} leads were moved to ${result.data.reassigned_to_pipeline_name ?? "another pipeline"}.`
                );
            } else {
                toast.success("Pipeline deleted");
            }

            if (selectedPipelineId === pipeline.id) {
                const fallback = pipelines.find((item) => item.id !== pipeline.id);
                if (fallback) {
                    onSelectPipeline(fallback.id);
                }
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to delete pipeline");
        }
    };

    return (
        <>
            <ModalShell title="All Pipelines" onClose={onClose}>
                <div className="space-y-3 mb-5">
                    {pipelines.map((pipeline) => {
                        const isActive = selectedPipelineId === pipeline.id;
                        const canDelete = !pipeline.is_default;
                        return (
                            <div
                                key={pipeline.id}
                                className={`group relative rounded-xl border p-3 ${isActive ? "border-dash-dark bg-gray-50" : "border-gray-200"}`}
                            >
                                <div className="flex items-center gap-2 min-w-0">
                                    <input
                                        value={editing[pipeline.id] ?? pipeline.name}
                                        onChange={(e) => setEditing((prev) => ({ ...prev, [pipeline.id]: e.target.value }))}
                                        className="flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-2 text-[13px]"
                                    />
                                    <button
                                        onClick={() => saveEdit(pipeline.id)}
                                        className="px-3 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600 shrink-0"
                                    >
                                        Update
                                    </button>
                                    <button
                                        onClick={() => onSelectPipeline(pipeline.id)}
                                        className={`px-3 py-2 rounded-lg text-[12px] font-semibold shrink-0 ${isActive ? "bg-dash-dark text-white" : "bg-white border border-gray-200 text-gray-600"}`}
                                    >
                                        {isActive ? "Active" : "Select"}
                                    </button>
                                    {canDelete && (
                                        <button
                                            type="button"
                                            onClick={() => setPipelinePendingDelete(pipeline)}
                                            className="p-2 rounded-lg border border-transparent text-gray-400 hover:text-red-500 hover:bg-red-50 hover:border-red-100 opacity-0 group-hover:opacity-100 focus:opacity-100 max-md:opacity-100 transition-opacity shrink-0"
                                            title="Delete pipeline"
                                            aria-label={`Delete ${pipeline.name}`}
                                        >
                                            <Trash2 size={15} />
                                        </button>
                                    )}
                                </div>
                                <p className="text-[11px] text-gray-400 mt-1">Currency: {pipeline.currency_code || "USD"}</p>
                            </div>
                        );
                    })}
                </div>

                <div className="border-t border-gray-100 pt-4 flex items-center gap-2">
                    <input
                        value={newPipelineName}
                        onChange={(e) => setNewPipelineName(e.target.value)}
                        placeholder="Create new pipeline"
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px]"
                    />
                    <button onClick={saveNew} className="px-4 py-2 rounded-lg bg-dash-dark text-white text-[12px] font-semibold">
                        Create
                    </button>
                </div>
            </ModalShell>

            <ConfirmDeleteModal
                isOpen={pipelinePendingDelete !== null}
                onClose={() => setPipelinePendingDelete(null)}
                onConfirm={confirmDeletePipeline}
                title="Delete pipeline?"
                description={
                    pipelinePendingDelete
                        ? `Are you sure you want to delete "${pipelinePendingDelete.name}"? Leads in this pipeline will be moved to another pipeline. This action cannot be undone.`
                        : "Are you sure you want to delete this pipeline?"
                }
                confirmLabel="Delete"
            />
        </>
    );
}

export function LabelManagerModal({ companyId, apiBasePath, labels, onClose }: BaseModalProps & { labels: CrmLabel[] }) {
    const [newLabelName, setNewLabelName] = useState("");
    const [newLabelColor, setNewLabelColor] = useState("#2563EB");
    const [drafts, setDrafts] = useState<Record<number, { name: string; color: string }>>({});

    const createLabel = useCreateCrmLabel(apiBasePath);
    const updateLabel = useUpdateCrmLabel(apiBasePath);
    const deleteLabel = useDeleteCrmLabel(apiBasePath);
    const reorderLabels = useReorderCrmLabels(apiBasePath);

    const sorted = useMemo(() => [...labels].sort((a, b) => a.sort_order - b.sort_order), [labels]);

    const persistOrder = async (orderedIds: number[]) => {
        try {
            await reorderLabels.mutateAsync({ company_id: companyId, ordered_label_ids: orderedIds });
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to reorder labels");
        }
    };

    const moveLabel = (id: number, direction: "up" | "down") => {
        const ordered = sorted.map((label) => label.id);
        const index = ordered.indexOf(id);
        const target = direction === "up" ? index - 1 : index + 1;
        if (index < 0 || target < 0 || target >= ordered.length) return;
        const copy = [...ordered];
        [copy[index], copy[target]] = [copy[target], copy[index]];
        persistOrder(copy);
    };

    const saveLabel = async (label: CrmLabel) => {
        const draft = drafts[label.id];
        if (!draft) return;
        try {
            await updateLabel.mutateAsync({
                labelId: label.id,
                payload: { company_id: companyId, name: draft.name.trim(), color: draft.color },
            });
            toast.success("Label updated");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to update label");
        }
    };

    const createNew = async () => {
        if (!newLabelName.trim()) return;
        try {
            await createLabel.mutateAsync({ company_id: companyId, name: newLabelName.trim(), color: newLabelColor });
            setNewLabelName("");
            toast.success("Label created");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to create label");
        }
    };

    const deleteExistingLabel = async (label: CrmLabel) => {
        try {
            const result = await deleteLabel.mutateAsync({
                labelId: label.id,
                payload: { company_id: companyId, force: false },
            });

            const movedCount = result.data?.deleted_leads_count ?? 0;
            if (movedCount > 0) {
                toast.success(`${label.name} deleted. ${movedCount} leads were moved to ${result.data.reassigned_to_label_name ?? "another label"}.`);
            } else {
                toast.success("Label deleted");
            }
        } catch (err) {
            if (err instanceof ApiRequestError) {
                const usageCountRaw = err.errors?.label_usage_count?.[0] ?? "0";
                const usageCount = Number.parseInt(usageCountRaw, 10);

                if (Number.isFinite(usageCount) && usageCount > 0) {
                    const confirmed = window.confirm(
                        `This label is currently assigned to ${usageCount} leads. Are you sure you want to delete it?`
                    );

                    if (!confirmed) return;

                    try {
                        const forceResult = await deleteLabel.mutateAsync({
                            labelId: label.id,
                            payload: { company_id: companyId, force: true },
                        });
                        const movedCount = forceResult.data?.deleted_leads_count ?? usageCount;
                        toast.success(`${label.name} deleted. ${movedCount} leads were reassigned.`);
                        return;
                    } catch (forceErr) {
                        toast.error(forceErr instanceof Error ? forceErr.message : "Failed to delete label");
                        return;
                    }
                }
            }

            toast.error(err instanceof Error ? err.message : "Failed to delete label");
        }
    };

    return (
        <ModalShell title="Manage Labels" onClose={onClose}>
            <div className="space-y-3 mb-5">
                {sorted.map((label) => {
                    const draft = drafts[label.id] ?? { name: label.name, color: label.color };
                    return (
                        <div key={label.id} className="border border-gray-200 rounded-xl p-3">
                            <div className="flex items-center gap-2">
                                <input
                                    value={draft.name}
                                    onChange={(e) => setDrafts((prev) => ({ ...prev, [label.id]: { ...draft, name: e.target.value } }))}
                                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px]"
                                />
                                <input
                                    type="color"
                                    value={draft.color}
                                    onChange={(e) => setDrafts((prev) => ({ ...prev, [label.id]: { ...draft, color: e.target.value } }))}
                                    className="w-10 h-9 border border-gray-200 rounded-lg bg-white p-1"
                                />
                                <button onClick={() => moveLabel(label.id, "up")} className="p-2 rounded-md border border-gray-200 text-gray-500"><ChevronUp size={14} /></button>
                                <button onClick={() => moveLabel(label.id, "down")} className="p-2 rounded-md border border-gray-200 text-gray-500"><ChevronDown size={14} /></button>
                                <button onClick={() => saveLabel(label)} className="px-3 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600">Save</button>
                                <button onClick={() => deleteExistingLabel(label)} className="px-3 py-2 rounded-lg border border-red-200 text-[12px] font-semibold text-red-600">Delete</button>
                            </div>
                            <p className="text-[11px] text-gray-400 mt-1">Key: {label.slug}</p>
                        </div>
                    );
                })}
            </div>

            <div className="border-t border-gray-100 pt-4 flex items-center gap-2">
                <input
                    value={newLabelName}
                    onChange={(e) => setNewLabelName(e.target.value)}
                    placeholder="Add new label"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px]"
                />
                <input type="color" value={newLabelColor} onChange={(e) => setNewLabelColor(e.target.value)} className="w-10 h-9 border border-gray-200 rounded-lg bg-white p-1" />
                <button onClick={createNew} className="px-4 py-2 rounded-lg bg-dash-dark text-white text-[12px] font-semibold">Add</button>
            </div>
        </ModalShell>
    );
}
