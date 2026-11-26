import { beforeEach, describe, expect, it } from "vitest";
import { useFieldActivityLiveStore } from "@/store/field-activity-live";
import { buildFieldTripStopPopupHtml } from "@/lib/tracking/field-trip-popups";

describe("stop records on the live map", () => {
  beforeEach(() => {
    useFieldActivityLiveStore.getState().clear();
  });

  it("a stop_updated event keeps what we knew and adds the record", () => {
    const store = useFieldActivityLiveStore.getState();
    store.startTrip(3, { sessionId: 12, name: "Bola" });
    store.upsertStop(3, {
      id: 77,
      field_activity_session_id: 12,
      latitude: 6.1,
      longitude: 3.1,
      address: "Ikeja City Mall",
      arrived_at: "2026-11-26T09:00:00Z",
      classification: "pending",
    });
    store.upsertStop(3, {
      id: 77,
      field_activity_session_id: 12,
      latitude: 6.1,
      longitude: 3.1,
      classification: "customer_visit",
      record_status: "recorded",
      outcome: "follow_up",
    });

    const stops = useFieldActivityLiveStore.getState().agents[3].stops;
    expect(stops).toHaveLength(1);
    expect(stops[0]).toMatchObject({
      address: "Ikeja City Mall",
      arrived_at: "2026-11-26T09:00:00Z",
      classification: "customer_visit",
      record_status: "recorded",
      outcome: "follow_up",
    });
  });

  it("the stop popup shows what was recorded, or that it is not recorded yet", () => {
    const recorded = buildFieldTripStopPopupHtml({
      kind: "stop",
      label: "Shop <b>",
      classification: "customer_visit",
      recordStatus: "recorded",
      outcome: "follow_up",
      arrivedAt: "2026-11-26T09:00:00Z",
      durationSeconds: 600,
    });
    expect(recorded).toContain("Customer visit · Follow-up needed");
    expect(recorded).toContain("Shop &lt;b&gt;");

    const pending = buildFieldTripStopPopupHtml({ kind: "stop", classification: "pending", recordStatus: "pending" });
    expect(pending).toContain("Not recorded yet");
  });
});
