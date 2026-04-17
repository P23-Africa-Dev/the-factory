import { useState } from "react";
import { X } from "lucide-react";

type CommissionPreference = "per-unit" | "percentage" | "per-pack" | "flat";

interface ProductEntry {
  name: string;
  rate: string;
}

interface SetPayrollModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function Toggle({
  enabled,
  onToggle,
}: {
  enabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`relative inline-flex h-6.5 w-12 items-center rounded-full transition-colors cursor-pointer ${
        enabled ? "bg-[#4CAF50]" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-[20px] w-[20px] transform rounded-full bg-white shadow-sm transition-transform ${
          enabled ? "translate-x-[25px]" : "translate-x-[3px]"
        }`}
      />
    </button>
  );
}

function CommissionModal({
  isOpen,
  onClose,
  preference,
  onPreferenceChange,
  products,
  onProductsChange,
}: {
  isOpen: boolean;
  onClose: () => void;
  preference: CommissionPreference;
  onPreferenceChange: (p: CommissionPreference) => void;
  products: ProductEntry[];
  onProductsChange: (p: ProductEntry[]) => void;
}) {
  if (!isOpen) return null;

  const options: { value: CommissionPreference; label: string }[] = [
    { value: "per-unit", label: "Per Unit Calculation" },
    { value: "percentage", label: "Percentage" },
    { value: "per-pack", label: "Per Pack Calculation" },
    { value: "flat", label: "Flat" },
  ];

  const addProduct = () => {
    onProductsChange([...products, { name: "", rate: "" }]);
  };

  const updateProduct = (
    index: number,
    field: "name" | "rate",
    value: string,
  ) => {
    const updated = [...products];
    updated[index] = { ...updated[index], [field]: value };
    onProductsChange(updated);
  };

  return (
    <div className="fixed right-119.75 bottom-3.25 z-60">
      {/* Modal */}
      <div className="relative bg-white rounded-3xl w-full max-w-105 p-7 shadow-2xl">
        <h3 className="text-[16px] font-bold text-[#0B1215] mb-5">
          Commission
        </h3>

        {/* Preference Selection */}
        <div className="mb-5">
          <p className="text-[12px] font-semibold text-gray-500 mb-3">
            Choose Preference
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => onPreferenceChange(opt.value)}
                className={`px-3 py-2.5 rounded-full text-[11px] font-semibold transition-all cursor-pointer ${
                  preference === opt.value
                    ? "bg-[#0B1215] text-white"
                    : "bg-[#F3F4F6] text-gray-500 hover:bg-gray-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Add Product */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[12px] font-semibold text-gray-500">
              Add Product
            </p>
            <button
              type="button"
              onClick={addProduct}
              className="text-[11px] font-bold text-[#4A90D9] hover:underline cursor-pointer"
            >
              + Add
            </button>
          </div>

          <div className="space-y-2.5">
            {products.map((product, i) => (
              <div key={i} className="flex gap-2.5">
                <input
                  type="text"
                  placeholder="Product Name"
                  value={product.name}
                  onChange={(e) => updateProduct(i, "name", e.target.value)}
                  className="flex-1 h-[42px] px-4 rounded-full border border-gray-200 text-[11px] text-[#0B1215] outline-none placeholder:text-gray-400 focus:border-gray-400 transition-colors"
                />
                <input
                  type="text"
                  placeholder="Commission Rate"
                  value={product.rate}
                  onChange={(e) => updateProduct(i, "rate", e.target.value)}
                  className="flex-1 h-[42px] px-4 rounded-full border border-gray-200 text-[11px] text-[#0B1215] outline-none placeholder:text-gray-400 focus:border-gray-400 transition-colors"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Done Button */}
        <button
          type="button"
          onClick={onClose}
          className="w-full h-[44px] bg-[#0B1215] text-white rounded-full text-[12px] font-semibold hover:opacity-90 transition-colors cursor-pointer"
        >
          Done
        </button>
      </div>
    </div>
  );
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

  return (
    <>
      <div className="fixed inset-0 z-50">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-white/40" onClick={onClose} />

        {/* Modal */}
        <div className="absolute right-12 bottom-3.25 bg-white rounded-[28px] w-full max-w-100 shadow-2xl overflow-hidden">
          {/* Header with dark wave */}
          <div className="bg-[#0B1215] h-18 relative overflow-hidden flex items-center px-7">
            <div className="absolute top-0 right-0 w-[50%] h-full pointer-events-none">
              <svg
                viewBox="0 0 200 72"
                fill="none"
                className="w-full h-full"
                preserveAspectRatio="none"
              >
                <path
                  d="M40 0 C60 24, 20 48, 80 72 L200 72 L200 0 Z"
                  fill="#1A3A4A"
                />
              </svg>
            </div>
            <h2 className="text-[18px] font-bold text-white relative z-10">
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
          <div className="px-7 py-6 max-h-[calc(100vh-200px)] overflow-y-auto">
            {/* Salary Section */}
            <div className="mb-6">
              <p className="text-[13px] font-bold text-[#0B1215] mb-4">
                Salary
              </p>

              <div className="space-y-3">
                {/* Salary Type */}
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-gray-400 font-medium">
                    Salary Type
                  </label>
                  <div className="relative">
                    <select
                      value={salaryType}
                      onChange={(e) => setSalaryType(e.target.value)}
                      className="appearance-none outline-none h-[36px] pl-3 pr-7 rounded-[10px] border border-gray-200 text-[11px] font-semibold text-[#0B1215] bg-white cursor-pointer"
                    >
                      <option>Monthly</option>
                      <option>Weekly</option>
                      <option>Daily</option>
                    </select>
                    <svg
                      className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#9CA3AF"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </div>

                {/* Base Salary */}
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-gray-400 font-medium">
                    Base Salary
                  </label>
                  <input
                    type="text"
                    value={baseSalary}
                    onChange={(e) => setBaseSalary(e.target.value)}
                    className="h-[36px] w-[140px] px-3 rounded-[10px] border border-gray-200 text-[11px] font-semibold text-[#0B1215] outline-none text-right"
                  />
                </div>

                {/* Pay Basis */}
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-gray-400 font-medium">
                    Pay Basis
                  </label>
                  <div className="relative">
                    <select
                      value={payBasis}
                      onChange={(e) => setPayBasis(e.target.value)}
                      className="appearance-none outline-none h-[36px] pl-3 pr-7 rounded-[10px] border border-gray-200 text-[11px] font-semibold text-[#0B1215] bg-white cursor-pointer"
                    >
                      <option>Per Day</option>
                      <option>Per Hour</option>
                      <option>Per Month</option>
                    </select>
                    <svg
                      className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#9CA3AF"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100 mb-6" />

            {/* Attendance Section */}
            <div className="mb-6">
              <p className="text-[13px] font-bold text-[#0B1215] mb-4">
                Attendance
              </p>

              <div className="space-y-3">
                {/* Work Days */}
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-gray-400 font-medium">
                    Work Days
                  </label>
                  <input
                    type="text"
                    value={workDays}
                    onChange={(e) => setWorkDays(e.target.value)}
                    className="h-[36px] w-[140px] px-3 rounded-[10px] border border-gray-200 text-[11px] font-semibold text-[#0B1215] outline-none text-right"
                  />
                </div>

                {/* Work Hours */}
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-gray-400 font-medium">
                    Work Hours
                  </label>
                  <input
                    type="text"
                    value={workHours}
                    onChange={(e) => setWorkHours(e.target.value)}
                    className="h-[36px] w-[140px] px-3 rounded-[10px] border border-gray-200 text-[11px] font-semibold text-[#0B1215] outline-none text-right"
                  />
                </div>
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-gray-100 mb-6" />

            {/* Toggles Section */}
            <div className="space-y-4 mb-6">
              {/* Attendance Affect Pay */}
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-gray-400 font-medium">
                  Attendance Affect Pay
                </label>
                <Toggle
                  enabled={attendanceAffectPay}
                  onToggle={() => setAttendanceAffectPay(!attendanceAffectPay)}
                />
              </div>

              {/* Commission Enable */}
              <div className="flex items-center justify-between">
                <label className="text-[11px] text-gray-400 font-medium">
                  Commission Enable
                </label>
                <Toggle
                  enabled={commissionEnabled}
                  onToggle={() => {
                    const newEnabled = !commissionEnabled;
                    setCommissionEnabled(newEnabled);
                    setCommissionModalOpen(newEnabled);
                  }}
                />
              </div>
            </div>

            {/* Done Button */}
            <button
              type="button"
              onClick={onClose}
              className="w-full h-[44px] bg-[#0B1215] text-white rounded-full text-[12px] font-semibold hover:opacity-90 transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {/* Commission Sub-Modal */}
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
