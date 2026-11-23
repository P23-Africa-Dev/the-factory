import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ActionReceipts, receiptHref, receiptsFromPayload } from './ActionReceipts';

describe('receiptHref', () => {
  it('maps web links to the matching mobile screens', () => {
    expect(receiptHref('/crm/leads/12', 'agent')).toBe('/crm/leads/12');
    expect(receiptHref('/crm/leads/12', 'manager')).toBe('/manager/crm/leads/12');
    expect(receiptHref('/agent/crm/leads/7', 'agent')).toBe('/crm/leads/7');
    expect(receiptHref('/tasks/5', 'manager')).toBe('/manager/task/5');
    expect(receiptHref('/tasks', 'agent')).toBe('/tasks');
    expect(receiptHref('/crm', 'manager')).toBe('/manager/crm');
  });

  it('returns null for pages the mobile app does not have', () => {
    expect(receiptHref('/projects/3', 'manager')).toBeNull();
    expect(receiptHref('/drive', 'agent')).toBeNull();
  });
});

describe('ActionReceipts', () => {
  it('reads receipts from the payload and ignores malformed ones', () => {
    const receipts = receiptsFromPayload({
      receipts: [{ tool: 'crm.create_lead', summary: 'Lead created' }, { tool: 'x' }, null],
    });
    expect(receipts).toHaveLength(1);
    expect(receiptsFromPayload(null)).toEqual([]);
  });

  it('shows Open and Undo, and marks the receipt undone', async () => {
    const onUndo = vi.fn().mockResolvedValue(true);
    render(
      <ActionReceipts
        area="manager"
        onUndo={onUndo}
        receipts={[
          { tool: 'crm.create_lead', summary: "Lead 'Acme' was created.", link: '/crm/leads/9', audit_id: 4, undo_label: 'Undo' },
        ]}
      />,
    );

    expect(screen.getByText('Open').closest('a')?.getAttribute('href')).toBe('/manager/crm/leads/9');
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(screen.getByText('Undone')).toBeTruthy());
    expect(onUndo).toHaveBeenCalledWith(4);
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });
});
