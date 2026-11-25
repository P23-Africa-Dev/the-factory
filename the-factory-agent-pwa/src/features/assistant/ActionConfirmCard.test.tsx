import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ActionConfirmCard, asPendingActionProposal } from './ActionConfirmCard';

const payload = {
  confirmation_required: true,
  tool: 'crm.send_email',
  action_label: 'Send an email to a lead.',
  action_args: { lead_id: 3, subject: 'Hello', body: 'Hi there' },
  pending_action_id: 'abc-123',
  preview_fields: ['subject', 'body'],
  field_labels: { subject: 'Subject', body: 'Message' },
};

describe('asPendingActionProposal', () => {
  it('reads the confirmation payload', () => {
    const proposal = asPendingActionProposal(payload);
    expect(proposal).toMatchObject({
      tool: 'crm.send_email',
      label: 'Send an email to a lead.',
      pendingActionId: 'abc-123',
      preview: [
        { label: 'Subject', value: 'Hello' },
        { label: 'Message', value: 'Hi there' },
      ],
    });
  });

  it('ignores replies that need no confirmation', () => {
    expect(asPendingActionProposal({ receipts: [] })).toBeNull();
    expect(asPendingActionProposal(null)).toBeNull();
  });
});

describe('ActionConfirmCard', () => {
  it('shows what will happen and calls confirm and cancel', () => {
    const proposal = asPendingActionProposal(payload)!;
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ActionConfirmCard proposal={proposal} state="open" onConfirm={onConfirm} onCancel={onCancel} />);

    expect(screen.getByText('Send an email to a lead.')).toBeTruthy();
    expect(screen.getByText('Hello')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Confirm/ }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/ }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('hides the buttons once cancelled', () => {
    const proposal = asPendingActionProposal(payload)!;
    render(<ActionConfirmCard proposal={proposal} state="cancelled" onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('Cancelled')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
