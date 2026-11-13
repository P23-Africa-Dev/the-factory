import { describe, expect, it } from "vitest";
import { observerInitials } from "@/components/operations/observer-avatars";

describe("observerInitials", () => {
  it.each([
    ["Grace Hopper", "GH"],
    ["Mary Ann Evans", "ME"],
    ["Cher", "CH"],
    ["  ", "?"],
  ])("turns %j into %j", (name, expected) => {
    expect(observerInitials(name)).toBe(expected);
  });
});
