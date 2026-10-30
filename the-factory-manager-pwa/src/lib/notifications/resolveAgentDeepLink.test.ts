import { describe, expect, it } from 'vitest';
import { resolveAgentDeepLink } from './resolveAgentDeepLink';

describe('resolveAgentDeepLink', () => {
  it('maps task detail paths to singular /task/:id', () => {
    expect(resolveAgentDeepLink('/tasks/42')).toBe('/task/42');
    expect(resolveAgentDeepLink('/tasks/42/edit')).toBe('/task/42');
    expect(resolveAgentDeepLink('/agent/tasks/7')).toBe('/task/7');
  });

  it('maps field-activity and attendance dashboard urls', () => {
    expect(resolveAgentDeepLink('/agent/field-activity')).toBe('/field-activity');
    expect(resolveAgentDeepLink('/agent/field-activity?inbox=1')).toBe(
      '/field-activity?inbox=1',
    );
    expect(resolveAgentDeepLink('/agent/operations/attendance')).toBe('/');
    expect(resolveAgentDeepLink('/operations/attendance')).toBe('/');
  });

  it('keeps known agent routes and map query strings', () => {
    expect(resolveAgentDeepLink('/map?taskId=9')).toBe('/map?taskId=9');
    expect(resolveAgentDeepLink('/crm/leads/3')).toBe('/crm/leads/3');
    expect(resolveAgentDeepLink('/meetings/5')).toBe('/meetings/5');
    expect(resolveAgentDeepLink('/tasks')).toBe('/tasks');
    expect(resolveAgentDeepLink('/assistant')).toBe('/assistant');
  });

  it('falls back to home for unknown / empty urls instead of 404 paths', () => {
    expect(resolveAgentDeepLink(null)).toBe('/');
    expect(resolveAgentDeepLink('')).toBe('/');
    expect(resolveAgentDeepLink('/dashboard')).toBe('/');
    expect(resolveAgentDeepLink('/payroll')).toBe('/');
    expect(resolveAgentDeepLink('/projects/1')).toBe('/');
    expect(resolveAgentDeepLink('/notifications')).toBe('/');
    expect(resolveAgentDeepLink('/insight')).toBe('/');
  });

  it('normalizes relative paths without a leading slash', () => {
    expect(resolveAgentDeepLink('tasks/12')).toBe('/task/12');
  });
});
