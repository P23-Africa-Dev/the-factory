'use client';

import React from 'react';
import { Check } from 'lucide-react';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string | React.ReactNode;
  className?: string;
  boxClassName?: string;
  labelClassName?: string;
}

export const Checkbox: React.FC<CheckboxProps> = ({
  checked,
  onChange,
  label,
  className = '',
  boxClassName = '',
  labelClassName = '',
}) => {
  return (
    <label className={`flex items-center cursor-pointer select-none gap-3 ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />

      {/* Checkbox box */}
      <div
        className={`
          flex-shrink-0 flex h-5 w-5 items-center justify-center rounded-md
          border-2 transition-all duration-150
          focus-visible:ring-2 focus-visible:ring-[#75ADAF] focus-visible:ring-offset-2
          ${checked
            ? 'border-[#75ADAF] bg-[#75ADAF]'
            : 'border-[#75ADAF]/50 bg-white/5'
          }
          ${boxClassName}
        `}
      >
        {checked && (
          <Check
            size={12}
            strokeWidth={3.5}
            className="text-white animate-in zoom-in-75 duration-100"
          />
        )}
      </div>

      {/* Label — render string or ReactNode without double-wrapping */}
      {label && (
        typeof label === 'string'
          ? <span className={`text-xs leading-relaxed text-[#FAFAFA]/80 ${labelClassName}`}>{label}</span>
          : <div className={`text-xs leading-relaxed ${labelClassName}`}>{label}</div>
      )}
    </label>
  );
};

