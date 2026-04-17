import { useState } from "react";
import { X } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { SectionDivider } from "@/components/finance/payroll/section-divider";
import { FormRow } from "@/components/finance/payroll/form-row";
import { InlineInput } from "@/components/finance/payroll/inline-input";
import { InlineSelect } from "@/components/finance/payroll/inline-select";
import {
  CommissionModal,
  type CommissionPreference,
  type ProductEntry,
} from "@/components/finance/payroll/commission-modal";

interface SetPayrollModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SetPayrollModal({ isOpen, onClose }: SetPayrollModalProps) {
  const [salaryType, setSalaryType] = useState("Monthly");
  const [baseSalary, setBaseSalary] = useState("₦30,000");
  const [payBasis, setPayBasis] = useState("Per Day");
  const [workDays, setWorkDays] = useState("22 Days");
  const [workHours, setWorkHours] = useState("8 Hours");
  const [attendanceAffectPay, setAttendanceAffectPay] = useState(true);
  const [commissionEnabled, setCommissionEnabled] = useState(false);
  const [commissionModalOpen, setCommissionModalOpen] = useState(false);
  const [commissionPreference, setCommissionPreference] =
    useState<CommissionPreference>("per-unit");
  const [products, setProducts] = useState<ProductEntry[]>([
    { name: "", rate: "" },
  ]);

  if (!isOpen) return null;

  const handleCommissionToggle = () => {
    const newEnabled = !commissionEnabled;
    setCommissionEnabled(newEnabled);
    setCommissionModalOpen(newEnabled);
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
              Set Payroll
            </h2>
            <button
              onClick={onClose}
              className="absolute right-5 top-1/2 -translate-y-1/2 text-white/60 hover:text-white transition-colors z-10 cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>

          {/* Body */}
          <div className="px-7 pb-6 max-h-[calc(100vh-200px)] overflow-y-auto">
            {/* Salary */}
            <div className="space-y-4 mb-5">
              <SectionDivider label="Salary" />
              <FormRow label="Salary Type">
                <InlineSelect
                  value={salaryType}
                  onChange={(e) => setSalaryType(e.target.value)}
                  className="col-span-2"
                >
                  <option>Monthly</option>
                  <option>Weekly</option>
                  <option>Daily</option>
                </InlineSelect>
              </FormRow>
              <FormRow label="Base Salary">
                <InlineInput
                  value={baseSalary}
                  onChange={(e) => setBaseSalary(e.target.value)}
                  className="col-span-2"
                />
              </FormRow>
              <FormRow label="Pay Basis">
                <InlineInput
                  value={payBasis}
                  onChange={(e) => setPayBasis(e.target.value)}
                  className="col-span-2"
                />
              </FormRow>
            </div>

            {/* Attendance */}
            <div className="space-y-4 mb-5">
              <SectionDivider label="Attendance" />
              <FormRow label="Work Days">
                <InlineInput
                  value={workDays}
                  onChange={(e) => setWorkDays(e.target.value)}
                  className="col-span-2"
                />
              </FormRow>
              <FormRow label="Work Hours">
                <InlineInput
                  value={workHours}
                  onChange={(e) => setWorkHours(e.target.value)}
                  className="col-span-2"
                />
              </FormRow>

              <div>
                <FormRow label="Attendance Affect Pay">
                  <Toggle
                    enabled={attendanceAffectPay}
                    onToggle={() =>
                      setAttendanceAffectPay(!attendanceAffectPay)
                    }
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

            <button
              type="button"
              onClick={onClose}
              className="w-full h-[44px] bg-[#0B1215] text-white rounded-full text-[13px] font-semibold hover:opacity-90 transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      <CommissionModal
        isOpen={commissionModalOpen}
        onClose={() => setCommissionModalOpen(false)}
        preference={commissionPreference}
        onPreferenceChange={setCommissionPreference}
        products={products}
        onProductsChange={setProducts}
      />
    </>
  );
}
