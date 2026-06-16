'use client';

import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  isPassword?: boolean;
  containerClassName?: string;
  wrapperClassName?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = '', error, isPassword, containerClassName = '', wrapperClassName = '', type = 'text', ...props }, ref) => {
    const [isSecure, setIsSecure] = useState(isPassword);

    const inputType = isPassword ? (isSecure ? 'password' : 'text') : type;

    return (
      <div className={`w-full mb-4 ${containerClassName}`}>
        <div
          className={`flex w-full h-[60px] items-center rounded-[30px] border-[0.7px] bg-[#0F2B36] px-[30px] transition-colors focus-within:border-[#75ADAF] ${
            error ? 'border-[#E74C3C]' : 'border-[#DEDEDE]'
          } ${wrapperClassName}`}
        >
          <input
            ref={ref}
            type={inputType}
            className={`flex-1 h-full bg-transparent text-[#FAFAFA] placeholder-[#DEDEDE] text-base outline-none border-none focus:ring-0 [&:-webkit-autofill]:[transition-delay:9999s] [&:-webkit-autofill]:[-webkit-text-fill-color:#FAFAFA] [&:-webkit-autofill]:[box-shadow:0_0_0_30px_#0F2B36_inset] ${className}`}
            {...props}
          />
          {isPassword && (
            <button
              type="button"
              onClick={() => setIsSecure(!isSecure)}
              className="ml-2.5 flex items-center justify-center text-[#FAFAFA] hover:text-[#75ADAF] focus:outline-none transition-colors"
            >
              {isSecure ? <EyeOff size={20} /> : <Eye size={20} />}
            </button>
          )}
        </div>
        {error && (
          <p className="text-[#E74C3C] text-xs mt-1 ml-5 font-sans">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
