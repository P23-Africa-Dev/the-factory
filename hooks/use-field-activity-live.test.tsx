import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FieldActivityLiveAgentDto } from "@/lib/api/field-activity";
import { useFieldActivityLiveStore } from "@/store/field-activity-live";
import { mapLiveAgentDto, useFieldActivityLiveHydrate } from "./use-field-activity-live";

const { getFieldActivityLiveMock } = vi.hoisted(() => ({ getFieldActivityLiveMock: vi.fn() }));

vi.mock("@/store/auth", () => ({
  useAuthStore: (selector: (state: { user: { id: number } }) => unknown) => selector({ user: { id: 1 } }),
}));
vi.mock("@/lib/company-context", () => ({
  getActiveCompanyContext: () => ({ apiCompanyId: 44, role: "admin" }),
}));
vi.mock("@/lib/auth/session", () => ({ getAuthTokenFromDocument: () => "token" }));
vi.mock("@/store/tracking", () => ({
  useTrackingStore: (selector: (state: { wsStatus: string }) => unknown) => selector({ wsStatus: "connected" }),
}));
vi.mock("@/lib/api/field-activity", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/field-activity")>()),
  getFieldActivityLive: getFieldActivityLiveMock,
}));

function dto(overrides: Partial<FieldActivityLiveAgentDto> = {}): FieldActivityLiveAgentDto {
  return {
    user_id: 9,
    name: "Amara",
    avatar_url: null,
    session: {
      id: 44,
      status: "active",
      source: "field_trip",
      started_at: "2026-07-29T08:00:00Z",
      distance_meters: 4200,
      meta: { start: { latitude: "6.40", longitude: "3.30" } },
      last_latitude: 6.5,
      last_longitude: 3.4,
      last_movement_state: "moving",
      last_recorded_at: "2026-07-29T09:00:00Z",
    },
    last_latitude: 6.5,
    last_longitude: 3.4,
    last_movement_state: "moving",
    last_recorded_at: "2026-07-29T09:00:00Z",
    route: { coordinates: [[3.31, 6.41], [3.4, 6.5]], raw_point_count: 2, point_count: 2 },
    stops: [],
    ...overrides,
  };
}

function Harness({ enabled }: { enabled: boolean }) {
  useFieldActivityLiveHydrate(enabled);
  return null;
}

function renderWithClient(enabled: boolean) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness enabled={enabled} />
    </QueryClientProvider>,
  );
}

describe("useFieldActivityLiveHydrate", () => {
  beforeEach(() => {
    useFieldActivityLiveStore.getState().clear();
    getFieldActivityLiveMock.mockResolvedValue({ data: { date: "2026-07-29", agents: [dto()] } });
  });

  it("maps start time, start point and distance from the API", () => {
    const agent = mapLiveAgentDto(dto());
    expect(agent.startedAt).toBe("2026-07-29T08:00:00Z");
    expect(agent.startPosition).toEqual([3.3, 6.4]);
    expect(agent.distanceMeters).toBe(4200);
    expect(agent.lastPosition).toEqual([3.4, 6.5]);

    const noMeta = mapLiveAgentDto(dto({ session: { ...dto().session, meta: null } }));
    expect(noMeta.startPosition).toEqual([3.31, 6.41]);
  });

  it("a disabled caller (compact home map) does not wipe the shared store", () => {
    useFieldActivityLiveStore.getState().startTrip(5, { sessionId: 1, name: "Kept" });
    renderWithClient(false);
    expect(useFieldActivityLiveStore.getState().agents[5]?.name).toBe("Kept");
    expect(getFieldActivityLiveMock).not.toHaveBeenCalled();
  });

  it("hydrates when enabled and refetches when realtime asks", async () => {
    renderWithClient(true);
    await waitFor(() => expect(useFieldActivityLiveStore.getState().agents[9]?.name).toBe("Amara"));
    expect(getFieldActivityLiveMock).toHaveBeenCalledTimes(1);

    useFieldActivityLiveStore.getState().requestRefresh();
    await waitFor(() => expect(getFieldActivityLiveMock).toHaveBeenCalledTimes(2));
  });
});
