export const MANAGEMENT_ROLES = new Set(["owner", "admin", "supervisor", "management", "manager"]);

export const resolveAccessRole = (companyRole) => {
  if (!companyRole) {
    return "agent";
  }

  return MANAGEMENT_ROLES.has(String(companyRole).toLowerCase()) ? "management" : "agent";
};

const toId = (value) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

/** User IDs an event is "about": the actor plus any reassignment parties. */
const eventUserIds = (envelope) =>
  [envelope?.user_id, envelope?.data?.from_user_id, envelope?.data?.to_user_id]
    .map(toId)
    .filter((id) => id !== null);

/**
 * Visibility rules (mirror AgentLocationSnapshotService on the API):
 *  - scope "company"    (owner/admin): every event in the company
 *  - scope "supervisor": events about agents they supervise, or tasks they were authorized for
 *  - scope "self"       (agent): their own events, or tasks they were authorized for
 * A connection with no scope is treated as "self" (fail closed).
 */
export const shouldDeliverEvent = (connection, envelope) => {
  if (!connection?.authenticated) {
    return false;
  }

  if (Number(connection.companyId) !== Number(envelope?.company_id)) {
    return false;
  }

  const scope = connection.scope || "self";

  if (scope === "company") {
    return true;
  }

  const taskId = toId(envelope?.task_id);
  if (taskId !== null && connection.subscribedTaskIds?.has(taskId)) {
    return true;
  }

  const userIds = eventUserIds(envelope);

  if (scope === "supervisor") {
    return userIds.some((id) => connection.visibleUserIds?.has(id));
  }

  return userIds.includes(Number(connection.userId));
};
