import { describe, expect, it } from "vitest";

import { moveCardToColumn } from "@/lib/dnd/board-moves";

const board = () => [
  { id: "pending", items: [{ id: "1" }, { id: "2" }] },
  { id: "done", items: [{ id: "3" }] },
];
const ids = (b: ReturnType<typeof board>) => b.map((c) => `${c.id}:${c.items.map((i) => i.id).join(",")}`);

describe("moveCardToColumn", () => {
  it("moves a card to the end of another column", () => {
    expect(ids(moveCardToColumn(board(), "1", "done"))).toEqual(["pending:2", "done:3,1"]);
  });

  it("inserts before the hovered card", () => {
    expect(ids(moveCardToColumn(board(), "2", "done", "3"))).toEqual(["pending:1", "done:2,3"]);
  });

  it("keeps the card when the target is its own column (it used to vanish)", () => {
    const start = board();
    expect(moveCardToColumn(start, "1", "pending")).toBe(start);
  });

  it("never leaves the same card in two places", () => {
    const withStaleCopy = [
      { id: "pending", items: [{ id: "1" }] },
      { id: "done", items: [{ id: "1" }, { id: "3" }] },
    ];
    const moved = moveCardToColumn(withStaleCopy, "1", "done", "3");
    expect(moved.flatMap((c) => c.items.map((i) => i.id)).filter((id) => id === "1")).toHaveLength(1);
  });

  it("ignores unknown cards and columns", () => {
    const start = board();
    expect(moveCardToColumn(start, "99", "done")).toBe(start);
    expect(moveCardToColumn(start, "1", "nope")).toBe(start);
  });
});
