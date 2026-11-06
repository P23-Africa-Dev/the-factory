import { describe, expect, it } from 'vitest';

import {
  resolveCompletionRequirements,
  validateCompletionRequirements,
} from './completionRequirements';

describe('resolveCompletionRequirements', () => {
  it('defaults to at least one photo', () => {
    const req = resolveCompletionRequirements({
      requiredActions: [],
      minimumPhotosRequired: 0,
      visitVerificationRequired: false,
    });
    expect(req.minPhotos).toBe(1);
    expect(req.notesRequired).toBe(false);
    expect(req.hasConfiguredRequirements).toBe(false);
  });

  it('honors configured minimum photos and required actions', () => {
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

  it('fails when photos or notes are missing', () => {
    expect(
      validateCompletionRequirements({
        photosCount: 1,
        notes: '',
        requirements,
      }).ok,
    ).toBe(false);
  });

  it('passes when min photos and notes are satisfied', () => {
    expect(
      validateCompletionRequirements({
        photosCount: 2,
        notes: 'Inspected and sealed.',
        requirements,
      }).ok,
    ).toBe(true);
  });
});
