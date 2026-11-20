import { renderHook } from "@testing-library/react";
import type { ClientRect, CollisionDetection } from "@dnd-kit/core";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useBoardCollisionDetection } from "@/lib/dnd/use-board-collision";

const rect = (left: number, top: number, width: number, height: number): ClientRect => ({
  left, top, width, height, right: left + width, bottom: top + height,
});

/** Pointer at x; "pending" spans 0-300, "in-progress" spans 316-616. */
function argsAt(x: number) {
  const rects = new Map<string, ClientRect>([
    ["pending", rect(0, 0, 300, 1000)],
    ["in-progress", rect(316, 0, 300, 1000)],
  ]);
  return {
    active: { id: "card", data: { current: undefined }, rect: { current: { initial: null, translated: null } } },
    collisionRect: rect(x - 20, 100, 40, 40),
    droppableRects: rects,
    droppableContainers: [...rects.keys()].map((id) => ({
      id, key: id, data: { current: undefined }, disabled: false, node: { current: null }, rect: { current: rects.get(id)! },
    })),
    pointerCoordinates: { x, y: 120 },
  } as unknown as Parameters<CollisionDetection>[0];
}

afterEach(() => vi.useRealTimers());

describe("useBoardCollisionDetection", () => {
  it("holds the last target for a frame after a column move (no ping-pong loop)", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useBoardCollisionDetection());
    const { collisionDetection, markMoved } = result.current;

    expect(collisionDetection(argsAt(400))[0]?.id).toBe("in-progress");
    markMoved();
    // The reflow now puts the pointer over the old column: keep the target this frame.
    expect(collisionDetection(argsAt(100))[0]?.id).toBe("in-progress");

    vi.advanceTimersByTime(50); // next animation frame
    expect(collisionDetection(argsAt(100))[0]?.id).toBe("pending");
  });

  it("starts each drag fresh", () => {
    const { result } = renderHook(() => useBoardCollisionDetection());
    const { collisionDetection, markMoved, resetDrag } = result.current;
    collisionDetection(argsAt(400));
    markMoved();
    resetDrag();
    expect(collisionDetection(argsAt(100))[0]?.id).toBe("pending");
  });
});
