"use client";

import PhoneInput from "react-phone-number-input";

type Variant = "default" | "compact" | "dark" | "enterprise";

interface PhoneNumberInputProps {
  value: string | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  defaultCountry?: string;
  variant?: Variant;
  className?: string;
  disabled?: boolean;
}

const variantClassName: Record<Variant, string> = {
  default: "phone-input-default",
  compact: "phone-input-compact",
  dark: "phone-input-dark",
  enterprise: "phone-input-enterprise w-full h-[60px] rounded-full border shadow-[0px_1px_2px_0px_#0000004D] text-xs outline-none transition-colors",
};

export default function PhoneNumberInput({
  value,
  onChange,
  placeholder = "Phone Number",
  defaultCountry = "GB",
  variant = "default",
  className,
  disabled,
}: PhoneNumberInputProps) {
  return (
    <PhoneInput
      international
      defaultCountry={defaultCountry as never}
      countryCallingCodeEditable={false}
      placeholder={placeholder}
      value={value || undefined}
      onChange={(next) => onChange(next ?? "")}
      disabled={disabled}
      className={`${variantClassName[variant]}${className ? ` ${className}` : ""}`}
    />
  );
}
