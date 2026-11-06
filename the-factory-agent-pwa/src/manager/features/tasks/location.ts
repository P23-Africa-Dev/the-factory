export type TaskLocationFields = {
  hasMapLocation?: boolean;
  latitude: number;
  longitude: number;
  address?: string | null;
  location?: string | null;
};

export function taskHasMapLocation(task?: TaskLocationFields | null): boolean {
  if (!task) return false;
  if (task.hasMapLocation === true) return true;
  if (task.hasMapLocation === false) return false;

  return (
    Number.isFinite(task.latitude) &&
    Number.isFinite(task.longitude) &&
    Math.abs(task.latitude) > 0.0001 &&
    Math.abs(task.longitude) > 0.0001
  );
}

export function formatTaskLocationLabel(
  task?: Pick<TaskLocationFields, "address" | "location"> | null,
  fallback = "No location set",
): string {
  const label = (task?.address ?? task?.location ?? "").trim();
  if (!label || label === "—") return fallback;
  return label;
}
