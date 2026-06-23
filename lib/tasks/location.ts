export type TaskLocationFields = {
  has_trackable_location?: boolean | null;
  latitude?: number | null;
  longitude?: number | null;
};

export function hasTrackableTaskLocation(task?: TaskLocationFields | null): boolean {
  if (!task) return false;
  if (task.has_trackable_location === true) return true;
  if (task.has_trackable_location === false) return false;

  return (
    Number.isFinite(task.latitude) &&
    Number.isFinite(task.longitude) &&
    Math.abs(task.latitude as number) > 0.0001 &&
    Math.abs(task.longitude as number) > 0.0001
  );
}

export function formatTaskLocationLabel(
  location?: string | null,
  address?: string | null,
  fallback = "No location set",
): string {
  const label = (address || location || "").trim();
  return label || fallback;
}
