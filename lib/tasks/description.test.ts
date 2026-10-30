import { describe, expect, it } from "vitest";
import { validateTaskDescription, TASK_DESCRIPTION_REQUIRED_MESSAGE } from "@/lib/tasks/description";

describe("validateTaskDescription", () => {
  it.each([undefined, null, "", "   ", "\n\t  "])("requires a description (%j)", (value) => {
    expect(validateTaskDescription(value)).toBe(TASK_DESCRIPTION_REQUIRED_MESSAGE);
  });

  it("enforces the backend minimum length after trimming", () => {
    expect(validateTaskDescription("  short   ")).toBe("Task description must be at least 10 characters.");
  });

  it("rejects overly long descriptions", () => {
    expect(validateTaskDescription("a".repeat(5001))).toMatch(/may not be longer than 5000/);
  });

  it("accepts a valid description", () => {
    expect(validateTaskDescription("  Visit the store and check stock.  ")).toBeNull();
  });
});
