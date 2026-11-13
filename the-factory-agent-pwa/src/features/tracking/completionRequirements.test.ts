import { describe, expect, it } from 'vitest';

import {
  resolveCompletionRequirements,
  validateCompletionRequirements,
} from './completionRequirements';

describe('resolveCompletionRequirements', () => {
  it('does not require photos by default', () => {
    const req = resolveCompletionRequirements({
      requiredActions: [],
      minimumPhotosRequired: 0,
      visitVerificationRequired: false,
    });
    expect(req.minPhotos).toBe(0);
    expect(req.notesRequired).toBe(false);
    expect(req.hasConfiguredRequirements).toBe(false);
  });

  it('keeps the configured photo count as a suggestion', () => {
    const req = resolveCompletionRequirements({
      requiredActions: ['Take meter reading'],
      minimumPhotosRequired: 3,
      visitVerificationRequired: true,
    });
    expect(req.minPhotos).toBe(3);
    expect(req.notesRequired).toBe(true);
    expect(req.hasConfiguredRequirements).toBe(true);
  });
});

describe('validateCompletionRequirements', () => {
  const requirements = resolveCompletionRequirements({
    requiredActions: ['Inspect site'],
    minimumPhotosRequired: 2,
    visitVerificationRequired: false,
  });

  it('passes without photos when the note is present', () => {
    const result = validateCompletionRequirements({
      photosCount: 0,
      notes: 'Inspected and sealed.',
      requirements,
    });
    expect(result.ok).toBe(true);
    expect(result.photoError).toBeUndefined();
  });

  it('still asks for a note when required actions are set', () => {
    expect(
      validateCompletionRequirements({
        photosCount: 2,
        notes: '',
        requirements,
      }).ok,
    ).toBe(false);
  });
});
