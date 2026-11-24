/**
 * Inline field error. `data-field-error` lets scrollToFirstError()
 * (lib/forms/scroll-to-first-error.ts) find and focus the first invalid field.
 */
export function FieldError({
  message,
  id,
  className = "text-[11px] text-red-500 mt-0.5 text-right",
}: {
  message?: string | null;
  id?: string;
  className?: string;
}) {
  if (!message) return null;
  return (
    <p id={id} role="alert" data-field-error="" className={className}>
      {message}
    </p>
  );
}
