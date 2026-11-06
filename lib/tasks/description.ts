/** Mirrors backend rules in CreateTaskRequest / CreateSelfTaskRequest. */
export const TASK_DESCRIPTION_MIN_LENGTH = 10;
export const TASK_DESCRIPTION_MAX_LENGTH = 5000;

export const TASK_DESCRIPTION_REQUIRED_MESSAGE = "Task description is required.";

/** Returns an error message, or null when the description is valid. */
export function validateTaskDescription(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return TASK_DESCRIPTION_REQUIRED_MESSAGE;
  if (trimmed.length < TASK_DESCRIPTION_MIN_LENGTH) {
    return `Task description must be at least ${TASK_DESCRIPTION_MIN_LENGTH} characters.`;
  }
  if (trimmed.length > TASK_DESCRIPTION_MAX_LENGTH) {
    return `Task description may not be longer than ${TASK_DESCRIPTION_MAX_LENGTH} characters.`;
  }
  return null;
}
