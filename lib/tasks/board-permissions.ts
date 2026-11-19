/**
 * Roles that may move task and KPI cards between any board column.
 * Mirrors the backend `tracking.fleet_viewer_roles` (owner, admin, supervisor).
 */
export const TASK_MANAGER_ROLES = ["owner", "admin", "supervisor"] as const;

export function isTaskManagerRole(role: string | null | undefined): boolean {
  return role != null && (TASK_MANAGER_ROLES as readonly string[]).includes(role);
}
