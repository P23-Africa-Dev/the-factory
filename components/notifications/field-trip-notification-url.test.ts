import { describe, expect, it } from "vitest";
import type { AppNotification } from "@/lib/api/notifications";
import { resolveWebNotificationUrl } from "@/components/notifications/notification-panel";

function note(overrides: Partial<AppNotification>): AppNotification {
  return {
    id: 1,
    type: "field_trip.auto_ended",
    title: "Field trip ended",
    message: "",
    action_url: "/field-activity/journeys/44",
    action_route: "field-activity.journeys.show",
    metadata: { field_activity_session_id: 44, agent_user_id: 9 },
    ...overrides,
  } as unknown as AppNotification;
}

describe("field trip notification links", () => {
  it("opens the trip's journey page for managers and agents", () => {
    expect(resolveWebNotificationUrl(note({}), false)).toBe("/operations/journeys/44");
    expect(resolveWebNotificationUrl(note({ action_url: "/?field_trip=1" }), true)).toBe(
      "/agent/operations/journeys/44",
    );
  });

  it("falls back to the id in the action URL", () => {
    expect(resolveWebNotificationUrl(note({ metadata: null }), false)).toBe("/operations/journeys/44");
  });

  it("sends managers to the live map when a running trip lost signal", () => {
    expect(
      resolveWebNotificationUrl(note({ type: "field_trip.signal_lost", action_url: "/map" }), false),
    ).toBe("/map?agent=9");
  });

  it("never returns the dead /field-activity/... API-style path", () => {
    const url = resolveWebNotificationUrl(note({ metadata: {}, action_url: "/somewhere" }), false);
    expect(url).toBe("/map");
  });
});
