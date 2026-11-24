import { assistantApi } from './api';

export const WEEKLY_SUMMARY_POLL_MS = 2500;
export const WEEKLY_SUMMARY_TIMEOUT_MS = 120_000;

export interface WeeklySummaryResult {
  narrative: string;
  title: string;
  /** Set when the server also saved a PDF copy to Drive. */
  driveFileId: number | null;
}

/** Thrown when the summary failed, timed out or was cancelled; `message` is ready to show. */
export class WeeklySummaryError extends Error {
  constructor(
    message: string,
    readonly reason: 'failed' | 'timeout' | 'aborted',
  ) {
    super(message);
    this.name = 'WeeklySummaryError';
  }
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new WeeklySummaryError('Cancelled.', 'aborted'));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new WeeklySummaryError('Cancelled.', 'aborted'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Queues the weekly executive summary and polls its status every 2.5 s, for up
 * to about two minutes, until the report is ready. A status check that fails
 * (network blip) is retried on the next tick rather than ending the wait.
 */
export async function runWeeklySummary(options?: {
  signal?: AbortSignal;
  intervalMs?: number;
  timeoutMs?: number;
}): Promise<WeeklySummaryResult> {
  const intervalMs = options?.intervalMs ?? WEEKLY_SUMMARY_POLL_MS;
  const timeoutMs = options?.timeoutMs ?? WEEKLY_SUMMARY_TIMEOUT_MS;
  const signal = options?.signal;

  const { report_id: reportId } = await assistantApi.generateWeeklySummary();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await wait(intervalMs, signal);
    let status;
    try {
      status = await assistantApi.getWeeklySummaryStatus(reportId);
    } catch {
      continue;
    }
    if (status.status === 'completed') {
      const narrative = status.report?.narrative.trim() ?? '';
      return {
        narrative: narrative || 'Your weekly summary is ready, but it has no written summary this week.',
        title: status.report?.title ?? '',
        driveFileId: status.drive_file_id,
      };
    }
    if (status.status === 'failed') {
      throw new WeeklySummaryError(
        status.error
          ? `ELY couldn't prepare your weekly summary: ${status.error}`
          : "ELY couldn't prepare your weekly summary. Please try again.",
        'failed',
      );
    }
  }

  throw new WeeklySummaryError(
    'Your weekly summary is taking longer than expected. Please try again in a few minutes.',
    'timeout',
  );
}

/** The ELY chat message for a finished summary. */
export function weeklySummaryMessage(result: WeeklySummaryResult): string {
  const heading = result.title.trim() ? `${result.title.trim()}\n\n` : '';
  const drive = result.driveFileId != null ? '\n\nA PDF copy was saved to your Drive.' : '';
  return `${heading}${result.narrative}${drive}`;
}
