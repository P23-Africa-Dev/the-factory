"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { SectionDivider } from "@/components/payroll/payroll/section-divider";
import { FormRow } from "@/components/payroll/payroll/form-row";
import { InlineInput } from "@/components/payroll/payroll/inline-input";
import { InlineSelect } from "@/components/payroll/payroll/inline-select";
import {
  CommissionModal,
  type CommissionPreference,
  type ProductEntry,
} from "@/components/payroll/payroll/commission-modal";
import { useCreatePayroll, useUpdatePayroll } from "@/hooks/use-payroll";
import { useAuthStore } from "@/store/auth";
import { getAuthTokenFromDocument } from "@/lib/auth/session";
import type { PayrollSettings } from "@/lib/api/payroll";
import type { ApiRequestError } from "@/lib/api/onboarding";
import { toast } from "sonner";

interface SetPayrollModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingPayroll?: PayrollSettings | null;
}

type FormErrors = Partial<{
  baseSalary: string;
  payBasis: string;
  workDays: string;
  workHours: string;
  salaryType: string;
}>;

type ProductErrors = { name?: string; rate?: string }[];

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-[11px] text-red-500 mt-0.5 text-right">{message}</p>;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function SetPayrollModal({ isOpen, onClose, existingPayroll }: SetPayrollModalProps) {
  const user = useAuthStore((s) => s.user);
  const companyId = user?.active_company?.company_id ?? null;

  const [salaryType, setSalaryType] = useState(
    existingPayroll ? capitalize(existingPayroll.salary_type) : "Monthly"
  );
  const [baseSalary, setBaseSalary] = useState(
    existingPayroll ? String(existingPayroll.base_salary) : "₦30,000"
  );
  const [payBasis, setPayBasis] = useState("Per Day");
  const [workDays, setWorkDays] = useState(
    existingPayroll ? `${existingPayroll.work_days} Days` : "22 Days"
  );
  const [workHours, setWorkHours] = useState(
    existingPayroll ? `${existingPayroll.work_hours} Hours` : "8 Hours"
  );
  const [attendanceAffectPay, setAttendanceAffectPay] = useState(
    existingPayroll ? existingPayroll.attendance_affects_pay : true
  );
  const [commissionEnabled, setCommissionEnabled] = useState(
    existingPayroll ? existingPayroll.commission_enabled : false
  );
  const [commissionModalOpen, setCommissionModalOpen] = useState(false);
  const [commissionPreference, setCommissionPreference] =
    useState<CommissionPreference>("per-unit");
  const [products, setProducts] = useState<ProductEntry[]>([{ name: "", rate: "" }]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [productErrors, setProductErrors] = useState<ProductErrors>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [backendFieldErrors, setBackendFieldErrors] = useState<
    Record<string, string[]> | null
  >(null);

  const createMutation = useCreatePayroll();
  const updateMutation = useUpdatePayroll(existingPayroll?.id);

  const isPending = createMutation.isPending || updateMutation.isPending;

  if (!isOpen) return null;

  const handleCommissionToggle = () => {
    const newEnabled = !commissionEnabled;
    setCommissionEnabled(newEnabled);
    setCommissionModalOpen(newEnabled);
  };

  const clearError = (field: keyof FormErrors) =>
    setErrors((prev) => ({ ...prev, [field]: undefined }));

  const clearProductError = (index: number, field: "name" | "rate") =>
    setProductErrors((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: undefined };
      return next;
    });

  const validate = (): { formErrors: FormErrors; productErrors: ProductErrors } => {
    const formErrors: FormErrors = {};
    const prodErrs: ProductErrors = [];

    const salaryNumeric = Number(baseSalary.replace(/[₦,\s]/g, ""));
    if (!baseSalary.trim()) {
      formErrors.baseSalary = "Base salary is required.";
    } else if (isNaN(salaryNumeric) || salaryNumeric <= 0) {
      formErrors.baseSalary = "Enter a valid salary amount.";
    }

    if (!payBasis.trim()) formErrors.payBasis = "Pay basis is required.";

    const daysNumeric = Number(workDays.replace(/[^0-9.]/g, ""));
    if (!workDays.trim()) {
      formErrors.workDays = "Work days is required.";
    } else if (isNaN(daysNumeric) || daysNumeric <= 0) {
      formErrors.workDays = "Enter a valid number of days.";
    }

    const hoursNumeric = Number(workHours.replace(/[^0-9.]/g, ""));
    if (!workHours.trim()) {
      formErrors.workHours = "Work hours is required.";
    } else if (isNaN(hoursNumeric) || hoursNumeric < 4 || hoursNumeric > 12) {
      formErrors.workHours = "Work hours must be between 4 and 12.";
    }

    if (commissionEnabled) {
      products.forEach((p) => {
        const e: { name?: string; rate?: string } = {};
        if (!p.name.trim()) e.name = "Required.";
        if (!p.rate.trim()) {
          e.rate = "Required.";
        } else if (isNaN(Number(p.rate)) || Number(p.rate) <= 0) {
          e.rate = "Must be a positive number.";
        }
        prodErrs.push(e);
      });
    }

    return { formErrors, productErrors: prodErrs };
  };

  const handleError = (err: unknown) => {
    const apiErr = err as ApiRequestError;
    const msg = apiErr.message ?? "Something went wrong. Please try again.";
    toast.error(msg);
    setApiError(msg);
    if (apiErr.errors) {
      setBackendFieldErrors(apiErr.errors);
      const fe: FormErrors = {};
      if (apiErr.errors.base_salary) fe.baseSalary = apiErr.errors.base_salary[0];
      if (apiErr.errors.work_days) fe.workDays = apiErr.errors.work_days[0];
      if (apiErr.errors.work_hours) fe.workHours = apiErr.errors.work_hours[0];
      if (apiErr.errors.salary_type) fe.salaryType = apiErr.errors.salary_type[0];
      if (apiErr.errors.authorization) toast.error(apiErr.errors.authorization[0]);
      setErrors(fe);
    }
  };

  const handleSubmit = (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { formErrors: fe, productErrors: pe } = validate();
    const hasFormErrors = Object.keys(fe).length > 0;
    const hasProdErrors = pe.some((e) => e.name || e.rate);

    if (hasFormErrors || hasProdErrors) {
      setErrors(fe);
      setProductErrors(pe);
      if (hasProdErrors) setCommissionModalOpen(true);
      return;
    }

    if (!companyId) {
      setApiError("No active company found. Please refresh and try again.");
      return;
    }

    const salaryNumeric = Number(baseSalary.replace(/[₦,\s]/g, ""));
    const daysNumeric = Number(workDays.replace(/[^0-9.]/g, ""));
    const hoursNumeric = Number(workHours.replace(/[^0-9.]/g, ""));

    const payload = {
      company_id: companyId,
      salary_type: salaryType.toLowerCase() as "monthly" | "weekly",
      base_salary: salaryNumeric,
      work_days: daysNumeric,
      work_hours: hoursNumeric,
      attendance_affects_pay: attendanceAffectPay,
      commission_enabled: commissionEnabled,
    };

    setApiError(null);
    setBackendFieldErrors(null);

    if (existingPayroll) {
      updateMutation.mutate(payload, {
        onSuccess: (res) => { toast.success(res.message); onClose(); },
        onError: handleError,
      });
    } else {
      createMutation.mutate(payload, {
        onSuccess: (res) => { toast.success(res.message); onClose(); },
        onError: handleError,
      });
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50">
        <div className="absolute inset-0 bg-white/40" onClick={onClose} />

        <div className="absolute right-12 bottom-3.25 bg-white rounded-[28px] w-full max-w-100 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026] overflow-hidden">
          {/* Header */}
          <div className="bg-transparent h-18 relative overflow-hidden flex items-center px-7">
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
            <h2 className="text-[18px] font-bold text-dash-dark relative z-10">
              {existingPayroll ? "Edit Payroll" : "Set Payroll"}
            </h2>
            <button
              onClick={onClose}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors z-10 cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <form
            id="set-payroll-form"
            onSubmit={handleSubmit}
            className="px-7 pb-6 max-h-[calc(100vh-200px)] overflow-y-auto"
          >
            {apiError && (
              <p className="text-[11px] text-red-500 mb-3 text-center">{apiError}</p>
            )}

            {/* Salary */}
            <div className="space-y-4 mb-5">
              <SectionDivider label="Salary" />
              <div>
                <FormRow label="Salary Type">
                  <InlineSelect
                    value={salaryType}
                    onChange={(e) => { setSalaryType(e.target.value); clearError("salaryType"); }}
                    className="col-span-2"
                  >
                    <option>Monthly</option>
                    <option>Weekly</option>
                  </InlineSelect>
                </FormRow>
                <FieldError message={errors.salaryType} />
              </div>
              <div>
                <FormRow label="Base Salary">
                  <InlineInput
                    value={baseSalary}
                    onChange={(e) => { setBaseSalary(e.target.value); clearError("baseSalary"); }}
                    className="col-span-2"
                  />
                </FormRow>
                <FieldError message={errors.baseSalary} />
              </div>
              <div>
                <FormRow label="Pay Basis">
                  <InlineInput
                    value={payBasis}
                    onChange={(e) => { setPayBasis(e.target.value); clearError("payBasis"); }}
                    className="col-span-2"
                  />
                </FormRow>
                <FieldError message={errors.payBasis} />
              </div>
            </div>

            {/* Attendance */}
            <div className="space-y-4 mb-5">
              <SectionDivider label="Attendance" />
              <div>
                <FormRow label="Work Days">
                  <InlineInput
                    value={workDays}
                    onChange={(e) => { setWorkDays(e.target.value); clearError("workDays"); }}
                    className="col-span-2"
                  />
                </FormRow>
                <FieldError message={errors.workDays} />
              </div>
              <div>
                <FormRow label="Work Hours">
                  <InlineInput
                    value={workHours}
                    onChange={(e) => { setWorkHours(e.target.value); clearError("workHours"); }}
                    className="col-span-2"
                  />
                </FormRow>
                <FieldError message={errors.workHours} />
              </div>

              <div className="space-y-2">
                <FormRow label="Attendance Affect Pay">
                  <Toggle
                    enabled={attendanceAffectPay}
                    onToggle={() => setAttendanceAffectPay(!attendanceAffectPay)}
                  />
                </FormRow>
                <FormRow label="Commission Enable">
                  <Toggle
                    enabled={commissionEnabled}
                    onToggle={handleCommissionToggle}
                  />
                </FormRow>
              </div>
            </div>

            {!commissionEnabled && (
              <button
                type="submit"
                disabled={isPending}
                className="w-full h-11 bg-[#0B1215] text-white rounded-full text-[13px] font-semibold hover:opacity-90 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isPending ? "Saving…" : "Done"}
              </button>
            )}
          </form>
        </div>
      </div>

      <CommissionModal
        isOpen={commissionModalOpen}
        onClose={() => setCommissionModalOpen(false)}
        preference={commissionPreference}
        onPreferenceChange={setCommissionPreference}
        products={products}
        onProductsChange={setProducts}
        productErrors={productErrors}
        onProductErrorClear={clearProductError}
      />
    </>
  );
}
