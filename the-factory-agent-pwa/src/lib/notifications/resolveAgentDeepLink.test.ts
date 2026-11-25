import { describe, expect, it } from 'vitest';
import { resolveAgentDeepLink } from './resolveAgentDeepLink';

describe('resolveAgentDeepLink (agent)', () => {
  const agent = (url: string | null) => resolveAgentDeepLink(url, { mode: 'agent' });

  it('maps task detail paths to singular /task/:id', () => {
    expect(agent('/tasks/42')).toBe('/task/42');
    expect(agent('/tasks/42/edit')).toBe('/task/42');
    expect(agent('/agent/tasks/7')).toBe('/task/7');
    expect(agent('/task/9/tracking')).toBe('/task/9/tracking');
  });

  it('maps field-activity and attendance dashboard urls', () => {
    expect(agent('/agent/field-activity')).toBe('/field-activity');
    expect(agent('/agent/field-activity?inbox=1')).toBe('/field-activity?inbox=1');
    expect(agent('/agent/operations/attendance')).toBe('/?section=attendance');
    expect(agent('/operations/attendance')).toBe('/?section=attendance');
  });

  it('keeps known agent routes and map query strings', () => {
    expect(agent('/map?taskId=9')).toBe('/map?taskId=9');
    expect(agent('/crm/leads/3')).toBe('/crm/leads/3');
    expect(agent('/meetings/5')).toBe('/meetings/5');
    expect(agent('/tasks')).toBe('/tasks');
    expect(agent('/assistant')).toBe('/assistant');
  });

  it('never produces a route that does not exist', () => {
    expect(agent('/crm/pipeline/settings')).toBe('/crm');
    expect(agent('/meetings/abc')).toBe('/meetings');
    expect(agent('/field-activity/unknown')).toBe('/field-activity');
    expect(agent('/tasks/reassignments/inbox')).toBe('/tasks');
    expect(agent('/settings/crm')).toBe('/');
    expect(agent('/tasks.show')).toBe('/');
  });

  it('maps manager-prefixed urls back onto agent routes', () => {
    expect(agent('/manager/crm/leads/4')).toBe('/crm/leads/4');
  });

  it('falls back to home for unknown / empty urls instead of 404 paths', () => {
    expect(agent(null)).toBe('/');
    expect(agent('')).toBe('/');
    expect(agent('/dashboard')).toBe('/');
    expect(agent('/payroll')).toBe('/');
    expect(agent('/projects/1')).toBe('/');
    expect(agent('/notifications')).toBe('/');
    expect(agent('/insight')).toBe('/');
  });

  it('normalizes relative paths without a leading slash', () => {
    expect(agent('tasks/12')).toBe('/task/12');
  });

  it('maps absolute dashboard urls into the app when absolute links are disallowed', () => {
    expect(
      resolveAgentDeepLink('https://dashboard.thefactory23.com/tasks/12', {
        mode: 'agent',
        allowAbsolute: false,
      }),
    ).toBe('/task/12');
  });
});

describe('resolveAgentDeepLink (manager)', () => {
  const manager = (url: string | null) => resolveAgentDeepLink(url, { mode: 'manager' });

  it('opens task details under /manager', () => {
    expect(manager('/tasks/42')).toBe('/manager/task/42');
    expect(manager('/task/42')).toBe('/manager/task/42');
    expect(manager('/manager/task/42')).toBe('/manager/task/42');
    expect(manager('/tasks/reassignments/inbox')).toBe('/manager/tasks?tab=reassignments');
    expect(manager('/projects/3')).toBe('/manager/tasks?tab=projects');
  });

  it('maps CRM, meetings, map and field activity', () => {
    expect(manager('/crm/leads/8')).toBe('/manager/crm/leads/8');
    expect(manager('/crm/leads')).toBe('/manager/crm/leads');
    expect(manager('/meetings/5')).toBe('/manager/meetings/5');
    expect(manager('/map?taskId=9')).toBe('/manager/map?taskId=9');
    expect(manager('/insight')).toBe('/manager/field-activity');
    expect(manager('/agent/field-activity?inbox=1')).toBe('/manager/field-activity');
  });

  it('maps workforce areas', () => {
    expect(manager('/operations/attendance')).toBe('/manager/workforce');
    expect(manager('/payroll')).toBe('/manager/payroll');
    expect(manager('/user/profile')).toBe('/manager/profile');
  });

  it('falls back to the manager home', () => {
    expect(manager(null)).toBe('/manager');
    expect(manager('/dashboard')).toBe('/manager');
    expect(manager('/enterprise/onboarding')).toBe('/manager');
  });
});

describe('resolveAgentDeepLink (Company Drive)', () => {
  it('opens the agent Drive screen and keeps ?file=', () => {
    const agent = (url: string) => resolveAgentDeepLink(url, { mode: 'agent' });
    expect(agent('/agent/drive?file=12')).toBe('/drive?file=12');
    expect(agent('/drive?file=12')).toBe('/drive?file=12');
    expect(agent('/agent/drive')).toBe('/drive');
  });

  it('opens the manager Drive screen and keeps ?file=', () => {
    const manager = (url: string) => resolveAgentDeepLink(url, { mode: 'manager' });
    expect(manager('/drive?file=12')).toBe('/manager/drive?file=12');
    expect(manager('/manager/drive?file=3')).toBe('/manager/drive?file=3');
    expect(
      resolveAgentDeepLink('https://app.factory23.com/drive?file=9', { mode: 'manager', allowAbsolute: false }),
    ).toBe('/manager/drive?file=9');
  });
});
