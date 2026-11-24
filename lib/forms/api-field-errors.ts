/**
 * Map a Laravel 422 error payload (`{ errors: { field: [messages] } }`) to
 * form field keys, keeping the first message per field.
 *
 *   mapApiFieldErrors(err, { full_name: "name", base_salary: "salary" })
 *
 * Keys not in `keyMap` are kept as-is (so dot keys like `contacts.0.email` or
 * `custom_fields.industry` pass through for callers that handle them).
 */
export function mapApiFieldErrors<K extends string = string>(
  err: unknown,
  keyMap: Record<string, K> = {},
): Partial<Record<K | string, string>> {
  const errors = (err as { errors?: Record<string, unknown> | null } | null)?.errors;
  if (!errors || typeof errors !== "object") return {};

  const out: Partial<Record<K | string, string>> = {};
  for (const [apiKey, value] of Object.entries(errors)) {
    const message = Array.isArray(value) ? value[0] : value;
    if (typeof message !== "string" || message === "") continue;
    const formKey = keyMap[apiKey] ?? apiKey;
    if (out[formKey] === undefined) out[formKey] = message;
  }
  return out;
}

/** True when the error is a validation error that maps onto form fields. */
export function hasApiFieldErrors(err: unknown): boolean {
  const errors = (err as { errors?: Record<string, unknown> | null } | null)?.errors;
  return Boolean(errors && typeof errors === "object" && Object.keys(errors).length > 0);
}
