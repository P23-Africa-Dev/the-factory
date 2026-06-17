import { clearAuthSession } from "@/lib/auth/session";
import { useAuthStore } from "@/store/auth";

export const ACCOUNT_STATUS_CODES = [
  "deactivated",
  "suspended_temporary",
  "suspended_permanent",
] as const;

export type AccountStatusCode = (typeof ACCOUNT_STATUS_CODES)[number];

export function isAccountStatusCode(
  value: string | undefined | null
): value is AccountStatusCode {
  return ACCOUNT_STATUS_CODES.includes(value as AccountStatusCode);
}

type AccountStatusPayload = {
  code?: string;
  data?: { account_status?: string } | null;
};

export function extractAccountStatusCode(
  payload: AccountStatusPayload
): string | undefined {
  return payload.code ?? payload.data?.account_status;
}

let redirectPending = false;

function inferLoginPath(): string {
  if (typeof window === "undefined") {
    return "/login";
  }

  return window.location.pathname.startsWith("/agent") ? "/agent/login" : "/login";
}

export function handleAccountAccessDenied(
  message: string,
  options?: { loginPath?: string; accountStatus?: string }
) {
  if (typeof window === "undefined" || redirectPending) {
    return;
  }

  redirectPending = true;
  clearAuthSession();
  useAuthStore.getState().clearUser();

  const params = new URLSearchParams();
  if (options?.accountStatus) {
    params.set("account_status", options.accountStatus);
  }
  if (message) {
    params.set("message", message);
  }

  const loginPath = options?.loginPath ?? inferLoginPath();
  const query = params.toString();
  window.location.href = query ? `${loginPath}?${query}` : loginPath;
}

export function getAccountStatusMessage(searchParams: URLSearchParams): string | null {
  return searchParams.get("message");
}
