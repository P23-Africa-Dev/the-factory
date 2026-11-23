import { describe, expect, it } from 'vitest';
import {
  buildOpenNotificationUrl,
  parseOpenNotificationParam,
  resolveNotificationTarget,
  resolveNotificationTargetFromPayload,
  type NotificationTargetSource,
} from './notificationTarget';

/** Real payload shapes emitted by the Laravel notification services. */
const cases: Array<{
  name: string;
  source: NotificationTargetSource;
  agent: string;
  manager: string;
}> = [
  {
    name: 'task assigned',
    source: { type: 'task.assigned', actionUrl: '/tasks/12', referenceType: 'App\\Models\\Task', referenceId: 12, metadata: { task_id: 12 } },
    agent: '/task/12',
    manager: '/manager/task/12',
  },
  {
    name: 'task status changed',
    source: { type: 'task.status_changed', actionUrl: '/tasks/12', referenceType: 'App\\Models\\Task', referenceId: 12 },
    agent: '/task/12',
    manager: '/manager/task/12',
  },
  {
    name: 'scheduled task reminder',
    source: { type: 'task.due_soon', actionUrl: '/tasks/31', actionRoute: 'tasks.show', referenceType: 'App\\Models\\Task', referenceId: 31 },
    agent: '/task/31',
    manager: '/manager/task/31',
  },
  {
    name: 'reassignment requested',
    source: {
      type: 'task.reassignment_requested',
      actionUrl: '/tasks/reassignments/inbox',
      referenceType: 'App\\Models\\TaskReassignment',
      referenceId: 4,
      metadata: { task_id: 12, reassignment_id: 4 },
    },
    agent: '/task/12',
    manager: '/manager/tasks?tab=reassignments',
  },
  {
    name: 'reassignment accepted',
    source: {
      type: 'task.reassignment_accepted',
      actionUrl: '/tasks/12',
      referenceType: 'App\\Models\\TaskReassignment',
      referenceId: 4,
      metadata: { task_id: 12, reassignment_id: 4 },
    },
    agent: '/task/12',
    manager: '/manager/task/12',
  },
  {
    name: 'lead created (canonical id beats list url)',
    source: { type: 'crm.lead_created', actionUrl: '/crm', referenceType: 'App\\Models\\Crm\\Lead', referenceId: 42, metadata: { lead_id: 42 } },
    agent: '/crm/leads/42',
    manager: '/manager/crm/leads/42',
  },
  {
    name: 'lead import finished',
    source: { type: 'crm.leads_imported', actionUrl: '/crm/leads', metadata: { created: 3 } },
    agent: '/crm/leads',
    manager: '/manager/crm/leads',
  },
  {
    name: 'meeting updated (dashboard url, meeting id in metadata)',
    source: { type: 'meeting.updated', actionUrl: '/dashboard', referenceType: 'App\\Models\\Meeting', referenceId: 9, metadata: { meeting_id: 9 } },
    agent: '/meetings/9',
    manager: '/manager/meetings/9',
  },
  {
    name: 'meeting deleted',
    source: { type: 'meeting.deleted', actionUrl: '/dashboard', referenceType: 'App\\Models\\Meeting', referenceId: 9, metadata: { meeting_id: 9 } },
    agent: '/meetings',
    manager: '/manager/meetings',
  },
  {
    name: 'tracking alert keeps the focused map',
    source: { type: 'tracking.arrived', actionUrl: '/map?taskId=12', referenceType: 'App\\Models\\Task', referenceId: 12 },
    agent: '/map?taskId=12',
    manager: '/manager/map?taskId=12',
  },
  {
    name: 'field activity pending review',
    source: { type: 'field_activity.pending_review', actionUrl: '/agent/field-activity?inbox=1', referenceType: 'App\\Models\\FieldDailySummary', referenceId: 2 },
    agent: '/field-activity?inbox=1',
    manager: '/manager/field-activity',
  },
  {
    name: 'long stationary alert',
    source: { type: 'field_activity.long_stationary', actionUrl: '/insight', referenceType: 'App\\Models\\FieldStop', referenceId: 5 },
    agent: '/field-activity',
    manager: '/manager/field-activity',
  },
  {
    name: 'missed visit',
    source: { type: 'field_activity.missed_visit', actionUrl: '/insight', referenceType: 'App\\Models\\Task', referenceId: 12, metadata: { task_id: 12 } },
    agent: '/task/12',
    manager: '/manager/task/12',
  },
  {
    name: 'attendance',
    source: { type: 'attendance.clock_in_reminder', actionUrl: '/agent/operations/attendance', referenceType: 'App\\Models\\AttendanceRecord', referenceId: 3 },
    agent: '/',
    manager: '/manager/workforce',
  },
  {
    name: 'payroll',
    source: { type: 'payroll.status', actionUrl: '/payroll', referenceType: 'App\\Models\\User', referenceId: 3 },
    agent: '/',
    manager: '/manager/payroll',
  },
  {
    name: 'daily plan',
    source: { type: 'daily_plan.ready', actionUrl: '/assistant' },
    agent: '/assistant',
    manager: '/manager/assistant',
  },
  {
    name: 'project',
    source: { type: 'project.due_soon', actionUrl: '/projects/3', referenceType: 'App\\Models\\Project', referenceId: 3 },
    agent: '/',
    manager: '/manager/tasks?tab=projects',
  },
  {
    name: 'no url at all',
    source: { type: 'system.announcement' },
    agent: '/',
    manager: '/manager',
  },
];

