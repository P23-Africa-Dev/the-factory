import { describe, expect, it } from "vitest";
import {
  composeIcpSearchBrief,
  composeSearchGeoCaption,
  entityModeLabel,
  isInsufficientIcpSearchBrief,
  withEntityModeCue,
  withProspectCountCue,
} from "./icp-search-brief";

describe("icp-search-brief", () => {
  it("composes custom prompt first", () => {
    expect(
      composeIcpSearchBrief({
        customPrompt: "earthmoving plant hire dealers",
        description: "fallback",
        industries: ["Manufacturing"],
      })
    ).toBe("earthmoving plant hire dealers");
  });

  it("flags generic filler briefs as insufficient", () => {
    expect(isInsufficientIcpSearchBrief({ customPrompt: "companies" })).toBe(true);
    expect(isInsufficientIcpSearchBrief({ customPrompt: "decision makers" })).toBe(true);
    expect(isInsufficientIcpSearchBrief({ customPrompt: "" })).toBe(true);
    expect(
      isInsufficientIcpSearchBrief({
        customPrompt: "earthmoving and plant-hire expanding abroad",
      })
    ).toBe(false);
  });

  it("appends entity mode cues", () => {
    expect(withEntityModeCue("give me prospects", "both")).toBe("give me prospects");
    expect(withEntityModeCue("give me prospects", "companies")).toBe(
      "give me prospects (companies only)"
    );
    expect(withEntityModeCue("give me prospects", "people")).toBe(
      "give me prospects (people only)"
    );
    expect(entityModeLabel("both")).toBe("accounts + people");
  });

  it("composes a search geo caption from territories", () => {
    expect(composeSearchGeoCaption(["Nigeria", "Lagos, NG"])).toContain("Nigeria");
    expect(composeSearchGeoCaption(["Nigeria", "Lagos, NG"])).not.toBe("");
    expect(composeSearchGeoCaption([])).toBe("");
    expect(composeSearchGeoCaption(null)).toBe("");
  });

  it("keeps the search brief topic-only without territories", () => {
    expect(
      composeIcpSearchBrief({
        customPrompt: "logistics 3PL operators",
        industries: ["Logistics"],
      })
    ).toBe("logistics 3PL operators");
  });

  it("encodes confirm count in the chat body without flipping generic asks", () => {
    expect(withProspectCountCue("give me prospects", 12)).toBe("give me prospects");
    expect(withProspectCountCue("give me prospects", 25)).toBe("give me 25 prospects");
    expect(withProspectCountCue("give me prospects (companies only)", 40)).toBe(
      "give me 40 prospects (companies only)"
    );
    expect(withProspectCountCue("find 50 logistics companies", 25)).toBe(
      "find 50 logistics companies"
    );
  });
});
