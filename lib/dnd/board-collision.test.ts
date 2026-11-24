import { closestCorners, type ClientRect, type CollisionDetection } from "@dnd-kit/core";
import { describe, expect, it } from "vitest";

import { boardCollisionDetection } from "@/lib/dnd/board-collision";

const rect = (left: number, top: number, width: number, height: number): ClientRect => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

/** Mirrors production: tall columns, the dragged card still in its own column. */
function boardArgs(pointer: { x: number; y: number }, collisionRect: ClientRect) {
  const droppableRects = new Map<string, ClientRect>([
    ["pending", rect(32, 536, 328, 1278)], // empty column, stretched to the tallest one
    ["in-progress", rect(392, 536, 328, 1278)],
    ["186", rect(392, 544, 328, 420)], // the dragged card's own slot
    ["183", rect(392, 980, 328, 420)],
  ]);
  const droppableContainers = [...droppableRects.keys()].map((id) => ({
    id,
    key: id,
    data: { current: undefined },
    disabled: false,
    node: { current: null },
    rect: { current: droppableRects.get(id)! },
  }));

  return {
    active: { id: "186", data: { current: undefined }, rect: { current: { initial: null, translated: null } } },
    collisionRect,
    droppableRects,
    droppableContainers,
    pointerCoordinates: pointer,
  } as unknown as Parameters<CollisionDetection>[0];
}

describe("boardCollisionDetection", () => {
  // Card dragged ~220px left so it sits over the empty Pending column.
  const args = boardArgs({ x: 196, y: 655 }, rect(172, 594, 328, 420));

  it("reproduces the production bug with closestCorners (drop resolves to the dragged card)", () => {
    expect(closestCorners(args)[0]?.id).toBe("186");
  });

  it("picks the column under the pointer and never the dragged card", () => {
    const collisions = boardCollisionDetection(args);
    expect(collisions[0]?.id).toBe("pending");
    expect(collisions.map((c) => c.id)).not.toContain("186");
  });

  it("falls back to overlap, then nearest, without returning the dragged card", () => {
    const outside = boardArgs({ x: 5000, y: 5000 }, rect(172, 594, 328, 420));
    const collisions = boardCollisionDetection(outside);
    expect(collisions.length).toBeGreaterThan(0);
    expect(collisions.map((c) => c.id)).not.toContain("186");
  });
});
