/** Mirrors backend rules in CreateTaskRequest / CreateSelfTaskRequest. */
export const TASK_DESCRIPTION_MAX_LENGTH = 5000;

/**
 * Description is optional. Returns an error message only when it is too long,
 * or null when the description is valid.
 */
export function validateTaskDescription(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed.length > TASK_DESCRIPTION_MAX_LENGTH) {
    return `Task description may not be longer than ${TASK_DESCRIPTION_MAX_LENGTH} characters.`;
  }
  return null;
}
