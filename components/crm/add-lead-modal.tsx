"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { SectionDivider } from "@/components/payroll/payroll/section-divider";
import { FormRow } from "@/components/payroll/payroll/form-row";
import { InlineInput } from "@/components/payroll/payroll/inline-input";
import { InlineSelect } from "@/components/payroll/payroll/inline-select";
import { useCreateLead, useUpdateLead } from "@/hooks/use-crm";
import { useCrmLabels, useCrmPipelines } from "@/hooks/use-crm";
import { useInternalUsers } from "@/hooks/use-internal-users";
import { useAuthStore } from "@/store/auth";
import { getActiveCompanyContext } from "@/lib/company-context";
import type { ApiLeadStatus, ApiLeadPriority, ApiRoleBasePath, LeadApiItem } from "@/lib/api/crm";
import type { ApiRequestError } from "@/lib/api/onboarding";

type FormErrors = Partial<{
  pipelineId: string;
  name: string;
  email: string;
  phone: string;
  location: string;
  source: string;
  status: string;
  priority: string;
  assignedToUserId: string;
  nextAction: string;
  lastInteraction: string;
  lastInteractionAt: string;
}>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[11px] text-red-500 mt-0.5 text-right">{message}</p>;
}

const PRIORITY_OPTIONS = [
  { label: "High", value: "high" },
  { label: "Medium", value: "medium" },
  { label: "Low", value: "low" },
] as const;

