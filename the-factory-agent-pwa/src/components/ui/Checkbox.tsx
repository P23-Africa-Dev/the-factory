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
    <label className={`flex items-center cursor-pointer select-none ${className}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <div
        className={`flex h-6 w-6 items-center justify-center rounded-md border-1.5 transition-all ${
          checked
            ? 'border-[#75ADAF] bg-[#75ADAF] text-white'
            : 'border-[#F1F1F1] bg-transparent text-transparent'
        } ${boxClassName}`}
      >
        {checked && <Check size={14} strokeWidth={3} />}
      </div>
      {label && (
        <span className={`ml-2.5 text-xs text-[#FAFAFA] ${labelClassName}`}>
          {label}
        </span>
      )}
    </label>
  );
};
