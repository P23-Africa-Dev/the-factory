import type { Task } from '@/features/tasks/types';

export type CompletionRequirements = {
  requiredActions: string[];
  /** API tracked-complete requires ≥1 file; honor task minimum when higher. */
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
    minPhotos: Math.max(1, configuredMin),
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
  const { photosCount, notes, requirements } = input;
  let photoError: string | undefined;
  let notesError: string | undefined;

  if (photosCount < requirements.minPhotos) {
    photoError = `Attach at least ${requirements.minPhotos} photo${requirements.minPhotos === 1 ? '' : 's'}.`;
  }
  if (requirements.notesRequired && !notes.trim()) {
    notesError = 'Add a completion note covering the required actions.';
  }

  return {
    ok: !photoError && !notesError,
    photoError,
    notesError,
  };
}
