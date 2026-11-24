import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({
  assistantApi: {
    generateWeeklySummary: vi.fn(),
    getWeeklySummaryStatus: vi.fn(),
  },
}));

import { assistantApi } from './api';
import { runWeeklySummary, weeklySummaryMessage, WeeklySummaryError } from './weeklySummary';
import type { WeeklySummaryStatus } from './types';

const generate = vi.mocked(assistantApi.generateWeeklySummary);
const getStatus = vi.mocked(assistantApi.getWeeklySummaryStatus);

function status(partial: Partial<WeeklySummaryStatus>): WeeklySummaryStatus {
  return { status: 'queued', progress: 5, report: null, drive_file_id: null, error: null, ...partial };
}

describe('runWeeklySummary', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    generate.mockResolvedValue({ report_id: 'r1' });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('polls every 2.5 s until the report is completed', async () => {
    getStatus
      .mockResolvedValueOnce(status({ status: 'running', progress: 40 }))
      .mockRejectedValueOnce(new Error('network blip'))
      .mockResolvedValueOnce(
        status({ status: 'completed', report: { narrative: 'Sales grew 12%.', title: 'Week 47' }, drive_file_id: 9 }),
      );

    const promise = runWeeklySummary();
    await vi.advanceTimersByTimeAsync(2500);
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(getStatus).toHaveBeenCalledWith('r1');
    await vi.advanceTimersByTimeAsync(2500);
    await vi.advanceTimersByTimeAsync(2500);

    await expect(promise).resolves.toEqual({ narrative: 'Sales grew 12%.', title: 'Week 47', driveFileId: 9 });
    expect(getStatus).toHaveBeenCalledTimes(3);
  });

  it('reports a failed job with the server error', async () => {
    getStatus.mockResolvedValue(status({ status: 'failed', error: 'No data for this week' }));
    const promise = runWeeklySummary();
    const assertion = expect(promise).rejects.toMatchObject({
      reason: 'failed',
      message: "ELY couldn't prepare your weekly summary: No data for this week",
    });
    await vi.advanceTimersByTimeAsync(2500);
    await assertion;
  });

  it('gives up after about two minutes', async () => {
    getStatus.mockResolvedValue(status({ status: 'running' }));
    const promise = runWeeklySummary();
    const assertion = expect(promise).rejects.toMatchObject({ reason: 'timeout' });
    await vi.advanceTimersByTimeAsync(121_000);
    await assertion;
    expect(getStatus.mock.calls.length).toBeLessThanOrEqual(48);
  });

  it('stops when cancelled', async () => {
    getStatus.mockResolvedValue(status({ status: 'running' }));
    const controller = new AbortController();
    const promise = runWeeklySummary({ signal: controller.signal });
    const assertion = expect(promise).rejects.toBeInstanceOf(WeeklySummaryError);
    await vi.advanceTimersByTimeAsync(2500);
    controller.abort();
    await assertion;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(getStatus).toHaveBeenCalledTimes(1);
  });
});

describe('weeklySummaryMessage', () => {
  it('mentions the Drive copy only when one was saved', () => {
    expect(weeklySummaryMessage({ narrative: 'All good.', title: '', driveFileId: null })).toBe('All good.');
    expect(weeklySummaryMessage({ narrative: 'All good.', title: 'Week 47', driveFileId: 3 })).toBe(
      'Week 47\n\nAll good.\n\nA PDF copy was saved to your Drive.',
    );
  });
});
