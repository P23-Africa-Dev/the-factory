import { describe, expect, it } from "vitest";
import { toBoardStatus } from "@/lib/tasks/board-status";

describe("toBoardStatus", () => {
  it("maps board column id in-progress to in-progress", () => {
    expect(toBoardStatus("in-progress")).toBe("in-progress");
  });

  it("maps API status in_progress to in-progress", () => {
    expect(toBoardStatus("in_progress")).toBe("in-progress");
  });

  it("maps paused and resumed into the in-progress column", () => {
    expect(toBoardStatus("paused")).toBe("in-progress");
    expect(toBoardStatus("resumed")).toBe("in-progress");
  });

  it("maps completed and cancelled", () => {
    expect(toBoardStatus("completed")).toBe("completed");
    expect(toBoardStatus("cancelled")).toBe("cancelled");
  });

  it("defaults unknown values to pending", () => {
    expect(toBoardStatus("pending")).toBe("pending");
    expect(toBoardStatus(undefined)).toBe("pending");
    expect(toBoardStatus("")).toBe("pending");
  });
});
