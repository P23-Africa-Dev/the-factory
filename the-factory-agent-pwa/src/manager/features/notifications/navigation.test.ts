import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { NotificationPanel } from './components/NotificationPanel';
import type { AppNotification } from './types';

const mocks = vi.hoisted(() => ({
  push: vi.fn(), markRead: vi.fn(), close: vi.fn(), refetch: vi.fn(),
  notification: {} as AppNotification,
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('./queries', () => ({
  useNotifications: () => ({ data: { pages: [{ items: [mocks.notification] }] }, refetch: mocks.refetch }),
  useUnreadCount: () => ({ count: 1, refetch: mocks.refetch }),
  useMarkRead: () => ({ mutate: mocks.markRead }),
  useMarkAllRead: () => ({ mutate: vi.fn() }),
  useDeleteNotification: () => ({ mutate: vi.fn() }),
}));

beforeEach(() => {
  mocks.notification = {
    id: 1, type: 'crm.lead_created', category: 'crm', priority: 'high',
    title: 'New CRM lead created', message: "Lead 'Andrea Massa' has been created.",
    referenceType: 'App\\Models\\Crm\\Lead', referenceId: 42,
    actionUrl: '/crm/leads/42', metadata: { lead_id: 42 },
    isRead: false, createdAt: new Date().toISOString(),
  } as unknown as AppNotification;
});

it.each([
  { actionUrl: '/crm/leads/42', metadata: { lead_id: 42 } },
  { actionUrl: '/crm', metadata: { lead_id: 42 } },
  { actionUrl: 'https://dashboard.example.com/crm/leads/42', metadata: { lead_id: '42' } },
  { actionUrl: null, metadata: null },
])('opens the lead from a notification with %j', (overrides) => {
  Object.assign(mocks.notification, overrides);
  render(React.createElement(NotificationPanel, { open: true, onClose: mocks.close }));
  fireEvent.click(screen.getByText('New CRM lead created'));
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/crm/leads/42');
  expect(mocks.markRead).toHaveBeenCalledWith([1]);
  expect(mocks.close).toHaveBeenCalledOnce();
});

it('preserves task notification routing', () => {
  Object.assign(mocks.notification, { type: 'task.created', category: 'task', actionUrl: '/tasks/7' });
  render(React.createElement(NotificationPanel, { open: true, onClose: mocks.close }));
  fireEvent.click(screen.getByText('New CRM lead created'));
  expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/task/7');
});
