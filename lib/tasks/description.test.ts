import { describe, expect, it } from "vitest";
import { validateTaskDescription } from "@/lib/tasks/description";

describe("validateTaskDescription", () => {
  it.each([undefined, null, "", "   ", "\n\t  "])("allows an empty description (%j)", (value) => {
    expect(validateTaskDescription(value)).toBeNull();
  });

  it("allows a short description", () => {
    expect(validateTaskDescription("Go")).toBeNull();
  });

  it("rejects overly long descriptions", () => {
    expect(validateTaskDescription("a".repeat(5001))).toMatch(/may not be longer than 5000/);
  });

  it("accepts a normal description", () => {
    expect(validateTaskDescription("  Visit the store and check stock.  ")).toBeNull();
  });
});
