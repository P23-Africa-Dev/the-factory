import { describe, expect, it } from 'vitest';

import { isTrackingAlreadyActiveError } from './errors';

describe('isTrackingAlreadyActiveError', () => {
  it('recognises the signed-in user\'s own running session', () => {
    expect(
      isTrackingAlreadyActiveError({ message: 'The given data was invalid.', errors: { tracking: ['Tracking is already active for this task.'] } }),
    ).toBe(true);
  });

  it('does not treat a co-assignee\'s session as the user\'s own', () => {
    // Resuming here would take over someone else's tracking session.
    expect(
      isTrackingAlreadyActiveError({
        message: 'The given data was invalid.',
        errors: { tracking: ['Ada Lovelace is tracking this task right now. Only one person can track it at a time.'] },
      }),
    ).toBe(false);
  });
});
