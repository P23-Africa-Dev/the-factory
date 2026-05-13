export const MANAGEMENT_ROLES = new Set(["owner", "admin", "supervisor", "management"]);

export const resolveAccessRole = (companyRole) => {
  if (!companyRole) {
    return "agent";
  }

  return MANAGEMENT_ROLES.has(String(companyRole).toLowerCase()) ? "management" : "agent";
};

export const shouldDeliverEvent = (connection, envelope) => {
  if (!connection?.authenticated) {
    return false;
  }

  if (Number(connection.companyId) !== Number(envelope.company_id)) {
    return false;
  }

  if (connection.accessRole === "management") {
    return true;
  }

  if (connection.accessRole === "agent") {
    if (Number(connection.userId) === Number(envelope.user_id)) {
      return true;
    }

    if (connection.subscribedTaskIds?.has(Number(envelope.task_id))) {
      return true;
    }
  }

  return false;
};
