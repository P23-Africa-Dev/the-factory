export const AUTH_TOKEN_COOKIE = "factory_auth_token";
export const ONBOARDING_DONE_COOKIE = "factory_onboarding_done";
export const COMPANY_ID_KEY = "factory_company_id";
export const ACTIVE_COMPANY_ID_KEY = "active_company_id";

const THIRTY_DAYS_IN_SECONDS = 60 * 60 * 24 * 30;

export function setAuthSession(token: string, onboardingCompleted: boolean) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${AUTH_TOKEN_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${THIRTY_DAYS_IN_SECONDS}; SameSite=Lax`;
  document.cookie = `${ONBOARDING_DONE_COOKIE}=${onboardingCompleted ? "1" : "0"}; Path=/; Max-Age=${THIRTY_DAYS_IN_SECONDS}; SameSite=Lax`;
}

export function setOnboardingCompletedCookie() {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${ONBOARDING_DONE_COOKIE}=1; Path=/; Max-Age=${THIRTY_DAYS_IN_SECONDS}; SameSite=Lax`;
}

export function clearAuthSession() {
  if (typeof document === "undefined") return;
  document.cookie = `${AUTH_TOKEN_COOKIE}=; Path=/; Max-Age=0`;
  document.cookie = `${ONBOARDING_DONE_COOKIE}=; Path=/; Max-Age=0`;
}

export function setActiveCompanyId(id: number | string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(ACTIVE_COMPANY_ID_KEY, String(id));
}

export function getActiveCompanyId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(ACTIVE_COMPANY_ID_KEY);
}

export function setCompanyId(id: number | string) {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(COMPANY_ID_KEY, String(id));
}

export function getCompanyId(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(COMPANY_ID_KEY);
}

export function getAuthTokenFromDocument() {
  if (typeof document === "undefined") {
    return "";
  }

  const tokenCookie = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${AUTH_TOKEN_COOKIE}=`));

  if (!tokenCookie) {
    return "";
  }

  return decodeURIComponent(tokenCookie.split("=")[1] ?? "");
}
