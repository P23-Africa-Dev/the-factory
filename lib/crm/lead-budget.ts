/** Currencies offered when entering a lead's budget. */
export const LEAD_BUDGET_CURRENCIES = [
  { code: "GBP", label: "GBP (£)" },
  { code: "USD", label: "USD ($)" },
  { code: "EUR", label: "EUR (€)" },
  { code: "NGN", label: "NGN (₦)" },
  { code: "KES", label: "KES (KSh)" },
  { code: "GHS", label: "GHS (GH₵)" },
  { code: "ZAR", label: "ZAR (R)" },
  { code: "JPY", label: "JPY (¥)" },
  { code: "CAD", label: "CAD (C$)" },
  { code: "AUD", label: "AUD (A$)" },
] as const;

/** An ISO instant as the value a `datetime-local` input expects (local time). */
export function toDateTimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A `datetime-local` input value back to an ISO instant, or null when empty/invalid. */
export function fromDateTimeLocalValue(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
