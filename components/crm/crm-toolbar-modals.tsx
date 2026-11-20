"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  X,
  ChevronUp,
  ChevronDown,
  Trash2,
  Pencil,
  Star,
  Check,
  Building2,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import { ApiRequestError } from "@/lib/api/onboarding";
import type { ApiRoleBasePath, CrmLabel, CrmPipeline } from "@/lib/api/crm";
import {
  useCreateCrmLabel,
  useCreateCrmPipeline,
  useDeleteCrmLabel,
  useDeleteCrmPipeline,
  useReorderCrmLabels,
  useSetCompanyDefaultCrmPipeline,
  useSetPreferredCrmPipeline,
  useCrmPreferences,
  useUpdateCrmLabel,
  useUpdateCrmPipeline,
} from "@/hooks/use-crm";
import ConfirmDeleteModal from "@/components/ui/confirm-delete-modal";
import { ModalPortal } from "@/components/ui/modal-portal";
import { FieldError } from "@/components/ui/field-error";
import { scrollToFirstError } from "@/lib/forms/scroll-to-first-error";
import { FALLBACK_SUPPORTED_CURRENCIES, DEFAULT_FALLBACK_CURRENCY } from "@/lib/constants/currencies";

type BaseModalProps = {
  companyId: number | string;
  apiBasePath: ApiRoleBasePath;
  onClose: () => void;
};

export function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
        <button
          className="absolute inset-0 bg-black/40"
          onClick={onClose}
          aria-label="Close modal"
        />
        <div className="relative w-full max-w-3xl max-h-[88vh] overflow-auto bg-white text-dash-dark rounded-2xl shadow-2xl border border-gray-100">
          <div className="sticky top-0 bg-white z-10 border-b border-gray-100 px-5 py-4 flex items-center justify-between">
            <h3 className="text-[16px] font-bold text-dash-dark">{title}</h3>
            <button
              onClick={onClose}
              className="p-1 rounded-md text-gray-400 hover:text-gray-600"
            >
              <X size={17} />
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      </div>
    </ModalPortal>
  );
}

