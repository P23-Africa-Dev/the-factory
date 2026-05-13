import React from "react";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options?: { label: string; value: string }[];
  placeholder?: string;
}

export default function Select({ 
  className = "", 
  options = [], 
  placeholder, 
  ...props 
}: SelectProps) {
  return (
    <div className="relative w-full">
      <select
        className={`w-full h-[60px] px-7 rounded-full border shadow-[0px_1px_2px_0px_#0000004D] border-gray-200 text-xs text-[#34373C] outline-none focus:border-[#A9AAAB] transition-colors appearance-none bg-white cursor-pointer ${
          props.value === "" ? "text-[#A9AAAB]" : ""
        } ${className}`}
        {...props}
      >
        {placeholder && (
          <option value="" disabled hidden className="text-[#A9AAAB]">
            {placeholder}
          </option>
        )}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="text-[#34373C]">
            {opt.label}
          </option>
        ))}
        {props.children}
      </select>
      <div className="absolute right-6 top-1/2 -translate-y-1/2 pointer-events-none text-[#A9AAAB]">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </div>
    </div>
  );
}
