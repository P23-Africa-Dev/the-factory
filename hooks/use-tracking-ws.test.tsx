import { render } from "@testing-library/react";
import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useTrackingWebSocket } from "./use-tracking-ws";
import { useFieldActivityLiveStore } from "@/store/field-activity-live";

const {
    listAgentLocationsMock,
    getTaskRouteMock,
    storeState,
    useTrackingStoreMock,
} = vi.hoisted(() => {
    const state = {
        liveTasks: {} as Record<number, unknown>,
        wsStatus: "idle" as "idle" | "connecting" | "connected" | "reconnecting" | "error",
        activeTrackingTaskId: null as number | null,
        setWsStatus: vi.fn(
            (status: "idle" | "connecting" | "connected" | "reconnecting" | "error") => {
                state.wsStatus = status;
            }
        ),
        upsertFromWs: vi.fn(),
        hydrateFromRoute: vi.fn(),
        hydrateFromSnapshots: vi.fn(),
        setInitialHydrating: vi.fn(),
    };

    const storeMock = Object.assign(vi.fn(() => state), {
        getState: () => state,
    });

    return {
        listAgentLocationsMock: vi.fn(),
        getTaskRouteMock: vi.fn(),
        storeState: state,
        useTrackingStoreMock: storeMock,
    };
});

vi.mock("@/store/auth", () => ({
    useAuthStore: vi.fn((selector: (state: { user: { id: number } }) => unknown) =>
        selector({ user: { id: 9 } })
    ),
}));

vi.mock("@/store/tracking", () => ({
    useTrackingStore: useTrackingStoreMock,
}));

vi.mock("@/lib/auth/session", () => ({
    getAuthTokenFromDocument: vi.fn(() => "test-token"),
}));

vi.mock("@/lib/company-context", () => ({
    getActiveCompanyContext: vi.fn(() => ({
        apiCompanyId: 44,
        role: "agent",
    })),
}));

vi.mock("@/lib/config/public-env", () => ({
    getTrackingWebSocketUrl: vi.fn(() => "ws://localhost:8080/tracking-ws"),
}));

vi.mock("@/lib/api/tracking", () => ({
    listAgentLocations: listAgentLocationsMock,
    getTaskRoute: getTaskRouteMock,
}));

class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    static instances: MockWebSocket[] = [];

    readyState = MockWebSocket.CONNECTING;
    url: string;
    sent: string[] = [];

    onopen: ((event: Event) => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onclose: ((event: CloseEvent) => void) | null = null;
    onerror: ((event: Event) => void) | null = null;

    constructor(url: string) {
        this.url = url;
        MockWebSocket.instances.push(this);
    }

    send(data: string) {
        this.sent.push(data);
    }

    close() {
        this.readyState = MockWebSocket.CLOSED;
    }

    simulateOpen() {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.(new Event("open"));
    }

    simulateMessage(payload: unknown) {
        this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
    }
}

function HookHarness() {
    useTrackingWebSocket();
    return null;
}

