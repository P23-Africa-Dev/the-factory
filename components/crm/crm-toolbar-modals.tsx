"use client";

import type { ChangeEvent, ReactNode } from "react";
import { useMemo, useRef, useState } from "react";
import { X, ChevronUp, ChevronDown, Upload, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { ApiRequestError } from "@/lib/api/onboarding";
import type { ApiLeadPriority, ApiRoleBasePath, CrmLabel, CrmPipeline, ImportLeadRow } from "@/lib/api/crm";
import {
    useCreateCrmLabel,
    useCreateCrmPipeline,
    useDeleteCrmLabel,
    useImportCrmLeads,
    useReorderCrmLabels,
    useUpdateCrmLabel,
    useUpdateCrmPipeline,
} from "@/hooks/use-crm";

type BaseModalProps = {
    companyId: number | string;
    apiBasePath: ApiRoleBasePath;
    onClose: () => void;
};

function ModalShell({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
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

    const createPipeline = useCreateCrmPipeline(apiBasePath);
    const updatePipeline = useUpdateCrmPipeline(apiBasePath);

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

    return (
        <ModalShell title="All Pipelines" onClose={onClose}>
            <div className="space-y-3 mb-5">
                {pipelines.map((pipeline) => {
                    const isActive = selectedPipelineId === pipeline.id;
                    return (
                        <div key={pipeline.id} className={`rounded-xl border p-3 ${isActive ? "border-dash-dark bg-gray-50" : "border-gray-200"}`}>
                            <div className="flex items-center gap-2">
                                <input
                                    value={editing[pipeline.id] ?? pipeline.name}
                                    onChange={(e) => setEditing((prev) => ({ ...prev, [pipeline.id]: e.target.value }))}
                                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px]"
                                />
                                <button
                                    onClick={() => saveEdit(pipeline.id)}
                                    className="px-3 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600"
                                >
                                    Save
                                </button>
                                <button
                                    onClick={() => onSelectPipeline(pipeline.id)}
                                    className={`px-3 py-2 rounded-lg text-[12px] font-semibold ${isActive ? "bg-dash-dark text-white" : "bg-white border border-gray-200 text-gray-600"}`}
                                >
                                    {isActive ? "Active" : "Select"}
                                </button>
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

function parseCsv(content: string): ImportLeadRow[] {
    const lines = content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length < 2) {
        return [];
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

    return lines.slice(1).map((line) => {
        const values = line.split(",").map((v) => v.trim());
        const row: ImportLeadRow = {};
        headers.forEach((header, idx) => {
            const val = values[idx] ?? "";
            if (!val) return;
            switch (header) {
                case "name":
                    row.name = val;
                    break;
                case "email":
                    row.email = val;
                    break;
                case "phone":
                    row.phone = val;
                    break;
                case "location":
                    row.location = val;
                    break;
                case "source":
                    row.source = val;
                    break;
                case "status":
                    row.status = val;
                    break;
                case "priority":
                    row.priority = val.toLowerCase() as ApiLeadPriority;
                    break;
            }
        });
        return row;
    });
}

export function ImportLeadsModal({
    companyId,
    apiBasePath,
    pipelines,
    defaultPipelineId,
    labels,
    onClose,
}: BaseModalProps & {
    pipelines: CrmPipeline[];
    defaultPipelineId?: number | null;
    labels: CrmLabel[];
}) {
    const [pipelineId, setPipelineId] = useState<string>(defaultPipelineId ? String(defaultPipelineId) : pipelines[0] ? String(pipelines[0].id) : "");
    const [rows, setRows] = useState<ImportLeadRow[]>([]);
    const [failedRows, setFailedRows] = useState<Array<{ row_index: number; data: ImportLeadRow; errors: string[] }>>([]);
    const [phase, setPhase] = useState<"upload" | "diagnosis">("upload");
    const fileRef = useRef<HTMLInputElement | null>(null);

    const importMutation = useImportCrmLeads(apiBasePath);

    const onFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const text = await file.text();
        const parsed = parseCsv(text);
        setRows(parsed);
        if (parsed.length === 0) {
            toast.error("No valid rows found in CSV.");
        }
    };

    const submitImport = async (targetRows: ImportLeadRow[]) => {
        if (!pipelineId) {
            toast.error("Select a pipeline for import.");
            return;
        }
        if (!targetRows.length) {
            toast.error("No rows to import.");
            return;
        }

        try {
            const res = await importMutation.mutateAsync({
                company_id: companyId,
                pipeline_id: Number(pipelineId),
                rows: targetRows,
            });

            const result = res.data;
            if (result.failed_rows.length > 0) {
                setFailedRows(result.failed_rows);
                setPhase("diagnosis");
                toast.error(`${result.failed_rows.length} row(s) failed import. Fix and retry.`);
            } else {
                toast.success(`Imported ${result.imported_count} lead(s).`);
                onClose();
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Import failed.");
        }
    };

    return (
        <ModalShell title="Import Leads" onClose={onClose}>
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                        <label className="block text-[12px] font-semibold text-gray-500 mb-1">Target Pipeline</label>
                        <select
                            value={pipelineId}
                            onChange={(e) => setPipelineId(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-[13px]"
                        >
                            <option value="">Select pipeline</option>
                            {pipelines.map((pipeline) => (
                                <option key={pipeline.id} value={String(pipeline.id)}>{pipeline.name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-[12px] font-semibold text-gray-500 mb-1">Label Keys</label>
                        <p className="text-[12px] text-gray-500 border border-gray-200 rounded-lg px-3 py-2 bg-gray-50">
                            {labels.map((label) => label.slug).join(", ") || "newly_lead"}
                        </p>
                    </div>
                </div>

                {phase === "upload" ? (
                    <>
                        <div className="border border-dashed border-gray-300 rounded-xl p-4 bg-gray-50">
                            <p className="text-[12px] text-gray-500 mb-2">Upload CSV with headers: name,email,phone,location,source,status,priority</p>
                            <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFileChange} className="text-[12px]" />
                        </div>

                        <div className="rounded-xl border border-gray-200 overflow-hidden">
                            <div className="px-3 py-2 bg-gray-50 text-[12px] font-semibold text-gray-500">Preview Rows ({rows.length})</div>
                            <div className="max-h-64 overflow-auto">
                                {rows.length === 0 ? (
                                    <div className="px-3 py-4 text-[12px] text-gray-400">No rows loaded yet.</div>
                                ) : (
                                    <table className="w-full text-[12px]">
                                        <thead className="bg-white sticky top-0">
                                            <tr className="text-left text-gray-400">
                                                <th className="px-3 py-2">Name</th>
                                                <th className="px-3 py-2">Email</th>
                                                <th className="px-3 py-2">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {rows.map((row, idx) => (
                                                <tr key={idx} className="border-t border-gray-100">
                                                    <td className="px-3 py-2">{row.name || "-"}</td>
                                                    <td className="px-3 py-2">{row.email || "-"}</td>
                                                    <td className="px-3 py-2">{row.status || "newly_lead"}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button
                                onClick={() => submitImport(rows)}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-dash-dark text-white text-[12px] font-semibold"
                            >
                                <Upload size={13} />
                                Import
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700 flex items-start gap-2">
                            <AlertTriangle size={14} className="mt-0.5" />
                            Import diagnosis: fix failed rows below, then retry without restarting.
                        </div>

                        <div className="space-y-3 max-h-[52vh] overflow-auto pr-1">
                            {failedRows.map((row, idx) => (
                                <div key={`${row.row_index}-${idx}`} className="border border-gray-200 rounded-xl p-3">
                                    <p className="text-[12px] font-semibold text-gray-500 mb-2">Row {row.row_index}</p>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-2">
                                        <input
                                            value={row.data.name || ""}
                                            onChange={(e) => setFailedRows((prev) => prev.map((item, i) => i === idx ? { ...item, data: { ...item.data, name: e.target.value } } : item))}
                                            placeholder="Name"
                                            className="border border-gray-200 rounded-lg px-3 py-2 text-[12px]"
                                        />
                                        <input
                                            value={row.data.email || ""}
                                            onChange={(e) => setFailedRows((prev) => prev.map((item, i) => i === idx ? { ...item, data: { ...item.data, email: e.target.value } } : item))}
                                            placeholder="Email"
                                            className="border border-gray-200 rounded-lg px-3 py-2 text-[12px]"
                                        />
                                        <input
                                            value={row.data.status || "newly_lead"}
                                            onChange={(e) => setFailedRows((prev) => prev.map((item, i) => i === idx ? { ...item, data: { ...item.data, status: e.target.value } } : item))}
                                            placeholder="Status"
                                            className="border border-gray-200 rounded-lg px-3 py-2 text-[12px]"
                                        />
                                    </div>
                                    <ul className="text-[11px] text-red-500 list-disc pl-4">
                                        {row.errors.map((err, i) => <li key={i}>{err}</li>)}
                                    </ul>
                                </div>
                            ))}
                        </div>

                        <div className="flex items-center justify-end gap-2">
                            <button onClick={() => setPhase("upload")} className="px-4 py-2 rounded-lg border border-gray-200 text-[12px] font-semibold text-gray-600">Back</button>
                            <button
                                onClick={() => submitImport(failedRows.map((row) => row.data))}
                                className="px-4 py-2 rounded-lg bg-dash-dark text-white text-[12px] font-semibold"
                            >
                                Retry Import
                            </button>
                        </div>
                    </>
                )}
            </div>
        </ModalShell>
    );
}
