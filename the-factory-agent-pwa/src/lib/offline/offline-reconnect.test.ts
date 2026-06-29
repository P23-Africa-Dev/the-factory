import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createOfflineReconnectHandler } from './offline-reconnect';

describe('createOfflineReconnectHandler', () => {
  it('reloads when online event fires', () => {
    const reload = vi.fn();
    const handler = createOfflineReconnectHandler({ reload, isOnline: () => false });

    handler.startListening();
    window.dispatchEvent(new Event('online'));

    expect(reload).toHaveBeenCalledTimes(1);
    handler.stopListening();
  });

  it('probes connectivity and reloads on success', async () => {
    const reload = vi.fn();
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    const handler = createOfflineReconnectHandler({
      reload,
      fetchFn,
      isOnline: () => false,
    });

    await handler.probeConnectivity();

    expect(fetchFn).toHaveBeenCalledWith('/manifest.json', {
      method: 'HEAD',
      cache: 'no-store',
    });
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
