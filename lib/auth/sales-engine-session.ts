const SALES_ENGINE_TOKEN_KEY = "sales_engine_token";
const SALES_ENGINE_ORG_KEY = "sales_engine_organization_id";

export function getSalesEngineToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(SALES_ENGINE_TOKEN_KEY);
}

export function getSalesEngineOrganizationId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(SALES_ENGINE_ORG_KEY);
}

export function setSalesEngineSession(token: string, organizationId?: string | number | null) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(SALES_ENGINE_TOKEN_KEY, token);
  if (organizationId != null) {
    localStorage.setItem(SALES_ENGINE_ORG_KEY, String(organizationId));
  }
}

export function clearSalesEngineSession() {
  if (typeof localStorage === "undefined") return;
  localStorage.removeItem(SALES_ENGINE_TOKEN_KEY);
  localStorage.removeItem(SALES_ENGINE_ORG_KEY);
}