describe('resolveNotificationTarget', () => {
  it.each(cases)('$name → agent', ({ source, agent }) => {
    expect(resolveNotificationTarget(source, { mode: 'agent' })).toBe(agent);
  });

  it.each(cases)('$name → manager', ({ source, manager }) => {
    expect(resolveNotificationTarget(source, { mode: 'manager' })).toBe(manager);
  });

  it('never leaves the app for absolute dashboard urls', () => {
    expect(
      resolveNotificationTarget(
        { type: 'task.assigned', actionUrl: 'https://dashboard.example.com/tasks/5' },
        { mode: 'agent' },
      ),
    ).toBe('/task/5');
  });
});

describe('resolveNotificationTargetFromPayload', () => {
  it('reads FCM data where every value is a string', () => {
    const fcmData = {
      notification_id: '99',
      type: 'meeting.created',
      category: 'system',
      raw_action_url: '/dashboard',
      action_url: '/',
      action_route: 'dashboard',
      reference_type: 'App\\Models\\Meeting',
      reference_id: '17',
      task_id: '',
      lead_id: '',
      meeting_id: '17',
      title: 'Meeting scheduled',
      body: 'x',
    };
    expect(resolveNotificationTargetFromPayload(fcmData, { mode: 'agent' })).toBe('/meetings/17');
    expect(resolveNotificationTargetFromPayload(fcmData, { mode: 'manager' })).toBe('/manager/meetings/17');
  });

  it('prefers the raw action url over the agent-mapped one', () => {
    const webPush = { type: 'task.status_changed', action_url: '/task/5', raw_action_url: '/tasks/5' };
    expect(resolveNotificationTargetFromPayload(webPush, { mode: 'manager' })).toBe('/manager/task/5');
  });

  it('still routes payloads from older backends that only send action_url', () => {
    expect(resolveNotificationTargetFromPayload({ action_url: '/task/5' }, { mode: 'agent' })).toBe('/task/5');
    expect(resolveNotificationTargetFromPayload({ action_url: '/task/5' }, { mode: 'manager' })).toBe('/manager/task/5');
  });

  it('accepts already-resolved local alert urls', () => {
    expect(resolveNotificationTargetFromPayload({ url: '/map?taskId=3' }, { mode: 'agent' })).toBe('/map?taskId=3');
    expect(resolveNotificationTargetFromPayload({ url: '/map?taskId=3' }, { mode: 'manager' })).toBe('/manager/map?taskId=3');
  });

  it('parses JSON-string metadata', () => {
    expect(
      resolveNotificationTargetFromPayload({ type: 'crm.lead_assigned', metadata: '{"lead_id":8}' }, { mode: 'agent' }),
    ).toBe('/crm/leads/8');
  });
});

describe('open-notification url', () => {
  it('round-trips the payload', () => {
    const payload = { notification_id: 5, type: 'task.assigned', raw_action_url: '/tasks/5?x=1&y=2' };
    const url = buildOpenNotificationUrl(payload);
    expect(url.startsWith('/open-notification?d=')).toBe(true);
    const param = new URL(url, 'https://app.test').searchParams.get('d');
    expect(parseOpenNotificationParam(param)).toEqual(payload);
  });

  it('tolerates garbage', () => {
    expect(parseOpenNotificationParam('not-json')).toBeNull();
    expect(parseOpenNotificationParam(null)).toBeNull();
  });
});
