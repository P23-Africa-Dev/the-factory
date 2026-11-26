import { describe, expect, it } from "vitest";
import { isWebReportableSession } from "@/components/tracking/field-activity-reporter-provider";

describe("isWebReportableSession", () => {
  it("reports into active attendance sessions only", () => {
    expect(isWebReportableSession(true, { status: "active", source: "attendance" })).toBe(true);
    expect(isWebReportableSession(true, { status: "active" })).toBe(true);
  });

  it("never posts this computer's location into a phone field trip", () => {
    expect(isWebReportableSession(true, { status: "active", source: "field_trip" })).toBe(false);
  });

  it("skips disabled, ended or missing sessions", () => {
    expect(isWebReportableSession(false, { status: "active", source: "attendance" })).toBe(false);
    expect(isWebReportableSession(true, { status: "ended", source: "attendance" })).toBe(false);
    expect(isWebReportableSession(true, null)).toBe(false);
  });
});
