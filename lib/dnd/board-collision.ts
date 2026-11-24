import {
  closestCorners,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
} from "@dnd-kit/core";

/**
 * Collision detection for kanban boards (task, KPI and CRM boards).
 *
 * `closestCorners` alone compares the dragged card's corners with every drop
 * area's corners. Board columns stretch to the tallest column (often 1000px+),
 * so an empty column's far corners are always "further away" than the dragged
 * card's own original slot — every drop resolved to the card itself, nothing
 * was saved and the card snapped back.
 *
 * Instead: whatever is under the pointer wins (a card or a column), then any
 * area the card overlaps, then nearest corners as a last resort. The dragged
 * card itself is never a drop target.
 */
export const boardCollisionDetection: CollisionDetection = (args) => {
  const notSelf = <T extends { id: unknown }>(list: T[]) =>
    list.filter((collision) => collision.id !== args.active.id);

  const underPointer = notSelf(pointerWithin(args));
  if (underPointer.length > 0) return underPointer;

  const overlapping = notSelf(rectIntersection(args));
  if (overlapping.length > 0) return overlapping;

  return notSelf(closestCorners(args));
};
