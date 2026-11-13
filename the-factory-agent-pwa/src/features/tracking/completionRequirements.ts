import type { Task } from '@/features/tasks/types';

export type CompletionRequirements = {
  requiredActions: string[];
  /** Suggested photo count from the task. A hint only; never blocks completion. */
  minPhotos: number;
  notesRequired: boolean;
  visitVerificationRequired: boolean;
  /** True when create-time requirements should surface aggressively (auto-open). */
  hasConfiguredRequirements: boolean;
};

export function resolveCompletionRequirements(
  task: Pick<
    Task,
    'requiredActions' | 'minimumPhotosRequired' | 'visitVerificationRequired'
  > | null | undefined,
): CompletionRequirements {
  const requiredActions = task?.requiredActions ?? [];
  const configuredMin = task?.minimumPhotosRequired ?? 0;
  const visitVerificationRequired = Boolean(task?.visitVerificationRequired);
  const hasConfiguredRequirements =
    requiredActions.length > 0 || configuredMin > 0 || visitVerificationRequired;

  return {
    requiredActions,
    minPhotos: configuredMin,
    notesRequired: requiredActions.length > 0,
    visitVerificationRequired,
    hasConfiguredRequirements,
  };
}

export function validateCompletionRequirements(input: {
  photosCount: number;
  notes: string;
  requirements: CompletionRequirements;
}): { ok: boolean; photoError?: string; notesError?: string } {
  // Photos are optional, so the photo count never blocks completion.
  const { notes, requirements } = input;
  const photoError: string | undefined = undefined;
  let notesError: string | undefined;

  if (requirements.notesRequired && !notes.trim()) {
    notesError = 'Add a completion note covering the required actions.';
  }

  return {
    ok: !photoError && !notesError,
    photoError,
    notesError,
  };
}
