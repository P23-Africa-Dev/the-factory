/**
 * Map-credit gate for the Agent PWA's Google Places proxy routes.
 *
 * Fail-closed for Google when there is no auth token (client uses Mapbox).
 * Backend transport errors fail open unless PLACES_CREDIT_FAIL_CLOSED=true.
 */

const AUTH_TOKEN_COOKIE = "factory_auth_token";

export type CreditGateResult = {
  allowed: boolean;
  blocked: boolean;
  low: boolean;
  metered: boolean;
  balance: number | null;
  skipped: boolean;
};

const SKIPPED_OPEN: CreditGateResult = {
  allowed: true,
  blocked: false,
  low: false,
  metered: false,
  balance: null,
  skipped: true,
};

const BLOCKED_UNMETERED: CreditGateResult = {
  allowed: false,
  blocked: true,
  low: false,
  metered: false,
  balance: null,
  skipped: true,
};

function strictFailClosed(): boolean {
  const raw = process.env.PLACES_CREDIT_FAIL_CLOSED?.trim() ?? "";
  return raw === "true" || raw === "1";
}

function apiBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim() ||
    "https://api.thefactory23.com/api/v1";
  return raw.replace(/\/+$/, "");
}

function tokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader && /^Bearer\s+/i.test(authHeader)) {
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (token) return token;
  }

  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === AUTH_TOKEN_COOKIE) {
      const value = part.slice(eq + 1).trim();
      return value ? decodeURIComponent(value) : null;
    }
  }

  return null;
}

export async function consumeMapCredit(
  request: Request,
  sku: string,
): Promise<CreditGateResult> {
  const token = tokenFromRequest(request);
  if (!token) return BLOCKED_UNMETERED;

  const companyId = request.headers.get("x-company-id");

  try {
    const response = await fetch(`${apiBaseUrl()}/map-credits/consume`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(companyId ? { "X-Company-Id": companyId } : {}),
      },
      body: JSON.stringify({ sku, source: "pwa" }),
    });

    if (response.status === 402) {
      const data = await response.json().catch(() => null);
      const detail = (data?.data ?? {}) as Record<string, unknown>;
      return {
        allowed: false,
        blocked: true,
        low: true,
        metered: true,
        balance: typeof detail.balance === "number" ? detail.balance : 0,
        skipped: false,
      };
    }

    if (!response.ok) {
      return strictFailClosed() ? BLOCKED_UNMETERED : SKIPPED_OPEN;
    }

    const data = await response.json().catch(() => null);
    const detail = (data?.data ?? {}) as Record<string, unknown>;

    return {
      allowed: detail.allowed !== false,
      blocked: Boolean(detail.blocked),
      low: Boolean(detail.low),
      metered: Boolean(detail.metered),
      balance: typeof detail.balance === "number" ? detail.balance : null,
      skipped: false,
    };
  } catch {
    return strictFailClosed() ? BLOCKED_UNMETERED : SKIPPED_OPEN;
  }
}

export function creditMeta(result: CreditGateResult): {
  balance: number | null;
  low: boolean;
  blocked: boolean;
  metered: boolean;
} {
  return {
    balance: result.balance,
    low: result.low,
    blocked: result.blocked,
    metered: result.metered,
  };
}
