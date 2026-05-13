import { config } from "./config.js";
import { resolveAccessRole } from "./filtering.js";

const normalizeBaseUrl = (value) => value.replace(/\/$/, "");

export const authenticateSocket = async ({ token, companyHint }) => {
  if (!token || typeof token !== "string") {
    throw new Error("Missing bearer token.");
  }

  if (config.allowInsecureSkipAuth) {
    const fallbackCompany = Number(companyHint || 0);

    return {
      userId: 0,
      name: "insecure-dev",
      email: null,
      companyId: fallbackCompany,
      companyPublicId: null,
      companyRole: "admin",
      accessRole: "management",
      authMode: "insecure-skip-auth",
    };
  }

  const endpoint = `${normalizeBaseUrl(config.authApiBaseUrl)}${config.authMePath}`;
  const response = await fetch(endpoint, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Auth API rejected token with status ${response.status}.`);
  }

  const body = await response.json();
  const user = body?.data;

  if (!body?.success || !user?.id) {
    throw new Error("Auth API response is missing user payload.");
  }

  const activeCompany = user?.active_company;

  if (!activeCompany?.id) {
    throw new Error("Authenticated user has no active company context.");
  }

  if (companyHint !== undefined && companyHint !== null && companyHint !== "") {
    const hint = String(companyHint).toLowerCase();
    const matchesId = hint === String(activeCompany.id).toLowerCase();
    const matchesPublicId = hint === String(activeCompany.company_id || "").toLowerCase();

    if (!matchesId && !matchesPublicId) {
      throw new Error("Token company context does not match requested company.");
    }
  }

  return {
    userId: Number(user.id),
    name: user.name || "",
    email: user.email || null,
    companyId: Number(activeCompany.id),
    companyPublicId: activeCompany.company_id || null,
    companyRole: activeCompany.role || null,
    accessRole: resolveAccessRole(activeCompany.role || null),
    authMode: "token-introspection",
  };
};
