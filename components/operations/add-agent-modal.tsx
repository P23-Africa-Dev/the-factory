"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Toggle } from "@/components/ui/toggle";
import { SectionDivider } from "@/components/payroll/payroll/section-divider";
import { FormRow } from "@/components/payroll/payroll/form-row";
import { InlineInput } from "@/components/payroll/payroll/inline-input";
import { InlineSelect } from "@/components/payroll/payroll/inline-select";
import {
  AgentDetailsModal,
  type AgentDetails,
} from "@/components/operations/agent-details-modal";
import { useCreateInternalUser } from "@/hooks/use-internal-users";
import { useInternalUsers } from "@/hooks/use-projects";
import { useAuthStore } from "@/store/auth";
import type { ApiRequestError } from "@/lib/api/onboarding";
import { getActiveCompanyContext } from "@/lib/company-context";

const ZONE_OPTIONS = [
  "Ikeja LGA",
  "Surulere LGA",
  "Lekki LGA",
  "Victoria Island",
  "Yaba LGA",
  "Oshodi LGA",
];

const ROLE_OPTIONS = [
  { label: "Supervisor", value: "supervisor" },
  { label: "Agent", value: "agent" },
] as const;

const WEEKDAYS = [
  { label: "Mon", value: "monday" },
  { label: "Tue", value: "tuesday" },
  { label: "Wed", value: "wednesday" },
  { label: "Thu", value: "thursday" },
  { label: "Fri", value: "friday" },
  { label: "Sat", value: "saturday" },
  { label: "Sun", value: "sunday" },
];

type FormErrors = Partial<{
  name: string;
  email: string;
  role: string;
  zone: string;
  salary: string;
  workDays: string;
  supervisorId: string;
  phone: string;
  gender: string;
  avatarKey: string;
}>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[11px] text-red-500 mt-0.5 text-right">{message}</p>;
}