export function AddLeadModal({
  onClose,
  apiBasePath = "/admin",
  defaultStatus = "new",
  lead,
}: {
  onClose: () => void;
  apiBasePath?: ApiRoleBasePath;
  defaultStatus?: ApiLeadStatus;
  lead?: LeadApiItem;
}) {
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);

  const [name, setName] = useState(lead?.name ?? "");
  const [email, setEmail] = useState(lead?.email ?? "");
  const [phone, setPhone] = useState(lead?.phone ?? "");
  const [location, setLocation] = useState(lead?.location ?? "");
  const [source, setSource] = useState(lead?.source ?? "");
  const { data: pipelines = [] } = useCrmPipelines(companyId ?? undefined, apiBasePath);
  const { data: labels = [] } = useCrmLabels(companyId ?? undefined, apiBasePath);

  const defaultPipelineId = lead?.pipeline_id != null
    ? String(lead.pipeline_id)
    : pipelines[0]?.id != null
      ? String(pipelines[0].id)
      : "";
  const [pipelineId, setPipelineId] = useState(defaultPipelineId);

  const [status, setStatus] = useState<ApiLeadStatus>(lead?.status ?? defaultStatus);
  const [priority, setPriority] = useState<ApiLeadPriority>(lead?.priority ?? "medium");
  const [assignedToUserId, setAssignedToUserId] = useState(lead?.assigned_to_user_id ? String(lead.assigned_to_user_id) : "");
  const [nextAction, setNextAction] = useState(lead?.next_action ?? "");
  const [lastInteraction, setLastInteraction] = useState(lead?.last_interaction ?? "");

  // Format lead?.last_interaction_at as YYYY-MM-DD for the HTML date input
  const initialDate = lead?.last_interaction_at ? lead.last_interaction_at.split("T")[0] : "";
  const [lastInteractionAt, setLastInteractionAt] = useState(initialDate);

  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (!pipelineId && pipelines.length > 0) {
      setPipelineId(String(pipelines[0].id));
    }
  }, [pipelineId, pipelines]);

  useEffect(() => {
    if (labels.length > 0 && !labels.some((label) => label.slug === status)) {
      setStatus(labels[0].slug);
    }
  }, [labels, status]);

  const { data: companyUsers = [], isLoading: loadingUsers } = useInternalUsers({
    company_id: companyId ?? undefined,
  });

  const createMutation = useCreateLead(
    {
      onSuccess: () => {
        toast.success("Lead created successfully.");
        onClose();
      },
    },
    apiBasePath
  );

  const updateMutation = useUpdateLead(
    {
      onSuccess: () => {
        toast.success("Lead updated successfully.");
        onClose();
      },
    },
    apiBasePath
  );

  const clearError = (field: keyof FormErrors) =>
    setErrors((prev) => ({ ...prev, [field]: undefined }));

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    if (!pipelineId) e.pipelineId = "Pipeline is required.";
    if (!name.trim()) e.name = "Name is required.";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      e.email = "Enter a valid email address.";
    }
    return e;
  };

  const handleError = (err: unknown) => {
    const apiErr = err as ApiRequestError;
    const msg = apiErr.message ?? "Something went wrong. Please try again.";
    toast.error(msg);
    if (apiErr.errors) {
      const fe: FormErrors = {};
      if (apiErr.errors.name) fe.name = apiErr.errors.name[0];
      if (apiErr.errors.pipeline_id) fe.pipelineId = apiErr.errors.pipeline_id[0];
      if (apiErr.errors.email) fe.email = apiErr.errors.email[0];
      if (apiErr.errors.phone) fe.phone = apiErr.errors.phone[0];
      if (apiErr.errors.location) fe.location = apiErr.errors.location[0];
      if (apiErr.errors.source) fe.source = apiErr.errors.source[0];
      if (apiErr.errors.status) fe.status = apiErr.errors.status[0];
      if (apiErr.errors.priority) fe.priority = apiErr.errors.priority[0];
      if (apiErr.errors.assigned_to_user_id) fe.assignedToUserId = apiErr.errors.assigned_to_user_id[0];
      if (apiErr.errors.next_action) fe.nextAction = apiErr.errors.next_action[0];
      if (apiErr.errors.last_interaction) fe.lastInteraction = apiErr.errors.last_interaction[0];
      if (apiErr.errors.last_interaction_at) fe.lastInteractionAt = apiErr.errors.last_interaction_at[0];
      setErrors(fe);
    }
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    if (!companyId) {
      toast.error("No active company found. Please refresh and try again.");
      return;
    }

    const payload = {
      company_id: companyId,
      pipeline_id: Number(pipelineId),
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
      location: location.trim() || null,
      source: source.trim() || null,
      status,
      priority,
      assigned_to_user_id: assignedToUserId ? Number(assignedToUserId) : null,
      next_action: nextAction.trim() || null,
      last_interaction: lastInteraction.trim() || null,
      last_interaction_at: lastInteractionAt || null,
    };

    if (lead) {
      updateMutation.mutate({
        leadId: lead.id,
        payload,
      }, {
        onError: handleError,
      });
    } else {
      createMutation.mutate(payload, {
        onError: handleError,
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-end justify-center sm:justify-end p-0 sm:p-6">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300 cursor-pointer"
        onClick={onClose}
      />

      <div className="relative bg-white rounded-t-[28px] sm:rounded-[28px] w-full sm:w-[440px] shadow-[0px_8px_32px_rgba(0,0,0,0.15)] overflow-hidden flex flex-col max-h-[90dvh] sm:max-h-[calc(100vh-80px)] transition-all duration-300 ease-out">
        <div className="bg-transparent h-18 relative overflow-hidden flex items-center px-7 shrink-0">
          <div className="absolute top-0 right-0 w-[50%] h-full pointer-events-none">
            <svg
              viewBox="0 0 200 72"
              fill="none"
              className="w-full h-full"
              preserveAspectRatio="none"
            >
              <path
                d="M0 0 C60 24, 20 48, 190 72 L200 92 L200 0 Z"
                fill="#09232D"
              />
            </svg>
          </div>
          <h2 className="text-[18px] font-bold text-dash-dark relative z-10 leading-tight">
            {lead ? (
              <>
                Update Appropriate
                <br />
                Lead Details
              </>
            ) : (
              <>
                Enter Appropriate
                <br />
                Lead Details
              </>
            )}
          </h2>
          <button
            onClick={onClose}
            className="absolute right-5 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors z-10 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        <form
          id="add-lead-form"
          onSubmit={handleSubmit}
          className="flex-1 min-h-0 overflow-y-auto px-7 pb-6"
        >
          <div className="space-y-4 mb-5">
            <SectionDivider label={lead ? "Edit Contact Details" : "Lead Contact Details"} />

            <div>
              <FormRow label="Name" labelClassName="w-28">
                <InlineInput
                  value={name}
                  onChange={(e) => { setName(e.target.value); clearError("name"); }}
                  placeholder="E.g John Doe"
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.name} />
            </div>

            <div>
              <FormRow label="Email" labelClassName="w-28">
                <InlineInput
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
                  placeholder="E.g john.doe@example.com"
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.email} />
            </div>

            <div>
              <FormRow label="Phone" labelClassName="w-28">
                <InlineInput
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value); clearError("phone"); }}
                  placeholder="E.g +1 555-0199"
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.phone} />
            </div>

            <div>
              <FormRow label="Location" labelClassName="w-28">
                <InlineInput
                  value={location}
                  onChange={(e) => { setLocation(e.target.value); clearError("location"); }}
                  placeholder="E.g New York, USA"
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.location} />
            </div>
          </div>

          <div className="space-y-4 mb-5">
            <SectionDivider label={lead ? "Edit Lead Classification" : "Lead Classification"} />

            <div>
              <FormRow label="Pipeline" labelClassName="w-28">
                <InlineSelect
                  value={pipelineId}
                  onChange={(e) => {
                    setPipelineId(e.target.value);
                    clearError("pipelineId");
                  }}
                  className="col-span-2"
                >
                  <option value="">Select Pipeline</option>
                  {pipelines.map((pipeline) => (
                    <option key={pipeline.id} value={String(pipeline.id)}>{pipeline.name}</option>
                  ))}
                </InlineSelect>
              </FormRow>
              <FieldError message={errors.pipelineId} />
            </div>

            <div>
              <FormRow label="Source" labelClassName="w-28">
                <InlineInput
                  value={source}
                  onChange={(e) => { setSource(e.target.value); clearError("source"); }}
                  placeholder="E.g Website, Referral"
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.source} />
            </div>

            <div>
              <FormRow label="Status" labelClassName="w-28">
                <InlineSelect
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value as ApiLeadStatus);
                    clearError("status");
                  }}
                  className="col-span-2"
                >
                  {labels.map((label) => (
                    <option key={label.id} value={label.slug}>{label.name}</option>
                  ))}
                </InlineSelect>
              </FormRow>
              <FieldError message={errors.status} />
            </div>

            <div>
              <FormRow label="Priority" labelClassName="w-28">
                <InlineSelect
                  value={priority}
                  onChange={(e) => {
                    setPriority(e.target.value as ApiLeadPriority);
                    clearError("priority");
                  }}
                  className="col-span-2"
                >
                  {PRIORITY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </InlineSelect>
              </FormRow>
              <FieldError message={errors.priority} />
            </div>

            <div>
              <FormRow label="Assignee" labelClassName="w-28">
                <InlineSelect
                  value={assignedToUserId}
                  onChange={(e) => {
                    setAssignedToUserId(e.target.value);
                    clearError("assignedToUserId");
                  }}
                  className="col-span-2"
                >
                  <option value="">Unassigned</option>
                  {companyUsers.map((u) => (
                    <option key={u.id} value={String(u.id)}>{u.name}</option>
                  ))}
                </InlineSelect>
              </FormRow>
              <FieldError message={errors.assignedToUserId} />
            </div>
          </div>

          <div className="space-y-4 mb-5">
            <SectionDivider label={lead ? "Edit Activity & Interactions" : "Activity & Interactions"} />

            <div>
              <FormRow label="Next Action" labelClassName="w-28">
                <InlineInput
                  value={nextAction}
                  onChange={(e) => { setNextAction(e.target.value); clearError("nextAction"); }}
                  placeholder="E.g Send follow-up email"
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.nextAction} />
            </div>

            <div>
              <FormRow label="Last Interaction" labelClassName="w-28">
                <InlineInput
                  value={lastInteraction}
                  onChange={(e) => { setLastInteraction(e.target.value); clearError("lastInteraction"); }}
                  placeholder="E.g Call to discuss requirements"
                  className="col-span-2"
                />
              </FormRow>
              <FieldError message={errors.lastInteraction} />
            </div>

            <div>
              <FormRow label="Interaction Date" labelClassName="w-28">
                <InlineInput
                  type="date"
                  value={lastInteractionAt}
                  onChange={(e) => { setLastInteractionAt(e.target.value); clearError("lastInteractionAt"); }}
                  className="col-span-2 text-[11px]"
                />
              </FormRow>
              <FieldError message={errors.lastInteractionAt} />
            </div>
          </div>

          <div className="flex items-center justify-start mt-6">
            <button
              type="submit"
              disabled={isPending}
              className="w-full sm:w-auto px-9.25 py-3 sm:py-[8.5px] bg-[#0B1215] text-white rounded-[10px] text-[14px] font-semibold hover:opacity-90 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPending ? "Saving…" : lead ? "Save Changes" : "Done"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
