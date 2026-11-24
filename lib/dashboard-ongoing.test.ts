import { describe, expect, it } from "vitest";

import type { OngoingAgent } from "@/lib/api/dashboard";
import {
  badgeAnchor,
  buildOngoingSlides,
  clampPercent,
  firstName,
} from "@/lib/dashboard-ongoing";

const agents: OngoingAgent[] = [
  {
    agent: { id: 1, name: "Ada Obi", avatar_url: null, initials: "AO" },
    progress_percent: 58,
    task_count: 3,
    current_task: { id: 11, title: "Visit Ikeja site", state: "active", progress_source: "checklist" },
    tasks: [
      { id: 11, title: "Visit Ikeja site", progress_percent: 50, progress_source: "checklist", state: "active" },
      { id: 12, title: "Deliver samples", progress_percent: 100, progress_source: "travel", state: "arrived" },
      { id: 13, title: "Follow up", progress_percent: 24, progress_source: "schedule", state: "paused" },
    ],
  },
  {
    agent: { id: 2, name: "Luca", avatar_url: null, initials: "L" },
    progress_percent: 5,
    task_count: 1,
    current_task: { id: 21, title: "Survey", state: "active", progress_source: "started" },
    tasks: [{ id: 21, title: "Survey", progress_percent: 5, progress_source: "started", state: "active" }],
  },
];

describe("dashboard-ongoing", () => {
  it("builds one slide per agent for managers", () => {
    const slides = buildOngoingSlides(agents, false);
    expect(slides).toHaveLength(2);
    expect(slides[0]).toMatchObject({
      key: "agent-1",
      progress: 58,
      caption: "3 tasks · Visit Ikeja site",
      state: "active",
      source: "checklist",
    });
    expect(slides[1].caption).toBe("1 task · Survey");
  });

  it("builds one slide per own task for agents", () => {
    const slides = buildOngoingSlides([agents[0]], true);
    expect(slides.map((slide) => [slide.key, slide.progress, slide.state])).toEqual([
      ["task-11", 50, "active"],
      ["task-12", 100, "arrived"],
      ["task-13", 24, "paused"],
    ]);
  });

  it("returns no slides without ongoing work", () => {
    expect(buildOngoingSlides(undefined, false)).toEqual([]);
    expect(buildOngoingSlides([], true)).toEqual([]);
  });

  it("clamps and rounds percentages", () => {
    expect(clampPercent(-4)).toBe(0);
    expect(clampPercent(57.6)).toBe(58);
    expect(clampPercent(140)).toBe(100);
    expect(clampPercent(Number.NaN)).toBe(0);
  });

  it("keeps the badge inside the track at the extremes", () => {
    // Anchored on the tip and shifted by the same share of its own width, so the
    // badge's edges stay inside the track whatever the label width.
    expect(badgeAnchor(0)).toEqual({ left: "0%", transform: "translateX(-0%)", pointerLeft: "12%" });
    expect(badgeAnchor(5)).toEqual({ left: "5%", transform: "translateX(-5%)", pointerLeft: "12%" });
    expect(badgeAnchor(50)).toEqual({ left: "50%", transform: "translateX(-50%)", pointerLeft: "50%" });
    expect(badgeAnchor(95)).toEqual({ left: "95%", transform: "translateX(-95%)", pointerLeft: "88%" });
    expect(badgeAnchor(140).left).toBe("100%");

    // Right edge = track * p - badge * p + badge = track * p + badge * (1 - p) <= track.
    const track = 300;
    for (const badgeWidth of [70, 110, 160]) {
      for (const p of [0, 5, 50, 95, 100]) {
        const leftEdge = (track * p) / 100 - (badgeWidth * p) / 100;
        expect(leftEdge).toBeGreaterThanOrEqual(0);
        expect(leftEdge + badgeWidth).toBeLessThanOrEqual(track);
      }
    }
  });

  it("uses the first name for the badge", () => {
    expect(firstName("Ada Obi")).toBe("Ada");
    expect(firstName("  ")).toBe("Agent");
  });
});
