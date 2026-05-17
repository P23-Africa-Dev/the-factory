import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as locationBuffer from "@/lib/tracking/location-buffer";

const {
    recordTaskLocationMock,
    positionCallbackRef,
} = vi.hoisted(() => ({
    recordTaskLocationMock: vi.fn(),
    positionCallbackRef: {
        current: null as
            | ((reading: {
                latitude: number;
                longitude: number;
                accuracyMeters: number | null;
                speedMps: number | null;
                headingDegrees: number | null;
                recordedAt: string;
            }) => void)
            | null,
    },
}));

vi.mock("@/lib/api/tracking", () => ({
    recordTaskLocation: recordTaskLocationMock,
}));

vi.mock("@/lib/tracking/geolocation", () => ({
    watchPosition: vi.fn((onPosition: typeof positionCallbackRef.current) => {
        positionCallbackRef.current = onPosition;
        return vi.fn();
    }),
    watchVisibilityAccuracy: vi.fn(() => vi.fn()),
}));

describe("location-buffer", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
        positionCallbackRef.current = null;
        recordTaskLocationMock.mockResolvedValue({ data: { arrived: false } });
    });

    afterEach(() => {
        locationBuffer.stop();
        vi.useRealTimers();
    });

    it("queues location readings and flushes batched points every 30s", async () => {
        locationBuffer.start(55, 9, "token");

        expect(positionCallbackRef.current).not.toBeNull();
        positionCallbackRef.current?.({
            latitude: 6.5,
            longitude: 3.3,
            accuracyMeters: 5,
            speedMps: null,
            headingDegrees: null,
            recordedAt: "2026-05-16T10:00:00.000Z",
        });

        expect(sessionStorage.getItem("factory_location_buffer")).toBe(
            JSON.stringify([
                {
                    latitude: 6.5,
                    longitude: 3.3,
                    accuracyMeters: 5,
                    speedMps: null,
                    headingDegrees: null,
                    recordedAt: "2026-05-16T10:00:00.000Z",
                },
            ])
        );

        await vi.advanceTimersByTimeAsync(30_000);

        expect(recordTaskLocationMock).toHaveBeenCalledTimes(1);
        expect(recordTaskLocationMock.mock.calls[0][1]).toMatchObject({
            company_id: 9,
            points: [
                {
                    latitude: 6.5,
                    longitude: 3.3,
                    accuracy_meters: 5,
                    speed_mps: null,
                    heading_degrees: null,
                    recorded_at: "2026-05-16T10:00:00.000Z",
                },
            ],
        });
    });

    it("flushes recovered queue and triggers arrival callback when backend reports arrived", async () => {
        sessionStorage.setItem(
            "factory_location_buffer",
            JSON.stringify([
                {
                    latitude: 6.6,
                    longitude: 3.4,
                    accuracyMeters: 4,
                    speedMps: null,
                    headingDegrees: null,
                    recordedAt: "2026-05-16T11:00:00.000Z",
                },
            ])
        );

        recordTaskLocationMock.mockResolvedValue({ data: { arrived: true } });
        const onArrived = vi.fn();

        locationBuffer.start(77, 12, "token", { onArrived });

        await Promise.resolve();

        expect(recordTaskLocationMock).toHaveBeenCalled();
        expect(onArrived).toHaveBeenCalledTimes(1);
    });
});