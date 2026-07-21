export const SUPPORT_TOKEN_COOKIE =
  process.env.NODE_ENV === "production"
    ? "__Host-factory_support_session"
    : "factory_support_session";
export const SUPPORT_ACTIVE_COOKIE = "factory_support_active";
export const SUPPORT_LEVEL_COOKIE = "factory_support_level";

export type SupportAccessLevel = "read_only" | "operational_full";

export type SupportSessionDetails = {
  id: number;
  access_level: SupportAccessLevel;
  reason: string;
  ticket_reference: string | null;
  expires_at: string;
  admin: {
    name: string;
    email: string;
  };
  target_user: {
    id: number;
    name: string;
    email: string;
  };
  company: {
    id: number;
    name: string;
    role: string;
  };
  dashboard_path: string;
};

function documentCookieValue(name: string): string {
  if (typeof document === "undefined") return "";

  const entry = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(`${name}=`));

  return entry ? decodeURIComponent(entry.split("=")[1] ?? "") : "";
}

export function isSupportSessionActiveInDocument(): boolean {
  return documentCookieValue(SUPPORT_ACTIVE_COOKIE) === "1";
}

export function getSupportLevelFromDocument(): SupportAccessLevel | null {
  const value = documentCookieValue(SUPPORT_LEVEL_COOKIE);
  return value === "read_only" || value === "operational_full" ? value : null;
}
