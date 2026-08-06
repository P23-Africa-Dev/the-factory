/**
 * Custom IMAP/SMTP is unavailable on the production Factory23 API (DOKS blocks outbound SMTP).
 * Prefer Google / Microsoft OAuth for CRM mailbox connect.
 *
 * Override with NEXT_PUBLIC_EMAIL_IMAP_SMTP_ENABLED=true|false when needed.
 */
export function isImapSmtpConnectionAvailable(): boolean {
  const flag = process.env.NEXT_PUBLIC_EMAIL_IMAP_SMTP_ENABLED?.trim().toLowerCase();
  if (flag === "true" || flag === "1") {
    return true;
  }
  if (flag === "false" || flag === "0") {
    return false;
  }

  const apiBase = (
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.thefactory23.com/api/v1"
  ).toLowerCase();

  if (apiBase.includes("api.thefactory23.com")) {
    return false;
  }

  return process.env.NODE_ENV !== "production";
}

export const IMAP_SMTP_UNSUPPORTED_MESSAGE =
  "Custom IMAP/SMTP is not available right now. Connect Google or Microsoft instead to send and sync CRM email from your mailbox.";