export function AddAgentModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const { apiCompanyId: companyId } = getActiveCompanyContext(user);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"supervisor" | "agent" | "">("");
  const [zone, setZone] = useState("");
  const [salary, setSalary] = useState("");
  const [workDays, setWorkDays] = useState<string[]>(["monday", "tuesday", "wednesday", "thursday", "friday"]);
  const [supervisorId, setSupervisorId] = useState("");
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [fillForAgent, setFillForAgent] = useState(false);
  const [agentDetailsModalOpen, setAgentDetailsModalOpen] = useState(false);
  const [agentDetails, setAgentDetails] = useState<AgentDetails>({
    phone: "",
    gender: "",
    avatarKey: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const createMutation = useCreateInternalUser();

  const { data: supervisors = [], isLoading: loadingSupervisors } = useInternalUsers(
    { role: "supervisor", company_id: companyId ?? undefined },
  );

  const handleFillForAgentToggle = () => {
    const next = !fillForAgent;
    setFillForAgent(next);
    setAgentDetailsModalOpen(next);
  };

  const toggleWorkDay = (day: string) => {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
    setErrors((prev) => ({ ...prev, workDays: undefined }));
  };

  const clearError = (field: keyof FormErrors) =>
    setErrors((prev) => ({ ...prev, [field]: undefined }));

  const validate = (): FormErrors => {
    const e: FormErrors = {};
    if (!name.trim()) e.name = "Full name is required.";
    if (!email.trim()) {
      e.email = "Email is required.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      e.email = "Enter a valid email address.";
    }
    if (!role) e.role = "Role is required.";
    if (!zone) e.zone = "Zone is required.";
    if (salary) {
      const numeric = salary.replace(/,/g, "");
      if (isNaN(Number(numeric)) || Number(numeric) < 0)
        e.salary = "Enter a valid salary amount.";
    } else {
      e.salary = "Base salary is required.";
    }
    if (workDays.length === 0) e.workDays = "Select at least one work day.";
    if (role === "agent" && !supervisorId) e.supervisorId = "Supervisor is required for agents.";
    if (fillForAgent) {
      if (!agentDetails.phone.trim()) e.phone = "Phone number is required.";
      if (!agentDetails.gender) e.gender = "Gender is required.";
      if (!agentDetails.avatarKey) e.avatarKey = "Select an avatar.";
    }
    return e;
  };

  const handleError = (err: unknown) => {
    const apiErr = err as ApiRequestError;
    const msg = apiErr.message ?? "Something went wrong. Please try again.";
    toast.error(msg);
    if (apiErr.errors) {
      const fe: FormErrors = {};
      if (apiErr.errors.full_name) fe.name = apiErr.errors.full_name[0];
      if (apiErr.errors.email) fe.email = apiErr.errors.email[0];
      if (apiErr.errors.role) fe.role = apiErr.errors.role[0];
      if (apiErr.errors.assigned_zone) fe.zone = apiErr.errors.assigned_zone[0];
      if (apiErr.errors.base_salary) fe.salary = apiErr.errors.base_salary[0];
      if (apiErr.errors.work_days) fe.workDays = apiErr.errors.work_days[0];
      if (apiErr.errors.supervisor_user_id) fe.supervisorId = apiErr.errors.supervisor_user_id[0];
      if (apiErr.errors.phone_number) fe.phone = apiErr.errors.phone_number[0];
      if (apiErr.errors.gender) fe.gender = apiErr.errors.gender[0];
      if (apiErr.errors.avatar_key) fe.avatarKey = apiErr.errors.avatar_key[0];
      if (apiErr.errors.authorization) toast.error(apiErr.errors.authorization[0]);
      setErrors(fe);
    }
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      if ((errs.phone || errs.gender) && !agentDetailsModalOpen) {
        setAgentDetailsModalOpen(true);
      }
      return;
    }

    if (!companyId) {
      toast.error("No active company found. Please refresh and try again.");
      return;
    }

    const baseSalaryNum = Number(salary.replace(/,/g, ""));

    const payload = {
      company_id: companyId,
      full_name: name.trim(),
      email: email.trim(),
      role: role as "supervisor" | "agent",
      assigned_zone: zone,
      work_days: workDays,
      base_salary: baseSalaryNum,
      commission_enabled: commissionEnabled,
      ...(role === "agent" && supervisorId
        ? { supervisor_user_id: Number(supervisorId) }
        : {}),
      ...(fillForAgent && agentDetails.phone.trim()
        ? { phone_number: agentDetails.phone.trim() }
        : {}),
      ...(fillForAgent && agentDetails.gender
        ? { gender: agentDetails.gender as "male" | "female" }
        : {}),
      ...(fillForAgent && agentDetails.avatarKey
        ? { avatar_key: agentDetails.avatarKey }
        : {}),
    };

    createMutation.mutate(payload, {
      onSuccess: (res) => {
        toast.success(res.message);
        onClose();
      },
      onError: handleError,
    });
  };

  const isPending = createMutation.isPending;

  return (
    <>
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-white/40" onClick={onClose} />

        <div className="absolute right-12 bottom-3.25 bg-white rounded-[28px] w-full max-w-100 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] overflow-hidden flex flex-col max-h-[calc(100vh-120px)]">
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
              Enter Appropriate
              <br />
              Agent Details
            </h2>
            <button
              onClick={onClose}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors z-10 cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          <form
            id="add-agent-form"
            onSubmit={handleSubmit}
            className="flex-1 min-h-0 overflow-y-auto px-7 pb-6"
          >
            {/* ── Profile Section ─────────────────────────────── */}
            <div className="space-y-4 mb-5">
              <SectionDivider label="Add New Agent" />

              <div>
                <FormRow label="Fullname">
                  <InlineInput
                    value={name}
                    onChange={(e) => { setName(e.target.value); clearError("name"); }}
                    placeholder="E.g Alison Thomson"
                    className="col-span-2"
                  />
                </FormRow>
                <FieldError message={errors.name} />
              </div>

              <div>
                <FormRow label="Email">
                  <InlineInput
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); clearError("email"); }}
                    placeholder="E.g alison@company.com"
                    className="col-span-2"
                  />
                </FormRow>
                <FieldError message={errors.email} />
              </div>

              <div>
                <FormRow label="Role">
                  <InlineSelect
                    value={role}
                    onChange={(e) => {
                      setRole(e.target.value as "supervisor" | "agent" | "");
                      setSupervisorId("");
                      clearError("role");
                      clearError("supervisorId");
                    }}
                    className="col-span-2"
                  >
                    <option value="" disabled>Select role</option>
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </InlineSelect>
                </FormRow>
                <FieldError message={errors.role} />
              </div>

              {role === "agent" && (
                <div>
                  <FormRow label="Supervisor">
                    <InlineSelect
                      value={supervisorId}
                      onChange={(e) => { setSupervisorId(e.target.value); clearError("supervisorId"); }}
                      className="col-span-2"
                    >
                      <option value="" disabled>
                        {loadingSupervisors ? "Loading…" : "Select supervisor"}
                      </option>
                      {supervisors.map((s) => (
                        <option key={s.id} value={String(s.id)}>{s.name}</option>
                      ))}
                    </InlineSelect>
                  </FormRow>
                  <FieldError message={errors.supervisorId} />
                </div>
              )}

              <div>
                <FormRow label="Zone">
                  <InlineSelect
                    value={zone}
                    onChange={(e) => { setZone(e.target.value); clearError("zone"); }}
                    className="col-span-2"
                  >
                    <option value="" disabled>E.g Ikeja LGA</option>
                    {ZONE_OPTIONS.map((z) => (
                      <option key={z}>{z}</option>
                    ))}
                  </InlineSelect>
                </FormRow>
                <FieldError message={errors.zone} />
              </div>

              <div>
                <FormRow label="Salary">
                  <InlineInput
                    value={salary}
                    onChange={(e) => {
                      setSalary(e.target.value.replace(/[^0-9,]/g, ""));
                      clearError("salary");
                    }}
                    placeholder="E.g 120000"
                    className="col-span-2"
                  />
                </FormRow>
                <FieldError message={errors.salary} />
              </div>

              <FormRow label="Commission Enable">
                <Toggle
                  enabled={commissionEnabled}
                  onToggle={() => setCommissionEnabled(!commissionEnabled)}
                />
              </FormRow>
            </div>

            {/* ── Work Schedule ───────────────────────────────── */}
            <div className="space-y-3 mb-5">
              <SectionDivider label="Work Schedule" />
              <div>
                <p className="text-[11px] text-gray-500 mb-2">Work Days</p>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => {
                    const selected = workDays.includes(day.value);
                    return (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleWorkDay(day.value)}
                        className={`px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all border ${
                          selected
                            ? "bg-dash-dark text-white border-dash-dark"
                            : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"
                        }`}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
                <FieldError message={errors.workDays} />
              </div>

              <FormRow label="Fill for Agent">
                <Toggle
                  enabled={fillForAgent}
                  onToggle={handleFillForAgentToggle}
                />
              </FormRow>
            </div>

            {!fillForAgent && (
              <div className="flex items-center justify-start">
                <button
                  type="submit"
                  disabled={isPending}
                  className="w-fit px-9.25 py-[8.5px] bg-[#0B1215] text-white rounded-[10px] text-[14px] font-semibold hover:opacity-90 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isPending ? "Saving…" : "Done"}
                </button>
              </div>
            )}
          </form>
        </div>
      </div>

      <AgentDetailsModal
        isOpen={agentDetailsModalOpen}
        onClose={() => setAgentDetailsModalOpen(false)}
        details={agentDetails}
        onDetailsChange={setAgentDetails}
        errors={{ phone: errors.phone, gender: errors.gender, avatarKey: errors.avatarKey }}
        onClearError={(field) => clearError(field as keyof FormErrors)}
      />
    </>
  );
}
