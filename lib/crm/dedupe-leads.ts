/**
 * Keep one copy of each lead on the board.
 *
 * The board is stitched from one paged query per stage. Right after a lead moves,
 * the old stage's cached page can still hold it (with its old status) while the new
 * stage's page already has it, so it was drawn in two columns at once. Two cards with
 * one drag id confuse the drag library: when the stale copy disappeared it took the
 * live card's drag registration with it, and that card could not be picked up again
 * until the page was reloaded.
 *
 * The most recently updated copy wins; on a tie the later one (fresher page) wins.
 */
export function dedupeLeadsById<T extends { id: number | string; updated_at?: string | null }>(
  leads: T[],
): T[] {
  const byId = new Map<string, T>();
  for (const lead of leads) {
    const key = String(lead.id);
    const existing = byId.get(key);
    if (!existing || updatedAt(lead) >= updatedAt(existing)) {
      // Delete first so the kept copy takes the position of its latest occurrence.
      byId.delete(key);
      byId.set(key, lead);
    }
  }
  return [...byId.values()];
}

function updatedAt(lead: { updated_at?: string | null }): number {
  const time = lead.updated_at ? Date.parse(lead.updated_at) : NaN;
  return Number.isNaN(time) ? 0 : time;
}
