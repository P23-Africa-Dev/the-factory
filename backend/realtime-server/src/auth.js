import { config } from "./config.js";

const normalizeBaseUrl = (value) => value.replace(/\/$/, "");

export class SocketAuthError extends Error {
  constructor(message, { status = null, permanent = false } = {}) {
    super(message);
    this.name = "SocketAuthError";
    this.status = status;
    // permanent = retrying with the same token/company will not help.
    this.permanent = permanent;
  }
}

const toIdSet = (values) =>
  new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => Number.parseInt(String(value), 10))
      .filter((value) => Number.isFinite(value) && value > 0),
  );

/**
 * Ask the Laravel API what this token may see. Returns:
 *  { userId, name, email, companyId, companyPublicId, companyRole,
 *    accessRole: "management"|"agent", scope: "company"|"supervisor"|"self",
 *    visibleUserIds: Set<number>|null (null = whole company),
 *    allowedTaskIds: Set<number>, authMode }
 */
export const authenticateSocket = async ({ token, companyHint, taskIds = [] }) => {
  if (!token || typeof token !== "string") {
    throw new SocketAuthError("Missing bearer token.", { permanent: true });
  }

  if (config.allowInsecureSkipAuth) {
    return {
      userId: 0,
      name: "insecure-dev",
      email: null,
      companyId: Number(companyHint || 0),
      companyPublicId: null,
      companyRole: "admin",
      accessRole: "management",
      scope: "company",
      visibleUserIds: null,
      allowedTaskIds: toIdSet(taskIds),
      authMode: "insecure-skip-auth",
    };
  }

  const url = new URL(`${normalizeBaseUrl(config.authApiBaseUrl)}${config.authorizePath}`);
  if (companyHint !== undefined && companyHint !== null && String(companyHint) !== "") {
    url.searchParams.set("company_id", String(companyHint));
  }
  const ids = [...toIdSet(taskIds)].slice(0, 200);
  if (ids.length) {
    url.searchParams.set("task_ids", ids.join(","));
  }

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(config.authRequestTimeoutMs),
    });
  } catch (error) {
    throw new SocketAuthError(`Auth API unreachable: ${error instanceof Error ? error.message : "unknown"}`);
  }

  if (!response.ok) {
    let detail = "";
    try {
      const body = await response.json();
      detail = body?.errors?.company_id?.[0] || body?.message || "";
    } catch {
      // ignore non-JSON bodies
    }

    // 401/403/422 will not succeed on retry with the same token + company.
    const permanent = [401, 403, 422].includes(response.status);
    throw new SocketAuthError(
      `Auth API rejected socket with status ${response.status}${detail ? `: ${detail}` : "."}`,
      { status: response.status, permanent },
    );
  }

  const body = await response.json();
  const data = body?.data;

  if (!data?.user?.id || !data?.company?.id) {
    throw new SocketAuthError("Auth API response is missing user or company payload.");
  }

  const scope = ["company", "supervisor", "self"].includes(data.scope) ? data.scope : "self";

  return {
    userId: Number(data.user.id),
    name: data.user.name || "",
    email: data.user.email || null,
    companyId: Number(data.company.id),
    companyPublicId: data.company.company_id || null,
    companyRole: data.company_role || null,
    accessRole: data.access_role === "management" ? "management" : "agent",
    scope,
    // Fail closed: a non-company scope without a list sees nobody else.
    visibleUserIds: scope === "company" ? null : toIdSet(data.visible_user_ids),
    allowedTaskIds: toIdSet(data.allowed_task_ids),
    authMode: "token-introspection",
  };
};
