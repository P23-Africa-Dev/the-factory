/**
 * Pure column moves shared by the kanban boards.
 *
 * Each move first takes the card out of every column and then inserts it once, so a
 * card can never be drawn twice. Duplicate drag ids / React keys left cards that
 * could no longer be picked up and could break the board's rendering.
 */
type Board<T extends { id: string }> = Array<{ id: string; items: T[] }>;

function findItem<T extends { id: string }>(board: Board<T>, itemId: string) {
  for (const column of board) {
    const item = column.items.find((entry) => entry.id === itemId);
    if (item) return { column, item };
  }
  return null;
}

/**
 * Move a card into `toColumnId`, before `beforeItemId` when it is in that column,
 * otherwise at the end. Returns the same board object when nothing changes.
 */
export function moveCardToColumn<C extends { id: string; items: T[] }, T extends { id: string }>(
  board: C[],
  itemId: string,
  toColumnId: string,
  beforeItemId?: string,
): C[] {
  const found = findItem(board, itemId);
  if (!found || found.column.id === toColumnId) return board;
  if (!board.some((column) => column.id === toColumnId)) return board;

  return board.map((column) => {
    const items = column.items.filter((entry) => entry.id !== itemId);
    if (column.id === toColumnId) {
      const index = beforeItemId ? items.findIndex((entry) => entry.id === beforeItemId) : -1;
      items.splice(index >= 0 ? index : items.length, 0, found.item);
      return { ...column, items };
    }
    return items.length === column.items.length ? column : { ...column, items };
  });
}
