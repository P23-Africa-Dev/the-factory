export type CommissionPreference =
  | "per-unit"
  | "percentage"
  | "per-pack"
  | "flat";

export interface ProductEntry {
  name: string;
  rate: string;
}

interface CommissionModalProps {
  isOpen: boolean;
  onClose: () => void;
  preference: CommissionPreference;
  onPreferenceChange: (p: CommissionPreference) => void;
  products: ProductEntry[];
  onProductsChange: (p: ProductEntry[]) => void;
}

const PREFERENCE_OPTIONS: { value: CommissionPreference; label: string }[] = [
  { value: "per-unit", label: "Per Unit Calculation" },
  { value: "percentage", label: "Percentage" },
  { value: "per-pack", label: "Per Pack Calculation" },
  { value: "flat", label: "Flat" },
];

export function CommissionModal({
  isOpen,
  onClose,
  preference,
  onPreferenceChange,
  products,
  onProductsChange,
}: CommissionModalProps) {
  if (!isOpen) return null;

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
      <div className="relative bg-white rounded-3xl w-full max-w-105 p-7 shadow-[0px_4px_4px_0px_#0000004D,0px_8px_12px_6px_#00000026]">
        <h3 className="text-[16px] font-bold text-[#0B1215] mb-5">
          Commission
        </h3>

        {/* Preference Selection */}
        <div className="mb-5">
          <p className="text-[12px] font-semibold text-gray-500 mb-3">
            Choose Preference
          </p>
          <div className="grid grid-cols-2 gap-2.5">
            {PREFERENCE_OPTIONS.map((opt) => {
              const isSelected = preference === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onPreferenceChange(opt.value)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-full text-[11px] font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? "bg-[#0B1215] text-white"
                      : "bg-[#F3F4F6] text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  <span
                    className={`shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      isSelected ? "border-white" : "border-gray-400"
                    }`}
                  >
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </span>
                  {opt.label}
                </button>
              );
            })}
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
              className="w-7 h-7 rounded-full border border-gray-300 flex items-center justify-center text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
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
