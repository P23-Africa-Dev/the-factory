import { describe, expect, it } from "vitest";
import {
  composeIcpSearchBrief,
  entityModeLabel,
  isInsufficientIcpSearchBrief,
  withEntityModeCue,
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
});
