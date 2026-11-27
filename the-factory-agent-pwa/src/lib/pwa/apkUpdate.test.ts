import { beforeEach, describe, expect, it } from 'vitest';
import { isApkUpdateAvailable, isSnoozed, snooze, SNOOZE_MS } from './apkUpdate';

describe('APK update check', () => {
  it('offers an update only when the installed build is older than the published one', () => {
    expect(isApkUpdateAvailable('5', 7)).toBe(true);
    expect(isApkUpdateAvailable(7, 7)).toBe(false);
    expect(isApkUpdateAvailable('8', 7)).toBe(false); // a newer test build
  });

  it('stays quiet when the installed version is unknown', () => {
    expect(isApkUpdateAvailable(undefined, 7)).toBe(false);
    expect(isApkUpdateAvailable('', 7)).toBe(false);
    expect(isApkUpdateAvailable('abc', 7)).toBe(false);
  });

  describe('Later', () => {
    beforeEach(() => localStorage.clear());

    it('hides the banner for a day', () => {
      const now = 1_000_000;
      expect(isSnoozed(now)).toBe(false);
      snooze(now);
      expect(isSnoozed(now + SNOOZE_MS - 1)).toBe(true);
      expect(isSnoozed(now + SNOOZE_MS + 1)).toBe(false);
    });
  });
});
