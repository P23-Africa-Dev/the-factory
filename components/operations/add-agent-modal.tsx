"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { SectionDivider } from "@/components/payroll/payroll/section-divider";
import { FormRow } from "@/components/payroll/payroll/form-row";
import { InlineInput } from "@/components/payroll/payroll/inline-input";
import { InlineSelect } from "@/components/payroll/payroll/inline-select";
import {
  AgentDetailsModal,
  type AgentDetails,
} from "@/components/operations/agent-details-modal";

const ZONE_OPTIONS = [
  "Ikeja LGA",
  "Surulere LGA",
  "Lekki LGA",
  "Victoria Island",
  "Yaba LGA",
  "Oshodi LGA",
];
const ROLE_OPTIONS = ["Supervisor", "Field Agent", "Staff"];

type FormErrors = Partial<{
  name: string;
  email: string;
  role: string;
  zone: string;
  salary: string;
  phone: string;
  gender: string;
}>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[11px] text-red-500 mt-0.5 text-right">{message}</p>;
}

export function AddAgentModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [zone, setZone] = useState("");
  const [salary, setSalary] = useState("");
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [fillForAgent, setFillForAgent] = useState(false);
  const [agentDetailsModalOpen, setAgentDetailsModalOpen] = useState(false);
  const [agentDetails, setAgentDetails] = useState<AgentDetails>({
    phone: "",
    gender: "",
    avatarIndex: -1,
    avatarCustom: null,
  });
  const [errors, setErrors] = useState<FormErrors>({});

  const handleFillForAgentToggle = () => {
    const newEnabled = !fillForAgent;
    setFillForAgent(newEnabled);
    setAgentDetailsModalOpen(newEnabled);
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
    }
    if (fillForAgent) {
      if (!agentDetails.phone.trim()) e.phone = "Phone number is required.";
      if (!agentDetails.gender) e.gender = "Gender is required.";
    }
    return e;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      if ((errs.phone || errs.gender) && !agentDetailsModalOpen) {
        setAgentDetailsModalOpen(true);
      }
      return;
    }
    onClose();
  };

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
                    onChange={(e) => { setRole(e.target.value); clearError("role"); }}
                    className="col-span-2"
                  >
                    <option value="" disabled>
                      E.g Staff
                    </option>
                    {ROLE_OPTIONS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </InlineSelect>
                </FormRow>
                <FieldError message={errors.role} />
              </div>

              <div>
                <FormRow label="Zone">
                  <InlineSelect
                    value={zone}
                    onChange={(e) => { setZone(e.target.value); clearError("zone"); }}
                    className="col-span-2"
                  >
                    <option value="" disabled>
                      E.g Ikeja LGA
                    </option>
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
                    placeholder="E.g ₦120,000"
                    className="col-span-2"
                  />
                </FormRow>
                <FieldError message={errors.salary} />
              </div>

              <div className="space-y-2">
                <FormRow label="Commission Enable">
                  <Toggle
                    enabled={commissionEnabled}
                    onToggle={() => setCommissionEnabled(!commissionEnabled)}
                  />
                </FormRow>
                <FormRow label="Fill for Agent">
                  <Toggle
                    enabled={fillForAgent}
                    onToggle={handleFillForAgentToggle}
                  />
                </FormRow>
              </div>
            </div>

            {!fillForAgent && (
              <div className="flex items-center justify-start">
                <button
                  type="submit"
                  className="w-fit px-9.25 py-[8.5px] bg-[#0B1215] text-white rounded-[10px] text-[14px] font-semibold hover:opacity-90 transition-colors cursor-pointer"
                >
                  Done
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
        errors={{ phone: errors.phone, gender: errors.gender }}
        onClearError={(field) => clearError(field)}
      />
    </>
  );
}
