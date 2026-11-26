import { describe, expect, it } from "vitest";
import { describeTrackingHealth } from "./tracking-health";

describe("describeTrackingHealth", () => {
  it("is good for a healthy native recorder", () => {
    const s = describeTrackingHealth({
      source: "native",
      app_version: "1.0.4",
      permission: "always",
      precise: true,
      location_services_on: true,
      battery_optimized: false,
      fixes: 300,
      uploaded: 120,
      queued: 0,
    });
    expect(s.status).toBe("good");
    expect(s.issues).toEqual([]);
    expect(s.facts[0]).toEqual({ label: "Recorder", value: "App 1.0.4" });
  });

  it("explains why a route may be short", () => {
    const s = describeTrackingHealth({
      source: "native",
      permission: "while_in_use",
      precise: false,
      location_services_on: false,
      queued: 12,
      last_error: "HTTP 503",
    });
    expect(s.status).toBe("warning");
    expect(s.issues[0]).toMatch(/Location was turned off/);
    expect(s.issues.join(" ")).toMatch(/all the time/);
    expect(s.issues.join(" ")).toMatch(/12 points/);
    expect(s.issues.join(" ")).toMatch(/HTTP 503/);
  });

  it("flags browser / old-app recording", () => {
    expect(describeTrackingHealth({ source: "web" }).issues[0]).toMatch(/screen is off/);
  });
});
