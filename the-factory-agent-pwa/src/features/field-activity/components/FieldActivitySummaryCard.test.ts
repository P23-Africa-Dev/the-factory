import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FieldActivitySummaryCard } from './FieldActivitySummaryCard';

const mocks = vi.hoisted(() => ({
  today: vi.fn(),
  pendingReview: vi.fn(),
  classify: vi.fn(),
}));

vi.mock('../queries', () => ({
  useFieldActivityToday: () => mocks.today(),
  useFieldActivityPendingReview: () => mocks.pendingReview(),
  useClassifyFieldStop: () => ({
    mutateAsync: mocks.classify,
    isPending: false,
  }),
}));

vi.mock('@/lib/toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

function createStop(id: number, label: string) {
  return {
    id,
    field_activity_session_id: 73,
    arrived_at: '2026-07-29T12:00:00+01:00',
    departed_at: '2026-07-29T12:30:00+01:00',
    latitude: 6.53,
    longitude: 3.38,
    address: label,
    duration_seconds: 1800,
    confidence: 0.3,
    match_type: 'unknown',
    classification: 'pending' as const,
    classified_by: null,
    classified_at: null,
    company_location_id: null,
    lead_id: null,
    meeting_id: null,
    task_id: null,
    reminder_sent: false,
  };
}

function createTodayPayload() {
  return {
    enabled: true,
    session: null,
    summary: null,
    stops: [],
    config: {
      moving_interval_seconds: 60,
      stationary_interval_seconds: 300,
      stop_dwell_seconds: 900,
    },
  };
}

describe('FieldActivitySummaryCard pending review backlog', () => {
  beforeEach(() => {
    mocks.classify.mockReset();
    mocks.today.mockReturnValue({
      data: createTodayPayload(),
      isLoading: false,
      isError: false,
    });
    mocks.pendingReview.mockReturnValue({
      data: {
        pending_stop_count: 1,
        pending_session_count: 1,
        oldest_pending_date: '2026-07-29',
        sessions: [
          {
            session_id: 73,
            started_at: '2026-07-29T09:00:00+01:00',
            ended_at: '2026-07-29T18:00:00+01:00',
            status: 'auto_closed',
            pending_stop_count: 1,
            stops: [createStop(910, 'Acme HQ')],
          },
        ],
      },
    });
  });

  it('renders backlog when prior-day pending reviews exist', () => {
    render(React.createElement(FieldActivitySummaryCard));

    expect(screen.getByText('Pending review backlog')).not.toBeNull();
    expect(screen.getByText('Acme HQ')).not.toBeNull();
    expect(screen.getByText('1 pending stop')).not.toBeNull();
  });

  it('supports skip now and return later without losing visibility', () => {
    const first = render(React.createElement(FieldActivitySummaryCard));

    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    expect(screen.queryByText('Acme HQ')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show' })).not.toBeNull();
    first.unmount();

    render(React.createElement(FieldActivitySummaryCard));
    expect(screen.queryByText('Acme HQ')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Show' }));
    expect(screen.getByText('Acme HQ')).not.toBeNull();
  });
});
