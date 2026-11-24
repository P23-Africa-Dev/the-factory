"use client";

import { useCallback, useMemo, useRef } from "react";
import type { CollisionDetection, UniqueIdentifier } from "@dnd-kit/core";

import { boardCollisionDetection } from "@/lib/dnd/board-collision";

/**
 * Collision detection for multi-column boards that move cards between columns
 * while dragging (onDragOver).
 *
 * Moving a card into another column reflows both columns. Measured again in the
 * same commit, the pointer can now sit over a card in the column it just left, so
 * the card was moved back, then forward again... synchronously, until React gave up
 * with "Maximum update depth exceeded" (#185) and the page showed its error screen.
 *
 * After a column move we keep the previous drop target until the next animation
 * frame (the pattern from dnd-kit's multiple-containers example). The card then
 * moves at most once per frame, which also stops it flickering at column edges.
 *
 * Call `markMoved()` whenever onDragOver moves a card to a different column, and
 * `resetDrag()` when a drag starts.
 */
export function useBoardCollisionDetection() {
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMoved = useRef(false);

  const collisionDetection = useCallback<CollisionDetection>((args) => {
    if (recentlyMoved.current && lastOverId.current != null) {
      const stillThere = args.droppableContainers.some((c) => c.id === lastOverId.current);
      if (stillThere) return [{ id: lastOverId.current }];
    }
    const collisions = boardCollisionDetection(args);
    lastOverId.current = collisions[0]?.id ?? null;
    return collisions;
  }, []);

  const markMoved = useCallback(() => {
    recentlyMoved.current = true;
    const release = () => {
      recentlyMoved.current = false;
    };
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(release);
    else setTimeout(release, 16);
  }, []);

  const resetDrag = useCallback(() => {
    lastOverId.current = null;
    recentlyMoved.current = false;
  }, []);

  return useMemo(
    () => ({ collisionDetection, markMoved, resetDrag }),
    [collisionDetection, markMoved, resetDrag],
  );
}
