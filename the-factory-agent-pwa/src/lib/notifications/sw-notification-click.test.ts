/**
 * Executes the real public/sw.js inside a sandbox and drives its push +
 * notificationclick handlers, so the PWA tap flow is covered end to end.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { parseOpenNotificationParam, resolveNotificationTargetFromPayload } from './notificationTarget';

const ORIGIN = 'https://app.thefactory23.com';
const swSource = fs.readFileSync(
  path.resolve(__dirname, '../../../public/sw.js'),
  'utf8',
);

type Listener = (event: Record<string, unknown>) => void;

type FakeClient = {
  url: string;
  focused: boolean;
  visibilityState: string;
  focus: ReturnType<typeof vi.fn>;
  navigate?: ReturnType<typeof vi.fn>;
  postMessage: ReturnType<typeof vi.fn>;
};

function loadServiceWorker(clients: FakeClient[]) {
  const listeners: Record<string, Listener> = {};
  const shown: Array<{ title: string; options: Record<string, unknown> }> = [];
  const openWindow = vi.fn(async (url: string) => (url ? null : null));

  const self = {
    location: new URL(ORIGIN),
    addEventListener: (name: string, fn: Listener) => {
      listeners[name] = fn;
    },
    skipWaiting: () => undefined,
    registration: {
      showNotification: async (title: string, options: Record<string, unknown>) => {
        shown.push({ title, options });
      },
    },
    clients: {
      matchAll: async () => clients,
      openWindow,
      claim: async () => undefined,
    },
  };

  vm.runInNewContext(swSource, {
    self,
    URL,
    MessageChannel,
    setTimeout,
    clearTimeout,
    console,
    caches: { open: async () => ({ addAll: async () => undefined }), keys: async () => [] },
    indexedDB: {},
    fetch: async () => new Response(''),
    Response,
  });

  async function dispatch(name: string, event: Record<string, unknown>) {
    let pending: Promise<unknown> | undefined;
    listeners[name]?.({ ...event, waitUntil: (p: Promise<unknown>) => (pending = p) });
    await pending;
  }

  return { dispatch, shown, openWindow };
}

function client(overrides: Partial<FakeClient> = {}): FakeClient {
  return {
    url: `${ORIGIN}/`,
    focused: false,
    visibilityState: 'hidden',
    focus: vi.fn(async () => undefined),
    navigate: vi.fn(async () => ({})),
    postMessage: vi.fn(),
    ...overrides,
  };
}

const pushPayload = {
  title: 'Meeting scheduled',
  body: "A meeting titled 'Q4' has been scheduled.",
  message: "A meeting titled 'Q4' has been scheduled.",
  action_url: '/',
  raw_action_url: '/dashboard',
  tag: 'factory-notification-77',
  notification_id: 77,
  type: 'meeting.created',
  category: 'system',
  reference_type: 'App\\Models\\Meeting',
  reference_id: '17',
  meeting_id: '17',
  task_id: '',
  lead_id: '',
};

async function showPush(sw: ReturnType<typeof loadServiceWorker>) {
  await sw.dispatch('push', { data: { json: () => pushPayload } });
  return sw.shown[0];
}

function clickEvent(data: unknown) {
  return { notification: { data, close: vi.fn() } };
}

describe('service worker notification taps', () => {
  it('keeps the raw payload on the shown notification', async () => {
    const sw = loadServiceWorker([]);
    const shown = await showPush(sw);
    expect(shown.title).toBe('Meeting scheduled');
    const data = shown.options.data as { payload: Record<string, unknown> };
    expect(data.payload).toMatchObject({ meeting_id: '17', type: 'meeting.created', notification_id: 77 });
    expect(data.payload).not.toHaveProperty('title');
  });

  it('opens /open-notification with the payload when the app is closed', async () => {
    const sw = loadServiceWorker([]);
    const shown = await showPush(sw);
    await sw.dispatch('notificationclick', clickEvent(shown.options.data));

    expect(sw.openWindow).toHaveBeenCalledOnce();
    const opened = new URL(sw.openWindow.mock.calls[0][0] as string);
    expect(opened.origin).toBe(ORIGIN);
    expect(opened.pathname).toBe('/open-notification');
    const payload = parseOpenNotificationParam(opened.searchParams.get('d'));
    // The landing page resolves the same payload per mode:
    expect(resolveNotificationTargetFromPayload(payload!, { mode: 'agent' })).toBe('/meetings/17');
    expect(resolveNotificationTargetFromPayload(payload!, { mode: 'manager' })).toBe('/manager/meetings/17');
  });

  it('hands the tap to an open app window that acknowledges it', async () => {
    const win = client({
      visibilityState: 'visible',
      postMessage: vi.fn((message: { type: string }, ports: MessagePort[]) => {
        expect(message.type).toBe('NOTIFICATION_CLICKED');
        ports[0].postMessage({ type: 'NOTIFICATION_CLICK_ACK' });
      }),
    });
    const sw = loadServiceWorker([win]);
    const shown = await showPush(sw);
    await sw.dispatch('notificationclick', clickEvent(shown.options.data));

    expect(win.focus).toHaveBeenCalled();
    expect(win.postMessage.mock.calls[0][0].payload).toMatchObject({ meeting_id: '17' });
    expect(win.navigate).not.toHaveBeenCalled();
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it('navigates a window that does not answer (e.g. login page) to the landing route', async () => {
    const win = client();
    const sw = loadServiceWorker([win]);
    const shown = await showPush(sw);
    await sw.dispatch('notificationclick', clickEvent(shown.options.data));

    expect(win.navigate).toHaveBeenCalledOnce();
    expect(new URL(win.navigate!.mock.calls[0][0] as string).pathname).toBe('/open-notification');
    expect(sw.openWindow).not.toHaveBeenCalled();
  });

  it('falls back to a new window when the open window cannot be navigated', async () => {
    const win = client({ navigate: vi.fn(async () => { throw new TypeError('uncontrolled'); }) });
    const sw = loadServiceWorker([win]);
    const shown = await showPush(sw);
    await sw.dispatch('notificationclick', clickEvent(shown.options.data));

    expect(sw.openWindow).toHaveBeenCalledOnce();
  });

  it('routes locally raised alerts that only carry a url', async () => {
    const sw = loadServiceWorker([]);
    await sw.dispatch('notificationclick', clickEvent({ url: '/map?taskId=3' }));
    const opened = new URL(sw.openWindow.mock.calls[0][0] as string);
    const payload = parseOpenNotificationParam(opened.searchParams.get('d'));
    expect(resolveNotificationTargetFromPayload(payload!, { mode: 'manager' })).toBe('/manager/map?taskId=3');
  });
});
