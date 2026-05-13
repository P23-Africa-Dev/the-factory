"use client";

import PhoneInput from "react-phone-number-input";

type Variant = "default" | "compact" | "dark";

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
};

export default function PhoneNumberInput({
  value,
  onChange,
  placeholder = "Phone Number",
  defaultCountry = "NG",
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
