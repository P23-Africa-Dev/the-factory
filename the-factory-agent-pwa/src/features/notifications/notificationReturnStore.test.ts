import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearNotificationReturn,
  consumeNotificationReturn,
  saveNotificationReturn,
  trackNotificationReturnPath,
} from './notificationReturnStore';

describe('notificationReturnStore', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('re-opens notifications when returning to origin path after visiting target', () => {
    saveNotificationReturn('/manager', '/manager/task/7');
    // Still on origin before route transitions: should not consume yet
    expect(consumeNotificationReturn('/manager')).toBe(false);

    // Reached destination
    trackNotificationReturnPath('/manager/task/7');

    // Returned to origin (via router.back or Link href="/manager")
    expect(consumeNotificationReturn('/manager')).toBe(true);
    // Consumed once — does not re-trigger
    expect(consumeNotificationReturn('/manager')).toBe(false);
  });

  it('clears return marker when user navigates to an unrelated page instead of going back', () => {
    saveNotificationReturn('/', '/crm/leads/42');
    trackNotificationReturnPath('/crm/leads/42');

    // User navigates to /map instead of going back to /
    trackNotificationReturnPath('/map');

    expect(consumeNotificationReturn('/')).toBe(false);
  });

  it('does not set return marker for same-page notifications', () => {
    saveNotificationReturn('/', '/?section=attendance');
    trackNotificationReturnPath('/');
    expect(consumeNotificationReturn('/')).toBe(false);
  });

  it('supports explicit clear on drawer close', () => {
    saveNotificationReturn('/manager', '/manager/workforce');
    trackNotificationReturnPath('/manager/workforce');
    clearNotificationReturn();
    expect(consumeNotificationReturn('/manager')).toBe(false);
  });
});