function IconAction({
  icon,
  label,
  onClick,
  variant = "default",
  active = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
  active?: boolean;
}) {
  return (
    <div className="relative group/tip">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`p-2 rounded-lg border transition-colors ${
          active
            ? "bg-dash-dark border-dash-dark text-white"
            : variant === "danger"
              ? "border-transparent text-gray-400 hover:text-red-500 hover:bg-red-50 hover:border-red-100"
              : "border-transparent text-gray-400 hover:text-dash-dark hover:bg-gray-100 hover:border-gray-200"
        }`}
      >
        {icon}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute -top-8 left-1/2 z-20 -translate-x-1/2 scale-95 whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[10px] font-medium text-white opacity-0 shadow-lg transition-all duration-150 group-hover/tip:scale-100 group-hover/tip:opacity-100"
      >
        {label}
      </span>
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
  mode = "manage",
}: BaseModalProps & {
  pipelines: CrmPipeline[];
  selectedPipelineId?: number | null;
  onSelectPipeline: (pipelineId: number) => void;
  /** `prefer` hides create/edit/delete and company-default controls (agent). */
  mode?: "manage" | "prefer";
}) {
  const canManage = mode === "manage";
  const [newPipelineName, setNewPipelineName] = useState("");
  const [newPipelineNameError, setNewPipelineNameError] = useState<string | null>(null);
  const [newPipelineCurrency, setNewPipelineCurrency] = useState(DEFAULT_FALLBACK_CURRENCY);
  const [editing, setEditing] = useState<Record<number, string>>({});
  const [editingCurrency, setEditingCurrency] = useState<Record<number, string>>({});
  const [editingIds, setEditingIds] = useState<Set<number>>(new Set());
  const [pipelinePendingDelete, setPipelinePendingDelete] = useState<{
    pipeline: CrmPipeline;
    usageCount: number | null;
    moveToId: number | null;
  } | null>(null);

  const { data: preferences } = useCrmPreferences(companyId, apiBasePath);
  const preferredPipelineId = preferences?.preferred_pipeline_id ?? null;

  const startEdit = (pipeline: CrmPipeline) => {
    setEditing((prev) => ({ ...prev, [pipeline.id]: pipeline.name }));
    setEditingCurrency((prev) => ({
      ...prev,
      [pipeline.id]: pipeline.currency_code || DEFAULT_FALLBACK_CURRENCY,
    }));
    setEditingIds((prev) => new Set(prev).add(pipeline.id));
  };

  const stopEdit = (id: number) => {
    setEditingIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const createPipeline = useCreateCrmPipeline(apiBasePath);
  const updatePipeline = useUpdateCrmPipeline(apiBasePath);
  const deletePipeline = useDeleteCrmPipeline(apiBasePath);
  const setPreferredPipeline = useSetPreferredCrmPipeline(apiBasePath);
  const setCompanyDefault = useSetCompanyDefaultCrmPipeline(apiBasePath);

  const saveNew = async () => {
    if (!newPipelineName.trim()) {
      setNewPipelineNameError("Enter a pipeline name.");
      void scrollToFirstError();
      return;
    }
    setNewPipelineNameError(null);
    try {
      await createPipeline.mutateAsync({
        company_id: companyId,
        name: newPipelineName.trim(),
        currency_code: newPipelineCurrency,
      });
      setNewPipelineName("");
      setNewPipelineCurrency(DEFAULT_FALLBACK_CURRENCY);
      toast.success("Pipeline created");
    } catch (err) {
      const apiErr = err instanceof ApiRequestError ? err : null;
      setNewPipelineNameError(apiErr?.errors?.name?.[0] ?? null);
      if (apiErr?.errors?.name?.[0]) void scrollToFirstError();
      toast.error(
        err instanceof Error ? err.message : "Failed to create pipeline",
      );
    }
  };

  const saveEdit = async (id: number) => {
    const name = editing[id]?.trim();
    if (!name) {
      toast.error("Pipeline name cannot be empty.");
      return;
    }
    try {
      await updatePipeline.mutateAsync({
        pipelineId: id,
        payload: {
          company_id: companyId,
          name,
          currency_code: editingCurrency[id] || DEFAULT_FALLBACK_CURRENCY,
        },
      });
      stopEdit(id);
      toast.success("Pipeline updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update pipeline",
      );
    }
  };

  const confirmDeletePipeline = async () => {
    if (!pipelinePendingDelete) return;
    const { pipeline, usageCount, moveToId } = pipelinePendingDelete;
    const force = usageCount !== null;

    try {
      const result = await deletePipeline.mutateAsync({
        pipelineId: pipeline.id,
        payload: {
          company_id: companyId,
          force,
          reassign_to_pipeline_id: force ? moveToId : undefined,
        },
      });

      setPipelinePendingDelete(null);

      const movedCount = result.data?.reassigned_leads_count ?? 0;
      if (movedCount > 0) {
        toast.success(
          `${pipeline.name} deleted. ${movedCount} leads were moved to ${result.data.reassigned_to_pipeline_name ?? "another pipeline"}.`,
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
      if (!force && err instanceof ApiRequestError) {
        const usage = Number.parseInt(err.errors?.pipeline_usage_count?.[0] ?? "0", 10);
        if (Number.isFinite(usage) && usage > 0) {
          const defaultTarget =
            pipelines.find((item) => item.id !== pipeline.id && item.is_default)?.id ??
            pipelines.find((item) => item.id !== pipeline.id)?.id ??
            null;
          setPipelinePendingDelete({
            pipeline,
            usageCount: usage,
            moveToId: defaultTarget,
          });
          return;
        }
      }
      setPipelinePendingDelete(null);
      toast.error(
        err instanceof Error ? err.message : "Failed to delete pipeline",
      );
    }
  };

  const handleSetPreferred = async (pipelineId: number) => {
    try {
      await setPreferredPipeline.mutateAsync({
        company_id: companyId,
        pipeline_id: pipelineId,
      });
      onSelectPipeline(pipelineId);
      toast.success("Personal default pipeline updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to set personal default",
      );
    }
  };

  const handleSetCompanyDefault = async (pipelineId: number) => {
    try {
      await setCompanyDefault.mutateAsync({
        pipelineId,
        payload: { company_id: companyId },
      });
      onSelectPipeline(pipelineId);
      toast.success("Company default pipeline updated");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to set company default",
      );
    }
  };

  return (
    <>
      <ModalShell title="All Pipelines" onClose={onClose}>
        <div className="space-y-3 mb-5">
          {pipelines.map((pipeline) => {
            const isActive = selectedPipelineId === pipeline.id;
            const isPreferred = preferredPipelineId === pipeline.id;
            const isCompanyDefault = pipeline.is_default;
            const canDelete = canManage && !pipeline.is_default;
            const isEditing = editingIds.has(pipeline.id);
            return (
              <div
                key={pipeline.id}
                onClick={() => {
                  if (!isEditing) {
                    onSelectPipeline(pipeline.id);
                    onClose();
                  }
                }}
                className={`group/row relative rounded-xl border-2 p-3 transition-colors ${isActive ? "border-dotted border-dash-dark bg-gray-50 ring-1 ring-dash-dark/20" : "border-solid border-gray-200 hover:border-gray-300"} ${!isEditing ? "cursor-pointer" : ""}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <input
                    value={editing[pipeline.id] ?? pipeline.name}
                    onChange={(e) =>
                      setEditing((prev) => ({
                        ...prev,
                        [pipeline.id]: e.target.value,
                      }))
                    }
                    readOnly={!canManage || !isEditing}
                    onKeyDown={(e) => {
                      if (canManage && isEditing && e.key === "Enter") {
                        saveEdit(pipeline.id);
                      }
                    }}
                    className={`flex-1 min-w-0 rounded-lg text-[13px] font-semibold text-dash-dark placeholder:text-gray-400 outline-none transition-colors ${
                      canManage && isEditing
                        ? "border border-gray-200 bg-white px-3 py-2 focus:border-dash-dark"
                        : "border border-transparent bg-transparent px-0 py-1 cursor-pointer pointer-events-none"
                    }`}
                  />
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className={`flex items-center gap-1 transition-opacity shrink-0 max-md:opacity-100 group-hover/row:opacity-100 focus-within:opacity-100 ${isEditing || isPreferred || isCompanyDefault ? "opacity-100" : "opacity-0"}`}
                  >
                    <IconAction
                      icon={<Eye size={15} />}
                      label="View pipeline"
                      onClick={() => {
                        onSelectPipeline(pipeline.id);
                        onClose();
                      }}
                      active={isActive}
                    />
                    <IconAction
                      icon={
                        <Star
                          size={15}
                          className={isPreferred ? "fill-current" : ""}
                        />
                      }
                      label={isPreferred ? "My default" : "Set as my default"}
                      onClick={() => handleSetPreferred(pipeline.id)}
                      active={isPreferred}
                    />
                    {canManage && (
                      <IconAction
                        icon={<Building2 size={15} />}
                        label={
                          isCompanyDefault
                            ? "Company default"
                            : "Set company default"
                        }
                        onClick={() => handleSetCompanyDefault(pipeline.id)}
                        active={isCompanyDefault}
                      />
                    )}
                    {canManage && (
                      <IconAction
                        icon={
                          isEditing ? (
                            <Check size={15} />
                          ) : (
                            <Pencil size={15} />
                          )
                        }
                        label={isEditing ? "Save" : "Edit"}
                        onClick={() =>
                          isEditing ? saveEdit(pipeline.id) : startEdit(pipeline)
                        }
                      />
                    )}
                    {canDelete && (
                      <IconAction
                        icon={<Trash2 size={15} />}
                        label="Delete"
                        onClick={() =>
                          setPipelinePendingDelete({
                            pipeline,
                            usageCount: null,
                            moveToId: null,
                          })
                        }
                        variant="danger"
                      />
                    )}
                  </div>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {canManage && isEditing ? (
                    <select
                      value={editingCurrency[pipeline.id] ?? pipeline.currency_code ?? DEFAULT_FALLBACK_CURRENCY}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        setEditingCurrency((prev) => ({
                          ...prev,
                          [pipeline.id]: e.target.value,
                        }))
                      }
                      aria-label={`Currency for ${pipeline.name}`}
                      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-dash-dark outline-none focus:border-dash-dark"
                    >
                      {FALLBACK_SUPPORTED_CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <p className="text-[11px] text-gray-400">
                      Currency: {pipeline.currency_code || "USD"}
                    </p>
                  )}
                  {isPreferred && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      My default
                    </span>
                  )}
                  {isCompanyDefault && (
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                      Company default
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {canManage && (
          <div className="border-t border-gray-100 pt-4 space-y-1.5">
            <div data-field="pipeline-name" className="flex flex-wrap items-center gap-2">
              <input
                value={newPipelineName}
                onChange={(e) => {
                  setNewPipelineName(e.target.value);
                  if (newPipelineNameError) setNewPipelineNameError(null);
                }}
                placeholder="Create new pipeline"
                aria-invalid={newPipelineNameError ? true : undefined}
                className="min-w-[180px] flex-1 border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-dash-dark placeholder:text-gray-400 outline-none focus:border-dash-dark"
              />
              <select
                value={newPipelineCurrency}
                onChange={(e) => setNewPipelineCurrency(e.target.value)}
                aria-label="New pipeline currency"
                className="border border-gray-200 rounded-lg px-3 py-2 text-[13px] text-dash-dark outline-none focus:border-dash-dark"
              >
                {FALLBACK_SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code}
                  </option>
                ))}
              </select>
              <button
                onClick={saveNew}
                className="px-4 py-2 rounded-lg bg-dash-dark text-white text-[12px] font-semibold"
              >
                Create
              </button>
            </div>
            <FieldError message={newPipelineNameError} />
          </div>
        )}
      </ModalShell>

      <ConfirmDeleteModal
        isOpen={pipelinePendingDelete !== null}
        onClose={() => setPipelinePendingDelete(null)}
        onConfirm={confirmDeletePipeline}
        closeOnConfirm={false}
        title={
          pipelinePendingDelete?.usageCount
            ? "Move leads and delete pipeline?"
            : "Delete pipeline?"
        }
        description={
          pipelinePendingDelete?.usageCount
            ? `${pipelinePendingDelete.usageCount} lead${pipelinePendingDelete.usageCount === 1 ? "" : "s"} in "${pipelinePendingDelete.pipeline.name}". Choose where to move ${pipelinePendingDelete.usageCount === 1 ? "it" : "them"}, then delete.`
            : pipelinePendingDelete
              ? `Delete "${pipelinePendingDelete.pipeline.name}"? This can't be undone.`
              : "Are you sure you want to delete this pipeline?"
        }
        confirmLabel={
          pipelinePendingDelete?.usageCount ? "Move leads & delete" : "Delete"
        }
        confirmDisabled={
          Boolean(pipelinePendingDelete?.usageCount) &&
          !pipelinePendingDelete?.moveToId
        }
      >
        {pipelinePendingDelete?.usageCount ? (
          <label className="block text-[12px] font-medium text-dash-dark">
            Move leads to
            <select
              value={pipelinePendingDelete.moveToId ?? ""}
              onChange={(e) =>
                setPipelinePendingDelete((prev) =>
                  prev
                    ? {
                        ...prev,
                        moveToId: e.target.value ? Number(e.target.value) : null,
                      }
                    : prev,
                )
              }
              className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2 text-[13px] outline-none focus:border-dash-dark"
            >
              {pipelines
                .filter((item) => item.id !== pipelinePendingDelete.pipeline.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {item.is_default ? " (default)" : ""}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
      </ConfirmDeleteModal>
    </>
  );
}

export function LabelManagerModal({
  companyId,
  apiBasePath,
  labels,
  onClose,
}: BaseModalProps & { labels: CrmLabel[] }) {
  const [newLabelName, setNewLabelName] = useState("");
  const [newLabelColor, setNewLabelColor] = useState("#2563EB");
  const [newLabelError, setNewLabelError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<number, { name: string; color: string }>
  >({});
  const [nameErrors, setNameErrors] = useState<Record<number, string>>({});
  // Two-step delete: confirm, then (if leads use it) confirm moving them.
  const [deleteTarget, setDeleteTarget] = useState<{
    label: CrmLabel;
    usageCount: number | null;
  } | null>(null);

  const createLabel = useCreateCrmLabel(apiBasePath);
  const updateLabel = useUpdateCrmLabel(apiBasePath);
  const deleteLabel = useDeleteCrmLabel(apiBasePath);
  const reorderLabels = useReorderCrmLabels(apiBasePath);

  const sorted = useMemo(
    () => [...labels].sort((a, b) => a.sort_order - b.sort_order),
    [labels],
  );
  const isLastLabel = sorted.length <= 1;

  const clearDraft = (id: number) => {
    setDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setNameErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const persistOrder = async (orderedIds: number[]) => {
    try {
      await reorderLabels.mutateAsync({
        company_id: companyId,
        ordered_label_ids: orderedIds,
      });
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to reorder labels",
      );
    }
  };

  const moveLabel = (id: number, direction: "up" | "down") => {
    // One reorder at a time: a second click computed from stale order would undo the first.
    if (reorderLabels.isPending) return;
    const ordered = sorted.map((label) => label.id);
    const index = ordered.indexOf(id);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= ordered.length) return;
    const copy = [...ordered];
    [copy[index], copy[target]] = [copy[target], copy[index]];
    persistOrder(copy);
  };

  const isDirty = (label: CrmLabel) => {
    const draft = drafts[label.id];
    return Boolean(draft && (draft.name.trim() !== label.name || draft.color.toLowerCase() !== label.color.toLowerCase()));
  };

  const saveLabel = async (label: CrmLabel) => {
    const draft = drafts[label.id];
    if (!draft || !isDirty(label)) {
      clearDraft(label.id);
      return;
    }
    const name = draft.name.trim();
    if (!name) {
      setNameErrors((prev) => ({ ...prev, [label.id]: "Label name is required." }));
      void scrollToFirstError();
      return;
    }
    if (name.length > 120) {
      setNameErrors((prev) => ({ ...prev, [label.id]: "Label name must be 120 characters or fewer." }));
      void scrollToFirstError();
      return;
    }
    try {
      await updateLabel.mutateAsync({
        labelId: label.id,
        payload: {
          company_id: companyId,
          name,
          color: draft.color,
        },
      });
      clearDraft(label.id);
      toast.success("Label updated");
    } catch (err) {
      const apiErr = err instanceof ApiRequestError ? err : null;
      const fieldError = apiErr?.errors?.name?.[0] ?? apiErr?.errors?.color?.[0];
      if (fieldError) {
        setNameErrors((prev) => ({ ...prev, [label.id]: fieldError }));
        void scrollToFirstError();
      }
      toast.error(
        err instanceof Error ? err.message : "Failed to update label",
      );
    }
  };

  const toggleWon = async (label: CrmLabel, isWon: boolean) => {
    try {
      await updateLabel.mutateAsync({
        labelId: label.id,
        payload: { company_id: companyId, is_won: isWon },
      });
      toast.success(
        isWon
          ? `Leads in ${label.name} now count as won`
          : `Leads in ${label.name} no longer count as won`,
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to update label",
      );
    }
  };

  const createNew = async () => {
    const name = newLabelName.trim();
    if (!name) {
      setNewLabelError("Enter a name for the new label.");
      void scrollToFirstError();
      return;
    }
    if (name.length > 120) {
      setNewLabelError("Label name must be 120 characters or fewer.");
      void scrollToFirstError();
      return;
    }
    try {
      await createLabel.mutateAsync({
        company_id: companyId,
        name,
        color: newLabelColor,
      });
      setNewLabelName("");
      setNewLabelError(null);
      toast.success("Label created");
    } catch (err) {
      const apiErr = err instanceof ApiRequestError ? err : null;
      setNewLabelError(apiErr?.errors?.name?.[0] ?? apiErr?.errors?.color?.[0] ?? null);
      if (apiErr?.errors?.name?.[0] || apiErr?.errors?.color?.[0]) void scrollToFirstError();
      toast.error(
        err instanceof Error ? err.message : "Failed to create label",
      );
    }
  };

  const reportDeleted = (label: CrmLabel, movedCount: number, movedTo?: string | null) => {
    toast.success(
      movedCount > 0
        ? `${label.name} deleted. ${movedCount} lead${movedCount === 1 ? " was" : "s were"} moved to ${movedTo ?? "another label"}.`
        : "Label deleted",
    );
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const { label, usageCount } = deleteTarget;
    const force = usageCount !== null;
    setDeleteTarget(null);

    try {
      const result = await deleteLabel.mutateAsync({
        labelId: label.id,
        payload: { company_id: companyId, force },
      });
      reportDeleted(label, result.data?.deleted_leads_count ?? 0, result.data?.reassigned_to_label_name);
    } catch (err) {
      if (!force && err instanceof ApiRequestError) {
        const usage = Number.parseInt(err.errors?.label_usage_count?.[0] ?? "0", 10);
        if (Number.isFinite(usage) && usage > 0) {
          // Leads use this label: ask again, saying exactly what will happen.
          setDeleteTarget({ label, usageCount: usage });
          return;
        }
      }
      toast.error(
        err instanceof Error ? err.message : "Failed to delete label",
      );
    }
  };

  const moveTargetName = deleteTarget
    ? sorted.find((label) => label.id !== deleteTarget.label.id)?.name ?? "another label"
    : "";

  return (
    <ModalShell title="Manage Labels" onClose={onClose}>
      <div className="space-y-3 mb-5">
        {sorted.map((label, index) => {
          const draft = drafts[label.id] ?? {
            name: label.name,
            color: label.color,
          };
          const dirty = isDirty(label);
          const nameError = nameErrors[label.id];
          return (
            <div
              key={label.id}
              className="border border-gray-200 rounded-xl p-3"
            >
              <div className="flex items-center gap-2">
                <input
                  value={draft.name}
                  aria-label={`Label name for ${label.name}`}
                  aria-invalid={nameError ? true : undefined}
                  maxLength={120}
                  onChange={(e) => {
                    setDrafts((prev) => ({
                      ...prev,
                      [label.id]: { ...draft, name: e.target.value },
                    }));
                    if (nameError) setNameErrors((prev) => ({ ...prev, [label.id]: "" }));
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      saveLabel(label);
                    }
                  }}
                  className={`flex-1 border rounded-lg px-3 py-2 text-[13px] text-dash-dark placeholder:text-gray-400 outline-none focus:border-dash-dark ${nameError ? "border-red-400" : "border-gray-200"}`}
                />
                <input
                  type="color"
                  aria-label={`Colour for ${label.name}`}
                  value={draft.color}
                  onChange={(e) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [label.id]: { ...draft, color: e.target.value },
                    }))
                  }
                  className="w-10 h-9 border border-gray-200 rounded-lg bg-white p-1"
                />
                <button
                  type="button"
                  aria-label={`Move ${label.name} up`}
                  disabled={index === 0 || reorderLabels.isPending}
                  onClick={() => moveLabel(label.id, "up")}
                  className="p-2 rounded-md border border-gray-200 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  type="button"
                  aria-label={`Move ${label.name} down`}
                  disabled={index === sorted.length - 1 || reorderLabels.isPending}
                  onClick={() => moveLabel(label.id, "down")}
                  className="p-2 rounded-md border border-gray-200 text-gray-500 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => saveLabel(label)}
                  disabled={!dirty || updateLabel.isPending}
                  className={`px-3 py-2 rounded-lg border text-[12px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${dirty ? "border-dash-dark bg-dash-dark text-white" : "border-gray-200 text-gray-600"}`}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget({ label, usageCount: null })}
                  disabled={isLastLabel || deleteLabel.isPending}
                  title={isLastLabel ? "Keep at least one label: every lead needs a stage." : undefined}
                  className="px-3 py-2 rounded-lg border border-red-200 text-[12px] font-semibold text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Delete
                </button>
              </div>
              <div data-field={`label-${label.id}`}>
                <FieldError message={nameError} />
              </div>
              <div className="flex items-center justify-between mt-1">
                <p className="text-[11px] text-gray-400">
                  {dirty ? "Unsaved changes" : `Key: ${label.slug}`}
                </p>
                <label
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600 cursor-pointer"
                  title="Leads in this stage count as won/converted in CRM and dashboard stats"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(label.is_won)}
                    disabled={updateLabel.isPending}
                    onChange={(e) => toggleWon(label, e.target.checked)}
                    className="accent-dash-dark"
                  />
                  Counts as won
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="border-t border-gray-100 pt-4" data-field="new-label-name">
        <div className="flex items-center gap-2">
          <input
            value={newLabelName}
            aria-label="New label name"
            aria-invalid={newLabelError ? true : undefined}
            maxLength={120}
            onChange={(e) => {
              setNewLabelName(e.target.value);
              if (newLabelError) setNewLabelError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                createNew();
              }
            }}
            placeholder="Add new label"
            className={`flex-1 border rounded-lg px-3 py-2 text-[13px] text-dash-dark placeholder:text-gray-400 outline-none focus:border-dash-dark ${newLabelError ? "border-red-400" : "border-gray-200"}`}
          />
          <input
            type="color"
            aria-label="New label colour"
            value={newLabelColor}
            onChange={(e) => setNewLabelColor(e.target.value)}
            className="w-10 h-9 border border-gray-200 rounded-lg bg-white p-1"
          />
          <button
            type="button"
            onClick={createNew}
            disabled={createLabel.isPending}
            className="px-4 py-2 rounded-lg bg-dash-dark text-white text-[12px] font-semibold disabled:opacity-60"
          >
            {createLabel.isPending ? "Adding…" : "Add"}
          </button>
        </div>
        <FieldError message={newLabelError} />
      </div>

      <ConfirmDeleteModal
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={deleteTarget?.usageCount ? "Move leads and delete label?" : "Delete label?"}
        description={
          deleteTarget?.usageCount
            ? `${deleteTarget.usageCount} lead${deleteTarget.usageCount === 1 ? " is" : "s are"} in "${deleteTarget.label.name}". ${deleteTarget.usageCount === 1 ? "It" : "They"} will be moved to "${moveTargetName}". This can't be undone.`
            : deleteTarget
              ? `Delete the "${deleteTarget.label.name}" label? This can't be undone.`
              : ""
        }
        confirmLabel={deleteTarget?.usageCount ? "Move leads & delete" : "Delete"}
      />
    </ModalShell>
  );
}