describe("useTrackingWebSocket", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        MockWebSocket.instances = [];

        storeState.liveTasks = {
            101: {
                taskId: 101,
                status: "in_progress",
            },
        };
        storeState.activeTrackingTaskId = 202;
        storeState.wsStatus = "idle";

        listAgentLocationsMock.mockResolvedValue({ data: { items: [] } });
        getTaskRouteMock.mockResolvedValue({ data: { polyline: [], summary: { points_count: 0 } } });

        vi.stubGlobal("WebSocket", MockWebSocket);
    });

    it("connects with task_ids and sends authenticated subscription payload", async () => {
        const { rerender } = render(<HookHarness />);

        expect(MockWebSocket.instances).toHaveLength(1);
        const ws = MockWebSocket.instances[0];
        expect(ws.url).not.toContain("token=");
        expect(ws.url).toContain("company_id=44");
        expect(ws.url).toContain("task_ids=101%2C202");

        await act(async () => {
            ws.simulateOpen();
        });

        const firstMessage = JSON.parse(ws.sent[0]);
        expect(firstMessage.type).toBe("authenticate");
        expect(firstMessage.token).toBe("test-token");
        expect(firstMessage.task_ids).toEqual([101, 202]);

        await act(async () => {
            ws.simulateMessage({
                type: "system.connected",
                subscribed_task_ids: [101, 202],
            });
        });

        storeState.liveTasks = {
            303: {
                taskId: 303,
                status: "in_progress",
            },
        };
        storeState.activeTrackingTaskId = null;

        rerender(<HookHarness />);

        const controlMessages = ws.sent.slice(1).map((message) => JSON.parse(message));
        expect(controlMessages).toContainEqual({ type: "subscribe_task", task_id: 303 });
        expect(controlMessages).toContainEqual({ type: "unsubscribe_task", task_id: 101 });
        expect(controlMessages).toContainEqual({ type: "unsubscribe_task", task_id: 202 });
    });

    describe("field trip events", () => {
        beforeEach(() => {
            useFieldActivityLiveStore.getState().clear();
        });

        async function openSocket() {
            render(<HookHarness />);
            const ws = MockWebSocket.instances[0];
            await act(async () => {
                ws.simulateOpen();
            });
            return ws;
        }

        it("shows a person on trip_started even without coordinates", async () => {
            const ws = await openSocket();
            await act(async () => {
                ws.simulateMessage({
                    type: "field_activity.trip_started",
                    payload: {
                        user_id: 31,
                        field_activity_session_id: 900,
                        name: "Chidi",
                        avatar_url: null,
                        started_at: "2026-07-29T08:00:00Z",
                        latitude: null,
                        longitude: null,
                    },
                });
            });
            const agent = useFieldActivityLiveStore.getState().agents[31];
            expect(agent?.name).toBe("Chidi");
            expect(agent?.sessionId).toBe(900);
            expect(agent?.lastPosition).toBeNull();
        });

        it("refetches instead of inventing a nameless person for an unknown location", async () => {
            const ws = await openSocket();
            const before = useFieldActivityLiveStore.getState().refreshNonce;
            await act(async () => {
                ws.simulateMessage({
                    type: "field_activity.location",
                    payload: {
                        user_id: 32,
                        field_activity_session_id: 901,
                        latitude: 6.5,
                        longitude: 3.3,
                        recorded_at: "2026-07-29T08:01:00Z",
                    },
                });
            });
            expect(useFieldActivityLiveStore.getState().agents[32]).toBeUndefined();
            expect(useFieldActivityLiveStore.getState().refreshNonce).toBe(before + 1);
        });

        it("keeps an ended trip briefly as 'Trip ended'", async () => {
            const ws = await openSocket();
            useFieldActivityLiveStore.getState().startTrip(33, { sessionId: 902, name: "Ada" });
            await act(async () => {
                ws.simulateMessage({
                    type: "field_activity.trip_ended",
                    payload: { user_id: 33, field_activity_session_id: 902, ended_at: "2026-07-29T09:00:00Z" },
                });
            });
            expect(useFieldActivityLiveStore.getState().agents[33]?.endedAt).toBe("2026-07-29T09:00:00Z");
        });

        it("asks for a field-trip refresh when the socket reconnects", async () => {
            vi.useFakeTimers();
            try {
                const ws = await openSocket();
                const before = useFieldActivityLiveStore.getState().refreshNonce;
                await act(async () => {
                    ws.readyState = MockWebSocket.CLOSED;
                    ws.onclose?.({ code: 1006, reason: "" } as CloseEvent);
                });
                await act(async () => {
                    vi.advanceTimersByTime(1_100);
                });
                const next = MockWebSocket.instances[1];
                expect(next).toBeDefined();
                await act(async () => {
                    next.simulateOpen();
                });
                expect(useFieldActivityLiveStore.getState().refreshNonce).toBeGreaterThan(before);
            } finally {
                vi.useRealTimers();
            }
        });
    });
});