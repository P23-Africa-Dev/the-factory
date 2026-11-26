import { describe, expect, it } from 'vitest';
import { decideSession } from './sessionVault';

const tommy = { token: 'tok-tommy', user: '{"name":"Tommy"}' };

describe('decideSession', () => {
  it('restores the newer native sign-in when localStorage rolled back to an old one', () => {
    // localStorage came back with John's old session (no timestamp, written before the fix).
    expect(decideSession({ token: 'tok-john-old', savedAt: 0 }, { session: tommy, savedAt: 2_000, loggedOutAt: 0 })).toEqual({
      kind: 'vault',
      session: tommy,
    });
    // …or with an older timestamped session.
    expect(decideSession({ token: 'tok-john-old', savedAt: 1_000 }, { session: tommy, savedAt: 2_000, loggedOutAt: 0 }).kind).toBe('vault');
  });

  it('does not resurrect a session the user signed out of', () => {
    expect(decideSession({ token: 'tok-john-old', savedAt: 1_000 }, { session: null, savedAt: 0, loggedOutAt: 3_000 })).toEqual({
      kind: 'signed_out',
    });
  });

  it('keeps localStorage when it is as new or newer, or when there is no native copy', () => {
    expect(decideSession({ token: 'tok-tommy', savedAt: 2_000 }, { session: tommy, savedAt: 2_000, loggedOutAt: 0 }).kind).toBe('local');
    expect(decideSession({ token: 'tok-new', savedAt: 5_000 }, { session: tommy, savedAt: 2_000, loggedOutAt: 0 }).kind).toBe('local');
    expect(decideSession({ token: 'tok-x', savedAt: 0 }, null).kind).toBe('local');
    expect(decideSession({ token: 'tok-x', savedAt: 0 }, { session: null, savedAt: 0, loggedOutAt: 0 }).kind).toBe('local');
  });

  it('is a no-op when already signed out locally and the vault also says signed out', () => {
    expect(decideSession({ token: null, savedAt: 0 }, { session: null, savedAt: 0, loggedOutAt: 3_000 }).kind).toBe('local');
  });
});
