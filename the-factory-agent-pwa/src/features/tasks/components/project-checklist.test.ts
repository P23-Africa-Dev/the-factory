import { createElement } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ProjectChecklist, useChecklistTasks, type ChecklistTask } from './ProjectChecklist';

vi.mock('@/features/auth/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 4, name: 'Assigned Agent', company_id: 3 } }),
}));

it('lets an assignee complete and reopen a demo checklist without giving them creator controls', () => {
  const task: ChecklistTask = {
    id: 'preview-1',
    companyId: 3,
    creatorId: '8',
    assignedAgentId: 4,
    status: 'pending',
    dueDate: null,
  };

  function Preview({ current }: { current: ChecklistTask }) {
    const { items } = useChecklistTasks([current]);
    return createElement('div', null,
      createElement('output', null, items[0].status),
      createElement(ProjectChecklist, { task: items[0] }),
    );
  }

  const view = render(createElement(Preview, { current: task }));
  fireEvent.click(screen.getByRole('button', { name: 'Load demo checklist' }));
  expect(screen.queryByRole('button', { name: 'Add Subtask' })).toBeNull();

  const steps = screen.getAllByRole('checkbox');
  fireEvent.click(steps[0]);
  expect(screen.getByText('in_progress')).toBeTruthy();
  fireEvent.click(steps[1]);
  fireEvent.click(steps[2]);
  expect(screen.getByText('completed')).toBeTruthy();
  fireEvent.click(steps[2]);
  expect(screen.getByText('in_progress')).toBeTruthy();

  view.rerender(createElement(Preview, { current: { ...task, status: 'cancelled' } }));
  expect(screen.getByText('cancelled')).toBeTruthy();
  screen.getAllByRole('checkbox').forEach((checkbox) => expect((checkbox as HTMLInputElement).disabled).toBe(true));
});
