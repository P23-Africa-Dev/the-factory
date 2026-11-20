/** Normalize API statuses and board column ids into board column ids. */
export function toBoardStatus(
  status?: string,
): "pending" | "in-progress" | "completed" | "cancelled" {
  if (status === "cancelled") return "cancelled";
  if (status === "completed") return "completed";
  // Board columns use "in-progress"; API statuses use "in_progress".
  if (
    status === "in_progress" ||
    status === "in-progress" ||
    status === "paused" ||
    status === "resumed"
  ) {
    return "in-progress";
  }

  return "pending";
}
