import { ChevronDown } from "lucide-react";

interface FilterSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly T[];
}

export function FilterSelect<T extends string>({
  value,
  onChange,
  options,
}: FilterSelectProps<T>) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="appearance-none outline-none text-[9px] leading-3.5 font-medium bg-[#5E5D5D] text-white px-1.5 pr-5.25 py-px flex items-center rounded-[3px] transition-colors hover:bg-[#3F4254] cursor-pointer"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <ChevronDown className="w-3 h-3 text-white absolute right-[8px] top-1/2 -translate-y-1/2 pointer-events-none" />
    </div>
  );
}
